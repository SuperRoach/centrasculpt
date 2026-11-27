import type { Material } from "three";
import { BufferAttribute, Color, Group, MeshStandardMaterial, Vector3 } from "three";
import { agentPerformanceEnabled, recordAgentPerformance } from "./agent-performance";
import type { ExportSource } from "./export-mesh";
import { yieldExportTask } from "./export-mesh";
import type { LayerOperation, SculptProject, SdfLayer } from "./layers";
import { booleanRoots, validateBooleanGraph } from "./live-boolean";
import { IncrementalMesher } from "./mesh";
import { arrayInstanceAngles, arrayInstanceScales } from "./object-array";
import {
  type PrimitiveSource,
  primitiveDimensions,
  primitiveDistance,
  primitiveFeatureSize,
  primitiveWorldBounds,
  validatePrimitive,
} from "./parametric-primitive";
import { sculptPaint } from "./sculpt-paint";
import type { Bounds, Point3 } from "./sdf";
import { SDFVolume } from "./sdf";
import { SparseSDFVolume } from "./sparse-sdf";
import { buildExportMesh, ChunkSurface } from "./surface";
import { copyTransform, transformMatrix, uniformScale, type VolumeTransform } from "./transform";

// The 512 MiB export budget remains the hard admission limit. Two million
// intermediate triangles use about 144 MiB for positions and normals.
const MAX_INTERMEDIATE_TRIANGLES = 2_000_000;

export function combineSdf(a: number, b: number, operation: LayerOperation): number {
  if (operation === "union") return Math.min(a, b);
  if (operation === "difference") return Math.max(a, -b);
  return Math.max(a, b);
}
/** Prepared inverse matrix and borrowed READ-ONLY grid. No source grid is resampled or written. */
export function prepareLayerSampler(layer: SdfLayer): (x: number, y: number, z: number) => number {
  const source = prepareSingleLayerSampler(layer),
    array = layer.array;
  if (!array?.enabled || array.count <= 1) return source;
  const axis = array.axis,
    scales = arrayInstanceScales(array),
    [cx, cy, cz] = layer.transform.position;
  if (array.kind === "linear") {
    const count = array.count,
      ax = axis[0],
      ay = axis[1],
      az = axis[2],
      offsets = Array.from(
        { length: count },
        (_, i) => (array.centered ? i - (count - 1) / 2 : i) * array.spacingModelUnits,
      );
    return (x, y, z) => {
      let result = Infinity;
      for (let i = 0; i < count; i++) {
        const offset = offsets[i];
        const s = scales[i];
        result = Math.min(
          result,
          source(
            cx + (x - ax * offset - cx) / s,
            cy + (y - ay * offset - cy) / s,
            cz + (z - az * offset - cz) / s,
          ) * s,
        );
      }
      return result;
    };
  }
  const angles = arrayInstanceAngles(array),
    cosines = angles.map(Math.cos),
    sines = angles.map(Math.sin),
    [px, py, pz] = array.pivot,
    rotate = array.orientation === "rotate";
  return (x, y, z) => {
    let result = Infinity;
    for (let i = 0; i < angles.length; i++) {
      const c = cosines[i],
        sine = sines[i];
      if (rotate) {
        const vx = x - px,
          vy = y - py,
          vz = z - pz,
          s = -sine,
          dot = vx * axis[0] + vy * axis[1] + vz * axis[2],
          t = 1 - c,
          qx = px + vx * c + (axis[1] * vz - axis[2] * vy) * s + axis[0] * dot * t,
          qy = py + vy * c + (axis[2] * vx - axis[0] * vz) * s + axis[1] * dot * t,
          qz = pz + vz * c + (axis[0] * vy - axis[1] * vx) * s + axis[2] * dot * t;
        const factor = scales[i];
        result = Math.min(
          result,
          source(cx + (qx - cx) / factor, cy + (qy - cy) / factor, cz + (qz - cz) / factor) *
            factor,
        );
      } else {
        const vx = cx - px,
          vy = cy - py,
          vz = cz - pz,
          s = sine,
          dot = vx * axis[0] + vy * axis[1] + vz * axis[2],
          t = 1 - c,
          dx = vx * c + (axis[1] * vz - axis[2] * vy) * s + axis[0] * dot * t - vx,
          dy = vy * c + (axis[2] * vx - axis[0] * vz) * s + axis[1] * dot * t - vy,
          dz = vz * c + (axis[0] * vy - axis[1] * vx) * s + axis[2] * dot * t - vz;
        const factor = scales[i];
        result = Math.min(
          result,
          source(
            cx + (x - dx - cx) / factor,
            cy + (y - dy - cy) / factor,
            cz + (z - dz - cz) / factor,
          ) * factor,
        );
      }
    }
    return result;
  };
}
function prepareSingleLayerSampler(layer: SdfLayer): (x: number, y: number, z: number) => number {
  const m = transformMatrix(layer.transform).invert().elements,
    scale = uniformScale(layer.transform);
  if (layer.primitive) {
    const source = validatePrimitive(layer.primitive);
    return (wx, wy, wz) =>
      primitiveDistance(
        source,
        m[0] * wx + m[4] * wy + m[8] * wz + m[12],
        m[1] * wx + m[5] * wy + m[9] * wz + m[13],
        m[2] * wx + m[6] * wy + m[10] * wz + m[14],
      ) * scale;
  }
  const v = layer.volume,
    [nx, ny, nz] = v.dimensions,
    bounds = v.bounds,
    h = v.step,
    data = v.getDenseView();
  const at = data
    ? (x: number, y: number, z: number) => data[x + nx * (y + ny * z)]
    : v instanceof SparseSDFVolume
      ? v.prepareSampleReader()
      : (x: number, y: number, z: number) => v.readVoxel(v.index(x, y, z));
  return (wx, wy, wz) => {
    const x = m[0] * wx + m[4] * wy + m[8] * wz + m[12],
      y = m[1] * wx + m[5] * wy + m[9] * wz + m[13],
      z = m[2] * wx + m[6] * wy + m[10] * wz + m[14];
    const gx = Math.max(0, Math.min(nx - 1, (x - bounds.min[0]) / h)),
      gy = Math.max(0, Math.min(ny - 1, (y - bounds.min[1]) / h)),
      gz = Math.max(0, Math.min(nz - 1, (z - bounds.min[2]) / h));
    const ix = Math.min(nx - 2, Math.floor(gx)),
      iy = Math.min(ny - 2, Math.floor(gy)),
      iz = Math.min(nz - 2, Math.floor(gz)),
      tx = gx - ix,
      ty = gy - iy,
      tz = gz - iz;
    const a = at(ix, iy, iz) * (1 - tx) + at(ix + 1, iy, iz) * tx,
      b = at(ix, iy + 1, iz) * (1 - tx) + at(ix + 1, iy + 1, iz) * tx;
    const c = at(ix, iy, iz + 1) * (1 - tx) + at(ix + 1, iy, iz + 1) * tx,
      d = at(ix, iy + 1, iz + 1) * (1 - tx) + at(ix + 1, iy + 1, iz + 1) * tx;
    const value = (a * (1 - ty) + b * ty) * (1 - tz) + (c * (1 - ty) + d * ty) * tz;
    const outside = Math.hypot(
      Math.max(0, bounds.min[0] - x, x - bounds.max[0]),
      Math.max(0, bounds.min[1] - y, y - bounds.max[1]),
      Math.max(0, bounds.min[2] - z, z - bounds.max[2]),
    );
    // Explicit positive exterior extension, continuous with the positive boundary.
    // Clamping alone would incorrectly leave constant-distance slabs outside the volume.
    return (outside > 0 ? Math.max(h * 1e-6, value) + outside : value) * scale;
  };
}
type FieldSampler = (x: number, y: number, z: number) => number;
type FieldFold = (left: number, x: number, y: number, z: number) => number;

