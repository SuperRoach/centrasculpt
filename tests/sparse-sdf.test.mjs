import assert from "node:assert/strict";
import test from "node:test";
import { compositeLayout, prepareLayerSampler } from "../work/test-build/compositor.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject, SdfLayer } from "../work/test-build/layers.mjs";
import { IncrementalMesher } from "../work/test-build/mesh.mjs";
import { createPersonalStamp } from "../work/test-build/personal-stamp.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { captureProject } from "../work/test-build/project-snapshot.mjs";
import { hydrateProject, projectTransfer } from "../work/test-build/project-transfer.mjs";
import { newProjectData } from "../work/test-build/project-workflow.mjs";
import { sculptMask } from "../work/test-build/sculpt-mask.mjs";
import { sculptPaint } from "../work/test-build/sculpt-paint.mjs";
import { reflectPoint, SDFVolume } from "../work/test-build/sdf.mjs";
import { prepareShape } from "../work/test-build/shape-library.mjs";
import { SparseSDFVolume, sparsePageCoordinates } from "../work/test-build/sparse-sdf.mjs";

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
    assert(reopened.volume instanceof SparseSDFVolume);
    assert.equal(new DataView(data).getUint32(8, true), 25);
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

function sculptField(sparse, radius) {
  const n = 33,
    volume = sparse ? new SparseSDFVolume(n, 1) : new SDFVolume(n, 1, false);
  volume.getDenseView()?.fill(4);
  for (let z = 0; z < n; z++)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const a = volume.coordinate(x),
          b = volume.coordinate(y),
          c = volume.coordinate(z);
        if (Math.max(Math.abs(a), Math.abs(b), Math.abs(c)) >= 0.875) continue;
        volume.writeVoxel(
          volume.index(x, y, z),
          Math.hypot(a, b, c) - radius + 0.045 * Math.sin(13 * a) * Math.cos(11 * c),
        );
      }
  return volume;
}

const cutterPose = {
  position: [0.37, -0.08, 0.01],
  rotation: [0.3, -0.4, 0.51],
  scale: [0.9, 0.9, 0.9],
};

test("transformed sparse sampling matches dense at page seams, boundaries and in the exterior", () => {
  const dense = new SdfLayer(sculptField(false, 0.48), { transform: cutterPose }),
    sparse = new SdfLayer(sculptField(true, 0.48), { transform: cutterPose }),
    a = prepareLayerSampler(dense),
    b = prepareLayerSampler(sparse);
  for (let z = -22; z <= 22; z++)
    for (let y = -22; y <= 22; y++)
      for (let x = -22; x <= 22; x++)
        assert.equal(b(x / 16, y / 16, z / 16), a(x / 16, y / 16, z / 16));

  const empty = new SdfLayer(new SparseSDFVolume(33, 1), { transform: cutterPose, visible: false }),
    emptyDense = new SdfLayer(new SDFVolume(33, 1, false), empty.metadata()),
    read = prepareLayerSampler(empty);
  emptyDense.volume.values.fill(4);
  const reference = prepareLayerSampler(emptyDense);
  assert.equal(read(...cutterPose.position), reference(...cutterPose.position));
  const i = empty.volume.index(16, 16, 16);
  empty.volume.writeVoxel(i, 1.5);
  emptyDense.volume.writeVoxel(i, 1.5);
  assert(read(...cutterPose.position) < 2);
  assert.equal(read(...cutterPose.position), reference(...cutterPose.position));
  for (const l of [empty, emptyDense]) l.visible = true;
  dense.booleanModifiers = [
    { id: "cut", sourceId: empty.id, enabled: true, operation: "difference" },
  ];
  assert.deepEqual(compositeLayout([dense, empty]), compositeLayout([dense, emptyDense]));
});

