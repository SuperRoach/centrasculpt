import assert from "node:assert/strict";
import test from "node:test";
import { Box3, BoxGeometry, Color, Group, Mesh, Vector3, Vector4 } from "three";
import { startAgentBridge } from "../scripts/agent-bridge.mjs";
import { isWrite, validateCall } from "../scripts/agent-schemas.mjs";
import { createHeadlessEditor } from "../scripts/headless-enclosure.mjs";
import {
  captureScenePreview,
  previewCamera,
  previewDirections,
} from "../work/test-build/agent-preview.mjs";
import { saveSculptProject } from "../work/test-build/project.mjs";

const job = (args = {}) => ({
  name: "capture_scene_preview",
  args,
  id: "x",
  deadline: Date.now() + 1000,
});
const signal = () => new AbortController().signal;

test("preview viewpoints frame translated tiny/large measured bounds at portrait and landscape aspects", () => {
  for (const scale of [0.0001, 1, 10000])
    for (const [width, height] of [
      [64, 512],
      [512, 64],
      [384, 384],
    ])
      for (const view of Object.keys(previewDirections)) {
        const bounds = new Box3(
          new Vector3(-2, -1, -3).multiplyScalar(scale),
          new Vector3(4, 5, 6).multiplyScalar(scale),
        );
        const centre = bounds.getCenter(new Vector3());
        const camera = previewCamera(bounds, width, height, view);
        assert(
          camera
            .getWorldDirection(new Vector3())
            .dot(new Vector3(...previewDirections[view]).normalize()) < -0.99999,
        );
        for (const x of [bounds.min.x, bounds.max.x])
          for (const y of [bounds.min.y, bounds.max.y])
            for (const z of [bounds.min.z, bounds.max.z]) {
              const point = new Vector3(x, y, z).project(camera);
              assert(Math.abs(point.x) < 1 && Math.abs(point.y) < 1 && Math.abs(point.z) < 1);
            }
        assert(centre.clone().project(camera).length() < 1);
      }
  assert.throws(() => previewCamera(new Box3(), 64, 64, "front"), /Empty/);
});

test("capture schema is strict, bounded, read-only and excludes UI/reference/target inputs", () => {
  assert.equal(isWrite("capture_scene_preview"), false);
  for (const args of [
    { width: 513 },
    { height: 0 },
    { width: 64.1 },
    { width: NaN },
    { viewpoint: "bottom" },
    { objectIds: ["x"] },
    { includeReferences: true },
    { selector: "canvas" },
    { maxBytes: 1 },
  ])
    assert.throws(() => validateCall({ name: "capture_scene_preview", args }));
  assert.equal(validateCall({ name: "capture_scene_preview", args: {} }).args.width, 384);
});

function rendererMock() {
  const state = {
    target: null,
    colour: new Color("red"),
    alpha: 0.25,
    viewport: new Vector4(2, 3, 40, 50),
    scissor: new Vector4(1, 2, 10, 12),
    scissorTest: true,
    scenes: [],
    reads: 0,
    disposed: 0,
    lost: false,
  };
  return Object.assign(state, {
    xr: { isPresenting: false },
    getContext: () => ({ isContextLost: () => state.lost }),
    getRenderTarget: () => state.target,
    setRenderTarget: (t) => {
      state.target = t;
      if (t) t.addEventListener("dispose", () => state.disposed++);
    },
    getClearColor: (c) => c.copy(state.colour),
    getClearAlpha: () => state.alpha,
    setClearColor: (c, a) => {
      state.colour.set(c);
      state.alpha = a;
    },
    getViewport: (v) => v.copy(state.viewport),
    setViewport: (v) => state.viewport.copy(v),
    getScissor: (v) => v.copy(state.scissor),
    setScissor: (v) => state.scissor.copy(v),
    getScissorTest: () => state.scissorTest,
    setScissorTest: (v) => (state.scissorTest = v),
    clear: () => {},
    render: (scene, camera) => {
      state.scenes.push({ scene, camera, meshes: scene.children[0].children.slice() });
    },
    readRenderTargetPixels: (_target, _x, _y, _w, _h, pixels) => {
      state.reads++;
      pixels.fill(127);
    },
  });
}
function canvasMock(encode = (cb) => cb(new Blob([new Uint8Array(64)], { type: "image/png" }))) {
  const canvases = [];
  globalThis.document = {
    createElement: () => {
      const c = {
        width: 0,
        height: 0,
        getContext: () => ({
          createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          putImageData: () => {},
        }),
        toBlob: encode,
      };
      canvases.push(c);
      return c;
    },
  };
  return canvases;
}
async function fixture() {
  const { layers, api } = createHeadlessEditor();
  const made = await api.execute(
    {
      type: "primitive.create",
      unit: "mm",
      source: { kind: "box", width: 20, height: 20, depth: 20 },
    },
    { expectedRevision: api.revision },
  );
  assert(made.ok);
  for (const l of layers.project.layerStack.layers) layers.runtime(l.id).rebuild();
  layers.syncPresentation();
  return { layers, api };
}