function leafSlabPrimitive(layer: SdfLayer): PrimitiveSource | undefined {
  const source = layer.primitive;
  if (layer.array?.enabled || layer.booleanModifiers?.some((m) => m.enabled)) return;
  if (
    source?.kind === "box" ||
    (source?.kind === "cylinder" &&
      (source.topDiameter ?? source.diameter) === (source.bottomDiameter ?? source.diameter))
  )
    return source;
}

/** A leaf cutter can be skipped when its local slab distance already loses to
 * the accumulated field. Use the same inverse and scale as the real sampler.
 * The strict comparison protects signed zero, ties and interpolation values. */
function prepareLeafDifference(layer: SdfLayer): FieldFold | undefined {
  const leaf = leafSlabPrimitive(layer);
  if (!leaf) return;
  const source = validatePrimitive(leaf);
  const [width, height, depth] = primitiveDimensions(source);
  const hx = width / 2,
    hy = height / 2,
    hz = depth / 2;
  const m = transformMatrix(layer.transform).invert().elements,
    scale = uniformScale(layer.transform);
  return (left, wx, wy, wz) => {
    const x = m[0] * wx + m[4] * wy + m[8] * wz + m[12],
      y = m[1] * wx + m[5] * wy + m[9] * wz + m[13],
      z = m[2] * wx + m[6] * wy + m[10] * wz + m[14];
    // Outside the enclosing slabs the formula's positive hypot branch is at
    // least the largest slab distance. Leave room for rounding, including the
    // rounded box's add/subtract of its corner radius.
    const slab = Math.max(Math.abs(x) - hx, Math.abs(y) - hy, Math.abs(z) - hz);
    const margin = 16 * Number.EPSILON * (Math.abs(x) + Math.abs(y) + Math.abs(z) + hx + hy + hz);
    if (slab > margin && (slab - margin) * scale > -left) return left;
    return Math.max(left, -primitiveDistance(source, x, y, z) * scale);
  };
}

export function prepareComposite(layers: readonly SdfLayer[]): FieldSampler {
  const ordering = layers[0]?.hierarchy?.compositionOrder;
  const ordered = ordering
    ? [...layers].sort((a, b) => ordering.indexOf(a.id) - ordering.indexOf(b.id))
    : layers;
  validateBooleanGraph(layers);
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  const samplers = new Map<string, FieldSampler>();
  const fold = (layer: SdfLayer, operation: LayerOperation): FieldFold => {
    const culled = operation === "difference" ? prepareLeafDifference(layer) : undefined;
    if (culled) return culled;
    const sample = prepare(layer);
    return (left, x, y, z) => combineSdf(left, sample(x, y, z), operation);
  };
  function prepare(layer: SdfLayer): FieldSampler {
    const cached = samplers.get(layer.id);
    if (cached) return cached;
    const own = prepareLayerSampler(layer);
    const modifiers: FieldFold[] = [];
    let previous: { sourceId: string; operation: LayerOperation } | undefined;
    for (const modifier of layer.booleanModifiers ?? []) {
      if (!modifier.enabled) continue;
      // Consecutive identical min/max folds are idempotent.
      if (previous?.sourceId === modifier.sourceId && previous.operation === modifier.operation)
        continue;
      const source = byId.get(modifier.sourceId);
      if (!source) throw new Error("Boolean source does not exist.");
      modifiers.push(fold(source, modifier.operation));
      previous = modifier;
    }
    const sample = modifiers.length
      ? (x: number, y: number, z: number) => {
          let distance = own(x, y, z);
          for (const apply of modifiers) distance = apply(distance, x, y, z);
          return distance;
        }
      : own;
    samplers.set(layer.id, sample);
    return sample;
  }
  const roots = booleanRoots(ordered);
  if (!roots.length) return () => 1;
  const first = prepare(roots[0]);
  const rest = roots.slice(1).map((layer) => fold(layer, layer.operation));
  if (!rest.length) return first;
  return (x, y, z) => {
    let result = first(x, y, z);
    for (const apply of rest) result = apply(result, x, y, z);
    return result;
  };
}
/** Winning CSG operand supplies colour, including the cutter on difference faces. */
export function prepareCompositeColour(
  layers: readonly SdfLayer[],
  base: (l: SdfLayer) => Color = () => new Color("#afbd94"),
): (p: Vector3, out: Color) => Color {
  validateBooleanGraph(layers);
  const byId = new Map(layers.map((l) => [l.id, l]));
  const roots = booleanRoots(layers);
  if (!roots.length) return (_p, out) => out.set("#afbd94");

  type ReadColour = (p: Vector3, out: Color) => Color;
  type ColourNode = {
    evaluate: (p: Vector3) => { distance: number; readColour: ReadColour };
    colour: Color;
    unpainted: boolean;
  };
  const prepared = new Map<string, ColourNode>();
  function prepare(layer: SdfLayer): ColourNode {
    const cached = prepared.get(layer.id);
    if (cached) return cached;
    const paint = sculptPaint(layer.volume),
      unpainted = paint.empty,
      colour = base(layer).clone(),
      inverse = transformMatrix(layer.transform).invert(),
      sample = prepareLayerSampler(layer);
    const readColour = (p: Vector3, out: Color) =>
      unpainted ? out.copy(colour) : paint.sample(local.copy(p).applyMatrix4(inverse), colour, out);
    const modifiers = (layer.booleanModifiers ?? [])
      .filter((m) => m.enabled)
      .map((m) => {
        const operand = byId.get(m.sourceId);
        if (!operand) throw new Error("Boolean source does not exist.");
        return { operation: m.operation, source: prepare(operand) };
      });
    // One mutable result per graph node. Copy the winner before evaluating another edge:
    // the same node can be visited again through a shared modifier.
    const result = { distance: 0, readColour };
    const evaluate = (p: Vector3) => {
      result.distance = sample(p.x, p.y, p.z);
      result.readColour = readColour;
      for (const { operation, source } of modifiers) {
        const next = source.evaluate(p);
        const d = operation === "difference" ? -next.distance : next.distance;
        if (operation === "union" ? d < result.distance : d > result.distance) {
          result.distance = d;
          result.readColour = next.readColour;
        }
      }
      return result;
    };
    const node = { evaluate, colour, unpainted };
    prepared.set(layer.id, node);
    return node;
  }
  const local = new Vector3();
  const sources = roots.map((layer) => ({ operation: layer.operation, node: prepare(layer) }));
  const first = sources[0].node;
  if ([...prepared.values()].every((node) => node.unpainted && node.colour.equals(first.colour)))
    return (_p, out) => out.copy(first.colour);
  return (p, out) => {
    const initial = first.evaluate(p);
    let distance = initial.distance,
      readColour = initial.readColour;
    for (let i = 1; i < sources.length; i++) {
      const { operation, node } = sources[i];
      const next = node.evaluate(p);
      const d = operation === "difference" ? -next.distance : next.distance;
      if (operation === "union" ? d < distance : d > distance) {
        distance = d;
        readColour = next.readColour;
      }
    }
    return readColour(p, out);
  };
}
export function evaluateComposite(layers: readonly SdfLayer[], point: Point3): number {
  return prepareComposite(layers)(point.x, point.y, point.z);
}
/** Spatial slabs share one lattice and one final mesher: no independently meshed seams. */
export function compositeSamplingStages(
  resolution: number,
  sourcesPerPoint: number,
  budget = 64_000_000,
) {
  if (
    !Number.isInteger(resolution) ||
    resolution < 8 ||
    resolution > 256 ||
    !Number.isSafeInteger(sourcesPerPoint) ||
    sourcesPerPoint < 1 ||
    !Number.isSafeInteger(budget) ||
    budget < resolution * resolution * sourcesPerPoint
  )
    throw new Error("Invalid Boolean sampling stage budget.");
  const depth = Math.max(1, Math.floor(budget / (resolution * resolution * sourcesPerPoint)));
  const stages: { minZ: number; maxZ: number }[] = [];
  for (let minZ = 0; minZ < resolution; minZ += depth)
    stages.push({ minZ, maxZ: Math.min(resolution - 1, minZ + depth - 1) });
  return stages;
}
/** Actual sampler calls per lattice point, including shared modifier references.
 * Hidden roots do no work; referenced hidden operands still do. Preview only. */
