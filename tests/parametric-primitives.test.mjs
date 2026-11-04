import assert from "node:assert/strict";
import test from "node:test";
import { Group, Matrix4, Vector3 } from "three";
import { installFileReader } from "../scripts/fixtures/export-node.mjs";
import { RecoveryBrowserWorker } from "../scripts/fixtures/node-recovery-worker.mjs";
import { encodeExport } from "../work/test-build/glb-export.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import {
  evaluatePrimitive,
  primitiveDimensions,
  primitiveDistance,
  validatePrimitive,
} from "../work/test-build/parametric-primitive.mjs";
import { fromDisplay, physicalExportLongestMM } from "../work/test-build/physical-units.mjs";
import { PrecisionTools } from "../work/test-build/precision-tools.mjs";
import { PrimitiveTools } from "../work/test-build/primitive-tools.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { captureProject } from "../work/test-build/project-snapshot.mjs";
import { encodeRecovery } from "../work/test-build/recovery-client.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { encodeSTL, validatePrintMesh } from "../work/test-build/stl-export.mjs";
import { identityTransform } from "../work/test-build/transform.mjs";

installFileReader();
const settings = {
  mode: "add",
  radius: 0.12,
  strength: 0.5,
  hardness: 0.5,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
const box = { kind: "box", width: 0.5, height: 0.6, depth: 0.4 },
  cylinder = { kind: "cylinder", diameter: 0.5, height: 0.6 },
  sphere = { kind: "sphere", diameter: 0.5 };
const make = () => {
  const v = new SDFVolume(17, 1.6, false);
  v.values.fill(6.4);
  return new IndependentLayers(createBaseProject(v, structuredClone(settings)));
};
const near = (a, b, e = 1e-5) => assert(Math.abs(a - b) < e, `${a} != ${b}`);
for (const s of [box, cylinder, sphere]) {
  test(`${s.kind} exact analytical inside, boundary, outside and finite SDF`, () => {
    assert(primitiveDistance(s, 0, 0, 0) < 0);
    const [w, h, d] = primitiveDimensions(s);
    near(primitiveDistance(s, w / 2, 0, 0), 0);
    near(primitiveDistance(s, 0, h / 2, 0), 0);
    near(primitiveDistance(s, 0, 0, d / 2), 0);
    near(primitiveDistance(s, w / 2 + 0.2, 0, 0), 0.2);
    assert.throws(() => primitiveDistance(s, NaN, 0, 0));
  });
  test(`${s.kind} dimensions, geometry, STL and GLB exclude preview handles`, async () => {
    const l = make();
    try {
      const p = await l.regeneratePrimitive(s);
      const sources = l.exportSources("selected");
      near(physicalExportLongestMM(sources, 100), Math.max(...primitiveDimensions(s)) * 100);
      const positions = sources[0].chunks[0].positions;
      const diagnostics = await validatePrintMesh(positions);
      assert.equal(diagnostics.boundaryEdges, 0);
      assert.equal(diagnostics.nonManifoldEdges, 0);
      assert.equal(diagnostics.components, 1);
      assert.equal(diagnostics.degenerateTriangles, 0);
      const stl = await encodeSTL(
        sources,
        "fast",
        256 * 1024 ** 2,
        Math.max(...primitiveDimensions(s)) * 100,
      );
      assert(stl.data.byteLength > 84);
      const glb = await encodeExport(sources, "fast", 256 * 1024 ** 2);
      assert(glb.data.byteLength > 100);
      assert.equal(p.primitive.kind, s.kind);
      assert.equal(l.project.layerStack.layers.length, 2);
    } finally {
      l.dispose();
    }
  });
}
test("primitive numeric payloads reject nonfinite, negative, excessive and unsupported parameters", () => {
  for (const value of [
    null,
    {},
    { kind: "cone", height: 1 },
    { ...box, width: 0 },
    { ...box, width: -1 },
    { ...box, width: Infinity },
    { ...box, width: NaN },
    { ...box, width: 100 },
    { ...box, roundness: 0.2 },
  ])
    assert.throws(() => validatePrimitive(value));
  const copy = validatePrimitive(box);
  copy.width = 1;
  assert.equal(box.width, 0.5);
  const gen = evaluatePrimitive({ ...box, width: 16 }, 64, 1e6);
  assert.throws(() => gen.next(), /aspect ratio/);
});
test("mm cm inches source editing is undoable and retains independent duplication", async () => {
  const l = make(),
    tools = new PrimitiveTools(() => l);
  try {
    const p = await l.regeneratePrimitive(box),
      id = p.id;
    for (const [unit, value] of [
      ["mm", 50],
      ["cm", 5],
      ["in", 50 / 25.4],
    ]) {
      l.display.precision.unit = unit;
      await tools.dimension("width", value);
      near(p.primitive.width, 0.5);
    }
    await tools.dimension("width", 1);
    const changed = p.primitive.width;
    l.undo();
    near(p.primitive.width, 0.5);
    l.undo(true);
    near(p.primitive.width, changed);
    assert.equal(p.id, id);
    const dup = l.duplicate(id);
    assert.notEqual(dup.volume, p.volume);
    assert.notEqual(dup.primitive, p.primitive);
    await l.regeneratePrimitive({ ...box, width: 0.8 }, dup.id);
    near(p.primitive.width, changed);
    near(dup.primitive.width, 0.8);
  } finally {
    tools.dispose();
    l.dispose();
  }
});
test("transforms, grouping, parenting, inherited locking, visibility and ordering preserve the source", async () => {
  const l = make();
  try {
    const p = await l.regeneratePrimitive(box);
    const t = identityTransform();
    t.position = [1, 2, 3];
    t.rotation = [0.1, 0.2, 0.3];
    t.scale = [2, 2, 2];
    l.setActiveTransform(t);
    const group = l.groupNode(p.id);
    l.setActiveTransform({ ...identityTransform(), position: [0.5, 0, 0] });
    assert(p.primitive);
    l.select(p.id);
    l.project.layerStack.hierarchy.get(group).locked = true;
    await assert.rejects(l.regeneratePrimitive({ ...box, width: 0.7 }, p.id), /locked/);
    l.project.layerStack.hierarchy.get(group).locked = false;
    l.project.layerStack.hierarchy.get(group).visible = false;
    assert.equal(p.visible, false);
    assert(!l.exportSources().some((s) => s.layerId === p.id));
    l.project.layerStack.hierarchy.get(group).visible = true;
    assert.equal(p.visible, true);
    assert.deepEqual(p.primitive, box);
  } finally {
    l.dispose();
  }
});
test("explicit Bake preserves source and world pose as one undoable action; sculpt never implicitly bakes", async () => {
  const l = make();
  try {
    const p = await l.regeneratePrimitive(cylinder),
      original = l.project.layerStack.layers[0].volume;
    l.setActiveTransform({ ...identityTransform(), position: [0.5, 0.2, -0.3], scale: [2, 2, 2] });
    assert.throws(() => l.beginStroke(), /Bake/);
    assert.equal(l.project.layerStack.layers.length, 2);
    assert.deepEqual(p.primitive, cylinder);
    const baked = await l.bake({
      name: "Baked cylinder",
      resolution: p.volume.resolution,
      sourceIds: [p.id],
      hideSources: true,
    });
    assert.equal(baked.primitive, undefined);
    assert.deepEqual(baked.transform, p.transform);
    assert.equal(p.visible, false);
    assert.equal(l.project.layerStack.layers[0].volume, original);
    assert.notEqual(baked.volume, p.volume);
    assert.deepEqual(baked.volume.values, p.volume.values);
    l.undo();
    assert.equal(l.project.layerStack.layers.length, 2);
    assert.equal(p.visible, true);
    l.undo(true);
    assert.equal(l.project.layerStack.layers.length, 3);
    assert.equal(l.active.layer.primitive, undefined);
    l.beginStroke();
    l.finishStroke();
  } finally {
    l.dispose();
  }
});
test("native v11, worker recovery and legacy projects retain independent primitive definitions", async () => {
  const l = make();
  try {
    const legacy = openSculptProject(saveSculptProject(l.project));
    assert.equal(legacy.activeLayer.primitive, undefined);
    await l.regeneratePrimitive(sphere);
    const bytes = saveSculptProject(l.project);
    assert.equal(new DataView(bytes).getUint32(8, true), 11);
    const opened = openSculptProject(bytes);
    assert.deepEqual(opened.activeLayer.primitive, sphere);
    const { snapshot } = await captureProject(
      l,
      settings,
      undefined,
      undefined,
      new AbortController().signal,
      () => true,
    );
    assert.deepEqual(
      snapshot.layers.find((layer) => layer.metadata.primitive).metadata.primitive,
      sphere,
    );
    const previous = globalThis.Worker;
    globalThis.Worker = RecoveryBrowserWorker;
    let r;
    try {
      r = await encodeRecovery(
        l,
        settings,
        undefined,
        undefined,
        new AbortController().signal,
        () => true,
      );
    } finally {
      globalThis.Worker = previous;
    }
    assert.deepEqual(openSculptProject(r.data).activeLayer.primitive, sphere);
  } finally {
    l.dispose();
  }
});
test("aborted and stale regeneration does not publish source or change other layers", async () => {
  const l = make();
  try {
    const p = await l.regeneratePrimitive(box),
      old = p.volume;
    const abort = new AbortController();
    const promise = l.regeneratePrimitive({ ...box, width: 0.8 }, p.id, abort.signal);
    abort.abort();
    await assert.rejects(promise, /cancel/);
    assert.equal(p.volume, old);
    assert.deepEqual(p.primitive, box);
    const next = l.regeneratePrimitive({ ...box, width: 0.9 }, p.id);
    p.name = "Concurrent external revision";
    await assert.rejects(next, /cancel/);
    assert.equal(p.volume, old);
  } finally {
    l.dispose();
  }
});
for (const hand of ["left", "right"])
  test(`${hand} Tool controller owns preview, trigger release arms confirmation, cancellation and resource disposal`, async () => {
    const l = make(),
      precision = new PrecisionTools(() => l),
      tools = precision.primitives;
    try {
      const root = new Group();
      root.add(l.group);
      root.scale.setScalar(3);
      root.position.set(2, 1, 0);
      root.updateMatrixWorld(true);
      tools.begin();
      const input = {
          role: "tool",
          hand,
          connectionId: hand === "left" ? 1 : 2,
          connected: true,
          tracked: true,
          stick: { available: false, x: 0, y: 0 },
          buttons: { trigger: { pressed: true, justPressed: true } },
        },
        pose = new Matrix4().makeTranslation(2, 1, 0);
      assert.equal(precision.step(input, pose, true), true);
      assert.equal(tools.pending, false);
      input.buttons.trigger = { pressed: false, justPressed: false };
      precision.step(input, pose, true);
      assert.equal(tools.preview.visible, true);
      const expected = l.group.worldToLocal(new Vector3(2, 1, -0.25)).toArray();
      assert.deepEqual(tools.preview.position.toArray(), expected);
      input.buttons.trigger = { pressed: true, justPressed: true };
      precision.step(input, pose, true);
      assert.equal(tools.pending, true);
      while (tools.pending) await new Promise((r) => setTimeout(r, 5));
      assert.equal(l.project.layerStack.layers.length, 2);
      assert.deepEqual(l.active.layer.transform.position, expected);
      tools.begin();
      tools.cancel();
      assert.equal(tools.preview.visible, false);
      assert.equal(precision.step(input, pose, true), false);
      let disposed = 0;
      tools.preview.geometry.addEventListener("dispose", () => disposed++);
      tools.dispose();
      assert.equal(disposed, 1);
      assert.equal(tools.preview.parent, null);
    } finally {
      precision.dispose();
      l.dispose();
    }
  });
test("VR menu exposes exact primitive fields and disjoint targets without changing Cut", () => {
  const l = make(),
    p = new PrecisionTools(() => l);
  try {
    assert(p.content().buttons.some((b) => b.id === "precision:primitives"));
    p.activate("precision:primitives");
    const c = p.content();
    assert(c.buttons.some((b) => b.id === "primitive:place"));
    assert(c.buttons.some((b) => b.id === "primitive:bake"));
    p.activate("primitive:field:width");
    for (const key of ["5", "0"]) p.activate(`primitive:key:${key}`);
    p.activate("primitive:apply");
    near(p.primitives.draft.width, fromDisplay(50, l.display.precision));
  } finally {
    p.dispose();
    l.dispose();
  }
});

test("source/cache mismatch and unsupported native parameter payloads are rejected", async () => {
  const l = make();
  try {
    const p = await l.regeneratePrimitive(sphere),
      bytes = saveSculptProject(l.project);
    p.primitive = { ...sphere, diameter: 0.8 };
    assert.throws(() => saveSculptProject(l.project), /cache/);
    p.primitive = { ...sphere };
    const tampered = bytes.slice(0),
      view = new DataView(tampered),
      length = view.getUint32(12, true),
      text = new TextDecoder().decode(new Uint8Array(tampered, 16, length));
    const changed = text.replaceAll('"diameter":0.5', '"diameter":0.8');
    assert.notEqual(text, changed);
    new Uint8Array(tampered, 16, length).set(new TextEncoder().encode(changed));
    assert.throws(() => openSculptProject(tampered), /cache/);
  } finally {
    l.dispose();
  }
});
test("project duplication and Save As preserve definitions while regenerating project/layer IDs", async () => {
  const { renameNative } = await import("../work/test-build/library-codec.mjs");
  const l = make();
  try {
    const p = await l.regeneratePrimitive(box),
      bytes = saveSculptProject(l.project);
    const renamed = openSculptProject(renameNative(bytes, "Save As primitive"));
    assert.deepEqual(renamed.activeLayer.primitive, box);
    const duplicate = openSculptProject(renameNative(bytes, "Duplicate primitive", true));
    assert.notEqual(duplicate.id, l.project.id);
    assert.notEqual(duplicate.activeLayer.id, p.id);
    assert.deepEqual(duplicate.activeLayer.primitive, box);
  } finally {
    l.dispose();
  }
});
test("renaming, reordering and attaching a primitive are undoable without implicit Bake", async () => {
  const l = make();
  try {
    const p = await l.regeneratePrimitive(box),
      base = l.project.layerStack.layers[0];
    l.rename(p.id, "Exact box");
    assert.equal(p.name, "Exact box");
    l.undo();
    assert.equal(p.name, "Parametric box");
    l.undo(true);
    l.move(p.id, -1);
    assert.equal(l.project.layerStack.layers[0].id, p.id);
    l.undo();
    assert.equal(l.project.layerStack.layers[1].id, p.id);
    const before = structuredClone(p.transform);
    l.reparent(p.id, base.id);
    assert.deepEqual(p.transform, before);
    assert.deepEqual(p.primitive, box);
    l.undo();
    assert.equal(l.project.layerStack.hierarchy.parent(p.id), null);
  } finally {
    l.dispose();
  }
});
test("analytical compositor sampler follows parent transforms independently of cache interpolation", async () => {
  const { prepareLayerSampler } = await import("../work/test-build/compositor.mjs");
  const l = make();
  try {
    const p = await l.regeneratePrimitive(sphere);
    l.setActiveTransform({ ...identityTransform(), position: [1, 0, 0], scale: [2, 2, 2] });
    const sample = prepareLayerSampler(p);
    near(sample(1, 0, 0), -0.5);
    near(sample(1.5, 0, 0), 0);
    near(sample(2, 0, 0), 0.5);
  } finally {
    l.dispose();
  }
});
test("GLB calibration uses metres once, preserving model physical size and translation", async () => {
  const { physicalGLBSources } = await import("../work/test-build/physical-units.mjs");
  const l = make();
  try {
    await l.regeneratePrimitive(box);
    l.setActiveTransform({ ...identityTransform(), position: [1, 2, 3], scale: [2, 2, 2] });
    const raw = l.exportSources("selected"),
      sources = physicalGLBSources(raw, 100);
    near(sources[0].transform.position[0], 0.1);
    near(sources[0].transform.scale[0], 0.2);
    near(physicalExportLongestMM(sources, 1000), 120);
    assert.deepEqual(raw[0].transform.position, [1, 2, 3]);
    const glb = await encodeExport(sources, "fast", 256 * 1024 ** 2);
    const view = new DataView(glb.data),
      jsonLength = view.getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb.data, 20, jsonLength)));
    assert(json.nodes.some((n) => n.matrix?.[0] === 0.2 || n.scale?.[0] === 0.2));
  } finally {
    l.dispose();
  }
});
test("placement cancellation aborts unpublished async geometry and preview survives Boolean source hiding", async () => {
  const l = make(),
    tools = new PrimitiveTools(() => l),
    root = new Group();
  root.add(l.group);
  try {
    tools.begin();
    l.group.visible = false;
    const input = {
      role: "tool",
      connectionId: 1,
      connected: true,
      tracked: true,
      stick: { available: false, x: 0, y: 0 },
      buttons: { trigger: { pressed: false, justPressed: false } },
    };
    tools.step(input, new Matrix4(), true);
    assert.equal(tools.previewRoot.parent, root);
    assert.equal(tools.preview.visible, true);
    assert.equal(tools.previewRoot.visible, true);
    const p = tools.create();
    tools.cancel();
    await p;
    assert.equal(l.project.layerStack.layers.length, 1);
    assert.equal(tools.preview.visible, false);
  } finally {
    tools.dispose();
    l.dispose();
  }
});
test("initial dimensions survive bounded parameter Undo history and native reload", async () => {
  const l = make(),
    tools = new PrimitiveTools(() => l);
  try {
    const p = await l.regeneratePrimitive(box);
    for (let i = 0; i < 10; i++)
      await l.regeneratePrimitive({ ...box, width: 0.51 + i * 0.01 }, p.id);
    assert.deepEqual(p.primitiveOriginal, box);
    assert.deepEqual(
      openSculptProject(saveSculptProject(l.project)).activeLayer.primitiveOriginal,
      box,
    );
    await tools.restoreOriginal();
    assert.deepEqual(p.primitive, box);
    l.undo();
    near(p.primitive.width, 0.6);
  } finally {
    tools.dispose();
    l.dispose();
  }
});
test("baked small-grid Reset sphere remains bounded and can save and reopen", async () => {
  const l = make();
  try {
    const p = await l.regeneratePrimitive(sphere);
    const baked = await l.bake({
      name: "Baked small",
      resolution: p.volume.resolution,
      sourceIds: [p.id],
      hideSources: true,
    });
    baked.volume.reset();
    assert(baked.volume.values[0] > 0);
    assert.doesNotThrow(() => openSculptProject(saveSculptProject(l.project)));
  } finally {
    l.dispose();
  }
});
for (const hand of ["left", "right"])
  test(`${hand} Touch Plus controller bridge reserves placement trigger and restores sculpt ownership`, async () => {
    const { XRControllers } = await import("../work/test-build/xr-controllers.mjs"),
      { XRControllerRoles } = await import("../work/test-build/xr-controller-roles.mjs");
    const l = make(),
      p = new PrecisionTools(() => l),
      rays = [new Group(), new Group()],
      grips = [new Group(), new Group()],
      roles = new XRControllerRoles(),
      enabled = [];
    roles.setDominant(hand);
    p.sync();
    const stroke = {
      active: false,
      update(_t, _p, _time, allow) {
        enabled.push(allow);
      },
      cancel() {},
    };
    const bridge = new XRControllers(
      { getController: (i) => rays[i], getControllerGrip: (i) => grips[i] },
      new Group(),
      roles,
      undefined,
      () => {},
      { precision: p, layers: () => l, toolMode: () => "clay", stroke },
    );
    const source = {
        handedness: hand,
        profiles: ["meta-quest-touch-plus"],
        targetRayMode: "tracked-pointer",
        gripSpace: {},
        gamepad: {
          mapping: "xr-standard",
          axes: [0, 0, 0, 0],
          buttons: Array.from({ length: 6 }, () => ({ value: 0, pressed: false, touched: false })),
        },
      },
      session = new EventTarget();
    session.visibilityState = "visible";
    try {
      bridge.start(session);
      rays[1].dispatchEvent({ type: "connected", data: source });
      rays[1].position.set(0, 0, 1);
      grips[1].position.set(0, 0, 1);
      p.primitives.begin();
      bridge.update(0);
      assert.equal(enabled.at(-1), false);
      assert(bridge.slots[1].rayVisual.visible);
      Object.assign(source.gamepad.buttons[0], { value: 1, pressed: true });
      bridge.update(16);
      assert(p.primitives.pending);
      while (p.primitives.pending) await new Promise((r) => setTimeout(r, 5));
      assert.equal(l.project.layerStack.layers.length, 2);
      assert(l.active.layer.primitive);
      Object.assign(source.gamepad.buttons[0], { value: 0, pressed: false });
      bridge.update(32);
      assert.equal(enabled.at(-1), true);
    } finally {
      bridge.dispose();
      p.dispose();
      l.dispose();
    }
  });
