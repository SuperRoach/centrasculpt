import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Group, Matrix4, PerspectiveCamera, Quaternion, Raycaster, Scene, Vector3 } from "three";
import { canvasContext } from "../scripts/fixtures/canvas-context.mjs";
import {
  LayerDisplayPreferences,
  validateProjectDisplay,
} from "../work/test-build/display-preferences.mjs";
import { EditorToolState } from "../work/test-build/editor-tool-state.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { ShapePreviewModel } from "../work/test-build/shape-preview.mjs";
import { XRControllerRoles } from "../work/test-build/xr-controller-roles.mjs";
import { XRControllers } from "../work/test-build/xr-controllers.mjs";
import { XRSceneRig } from "../work/test-build/xr-scene.mjs";
import {
  SUPPORT_GUIDE_LAYOUT,
  SUPPORT_GUIDE_STYLE,
  XRSupportGuide,
} from "../work/test-build/xr-support-guide.mjs";
import { SUPPORT_STICK_BINDINGS } from "../work/test-build/xr-support-shortcuts.mjs";
import { VR_UI_SCALES } from "../work/test-build/xr-ui-style.mjs";
import { XRWorldMenu } from "../work/test-build/xr-world-menu.mjs";

const settings = {
  mode: "add",
  radius: 0.22,
  strength: 0.35,
  hardness: 0,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
const eye = { x: 0, y: 1.6, z: 0 };
function fixture() {
  const previous = globalThis.document,
    text = [],
    calls = [];
  const triangles = [],
    fills = [],
    translations = [],
    scales = [],
    curves = [],
    strokes = [],
    fillStyles = [],
    fillRules = [],
    composites = [];
  let path = [];
  const ctx = canvasContext({
    beginPath: () => {
      path = [];
    },
    moveTo: (...args) => {
      path.push(["move", ...args]);
      triangles.push(["move", ...args]);
    },
    lineTo: (...args) => {
      path.push(["line", ...args]);
      triangles.push(["line", ...args]);
    },
    fill: (rule) => {
      fillRules.push(rule);
      fills.push([...path]);
      fillStyles.push(ctx.fillStyle);
    },
    stroke: () => {
      composites.push({
        operation: ctx.globalCompositeOperation,
        width: ctx.lineWidth,
        cap: ctx.lineCap,
      });
      strokes.push([...path]);
    },
    translate: (...args) => translations.push(args),
    scale: (...args) => scales.push(args),
    bezierCurveTo: (...args) => curves.push(args),
    fillText: (...args) => text.push(args),
    arc: (...args) => calls.push(args),
  });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  const guide = new XRSupportGuide();
  return {
    guide,
    text,
    calls,
    triangles,
    fills,
    translations,
    scales,
    curves,
    strokes,
    fillStyles,
    fillRules,
    composites,
    dispose() {
      guide.dispose();
      globalThis.document = previous;
    },
  };
}
const state = (hand = "left") => ({
  connected: true,
  tracked: true,
  gripTracked: true,
  role: "support",
  handedness: hand,
  connectionId: 1,
  stick: { available: true, x: 0, y: 0 },
});
const pose = () => new Matrix4().makeTranslation(-0.3, 1, -0.5);
const near = (a, b) => assert(a.distanceTo(b) < 1e-10, `${a.toArray()} vs ${b.toArray()}`);

test("wordless guide draws exact arrow tabs with undo/redo, wheel and layer glyphs and a circular transparent centre", () => {
  const f = fixture();
  try {
    const { guide } = f,
      l = SUPPORT_GUIDE_LAYOUT;
    assert.deepEqual([guide.texture.image.width, guide.texture.image.height], [512, 512]);
    assert.deepEqual(
      [guide.mesh.geometry.parameters.width, guide.mesh.geometry.parameters.height],
      [0.11, 0.11],
    );
    assert.deepEqual(f.text, [], "no heading or words");
    assert.deepEqual(f.fillStyles, [SUPPORT_GUIDE_STYLE.arrow]);
    assert.equal(SUPPORT_GUIDE_STYLE.arrow, "rgba(230, 232, 231, 0.38)");
    assert.equal(SUPPORT_GUIDE_STYLE.glyph, "rgba(28, 32, 34, 0.85)");
    assert.equal(
      f.strokes.length,
      17,
      "one transparent separator pass plus shortcut glyphs; no arrow borders",
    );
    assert(
      !f.strokes.some((path) => path.some((point) => point[1] === 480 || point[1] === 32)),
      "no arrow outline",
    );
    assert.deepEqual(
      f.fillRules,
      ["evenodd"],
      "circle is a real transparent cutout, with one seamless fill",
    );
    assert.deepEqual(f.fills, [
      [
        ["move", 256, 32],
        ["line", 480, 256],
        ["line", 256, 480],
        ["line", 32, 256],
        ["move", 356, 256],
      ],
    ]);
    assert.deepEqual(f.strokes[0], [
      ["move", 0, 0],
      ["line", 512, 512],
      ["move", 512, 0],
      ["line", 0, 512],
    ]);
    assert.deepEqual(
      f.composites[0],
      { operation: "destination-out", width: 32, cap: "butt" },
      "four narrow transparent cuts, not opaque separator lines",
    );
    assert(
      f.composites.slice(1).every((c) => c.operation === "source-over"),
      "glyph drawing restores normal compositing",
    );
    assert.deepEqual(f.translations, [
      [92, 256],
      [420, 256],
      [256, 92],
      [256, 420],
    ]);
    assert.deepEqual(f.scales, [[-1, 1]], "redo mirrors the undo glyph");
    assert.deepEqual(f.curves, [
      [34, -15, -4, -32, -25, -7],
      [34, -15, -4, -32, -25, -7],
    ]);
    assert.deepEqual(
      f.calls,
      [
        [256, 256, 100, 0, Math.PI * 2],
        [0, 0, 26, 0, Math.PI * 2],
      ],
      "circular centre cutout plus wheel ring",
    );
    assert(
      f.triangles.some((p) => p[0] === "line" && p[1] === 0 && p[2] === 29),
      "layer stack glyph",
    );
    assert(l.directions.left.x < l.centre[0] && l.directions.right.x > l.centre[0]);
    assert(l.directions.up.y < l.centre[1] && l.directions.down.y > l.centre[1]);
    assert.equal(SUPPORT_STICK_BINDINGS.left.action, "undo");
    assert.equal(SUPPORT_STICK_BINDINGS.right.action, "redo");
    assert.equal(SUPPORT_STICK_BINDINGS.up.menu, "tool-wheel");
    assert.equal(SUPPORT_STICK_BINDINGS.down.menu, "layers");
  } finally {
    f.dispose();
  }
});
for (const hand of ["left", "right"])
  test(`${hand} support: controller-centred placement, wrist-locked orientation and UI scaling`, () => {
    const f = fixture(),
      s = state(hand),
      grip = pose();
    try {
      grip.compose(
        new Vector3(-0.3, 1, -0.5),
        new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.7),
        new Vector3(1, 1, 1),
      );
      const expected = f.guide.offset.clone();
      assert.deepEqual(
        f.guide.offset.toArray(),
        [0.005, -0.0043, -0.0207],
        "measured face centre inset 9 mm and 5 mm right for either hand",
      );
      expected.applyMatrix4(grip);
      f.guide.update(s, grip, eye, 16, true);
      near(f.guide.mesh.position, expected);
      near(
        new Vector3(0, 0, 1).applyQuaternion(f.guide.mesh.quaternion),
        new Vector3(
          0,
          Math.cos((37.2 * Math.PI) / 180),
          -Math.sin((37.2 * Math.PI) / 180),
        ).transformDirection(grip),
      );
      const rotation = f.guide.mesh.quaternion.clone();
      f.guide.update(s, grip, { ...eye, x: 0.4 }, 32, true, VR_UI_SCALES.large);
      assert(
        rotation.angleTo(f.guide.mesh.quaternion) < 1e-7,
        "head motion cannot detach orientation from controller",
      );
      near(
        new Vector3(0, 1, 0).applyQuaternion(f.guide.mesh.quaternion),
        new Vector3(
          0,
          -Math.sin((37.2 * Math.PI) / 180),
          -Math.cos((37.2 * Math.PI) / 180),
        ).transformDirection(grip),
      );
      assert.equal(f.guide.mesh.scale.x, VR_UI_SCALES.large);
      f.guide.offset.y += 0.1;
      f.guide.update(s, grip, eye, 48, true);
      near(
        f.guide.mesh.position,
        expected.add(new Vector3(0, 0.1, 0).transformDirection(grip).multiplyScalar(0.1)),
      );
    } finally {
      f.dispose();
    }
  });
