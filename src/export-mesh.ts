import { simplifyPlanarPatches } from "./planar-patches";
import type { VolumeTransform } from "./transform";
export type ExportQuality = "fast" | "standard" | "high";
export const EXPORT_PRESETS = Object.freeze({
  fast: { label: "Fast · existing triangles", maxTriangles: 1_000_000, bytesPerCorner: 112 },
  standard: { label: "Standard · welded and cleaned", maxTriangles: 600_000, bytesPerCorner: 288 },
  high: {
    label: "High · welded + planar optimisation",
    maxTriangles: 300_000,
    bytesPerCorner: 480,
  },
});
export const EXPORT_MEMORY_LIMIT = 256 * 1024 * 1024;
/** Temporary export workspace; editing and preview limits remain independent. */
export const EXPORT_MEMORY_BUDGETS_MIB = [256, 384, 512] as const;
export const EXPORT_MEMORY_MAX = 512 * 1024 * 1024;
export function exportMemoryBudget(mib: number): number {
  if (!EXPORT_MEMORY_BUDGETS_MIB.some((choice) => choice === mib))
    throw new Error("Choose an export memory budget of 256, 384 or 512 MiB.");
  return mib * 1024 * 1024;
}
export type ExportChunk = {
  positions: Float32Array;
  normals: Float32Array;
  colours?: Float32Array;
};
export type ExportSource = {
  name: string;
  layerId?: string;
  transform: VolumeTransform;
  step: number;
  chunks: ExportChunk[];
  current?: () => boolean;
};
export type ExportMesh = {
  name: string;
  layerId?: string;
  transform: VolumeTransform;
  positions: Float32Array;
  normals: Float32Array;
  colours?: Float32Array;
  indices?: Uint16Array | Uint32Array;
  stats: ExportMeshStats;
};
export type ExportMeshStats = {
  inputTriangles: number;
  triangles: number;
  vertices: number;
  removedDegenerate: number;
  removedDuplicate: number;
  flipped: number;
  planarRemoved: number;
  maxPlanarDeviation: number;
  /** Conservative source-coordinate deviation bound for whole-region reconstruction only. */
  planarPatchDeviationBound: number;
  boundaryEdges: number;
  nonManifoldEdges: number;
  inconsistentEdges: number;
};
export type ExportProgress = { stage: string; completed: number; total: number };
export class ExportWork {
  private deadline = performance.now() + 3;
  constructor(
    readonly signal: AbortSignal = new AbortController().signal,
    readonly current: () => boolean = () => true,
    readonly progress: (p: ExportProgress) => void = () => {},
  ) {}
  check(): void {
    if (this.signal.aborted) throw new Error("Export cancelled.");
    if (!this.current()) throw new Error("Export cancelled: source changed.");
  }
  async pause(stage: string, completed: number, total: number): Promise<void> {
    this.check();
    if (performance.now() >= this.deadline) {
      this.progress({ stage, completed, total });
      await new Promise<void>((r) => setTimeout(r, 0));
      this.deadline = performance.now() + 3;
      this.check();
    }
  }
}
export function exportAdmission(
  sources: readonly ExportSource[],
  quality: ExportQuality,
  maxBytes = EXPORT_MEMORY_LIMIT,
): { corners: number; estimatedBytes: number } {
  if (!Object.hasOwn(EXPORT_PRESETS, quality) || !Number.isFinite(maxBytes) || maxBytes <= 0)
    throw new Error("Invalid export quality or memory limit.");
  let corners = 0;
  for (const source of sources) {
    if (!(source.step > 0 && Number.isFinite(source.step)))
      throw new Error("Invalid export voxel spacing.");
    for (const c of source.chunks) {
      if (
        c.positions.length % 9 ||
        c.normals.length !== c.positions.length ||
        (c.colours &&
          (c.colours.length !== c.positions.length ||
            !c.colours.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)))
      )
        throw new Error("Invalid source triangle buffers.");
      corners += c.positions.length / 3;
    }
  }
  if (!corners) throw new Error("No surface to export.");
  const estimatedBytes = corners * EXPORT_PRESETS[quality].bytesPerCorner + sources.length * 4096;
  if (corners / 3 > EXPORT_PRESETS[quality].maxTriangles)
    throw new Error(
      `Too many triangles for ${quality} export (${corners / 3}; limit ${EXPORT_PRESETS[quality].maxTriangles}). Choose Fast or export fewer layers. Your model is unchanged.`,
    );
  if (estimatedBytes > maxBytes)
    throw new Error(
      `Not enough memory for ${quality} export. Needs about ${Math.ceil(estimatedBytes / 1048576)} MiB; ${Math.floor(maxBytes / 1048576)} MiB available. Increase export memory or choose Fast. Your model is unchanged.`,
    );
  return { corners, estimatedBytes };
}
const cross = (p: readonly number[] | Float32Array, a: number, b: number, c: number): number[] => {
  const ux = p[b * 3] - p[a * 3],
    uy = p[b * 3 + 1] - p[a * 3 + 1],
    uz = p[b * 3 + 2] - p[a * 3 + 2],
    vx = p[c * 3] - p[a * 3],
    vy = p[c * 3 + 1] - p[a * 3 + 1],
    vz = p[c * 3 + 2] - p[a * 3 + 2];
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
};
const edgeKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
/** Exact-position weld only. Never quantise nearby thin features or change source samples. */
export async function optimiseExportMesh(
  source: ExportSource,
  quality: ExportQuality,
  work = new ExportWork(),
  options: { preserveWinding?: boolean } = {},
): Promise<ExportMesh> {
  return optimiseMesh(source, quality, work, options);
}

