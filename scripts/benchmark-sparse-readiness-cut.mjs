import "./compile-core.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { SparseSDFVolume } from "../work/test-build/sparse-sdf.mjs";

const output = process.argv[2];
assert(output, "Pass an output JSON path.");
const plane = { point: [0.002, 0, 0], normal: [0.7, 0.3, -0.2] };
const settings = {
  mode: "add",
  radius: 0.02,
  strength: 0.8,
  hardness: 0.6,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
const hashViews = (views) => {
  const hash = createHash("sha256");
  for (const array of views)
    hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
  return hash.digest("hex");
};
const results = [];
for (let trial = 0; trial < 5; trial++) {
  let expected;
  for (const sparse of trial % 2 ? [true, false] : [false, true]) {
    const extent = 0.064,
      volume = sparse ? new SparseSDFVolume(129, extent) : new SDFVolume(129, extent, false);
    volume.getDenseView()?.fill(extent * 4);
    const editor = new IndependentLayers(createBaseProject(volume, settings));
    try {
      for (const x of [-0.022, 0, 0.022]) {
        editor.beginStroke();
        assert(editor.applyStrokeLocal({ x, y: 0, z: 0 }, 0.019, "add", 0.8, 1 / 60, 0.6, true));
        editor.finishStroke();
        while (editor.pendingChunks) editor.drainSparseMeshes();
      }
      const start = performance.now();
      let peakTrackedBytes = editor.trackedBytes;
      await editor.cutByPlane(plane, new AbortController().signal, () => {
        peakTrackedBytes = Math.max(peakTrackedBytes, editor.trackedBytes);
      });
      const cutMs = performance.now() - start;
      const timedReplay = (redo) => {
        const start = performance.now();
        assert(editor.undo(redo));
        return performance.now() - start;
      };
      const undoMs = timedReplay(false),
        redoMs = timedReplay(true);
      const signatures = editor.project.layerStack.layers.map((layer) => {
        const runtime = editor.runtime(layer.id);
        return {
          field: hashViews([
            layer.volume.readRegion({ min: [0, 0, 0], max: [128, 128, 128] }).values,
          ]),
          mesh: hashViews(
            runtime
              .exportUpdates()
              .filter(({ geometry }) => geometry.attributes.position.count)
              .flatMap(({ geometry }) => [
                geometry.attributes.position.array,
                geometry.attributes.normal.array,
              ]),
          ),
          triangles: runtime.triangles,
        };
      });
      expected ??= signatures;
      assert.deepEqual(signatures, expected);
      results.push({ trial, sparse, cutMs, undoMs, redoMs, peakTrackedBytes, signatures });
    } finally {
      editor.dispose();
    }
  }
}
writeFileSync(output, JSON.stringify(results, null, 2));