test("all Boolean folds bake the same field and mesh across sparse sources and destinations", async () => {
  for (const operation of ["union", "difference", "intersect"]) {
    let expected;
    for (const [sparseSources, sparseResult] of [
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ]) {
      const editor = new IndependentLayers(
        createBaseProject(sculptField(sparseSources, 0.62), settings),
      );
      try {
        const target = editor.active.layer;
        const cutter = editor.create(64, true);
        editor.replaceVolume(editor.active, sculptField(sparseSources, 0.45));
        editor.setActiveTransform(cutterPose);
        editor.setBooleanModifiers(target.id, [
          { id: "cut1", sourceId: cutter.id, operation, enabled: true },
          { id: "cut2", sourceId: cutter.id, operation, enabled: true },
        ]);
        const options = {
          name: "Result",
          resolution: 64,
          hideSources: true,
          sourceIds: [target.id],
          storage: sparseResult ? "sparse" : "dense",
        };
        const before = Buffer.from(saveSculptProject(editor.project));
        if (sparseSources && sparseResult) {
          const abort = new AbortController();
          await assert.rejects(
            editor.bake(options, abort.signal, (p) => {
              if (p.stage === "meshing") abort.abort();
            }),
            /cancelled/,
          );
          assert.deepEqual(Buffer.from(saveSculptProject(editor.project)), before);
        }
        const baked = await editor.bake(options);
        assert.equal(baked.volume instanceof SparseSDFVolume, sparseResult);
        const result = checkpoint(editor);
        expected ??= result;
        assert.deepEqual(result, expected);
        assert.equal(editor.undo(), cutter.id);
        assert.deepEqual(Buffer.from(saveSculptProject(editor.project)), before);
        assert.equal(editor.undo(true), baked.id);
        assert.deepEqual(checkpoint(editor), result);
        const reopened = openSculptProject(saveSculptProject(editor.project));
        assert.deepEqual(bits(reopened.activeLayer.volume), result.field);
        assert.equal(reopened.activeLayer.volume instanceof SparseSDFVolume, sparseResult);
      } finally {
        editor.dispose();
      }
    }
  }
});

function stampDefinition(editor, operation, personal) {
  return {
    id: "test-stamp",
    kind: personal ? "box" : "triangular-prism",
    targetLayerId: editor.project.activeLayerId,
    operation,
    dimensions: personal ? [0.48, 0.48, 0.48] : [0.51, 0.47, 0.39],
    transform: { ...cutterPose, position: [0.22, 0.16, -0.06] },
    ...(personal ? { personal } : {}),
  };
}

test("analytic and personal sparse stamps preserve exact masked, mirrored and positive far-field changes", () => {
  let expected;
  for (const storage of ["dense", "sparse"]) {
    const editor = new IndependentLayers(createBaseProject(new SDFVolume(33), settings));
    try {
      const target = editor.create(64, true, storage);
      editor.symmetry = { enabled: true, axis: "x", offset: -0.18 };
      sculptMask(target.volume).write(target.volume.index(32, 32, 32), 0.25);
      const personal = createPersonalStamp(
        new SdfLayer(sculptField(storage === "sparse", 0.45), { transform: cutterPose }),
        0.75,
      );
      const states = [];
      for (const [operation, source] of [
        ["add", undefined],
        ["add", personal],
        ["subtract", personal],
        ["subtract", undefined],
      ]) {
        const definition = stampDefinition(editor, operation, source),
          shape = prepareShape(definition),
          volume = target.volume,
          before = checkpoint(editor),
          old = new Float32Array(before.field.buffer),
          reference = new Float32Array(old.length);
        for (let z = 0; z < 64; z++)
          for (let y = 0; y < 64; y++)
            for (let x = 0; x < 64; x++) {
              const i = volume.index(x, y, z),
                p = { x: volume.coordinate(x), y: volume.coordinate(y), z: volume.coordinate(z) },
                distance = Math.min(
                  shape.sampleWorld(p),
                  shape.sampleWorld(reflectPoint(p, editor.symmetry)),
                );
              reference[i] = sculptMask(volume).blend(
                i,
                old[i],
                operation === "add" ? Math.min(old[i], distance) : Math.max(old[i], -distance),
              );
            }
        assert(editor.stampShape(definition));
        drain(editor);
        const result = checkpoint(editor);
        assert.deepEqual(result.field, new Uint32Array(reference.buffer));
        if (!states.length) {
          assert(old[0] > reference[0] && reference[0] > 0);
          assert(reference.at(-1) > 0);
        }
        assert.equal(editor.undo(), target.id);
        drain(editor);
        assert.deepEqual(checkpoint(editor), before);
        assert.equal(editor.undo(true), target.id);
        drain(editor);
        assert.deepEqual(checkpoint(editor), result);
        states.push(result);
      }
      const reopened = openSculptProject(saveSculptProject(editor.project)).activeLayer.volume;
      assert.equal(reopened instanceof SparseSDFVolume, storage === "sparse");
      assert.deepEqual(bits(reopened), states.at(-1).field);
      expected ??= states;
      assert.deepEqual(states, expected);
    } finally {
      editor.dispose();
    }
  }
});

