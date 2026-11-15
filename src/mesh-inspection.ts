import { Box3, Vector3 } from "three";
import { layerSources, partSources } from "./assembly";
import { prepareBooleanExport } from "./boolean-export";
import { EXPORT_MEMORY_LIMIT, type ExportSource, ExportWork } from "./export-mesh";
import type { IndependentLayers } from "./independent-layers";
import { LayerStack, SculptProject } from "./layers";
import { transformMatrix, type Vec3 } from "./transform";

export type MeshScope = { objectId?: string; partId?: string };
export type PrintInspection = {
  direction: Vec3;
  sectionOffsetMM: number;
  sectionNormal?: Vec3;
  overhangAngleDegrees?: number;
};

export async function evaluateMeshScope(
  layers: IndependentLayers,
  { objectId, partId }: MeshScope,
  signal?: AbortSignal,
  ready = () => layers.recoveryReady,
) {
  const stack = layers.project.layerStack;
  const inputs =
    partId !== undefined
      ? partSources(stack, partId)
      : objectId !== undefined
        ? layerSources(stack, objectId)
        : stack.compositionLayers;
  // A single unchanged surface needs no resampling. Use the same committed
  // triangles as ordinary selected-layer STL, including analytic primitive faces.
  const visible = inputs.filter((l) => l.visible);
  const only = visible.length === 1 ? visible[0] : undefined;
  if (
    partId === undefined &&
    only?.operation === "union" &&
    !inputs.some((l) => l.array?.enabled || l.booleanModifiers?.some((m) => m.enabled))
  ) {
    new ExportWork(signal, ready).check();
    const runtime = layers.runtime(only.id);
    const source: ExportSource = {
      name: only.name,
      layerId: only.id,
      transform: only.transform,
      step: only.primitive ? 0 : only.volume.step,
      chunks: runtime
        .exportUpdates()
        .filter((u) => u.geometry.getAttribute("position").count)
        .map(({ geometry }) => ({
          positions: geometry.getAttribute("position").array as Float32Array,
          normals: geometry.getAttribute("normal").array as Float32Array,
        })),
    };
    return { sources: [source], evaluation: null, dispose: () => {} };
  }
  const prepared = await prepareBooleanExport(
    layers,
    objectId !== undefined || partId !== undefined
      ? new SculptProject(new LayerStack([...inputs]), layers.project.settings)
      : layers.project,
    signal,
    true,
    undefined,
    EXPORT_MEMORY_LIMIT,
    192,
    true,
    ready,
  );
  return {
    sources: prepared.sources,
    evaluation: prepared.profile.evaluation,
    dispose: prepared.dispose,
  };
}

export function meshBoundsMM(bounds: Box3, mm: number) {
  return bounds.isEmpty()
    ? { units: "mm" as const, min: null, max: null, accuracy: "evaluated_mesh" as const }
    : {
        units: "mm" as const,
        min: bounds.min.toArray().map((x) => x * mm),
        max: bounds.max.toArray().map((x) => x * mm),
        accuracy: "evaluated_mesh" as const,
      };
}

async function visitMeshTriangles(
  sources: readonly ExportSource[],
  work: ExportWork,
  visit: (a: Vector3, b: Vector3, c: Vector3, chunk: Float32Array, i: number) => void,
) {
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  const total = sources.reduce(
    (n, s) => n + s.chunks.reduce((m, c) => m + c.positions.length / 9, 0),
    0,
  );
  let done = 0;
  for (const source of sources) {
    const matrix = transformMatrix(source.transform);
    for (const { positions: p } of source.chunks)
      for (let i = 0; i < p.length; i += 9) {
        if (done++ % 2048 === 0) await work.pause("Inspecting evaluated mesh", done, total);
        visit(
          a.fromArray(p, i).applyMatrix4(matrix),
          b.fromArray(p, i + 3).applyMatrix4(matrix),
          c.fromArray(p, i + 6).applyMatrix4(matrix),
          p,
          i,
        );
      }
  }
  work.check();
  return total;
}

export async function measuredMeshBounds(
  sources: readonly ExportSource[],
  mm: number,
  signal?: AbortSignal,
  current?: () => boolean,
) {
  const box = new Box3();
  await visitMeshTriangles(sources, new ExportWork(signal, current), (a, b, c) => {
    box.expandByPoint(a).expandByPoint(b).expandByPoint(c);
  });
  return meshBoundsMM(box, mm);
}

