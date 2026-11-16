import {
  BufferGeometry,
  type Camera,
  GreaterDepth,
  Group,
  LatheGeometry,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  type Matrix4,
  Mesh,
  MeshBasicMaterial,
  Vector2,
  Vector3,
} from "three";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { type PrimitiveSource, validatePrimitive } from "./parametric-primitive";
import { snapValue } from "./physical-units";
import { transformMatrix, type VolumeTransform, validateTransform } from "./transform";

const sizes = ["width", "height", "depth"] as const;
export type Face = { axis: 0 | 1 | 2; sign: -1 | 1 };
export type RectangularBox = Extract<PrimitiveSource, { kind: "box" }>;
export function isRectangularBox(source?: PrimitiveSource): source is RectangularBox {
  return source?.kind === "box" && !source.cornerRadius;
}

export function resizeFace(source: RectangularBox, face: Face, delta: number, step = 0) {
  const key = sizes[face.axis];
  if (!key || (face.sign !== -1 && face.sign !== 1)) throw new Error("Invalid box face.");
  const others = sizes.filter((name) => name !== key).map((name) => source[name]);
  // Respect the same aspect/size envelope as source generation, even if snap overshoots it.
  const ratio = source.cornerRadius === undefined ? 8 : 128;
  const min = Math.max(0.001, Math.max(...others) / ratio);
  const max = Math.min(16, Math.min(...others) * ratio);
  const value = Math.min(max, Math.max(min, source[key] + snapValue(delta, step)));
  return { source: { ...source, [key]: value }, delta: value - source[key] };
}

export function anchoredBoxPose(pose: VolumeTransform, face: Face, delta: number) {
  const shift = new Vector3().setComponent(face.axis, (face.sign * delta) / 2);
  return validateTransform({
    ...pose,
    position: shift.applyMatrix4(transformMatrix(pose)).toArray(),
  });
}

export function faceCorners(box: RectangularBox, face: Face): Vector3[] {
  const a = (face.axis + 1) % 3,
    b = (face.axis + 2) % 3;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([u, v]) =>
    new Vector3()
      .setComponent(face.axis, (face.sign * box[sizes[face.axis]]) / 2)
      .setComponent(a, (u * box[sizes[a]]) / 2)
      .setComponent(b, (v * box[sizes[b]]) / 2),
  );
}
const faces = ([0, 1, 2] as const).flatMap((axis) =>
  ([-1, 1] as const).map((sign): Face => ({ axis, sign })),
);

function segmentDistance(point: Vector2, a: Vector2, b: Vector2): number {
  const ab = b.clone().sub(a);
  const t = ab.lengthSq() ? point.clone().sub(a).dot(ab) / ab.lengthSq() : 0;
  return point.distanceTo(a.clone().addScaledVector(ab, Math.max(0, Math.min(1, t))));
}

export function pickBoxFace(
  box: RectangularBox,
  matrix: Matrix4,
  camera: Camera,
  width: number,
  height: number,
  point: Vector2,
  allowFace: (face: Face) => boolean = () => true,
) {
  const project = (local: Vector3) => {
    const p = local.clone().applyMatrix4(matrix).project(camera);
    return p.z >= -1 && p.z <= 1
      ? { point: new Vector2(((p.x + 1) * width) / 2, ((1 - p.y) * height) / 2), depth: p.z }
      : null;
  };
  let best: { face: Face; pixelsPerUnit: Vector2; score: number } | undefined;
  for (const face of faces) {
    if (!allowFace(face)) continue;
    const corners = faceCorners(box, face).map(project);
    const center = new Vector3().setComponent(face.axis, (face.sign * box[sizes[face.axis]]) / 2);
    const p = project(center);
    const step = Math.min(box[sizes[face.axis]] * 0.02, 0.02);
    const q = project(
      center.clone().setComponent(face.axis, center.getComponent(face.axis) + face.sign * step),
    );
    if (!p || !q) continue;
    const pixelsPerUnit = q.point.clone().sub(p.point).divideScalar(step);
    // A face pointing straight into the view has no reliable screen drag direction.
    const travel = pixelsPerUnit.length() * box[sizes[face.axis]];
    if (travel < 6) continue;
    const marker = p.point.distanceTo(point);
    let edge = Infinity;
    for (let i = 0; i < 4; i++) {
      const a = corners[i],
        b = corners[(i + 1) % 4];
      if (a && b) edge = Math.min(edge, segmentDistance(point, a.point, b.point));
    }
    if (marker > 9 && edge > 8) continue;
    // Markers disambiguate shared edges; at an edge favor the useful screen normal.
    const score =
      marker <= 9
        ? marker - 11 + p.depth * 0.5
        : edge + 6 / Math.min(6, travel / 12) + p.depth * 0.5;
    if (!best || score < best.score) best = { face, pixelsPerUnit, score };
  }
  return best;
}

const highlightColour = 0xffdc79;
const arrowUp = new Vector3(0, 1, 0);

/** Limit the centre gizmo to a fraction of the selected box's screen footprint. */
export function faceResizeGizmoSize(
  box: RectangularBox,
  matrix: Matrix4,
  camera: Camera,
  height: number,
) {
  const corners = [
    ...faceCorners(box, { axis: 2, sign: -1 }),
    ...faceCorners(box, { axis: 2, sign: 1 }),
  ].map((corner) => corner.applyMatrix4(matrix).project(camera));
  if (corners.some((corner) => !Number.isFinite(corner.y) || corner.z < -1 || corner.z > 1))
    return 0.85;
  const ys = corners.map((corner) => corner.y);
  const pixels = ((Math.max(...ys) - Math.min(...ys)) * height) / 2;
  return Math.max(0.18, Math.min(0.85, pixels / 200));
}

