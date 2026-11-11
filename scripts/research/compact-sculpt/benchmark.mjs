import { SculptHistory } from "../../../src/history";
import { IncrementalMesher } from "../../../src/mesh";
import { SDFVolume } from "../../../src/sdf";
import { BrickVolume } from "../brick-volume.mjs";
import {
  AnalyticField,
  BandCache,
  ENTRY_ALLOWANCE,
  FAR,
  PAGE_BYTES,
  publishStroke,
  stageStroke,
} from "../narrow-band.mjs";

const radius = 10;
const extent = 64;
const size = 2 * extent + 1;
const dimensions = [size, size, size];
const historyLimit = 4;

const point = ([x, y, z]) => ({ x, y, z });
const index = (x, y, z) => x + size * (y + size * z);
const coordinates = (i) => [
  (i % size) - extent,
  (Math.floor(i / size) % size) - extent,
  Math.floor(i / size ** 2) - extent,
];

function measure(action) {
  const start = performance.now();
  const value = action();
  return { ms: performance.now() - start, value };
}

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function bounds(a, b, padding) {
  return {
    min: a.map((v, i) => Math.floor(Math.min(v, b[i]) - padding) + extent),
    max: a.map((v, i) => Math.ceil(Math.max(v, b[i]) + padding) + extent),
  };
}

function denseBackend() {
  const volume = new SDFVolume(size, extent, false);
  volume.values.fill(FAR);
  const history = new SculptHistory(volume, 32 * 1024 ** 2, historyLimit);
  const storageBytes = volume.values.byteLength + volume.scratch.byteLength;
  return {
    volume,
    edit({ a, b, mode, radius }) {
      history.begin();
      const brush = measure(() =>
        volume.brush(
          point(b),
          radius,
          mode === "construct" ? "add" : mode,
          0.5,
          history.record,
          mode === "construct" ? 1 : 0,
          mode === "construct",
          1,
          point(a),
        ),
      );
      const pendingBytes = history.pendingMemoryEstimate;
      const oldHistoryBytes = history.memoryBytes;
      const commit = measure(() => history.commit());
      return {
        changed: commit.value,
        brushMs: brush.ms,
        publishMs: commit.ms,
        transientStorageBytes:
          storageBytes +
          pendingBytes +
          oldHistoryBytes +
          (history.nextUndo?.changedVoxels ?? 0) * 12,
      };
    },
    undo: () => history.undo(),
    redo: () => history.redo(),
    exact: (i) => volume.readVoxel(i),
    memory: () => ({ storageBytes, historyBytes: history.memoryBytes }),
  };
}

function sparseBackend() {
  const field = new AnalyticField();
  const cache = new BandCache(3, 1, (x, y, z) => field.read(x, y, z), true);
  const history = [];
  const future = [];
  const volume = {
    dimensions,
    shape: dimensions,
    extent,
    step: 1,
    minimum: [0, 0, 0],
    latticeMin: [0, 0, 0],
    coordinate: (v) => v - extent,
    index,
    getDenseView: () => undefined,
    readVoxel: (i) => cache.read(...coordinates(i), false),
    normalAt: BrickVolume.prototype.normalAt,
  };
  function memory() {
    const { payloadBytes, directoryAllowanceBytes } = cache.footprint();
    const exactPageBytes = field.edits.size * PAGE_BYTES;
    const editDirectoryBytes = field.edits.size * ENTRY_ALLOWANCE;
    const saved = new Set();
    let metadataBytes = 0;
    const live = new Set([...field.edits.values(), ...cache.entries.values()]);
    for (const patch of [...history, ...future]) {
      metadataBytes += patch.affected.length * ENTRY_ALLOWANCE;
      for (const table of [patch.before, patch.after, patch.cacheBefore, patch.cacheAfter]) {
        metadataBytes += (table.size ?? table.length) * ENTRY_ALLOWANCE;
        for (const [, page] of table)
          if (page instanceof Float32Array && !live.has(page)) saved.add(page);
      }
    }
    return {
      storageBytes: payloadBytes + directoryAllowanceBytes + exactPageBytes + editDirectoryBytes,
      historyBytes: saved.size * PAGE_BYTES + metadataBytes,
      exactPages: field.edits.size,
      cachePages: payloadBytes / PAGE_BYTES,
    };
  }
  return {
    volume,
    edit({ a, b, mode, radius }) {
      const before = memory();
      const stage = measure(() => stageStroke(field, cache, a, b, mode, 96, radius));
      const patch = stage.value;
      const publish = measure(() => {
        if (!patch.changed) return;
        publishStroke(field, cache, patch);
        future.length = 0;
        history.push(patch);
        if (history.length > historyLimit) history.shift();
      });
      const after = memory();
      const stagingBytes =
        (patch.after.size +
          patch.cacheAfter.filter(([, page]) => page instanceof Float32Array).length) *
          PAGE_BYTES +
        (patch.after.size * 2 + patch.affected.length * 3) * ENTRY_ALLOWANCE;
      return {
        changed: patch.changed > 0,
        brushMs: stage.ms,
        publishMs: publish.ms,
        transientStorageBytes:
          before.storageBytes +
          before.historyBytes +
          stagingBytes +
          Math.max(0, after.storageBytes - before.storageBytes),
      };
    },
    undo() {
      const patch = history.pop();
      ensure(patch, "Missing sparse Undo patch");
      publishStroke(field, cache, patch, true);
      future.push(patch);
    },
    redo() {
      const patch = future.pop();
      ensure(patch, "Missing sparse Redo patch");
      publishStroke(field, cache, patch);
      history.push(patch);
    },
    exact: (i) => field.read(...coordinates(i)),
    memory,
  };
}

