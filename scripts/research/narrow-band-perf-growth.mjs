import assert from "node:assert/strict";
import { changedChunks } from "./changed-chunks.mjs";
import { chunkCost } from "./chunk-cost.mjs";
import { hasCrossing } from "./chunk-occupancy.mjs";
import { DirtyChunkQueue } from "./dirty-chunk-queue.mjs";
import {
  AnalyticField,
  BandCache,
  brickCoords,
  brickKey,
  bricksIn,
  ENTRY_ALLOWANCE,
  FAR,
  PAGE_BYTES,
  publishStroke,
  stageStroke,
} from "./narrow-band.mjs";
import {
  chunkMesh,
  compareMeshes,
  hash,
  meshBuffers,
  timed,
  topology,
} from "./narrow-band-evidence.mjs";
import { createHalo, PerfCache, patchBytes } from "./narrow-band-perf.mjs";

const spans = [100, 500, 1000];
const lo = [-540, -540, -540];
const hi = [540, 540, 540];
const byteLength = (mesh) => mesh.positions.byteLength + mesh.normals.byteLength;

function world(directory, width, memory, schedule, pace, maxChunks, preview) {
  const field = new AnalyticField();
  const exact = (x, y, z) => field.read(x, y, z);
  const cache =
    directory === "baseline"
      ? new BandCache(width, 1, exact, true)
      : new PerfCache(width, 1, exact, true, directory);
  const exactOnly = directory === "exact";
  if (exactOnly) cache.entry = () => undefined;
  const signed = exactOnly ? exact : (x, y, z) => cache.read(x, y, z, false);
  const source = exactOnly
    ? {
        gatherRow(x0, x1, y, z, target, offset) {
          for (let x = x0; x <= x1; ) {
            const count = Math.min(8 - (x & 7), x1 - x + 1);
            const page = field.edits.get(brickKey(x >> 3, y >> 3, z >> 3));
            if (page) {
              const start = (x & 7) + 8 * ((y & 7) + 8 * (z & 7));
              for (let i = 0; i < count; i++) target[offset + i] = page[start + i];
            } else target.fill(FAR, offset, offset + count);
            offset += count;
            x += count;
          }
        },
      }
    : cache;
  const halo = directory === "baseline" ? null : createHalo(source, lo, hi, 8);
  const previews = new Map();
  let previewBytes = 0;
  let previewPeakBytes = 0;
  const coarseOrigin = lo.map((n) => n / 2);
  const coarseHalo = preview
    ? createHalo(
        {
          gatherRow(x0, x1, y, z, target, offset) {
            for (let x = x0; x <= x1; x++) target[offset++] = exact(x * 2, y * 2, z * 2);
          },
        },
        coarseOrigin,
        hi.map((n) => n / 2),
        4,
        2,
      )
    : null;
  function coarseMesh(key) {
    const start = brickCoords(key).map((n, i) => n * 4 - coarseOrigin[i]);
    return meshBuffers(
      coarseHalo.region(
        start,
        start.map((n) => n + 4),
      ),
    );
  }
  const meshes = new Map();
  const history = [];
  const strokes = [];

  function extract(key, read, useHalo = false) {
    const start = brickCoords(key).map((n) => n * 8);
    const end = start.map((n) => n + 8);
    return useHalo && halo
      ? meshBuffers(
          halo.region(
            start.map((n, i) => n - lo[i]),
            end.map((n, i) => n - lo[i]),
          ),
        )
      : chunkMesh(read, start, end, lo, hi);
  }

  const occupancyRow = new Float32Array(9);
  let screened = 0;
  let skipped = 0;
  let occupancyMs = 0;
  const screen = schedule === "occupancy" || schedule === "deadline";
  function rebuild(keys) {
    for (const key of keys) {
      const previous = previews.get(key);
      if (previous) {
        previewBytes -= byteLength(previous);
        previews.delete(key);
      }
      if (screen) {
        const start = brickCoords(key).map((n) => n * 8);
        const checked = timed(() => hasCrossing(source, start, occupancyRow));
        occupancyMs += checked.ms;
        screened++;
        if (!checked.value) {
          meshes.delete(key);
          skipped++;
          continue;
        }
      }
      const mesh = extract(key, signed, true);
      if (mesh.positions.length) meshes.set(key, mesh);
      else meshes.delete(key);
    }
  }

  const predicted = schedule === "recent" || schedule === "classified";
  const narrowed = schedule === "narrow" || schedule === "priority" || screen || predicted;
  const classify = (key) => {
    const length = meshes.get(key)?.positions.length ?? 0;
    if (!length) return 0;
    if (length <= 9 * 96) return 1;
    return length <= 9 * 240 ? 2 : 3;
  };
  const cost = predicted
    ? schedule === "classified"
      ? chunkCost(classify, 1.25)
      : chunkCost()
    : null;
  const distance = (key, point) => {
    const x = ((key & 511) - 256) * 8 + 4 - point[0];
    const y = (((key >> 9) & 511) - 256) * 8 + 4 - point[1];
    const z = ((key >> 18) - 256) * 8 + 4 - point[2];
    return x * x + y * y + z * z;
  };
  const queue = schedule
    ? new DirtyChunkQueue(
        192,
        rebuild,
        maxChunks,
        2,
        distance,
        schedule === "priority" || schedule === "deadline",
        schedule === "deadline" ? 4 : null,
        cost,
      )
    : null;
  let backpressureTicks = 0;
  function publish(patch, undo = false) {
    const commit = () => publishStroke(field, cache, patch, undo);
    if (!queue) return commit();
    const dirty = narrowed
      ? changedChunks(patch, (key) => meshes.has(key) || queue.pending.has(key))
      : patch.affected;
    while (!queue.canAdmit(dirty)) {
      assert(queue.pending.size > 0, "Patch exceeds queue capacity");
      queue.slice();
      backpressureTicks++;
    }
    queue.publish(dirty, commit);
    return dirty;
  }

  function verify(keys) {
    for (const key of keys) {
      const reference = extract(key, exact);
      const actual = meshes.get(key);
      assert.equal(Boolean(actual), reference.positions.length > 0);
      if (actual) compareMeshes(actual, reference);
    }
  }

  function resident() {
    const { payloads, payloadBytes, directoryAllowanceBytes } = cache.footprint();
    const live = new Set([...field.edits.values(), ...cache.entries.values()]);
    const saved = new Set();
    let metadata = 0;
    for (const patch of history) {
      metadata += patch.affected.length * ENTRY_ALLOWANCE;
      for (const entries of [patch.before, patch.after, patch.cacheBefore, patch.cacheAfter]) {
        metadata += (entries.size ?? entries.length) * ENTRY_ALLOWANCE;
        for (const [, page] of entries)
          if (page instanceof Float32Array && !live.has(page)) saved.add(page);
      }
    }
    const historyBytes = saved.size * PAGE_BYTES + metadata;
    const meshBytes = [...meshes.values()].reduce((sum, mesh) => sum + byteLength(mesh), 0);
    const exactBytes = field.edits.size * PAGE_BYTES;
    const directories =
      directoryAllowanceBytes + (field.edits.size + meshes.size) * ENTRY_ALLOWANCE;
    const scratchBytes = halo?.scratchBytes ?? 0;
    return {
      payloads,
      exactPages: field.edits.size,
      meshChunks: meshes.size,
      payloadBytes,
      exactBytes,
      directories,
      historyBytes,
      meshBytes,
      scratchBytes,
      retainedBytes:
        payloadBytes + exactBytes + directories + historyBytes + meshBytes + scratchBytes,
    };
  }

  function stroke(a, b, mode) {
    // Idle slots before the next arrival, after the prior stroke's own slice.
    if (queue && strokes.length) for (let i = 1; i < pace; i++) queue.slice();
    const before = resident();
    const staged = timed(() => stageStroke(field, cache, a, b, mode));
    const patch = staged.value;
    assert(patch.changed > 0, mode);
    if (queue) queue.focus = b;
    const published = timed(() => publish(patch));
    const displayed = timed(() => {
      if (!preview) return undefined;
      const selected = [...published.value].sort((a, c) => distance(a, b) - distance(c, b));
      let chunks = 0;
      let triangles = 0;
      const start = performance.now();
      for (const key of selected) {
        const mesh = coarseMesh(key);
        const previous = previews.get(key);
        if (previous) previewBytes -= byteLength(previous);
        previews.set(key, mesh);
        previewBytes += byteLength(mesh);
        previewPeakBytes = Math.max(previewPeakBytes, previewBytes);
        triangles += mesh.positions.length / 9;
        if (++chunks === 4 || performance.now() - start >= 1) break;
      }
      return { chunks, triangles };
    });
    const remeshed = timed(() => (queue ? queue.slice() : rebuild(patch.affected)));
    const snapshot = memory();
    assert(snapshot.rss < 900 * 1024 ** 2, "Research RSS ceiling");
    const generated = patch.affected
      .map((key) => meshes.get(key))
      .filter(Boolean)
      .map(byteLength);
    const stagedBytes = patchBytes(patch);
    history.push(patch);
    if (history.length > 4) history.shift();
    const after = resident();
    strokes.push({
      mode,
      a,
      b,
      changed: patch.changed,
      dirtyChunks: published.value?.length ?? patch.affected.length,
      preview: displayed.value && {
        ...displayed.value,
        cpuMs: displayed.ms,
        retainedBytes: previewBytes,
      },
      stageMs: staged.ms,
      publishMs: published.ms,
      rebuildMs: remeshed.ms,
      totalMs: staged.ms + published.ms + remeshed.ms + (preview ? displayed.ms : 0),
      stagedBytes,
      workingBytes:
        before.retainedBytes +
        stagedBytes +
        Math.max(0, after.directories - before.directories) +
        generated.reduce((a, b) => a + b, 0) +
        2 * Math.max(0, ...generated),
      snapshot,
    });
    return patch;
  }

  function checkpoint(span, components, patch, center) {
    const changedPages = [...patch.after].map(([key, page]) => [key, hash(page)]);
    const meshBefore = patch.affected.map((key) => (queue ? extract(key, exact) : meshes.get(key)));
    const pendingAtRelease = queue?.pending.size ?? 0;
    const release = timed(() => (pace && queue ? queue.drain() : undefined));
    assert.equal(previews.size, 0, "Release must retire every preview");
    const pendingAtUndo = queue?.pending.size ?? 0;
    const undo = timed(() => {
      publish(patch, true);
      if (queue) return queue.drain();
      rebuild(patch.affected);
    });
    assert(
      [...patch.before].some(
        ([key, page]) => field.edits.get(key) === page && page !== patch.after.get(key),
      ),
    );
    for (const [key, page] of patch.before) assert.equal(field.edits.get(key), page);
    verify(patch.affected);
    const undone = resident();
    const undonePages = [...field.edits].map(([key, page]) => [key, hash(page)]);
    const cancelled = timed(() => stageStroke(field, cache, center, center, "construct"));
    assert(cancelled.value.changed > 0);
    assert.throws(() => stageStroke(field, cache, center, center, "construct", 0), /budget/);
    assert.deepEqual(resident(), undone);
    assert.deepEqual(
      [...field.edits].map(([key, page]) => [key, hash(page)]),
      undonePages,
    );
    verify(patch.affected);
    const redo = timed(() => {
      publish(patch);
      if (queue) return queue.drain();
      rebuild(patch.affected);
    });
    for (const [key, digest] of changedPages) assert.equal(hash(field.edits.get(key)), digest);
    for (const [i, key] of patch.affected.entries()) {
      assert.equal(Boolean(meshes.get(key)), Boolean(meshBefore[i]?.positions.length));
      if (meshBefore[i]?.positions.length) compareMeshes(meshes.get(key), meshBefore[i]);
    }
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
    global.gc?.();
    const snapshot = memory();
    const meshTopology = topology(meshes.values(), 1, 0.0001);
    const coarseAudit = preview ? topology([...candidates].map(coarseMesh), 1, 0.0001) : undefined;
    assert.equal(meshTopology.components, components);
    assert.equal(meshTopology.euler, 2 * components);
    assert.equal(meshTopology.boundaryEdges, 0);
    assert.equal(meshTopology.nonmanifoldEdges, 0);
    return {
      span,
      components,
      strokeCount: strokes.length,
      checkedChunks: candidates.size,
      pendingAtUndo,
      pendingAtRelease,
      coarseAudit,
      previewPeakBytes,
      previewScratchBytes: coarseHalo?.scratchBytes,
      releaseDrainTicks: release.value,
      releaseCpuMs: pace ? release.ms : undefined,
      undoDrainTicks: undo.value,
      redoDrainTicks: redo.value,
      backpressureTicks,
      undoMs: undo.ms,
      redoMs: redo.ms,
      cancelStageMs: cancelled.ms,
      removedPages: [...patch.before.values()].filter((page) => !page).length,
      meshTopology,
      ...resident(),
      snapshot,
      denseTightValuesScratchBytes:
        8 * meshTopology.dimensionsMM.reduce((a, v) => a * (Math.ceil(v) + 21), 1),
      denseCubeValuesScratchBytes: 8 * (span + 33) ** 3,
    };
  }
  return {
    stroke,
    checkpoint,
    strokes,
    haloStats: halo?.stats,
    queue,
    occupancy: () => ({ screened, skipped, occupancyMs }),
  };
}

