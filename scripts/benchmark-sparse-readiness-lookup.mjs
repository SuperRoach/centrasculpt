// Fresh process per backend and fixture. All lattice values are copied losslessly.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FIXTURES, POSES } from "./fixtures/personal-stamp-baseline.mjs";

const [directory, output, sizeArg, backend, fixture] = process.argv.slice(2);
assert(directory && output, "Pass the Phase 8.3 masters directory and an output path.");
const sizes = [128, 192];
if (!backend) {
  await import("./compile-core.mjs");
  const results = [];
  for (let trial = 0; trial < Number(process.env.PHASE97_LOOKUP_PAIRS ?? 3); trial++)
    for (const size of sizes)
      for (const { id } of FIXTURES) {
        const pair = new Map();
        for (const backend of trial % 2 ? ["sparse", "dense"] : ["dense", "sparse"]) {
          const row = spawnSync(
            process.execPath,
            [process.argv[1], directory, output, String(size), backend, id],
            { encoding: "utf8", timeout: 45000 },
          );
          assert.equal(row.status, 0, row.stderr || row.error?.message);
          pair.set(backend, JSON.parse(row.stdout));
        }
        const dense = pair.get("dense"),
          sparse = pair.get("sparse");
        assert.deepEqual(sparse.checksums, dense.checksums);
        results.push({ trial, size, fixture: id, dense, sparse });
        writeFileSync(output, JSON.stringify(results, null, 2));
      }
} else {
  const { openSculptProject } = await import("../work/test-build/project.mjs");
  const { SDFVolume } = await import("../work/test-build/sdf.mjs");
  const { SparseSDFVolume } = await import("../work/test-build/sparse-sdf.mjs");
  const { randomGenerator } = await import("./research/narrow-band-evidence.mjs");
  const size = Number(sizeArg);
  const source = openSculptProject(
    Uint8Array.from(readFileSync(join(directory, `${fixture}.form`))).buffer,
  ).activeLayer.volume;
  const volume =
    backend === "sparse"
      ? new SparseSDFVolume(size, source.extent)
      : new SDFVolume(size, source.extent, false);
  const amount = size ** 3;
  if (source.resolution === size && backend === "dense") volume.values.set(source.values);
  else
    for (let z = 0; z < size; z++)
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const index = volume.index(x, y, z);
          const value =
            source.resolution === size
              ? source.values[index]
              : source.sampleLocal({
                  x: volume.coordinate(x),
                  y: volume.coordinate(y),
                  z: volume.coordinate(z),
                });
          volume.writeVoxel(index, value);
        }

  const random = randomGenerator(8302);
  const probes = Array.from({ length: 4096 }, () => [random(), random(), random()]);
  const localPoint = ([x, y, z]) => ({
    x: x * volume.step - volume.extent,
    y: y * volume.step - volume.extent,
    z: z * volume.step - volume.extent,
  });
  const traces = {
    random: probes.map((p) => localPoint(p.map((v) => v * (size - 1)))),
    local: probes.map((p) => localPoint(p.map((v) => (size - 1) / 2 + 5 * v))),
    scan: probes.map((_, i) =>
      localPoint([
        (i % (size - 1)) + 0.2,
        Math.floor(i / (size - 1)) + 0.3,
        Math.floor(size / 2) + 0.1,
      ]),
    ),
  };
  for (const bounds of [0.5, 1, 2])
    traces[`stamp-${bounds}`] = POSES.flatMap((pose) => {
      const cos = Math.cos(pose.rotationXYZ[1]),
        sin = Math.sin(pose.rotationXYZ[1]);
      return probes.map((p) => {
        const [x, y, z] = p.map(
          (v, i) => ((2 * v - 1) * bounds - pose.positionMM[i] / 50) / pose.uniformScale,
        );
        return { x: x * cos + z * sin, y, z: -x * sin + z * cos, scale: pose.uniformScale };
      });
    });
  const checkpoints = [],
    timings = {},
    checksums = {};
  for (let pass = 0; pass < 7; pass++) {
    const snapshot = process.memoryUsage();
    for (const [name, points] of Object.entries(traces)) {
      const start = performance.now();
      let sum = 0;
      if (name.startsWith("stamp"))
        for (const p of points) sum += Math.min(0.2, volume.sampleLocal(p) * p.scale);
      else for (const p of points) sum += volume.sampleLocal(p);
      timings[name] ??= [];
      timings[name].push(performance.now() - start);
      checksums[name] = sum;
    }
    checkpoints.push(snapshot);
  }
  console.log(
    JSON.stringify({
      timings,
      checksums,
      checkpoints,
      maxRSSKiB: process.resourceUsage().maxRSS,
      valuesBytes: amount * 4,
      workingBytes: backend === "sparse" ? volume.pageMemoryBytes : amount * 8,
      sourceValuesAndScratchBytes: source.values.byteLength * 2,
      residentPages: volume.allocatedPages,
    }),
  );
}
