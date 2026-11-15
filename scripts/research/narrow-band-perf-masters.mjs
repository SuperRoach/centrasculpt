import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { openSculptProject } from "../../src/project";
import { SDFVolume } from "../../src/sdf";
import { FIXTURES, POSES } from "../fixtures/personal-stamp-baseline.mjs";
import { BrickVolume } from "./brick-volume.mjs";
import { BandCache, bricksIn, sampler, summarize } from "./narrow-band.mjs";
import { hash, memory, randomGenerator, timed } from "./narrow-band-evidence.mjs";
import { cacheBytes, PerfCache } from "./narrow-band-perf.mjs";

const directory = resolve("work/personal-stamp-baseline/2026-11-10T12-23-20.143Z");
const storageBlock = 64 * 1024;

function compressed(values) {
  const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
  const packed = [];
  const shuffle = new Uint8Array(storageBlock);
  for (let offset = 0; offset < bytes.length; offset += storageBlock) {
    const block = bytes.subarray(offset, offset + storageBlock);
    const words = block.length / 4;
    for (let i = 0; i < block.length; i++) shuffle[(i % 4) * words + (i >> 2)] = block[i];
    const encoded = deflateRawSync(shuffle.subarray(0, block.length), { level: 1 });
    if (encoded.length < block.length) {
      const decoded = inflateRawSync(encoded, { maxOutputLength: storageBlock });
      for (let i = 0; i < block.length; i++)
        assert.equal(decoded[(i % 4) * words + (i >> 2)], block[i]);
      packed.push(encoded.length);
    } else packed.push(block.length);
  }
  return {
    payloadBytes: packed.reduce((a, b) => a + b, 0),
    indexBytes: (packed.length + 1) * 4 + packed.length,
    codecBlockBytes: storageBlock,
    codecTypedScratchBytes: 3 * storageBlock,
  };
}

