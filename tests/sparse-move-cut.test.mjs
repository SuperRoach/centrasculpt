import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { Euler, Vector3 } from "three";
import { BrowserWorker } from "../scripts/fixtures/node-browser-worker.mjs";
import { SculptHistory } from "../work/test-build/history.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { RadialMoveField } from "../work/test-build/move-field.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { captureProject } from "../work/test-build/project-snapshot.mjs";
import { hydrateProject } from "../work/test-build/project-transfer.mjs";
import { sculptMask } from "../work/test-build/sculpt-mask.mjs";
import { sculptPaint } from "../work/test-build/sculpt-paint.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { SparseSDFVolume } from "../work/test-build/sparse-sdf.mjs";

const settings = {
  mode: "add",
  radius: 0.22,
  strength: 0.8,
  hardness: 0.6,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
const signal = () => new AbortController().signal;
const drain = (editor) => {
  while (editor.drainSparseMeshes()) {
    /* wait for each bounded slice */
  }
};
function make(sparse, layout, center = -0.15, maxPages) {
  const volume = sparse
    ? new SparseSDFVolume(33, 1, maxPages, layout)
    : new SDFVolume(33, 1, false, layout);
  if (!sparse) volume.values.fill(4);
  const [nx, ny, nz] = volume.dimensions;
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const d = Math.hypot(
          volume.coordinate(x, 0) - center,
          volume.coordinate(y, 1),
          volume.coordinate(z, 2),
        );
        if (d < 0.44) volume.writeVoxel(volume.index(x, y, z), d - 0.3);
      }
  const editor = new IndependentLayers(createBaseProject(volume, settings));
  editor.setUndoMeshCacheEnabled(true);
  return editor;
}
function fieldSignature(volume) {
  const region = volume.readRegion({ min: [0, 0, 0], max: volume.dimensions.map((n) => n - 1) });
  return createHash("sha256").update(Buffer.from(region.values.buffer)).digest("hex");
}
function checkpoint(editor) {
  const { volume, mesher } = editor.active;
  const mesh = editor.active
    .exportUpdates()
    .filter(({ geometry }) => geometry.attributes.position.count)
    .map(({ id, geometry }) => [
      mesher.chunkKey(id),
      ...["position", "normal"].map((name) =>
        createHash("sha256")
          .update(Buffer.from(geometry.attributes[name].array.buffer))
          .digest("hex"),
      ),
    ])
    .sort(([a], [b]) => a.localeCompare(b));
  return {
    layout: [volume.latticeMin, volume.dimensions, volume.step],
    field: fieldSignature(volume),
    mesh,
  };
}
function field(mode, radius, center, pull) {
  const f = new RadialMoveField();
  f.capture(new Vector3(...center), radius, 2, 1);
  f.setDisplacement(new Vector3(...pull));
  if (mode === "elastic") f.configure(mode, 0.75);
  else if (mode !== "translate") {
    f.interaction = mode;
    f.setRotation(new Vector3(0.5, 1, 0.3), 0.58);
  }
  return f;
}
async function move(editor, f, abortSignal = signal(), progress, beforePublish) {
  const owner = {};
  editor.beginPreview(owner);
  try {
    return await editor.commitMove(owner, f, abortSignal, progress, beforePublish);
  } finally {
    editor.endPreview(owner);
  }
}

