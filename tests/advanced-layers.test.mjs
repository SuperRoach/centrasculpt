import assert from "node:assert/strict";
import test from "node:test";
import { Group, Matrix4, Vector3 } from "three";
import { installFileReader, readGlb } from "../scripts/fixtures/export-node.mjs";
import { RecoveryBrowserWorker } from "../scripts/fixtures/node-recovery-worker.mjs";
import { evaluateComposite } from "../work/test-build/compositor.mjs";
import { EditorToolState } from "../work/test-build/editor-tool-state.mjs";
import { encodeExport } from "../work/test-build/glb-export.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import {
  LayerGroup,
  MAX_GROUP_DEPTH,
  MAX_LAYER_GROUPS,
  validateHierarchy,
} from "../work/test-build/layer-hierarchy.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { RadialMoveField } from "../work/test-build/move-field.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { encodeRecovery } from "../work/test-build/recovery-client.mjs";
import { sculptMask } from "../work/test-build/sculpt-mask.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { ShapePreviewModel } from "../work/test-build/shape-preview.mjs";
import { defineShape } from "../work/test-build/shapes.mjs";
import {
  copyTransform,
  identityTransform,
  transformMatrix,
} from "../work/test-build/transform.mjs";
import { XRLayerGrab } from "../work/test-build/xr-layer-grab.mjs";
import { XRMenuModel } from "../work/test-build/xr-menu-model.mjs";

const settings = {
    mode: "add",
    radius: 0.2,
    strength: 0.7,
    hardness: 0.3,
    camera: { position: [2, 2, 3], target: [0, 0, 0] },
  },
  pose = (x = 0.4, s = 1.3) => ({
    position: [x, 0.2, -0.3],
    rotation: [0.2, 0.4, -0.1],
    scale: [s, s, s],
  }),
  make = (n = 33) =>
    new IndependentLayers(createBaseProject(new SDFVolume(n), structuredClone(settings))),
  near = (a, b, e = 1e-8) => assert(Math.abs(a - b) < e, `${a} != ${b}`),
  matrixNear = (a, b) =>
    a.elements.forEach((v, i) => {
      near(v, b.elements[i]);
    });
const setup = () => {
  const l = make();
  let state = { ...settings },
    mode = "sculpt";
  const shape = new ShapePreviewModel(l.project.activeLayerId),
    tools = new EditorToolState({
      layers: () => l,
      shape,
      settings: () => state,
      setSettings: (v) => (state = v),
      mode: () => mode,
      selectTool: (t) => {
        mode = t === "transform" ? "translate" : "sculpt";
        shape.setEnabled(t === "stamp", l.project.layerStack);
        state = { ...state, mode: t === "smooth" ? "smooth" : "add" };
      },
      selectTransform: (m) => (mode = m),
      busy: () => false,
      changed() {},
    });
  return { l, tools, menu: new XRMenuModel(tools) };
};
function grouped(l) {
  const a = l.active.layer,
    g = l.createGroup("Assembly");
  l.reparent(a.id, g);
  l.selectGroup(g);
  l.setActiveTransform(pose());
  l.select(a.id);
  return { a, g, h: l.project.layerStack.hierarchy };
}
for (const n of [64, 128, 192])
  test(`${n}³ cooperative duplication copies authoritative volume, mask and pose independently with one undo action`, async () => {
    const l = make(n);
    try {
      const a = l.active.layer;
      sculptMask(a.volume).write(17, 0.7);
      a.transform = pose();
      l.syncPresentation();
      const before = l.undoCount,
        copy = await l.duplicateAsync(a.id);
      assert.notEqual(copy.id, a.id);
      assert.notEqual(copy.volume.values.buffer, a.volume.values.buffer);
      assert.deepEqual(copy.volume.values, a.volume.values);
      matrixNear(transformMatrix(copy.transform), transformMatrix(a.transform));
      assert.equal(sculptMask(copy.volume).read(17), sculptMask(a.volume).read(17));
      sculptMask(copy.volume).write(17, 0);
      assert(sculptMask(a.volume).read(17) > 0);
      copy.volume.writeVoxel(17, 3);
      assert.notEqual(copy.volume.readVoxel(17), a.volume.readVoxel(17));
      assert.equal(l.undoCount, before + 1);
      const id = copy.id;
      l.undo();
      assert.equal(l.project.layerStack.layers.length, 1);
      l.undo(true);
      assert.equal(l.active.layer.id, id);
      assert.equal(
        l.display.colour(l.project.id, id, copy.order),
        l.display.colour(l.project.id, a.id, a.order),
      );
    } finally {
      l.dispose();
    }
  });