/** Intersects the same triangles used for overhang classification and rendering.
 * Plane offset is signed distance along the normalized build direction. */
export async function inspectMeshTriangles(
  sources: readonly ExportSource[],
  mm: number,
  options: PrintInspection,
  work: ExportWork,
) {
  const unit = (vector: Vec3) => {
    const magnitude = Math.hypot(...vector);
    if (!Number.isFinite(magnitude) || magnitude === 0)
      throw new Error("invalid_input: directions must be finite and nonzero");
    return new Vector3(...vector).divideScalar(magnitude);
  };
  const direction = unit(options.direction);
  const sectionNormal = options.sectionNormal ? unit(options.sectionNormal) : direction;
  const angle = options.overhangAngleDegrees ?? 45;
  const limit = -Math.sin((angle * Math.PI) / 180);
  const offset = options.sectionOffsetMM / mm;
  const bounds = new Box3(),
    u = new Vector3(),
    v = new Vector3(),
    normal = new Vector3();
  const flags = new Map<Float32Array, Uint8Array>();
  const section: number[] = [];
  const eps = 1e-9;
  let area = 0,
    faces = 0,
    bedFaces = 0,
    coplanarFaces = 0;
  const planeRange = [Infinity, -Infinity];
  let bed = Infinity;
  const total = await visitMeshTriangles(sources, work, (a, b, c) => {
    bounds.expandByPoint(a).expandByPoint(b).expandByPoint(c);
    bed = Math.min(bed, a.dot(direction), b.dot(direction), c.dot(direction));
    const x = a.dot(sectionNormal),
      y = b.dot(sectionNormal),
      z = c.dot(sectionNormal);
    planeRange[0] = Math.min(planeRange[0], x, y, z);
    planeRange[1] = Math.max(planeRange[1], x, y, z);
  });
  await visitMeshTriangles(sources, work, (a, b, c, chunk, i) => {
    const p = [a, b, c],
      levels = p.map((point) => point.dot(sectionNormal));
    normal.crossVectors(u.subVectors(b, a), v.subVectors(c, a));
    const twiceArea = normal.length();
    if (!twiceArea) return;
    if (normal.dot(direction) / twiceArea < limit - 1e-9) {
      if (p.every((point) => point.dot(direction) - bed <= eps)) bedFaces++;
      else {
        let mask = flags.get(chunk);
        if (!mask) {
          mask = new Uint8Array(chunk.length / 9);
          flags.set(chunk, mask);
        }
        mask[i / 9] = 1;
        faces++;
        area += twiceArea / 2;
      }
    }
    const d = levels.map((level) => (Math.abs(level - offset) <= eps ? 0 : level - offset));
    if (d.every((x) => x === 0)) {
      coplanarFaces++;
      return;
    }
    if (d.every((x) => x > 0) || d.every((x) => x < 0)) return;
    const hits: Vector3[] = [];
    for (let j = 0; j < 3; j++) {
      const k = (j + 1) % 3;
      if (d[j] === 0) hits.push(p[j]);
      else if (d[j] * d[k] < 0) hits.push(p[j].clone().lerp(p[k], d[j] / (d[j] - d[k])));
    }
    if (hits.length === 2 && hits[0].distanceToSquared(hits[1]) > eps ** 2) {
      if (section.length >= 600000)
        throw new Error("resource_limit: cross-section exceeds 100000 segments");
      for (const point of hits) section.push(point.x, point.y, point.z);
    }
  });
  return {
    flags,
    section,
    report: {
      bounds: meshBoundsMM(bounds, mm),
      direction: direction.toArray(),
      triangles: total,
      overhang: {
        angleFromVerticalDegrees: angle,
        faces,
        areaMM2: area * mm ** 2,
        excludedBedFaces: bedFaces,
      },
      section: {
        offsetMM: options.sectionOffsetMM,
        normal: sectionNormal.toArray(),
        projectionRangeMM: total ? planeRange.map((v) => v * mm) : null,
        segments: section.length / 6,
        coplanarFaces,
        // Keep the transport bounded even on large meshes; the PNG shows every segment.
        sampleSegmentsMM: Array.from({ length: Math.min(64, section.length / 6) }, (_, i) =>
          section.slice(i * 6, i * 6 + 6).map((x) => x * mm),
        ),
        truncated: section.length > 64 * 6,
      },
    },
  };
}
