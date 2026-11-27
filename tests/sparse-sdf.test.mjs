import assert from "node:assert/strict";
import test from "node:test";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { IncrementalMesher } from "../work/test-build/mesh.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { captureProject } from "../work/test-build/project-snapshot.mjs";
import { hydrateProject, projectTransfer } from "../work/test-build/project-transfer.mjs";
import { newProjectData } from "../work/test-build/project-workflow.mjs";
import { sculptMask } from "../work/test-build/sculpt-mask.mjs";
import { sculptPaint } from "../work/test-build/sculpt-paint.mjs";
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
    const diagnostic = editor.sparseDiagnostics();
    assert.equal(diagnostic.backend, "sparse");
    assert.equal(diagnostic.pages, sparse.volume.allocatedPages);
    assert.equal(diagnostic.spacing, sparse.volume.step);
    assert.equal(diagnostic.pending, editor.pendingChunks);
    assert(diagnostic.oldestMs >= 0);
    assert(diagnostic.trackedBytes >= sparse.volume.residentBytes + editor.undoMeshCacheBytes);
    assert(!editor.drainSparseMeshes(), "released service does not compete with open strokes");
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

test("coalesced exact dirty work keeps FIFO age and requeues a chunk after publication", () => {
  const volume = new SparseSDFVolume(33);
  const mesher = new IncrementalMesher(volume);
  try {
    const invalidate = mesher.stampInvalidator();
    const sample = volume.index(16, 8, 8);
    invalidate(sample, true);
    assert.equal(mesher.pendingChunks, 2);
    const firstQueued = mesher.oldestPendingAt;
    invalidate(sample, true);
    assert.equal(mesher.oldestPendingAt, firstQueued);
    const first = mesher.rebuildChunks(1).updates[0].id;
    invalidate(sample, true);
    assert.equal(mesher.pendingChunks, 2);
    assert(mesher.oldestPendingAt >= firstQueued);
    const rest = mesher.rebuildChunks().updates.map(({ id }) => id);
    assert.notEqual(rest[0], first);
    assert.equal(rest[1], first);
    assert.equal(mesher.oldestPendingAt, undefined);
  } finally {
    mesher.dispose();
  }
});

function checkpoint(editor) {
  const volume = editor.active.volume;
  return {
    field: bits(volume),
    mesh: mesh(editor.active),
    mask: sculptMask(volume).snapshot(),
    paint: sculptPaint(volume).snapshot(),
  };
}

for (const mode of [
  "inflate",
  "flatten",
  "scrape",
  "pinch",
  "crease",
  "mask",
  "mask-erase",
  "paint",
  "paint-erase",
]) {
  test(`sparse ${mode} matches dense across a negative page seam with offset mirroring`, () => {
    const results = [];
    const point = { x: -0.38, y: 0.38, z: -0.19 };
    for (const backend of ["dense", "sparse"]) {
      const editor = new IndependentLayers(createBaseProject(new SDFVolume(33), settings));
      try {
        const layer = editor.create(64, true, backend);
        editor.setUndoMeshCacheEnabled(true);
        Object.assign(editor.symmetry, { enabled: true, axis: "x", offset: -0.1 });
        const draw = (tool) => {
          editor.beginStroke(tool.startsWith("paint") ? "paint" : tool.startsWith("mask"));
          if (["inflate", "flatten", "scrape"].includes(tool)) assert(sample(editor, tool, point));
          else {
            const work = editor.applyResamplingSteps(tool, point, 0.48, 0.8, 1 / 60, 0.6);
            let step = work.next();
            while (!step.done) step = work.next();
            assert(step.value);
          }
          editor.finishStroke();
          drain(editor);
        };
        editor.beginStroke();
        assert(sample(editor, "add", { x: point.x, y: 0, z: point.z }));
        editor.finishStroke();
        drain(editor);
        if (mode === "mask-erase") draw("mask");
        if (mode === "paint-erase") draw("paint");
        const before = checkpoint(editor);

        draw(mode);
        const after = checkpoint(editor);
        assert.notDeepEqual(after, before);
        if (mode.startsWith("paint") || mode.startsWith("mask")) {
          assert.deepEqual(after.field, before.field);
          assert.deepEqual(after.mesh, before.mesh);
        } else {
          assert.notDeepEqual(after.field, before.field);
          assert.notDeepEqual(after.mesh, before.mesh);
        }

        assert.equal(editor.undo(), layer.id);
        drain(editor);
        assert.deepEqual(checkpoint(editor), before);
        assert.equal(editor.undo(true), layer.id);
        drain(editor);
        assert.deepEqual(checkpoint(editor), after);
        const reopened = openSculptProject(saveSculptProject(editor.project)).layerStack.get(
          layer.id,
        );
        assert.deepEqual(bits(reopened.volume), after.field);
        assert.deepEqual(sculptMask(reopened.volume).snapshot(), after.mask);
        assert.deepEqual(sculptPaint(reopened.volume).snapshot(), after.paint);
        results.push(after);
      } finally {
        editor.dispose();
      }
    }
    assert.deepEqual(results[1], results[0]);
  });
}

