import assert from "node:assert/strict";
import test from "node:test";
import { previewEligibility } from "../scripts/research/guarded-preview.mjs";
import { meshAdapter, meshBuffers, topology } from "../scripts/research/narrow-band-evidence.mjs";

test("the guard admits a closed contained feature and refuses a fine-only feature", () => {
  const sphere = (x, y, z) => Math.hypot(x - 4, y - 4, z - 4) - 0.9;
  assert.equal(previewEligibility(sphere, [0, 0, 0]), "eligible");
  const coarse = meshBuffers(
    meshAdapter((x, y, z) => sphere(2 * x, 2 * y, 2 * z), [0, 0, 0], [4, 4, 4], 2, 0),
  );
  const result = topology([coarse], 1, 0.0001);
  assert.equal(result.components, 1);
  assert.equal(result.boundaryEdges, 0);
  const hidden = (x, y, z) => Math.hypot(x - 3, y - 3, z - 3) - 0.9;
  assert.equal(previewEligibility(hidden, [0, 0, 0]), "detail");
  assert.equal(
    previewEligibility((x) => x - 0.4, [0, 0, 0]),
    "boundary",
  );
  assert.equal(
    previewEligibility(() => 1, [0, 0, 0]),
    "empty",
  );
});
