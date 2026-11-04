import assert from "node:assert/strict";
import test from "node:test";
import { Color, Matrix4, PerspectiveCamera, Quaternion, Raycaster, Scene, Vector3 } from "three";
import { WebGLBackground } from "../node_modules/three/src/renderers/webgl/WebGLBackground.js";
import { canvasContext } from "../scripts/fixtures/canvas-context.mjs";
import { installFileReader, readGlb } from "../scripts/fixtures/export-node.mjs";
import { RecoveryBrowserWorker } from "../scripts/fixtures/node-recovery-worker.mjs";
import {
  LayerDisplayPreferences,
  validateProjectDisplay,
} from "../work/test-build/display-preferences.mjs";
import { EDITOR_TOOLS, EditorToolState } from "../work/test-build/editor-tool-state.mjs";
import { encodeExport } from "../work/test-build/glb-export.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { encodeRecovery } from "../work/test-build/recovery-client.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { ShapePreviewModel } from "../work/test-build/shape-preview.mjs";
import { encodeSTL } from "../work/test-build/stl-export.mjs";
import {
  defaultWorldSettings,
  STUDIO_BACKGROUNDS,
  validateWorldSettings,
} from "../work/test-build/world-settings.mjs";
import { worldSettingsUI } from "../work/test-build/world-settings-ui.mjs";
import { MENU_SIZE, XRMenuModel } from "../work/test-build/xr-menu-model.mjs";
import { XRMenuView } from "../work/test-build/xr-menu-view.mjs";
import { XRSceneRig } from "../work/test-build/xr-scene.mjs";
import { XRSessionController } from "../work/test-build/xr-session.mjs";
import { VR_UI_SCALES } from "../work/test-build/xr-ui-style.mjs";

const settings = {
  mode: "add",
  radius: 0.22,
  strength: 0.35,
  hardness: 0,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
function fixture(port) {
  const layers = new IndependentLayers(createBaseProject(new SDFVolume(17), settings)),
    shape = new ShapePreviewModel(layers.project.activeLayerId);
  let state = { ...settings },
    mode = "sculpt",
    busy = false;
  const tools = new EditorToolState({
      layers: () => layers,
      shape,
      settings: () => state,
      setSettings: (v) => (state = v),
      mode: () => mode,
      selectTool: (t) => {
        mode = t === "transform" ? "translate" : "sculpt";
      },
      selectTransform: (m) => (mode = m),
      busy: () => busy,
      changed() {},
    }),
    model = new XRMenuModel(tools, port);
  model.setRequest("tool-wheel");
  model.activate("world");
  return { layers, tools, model, setBusy: (v) => (busy = v), dispose: () => layers.dispose() };
}
const centre = (b) => [b.rect.x + b.rect.width / 2, b.rect.y + b.rect.height / 2];
function canvas() {
  const previous = globalThis.document;
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => canvasContext() }),
  };
  return () => (globalThis.document = previous);
}
class Session extends EventTarget {
  environmentBlendMode = "alpha-blend";
  async end() {
    this.dispatchEvent(new Event("end"));
  }
}
function sessionHarness(ar = true) {
  const requests = [];
  const scene = new Scene(),
    rig = new XRSceneRig(scene, new PerspectiveCamera()),
    controller = new XRSessionController(
      { async setSession() {} },
      {
        prepare: () => rig.enter([], controller.activeEnvironment),
        restore: () => rig.exit(),
        changed() {},
      },
    );
  return {
    scene,
    rig,
    controller,
    requests,
    xr: {
      async isSessionSupported(mode) {
        return mode === "immersive-vr" || ar;
      },
      requestSession(mode) {
        requests.push(mode);
        return Promise.resolve(new Session());
      },
    },
  };
}