// The chunk-only caller consumes geometry and planar deviation, never the local
// continuity counts. Public mesh reports always calculate their edge statistics.
async function optimiseMesh(
  source: ExportSource,
  quality: ExportQuality,
  work: ExportWork,
  options: { preserveWinding?: boolean; optimisedChunks?: boolean },
): Promise<ExportMesh> {
  const corners = source.chunks.reduce((n, c) => n + c.positions.length / 3, 0),
    stats: ExportMeshStats = {
      inputTriangles: corners / 3,
      triangles: 0,
      vertices: 0,
      removedDegenerate: 0,
      removedDuplicate: 0,
      flipped: 0,
      planarRemoved: 0,
      maxPlanarDeviation: 0,
      planarPatchDeviationBound: 0,
      boundaryEdges: 0,
      nonManifoldEdges: 0,
      inconsistentEdges: 0,
    };
  if (quality === "fast") {
    const positions = new Float32Array(corners * 3),
      normals = new Float32Array(corners * 3),
      colours = source.chunks.some((c) => c.colours)
        ? new Float32Array(corners * 3).fill(1)
        : undefined;
    let offset = 0;
    for (const c of source.chunks)
      for (let i = 0; i < c.positions.length; i += 16384) {
        await work.pause("Copying existing triangles", offset, corners * 3);
        const end = Math.min(c.positions.length, i + 16384);
        for (let k = i; k < end; k++)
          if (!Number.isFinite(c.positions[k]) || !Number.isFinite(c.normals[k]))
            throw new Error("Non-finite export attributes.");
        positions.set(c.positions.subarray(i, end), offset);
        normals.set(c.normals.subarray(i, end), offset);
        if (c.colours) colours!.set(c.colours.subarray(i, end), offset);
        offset += end - i;
      }
    stats.triangles = corners / 3;
    stats.vertices = corners;
    return {
      name: source.name,
      layerId: source.layerId,
      transform: source.transform,
      positions,
      normals,
      colours,
      stats,
    };
  }
  const painted = source.chunks.some((c) => c.colours),
    colours: number[] = [];
  const positions: number[] = [],
    normals: number[] = [],
    indices: number[] = [],
    weld = new Map<string, number>(),
    faces = new Set<string>();
  let cursor = 0;
  for (const chunk of source.chunks)
    for (let i = 0; i < chunk.positions.length; i += 9) {
      if (cursor % 1024 === 0) await work.pause("Welding / cleaning", cursor, corners / 3);
      cursor++;
      const ids: number[] = [];
      for (let k = 0; k < 3; k++) {
        const offset = i + k * 3,
          x = chunk.positions[offset],
          y = chunk.positions[offset + 1],
          z = chunk.positions[offset + 2],
          nx = chunk.normals[offset],
          ny = chunk.normals[offset + 1],
          nz = chunk.normals[offset + 2];
        if (![x, y, z, nx, ny, nz].every(Number.isFinite))
          throw new Error("Export source contains non-finite positions or normals.");
        const rgb = chunk.colours
          ? Array.from(chunk.colours.subarray(offset, offset + 3))
          : [1, 1, 1];
        if (!rgb.every((v) => Number.isFinite(v) && v >= 0 && v <= 1))
          throw new Error("Invalid export colour.");
        const key = `${x},${y},${z},${rgb.join(",")}`;
        let id = weld.get(key);
        if (id === undefined) {
          id = positions.length / 3;
          positions.push(x, y, z);
          normals.push(nx, ny, nz);
          colours.push(...rgb);
          weld.set(key, id);
        } else {
          normals[id * 3] += nx;
          normals[id * 3 + 1] += ny;
          normals[id * 3 + 2] += nz;
        }
        ids.push(id);
      }
      const [a, b, c] = ids,
        n = cross(positions, a, b, c),
        area = Math.hypot(...n);
      if (new Set(ids).size !== 3 || area <= source.step * source.step * 1e-12) {
        stats.removedDegenerate++;
        continue;
      }
      const key = [...ids].sort((a, b) => a - b).join(",");
      if (faces.has(key)) {
        stats.removedDuplicate++;
        continue;
      }
      faces.add(key);
      indices.push(...ids);
    }
  weld.clear();
  faces.clear();
  // A chunk is an open patch of a larger surface. Its gradient vote cannot choose
  // the sign of the whole surface: small seam patches can have opposing normals.
  // Boolean precompaction preserves the mesher's winding across chunk boundaries.
  let triangles = options.preserveWinding
    ? indices
    : await orientMesh(indices, positions, normals, stats, work);
  if (quality === "high" && !painted) {
    if (!options.preserveWinding) {
      const patches = await simplifyPlanarPatches(positions, normals, triangles, work, {
        step: source.step,
        transform: source.transform,
      });
      triangles = patches.triangles;
      stats.planarRemoved += patches.removed;
      stats.planarPatchDeviationBound = patches.maxDeviation;
    }
    for (let pass = 0; pass < 3; pass++) {
      const previousCount = triangles.length;
      triangles = await simplifyPlanar(positions, normals, triangles, source.step, stats, work);
      // Every accepted one-ring removes two faces. Equal counts mean identical
      // triangles and unchanged positions/normals: another pass cannot help.
      if (options.optimisedChunks && triangles.length === previousCount) break;
    }
  }
  // Compact unused vertices and normalise a single consistent normal per welded position.
  const remap = new Int32Array(positions.length / 3);
  remap.fill(-1);
  const outP: number[] = [],
    outN: number[] = [],
    outC: number[] = [],
    outI = new Uint32Array(triangles.length);
  for (let i = 0; i < triangles.length; i++) {
    if (i % 6144 === 0) await work.pause("Compacting mesh", i, triangles.length);
    const old = triangles[i];
    let id = remap[old];
    if (id < 0) {
      id = outP.length / 3;
      remap[old] = id;
      if (!options.optimisedChunks || painted)
        outC.push(colours[old * 3], colours[old * 3 + 1], colours[old * 3 + 2]);
      outP.push(positions[old * 3], positions[old * 3 + 1], positions[old * 3 + 2]);
      const length = Math.hypot(normals[old * 3], normals[old * 3 + 1], normals[old * 3 + 2]);
      if (length < 1e-12) throw new Error("Export source has an undefined surface normal.");
      outN.push(
        normals[old * 3] / length,
        normals[old * 3 + 1] / length,
        normals[old * 3 + 2] / length,
      );
    }
    outI[i] = id;
  }
  const edges = new Map<string, { count: number; direction: number }>();
  for (let i = 0; !options.optimisedChunks && i < outI.length; i += 3) {
    if (i % 6144 === 0) await work.pause("Checking continuity", i, outI.length);
    for (let k = 0; k < 3; k++) {
      const a = outI[i + k],
        b = outI[i + ((k + 1) % 3)],
        key = edgeKey(a, b),
        old = edges.get(key) ?? { count: 0, direction: 0 };
      old.count++;
      old.direction += a < b ? 1 : -1;
      edges.set(key, old);
    }
  }
  for (const e of edges.values()) {
    if (e.count === 1) stats.boundaryEdges++;
    else if (e.count !== 2) stats.nonManifoldEdges++;
    else if (e.direction !== 0) stats.inconsistentEdges++;
  }
  edges.clear();
  stats.triangles = outI.length / 3;
  stats.vertices = outP.length / 3;
  work.check();
  return {
    name: source.name,
    layerId: source.layerId,
    transform: source.transform,
    positions: new Float32Array(outP),
    normals: new Float32Array(outN),
    colours: painted ? new Float32Array(outC) : undefined,
    indices: quality === "high" && outP.length / 3 <= 65536 ? new Uint16Array(outI) : outI,
    stats,
  };
}
/** Orient whole connected components with shared-edge parity, then choose their
 * outward sign from the SDF normals. A noisy gradient at one tiny apex triangle
 * must never flip that triangle away from its correctly oriented neighbours. */
