import assert from "node:assert/strict";
import test from "node:test";
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Matrix3,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  Ray,
  Vector3,
} from "three";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import {
  alignAxisToNormal,
  hitInParentSpace,
  raycastBoundsAlignment,
  raycastSceneAlignment,
  raycastSurface,
  snappedPose,
} from "../work/test-build/surface-snapping.mjs";
import {
  defaultToolPreferences,
  validateToolPreferences,
} from "../work/test-build/tool-preferences.mjs";

function triangle(id, z = 0) {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(new Float32Array([-1, -1, z, 1, -1, z, 0, 1, z]), 3),
  );
  geometry.setAttribute(
    "normal",
    new BufferAttribute(new Float32Array([0, 0, 1, 0.6, 0, 0.8, 0, 0.6, 0.8]), 3),
  );
  const mesh = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));
  mesh.updateMatrixWorld(true);
  return { id, mesh, kind: "sculpt" };
}

test("ray hit interpolates vertex normals and transforms them through rotated mirrored scale", () => {
  const target = triangle("target");
  target.mesh.geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2]), 1));
  target.mesh.scale.set(-2, 3, 0.5);
  target.mesh.rotation.set(0.2, -0.3, 0.5);
  target.mesh.updateMatrixWorld(true);
  const worldPoint = new Vector3(0, 0, 0).applyMatrix4(target.mesh.matrixWorld),
    localNormal = new Vector3(0.15, 0.3, 0.9).normalize(),
    expected = localNormal
      .applyMatrix3(new Matrix3().getNormalMatrix(target.mesh.matrixWorld))
      .multiplyScalar(-1)
      .normalize(),
    ray = new Ray(worldPoint.clone().addScaledVector(expected, 2), expected.clone().negate()),
    hit = raycastSurface(ray, [target]);
  assert(hit);
  assert(hit.point.distanceTo(worldPoint) < 1e-6);
  const localPoint = hit.point.clone().applyMatrix4(target.mesh.matrixWorld.clone().invert()),
    lambdaC = (localPoint.y + 1) / 2,
    lambdaB = (1 - lambdaC + localPoint.x) / 2,
    lambdaA = 1 - lambdaB - lambdaC,
    interpolated = new Vector3(0.6 * lambdaB, 0.6 * lambdaC, lambdaA + 0.8 * (lambdaB + lambdaC))
      .normalize()
      .applyMatrix3(new Matrix3().getNormalMatrix(target.mesh.matrixWorld))
      .multiplyScalar(-1)
      .normalize();
  assert(hit.normal.distanceTo(interpolated) < 1e-5);
  assert.notDeepEqual(hit.normal.toArray(), [0, 0, 1]);
});

test("snap offsets convert mm, preserve scale, and place the pivot/contact point", () => {
  const hit = {
    target: triangle("target"),
    point: new Vector3(1, 2, 3),
    normal: new Vector3(0, 1, 0),
    distance: 2,
    faceIndex: 0,
  };
  const result = snappedPose(
    new Quaternion(),
    new Vector3(2, 2, 2),
    new Vector3(0, -0.5, 0),
    hit,
    {
      align: "position",
      localAxis: "y",
      offsetMM: 4,
      flipNormal: false,
      rotateAboutNormal: 0,
    },
    0.01,
  );
  assert(result);
  assert.deepEqual(result.position.toArray(), [1, 3.04, 3]);
  assert.deepEqual(result.scale.toArray(), [2, 2, 2]);
  const contact = new Vector3(0, -0.5, 0).multiply(result.scale).applyQuaternion(result.rotation);
  assert(contact.add(result.position).distanceTo(new Vector3(1, 2.04, 3)) < 1e-12);
});

test("offset is applied in model space before workspace navigation and nested parent transforms", () => {
  const target = triangle("reference"),
    anchor = new Matrix4().compose(
      new Vector3(3, -2, 1),
      new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.7),
      new Vector3(0.25, 0.25, 0.25),
    ),
    parent = anchor
      .clone()
      .multiply(
        new Matrix4().compose(
          new Vector3(0.4, 0.2, -0.1),
          new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.3),
          new Vector3(2, 2, 2),
        ),
      ),
    point = new Vector3(0.1, 0.2, -0.3).applyMatrix4(anchor),
    normal = new Vector3(0, 1, 0).applyMatrix3(new Matrix3().getNormalMatrix(anchor)).normalize(),
    hit = { target, point, normal, distance: 1, faceIndex: 0 },
    result = hitInParentSpace(hit, anchor, parent, 0.01),
    flipped = hitInParentSpace(hit, anchor, parent, 0.01, true);
  assert(result && flipped);
  const resultModel = result.point
      .clone()
      .applyMatrix4(parent)
      .applyMatrix4(anchor.clone().invert()),
    originalModel = point.clone().applyMatrix4(anchor.clone().invert()),
    delta = resultModel.sub(originalModel);
  assert(Math.abs(delta.length() - 0.01) < 1e-9);
  assert(delta.dot(new Vector3(0, 1, 0)) > 0);
  const flippedModel = flipped.point
    .clone()
    .applyMatrix4(parent)
    .applyMatrix4(anchor.clone().invert())
    .sub(originalModel);
  assert(flippedModel.dot(new Vector3(0, 1, 0)) < 0);
});

test("axis alignment is stable for near-parallel and antiparallel normals and rejects invalid normals", () => {
  const current = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.4);
  for (const normal of [new Vector3(0, 1, 1e-10), new Vector3(0, -1, 1e-10)]) {
    const result = alignAxisToNormal(current, "y", normal, 0.3);
    assert(result);
    const direction = new Vector3(0, 1, 0).applyQuaternion(result);
    assert(direction.distanceTo(normal.normalize()) < 1e-8);
    assert(result.toArray().every(Number.isFinite));
  }
  assert.equal(alignAxisToNormal(current, "y", new Vector3(), 0), null);
});

