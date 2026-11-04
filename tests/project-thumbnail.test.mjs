import assert from "node:assert/strict";
import test from "node:test";
import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
} from "three";
import { captureProjectThumbnail } from "../work/test-build/project-thumbnail.mjs";
import { defaultWorldSettings } from "../work/test-build/world-settings.mjs";
import { XRSceneRig } from "../work/test-build/xr-scene.mjs";

function fixture({ xr = false, readFailure = false, encodedSize = 80 } = {}) {
  const previous = globalThis.document,
    source = new Group(),
    visible = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()),
    hidden = new Mesh(new BoxGeometry(20, 20, 20), new MeshBasicMaterial());
  hidden.visible = false;
  source.add(visible, hidden);
  const originalTarget = { id: "user-target" },
    state = {
      target: originalTarget,
      enabled: true,
      clear: "#123456",
      alpha: 0.4,
      rendered: 0,
      disposed: 0,
      quality: [],
    };
  const context = {
    createImageData(width, height) {
      return { data: new Uint8ClampedArray(width * height * 4) };
    },
    putImageData() {},
    drawImage() {},
  };
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, "canvas");
      const canvas = {
        width: 0,
        height: 0,
        getContext() {
          return context;
        },
        toDataURL(type, quality) {
          state.quality.push([type, quality]);
          const length = Math.ceil(encodedSize * (canvas.width / 256) * (1 - quality * 0.1));
          return `data:${type};base64,${"A".repeat(length)}`;
        },
      };
      return canvas;
    },
  };
  const renderer = {
    xr: { isPresenting: xr, enabled: true },
    getRenderTarget: () => state.target,
    getClearColor(target) {
      return target.set(state.clear);
    },
    getClearAlpha: () => state.alpha,
    setRenderTarget(target) {
      state.target = target;
    },
    setClearColor(colour, alpha) {
      state.clear = new Color(colour).getStyle();
      state.alpha = alpha;
    },
    clear() {},
    render(scene, camera) {
      state.rendered++;
      assert.equal(scene.children[0].children.length, 1);
      assert(Number.isFinite(camera.position.x));
    },
    readRenderTargetPixels(_target, _x, _y, _w, _h, pixels) {
      if (readFailure) throw new Error("GPU unavailable");
      pixels.fill(180);
    },
  };
  return {
    renderer,
    source,
    state,
    restore() {
      globalThis.document = previous;
      source.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) object.material.dispose();
      });
    },
  };
}

test("thumbnail capture is clean, bounded, deterministic and restores renderer target and state", async () => {
  const f = fixture();
  try {
    const result = await captureProjectThumbnail(f.renderer, f.source);
    assert.match(result, /^data:image\/webp;base64,/);
    assert(result.length <= 32768);
    assert.equal(f.state.rendered, 1);
    assert.equal(f.state.target.id, "user-target");
    assert.equal(f.renderer.xr.enabled, true);
    assert.equal(f.state.clear, "rgb(18,52,86)");
    assert.equal(f.state.alpha, 0.4);
    assert.equal(f.source.children.length, 2);
    assert(f.state.quality.length > 0);
  } finally {
    f.restore();
  }
});
test("thumbnail compression downsizes and lowers quality until it fits the 32 KiB metadata cap", async () => {
  const f = fixture({ encodedSize: 40000 });
  try {
    const result = await captureProjectThumbnail(f.renderer, f.source);
    assert(result);
    assert(result.length <= 32768);
    assert(f.state.quality.length > 1);
  } finally {
    f.restore();
  }
});
test("thumbnail capture failure falls back without disturbing renderer state and supports XR through async readback", async () => {
  const failed = fixture({ readFailure: true });
  try {
    assert.equal(await captureProjectThumbnail(failed.renderer, failed.source), undefined);
    assert.equal(failed.state.target.id, "user-target");
    assert.equal(failed.renderer.xr.enabled, true);
  } finally {
    failed.restore();
  }
  const f = fixture({ xr: true });
  let restoredBeforeResolve = false;
  try {
    f.renderer.readRenderTargetPixelsAsync = async (_target, _x, _y, _w, _h, pixels) => {
      await Promise.resolve();
      restoredBeforeResolve = f.state.target.id === "user-target" && f.renderer.xr.enabled === true;
      pixels.fill(180);
      return pixels;
    };
    const result = await captureProjectThumbnail(f.renderer, f.source);
    assert(result);
    assert(restoredBeforeResolve);
    assert.equal(f.state.rendered, 1);
    assert.equal(f.state.target.id, "user-target");
    assert.equal(f.renderer.xr.enabled, true);
    assert.equal(f.source.children.length, 2);
  } finally {
    f.restore();
  }
});

test("Studio skybox stays outside thumbnail capture and survives it unchanged", async () => {
  const f = fixture(),
    scene = new Scene(),
    rig = new XRSceneRig(scene, new PerspectiveCamera());
  try {
    rig.sculptureRoot.add(f.source);
    rig.applyWorldSettings({ ...defaultWorldSettings(), skybox: true });
    rig.enter();
    const material = rig.skybox.material;
    const render = f.renderer.render;
    f.renderer.render = (thumbnailScene, camera) => {
      thumbnailScene.traverse((object) => {
        assert.notEqual(object, rig.skybox.mesh);
        assert.notEqual(object.material, material);
        assert(!object.name.includes("skybox"));
      });
      render(thumbnailScene, camera);
    };
    assert(await captureProjectThumbnail(f.renderer, f.source));
    assert(rig.skybox.mesh.visible);
    assert.equal(rig.skybox.mesh.parent, scene);
    assert.equal(rig.skybox.material, material);
  } finally {
    rig.exit();
    rig.dispose();
    f.restore();
  }
});
