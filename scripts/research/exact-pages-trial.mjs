import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  closeSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { resolve } from "node:path";
import { openSculptProject } from "../../src/project";
import { FIXTURES, POSES } from "../fixtures/personal-stamp-baseline.mjs";
import { ExactPages } from "./exact-pages.mjs";
import { sampler } from "./narrow-band.mjs";

const [block, slots, trial, output] = process.argv.slice(2);
const directory = resolve(
  process.env.CENTRA_EXACT_FIXTURES ?? "work/personal-stamp-baseline/2026-11-10T12-23-20.143Z",
);
const baseline = JSON.parse(readFileSync(resolve(directory, "baseline.json"), "utf8"));
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const timed = (fn) => {
  const t = performance.now();
  const value = fn();
  return { value, ms: performance.now() - t };
};
const rows = [];
function checkpoint(complete) {
  writeFileSync(
    `${output}.tmp`,
    JSON.stringify(
      { block, slots, trial, rows, complete, maxRSSKiB: process.resourceUsage().maxRSS },
      null,
      2,
    ),
  );
  renameSync(`${output}.tmp`, output);
}
for (const { id } of FIXTURES) {
  global.gc?.();
  const file = readFileSync(resolve(directory, `${id}.form`));
  const expected = baseline.rows.find((row) => row.id === id);
  assert.equal(hash(file), expected.nativeSHA256);
  const volume = openSculptProject(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
  ).activeLayer.volume;
  const { values, step, extent } = volume;
  assert.equal(hash(new Uint8Array(values.buffer)), expected.masterHash);
  assert.deepEqual(volume.dimensions, [192, 192, 192]);
  const encoded = timed(() => new ExactPages(values, Number(block), Number(slots)));
  const store = encoded.value;
  const n = 192;
  const index = (x, y, z) => x + n * (y + n * z);
  const dense = sampler((x, y, z) => values[index(x, y, z)], [0, 0, 0], [191, 191, 191], step);
  const packed = sampler((x, y, z) => store.read(index(x, y, z)), [0, 0, 0], [191, 191, 191], step);
  let seed = 8303;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const points = Array.from({ length: 256 }, () => [random(), random(), random()]);
  const traces = {
    random: points.map((p) => p.map((v) => v * 191)),
    local: points.map((p) => p.map((v) => 92 + v * 7)),
    transformed: POSES.flatMap((pose) => {
      const c = Math.cos(pose.rotationXYZ[1]),
        s = Math.sin(pose.rotationXYZ[1]);
      return points.slice(0, 32).map((p) => {
        const [x, y, z] = p.map((v, i) => (v - 0.5 - pose.positionMM[i] / 50) / pose.uniformScale);
        return [
          (x * c + z * s + extent) / step,
          (y + extent) / step,
          (-x * s + z * c + extent) / step,
          pose.uniformScale,
        ];
      });
    }),
  };
  const timings = {};
  for (const [name, trace] of Object.entries(traces)) {
    const run = (sample) => {
      let sum = 0;
      for (const [x, y, z, scale = 1] of trace) {
        const v = sample(x, y, z) * scale;
        sum += Math.min(0.1, v) + 0.5 * Math.max(-0.07, -v);
      }
      return sum;
    };
    // Check individual samples as well as the timed checksum.
    for (const p of trace) assert.equal(packed(...p), dense(...p));
    store.decoded.clear();
    timings[name] = Array.from({ length: 4 }, (_, pass) => {
      const misses = store.misses;
      let a, b;
      if ((pass + Number(trial)) % 2) {
        b = timed(() => run(packed));
        a = timed(() => run(dense));
      } else {
        a = timed(() => run(dense));
        b = timed(() => run(packed));
      }
      assert.equal(a.value, b.value);
      return { denseMs: a.ms, packedMs: b.ms, misses: store.misses - misses };
    });
  }
  const indices = Array.from({ length: 128 }, (_, i) =>
    index(75 + (i % 8), 89 + ((i >> 3) % 4), 92 + (i >> 5)),
  );
  const stage = timed(() => store.stage(indices, (v, i) => Math.min(v, (i % 7) * 0.01 - 0.04)));
  const patch = stage.value;
  const stagedBytes = [...patch.after.values()].reduce((n, page) => n + page.byteLength, 0);
  for (const i of indices) assert.equal(store.read(i), values[i]);
  store.publish(patch);
  const verifyEdit = () => {
    for (const i of indices)
      assert.equal(store.read(i), Math.fround(Math.min(values[i], (i % 7) * 0.01 - 0.04)));
  };
  verifyEdit();
  store.publish(patch, true);
  for (const i of indices) assert.equal(store.read(i), values[i]);
  store.publish(patch);
  verifyEdit();
  const footprint = store.footprint();
  const path = `${output}.raw`;
  const save = timed(() => {
    const fd = openSync(path, "w");
    const digest = createHash("sha256");
    try {
      for (let i = 0; i < store.raw.length; i++) {
        const page = store.page(i);
        const bytes = new Uint8Array(page.buffer);
        for (let at = 0; at < bytes.length; ) at += writeSync(fd, bytes, at, bytes.length - at);
        digest.update(bytes);
      }
    } finally {
      closeSync(fd);
    }
    return digest.digest("hex");
  });
  const afterSave = process.memoryUsage();
  const denseEdited = values.slice();
  for (const i of indices) denseEdited[i] = Math.min(values[i], (i % 7) * 0.01 - 0.04);
  assert.equal(save.value, hash(new Uint8Array(denseEdited.buffer)));
  const reopen = timed(() => {
    const fd = openSync(path, "r");
    const bytes = Buffer.alloc(Number(block));
    const digest = createHash("sha256");
    try {
      for (let count = readSync(fd, bytes); count > 0; count = readSync(fd, bytes))
        digest.update(bytes.subarray(0, count));
    } finally {
      closeSync(fd);
    }
    return digest.digest("hex");
  });
  assert.equal(reopen.value, save.value);
  const snapshot = process.memoryUsage();
  assert(snapshot.rss < 900 * 1024 ** 2, "Research RSS ceiling");
  rows.push({
    id,
    timings,
    footprint,
    stagedBytes,
    encodeMs: encoded.ms,
    stageMs: stage.ms,
    saveMs: save.ms,
    reopenMs: reopen.ms,
    originalMasterBytes: values.byteLength + volume.scratch.byteLength,
    snapshot,
    afterSave,
  });
  checkpoint(false);
}
checkpoint(true);
