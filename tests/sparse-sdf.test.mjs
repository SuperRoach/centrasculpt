import assert from "node:assert/strict";
import test from "node:test";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { captureProject } from "../work/test-build/project-snapshot.mjs";
import { hydrateProject, projectTransfer } from "../work/test-build/project-transfer.mjs";
import { newProjectData } from "../work/test-build/project-workflow.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { SparseSDFVolume } from "../work/test-build/sparse-sdf.mjs";

const settings = {
  mode: "add",
  radius: 0.48,
  strength: 0.8,
  hardness: 0.6,
  camera: { position: [2.4, 1.7, 3.3], target: [0, 0, 0] },
};
const center = { x: 0, y: 0, z: 0 };
const region = { min: [0, 0, 0], max: [63, 63, 63] };
const bits = (v) => new Uint32Array(v.readRegion(region).values.buffer);
function mesh(runtime) {
  return runtime
    .exportUpdates()
    .filter(({ geometry }) => geometry.getAttribute("position").count)
    .map(({ id, geometry }) => [
      id,
      geometry.getAttribute("position").array.slice(),
      geometry.getAttribute("normal").array.slice(),
    ]);
}
function drain(editor) {
  let slices = 0;
  while (editor.pendingChunks) {
    const before = editor.pendingChunks;
    editor.drainSparseMeshes();
    assert(editor.pendingChunks < before);
    assert(before - editor.pendingChunks <= 4);
    slices++;
  }
  return slices;
}
function sample(editor, mode, point = center) {
  return editor.applyStrokeLocal(
    point,
    settings.radius,
    mode,
    settings.strength,
    1 / 60,
    0.6,
    true,
  );
}

test("sparse layers opt in and match the dense editor, cached Undo, Redo and native reopen", async () => {
  const editor = new IndependentLayers(createBaseProject(new SDFVolume(33), settings));
  try {
    const dense = editor.create(64, true);
    assert(dense.volume instanceof SDFVolume);
    const sparse = editor.create(64, true, "sparse");
    assert(sparse.volume instanceof SparseSDFVolume);
    assert.equal(sparse.volume.residentBytes, 0);
    assert.equal(editor.pendingChunks, 0);
    const checkpoints = new Map();
    editor.setUndoMeshCacheEnabled(true);
    for (const layer of [dense, sparse]) {
      editor.select(layer.id);
      editor.beginStroke();
      assert(sample(editor, "add", { x: -0.19, y: 0, z: 0 }));
      assert(sample(editor, "add", { x: 0.19, y: 0, z: 0 }));
      editor.finishStroke();
      const slices = drain(editor);
      if (layer === sparse) assert(slices > 0);
      const first = { field: bits(layer.volume), mesh: mesh(editor.active) };

      editor.beginStroke();
      assert(sample(editor, "smooth", { x: 0, y: 0.3, z: 0 }));
      editor.finishStroke();
      drain(editor);
      const finish = { field: bits(layer.volume), mesh: mesh(editor.active) };
      assert.notDeepEqual(finish.field, first.field);
      assert(editor.undoMeshCacheBytes > 0);
      assert.equal(editor.undo(), layer.id);
      drain(editor);
      assert.deepEqual(bits(layer.volume), first.field);
      assert.deepEqual(mesh(editor.active), first.mesh);
      assert.equal(editor.undo(true), layer.id);
      drain(editor);
      assert.deepEqual(bits(layer.volume), finish.field);
      assert.deepEqual(mesh(editor.active), finish.mesh);
      checkpoints.set(layer, finish);
    }
    assert.deepEqual(checkpoints.get(sparse), checkpoints.get(dense));

    editor.beginStroke();
    assert(sample(editor, "subtract"));
    editor.active.rebuild(1);
    assert(editor.pendingChunks > 0);
    editor.cancelStroke();
    drain(editor);
    assert.deepEqual(bits(sparse.volume), checkpoints.get(sparse).field);
    assert.deepEqual(mesh(editor.active), checkpoints.get(sparse).mesh);

    const data = saveSculptProject(editor.project);
    const reopened = openSculptProject(data).layerStack.get(sparse.id);
    assert(reopened.volume instanceof SDFVolume);
    assert.deepEqual(bits(reopened.volume), bits(sparse.volume));
    const { snapshot } = await captureProject(
      editor,
      settings,
      undefined,
      undefined,
      new AbortController().signal,
      () => true,
    );
    const recovered = openSculptProject(saveSculptProject(hydrateProject(snapshot)));
    assert.deepEqual(bits(recovered.layerStack.get(sparse.id).volume), bits(sparse.volume));
  } finally {
    editor.dispose();
  }
});

test("sparse page and scratch refusal leaves the field and history listener untouched", () => {
  for (const [volume, radius, error] of [
    [new SparseSDFVolume(64, 1.6, 1), 0.48, /page budget/],
    [new SparseSDFVolume(192), 1.4, /scratch budget/],
  ]) {
    let writes = 0;
    assert.throws(
      () => volume.brush(center, radius, "add", 0.01, () => writes++, 0.6, true),
      error,
    );
    assert.equal(writes, 0);
    assert.equal(volume.residentBytes, 0);
    assert.equal(volume.sampleLocal(center), Math.fround(1.6 * 4));
  }
});

test("only the explicit new-project trial hydrates an empty snapshot into sparse pages", () => {
  const project = openSculptProject(newProjectData(64, "empty", settings));
  const snapshot = projectTransfer(project);
  const active = (project) => project.layerStack.get(project.activeLayerId).volume;
  assert(active(hydrateProject(snapshot)) instanceof SDFVolume);
  const trial = active(hydrateProject(snapshot, true));
  assert(trial instanceof SparseSDFVolume);
  assert.equal(trial.residentBytes, 0);
  assert.deepEqual(bits(trial), bits(active(project)));
  snapshot.layers[0].values[1000] = 0.5;
  assert.throws(() => hydrateProject(snapshot, true), /requires an empty/);
});
