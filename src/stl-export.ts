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
  precisionRetriangulations?: number;
  effectiveResolutionMM?: number;
};
/** Resolve exact collinear bridge faces after Float32 unit conversion.
 * Split the unique neighboring long edge at its existing middle vertex; never move or weld nearby points. */
export async function stabilisePrintCoordinates(input: Float32Array, work = new ExportWork()) {
  let positions = input,
    repaired = 0;
  const key = (p: Float32Array, offset: number) => `${p[offset]},${p[offset + 1]},${p[offset + 2]}`;
  const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const degenerate = (p: Float32Array, i: number) => {
    const ux = p[i + 3] - p[i],
      uy = p[i + 4] - p[i + 1],
      uz = p[i + 5] - p[i + 2],
      vx = p[i + 6] - p[i],
      vy = p[i + 7] - p[i + 1],
      vz = p[i + 8] - p[i + 2];
    return uy * vz - uz * vy === 0 && uz * vx - ux * vz === 0 && ux * vy - uy * vx === 0;
  };
  for (let pass = 0; pass < 8; pass++) {
    const candidates = new Map<string, { face: number; middle: number[]; key: string }[]>(),
      targets = new Map<string, { face: number; edge: number; count: number }>();
    for (let offset = 0; offset < positions.length; offset += 9) {
      if (offset % 4608 === 0)
        await work.pause("Stabilising STL precision", offset, positions.length);
      if (!degenerate(positions, offset)) continue;
      const points = [0, 3, 6].map((k) => new Vector3().fromArray(positions, offset + k));
      const pairs = [
        [0, 1, 2],
        [1, 2, 0],
        [2, 0, 1],
      ].sort(
        (a, b) =>
          points[b[0]].distanceToSquared(points[b[1]]) -
          points[a[0]].distanceToSquared(points[a[1]]),
      );
      const [a, b, m] = pairs[0],
        ab = points[b].clone().sub(points[a]),
        t = points[m].clone().sub(points[a]).dot(ab) / ab.lengthSq();
      if (!(t > 0 && t < 1)) continue;
      const id = edgeKey(key(positions, offset + a * 3), key(positions, offset + b * 3)),
        list = candidates.get(id) ?? [];
      list.push({ face: offset, middle: points[m].toArray(), key: key(positions, offset + m * 3) });
      candidates.set(id, list);
    }
    if (!candidates.size) break;
    for (let offset = 0; offset < positions.length; offset += 9) {
      if (offset % 4608 === 0)
        await work.pause("Matching precision seams", offset, positions.length);
      if (degenerate(positions, offset)) continue;
      for (let edge = 0; edge < 3; edge++) {
        const id = edgeKey(
          key(positions, offset + edge * 3),
          key(positions, offset + ((edge + 1) % 3) * 3),
        );
        if (!candidates.has(id)) continue;
        const target = targets.get(id);
        if (target) target.count++;
        else targets.set(id, { face: offset, edge, count: 1 });
      }
    }
    const removed = new Set<number>(),
      replacements = new Map<number, number[]>();
    for (const [id, list] of candidates) {
      const target = targets.get(id);
      if (!target || target.count !== 1 || replacements.has(target.face)) continue;
      const a = new Vector3().fromArray(positions, target.face + target.edge * 3),
        b = new Vector3().fromArray(positions, target.face + ((target.edge + 1) % 3) * 3),
        c = new Vector3().fromArray(positions, target.face + ((target.edge + 2) % 3) * 3),
        ab = b.clone().sub(a),
        unique = new Map(list.map((item) => [item.key, item]));
      const middle = [...unique.values()].sort(
          (x, y) =>
            new Vector3(...x.middle).sub(a).dot(ab) - new Vector3(...y.middle).sub(a).dot(ab),
        ),
        chain = [a.toArray(), ...middle.map((item) => item.middle), b.toArray()],
        triangles: number[] = [];
      for (let i = 0; i < chain.length - 1; i++)
        triangles.push(...chain[i], ...chain[i + 1], ...c.toArray());
      const patch = new Float32Array(triangles);
      if (
        Array.from({ length: patch.length / 9 }, (_, i) => degenerate(patch, i * 9)).some(Boolean)
      )
        continue;
      replacements.set(target.face, triangles);
      for (const item of list) removed.add(item.face);
    }
    if (!removed.size) break;
    const count =
        positions.length -
        removed.size * 9 +
        [...replacements.values()].reduce((sum, values) => sum + values.length - 9, 0),
      next = new Float32Array(count);
    let at = 0;
    for (let offset = 0; offset < positions.length; offset += 9) {
      if (offset % 4608 === 0)
        await work.pause("Publishing precision seams", offset, positions.length);
      if (removed.has(offset)) continue;
      const values = replacements.get(offset) ?? positions.subarray(offset, offset + 9);
      next.set(values, at);
      at += values.length;
    }
    repaired += removed.size;
    positions = next;
  }
  return { positions, repaired };
}
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
      "No general mesh repair or guarantee of slicer success.",
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
  const stable = await stabilisePrintCoordinates(p, work);
  const finalPositions = stable.positions;
  const report = await validatePrintMesh(finalPositions, work),
    data = new ArrayBuffer(84 + report.triangles * 50),
    bytes = new Uint8Array(data),
    view = new DataView(data);
  bytes.set(new TextEncoder().encode("Centra Sculpt | units=mm | inspect companion print report"));
  view.setUint32(80, report.triangles, true);
  if (stable.repaired) report.precisionRetriangulations = stable.repaired;
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  for (let f = 0; f < report.triangles; f++) {
    if (f % 1024 === 0) await work.pause("Encoding binary STL", f, report.triangles);
    a.fromArray(finalPositions, f * 9);
    b.fromArray(finalPositions, f * 9 + 3);
    c.fromArray(finalPositions, f * 9 + 6);
    b.sub(a).cross(c.sub(a)).normalize();
    for (let k = 0; k < 3; k++) view.setFloat32(84 + f * 50 + k * 4, b.getComponent(k), true);
    for (let k = 0; k < 9; k++)
      view.setFloat32(96 + f * 50 + k * 4, finalPositions[f * 9 + k], true);
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
