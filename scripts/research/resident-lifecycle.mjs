import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { setImmediate as settle } from "node:timers/promises";
import { BulkMeshRebuild, stagePageMap } from "./bulk-revision.mjs";
import { changedChunks } from "./changed-chunks.mjs";
import {
  AnalyticField,
  BandCache,
  brickCoords,
  bricksIn,
  ENTRY_ALLOWANCE,
  FAR,
  PAGE_BYTES,
  stageStroke,
} from "./narrow-band.mjs";
import {
  chunkMesh,
  compareMeshes,
  memory,
  meshBuffers,
  timed,
  topology,
} from "./narrow-band-evidence.mjs";
import { createHalo, PerfCache } from "./narrow-band-perf.mjs";

const [tracePath, output, roundsArg, mode] = process.argv.slice(2);
const bulk = mode === "bulk";
const rounds = Number(roundsArg);
assert(Number.isInteger(rounds) && rounds >= 2 && rounds <= 12);
const fixture = JSON.parse(readFileSync(tracePath, "utf8"));
assert(fixture.complete);
const trace = fixture.cases.find((c) => c.kind === "branch").strokes;
assert(trace.length > 0 && trace.length <= 300);
const lo = [-540, -540, -540],
  hi = [540, 540, 540];
const field = new AnalyticField();
const exact = (x, y, z) => field.read(x, y, z);
const cache = new BandCache(3, 1, exact, true);
cache.entry = () => undefined;
const source = new PerfCache(FAR, 1, exact, true, "linear");
source.entries = field.edits;
const halo = createHalo(source, lo, hi, 8);
const meshes = new Map();
const undo = [];
const redo = [];
const historyLimit = 4;
const maxResetPages = 4096;
const meshBytes = (m) => m.positions.byteLength + m.normals.byteLength;
const points = [];
const bulkRuns = [];
let edits = 0,
  erasedPages = 0,
  refused = 0,
  cancelled = 0,
  peak = 0,
  peakWorking = 0;
const durations = { brush: [], reset: [], undo: [], redo: [] };

function footprint() {
  const live = new Set(field.edits.values());
  const saved = new Set();
  let historyDirectory = 0;
  for (const patch of [...undo, ...redo]) {
    historyDirectory +=
      (patch.before.size + patch.after.size + patch.dirty.length) * ENTRY_ALLOWANCE;
    for (const table of [patch.before, patch.after])
      for (const page of table.values()) if (page && !live.has(page)) saved.add(page);
  }
  const exactBytes = live.size * PAGE_BYTES;
  const historyBytes = saved.size * PAGE_BYTES;
  const directory = (live.size + meshes.size) * ENTRY_ALLOWANCE + historyDirectory;
  const geometry = [...meshes.values()].reduce((total, mesh) => total + meshBytes(mesh), 0);
  return {
    livePages: live.size,
    historyPages: saved.size,
    exactBytes,
    historyBytes,
    directory,
    geometry,
    scratch: halo.scratchBytes,
    historyActions: undo.length + redo.length,
    retained: exactBytes + historyBytes + directory + geometry + halo.scratchBytes,
  };
}

function digest(entries) {
  const hash = createHash("sha256");
  const id = Buffer.alloc(4);
  for (const [key, arrays] of [...entries].sort(([a], [b]) => a - b)) {
    id.writeUInt32LE(key);
    hash.update(id);
    for (const array of arrays) {
      id.writeUInt32LE(array.byteLength);
      hash.update(id);
      hash.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
    }
  }
  return hash.digest("hex");
}

const fieldHash = () => digest([...field.edits].map(([key, page]) => [key, [page]]));
const meshHash = () =>
  digest([...meshes].map(([key, mesh]) => [key, [mesh.positions, mesh.normals]]));
const referenceChunks = (key) => {
  const start = brickCoords(key).map((n) => n * 8);
  return bricksIn(
    start.map((n) => n - 2),
    start.map((n) => n + 9),
  );
};
function extract(key) {
  const min = brickCoords(key).map((n, i) => n * 8 - lo[i]);
  return meshBuffers(
    halo.region(
      min,
      min.map((n) => n + 8),
    ),
  );
}

