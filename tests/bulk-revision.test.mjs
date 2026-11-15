import assert from "node:assert/strict";
import test from "node:test";
import { BulkMeshRebuild, stagePageMap } from "../scripts/research/bulk-revision.mjs";

test("failed staging preserves the published page directory", () => {
  const old = new Map([
    [1, [10]],
    [2, [20]],
  ]);
  const changes = new Map([
    [1, [30]],
    [2, undefined],
    [3, [40]],
  ]);
  assert.throws(
    () =>
      stagePageMap(old, changes, (count) => {
        if (count === 2) throw new Error("injected");
      }),
    /injected/,
  );
  assert.deepEqual(
    [...old],
    [
      [1, [10]],
      [2, [20]],
    ],
  );
  const next = stagePageMap(old, changes);
  assert.deepEqual(
    [...next],
    [
      [1, [30]],
      [3, [40]],
    ],
  );
});

test("a bounded bulk queue retries extraction and rejects stale mesh results", () => {
  let fail = true;
  const visible = new Map();
  const rebuild = new BulkMeshRebuild(
    (key) => {
      if (fail) throw new Error("extraction");
      return key * 10;
    },
    (key, mesh) => visible.set(key, mesh),
    2,
  );
  rebuild.begin([1, 2, 3]);
  const oldRevision = rebuild.revision;
  assert.throws(() => rebuild.slice(), /extraction/);
  assert.equal(rebuild.pending, 3);
  assert.equal(rebuild.queue.peak, 2);
  assert.equal(visible.size, 0);
  assert.throws(() => rebuild.begin(new Array(16_001)), /plan limit/);
  assert.equal(rebuild.revision, oldRevision);
  assert.equal(rebuild.pending, 3);
  rebuild.begin([1, 2, 3]);
  assert.equal(rebuild.publish(oldRevision, 1, -1), false);
  fail = false;
  while (rebuild.pending) rebuild.slice();
  assert.deepEqual(
    [...visible],
    [
      [1, 10],
      [2, 20],
      [3, 30],
    ],
  );
  assert.equal(rebuild.queue.peak, 2);
});
