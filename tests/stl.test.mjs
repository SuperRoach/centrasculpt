import assert from "node:assert/strict";
import test from "node:test";
import { BoxGeometry, Group } from "three";
import { RecoveryBrowserWorker } from "../scripts/fixtures/node-recovery-worker.mjs";
import { ExportWork } from "../work/test-build/export-mesh.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { encodeRecovery } from "../work/test-build/recovery-client.mjs";
import { createMeshReference, validateReferences } from "../work/test-build/reference-images.mjs";
import { ReferenceView } from "../work/test-build/reference-view.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { parseSTL, STL_LIMITS } from "../work/test-build/stl.mjs";
import { encodeSTL, validatePrintMesh } from "../work/test-build/stl-export.mjs";
import { identityTransform } from "../work/test-build/transform.mjs";

const budget = 256 * 1024 ** 2;
function source(geometry = new BoxGeometry(2, 1, 1)) {
  const g = geometry.toNonIndexed();
  return {
    name: "part",
    step: 0.1,
    transform: identityTransform(),
    chunks: [{ positions: g.attributes.position.array, normals: g.attributes.normal.array }],
  };
}
const ascii =
  "solid test\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid test";
const text = (s) => new TextEncoder().encode(s);
test("ASCII STL parses scientific notation and exact triangle coordinates", () => {
  assert.deepEqual(
    [...parseSTL(text(ascii.replace("vertex 1", "vertex 1e0")))],
    [0, 0, 0, 1, 0, 0, 0, 1, 0],
  );
});
for (const [name, value] of Object.entries({
  empty: "",
  missingEnd: ascii.replace("endsolid test", ""),
  extra: ascii + "\ngarbage",
  nan: ascii.replace("vertex 1", "vertex NaN"),
  overflow: ascii.replace("vertex 1", "vertex 1e99"),
  missingVertex: ascii.replace("vertex 0 1 0\n", ""),
  missingFacet: ascii.replace("endfacet", "oops"),
}))
  test(`malformed ASCII ${name} rejected`, () => assert.throws(() => parseSTL(text(value))));
