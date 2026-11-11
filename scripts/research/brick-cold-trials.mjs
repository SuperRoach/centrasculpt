/** Fresh Node process per backend/case; offline read-only masters. Run after matrix. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openSculptProject } from "../../work/test-build/project.mjs";
import { SDFVolume } from "../../work/test-build/sdf.mjs";
import { FIXTURES } from "../fixtures/personal-stamp-baseline.mjs";
import { BrickVolume } from "./brick-volume.mjs";

if (process.env.BRICK_COLD_CASE) {
  const { id, n, b, backend, directory } = JSON.parse(process.env.BRICK_COLD_CASE);
  const file = readFileSync(`${directory}/${id}.form`);
  const master = openSculptProject(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
  ).activeLayer.volume;
  const d = new SDFVolume(n, 1, false);
  if (n === 192) d.values.set(master.values);
  else
    for (let z = 0; z < n; z++)
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++)
          d.values[d.index(x, y, z)] = master.sampleLocal({
            x: d.coordinate(x),
            y: d.coordinate(y),
            z: d.coordinate(z),
          });
  const start = performance.now(),
    v = backend === "dense" ? d : new BrickVolume(d, b),
    conversionMs = performance.now() - start;
  let seed = 8301;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed / 2 ** 32) * 2 - 1;
  };
  const points = Array.from({ length: 4096 }, () => ({ x: random(), y: random(), z: random() }));
  const trials = [];
  for (let trial = 0; trial < 4; trial++) {
    const t = performance.now();
    let sum = 0;
    for (const p of points) sum += v.sampleLocal(p);
    trials.push({ ms: performance.now() - t, checksum: sum });
  }
  console.log(
    JSON.stringify({
      conversionMs,
      trials,
      memory: process.memoryUsage(),
      maxRSSKiB: process.resourceUsage().maxRSS,
    }),
  );
} else {
  const matrixPath = process.argv[2];
  const matrix = JSON.parse(readFileSync(`${matrixPath}/metrics.json`, "utf8"));
  const result = {
    method:
      "Fresh Node per backend and case; four repeated random traces, first lookup invocation cold-JIT, three warm. File decode, source resampling/conversion happen before lookup timing. OS cache not flushed; source interpolation may warm shared arithmetic. Dense backend has no conversion. No meshes/history included. Process memory is whole-child high-water/snapshot, not sparse retained bytes.",
    rows: [],
  };
  for (const id of FIXTURES.map((f) => f.id))
    for (const n of [64, 128, 192])
      for (const b of [8, 16]) {
        const row = { id, n, b };
        for (const backend of result.rows.length % 2 ? ["sparse", "dense"] : ["dense", "sparse"]) {
          const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
            env: {
              ...process.env,
              BRICK_COLD_CASE: JSON.stringify({
                id,
                n,
                b,
                backend,
                directory: matrix.masterDirectory,
              }),
            },
            encoding: "utf8",
            maxBuffer: 1024 ** 2,
          });
          assert.equal(child.status, 0, child.stderr);
          row[backend] = JSON.parse(child.stdout);
        }
        assert.equal(row.dense.trials[0].checksum, row.sparse.trials[0].checksum);
        result.rows.push(row);
        writeFileSync(`${matrixPath}/cold-trials.json`, `${JSON.stringify(result, null, 2)}\n`);
        console.log(`${id} ${n} b${b}: paired fresh processes`);
      }
}