test("sparse stamp cancellation, page refusal and history refusal keep fields and redo", () => {
  const editor = new IndependentLayers(
    createBaseProject(new SparseSDFVolume(64, 1.6, 32), settings),
  );
  try {
    const volume = editor.active.volume;
    const definition = stampDefinition(editor, "add");
    const initial = checkpoint(editor);
    const abort = new AbortController(),
      pending = editor.stampShapeSteps(definition, false, true, abort.signal);
    assert.equal(pending.next().done, false);
    assert.equal(editor.recoveryReady, false);
    abort.abort();
    assert.deepEqual(pending.next(), { done: true, value: false });
    assert.throws(() => editor.stampShape(definition), /page budget/);
    assert.throws(
      () =>
        editor.stampShape({
          ...definition,
          transform: { ...definition.transform, position: [1.55, 0, 0] },
        }),
      /safe volume bounds/,
    );
    assert.equal(volume.allocatedPages, 0);
    assert.deepEqual(checkpoint(editor), initial);

    const target = editor.create(64, true, "sparse"),
      next = stampDefinition(editor, "add");
    editor.beginStroke();
    assert(editor.stampShape(next, true));
    const stale = editor.stampShapeSteps(stampDefinition(editor, "subtract"), true, true);
    assert.equal(stale.next().done, false);
    editor.cancelStroke();
    drain(editor);
    editor.beginStroke();
    assert.deepEqual(stale.next(), { done: true, value: false });
    editor.finishStroke();
    assert.deepEqual(bits(target.volume), initial.field);

    assert(editor.stampShape(next));
    drain(editor);
    const result = checkpoint(editor);
    assert.equal(editor.undo(), target.id);
    drain(editor);
    editor.beginStroke();
    editor.active.history.pendingBudgetBytes = 1024;
    assert.throws(() => editor.stampShape(next, true), /history memory safety limit/);
    editor.cancelStroke();
    assert.deepEqual(bits(target.volume), initial.field);
    assert.equal(editor.undo(true), target.id);
    drain(editor);
    assert.deepEqual(checkpoint(editor), result);
  } finally {
    editor.dispose();
  }
});

test("idle pointer resets do not interrupt a standalone sparse stamp", () => {
  const editor = new IndependentLayers(createBaseProject(new SparseSDFVolume(64), settings));
  try {
    const work = editor.stampShapeSteps(stampDefinition(editor, "add"));
    let step = work.next();
    assert.equal(step.done, false);
    while (!step.done) {
      editor.breakStrokePath();
      step = work.next();
    }
    assert.equal(step.value, true);
    assert.equal(editor.undoCount, 1);
  } finally {
    editor.dispose();
  }
});

