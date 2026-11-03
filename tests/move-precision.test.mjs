import assert from "node:assert/strict";
import test from "node:test";
import { Group, Matrix4, Quaternion, Vector3 } from "three";
import {
  fixture,
  pose,
  press,
  release,
  start,
} from "../scripts/fixtures/move-precision-fixture.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { MoveGesture } from "../work/test-build/move-gesture.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { XRAlternateTool } from "../work/test-build/xr-alternate-tool.mjs";
import { XRMenuModel } from "../work/test-build/xr-menu-model.mjs";

const near = (a, b, e = 1e-9) => assert(Math.abs(a - b) < e, `${a} != ${b}`),
  bytes = (l) => new Uint8Array(saveSculptProject(l.project));
const wait = () => new Promise((r) => setTimeout(r, 1));
test("translation response suppresses physical noise, is continuous and pose-relative without drift", () => {
  const g = new MoveGesture(),
    out = new Vector3();
  for (const precision of [false, true])
    for (const scale of [0.1, 1, 3]) {
      g.capture(precision, 1 / scale);
      const gain = precision ? 0.25 : 1;
      for (const delta of [0, 0.0001, 0.0003])
        near(g.translation(new Vector3(delta / scale, 0, 0), out).length(), 0);
      near(g.translation(new Vector3(0.001 / scale, 0, 0), out).x, (0.001 / scale) * gain);
      for (let i = 0; i < 1000; i++) g.translation(new Vector3(0.001 / scale, 0, 0), out);
      near(out.x, (0.001 / scale) * gain);
      near(g.translation(new Vector3(), out).length(), 0);
      let last = 0;
      for (let i = 0; i < 100; i++) {
        const value = g.translation(new Vector3((0.00029 + i * 0.000004) / scale, 0, 0), out).x;
        assert(value >= last);
        assert(value - last < 0.00002 / scale);
        last = value;
      }
    }
});
for (const mode of ["non-elastic", "elastic"])
  for (const precision of [false, true])
    test(`${mode} precision ${precision}: no initial jump from offset grip, frozen radius/strength and return-to-start`, () => {
      const f = fixture();
      try {
        f.tools.move.mode = mode;
        f.tools.move.precision = precision;
        f.tools.move.strength = 0.6;
        const before = bytes(f.l),
          grip = pose(0.07, 0.04, 1.2);
        start(f, pose(), grip);
        near(f.move.preview.field.delta.length(), 0);
        assert(Object.isFrozen(f.move.capture));
        const pivot = f.move.preview.field.center.clone();
        f.move.update(f.s, pose(0.1), 32, true, pose(0.074, 0.04, 1.2));
        near(f.move.preview.field.delta.x, 0.004 * 0.6 * (precision ? 0.25 : 1));
        assert(f.move.preview.field.center.equals(pivot));
        f.move.update(f.s, pose(), 48, true, grip);
        near(f.move.preview.field.delta.length(), 0);
        release(f.s);
        f.move.update(f.s, pose(), 64, true, grip);
        assert(!f.l.deforming);
        assert.equal(f.l.undoCount, 0);
        assert.deepEqual(bytes(f.l), before);
      } finally {
        f.dispose();
      }
    });
for (const interaction of ["rotate", "twist"])
  for (const lock of ["free", "y"])
    test(`${interaction} ${lock}: noise suppression, stable signed axis across 180 and reverse without jumps`, () => {
      const g = new MoveGesture(),
        q = new Quaternion(),
        axis = new Vector3(0, 1, 0);
      g.capture(false, 1);
      g.rotation(q.setFromAxisAngle(axis, (0.1 * Math.PI) / 180), lock, 1, 120);
      near(g.angle, 0);
      let last = 0;
      for (let degree = 1; degree <= 400; degree++) {
        g.rotation(q.setFromAxisAngle(axis, (degree * Math.PI) / 180), lock, 1, 120);
        const signed = g.angle * g.axis.y;
        assert(signed >= last - 1e-8);
        near(g.axis.y, 1);
        last = signed;
      }
      near(last, (120 * Math.PI) / 180);
      for (let degree = 399; degree >= 0; degree--) {
        g.rotation(q.setFromAxisAngle(axis, (degree * Math.PI) / 180), lock, 1, 120);
        near(g.axis.y, 1);
      }
      near(g.angle, 0);
      g.rotation(q.setFromAxisAngle(axis, -0.3), lock, 1, 120);
      assert(g.angle * g.axis.y < 0);
      near(g.axis.y, 1);
      g.capture(true, 1);
      g.rotation(q.setFromAxisAngle(axis, 0.4), lock, 1, 120);
      near(g.angle, 0.1);
    });
