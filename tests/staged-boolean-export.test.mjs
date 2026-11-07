import assert from "node:assert/strict";
import test from "node:test";
import { MeshBasicMaterial } from "three";
import { prepareBooleanExport } from "../work/test-build/boolean-export.mjs";
import {
  BooleanComposite,
  compositeLayout,
  compositeSamplingStages,
} from "../work/test-build/compositor.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { LayerStack, SculptProject, SdfLayer } from "../work/test-build/layers.mjs";
import { saveSculptProject } from "../work/test-build/project.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { encodeSTL } from "../work/test-build/stl-export.mjs";
import { identityTransform } from "../work/test-build/transform.mjs";

const settings = {
  mode: "add",
  radius: 0.22,
  strength: 0.35,
  hardness: 0.5,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
function fixture(count = 12) {
  const sources = Array.from(
    { length: count },
    (_, i) =>
      new SdfLayer(new SDFVolume(17), {
        name: `Source ${i}`,
        order: i,
        transform: { ...identityTransform(), position: [i * 5, 0, 0] },
      }),
  );
  return new IndependentLayers(
    new SculptProject(new LayerStack(sources), structuredClone(settings)),
  );
}
test("full-resolution export stages cover one unchanged 192 cubed lattice within per-stage work limits", () => {
  const editor = fixture();
  try {
    const sources = editor.project.layerStack.compositionLayers;
    assert.throws(() => compositeLayout(sources, 192, true), /64 million/);
    const layout = compositeLayout(sources, 192, true, true);
    assert.equal(layout.resolution, 192);
    assert.equal(layout.samplingStages.length, 2);
    const rows = layout.samplingStages.flatMap((s) =>
      Array.from({ length: s.maxZ - s.minZ + 1 }, (_, i) => s.minZ + i),
    );
    assert.deepEqual(
      rows,
      Array.from({ length: 192 }, (_, i) => i),
    );
    for (const s of layout.samplingStages)
      assert((s.maxZ - s.minZ + 1) * 192 * 192 * 12 <= 64_000_000);
    assert.throws(() => compositeSamplingStages(192, 12, 100), /budget/);
    for (const source of sources)
      source.array = {
        id: `repeat-${source.id}`,
        kind: "linear",
        count: 16,
        enabled: true,
        axis: [1, 0, 0],
        spacingModelUnits: 5,
        centered: false,
      };
    assert.throws(() => compositeLayout(sources, 192, true, true), /256 million/);
  } finally {
    editor.dispose();
  }
});
test("staged and ordinary sampling preserve identical ordered Boolean fields and mesh buffers", async () => {
  const editor = fixture(3),
    material = new MeshBasicMaterial();
  editor.project.layerStack.layers[1].operation = "difference";
  editor.project.layerStack.layers[1].transform.position = [0.3, 0, 0];
  editor.project.layerStack.layers[2].operation = "intersect";
  editor.project.layerStack.layers[2].transform.position = [0, 0.3, 0];
  const normal = new BooleanComposite(editor.project, material, 32);
  const staged = new BooleanComposite(editor.project, material, 32, material, () => true, {
    stagedEvaluation: true,
  });
  try {
    await normal.flush();
    await staged.flush();
    assert.deepEqual(staged.volume.values, normal.volume.values);
    const mesh = (c) =>
      c.exportSources().flatMap((s) => s.chunks.map((c) => Array.from(c.positions)));
    assert.deepEqual(mesh(staged), mesh(normal));
  } finally {
    normal.dispose();
    staged.dispose();
    material.dispose();
    editor.dispose();
  }
});
test("twelve-source unified export keeps 192 resolution, reports stages and changes no native bytes/history", async () => {
  const editor = fixture(),
    before = saveSculptProject(editor.project),
    count = editor.undoCount,
    progress = [];
  try {
    const prepared = await prepareBooleanExport(editor, editor.project, undefined, true, (p) =>
      progress.push(p),
    );
    try {
      assert(prepared.sources.length > 0);
      assert(progress.some((p) => p.stage.includes("stage 2/2")));
      assert.equal(
        progress
          .filter((p) => p.stage.startsWith("Evaluating Boolean") && p.completed === p.total)
          .reduce((sum, p) => sum + p.total, 0),
        192 ** 3,
      );
      const layout = compositeLayout(editor.project.layerStack.compositionLayers, 192, true, true);
      assert.equal(prepared.sources[0].step, (2 * layout.extent) / 191);
      const stl = await encodeSTL(prepared.sources, "fast", prepared.availableBytes(), 100);
      assert(stl.data.byteLength > 84);
      assert.deepEqual(saveSculptProject(editor.project), before);
      assert.equal(editor.undoCount, count);
    } finally {
      prepared.dispose();
    }
    const abort = new AbortController();
    await assert.rejects(
      prepareBooleanExport(editor, editor.project, abort.signal, false, () => abort.abort()),
      /cancelled/i,
    );
    assert.deepEqual(saveSculptProject(editor.project), before);
    assert.equal(editor.undoCount, count);
    let changed;
    await assert.rejects(
      prepareBooleanExport(editor, editor.project, undefined, false, () => {
        if (!changed) {
          editor.rename(editor.project.activeLayerId, "Changed during export");
          changed = saveSculptProject(editor.project);
        }
      }),
      /source changed/i,
    );
    assert.deepEqual(saveSculptProject(editor.project), changed);
    const finalCount = editor.undoCount;
    Object.defineProperty(editor, "trackedBytes", { value: 256 * 1024 ** 2 });
    await assert.rejects(prepareBooleanExport(editor, editor.project), /memory budget/);
    assert.deepEqual(saveSculptProject(editor.project), changed);
    assert.equal(editor.undoCount, finalCount);
  } finally {
    editor.dispose();
  }
});
