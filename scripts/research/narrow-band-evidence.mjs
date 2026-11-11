import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { extractMesh } from "../../work/test-build/mesh.mjs";
import { BrickVolume } from "./brick-volume.mjs";

export const hash = (a) =>
  createHash("sha256")
    .update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength))
    .digest("hex");
export const timed = (run) => {
  const start = performance.now();
  const value = run();
  return { ms: performance.now() - start, value };
};
export const memory = () => ({
  ...process.memoryUsage(),
  maxRSSKiB: process.resourceUsage().maxRSS,
});
export const randomGenerator = (seed) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

export function meshAdapter(read, lo, hi, step, origin) {
  const shape = hi.map((v, i) => v - lo[i] + 1);
  const [nx, ny] = shape;
  const coordinate = (i, a = 0) => origin + (i + lo[a]) * step;
  const full = {
    step,
    shape,
    dimensions: shape,
    minimum: lo,
    extent: -origin,
    getDenseView: () => undefined,
    coordinate,
    index: (x, y, z) => x + nx * (y + ny * z),
    readVoxel: (id) =>
      read(
        (id % nx) + lo[0],
        (Math.floor(id / nx) % ny) + lo[1],
        Math.floor(id / (nx * ny)) + lo[2],
      ),
    normalAt: BrickVolume.prototype.normalAt,
  };
  return full;
}

export function chunkMesh(read, lo, hi, fullLo, fullHi) {
  const full = meshAdapter(read, fullLo, fullHi, 1, 0);
  const local = meshAdapter(read, lo, hi, 1, 0);
  local.normalAt = (point) => full.normalAt(point);
  return meshBuffers(local);
}

export function meshBuffers(volume) {
  const mesh = extractMesh(volume);
  const positions = mesh.getAttribute("position").array;
  const normals = mesh.getAttribute("normal").array;
  mesh.dispose();
  return { positions, normals };
}

export function compareMeshes(a, b) {
  assert.equal(hash(a.positions), hash(b.positions), "position/triangle order");
  assert.equal(hash(a.normals), hash(b.normals), "normal components");
}

export function topology(meshes, calibration, weld) {
  const vertices = new Map(),
    edges = new Map(),
    parents = [];
  const lo = [Infinity, Infinity, Infinity],
    hi = [-Infinity, -Infinity, -Infinity];
  let faces = 0,
    collapsed = 0;
  function vertex(a, i) {
    const key = [0, 1, 2]
      .map((j) => {
        const v = a[i + j] * calibration;
        lo[j] = Math.min(lo[j], v);
        hi[j] = Math.max(hi[j], v);
        return Math.round(v / weld);
      })
      .join(",");
    if (!vertices.has(key)) {
      vertices.set(key, parents.length);
      parents.push(parents.length);
    }
    return vertices.get(key);
  }
  function root(i) {
    while (parents[i] !== i) {
      parents[i] = parents[parents[i]];
      i = parents[i];
    }
    return i;
  }
  for (const { positions: a } of meshes)
    for (let i = 0; i < a.length; i += 9) {
      const ids = [vertex(a, i), vertex(a, i + 3), vertex(a, i + 6)];
      if (new Set(ids).size < 3) {
        collapsed++;
        continue;
      }
      faces++;
      for (let j = 0; j < 3; j++) {
        const x = ids[j],
          y = ids[(j + 1) % 3];
        parents[root(x)] = root(y);
        const key = Math.min(x, y) * 2 ** 24 + Math.max(x, y);
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
  const multiplicities = [...edges.values()];
  return {
    triangles: faces + collapsed,
    collapsed,
    components: new Set(parents.map((_, i) => root(i))).size,
    boundaryEdges: multiplicities.filter((n) => n === 1).length,
    nonmanifoldEdges: multiplicities.filter((n) => n > 2).length,
    euler: vertices.size - edges.size + faces,
    dimensionsMM: faces ? hi.map((v, i) => v - lo[i]) : null,
  };
}