for (const mode of ["pinch", "crease", "mask", "paint"]) {
  test(`cancelled sparse ${mode} cannot resume into a new stroke`, () => {
    const editor = new IndependentLayers(createBaseProject(new SDFVolume(33), settings));
    try {
      editor.create(64, true, "sparse");
      editor.beginStroke();
      assert(sample(editor, "add"));
      editor.finishStroke();
      drain(editor);
      const before = checkpoint(editor);
      const kind = mode === "paint" ? "paint" : mode === "mask";
      editor.beginStroke(kind);
      const work = editor.applyResamplingSteps(
        mode,
        { x: 0, y: 0.36, z: 0 },
        0.48,
        0.8,
        1 / 60,
        0.6,
      );
      let step = work.next();
      assert.equal(step.done, false);
      const volume = editor.active.volume;
      const channel =
        mode === "paint" ? sculptPaint(volume) : mode === "mask" ? sculptMask(volume) : null;
      if (channel) {
        while (!step.done && !channel.memoryBytes) step = work.next();
        assert(channel.memoryBytes > 0);
        assert.equal(step.done, false);
      }
      editor.cancelStroke();
      drain(editor);
      editor.beginStroke(kind);
      assert.deepEqual(work.next(), { done: true, value: null });
      editor.finishStroke();
      drain(editor);
      assert.deepEqual(checkpoint(editor), before);
    } finally {
      editor.dispose();
    }
  });
}

test("sparse brush refuses an over-budget dab before fields, pages or the queue change", () => {
  const editor = new IndependentLayers(createBaseProject(new SDFVolume(33), settings));
  try {
    const layer = editor.create(64, true, "sparse");
    editor.beginStroke();
    editor.active.history.pendingBudgetBytes = 160;
    assert.throws(() => sample(editor, "add"), /history memory safety limit/);
    assert.equal(layer.volume.allocatedPages, 0);
    assert.equal(editor.pendingChunks, 0);
    assert.equal(editor.active.history.pendingMemoryEstimate, 0);
    editor.cancelStroke();
  } finally {
    editor.dispose();
  }
});

test("sparse resampling evaluates read-only and publishes one complete dab", () => {
  const editor = new IndependentLayers(createBaseProject(new SDFVolume(33), settings));
  try {
    editor.create(64, true, "sparse");
    editor.beginStroke();
    assert(sample(editor, "add"));
    editor.finishStroke();
    drain(editor);
    const before = bits(editor.active.volume);
    const point = { x: -0.02, y: 0.41, z: 0.02 };
    editor.beginStroke();
    const work = editor.applyResamplingSteps("crease", point, 0.24, 0.8, 1 / 120, 0.6);
    let step = work.next();
    assert.equal(step.done, false);
    assert.throws(() => sample(editor, "crease", point), /pending brush sample/);
    while (!step.done) {
      assert.equal(editor.pendingChunks, 0);
      assert.equal(editor.active.history.pendingMemoryEstimate, 0);
      step = work.next();
    }
    assert(step.value);
    assert(editor.pendingChunks > 0);
    assert.notDeepEqual(bits(editor.active.volume), before);
    editor.cancelStroke();
    drain(editor);
    assert.deepEqual(bits(editor.active.volume), before);
  } finally {
    editor.dispose();
  }
});
