import assert from "node:assert/strict";
import test from "node:test";
import { BoxGeometry } from "three";
import { exportCountEstimate } from "../work/test-build/export-estimate.mjs";
import { encodeSTL } from "../work/test-build/stl-export.mjs";
import { identityTransform } from "../work/test-build/transform.mjs";

test("metadata estimates enclose actual encoded counts without promising a reduction", async () => {
  const g = new BoxGeometry(4.43, 1, 0.5).toNonIndexed();
  const sources = [
    {
      name: "443mm",
      transform: identityTransform(),
      step: 0.01,
      chunks: [{ positions: g.attributes.position.array, normals: g.attributes.normal.array }],
    },
  ];
  for (const quality of ["fast", "standard", "high"]) {
    const estimate = exportCountEstimate(12, quality, false);
    const result = await encodeSTL(sources, quality, 256 * 1024 ** 2, 443);
    assert(result.report.triangles >= estimate.lower && result.report.triangles <= estimate.upper);
    if (estimate.exact) assert.equal(result.report.triangles, estimate.upper);
    for (const value of Object.values(result.timings)) assert(Number.isFinite(value) && value >= 0);
    assert(
      result.timings.optimiserMs + result.timings.validationMs + result.timings.encodingMs <=
        result.milliseconds + 1,
    );
    assert(Math.abs(result.report.dimensions[0] - 443) < 0.001);
  }
  g.dispose();
});
test("evaluated geometry counts remain explicitly unknown; slider metadata validation is bounded", () => {
  for (const quality of ["fast", "standard", "high"]) {
    const e = exportCountEstimate(12, quality, true);
    assert.equal(e.exact, false);
    assert.equal(e.upper, 1_000_000);
    assert.match(e.text, /unknown.*600,000/);
  }
  for (const n of [-1, NaN, Infinity, 0.5])
    assert.throws(() => exportCountEstimate(n, "fast", false));
  assert.equal(exportCountEstimate(0, "fast", false).upper, 0);
});
