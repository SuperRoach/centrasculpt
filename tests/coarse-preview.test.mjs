import assert from "node:assert/strict";
import test from "node:test";
import { meshAdapter, meshBuffers, topology } from "../scripts/research/narrow-band-evidence.mjs";

test("point-sampled 2 mm preview can miss a feature preserved by the exact 1 mm mesh", () => {
  // A sub-2 mm slab is centered on the odd sample plane.
  const distance = (x) => Math.abs(x - 1) - 0.45;
  const exact = meshBuffers(meshAdapter(distance, [0, 0, 0], [8, 8, 8], 1, 0));
  const coarse = meshBuffers(meshAdapter((x) => distance(x * 2), [0, 0, 0], [4, 4, 4], 2, 0));
  assert(exact.positions.length > 0);
  assert.equal(coarse.positions.length, 0);
});

test("mixed coarse and exact chunks need seam handling", () => {
  const distance = (x, y, z) => Math.hypot(x, y - 0.23, z - 0.39) - 4.7;
  const left = meshBuffers(meshAdapter(distance, [-8, -8, -8], [0, 8, 8], 1, 0));
  const right = meshBuffers(meshAdapter(distance, [0, -8, -8], [8, 8, 8], 1, 0));
  const coarse = meshBuffers(
    meshAdapter((x, y, z) => distance(2 * x, 2 * y, 2 * z), [0, -4, -4], [4, 4, 4], 2, 0),
  );
  assert.equal(topology([left, right], 1, 0.0001).boundaryEdges, 0);
  assert(topology([left, coarse], 1, 0.0001).boundaryEdges > 0);
});
