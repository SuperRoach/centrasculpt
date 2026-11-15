import assert from "node:assert/strict";
import test from "node:test";
import { hasCrossing } from "../scripts/research/chunk-occupancy.mjs";

test("occupancy includes the last sample plane and honors the mesher's zero tolerance", () => {
  const row = new Float32Array(9);
  const source = (sample) => ({
    gatherRow(x0, x1, y, z, target) {
      for (let x = x0; x <= x1; x++) target[x - x0] = sample(x, y, z);
    },
  });
  const origin = [-8, 0, 0];
  assert.equal(
    hasCrossing(
      source(() => -1),
      origin,
      row,
    ),
    false,
  );
  assert.equal(
    hasCrossing(
      source(() => 0),
      origin,
      row,
    ),
    false,
  );
  assert.equal(
    hasCrossing(
      source((x) => (x === 0 ? -Number.EPSILON : 1)),
      origin,
      row,
    ),
    false,
  );
  assert.equal(
    hasCrossing(
      source((x) => (x === 0 ? -1 : 1)),
      origin,
      row,
    ),
    true,
  );
  assert.equal(
    hasCrossing(
      source((x) => (x === 0 ? 0 : -1)),
      origin,
      row,
    ),
    true,
  );
});
