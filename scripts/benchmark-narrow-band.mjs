/** Disposable offline Phase 8.3b matrix. No production data or service access. */
import "./compile-core.mjs";
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { resolve } from "node:path";
import { openSculptProject } from "../work/test-build/project.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { FIXTURES, POSES } from "./fixtures/personal-stamp-baseline.mjs";
import {
  AnalyticField,
  BandCache,
  brickCoords,
  bricksIn,
  capsule,
  ENTRY_ALLOWANCE,
  PAGE_BYTES,
  publishStroke,
  sampler,
  stageStroke,
  summarize,
} from "./research/narrow-band.mjs";
import {
  chunkMesh,
  compareMeshes,
  hash,
  memory,
  meshAdapter,
  meshBuffers,
  randomGenerator,
  timed,
  topology,
} from "./research/narrow-band-evidence.mjs";

const widths = [2, 3, 4];
const masterDirectory = resolve(
  process.argv[3] ?? "work/personal-stamp-baseline/2026-11-10T12-23-20.143Z",
);
const output = resolve(
  process.argv[2] ?? "work/narrow-band",
  new Date().toISOString().replaceAll(":", "-"),
);
mkdirSync(output, { recursive: true });
const report = {
  date: new Date().toISOString(),
  runtime: process.version,
  cpu: cpus()[0]?.model,
  masterDirectory,
  memoryScope:
    "RSS, maxRSS and heap snapshots cover the whole Node process. Typed byte lengths and directory allowances are separate.",
  masters: [],
  large: [],
  initialMemory: memory(),
};
function checkpoint() {
  report.latestMemory = memory();
  writeFileSync(resolve(output, "metrics.json"), JSON.stringify(report, null, 2));
}
console.log(output);
const baseline = JSON.parse(readFileSync(resolve(masterDirectory, "baseline.json"), "utf8"));
const random = randomGenerator(8302);
const probes = Array.from({ length: 4096 }, () => [random(), random(), random()]);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function paired(dense, sparse, trace, repeats, csg = false) {
  function evaluate(sample) {
    let sum = 0;
    for (let pass = 0; pass < repeats; pass++)
      for (const [x, y, z, scale] of trace) {
        const value = sample(x, y, z) * scale;
        sum += csg ? Math.min(0.1, value) : value;
      }
    return sum;
  }
  return Array.from({ length: 5 }, (_, i) => {
    let a, b;
    if (i % 2 === 0) {
      a = timed(() => evaluate(dense));
      b = timed(() => evaluate(sparse));
    } else {
      b = timed(() => evaluate(sparse));
      a = timed(() => evaluate(dense));
    }
    assert.equal(a.value, b.value);
    return { denseMs: a.ms, sparseMs: b.ms, ratio: b.ms / a.ms, checksum: a.value };
  });
}