function rebuild(dirty) {
  let biggest = 0;
  let peakMeshDelta = 0;
  let meshDelta = 0;
  for (const key of dirty) {
    const mesh = extract(key);
    const old = meshes.get(key);
    const bytes = meshBytes(mesh);
    biggest = Math.max(biggest, bytes);
    peakMeshDelta = Math.max(peakMeshDelta, meshDelta + bytes);
    meshDelta += bytes - (old ? meshBytes(old) : 0);
    if (mesh.positions.length) meshes.set(key, mesh);
    else meshes.delete(key);
  }
  return peakMeshDelta + 2 * biggest;
}

function apply(patch, reverse = false) {
  for (const [key, page] of reverse ? patch.before : patch.after) {
    if (page) field.edits.set(key, page);
    else field.edits.delete(key);
  }
  return rebuild(patch.dirty);
}

function commit(patch, mode, stagingAllowance = 0) {
  const before = footprint();
  const published = timed(() => apply(patch));
  durations[mode].push(published.ms);
  redo.length = 0;
  undo.push(patch);
  if (undo.length > historyLimit) undo.shift();
  const after = footprint();
  peak = Math.max(peak, after.retained);
  const newPageBytes = [...patch.after.values()].filter(Boolean).length * PAGE_BYTES;
  const patchDirectory =
    (patch.before.size + patch.after.size + patch.dirty.length) * ENTRY_ALLOWANCE;
  peakWorking = Math.max(
    peakWorking,
    before.retained +
      newPageBytes +
      patchDirectory +
      stagingAllowance +
      published.value +
      Math.max(0, after.directory - before.directory),
  );
}

function brush({ a, b, mode }) {
  const patch = stageStroke(field, cache, a, b, mode);
  if (!patch.changed) return;
  const dirty = changedChunks(patch, (key) => meshes.has(key));
  // Only exact FAR pages are interchangeable with the implicit background.
  for (const [key, page] of patch.after)
    if (page.every((value) => value === FAR)) patch.after.set(key, undefined);
  commit(
    { before: patch.before, after: patch.after, dirty },
    "brush",
    patch.affected.length * 3 * ENTRY_ALLOWANCE,
  );
  edits++;
}

function reset(predicate, limit = maxResetPages) {
  const before = new Map();
  for (const [key, page] of field.edits) {
    if (!predicate(key)) continue;
    if (before.size >= limit) throw new Error("Reset page budget");
    before.set(key, page);
  }
  if (!before.size) return;
  const after = new Map([...before.keys()].map((key) => [key, undefined]));
  const dirty = new Set();
  for (const key of before.keys()) for (const neighbor of referenceChunks(key)) dirty.add(neighbor);
  commit({ before, after, dirty: [...dirty] }, "reset");
  erasedPages += before.size;
}

function transfer(from, to, reverse) {
  const patch = from.pop();
  assert(patch);
  const before = footprint();
  const result = timed(() => apply(patch, reverse));
  durations[reverse ? "undo" : "redo"].push(result.ms);
  to.push(patch);
  const after = footprint();
  peak = Math.max(peak, after.retained);
  peakWorking = Math.max(
    peakWorking,
    before.retained + result.value + Math.max(0, after.directory - before.directory),
  );
}

function audit() {
  const keys = new Set(meshes.keys());
  for (const key of field.edits.keys())
    for (const neighbor of referenceChunks(key)) keys.add(neighbor);
  for (const key of keys) {
    const min = brickCoords(key).map((v) => v * 8);
    const reference = chunkMesh(
      exact,
      min,
      min.map((v) => v + 8),
      lo,
      hi,
    );
    const actual = meshes.get(key);
    assert.equal(Boolean(actual), Boolean(reference.positions.length));
    if (actual) compareMeshes(actual, reference);
  }
  const surface = topology(meshes.values(), 1, 0.0001);
  assert.equal(surface.boundaryEdges, 0);
  assert.equal(surface.nonmanifoldEdges, 0);
  return surface;
}

async function checkpoint(cycle, phase, verify = false) {
  const surface = verify ? audit() : null;
  global.gc?.();
  const immediateMemory = memory();
  await settle();
  global.gc?.();
  await settle();
  const processMemory = memory();
  assert(processMemory.rss < 850 * 1024 ** 2, "Research RSS ceiling");
  points.push({ cycle, phase, ...footprint(), immediateMemory, processMemory, surface });
  save(false);
}

