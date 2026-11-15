import assert from "node:assert/strict";
import test from "node:test";
import { ExactPages } from "../scripts/research/exact-pages.mjs";

test("exact blocks preserve signed zero and the partial last page through eviction and replay", () => {
  const source = Float32Array.from({ length: 4096 * 5 + 7 }, (_, i) => Math.sin(i));
  source[4095] = -0;
  const store = new ExactPages(source, 16384, 4);
  for (const [i, value] of source.entries()) assert.equal(store.read(i), value);
  assert.equal(store.decoded.size, 4);
  const indices = [4095, 4096, source.length - 1];
  const patch = store.stage(indices, () => 0.25);
  for (const i of indices) assert.equal(store.read(i), source[i]);
  assert.throws(() => store.stage([...indices, source.length], () => 1), /index/);
  for (const i of indices) assert.equal(store.read(i), source[i]);
  store.publish(patch);
  for (const i of indices) assert.equal(store.read(i), 0.25);
  store.publish(patch, true);
  assert.equal(store.edits.size, 0);
  for (const i of indices) assert.equal(store.read(i), source[i]);
  store.publish(patch);
  for (const i of indices) assert.equal(store.read(i), 0.25);
});
