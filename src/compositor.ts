import type { Material } from "three";
import { BufferAttribute, Color, Group, MeshStandardMaterial, Vector3 } from "three";
import type { ExportSource } from "./export-mesh";
import type { LayerOperation, SculptProject, SdfLayer } from "./layers";
import { booleanRoots, validateBooleanGraph } from "./live-boolean";
import { IncrementalMesher } from "./mesh";
import { arrayInstanceAngles } from "./object-array";
import {
  primitiveDistance,
  primitiveWorldDimensions,
  validatePrimitive,
} from "./parametric-primitive";
import { sculptPaint } from "./sculpt-paint";
import type { Bounds, Point3 } from "./sdf";
import { SDFVolume } from "./sdf";
import { buildExportMesh, ChunkSurface } from "./surface";
import { transformMatrix, uniformScale } from "./transform";

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
  const axis = array.axis;
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
        result = Math.min(result, source(x - ax * offset, y - ay * offset, z - az * offset));
      }
      return result;
    };
  }
  const angles = arrayInstanceAngles(array),
    cosines = angles.map(Math.cos),
    sines = angles.map(Math.sin),
    [px, py, pz] = array.pivot,
    [cx, cy, cz] = layer.transform.position,
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
        result = Math.min(result, source(qx, qy, qz));
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
        result = Math.min(result, source(x - dx, y - dy, z - dz));
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
  const at = (x: number, y: number, z: number) =>
    data ? data[x + nx * (y + ny * z)] : v.readVoxel(v.index(x, y, z));
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
export function prepareComposite(
  layers: readonly SdfLayer[],
): (x: number, y: number, z: number) => number {
  const ordering = layers[0]?.hierarchy?.compositionOrder;
  const ordered = ordering
    ? [...layers].sort((a, b) => ordering.indexOf(a.id) - ordering.indexOf(b.id))
    : layers;
  validateBooleanGraph(layers);
  const all = layers;
  const samplers = new Map<string, (x: number, y: number, z: number) => number>();
  const prepare = (layer: SdfLayer): ((x: number, y: number, z: number) => number) => {
    const cached = samplers.get(layer.id);
    if (cached) return cached;
    const own = prepareLayerSampler(layer);
    const modifiers = (layer.booleanModifiers ?? [])
      .filter((m) => m.enabled)
      .map((m) => {
        const source = all.find((l) => l.id === m.sourceId);
        if (!source) throw new Error("Boolean source does not exist.");
        return { sample: prepare(source), operation: m.operation };
      });
    const sample = (x: number, y: number, z: number) => {
      let d = own(x, y, z);
      for (const m of modifiers) d = combineSdf(d, m.sample(x, y, z), m.operation);
      return d;
    };
    samplers.set(layer.id, sample);
    return sample;
  };
  const sources = booleanRoots(ordered).map((layer) => ({
    sample: prepare(layer),
    operation: layer.operation,
  }));
  return (x, y, z) => {
    if (!sources.length) return 1;
    let result = sources[0].sample(x, y, z);
    for (let i = 1; i < sources.length; i++)
      result = combineSdf(result, sources[i].sample(x, y, z), sources[i].operation);
    return result;
  };
}
/** Winning CSG operand supplies colour, including the cutter on difference faces. */
export function prepareCompositeColour(
  layers: readonly SdfLayer[],
  base: (l: SdfLayer) => Color = () => new Color("#afbd94"),
): (p: Vector3, out: Color) => Color {
  validateBooleanGraph(layers);
  const source = new Map(
    layers.map((l) => [
      l.id,
      {
        layer: l,
        sample: prepareLayerSampler(l),
        inverse: transformMatrix(l.transform).invert(),
        base: base(l).clone(),
      },
    ]),
  );
  type Owner = NonNullable<ReturnType<typeof source.get>>;
  const evaluate = (layer: SdfLayer, p: Vector3): { owner: Owner; distance: number } => {
    const own = source.get(layer.id)!;
    let result = { owner: own, distance: own.sample(p.x, p.y, p.z) };
    for (const m of layer.booleanModifiers ?? []) {
      if (!m.enabled) continue;
      const next = evaluate(source.get(m.sourceId)!.layer, p),
        d = m.operation === "difference" ? -next.distance : next.distance;
      if (m.operation === "union" ? d < result.distance : d > result.distance)
        result = { owner: next.owner, distance: d };
    }
    return result;
  };
  const roots = booleanRoots(layers),
    local = new Vector3();
  return (p, out) => {
    if (!roots.length) return out.set("#afbd94");
    let result = evaluate(roots[0], p);
    for (const layer of roots.slice(1)) {
      const next = evaluate(layer, p),
        d = layer.operation === "difference" ? -next.distance : next.distance;
      if (layer.operation === "union" ? d < result.distance : d > result.distance)
        result = { owner: next.owner, distance: d };
    }
    local.copy(p).applyMatrix4(result.owner.inverse);
    return sculptPaint(result.owner.layer.volume).sample(local, result.owner.base, out);
  };
}
export function evaluateComposite(layers: readonly SdfLayer[], point: Point3): number {
  return prepareComposite(layers)(point.x, point.y, point.z);
}
export type CompositeLayout = {
  resolution: number;
  extent: number;
  center: [number, number, number];
  desiredStep: number;
  capped: boolean;
};
/** One independent derived world grid. Sampling tries to match the finest world voxel,
 * but is bounded to 192³ (or a lower explicit quality cap). No source is converted. */