function save(complete) {
  const data = {
    complete,
    rounds,
    edits,
    erasedPages,
    refused,
    cancelled,
    peak,
    peakWorking,
    points,
    durations,
    bulkRuns,
    memory: memory(),
  };
  writeFileSync(`${output}.tmp`, JSON.stringify(data, null, 2));
  renameSync(`${output}.tmp`, output);
}

function publishField(next) {
  field.edits = next;
  source.entries = next;
}

async function bulkCycle(cycle, policy) {
  for (const stroke of trace) brush(stroke);
  const exactFieldHash = fieldHash();
  const exactMeshHash = meshHash();
  const originalKeys = [...meshes.keys()];
  assert(originalKeys.length > 0);
  const before = field.edits;
  const after = new Map();
  const dirty = new Set(originalKeys);
  for (const key of before.keys()) for (const neighbor of referenceChunks(key)) dirty.add(neighbor);
  const patch = { before, after, dirty: [...dirty] };
  let failMesh = false;
  let liveMeshBytes = footprint().geometry;
  let meshHighWater = liveMeshBytes;
  const pending = new BulkMeshRebuild(
    (key) => {
      const mesh = extract(key);
      if (failMesh) {
        failMesh = false;
        throw new Error("Injected extraction failure");
      }
      return mesh;
    },
    (key, mesh) => {
      const old = meshes.get(key);
      const next = meshBytes(mesh);
      meshHighWater = Math.max(meshHighWater, liveMeshBytes + 3 * next);
      liveMeshBytes += next - (old ? meshBytes(old) : 0);
      if (next) meshes.set(key, mesh);
      else meshes.delete(key);
    },
  );
  pending.begin(originalKeys);
  publishField(after);
  undo.push(patch);
  if (undo.length > historyLimit) undo.shift();
  if (policy === "fully-erased") {
    while (pending.pending) pending.slice();
  } else for (let i = 0; i < 3; i++) pending.slice();
  const oldPending = pending.pending;
  const oldRevision = pending.revision;
  const oldMeshHash = meshHash();
  const oldFieldHash = fieldHash();
  const oldHistory = undo.slice();
  const oldQueue = [...pending.queue.pending];
  const missing = originalKeys.filter((key) => !meshes.has(key));
  assert(missing.length && (policy === "fully-erased" ? oldPending === 0 : oldPending > 0));
  const stale = extract(missing[0]);
  assert.equal(stale.positions.length, 0);

  assert.throws(
    () =>
      stagePageMap(field.edits, patch.before, (count) => {
        if (count === 257) throw new Error("Injected staged page failure");
      }),
    /staged page failure/,
  );
  assert.equal(fieldHash(), oldFieldHash);
  assert.equal(meshHash(), oldMeshHash);
  assert.deepEqual(undo, oldHistory);
  assert.equal(redo.length, 0);
  assert.equal(pending.pending, oldPending);
  assert.equal(pending.revision, oldRevision);
  assert.deepEqual([...pending.queue.pending], oldQueue);

  const start = performance.now();
  const next = stagePageMap(field.edits, patch.before);
  const keys =
    policy === "reuse-survivors" || policy === "fully-erased"
      ? missing
      : policy === "known-surface"
        ? [...missing, ...originalKeys.filter((key) => meshes.has(key))]
        : [...new Set([...missing, ...patch.dirty])];
  const beforeCommit = performance.now();
  pending.begin(keys);
  publishField(next);
  redo.push(undo.pop());
  const publishedAt = performance.now();
  assert.equal(fieldHash(), exactFieldHash);
  assert.equal(pending.publish(oldRevision, missing[0], stale), false);
  assert.equal(meshHash(), oldMeshHash);

  failMesh = true;
  assert.throws(() => pending.slice(), /extraction failure/);
  assert.equal(pending.pending, keys.length);
  assert.equal(meshHash(), oldMeshHash);
  assert.equal(fieldHash(), exactFieldHash);
  assert.equal(redo.at(-1), patch);
  const retryStart = performance.now();
  let firstGeometryMs;
  let slices = 0;
  while (pending.pending) {
    await settle();
    pending.slice();
    slices++;
    if (firstGeometryMs === undefined && meshes.has(missing[0]))
      firstGeometryMs = performance.now() - retryStart;
  }
  const finished = performance.now();
  assert(Number.isFinite(firstGeometryMs));
  assert.equal(meshHash(), exactMeshHash);
  if (cycle === 1) audit();
  const restorationMemory = footprint();
  const queue = pending.queue;
  const peakModel =
    restorationMemory.retained -
    restorationMemory.geometry +
    meshHighWater +
    (keys.length + queue.peak) * ENTRY_ALLOWANCE;
  // Full redo can invalidate the known restored chunk set, then drain to empty.
  const redoField = stagePageMap(
    field.edits,
    patch.after.size ? patch.after : [...patch.before.keys()].map((key) => [key, undefined]),
  );
  pending.begin(originalKeys);
  publishField(redoField);
  undo.push(redo.pop());
  while (pending.pending) {
    await settle();
    pending.slice();
  }
  assert.equal(field.edits.size, 0);
  assert.equal(meshes.size, 0);
  undo.length = 0;
  const usage = memory();
  assert(usage.rss < 850 * 1024 ** 2, "Research RSS ceiling");
  bulkRuns.push({
    cycle,
    policy,
    oldPending,
    dirtyPlan: keys.length,
    peakQueue: queue.peak,
    slices,
    prepareMs: beforeCommit - start,
    commitMs: publishedAt - beforeCommit,
    firstGeometryMs,
    retryDrainMs: finished - retryStart,
    totalUndoMs: publishedAt - start + finished - retryStart,
    sliceMs: queue.slices.map((slice) => slice.ms),
    peakModel,
    usage,
  });
  save(false);
}

