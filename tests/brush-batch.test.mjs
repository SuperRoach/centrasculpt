import assert from "node:assert/strict";
import test from "node:test";
import { prepareBrushBatch } from "../scripts/research/brush-batch.mjs";
import { DirtyChunkQueue } from "../scripts/research/dirty-chunk-queue.mjs";
import {
  AnalyticField,
  BandCache,
  publishStroke,
  stageStroke,
} from "../scripts/research/narrow-band.mjs";

const edits = [
  { a: [-4, 0, 0], b: [2, 0, 0], mode: "construct" },
  { a: [-1, 0, 0], b: [3, 0, 0], mode: "subtract" },
  { a: [1, 0, 0], b: [4, 0, 0], mode: "smooth" },
  { a: [3, 0, 0], b: [5, 0, 0], mode: "add" },
];

function fixture() {
  const field = new AnalyticField();
  const staging = new BandCache(3, 1, (x, y, z) => field.read(x, y, z), true);
  staging.entry = () => undefined;
  return { field, staging };
}

test("ordered batching preserves exact field and individual history patches", () => {
  const { field, staging } = fixture();
  const reference = fixture();
  const queue = new DirtyChunkQueue(192, () => {});
  const batch = prepareBrushBatch(field, staging, edits, queue, () => false, Infinity);
  assert.equal(batch.items.length, edits.length);
  assert.equal(field.edits.size, 0);
  assert.equal(queue.pending.size, 0);
  assert.deepEqual(new Set(batch.keys), new Set(batch.items.flatMap(({ keys }) => keys)));

  queue.publish(batch.keys, () => {
    for (const { patch } of batch.items) publishStroke(field, staging, patch);
  });
  assert.equal(queue.pending.size, batch.keys.length);
  for (const { a, b, mode } of edits) {
    const patch = stageStroke(reference.field, reference.staging, a, b, mode);
    publishStroke(reference.field, reference.staging, patch);
  }
  assert.deepEqual(field.edits, reference.field.edits);
  for (const { patch } of batch.items.toReversed()) publishStroke(field, staging, patch, true);
  assert.equal(field.edits.size, 0);
});

test("queue refusal returns an admissible prefix without publishing it", () => {
  const { field, staging } = fixture();
  const queue = new DirtyChunkQueue(192, () => {});
  const first = prepareBrushBatch(field, staging, edits.slice(0, 1), queue, () => false, Infinity);
  assert(first.keys.length);
  const capped = new DirtyChunkQueue(first.keys.length, () => {});
  const distant = { a: [90, 0, 0], b: [94, 0, 0], mode: "construct" };
  const batch = prepareBrushBatch(
    field,
    staging,
    [edits[0], distant],
    capped,
    () => false,
    Infinity,
  );
  assert.equal(batch.blocked, true);
  assert.equal(batch.items.length, 1);
  assert.deepEqual(batch.keys, first.keys);
  assert.equal(field.edits.size, 0);
  assert.equal(capped.pending.size, 0);
});