test("tracking, missing controller/viewer, XR visibility, face clearance and re-entry reset without stale poses", () => {
  const f = fixture(),
    s = state();
  try {
    const show = () => {
      f.guide.update(s, pose(), eye, 16, true);
      assert(f.guide.mesh.visible);
    };
    for (const key of ["connected", "tracked", "gripTracked"]) {
      show();
      s[key] = false;
      f.guide.update(s, pose(), eye, 32, true);
      assert(!f.guide.mesh.visible);
      s[key] = true;
    }
    for (const [controller, grip, viewer, active] of [
      [undefined, pose(), eye, true],
      [s, undefined, eye, true],
      [s, pose(), null, true],
      [s, pose(), eye, false],
      [{ ...s, role: "tool" }, pose(), eye, true],
      [{ ...s, stick: { available: false } }, pose(), eye, true],
    ]) {
      show();
      f.guide.update(controller, grip, viewer, 32, active);
      assert(!f.guide.mesh.visible);
    }
    show();
    const close = f.guide.mesh.position.clone();
    f.guide.update(s, pose(), close, 48, true);
    assert(!f.guide.mesh.visible);
    show();
    f.guide.hide();
    assert(!f.guide.mesh.visible);
    show();
  } finally {
    f.dispose();
  }
});
test("guide never raycasts, repaints, changes source state or allocates replacement GPU resources across frames/sessions", () => {
  const f = fixture(),
    s = state(),
    original = structuredClone(s);
  try {
    const { mesh, texture } = f.guide,
      resources = [mesh.geometry, mesh.material, texture],
      version = texture.version,
      painted = f.fills.length;
    let disposals = 0;
    for (const resource of resources) resource.addEventListener("dispose", () => disposals++);
    for (let i = 0; i < 500; i++) {
      f.guide.update(s, pose(), eye, i * 16, true);
      if (i % 25 === 0) f.guide.hide();
    }
    assert.deepEqual(s, original);
    assert.equal(texture.version, version);
    assert.equal(f.fills.length, painted);
    assert.equal(mesh.material.depthTest, true);
    assert.equal(mesh.material.depthWrite, false);
    mesh.updateMatrixWorld(true);
    assert.deepEqual(
      new Raycaster(new Vector3(0, 1, 0), new Vector3(0, 0, -1)).intersectObject(mesh),
      [],
    );
    assert.deepEqual([mesh.geometry, mesh.material, f.guide.texture], resources);
    f.guide.dispose();
    f.guide.dispose();
    assert.equal(disposals, 3);
    f.guide.update(s, pose(), eye, 9000, true);
    assert(!mesh.visible);
  } finally {
    f.dispose();
  }
});
class Session extends EventTarget {
  visibilityState = "visible";
}
function source(hand) {
  return {
    handedness: hand,
    targetRayMode: "tracked-pointer",
    profiles: ["meta-quest-touch-plus"],
    gripSpace: {},
    gamepad: {
      mapping: "xr-standard",
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 6 }, () => ({ value: 0, pressed: false, touched: false })),
    },
  };
}
for (const dominant of ["left", "right"])
  test(`actual bridge ${dominant} dominance: always on during menus/grabs, dynamic swap, loss, exit/re-entry and toggle`, () => {
    const f = fixture(),
      roles = new XRControllerRoles(),
      root = new Group(),
      rays = [new Group(), new Group()],
      grips = [new Group(), new Group()];
    roles.setDominant(dominant);
    const layers = new IndependentLayers(createBaseProject(new SDFVolume(17), settings));
    const bridge = new XRControllers(
      { getController: (i) => rays[i], getControllerGrip: (i) => grips[i] },
      root,
      roles,
      undefined,
      () => {},
      { supportGuide: f.guide, layers: () => layers, workspace: new Group() },
    );
    const sources = [source("left"), source("right")],
      session = new Session();
    let time = 0;
    const step = () => {
      for (const grip of grips) grip.updateMatrix();
      bridge.setGuideViewer(eye);
      time += 16;
      bridge.update(time);
    };
    try {
      bridge.start(session);
      rays.forEach((ray, i) => {
        grips[i].position.set(i ? 0.3 : -0.3, 1, -0.5);
        ray.dispatchEvent({ type: "connected", data: sources[i] });
      });
      const before = new Uint8Array(saveSculptProject(layers.project));
      step();
      assert(f.guide.mesh.visible);
      for (const mode of ["minimal", "simple", "realistic"]) {
        bridge.setDisplay(mode);
        bridge.setHints("hidden");
        step();
        assert(f.guide.mesh.visible);
      }
      const supportIndex = roles.support === "left" ? 0 : 1;
      assert.equal(Math.sign(f.guide.mesh.position.x), supportIndex ? 1 : -1);
      sources[supportIndex].gamepad.axes[3] = -1;
      step();
      assert.equal(bridge.shortcuts.menu, "tool-wheel");
      assert(f.guide.mesh.visible);
      sources[supportIndex].gamepad.axes[3] = 0;
      step();
      sources[supportIndex].gamepad.buttons[1] = { value: 1, pressed: true };
      step();
      assert(f.guide.mesh.visible);
      sources[supportIndex].gamepad.buttons[1] = { value: 0, pressed: false };
      step();
      layers.display.supportGuide = false;
      step();
      assert(!f.guide.mesh.visible);
      layers.display.supportGuide = true;
      step();
      assert(f.guide.mesh.visible);
      layers.display.vrUiScale = "large";
      step();
      assert.equal(f.guide.mesh.scale.x, VR_UI_SCALES.large);
      bridge.setDominant(roles.support);
      assert(!f.guide.mesh.visible);
      step();
      assert.equal(Math.sign(f.guide.mesh.position.x), supportIndex ? -1 : 1);
      const newIndex = 1 - supportIndex;
      grips[newIndex].visible = false;
      step();
      assert(!f.guide.mesh.visible);
      grips[newIndex].visible = true;
      step();
      assert(f.guide.mesh.visible);
      session.visibilityState = "hidden";
      session.dispatchEvent(new Event("visibilitychange"));
      assert(!f.guide.mesh.visible);
      session.visibilityState = "visible";
      step();
      assert(f.guide.mesh.visible);
      rays[newIndex].dispatchEvent({ type: "disconnected" });
      assert(!f.guide.mesh.visible);
      step();
      assert(!f.guide.mesh.visible);
      rays[newIndex].dispatchEvent({ type: "connected", data: sources[newIndex] });
      step();
      assert(f.guide.mesh.visible);
      for (let i = 0; i < 3; i++) {
        bridge.stop();
        assert(!f.guide.mesh.visible);
        bridge.start(new Session());
        rays.forEach((r, j) => {
          r.dispatchEvent({ type: "connected", data: sources[j] });
        });
        step();
        assert(f.guide.mesh.visible);
      }
      assert.equal(layers.undoCount, 0);
      assert.equal(layers.redoCount, 0);
      assert.deepEqual(new Uint8Array(saveSculptProject(layers.project)), before);
    } finally {
      bridge.dispose();
      layers.dispose();
      f.dispose();
    }
  });
