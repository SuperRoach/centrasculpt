import { ShapeUtils, Vector2 } from "three";
import type { ExportWork } from "./export-mesh";
import { transformMatrix, type VolumeTransform } from "./transform";

const edgeKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`);
type Edge = { a: number; b: number; face: number; other: number; count: number };
/** Retriangulate fixed-plane regions without moving vertices or seam boundaries.
 * Oblique candidates allow at most bounded Float32 round-off, never chained plane drift.
 * Unsupported/ambiguous regions and painted sources keep their original path. */
export async function simplifyPlanarPatches(
  p: readonly number[],
  normals: readonly number[],
  tri: readonly number[],
  work: ExportWork,
  options: { step?: number; transform?: VolumeTransform } = {},
): Promise<{ triangles: number[]; removed: number; maxDeviation: number }> {
  const count = tri.length / 3,
    parent = Int32Array.from({ length: count }, (_, i) => i),
    planes = new Int32Array(count).fill(-1),
    definitions: { axis: number; sign: number; exact: boolean }[] = [],
    weights = new Float64Array(count),
    planeIds = new Map<string, number>(),
    edges = new Map<string, Edge>();
  const root = (id: number): number => {
    while (parent[id] !== id) {
      parent[id] = parent[parent[id]];
      id = parent[id];
    }
    return id;
  };
  let maxCoordinate = 0;
  for (let i = 0; i < p.length; i++) {
    if (i % 8192 === 0) await work.pause("Measuring plane round-off", i, p.length);
    maxCoordinate = Math.max(maxCoordinate, Math.abs(p[i]));
  }
  const ulp = maxCoordinate > 0 ? 2 ** (Math.floor(Math.log2(maxCoordinate)) - 23) : 2 ** -149,
    tolerance = Math.min((options.step ?? 0) * 1e-4, 2 * ulp),
    matrix = options.transform ? transformMatrix(options.transform).elements : undefined;
  const normal = (a: number, b: number, c: number) => {
    const ux = p[b * 3] - p[a * 3],
      uy = p[b * 3 + 1] - p[a * 3 + 1],
      uz = p[b * 3 + 2] - p[a * 3 + 2],
      vx = p[c * 3] - p[a * 3],
      vy = p[c * 3 + 1] - p[a * 3 + 1],
      vz = p[c * 3 + 2] - p[a * 3 + 2];
    return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  };
  const world = (id: number, axis: number) =>
    matrix
      ? matrix[axis] * p[id * 3] +
        matrix[axis + 4] * p[id * 3 + 1] +
        matrix[axis + 8] * p[id * 3 + 2] +
        matrix[axis + 12]
      : p[id * 3 + axis];
  for (let f = 0; f < count; f++) {
    if (f % 1024 === 0) await work.pause("Finding planar regions", f, count);
    const ids = [tri[f * 3], tri[f * 3 + 1], tri[f * 3 + 2]],
      n = normal(ids[0], ids[1], ids[2]),
      length = Math.hypot(...n);
    weights[f] = length;
    if (length > 0) {
      for (let axis = 0; axis < 3; axis++) n[axis] /= length;
      const average = [0, 0, 0];
      const compatible = ids.every((id) => {
        const length = Math.hypot(normals[id * 3], normals[id * 3 + 1], normals[id * 3 + 2]);
        if (
          !length ||
          n.reduce((sum, value, axis) => sum + (value * normals[id * 3 + axis]) / length, 0) <
            0.99999
        )
          return false;
        for (let axis = 0; axis < 3; axis++) average[axis] += normals[id * 3 + axis] / length;
        return true;
      });
      if (compatible) {
        const axis = n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))),
          sign = Math.sign(n[axis]),
          exact = ids.every((id) => p[id * 3 + axis] === p[ids[0] * 3 + axis]);
        const averageLength = Math.hypot(...average);
        // This bucket only finds candidates; a single fixed geometric plane validates the entire component below.
        const key = exact
          ? `${axis}:${sign}:${p[ids[0] * 3 + axis]}`
          : `oblique:${average.map((value) => Math.round((value / averageLength) * 1000)).join(",")}`;
        let id = planeIds.get(key);
        if (id === undefined) {
          id = definitions.length;
          planeIds.set(key, id);
          definitions.push({ axis, sign, exact });
        }
        planes[f] = id;
      }
    }
    for (let k = 0; k < 3; k++) {
      const a = tri[f * 3 + k],
        b = tri[f * 3 + ((k + 1) % 3)],
        key = edgeKey(a, b),
        old = edges.get(key);
      if (old) {
        old.count++;
        old.other = f;
      } else edges.set(key, { a, b, face: f, other: -1, count: 1 });
    }
  }
  if (!definitions.length) {
    edges.clear();
    return { triangles: Array.from(tri), removed: 0, maxDeviation: 0 };
  }
  let visited = 0;
  for (const edge of edges.values()) {
    if (++visited % 2048 === 0) await work.pause("Connecting planar regions", visited, edges.size);
    if (edge.count === 2 && planes[edge.face] >= 0 && planes[edge.face] === planes[edge.other]) {
      // Only consistently oriented shared edges join a patch.
      const other = edge.other * 3;
      if ([0, 1, 2].some((k) => tri[other + k] === edge.b && tri[other + ((k + 1) % 3)] === edge.a))
        parent[root(edge.other)] = root(edge.face);
    }
  }
  const heads = new Int32Array(count).fill(-1),
    next = new Int32Array(count).fill(-1),
    sizes = new Uint32Array(count),
    references = new Int32Array(count).fill(-1);
  for (let f = 0; f < count; f++) {
    if (f % 2048 === 0) await work.pause("Indexing planar patches", f, count);
    if (planes[f] < 0) continue;
    const r = root(f);
    next[f] = heads[r];
    heads[r] = f;
    sizes[r]++;
    if (references[r] < 0 || weights[f] > weights[references[r]]) references[r] = f;
  }
  const removed = new Uint8Array(count),
    added: number[] = [];
  let reduction = 0,
    maxDeviation = 0;
  for (let r = 0; r < count; r++) {
    if (r % 512 === 0) await work.pause("Retriangulating planar patches", r, count);
    if (sizes[r] < 8) continue;
    const exact = definitions[planes[r]].exact,
      reference = references[r] * 3,
      anchor = tri[reference],
      fixed = [0, 0, 0],
      origin = [0, 0, 0];
    let fittingFaces = 0;
    // Accumulate the entire connected region once. Small/sliver triangles never select
    // a noisy normal, and no neighbour-to-neighbour fit can drift along a curved surface.
    for (let f = heads[r]; f >= 0; f = next[f]) {
      if (++fittingFaces % 1024 === 0)
        await work.pause("Validating a fixed plane", fittingFaces, sizes[r]);
      const n = normal(tri[f * 3], tri[f * 3 + 1], tri[f * 3 + 2]);
      for (let axis = 0; axis < 3; axis++) {
        fixed[axis] += n[axis];
        for (let k = 0; k < 3; k++)
          origin[axis] += p[tri[f * 3 + k] * 3 + axis] - p[anchor * 3 + axis];
      }
    }
    const length = Math.hypot(...fixed);
    if (!(length > 0)) continue;
    for (let axis = 0; axis < 3; axis++) {
      fixed[axis] /= length;
      origin[axis] /= sizes[r] * 3;
    }
    const axis = fixed.map(Math.abs).indexOf(Math.max(...fixed.map(Math.abs))),
      sign = Math.sign(fixed[axis]),
      u = (axis + 1) % 3,
      v = (axis + 2) % 3;
    const distance = (id: number) =>
      Math.abs(
        fixed.reduce(
          (sum, value, axis) =>
            sum + value * (p[id * 3 + axis] - p[anchor * 3 + axis] - origin[axis]),
          0,
        ),
      );
    const point = (id: number) =>
      new Vector2(p[id * 3 + u] - p[anchor * 3 + u], (p[id * 3 + v] - p[anchor * 3 + v]) * sign);
    const area = (a: number, b: number, c: number) =>
      ((p[b * 3 + u] - p[a * 3 + u]) * (p[c * 3 + v] - p[a * 3 + v]) -
        (p[b * 3 + v] - p[a * 3 + v]) * (p[c * 3 + u] - p[a * 3 + u])) *
      sign;
    const boundary = new Map<number, number>(),
      incoming = new Set<number>();
    let valid = true,
      originalArea = 0,
      visits = 0,
      patchDeviation = 0;
    const originalMin = [Infinity, Infinity, Infinity, Infinity, Infinity, Infinity],
      originalMax = originalMin.map(() => -Infinity);
    const bounds = (id: number, min: number[], max: number[]) => {
      for (let axis = 0; axis < 3; axis++) {
        const local = p[id * 3 + axis],
          transformed = world(id, axis);
        min[axis] = Math.min(min[axis], local);
        max[axis] = Math.max(max[axis], local);
        min[axis + 3] = Math.min(min[axis + 3], transformed);
        max[axis + 3] = Math.max(max[axis + 3], transformed);
      }
    };
    for (let f = heads[r]; f >= 0; f = next[f]) {
      if (++visits % 1024 === 0) await work.pause("Tracing planar boundaries", visits, sizes[r]);
      const projectedArea = area(tri[f * 3], tri[f * 3 + 1], tri[f * 3 + 2]);
      if (!(projectedArea > 0)) {
        valid = false;
        break;
      }
      originalArea += projectedArea;
      for (let k = 0; k < 3; k++) {
        const id = tri[f * 3 + k],
          deviation = distance(id);
        patchDeviation = Math.max(patchDeviation, deviation);
        if (!exact && deviation > tolerance) {
          valid = false;
          break;
        }
        bounds(id, originalMin, originalMax);
      }
      if (!valid) break;
      for (let k = 0; k < 3; k++) {
        const a = tri[f * 3 + k],
          b = tri[f * 3 + ((k + 1) % 3)],
          edge = edges.get(edgeKey(a, b));
        if (!edge || edge.count > 2) {
          valid = false;
          break;
        }
        if (edge.count === 2 && root(edge.face) === r && root(edge.other) === r) continue;
        if (boundary.has(a) || incoming.has(b)) {
          valid = false;
          break;
        }
        boundary.set(a, b);
        incoming.add(b);
      }
      if (!valid || boundary.size > 8192) {
        valid = false;
        break;
      }
    }
    if (!valid || boundary.size < 3 || !(originalArea > 0)) continue;
    const remaining = new Set(boundary.keys()),
      loops: number[][] = [];
    while (remaining.size && valid) {
      const start = remaining.values().next().value,
        loop: number[] = [];
      if (start === undefined) {
        valid = false;
        break;
      }
      let id = start;
      do {
        if (!remaining.delete(id)) {
          valid = false;
          break;
        }
        loop.push(id);
        const n = boundary.get(id);
        if (n === undefined) {
          valid = false;
          break;
        }
        id = n;
      } while (id !== start);
      if (loop.length < 3) valid = false;
      loops.push(loop);
      if (loops.length > 64) valid = false;
    }
    if (!valid) continue;
    const compressed: number[][] = [],
      chains: number[][] = [];
    for (const loop of loops) {
      const corners: number[] = [];
      for (let j = 0; j < loop.length; j++) {
        const a = loop[(j + loop.length - 1) % loop.length],
          b = loop[j],
          c = loop[(j + 1) % loop.length];
        if (
          area(a, b, c) !== 0 ||
          (p[b * 3 + u] - p[a * 3 + u]) * (p[c * 3 + u] - p[b * 3 + u]) +
            (p[b * 3 + v] - p[a * 3 + v]) * (p[c * 3 + v] - p[b * 3 + v]) <=
            0
        )
          corners.push(j);
      }
      if (corners.length < 3) {
        valid = false;
        break;
      }
      compressed.push(corners.map((j) => loop[j]));
      for (let j = 0; j < corners.length; j++) {
        const chain = [loop[corners[j]]];
        let k = (corners[j] + 1) % loop.length;
        while (k !== corners[(j + 1) % corners.length]) {
          chain.push(loop[k]);
          k = (k + 1) % loop.length;
        }
        chain.push(loop[k]);
        chains.push(chain);
      }
    }
    if (!valid || compressed.reduce((n, loop) => n + loop.length, 0) > (exact ? 512 : 2048))
      continue;
    const signedArea = (loop: number[]) =>
      loop.reduce((sum, a, j) => {
        const b = loop[(j + 1) % loop.length];
        return (
          sum +
          (p[a * 3 + u] - p[anchor * 3 + u]) * (p[b * 3 + v] - p[anchor * 3 + v]) * sign -
          (p[b * 3 + u] - p[anchor * 3 + u]) * (p[a * 3 + v] - p[anchor * 3 + v]) * sign
        );
      }, 0);
    const outers = compressed.filter((loop) => signedArea(loop) > 0);
    if (outers.length !== 1 || compressed.some((loop) => signedArea(loop) === 0)) continue;
    const outer = outers[0],
      holes = compressed.filter((loop) => loop !== outer),
      ordered = [outer, ...holes],
      ids = ordered.flat();
    // Bound and reject all touching/crossing non-adjacent boundary segments.
    const segments = ordered.flatMap((loop) =>
      loop.map((a, j) => [a, loop[(j + 1) % loop.length]]),
    );
    for (let i = 0; i < segments.length && valid; i++) {
      if (i % 16 === 0) await work.pause("Checking planar boundary loops", i, segments.length);
      const [a, b] = segments[i];
      for (let j = i + 1; j < segments.length; j++) {
        const [c, d] = segments[j];
        if (a === c || a === d || b === c || b === d) continue;
        if (
          Math.max(p[a * 3 + u], p[b * 3 + u]) < Math.min(p[c * 3 + u], p[d * 3 + u]) ||
          Math.max(p[c * 3 + u], p[d * 3 + u]) < Math.min(p[a * 3 + u], p[b * 3 + u]) ||
          Math.max(p[a * 3 + v], p[b * 3 + v]) < Math.min(p[c * 3 + v], p[d * 3 + v]) ||
          Math.max(p[c * 3 + v], p[d * 3 + v]) < Math.min(p[a * 3 + v], p[b * 3 + v])
        )
          continue;
        if (area(a, b, c) * area(a, b, d) <= 0 && area(c, d, a) * area(c, d, b) <= 0) {
          valid = false;
          break;
        }
      }
    }
    if (!valid) continue;
    work.check();
    const tessellation = ShapeUtils.triangulateShape(
        outer.map(point),
        holes.map((loop) => loop.map(point)),
      ),
      candidate: (number[] | null)[] = [],
      lookup = new Map<string, number>();
    const add = (face: number[]) => {
      const index = candidate.length;
      candidate.push(face);
      for (let k = 0; k < 3; k++) lookup.set(edgeKey(face[k], face[(k + 1) % 3]), index);
    };
    for (const face of tessellation) {
      const t = face.map((i) => ids[i]);
      if (area(...(t as [number, number, number])) < 0) [t[1], t[2]] = [t[2], t[1]];
      if (area(...(t as [number, number, number])) === 0) {
        valid = false;
        break;
      }
      add(t);
    }
    if (!valid || !candidate.length) continue;
    for (let j = 0; j < chains.length && valid; j++) {
      if (j % 64 === 0) await work.pause("Restoring exact seam vertices", j, chains.length);
      const chain = chains[j],
        a = chain[0],
        b = chain[chain.length - 1],
        index = lookup.get(edgeKey(a, b)),
        face = index === undefined ? null : candidate[index];
      if (!face || index === undefined) {
        valid = false;
        break;
      }
      const k = face.findIndex((id, k) => id === a && face[(k + 1) % 3] === b);
      if (k < 0) {
        valid = false;
        break;
      }
      if (chain.length === 2) continue;
      for (let k = 0; k < 3; k++) {
        const key = edgeKey(face[k], face[(k + 1) % 3]);
        if (lookup.get(key) === index) lookup.delete(key);
      }
      candidate[index] = null;
      const c = face[(k + 2) % 3];
      for (let k = 0; k < chain.length - 1; k++) add([chain[k], chain[k + 1], c]);
    }
    if (!valid) continue;
    const final = candidate.filter((t): t is number[] => t !== null),
      counts = new Map<string, { a: number; b: number; count: number; direction: number }>();
    if (final.length >= sizes[r]) continue;
    let replacementArea = 0;
    const replacementMin = originalMin.map(() => Infinity),
      replacementMax = originalMin.map(() => -Infinity);
    for (let i = 0; i < final.length && valid; i++) {
      if (i % 1024 === 0) await work.pause("Validating planar replacement", i, final.length);
      const face = final[i],
        a = area(...(face as [number, number, number]));
      if (!(a > 0)) {
        valid = false;
        break;
      }
      replacementArea += a;
      for (const id of face) bounds(id, replacementMin, replacementMax);
      for (let k = 0; k < 3; k++) {
        const a = face[k],
          b = face[(k + 1) % 3],
          key = edgeKey(a, b),
          old = counts.get(key) ?? { a, b, count: 0, direction: 0 };
        old.count++;
        old.direction += a < b ? 1 : -1;
        counts.set(key, old);
        const existing = edges.get(key);
        if (
          existing &&
          root(existing.face) !== r &&
          (existing.other < 0 || root(existing.other) !== r)
        )
          valid = false;
      }
    }
    if (
      !valid ||
      Math.abs(replacementArea - originalArea) > originalArea * 1e-10 ||
      originalMin.some((value, axis) => value !== replacementMin[axis]) ||
      originalMax.some((value, axis) => value !== replacementMax[axis])
    )
      continue;
    for (const edge of counts.values()) {
      if (boundary.get(edge.a) === edge.b || boundary.get(edge.b) === edge.a) {
        if (edge.count !== 1 || boundary.get(edge.a) !== edge.b) {
          valid = false;
          break;
        }
      } else if (edge.count !== 2 || edge.direction !== 0) {
        valid = false;
        break;
      }
    }
    if (!valid || [...boundary].some(([a, b]) => counts.get(edgeKey(a, b))?.count !== 1)) continue;
    for (let f = heads[r]; f >= 0; f = next[f]) removed[f] = 1;
    reduction += sizes[r] - final.length;
    // Both surfaces are graphs over the same projected footprint. Their height difference
    // is bounded by twice the largest plane residual divided by the dominant normal.
    maxDeviation = Math.max(maxDeviation, (2 * patchDeviation) / Math.abs(fixed[axis]));
    for (const face of final) added.push(...face);
  }
  edges.clear();
  const output: number[] = [];
  for (let f = 0; f < count; f++) {
    if (f % 2048 === 0) await work.pause("Publishing planar patches", f, count);
    if (!removed[f]) output.push(tri[f * 3], tri[f * 3 + 1], tri[f * 3 + 2]);
  }
  for (let i = 0; i < added.length; i += 3) output.push(added[i], added[i + 1], added[i + 2]);
  return { triangles: output, removed: reduction, maxDeviation };
}