function previewSourceWork(layers: readonly SdfLayer[]): number {
  validateBooleanGraph(layers);
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  const count = (layer: SdfLayer): number => {
    let work = layer.array?.enabled ? layer.array.count : 1;
    for (const modifier of layer.booleanModifiers ?? []) {
      if (!modifier.enabled) continue;
      const source = byId.get(modifier.sourceId);
      if (!source) throw new Error("Boolean source does not exist.");
      work += count(source);
    }
    return work;
  };
  return booleanRoots(layers).reduce((sum, layer) => sum + count(layer), 0);
}

export type CompositeLayout = {
  resolution: number;
  extent: number;
  center: [number, number, number];
  desiredStep: number;
  capped: boolean;
  samplingStages?: { minZ: number; maxZ: number }[];
  previewWorkCapped?: boolean;
};
/** One independent derived world grid. Sampling tries to match the finest world voxel,
 * but is bounded to 192³ (or a lower explicit quality cap). No source is converted. */
export function compositeLayout(
  layers: readonly SdfLayer[],
  cap = 192,
  analyticPrimitives = false,
  stagedEvaluation = false,
  boundedPreview = false,
  interactivePrimitives = false,
): CompositeLayout {
  const exportLayout = analyticPrimitives && stagedEvaluation;
  const primitiveLayout = exportLayout || interactivePrimitives;
  if (!Number.isInteger(cap) || cap < 8 || cap > (exportLayout ? 256 : 192))
    throw new Error("Composite resolution cap must be 8–192, or up to 256 for staged export.");
  const live = layers.some((l) => l.booleanModifiers?.length || l.array?.enabled);
  const reachable = new Set<string>();
  const visit = (l: SdfLayer) => {
    if (reachable.has(l.id)) return;
    reachable.add(l.id);
    for (const m of l.booleanModifiers ?? [])
      if (m.enabled) {
        const source = layers.find((s) => s.id === m.sourceId);
        if (!source) throw new Error("Boolean source does not exist.");
        visit(source);
      }
  };
  if (live) booleanRoots(layers).forEach(visit);
  const visible = layers.filter((l) => {
      if (!(live ? reachable.has(l.id) : l.visible)) return false;
      if ((!live && !exportLayout) || l.primitive || l.procedural) return true;
      return l.volume instanceof SparseSDFVolume
        ? l.volume.hasInterior()
        : (l.volume.getDenseView()?.some((v) => v < 0) ?? true);
    }),
    min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  let desiredStep = Infinity;
  for (const layer of visible) {
    const scale = uniformScale(layer.transform),
      baseBounds =
        (live || primitiveLayout) && layer.primitive
          ? primitiveWorldBounds(layer.primitive, layer.transform)
          : layer.volume.worldBounds(layer.transform);
    let bounds = baseBounds;
    const instanceScales = layer.array?.enabled ? arrayInstanceScales(layer.array) : [1],
      largestInstance = Math.max(...instanceScales),
      smallestInstance = Math.min(...instanceScales),
      origin = layer.transform.position;
    if (largestInstance > 1)
      bounds = {
        min: bounds.min.map((v, i) => origin[i] + (v - origin[i]) * largestInstance) as [
          number,
          number,
          number,
        ],
        max: bounds.max.map((v, i) => origin[i] + (v - origin[i]) * largestInstance) as [
          number,
          number,
          number,
        ],
      };
    if (layer.array?.enabled && layer.array.count > 1 && layer.array.kind === "radial") {
      const [px, py, pz] = layer.array.pivot;
      let radius = 0;
      for (const x of [bounds.min[0], bounds.max[0]])
        for (const y of [bounds.min[1], bounds.max[1]])
          for (const z of [bounds.min[2], bounds.max[2]])
            radius = Math.max(radius, Math.hypot(x - px, y - py, z - pz));
      bounds = {
        min: [px - radius, py - radius, pz - radius],
        max: [px + radius, py + radius, pz + radius],
      };
    } else if (layer.array?.enabled && layer.array.count > 1 && layer.array.kind === "linear") {
      const array = layer.array,
        lo = array.centered ? -(array.count - 1) / 2 : 0,
        hi = array.centered ? (array.count - 1) / 2 : array.count - 1,
        a = lo * array.spacingModelUnits,
        b = hi * array.spacingModelUnits;
      bounds = {
        min: bounds.min.map((v, i) => v + Math.min(a * array.axis[i], b * array.axis[i])) as [
          number,
          number,
          number,
        ],
        max: bounds.max.map((v, i) => v + Math.max(a * array.axis[i], b * array.axis[i])) as [
          number,
          number,
          number,
        ],
      };
    }
    if (!analyticPrimitives || (!live && !primitiveLayout) || !layer.primitive)
      desiredStep = Math.min(desiredStep, layer.volume.step * scale * smallestInstance);
    if ((live || primitiveLayout) && layer.primitive) {
      desiredStep = Math.min(
        desiredStep,
        (primitiveFeatureSize(layer.primitive) * scale * smallestInstance) /
          (layer.primitive.kind === "box" && layer.primitive.cornerRadius !== undefined
            ? 6
            : analyticPrimitives
              ? 10
              : 8),
      );
    }
    // Six samples across rounded-prism features is a bounded target, not a fit guarantee.
    // Aligned rounded-prism differences: opposite planar surfaces can form walls much
    // thinner than either source. Radius is curvature, not a solid feature thickness.
    if (live && layer.primitive?.kind === "box" && layer.primitive.cornerRadius !== undefined) {
      for (const modifier of layer.booleanModifiers ?? []) {
        const cutter = layers.find((l) => l.id === modifier.sourceId);
        if (
          !modifier.enabled ||
          modifier.operation !== "difference" ||
          cutter?.primitive?.kind !== "box" ||
          cutter.array ||
          cutter.transform.rotation.some(
            (v, i) => Math.abs(v - layer.transform.rotation[i]) > 1e-10,
          ) ||
          cutter.transform.scale.some((v, i) => Math.abs(v - layer.transform.scale[i]) > 1e-10)
        )
          continue;
        const centre = new Vector3(...cutter.transform.position)
          .applyMatrix4(transformMatrix(layer.transform).invert())
          .toArray();
        const outer = primitiveDimensions(layer.primitive),
          inner = primitiveDimensions(cutter.primitive);
        for (let axis = 0; axis < 3; axis++)
          for (const sign of [-1, 1]) {
            const wall = outer[axis] / 2 - inner[axis] / 2 + sign * centre[axis];
            if (wall > 1e-8) desiredStep = Math.min(desiredStep, (wall * scale) / 6);
          }
      }
    }
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], bounds.min[i]);
      max[i] = Math.max(max[i], bounds.max[i]);
    }
  }
  if (!visible.length)
    return { resolution: 8, extent: 1, center: [0, 0, 0], desiredStep: 2 / 7, capped: false };
  const center = min.map((v, i) => (v + max[i]) / 2) as [number, number, number],
    span = Math.max(...max.map((v, i) => v - min[i]));
  // Padding remains positive for all Boolean operations, closing the extracted surface.
  const extent = span / 2 + 2 * Math.max(desiredStep, span / (cap - 5));
  // Deterministically stagger new rounded-prism grids away from exact planar zero
  // samples. Symmetric zero vertices can collapse after STL Float32 conversion.
  // Padding covers this sub-step offset; no source pose or physical dimension changes.
  if (layers.some((l) => l.primitive?.kind === "box" && l.primitive.cornerRadius !== undefined))
    [0.1732050807568877, 0.2236067977499789, 0.2645751311064591].forEach((fraction, axis) => {
      center[axis] += Math.min(desiredStep, span / (cap - 5)) * fraction;
    });
  const desired = Math.ceil((2 * extent) / desiredStep) + 1;
  let resolution = Math.max(8, Math.min(cap, desired));
  const sourcesPerPoint =
    boundedPreview && !stagedEvaluation
      ? previewSourceWork(layers)
      : layers.reduce((sum, layer) => sum + (layer.array?.enabled ? layer.array.count : 1), 0);
  let previewWorkCapped = false;
  if (boundedPreview && !stagedEvaluation && sourcesPerPoint * resolution ** 3 > 64_000_000) {
    resolution = Math.min(resolution, Math.floor(Math.cbrt(64_000_000 / sourcesPerPoint)));
    // Keep the admission exact at floating-point cube-root boundaries.
    while (sourcesPerPoint * resolution ** 3 > 64_000_000) resolution--;
    if (resolution < 8)
      throw new Error(
        "Boolean preview cannot fit the 64 million sample budget even at 8³. Reduce instances.",
      );
    previewWorkCapped = true;
  }
  const instanceWork = sourcesPerPoint * resolution ** 3;
  if (stagedEvaluation && instanceWork > 256_000_000)
    throw new Error(
      "Staged Boolean export exceeds the 256 million total source-sample work limit. Reduce source instances or bounds; resolution was not lowered.",
    );
  if (!stagedEvaluation && instanceWork > 64_000_000)
    throw new Error(
      "Boolean evaluation exceeds the 64 million sample budget. Reduce instances or source bounds for preview, or use staged unified export.",
    );
  return {
    resolution,
    extent,
    center,
    desiredStep,
    capped: desired > resolution,
    ...(previewWorkCapped ? { previewWorkCapped: true } : {}),
    ...(stagedEvaluation
      ? { samplingStages: compositeSamplingStages(resolution, Math.max(1, sourcesPerPoint)) }
      : {}),
  };
}
export type CompositeStats = {
  samplingMs: number;
  maxSamplingSliceMs: number;
  maxMeshingSliceMs: number;
  meshingMs: number;
  elapsedMs: number;
  samples: number;
  chunks: number;
  totalChunks: number;
  triangles: number;
  resolution: number;
  step: number;
  capped: boolean;
  previewWorkCapped?: boolean;
  full: boolean;
};
const yieldUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
// Estimated source samples. Give the draft a separate, smaller work budget.
const PROGRESSIVE_PREVIEW_WORK = 8_000_000;
const DRAFT_PREVIEW_WORK = 2_000_000;