function masterCase(
  volume,
  id,
  meshCheck,
  coResidentBytes,
  fileAllowanceBytes = 0,
  featureProbes = [],
) {
  const lo = volume.latticeMin,
    dims = volume.dimensions;
  const hi = lo.map((n, i) => n + dims[i] - 1),
    step = volume.step;
  const [nx, ny] = dims;
  const values = volume.values;
  const read = (x, y, z) => values[x - lo[0] + nx * (y - lo[1] + ny * (z - lo[2]))];
  const bounded = (x, y, z) =>
    read(clamp(x, lo[0], hi[0]), clamp(y, lo[1], hi[1]), clamp(z, lo[2], hi[2]));
  const keys = [...bricksIn(lo, hi)];
  const classification = timed(() => keys.map((key) => summarize(key, bounded)));
  const dense = sampler(read, lo, hi, step);
  const denseMesh = meshCheck ? meshBuffers(volume) : null;
  const exactBefore = hash(values);
  const rows = [];
  for (const width of widths) {
    global.gc?.();
    const before = memory();
    const cache = new BandCache(width, step, read);
    const conversion = timed(() => {
      for (const [i, key] of keys.entries())
        cache.install(key, cache.entry(key, bounded, classification.value[i]));
    });
    const conversionMemory = memory();
    const sparseRead = (x, y, z) => cache.read(x, y, z);
    const signedRead = (x, y, z) => cache.read(x, y, z, false);
    const sparse = sampler(sparseRead, lo, hi, step);
    const signed = sampler(signedRead, lo, hi, step);
    const adapter = meshAdapter(signedRead, lo, hi, step, -volume.extent);
    const lookups = {};
    const gridProbes = {
      random: probes.map((p) => p.map((v, i) => lo[i] + v * (dims[i] - 1))),
      local: probes.map((p) => p.map((v, i) => lo[i] + (dims[i] - 1) * 0.5 + v * 5)),
      scan: probes.map((_, i) => [
        lo[0] + (i % (nx - 1)) + 0.2,
        lo[1] + (Math.floor(i / (nx - 1)) % (ny - 1)) + 0.3,
        lo[2] + Math.floor(dims[2] / 2) + 0.1,
      ]),
    };
    for (const [name, points] of Object.entries(gridProbes))
      lookups[name] = paired(
        dense,
        sparse,
        points.map((p) => [...p, 1]),
        8,
      );
    const stamps = [0.5, 1, 2].map((ratio) => {
      const trace = POSES.flatMap((pose) => {
        const cos = Math.cos(pose.rotationXYZ[1]),
          sin = Math.sin(pose.rotationXYZ[1]);
        return probes.map((p) => {
          const x = ((2 * p[0] - 1) * ratio - pose.positionMM[0] / 50) / pose.uniformScale;
          const y = ((2 * p[1] - 1) * ratio - pose.positionMM[1] / 50) / pose.uniformScale;
          const z = ((2 * p[2] - 1) * ratio - pose.positionMM[2] / 50) / pose.uniformScale;
          return [
            (x * cos + z * sin + volume.extent) / step,
            (y + volume.extent) / step,
            (-x * sin + z * cos + volume.extent) / step,
            pose.uniformScale,
          ];
        });
      });
      return { ratio, trials: paired(dense, sparse, trace, 1, true) };
    });
    let interpolationError = 0,
      normalError = 0,
      exactProbes = 0,
      signErrors = 0,
      sentinelMagnitudeDifferences = 0;
    // Include points near both signs, then retain all near-surface comparisons.
    for (const [x, y, z] of gridProbes.random) {
      const d = dense(x, y, z);
      const approximate = signed(x, y, z);
      if (d < 0 !== approximate < 0) signErrors++;
      if (Math.abs(d - approximate) > 1e-6) sentinelMagnitudeDifferences++;
      assert.equal(sparse(x, y, z), d);
      if (Math.abs(d) > step) continue;
      exactProbes++;
      const p = [x, y, z].map((v) => -volume.extent + v * step);
      interpolationError = Math.max(
        interpolationError,
        Math.abs(d - approximate),
        Math.abs(d - volume.sampleLocal({ x: p[0], y: p[1], z: p[2] })),
      );
      const n = volume.normalAt(p),
        a = adapter.normalAt(p);
      normalError = Math.max(normalError, ...n.map((v, i) => Math.abs(v - a[i])));
    }
    assert.equal(signErrors, 0);
    assert(interpolationError <= 1e-6 && normalError <= 1e-4);
    const features = featureProbes.map(([x, y, z, expectedSign]) => {
      const grid = [x, y, z].map((v) => (v / 50 + volume.extent) / step);
      const value = dense(...grid),
        bandValue = signed(...grid);
      assert.equal(value < 0, bandValue < 0);
      return {
        pointMM: [x, y, z],
        expectedSign,
        denseSign: Math.sign(value),
        sparseSign: Math.sign(bandValue),
      };
    });
    const mesh = denseMesh ? timed(() => meshBuffers(adapter)) : null;
    if (mesh) compareMeshes(denseMesh, mesh.value);
    const footprint = cache.footprint();
    const haloOnlyPayloads = classification.value.filter(
      (b) =>
        b.min <= width * step &&
        b.max >= -width * step &&
        (b.coreMin > width * step || b.coreMax < -width * step),
    ).length;
    const working = coResidentBytes + footprint.payloadBytes + footprint.directoryAllowanceBytes;
    rows.push({
      id,
      dims,
      width,
      stepMM: step * 50,
      ...footprint,
      haloOnlyPayloads,
      haloOnlyBytes: haloOnlyPayloads * PAGE_BYTES,
      denseValuesBytes: values.byteLength,
      denseValuesScratchBytes: values.byteLength * 2,
      coResidentBytes,
      workingBytes: working,
      optimisticValuesOnlyWorkingBytes:
        values.byteLength + footprint.payloadBytes + footprint.directoryAllowanceBytes,
      classificationMs: classification.ms,
      conversionMs: conversion.ms,
      conversionAllowanceBytes: keys.length * 192, // keys + summaries; modeled, excludes GC/runtime
      fileAllowanceBytes,
      calculatedConversionWorkingBytes: working + keys.length * 192 + fileAllowanceBytes,
      before,
      conversionMemory,
      after: memory(),
      lookups,
      stamps,
      exactProbes,
      interpolationError,
      normalError,
      signErrors,
      sentinelMagnitudeDifferences,
      features,
      mesh: mesh && {
        ms: mesh.ms,
        positions: hash(mesh.value.positions),
        normals: hash(mesh.value.normals),
        ...topology([mesh.value], 50, 0.00005),
      },
    });
  }
  assert.equal(hash(values), exactBefore);
  return rows;
}

