import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import {
  capturePersonalShape,
  encodePersonalShape,
  PersonalShapeLibrary,
} from "../work/test-build/personal-shapes.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";

const settings = {
  mode: "add",
  radius: 0.22,
  strength: 0.35,
  hardness: 0.5,
  camera: { position: [2.4, 1.7, 3.3], target: [0, 0, 0] },
};
const create = () => new IndependentLayers(createBaseProject(new SDFVolume(25), settings));
const signal = () => new AbortController().signal;
const thumb = "data:image/png;base64,aA==";
test("organic master persists across database restart and two independent insertions/native round trip/Undo", async () => {
  const source = create(),
    v = source.project.activeLayer.volume;
  // Curved bent capsule, evaluated into actual sculpt samples.
  for (let z = 0; z < 25; z++)
    for (let y = 0; y < 25; y++)
      for (let x = 0; x < 25; x++) {
        const px = v.coordinate(x),
          py = v.coordinate(y),
          pz = v.coordinate(z);
        v.values[v.index(x, y, z)] =
          Math.hypot(px - 0.3 * Math.sin(py * 3), pz, Math.max(0, Math.abs(py) - 0.45)) - 0.28;
      }
  const original = v.values.slice(),
    layer = await capturePersonalShape(source.project, source.project.activeLayerId, signal());
  assert.deepEqual(layer.volume.values, original);
  assert.notEqual(layer.volume.values, v.values);
  const factory = new IDBFactory(),
    db = new PersonalShapeLibrary(factory, "acceptance");
  const { record, data } = encodePersonalShape(
    source.project,
    layer,
    "Curved organic",
    thumb,
    [50, 90, 40],
    100,
    "centre",
  );
  await db.put(record, data, null);
  db.close();
  const reopened = new PersonalShapeLibrary(factory, "acceptance");
  assert.equal((await reopened.shapes()).length, 1);
  const target = create(),
    history = target.undoCount;
  const a = await reopened.master(record.id),
    first = await target.insertPersonalShape(a.layer, 2, signal());
  const b = await reopened.master(record.id),
    second = await target.insertPersonalShape(b.layer, 2, signal());
  assert.equal(target.undoCount, history + 2);
  assert.deepEqual(first.transform.scale, [2, 2, 2]);
  target.undo();
  assert.equal(target.project.layerStack.layers.length, 2);
  target.undo(true);
  assert.equal(target.project.layerStack.layers.length, 3);
  target.select(first.id);
  target.beginStroke();
  target.applyStroke({ x: 0, y: 0, z: 0.55 }, 0.4, "add", 0.8, 0.1, 0.4);
  target.finishStroke();
  assert.notDeepEqual(first.volume.values, original);
  assert.deepEqual(second.volume.values, original);
  assert.deepEqual((await reopened.master(record.id)).layer.volume.values, original);
  assert.deepEqual(v.values, original);
  const loaded = openSculptProject(saveSculptProject(target.project));
  target.select(second.id);
  const { encodeSTL } = await import("../work/test-build/stl-export.mjs");
  const stl = await encodeSTL(target.exportSources("selected", false), "fast", 256 * 1024 ** 2, 90);
  assert(stl.data.byteLength > 84);
  assert.equal(stl.report.blocking.length, 0);
  assert(Math.abs(Math.max(...stl.report.dimensions) - 90) < 0.001);
  assert.deepEqual(loaded.layerStack.get(first.id).volume.values, first.volume.values);
  assert.deepEqual(loaded.layerStack.get(second.id).transform, second.transform);
  assert.deepEqual(loaded.layerStack.get(second.id).volume.values, original);
  await reopened.metadata(record.id, 1, { name: "Renamed" });
  assert.equal((await reopened.master(record.id)).layer.name, "Renamed");
  await assert.rejects(reopened.delete(record.id, 1), /changed/);
  await reopened.delete(record.id, 2);
  assert.equal((await reopened.shapes()).length, 0);
  source.dispose();
  target.dispose();
  reopened.close();
});
test("cancelled capture and insertion preserve project and Undo", async () => {
  const c = create(),
    abort = new AbortController();
  abort.abort();
  const count = c.undoCount;
  await assert.rejects(
    capturePersonalShape(c.project, c.project.activeLayerId, abort.signal),
    /cancelled/,
  );
  const master = await capturePersonalShape(c.project, c.project.activeLayerId, signal());
  await assert.rejects(c.insertPersonalShape(master, 1, abort.signal), /cancelled/);
  assert.equal(c.undoCount, count);
  assert.equal(c.project.layerStack.layers.length, 1);
  c.dispose();
});
test("storage quota, unavailable storage, damaged payload and independent Project Library", async () => {
  const c = create(),
    master = await capturePersonalShape(c.project, c.project.activeLayerId, signal()),
    factory = new IDBFactory();
  const { record, data } = encodePersonalShape(
    c.project,
    master,
    "Test",
    thumb,
    [1, 2, 3],
    100,
    "base",
  );
  const small = new PersonalShapeLibrary(factory, "small", 16);
  await assert.rejects(small.put(record, data, null), /limit/);
  assert.equal((await small.shapes()).length, 0);
  const db = new PersonalShapeLibrary(factory, "damage");
  await db.put(record, new ArrayBuffer(data.byteLength), null);
  await assert.rejects(db.master(record.id));
  const unavailable = new PersonalShapeLibrary(null);
  await assert.rejects(unavailable.shapes(), /unavailable/);
  db.close();
  small.close();
  c.dispose();
});

