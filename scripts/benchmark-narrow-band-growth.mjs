/** Phase 8.3b follow-up. Grow an empty field with committed local edits. */
import "./compile-core.mjs";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { resolve } from "node:path";
import {
  AnalyticField,
  BandCache,
  brickCoords,
  bricksIn,
  ENTRY_ALLOWANCE,
  PAGE_BYTES,
  publishStroke,
  stageStroke,
} from "./research/narrow-band.mjs";
import {
  chunkMesh,
  compareMeshes,
  memory,
  timed,
  topology,
} from "./research/narrow-band-evidence.mjs";

const width = Number(process.argv[2] ?? 3);
assert([2, 3, 4].includes(width), "Specify a 2, 3 or 4 voxel band");
const run = new Date().toISOString().replaceAll(":", "-");
const output = resolve(process.argv[3] ?? "work/narrow-band-growth", run);
mkdirSync(output, { recursive: true });

const field = new AnalyticField();
const read = (x, y, z) => field.read(x, y, z);
const cache = new BandCache(width, 1, read, true);
const signed = (x, y, z) => cache.read(x, y, z, false);
const meshes = new Map();
const history = [];
const historyLimit = 4;
const lo = [-520, -32, -32],
  hi = [520, 32, 32];

function extract(key, source) {
  const start = brickCoords(key).map((v) => v * 8);
  return chunkMesh(
    source,
    start,
    start.map((v) => v + 8),
    lo,
    hi,
  );
}

function rebuild(keys) {
  for (const key of keys) {
    const mesh = extract(key, signed);
    if (mesh.positions.length) meshes.set(key, mesh);
    else meshes.delete(key);
  }
}

function verify(keys) {
  for (const key of keys) {
    const exact = extract(key, read);
    assert.equal(meshes.has(key), exact.positions.length > 0);
    if (meshes.has(key)) compareMeshes(meshes.get(key), exact);
  }
}

const meshBytes = (mesh) => mesh.positions.byteLength + mesh.normals.byteLength;

function historyBytes() {
  const resident = new Set([...field.edits.values(), ...cache.entries.values()]);
  const saved = new Set();
  let entries = 0;
  for (const patch of history) {
    for (const table of [patch.before, patch.after, patch.cacheBefore, patch.cacheAfter]) {
      for (const [, value] of table)
        if (value instanceof Float32Array && !resident.has(value)) saved.add(value);
      entries += table.size ?? table.length;
    }
    entries += patch.affected.length;
  }
  return saved.size * PAGE_BYTES + entries * ENTRY_ALLOWANCE;
}

function resident() {
  const { payloads, payloadBytes, directoryAllowanceBytes } = cache.footprint();
  const exactEditBytes = field.edits.size * PAGE_BYTES;
  const exactDirectoryAllowanceBytes = field.edits.size * ENTRY_ALLOWANCE;
  const retainedMeshBytes = [...meshes.values()].reduce(
    (total, mesh) => total + meshBytes(mesh),
    0,
  );
  const meshDirectoryAllowanceBytes = meshes.size * ENTRY_ALLOWANCE;
  const retainedHistoryBytes = historyBytes();
  return {
    payloads,
    editPages: field.edits.size,
    meshChunks: meshes.size,
    payloadBytes,
    directoryAllowanceBytes,
    exactEditBytes,
    exactDirectoryAllowanceBytes,
    retainedMeshBytes,
    meshDirectoryAllowanceBytes,
    retainedHistoryBytes,
    workingBytes:
      payloadBytes +
      directoryAllowanceBytes +
      exactEditBytes +
      exactDirectoryAllowanceBytes +
      retainedMeshBytes +
      meshDirectoryAllowanceBytes +
      retainedHistoryBytes,
  };
}

function stroke(a, b, mode) {
  const before = resident();
  const stage = timed(() => stageStroke(field, cache, a, b, mode));
  const patch = stage.value;
  assert(patch.changed > 0);
  const previousMeshes = patch.affected.map((key) => meshes.get(key));
  const commit = timed(() => publishStroke(field, cache, patch));
  const rebuildTime = timed(() => rebuild(patch.affected));
  const newMeshes = patch.affected.map((key) => meshes.get(key)).filter(Boolean);
  const stagedPages =
    patch.after.size + patch.cacheAfter.filter(([, value]) => value instanceof Float32Array).length;
  const stageMetadataAllowanceBytes =
    (2 * patch.after.size + 3 * patch.affected.length) * ENTRY_ALLOWANCE;
  const meshTempAllowanceBytes = 2 * Math.max(0, ...newMeshes.map(meshBytes));
  const workingHighWaterBytes =
    before.workingBytes +
    stagedPages * PAGE_BYTES +
    stageMetadataAllowanceBytes +
    meshTempAllowanceBytes +
    newMeshes.reduce((total, mesh) => total + meshBytes(mesh), 0) +
    (Math.max(0, cache.entries.size - before.payloads) +
      Math.max(0, field.edits.size - before.editPages) +
      newMeshes.length) *
      ENTRY_ALLOWANCE;
  const snapshot = memory();
  verify(patch.affected);
  history.push(patch);
  if (history.length > historyLimit) history.shift();
  const changedSurfaceChunks = patch.affected.filter((key, i) => {
    const old = previousMeshes[i];
    const next = meshes.get(key);
    if (!old || !next) return old !== next;
    return (
      !Buffer.from(old.positions.buffer).equals(Buffer.from(next.positions.buffer)) ||
      !Buffer.from(old.normals.buffer).equals(Buffer.from(next.normals.buffer))
    );
  }).length;
  assert(changedSurfaceChunks > 0);
  return {
    mode,
    a,
    b,
    changedSamples: patch.changed,
    affectedChunks: patch.affected.length,
    rebuiltSurfaceChunks: newMeshes.length,
    changedSurfaceChunks,
    stageMs: stage.ms,
    publishMs: commit.ms,
    rebuildMs: rebuildTime.ms,
    workingHighWaterBytes,
    snapshot,
  };
}

