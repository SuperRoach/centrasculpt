/** Supplemental source-window experiment. Never changes project crop semantics. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { SDFVolume } from "../../work/test-build/sdf.mjs";
import { BrickVolume } from "./brick-volume.mjs";

const result = {
  method:
    "Analytic sphere radius .35 model units on unchanged spacing. Source windows base, crop eight samples per face, grow eight per face. Cropped dense adapter is test-only, not a supported SDFVolume project. Target random cube bound ratios .5/1/2; outside-source distance extension can differ when bounds change despite identical overlapping lattice values. Four paired invocations, no mesh/edit transactions. Dense window has values only, no scratch.",
  rows: [],
};
for (const n of [64, 128, 192]) {
  const original = new SDFVolume(n, 1, false);
  for (let z = 0; z < n; z++)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        original.values[original.index(x, y, z)] =
          Math.hypot(original.coordinate(x), original.coordinate(y), original.coordinate(z)) - 0.35;
  for (const shift of [0, 8, -8]) {
    const dimensions = Array(3).fill(n - 2 * shift),
      minimum = Array(3).fill(shift);
    const dense = Object.create(SDFVolume.prototype);
    // Runtime-only read adapter, no constructor or mutations invoked.
    Object.assign(dense, {
      resolution: n,
      extent: 1,
      step: original.step,
      shape: dimensions,
      minimum,
      values: new Float32Array(dimensions[0] ** 3),
    });
    for (let z = 0; z < dimensions[2]; z++)
      for (let y = 0; y < dimensions[1]; y++)
        for (let x = 0; x < dimensions[0]; x++)
          dense.values[dense.index(x, y, z)] =
            Math.hypot(dense.coordinate(x), dense.coordinate(y), dense.coordinate(z)) - 0.35;
    for (const b of [8, 16]) {
      const start = performance.now(),
        sparse = new BrickVolume(dense, b);
      const row = {
        n,
        b,
        shift,
        dimensions,
        conversionMs: performance.now() - start,
        denseValuesBytes: dense.values.byteLength,
        typedBytes: sparse.typedBytes,
        metadataAllowanceBytes: sparse.metadataAllowanceBytes,
        targets: [],
      };
      for (const ratio of [0.5, 1, 2]) {
        let seed = 8301;
        const random = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return ((seed / 2 ** 32) * 2 - 1) * ratio;
        };
        const points = Array.from({ length: 4096 }, () => ({
          x: random(),
          y: random(),
          z: random(),
        }));
        const target = {
          ratio,
          trials: [],
          outsideSource: 0,
          maxFieldDifferenceFromOriginalBounds: 0,
        };
        for (const p of points) {
          const xyz = [p.x, p.y, p.z];
          if (xyz.some((v, a) => v < dense.bounds.min[a] || v > dense.bounds.max[a]))
            target.outsideSource++;
          target.maxFieldDifferenceFromOriginalBounds = Math.max(
            target.maxFieldDifferenceFromOriginalBounds,
            Math.abs(dense.sampleLocal(p) - original.sampleLocal(p)),
          );
          assert.equal(dense.sampleLocal(p), sparse.sampleLocal(p));
        }
        for (let trial = 0; trial < 4; trial++) {
          const t = {};
          for (const [label, v] of [
            ["dense", dense],
            ["sparse", sparse],
          ]) {
            const at = performance.now();
            let sum = 0;
            for (const p of points) sum += v.sampleLocal(p);
            t[label] = { ms: performance.now() - at, checksum: sum };
          }
          assert.equal(t.dense.checksum, t.sparse.checksum);
          target.trials.push(t);
        }
        row.targets.push(target);
      }
      result.rows.push(row);
      writeFileSync(
        `${process.argv[2]}/source-bounds.json`,
        `${JSON.stringify(result, null, 2)}\n`,
      );
    }
  }
}
