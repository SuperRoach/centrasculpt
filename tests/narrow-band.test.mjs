import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import {
  AnalyticField,
  BandCache,
  brickCoords,
  brickKey,
  bricksIn,
  capsule,
  publishStroke,
  stageStroke,
} from "../scripts/research/narrow-band.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import {
  compressPersonalShape,
  encodePersonalShape,
  PersonalShapeLibrary,
  unpackPersonalShape,
} from "../work/test-build/personal-shapes.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { exportShapeBackup, previewShapeBackup } from "../work/test-build/shape-backup.mjs";

test("numeric keys keep negative ownership, exact halos and signed nonmetric far fields", () => {
  assert.deepEqual(brickCoords(brickKey(-256, 255, -1)), [-256, 255, -1]);
  assert.throws(() => [...bricksIn([-2049, 0, 0], [0, 0, 0])], /limit/);
  const exact = (x) => (x < 0 ? -23 : 17);
  for (const width of [2, 3, 4]) {
    const cache = new BandCache(width, 1, exact);
    for (const key of bricksIn([-24, -8, -8], [23, 7, 7]))
      cache.install(key, cache.entry(key, exact));
    assert.equal(cache.read(-20, 0, 0, false), -width);
    assert.equal(cache.read(20, 0, 0, false), width);
    for (let x = -3; x <= 2; x++) assert.equal(cache.read(x, 0, 0, false), exact(x));
    // Deep-inside subtract and far-outside union both depend on magnitude.
    assert.equal(Math.max(cache.read(-20, 0, 0), -10), -10);
    assert.notEqual(Math.max(cache.read(-20, 0, 0, false), -10), -10);
    assert.equal(Math.min(cache.read(20, 0, 0), 8), 8);
    assert.notEqual(Math.min(cache.read(20, 0, 0, false), 8), 8);
  }
});

test("bounded swept Add, Subtract and Smooth agree with the production dense brush", () => {
  const field = new AnalyticField();
  const segment = capsule([-19, -3, 0], [21, 4, 0], 5.25);
  const keys = field.append(segment);
  const read = (x, y, z) => field.read(x, y, z);
  const cache = new BandCache(3, 1, read, true);
  for (const key of keys) cache.install(key, cache.entry(key, read));
  const a = [-6, 0, 5],
    b = [6, 0, 5];
  const initial = Float32Array.from({ length: 65 ** 3 }, (_, i) =>
    field.brute((i % 65) - 32, (Math.floor(i / 65) % 65) - 32, Math.floor(i / 65 ** 2) - 32),
  );
  const dense = new SDFVolume(65, 32, false);
  const point = ([x, y, z]) => ({ x, y, z });
  function compare(values) {
    for (let i = 0; i < values.length; i++) {
      const x = (i % 65) - 32,
        y = (Math.floor(i / 65) % 65) - 32,
        z = Math.floor(i / 65 ** 2) - 32;
      assert.equal(read(x, y, z), values[i]);
      assert.equal(cache.read(x, y, z), values[i]);
    }
  }
  for (const mode of ["add", "subtract", "smooth"]) {
    dense.values.set(initial);
    dense.brush(point(b), 6, mode, 0.5, undefined, 0, false, 1, point(a));
    const patch = stageStroke(field, cache, a, b, mode);
    assert.throws(() => stageStroke(field, cache, a, b, mode, 0), /budget/);
    compare(initial);
    publishStroke(field, cache, patch);
    compare(dense.values);
    // Stage again against already edited pages, then undo in reverse order.
    const previous = dense.values.slice();
    const second = stageStroke(field, cache, a, b, mode);
    dense.brush(point(b), 6, mode, 0.5, undefined, 0, false, 1, point(a));
    publishStroke(field, cache, second);
    compare(dense.values);
    publishStroke(field, cache, second, true);
    compare(previous);
    publishStroke(field, cache, patch, true);
    compare(initial);
    publishStroke(field, cache, patch);
    compare(previous);
    publishStroke(field, cache, patch, true);
  }
});

test("constructive stroke stages, allocates and removes previously absent bricks", () => {
  const field = new AnalyticField();
  const cache = new BandCache(4, 1, (x, y, z) => field.read(x, y, z), true);
  const patch = stageStroke(field, cache, [-21, 5, 2], [-15, 5, 2], "construct");
  assert.equal(cache.entries.size, 0);
  assert.equal(field.read(-18, 5, 2), 12);
  publishStroke(field, cache, patch);
  assert.equal(field.read(-18, 5, 2), -6);
  assert.equal(cache.read(-18, 5, 2, false), -6);
  assert(cache.entries.size > 0);
  publishStroke(field, cache, patch, true);
  assert.equal(cache.entries.size, 0);
  assert.equal(field.edits.size, 0);
  publishStroke(field, cache, patch);
  assert.equal(field.read(-18, 5, 2), -6);
});

test("native and gzip Personal Shape backup preserve the exact source alongside a derived cache", async () => {
  globalThis.createImageBitmap = async () => ({ width: 128, height: 128, close() {} });
  const volume = new SDFVolume(25);
  const corner = volume.index(24, 24, 24);
  volume.values[corner] = Math.fround(3.13159);
  const project = createBaseProject(volume, {
    mode: "add",
    radius: 0.22,
    strength: 0.35,
    hardness: 0.5,
    camera: { position: [2, 2, 3], target: [0, 0, 0] },
  });
  const native = saveSculptProject(project);
  const read = (x, y, z) =>
    volume.values[volume.index(...[x, y, z].map((n) => Math.max(0, Math.min(24, n))))];
  const cache = new BandCache(2, volume.step, read);
  for (const key of bricksIn([0, 0, 0], [24, 24, 24])) cache.install(key, cache.entry(key, read));
  const captured = encodePersonalShape(
    project,
    project.activeLayer,
    "8.3b disposable",
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=",
    [85, 85, 85],
    50,
    "base",
  );
  const packed = await compressPersonalShape(captured.record, captured.data);
  assert.equal(packed.record.encoding, "gzip");
  const source = new PersonalShapeLibrary(new IDBFactory(), "83b-source");
  const target = new PersonalShapeLibrary(new IDBFactory(), "83b-target");
  try {
    await source.put(packed.record, packed.data, null);
    const preview = await previewShapeBackup(await exportShapeBackup(source));
    assert.equal((await target.restore(preview)).imported, 1);
    const stored = await target.read(packed.record.id);
    assert.deepEqual(stored.data, packed.data);
    assert.equal(stored.record.pivot, "base");
    assert.deepEqual(stored.record.dimensionsMM, [85, 85, 85]);
    assert.equal(stored.record.millimetresPerUnit, 50);
    assert.deepEqual(await unpackPersonalShape(stored.record, stored.data), captured.data);
    assert.deepEqual((await target.master(packed.record.id)).layer.volume.values, volume.values);
    assert.deepEqual(openSculptProject(native).activeLayer.volume.values, volume.values);
    assert.equal(cache.read(24, 24, 24), volume.values[corner]);
    assert.notEqual(cache.read(24, 24, 24, false), volume.values[corner]);
  } finally {
    source.close();
    target.close();
  }
});