for (const workspaceScale of [0.25, 2])
  test(`transformed workspace ${workspaceScale} and layer: physical noise floor and radius match rendered influence`, () => {
    const f = fixture(),
      parent = new Group();
    parent.position.set(0.2, 0.3, -0.2);
    parent.rotation.set(0.2, 0.4, 0.1);
    parent.scale.setScalar(workspaceScale);
    parent.add(f.l.group);
    try {
      f.l.setActiveTransform({
        position: [0.1, 0.2, 0.3],
        rotation: [0.2, -0.1, 0.3],
        scale: [1.7, 1.7, 1.7],
      });
      f.tools.move.radius = 0.34;
      f.tools.move.precision = true;
      const surface = f.l.active.surface.group;
      surface.updateWorldMatrix(true, false);
      const frame = surface.matrixWorld.clone(),
        base = frame.clone().multiply(pose());
      start(f, base, base);
      near(f.move.capture.radius, 0.2);
      f.move.influence.group.updateWorldMatrix(true, false);
      const rendered = f.move.influence.group.getWorldScale(new Vector3());
      near(rendered.x, 0.34 * workspaceScale);
      const local = 0.002 / (workspaceScale * 1.7),
        hand = frame.clone().multiply(pose(local));
      f.move.update(f.s, base, 32, true, hand);
      near(f.move.preview.field.delta.x, local * 0.25);
      const tiny = frame.clone().multiply(pose(0.0001 / (workspaceScale * 1.7)));
      f.move.update(f.s, base, 48, true, tiny);
      near(f.move.preview.field.delta.length(), 0);
      assert.equal(f.tools.move.precision, true);
    } finally {
      f.dispose();
    }
  });