test("same-sign edits can recover triangles from an entirely degenerate chunk", () => {
  const volume = new SparseSDFVolume(64);
  for (let z = 16; z <= 32; z++)
    for (let y = 16; y <= 32; y++)
      for (let x = 16; x <= 32; x++) volume.writeVoxel(volume.index(x, y, z), -1);
  const index = volume.index(24, 24, 24);
  volume.writeVoxel(index, 0);
  const mesher = new IncrementalMesher(volume);
  try {
    const result = mesher.rebuildChunks();
    const chunk = result.updates.find(({ bounds }) => bounds.min.every((v) => v === 16));
    assert.equal(chunk.geometry.getAttribute("position").count, 0);
    volume.writeVoxel(index, 0.2);
    mesher.stampInvalidator()(index, false);
    const update = mesher.rebuildChunks();
    assert.equal(update.updates.length, 1);
    assert.equal(update.updates[0].id, chunk.id);
    assert(update.updates[0].geometry.getAttribute("position").count > 0);
  } finally {
    mesher.dispose();
  }
});

function latticeIndex(volume, x, y, z) {
  const origin = volume.latticeMin;
  return volume.index(x - origin[0], y - origin[1], z - origin[2]);
}

test("Clay grows both signed directions at fixed spacing and rebinds field, history and chunk keys", () => {
  const editor = new IndependentLayers(createBaseProject(new SparseSDFVolume(64), settings));
  try {
    const id = editor.active.layer.id,
      before = editor.active.volume;
    editor.setUndoMeshCacheEnabled(true);
    editor.beginStroke();
    assert(sample(editor, "add"));
    editor.finishStroke();
    drain(editor);
    const originalMesh = mesh(editor.active);
    const keys = originalMesh.map(([id]) => editor.active.mesher.chunkKey(id));
    const initial = before.captureSamples();
    const pageIds = [...before.residentPages()].map(([id]) => id);

    for (const [mode, kind] of [
      ["mask", true],
      ["paint", "paint"],
    ]) {
      editor.beginStroke(kind);
      assert(sample(editor, mode, { x: 0.38, y: 0, z: 0 }));
      editor.finishStroke();
    }
    const maskEntries = [...sculptMask(before).entries()];
    const paintEntries = [...sculptPaint(before).channels[3].entries()];
    assert(maskEntries.length && paintEntries.length);
    const remap = (index, to) =>
      latticeIndex(to, index % 64, Math.floor(index / 64) % 64, Math.floor(index / 4096));

    editor.beginStroke();
    assert(sample(editor, "add", { x: 1.85, y: 0, z: 0 }));
    editor.breakStrokePath();
    assert(sample(editor, "add", { x: -1.85, y: 0, z: 0 }));
    editor.finishStroke();
    drain(editor);
    const grown = editor.active.volume;
    assert.equal(grown.step, before.step);
    assert(grown.bounds.min[0] < before.bounds.min[0]);
    assert(grown.bounds.max[0] > before.bounds.max[0]);
    assert(keys.every((key, i) => editor.active.mesher.chunkKey(originalMesh[i][0]) === key));
    const livePages = new Map(grown.residentPages());
    assert(pageIds.every((id) => livePages.has(id)));
    assert([...livePages.keys()].some((id) => sparsePageCoordinates(id)[0] < 0));
    for (const [i, v] of maskEntries) assert.equal(sculptMask(grown).read(remap(i, grown)), v);
    for (const [i, v] of paintEntries)
      assert.equal(sculptPaint(grown).channels[3].read(remap(i, grown)), v);
    const after = mesh(editor.active);
    assert.equal(editor.undo(), id);
    drain(editor);
    assert.deepEqual(mesh(editor.active), originalMesh);
    for (let z = 0; z < 64; z++)
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 64; x++)
          assert(Object.is(grown.readVoxel(latticeIndex(grown, x, y, z)), initial(x, y, z)));
    assert.equal(grown.readSample(0, 0, 0), grown.defaultValue);
    assert.equal(editor.undo(), id);
    assert(sculptPaint(grown).empty);
    assert.equal(editor.undo(), id);
    assert(sculptMask(grown).empty);
    assert.equal(editor.undo(true), id);
    assert.equal(editor.undo(true), id);
    assert.equal(editor.undo(true), id);
    drain(editor);
    assert.deepEqual(mesh(editor.active), after);

    const reopened = openSculptProject(saveSculptProject(editor.project)).activeLayer.volume;
    assert.deepEqual(new Map(reopened.residentPages()), new Map(grown.residentPages()));
    assert.deepEqual([...sculptMask(reopened).entries()], [...sculptMask(grown).entries()]);
    assert.deepEqual(
      [...sculptPaint(reopened).channels[3].entries()],
      [...sculptPaint(grown).channels[3].entries()],
    );
    assert.equal(reopened.pageState(pageIds[0]), "resident-clean");
    assert(grown.isPagePinned(pageIds[0]));
    assert.equal(grown.pageState(pageIds[0]), "resident-dirty");
  } finally {
    editor.dispose();
  }
});