test("STL byte and binary count bounds reject before large allocation", () => {
  assert.throws(() => parseSTL(new Uint8Array(STL_LIMITS.bytes + 1)));
  const b = new Uint8Array(84);
  new DataView(b.buffer).setUint32(80, 0xffffffff, true);
  assert.throws(() => parseSTL(b));
});
test("binary triangle bytes, exact millimetres and transformed bounds roundtrip", async () => {
  const s = source();
  s.transform = { position: [12, -3, 2], rotation: [0, 0, Math.PI / 2], scale: [2, 2, 2] };
  const r = await encodeSTL([s], "fast", budget, 100);
  assert.deepEqual(r.report.dimensions, [50, 100, 50]);
  assert.equal(r.report.triangles, 12);
  assert.equal(r.data.byteLength, 684);
  const p = parseSTL(new Uint8Array(r.data));
  assert.equal(p.length, 108);
  const v = new DataView(r.data);
  assert.equal(v.getUint32(80, true), 12);
  assert.equal(v.getFloat32(96, true), p[0]);
  assert.equal(v.getUint16(132, true), 0);
  assert.deepEqual(r.report.blocking, []);
  assert.equal(r.report.boundaryEdges, 0);
});
test("binary solid-prefixed header is binary; truncation and nonfinite normals rejected", async () => {
  const r = await encodeSTL([source()], "fast", budget, 10),
    b = new Uint8Array(r.data);
  b.set(text("solid"));
  assert.equal(parseSTL(b).length, 108);
  assert.throws(() => parseSTL(b.slice(0, -1)));
  new DataView(b.buffer).setFloat32(84, NaN, true);
  assert.throws(() => parseSTL(b));
});
test("open, inverted, degenerate, nonmanifold and disjoint fixtures", async () => {
  const box = source().chunks[0].positions;
  assert.equal((await validatePrintMesh(box)).components, 1);
  assert((await validatePrintMesh(box.slice(9))).boundaryEdges > 0);
  const reversed = box.slice();
  for (let i = 0; i < reversed.length; i += 9)
    for (let a = 0; a < 3; a++)
      [reversed[i + 3 + a], reversed[i + 6 + a]] = [reversed[i + 6 + a], reversed[i + 3 + a]];
  assert.equal((await validatePrintMesh(reversed)).invertedComponents, 1);
  const duplicate = new Float32Array(box.length + 9);
  duplicate.set(box);
  duplicate.set(box.slice(0, 9), box.length);
  assert((await validatePrintMesh(duplicate)).nonManifoldEdges > 0);
  assert.equal((await validatePrintMesh(new Float32Array(9))).degenerateTriangles, 1);
  const two = new Float32Array(box.length * 2);
  two.set(box);
  two.set(
    box.map((v, i) => v + (i % 3 === 0 ? 5 : 0)),
    box.length,
  );
  assert.equal((await validatePrintMesh(two)).components, 2);
});
test("cancellation, quotas, invalid dimensions and no source mutation", async () => {
  const s = source(),
    before = s.chunks[0].positions.slice(),
    abort = new AbortController();
  abort.abort();
  await assert.rejects(encodeSTL([s], "fast", budget, 10, new ExportWork(abort.signal)), /cancel/);
  await assert.rejects(encodeSTL([s], "fast", 1, 10));
  for (const mm of [0, NaN, Infinity, 10001])
    await assert.rejects(encodeSTL([s], "fast", budget, mm));
  await encodeSTL([s], "standard", budget, 10);
  assert.deepEqual(s.chunks[0].positions, before);
});
const settings = {
  mode: "add",
  radius: 0.22,
  strength: 0.35,
  hardness: 0,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
test("mesh references native v9, legacy and recovery keep bytes/transforms without SDF mutation", async () => {
  const l = new IndependentLayers(createBaseProject(new SDFVolume(17), settings)),
    prior = globalThis.Worker;
  try {
    const old = saveSculptProject(l.project),
      before = l.active.volume.values.slice(),
      r = await encodeSTL([source()], "fast", budget, 100);
    l.display.references = [
      {
        ...createMeshReference(new Uint8Array(r.data), "part.stl", "mesh"),
        space: "sculpture",
        rotation: [0.2, 0.3, 0.4],
        size: 2,
        wireframe: true,
      },
    ];
    const display = l.display.snapshot(l.project.id, l.project.layerStack.layers),
      data = saveSculptProject(l.project, display);
    assert.equal(new DataView(data).getUint32(8, true), 9);
    assert.deepEqual(openSculptProject(data).displayPreferences.references, l.display.references);
    assert(openSculptProject(old));
    globalThis.Worker = RecoveryBrowserWorker;
    const recovery = await encodeRecovery(
      l,
      settings,
      display,
      undefined,
      new AbortController().signal,
      () => true,
    );
    assert.deepEqual(
      openSculptProject(recovery.data).displayPreferences.references,
      l.display.references,
    );
    assert.deepEqual(l.active.volume.values, before);
    assert.equal(l.undoCount, 0);
    assert.equal(l.exportSources().length, 1);
  } finally {
    globalThis.Worker = prior;
    l.dispose();
  }
});
test("reference rendering, selection, appearance, anchors and disposal", async () => {
  const data = await encodeSTL([source()], "fast", budget, 100),
    r = createMeshReference(new Uint8Array(data.data), "part.stl", "m"),
    records = [r],
    w = new Group(),
    s = new Group(),
    view = new ReferenceView(() => records, w, s);
  try {
    view.sync();
    const panel = view.panels.get("m");
    assert(panel.mesh.visible);
    view.selected = "m";
    view.editing = true;
    r.locked = false;
    r.wireframe = true;
    r.opacity = 0.4;
    view.sync();
    assert(panel.border.visible);
    assert(panel.mesh.material.wireframe);
    assert.equal(panel.mesh.material.opacity, 0.4);
    view.switchSpace(r);
    assert.equal(panel.mesh.parent, view.sculpture);
    let disposed = 0;
    panel.mesh.geometry.addEventListener("dispose", () => disposed++);
    records.length = 0;
    view.sync();
    assert.equal(disposed, 1);
    assert.equal(view.selected, null);
  } finally {
    view.dispose();
  }
});

import { ExportBrowserWorker } from "../scripts/fixtures/node-export-worker.mjs";
import { EditorToolState } from "../work/test-build/editor-tool-state.mjs";
import { exportGlbAsync } from "../work/test-build/export-client.mjs";
import { ShapePreviewModel } from "../work/test-build/shape-preview.mjs";
import { XRWorldMenu } from "../work/test-build/xr-world-menu.mjs";

test("actual STL worker publishes reports, keeps source buffers and rejects stale sources", async () => {
  const prior = globalThis.Worker;
  globalThis.Worker = ExportBrowserWorker;
  try {
    const s = source(),
      p = s.chunks[0].positions.slice();
    const result = await exportGlbAsync([s], "fast", { stlMM: 42 });
    assert.equal(result.backend, "worker");
    assert.deepEqual(result.report.dimensions, [42, 21, 21]);
    assert.deepEqual(s.chunks[0].positions, p);
    s.current = () => false;
    await assert.rejects(exportGlbAsync([s], "fast", { stlMM: 42 }), /source changed/);
  } finally {
    globalThis.Worker = prior;
  }
});
test("SDF sphere is watertight; transformed grouped sources preserve physical shape and references are excluded", async () => {
  const l = new IndependentLayers(createBaseProject(new SDFVolume(17), settings));
  try {
    const a = l.active.layer,
      g = l.createGroup("Assembly");
    l.reparent(a.id, g);
    l.selectGroup(g);
    l.setActiveTransform({ position: [5, 2, -1], rotation: [0, 0, Math.PI / 2], scale: [2, 2, 2] });
    l.select(a.id);
    const s = l.exportSources("visible", false);
    assert.deepEqual(s[0].transform.position, [5, 2, -1]);
    assert.deepEqual(s[0].transform.scale, [2, 2, 2]);
    const r = await encodeSTL(s, "standard", budget, 80);
    assert.equal(r.report.boundaryEdges, 0);
    assert.equal(r.report.nonManifoldEdges, 0);
    assert.equal(r.report.inconsistentEdges, 0);
    assert.deepEqual(r.report.blocking, []);
    assert(Math.abs(Math.max(...r.report.dimensions) - 80) < 1e-4);
    const before = r.data;
    l.display.references = [
      createMeshReference(
        new Uint8Array((await encodeSTL([source()], "fast", budget, 100)).data),
        "excluded.stl",
        "ref",
      ),
    ];
    assert.deepEqual(
      (await encodeSTL(l.exportSources("visible", false), "standard", budget, 80)).data,
      before,
    );
  } finally {
    l.dispose();
  }
});
test("SDF Boolean output is freshly evaluated and independent of source history", async () => {
  const l = new IndependentLayers(createBaseProject(new SDFVolume(17), settings));
  try {
    const a = l.active.layer,
      b = await l.duplicateAsync(a.id);
    l.setActiveTransform({ position: [0.4, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
    const undo = l.undoCount,
      values = a.volume.values.slice();
    await l.composite.flush();
    const result = await encodeSTL(l.composite.exportSources(), "standard", budget, 100);
    assert.equal(result.report.boundaryEdges, 0);
    assert.equal(result.report.components, 1);
    assert.deepEqual(result.report.blocking, []);
    assert.equal(l.undoCount, undo);
    assert.deepEqual(a.volume.values, values);
    assert(b);
  } finally {
    l.dispose();
  }
});
test("VR print routing exposes separate GLB/STL actions and nonoverlapping targets", async () => {
  const l = new IndependentLayers(createBaseProject(new SDFVolume(17), settings));
  let called = null;
  try {
    const shape = new ShapePreviewModel(l.project.activeLayerId),
      tools = new EditorToolState({
        layers: () => l,
        shape,
        settings: () => settings,
        setSettings() {},
        mode: () => "sculpt",
        selectTool() {},
        busy: () => false,
        changed() {},
      }),
      menu = new XRWorldMenu(tools, {
        projectAction: async (a) => {
          called = a;
        },
      });
    menu.section = "project";
    const buttons = menu.content().buttons;
    assert(buttons.some((b) => b.id === "project:export"));
    assert(buttons.some((b) => b.id === "project:print"));
    for (const a of buttons)
      for (const b of buttons)
        if (a !== b)
          assert(
            a.rect.x + a.rect.width <= b.rect.x ||
              b.rect.x + b.rect.width <= a.rect.x ||
              a.rect.y + a.rect.height <= b.rect.y ||
              b.rect.y + b.rect.height <= a.rect.y,
          );
    menu.activate("project:print");
    assert.equal(called, "print");
  } finally {
    l.dispose();
  }
});
test("binary triangle quota and reference aggregate quotas are explicit", () => {
  const bytes = new Uint8Array(84 + 100001 * 50);
  new DataView(bytes.buffer).setUint32(80, 100001, true);
  assert.throws(() => parseSTL(bytes), /triangle limit/);
  const r = createMeshReference(text(ascii), "one.stl", "one");
  assert.throws(() =>
    validateReferences(Array.from({ length: 7 }, (_, i) => ({ ...r, id: String(i) }))),
  );
  assert.throws(() => validateReferences([{ ...r, wireframe: "yes" }]));
});