async function orientMesh(
  tri: number[],
  p: number[],
  normals: number[],
  stats: ExportMeshStats,
  work: ExportWork,
): Promise<number[]> {
  const faces = tri.length / 3,
    neighbors = new Int32Array(tri.length);
  neighbors.fill(-1);
  const parity = new Int8Array(tri.length),
    edges = new Map<string, { face: number; slot: number; sign: number; count: number }>();
  for (let f = 0; f < faces; f++) {
    if (f % 2048 === 0) await work.pause("Orienting connected surfaces", f, faces);
    for (let k = 0; k < 3; k++) {
      const a = tri[f * 3 + k],
        b = tri[f * 3 + ((k + 1) % 3)],
        key = edgeKey(a, b),
        sign = a < b ? 1 : -1,
        old = edges.get(key);
      if (!old) {
        edges.set(key, { face: f, slot: k, sign, count: 1 });
        continue;
      }
      old.count++;
      if (old.count === 2) {
        const relation = old.sign === sign ? -1 : 1;
        neighbors[f * 3 + k] = old.face;
        neighbors[old.face * 3 + old.slot] = f;
        parity[f * 3 + k] = relation;
        parity[old.face * 3 + old.slot] = relation;
      } else
        throw new Error(
          "Export surface has a non-manifold edge with more than two faces. Use Fast for the original geometry or repair the source.",
        );
    }
  }
  edges.clear();
  const orientation = new Int8Array(faces),
    queue = new Int32Array(faces);
  for (let seed = 0; seed < faces; seed++)
    if (!orientation[seed]) {
      let read = 0,
        write = 1,
        score = 0;
      queue[0] = seed;
      orientation[seed] = 1;
      while (read < write) {
        const f = queue[read++],
          sign = orientation[f],
          a = tri[f * 3],
          b = tri[f * 3 + 1],
          c = tri[f * 3 + 2],
          n = cross(p, a, b, c);
        score +=
          sign *
          n.reduce(
            (s, v, k) => s + v * (normals[a * 3 + k] + normals[b * 3 + k] + normals[c * 3 + k]),
            0,
          );
        if (read % 2048 === 0) await work.pause("Following surface winding", read, faces);
        for (let k = 0; k < 3; k++) {
          const next = neighbors[f * 3 + k];
          if (next < 0) continue;
          const required = sign * parity[f * 3 + k];
          if (orientation[next] && orientation[next] !== required)
            throw new Error(
              "Export surface cannot be oriented consistently; inspect non-manifold source geometry.",
            );
          if (!orientation[next]) {
            orientation[next] = required;
            queue[write++] = next;
          }
        }
      }
      for (let i = 0; i < write; i++) {
        const f = queue[i];
        if (orientation[f] * (score < 0 ? -1 : 1) < 0) {
          [tri[f * 3 + 1], tri[f * 3 + 2]] = [tri[f * 3 + 2], tri[f * 3 + 1]];
          stats.flipped++;
        }
        if (i % 2048 === 0) await work.pause("Applying consistent winding", i, write);
      }
    }
  return tri;
}
/** Remove only convex, closed, planar one-rings. Lock shared stars per pass, reject
 * existing diagonals and boundary/crease vertices. No vertex displacement, no QEM
 * collapse of small curved features, no triangle-target-driven quality loss. */
