import assert from "node:assert/strict";
import test from "node:test";
import { changedChunks } from "../scripts/research/changed-chunks.mjs";
import { brickKey, FAR } from "../scripts/research/narrow-band.mjs";

test("negative seam changes invalidate incident cells and occupied halo neighbors", () => {
  const owner = brickKey(-1, 0, 0);
  const before = new Float32Array(512).fill(FAR);
  const after = before.slice();
  const patch = { before: new Map([[owner, before]]), after: new Map([[owner, after]]) };
  const cell = brickKey(-1, 0, 0);
  const next = brickKey(0, 0, 0);
  after[7 + 3 * 8 + 3 * 64] = -1; // x = -1, gradient halo of x = 0
  assert.deepEqual(
    changedChunks(patch, () => false),
    [cell],
  );
  assert.deepEqual(
    changedChunks(patch, (key) => key === next),
    [cell, next],
  );
  after[7 + 3 * 8 + 3 * 64] = -Number.EPSILON;
  assert.deepEqual(
    changedChunks(patch, () => false),
    [],
  );
  assert.deepEqual(
    changedChunks(patch, (key) => key === next),
    [next],
  );
});