export function growth(variant, save, memory) {
  const [directory, band, schedule, ceiling, cadence] = variant.includes("-cap")
    ? variant.split("-")
    : [...variant.split("-").slice(0, 3), "cap4", variant.split("-")[3]];
  const maxChunks = Number(ceiling.replace(/^cap/, ""));
  const preview = schedule === "preview";
  const pace = Number(cadence ?? 0);
  const width = Number(band);
  const cases = [];
  for (const kind of ["tube", "branch", "islands"]) {
    let sculpt = world(
      directory,
      width,
      memory,
      preview ? "narrow" : schedule,
      pace,
      maxChunks,
      preview,
    );
    const checkpoints = [];
    const islandStrokes = [];
    let priorSteps = 0;
    for (const span of spans) {
      let patch, center;
      if (kind === "islands") {
        sculpt = world(
          directory,
          width,
          memory,
          preview ? "narrow" : schedule,
          pace,
          maxChunks,
          preview,
        );
        for (let i = -2; i <= 2; i++) {
          const x = (i * span) / 4;
          center = [x + 4, x * 0.62 + 0.3, x * -0.71 + 0.6];
          patch = sculpt.stroke([x - 4, center[1], center[2]], center, "construct");
        }
      } else {
        const point = (x) => [
          x,
          (kind === "branch" ? 0.63 * x : 0) + 12 * Math.sin(x / 24) + 0.3,
          (kind === "branch" ? 0.71 * x : 0) + 9 * Math.cos(x / 31) + 0.6,
        ];
        const branch = (x) => [x, point(x)[1] - 1.48 * x, point(x)[2] + 0.18 * x];
        for (let i = priorSteps + 1; i <= span / 10; i++) {
          const sign = i % 2 ? -1 : 1;
          const x = sign * 10 * Math.ceil(i / 2);
          const a = point(x - sign * 10);
          center = point(x);
          if (kind === "branch") {
            const middle = point(x - sign * 5);
            sculpt.stroke(a, middle, "construct");
            patch = sculpt.stroke(middle, center, "construct");
          } else patch = sculpt.stroke(a, center, "construct");
          if (i % 5 === 0) {
            const surface = [a[0], a[1] + 5, a[2]];
            sculpt.stroke(surface, surface, "subtract");
            sculpt.stroke(surface, surface, "smooth");
          }
          if (kind === "branch" && i % 4 === 0) {
            const end = i * 1.5;
            sculpt.stroke(branch(end - 6), branch(end), "construct");
          }
        }
        priorSteps = span / 10;
        // The last action must own the allocating tip for the Undo audit.
        const outward = center.map((v, axis) => v + (axis === 0 ? 2.75 : 0));
        patch = sculpt.stroke(center, outward, "construct");
        center = outward;
      }
      const row = sculpt.checkpoint(span, kind === "islands" ? 5 : 1, patch, center);
      if (kind === "islands")
        islandStrokes.push({
          span,
          strokes: sculpt.strokes,
          queue: sculpt.queue,
          occupancy: sculpt.occupancy(),
        });
      checkpoints.push(row);
      save({
        width,
        cases: [...cases, { kind, checkpoints, strokes: sculpt.strokes, islandStrokes }],
      });
    }
    cases.push({
      kind,
      checkpoints,
      strokes: sculpt.strokes,
      islandStrokes,
      haloStats: sculpt.haloStats,
      queue: sculpt.queue,
      occupancy: sculpt.occupancy(),
    });
  }
  return { width, spacingMM: 1, cases };
}