test("model capture preserves native bytes, history, selection, materials, geometry and renderer state", async () => {
  const { layers } = await fixture();
  const renderer = rendererMock(),
    canvases = canvasMock();
  try {
    const before = saveSculptProject(layers.project),
      history = layers.undoCount,
      selected = layers.active.layer.id;
    const result = await captureScenePreview(
      renderer,
      () => layers,
      () => false,
      job(),
      signal(),
    );
    assert(result.ok, JSON.stringify(result));
    assert.equal(result.value.geometry, "committed-source-surfaces");
    assert.equal(result.value.width, 384);
    assert.equal(result.value.bytes, 64);
    assert.equal(result.blob.type, "image/png");
    assert.equal(result.value.revision, layers.modellingRevision);
    assert.equal(renderer.reads, 1);
    assert.equal(renderer.disposed, 1);
    assert.equal(renderer.target, null);
    assert.equal(renderer.colour.getHexString(), "ff0000");
    assert.equal(renderer.alpha, 0.25);
    assert(renderer.scissorTest);
    assert.deepEqual(renderer.viewport.toArray(), [2, 3, 40, 50]);
    assert.equal(layers.undoCount, history);
    assert.equal(layers.active.layer.id, selected);
    assert.deepEqual(saveSculptProject(layers.project), before);
    for (const mesh of renderer.scenes[0].meshes) {
      assert.equal(mesh.material.map, null);
      assert.equal(mesh.material.vertexColors, false);
      assert(mesh.geometry.getAttribute("position").count > 0);
    }
    assert(canvases.every((c) => c.width === 0 && c.height === 0));
  } finally {
    layers.dispose();
    delete globalThis.document;
  }
});

test("capture refuses busy, stale, XR, context loss, pending/unevaluated and resource inputs without rendering", async () => {
  const { layers } = await fixture();
  const r = rendererMock();
  canvasMock();
  const capture = (args = {}, blocked = false, s = signal()) =>
    captureScenePreview(
      r,
      () => layers,
      () => blocked,
      job(args),
      s,
    );
  try {
    assert.equal((await capture({}, true)).error.code, "busy");
    assert.equal((await capture({ expectedRevision: "stale" })).error.code, "stale_revision");
    assert.equal((await capture({ width: 1000 })).error.code, "invalid_input");
    r.xr.isPresenting = true;
    assert.equal((await capture()).error.code, "busy");
    r.xr.isPresenting = false;
    r.lost = true;
    assert.equal((await capture()).error.code, "context_lost");
    r.lost = false;
    const abort = new AbortController();
    abort.abort();
    assert.equal((await capture({}, false, abort.signal)).error.code, "cancelled");
    layers.project.layerStack.layers[1].booleanModifiers = [
      {
        id: "op",
        sourceId: layers.project.layerStack.layers[0].id,
        operation: "difference",
        enabled: true,
      },
    ];
    assert.equal((await capture()).error.code, "not_evaluated");
    layers.viewMode = "boolean";
    assert.equal((await capture()).error.code, "render_pending");
    assert.equal(r.reads, 0);
  } finally {
    layers.dispose();
    delete globalThis.document;
  }
});

test("encoding cancellation, deadline, project replacement and oversize free render targets and canvas", async () => {
  const { layers } = await fixture();
  const replacement = createHeadlessEditor().layers;
  try {
    for (const mode of ["cancel", "deadline", "replace", "oversize"]) {
      const renderer = rendererMock();
      let owner = layers;
      const controller = new AbortController();
      const canvases = canvasMock((cb) => {
        if (mode === "cancel") controller.abort();
        else if (mode === "replace") {
          owner = replacement;
          cb(new Blob(["png"], { type: "image/png" }));
        } else if (mode === "oversize")
          cb(new Blob([new Uint8Array(524289)], { type: "image/png" }));
      });
      const request = job();
      if (mode === "deadline") request.deadline = Date.now() + 20;
      const result = await captureScenePreview(
        renderer,
        () => owner,
        () => false,
        request,
        controller.signal,
      );
      assert.equal(result.ok, false);
      assert.equal(
        result.error.code,
        {
          cancel: "cancelled",
          deadline: "cancelled",
          replace: "stale_revision",
          oversize: "resource_limit",
        }[mode],
      );
      assert.equal(renderer.disposed, 1);
      assert(canvases.every((c) => !c.width && !c.height));
    }
  } finally {
    layers.dispose();
    replacement.dispose();
    delete globalThis.document;
  }
});