function strokeTrace() {
  const trace = [];
  // Rounded head and shoulders laid down in overlapping, short Clay sweeps.
  const block = (centerY, axes) => {
    for (let y = -axes[1]; y <= axes[1]; y += 8)
      for (let z = -axes[2]; z <= axes[2]; z += 8) {
        const t = 1 - (y / axes[1]) ** 2 - (z / axes[2]) ** 2;
        if (t < 0) continue;
        const half = Math.round(axes[0] * Math.sqrt(t));
        const pieces = Math.max(1, Math.ceil((2 * half) / 8));
        for (let i = 0; i < pieces; i++) {
          const a = [-half + Math.round((2 * half * i) / pieces), centerY + y, z];
          const b = [-half + Math.round((2 * half * (i + 1)) / pieces), centerY + y, z];
          trace.push({ phase: "blockout", mode: "construct", a, b, radius });
        }
      }
  };
  block(-23, [29, 8, 11]);
  block(-11, [7, 6, 7]);
  block(10, [16, 24, 12]);
  // Nose, brow, cheeks and ears, followed by repeated overlapping finish work.
  const features = [
    [[0, 14, 17], [0, 8, 23], 5],
    [[-11, 15, 16], [-3, 16, 19], 5],
    [[3, 16, 19], [11, 15, 16], 5],
    [[-13, 5, 13], [-7, 6, 17], 6],
    [[7, 6, 17], [13, 5, 13], 6],
    [[-21, 7, 1], [-22, 15, 1], 5],
    [[21, 7, 1], [22, 15, 1], 5],
  ];
  for (const [a, b, radius] of features)
    trace.push({ phase: "detail", mode: "construct", a, b, radius });
  for (let pass = 0; pass < 5; pass++) {
    for (const [a, b, radius] of features) {
      trace.push({ phase: "finish", mode: "add", a, b, radius });
      trace.push({ phase: "finish", mode: "smooth", a, b, radius });
    }
  }
  return trace;
}

const mix = (hash, word) => Math.imul(hash ^ word, 16777619) >>> 0;
function meshSignature(meshes) {
  let hash = 2166136261;
  let triangles = 0;
  for (const [id, geometry] of [...meshes].sort(([a], [b]) => a - b)) {
    const { position, normal } = geometry.attributes;
    if (!position.count) continue;
    triangles += position.count / 3;
    hash = mix(hash, id);
    for (const attr of [position, normal]) {
      const { buffer, byteOffset, length } = attr.array;
      for (const word of new Uint32Array(buffer, byteOffset, length)) hash = mix(hash, word);
    }
  }
  return { hash, triangles };
}

function fieldSignature(backend) {
  const bit = new Float32Array(1);
  const word = new Uint32Array(bit.buffer);
  let hash = 2166136261;
  for (let i = 0; i < size ** 3; i++) {
    bit[0] = backend.exact(i);
    hash = mix(hash, word[0]);
  }
  return hash;
}