test("Move-family matches dense Float32 and ordered chunk position/normal bytes across signed pages", async () => {
  const layout = { dimensions: [49, 33, 49], latticeMin: [-16, 0, 0] };
  const dense = make(false, layout, -1.14),
    sparse = make(true, layout, -1.14);
  const priorWorker = globalThis.Worker;
  try {
    for (const editor of [dense, sparse]) {
      const { volume } = editor.active;
      sculptMask(volume).write(volume.index(14, 17, 20), 0.75);
      sculptMask(volume).write(volume.index(13, 16, 20), 1);
      sculptPaint(volume).channels[3].write(volume.index(14, 17, 20), 0.9);
      editor.setActiveTransform({
        position: [0.25, -0.1, 0.4],
        rotation: [0.2, 0.3, 0.4],
        scale: [1, 1, 1],
      });
    }
    assert.deepEqual(checkpoint(sparse), checkpoint(dense));
    for (const [mode, radius] of [
      ["translate", 0.26],
      ["elastic", 0.28],
      ["rotate", 0.32],
      ["twist", 0.28],
      ["free", 0.34],
    ]) {
      const f = field(mode, radius, [-1.14, 0.015, 0.27], [0.11, 0.02, 0.05]);
      const before = checkpoint(sparse);
      const source = sparse.active.volume;
      globalThis.Worker = undefined;
      assert(await move(dense, f), mode);
      globalThis.Worker = BrowserWorker;
      // A different mesh publication order must not change equal-distance ties.
      sparse.active.surface.group.children.reverse();
      assert(await move(sparse, f), mode);
      assert.equal(sparse.lastMoveStats.backend, "worker");
      assert(sparse.lastMoveStats.workerInputBytes > 0);
      assert.deepEqual(checkpoint(sparse), checkpoint(dense), mode);
      assert.equal(sparse.active.volume.getDenseView(), undefined);
      assert.equal(
        sparse.active.volume.sampleWorld(
          { x: -0.9, y: 0.05, z: 0.31 },
          sparse.active.layer.transform,
        ),
        dense.active.volume.sampleWorld(
          { x: -0.9, y: 0.05, z: 0.31 },
          dense.active.layer.transform,
        ),
      );
      assert.notEqual(source, sparse.active.volume);
      assert.equal(fieldSignature(source), before.field);
      assert.deepEqual(
        [...sculptPaint(sparse.active.volume).channels[3].entries()],
        [...sculptPaint(dense.active.volume).channels[3].entries()],
      );
      const after = checkpoint(sparse);
      sparse.undo();
      drain(sparse);
      assert.deepEqual(checkpoint(sparse), before);
      sparse.undo(true);
      drain(sparse);
      assert.deepEqual(checkpoint(sparse), after);
    }
    const opened = new IndependentLayers(openSculptProject(saveSculptProject(sparse.project)));
    try {
      assert.deepEqual(checkpoint(opened), checkpoint(sparse));
    } finally {
      opened.dispose();
    }
  } finally {
    globalThis.Worker = priorWorker;
    dense.dispose();
    sparse.dispose();
  }
});

test("Move grows at fixed spacing, remaps history and refuses without changing source or redo", async () => {
  const sparse = make(true, undefined, -0.48),
    dense = make(false, undefined, -0.48);
  const f = field("free", 0.23, [-0.72, 0, 0.05], [-0.69, 0.04, 0.08]);
  try {
    for (const editor of [sparse, dense]) {
      editor.beginStroke(true);
      editor.applyStrokeLocal({ x: -0.34, y: 0, z: 0.24 }, 0.15, "mask", 0.8, 1 / 60, 0.6, true);
      editor.finishStroke();
      assert([...sculptMask(editor.active.volume).entries()].length);
    }
    const before = checkpoint(sparse);
    assert(await move(dense, f));
    assert(await move(sparse, f));
    const moved = checkpoint(sparse);
    assert.deepEqual(moved, checkpoint(dense));
    assert(sparse.lastMoveStats.grew);
    assert(sparse.active.volume.latticeMin[0] < 0);
    assert.equal(sparse.active.volume.step, before.layout[2]);
    assert(sparse.undo());
    drain(sparse);
    assert(sparse.undo());
    assert(sculptMask(sparse.active.volume).empty);
    assert(sparse.undo(true));
    assert([...sculptMask(sparse.active.volume).entries()].length);
    const source = sparse.active.volume,
      beforeRefusal = checkpoint(sparse);
    const bytes = new Uint8Array(saveSculptProject(sparse.project));
    const rejects = async (run, pattern) => {
      await assert.rejects(run, pattern);
      assert.equal(sparse.active.volume, source);
      assert.equal(sparse.redoCount, 1);
      assert.deepEqual(checkpoint(sparse), beforeRefusal);
      assert.deepEqual(new Uint8Array(saveSculptProject(sparse.project)), bytes);
    };
    sparse.growthLimits = { maxTransientBytes: 65536 };
    await rejects(() => move(sparse, f), /memory/);
    sparse.growthLimits = {};
    await rejects(
      () => move(sparse, field("translate", 0.25, [-0.7, 0, 0], [-150, 0, 0])),
      /logical lattice/,
    );
    const abort = new AbortController();
    await rejects(() => move(sparse, f, abort.signal, undefined, () => abort.abort()), /cancelled/);
    sparse.symmetry.enabled = true;
    await rejects(() => move(sparse, f), /Turn off Mirror/);
    sparse.symmetry.enabled = false;
    assert(sparse.undo(true));
    drain(sparse);
    assert.deepEqual(checkpoint(sparse), moved);
  } finally {
    dense.dispose();
    sparse.dispose();
  }
});