test("World Preferences toggle defaults on, persists in native display metadata and leaves history/SDF/transforms unchanged", () => {
  const layers = new IndependentLayers(createBaseProject(new SDFVolume(17), settings));
  const tools = new EditorToolState({
    layers: () => layers,
    shape: new ShapePreviewModel(layers.project.activeLayerId),
    settings: () => settings,
    setSettings() {},
    mode: () => "sculpt",
    selectTool() {},
    selectTransform() {},
    busy: () => false,
    changed() {},
  });
  const world = new XRWorldMenu(tools);
  world.section = "preferences";
  const before = new Uint8Array(saveSculptProject(layers.project));
  try {
    assert.equal(layers.display.supportGuide, true);
    const button = () => world.content().buttons.find((b) => b.id === "world-support-guide");
    assert.equal(button().selected, true);
    assert(world.activate("world-support-guide"));
    assert.equal(button().label, "Support shortcut guide · Off");
    const display = layers.display.snapshot(layers.project.id, layers.project.layerStack.layers);
    const opened = openSculptProject(saveSculptProject(layers.project, display)),
      restored = new LayerDisplayPreferences();
    restored.restore(opened.id, opened.layerStack.layers, opened.displayPreferences);
    assert.equal(restored.supportGuide, false);
    restored.restore(opened.id, opened.layerStack.layers);
    assert.equal(restored.supportGuide, true);
    world.activate("world-support-guide");
    assert.equal(button().selected, true);
    assert(
      !(
        "supportGuide" in
        layers.display.snapshot(layers.project.id, layers.project.layerStack.layers)
      ),
    );
    assert.throws(() =>
      validateProjectDisplay({ mode: "clay", colours: {}, supportGuide: "false" }, []),
    );
    assert.deepEqual(new Uint8Array(saveSculptProject(layers.project)), before);
    assert.equal(layers.undoCount, 0);
    assert.equal(layers.redoCount, 0);
  } finally {
    layers.dispose();
  }
});