for (const f of FIXTURES) {
  const file = readFileSync(resolve(masterDirectory, `${f.id}.form`));
  const expected = baseline.rows.find((r) => r.id === f.id);
  assert.equal(hash(file), expected.nativeSHA256);
  const master = openSculptProject(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
  ).activeLayer.volume;
  assert.equal(hash(master.values), expected.masterHash);
  for (const n of [128, 192]) {
    const v = n === 192 ? master : new SDFVolume(n, 1, false);
    if (v !== master)
      for (let z = 0; z < n; z++)
        for (let y = 0; y < n; y++)
          for (let x = 0; x < n; x++) {
            v.values[v.index(x, y, z)] = master.sampleLocal({
              x: v.coordinate(x),
              y: v.coordinate(y),
              z: v.coordinate(z),
            });
          }
    const coResident = 2 * v.values.byteLength + (v === master ? 0 : 2 * master.values.byteLength);
    const meshCheck = [
      "hollow-part",
      "long-thin-1mm",
      "organic-curve",
      "slot-1mm",
      "slot-8mm",
    ].includes(f.id);
    report.masters.push(
      ...masterCase(v, f.id, meshCheck, coResident, 2 * file.byteLength, f.probes),
    );
    checkpoint();
  }
  assert.equal(hash(master.values), expected.masterHash);
  assert.equal(hash(readFileSync(resolve(masterDirectory, `${f.id}.form`))), expected.nativeSHA256);
  console.log("Master", f.id);
}

const grown = new SDFVolume(64, 1, false, { latticeMin: [-13, -5, 0], dimensions: [85, 75, 70] });
for (let z = 0; z < 70; z++)
  for (let y = 0; y < 75; y++)
    for (let x = 0; x < 85; x++) {
      const r = Math.hypot(
        grown.coordinate(x, 0) + 0.3,
        grown.coordinate(y, 1),
        grown.coordinate(z, 2),
      );
      grown.values[grown.index(x, y, z)] = Math.max(
        r - 0.8,
        0.62 - r,
        0.13 - Math.hypot(grown.coordinate(y, 1), grown.coordinate(z, 2)),
      );
    }
report.masters.push(
  ...masterCase(grown, "negative-grown-bored-shell", true, grown.values.byteLength * 2),
);
checkpoint();

function scenario(kind, length) {
  const segments = [];
  const n = Math.ceil(length / 10);
  const line = (i) => {
    const t = -length / 2 + (length * i) / n;
    return kind === "tube"
      ? [t, 12 * Math.sin(t / 24), 9 * Math.cos(t / 31)]
      : [t, t * 0.8, t * 0.64];
  };
  if (kind === "clusters") {
    for (let i = 0; i < 5; i++) {
      const t = (i / 4 - 0.5) * length;
      segments.push(capsule([t - 4, t * 0.65, t * 0.8], [t + 4, t * 0.65, t * 0.8], 5.25));
    }
    return { segments, center: [0, 0, 5] };
  }
  for (let i = 0; i < n; i++) segments.push(capsule(line(i), line(i + 1), 5.25));
  if (kind === "branch")
    for (let i = 0; i < Math.floor(n / 4); i++)
      segments.push(
        capsule([i * 4, -i * 6, i * 2], [(i + 1) * 4, -(i + 1) * 6, (i + 1) * 2], 4.25),
      );
  const [x, y, z] = line(Math.floor(n / 2));
  return { segments, center: [x, y, z + 5] };
}
function retainedMeshBytes(meshes) {
  let bytes = 0;
  for (const m of meshes.values()) bytes += m.positions.byteLength + m.normals.byteLength;
  return bytes;
}

