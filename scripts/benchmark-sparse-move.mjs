import "./compile-core.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { Vector3 } from "three";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { RadialMoveField } from "../work/test-build/move-field.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { SparseSDFVolume } from "../work/test-build/sparse-sdf.mjs";
import { BrowserWorker } from "./fixtures/node-browser-worker.mjs";
import { strokeTrace } from "./research/compact-sculpt/trace.mjs";

const destination = process.argv[2];
assert(destination, "Pass an output file, such as work/phase-9.6-move.json.");
globalThis.Worker = BrowserWorker;
const settings = {
  mode: "add",
  radius: 0.022,
  strength: 0.8,
  hardness: 0.6,
  camera: { position: [2.4, 1.7, 3.3], target: [0, 0, 0] },
};
const hash = (arrays) => {
  const h = createHash("sha256");
  for (const a of arrays)
    h.update(typeof a === "string" ? a : Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  return h.digest("hex");
};
function digest(editor) {
  const { volume, mesher } = editor.active;
  const chunks = mesher
    .snapshotUpdates()
    .filter(({ geometry }) => geometry.attributes.position.count);
  chunks.sort((a, b) => mesher.chunkKey(a.id).localeCompare(mesher.chunkKey(b.id)));
  return {
    field: hash([
      volume.readRegion({ min: [0, 0, 0], max: volume.dimensions.map((n) => n - 1) }).values,
    ]),
    positions: hash(
      chunks.flatMap(({ id, geometry }) => [
        mesher.chunkKey(id),
        geometry.attributes.position.array,
      ]),
    ),
    normals: hash(
      chunks.flatMap(({ id, geometry }) => [mesher.chunkKey(id), geometry.attributes.normal.array]),
    ),
  };
}
const results = [];
for (const backends of [
  ["dense", "sparse"],
  ["sparse", "dense"],
]) {
  const signatures = new Map();
  for (const backend of backends) {
    const volume =
      backend === "sparse" ? new SparseSDFVolume(129, 0.064) : new SDFVolume(129, 0.064, false);
    volume.getDenseView()?.fill(Math.fround(volume.extent * 4));
    const editor = new IndependentLayers(createBaseProject(volume, settings));
    const tracked = () => editor.sparseDiagnostics()?.trackedBytes ?? editor.trackedBytes;
    let largestQueue = 0,
      oldestQueueMs = 0,
      peakCompletedClayBytes = 0;
    function drain() {
      const t = performance.now();
      let slices = 0;
      while (editor.pendingChunks) {
        largestQueue = Math.max(largestQueue, editor.pendingChunks);
        oldestQueueMs = Math.max(oldestQueueMs, editor.sparseDiagnostics()?.oldestMs ?? 0);
        editor.drainSparseMeshes();
        slices++;
      }
      return { slices, milliseconds: performance.now() - t };
    }
    try {
      editor.setUndoMeshCacheEnabled(true);
      const started = performance.now();
      for (const { a, b, radius, mode } of strokeTrace()) {
        editor.beginStroke();
        for (const [x, y, z] of [a, b])
          editor.applyStrokeLocal(
            { x: x / 1000, y: y / 1000, z: z / 1000 },
            radius / 1000,
            mode === "construct" ? "add" : mode,
            mode === "smooth" ? 0.24 : 0.8,
            1 / 60,
            0.6,
            true,
          );
        editor.finishStroke();
        drain();
        peakCompletedClayBytes = Math.max(peakCompletedClayBytes, tracked());
      }
      const buildMs = performance.now() - started,
        bust = digest(editor),
        clayRetainedBytes = tracked();
      const actions = [];
      for (const [mode, radius, amount] of [
        ["translate", 0.011, 0.004],
        ["rotate", 0.012, 0],
        ["twist", 0.011, 0],
        ["free", 0.011, 0.045],
      ]) {
        const f = new RadialMoveField();
        f.capture(new Vector3(0, 0.009, 0.024), radius, 2, 1);
        f.setDisplacement(new Vector3(0.001, 0, amount));
        f.interaction = mode;
        f.setRotation(new Vector3(0.25, 1, 0.4), mode === "translate" ? 0 : 0.35);
        const owner = {},
          beforeBytes = tracked();
        let peakProgressBytes = beforeBytes;
        editor.beginPreview(owner);
        try {
          assert(
            await editor.commitMove(owner, f, new AbortController().signal, () => {
              peakProgressBytes = Math.max(peakProgressBytes, tracked());
            }),
            mode,
          );
        } finally {
          editor.endPreview(owner);
        }
        const stats = editor.lastMoveStats;
        const result = digest(editor);
        const retainedBytes = tracked();
        const undoStart = performance.now();
        assert(editor.undo());
        const undo = { ...drain(), totalMs: performance.now() - undoStart };
        const redoStart = performance.now();
        assert(editor.undo(true));
        const redo = { ...drain(), totalMs: performance.now() - redoStart };
        assert.deepEqual(digest(editor), result);
        actions.push({
          mode,
          layout: editor.active.volume.dimensions,
          beforeBytes,
          retainedBytes,
          peakProgressBytes,
          undo,
          redo,
          stats,
          ...result,
        });
      }
      signatures.set(backend, {
        bust,
        actions: actions.map(({ layout, field, positions, normals }) => ({
          layout,
          field,
          positions,
          normals,
        })),
      });
      const row = {
        backend,
        buildMs,
        clayRetainedBytes,
        peakCompletedClayBytes,
        largestQueue,
        oldestQueueMs,
        actions,
      };
      results.push(row);
      writeFileSync(
        destination,
        JSON.stringify({ node: process.version, results }, null, 2) + "\n",
      );
      console.log(JSON.stringify(row));
    } finally {
      editor.dispose();
    }
  }
  assert.deepEqual(
    signatures.get("dense"),
    signatures.get("sparse"),
    "equal-spacing field and ordered mesh parity",
  );
}