test("lossless gzip and checksum corruption refusal", async () => {
  const { compressPersonalShape } = await import("../work/test-build/personal-shapes.mjs");
  const c = create(),
    master = await capturePersonalShape(c.project, c.project.activeLayerId, signal());
  const encoded = encodePersonalShape(
    c.project,
    master,
    "Compressed",
    thumb,
    [1, 2, 3],
    100,
    "centre",
  );
  const packed = await compressPersonalShape(encoded.record, encoded.data);
  assert.equal(packed.record.encoding, "gzip");
  assert(packed.data.byteLength < encoded.data.byteLength);
  const db = new PersonalShapeLibrary(new IDBFactory(), "gzip");
  await db.put(packed.record, packed.data, null);
  assert.deepEqual((await db.master(encoded.record.id)).layer.volume.values, master.volume.values);
  const damaged = encoded.data.slice(0);
  new Uint8Array(damaged)[damaged.byteLength - 1] ^= 1;
  const corrupt = { ...encoded.record, id: "corrupt" };
  await db.put(corrupt, damaged, null);
  await assert.rejects(db.master("corrupt"), /integrity/);
  db.close();
  c.dispose();
});
test("evaluated Boolean hole excludes raw cutter and unrelated layers", async () => {
  const c = create();
  const root = await c.regeneratePrimitive({ kind: "box", width: 0.8, height: 0.8, depth: 0.5 });
  const cutter = await c.regeneratePrimitive({ kind: "cylinder", diameter: 0.3, height: 1.2 });
  c.setBooleanModifiers(root.id, [
    { id: "hole", sourceId: cutter.id, operation: "difference", enabled: true },
  ]);
  const layer = await capturePersonalShape(c.project, root.id, signal());
  assert(!layer.booleanModifiers);
  assert(layer.volume.sampleWorld({ x: 0, y: 0, z: 0 }) > 0);
  const db = new PersonalShapeLibrary(new IDBFactory(), "boolean");
  const { record, data } = encodePersonalShape(
    c.project,
    layer,
    "Hole",
    thumb,
    [80, 80, 50],
    100,
    "centre",
  );
  await db.put(record, data, null);
  const loaded = await db.master(record.id);
  assert.equal(
    loaded.layer.volume.sampleWorld({ x: 0, y: 0, z: 0 }),
    layer.volume.sampleWorld({ x: 0, y: 0, z: 0 }),
  );
  db.close();
  c.dispose();
});
test("memory admission and extreme calibration refuse atomically", async () => {
  const c = create(),
    master = await capturePersonalShape(c.project, c.project.activeLayerId, signal()),
    count = c.undoCount;
  c.backgroundBytes = 256 * 1024 ** 2;
  await assert.rejects(c.insertPersonalShape(master, 1, signal()), /memory|budget|busy/i);
  c.backgroundBytes = 0;
  await assert.rejects(c.insertPersonalShape(master, NaN, signal()), /calibration/);
  assert.equal(c.undoCount, count);
  assert.equal(c.project.layerStack.layers.length, 1);
  c.dispose();
});

test("raw cutters and standalone analytic cache substitutions are explicitly refused", async () => {
  const c = create(),
    root = await c.regeneratePrimitive({ kind: "box", width: 0.8, height: 0.8, depth: 0.5 }),
    cutter = await c.regeneratePrimitive({ kind: "cylinder", diameter: 0.3, height: 1.2 });
  await assert.rejects(capturePersonalShape(c.project, root.id, signal()), /analytic primitive/);
  c.setBooleanModifiers(root.id, [
    { id: "hole", sourceId: cutter.id, operation: "difference", enabled: true },
  ]);
  await assert.rejects(capturePersonalShape(c.project, cutter.id, signal()), /raw cutter/);
  c.dispose();
});

test("Boolean evaluation refuses detail beyond master capacity instead of reducing resolution", async () => {
  const c = create(),
    root = c.project.activeLayer,
    cutter = c.create(64);
  c.setActiveTransform({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [0.001, 0.001, 0.001] });
  c.setBooleanModifiers(root.id, [
    { id: "tiny-hole", sourceId: cutter.id, operation: "difference", enabled: true },
  ]);
  const count = c.undoCount,
    original = root.volume.values.slice();
  await assert.rejects(
    capturePersonalShape(c.project, root.id, signal()),
    /original detail|supported/,
  );
  assert.equal(c.undoCount, count);
  assert.deepEqual(root.volume.values, original);
  c.dispose();
});