export async function runCompactSculpt(
  kind,
  {
    beforeStroke = () => undefined,
    afterStroke = () => undefined,
    onChunks = () => {},
    snapshot = () => null,
  } = {},
) {
  ensure(kind === "dense" || kind === "sparse", "Choose dense or sparse");
  const backend = kind === "dense" ? denseBackend() : sparseBackend();
  const mesher = new IncrementalMesher(backend.volume);
  // Both paths start with an empty mesh. Clear the constructor's full-grid
  // initial extraction before timing any edits.
  const initialization = measure(() => mesher.rebuildChunks());
  const meshes = new Map();
  const directoryAllowanceBytes = mesher.allocatedChunks * (ENTRY_ALLOWANCE + 4);
  const strokes = [];
  const checkpoints = [];
  const trace = strokeTrace();
  function rebuild(dirty) {
    const previousMeshBytes = mesher.ownedGeometryBytes;
    const result = measure(() => {
      mesher.invalidate(dirty);
      return mesher.rebuildChunks();
    });
    onChunks(result.value?.updates ?? []);
    let generatedBytes = 0;
    let largestChunkBytes = 0;
    for (const { id, geometry } of result.value?.updates ?? []) {
      const { position, normal } = geometry.attributes;
      const bytes = position.array.byteLength + normal.array.byteLength;
      generatedBytes += bytes;
      largestChunkBytes = Math.max(largestChunkBytes, bytes);
      if (position.count) meshes.set(id, geometry);
      else meshes.delete(id);
    }
    return {
      rebuildMs: result.ms,
      rebuiltChunks: result.value?.stats.chunks ?? 0,
      meshHighWaterBytes: previousMeshBytes + generatedBytes + 2 * largestChunkBytes,
    };
  }

  function checkpoint(phase) {
    const { storageBytes, historyBytes, ...pages } = backend.memory();
    const meshBytes = mesher.ownedGeometryBytes;
    checkpoints.push({
      phase,
      ...pages,
      storageBytes,
      historyBytes,
      meshBytes,
      directoryAllowanceBytes,
      retainedBytes: storageBytes + historyBytes + meshBytes + directoryAllowanceBytes,
      field: fieldSignature(backend),
      surface: meshSignature(meshes),
      runtimeMemory: snapshot(),
    });
  }

  try {
    checkpoint("empty");
    for (const [i, stroke] of trace.entries()) {
      await beforeStroke();
      const result = backend.edit(stroke);
      const { a, b, mode, radius, phase } = stroke;
      const dirty = bounds(a, b, radius + (mode === "construct" ? 2 : 0));
      const mesh = result.changed
        ? rebuild(dirty)
        : { rebuildMs: 0, rebuiltChunks: 0, meshHighWaterBytes: mesher.ownedGeometryBytes };
      const frameGapMs = await afterStroke();
      strokes.push({
        phase,
        mode,
        frameGapMs,
        ...result,
        ...mesh,
        totalMs: result.brushMs + result.publishMs + mesh.rebuildMs,
        workingHighWaterBytes:
          result.transientStorageBytes + mesh.meshHighWaterBytes + directoryAllowanceBytes,
      });
      if (i === 0) checkpoint("first dab");
      if (trace[i + 1]?.phase !== phase) checkpoint(phase);
    }

    const last = trace.at(-1);
    const dirty = bounds(last.a, last.b, last.radius);
    for (const action of ["undo", "redo"]) {
      await beforeStroke();
      const edit = measure(() => backend[action]());
      const mesh = rebuild(dirty);
      const frameGapMs = await afterStroke();
      strokes.push({
        phase: action,
        mode: action,
        frameGapMs,
        brushMs: edit.ms,
        ...mesh,
        totalMs: edit.ms + mesh.rebuildMs,
      });
      checkpoint(action);
    }
    const finish = checkpoints.find((row) => row.phase === "finish");
    const undo = checkpoints.find((row) => row.phase === "undo");
    const redo = checkpoints.at(-1);
    ensure(finish.field !== undo.field, "Undo did not change the exact field");
    ensure(
      finish.field === redo.field && finish.surface.hash === redo.surface.hash,
      "Redo did not reproduce the finished sculpt",
    );
    return {
      kind,
      size,
      spacingMM: 1,
      historyLimit,
      initializeMesherMs: initialization.ms,
      checkpoints,
      strokes,
    };
  } finally {
    mesher.dispose();
  }
}

export function compareCompactSculpts(a, b) {
  for (const [i, checkpoint] of a.checkpoints.entries()) {
    const other = b.checkpoints[i];
    ensure(checkpoint.phase === other.phase, "Mismatched phases");
    ensure(checkpoint.field === other.field, `Exact field differs at ${checkpoint.phase}`);
    ensure(
      checkpoint.surface.hash === other.surface.hash &&
        checkpoint.surface.triangles === other.surface.triangles,
      `Mesh positions or normals differ at ${checkpoint.phase}`,
    );
  }
}