test("expanded negative lattices duplicate with independent buffers and mask alignment", async () => {
  const l = make(64);
  try {
    l.beginStroke();
    l.applyStrokeLocal({ x: -2, y: 0, z: 0 }, 0.15, "add", 1, 0.02, 0.4, true);
    l.finishStroke();
    const a = l.active.layer,
      id = a.volume.index(2, 2, 2);
    sculptMask(a.volume).write(id, 0.5);
    const b = await l.duplicateAsync(a.id);
    assert.deepEqual(b.volume.dimensions, a.volume.dimensions);
    assert.deepEqual(b.volume.latticeMin, a.volume.latticeMin);
    assert.equal(sculptMask(b.volume).read(id), 0.5);
    assert.notEqual(b.volume.values.buffer, a.volume.values.buffer);
  } finally {
    l.dispose();
  }
});
test("duplication cancellation keeps original, redo, active selection and allocations intact", async () => {
  const l = make(128);
  try {
    l.setActiveTransform(pose());
    l.undo();
    const before = saveSculptProject(l.project),
      count = l.undoCount,
      redo = l.redoCount,
      abort = new AbortController(),
      job = l.duplicateAsync(l.active.layer.id, abort.signal);
    assert(l.duplicating);
    assert.throws(() => l.createGroup(), /duplication/);
    abort.abort();
    await assert.rejects(job, /cancelled/);
    assert.equal(l.undoCount, count);
    assert.equal(l.redoCount, redo);
    assert.deepEqual(saveSculptProject(l.project), before);
    assert(!l.duplicating);
    assert.equal(l.resourceStats().retainedRuntimes, 1);
  } finally {
    l.dispose();
  }
});
test("group creation allocates no SDF, group transforms preserve child-local data and mesh identities", () => {
  const l = make(),
    a = l.active.layer,
    values = a.volume.values.slice(),
    geometries = l.active.surface.group.children.map((m) => m.geometry),
    local = copyTransform(a.transform);
  try {
    const count = l.project.layerStack.layers.length,
      g = l.createGroup("Model");
    assert.equal(l.project.layerStack.layers.length, count);
    assert(l.transformNode instanceof LayerGroup);
    assert.throws(() => l.beginStroke(), /child layer/);
    l.reparent(a.id, g);
    l.selectGroup(g);
    l.setActiveTransform(pose());
    assert.deepEqual(a.localTransform, local);
    matrixNear(
      transformMatrix(a.transform),
      transformMatrix(pose()).multiply(transformMatrix(local)),
    );
    assert.deepEqual(a.volume.values, values);
    assert.deepEqual(
      l.runtime(a.id).surface.group.children.map((m) => m.geometry),
      geometries,
    );
    assert.equal(l.pendingChunks, 0);
  } finally {
    l.dispose();
  }
});
test("nested group and layer reparent/ungroup preserve visible assembled pose", () => {
  const l = make();
  try {
    const a = l.active.layer;
    a.transform = pose(0.7, 0.8);
    l.syncPresentation();
    const first = l.createGroup("First");
    l.setActiveTransform(pose(-0.4, 1.2));
    const second = l.createGroup("Second");
    l.setActiveTransform(pose(0.3, 0.9));
    const before = transformMatrix(a.transform);
    l.reparent(a.id, first);
    matrixNear(transformMatrix(a.transform), before);
    const groupBefore = transformMatrix(l.project.layerStack.hierarchy.world(first));
    l.reparent(first, second);
    matrixNear(transformMatrix(l.project.layerStack.hierarchy.world(first)), groupBefore);
    matrixNear(transformMatrix(a.transform), before);
    l.deleteGroup(first, "keep");
    matrixNear(transformMatrix(a.transform), before);
    assert.equal(l.project.layerStack.hierarchy.parent(a.id), second);
    l.reparent(a.id, null);
    matrixNear(transformMatrix(a.transform), before);
  } finally {
    l.dispose();
  }
});
test("cycles, missing parents, nonuniform groups and invalid depth reject atomically without consuming redo", () => {
  const l = make();
  try {
    const a = l.createGroup("A"),
      b = l.createGroup("B");
    l.reparent(b, a);
    const before = l.project.layerStack.hierarchy.snapshot(),
      count = l.undoCount;
    assert.throws(() => l.reparent(a, b), /hierarchy/);
    assert.throws(() => l.reparent(a, "missing"), /exist/);
    assert.deepEqual(l.project.layerStack.hierarchy.snapshot(), before);
    assert.equal(l.undoCount, count);
    l.selectGroup(a);
    assert.throws(() => l.setActiveTransform({ ...pose(), scale: [1, 2, 1] }), /uniform/);
    assert.deepEqual(l.project.layerStack.hierarchy.snapshot(), before);
    let parent = b;
    for (let i = 2; i <= MAX_GROUP_DEPTH; i++) {
      const g = l.createGroup("Nested " + i);
      l.reparent(g, parent);
      parent = g;
    }
    const g = l.createGroup("Too deep"),
      state = l.project.layerStack.hierarchy.snapshot();
    assert.throws(() => l.reparent(g, parent), /hierarchy/);
    assert.deepEqual(l.project.layerStack.hierarchy.snapshot(), state);
  } finally {
    l.dispose();
  }
});
test("group capacity is bounded without extra voxel allocation", () => {
  const l = make();
  try {
    const samples = l.active.volume.values.length;
    for (let i = 0; i < MAX_LAYER_GROUPS; i++) l.createGroup("G" + i);
    const before = l.project.layerStack.hierarchy.snapshot();
    assert.throws(() => l.createGroup("Overflow"), /hierarchy/);
    assert.deepEqual(l.project.layerStack.hierarchy.snapshot(), before);
    assert.equal(l.active.volume.values.length, samples);
  } finally {
    l.dispose();
  }
});
test("effective group visibility and locks remember child flags and gate tools, CSG and exports", () => {
  const l = make();
  try {
    const { a, g, h } = grouped(l),
      b = l.create(64);
    l.reparent(b.id, g);
    l.setFlag(b.id, "visible", false);
    l.setFlag(b.id, "locked", true);
    l.setNodeFlag(g, "visible", false);
    assert(!a.visible && !b.visible);
    l.setNodeFlag(g, "visible", true);
    assert(a.visible && !b.visible);
    l.setNodeFlag(g, "locked", true);
    assert(a.locked && b.locked);
    l.select(a.id);
    assert.throws(() => l.beginStroke(), /locked/);
    assert.throws(() => l.maskOperation("all"), /locked/);
    assert.throws(() => l.reparent(a.id, null), /locked/);
    assert.throws(() => l.setFlag(a.id, "locked", false), /parent/);
    l.setNodeFlag(g, "locked", false);
    assert(!a.locked && b.locked);
    l.setNodeFlag(g, "visible", false);
    assert.equal(l.exportSources("visible").length, 0);
    assert.equal(evaluateComposite(l.project.layerStack.layers, { x: 0, y: 0, z: 0 }), 1);
    assert.equal(h.get(g).localVisible, false);
  } finally {
    l.dispose();
  }
});
test("group rename, reparent, transform and ungroup are individually undoable and redoable", () => {
  const l = make();
  try {
    const a = l.active.layer,
      before = l.project.layerStack.hierarchy.snapshot();
    const g = l.createGroup("Group");
    l.reparent(a.id, g);
    l.renameNode(g, "Assembly");
    l.selectGroup(g);
    l.setActiveTransform(pose());
    const after = l.project.layerStack.hierarchy.snapshot();
    assert.equal(l.undoCount, 4);
    for (let i = 0; i < 4; i++) l.undo();
    assert.deepEqual(l.project.layerStack.hierarchy.snapshot(), before);
    for (let i = 0; i < 4; i++) l.undo(true);
    assert.deepEqual(l.project.layerStack.hierarchy.snapshot(), after);
    l.deleteGroup(g, "keep");
    assert.equal(l.project.layerStack.hierarchy.groups.length, 0);
    l.undo();
    assert.deepEqual(l.project.layerStack.hierarchy.snapshot(), after);
  } finally {
    l.dispose();
  }
});
test("group deletion with children restores exact sources, masks and hierarchy in one undo transaction", () => {
  const l = make();
  try {
    const { a, g } = grouped(l),
      b = l.create(64);
    l.select(a.id);
    sculptMask(a.volume).write(4, 1);
    const before = l.project.layerStack.hierarchy.snapshot(),
      source = a.volume,
      geometries = l.runtime(a.id).surface.group.children.map((m) => m.geometry),
      count = l.undoCount;
    l.deleteGroup(g, "delete");
    assert.equal(l.undoCount, count + 1);
    assert.equal(l.project.layerStack.layers.length, 1);
    assert.equal(l.active.layer.id, b.id);
    l.undo();
    assert.deepEqual(l.project.layerStack.hierarchy.snapshot(), before);
    assert.equal(l.project.layerStack.get(a.id).volume, source);
    assert.equal(sculptMask(source).read(4), 1);
    assert.deepEqual(
      l.runtime(a.id).surface.group.children.map((m) => m.geometry),
      geometries,
    );
    l.undo(true);
    assert.equal(l.project.layerStack.layers.length, 1);
  } finally {
    l.dispose();
  }
});
test("delete-all and deletion of locked descendants fail without partial hierarchy mutations", () => {
  const l = make();
  try {
    const { a, g, h } = grouped(l),
      before = h.snapshot();
    assert.throws(() => l.deleteGroup(g, "delete"), /at least one/);
    assert.deepEqual(h.snapshot(), before);
    l.create(64);
    l.setFlag(a.id, "locked", true);
    const locked = h.snapshot();
    assert.throws(() => l.deleteGroup(g, "delete"), /Unlock descendants/);
    assert.deepEqual(h.snapshot(), locked);
  } finally {
    l.dispose();
  }
});
test("cancelled group transform restores metadata and keeps redo intact", () => {
  const l = make();
  try {
    const { g, h } = grouped(l);
    l.selectGroup(g);
    l.setActiveTransform(pose(0.7));
    l.undo();
    const before = h.snapshot(),
      redo = l.redoCount;
    l.beginTransform();
    l.updateTransform(pose(-0.7));
    l.cancelTransform();
    assert.deepEqual(h.snapshot(), before);
    assert.equal(l.redoCount, redo);
  } finally {
    l.dispose();
  }
});
test("palette reorder preserves explicit Boolean sequence and native roundtrip", () => {
  const l = make();
  try {
    const a = l.active.layer,
      b = l.create(64);
    l.setActiveTransform({ position: [0.5, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
    l.setOperation(b.id, "difference");
    const p = { x: 0.4, y: 0, z: 0 },
      before = evaluateComposite(l.project.layerStack.layers, p),
      values = a.volume.values.slice();
    l.moveNode(b.id, -1);
    assert.equal(l.project.layerStack.layers[0].id, b.id);
    assert.equal(evaluateComposite(l.project.layerStack.layers, p), before);
    const reopened = openSculptProject(saveSculptProject(l.project));
    assert.equal(evaluateComposite(reopened.layerStack.layers, p), before);
    l.undo();
    assert.equal(l.project.layerStack.layers[0].id, a.id);
    l.undo(true);
    assert.deepEqual(a.volume.values, values);
  } finally {
    l.dispose();
  }
});
for (const mode of ["add", "subtract", "smooth", "flatten", "inflate", "pinch", "crease", "scrape"])
  test(`${mode}: grouped world-to-SDF mapping matches an ungrouped reference exactly`, () => {
    const l = make(),
      reference = make();
    try {
      const { a } = grouped(l),
        local = { x: 0, y: 0, z: 0.8 },
        world = new Vector3(local.x, local.y, local.z).applyMatrix4(transformMatrix(a.transform)),
        scale = a.transform.scale[0];
      l.beginStroke();
      l.applyStroke(world, 0.22 * scale, mode, 0.7, 0.03, 0.3);
      l.finishStroke();
      reference.beginStroke();
      reference.applyStrokeLocal(local, 0.22, mode, 0.7, 0.03, 0.3);
      reference.finishStroke();
      assert.deepEqual(a.volume.values, reference.active.volume.values);
    } finally {
      l.dispose();
      reference.dispose();
    }
  });
test("grouped mask painting, symmetry and later transforms keep voxel-local protection aligned", () => {
  const l = make();
  try {
    const { a, g, h } = grouped(l);
    l.symmetry.enabled = true;
    const local = { x: 0.3, y: 0, z: 0.8 },
      world = new Vector3(local.x, local.y, local.z).applyMatrix4(transformMatrix(a.transform));
    l.beginStroke(true);
    l.applyStroke(world, 0.2 * a.transform.scale[0], "mask", 1, 0.1, 0.3);
    l.finishStroke();
    const m = sculptMask(a.volume),
      samples = [...m.entries()];
    assert(samples.length);
    near(m.sample(local), m.sample({ ...local, x: -0.3 }), 1e-6);
    l.selectGroup(g);
    l.setActiveTransform(pose(-0.4, 0.9));
    assert.deepEqual([...m.entries()], samples);
    assert.equal(h.parent(a.id), g);
  } finally {
    l.dispose();
  }
});
for (const mode of ["non-elastic", "elastic", "rotate", "twist"])
  test(`${mode} reconstruction on grouped source retains parent/local poses and mask invariance`, async () => {
    const l = make(),
      owner = {};
    try {
      const { a, g, h } = grouped(l),
        before = copyTransform(a.localTransform),
        parent = h.get(g).localTransform,
        field = new RadialMoveField(),
        id = a.volume.index(16, 16, 24),
        value = a.volume.readVoxel(id);
      sculptMask(a.volume).write(id, 1);
      field.capture(new Vector3(0, 0, 0.85), 0.25, 2, 1);
      field.configure(mode === "elastic" ? "elastic" : "non-elastic", 1);
      if (mode === "rotate" || mode === "twist") {
        field.interaction = mode;
        field.setRotation(new Vector3(0, 1, 0), 0.5);
      } else field.setDisplacement(new Vector3(0.05, 0, 0.04));
      l.beginPreview(owner);
      assert(await l.commitMove(owner, field, new AbortController().signal));
      l.endPreview(owner);
      assert.deepEqual(a.localTransform, before);
      assert.deepEqual(h.get(g).localTransform, parent);
      assert.equal(a.volume.readVoxel(id), value);
      assert.equal(sculptMask(a.volume).read(id), 1);
    } finally {
      l.endPreview(owner);
      l.dispose();
    }
  });
test("Shape Stamp uses grouped source pose without changing local transforms or parent", () => {
  const l = make();
  try {
    const { a, g, h } = grouped(l),
      shape = new ShapePreviewModel(a.id),
      local = { position: [0, 0, 0.75], rotation: [0, 0, 0], scale: [1, 1, 1] },
      world = transformMatrix(a.transform).multiply(transformMatrix(local)),
      position = new Vector3().setFromMatrixPosition(world);
    shape.setWorldTransform(
      { position: position.toArray(), rotation: a.transform.rotation, scale: a.transform.scale },
      l.project.layerStack,
    );
    const d = defineShape({
        kind: "sphere",
        operation: "subtract",
        targetLayerId: a.id,
        dimensions: [0.4, 0.4, 0.4],
        transform: local,
      }),
      before = copyTransform(a.localTransform);
    assert(l.stampShape(d));
    assert.deepEqual(a.localTransform, before);
    assert.equal(h.parent(a.id), g);
  } finally {
    l.dispose();
  }
});
test("procedural tube duplication retains editable independent spline definitions inside a group", async () => {
  const l = make();
  try {
    const tube = await l.regenerateTube({
        kind: "tube",
        closed: false,
        interpolation: "linear",
        points: [
          { id: "a", position: [-0.4, 0, 0], radius: 0.15 },
          { id: "b", position: [0.4, 0, 0], radius: 0.15 },
        ],
      }),
      g = l.createGroup("Tubes");
    l.reparent(tube.id, g);
    l.select(tube.id);
    const copy = await l.duplicateAsync(tube.id);
    assert.notEqual(copy.procedural, tube.procedural);
    assert.deepEqual(copy.procedural, tube.procedural);
    assert.notEqual(copy.procedural.points[0].position, tube.procedural.points[0].position);
    assert.equal(l.project.layerStack.hierarchy.parent(copy.id), g);
    const original = structuredClone(tube.procedural),
      edit = structuredClone(copy.procedural);
    edit.points[0].position[1] = 0.2;
    await l.regenerateTube(edit, copy.id);
    assert.deepEqual(tube.procedural, original);
    assert.equal(l.active.layer.procedural.points[0].position[1], 0.2);
    assert.equal(l.project.layerStack.hierarchy.parent(copy.id), g);
  } finally {
    l.dispose();
  }
});
test("native v7 and actual recovery worker preserve nested groups, masks, local flags and Boolean order", async () => {
  const l = make(),
    previous = globalThis.Worker;
  globalThis.Worker = RecoveryBrowserWorker;
  try {
    const { a, g, h } = grouped(l);
    sculptMask(a.volume).write(8, 0.7);
    const outer = l.createGroup("Outer");
    l.reparent(g, outer);
    l.selectGroup(outer);
    l.setActiveTransform(pose(-0.4, 0.8));
    l.select(a.id);
    const b = await l.duplicateAsync(a.id);
    l.moveNode(b.id, -1);
    l.setFlag(a.id, "visible", false);
    const before = h.snapshot(),
      raw = saveSculptProject(l.project);
    assert.equal(new DataView(raw).getUint32(8, true), 7);
    const loaded = openSculptProject(raw);
    assert.deepEqual(loaded.layerStack.hierarchy.snapshot(), before);
    matrixNear(
      transformMatrix(loaded.layerStack.get(b.id).transform),
      transformMatrix(b.transform),
    );
    assert.equal(
      sculptMask(loaded.layerStack.get(b.id).volume).read(8),
      sculptMask(b.volume).read(8),
    );
    const result = await encodeRecovery(
      l,
      settings,
      undefined,
      undefined,
      new AbortController().signal,
      () => true,
    );
    assert.deepEqual(result.data, raw);
    assert.equal(RecoveryBrowserWorker.active, 0);
  } finally {
    l.dispose();
    globalThis.Worker = previous;
  }
});
test("flat legacy projects load without groups or parent transforms", () => {
  const l = make();
  try {
    const before = saveSculptProject(l.project),
      loaded = openSculptProject(before);
    assert(new DataView(before).getUint32(8, true) < 7);
    assert.equal(loaded.layerStack.hierarchy.groups.length, 0);
    assert.deepEqual(loaded.activeLayer.transform, l.active.layer.transform);
  } finally {
    l.dispose();
  }
});
for (const bad of ["cycle", "missing", "duplicate", "type", "scale", "ordering", "depth"])
  test(`hierarchy import rejects ${bad} before changing live state`, () => {
    const l = make();
    try {
      const { a, g, h } = grouped(l),
        state = h.snapshot(),
        badState = structuredClone(state);
      if (bad === "cycle") badState.groups[0].parentId = g;
      if (bad === "missing") badState.layers[0].parentId = "missing";
      if (bad === "duplicate") badState.groups[0].id = a.id;
      if (bad === "type") badState.groups[0].kind = "mesh";
      if (bad === "scale") badState.groups[0].transform.scale = [1, 2, 1];
      if (bad === "ordering") badState.compositionOrder = [];
      if (bad === "depth") {
        for (let i = 0; i < 10; i++)
          badState.groups.push({
            kind: "group",
            id: "deep" + i,
            name: "Deep",
            parentId: i ? "deep" + (i - 1) : null,
            visible: true,
            locked: false,
            transform: identityTransform(),
          });
        badState.order.push(...badState.groups.slice(1).map((g) => g.id));
      }
      assert.throws(() => h.restore(badState));
      assert.deepEqual(h.snapshot(), state);
      assert.throws(() => validateHierarchy(badState, [a.id]));
    } finally {
      l.dispose();
    }
  });
for (const quality of ["fast", "standard", "high"])
  test(`GLB ${quality} preserves assembled grouped transforms and excludes hidden descendants/helpers/masks`, async () => {
    installFileReader();
    const l = make();
    try {
      const { a, g } = grouped(l);
      sculptMask(a.volume).write(4, 1);
      l.updateMaskOverlays(Infinity);
      const b = l.create(64);
      l.setFlag(b.id, "visible", false);
      l.selectGroup(g);
      const sources = l.exportSources("visible");
      assert.equal(sources.length, 1);
      matrixNear(transformMatrix(sources[0].transform), transformMatrix(a.transform));
      const result = await encodeExport(sources, quality, 256 * 1024 ** 2),
        loaded = await readGlb(result.data);
      loaded.scene.updateMatrixWorld(true);
      const meshes = [];
      loaded.scene.traverse((n) => {
        if (n.isMesh) meshes.push(n);
      });
      assert.equal(meshes.length, 1);
      matrixNear(meshes[0].matrixWorld, transformMatrix(a.transform));
      assert(!meshes[0].geometry.getAttribute("sculptMaskWeight"));
      assert.equal(meshes[0].userData.layerId, a.id);
    } finally {
      l.dispose();
    }
  });
for (const hand of ["left", "right"])
  test(`${hand} Tool grip transforms selected group through workspace coordinates without touching child SDF`, () => {
    const l = make(),
      workspace = new Group(),
      grab = new XRLayerGrab(() => l),
      tool = {
        role: "tool",
        handedness: hand,
        connectionId: 1,
        connected: true,
        tracked: true,
        gripTracked: true,
        buttons: { grip: { pressed: true, justPressed: true } },
      };
    try {
      workspace.add(l.group);
      workspace.position.set(0.2, 0.3, -0.5);
      workspace.rotation.y = 0.4;
      workspace.scale.setScalar(0.5);
      const { a, g, h } = grouped(l);
      l.selectGroup(g);
      const values = a.volume.values.slice(),
        local = copyTransform(a.localTransform),
        before = transformMatrix(h.world(g)),
        count = l.undoCount;
      workspace.updateWorldMatrix(true, true);
      const start = workspace.matrixWorld.clone(),
        end = workspace.matrixWorld.clone().multiply(new Matrix4().makeTranslation(0.2, 0, 0));
      grab.step(tool, start, 0, true);
      assert(grab.active);
      tool.buttons.grip.justPressed = false;
      grab.step(tool, end, 16, true);
      tool.buttons.grip.pressed = false;
      grab.step(tool, end, 32, true);
      assert(!grab.active);
      matrixNear(
        transformMatrix(h.world(g)),
        new Matrix4().makeTranslation(0.2, 0, 0).multiply(before),
      );
      assert.deepEqual(a.localTransform, local);
      assert.deepEqual(a.volume.values, values);
      assert.equal(l.undoCount, count + 1);
      l.undo();
      matrixNear(transformMatrix(h.world(g)), before);
    } finally {
      grab.dispose?.();
      l.dispose();
    }
  });
test("XR palette hierarchy pages, expansion, actions, parent choices and rename keyboard remain bounded", () => {
  const { l, tools, menu } = setup();
  try {
    const a = l.active.layer,
      g = l.createGroup("Assembly");
    l.reparent(a.id, g);
    for (let i = 0; i < 9; i++) l.createGroup("Empty " + i);
    menu.setRequest("layers");
    const seen = new Set();
    for (let page = 0; page < 8; page++) {
      const content = menu.content(),
        rects = content.buttons.filter((b) => b.rect);
      for (const b of rects) {
        const r = b.rect;
        assert(r.x >= 0 && r.y >= 0 && r.x + r.width <= 1152 && r.y + r.height < 1040);
        assert.equal(menu.hit(r.x + r.width / 2, r.y + r.height / 2), b.id);
        if (b.id.startsWith("hier:node:")) seen.add(b.id.slice(10));
      }
      if (content.buttons.find((b) => b.id === "hier:next").disabled) break;
      menu.activate("hier:next");
    }
    assert.equal(seen.size, 11);
    menu.palette.page = 0;
    menu.activate(`hier:group:${g}`);
    assert.equal(l.selectedGroupId, g);
    menu.activate(`hier:node:${g}`);
    menu.activate("hier:rename");
    menu.activate("hier:key-clear");
    menu.activate("hier:key-shift");
    for (const letter of ["N", "E", "W"]) menu.activate("hier:key:" + letter);
    menu.activate("hier:rename-done");
    assert.equal(l.project.layerStack.hierarchy.get(g).name, "NEW");
    menu.activate("hier:parents");
    assert(menu.content().buttons.some((b) => b.id === "hier:parent:root"));
    menu.activate("hier:parent:root");
    menu.activate(`hier:fold:${g}`);
    menu.activate("hier:list");
    assert(l.collapsedGroups.has(g));
    assert(!l.hierarchyRows().some((r) => r.id === a.id));
  } finally {
    l.dispose();
  }
});
test("VR duplicate action is one transaction and menu interruption cancels an unfinished copy", async () => {
  const { l, menu } = setup();
  try {
    const a = l.active.layer;
    menu.setRequest("layers");
    menu.activate(`hier:node:${a.id}`);
    const count = l.undoCount;
    menu.activate("hier:duplicate");
    assert(l.duplicating);
    menu.setRequest(null);
    while (l.duplicating) await new Promise((r) => setTimeout(r, 5));
    assert.equal(l.project.layerStack.layers.length, 1);
    assert.equal(l.undoCount, count);
    assert.equal(l.redoCount, 0);
  } finally {
    l.dispose();
  }
});
test("grouped Bake outputs an independent root layer and retains masked/procedural sources", async () => {
  const l = make();
  try {
    const { a, g, h } = grouped(l);
    sculptMask(a.volume).write(4, 1);
    const world = transformMatrix(a.transform),
      baked = await l.bake({ name: "Baked", resolution: 64, hideSources: true });
    assert.equal(h.parent(baked.id), null);
    assert(!a.visible);
    assert(sculptMask(baked.volume).empty);
    assert.equal(sculptMask(a.volume).read(4), 1);
    l.undo();
    assert(a.visible);
    matrixNear(transformMatrix(a.transform), world);
    assert.equal(h.parent(a.id), g);
  } finally {
    l.dispose();
  }
});
test("discarded group-delete redo disposes detached runtimes without touching live sources", () => {
  const l = make();
  try {
    const { a, g } = grouped(l);
    l.create(64);
    const runtime = l.runtime(a.id);
    let disposed = 0;
    runtime.material.addEventListener("dispose", () => disposed++);
    l.deleteGroup(g, "delete");
    l.createGroup("New history branch");
    assert.equal(disposed, 0, "past deletion still owns its children");
    l.undo();
    l.undo();
    assert(l.project.layerStack.layers.some((n) => n.id === a.id));
    l.undo(true);
    l.dispose();
    assert.equal(disposed, 1);
  } finally {
    l.dispose();
  }
});
test("explicit Boolean sequence changes are separate from palette order and undo as one action", () => {
  const l = make();
  try {
    const b = l.create(64);
    l.setActiveTransform({ position: [0.5, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
    l.setOperation(b.id, "difference");
    const p = { x: 0.4, y: 0, z: 0 },
      before = evaluateComposite(l.project.layerStack.layers, p),
      visual = l.project.layerStack.layers.map((n) => n.id),
      count = l.undoCount;
    l.moveBoolean(b.id, -1);
    assert(evaluateComposite(l.project.layerStack.layers, p) < 0);
    assert(before > 0);
    assert.deepEqual(
      l.project.layerStack.layers.map((n) => n.id),
      visual,
    );
    assert.equal(l.undoCount, count + 1);
    l.undo();
    assert.equal(evaluateComposite(l.project.layerStack.layers, p), before);
    l.undo(true);
    assert(evaluateComposite(l.project.layerStack.layers, p) < 0);
  } finally {
    l.dispose();
  }
});
test("saving hierarchy never detaches source layer owners or changes their assembled transforms", () => {
  const l = make();
  try {
    const { a, h } = grouped(l),
      before = transformMatrix(a.transform);
    for (let i = 0; i < 3; i++) {
      saveSculptProject(l.project);
      assert.equal(a.hierarchy, h);
      matrixNear(transformMatrix(a.transform), before);
    }
  } finally {
    l.dispose();
  }
});
test("native decoder rejects malformed hierarchy IDs, parents, node types and excess groups safely", () => {
  const l = make();
  try {
    grouped(l);
    const data = saveSculptProject(l.project),
      view = new DataView(data),
      length = view.getUint32(12, true),
      metadata = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 16, length))),
      payload = new Uint8Array(data, 16 + length);
    for (const mutate of [
      (m) => (m.hierarchy.groups[0].parentId = m.hierarchy.groups[0].id),
      (m) => (m.hierarchy.layers[0].parentId = "missing"),
      (m) => (m.hierarchy.groups[0].kind = "mesh"),
      (m) => (m.hierarchy.groups = Array.from({ length: 33 }, () => m.hierarchy.groups[0])),
    ]) {
      const next = structuredClone(metadata);
      mutate(next);
      const json = new TextEncoder().encode(JSON.stringify(next)),
        bad = new ArrayBuffer(16 + json.length + payload.length),
        bytes = new Uint8Array(bad),
        header = new DataView(bad);
      bytes.set(new Uint8Array(data, 0, 16));
      header.setUint32(12, json.length, true);
      bytes.set(json, 16);
      bytes.set(payload, 16 + json.length);
      assert.throws(() => openSculptProject(bad), /hierarchy/);
    }
    assert(l.active.layer.hierarchy);
  } finally {
    l.dispose();
  }
});
for (const hand of ["left", "right"])
  test(`actual ${hand} controller bridge grabs the selected group and keeps workspace navigation separate`, async () => {
    const { XRControllers } = await import("../work/test-build/xr-controllers.mjs"),
      { XRControllerRoles } = await import("../work/test-build/xr-controller-roles.mjs"),
      l = make(),
      roles = new XRControllerRoles();
    roles.setDominant(hand);
    const workspace = new Group(),
      root = new Group(),
      rays = [new Group(), new Group()],
      grips = [new Group(), new Group()],
      source = (h) => ({
        handedness: h,
        profiles: ["meta-quest-touch-plus"],
        targetRayMode: "tracked-pointer",
        gripSpace: {},
        gamepad: {
          mapping: "xr-standard",
          axes: [0, 0, 0, 0],
          buttons: Array.from({ length: 6 }, () => ({ value: 0, pressed: false, touched: false })),
        },
      }),
      support = source(roles.support),
      tool = source(hand),
      bridge = new XRControllers(
        { getController: (i) => rays[i], getControllerGrip: (i) => grips[i] },
        root,
        roles,
        undefined,
        () => {},
        { workspace, layers: () => l, toolMode: () => "transform" },
      ),
      session = new EventTarget();
    session.visibilityState = "visible";
    try {
      workspace.add(l.group);
      workspace.scale.setScalar(0.5);
      const { a, g, h } = grouped(l);
      l.selectGroup(g);
      const local = copyTransform(a.localTransform),
        values = a.volume.values.slice(),
        initial = copyTransform(h.world(g)),
        count = l.undoCount;
      bridge.start(session);
      rays[0].dispatchEvent({ type: "connected", data: support });
      rays[1].dispatchEvent({ type: "connected", data: tool });
      rays.forEach((r) => {
        r.visible = true;
      });
      grips.forEach((r) => {
        r.visible = true;
      });
      let t = 0;
      const update = () => bridge.update((t += 16)),
        press = (s, index, on) => {
          Object.assign(s.gamepad.buttons[index], { pressed: on, value: on ? 1 : 0 });
          update();
        };
      update();
      update();
      press(tool, 1, true);
      assert(bridge.layerGrab.active);
      grips[1].position.x += 0.1;
      update();
      press(tool, 1, false);
      near(h.world(g).position[0], initial.position[0] + 0.2);
      assert.equal(l.undoCount, count + 1);
      assert.deepEqual(a.localTransform, local);
      assert.deepEqual(a.volume.values, values);
      const native = saveSculptProject(l.project);
      press(support, 1, true);
      grips[0].position.y += 0.1;
      update();
      press(support, 1, false);
      assert.deepEqual(saveSculptProject(l.project), native);
      assert(!bridge.layerGrab.active);
    } finally {
      bridge.dispose();
      l.dispose();
    }
  });
test("grouped volume growth keeps masks and child-local transforms aligned through undo", () => {
  const l = make(64);
  try {
    const { a } = grouped(l),
      local = copyTransform(a.localTransform),
      world = (p) => new Vector3(p.x, p.y, p.z).applyMatrix4(transformMatrix(a.transform)),
      p = { x: 0, y: 0, z: 0.8 },
      radius = a.transform.scale[0] * 0.16;
    l.beginStroke(true);
    l.applyStroke(world(p), radius, "mask", 1, 0.1, 0.5);
    l.finishStroke();
    const value = sculptMask(a.volume).sample(p);
    assert(value > 0);
    l.beginStroke();
    l.applyStroke(world({ x: -2, y: 0, z: 0.8 }), radius, "add", 1, 0.05, 0.3);
    l.finishStroke();
    assert(a.volume.latticeMin[0] < 0);
    near(sculptMask(a.volume).sample(p), value, 1e-6);
    assert.deepEqual(a.localTransform, local);
    l.undo();
    near(sculptMask(a.volume).sample(p), value, 1e-6);
    l.undo();
    assert(sculptMask(a.volume).empty);
  } finally {
    l.dispose();
  }
});
test("moving a group reorders its visible descendants together without changing Boolean evaluation order", () => {
  const l = make();
  try {
    const a = l.active.layer,
      b = l.create(64),
      g = l.createGroup("Folder");
    l.reparent(b.id, g);
    const h = l.project.layerStack.hierarchy,
      sequence = h.compositionOrder;
    l.moveNode(g, -1);
    assert.deepEqual(
      l.project.layerStack.layers.map((n) => n.id),
      h
        .rows()
        .filter((n) => !n.group)
        .map((n) => n.id),
    );
    assert.equal(l.project.layerStack.layers[0].id, b.id);
    assert.deepEqual(h.compositionOrder, sequence);
    l.undo();
    assert.equal(l.project.layerStack.layers[0].id, a.id);
  } finally {
    l.dispose();
  }
});

test("VR rename uses QWERTY, case and symbol modes with independent draft and clear commit", () => {
  const { l, menu } = setup();
  try {
    const a = l.active.layer,
      old = a.name,
      count = l.undoCount;
    menu.setRequest("layers");
    menu.activate(`hier:node:${a.id}`);
    menu.activate("hier:rename");
    const keys = menu.content().buttons.filter((b) => b.id.startsWith("hier:key:"));
    assert.equal(
      keys
        .slice(0, 10)
        .map((b) => b.label)
        .join(""),
      "qwertyuiop",
    );
    menu.activate("hier:key-clear");
    menu.activate("hier:key-shift");
    menu.activate("hier:key:H");
    menu.activate("hier:key-shift");
    menu.activate("hier:key:i");
    menu.activate("hier:key-space");
    menu.activate("hier:key-symbols");
    menu.activate("hier:key:2");
    menu.activate("hier:key:3");
    menu.activate("hier:key-back");
    assert.equal(menu.palette.name, "Hi 2");
    assert.equal(a.name, old);
    assert.equal(l.undoCount, count);
    for (const b of menu.content().buttons.filter((b) => b.rect)) {
      const r = b.rect;
      assert(r.x >= 0 && r.x + r.width <= 1152 && r.y + r.height <= 1086);
      assert.equal(menu.hit(r.x + r.width / 2, r.y + r.height / 2), b.id);
    }
    menu.activate("hier:rename-done");
    assert.equal(a.name, "Hi 2");
    assert.equal(l.undoCount, count + 1);
    l.undo();
    assert.equal(a.name, old);
  } finally {
    l.dispose();
  }
});

test("layer parents preserve world pose, inherit transforms, undo and save without changing Boolean order", () => {
  const l = make(17);
  try {
    const a = l.active.layer,
      b = l.duplicate(a.id),
      h = l.project.layerStack.hierarchy;
    const before = copyTransform(b.transform),
      order = h.compositionOrder;
    l.reparent(b.id, a.id);
    assert.equal(h.parent(b.id), a.id);
    matrixNear(transformMatrix(b.transform), transformMatrix(before));
    assert.equal(h.rows()[1].depth, 1);
    assert.deepEqual(h.compositionOrder, order);
    l.select(a.id);
    l.setActiveTransform(pose());
    assert.notDeepEqual(b.transform, before);
    const moved = copyTransform(b.transform);
    l.undo();
    matrixNear(transformMatrix(b.transform), transformMatrix(before));
    l.undo(true);
    matrixNear(transformMatrix(b.transform), transformMatrix(moved));
    const reopened = openSculptProject(saveSculptProject(l.project));
    assert.equal(reopened.layerStack.hierarchy.parent(b.id), a.id);
    matrixNear(transformMatrix(reopened.layerStack.get(b.id).transform), transformMatrix(moved));
    assert.throws(() => l.reparent(a.id, b.id), /hierarchy/);
    l.reparent(b.id, null);
    matrixNear(transformMatrix(b.transform), transformMatrix(moved));
    l.undo();
    assert.equal(h.parent(b.id), a.id);
    l.setNodeFlag(a.id, "visible", false);
    assert.equal(b.visible, false);
  } finally {
    l.dispose();
  }
});
test("VR drag handles attach layers, detach to root and reject cycles without mutation", () => {
  const { l, menu } = setup();
  try {
    const a = l.active.layer,
      b = l.duplicate(a.id),
      h = l.project.layerStack.hierarchy;
    menu.setRequest("layers");
    assert(menu.content().buttons.some((x) => x.id === `hier:drag:${b.id}`));
    menu.palette.beginDrag(b.id);
    menu.palette.endDrag(`select:${a.id}`);
    assert.equal(h.parent(b.id), a.id);
    menu.palette.beginDrag(a.id);
    menu.palette.endDrag(`select:${b.id}`);
    assert.equal(h.parent(a.id), null);
    menu.palette.beginDrag(b.id);
    menu.palette.endDrag("hier:root");
    assert.equal(h.parent(b.id), null);
    menu.palette.beginDrag(b.id);
    menu.palette.close();
    assert.equal(menu.palette.dragged, null);
  } finally {
    l.dispose();
  }
});
test("parent deletion retains children in place; recovery preserves layer parenting", async () => {
  const l = make(17),
    prior = globalThis.Worker;
  try {
    const a = l.active.layer,
      b = l.duplicate(a.id);
    l.reparent(b.id, a.id);
    l.select(a.id);
    l.setActiveTransform(pose());
    const world = copyTransform(b.transform);
    globalThis.Worker = RecoveryBrowserWorker;
    const result = await encodeRecovery(
        l,
        settings,
        undefined,
        undefined,
        new AbortController().signal,
        () => true,
      ),
      opened = openSculptProject(result.data);
    assert.equal(new DataView(result.data).getUint32(8, true), 10);
    assert.equal(opened.layerStack.hierarchy.parent(b.id), a.id);
    l.remove(a.id);
    assert.equal(l.project.layerStack.hierarchy.parent(b.id), null);
    matrixNear(transformMatrix(b.transform), transformMatrix(world));
  } finally {
    globalThis.Worker = prior;
    l.dispose();
  }
});
test("nested layer parents inherit locking, collapse recursively and exclude descendants from VR parent choices", () => {
  const { l, menu } = setup();
  try {
    const a = l.active.layer,
      b = l.duplicate(a.id),
      c = l.duplicate(b.id),
      h = l.project.layerStack.hierarchy;
    l.reparent(b.id, a.id);
    l.reparent(c.id, b.id);
    assert.deepEqual(h.descendants(a.id), [b.id, c.id]);
    l.collapsedGroups.add(a.id);
    assert.deepEqual(
      l.hierarchyRows().map((r) => r.id),
      [a.id],
    );
    l.collapsedGroups.clear();
    l.setNodeFlag(a.id, "locked", true);
    assert.equal(c.locked, true);
    assert.throws(() => l.reparent(c.id, null), /locked/i);
    l.setNodeFlag(a.id, "locked", false);
    menu.setRequest("layers");
    menu.activate(`hier:node:${a.id}`);
    menu.activate("hier:parents");
    const ids = menu.content().buttons.map((b) => b.id);
    assert(!ids.includes(`hier:parent:${b.id}`));
    assert(!ids.includes(`hier:parent:${c.id}`));
    const state = h.snapshot();
    state.layers.find((n) => n.id === a.id).transform.scale = [1, 2, 1];
    assert.throws(() => h.restore(state));
    assert.equal(h.parent(c.id), b.id);
  } finally {
    l.dispose();
  }
});
test("empty deletion detection uses authoritative field, not pending triangle counts", () => {
  const l = make(17);
  try {
    assert.equal(l.isEmpty(l.active.layer.id), false);
    const empty = l.create(64, true);
    assert.equal(l.isEmpty(empty.id), true);
    empty.volume.writeVoxel(0, -0.1);
    assert.equal(l.isEmpty(empty.id), false);
    empty.volume.getDenseView().fill(-1);
    assert.equal(l.isEmpty(empty.id), false);
    empty.volume.getDenseView().fill(1);
    assert.equal(l.isEmpty(empty.id), true);
  } finally {
    l.dispose();
  }
});
test("VR drop preview agrees with release across row controls and invalid descendants", () => {
  const { l, menu } = setup();
  try {
    const a = l.active.layer,
      b = l.duplicate(a.id),
      c = l.duplicate(b.id);
    l.reparent(c.id, b.id);
    menu.palette.beginDrag(b.id);
    assert.equal(menu.palette.dropPreview(`visible:${a.id}`).parent, a.id);
    assert.equal(menu.palette.dropPreview(`locked:${a.id}`).valid, true);
    assert.equal(menu.palette.dropPreview(`select:${c.id}`).valid, false);
    assert.equal(menu.palette.dropPreview(`select:${b.id}`).valid, false);
    assert.equal(menu.palette.dropPreview(null).valid, false);
    menu.palette.endDrag(`hier:node:${a.id}`);
    assert.equal(l.project.layerStack.hierarchy.parent(b.id), a.id);
  } finally {
    l.dispose();
  }
});
test("VR layer resolution options require confirmation and preserve other layers", () => {
  const { l, menu } = setup();
  try {
    const a = l.active.layer,
      b = l.create(64),
      original = a.volume.values.slice();
    menu.setRequest("layers");
    menu.activate(`hier:node:${b.id}`);
    assert(menu.content().buttons.find((x) => x.id === "hier:downres").disabled);
    menu.activate("hier:upres");
    assert.equal(b.volume.resolution, 64);
    assert.equal(menu.palette.view, "resolution");
    menu.activate("hier:node-back");
    assert.equal(b.volume.resolution, 64);
    menu.activate("hier:upres");
    menu.activate("hier:resample-confirm");
    assert.equal(b.volume.resolution, 128);
    assert.deepEqual(a.volume.values, original);
    menu.activate("hier:downres");
    menu.activate("hier:resample-confirm");
    assert.equal(b.volume.resolution, 64);
    assert(menu.content().buttons.find((x) => x.id === "hier:downres").disabled);
  } finally {
    l.dispose();
  }
});

test("visibility icons distinguish locally hidden layers from descendants hidden by a parent", () => {
  const { l, menu } = setup();
  try {
    const root = l.active.layer,
      child = l.create(64),
      grandchild = l.create(64);
    l.reparent(child.id, root.id);
    l.reparent(grandchild.id, child.id);
    menu.setRequest("layers");
    const eye = (id) => menu.content().buttons.find((b) => b.id === `visible:${id}`);
    assert.equal(eye(grandchild.id).label, "Visible");
    assert.equal(eye(grandchild.id).muted, false);
    l.setNodeFlag(child.id, "visible", false);
    assert.equal(eye(child.id).label, "Hidden");
    assert.equal(eye(child.id).muted, false);
    assert.equal(eye(grandchild.id).label, "Visible");
    assert.equal(eye(grandchild.id).detail, "Hidden by parent");
    assert.equal(eye(grandchild.id).muted, true);
    assert.equal(
      eye(grandchild.id).disabled,
      false,
      "inherited hiding does not disable its own visibility toggle",
    );
    assert.equal(grandchild.localVisible, true);
    l.setNodeFlag(child.id, "visible", true);
    assert.equal(eye(grandchild.id).muted, false);
    assert.equal(grandchild.visible, true);
    l.setNodeFlag(grandchild.id, "visible", false);
    l.setNodeFlag(root.id, "visible", false);
    assert.equal(eye(child.id).muted, true);
    assert.equal(eye(grandchild.id).label, "Hidden");
    assert.equal(eye(grandchild.id).detail, "Hidden");
    l.setNodeFlag(root.id, "visible", true);
    assert.equal(
      grandchild.visible,
      false,
      "showing the ancestor preserves an explicitly hidden descendant",
    );
  } finally {
    l.dispose();
  }
});