test("six exact presets, neutral defaults and strict versioned display extension", () => {
  assert.deepEqual(
    STUDIO_BACKGROUNDS.map((p) => p.colour),
    ["#808080", "#292D35", "#536D8C", "#B7A08A", "#101114", "#87998A"],
  );
  const d = new LayerDisplayPreferences();
  assert.deepEqual(d.world, defaultWorldSettings());
  assert(!("world" in d.snapshot("p", [])));
  for (const world of [
    null,
    [],
    {},
    { ...defaultWorldSettings(), version: 2 },
    { ...defaultWorldSettings(), studioBackground: "custom" },
    { ...defaultWorldSettings(), groundGrid: 1 },
    { ...defaultWorldSettings(), skybox: "true" },
  ])
    assert.throws(() => validateWorldSettings(world));
  assert.throws(() =>
    validateProjectDisplay({ mode: "clay", colours: {}, world: { version: 2 } }, []),
  );
});
test("legacy projects restore Neutral Grey and hidden grid after another project had custom preferences", () => {
  const f = fixture();
  try {
    const legacy = openSculptProject(saveSculptProject(f.layers.project));
    const d = new LayerDisplayPreferences();
    d.world = { version: 1, studioBackground: "black", groundGrid: true };
    d.restore(legacy.id, legacy.layerStack.layers, legacy.displayPreferences);
    assert.deepEqual(d.world, defaultWorldSettings());
  } finally {
    f.dispose();
  }
});
test("every swatch and grid survive native and actual recovery encoding with no sculpt/history mutation", async () => {
  const f = fixture(),
    oldWorker = globalThis.Worker;
  globalThis.Worker = RecoveryBrowserWorker;
  try {
    const values = f.layers.active.volume.values.slice(),
      source = saveSculptProject(f.layers.project),
      mesher = f.layers.active.mesher,
      transform = structuredClone(f.layers.active.layer.transform);
    f.model.activate("world:background");
    for (const p of STUDIO_BACKGROUNDS) {
      f.model.activate(`background:${p.id}`);
      if (!f.layers.display.world.groundGrid) f.model.activate("ground-grid");
      f.model.activate("skybox");
      const display = f.layers.display.snapshot(
          f.layers.project.id,
          f.layers.project.layerStack.layers,
        ),
        saved = saveSculptProject(f.layers.project, display),
        opened = openSculptProject(saved),
        restored = new LayerDisplayPreferences();
      restored.restore(opened.id, opened.layerStack.layers, opened.displayPreferences);
      assert.deepEqual(restored.world, f.layers.display.world);
      const recovery = await encodeRecovery(
        f.layers,
        settings,
        display,
        undefined,
        new AbortController().signal,
        () => true,
      );
      assert.deepEqual(recovery.data, saved);
      assert(!("environment" in display.world));
    }
    assert.deepEqual(saveSculptProject(f.layers.project), source);
    assert.deepEqual(f.layers.active.volume.values, values);
    assert.deepEqual(f.layers.active.layer.transform, transform);
    assert.equal(f.layers.active.mesher, mesher);
    assert.equal(f.layers.undoCount, 0);
    assert.equal(f.layers.redoCount, 0);
  } finally {
    globalThis.Worker = oldWorker;
    f.dispose();
  }
});
test("Studio updates immediately, passthrough stays transparent and desktop retains the latest preset", () => {
  const scene = new Scene(),
    desktop = new Color("#abcdef");
  scene.background = desktop;
  const rig = new XRSceneRig(scene, new PerspectiveCamera());
  try {
    rig.enter();
    for (const p of STUDIO_BACKGROUNDS) {
      rig.applyWorldSettings({ version: 1, studioBackground: p.id, groundGrid: true });
      assert.equal(scene.background.getHexString(), p.colour.slice(1).toLowerCase());
      assert(rig.groundGrid.visible);
    }
    rig.exit();
    assert.equal(scene.background.getHexString(), "87998a");
    assert(!rig.groundGrid.visible);
    rig.enter([], "passthrough");
    for (const p of STUDIO_BACKGROUNDS) {
      rig.applyWorldSettings({ version: 1, studioBackground: p.id, groundGrid: true });
      assert.equal(scene.background, null);
      assert(!rig.groundGrid.visible);
    }
    rig.exit();
    rig.enter();
    assert.equal(scene.background.getHexString(), "87998a");
  } finally {
    rig.exit();
    rig.dispose();
  }
});
test("desktop presets fill the background with Skybox Off and survive VR/AR round trips", () => {
  const scene = new Scene(),
    rig = new XRSceneRig(scene, new PerspectiveCamera());
  try {
    let background;
    for (const preset of STUDIO_BACKGROUNDS) {
      const world = { ...defaultWorldSettings(), studioBackground: preset.id, skybox: false };
      rig.applyWorldSettings(world);
      assert.equal(scene.background.getHexString(), preset.colour.slice(1).toLowerCase());
      assert.equal(rig.skybox.mesh.visible, false);
      if (background) assert.equal(scene.background, background);
      background = scene.background;
      rig.enter([], "studio");
      assert.equal(scene.background, background);
      assert.equal(rig.skybox.mesh.visible, false);
      rig.exit();
      assert.equal(scene.background, background);
      rig.enter([], "passthrough");
      rig.applyWorldSettings(world);
      assert.equal(scene.background, null);
      assert.equal(rig.skybox.mesh.visible, false);
      rig.exit();
      assert.equal(scene.background, background);
      rig.applyWorldSettings({ ...world, skybox: true });
      assert.equal(scene.background, background);
      assert(rig.skybox.mesh.visible);
      rig.applyWorldSettings(world);
      assert.equal(rig.skybox.mesh.visible, false);
    }
    // A setting changed during XR must also be visible immediately after exit.
    rig.enter([], "studio");
    rig.applyWorldSettings({
      ...defaultWorldSettings(),
      studioBackground: "warm-studio",
      skybox: false,
    });
    rig.exit();
    assert.equal(scene.background.getHexString(), "b7a08a");
    rig.enter([], "passthrough");
    rig.applyWorldSettings({ ...defaultWorldSettings(), studioBackground: "black", skybox: false });
    assert.equal(scene.background, null);
    rig.exit();
    assert.equal(scene.background.getHexString(), "101114");
  } finally {
    rig.exit();
    rig.dispose();
  }
});

