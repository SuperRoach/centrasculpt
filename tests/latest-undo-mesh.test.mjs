import assert from "node:assert/strict";
import test from "node:test";
import { LatestUndoMesh } from "../scripts/research/latest-undo-mesh.mjs";

test("cache charges shared backing buffers once and refuses a partial snapshot", () => {
  const values = new Float32Array(12);
  const chunks = [[1, { position: values.subarray(0, 3), normal: values.subarray(3, 6) }]];
  const cache = new LatestUndoMesh(values.byteLength - 1);
  assert.equal(cache.capture("erase", chunks), false);
  assert.equal(cache.bytes, 0);
  assert.equal(cache.take("erase"), null);
  const fitting = new LatestUndoMesh(values.byteLength);
  assert.equal(fitting.capture("erase", chunks), true);
  assert.equal(fitting.bytes, values.byteLength);
  assert.equal(fitting.take("erase").get(1).position.buffer, values.buffer);
  assert.equal(fitting.bytes, 0);
});

test("a newer snapshot replaces the previous revision and stale Undo consumes no buffers", () => {
  const mesh = [[1, { position: new Float32Array(3), normal: new Float32Array(3) }]];
  const cache = new LatestUndoMesh(64);
  assert.equal(cache.capture("old", mesh), true);
  assert.equal(cache.capture("new", mesh), true);
  assert.equal(cache.take("old"), null);
  assert.equal(cache.take("new").get(1).position, mesh[0][1].position);
  assert.equal(cache.bytes, 0);
});
