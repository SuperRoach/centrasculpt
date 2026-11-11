/** Disposable Phase 8.3a fields only; no browser, database or production writes. */
import "./compile-core.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { resolve } from "node:path";
import { extractMesh } from "../work/test-build/mesh.mjs";
import { openSculptProject } from "../work/test-build/project.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { FIXTURES, POSES } from "./fixtures/personal-stamp-baseline.mjs";
import { BrickVolume } from "./research/brick-volume.mjs";

const output = resolve(
  process.argv[2] ?? "work/sparse-bricks",
  new Date().toISOString().replaceAll(":", "-"),
);
mkdirSync(output, { recursive: true });
const hash = (a) =>
  createHash("sha256")
    .update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength))
    .digest("hex");
const timed = (f) => {
  const t = performance.now();
  const value = f();
  return { ms: performance.now() - t, value };
};
const report = {
  date: new Date().toISOString(),
  runtime: process.version,
  cpu: cpus()[0]?.model,
  seed: 8301,
  method:
    "First measured invocation and three repeated warm traces after conversion/verification, same process/JIT, alternating dense/sparse order by row. Not cold-JIT, OS-cache-cold or isolated timing; fresh-process timing is in cold-trials.json. Whole-process snapshots and maxRSS are not isolated allocations. Exact typed bytes and metadata allowances separate.",
  rows: [],
};
const extra = [
  {
    id: "diagonal-capsule",
    sample: (x, y, z) => {
      const t = Math.max(-38, Math.min(38, (x + y + z) / Math.sqrt(3)));
      return Math.hypot(x - t / Math.sqrt(3), y - t / Math.sqrt(3), z - t / Math.sqrt(3)) - 1.5;
    },
  },
  {
    id: "boolean-shell",
    sample: (x, y, z) =>
      Math.max(Math.hypot(x, y, z) - 32, 28 - Math.hypot(x, y, z), 8 - Math.hypot(x, y)),
  },
];
let seed = 8301;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const masterDirectory = resolve(
  process.argv[3] ?? "work/personal-stamp-baseline/2026-11-10T12-23-20.143Z",
);
report.masterDirectory = masterDirectory;
for (const f of [...FIXTURES, ...extra]) {
  let master;
  if (FIXTURES.includes(f)) {
    const file = readFileSync(resolve(masterDirectory, `${f.id}.form`));
    master = openSculptProject(
      file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
    ).activeLayer.volume;
  }
  for (const n of [64, 128, 192]) {
    const d = new SDFVolume(n, 1, false);
    const generation = timed(() => {
      if (master && n === 192) {
        d.values.set(master.values);
        return;
      }
      for (let z = 0; z < n; z++)
        for (let y = 0; y < n; y++)
          for (let x = 0; x < n; x++)
            d.values[d.index(x, y, z)] = master
              ? master.sampleLocal({ x: d.coordinate(x), y: d.coordinate(y), z: d.coordinate(z) })
              : f.sample(d.coordinate(x) * 50, d.coordinate(y) * 50, d.coordinate(z) * 50) / 50;
    });
    const denseHash = hash(d.values),
      denseMemory = process.memoryUsage();
    const mesh = timed(() => extractMesh(d)),
      positions = mesh.value.getAttribute("position").array,
      normals = mesh.value.getAttribute("normal").array;
    const denseMesh = {
      ms: mesh.ms,
      hash: hash(positions),
      normalHash: hash(normals),
      ...topology(positions),
    };
    mesh.value.dispose();
    const trace = {
      random: Array.from({ length: 4096 }, () => [
        random() * 2 - 1,
        random() * 2 - 1,
        random() * 2 - 1,
      ]),
      local: Array.from({ length: 4096 }, () => [
        0.1 + random() * 0.08,
        0.1 + random() * 0.08,
        random() * 0.08,
      ]),
      scan: Array.from({ length: 4096 }, (_, i) => [
        (i % n) * d.step - 1,
        (Math.floor(i / n) % n) * d.step - 1,
        0,
      ]),
    };
    for (const b of [8, 16]) {
      global.gc?.();
      const before = process.memoryUsage(),
        conversion = timed(() => new BrickVolume(d, b)),
        s = conversion.value;
      const after = process.memoryUsage();
      let mismatches = 0;
      const verify = timed(() => {
        for (let i = 0; i < d.values.length; i++)
          if (!Object.is(d.values[i], s.readVoxel(i))) mismatches++;
      });
      assert.equal(mismatches, 0);
      const row = {
        id: f.id,
        masterHash: master ? hash(master.values) : null,
        n,
        b,
        denseHash,
        generationMs: generation.ms,
        denseValuesBytes: d.values.byteLength,
        denseValuesScratchBytes: d.values.byteLength * 2,
        denseMemory,
        conversionMs: conversion.ms,
        verifyMs: verify.ms,
        exactSampleMismatches: mismatches,
        allocatedBricks: s.totalBricks - s.constantBricks,
        totalBricks: s.totalBricks,
        occupancyPct: (100 * (s.totalBricks - s.constantBricks)) / s.totalBricks,
        candidateFourVoxelBandBricks: s.surfaceCandidateBricks,
        candidateFourVoxelBandPayloadBytes: s.surfaceCandidateBricks * b ** 3 * 4,
        typedBytes: s.typedBytes,
        metadataAllowanceBytes: s.metadataAllowanceBytes,
        haloBytes: 0,
        scratchBytes: 0,
        conversionScratchAllowanceBytes: s.conversionScratchAllowanceBytes,
        calculatedConversionPeakWithDenseBytes:
          d.values.byteLength * 2 +
          s.typedBytes +
          s.metadataAllowanceBytes +
          s.conversionScratchAllowanceBytes,
        memoryBefore: before,
        memoryAfter: after,
        lookups: {},
        maxInterpolationDeviation: 0,
        maxNormalDeviation: 0,
        referenceNearSurfaceFieldMaxMM: 0,
        referenceNearSurfaceSignDisagreements: 0,
      };
      for (const [name, points] of Object.entries(trace)) {
        const trials = [];
        for (let trial = 0; trial < 4; trial++) {
          const result = {};
          for (const [label, v] of report.rows.length % 2
            ? [
                ["sparse", s],
                ["dense", d],
              ]
            : [
                ["dense", d],
                ["sparse", s],
              ]) {
            const t = timed(() => {
              let sum = 0;
              for (const p of points) sum += v.sampleLocal({ x: p[0], y: p[1], z: p[2] });
              return sum;
            });
            result[label] = { ms: t.ms, checksum: t.value };
          }
          assert.equal(result.dense.checksum, result.sparse.checksum);
          trials.push(result);
        }
        row.lookups[name] = trials;
        for (const p of points) {
          const q = { x: p[0], y: p[1], z: p[2] },
            a = d.sampleLocal(q),
            c = s.sampleLocal(q);
          row.maxInterpolationDeviation = Math.max(row.maxInterpolationDeviation, Math.abs(a - c));
          if (Math.abs(a) <= 4 * d.step) {
            const na = d.normalAt(p),
              nc = s.normalAt(p);
            row.maxNormalDeviation = Math.max(
              row.maxNormalDeviation,
              ...na.map((v, i) => Math.abs(v - nc[i])),
            );
            const ref = f.sample(...p.map((v) => v * 50));
            row.referenceNearSurfaceFieldMaxMM = Math.max(
              row.referenceNearSurfaceFieldMaxMM,
              Math.abs(a * 50 - ref),
            );
            if (a < 0 !== ref < 0) row.referenceNearSurfaceSignDisagreements++;
          }
        }
      }
      // Read-only min/max field evaluation, NOT a production stamp/history timing.
      row.repeatedStampSampling = [];
      for (const boundsScale of [0.5, 1, 2]) {
        const points = trace.random;
        const times = { boundsScale, poses: POSES.length, samplesPerPose: points.length };
        for (const [label, v] of [
          ["dense", d],
          ["sparse", s],
        ])
          times[label] = timed(() => {
            let sum = 0;
            for (const pose of POSES)
              for (const p of points) {
                const a = pose.rotationXYZ[1],
                  x = (p[0] * boundsScale - pose.positionMM[0] / 50) / pose.uniformScale,
                  y = (p[1] * boundsScale - pose.positionMM[1] / 50) / pose.uniformScale,
                  z = (p[2] * boundsScale) / pose.uniformScale;
                sum += Math.min(
                  0.1,
                  v.sampleLocal({
                    x: x * Math.cos(a) + z * Math.sin(a),
                    y,
                    z: -x * Math.sin(a) + z * Math.cos(a),
                  }) * pose.uniformScale,
                );
              }
            return sum;
          });
        assert.equal(times.dense.value, times.sparse.value);
        row.repeatedStampSampling.push(times);
      }
      const sm = timed(() => extractMesh(s));
      row.denseMesh = denseMesh;
      row.sparseMesh = {
        ms: sm.ms,
        hash: hash(sm.value.getAttribute("position").array),
        normalHash: hash(sm.value.getAttribute("normal").array),
      };
      assert.equal(row.sparseMesh.hash, denseMesh.hash);
      assert.equal(row.sparseMesh.normalHash, denseMesh.normalHash);
      sm.value.dispose();
      assert.equal(hash(d.values), denseHash);
      row.processMaxRSSKiB = process.resourceUsage().maxRSS;
      report.rows.push(row);
      writeFileSync(resolve(output, "metrics.json"), `${JSON.stringify(report, null, 2)}\n`);
      console.log(
        `${f.id} ${n} b${b}: exact; ${(s.typedBytes / d.values.byteLength).toFixed(3)}x values; mesh identical`,
      );
    }
  }
}
console.log(output);
function topology(a) {
  const vertices = new Map(),
    edges = new Map(),
    parent = [];
  let degenerate = 0;
  function id(i) {
    const k = Array.from(a.subarray(i, i + 3), (v) => Math.round(v * 1e6)).join(",");
    if (!vertices.has(k)) {
      vertices.set(k, parent.length);
      parent.push(parent.length);
    }
    return vertices.get(k);
  }
  function root(i) {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  for (let i = 0; i < a.length; i += 9) {
    const ids = [id(i), id(i + 3), id(i + 6)];
    if (new Set(ids).size < 3) {
      degenerate++;
      continue;
    }
    for (let j = 0; j < 3; j++) {
      const x = ids[j],
        y = ids[(j + 1) % 3];
      parent[root(x)] = root(y);
      const k = x < y ? `${x},${y}` : `${y},${x}`;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  }
  return {
    triangles: a.length / 9,
    vertices: vertices.size,
    components: new Set(parent.map((_, i) => root(i))).size,
    boundaryEdges: [...edges.values()].filter((n) => n === 1).length,
    nonmanifoldEdges: [...edges.values()].filter((n) => n > 2).length,
    degenerateWeldedTriangles: degenerate,
    euler: vertices.size - edges.size + a.length / 9 - degenerate,
  };
}