export function compositeLayout(
  layers: readonly SdfLayer[],
  cap = 192,
  analyticPrimitives = false,
): CompositeLayout {
  if (!Number.isInteger(cap) || cap < 8 || cap > 192)
    throw new Error("Composite resolution cap must be 8–192.");
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
  const visible = layers.filter((l) =>
      live
        ? reachable.has(l.id) &&
          (l.primitive ||
            l.procedural ||
            !l.volume.getDenseView() ||
            l.volume.getDenseView()!.some((v) => v < 0))
        : l.visible,
    ),
    min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  let desiredStep = Infinity;
  for (const layer of visible) {
    const scale = uniformScale(layer.transform),
      dimensions =
        live && layer.primitive
          ? primitiveWorldDimensions(layer.primitive, layer.transform)
          : undefined,
      baseBounds = dimensions
        ? {
            min: dimensions.map((d, i) => layer.transform.position[i] - d / 2),
            max: dimensions.map((d, i) => layer.transform.position[i] + d / 2),
          }
        : layer.volume.worldBounds(layer.transform);
    let bounds = baseBounds;
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
    if (!analyticPrimitives || !live || !layer.primitive)
      desiredStep = Math.min(desiredStep, layer.volume.step * scale);
    if (live && layer.primitive) {
      const dimensions = Object.values(layer.primitive).filter(
        (v): v is number => typeof v === "number",
      );
      desiredStep = Math.min(
        desiredStep,
        (Math.min(...dimensions) * scale) / (analyticPrimitives ? 10 : 8),
      );
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
  const desired = Math.ceil((2 * extent) / desiredStep) + 1,
    resolution = Math.max(8, Math.min(cap, desired));
  const instanceWork =
    layers.reduce((sum, layer) => sum + (layer.array?.enabled ? layer.array.count : 1), 0) *
    resolution ** 3;
  if (instanceWork > 64_000_000)
    throw new Error(
      "Array evaluation exceeds the 64 million sample budget. Reduce instances or source bounds before preview/export.",
    );
  return { resolution, extent, center, desiredStep, capped: desired > cap };
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
  full: boolean;
};
const yieldUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
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
  ): Promise<{ colours?: Float32Array; maxSliceMs: number } | null> {
    if (this.options.colours === false) return { maxSliceMs: 0 };
    if (
      !this.project.layerStack.layers.some(
        (l) => l.booleanModifiers?.length || l.array?.enabled || !sculptPaint(l.volume).empty,
      )
    )
      return { maxSliceMs: 0 };
    const sample = prepareCompositeColour(
        this.project.layerStack.compositionLayers,
        this.paintBase,
      ),
      p = geometry.getAttribute("position"),
      colours = new Float32Array(p.count * 3),
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
        if (this.disposed || version !== this.version) return null;
        batch = performance.now();
      }
    }
    return { colours, maxSliceMs: Math.max(maxSliceMs, performance.now() - batch) };
  }
  private surface: ChunkSurface | null = null;
  private mesher: IncrementalMesher | null = null;
  private volume: SDFVolume | null = null;
  private layout: CompositeLayout | null = null;
  private fingerprint = "";
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
    private readonly options: { analyticPrimitives?: boolean; colours?: boolean } = {},
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
  private metadataKey(): string {
    return JSON.stringify(
      this.project.layerStack.compositionLayers.map((l) => [
        l.id,
        l.visible,
        l.operation,
        l.order,
        l.transform,
        l.primitive,
        l.booleanModifiers,
        l.array,
        l.volume.resolution,
        l.volume.extent,
        l.volume.dimensions,
        l.volume.bounds,
        sculptPaint(l.volume).revision,
      ]),
    );
  }
  syncMetadata(): void {
    if (!this.sourceCurrent()) throw new Error("Evaluation cancelled: source changed.");
    const key = this.metadataKey();
    if (key !== this.fingerprint) {
      this.fingerprint = key;
      this.invalidate();
    }
  }
  /** Allocate cache invalidation before an atomic source publication. */
  prepareInvalidation(): () => void {
    const regions: Bounds[] = [];
    return () => {
      this.full = true;
      this.regions = regions;
      this.version++;
      this.lastEdit = performance.now();
    };
  }
  invalidate(): void {
    this.full = true;
    this.regions = [];
    this.version++;
    this.lastEdit = performance.now();
  }
  invalidateLayer(layer: SdfLayer, bounds?: Bounds | null): void {
    if (bounds === null || !layer.visible) return;
    if (!bounds || !this.layout) {
      this.invalidate();
      return;
    }
    const matrix = transformMatrix(layer.transform),
      lo = [Infinity, Infinity, Infinity],
      hi = [-Infinity, -Infinity, -Infinity],
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
    const { center, extent, resolution: n } = this.layout,
      h = (2 * extent) / (n - 1);
    const region = {
      min: lo.map((v, i) => Math.max(0, Math.floor((v - center[i] + extent) / h))) as Bounds["min"],
      max: hi.map((v, i) =>
        Math.min(n - 1, Math.ceil((v - center[i] + extent) / h)),
      ) as Bounds["max"],
    };
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
      (this.mesher?.ownedGeometryBytes ?? 0)
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
      performance.now() - this.lastEdit < 120
    )
      return null;
    return this.rebuild();
  }
  rebuild(): Promise<boolean> {
    if (this.disposed || this.paused) return Promise.resolve(false);
    this.syncMetadata();
    if (this.running) return this.running;
    this.running = this.build()
      .catch((error) => {
        this.failedVersion = this.version;
        if (
          this.project.layerStack.layers.some((l) => l.booleanModifiers?.length || l.array?.enabled)
        ) {
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
      });
    return this.running;
  }
  async flush(): Promise<void> {
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
  private async build(): Promise<boolean> {
    if (!this.pending) return false;
    const version = this.version,
      start = performance.now(),
      layout = compositeLayout(
        this.project.layerStack.compositionLayers,
        this.cap,
        this.options.analyticPrimitives,
      ),
      key = JSON.stringify(layout),
      layoutChanged = key !== JSON.stringify(this.layout);
    const full = this.full || layoutChanged || !this.volume;
    if (layout.resolution ** 3 * 8 > this.availableBytes())
      throw new Error("Boolean preview exceeds the 256 MiB memory budget.");
    if (layoutChanged || !this.volume) {
      this.mesher?.dispose();
      this.surface?.clear();
      this.group.clear();
      this.volume = new SDFVolume(layout.resolution, layout.extent, false);
      this.mesher = new IncrementalMesher(this.volume);
      this.surface = new ChunkSurface(this.material);
      this.group.add(this.surface.group);
      this.group.position.fromArray(layout.center);
      this.layout = layout;
    }
    const volume = this.volume!,
      n = volume.resolution,
      evaluate = prepareComposite(this.project.layerStack.compositionLayers),
      regions = full
        ? [{ min: [0, 0, 0], max: [n - 1, n - 1, n - 1] } as Bounds]
        : this.regions.map((r) => ({ min: [...r.min], max: [...r.max] }) as Bounds);
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
              await yieldUI();
              this.syncMetadata();
              if (this.disposed || version !== this.version) {
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
        if (z % 4 === 0) {
          await yieldUI();
          this.syncMetadata();
          if (this.disposed || version !== this.version) {
            this.full = true;
            return false;
          }
        }
      }
    if (full) this.mesher!.invalidate();
    else
      regions.forEach((r) => {
        this.mesher!.invalidate(r);
      });
    let meshingMs = 0,
      chunks = 0,
      totalChunks = 0,
      triangles = 0;
    for (;;) {
      const sliceStart = performance.now();
      const update = this.mesher!.rebuildChunks(2, 3);
      if (!update) break;
      maxMeshingSliceMs = Math.max(maxMeshingSliceMs, performance.now() - sliceStart);
      for (const u of update.updates) {
        const result = await this.cooperativeColours(u.geometry, version);
        if (!result || this.disposed || version !== this.version) {
          this.full = true;
          return false;
        }
        maxMeshingSliceMs = Math.max(maxMeshingSliceMs, result.maxSliceMs);
        if (result.colours)
          u.geometry.setAttribute("color", new BufferAttribute(result.colours, 3));
      }
      if (this.material instanceof MeshStandardMaterial) {
        const enabled = this.project.layerStack.layers.some(
          (l) => !!l.booleanModifiers?.length || !!l.array?.enabled || !sculptPaint(l.volume).empty,
        );
        if (enabled !== this.material.vertexColors) {
          this.material.vertexColors = enabled;
          this.material.needsUpdate = true;
        }
        if (enabled) this.material.color.set(0xffffff);
      }
      this.surface!.update(update.updates);
      meshingMs += update.stats.milliseconds;
      chunks += update.stats.chunks;
      totalChunks = update.stats.totalChunks;
      triangles = update.triangles;
      if (this.trackedBytes > this.availableBytes())
        throw new Error("Boolean preview exceeds the 256 MiB memory budget.");
      if (triangles > 1_000_000) {
        this.group.visible = false;
        throw new Error(
          "Boolean preview exceeds 1,000,000 triangles. Reduce composite quality or source complexity.",
        );
      }
      await yieldUI();
      this.syncMetadata();
      if (this.disposed || version !== this.version) {
        this.full = true;
        return false;
      }
    }
    this.full = false;
    this.regions = [];
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
      full,
    };
    return true;
  }
  exportSources(): ExportSource[] {
    this.syncMetadata();
    if (
      this.project.layerStack.layers.some((l) => l.booleanModifiers?.length || l.array?.enabled) &&
      this.stats?.capped
    )
      throw new Error(
        "Live Boolean export exceeds the quality cap; reduce bounds or increase feature size.",
      );
    if (this.pending || !this.mesher || !this.volume || this.running)
      throw new Error("Wait for the Boolean result to finish rebuilding.");
    const mesher = this.mesher,
      version = this.version,
      volume = this.volume,
      metadata = this.metadataKey();
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
            colours: this.options.colours === false ? undefined : this.paintAttributes(u.geometry),
          })),
        current: () =>
          this.metadataKey() === metadata &&
          !this.disposed &&
          !this.pending &&
          !this.running &&
          this.version === version &&
          this.volume === volume,
      },
    ];
  }
  exportGroup(): Group {
    if (this.pending || !this.surface)
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
    this.mesher?.dispose();
    this.surface?.clear();
    this.group.clear();
    this.mesher = null;
    this.surface = null;
    this.volume = null;
    this.layout = null;
    this.regions = [];
  }
}