test("target outlines are exact, stable on coincident chunks, amber for locked, absent for hidden/miss", () => {
  const f = fixture();
  try {
    f.move.update(f.s, pose(), 0, true);
    assert.equal(f.move.targetState, "valid");
    assert(f.move.marker.visible);
    assert(!f.move.influence.mesh.visible);
    assert(f.move.boundary.material.depthTest);
    near(f.move.influence.localRadius, f.tools.move.radius);
    const point = f.move.marker.getWorldPosition(new Vector3());
    near(f.l.active.volume.sampleLocal(point), 0, 0.005);
    for (let i = 0; i < 40; i++) f.move.update(f.s, pose(i % 2 ? 1e-8 : -1e-8), i + 1, true);
    assert.equal(f.move.targetState, "valid");
    assert(f.move.marker.getWorldPosition(new Vector3()).distanceTo(point) < 1e-6);
    f.l.setFlag(f.l.project.activeLayerId, "locked", true);
    f.move.update(f.s, pose(), 60, true);
    assert.equal(f.move.targetState, "locked");
    assert.equal(f.move.marker.material.color.getHexString(), "e8b174");
    press(f.s);
    f.move.update(f.s, pose(), 80, true);
    assert(!f.move.active);
    f.l.setFlag(f.l.project.activeLayerId, "locked", false);
    f.l.setFlag(f.l.project.activeLayerId, "visible", false);
    release(f.s);
    f.move.update(f.s, pose(), 96, true);
    assert(!f.move.marker.visible);
    assert.match(f.move.feedback, /hidden/);
    f.l.setFlag(f.l.project.activeLayerId, "visible", true);
    f.move.update(f.s, pose(5), 112, true);
    assert.equal(f.move.targetState, "none");
    assert(!f.move.marker.visible);
  } finally {
    f.dispose();
  }
});
test("palette precision is functional, captures per gesture and preserves Angular Non-Elastic compatibility", () => {
  const f = fixture();
  try {
    const menu = new XRMenuModel(f.tools);
    menu.setRequest("tool-wheel");
    menu.activate("tool:move");
    menu.activate("variant-settings");
    while (
      !menu.content().labels.some((l) => l.text.includes("Precision")) &&
      !menu.content().buttons.find((b) => b.id === "next").disabled
    )
      menu.activate("next");
    assert(menu.content().labels.some((l) => l.text.includes("Precision")));
    f.tools.adjust("move-precision", 1);
    assert(f.tools.move.precision);
    start(f);
    assert(f.move.capture.precision);
    assert.throws(() => f.tools.adjust("move-precision", 1), /Finish/);
    f.move.cancel();
    f.tools.move.interaction = "twist";
    const options = f.tools.options();
    assert(!options.find((o) => o.id === "move-mode"));
    assert(!options.find((o) => o.id === "move-stiffness"));
    assert(options.find((o) => o.id === "move-compatibility").value.includes("Non-Elastic"));
    assert(!options.find((o) => o.id === "move-axis").disabled);
  } finally {
    f.dispose();
  }
});
test("Support alternate Smooth restores Move and precision settings; queued request waits for trigger/commit", async () => {
  const f = fixture(),
    alternate = new XRAlternateTool(f.tools),
    support = {
      role: "support",
      connectionId: 2,
      connected: true,
      tracked: true,
      gripTracked: true,
      buttons: { trigger: { pressed: false, rawValue: 0, justPressed: false } },
    };
  const step = () => alternate.update(support, f.s, true, f.move.active);
  try {
    f.tools.move.mode = "non-elastic";
    f.tools.move.precision = true;
    const original = { ...f.tools.move };
    step();
    start(f);
    press(support);
    step();
    assert.equal(f.tools.active, "move");
    const hand = pose(0.12, 0, 1.6);
    f.move.update(f.s, pose(), 32, true, hand);
    release(f.s);
    f.move.update(f.s, pose(), 48, true, hand);
    assert(f.l.deforming);
    step();
    assert.equal(f.tools.active, "move");
    while (f.l.deforming) await wait();
    step();
    assert(alternate.active);
    assert.equal(f.tools.active, "smooth");
    release(support);
    step();
    assert.equal(f.tools.active, "move");
    assert.deepEqual(f.tools.move, original);
    assert.equal(f.l.undoCount, 1);
  } finally {
    alternate.cancel();
    f.dispose();
  }
});
for (const interaction of ["translate", "rotate", "twist"])
  test(`${interaction}: precision persists once with preview held, exact undo/redo and native reload`, async () => {
    const f = fixture(64);
    try {
      f.tools.move.mode = "non-elastic";
      f.tools.move.interaction = interaction;
      f.tools.move.precision = true;
      const before = bytes(f.l);
      start(f);
      const hand = pose(0.12, 0, 1.58).multiply(new Matrix4().makeRotationY(0.8));
      f.move.update(f.s, pose(), 32, true, hand);
      release(f.s);
      f.move.update(f.s, pose(), 48, true, hand);
      assert(f.l.deforming);
      assert(f.move.preview.active);
      assert.deepEqual(bytes(f.l), before);
      for (let i = 0; f.l.deforming && i < 5000; i++) await wait();
      assert(!f.l.deforming);
      assert.equal(f.l.undoCount, 1);
      assert(!f.move.preview.active);
      assert.match(f.move.feedback, /ready to edit/);
      const after = bytes(f.l);
      assert.deepEqual(
        openSculptProject(after.buffer).layerStack.layers[0].volume.values,
        f.l.active.volume.values,
      );
      f.l.undo();
      assert.deepEqual(bytes(f.l), before);
      f.l.undo(true);
      assert.deepEqual(bytes(f.l), after);
    } finally {
      f.dispose();
    }
  });
