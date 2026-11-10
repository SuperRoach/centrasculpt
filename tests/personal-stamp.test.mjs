import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { Vector3 } from "three";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import {
  compressPersonalShape,
  encodePersonalShape,
  PersonalShapeLibrary,
} from "../work/test-build/personal-shapes.mjs";
import { createPersonalStamp, personalStampSource } from "../work/test-build/personal-stamp.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { exportShapeBackup, previewShapeBackup } from "../work/test-build/shape-backup.mjs";
import { prepareShape } from "../work/test-build/shape-library.mjs";
import { StampClickGesture } from "../work/test-build/shape-placement.mjs";
import { ShapeGhost, ShapePreviewModel } from "../work/test-build/shape-preview.mjs";
import { prepareStamp } from "../work/test-build/shape-stamp.mjs";
import { defineShape, validateShapeDefinition } from "../work/test-build/shapes.mjs";
import { identityTransform, transformMatrix } from "../work/test-build/transform.mjs";

const settings = {
  mode: "add",
  radius: 0.22,
  strength: 0.35,
  hardness: 0.5,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=";
globalThis.createImageBitmap = async () => ({ width: 128, height: 128, close() {} });
function master(pivot = "centre") {
  const v = new SDFVolume(33, 1, false);
  for (let z = 0; z < 33; z++)
    for (let y = 0; y < 33; y++)
      for (let x = 0; x < 33; x++) {
        const a = v.coordinate(x),
          b = v.coordinate(y),
          c = v.coordinate(z);
        v.values[v.index(x, y, z)] = Math.max(
          Math.hypot(a, b, c) - 0.48,
          -(Math.hypot(a, c) - 0.14),
        );
      }
  const p = createBaseProject(v, settings);
  p.activeLayer.transform = {
    ...identityTransform(),
    position: [0, pivot === "base" ? 0.48 : 0, 0],
  };
  return p;
}
function definition(c, personal, operation = "add") {
  const size = personalStampSource(personal).size;
  return defineShape({
    kind: "box",
    personal,
    targetLayerId: c.project.activeLayerId,
    operation,
    dimensions: [size, size, size],
    transform: { position: [0.82, -0.1, 0.1], rotation: [0.2, 0.3, 0.4], scale: [0.7, 0.7, 0.7] },
  });
}
for (const pivot of ["centre", "base"])
  test(`restored .cshapes ${pivot} master stamps exact calibrated CSG, independent edits and Undo/Redo`, async () => {
    const source = new PersonalShapeLibrary(new IDBFactory(), `source-${pivot}`),
      target = new PersonalShapeLibrary(new IDBFactory(), `target-${pivot}`),
      p = master(pivot);
    const encoded = encodePersonalShape(p, p.activeLayer, "Hollow", png, [48, 48, 48], 50, pivot),
      packed = await compressPersonalShape(encoded.record, encoded.data);
    await source.put(packed.record, packed.data, null);
    await target.restore(await previewShapeBackup(await exportShapeBackup(source)));
    const a = await source.master(encoded.record.id),
      b = await target.master(encoded.record.id),
      saved = b.layer.volume.values.slice();
    const original = createPersonalStamp(a.layer, 0.5),
      restored = createPersonalStamp(b.layer, 0.5);
    for (const operation of ["add", "subtract"])
      for (const mirror of [false, true]) {
        const c = new IndependentLayers(createBaseProject(new SDFVolume(33), settings));
        try {
          c.symmetry = { enabled: mirror, axis: "x", offset: 0.15 };
          const d = definition(c, restored, operation),
            before = c.active.volume.values.slice(),
            shape = prepareShape(d),
            other = prepareShape({ ...d, personal: original }),
            inverse = transformMatrix(d.transform).invert(),
            point = new Vector3();
          for (let z = 0; z < 33; z += 3)
            for (let y = 0; y < 33; y += 3)
              for (let x = 0; x < 33; x += 3) {
                const p = {
                  x: c.active.volume.coordinate(x),
                  y: c.active.volume.coordinate(y),
                  z: c.active.volume.coordinate(z),
                };
                assert.equal(shape.sampleWorld(p), other.sampleWorld(p));
                point.set(p.x, p.y, p.z).applyMatrix4(inverse).multiplyScalar(2);
                const expected =
                  b.layer.volume.sampleWorld(
                    { x: point.x, y: point.y, z: point.z },
                    b.layer.transform,
                  ) *
                  0.5 *
                  0.7;
                assert(Math.abs(shape.sampleWorld(p) - expected) < 1e-12);
              }
          assert(c.stampShape(d), `${pivot} ${operation} mirror=${mirror}`);
          const after = c.active.volume.values.slice(),
            v = c.active.volume;
          for (let z = 0; z < 33; z++)
            for (let y = 0; y < 33; y++)
              for (let x = 0; x < 33; x++) {
                const p = { x: v.coordinate(x), y: v.coordinate(y), z: v.coordinate(z) },
                  s = Math.min(
                    shape.sampleWorld(p),
                    mirror ? shape.sampleWorld({ ...p, x: 0.3 - p.x }) : Infinity,
                  ),
                  i = v.index(x, y, z);
                assert.equal(
                  v.readVoxel(i),
                  Math.fround(
                    operation === "add" ? Math.min(before[i], s) : Math.max(before[i], -s),
                  ),
                );
              }
          assert.equal(c.undoCount, 1);
          c.undo();
          assert.deepEqual(c.active.volume.values, before);
          c.undo(true);
          assert.deepEqual(c.active.volume.values, after);
          c.beginStroke();
          c.applyStroke({ x: 0.82, y: 0, z: 0.1 }, 0.4, "add", 0.8, 0.1, 0.4);
          c.finishStroke();
          assert(
            c.active.volume.values.some((v, i) => v !== after[i]),
            "destination brush changed geometry",
          );
          assert.deepEqual((await target.master(encoded.record.id)).layer.volume.values, saved);
          assert.deepEqual(b.layer.volume.values, saved);
        } finally {
          c.dispose();
        }
      }
    source.close();
    target.close();
  });
test("immutable value snapshot, opaque capability validation, uniform dimensions and bounded preview replacement", () => {
  const p = master(),
    token = createPersonalStamp(p.activeLayer, 1),
    c = new IndependentLayers(createBaseProject(new SDFVolume(25), settings));
  try {
    const tracked = c.trackedBytes;
    c.personalStamp = token;
    assert.equal(c.trackedBytes - tracked, personalStampSource(token).bytes);
    c.personalStamp = undefined;
    assert.equal(c.trackedBytes, tracked);
    const d = definition(c, token),
      before = prepareShape(d).sampleWorld({ x: 0.1, y: 0.2, z: 0.3 });
    p.activeLayer.volume.values.fill(3);
    p.activeLayer.transform.position.fill(99);
    assert.equal(prepareShape(d).sampleWorld({ x: 0.1, y: 0.2, z: 0.3 }), before);
    assert.throws(() => validateShapeDefinition({ ...d, personal: { ...token } }), /unavailable/);
    assert.throws(() => validateShapeDefinition({ ...d, dimensions: [1, 2, 3] }), /uniform/);
    const model = new ShapePreviewModel(c.active.layer.id),
      ghost = new ShapeGhost(() => c.project.layerStack, model);
    model.set(d, c.project.layerStack);
    model.enabled = true;
    ghost.sync();
    assert.equal(ghost.stats.geometryBuilds, 1);
    ghost.sync();
    assert.equal(ghost.stats.geometryBuilds, 1);
    const click = new StampClickGesture();
    assert(click.begin(1, 0, 100, 100, d));
    d.transform.position[0] = 123;
    const captured = click.complete(1, 0, 100, 100, c.project.activeLayerId);
    assert.equal(captured.personal, token);
    assert.notEqual(captured.transform.position[0], 123);
    assert.throws(() => createPersonalStamp(master().activeLayer, 1, 0), /memory/);
    const next = createPersonalStamp(master("base").activeLayer, 1);
    model.set({ ...d, personal: next }, c.project.layerStack);
    ghost.sync();
    assert.equal(ghost.stats.geometryBuilds, 2);
    assert(ghost.cachedShapes <= 1);
    ghost.dispose();
    d.transform.position[0] = 0.82;
    const snapshot = c.active.volume.values.slice();
    assert.throws(() => prepareStamp(c.active.layer, { ...d, operation: "subtract" }, 0), /memory/);
    assert.deepEqual(c.active.volume.values, snapshot);
  } finally {
    c.dispose();
  }
});
test("personal repeated continuous patches pack one action and cancellation restores exact values", () => {
  const c = new IndependentLayers(createBaseProject(new SDFVolume(33), settings)),
    token = createPersonalStamp(master().activeLayer, 1),
    d = definition(c, token, "subtract"),
    before = c.active.volume.values.slice();
  try {
    c.beginStroke();
    c.stampShape(d, true);
    c.stampShape({ ...d, transform: { ...d.transform, position: [0.3, 0.2, 0.1] } }, true);
    c.finishStroke();
    const after = c.active.volume.values.slice();
    assert.equal(c.undoCount, 1);
    c.undo();
    assert.deepEqual(c.active.volume.values, before);
    c.undo(true);
    assert.deepEqual(c.active.volume.values, after);
    c.beginStroke();
    c.stampShape({ ...d, operation: "add" }, true);
    c.cancelStroke();
    assert.deepEqual(c.active.volume.values, after);
  } finally {
    c.dispose();
  }
});

test("expanded rectangular master preserves its lattice, saved orientation and uniform calibration", () => {
  const v = new SDFVolume(33, 1, false, { dimensions: [41, 33, 33], latticeMin: [-8, 0, 0] });
  for (let z = 0; z < 33; z++)
    for (let y = 0; y < 33; y++)
      for (let x = 0; x < 41; x++)
        v.values[v.index(x, y, z)] =
          Math.hypot(v.coordinate(x, 0) + 0.4, v.coordinate(y, 1), v.coordinate(z, 2)) - 0.35;
  const p = createBaseProject(v, settings);
  p.activeLayer.transform = {
    position: [0.2, -0.1, 0.3],
    rotation: [0.2, 0.3, -0.1],
    scale: [1.3, 1.3, 1.3],
  };
  const token = createPersonalStamp(p.activeLayer, 0.7),
    source = personalStampSource(token),
    d = defineShape({
      kind: "box",
      personal: token,
      targetLayerId: p.activeLayerId,
      operation: "subtract",
      dimensions: [source.size, source.size, source.size],
      transform: identityTransform(),
    }),
    shape = prepareShape(d),
    before = v.values.slice();
  for (let z = -2; z <= 2; z += 0.25)
    for (let y = -2; y <= 2; y += 0.25)
      for (let x = -2; x <= 2; x += 0.25) {
        const expected =
          v.sampleWorld({ x: x / 0.7, y: y / 0.7, z: z / 0.7 }, p.activeLayer.transform) * 0.7;
        assert(Math.abs(shape.sampleWorld({ x, y, z }) - expected) < 1e-12);
      }
  assert.deepEqual(v.values, before);
  assert.deepEqual(v.dimensions, [41, 33, 33]);
  assert.deepEqual(v.latticeMin, [-8, 0, 0]);
});