export class FaceResizeGuide {
  readonly group = new Group();
  private readonly solid = new LineBasicMaterial({
    color: 0x8cd9ef,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  private readonly dashed = new LineDashedMaterial({
    color: 0x8cd9ef,
    transparent: true,
    opacity: 0.33,
    depthFunc: GreaterDepth,
    depthWrite: false,
  });
  private readonly bright = new LineMaterial({
    color: highlightColour,
    linewidth: 3,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  });
  private readonly arrow = new Mesh(
    new LatheGeometry(
      [
        new Vector2(0, -0.5),
        new Vector2(0.19, -0.19),
        new Vector2(0.055, -0.19),
        new Vector2(0.055, 0.19),
        new Vector2(0.19, 0.19),
        new Vector2(0, 0.5),
      ],
      12,
    ),
    new MeshBasicMaterial({
      color: highlightColour,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      toneMapped: false,
    }),
  );
  private readonly front = new LineSegments(new BufferGeometry(), this.solid);
  private readonly back = new LineSegments(this.front.geometry, this.dashed);
  private readonly highlight = new LineSegments2(new LineSegmentsGeometry(), this.bright);
  private key = "";
  constructor() {
    this.group.matrixAutoUpdate = false;
    this.group.visible = false;
    this.front.renderOrder = this.back.renderOrder = 11;
    this.highlight.renderOrder = 12;
    this.arrow.renderOrder = 13;
    for (const item of [this.front, this.back, this.highlight, this.arrow]) {
      item.frustumCulled = false;
      this.group.add(item);
    }
    this.highlight.visible = this.arrow.visible = false;
  }
  show(box: RectangularBox, matrix: Matrix4, camera: Camera, height: number, face?: Face) {
    this.group.visible = true;
    this.group.matrix.copy(matrix);
    this.group.matrixWorldNeedsUpdate = true;
    if (face) {
      const normal = new Vector3().setComponent(face.axis, face.sign);
      const corners = faceCorners(box, face);
      const center = corners[0].clone().lerp(corners[2], 0.5);
      const size = Math.min(corners[0].distanceTo(corners[1]), corners[1].distanceTo(corners[2]));
      const baseLength = size * 0.25;
      const start = center.clone().applyMatrix4(matrix).project(camera);
      const end = center
        .clone()
        .addScaledVector(normal, baseLength)
        .applyMatrix4(matrix)
        .project(camera);
      const aspect = camera.projectionMatrix.elements[5] / camera.projectionMatrix.elements[0];
      const pixels = (Math.hypot((end.x - start.x) * aspect, end.y - start.y) * height) / 2;
      const arrowLength = baseLength * Math.max(1, 24 / Math.max(1, pixels));
      this.arrow.position.copy(center).addScaledVector(normal, arrowLength * 0.65);
      this.arrow.quaternion.setFromUnitVectors(arrowUp, normal);
      this.arrow.scale.setScalar(arrowLength);
    }
    const key = [box.width, box.height, box.depth, face?.axis, face?.sign].join("/");
    if (key === this.key) return;
    this.key = key;
    const wire: Vector3[] = [],
      outline: number[] = [];
    this.highlight.visible = this.arrow.visible = !!face;
    const length = Math.min(box.width, box.height, box.depth) * 0.028;
    this.dashed.dashSize = length * 1.8;
    this.dashed.gapSize = length * 1.3;
    for (const f of faces) {
      const corners = faceCorners(box, f);
      const active = f.axis === face?.axis && f.sign === face.sign;
      for (let i = 0; i < 4; i++) {
        // Each edge belongs to two faces; draw it once.
        if (f.axis !== 2 && (f.axis === 0 || i % 2 === 1))
          wire.push(corners[i], corners[(i + 1) % 4]);
        if (active) outline.push(...corners[i].toArray(), ...corners[(i + 1) % 4].toArray());
      }
      const center = corners[0].clone().lerp(corners[2], 0.5);
      for (const axis of [0, 1, 2]) {
        if (axis === f.axis) continue;
        const v = center.getComponent(axis);
        wire.push(
          center.clone().setComponent(axis, v - length),
          center.clone().setComponent(axis, v + length),
        );
      }
    }
    this.front.geometry.dispose();
    this.highlight.geometry.dispose();
    // computeLineDistances requires independent vertex pairs for LineSegments.
    this.front.geometry = this.back.geometry = new BufferGeometry().setFromPoints(wire);
    this.back.computeLineDistances();
    this.highlight.geometry = new LineSegmentsGeometry();
    if (outline.length) this.highlight.geometry.setPositions(outline);
  }
  dispose() {
    this.group.removeFromParent();
    this.front.geometry.dispose();
    this.highlight.geometry.dispose();
    this.arrow.geometry.dispose();
    for (const material of [this.solid, this.dashed, this.bright, this.arrow.material])
      material.dispose();
  }
}

// Validate at the staging boundary too; UI hit tests are not authorization to edit.
export function checkedRectangularBox(source?: PrimitiveSource): RectangularBox {
  if (!isRectangularBox(source)) throw new Error("Face Resize requires a rectangular box.");
  validatePrimitive(source);
  return source;
}