test("Studio and Passthrough keep the guide in tracking space independently of grabbed workspace transforms", () => {
  const f = fixture(),
    scene = new Scene(),
    rig = new XRSceneRig(scene, new PerspectiveCamera());
  rig.controllerTracking.add(f.guide.mesh);
  try {
    for (const environment of ["studio", "passthrough"]) {
      rig.enter([], environment);
      f.guide.update(state(), pose(), eye, 16, true);
      scene.updateMatrixWorld(true);
      const position = f.guide.mesh.getWorldPosition(new Vector3());
      rig.workspaceRoot.position.set(5, -2, 4);
      rig.workspaceRoot.rotation.set(0.5, 1, -0.3);
      rig.workspaceRoot.scale.setScalar(3);
      scene.updateMatrixWorld(true);
      near(f.guide.mesh.getWorldPosition(new Vector3()), position);
      assert(f.guide.mesh.visible);
      assert.equal(scene.background === null, environment === "passthrough");
      assert.equal(f.guide.mesh.material.toneMapped, false);
      assert.equal(f.guide.mesh.material.depthTest, true);
      rig.exit();
      f.guide.hide();
    }
  } finally {
    rig.dispose();
    f.dispose();
  }
});

test("guide matches actual Quest Touch Plus face tilt and sits below its rim for both hands", () => {
  const measured = JSON.parse(
    readFileSync(new URL("./fixtures/quest-touch-plus-face.json", import.meta.url), "utf8"),
  );
  const f = fixture();
  try {
    for (const hand of ["left", "right"]) {
      const data = measured.hands[hand];
      const normal = new Vector3(...data.buttonRest)
        .sub(new Vector3(...data.buttonPressed))
        .normalize();
      f.guide.update(state(hand), new Matrix4(), eye, 16, true);
      const guideNormal = new Vector3(0, 0, 1).applyQuaternion(f.guide.mesh.quaternion);
      assert(
        guideNormal.angleTo(normal) < (0.001 * Math.PI) / 180,
        "parallel to measured face, not grip plane",
      );
      near(f.guide.mesh.position, new Vector3(0.005, -0.0043, -0.0207));
      for (const point of data.faceRim) {
        const distance = new Vector3(...point).sub(f.guide.mesh.position).dot(guideNormal);
        assert(
          distance > 0.008 && distance < 0.01,
          "rim stays 8–10 mm above entire guide plane, no tilted intersection",
        );
      }
      const expectedCentre = new Vector3(...data.centre)
        .addScaledVector(normal, -0.007)
        .add(new Vector3(0.005, 0, 0));
      assert(
        f.guide.mesh.position.distanceTo(expectedCentre) < 0.0002,
        "centred to within 0.2 mm of measured inset centre",
      );
    }
  } finally {
    f.dispose();
  }
});

