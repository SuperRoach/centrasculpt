import assert from "node:assert/strict";
import test from "node:test";
import { BoxGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { RecoveryBrowserWorker } from "../scripts/fixtures/node-recovery-worker.mjs";
import {
  LayerDisplayPreferences,
  validateProjectDisplay,
} from "../work/test-build/display-preferences.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import {
  defaultPrecision,
  fromDisplay,
  measurementValue,
  physicalExportLongestMM,
  snappedTransform,
  snapValue,
  toDisplay,
  validatePrecision,
} from "../work/test-build/physical-units.mjs";
import {
  measurementHit,
  PrecisionTools,
  selectionDimensions,
} from "../work/test-build/precision-tools.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { encodeRecovery } from "../work/test-build/recovery-client.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { encodeSTL } from "../work/test-build/stl-export.mjs";
import { identityTransform, transformMatrix } from "../work/test-build/transform.mjs";
import { XRControllerRoles } from "../work/test-build/xr-controller-roles.mjs";
import { XRControllers } from "../work/test-build/xr-controllers.mjs";
import { XRLayerGrab } from "../work/test-build/xr-layer-grab.mjs";

const settings = {
  mode: "add",
  radius: 0.2,
  strength: 0.7,
  hardness: 0.3,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
const make = () =>
  new IndependentLayers(createBaseProject(new SDFVolume(17), structuredClone(settings)));
const near = (a, b, e = 1e-7) => assert(Math.abs(a - b) < e, `${a} != ${b}`);

test("physical mm/cm/in conversion round trips retain sub-micron precision and do not use navigation scale", () => {
  const p = defaultPrecision();
  assert.equal(toDisplay(1, p), 100);
  for (const unit of ["mm", "cm", "in"]) {
    p.unit = unit;
    for (const v of [-123.456789, 0, 0.000001, 1, 99.9])
      near(fromDisplay(toDisplay(v, p), p), v, 1e-10);
  }
  p.unit = "in";
  near(fromDisplay(1, p), 0.254);
  assert.throws(() => fromDisplay(NaN, p));
});
test("bounded settings reject malformed/nonfinite values, duplicate annotations and invalid endpoints", () => {
  const p = defaultPrecision();
  for (const patch of [
    { millimetresPerUnit: 0 },
    { millimetresPerUnit: Infinity },
    { unit: "metres" },
    { translationSnapMM: 2 },
    { angleSnapDegrees: NaN },
    { angleSnapDegrees: 181 },
    {
      measurements: [
        {
          id: "a",
          points: [
            [0, 0, 0],
            [Infinity, 0, 0],
          ],
        },
      ],
    },
    {
      measurements: [
        {
          id: "a",
          points: [
            [0, 0, 0],
            [1, 0, 0],
          ],
        },
        {
          id: "a",
          points: [
            [0, 0, 0],
            [1, 0, 0],
          ],
        },
      ],
    },
  ])
    assert.throws(() => validatePrecision({ ...p, ...patch }));
  const copy = validatePrecision({
    ...p,
    measurements: [
      {
        id: "a",
        points: [
          [0, 0, 0],
          [1, 0, 0],
        ],
      },
    ],
  });
  copy.measurements[0].points[0][0] = 4;
  assert.deepEqual(p.measurements, []);
});
test("distance/three-point angle and coincident angle feedback are deterministic", () => {
  const p = defaultPrecision();
  assert.equal(
    measurementValue(
      [
        [0, 0, 0],
        [3, 4, 0],
      ],
      p,
    ),
    "500.000 mm",
  );
  assert.equal(
    measurementValue(
      [
        [1, 0, 0],
        [0, 0, 0],
        [0, 1, 0],
      ],
      p,
    ),
    "90.00°",
  );
  assert.match(
    measurementValue(
      [
        [0, 0, 0],
        [0, 0, 0],
        [0, 1, 0],
      ],
      p,
    ),
    /Undefined/,
  );
});
test("raycasts ignore hidden sources, prefer nearest surface and remove all navigation transforms", () => {
  const scene = new Group(),
    root = new Group(),
    mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  scene.add(root);
  root.add(mesh);
  root.position.set(4, 2, -3);
  root.rotation.set(0.2, 0.3, 0.1);
  root.scale.setScalar(0.07);
  root.updateWorldMatrix(true, true);
  const origin = root.localToWorld(new Vector3(0, 0, 4)),
    target = root.localToWorld(new Vector3());
  const ray = new Raycaster(origin, target.sub(origin).normalize());
  const hit = measurementHit(ray, [mesh], root);
  near(hit[0], 0);
  near(hit[1], 0);
  near(hit[2], 0.5);
  mesh.visible = false;
  assert.equal(measurementHit(ray, [mesh], root), null);
  mesh.geometry.dispose();
  mesh.material.dispose();
});
test("STL references support picking despite disabled edit raycasts; images remain excluded", () => {
  const root = new Group(),
    mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  root.add(mesh);
  mesh.raycast = () => {};
  const ray = new Raycaster(new Vector3(0, 0, 4), new Vector3(0, 0, -1));
  const record = { mime: "model/stl" };
  const refs = { panels: new Map([["ref", { mesh, record }]]) };
  near(measurementHit(ray, [], root, refs)[2], 0.5);
  record.mime = "image/png";
  assert.equal(measurementHit(ray, [], root, refs), null);
  mesh.geometry.dispose();
  mesh.material.dispose();
});
test("measurement placement/reposition/delete never mutates SDF history or exported geometry", () => {
  const l = make(),
    p = new PrecisionTools(() => l);
  p.sync();
  try {
    const before = saveSculptProject(l.project),
      history = l.undoCount;
    const ray = new Raycaster(new Vector3(0, 0, 4), new Vector3(0, 0, -1));
    p.start(2);
    assert(p.pick(ray));
    assert(p.pick(ray));
    assert.equal(p.settings.measurements.length, 1);
    const m = p.settings.measurements[0];
    p.reposition(m.id, 0);
    assert(p.pick(ray));
    assert.equal(p.active, 0);
    assert.equal(l.undoCount, history);
    assert.deepEqual(saveSculptProject(l.project), before);
    assert(p.group.children.length > 0);
    p.remove(m.id);
    assert.equal(p.group.children.length, 0);
    p.start(3);
    p.pick(ray);
    p.step(undefined, undefined, false);
    assert.equal(p.pending.length, 0);
  } finally {
    p.dispose();
    l.dispose();
  }
});
test("nested groups accept model-world numeric position/rotation and uniform physical dimensions with one undo each", () => {
  const l = make(),
    p = new PrecisionTools(() => l);
  p.sync();
  try {
    const id = l.active.layer.id,
      outer = l.createGroup("Outer"),
      inner = l.createGroup("Inner");
    l.reparent(inner, outer);
    l.reparent(id, inner);
    l.selectGroup(outer);
    p.apply("px", 20);
    p.apply("ry", 35);
    p.apply("scale", 1.5);
    l.select(id);
    p.apply("px", 12.345);
    near(l.transformNode.transform.position[0], 0.12345);
    p.apply("rz", 45);
    near(l.transformNode.transform.rotation[2], Math.PI / 4);
    const count = l.undoCount,
      before = structuredClone(l.transformNode.transform),
      dim = selectionDimensions(l);
    p.apply("width", 50);
    near(selectionDimensions(l)[0] * p.settings.millimetresPerUnit, 50, 1e-5);
    assert.equal(l.undoCount, count + 1);
    l.undo();
    near(l.transformNode.transform.scale[0], before.scale[0]);
    l.undo(true);
    near(selectionDimensions(l)[0] * 100, 50, 1e-5);
    l.selectGroup(outer);
    p.apply("height", 80);
    near(selectionDimensions(l)[1] * 100, 80, 1e-5);
    l.setNodeFlag(outer, "locked", true);
    l.select(id);
    assert.throws(() => p.apply("px", 4));
    assert.throws(() => p.apply("scale", 0));
    assert.throws(() => p.apply("ry", NaN));
    assert(dim[0] > 0);
  } finally {
    p.dispose();
    l.dispose();
  }
});
test("snap values provide free default, fractional-mm positions and configurable angles", () => {
  const p = defaultPrecision(),
    t = identityTransform();
  t.position = [0.1234, -0.1256, 0.04];
  t.rotation = [0.14, 0.4, -0.2];
  assert.deepEqual(snappedTransform(t, p), t);
  for (const mm of [0.1, 1, 5]) {
    p.translationSnapMM = mm;
    p.angleSnapDegrees = 10;
    const r = snappedTransform(t, p);
    for (const n of r.position) near((n * 100) / mm, Math.round((n * 100) / mm));
    for (const n of r.rotation)
      near((n * 180) / Math.PI / 10, Math.round((n * 180) / Math.PI / 10));
  }
  near(snapValue(0.00051, 0.001), 0.001);
  assert.throws(() => snapValue(1, -1));
});
test("native and worker recovery retain units/calibration/snaps/annotations; legacy defaults leave transforms and samples intact", async () => {
  const l = make(),
    p = new PrecisionTools(() => l);
  p.sync();
  const previous = globalThis.Worker;
  try {
    p.settings.unit = "in";
    p.settings.millimetresPerUnit = 25.4;
    p.settings.translationSnapMM = 0.1;
    p.settings.angleSnapDegrees = 7.5;
    p.settings.measurements = [
      {
        id: "ruler-1",
        points: [
          [0, 0, 0],
          [1, 0, 0],
        ],
      },
    ];
    const display = l.display.snapshot(l.project.id, l.project.layerStack.layers),
      raw = saveSculptProject(l.project, display),
      loaded = openSculptProject(raw);
    assert.deepEqual(loaded.displayPreferences.precision, p.settings);
    globalThis.Worker = RecoveryBrowserWorker;
    const recovered = await encodeRecovery(
      l,
      settings,
      display,
      undefined,
      new AbortController().signal,
      () => true,
    );
    const reopened = openSculptProject(recovered.data);
    assert.deepEqual(reopened.displayPreferences.precision, p.settings);
    assert.equal(RecoveryBrowserWorker.active, 0);
    const legacy = openSculptProject(saveSculptProject(l.project));
    const restored = new LayerDisplayPreferences();
    restored.restore(legacy.id, legacy.layerStack.layers, legacy.displayPreferences);
    assert.deepEqual(restored.precision, defaultPrecision());
    assert.deepEqual(legacy.layerStack.active.transform, l.active.layer.transform);
    assert.deepEqual(legacy.layerStack.active.volume.values, l.active.layer.volume.values);
    assert.throws(() =>
      validateProjectDisplay(
        { ...display, precision: { ...p.settings, millimetresPerUnit: NaN } },
        l.project.layerStack.layers.map((v) => v.id),
      ),
    );
  } finally {
    globalThis.Worker = previous;
    p.dispose();
    l.dispose();
  }
});
test("calibrated STL target agrees with selected physical bounds, while explicit export overrides remain supported", async () => {
  const l = make(),
    p = new PrecisionTools(() => l);
  p.sync();
  try {
    p.apply("width", 50);
    const expected = selectionDimensions(l).map((v) => v * 100),
      sources = l.exportSources("selected", false);
    const calibratedTarget = physicalExportLongestMM(sources, p.settings.millimetresPerUnit);
    near(calibratedTarget, Math.max(...expected));
    const encoded = await encodeSTL(sources, "fast", 128 * 1024 ** 2, calibratedTarget);
    encoded.report.dimensions.forEach((v, i) => {
      near(v, expected[i], 0.001);
    });
    const override = await encodeSTL(sources, "fast", 128 * 1024 ** 2, 100);
    near(Math.max(...override.report.dimensions), 100, 0.001);
    assert.deepEqual(
      selectionDimensions(l).map((v) => v * 100),
      expected,
    );
  } finally {
    p.dispose();
    l.dispose();
  }
});
for (const hand of ["left", "right"])
  test(`${hand} logical Tool measurement claims trigger, rearms after menus/tracking and supports snapped VR layer grabs`, () => {
    const l = make(),
      p = new PrecisionTools(() => l);
    p.sync();
    try {
      const state = {
        handedness: hand,
        role: "tool",
        slot: 0,
        connectionId: 1,
        connected: true,
        tracked: true,
        gripTracked: true,
        buttons: {
          trigger: { pressed: false, justPressed: false },
          grip: { pressed: false, justPressed: false },
        },
      };
      const pose = new Matrix4().makeTranslation(0, 0, 4);
      p.start(2);
      assert(p.step(state, pose, true));
      state.buttons.trigger = { pressed: true, justPressed: true };
      p.step(state, pose, true);
      assert.equal(p.pending.length, 1);
      p.step(state, pose, false);
      p.step(state, pose, true);
      assert.equal(p.pending.length, 0);
      state.buttons.trigger = { pressed: false, justPressed: false };
      p.step(state, pose, true);
      state.buttons.trigger = { pressed: true, justPressed: true };
      p.step(state, pose, true);
      assert.equal(p.pending.length, 1);
      p.start(0);
      assert.equal(p.step(state, pose, true), false);
      l.display.precision.translationSnapMM = 1;
      const grab = new XRLayerGrab(() => l);
      state.buttons.grip = { pressed: true, justPressed: true };
      grab.step(state, new Matrix4(), 0);
      state.buttons.grip.justPressed = false;
      grab.step(state, new Matrix4().makeTranslation(0.1234, 0, 0), 10);
      near(l.transformNode.transform.position[0], 0.12);
      state.buttons.grip.pressed = false;
      grab.step(state, pose, 20);
      const after = transformMatrix(l.transformNode.transform);
      l.undo();
      near(l.transformNode.transform.position[0], 0);
      l.undo(true);
      assert.deepEqual(transformMatrix(l.transformNode.transform), after);
    } finally {
      p.dispose();
      l.dispose();
    }
  });

test("precision VR keypad validates values and all pages retain disjoint readable hit targets", () => {
  const l = make(),
    p = new PrecisionTools(() => l);
  p.sync();
  try {
    for (const state of ["home", "transform", "annotations", "field:px"]) {
      p.activate(`precision:${state}`);
      const c = p.content();
      for (const [i, b] of c.buttons.entries()) {
        const r = b.rect;
        assert(r.width >= 140 && r.height >= 74 && r.y + r.height < 1040);
        for (const o of c.buttons.slice(i + 1)) {
          const s = o.rect;
          assert(
            r.x + r.width <= s.x ||
              s.x + s.width <= r.x ||
              r.y + r.height <= s.y ||
              s.y + s.height <= r.y,
          );
        }
      }
    }
    p.activate("precision:key:1");
    p.activate("precision:key:2");
    p.activate("precision:key:.");
    p.activate("precision:key:5");
    p.activate("precision:apply");
    near(l.transformNode.transform.position[0], 0.125);
    p.activate("precision:field:scale");
    p.activate("precision:key:-");
    p.activate("precision:key:1");
    p.activate("precision:apply");
    assert.match(p.feedback, /Invalid/);
    near(l.transformNode.transform.scale[0], 1);
  } finally {
    p.dispose();
    l.dispose();
  }
});
for (const hand of ["left", "right"])
  test(`${hand} actual controller bridge reserves measurement trigger and restores stroke ownership when off`, () => {
    const l = make(),
      p = new PrecisionTools(() => l);
    p.sync();
    const rays = [new Group(), new Group()],
      grips = [new Group(), new Group()],
      root = new Group(),
      roles = new XRControllerRoles();
    roles.setDominant(hand);
    const enabled = [];
    const stroke = {
      active: false,
      update(_tool, _pose, _time, allow) {
        enabled.push(allow);
      },
      cancel() {},
    };
    const bridge = new XRControllers(
      { getController: (i) => rays[i], getControllerGrip: (i) => grips[i] },
      root,
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
    };
    const session = new EventTarget();
    session.visibilityState = "visible";
    try {
      bridge.start(session);
      rays[1].dispatchEvent({ type: "connected", data: source });
      rays[1].position.set(0, 0, 4);
      grips[1].position.set(0, 0, 4);
      p.start(2);
      bridge.update(0);
      assert(bridge.slots[1].rayVisual.visible);
      Object.assign(source.gamepad.buttons[0], { value: 1, pressed: true });
      bridge.update(16);
      assert.equal(p.pending.length, 1);
      assert.equal(enabled.at(-1), false);
      Object.assign(source.gamepad.buttons[0], { value: 0, pressed: false });
      bridge.update(32);
      Object.assign(source.gamepad.buttons[0], { value: 1, pressed: true });
      bridge.update(48);
      assert.equal(p.settings.measurements.length, 1);
      assert.equal(l.undoCount, 0);
      session.visibilityState = "hidden";
      bridge.update(64);
      assert.equal(enabled.at(-1), false);
      session.visibilityState = "visible";
      bridge.update(80);
      assert.equal(p.pending.length, 0);
      p.start(0);
      Object.assign(source.gamepad.buttons[0], { value: 0, pressed: false });
      bridge.update(96);
      assert.equal(enabled.at(-1), true);
    } finally {
      bridge.dispose();
      p.dispose();
      l.dispose();
    }
  });
test("Boolean-preview surface measurements remain visible as model siblings; unchanged frame sync reuses annotations", async () => {
  const l = make(),
    root = new Group();
  root.add(l.group, l.composite.group);
  const p = new PrecisionTools(() => l);
  p.sync();
  try {
    l.viewMode = "boolean";
    await l.composite.flush();
    l.group.visible = false;
    l.composite.group.visible = true;
    p.start(2);
    const ray = new Raycaster(new Vector3(0, 0, 4), new Vector3(0, 0, -1));
    assert(p.pick(ray));
    assert(p.pick(ray));
    assert.equal(p.group.parent, root);
    assert(p.group.visible);
    const children = [...p.group.children];
    const geometries = children.map((c) => c.geometry);
    for (let i = 0; i < 100; i++) p.sync();
    assert.deepEqual(p.group.children, children);
    assert.deepEqual(
      p.group.children.map((c) => c.geometry),
      geometries,
    );
    const replacement = new Group();
    replacement.add(l.group, l.composite.group);
    p.sync();
    assert.equal(p.group.parent, replacement);
  } finally {
    p.dispose();
    l.dispose();
  }
});
test("project-scale export bounds include the full chosen source scope and reject empty/nonfinite geometry", () => {
  const t = identityTransform(),
    chunk = { positions: new Float32Array([0, 0, 0, 1, 2, 3]), normals: new Float32Array(6) };
  const a = { transform: t, chunks: [chunk] },
    b = { transform: { ...identityTransform(), position: [10, 0, 0] }, chunks: [chunk] };
  near(physicalExportLongestMM([a], 100), 300);
  near(physicalExportLongestMM([a, b], 100), 1100);
  assert.throws(() => physicalExportLongestMM([], 100));
  assert.throws(() => physicalExportLongestMM([a], NaN));
  assert.throws(() =>
    physicalExportLongestMM(
      [{ ...a, chunks: [{ ...chunk, positions: new Float32Array([NaN, 0, 0]) }] }],
      100,
    ),
  );
});