for (const reason of ["tracking", "session", "tool", "project", "undo", "layer"])
  test(`pending ${reason} interruption preserves source/history and rejects late commit`, async () => {
    const f = fixture(64);
    let old;
    try {
      f.tools.move.mode = "elastic";
      const layer = reason === "layer" ? f.l.create(64) : null;
      if (layer) f.l.select(f.l.project.layerStack.layers[0].id);
      const before = bytes(f.l);
      start(f);
      const hand = pose(0.2, 0, 1.7);
      f.move.update(f.s, pose(), 32, true, hand);
      release(f.s);
      f.move.update(f.s, pose(), 48, true, hand);
      assert(f.l.deforming);
      if (reason === "tracking") {
        f.s.tracked = false;
        f.move.update(f.s, pose(), 64, true, hand);
      }
      if (reason === "session") f.move.cancel();
      if (reason === "tool") f.tools.select("smooth");
      if (reason === "project") {
        old = f.l;
        const loaded = new IndependentLayers(openSculptProject(before.buffer));
        old.dispose();
        f.replace(loaded);
        f.move.update(f.s, pose(), 64, true, hand);
      }
      if (reason === "undo") {
        assert.throws(() => f.l.undo(), /Move/);
        f.move.cancel();
      }
      if (reason === "layer") {
        assert.throws(() => f.tools.selectLayer(layer.id), /Finish/);
        f.move.cancel();
      }
      if (reason === "session" || reason === "undo" || reason === "layer") {
        assert.match(f.move.feedback, /cancelled/);
        f.move.cancel();
        assert.match(f.move.feedback, /cancelled/);
      }
      for (let i = 0; (old ?? f.l).deforming && i < 5000; i++) await wait();
      assert.equal(f.l.undoCount, 0);
      assert.deepEqual(bytes(f.l), before);
      assert(!f.move.active);
    } finally {
      old?.dispose();
      f.dispose();
    }
  });
test("free wrist equivalent quaternion signs preserve twist axis and output through the half turn", () => {
  const g = new MoveGesture(),
    axis = new Vector3(0, 1, 0),
    q = new Quaternion();
  g.capture(false, 1);
  g.rotation(q.setFromAxisAngle(axis, Math.PI), "free", 1, 180);
  near(g.angle, Math.PI);
  g.capture(false, 1);
  let last;
  for (let degree = 150; degree <= 210; degree++) {
    q.setFromAxisAngle(axis, (degree * Math.PI) / 180);
    if (degree % 2) q.set(-q.x, -q.y, -q.z, -q.w);
    g.rotation(q, "free", 1, 180);
    const now = new Vector3(0.1, 0.1, 0).applyAxisAngle(g.axis, g.angle * 0.6);
    if (last) assert(now.distanceTo(last) < 0.002);
    near(g.axis.y, 1);
    last = now;
  }
  for (let i = 0; i < 1000; i++) g.rotation(q, "free", 1, 180);
  near(g.angle, Math.PI);
});
test("reconstruction failure reports source retained and a rearmed retry creates exactly one action", async () => {
  const f = fixture();
  try {
    f.tools.move.mode = "non-elastic";
    const history = f.l.active.history,
      prepare = history.prepareMoveReplacement,
      before = bytes(f.l);
    history.prepareMoveReplacement = () => {
      throw new Error("injected history failure");
    };
    const gesture = () => {
      start(f);
      const hand = pose(0.12, 0, 1.6);
      f.move.update(f.s, pose(), 32, true, hand);
      release(f.s);
      f.move.update(f.s, pose(), 48, true, hand);
    };
    gesture();
    while (f.l.deforming) await wait();
    assert.match(f.move.feedback, /Move failed.*source kept.*injected/);
    assert.deepEqual(bytes(f.l), before);
    assert.equal(f.l.undoCount, 0);
    history.prepareMoveReplacement = prepare;
    gesture();
    while (f.l.deforming) await wait();
    assert.equal(f.l.undoCount, 1);
    assert.match(f.move.feedback, /ready to edit/);
  } finally {
    f.dispose();
  }
});
test("coincident-hit tie break retains prior chunk but follows a meaningfully nearer surface", () => {
  const f = fixture();
  try {
    const [a, b] = f.l.active.surface.group.children;
    let zA = 0.85,
      zB = 0.85;
    f.l.active.surface.spatial.ray = (_ray, out) => {
      out.length = 0;
      out.push(a, b);
    };
    f.move.raycaster.intersectObject = (mesh, _recursive, hits) => {
      const z = mesh === a ? zA : zB;
      hits.push({ object: mesh, point: new Vector3(0, 0, z), distance: 1.5 - z });
      return hits;
    };
    f.move.update(f.s, pose(), 0, true);
    assert.equal(f.move.hoverChunk, a);
    zB = 0.850005;
    for (let i = 1; i <= 20; i++) f.move.update(f.s, pose(), i, true);
    assert.equal(f.move.hoverChunk, a);
    zB = 0.86;
    f.move.update(f.s, pose(), 32, true);
    assert.equal(f.move.hoverChunk, b);
    near(f.move.marker.getWorldPosition(new Vector3()).z, 0.86);
  } finally {
    f.dispose();
  }
});