export type BooleanPreviewProgress = {
  phase: "sampling" | "meshing";
  pass?: "draft" | "refinement";
  completed: number;
  total: number;
};

/** Disposable rendering cache, never part of native serialization or source history. */
export class BooleanComposite {
  readonly group = new Group();
  availableBytes: () => number = () => 256 * 1024 ** 2;
  paintBase: (l: SdfLayer) => Color = () => new Color("#afbd94");
  private readonly paintedExport = new MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.68,
    metalness: 0.03,
  });
  private paintAttributes(geometry: import("three").BufferGeometry): Float32Array | undefined {
    if (
      !this.project.layerStack.layers.some(
        (l) => l.booleanModifiers?.length || l.array?.enabled || !sculptPaint(l.volume).empty,
      )
    )
      return;
    const sample = prepareCompositeColour(
        this.project.layerStack.compositionLayers,
        this.paintBase,
      ),
      p = geometry.getAttribute("position"),
      out = new Float32Array(p.count * 3),
      point = new Vector3(),
      colour = new Color();
    for (let i = 0; i < p.count; i++) {
      point.fromBufferAttribute(p, i).add(this.group.position);
      sample(point, colour).toArray(out, i * 3);
    }
    return out;
  }
  /** Colour work follows the same cooperative deadline as field sampling. */
  private async cooperativeColours(
    geometry: import("three").BufferGeometry,
    version: number,
    sample: ReturnType<typeof prepareCompositeColour>,
  ): Promise<{ colours?: Float32Array; maxSliceMs: number } | null> {
    const p = geometry.getAttribute("position");
    if (!p.count) return { maxSliceMs: 0 };
    const colours = new Float32Array(p.count * 3),
      point = new Vector3(),
      colour = new Color();
    let batch = performance.now(),
      maxSliceMs = 0;
    for (let i = 0; i < p.count; i++) {
      point.fromBufferAttribute(p, i).add(this.group.position);
      sample(point, colour).toArray(colours, i * 3);
      if (i % 128 === 127 && performance.now() - batch >= 3) {
        maxSliceMs = Math.max(maxSliceMs, performance.now() - batch);
        await yieldUI();
        this.syncMetadata();
        if (!this.buildCurrent(version)) return null;
        batch = performance.now();
      }
    }
    return { colours, maxSliceMs: Math.max(maxSliceMs, performance.now() - batch) };
  }
  private primitivePreview: { id: string; source: PrimitiveSource; pose?: VolumeTransform } | null =
    null;
  setPrimitivePreview(id: string, source: PrimitiveSource | null, pose?: VolumeTransform): void {
    if (source === null && this.primitivePreview?.id !== id) return;
    const next = source
      ? { id, source: validatePrimitive(source), pose: pose && copyTransform(pose) }
      : null;
    if (JSON.stringify(next) === JSON.stringify(this.primitivePreview)) return;
    this.primitivePreview = next;
    this.invalidatePose();
  }
  private get previewLayers(): readonly SdfLayer[] {
    const layers = this.project.layerStack.compositionLayers;
    const preview = this.interactive ? this.primitivePreview : null;
    return preview
      ? layers.map((layer) =>
          layer.id === preview.id
            ? (Object.create(layer, {
                primitive: { value: preview.source },
                ...(preview.pose ? { transform: { value: preview.pose } } : {}),
              }) as SdfLayer)
            : layer,
        )
      : layers;
  }
  private interactiveCap = 64;
  setInteractiveQuality(cap: number): void {
    if (![18, 24, 32, 48, 64].includes(cap))
      throw new Error("Invalid interactive preview quality.");
    if (this.interactiveCap === cap) return;
    this.interactiveCap = cap;
    if (this.interactive) this.invalidate();
  }
  private interactive = false;
  private adaptive = false;
  private buildingDraft = false;
  private contentVersion = 0;
  private buildContentVersion = -1;
  private draftVersion: number | null = null;
  get draftReady(): boolean {
    return this.draftVersion === this.version && !this.failed && !!this.stats;
  }
  private buildProgress: BooleanPreviewProgress | null = null;
  get progress(): BooleanPreviewProgress | null {
    return this.buildProgress;
  }
  private retained: {
    surface: ChunkSurface;
    mesher: IncrementalMesher;
    bytes: number;
    center: Vector3;
  } | null = null;
  /** Desktop draft quality is transient; the user's selected quality is retained. */
  setInteractive(value: boolean): void {
    if (value === this.interactive) return;
    this.adaptive = true;
    this.interactive = value;
    if (!value) this.primitivePreview = null;
    this.invalidate();
  }
  get interactionActive(): boolean {
    return this.interactive;
  }
  private buildCurrent(version: number): boolean {
    return (
      !this.disposed &&
      !this.paused &&
      (version === this.version ||
        (this.buildingDraft &&
          this.interactive &&
          this.buildContentVersion === this.contentVersion))
    );
  }
  private clearRetained(): void {
    if (!this.retained) return;
    this.retained.surface.group.removeFromParent();
    this.retained.surface.clear();
    this.retained.mesher.dispose();
    this.retained = null;
  }
  private surface: ChunkSurface | null = null;
  private mesher: IncrementalMesher | null = null;
  private volume: SDFVolume | null = null;
  private layout: CompositeLayout | null = null;
  private metadata: ReturnType<BooleanComposite["sourceMetadata"]> = [];
  private fingerprint = "";
  private sourceVolumes: SdfLayer["volume"][] = [];
  private full = true;
  private regions: Bounds[] = [];
  private version = 0;
  private disposed = false;
  private suspended = false;
  private exportLeases = 0;
  private get paused(): boolean {
    return this.suspended || this.exportLeases > 0;
  }
  /** Evict rebuildable display data while an independent export owns the memory budget. */
  async releaseForExport(): Promise<() => void> {
    this.exportLeases++;
    this.invalidate();
    try {
      await this.running;
    } catch {
      /* A failed display cache cannot prevent a fresh export. */
    }
    this.clearRetained();
    this.mesher?.dispose();
    this.surface?.clear();
    this.group.clear();
    this.mesher = null;
    this.surface = null;
    this.volume = null;
    this.layout = null;
    this.stats = null;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.exportLeases--;
        this.invalidate();
      }
    };
  }
  setSuspended(value: boolean): void {
    if (this.suspended === value) return;
    this.suspended = value;
    this.invalidate();
  }
  private running: Promise<boolean> | null = null;
  private lastEdit = 0;
  private failedVersion = -1;
  stats: CompositeStats | null = null;
  constructor(
    readonly project: SculptProject,
    private readonly material: Material,
    private cap = 192,
    private readonly exportMaterial: Material = material,
    private readonly sourceCurrent: () => boolean = () => true,
    private readonly options: {
      analyticPrimitives?: boolean;
      colours?: boolean;
      stagedEvaluation?: boolean;
      boundedPreview?: boolean;
      samplingProgress?: (completed: number, total: number, stage: number, stages: number) => void;
      meshingProgress?: (completed: number, total: number) => void;
    } = {},
  ) {
    this.group.name = "Boolean Preview";
  }
  setQuality(cap: number): void {
    if (![64, 128, 192].includes(cap))
      throw new Error("Choose a composite cap of 64³, 128³ or 192³.");
    if (cap !== this.cap) {
      this.cap = cap;
      this.invalidate();
    }
  }
  private sourceMetadata(layers = this.project.layerStack.compositionLayers) {
    const colours =
      this.options.colours !== false &&
      layers.some(
        (l) => l.booleanModifiers?.length || l.array?.enabled || !sculptPaint(l.volume).empty,
      );
    return layers.map((l) => ({
      pose: l.transform,
      source: [
        l.id,
        l.visible,
        l.operation,
        l.order,
        l.primitive,
        l.booleanModifiers,
        l.array,
        l.volume.resolution,
        l.volume.extent,
        l.volume.dimensions,
        l.volume.bounds,
        sculptPaint(l.volume).revision,
        ...(colours ? this.paintBase(l).toArray() : []),
      ],
    }));
  }
  syncMetadata(): void {
    if (this.disposed) return;
    if (!this.sourceCurrent()) throw new Error("Evaluation cancelled: source changed.");
    const layers = this.project.layerStack.compositionLayers;
    const next = this.sourceMetadata(layers);
    const key = JSON.stringify(next);
    const sameVolumes =
      layers.length === this.sourceVolumes.length &&
      layers.every((layer, i) => layer.volume === this.sourceVolumes[i]);
    if (key === this.fingerprint && sameVolumes) return;
    this.fingerprint = key;
    this.sourceVolumes = layers.map((layer) => layer.volume);
    const previous = this.metadata;
    this.metadata = next.map(({ pose, source }) => ({
      pose: copyTransform(pose),
      // Detach primitive/modifier data, which callers can edit in place.
      source: JSON.parse(JSON.stringify(source)),
    }));
    if (
      sameVolumes &&
      previous.every((entry, i) => JSON.stringify(entry.source) === JSON.stringify(next[i].source))
    ) {
      const moved = next.flatMap(({ pose }, i) =>
        JSON.stringify(pose) === JSON.stringify(previous[i].pose) ? [] : [i],
      );
      if (
        moved.length === 1 &&
        !this.full &&
        !this.running &&
        !this.adaptive &&
        !this.interactive &&
        this.invalidateCutterPose(layers, layers[moved[0]], previous[moved[0]].pose)
      )
        return;
      this.invalidatePose();
    } else this.invalidate();
  }
  /** Only a leaf cutter used once as the first fold of a plain box is eligible.
   * The left field is bounded below by minus the box's smallest half-width.
   * Beyond that distance from both cutter poses, neither can win the fold. */
  private invalidateCutterPose(
    layers: readonly SdfLayer[],
    cutter: SdfLayer,
    previous: VolumeTransform,
  ): boolean {
    const primitive = leafSlabPrimitive(cutter);
    if (!this.layout || !primitive || !this.options.boundedPreview) return false;
    let target: SdfLayer | undefined;
    for (const layer of layers) {
      const active = layer.booleanModifiers?.filter((m) => m.enabled) ?? [];
      const uses = active.filter((m) => m.sourceId === cutter.id);
      if (!uses.length) continue;
      if (
        target ||
        uses.length !== 1 ||
        uses[0] !== active[0] ||
        uses[0].operation !== "difference"
      )
        return false;
      target = layer;
    }
    if (!target || target.primitive?.kind !== "box" || target.array?.enabled) return false;
    const depth =
      Math.min(...primitiveDimensions(target.primitive)) * uniformScale(target.transform);
    for (const pose of [previous, cutter.transform]) {
      const bounds = primitiveWorldBounds(primitive, pose);
      // Use a full width of padding, leaving slack beyond the half-width bound.
      // Keep another lattice step for interpolated vertices and paint ownership.
      const padding = depth + (2 * this.layout.extent) / (this.layout.resolution - 1);
      for (let i = 0; i < 3; i++) {
        bounds.min[i] -= padding;
        bounds.max[i] += padding;
      }
      this.invalidateWorldRegion(bounds);
    }
    return true;
  }
  /** Allocate cache invalidation before an atomic source publication. */
  prepareInvalidation(): () => void {
    const regions: Bounds[] = [];
    return () => {
      this.full = true;
      this.regions = regions;
      this.contentVersion++;
      this.version++;
      this.lastEdit = performance.now();
    };
  }
  invalidate(): void {
    this.contentVersion++;
    this.invalidatePose();
  }
  private invalidatePose(): void {
    this.full = true;
    this.regions = [];
    this.version++;
    this.lastEdit = performance.now();
  }
  invalidateLayer(layer: SdfLayer, bounds?: Bounds | null): void {
    if (bounds === null || (bounds && layer.primitive)) return;
    const layers = this.project.layerStack.compositionLayers;
    if (
      !layer.visible &&
      !layers.some((candidate) =>
        candidate.booleanModifiers?.some((m) => m.enabled && m.sourceId === layer.id),
      )
    )
      return;
    if (
      !bounds ||
      !this.layout ||
      layer.array?.enabled ||
      bounds.min.some((v, i) => v <= 0 || bounds.max[i] >= layer.volume.dimensions[i] - 1)
    ) {
      // A boundary edit can change the clamped exterior throughout the lattice.
      this.invalidate();
      return;
    }
    const matrix = transformMatrix(layer.transform),
      lo: Bounds["min"] = [Infinity, Infinity, Infinity],
      hi: Bounds["max"] = [-Infinity, -Infinity, -Infinity],
      point = new Vector3();
    for (const x of [bounds.min[0] - 1, bounds.max[0] + 1])
      for (const y of [bounds.min[1] - 1, bounds.max[1] + 1])
        for (const z of [bounds.min[2] - 1, bounds.max[2] + 1]) {
          point
            .set(
              layer.volume.coordinate(x, 0),
              layer.volume.coordinate(y, 1),
              layer.volume.coordinate(z, 2),
            )
            .applyMatrix4(matrix);
          point.toArray().forEach((v, i) => {
            lo[i] = Math.min(lo[i], v);
            hi[i] = Math.max(hi[i], v);
          });
        }
    this.contentVersion++;
    this.invalidateWorldRegion({ min: lo, max: hi });
  }
  private invalidateWorldRegion({ min: lo, max: hi }: Bounds): void {
    if (!this.layout) return;
    const { center, extent, resolution: n } = this.layout,
      h = (2 * extent) / (n - 1);
    const region = {
      min: lo.map((v, i) => Math.max(0, Math.floor((v - center[i] + extent) / h))) as Bounds["min"],
      max: hi.map((v, i) =>
        Math.min(n - 1, Math.ceil((v - center[i] + extent) / h)),
      ) as Bounds["max"],
    };
    if (region.min.some((v, i) => v > region.max[i])) return;
    // Coalesce overlapping edits to keep long strokes bounded, preserving distant regions.
    const overlap = this.regions.find((r) =>
      r.min.every((v, i) => v <= region.max[i] + 1 && r.max[i] >= region.min[i] - 1),
    );
    if (overlap)
      for (let i = 0; i < 3; i++) {
        overlap.min[i] = Math.min(overlap.min[i], region.min[i]);
        overlap.max[i] = Math.max(overlap.max[i], region.max[i]);
      }
    else this.regions.push(region);
    if (this.regions.length > 64) this.full = true;
    this.version++;
    this.lastEdit = performance.now();
  }
  get failed(): boolean {
    return this.failedVersion === this.version;
  }
  get busy(): boolean {
    return !!this.running;
  }
  get trackedBytes(): number {
    return (
      (this.volume ? this.volume.dimensions.reduce((a, b) => a * b, 1) * 8 : 0) +
      (this.mesher?.ownedGeometryBytes ?? 0) +
      (this.retained?.bytes ?? 0)
    );
  }
  get pending(): boolean {
    return this.full || this.regions.length > 0;
  }
  /** Debounced metadata/stroke preview. UI calls without awaiting; only one job can run. */
  tick(): Promise<boolean> | null {
    this.syncMetadata();
    if (
      this.disposed ||
      this.paused ||
      this.running ||
      this.failedVersion === this.version ||
      !this.pending ||
      (!this.interactive && performance.now() - this.lastEdit < 120)
    )
      return null;
    return this.rebuild(true);
  }
  rebuild(progressive = false): Promise<boolean> {
    if (this.disposed || this.paused) return Promise.resolve(false);
    this.syncMetadata();
    if (this.running) return this.running;
    this.buildingDraft = this.interactive;
    this.buildContentVersion = this.contentVersion;
    const profile = agentPerformanceEnabled();
    const started = profile ? performance.now() : 0;
    const build = this.build(progressive);
    this.running = (
      profile
        ? build.then((finished) => {
            if (profile)
              recordAgentPerformance("boolean.rebuild", performance.now() - started, {
                finished,
                ...(finished ? this.stats : {}),
              });
            return finished;
          })
        : build
    )
      .catch((error) => {
        this.failedVersion = this.version;
        if (
          this.project.layerStack.layers.some((l) => l.booleanModifiers?.length || l.array?.enabled)
        ) {
          this.clearRetained();
          this.mesher?.dispose();
          this.surface?.clear();
          this.group.clear();
          this.mesher = null;
          this.surface = null;
          this.volume = null;
          this.layout = null;
          this.stats = null;
          this.full = true;
        }
        throw error;
      })
      .finally(() => {
        this.running = null;
        this.buildProgress = null;
      });
    return this.running;
  }
  async flush(): Promise<void> {
    this.setInteractive(false);
    if (this.paused)
      throw new Error("Boolean evaluation paused while controller tracking is unavailable.");
    this.syncMetadata();
    while (!this.disposed && (this.running || this.pending)) {
      if (this.paused)
        throw new Error("Boolean evaluation paused while controller tracking is unavailable.");
      await (this.running ?? this.rebuild());
      this.syncMetadata();
    }
  }
  private async build(progressive: boolean): Promise<boolean> {
    if (!this.pending) return false;
    const version = this.version,
      start = performance.now(),
      layers = this.previewLayers;
    const layoutAt = (cap: number) =>
      compositeLayout(
        layers,
        cap,
        this.interactive || this.options.analyticPrimitives,
        this.options.stagedEvaluation,
        this.options.boundedPreview,
        this.interactive,
      );
    let layout = layoutAt(this.interactive ? Math.min(this.interactiveCap, this.cap) : this.cap);
    const refining = this.draftReady;
    if (this.draftVersion !== null && !refining) {
      this.clearRetained();
      this.draftVersion = null;
      this.stats = null;
    }
    let draft = false;
    if (
      progressive &&
      this.options.boundedPreview &&
      !this.interactive &&
      !refining &&
      this.full &&
      layout.resolution > 64
    ) {
      const sourcesPerPoint = previewSourceWork(layers);
      if (sourcesPerPoint * layout.resolution ** 3 >= PROGRESSIVE_PREVIEW_WORK) {
        layout = layoutAt(
          Math.max(8, Math.min(64, Math.floor(Math.cbrt(DRAFT_PREVIEW_WORK / sourcesPerPoint)))),
        );
        draft = true;
      }
    }
    const layoutChanged = JSON.stringify(layout) !== JSON.stringify(this.layout);
    const full = draft || this.adaptive || this.full || layoutChanged || !this.volume;
    const gridBytes = layout.resolution ** 3 * 8;
    const keepDraft = refining && gridBytes + this.trackedBytes <= this.availableBytes();
    if (refining && !keepDraft) {
      this.draftVersion = null;
      this.stats = null;
    }
    const keepSurface = keepDraft || this.adaptive;
    if (
      gridBytes + (this.retained?.bytes ?? (keepSurface ? this.trackedBytes : 0)) >
      this.availableBytes()
    )
      throw new Error("Boolean evaluation exceeds the available memory budget.");
    if (layoutChanged || !this.volume || this.adaptive) {
      if (
        keepSurface &&
        !this.retained &&
        this.surface &&
        this.mesher &&
        this.volume &&
        this.stats
      ) {
        this.retained = {
          surface: this.surface,
          mesher: this.mesher,
          bytes:
            this.mesher.ownedGeometryBytes + this.volume.dimensions.reduce((a, b) => a * b, 1) * 8,
          center: this.group.position.clone(),
        };
      } else {
        this.mesher?.dispose();
        this.surface?.clear();
        this.surface?.group.removeFromParent();
      }
      this.volume = new SDFVolume(
        layout.resolution,
        layout.extent,
        false,
        undefined,
        undefined,
        !!this.options.analyticPrimitives && !!this.options.stagedEvaluation,
      );
      this.mesher = new IncrementalMesher(this.volume);
      this.surface = new ChunkSurface(this.material, true);
      if (!this.retained) this.group.add(this.surface.group);
      this.group.position.fromArray(layout.center);
      if (this.retained)
        this.retained.surface.group.position.copy(this.retained.center).sub(this.group.position);
      this.layout = layout;
    }
    const { volume, mesher, surface } = this;
    if (!volume || !mesher || !surface) throw new Error("Boolean render cache is unavailable.");
    const n = volume.resolution,
      evaluate = prepareComposite(layers),
      regions = full
        ? [{ min: [0, 0, 0], max: [n - 1, n - 1, n - 1] } as Bounds]
        : this.regions.map((r) => ({ min: [...r.min], max: [...r.max] }) as Bounds);
    const needsColours =
      this.options.colours !== false &&
      layers.some(
        (l) => l.booleanModifiers?.length || l.array?.enabled || !sculptPaint(l.volume).empty,
      );
    const colour = needsColours ? prepareCompositeColour(layers, this.paintBase) : undefined;
    const totalSamples = regions.reduce(
      (total, region) =>
        total + region.max.reduce((count, max, axis) => count * (max - region.min[axis] + 1), 1),
      0,
    );
    const pass = draft ? "draft" : refining ? "refinement" : undefined;
    const samplingProgress: BooleanPreviewProgress = {
      phase: "sampling",
      pass,
      completed: 0,
      total: totalSamples,
    };
    this.buildProgress = samplingProgress;
    const yieldBuild = this.options.stagedEvaluation ? yieldExportTask : yieldUI;
    let maxSamplingSliceMs = 0,
      maxMeshingSliceMs = 0;
    let samplingMs = 0,
      samples = 0;
    for (const region of regions)
      for (let z = region.min[2]; z <= region.max[2]; z++) {
        let batch = performance.now();
        const wz = volume.coordinate(z) + layout.center[2];
        for (let y = region.min[1]; y <= region.max[1]; y++) {
          const wy = volume.coordinate(y) + layout.center[1];
          for (let x = region.min[0]; x <= region.max[0]; x++) {
            const value = evaluate(volume.coordinate(x) + layout.center[0], wy, wz);
            volume.values[volume.index(x, y, z)] = value;
            samples++;
            if (samples % 128 === 0 && performance.now() - batch >= 3) {
              const duration = performance.now() - batch;
              samplingMs += duration;
              maxSamplingSliceMs = Math.max(maxSamplingSliceMs, duration);
              samplingProgress.completed = samples;
              await yieldBuild();
              this.syncMetadata();
              if (!this.buildCurrent(version)) {
                this.full = true;
                return false;
              }
              batch = performance.now();
            }
          }
        }
        const duration = performance.now() - batch;
        samplingMs += duration;
        maxSamplingSliceMs = Math.max(maxSamplingSliceMs, duration);
        const stages = layout.samplingStages;
        const stageIndex = stages?.findIndex((stage) => z <= stage.maxZ) ?? 0;
        const stageEnd = !!stages && z === stages[stageIndex].maxZ;
        if (z % 4 === 0 || stageEnd) {
          const currentStage = stages?.[stageIndex];
          const stageOffset = currentStage ? currentStage.minZ * n * n : 0;
          const stageTotal = currentStage
            ? (currentStage.maxZ - currentStage.minZ + 1) * n * n
            : n ** 3;
          this.options.samplingProgress?.(
            samples - stageOffset,
            stageTotal,
            stageIndex + 1,
            stages?.length ?? 1,
          );
          samplingProgress.completed = samples;
          await yieldBuild();
          this.syncMetadata();
          if (!this.buildCurrent(version)) {
            this.full = true;
            return false;
          }
        }
      }
    if (full) mesher.invalidate();
    else
      regions.forEach((r) => {
        mesher.invalidate(r);
      });
    const meshingProgress: BooleanPreviewProgress = {
      phase: "meshing",
      pass,
      completed: 0,
      total: mesher.pendingChunks,
    };
    this.buildProgress = meshingProgress;
    let meshingMs = 0,
      chunks = 0,
      totalChunks = 0,
      triangles = 0;
    const meshBudgetMs = 3;
    const maxChunksPerYield = 32;
    let yieldStart = performance.now(),
      chunksSinceYield = 0;
    for (;;) {
      const sliceStart = performance.now();
      const update = mesher.rebuildChunks(2, Math.max(0, meshBudgetMs - (sliceStart - yieldStart)));
      if (!update) break;
      maxMeshingSliceMs = Math.max(maxMeshingSliceMs, performance.now() - sliceStart);
      const hasSurface = update.updates.some((u) => u.geometry.getAttribute("position").count > 0);
      if (colour && hasSurface) {
        for (const u of update.updates) {
          const result = await this.cooperativeColours(u.geometry, version, colour);
          if (!result || !this.buildCurrent(version)) {
            this.full = true;
            return false;
          }
          if (result.colours) mesher.setChunkColours(u, result.colours);
          maxMeshingSliceMs = Math.max(maxMeshingSliceMs, result.maxSliceMs);
        }
      }
      if (this.material instanceof MeshStandardMaterial) {
        if (needsColours !== this.material.vertexColors) {
          this.material.vertexColors = needsColours;
          this.material.needsUpdate = true;
        }
        if (needsColours) this.material.color.set(0xffffff);
      }
      surface.update(update.updates);
      meshingMs += update.stats.milliseconds;
      chunks += update.stats.chunks;
      meshingProgress.completed = chunks;
      totalChunks = update.stats.totalChunks;
      triangles = update.triangles;
      this.options.meshingProgress?.(chunks, totalChunks);
      if (this.trackedBytes > this.availableBytes() && refining && this.retained) {
        this.clearRetained();
        this.draftVersion = null;
        this.stats = null;
        this.group.add(surface.group);
      }
      if (this.trackedBytes > this.availableBytes())
        throw new Error("Boolean evaluation exceeds the available memory budget.");
      if (triangles > MAX_INTERMEDIATE_TRIANGLES) {
        this.group.visible = false;
        throw new Error(
          `Boolean evaluation exceeds ${MAX_INTERMEDIATE_TRIANGLES.toLocaleString()} intermediate triangles (${triangles.toLocaleString()} reached). Reduce source complexity or export fewer parts.`,
        );
      }
      chunksSinceYield += update.stats.chunks;
      // Empty batches still publish removals and check admission. Let adjacent
      // cheap batches share the deadline; retain a task boundary for surface
      // work and for the final progress notification.
      if (!hasSurface) {
        const elapsed = performance.now() - yieldStart;
        maxMeshingSliceMs = Math.max(maxMeshingSliceMs, elapsed);
        if (
          this.options.boundedPreview &&
          elapsed < meshBudgetMs &&
          chunksSinceYield < maxChunksPerYield &&
          mesher.pendingChunks > 0 &&
          version === this.version &&
          !this.paused &&
          !this.disposed
        )
          continue;
      }
      await yieldBuild();
      yieldStart = performance.now();
      chunksSinceYield = 0;
      this.syncMetadata();
      if (!this.buildCurrent(version)) {
        this.full = true;
        return false;
      }
    }
    this.clearRetained();
    this.group.add(surface.group);
    this.draftVersion = draft ? version : null;
    this.full = draft || version !== this.version;
    if (!this.full) {
      this.regions = [];
      if (!this.interactive) this.adaptive = false;
    }
    this.group.updateWorldMatrix(true, true);
    this.stats = {
      samplingMs,
      maxSamplingSliceMs,
      maxMeshingSliceMs,
      meshingMs,
      elapsedMs: performance.now() - start,
      samples,
      chunks,
      totalChunks,
      triangles,
      resolution: n,
      step: volume.step,
      capped: layout.capped,
      ...(layout.previewWorkCapped ? { previewWorkCapped: true } : {}),
      full,
    };
    return true;
  }
  exportSources(): ExportSource[] {
    this.syncMetadata();
    // Staged exports may use the selected maximum resolution even when the
    // requested feature sampling target exceeds it. The export report records
    // the achieved spacing; preview exports remain strict.
    if (
      this.project.layerStack.layers.some((l) => l.booleanModifiers?.length || l.array?.enabled) &&
      this.stats?.capped &&
      !this.options.stagedEvaluation
    )
      throw new Error(
        `Live Boolean export exceeds the quality cap at ${this.stats.resolution}³ (${this.stats.triangles.toLocaleString()} intermediate triangles); reduce bounds or increase feature size.`,
      );
    if (this.interactive || this.pending || !this.mesher || !this.volume || this.running)
      throw new Error("Wait for the Boolean result to finish rebuilding.");
    const mesher = this.mesher,
      version = this.version,
      volume = this.volume,
      sources = this.sourceVolumes,
      metadata = this.fingerprint;
    return [
      {
        name: "Boolean Result",
        step: volume.step,
        transform: {
          position: this.group.position.toArray(),
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
        chunks: mesher
          .snapshotUpdates()
          .filter((u) => u.geometry.getAttribute("position").count)
          .map((u) => ({
            positions: u.geometry.getAttribute("position").array as Float32Array,
            normals: u.geometry.getAttribute("normal").array as Float32Array,
            colours: u.geometry.getAttribute("color")?.array as Float32Array | undefined,
          })),
        current: () => {
          if (
            this.disposed ||
            this.pending ||
            this.running ||
            this.version !== version ||
            this.volume !== volume ||
            !this.sourceCurrent()
          )
            return false;
          const layers = this.project.layerStack.compositionLayers;
          return (
            layers.length === sources.length &&
            layers.every((layer, i) => layer.volume === sources[i]) &&
            JSON.stringify(this.sourceMetadata(layers)) === metadata
          );
        },
      },
    ];
  }
  exportGroup(): Group {
    if (this.interactive || this.running || this.pending || !this.surface)
      throw new Error("Wait for the Boolean preview to finish rebuilding.");
    const mesh = buildExportMesh(this.surface.group, this.exportMaterial, "local");
    const colours = this.paintAttributes(mesh.geometry);
    if (colours) {
      mesh.geometry.setAttribute("color", new BufferAttribute(colours, 3));
      mesh.material = this.paintedExport;
    }
    mesh.geometry.applyMatrix4(this.group.matrix);
    if (!mesh.geometry.getAttribute("position").count) {
      mesh.geometry.dispose();
      throw new Error("Boolean result is empty; no surface to export.");
    }
    const group = new Group();
    group.name = this.project.name;
    mesh.name = "Boolean Result";
    group.add(mesh);
    return group;
  }
  dispose(): void {
    this.paintedExport.dispose();
    this.disposed = true;
    this.version++;
    this.clearRetained();
    this.mesher?.dispose();
    this.surface?.clear();
    this.group.clear();
    this.mesher = null;
    this.surface = null;
    this.volume = null;
    this.layout = null;
    this.regions = [];
    this.sourceVolumes = [];
    this.metadata = [];
  }
}