test("physical analytic bounds include uniform scale and rotation while keeping source dimensions", async () => {
  const { primitiveWorldDimensions } = await import("../work/test-build/parametric-primitive.mjs");
  const t = { ...identityTransform(), rotation: [0, 0, Math.PI / 2], scale: [2, 2, 2] };
  const b = primitiveWorldDimensions(box, t);
  near(b[0], 1.2);
  near(b[1], 1);
  near(b[2], 0.8);
  const c = primitiveWorldDimensions(cylinder, t);
  near(c[0], 1.2);
  near(c[1], 1);
  near(c[2], 1);
  assert.deepEqual(primitiveWorldDimensions(sphere, t), [1, 1, 1]);
  assert.deepEqual(box, { kind: "box", width: 0.5, height: 0.6, depth: 0.4 });
});
test("Tool Wheel selection cancels placement without shrinking or replacing Cut", async () => {
  const { EditorToolState } = await import("../work/test-build/editor-tool-state.mjs"),
    { ShapePreviewModel } = await import("../work/test-build/shape-preview.mjs"),
    { XRMenuModel } = await import("../work/test-build/xr-menu-model.mjs");
  const l = make(),
    p = new PrecisionTools(() => l);
  try {
    const tools = new EditorToolState({
        layers: () => l,
        shape: new ShapePreviewModel(l.project.activeLayerId),
        settings: () => settings,
        setSettings() {},
        mode: () => "sculpt",
        selectTool() {},
        selectTransform() {},
        busy: () => false,
        changed() {},
      }),
      menu = new XRMenuModel(tools, { precision: p });
    p.start(2);
    p.activate("primitive:place");
    assert.equal(p.active, 0);
    assert(p.primitives.placing);
    menu.setRequest("tool-wheel");
    menu.activate("tool:clay");
    assert.equal(p.primitives.placing, false);
    assert.equal(l.project.layerStack.layers.length, 1);
    menu.page = "tool-wheel";
    const content = menu.content();
    const cut = content.buttons.find((b) => b.id === "tool:cut");
    assert(cut);
    assert.equal(typeof cut.sector, "number");
  } finally {
    p.dispose();
    l.dispose();
  }
});
test("source brush/paint/mask reject implicit Bake; replaced and removed source geometries release resources", async () => {
  const l = make();
  try {
    const p = await l.regeneratePrimitive(box);
    for (const mode of [false, true, "paint"]) assert.throws(() => l.beginStroke(mode), /Bake/);
    assert.equal(l.project.layerStack.layers.length, 2);
    assert.deepEqual(p.primitive, box);
    let oldDisposed = 0,
      newDisposed = 0;
    l.runtime(p.id).surface.group.children[0].geometry.addEventListener(
      "dispose",
      () => oldDisposed++,
    );
    await l.regeneratePrimitive({ ...box, width: 0.7 }, p.id);
    assert.equal(oldDisposed, 1);
    l.runtime(p.id).surface.group.children[0].geometry.addEventListener(
      "dispose",
      () => newDisposed++,
    );
    const before = l.trackedBytes;
    l.remove(p.id);
    assert.equal(newDisposed, 1);
    assert(l.trackedBytes < before);
    assert.equal(l.project.layerStack.layers.length, 1);
  } finally {
    l.dispose();
  }
});