async function simplifyPlanar(
  p: number[],
  normals: number[],
  tri: number[],
  step: number,
  stats: ExportMeshStats,
  work: ExportWork,
): Promise<number[]> {
  const count = p.length / 3,
    adj: number[][] = Array.from({ length: count }, () => []),
    edges = new Map<string, number>();
  for (let i = 0; i < tri.length; i += 3) {
    if (i % 6144 === 0) await work.pause("Indexing planar regions", i, tri.length);
    for (let k = 0; k < 3; k++) {
      adj[tri[i + k]].push(i);
      const key = edgeKey(tri[i + k], tri[i + ((k + 1) % 3)]);
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  const blocked = new Uint8Array(count),
    removed = new Uint8Array(tri.length / 3),
    added: number[] = [],
    epsilon = step * 1e-6;
  for (let v = 0; v < count; v++) {
    if (v % 128 === 0) await work.pause("Optimising planar regions", v, count);
    const star = adj[v];
    if (blocked[v] || star.length < 3 || star.length > 64) continue;
    const next = new Map<number, number>();
    let valid = true;
    for (const i of star) {
      const k = tri.slice(i, i + 3).indexOf(v),
        a = tri[i + ((k + 1) % 3)],
        b = tri[i + ((k + 2) % 3)];
      if (next.has(a) || blocked[a] || blocked[b] || edges.get(edgeKey(v, a)) !== 2) {
        valid = false;
        break;
      }
      next.set(a, b);
    }
    if (!valid || next.size !== star.length) continue;
    const ring = [next.keys().next().value!];
    while (ring.length < star.length) {
      const n = next.get(ring.at(-1)!);
      if (n === undefined || ring.includes(n)) {
        valid = false;
        break;
      }
      ring.push(n);
    }
    if (!valid || next.get(ring.at(-1)!) !== ring[0]) continue;
    let base = cross(p, ring[0], ring[1], ring[2]),
      length = Math.hypot(...base);
    for (let j = 2; length <= step * step * 1e-12 && j < ring.length - 1; j++) {
      base = cross(p, ring[0], ring[j], ring[j + 1]);
      length = Math.hypot(...base);
    }
    if (length <= step * step * 1e-12) continue;
    const n = base.map((x) => x / length);
    let maxDeviation = 0;
    for (const id of [v, ...ring]) {
      const distance = Math.abs(
        n.reduce((s, x, k) => s + x * (p[id * 3 + k] - p[ring[0] * 3 + k]), 0),
      );
      maxDeviation = Math.max(maxDeviation, distance);
      if (distance > epsilon) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;
    for (const id of [v, ...ring]) {
      const length = Math.hypot(normals[id * 3], normals[id * 3 + 1], normals[id * 3 + 2]);
      if (
        length === 0 ||
        n.reduce((s, x, k) => s + (x * normals[id * 3 + k]) / length, 0) < 0.99999
      )
        valid = false;
    }
    if (!valid) continue;
    // Convex ring and center inside it guarantee that replacing the fan preserves
    // its geometric footprint. Creases and concave/folded neighborhoods are kept.
    for (let j = 0; j < ring.length; j++) {
      const a = ring[j],
        b = ring[(j + 1) % ring.length],
        c = ring[(j + 2) % ring.length],
        turn = cross(p, a, b, c),
        inside = cross(p, a, b, v);
      if (
        turn.reduce((s, x, k) => s + x * n[k], 0) < -step * step * 1e-12 ||
        inside.reduce((s, x, k) => s + x * n[k], 0) < -step * step * 1e-12
      ) {
        valid = false;
        break;
      }
    }
    if (!valid) continue;
    const boundary = new Set(ring.map((id, i) => edgeKey(id, ring[(i + 1) % ring.length]))),
      polygon = [...ring],
      replacement: number[] = [];
    const area = (a: number, b: number, c: number) =>
      cross(p, a, b, c).reduce((sum, value, k) => sum + value * n[k], 0);
    while (polygon.length > 3 && valid) {
      let clipped = false;
      for (let j = 0; j < polygon.length; j++) {
        const a = polygon[(j + polygon.length - 1) % polygon.length],
          b = polygon[j],
          c = polygon[(j + 1) % polygon.length],
          diagonal = edgeKey(a, c);
        if (area(a, b, c) <= step * step * 1e-6 || (edges.has(diagonal) && !boundary.has(diagonal)))
          continue;
        // Keep every boundary vertex, including collinear points on a proposed diagonal.
        if (
          polygon.some(
            (id) =>
              id !== a &&
              id !== b &&
              id !== c &&
              area(a, b, id) >= -step * step * 1e-12 &&
              area(b, c, id) >= -step * step * 1e-12 &&
              area(c, a, id) >= -step * step * 1e-12,
          )
        )
          continue;
        replacement.push(a, b, c);
        polygon.splice(j, 1);
        clipped = true;
        break;
      }
      if (!clipped) valid = false;
    }
    if (valid && area(polygon[0], polygon[1], polygon[2]) > step * step * 1e-6)
      replacement.push(...polygon);
    else valid = false;
    // Preserve the original orientation and reject pathological normal fields.
    const original = cross(p, tri[star[0]], tri[star[0] + 1], tri[star[0] + 2]);
    if (original.reduce((s, x, k) => s + x * n[k], 0) <= 0) valid = false;
    if (!valid) continue;
    for (const i of star) removed[i / 3] = 1;
    for (const id of [v, ...ring]) blocked[id] = 1;
    added.push(...replacement);
    stats.planarRemoved += 2;
    stats.maxPlanarDeviation = Math.max(stats.maxPlanarDeviation, maxDeviation);
  }
  const result: number[] = [];
  for (let i = 0; i < tri.length; i += 3) {
    if (i % 6144 === 0) await work.pause("Publishing planar mesh", i, tri.length);
    if (!removed[i / 3]) result.push(tri[i], tri[i + 1], tri[i + 2]);
  }
  for (let i = 0; i < added.length; i += 3) result.push(added[i], added[i + 1], added[i + 2]);
  return result;
}

/** Bound planar cleanup to one chunk at a time before whole-model STL admission.
 * Closed planar one-rings only: curved features and all chunk boundaries stay fixed. */
export async function compactPlanarSources(
  sources: readonly ExportSource[],
  maxBytes: number,
  work = new ExportWork(),
  optimisedChunks = true,
): Promise<{ sources: ExportSource[]; removedTriangles: number; maxPlanarDeviation: number }> {
  const output: ExportSource[] = [];
  let bytes = 0,
    removedTriangles = 0,
    maxPlanarDeviation = 0;
  for (const source of sources) {
    const chunks: ExportChunk[] = [];
    for (const original of source.chunks) {
      if (!original.positions.length) continue;
      let chunk: ExportChunk = { positions: original.positions, normals: original.normals };
      for (let pass = 0; pass < 12; pass++) {
        work.check();
        exportAdmission([{ ...source, chunks: [chunk] }], "high", maxBytes - bytes);
        const mesh = await optimiseMesh({ ...source, chunks: [chunk] }, "high", work, {
            preserveWinding: true,
            optimisedChunks,
          }),
          count = mesh.indices?.length ?? mesh.positions.length / 3,
          positions = new Float32Array(count * 3),
          normals = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          if (i % 2048 === 0) await work.pause("Preparing compact Boolean surface", i, count);
          const index = (mesh.indices?.[i] ?? i) * 3;
          if (optimisedChunks) {
            for (let axis = 0; axis < 3; axis++) {
              positions[i * 3 + axis] = mesh.positions[index + axis];
              normals[i * 3 + axis] = mesh.normals[index + axis];
            }
            continue;
          }
          positions.set(mesh.positions.subarray(index, index + 3), i * 3);
          normals.set(mesh.normals.subarray(index, index + 3), i * 3);
        }
        maxPlanarDeviation = Math.max(maxPlanarDeviation, mesh.stats.maxPlanarDeviation);
        let stable = true;
        for (let i = 0; i < positions.length; i += 9)
          if (
            Math.hypot(...cross(positions, i / 3, i / 3 + 1, i / 3 + 2)) <=
            source.step * source.step * 1e-6
          ) {
            stable = false;
            break;
          }
        // A new sliver could collapse after physical-unit Float32 conversion. Keep the last stable chunk.
        if (!stable) break;
        const unchanged = positions.length >= chunk.positions.length;
        chunk = { positions, normals };
        if (unchanged) break;
      }
      removedTriangles += (original.positions.length - chunk.positions.length) / 9;
      bytes += chunk.positions.byteLength + chunk.normals.byteLength;
      if (bytes > maxBytes)
        throw new Error("Compact Boolean export exceeds the memory budget. Export fewer parts.");
      chunks.push(chunk);
    }
    output.push({ ...source, chunks });
  }
  return { sources: output, removedTriangles, maxPlanarDeviation };
}
