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
  /** Whole planar-region reconstruction phase only; excludes SDF sampling/local cleanup. */
  planarPatchDeviationMM?: number;
  effectiveResolutionMM?: number;
};
/** Resolve exact collinear bridge faces after Float32 unit conversion.
 * Split the unique neighboring long edge at its existing middle vertex; never move or weld nearby points. */
export async function stabilisePrintCoordinates(
  input: Float32Array,
  work = new ExportWork(),
  maxWorkspaceBytes = 32 * 1024 ** 2,
) {
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
    let candidateCount = 0;
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
      if (++candidateCount * 1024 > maxWorkspaceBytes)
        throw new Error("STL precision stabilisation exceeds its bounded workspace. Source kept.");
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
/** Includes coordinate/copy/packing buffers and bounded typed topology workspace.
 * Quality-specific admission still applies independently. */
export const STL_VALIDATION_BYTES_PER_CORNER = 128;
export const STL_VALIDATION_MAX_TRIANGLES = 600_000;
async function sortedPrintIndices(
  order: Uint32Array<ArrayBuffer>,
  compare: (a: number, b: number) => number,
  work: ExportWork,
  stage: string,
) {
  let source = order,
    target = new Uint32Array(order.length),
    processed = 0;
  const passes = Math.ceil(Math.log2(Math.max(1, order.length)));
  for (let width = 1; width < order.length; width *= 2) {
    for (let start = 0; start < order.length; start += 2 * width) {
      const middle = Math.min(start + width, order.length),
        end = Math.min(start + 2 * width, order.length);
      let left = start,
        right = middle;
      for (let at = start; at < end; at++) {
        target[at] =
          left < middle && (right >= end || compare(source[left], source[right]) <= 0)
            ? source[left++]
            : source[right++];
        if (++processed % 8192 === 0) await work.pause(stage, processed, order.length * passes);
      }
    }
    [source, target] = [target, source];
  }
  return source;
}
/** Exact coordinate welding on the final Float32 STL coordinates. No hidden repair. */
export async function validatePrintMesh(
  p: Float32Array,
  work = new ExportWork(),
): Promise<PrintReport> {
  if (!p.length || p.length % 9) throw new Error("Invalid print triangle buffer.");
  if (p.length / 9 > STL_VALIDATION_MAX_TRIANGLES)
    throw new Error("Print validation limit is 600,000 triangles. Export selected parts.");
  const n = p.length / 9,
    corners = n * 3,
    parent = Int32Array.from({ length: n }, (_, i) => i),
    volume = new Float64Array(n),
    ids = new Uint32Array(corners),
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
    for (let k = 0; k < 9; k++) {
      const value = p[f * 9 + k],
        axis = k % 3;
      if (!Number.isFinite(value)) throw new Error("Nonfinite print geometry.");
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
    const a = new Vector3().fromArray(p, f * 9),
      b = new Vector3().fromArray(p, f * 9 + 3),
      c = new Vector3().fromArray(p, f * 9 + 6);
    if (b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() === 0) degenerate++;
    volume[f] = a.dot(b.clone().cross(c)) / 6;
  }
  let order = Uint32Array.from({ length: corners }, (_, i) => i);
  const compareVertices = (a: number, b: number) =>
    p[a * 3] - p[b * 3] || p[a * 3 + 1] - p[b * 3 + 1] || p[a * 3 + 2] - p[b * 3 + 2];
  order = await sortedPrintIndices(order, compareVertices, work, "Indexing exact STL vertices");
  let vertex = 0;
  for (let i = 0; i < corners; i++) {
    if (i % 8192 === 0) await work.pause("Welding exact STL coordinates", i, corners);
    if (i && compareVertices(order[i - 1], order[i]) !== 0) vertex++;
    ids[order[i]] = vertex;
  }
  // Each corner index also identifies the outgoing edge of its original triangle.
  const next = (edge: number) => edge - (edge % 3) + ((edge + 1) % 3);
  const lower = (edge: number) => Math.min(ids[edge], ids[next(edge)]);
  const upper = (edge: number) => Math.max(ids[edge], ids[next(edge)]);
  order = await sortedPrintIndices(
    order,
    (a, b) => lower(a) - lower(b) || upper(a) - upper(b),
    work,
    "Indexing STL continuity",
  );
  let boundaryEdges = 0,
    nonManifoldEdges = 0,
    inconsistentEdges = 0;
  for (let start = 0; start < corners; ) {
    let end = start,
      direction = 0;
    const first = order[start],
      a = lower(first),
      b = upper(first),
      face = Math.floor(first / 3);
    while (end < corners && lower(order[end]) === a && upper(order[end]) === b) {
      const edge = order[end++];
      direction += ids[edge] < ids[next(edge)] ? 1 : -1;
      parent[root(Math.floor(edge / 3))] = root(face);
      if (end % 8192 === 0) await work.pause("Checking STL continuity", end, corners);
    }
    const count = end - start;
    if (count === 1) boundaryEdges++;
    else if (count !== 2) nonManifoldEdges++;
    else if (direction !== 0) inconsistentEdges++;
    start = end;
  }
  const sums = new Float64Array(n),
    seen = new Uint8Array(n);
  let components = 0,
    invertedComponents = 0;
  for (let f = 0; f < n; f++) {
    if (f % 2048 === 0) await work.pause("Checking connected solids", f, n);
    const r = root(f);
    if (!seen[r]) {
      seen[r] = 1;
      components++;
    }
    sums[r] += volume[f];
  }
  for (let i = 0; i < n; i++) if (seen[i] && sums[i] < 0) invertedComponents++;
  const dimensions = max.map((v, i) => v - min[i]),
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
  if (components > 1)
    warnings.push(
      `${components} disconnected surfaces; nested shells and separate parts need slicer inspection.`,
    );
  return {
    units: "mm",
    dimensions,
    triangles: n,
    boundaryEdges,
    nonManifoldEdges,
    inconsistentEdges,
    degenerateTriangles: degenerate,
    components,
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
  if (
    admission.corners / 3 > STL_VALIDATION_MAX_TRIANGLES ||
    admission.corners * STL_VALIDATION_BYTES_PER_CORNER > maxBytes
  )
    throw new Error(
      "STL topology validation exceeds memory/triangle safety limits. Export selected parts.",
    );
  const chunks: Float32Array[] = [],
    stats: GlbExportResult["stats"] = [],
    min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  let count = 0,
    patchDeviation = 0;
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
    patchDeviation = Math.max(
      patchDeviation,
      mesh.stats.planarPatchDeviationBound * Math.max(...mesh.transform.scale),
    );
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
  const stable = await stabilisePrintCoordinates(
    p,
    work,
    Math.max(0, maxBytes - admission.corners * 96),
  );
  const finalPositions = stable.positions;
  const report = await validatePrintMesh(finalPositions, work),
    data = new ArrayBuffer(84 + report.triangles * 50),
    bytes = new Uint8Array(data),
    view = new DataView(data);
  bytes.set(new TextEncoder().encode("Centra Sculpt | units=mm | inspect companion print report"));
  view.setUint32(80, report.triangles, true);
  if (stable.repaired) report.precisionRetriangulations = stable.repaired;
  if (patchDeviation > 0) report.planarPatchDeviationMM = patchDeviation * factor;
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
    estimatedBytes: Math.max(
      admission.estimatedBytes,
      admission.corners * STL_VALIDATION_BYTES_PER_CORNER,
    ),
    geometryBytes: p.byteLength,
    backend: "cooperative",
  };
}