test("sparse Plane Cut preserves exact positive far field, sidecars, and a recoverable native project", async () => {
  const layout = { dimensions: [49, 33, 33], latticeMin: [-16, 0, 0] };
  const dense = make(false, layout, -1.14),
    sparse = make(true, layout, -1.14);
  const pose = {
    position: [0.4, -0.075, 0.18],
    rotation: [0.2, -0.14, 0.3],
    scale: [1.15, 1.15, 1.15],
  };
  const rotation = new Euler(...pose.rotation);
  const cut = {
    point: new Vector3(-1.1, 0, 0)
      .multiplyScalar(pose.scale[0])
      .applyEuler(rotation)
      .add(new Vector3(...pose.position))
      .toArray(),
    normal: new Vector3(1, 0.22, 0.16).applyEuler(rotation).toArray(),
  };
  try {
    for (const editor of [dense, sparse]) {
      const v = editor.active.volume;
      v.writeVoxel(v.index(40, 16, 16), 0.125);
      const index = v.index(14, 16, 16);
      sculptMask(v).write(index, 0.8);
      for (const channel of sculptPaint(v).channels) channel.write(index, 0.6);
    }
    for (const editor of [dense, sparse]) assert(editor.setActiveTransform(pose));
    const source = sparse.active.volume,
      before = checkpoint(sparse);
    sparse.growthLimits = { maxTransientBytes: 65536 };
    await assert.rejects(() => sparse.cutByPlane(cut, signal(), () => {}), /memory/);
    sparse.growthLimits = {};
    const abort = new AbortController();
    await assert.rejects(
      () =>
        sparse.cutByPlane(cut, abort.signal, (stage) => {
          if (stage.includes("previews")) abort.abort();
        }),
      /cancelled/,
    );
    assert.equal(sparse.active.volume, source);
    assert.equal(sparse.undoCount, 1);
    assert.deepEqual(checkpoint(sparse), before);
    for (const editor of [dense, sparse]) await editor.cutByPlane(cut, signal(), () => {});
    const compare = (first, second) => {
      const ids = first.project.layerStack.layers.map(({ id }) => id);
      const other = second.project.layerStack.layers.map(({ id }) => id);
      assert.equal(ids.length, 2);
      for (let i = 0; i < 2; i++) {
        first.select(ids[i]);
        second.select(other[i]);
        assert.deepEqual(checkpoint(first), checkpoint(second));
        assert.deepEqual(
          [...sculptMask(first.active.volume).entries()],
          [...sculptMask(second.active.volume).entries()],
        );
        assert.deepEqual(
          [...sculptPaint(first.active.volume).channels[3].entries()],
          [...sculptPaint(second.active.volume).channels[3].entries()],
        );
      }
    };
    compare(sparse, dense);
    const negative = sparse.project.layerStack.layers[0].volume;
    assert(negative.readVoxel(negative.index(40, 16, 16)) > 0.125);
    sparse.undo();
    assert.deepEqual(checkpoint(sparse), before);
    sparse.undo(true);
    compare(sparse, dense);
    const { snapshot } = await captureProject(
      sparse,
      settings,
      undefined,
      undefined,
      signal(),
      () => true,
    );
    const recovered = new IndependentLayers(
      openSculptProject(saveSculptProject(hydrateProject(snapshot))),
    );
    try {
      compare(sparse, recovered);
    } finally {
      recovered.dispose();
    }
  } finally {
    dense.dispose();
    sparse.dispose();
  }
});

