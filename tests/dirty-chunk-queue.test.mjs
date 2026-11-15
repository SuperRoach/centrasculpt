import assert from "node:assert/strict";
import test from "node:test";
import { DirtyChunkQueue } from "../scripts/research/dirty-chunk-queue.mjs";

test("dirty queue coalesces pending edits and refuses overflow before publication", () => {
  let revision = 0;
  const rebuilt = [];
  const queue = new DirtyChunkQueue(2, ([key]) => rebuilt.push([key, revision]), 1);
  queue.publish([1, 2], () => revision++);
  assert.throws(() => queue.publish([3], () => revision++), /budget/);
  assert.equal(revision, 1);
  queue.publish([1], () => revision++);
  assert.equal(queue.coalesced, 1);
  queue.slice();
  queue.publish([3], () => revision++);
  assert.equal(queue.drain(), 2);
  assert.deepEqual(rebuilt, [
    [1, 2],
    [2, 3],
    [3, 3],
  ]);
});

test("brush priority reserves every second service for the oldest key", () => {
  const rebuilt = [];
  const queue = new DirtyChunkQueue(
    4,
    ([key]) => rebuilt.push(key),
    1,
    2,
    (key, focus) => Math.abs(key - focus),
    true,
  );
  queue.focus = [0];
  queue.publish([100, 200, 1], () => {});
  queue.slice();
  queue.publish([2], () => {});
  queue.slice();
  queue.slice();
  queue.slice();
  assert.deepEqual(rebuilt, [1, 100, 2, 200]);
  assert.equal(queue.pending.size, 0);
});

test("expired FIFO work displaces brush priority, including after coalescing", () => {
  const rebuilt = [];
  const queue = new DirtyChunkQueue(
    4,
    ([key]) => rebuilt.push(key),
    1,
    2,
    (key, focus) => Math.abs(key - focus[0]),
    true,
    2,
  );
  queue.focus = [0];
  queue.publish([100, 1], () => {});
  queue.slice();
  queue.publish([100, 2], () => {});
  queue.slice();
  queue.publish([3], () => {});
  queue.slice();
  assert.deepEqual(rebuilt, [1, 2, 100]);
  assert.equal(queue.deadlineSelections, 1);
});

test("cost cutoff defers the next chunk and guarantees first-chunk progress", () => {
  let time = 0;
  const rebuilt = [];
  const queue = new DirtyChunkQueue(
    4,
    ([key]) => {
      rebuilt.push(key);
      time += key === 1 ? 1.1 : 2.1;
    },
    8,
    2,
    null,
    false,
    null,
    {
      classify: (key) => key,
      estimate: () => 1,
      observe: () => {},
    },
    () => time,
  );
  queue.publish([1, 2], () => {});
  queue.slice();
  assert.deepEqual(rebuilt, [1]);
  assert.equal(queue.predictedStops, 1);
  queue.slice();
  assert.deepEqual(rebuilt, [1, 2]);
  assert.equal(queue.firstChunkOverBudget, 1);
  assert.equal(queue.pending.size, 0);
});

test("local quota leaves FIFO capacity and gives precedence to overdue keys", () => {
  const rebuilt = [];
  const queue = new DirtyChunkQueue(
    8,
    ([key]) => rebuilt.push(key),
    3,
    2,
    (key, focus) => (key - focus[0]) ** 2,
    true,
    1,
    null,
    () => 0,
    2,
  );
  queue.focus = [0];
  queue.publish([99, 98, 97, 1, 2, 3], () => {});
  queue.slice();
  assert.deepEqual(rebuilt, [1, 2, 99]);
  queue.publish([0], () => {});
  queue.slice();
  assert.deepEqual(rebuilt, [1, 2, 99, 98, 97, 3]);
  assert.equal(queue.localSelections, 2);
  assert.equal(queue.deadlineSelections, 3);
  queue.slice();
  assert.equal(rebuilt.at(-1), 0);
});