test("grid belongs to workspace, follows navigation, ignores rays and never affects framing or export sources", () => {
  const f = fixture(),
    scene = new Scene(),
    rig = new XRSceneRig(scene, new PerspectiveCamera());
  try {
    rig.sculptureRoot.add(f.layers.group);
    const bounds = rig.visibleBounds().clone(),
      sources = f.layers.exportSources();
    rig.applyWorldSettings({ ...defaultWorldSettings(), groundGrid: true });
    rig.enter();
    rig.placeFirstView({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
    assert.equal(rig.groundGrid.parent, rig.workspaceRoot);
    assert(!rig.sculptureRoot.children.includes(rig.groundGrid));
    assert(rig.visibleBounds().min.distanceTo(bounds.min) < 1e-12);
    assert(rig.visibleBounds().max.distanceTo(bounds.max) < 1e-12);
    assert(sources.every((source) => source.current()));
    assert.deepEqual(
      f.layers.exportSources().map(({ current, ...source }) => source),
      sources.map(({ current, ...source }) => source),
    );
    const before = rig.groundGrid.getWorldPosition(new Vector3());
    rig.workspaceRoot.position.x += 1;
    rig.workspaceRoot.updateMatrixWorld(true);
    assert(Math.abs(rig.groundGrid.getWorldPosition(new Vector3()).x - before.x - 1) < 1e-8);
    assert.deepEqual(new Raycaster().intersectObject(rig.groundGrid), []);
    assert(rig.groundGrid.material.transparent);
    assert.equal(rig.groundGrid.material.depthWrite, false);
    rig.applyWorldSettings(defaultWorldSettings());
    assert(!rig.groundGrid.visible);
  } finally {
    rig.exit();
    rig.dispose();
    f.dispose();
  }
});
test("GLB/STL geometry and mesh inventory stay identical with visible skybox and grid", async () => {
  installFileReader();
  const f = fixture(),
    rig = new XRSceneRig(new Scene(), new PerspectiveCamera());
  try {
    rig.sculptureRoot.add(f.layers.group);
    const before = await encodeExport(f.layers.exportSources(), "fast", 256 * 1024 ** 2);
    const stlBefore = await encodeSTL(f.layers.exportSources(), "fast", 256 * 1024 ** 2, 100);
    rig.applyWorldSettings({
      version: 1,
      studioBackground: "warm-studio",
      groundGrid: true,
      skybox: true,
    });
    rig.enter();
    f.model.activate("world:background");
    f.model.activate("background:black");
    f.model.activate("ground-grid");
    const after = await encodeExport(f.layers.exportSources(), "fast", 256 * 1024 ** 2);
    assert.deepEqual(after.data, before.data);
    const stlAfter = await encodeSTL(f.layers.exportSources(), "fast", 256 * 1024 ** 2, 100);
    assert.deepEqual(stlAfter.data, stlBefore.data);
    const loaded = await readGlb(after.data);
    loaded.scene.traverse((o) => {
      assert(!o.isLineSegments);
      assert(!o.name.includes("ground"));
      if (o.isMesh) o.geometry.dispose();
    });
  } finally {
    rig.exit();
    rig.dispose();
    f.dispose();
  }
});
test("world sections and all hit targets have bounded, disjoint large controls for every active tool", () => {
  const f = fixture();
  try {
    for (const tool of EDITOR_TOOLS) {
      f.tools.select(tool.id);
      for (const section of ["home", "environment", "background", "guides", "preferences"]) {
        f.model.page = "world";
        f.model.world.section = section;
        const content = f.model.content(),
          rects = content.buttons.filter((b) => b.rect);
        for (const b of rects) {
          const r = b.rect;
          assert(r.width >= 140 && r.height >= 74);
          assert(r.x >= 0 && r.y >= 0 && r.x + r.width <= MENU_SIZE && r.y + r.height < 1040);
          assert.equal(f.model.hit(...centre(b)), b.id);
          for (const other of rects) {
            if (b === other) continue;
            const s = other.rect;
            assert(
              r.x + r.width <= s.x ||
                s.x + s.width <= r.x ||
                r.y + r.height <= s.y ||
                s.y + s.height <= r.y,
              `${b.id}/${other.id}`,
            );
          }
        }
        assert.equal(
          content.buttons.filter((b) => b.swatch).length,
          section === "background" ? 6 : 0,
        );
      }
    }
  } finally {
    f.dispose();
  }
});
test("world uses shared scaled ray placement, neutral-trigger arming and closes with existing menu request", () => {
  const restore = canvas(),
    f = fixture(),
    view = new XRMenuView(f.model);
  try {
    view.place({ x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
    const tool = {
      connectionId: 4,
      role: "tool",
      connected: true,
      tracked: true,
      gripTracked: true,
      buttons: { trigger: { pressed: true, rawValue: 1, justPressed: true } },
    };
    for (const [size, factor] of Object.entries(VR_UI_SCALES)) {
      f.layers.display.vrUiScale = size;
      view.close();
      view.update("tool-wheel", tool, undefined, 0, true);
      f.model.activate("world");
      f.model.activate("world:background");
      view.update("tool-wheel", tool, undefined, 200, true);
      const b = f.model.content().buttons.find((b) => b.id === "background:soft-blue"),
        [x, y] = centre(b);
      view.mesh.updateMatrixWorld(true);
      const q = view.mesh.getWorldQuaternion(new Quaternion()),
        p = new Vector3((x / MENU_SIZE - 0.5) * 0.72, (0.5 - y / MENU_SIZE) * 0.72, 0)
          .applyMatrix4(view.mesh.matrixWorld)
          .addScaledVector(new Vector3(0, 0, 1).applyQuaternion(q), 0.7),
        pose = new Matrix4().compose(p, q, new Vector3(1, 1, 1));
      f.layers.display.world.studioBackground = "neutral-grey";
      view.update("tool-wheel", tool, pose, 400, true);
      assert.equal(f.layers.display.world.studioBackground, "neutral-grey");
      tool.buttons.trigger = { pressed: false, rawValue: 0, justPressed: false };
      view.update("tool-wheel", tool, pose, 416, true);
      assert.equal(f.model.hover, b.id);
      assert(view.cursor.visible);
      tool.buttons.trigger = { pressed: true, rawValue: 1, justPressed: true };
      view.update("tool-wheel", tool, pose, 432, true);
      assert.equal(f.layers.display.world.studioBackground, "soft-blue");
      assert.equal(view.mesh.scale.x, factor);
      assert(Math.abs(view.mesh.position.z + 1.05) < 1e-8);
    }
    view.update(null, tool, undefined, 500, true);
    assert(!view.active);
    assert(!view.mesh.visible);
    assert.equal(f.layers.undoCount, 0);
  } finally {
    view.dispose();
    f.dispose();
    restore();
  }
});
test("mirror and snap share existing state across tools; busy controls reject changes", () => {
  const f = fixture();
  try {
    f.model.activate("world:guides");
    f.model.activate("world-mirror");
    assert(f.layers.symmetry.enabled);
    f.model.activate("world-axis");
    assert.equal(f.layers.symmetry.axis, "y");
    f.model.activate("world-offset-plus");
    assert.equal(f.layers.symmetry.offset, 0.05);
    f.model.activate("snap-toggle");
    assert.equal(f.tools.path.snap, 15);
    const before = structuredClone(f.layers.symmetry);
    f.setBusy(true);
    for (const id of ["world-mirror", "world-axis", "world-offset-minus", "snap-toggle"])
      f.model.activate(id);
    assert.deepEqual(f.layers.symmetry, before);
    assert.equal(f.tools.path.snap, 15);
    assert.equal(f.layers.undoCount, 0);
  } finally {
    f.dispose();
  }
});
test("environment menu uses existing exit path and requires fresh Enter; selected background survives AR round trip", async () => {
  const h = sessionHarness(),
    f = fixture({
      session: () => h.controller,
      diagnostics: () => true,
      toggleDiagnostics() {},
      performance: () => false,
      togglePerformance() {},
    });
  try {
    await h.controller.check(true, h.xr);
    h.rig.applyWorldSettings({
      version: 1,
      studioBackground: "soft-blue",
      groundGrid: true,
      skybox: true,
    });
    await h.controller.enter();
    f.model.activate("world:environment");
    assert(f.model.content().buttons.find((b) => b.id === "environment:studio").selected);
    f.model.activate("environment:passthrough");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.controller.state, "ready");
    assert.deepEqual(h.requests, ["immersive-vr"]);
    await h.controller.enter();
    assert.equal(h.scene.background, null);
    assert.equal(h.rig.skybox.mesh.visible, false);
    h.rig.applyWorldSettings({
      version: 1,
      studioBackground: "soft-blue",
      groundGrid: true,
      skybox: true,
    });
    assert.equal(h.scene.background, null);
    assert.equal(h.rig.skybox.mesh.visible, false);
    await h.controller.select("studio");
    assert.deepEqual(h.requests, ["immersive-vr", "immersive-ar"]);
    await h.controller.enter();
    assert.equal(h.scene.background.getHexString(), "536d8c");
    assert(h.rig.groundGrid.visible);
    assert(h.rig.skybox.mesh.visible);
  } finally {
    await h.controller.dispose();
    h.rig.dispose();
    f.dispose();
  }
});
test("unsupported passthrough is disabled with reason and cannot exit Studio or request AR", async () => {
  const h = sessionHarness(false),
    f = fixture({
      session: () => h.controller,
      diagnostics: () => false,
      toggleDiagnostics() {},
      performance: () => false,
      togglePerformance() {},
    });
  try {
    await h.controller.check(true, h.xr);
    await h.controller.enter();
    f.model.activate("world:environment");
    const b = f.model.content().buttons.find((b) => b.id === "environment:passthrough");
    assert(b.disabled);
    assert(b.detail.includes("unavailable"));
    f.model.activate(b.id);
    assert.equal(h.controller.state, "presenting");
    assert.deepEqual(h.requests, ["immersive-vr"]);
  } finally {
    await h.controller.dispose();
    h.rig.dispose();
    f.dispose();
  }
});
test("preferences wire existing diagnostics, performance and UI scale without history", () => {
  let diagnostics = true,
    performance = false;
  const h = sessionHarness(),
    f = fixture({
      session: () => h.controller,
      diagnostics: () => diagnostics,
      toggleDiagnostics: () => (diagnostics = !diagnostics),
      performance: () => performance,
      togglePerformance: () => (performance = !performance),
    });
  try {
    f.model.activate("world:preferences");
    f.model.activate("world-diagnostics");
    f.model.activate("world-performance");
    f.model.activate("world-ui-scale");
    assert(!diagnostics);
    assert(performance);
    assert.equal(f.layers.display.vrUiScale, "large");
    assert.equal(f.layers.undoCount, 0);
    f.model.activate("tools");
    assert.equal(f.model.page, "tool-wheel");
  } finally {
    f.dispose();
    h.rig.dispose();
  }
});

test("Default is midway between former Normal and Large; retired Small files migrate and never re-save Small", () => {
  assert.deepEqual(VR_UI_SCALES, { normal: 1.25, large: 1.35 });
  const f = fixture();
  try {
    for (const size of ["small", "normal", "large"]) {
      const legacy = saveSculptProject(f.layers.project, {
        mode: "clay",
        colours: {},
        vrUiScale: size === "small" ? "large" : size,
      });
      if (size === "small") {
        const bytes = new Uint8Array(legacy),
          needle = new TextEncoder().encode('"vrUiScale":"large"'),
          offset = Buffer.from(bytes).indexOf(needle);
        assert(offset >= 0);
        bytes.set(new TextEncoder().encode('"vrUiScale":"small"'), offset);
      }
      const opened = openSculptProject(legacy),
        restored = new LayerDisplayPreferences();
      restored.restore(opened.id, opened.layerStack.layers, opened.displayPreferences);
      assert.equal(restored.vrUiScale, size === "large" ? "large" : "normal");
      const saved = restored.snapshot(opened.id, opened.layerStack.layers);
      assert.equal(saved.vrUiScale, size === "large" ? "large" : undefined);
    }
  } finally {
    f.dispose();
  }
});
test("World Large UI toggle is selected only when on, toggles back to Default, and respects busy guards", () => {
  const f = fixture();
  try {
    f.model.activate("world:preferences");
    const button = () => f.model.content().buttons.find((b) => b.id === "world-ui-scale");
    assert.equal(button().label, "Large UI · Off");
    assert(!button().selected);
    f.model.activate("world-ui-scale");
    assert.equal(button().label, "Large UI · On");
    assert(button().selected);
    assert.equal(f.layers.display.vrUiScale, "large");
    f.setBusy(true);
    f.model.activate("world-ui-scale");
    assert.equal(f.layers.display.vrUiScale, "large");
    f.setBusy(false);
    f.model.activate("world-ui-scale");
    assert.equal(f.layers.display.vrUiScale, "normal");
    assert(!button().selected);
    assert.equal(f.layers.undoCount, 0);
  } finally {
    f.dispose();
  }
});

test("Skybox XR toggle starts On, is ray hittable and busy guarded without history", () => {
  const f = fixture();
  try {
    f.model.activate("world:background");
    let button = f.model.content().buttons.find((b) => b.id === "skybox");
    assert.equal(button.label, "Skybox · On");
    assert.equal(button.selected, true);
    assert.equal(f.model.hit(...centre(button)), "skybox");
    f.model.activate("skybox");
    button = f.model.content().buttons.find((b) => b.id === "skybox");
    assert.equal(button.selected, false);
    assert.equal(button.label, "Skybox · Off");
    f.setBusy(true);
    f.model.activate("skybox");
    assert.equal(f.layers.display.world.skybox, false);
    f.setBusy(false);
    f.model.activate("skybox");
    assert.equal(f.layers.display.world.skybox, true);
    // Missing legacy field must display On and switch Off on the first click.
    delete f.layers.display.world.skybox;
    assert(f.model.content().buttons.find((b) => b.id === "skybox").selected);
    f.model.activate("skybox");
    assert.equal(f.layers.display.world.skybox, false);
    assert.equal(f.layers.undoCount, 0);
    assert.equal(f.layers.redoCount, 0);
  } finally {
    f.dispose();
  }
});

test("desktop Skybox defaults On with grey preset, persists Off and syncs external changes", () => {
  const previous = globalThis.document;
  const elements = [];
  globalThis.document = {
    createElement(tag) {
      const element = {
        tag,
        children: [],
        append(...children) {
          this.children.push(...children);
        },
        setAttribute(k, v) {
          this[k] = v;
        },
      };
      elements.push(element);
      return element;
    },
  };
  let display = new LayerDisplayPreferences(),
    busy = false;
  try {
    const ui = worldSettingsUI(
      () => display,
      { append() {} },
      () => busy,
    );
    const toggle = elements.find((e) => e["aria-label"] === "Skybox");
    const preset = elements.find((e) => e["aria-label"] === "Studio background");
    assert.equal(toggle.checked, true);
    assert.equal(preset.value, "neutral-grey");
    toggle.checked = false;
    toggle.onchange();
    assert.equal(display.snapshot("p", []).world.skybox, false);
    busy = true;
    ui.sync();
    assert(toggle.disabled);
    toggle.checked = true;
    toggle.onchange();
    assert.equal(display.world.skybox, false);
    busy = false;
    display = new LayerDisplayPreferences();
    ui.sync();
    assert.equal(toggle.checked, true);
    assert.equal(toggle.disabled, false);
  } finally {
    globalThis.document = previous;
  }
});

test("skybox On/Off survives native/recovery; legacy defaults On with no native version bump", async () => {
  const f = fixture(),
    oldWorker = globalThis.Worker;
  globalThis.Worker = RecoveryBrowserWorker;
  try {
    const baseline = saveSculptProject(f.layers.project);
    const restored = new LayerDisplayPreferences();
    for (const on of [false, true]) {
      f.layers.display.world.skybox = on;
      const display = f.layers.display.snapshot(
        f.layers.project.id,
        f.layers.project.layerStack.layers,
      );
      const saved = saveSculptProject(f.layers.project, display);
      if (on) assert.equal(display.world, undefined);
      else assert.equal(display.world.skybox, false);
      assert.equal(
        new DataView(saved).getUint32(8, true),
        new DataView(baseline).getUint32(8, true),
      );
      const recovery = await encodeRecovery(
        f.layers,
        settings,
        display,
        undefined,
        new AbortController().signal,
        () => true,
      );
      const opened = openSculptProject(recovery.data);
      restored.restore(opened.id, opened.layerStack.layers, opened.displayPreferences);
      assert.equal(restored.world.skybox, on);
    }
    for (const legacy of [
      undefined,
      {
        mode: "clay",
        colours: {},
        world: { version: 1, studioBackground: "neutral-grey", groundGrid: false },
      },
    ]) {
      restored.world.skybox = false;
      restored.restore("legacy", [], legacy);
      assert.equal(restored.world.skybox, true);
      assert.equal(restored.world.studioBackground, "neutral-grey");
    }
    assert.deepEqual(saveSculptProject(f.layers.project), baseline);
  } finally {
    globalThis.Worker = oldWorker;
    f.dispose();
  }
});

test("skybox horizon uses per-eye world directions through yaw/pitch/roll, ignores translations/workspace and clipping", () => {
  const scene = new Scene(),
    camera = new PerspectiveCamera(70, 1, 0.01, 2),
    rig = new XRSceneRig(scene, camera);
  try {
    const sky = rig.skybox;
    rig.applyWorldSettings({ ...defaultWorldSettings(), skybox: true });
    assert(sky.mesh.visible); // desktop preview
    for (const name of ["ground", "zenith", "haze"]) {
      const colour = sky.material.uniforms[name].value;
      assert.equal(colour.r, colour.g);
      assert.equal(colour.g, colour.b);
    }
    assert.equal(sky.mesh.parent, scene);
    assert.equal(sky.mesh.frustumCulled, false);
    assert.equal(sky.material.depthTest, false);
    assert.equal(sky.material.depthWrite, false);
    assert.equal(sky.material.toneMapped, false);
    assert.match(sky.material.vertexShader, /mat3\(viewToWorld\)/);
    assert.match(sky.material.fragmentShader, /normalize\(worldRay\).y/);
    assert.match(sky.material.vertexShader, /gl_Position = vec4\(position.xy, 1.0, 1.0\)/);
    for (const rotation of [
      [0, 0, 0],
      [0.6, 1.4, 0.8],
      [-1.1, -2.8, -0.9],
    ]) {
      camera.rotation.set(...rotation);
      camera.position.set(40, 70, -30);
      camera.updateMatrixWorld(true);
      rig.workspaceRoot.rotation.set(1, 2, 3);
      rig.workspaceRoot.scale.setScalar(0.01);
      sky.mesh.onBeforeRender(null, scene, camera);
      const inverse = sky.material.uniforms.inverseProjection.value;
      const viewToWorld = sky.material.uniforms.viewToWorld.value;
      for (const elevation of [-0.5, 0, 0.5]) {
        const world = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        world.y = 0;
        world.normalize();
        world.y = elevation;
        world.normalize();
        const view = world.clone().applyQuaternion(camera.quaternion.clone().invert());
        // Reconstruct the exact shader ray from its projected coordinates.
        const projected = view.clone().applyMatrix4(camera.projectionMatrix);
        const ray = new Vector3(projected.x, projected.y, 1)
          .applyMatrix4(inverse)
          .transformDirection(viewToWorld);
        assert(view.z < 0);
        assert(Math.abs(ray.y - world.y) < 1e-10);
      }
    }
    assert.deepEqual(new Raycaster().intersectObject(sky.mesh), []);
    assert.equal(rig.visibleBounds().isEmpty(), true);
  } finally {
    rig.dispose();
  }
});

test("all presets/grid combinations retain model depth and AR alpha; repeated sessions reuse one disposable skybox", () => {
  const scene = new Scene(),
    rig = new XRSceneRig(scene, new PerspectiveCamera());
  const sky = rig.skybox,
    geometry = sky.geometry,
    material = sky.material,
    uniforms = material.uniforms;
  const disposals = [];
  geometry.addEventListener("dispose", () => disposals.push("geometry"));
  material.addEventListener("dispose", () => disposals.push("material"));
  let blend = "opaque";
  const clears = [],
    noop = () => {};
  const renderer = {
    getRenderTarget: () => null,
    outputColorSpace: "srgb",
    xr: { getEnvironmentBlendMode: () => blend },
    autoClear: true,
    clear: noop,
  };
  const background = WebGLBackground(
    renderer,
    {},
    {},
    {
      buffers: {
        color: { setClear: (...args) => clears.push(args), setMask: noop },
        depth: { setTest: noop, setMask: noop },
      },
    },
    {},
    true,
    true,
  );
  try {
    for (const preset of STUDIO_BACKGROUNDS)
      for (const grid of [false, true])
        for (const on of [false, true]) {
          const world = { version: 1, studioBackground: preset.id, groundGrid: grid, skybox: on };
          rig.applyWorldSettings(world);
          rig.enter([], "studio");
          assert.equal(sky.mesh.visible, on);
          assert.equal(rig.groundGrid.visible, grid);
          assert.equal(
            material.uniforms.ground.value.getHexString(),
            preset.colour.slice(1).toLowerCase(),
          );
          assert.equal(scene.background.getHexString(), preset.colour.slice(1).toLowerCase());
          blend = "opaque";
          background.render(scene);
          assert.equal(clears.at(-1)[3], 1);
          rig.exit();
          rig.enter([], "passthrough");
          rig.applyWorldSettings(world);
          assert.equal(sky.mesh.visible, false);
          assert.equal(scene.background, null);
          assert.equal(rig.groundGrid.visible, false);
          blend = "alpha-blend";
          background.render(scene);
          assert.equal(clears.at(-1)[3], 0);
          rig.exit();
          assert.equal(sky.mesh.visible, on);
          assert.equal(sky.geometry, geometry);
          assert.equal(sky.material, material);
          assert.equal(sky.material.uniforms, uniforms);
          assert.equal(scene.children.filter((o) => o === sky.mesh).length, 1);
        }
    assert.deepEqual(disposals, []);
  } finally {
    background.dispose();
    rig.dispose();
  }
  assert.deepEqual(disposals, ["geometry", "material"]);
  assert.equal(sky.mesh.parent, null);
});