test("reclamation preserves pins, far-field bits, sidecars and cached readers across deletion and reuse", () => {
  const volume = new SparseSDFVolume(33, 1);
  const editor = new IndependentLayers(createBaseProject(volume, settings));
  const center = { x: 0.1, y: 0.1, z: 0.1 };
  const dab = () => editor.applyStrokeLocal(center, 0.12, "add", 0.8, 1 / 60, 0.6, true);
  try {
    editor.beginStroke();
    assert(dab());
    editor.cancelStroke();
    const read = volume.prepareSampleReader();
    const [key] = [...volume.residentPages()][0];
    const { min } = volume.pageBounds(key);
    const index = volume.index(...min),
      far = volume.index(0, 0, 0);
    sculptMask(volume).write(index, 0.5);
    sculptPaint(volume).channels[3].write(index, 0.75);
    volume.writeVoxel(far, 0.025);
    assert.equal(read(...min), 4);
    const release = volume.pinResidentPages();
    drain(editor);
    assert(volume.isPagePinned(key));
    assert(volume.allocatedPages > 1);
    release();
    for (let i = 0; i < 10; i++) editor.drainSparseMeshes();
    assert.equal(volume.allocatedPages, 1);
    assert.equal(volume.pageState(key), "implicit");
    assert.equal(read(...min), 4);
    assert.equal(volume.readVoxel(far), Math.fround(0.025));
    assert.equal(sculptMask(volume).read(index), 0.5);
    assert.equal(sculptPaint(volume).channels[3].read(index), 0.75);
    volume.writeVoxel(index, 0.75);
    assert.equal(read(...min), 0.75);
    volume.writeVoxel(index, 4);

    editor.beginStroke();
    assert(dab());
    editor.finishStroke();
    drain(editor);
    assert(editor.undo());
    drain(editor);
    const pinned = volume.allocatedPages;
    assert(pinned > 1);
    assert(editor.undo(true));
    drain(editor);
    assert(editor.undo());
    drain(editor);
    assert.equal(volume.allocatedPages, pinned);
    editor.maskOperation("invert");
    for (let i = 0; i < 10; i++) editor.drainSparseMeshes();
    assert.equal(editor.redoCount, 0);
    assert.equal(volume.allocatedPages, 1);
    assert.equal(sculptMask(volume).read(index), 0.5);
    assert.equal(sculptPaint(volume).channels[3].read(index), 0.75);
  } finally {
    editor.dispose();
  }
});

test("history eviction releases only implicit pages and leaves replay allocation-free", () => {
  const volume = new SparseSDFVolume(33, 1);
  const history = new SculptHistory(volume, 1024, 1);
  volume.pageHistory = history;
  const initial = volume.index(0, 0, 0);
  const replace = (index, value) => {
    history.begin();
    history.record(index, volume.readVoxel(index), value);
    volume.writeVoxel(index, value);
    assert(history.commit());
  };
  replace(initial, 0.4);
  replace(initial, 4);
  assert.equal(volume.reclaimImplicitPages(8), 0);
  assert(history.undo());
  assert.equal(volume.readVoxel(initial), Math.fround(0.4));
  assert(history.redo());
  assert.equal(volume.readVoxel(initial), 4);
  const next = volume.index(24, 24, 24);
  replace(next, 0.72);
  assert.equal(volume.reclaimImplicitPages(8), 1);
  assert.equal(volume.readVoxel(initial), 4);
  assert.equal(volume.readVoxel(next), Math.fround(0.72));
  volume.admitAllocation = () => assert.fail("retained history must replay without allocation");
  assert(history.undo());
  assert.equal(volume.reclaimImplicitPages(8), 0);
  assert(history.redo());
  assert.equal(volume.readVoxel(next), Math.fround(0.72));
});

test("sparse Move destination page refusal preserves the source", async () => {
  const fixture = make(true, undefined, -0.48);
  const cap = fixture.active.volume.allocatedPages;
  fixture.dispose();
  const editor = make(true, undefined, -0.48, cap);
  try {
    const before = checkpoint(editor),
      source = editor.active.volume;
    const f = field("free", 0.23, [-0.72, 0, 0.05], [-0.69, 0.04, 0.08]);
    await assert.rejects(() => move(editor, f), /page budget/);
    assert.equal(editor.active.volume, source);
    assert.equal(editor.undoCount, 0);
    assert.equal(source.allocatedPages, cap);
    assert.deepEqual(checkpoint(editor), before);
  } finally {
    editor.dispose();
  }
});