export function masters(size, trial, save) {
  const reference = JSON.parse(readFileSync(resolve(directory, "baseline.json"), "utf8"));
  const rows = [];
  for (const fixture of FIXTURES) {
    const path = resolve(directory, `${fixture.id}.form`);
    const file = readFileSync(path);
    const row = reference.rows.find((row) => row.id === fixture.id);
    assert.equal(hash(file), row.nativeSHA256);
    const master = openSculptProject(
      file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
    ).activeLayer.volume;
    assert.equal(hash(master.values), row.masterHash);
    const volume = size === 192 ? master : new SDFVolume(size, 1, false);
    if (volume !== master)
      for (let z = 0; z < size; z++)
        for (let y = 0; y < size; y++)
          for (let x = 0; x < size; x++)
            volume.values[volume.index(x, y, z)] = master.sampleLocal({
              x: volume.coordinate(x),
              y: volume.coordinate(y),
              z: volume.coordinate(z),
            });
    const { values, step } = volume;
    const before = hash(values);
    const lo = [0, 0, 0],
      hi = lo.map(() => size - 1);
    const read = (x, y, z) => values[x + size * (y + size * z)];
    const clamp = (v) => Math.max(0, Math.min(size - 1, v));
    const bounded = (x, y, z) => read(clamp(x), clamp(y), clamp(z));
    const keys = [...bricksIn(lo, hi)];
    const summaries = keys.map((key) => summarize(key, bounded));
    const baseline = new BandCache(3, step, read);
    const paged = new PerfCache(3, step, read, false, "paged");
    for (const [i, key] of keys.entries()) {
      const entry = baseline.entry(key, bounded, summaries[i]);
      baseline.install(key, entry);
      paged.install(key, entry);
    }
    const exactBricks = timed(() => new BrickVolume(volume, 8));
    const stringRead = (x, y, z) => {
      const data = exactBricks.value.bricks.get(`${x >> 3},${y >> 3},${z >> 3}`);
      return typeof data === "number" ? data : data[(x & 7) + 8 * ((y & 7) + 8 * (z & 7))];
    };
    const backends = {
      dense: sampler(read, lo, hi, step),
      "8.3a-string": sampler(stringRead, lo, hi, step),
      "8.3b-linear": sampler((x, y, z) => baseline.read(x, y, z), lo, hi, step),
      "8.3b-paged": sampler((x, y, z) => paged.read(x, y, z), lo, hi, step),
    };
    const random = randomGenerator(8302);
    const probes = Array.from({ length: 4096 }, () => [random(), random(), random()]);
    const traces = {
      random: probes.map((p) => p.map((v) => v * (size - 1))),
      local: probes.map((p) => p.map((v) => (size - 1) / 2 + 5 * v)),
      scan: probes.map((_, i) => [
        (i % (size - 1)) + 0.2,
        Math.floor(i / (size - 1)) + 0.3,
        Math.floor(size / 2) + 0.1,
      ]),
    };
    for (const bounds of [0.5, 1, 2]) {
      traces[`stamp-${bounds}`] = POSES.flatMap((pose) => {
        const cos = Math.cos(pose.rotationXYZ[1]),
          sin = Math.sin(pose.rotationXYZ[1]);
        return probes.map((p) => {
          const [x, y, z] = p.map(
            (v, i) => ((2 * v - 1) * bounds - pose.positionMM[i] / 50) / pose.uniformScale,
          );
          return [
            (x * cos + z * sin + volume.extent) / step,
            (y + volume.extent) / step,
            (-x * sin + z * cos + volume.extent) / step,
            pose.uniformScale,
          ];
        });
      });
    }
    const timings = {};
    for (const [trace, points] of Object.entries(traces)) {
      const transformed = trace.startsWith("stamp");
      const names = Object.keys(backends);
      const cases = [];
      for (let pass = 0; pass < 5; pass++) {
        const rotate = (pass + trial) % names.length;
        const result = {};
        let expected;
        for (const name of [...names.slice(rotate), ...names.slice(0, rotate)]) {
          const sample = backends[name];
          const measurement = timed(() => {
            let sum = 0;
            for (let i = 0; i < (transformed ? 1 : 8); i++)
              for (const [x, y, z, scale] of points) {
                const value = sample(x, y, z);
                sum += transformed ? Math.min(0.1, value * scale) : value;
              }
            return sum;
          });
          expected ??= measurement.value;
          assert.equal(measurement.value, expected);
          result[name] = measurement.ms;
        }
        cases.push(result);
      }
      timings[trace] = cases;
    }
    // The exact paths must agree individually for both CSG operators.
    // Record witnesses that signed magnitudes would alter a Boolean result.
    let unionSentinelDifferences = 0;
    let subtractSentinelDifferences = 0;
    for (const p of probes) {
      const q = p.map((v) => Math.floor(v * size));
      const v = read(...q),
        signed = baseline.read(...q, false);
      assert.equal(stringRead(...q), v);
      assert.equal(baseline.read(...q), v);
      assert.equal(paged.read(...q), v);
      if (Math.min(100 * step, v) !== Math.min(100 * step, signed)) unionSentinelDifferences++;
      if (Math.max(-100 * step, -v) !== Math.max(-100 * step, -signed))
        subtractSentinelDifferences++;
    }
    const codec = timed(() => compressed(values));
    assert.equal(hash(values), before);
    assert.equal(hash(readFileSync(path)), row.nativeSHA256);
    rows.push({
      id: fixture.id,
      size,
      timings,
      exactBrickBuildMs: exactBricks.ms,
      exactBrickPayloadBytes: exactBricks.value.typedBytes,
      exactBrickDirectoryAllowanceBytes: exactBricks.value.metadataAllowanceBytes,
      masterBytes: master.values.byteLength + master.scratch.byteLength,
      valuesBytes: values.byteLength,
      denseValuesScratchBytes: values.byteLength + volume.scratch.byteLength,
      coResidentMasterAndTargetBytes:
        master.values.byteLength +
        master.scratch.byteLength +
        (volume === master ? 0 : values.byteLength + volume.scratch.byteLength),
      linearCacheBytes: cacheBytes(baseline),
      pagedCacheBytes: cacheBytes(paged),
      codec: { ...codec.value, encodeAndVerifyMs: codec.ms },
      unionSentinelDifferences,
      subtractSentinelDifferences,
      snapshot: memory(),
    });
    save({ rows });
  }
  return { rows };
}