const initialMemory = memory();
const strokes = [];
const checkpoints = [];
const point = (x) => [x, 12 * Math.sin(x / 24), 9 * Math.cos(x / 31)];
const distanceSteps = [10, 50, 100];
for (let step = 1; step <= 100; step++) {
  const direction = step % 2 === 1 ? -1 : 1;
  const end = direction * 10 * Math.ceil(step / 2);
  const a = point(end - direction * 10);
  const b = point(end);
  const beforePages = field.edits.size;
  strokes.push(stroke(a, b, "construct"));
  if (distanceSteps.includes(step)) {
    const patch = history.at(-1);
    const editedMeshes = patch.affected.map((key) => meshes.get(key));
    const afterPages = field.edits.size;
    const undo = timed(() => {
      publishStroke(field, cache, patch, true);
      rebuild(patch.affected);
    });
    assert.equal(field.edits.size, beforePages);
    assert(beforePages < afterPages, "Undo removed newly allocated exact pages");
    assert(field.read(...b.map(Math.round)) > 0, "Undo removed the newly built tip");
    verify(patch.affected);
    const beforeCancel = resident();
    const next = point(end + direction * 10);
    assert(stageStroke(field, cache, b, next, "construct").changed > 0);
    assert.throws(() => stageStroke(field, cache, b, next, "construct", 0), /budget/);
    assert.deepEqual(resident(), beforeCancel);
    const redo = timed(() => {
      publishStroke(field, cache, patch);
      rebuild(patch.affected);
    });
    assert.equal(field.edits.size, afterPages);
    assert(field.read(...b.map(Math.round)) < 0, "Redo restored the tip");
    for (const [i, key] of patch.affected.entries()) {
      assert.equal(meshes.has(key), Boolean(editedMeshes[i]));
      if (editedMeshes[i]) compareMeshes(meshes.get(key), editedMeshes[i]);
    }
    strokes.at(-1).checkpoint = {
      undoMs: undo.ms,
      redoMs: redo.ms,
      removedPages: afterPages - beforePages,
    };
  }
  if (step % 5 === 0) {
    // Carve the surface behind the growing tip with a production-style subtract dab.
    strokes.push(
      stroke(
        a.map((v, i) => v + (i === 1 ? 5 : 0)),
        a.map((v, i) => v + (i === 1 ? 5 : 0)),
        "subtract",
      ),
    );
  }
  if (distanceSteps.includes(step)) {
    global.gc?.();
    const snapshot = memory();
    const meshTopology = topology(meshes.values(), 1, 0.0001);
    assert.equal(meshTopology.boundaryEdges, 0);
    assert.equal(meshTopology.nonmanifoldEdges, 0);
    assert.equal(meshTopology.components, 1);
    assert.equal(meshTopology.euler, 2);
    const nominalSpanMM = step * 10;
    assert(Math.abs(meshTopology.dimensionsMM[0] - (nominalSpanMM + 12)) < 0.2);
    const denseCubeSamples = (nominalSpanMM + 33) ** 3;
    const denseTightSamples = meshTopology.dimensionsMM.reduce(
      (total, extent) => total * (Math.ceil(extent) + 21),
      1,
    );
    checkpoints.push({
      nominalSpanMM,
      strokeCount: strokes.length,
      meshTopology,
      snapshot,
      ...resident(),
      denseCubeValuesScratchBytes: denseCubeSamples * 8,
      denseTightValuesScratchBytes: denseTightSamples * 8,
    });
  }
}
// An exact reference checks all edit owners and adjacent cells independently
// of cache membership, including chunks that were removed along the way.
const candidates = new Set(meshes.keys());
for (const key of field.edits.keys()) {
  const start = brickCoords(key).map((n) => n * 8);
  for (const neighbor of bricksIn(
    start.map((n) => n - 1),
    start.map((n) => n + 7),
  ))
    candidates.add(neighbor);
}
verify(candidates);
assert.equal(field.segments.length, 0);
const report = {
  width,
  spacingMM: 1,
  historyLimit,
  runtime: process.version,
  cpu: cpus()[0]?.model,
  initialMemory,
  strokes,
  checkpoints,
  finalReferenceChunks: candidates.size,
  finalMemory: memory(),
};
writeFileSync(resolve(output, "metrics.json"), JSON.stringify(report, null, 2));
console.log(output);