if (bulk) {
  for (let cycle = 1; cycle <= rounds; cycle++) {
    const policies = ["conservative", "known-surface", "reuse-survivors", "fully-erased"];
    const rotate = (cycle - 1) % policies.length;
    for (const policy of [...policies.slice(rotate), ...policies.slice(0, rotate)])
      await bulkCycle(cycle, policy);
  }
  save(true);
} else {
  const tiny = { a: [4, 4, 4], b: [4, 4, 4], mode: "construct" };
  let referenceField, referenceMesh;
  await checkpoint(0, "initial");
  for (let cycle = 1; cycle <= rounds; cycle++) {
    for (const stroke of trace) brush(stroke);
    referenceField ??= fieldHash();
    referenceMesh ??= meshHash();
    assert.equal(fieldHash(), referenceField);
    assert.equal(meshHash(), referenceMesh);
    await checkpoint(cycle, "grown", true);

    const tail = (key) => brickCoords(key)[0] >= 24;
    assert.throws(() => reset(tail, 0), /budget/);
    refused++;
    assert.equal(fieldHash(), referenceField);
    assert.equal(meshHash(), referenceMesh);
    reset(tail);
    const partialField = fieldHash(),
      partialMesh = meshHash();
    assert.notEqual(partialField, referenceField);
    await checkpoint(cycle, "tail removed", cycle === 1 || cycle === rounds);
    transfer(undo, redo, true);
    assert.equal(fieldHash(), referenceField);
    assert.equal(meshHash(), referenceMesh);
    const beforeCancel = footprint();
    const dab = { a: [0, 35, 0], b: [0, 35, 0] };
    assert(stageStroke(field, cache, dab.a, dab.b, "construct").changed > 0);
    cancelled++;
    assert.throws(() => stageStroke(field, cache, dab.a, dab.b, "construct", 0), /budget/);
    refused++;
    assert.deepEqual(footprint(), beforeCancel);
    assert.equal(fieldHash(), referenceField);
    assert.equal(meshHash(), referenceMesh);
    transfer(redo, undo, false);
    assert.equal(fieldHash(), partialField);
    assert.equal(meshHash(), partialMesh);
    transfer(undo, redo, true);
    reset(() => true);
    assert.equal(field.edits.size, 0);
    assert.equal(meshes.size, 0);
    await checkpoint(cycle, "empty with Undo");
    transfer(undo, redo, true);
    assert.equal(fieldHash(), referenceField);
    assert.equal(meshHash(), referenceMesh);
    transfer(redo, undo, false);
    assert.equal(field.edits.size, 0);
    assert.equal(meshes.size, 0);
    // Four real small actions evict the large reset and the other large patches.
    for (let i = 0; i < 2; i++) {
      brush(tiny);
      reset(() => true);
    }
    assert.equal(field.edits.size, 0);
    assert.equal(meshes.size, 0);
    assert(footprint().historyPages < 96);
    await checkpoint(cycle, "empty after eviction");
  }
  save(true);
}