test("logical and transient growth refusal leave the source, residency, queue and redo intact", () => {
  const editor = new IndependentLayers(createBaseProject(new SparseSDFVolume(64), settings));
  try {
    const before = editor.active.volume;
    editor.beginStroke();
    assert(sample(editor, "add"));
    editor.finishStroke();
    assert(editor.undo());
    drain(editor);
    const pages = new Map([...before.residentPages()].map(([id, a]) => [id, a.slice()]));
    const revision = editor.committedRevision;
    for (const [limits, pattern] of [
      [{ maxAxisSamples: 64 }, /logical lattice or chunk budget/],
      [{ maxTransientBytes: 65536 }, /resident and transient memory budget/],
    ]) {
      editor.growthLimits = limits;
      editor.beginStroke();
      assert.throws(() => sample(editor, "add", { x: -2, y: 0, z: 0 }), pattern);
      editor.cancelStroke();
      assert.equal(editor.active.volume, before);
      assert.deepEqual(new Map(before.residentPages()), pages);
      assert.equal(editor.committedRevision, revision);
      assert.equal(editor.pendingChunks, 0);
    }
    editor.growthLimits = {};
    assert(editor.undo(true));

    assert(editor.stampShape(stampDefinition(editor, "add")));
    drain(editor);
    editor.beginStroke();
    assert.throws(() => sample(editor, "add", { x: 2, y: 0, z: 0 }), /retain its default distance/);
    editor.cancelStroke();
    assert(editor.undo());
    drain(editor);
    editor.beginStroke();
    assert.throws(() => sample(editor, "add", { x: 2, y: 0, z: 0 }), /history can change/);
    editor.cancelStroke();
    assert(editor.undo(true));
  } finally {
    editor.dispose();
  }
});

test("cancelling a growing stroke restores exact values and leaves older redo available", () => {
  const editor = new IndependentLayers(createBaseProject(new SparseSDFVolume(64), settings));
  try {
    editor.beginStroke();
    assert(sample(editor, "add"));
    editor.finishStroke();
    drain(editor);
    const baked = mesh(editor.active);
    assert(editor.undo());
    drain(editor);
    editor.beginStroke();
    assert(sample(editor, "add", { x: -2, y: 0, z: 0 }));
    assert(sample(editor, "add", { x: -2.1, y: 0.05, z: 0 }));
    editor.cancelStroke();
    drain(editor);
    const volume = editor.active.volume;
    assert(volume.latticeMin[0] < 0);
    for (const [, page] of volume.residentPages())
      assert(page.every((sample) => sample === volume.defaultValue));
    assert(editor.undo(true));
    drain(editor);
    assert.deepEqual(mesh(editor.active), baked);
  } finally {
    editor.dispose();
  }
});
