import assert from "node:assert/strict";
import test from "node:test";
import { PerspectiveCamera, Vector2, Vector3 } from "three";
import { prepareComposite } from "../work/test-build/compositor.mjs";
import {
  anchoredBoxPose,
  faceCorners,
  pickBoxFace,
  resizeFace,
} from "../work/test-build/face-resize.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { identityTransform, transformMatrix } from "../work/test-build/transform.mjs";

const box = { kind: "box", width: 0.8, height: 0.6, depth: 0.5 };
const pose = { position: [0.2, 0.1, -0.4], rotation: [0.3, 0.2, -0.4], scale: [1.4, 1.4, 1.4] };
const settings = {
  mode: "add",
  radius: 0.2,
  strength: 0.3,
  hardness: 0,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
const make = () => {
  const volume = new SDFVolume(17, 1.6, false);
  volume.values.fill(6.4);
  return new IndependentLayers(createBaseProject(volume, settings));
};
const assertCornersFixed = (source, matrix, next, nextMatrix, face) => {
  const opposite = { ...face, sign: -face.sign };
  const after = faceCorners(next, opposite);
  faceCorners(source, opposite).forEach((p, i) => {
    assert(p.applyMatrix4(matrix).distanceTo(after[i].applyMatrix4(nextMatrix)) < 1e-9);
  });
};

for (const axis of [0, 1, 2]) {
  for (const sign of [-1, 1]) {
    test(`local face ${axis}/${sign} moves alone under translation, rotation and uniform scale`, () => {
      const face = { axis, sign };
      const matrix = transformMatrix(pose);
      for (const delta of [-0.22, 0.17]) {
        const result = resizeFace(box, face, delta);
        const nextMatrix = transformMatrix(anchoredBoxPose(pose, face, result.delta));
        assertCornersFixed(box, matrix, result.source, nextMatrix, face);
        const normal = new Vector3().setComponent(axis, sign).transformDirection(matrix);
        const moved = faceCorners(result.source, face);
        faceCorners(box, face).forEach((p, i) => {
          const displacement = moved[i].applyMatrix4(nextMatrix).sub(p.applyMatrix4(matrix));
          assert(
            displacement.distanceTo(normal.clone().multiplyScalar(delta * pose.scale[0])) < 1e-9,
          );
        });
      }
    });
  }
}

test("snap applies to displacement and extreme drags honor primitive size and aspect limits", () => {
  const face = { axis: 1, sign: -1 };
  assert.equal(resizeFace(box, face, 0.02, 0.05).delta, 0);
  assert.equal(resizeFace(box, face, 0.12, 0.05).source.height, 0.7);
  assert.equal(resizeFace(box, face, -100).source.height, 0.1);
  assert.equal(resizeFace(box, face, 100).source.height, 4);
  assert.throws(() => resizeFace(box, face, NaN), /snap/);
});

test("screen hit testing finds all six source markers, including back faces", () => {
  const camera = new PerspectiveCamera(42, 1.25, 0.01, 100);
  camera.position.set(2.3, 1.9, 3.1);
  camera.lookAt(0.2, 0.1, -0.4);
  camera.updateMatrixWorld();
  const matrix = transformMatrix(pose);
  const screen = (v) => {
    const p = v.applyMatrix4(matrix).project(camera);
    return new Vector2((p.x + 1) * 500, (1 - p.y) * 400);
  };
  for (const axis of [0, 1, 2]) {
    for (const sign of [-1, 1]) {
      const face = { axis, sign };
      const corners = faceCorners(box, face);
      const hit = pickBoxFace(
        box,
        matrix,
        camera,
        1000,
        800,
        screen(corners[0].lerp(corners[2], 0.5)),
      );
      assert.deepEqual(hit?.face, face);
      assert(hit.pixelsPerUnit.length() > 10);
    }
  }
  const [a, b] = faceCorners(box, { axis: 1, sign: -1 });
  assert(pickBoxFace(box, matrix, camera, 1000, 800, screen(a.lerp(b, 0.5))));
  assert.equal(pickBoxFace(box, matrix, camera, 1000, 800, new Vector2(5, 5)), undefined);
});

test("grouped cutter keeps its opposite face fixed and its Boolean reference through atomic Undo/Redo", async () => {
  const l = make();
  try {
    const solid = await l.regeneratePrimitive(box);
    const slot = { kind: "box", width: 0.2, height: 0.3, depth: 0.65 };
    const cutter = await l.regeneratePrimitive(slot, undefined, undefined, {
      ...identityTransform(),
      position: [0, 0, 0.02],
    });
    l.setBooleanModifiers(solid.id, [
      { id: "slot", sourceId: cutter.id, operation: "difference", enabled: true },
    ]);
    const parent = l.groupNode(solid.id, "Assembly");
    l.reparent(cutter.id, parent);
    l.selectGroup(parent);
    l.setActiveTransform(pose);
    l.select(cutter.id);
    const parentMatrix = transformMatrix(pose);
    const sample = (x) => {
      const p = new Vector3(x, 0, 0).applyMatrix4(parentMatrix);
      return prepareComposite(l.project.layerStack.compositionLayers)(p.x, p.y, p.z);
    };
    assert(sample(0) > 0);
    assert(sample(0.19) < 0);
    const before = structuredClone(cutter.localTransform);
    const worldBefore = transformMatrix(cutter.transform);
    const oldGrid = cutter.volume;
    const history = l.undoCount;
    const face = { axis: 0, sign: 1 };
    await l.resizeBoxFace(cutter.id, face, 0.17);
    assert(sample(0.19) > 0);
    assert(sample(-0.19) < 0);
    assert.equal(cutter.volume.resolution, oldGrid.resolution);
    assertCornersFixed(
      slot,
      worldBefore,
      cutter.primitive,
      transformMatrix(cutter.transform),
      face,
    );
    assert.equal(l.undoCount, history + 1);
    const after = structuredClone(cutter.localTransform);
    assert.equal(l.undo(), cutter.id);
    assert.deepEqual(cutter.primitive, slot);
    assert.deepEqual(cutter.localTransform, before);
    assert.equal(cutter.volume, oldGrid);
    assert(sample(0.19) < 0);
    assert.equal(l.undo(true), cutter.id);
    assert.deepEqual(cutter.localTransform, after);
    assert(sample(0.19) > 0);
    assert.equal(solid.booleanModifiers[0].sourceId, cutter.id);
  } finally {
    l.dispose();
  }
});

test("staged face resize refuses cancellation, lock, unsupported rounded boxes and unselected cutters", async () => {
  const l = make();
  try {
    const target = await l.regeneratePrimitive(box);
    const before = target.volume;
    const face = { axis: 2, sign: -1 };
    const abort = new AbortController();
    const history = l.undoCount;
    const job = l.resizeBoxFace(target.id, face, 0.2, abort.signal);
    abort.abort();
    await assert.rejects(job, /cancelled/);
    assert.equal(target.volume, before);
    assert.deepEqual(target.primitive, box);
    assert.deepEqual(target.transform, identityTransform());
    assert.equal(l.undoCount, history);
    l.setFlag(target.id, "locked", true);
    await assert.rejects(l.resizeBoxFace(target.id, face, 0.2), /locked/);
    const round = await l.regeneratePrimitive({ ...box, cornerRadius: 0.1 });
    await assert.rejects(l.resizeBoxFace(round.id, face, 0.2), /rectangular/);
    await assert.rejects(l.resizeBoxFace(target.id, face, 0.2), /Select the box/);
  } finally {
    l.dispose();
  }
});

test("adaptive Boolean draft moves the source boundary and leaves committed pose untouched", async () => {
  const { Box3 } = await import("three");
  const l = make();
  try {
    const target = await l.regeneratePrimitive(box);
    const before = structuredClone(target.transform);
    await l.composite.flush();
    l.beginTransform();
    l.composite.setInteractive(true);
    const face = { axis: 1, sign: -1 };
    const next = resizeFace(box, face, 0.25);
    l.composite.setPrimitivePreview(
      target.id,
      next.source,
      anchoredBoxPose(before, face, next.delta),
    );
    assert(await l.composite.rebuild());
    const draft = new Box3().setFromObject(l.composite.group);
    assert(Math.abs(draft.min.y + 0.55) < 0.035);
    assert(Math.abs(draft.max.y - 0.3) < 0.035);
    assert.deepEqual(target.transform, before);
    assert.deepEqual(target.primitive, box);
    l.cancelTransform();
    l.composite.setInteractive(false);
    await l.composite.flush();
    const restored = new Box3().setFromObject(l.composite.group);
    assert(Math.abs(restored.min.y + 0.3) < 0.035);
  } finally {
    l.dispose();
  }
});