for (const kind of ["tube", "branch", "clusters"])
  for (const length of [100, 500, 1000]) {
    const { segments, center } = scenario(kind, length);
    const lo = [0, 1, 2].map((i) => Math.floor(Math.min(...segments.map((s) => s.lo[i]))) - 10);
    const hi = [0, 1, 2].map((i) => Math.ceil(Math.max(...segments.map((s) => s.hi[i]))) + 10);
    const boxSamples = hi.reduce((count, v, i) => count * (v - lo[i] + 1), 1);
    for (const width of widths) {
      global.gc?.();
      const before = memory(),
        field = new AnalyticField();
      const read = (x, y, z) => field.read(x, y, z);
      const cache = new BandCache(width, 1, read, true);
      const signed = (x, y, z) => cache.read(x, y, z, false);
      const progress = [];
      let conversionStagingAllowanceBytes = 0;
      const conversion = timed(() => {
        for (const [index, segment] of segments.entries()) {
          const keys = field.append(segment);
          conversionStagingAllowanceBytes = Math.max(
            conversionStagingAllowanceBytes,
            keys.length * 16 + PAGE_BYTES,
          );
          for (const key of keys) {
            // A missing page can enter the band only if the new capsule's
            // expanded bounds meet its padded samples. Already cached pages
            // refresh all exact values, including those outside the band.
            if (
              !cache.entries.has(key) &&
              brickCoords(key).some(
                (b, i) => b * 8 + 9 < segment.lo[i] - width || b * 8 - 2 > segment.hi[i] + width,
              )
            )
              continue;
            cache.install(key, cache.entry(key, read));
          }
          if (index === 0 || (index + 1) % 10 === 0 || index === segments.length - 1) {
            progress.push({
              segments: index + 1,
              indexedBricks: field.bins.size,
              ...cache.footprint(),
            });
          }
        }
      });
      const conversionMemory = memory();
      for (const p of probes) {
        const xyz = p.map((v, i) => Math.floor(lo[i] + v * (hi[i] - lo[i])));
        assert.equal(read(...xyz), field.brute(...xyz));
        assert.equal(cache.read(...xyz), read(...xyz));
        assert.equal(signed(...xyz) < 0, read(...xyz) < 0);
      }
      const meshes = new Map();
      function rebuild(keys, source, target) {
        for (const key of keys) {
          const low = brickCoords(key).map((n) => n * 8);
          const high = low.map((n, i) => Math.min(n + 8, hi[i]));
          const start = low.map((n, i) => Math.max(n, lo[i]));
          if (high.some((n, i) => n <= start[i])) continue;
          const m = chunkMesh(source, start, high, lo, hi);
          if (m.positions.length) target.set(key, m);
          else target.delete(key);
        }
      }
      const baselineMesh = timed(() => rebuild(cache.entries.keys(), signed, meshes));
      const referenceMesh = new Map();
      // All analytic support bins for independent coverage. For 100 mm also
      // use exhaustive primitive evaluation, independent of the numeric index.
      const reference = length === 100 ? (x, y, z) => field.brute(x, y, z) : read;
      const denseReference = timed(() => rebuild(field.bins.keys(), reference, referenceMesh));
      assert.equal(meshes.size, referenceMesh.size);
      for (const [key, mesh] of referenceMesh) compareMeshes(meshes.get(key), mesh);
      referenceMesh.clear();
      const topo = topology(meshes.values(), 1, 0.0001);
      assert.equal(topo.boundaryEdges, 0);
      assert.equal(topo.nonmanifoldEdges, 0);
      assert.equal(topo.components, kind === "clusters" ? 5 : 1);
      assert.equal(topo.euler, kind === "clusters" ? 10 : 2);
      assert(
        Math.abs(topo.dimensionsMM[0] - (kind === "clusters" ? length + 18.5 : length + 10.5)) <
          0.2,
      );
      const tileLo = center.map((v) => Math.floor(v) - 16),
        tileHi = tileLo.map((v) => v + 32);
      const tile = Float32Array.from({ length: 33 ** 3 }, (_, i) =>
        field.brute(
          tileLo[0] + (i % 33),
          tileLo[1] + (Math.floor(i / 33) % 33),
          tileLo[2] + Math.floor(i / 33 ** 2),
        ),
      );
      const denseTile = sampler(
        (x, y, z) => tile[x - tileLo[0] + 33 * (y - tileLo[1] + 33 * (z - tileLo[2]))],
        tileLo,
        tileHi,
        1,
      );
      const sparseTile = sampler((x, y, z) => cache.read(x, y, z), tileLo, tileHi, 1);
      const localLookups = paired(
        denseTile,
        sparseTile,
        probes.map((p) => [...p.map((v, i) => tileLo[i] + v * 32), 1]),
        8,
      );
      let analyticSurfaceResidualMM = 0;
      for (const { positions } of meshes.values())
        for (let i = 0; i < positions.length; i += 96)
          analyticSurfaceResidualMM = Math.max(
            analyticSurfaceResidualMM,
            Math.abs(field.brute(positions[i], positions[i + 1], positions[i + 2])),
          );
      const strokeTrials = [];
      const a = center.map((v, i) => v - (i === 0 ? 5 : 0)),
        b = center.map((v, i) => v + (i === 0 ? 5 : 0));
      const baseFootprint = cache.footprint();
      const baseMeshBytes = retainedMeshBytes(meshes);
      let peakStrokeBytes = 0;
      const binLinks = [...field.bins.values()].reduce((n, bin) => n + bin.length, 0);
      const exactSourceAllowanceBytes =
        field.bins.size * ENTRY_ALLOWANCE + binLinks * 8 + segments.length * 256;
      const exactBaseline = hash(
        Float32Array.from(probes, ([u, v, w]) =>
          read(
            Math.floor(a[0] - 8 + 26 * u),
            Math.floor(a[1] - 8 + 16 * v),
            Math.floor(a[2] - 8 + 16 * w),
          ),
        ),
      );
      for (const mode of ["add", "subtract", "smooth"])
        for (let trial = 0; trial < 4; trial++) {
          const staged = timed(() => stageStroke(field, cache, a, b, mode));
          const patch = staged.value;
          assert(patch.changed > 0);
          assert.equal(field.edits.size, 0);
          assert.deepEqual(cache.footprint(), baseFootprint);
          // Cancel by discarding the uncommitted patch. Preflight failure is also safe.
          if (trial === 0) {
            assert.throws(() => stageStroke(field, cache, a, b, mode, 0), /budget/);
            strokeTrials.push({
              mode,
              cancel: true,
              stageMs: staged.ms,
              affectedChunks: patch.affected.length,
              changed: patch.changed,
            });
            continue;
          }
          const oldMeshes = new Map(patch.affected.map((key) => [key, meshes.get(key)]));
          const oldDirtyBytes = [...oldMeshes.values()].reduce(
            (n, m) => n + (m ? m.positions.byteLength + m.normals.byteLength : 0),
            0,
          );
          const commit = timed(() => publishStroke(field, cache, patch));
          const dirty = timed(() => rebuild(patch.affected, signed, meshes));
          const exactDirty = new Map();
          rebuild(patch.affected, read, exactDirty);
          for (const key of patch.affected) {
            assert.equal(meshes.has(key), exactDirty.has(key));
            if (meshes.has(key)) compareMeshes(meshes.get(key), exactDirty.get(key));
          }
          // Dirty topology tests use the full combined published mesh on the first commit.
          if (trial === 1) {
            const edited = topology(meshes.values(), 1, 0.0001);
            assert.equal(edited.boundaryEdges, 0);
            assert.equal(edited.nonmanifoldEdges, 0);
            assert.equal(edited.euler, topo.euler);
            assert.equal(edited.components, topo.components);
          }
          const cacheStagingBytes =
            patch.cacheAfter.filter(([, v]) => v instanceof Float32Array).length * PAGE_BYTES;
          const oldCacheHistoryBytes =
            patch.cacheBefore.filter(([, v]) => v instanceof Float32Array).length * PAGE_BYTES;
          const exactEditBytes = patch.after.size * PAGE_BYTES;
          const auxiliaryAllowanceBytes =
            (patch.affected.length * 4 + patch.after.size * 3) * ENTRY_ALLOWANCE;
          const newDirtyBytes = retainedMeshBytes(exactDirty);
          const meshStagingAllowanceBytes = Math.max(
            0,
            ...[...exactDirty.values()].map(
              (m) => 2 * (m.positions.byteLength + m.normals.byteLength),
            ),
          );
          const workingBytes =
            exactSourceAllowanceBytes +
            baseFootprint.payloadBytes +
            baseFootprint.directoryAllowanceBytes +
            baseMeshBytes +
            2 * newDirtyBytes +
            meshStagingAllowanceBytes +
            cacheStagingBytes +
            exactEditBytes +
            auxiliaryAllowanceBytes +
            meshes.size * ENTRY_ALLOWANCE;
          peakStrokeBytes = Math.max(peakStrokeBytes, workingBytes);
          const undo = timed(() => publishStroke(field, cache, patch, true));
          const undoMesh = timed(() => rebuild(patch.affected, signed, meshes));
          for (const [key, m] of oldMeshes) {
            assert.equal(meshes.has(key), Boolean(m));
            if (m) compareMeshes(m, meshes.get(key));
          }
          assert.equal(field.edits.size, 0);
          const redo = timed(() => publishStroke(field, cache, patch));
          const redoMesh = timed(() => rebuild(patch.affected, signed, meshes));
          for (const [key, m] of exactDirty) compareMeshes(m, meshes.get(key));
          for (const [key, values] of patch.after)
            assert.equal(hash(field.edits.get(key)), hash(values));
          publishStroke(field, cache, patch, true);
          rebuild(patch.affected, signed, meshes);
          strokeTrials.push({
            mode,
            changed: patch.changed,
            affectedChunks: patch.affected.length,
            rebuiltSurfaceChunks: exactDirty.size,
            stageMs: staged.ms,
            commitMs: commit.ms,
            rebuildMs: dirty.ms,
            undoMs: undo.ms,
            undoMeshMs: undoMesh.ms,
            redoMs: redo.ms,
            redoMeshMs: redoMesh.ms,
            cacheStagingBytes,
            exactEditBytes,
            oldCacheHistoryBytes,
            oldDirtyBytes,
            newDirtyBytes,
            meshStagingAllowanceBytes,
            auxiliaryAllowanceBytes,
            workingBytes,
          });
        }
      assert.equal(
        hash(
          Float32Array.from(probes, ([u, v, w]) =>
            read(
              Math.floor(a[0] - 8 + 26 * u),
              Math.floor(a[1] - 8 + 16 * v),
              Math.floor(a[2] - 8 + 16 * w),
            ),
          ),
        ),
        exactBaseline,
      );
      report.large.push({
        kind,
        length,
        width,
        lo,
        hi,
        spacingMM: 1,
        progress,
        ...baseFootprint,
        exactSourceAllowanceBytes,
        conversionStagingAllowanceBytes,
        calculatedConversionBytes:
          exactSourceAllowanceBytes +
          baseFootprint.payloadBytes +
          baseFootprint.directoryAllowanceBytes +
          conversionStagingAllowanceBytes,
        conversionMs: conversion.ms,
        baselineMeshMs: baselineMesh.ms,
        referenceMeshMs: denseReference.ms,
        topology: topo,
        analyticSurfaceResidualMM,
        localLookups,
        verificationDenseTileBytes: tile.byteLength,
        retainedMeshBytes: baseMeshBytes,
        peakStrokeBytes,
        strokeTrials,
        denseTightValuesBytes: boxSamples * 4,
        denseTightValuesScratchBytes: boxSamples * 8,
        denseCubeValuesBytes: (length + 33) ** 3 * 4,
        denseCubeValuesScratchBytes: (length + 33) ** 3 * 8,
        before,
        conversionMemory,
        after: memory(),
      });
      checkpoint();
      console.log(kind, length, width, baseFootprint.payloads);
    }
  }