const headers = (b, browser = true) => ({
  Authorization: `Bearer ${browser ? b.browserToken : b.token}`,
  Origin: "http://127.0.0.1:5173",
  "Content-Type": "application/json",
});
const post = (b, path, data, browser = true) =>
  fetch(b.url + path, { method: "POST", headers: headers(b, browser), body: JSON.stringify(data) });
async function poll(b) {
  for (let i = 0; i < 100; i++) {
    const r = await (await post(b, "/poll", { client: "editor" })).json();
    if (r.job) return r.job;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw Error("no job");
}

test("binary preview route is exact-session read-only, bounded, separate from 64 KiB and revocation-safe", async () => {
  const b = await startAgentBridge();
  try {
    await post(b, "/approve", { client: "editor", editing: false });
    const pending = post(
      b,
      "/call",
      { name: "capture_scene_preview", args: { width: 384, height: 384 } },
      false,
    );
    const j = await poll(b);
    const png = Buffer.alloc(70000);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
    png.write("IHDR", 12);
    png.writeUInt32BE(384, 16);
    png.writeUInt32BE(384, 20);
    const upload = (bytes = png, query = `id=${j.id}&client=editor`, h = {}) =>
      fetch(`${b.url}/preview-image?${query}`, {
        method: "POST",
        headers: { ...headers(b), "Content-Type": "image/png", ...h },
        body: bytes,
      });
    assert.equal((await upload(png, `id=${j.id}&client=other`)).status, 403);
    assert.equal(
      (await upload(png, undefined, { Authorization: `Bearer ${b.token}` })).status,
      403,
    );
    assert.equal((await upload(png, undefined, { Origin: "https://evil.example" })).status, 403);
    assert.equal((await upload(Buffer.alloc(524289))).status, 413);
    assert.equal((await upload(Buffer.alloc(33))).status, 400);
    const concurrent = await Promise.all([upload(), upload()]);
    assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 403]);
    assert.equal((await upload()).status, 403);
    await post(b, "/result", {
      client: "editor",
      id: j.id,
      result: { ok: true, value: { bytes: 70000, width: 384, height: 384, mimeType: "image/png" } },
    });
    const result = await (await pending).json();
    assert(result.ok);
    assert.equal(Buffer.from(result.image.data, "base64").length, 70000);
    assert.equal(
      (await post(b, "/result", { client: "editor", id: j.id, result: "a".repeat(65537) })).status,
      413,
    );
    const next = post(b, "/call", { name: "capture_scene_preview", args: {} }, false);
    await poll(b);
    await post(b, "/revoke", { client: "editor" });
    assert.equal((await (await next).json()).ok, false);
    assert.equal((await upload()).status, 403);
  } finally {
    await b.close();
  }
});

