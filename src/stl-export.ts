import { Vector3 } from "three";
import {
  type ExportQuality,
  type ExportSource,
  ExportWork,
  exportAdmission,
  optimiseExportMesh,
} from "./export-mesh";
import type { GlbExportResult } from "./glb-export";
import { transformMatrix, validateTransform } from "./transform";
export type PrintReport = {
  units: "mm";
  dimensions: number[];
  triangles: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
  inconsistentEdges: number;
  degenerateTriangles: number;
  components: number;
  invertedComponents: number;
  blocking: string[];
  warnings: string[];
  unsupported: string[];
};
/** Exact coordinate welding on the final Float32 STL coordinates. No hidden repair. */
export async function validatePrintMesh(
  p: Float32Array,
  work = new ExportWork(),
): Promise<PrintReport> {
  if (!p.length || p.length % 9) throw new Error("Invalid print triangle buffer.");
  if (p.length / 9 > 300_000)
    throw new Error("Print validation limit is 300,000 triangles. Export selected parts.");
  const n = p.length / 9,
    parent = Int32Array.from({ length: n }, (_, i) => i),
    volume = new Float64Array(n),
    vertices = new Map<string, number>(),
    edges = new Map<string, { count: number; direction: number; face: number }>(),
    min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  let degenerate = 0;
  const root = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (let f = 0; f < n; f++) {
    if (f % 512 === 0) await work.pause("Validating final STL topology", f, n);
    const ids: number[] = [];
    for (let k = 0; k < 3; k++) {
      const offset = f * 9 + k * 3;
      for (let a = 0; a < 3; a++) {
        const v = p[offset + a];
        if (!Number.isFinite(v)) throw new Error("Nonfinite print geometry.");
        min[a] = Math.min(min[a], v);
        max[a] = Math.max(max[a], v);
      }
      const key = `${p[offset]},${p[offset + 1]},${p[offset + 2]}`;
      let id = vertices.get(key);
      if (id === undefined) {
        id = vertices.size;
        vertices.set(key, id);
      }
      ids.push(id);
    }
    const a = new Vector3().fromArray(p, f * 9),
      b = new Vector3().fromArray(p, f * 9 + 3),
      c = new Vector3().fromArray(p, f * 9 + 6),
      normal = b.clone().sub(a).cross(c.clone().sub(a));
    if (normal.lengthSq() === 0) degenerate++;
    volume[f] = a.dot(b.clone().cross(c)) / 6;
    for (let k = 0; k < 3; k++) {
      const a = ids[k],
        b = ids[(k + 1) % 3],
        key = a < b ? `${a},${b}` : `${b},${a}`,
        e = edges.get(key);
      if (e) {
        e.count++;
        e.direction += a < b ? 1 : -1;
        parent[root(f)] = root(e.face);
      } else edges.set(key, { count: 1, direction: a < b ? 1 : -1, face: f });
    }
  }
  let boundaryEdges = 0,
    nonManifoldEdges = 0,
    inconsistentEdges = 0;
  for (const e of edges.values()) {
    if (e.count === 1) boundaryEdges++;
    else if (e.count !== 2) nonManifoldEdges++;
    else if (e.direction !== 0) inconsistentEdges++;
  }
  const sums = new Map<number, number>();
  for (let f = 0; f < n; f++) {
    if (f % 2048 === 0) await work.pause("Checking connected solids", f, n);
    const r = root(f);
    sums.set(r, (sums.get(r) ?? 0) + volume[f]);
  }
  const dimensions = max.map((v, i) => v - min[i]),
    invertedComponents = [...sums.values()].filter((v) => v < 0).length,
    blocking: string[] = [],
    warnings: string[] = [];
  if (dimensions.some((d) => d <= 0)) blocking.push("Model has zero dimensions.");
  if (degenerate) blocking.push(`${degenerate} degenerate triangles.`);
  if (nonManifoldEdges) blocking.push(`${nonManifoldEdges} non-manifold edges.`);
  if (inconsistentEdges) blocking.push(`${inconsistentEdges} inconsistent winding edges.`);
  if (invertedComponents)
    warnings.push(
      `${invertedComponents} inward-oriented components (signed volume): inspect winding; intentional cavity shells are not classified.`,
    );
  if (boundaryEdges) warnings.push(`${boundaryEdges} open boundary edges: not watertight.`);
  if (sums.size > 1)
    warnings.push(
      `${sums.size} disconnected surfaces; nested shells and separate parts need slicer inspection.`,
    );
  return {
    units: "mm",
    dimensions,
    triangles: n,
    boundaryEdges,
    nonManifoldEdges,
    inconsistentEdges,
    degenerateTriangles: degenerate,
    components: sums.size,
    invertedComponents,
    blocking,
    warnings,
    unsupported: [
      "Self-intersections, vertex-only non-manifold contacts and minimum wall thickness are not checked.",
      "No automatic repair or guarantee of slicer success.",
    ],
  };
}
export async function encodeSTL(
  sources: ExportSource[],
  quality: ExportQuality,
  maxBytes: number,
  targetMM: number,
  work = new ExportWork(),
): Promise<GlbExportResult & { report: PrintReport }> {
  if (!Number.isFinite(targetMM) || targetMM < 0.1 || targetMM > 10000)
    throw new Error("Target longest dimension must be 0.1–10,000 mm.");
  const start = performance.now(),
    admission = exportAdmission(sources, quality, maxBytes);
  if (admission.corners / 3 > 300_000 || admission.corners * 320 > maxBytes)
    throw new Error(
      "STL topology validation exceeds memory/triangle safety limits. Export selected parts.",
    );
  const chunks: Float32Array[] = [],
    stats: GlbExportResult["stats"] = [],
    min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  let count = 0;
  for (const source of sources) {
    const mesh = await optimiseExportMesh(source, quality, work),
      matrix = transformMatrix(validateTransform(mesh.transform)),
      length = mesh.indices?.length ?? mesh.positions.length / 3,
      p = new Float32Array(length * 3),
      v = new Vector3();
    for (let i = 0; i < length; i++) {
      if (i % 2048 === 0) await work.pause("Transforming model coordinates", i, length);
      v.fromArray(mesh.positions, (mesh.indices?.[i] ?? i) * 3).applyMatrix4(matrix);
      for (let a = 0; a < 3; a++) {
        const x = v.getComponent(a);
        p[i * 3 + a] = x;
        min[a] = Math.min(min[a], x);
        max[a] = Math.max(max[a], x);
      }
    }
    chunks.push(p);
    count += p.length;
    stats.push(mesh.stats);
  }
  const longest = Math.max(...max.map((v, i) => v - min[i]));
  if (!(longest > 0 && Number.isFinite(longest))) throw new Error("Empty or zero-size model.");
  const p = new Float32Array(count),
    factor = targetMM / longest;
  let offset = 0;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      if (i % 16384 === 0) await work.pause("Scaling to millimetres", offset + i, count);
      p[offset + i] = (chunk[i] - (min[i % 3] + max[i % 3]) / 2) * factor;
    }
    offset += chunk.length;
  }
  const report = await validatePrintMesh(p, work),
    data = new ArrayBuffer(84 + report.triangles * 50),
    bytes = new Uint8Array(data),
    view = new DataView(data);
  bytes.set(new TextEncoder().encode("Centra Sculpt | units=mm | inspect companion print report"));
  view.setUint32(80, report.triangles, true);
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  for (let f = 0; f < report.triangles; f++) {
    if (f % 1024 === 0) await work.pause("Encoding binary STL", f, report.triangles);
    a.fromArray(p, f * 9);
    b.fromArray(p, f * 9 + 3);
    c.fromArray(p, f * 9 + 6);
    b.sub(a).cross(c.sub(a)).normalize();
    for (let k = 0; k < 3; k++) view.setFloat32(84 + f * 50 + k * 4, b.getComponent(k), true);
    for (let k = 0; k < 9; k++) view.setFloat32(96 + f * 50 + k * 4, p[f * 9 + k], true);
  }
  work.check();
  return {
    data,
    report,
    stats,
    milliseconds: performance.now() - start,
    estimatedBytes: Math.max(admission.estimatedBytes, admission.corners * 320),
    geometryBytes: p.byteLength,
    backend: "cooperative",
  };
}