test("surface query excludes self, hidden targets and locked-filtered callers and retains hysteresis", () => {
  const far = triangle("far", 0),
    near = triangle("near", 0.001),
    hidden = triangle("hidden", 0.0005);
  hidden.mesh.visible = false;
  const ray = new Ray(new Vector3(0, 0, 1), new Vector3(0, 0, -1)),
    first = raycastSurface(ray, [far, hidden], new Set(["self"]));
  assert.equal(first?.target.id, "far");
  assert.equal(raycastSurface(ray, [far], new Set(["far"])), null);
  assert.equal(raycastSurface(ray, [far, near], new Set(), first, 0.01)?.target.id, "far");
  assert.equal(raycastSurface(ray, [far, near], new Set(), first, 0)?.target.id, "near");
  far.mesh.visible = false;
  assert.equal(raycastSurface(ray, [far, near], new Set(), first, 0.01)?.target.id, "near");
});

test("scene alignment finds the nearest principal axis and scene centre within radius", () => {
  const anchor = new Matrix4().makeTranslation(2, 0, 0),
    axisRay = new Ray(new Vector3(0, 0.04, 1), new Vector3(0, 0, -1)),
    axis = raycastSceneAlignment(axisRay, anchor, 0.05);
  assert.equal(axis?.target.id, "scene:x");
  assert.equal(axis?.target.kind, "scene-axis");
  assert(axis?.point.distanceTo(new Vector3(0, 0, 0)) < 1e-9);
  const centerRay = new Ray(new Vector3(2, 0, 1), new Vector3(0, 0, -1));
  assert.equal(raycastSceneAlignment(centerRay, anchor, 0.05)?.target.kind, "scene-center");
  assert.equal(raycastSceneAlignment(axisRay, anchor, 0.001), null);
});

test("bounding alignment finds visible mesh face centres and excludes self targets", () => {
  const target = triangle("box");
  target.mesh.geometry = new BoxGeometry(2, 2, 2);
  target.mesh.geometry.computeBoundingBox();
  target.mesh.updateMatrixWorld(true);
  const ray = new Ray(new Vector3(0, 0, 2), new Vector3(0, 0, -1)),
    hit = raycastBoundsAlignment(ray, [target], 0.01);
  assert.equal(hit?.target.kind, "bounds-face");
  assert(hit?.point.distanceTo(new Vector3(0, 0, 1)) < 1e-9);
  assert.equal(raycastBoundsAlignment(ray, [target], 0.01, new Set(["box"])), null);
  target.mesh.visible = false;
  assert.equal(raycastBoundsAlignment(ray, [target], 1), null);
});

test("snap preferences are optional for old saves, default to freehand, and validate bounds", () => {
  const defaults = defaultToolPreferences();
  assert.equal(defaults.surfaceSnap.enabled, false);
  assert.equal(defaults.surfaceSnap.targetMode, "surface");
  assert.equal(defaults.surfaceSnap.radiusMM, 10);
  assert.equal(
    validateToolPreferences({
      ...defaults,
      surfaceSnap: { ...defaults.surfaceSnap, targetMode: "bounds", radiusMM: 25 },
    }).surfaceSnap?.radiusMM,
    25,
  );
  const { surfaceSnap, ...legacy } = defaults;
  assert.deepEqual(validateToolPreferences(legacy).surfaceSnap, undefined);
  assert.throws(() =>
    validateToolPreferences({ ...defaults, surfaceSnap: { ...surfaceSnap, offsetMM: Infinity } }),
  );
  assert.throws(() =>
    validateToolPreferences({
      ...defaults,
      surfaceSnap: { ...defaults.surfaceSnap, targetMode: "unknown" },
    }),
  );
});

test("applying a snapped pose is one metadata history action and never remeshes or edits SDF", () => {
  const layers = new IndependentLayers(
      createBaseProject(new SDFVolume(17), {
        mode: "add",
        radius: 0.3,
        strength: 0.5,
        hardness: 0.5,
        camera: { position: [2, 2, 3], target: [0, 0, 0] },
      }),
    ),
    volume = layers.active.volume,
    bytes = volume.getDenseView().slice(),
    hit = {
      target: triangle("reference"),
      point: new Vector3(0.5, 0.25, 0),
      normal: new Vector3(0, 0, 1),
      distance: 1,
      faceIndex: 0,
    },
    pose = snappedPose(
      new Quaternion(),
      new Vector3(1, 1, 1),
      new Vector3(),
      hit,
      {
        align: "position-and-orientation",
        localAxis: "y",
        offsetMM: 2,
        flipNormal: false,
        rotateAboutNormal: 0,
      },
      0.01,
    );
  assert(pose);
  assert(
    layers.setActiveTransform({
      position: pose.position.toArray(),
      rotation: [0, 0, 0],
      scale: pose.scale.toArray(),
    }),
  );
  assert.equal(layers.undoCount, 1);
  assert.deepEqual(volume.getDenseView(), bytes);
  assert.equal(layers.active.mesher.rebuildChunks(), null);
  layers.undo();
  assert.deepEqual(layers.active.layer.transform.position, [0, 0, 0]);
  layers.undo(true);
  assert.deepEqual(layers.active.layer.transform.position, pose.position.toArray());
  assert.deepEqual(volume.getDenseView(), bytes);
  layers.dispose();
});