test("capture uses actual evaluated Boolean subtraction and array display geometry with unchanged sources", async () => {
  const { layers, api } = createHeadlessEditor();
  const renderer = rendererMock();
  canvasMock();
  try {
    const r = await api.batch(
      [
        {
          as: "body",
          command: {
            type: "primitive.create",
            unit: "mm",
            source: { kind: "box", width: 30, height: 12, depth: 20 },
          },
        },
        {
          as: "hole",
          command: {
            type: "primitive.create",
            unit: "mm",
            source: { kind: "cylinder", diameter: 8, height: 20 },
          },
        },
        {
          command: {
            type: "boolean.create",
            id: "$body",
            sourceId: "$hole",
            operation: "difference",
          },
        },
        {
          command: {
            type: "array.create",
            id: "$body",
            unit: "mm",
            definition: {
              kind: "linear",
              enabled: true,
              count: 2,
              axis: [1, 0, 0],
              spacingModelUnits: 40,
              centered: false,
            },
          },
        },
      ],
      { expectedRevision: api.revision },
    );
    assert(r.ok, JSON.stringify(r));
    await layers.composite.flush();
    layers.composite.group.visible = true;
    const before = saveSculptProject(layers.project),
      history = layers.undoCount;
    const result = await captureScenePreview(
      renderer,
      () => layers,
      () => false,
      job({ viewpoint: "top" }),
      signal(),
    );
    assert(result.ok, JSON.stringify(result));
    assert.equal(result.value.geometry, "evaluated-live-display");
    assert(result.value.triangles > 100);
    assert(Math.abs(result.value.bounds.max[0] - result.value.bounds.min[0] - 0.7) < 0.01);
    const { Raycaster } = await import("three");
    const meshes = renderer.scenes[0].meshes;
    assert.equal(
      new Raycaster(new Vector3(0, 1, 0), new Vector3(0, -1, 0)).intersectObjects(meshes).length,
      0,
      "through-hole is empty, cutter shell excluded",
    );
    assert(
      new Raycaster(new Vector3(0.4, 1, 0), new Vector3(0, -1, 0)).intersectObjects(meshes).length >
        0,
      "second array copy actually rendered",
    );
    assert.deepEqual(saveSculptProject(layers.project), before);
    const body = layers.project.layerStack.layers.find((l) => l.array?.enabled);
    for (const args of [{ objectId: body.id }, { partId: body.id }]) {
      if (args.partId) body.assemblyPart = { clearanceMM: 0 };
      const scopedRenderer = rendererMock();
      const scopedBefore = saveSculptProject(layers.project);
      const captured = await captureScenePreview(
        scopedRenderer,
        () => layers,
        () => false,
        { ...job(args), deadline: Date.now() + 10000 },
        signal(),
      );
      assert(captured.ok, JSON.stringify(captured));
      assert.equal(captured.value.geometry, "independently-evaluated-scope");
      assert(Math.abs(captured.value.bounds.max[0] - captured.value.bounds.min[0] - 0.7) < 0.01);
      const isolatedMeshes = scopedRenderer.scenes[0].meshes;
      assert.equal(
        new Raycaster(new Vector3(0, 1, 0), new Vector3(0, -1, 0)).intersectObjects(isolatedMeshes)
          .length,
        0,
      );
      assert(
        new Raycaster(new Vector3(0.4, 1, 0), new Vector3(0, -1, 0)).intersectObjects(
          isolatedMeshes,
        ).length > 0,
      );
      assert.deepEqual(saveSculptProject(layers.project), scopedBefore);
      assert.equal(layers.undoCount, history);
    }
    assert.equal(layers.undoCount, history);
  } finally {
    layers.dispose();
    delete globalThis.document;
  }
});

test("hidden/empty surfaces, large scenes and render failures refuse and release resources", async () => {
  const { layers } = await fixture();
  canvasMock();
  try {
    for (const l of layers.project.layerStack.layers) l.visible = false;
    const r = rendererMock();
    assert.equal(
      (
        await captureScenePreview(
          r,
          () => layers,
          () => false,
          job(),
          signal(),
        )
      ).error.code,
      "empty_scene",
    );
    const source = layers.project.layerStack.layers[1];
    source.visible = true;
    const runtime = layers.runtime(source.id);
    const original = runtime.surface.group;
    const group = new Group(),
      geometry = new BoxGeometry();
    for (let i = 0; i < 4097; i++) group.add(new Mesh(geometry));
    runtime.surface.group = group;
    assert.equal(
      (
        await captureScenePreview(
          r,
          () => layers,
          () => false,
          job(),
          signal(),
        )
      ).error.code,
      "resource_limit",
    );
    runtime.surface.group = original;
    geometry.dispose();
    r.render = () => {
      throw Error("render_failed: driver failure");
    };
    const failed = await captureScenePreview(
      r,
      () => layers,
      () => false,
      job(),
      signal(),
    );
    assert.equal(failed.error.code, "render_failed");
    assert.equal(r.target, null);
    assert.equal(r.disposed, 1);
  } finally {
    layers.dispose();
    delete globalThis.document;
  }
});

test("isolated capture identifies the requested object, evaluates independently and refuses invalid parts", async () => {
  const { layers } = await fixture();
  canvasMock();
  const renderer = rendererMock();
  const id = layers.project.layerStack.layers.filter((l) => l.visible).at(-1).id;
  const result = await captureScenePreview(
    renderer,
    () => layers,
    () => false,
    job({ objectId: id }),
    signal(),
  );
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.value.scope, "isolated-object");
  assert.equal(result.value.object.id, id);
  assert.deepEqual(result.value.visibleSourceIds, [id]);
  const part = await captureScenePreview(
    renderer,
    () => layers,
    () => false,
    job({ partId: "part" }),
    signal(),
  );
  assert.equal(part.ok, false);
  layers.viewMode = "boolean";
  const evaluated = await captureScenePreview(
    renderer,
    () => layers,
    () => false,
    job({ objectId: id }),
    signal(),
  );
  assert.equal(evaluated.ok, true, JSON.stringify(evaluated));
  assert.equal(evaluated.value.geometry, "independently-evaluated-scope");
});
