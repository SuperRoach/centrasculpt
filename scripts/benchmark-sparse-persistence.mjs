import "./compile-core.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { IncrementalMesher } from "../work/test-build/mesh.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { SparseSDFVolume } from "../work/test-build/sparse-sdf.mjs";
import { strokeTrace } from "./research/compact-sculpt/trace.mjs";
import { topology } from "./research/narrow-band-evidence.mjs";

const [tracePath, outputPath] = process.argv.slice(2);
assert(tracePath && outputPath, "Pass the existing Phase 8.3 trace JSON and an output path.");
const trace = JSON.parse(readFileSync(tracePath, "utf8"));
assert(trace.complete);
const settings = {
  mode: "add",
  radius: 0.22,
  strength: 0.8,
  hardness: 0.6,
  camera: { position: [2.4, 1.7, 3.3], target: [0, 0, 0] },
};
const compact = { kind: "compact", span: 128, resolution: 129, strokes: strokeTrace() };
const workloads = [
  compact,
  ...trace.cases.flatMap((c) =>
    c.checkpoints.map((checkpoint) => ({
      kind: c.kind,
      span: checkpoint.span,
      resolution: 65,
      strokes: (c.kind === "islands"
        ? c.islandStrokes.find((row) => row.span === checkpoint.span).strokes
        : c.strokes.slice(0, checkpoint.strokeCount)
      ).map((s) => ({ ...s, radius: 6 })),
    })),
  ),
];

const point = ([x, y, z]) => ({ x: x / 1000, y: y / 1000, z: z / 1000 });
const percentiles = (samples) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return [0.5, 0.95, 0.99].map((p) => sorted[Math.ceil(p * sorted.length) - 1]);
};
function meshSignature(mesher) {
  const hash = createHash("sha256");
  const chunks = mesher
    .snapshotUpdates()
    .filter(({ geometry }) => geometry.getAttribute("position").count);
  chunks.sort((a, b) => mesher.chunkKey(a.id).localeCompare(mesher.chunkKey(b.id)));
  for (const { id, geometry } of chunks) {
    hash.update(mesher.chunkKey(id));
    for (const name of ["position", "normal"])
      hash.update(new Uint8Array(geometry.getAttribute(name).array.buffer));
  }
  return hash.digest("hex");
}

const results = [];
for (const { kind, span, resolution, strokes } of workloads) {
  const editor = new IndependentLayers(
    createBaseProject(new SparseSDFVolume(resolution, (resolution - 1) / 2000), settings),
  );
  editor.setUndoMeshCacheEnabled(true);
  let refusal,
    completed = 0,
    peakTrackedBytes = 0,
    maxQueue = 0;
  const times = [];
  try {
    for (const { a, b, radius, mode } of strokes) {
      const started = performance.now(),
        tool = mode === "construct" ? "add" : mode;
      editor.beginStroke();
      const apply = (p) =>
        editor.applyStrokeLocal(
          point(p),
          radius / 1000,
          tool,
          tool === "smooth" ? 0.24 : 0.8,
          1 / 60,
          0.6,
          true,
        );
      try {
        apply(a);
        if (a.some((v, i) => v !== b[i])) apply(b);
        maxQueue = Math.max(maxQueue, editor.pendingChunks);
        editor.finishStroke();
      } catch (error) {
        editor.cancelStroke();
        if (!/logical lattice limit/.test(error.message)) throw error;
        refusal = error.message;
      }
      while (editor.pendingChunks) editor.drainSparseMeshes();
      if (refusal) break;
      times.push(performance.now() - started);
      peakTrackedBytes = Math.max(peakTrackedBytes, editor.sparseDiagnostics().trackedBytes);
      completed++;
    }
    const volume = editor.active.volume,
      mesh = meshSignature(editor.active.mesher);
    const saveStart = performance.now(),
      data = saveSculptProject(editor.project),
      openStart = performance.now();
    const reopened = openSculptProject(data).activeLayer.volume,
      openMs = performance.now() - openStart;
    assert(reopened instanceof SparseSDFVolume);
    const saveMs = openStart - saveStart;
    assert.deepEqual(reopened.latticeMin, volume.latticeMin);
    assert.deepEqual(reopened.dimensions, volume.dimensions);
    assert.deepEqual(new Map(reopened.residentPages()), new Map(volume.residentPages()));
    const remesh = new IncrementalMesher(reopened);
    try {
      while (remesh.pendingChunks) remesh.rebuildChunks(4, 2);
      assert.equal(meshSignature(remesh), mesh);
    } finally {
      remesh.dispose();
    }
    if (completed) {
      assert(editor.undo());
      while (editor.pendingChunks) editor.drainSparseMeshes();
      assert(editor.undo(true));
      while (editor.pendingChunks) editor.drainSparseMeshes();
      assert.equal(meshSignature(editor.active.mesher), mesh);
    }
    const topologyStats = topology(
      editor.active.mesher.snapshotUpdates().map(({ geometry }) => ({
        positions: geometry.getAttribute("position").array,
      })),
      1000,
      0.001,
    );
    const result = {
      kind,
      span,
      completed,
      planned: strokes.length,
      refusal,
      dimensions: volume.dimensions,
      origin: volume.latticeMin,
      spacingMm: volume.step * 1000,
      expansions: editor.active.expansions,
      pages: volume.allocatedPages,
      triangles: editor.active.triangles,
      topology: topologyStats,
      allocatedChunks: editor.active.mesher.allocatedChunks,
      archiveBytes: data.byteLength,
      saveMs,
      openMs,
      editMs: percentiles(times),
      peakTrackedBytes,
      maxQueue,
      mesh,
    };
    results.push(result);
    console.log(JSON.stringify(result));
    writeFileSync(outputPath, JSON.stringify({ node: process.version, results }, null, 2) + "\n");
  } finally {
    editor.dispose();
  }
}