test("expanded icon ring clears the controller while shorter tips keep a compact footprint", () => {
  const l = SUPPORT_GUIDE_LAYOUT;
  const modelRadius = 0.031; // Conservative outer face radius, beyond the measured flat top patch.
  for (const scale of Object.values(VR_UI_SCALES)) {
    const pixelMetres = (l.metres[0] * scale) / l.width;
    for (const point of Object.values(l.directions)) {
      const radius = Math.hypot(point.x - l.centre[0], point.y - l.centre[1]);
      assert(
        l.arrow.innerRadius * pixelMetres < modelRadius,
        "rounded inner edge reaches beneath the black rim rather than leaving an empty crescent",
      );
      const backingSideClearance = (l.arrow.tipRadius - radius) / Math.SQRT2;
      assert(
        backingSideClearance > 41.5 && radius - l.arrow.innerRadius > 41.5,
        "full stroked glyph fits inside its shorter triangle backing",
      );
      // Glyph paths fit within 34px plus half the 7px stroke. Inner edge must clear body.
      assert(
        (radius - 37.5) * pixelMetres > modelRadius + 0.002,
        "entire glyph sits outside controller rim with clearance",
      );
      assert(
        l.arrow.tipRadius * pixelMetres < 240 * pixelMetres,
        "tips take less room than before",
      );
      assert(
        l.arrow.tipRadius - radius < 0.6 * (240 - 126),
        "outer triangle extension shortened by over 40%",
      );
      assert(radius > 126 * 1.3, "shortcut ring expanded at least 30%");
    }
  }
});
