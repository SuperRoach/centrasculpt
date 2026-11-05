import {
  type BufferAttribute,
  Matrix3,
  type Matrix4,
  type Mesh,
  Quaternion,
  type Ray,
  Raycaster,
  Vector3,
} from "three";

export type SurfaceSnapTarget = {
  id: string;
  mesh?: Mesh;
  kind:
    | "sculpt"
    | "boolean"
    | "reference"
    | "scene-axis"
    | "scene-center"
    | "bounds-face"
    | "bounds-center";
};
export type SurfaceSnapHit = {
  target: SurfaceSnapTarget;
  point: Vector3;
  normal: Vector3;
  distance: number;
  faceIndex: number;
};
export type SurfaceSnapSettings = {
  enabled: boolean;
  align: "position" | "position-and-orientation";
  localAxis: "x" | "y" | "z";
  offsetMM: number;
  flipNormal: boolean;
  rotateAboutNormal: number;
  hysteresis: number;
};

const AXIS = {
  x: new Vector3(1, 0, 0),
  y: new Vector3(0, 1, 0),
  z: new Vector3(0, 0, 1),
} as const;

function hitNormal(mesh: Mesh, intersection: import("three").Intersection): Vector3 | null {
  const face = intersection.face,
    position = mesh.geometry.getAttribute("position"),
    normals = mesh.geometry.getAttribute("normal");
  if (!face || !position) return null;
  const a = face.a,
    b = face.b,
    c = face.c,
    pA = new Vector3().fromBufferAttribute(position as BufferAttribute, a),
    pB = new Vector3().fromBufferAttribute(position as BufferAttribute, b),
    pC = new Vector3().fromBufferAttribute(position as BufferAttribute, c),
    localPoint = intersection.point.clone().applyMatrix4(mesh.matrixWorld.clone().invert()),
    v0 = pB.sub(pA),
    v1 = pC.sub(pA),
    v2 = localPoint.sub(pA),
    d00 = v0.dot(v0),
    d01 = v0.dot(v1),
    d11 = v1.dot(v1),
    d20 = v2.dot(v0),
    d21 = v2.dot(v1),
    denominator = d00 * d11 - d01 * d01;
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-16) return null;
  const v = (d11 * d20 - d01 * d21) / denominator,
    w = (d00 * d21 - d01 * d20) / denominator,
    u = 1 - v - w;
  if (normals) {
    const na = new Vector3().fromBufferAttribute(normals as BufferAttribute, a),
      nb = new Vector3().fromBufferAttribute(normals as BufferAttribute, b),
      nc = new Vector3().fromBufferAttribute(normals as BufferAttribute, c);
    return na.multiplyScalar(u).addScaledVector(nb, v).addScaledVector(nc, w).normalize();
  }
  return face.normal.clone();
}

/** Deterministic nearest triangle hit; normals follow transformed triangle winding, including mirrored matrices. */
export function raycastSurface(
  ray: Ray,
  targets: readonly SurfaceSnapTarget[],
  excludedIds: ReadonlySet<string> = new Set(),
  previous?: SurfaceSnapHit,
  hysteresis = 0,
  raycaster = new Raycaster(),
): SurfaceSnapHit | null {
  raycaster.ray.copy(ray);
  raycaster.near = 0;
  raycaster.far = Infinity;
  let closest: SurfaceSnapHit | null = null,
    previousHit: SurfaceSnapHit | null = null;
  const intersections = raycaster.intersectObjects(
    targets
      .filter((target) => target.mesh && !excludedIds.has(target.id) && target.mesh.visible)
      .flatMap((target) => (target.mesh ? [target.mesh] : [])),
    false,
  );
  for (const intersection of intersections) {
    const target = targets.find((candidate) => candidate.mesh === intersection.object);
    if (!target?.mesh || intersection.faceIndex == null || !intersection.face) continue;
    const mesh = target.mesh,
      determinant = mesh.matrixWorld.determinant();
    if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-12) continue;
    const localNormal = hitNormal(mesh, intersection);
    if (!localNormal) continue;
    const normal = localNormal
      .applyMatrix3(new Matrix3().getNormalMatrix(mesh.matrixWorld))
      .multiplyScalar(Math.sign(determinant))
      .normalize();
    if (!normal.toArray().every(Number.isFinite) || normal.lengthSq() < 0.5) continue;
    const candidate: SurfaceSnapHit = {
      target,
      point: intersection.point.clone(),
      normal,
      distance: intersection.distance,
      faceIndex: intersection.faceIndex,
    };
    if (!closest || candidate.distance < closest.distance) closest = candidate;
    if (
      previous &&
      target.id === previous.target.id &&
      target.mesh === previous.target.mesh &&
      (!previousHit || candidate.distance < previousHit.distance)
    )
      previousHit = candidate;
  }
  if (
    previous &&
    closest &&
    previousHit &&
    previous.target.id !== closest.target.id &&
    previousHit.distance <= closest.distance + Math.max(0, hysteresis)
  )
    return previousHit;
  return closest;
}

/** Snap a ray to the nearest scene origin or principal axis within the configured world radius. */
export function raycastSceneAlignment(
  ray: Ray,
  anchor: Matrix4,
  radius: number,
): SurfaceSnapHit | null {
  if (!Number.isFinite(radius) || radius < 0) return null;
  const origin = new Vector3().setFromMatrixPosition(anchor),
    axes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)],
    candidates: Array<{
      id: string;
      kind: SurfaceSnapTarget["kind"];
      point: Vector3;
      normal: Vector3;
      distance: number;
      gap: number;
    }> = [];
  const centerT = Math.max(0, origin.clone().sub(ray.origin).dot(ray.direction)),
    centerRayPoint = ray.origin.clone().addScaledVector(ray.direction, centerT),
    centerGap = centerRayPoint.distanceTo(origin);
  if (centerGap <= radius)
    candidates.push({
      id: "scene:center",
      kind: "scene-center",
      point: origin,
      normal: new Vector3(0, 1, 0),
      distance: centerT,
      gap: centerGap,
    });
  for (let i = 0; i < axes.length; i++) {
    const direction = axes[i].transformDirection(anchor),
      w = ray.origin.clone().sub(origin),
      b = ray.direction.dot(direction),
      d = ray.direction.dot(w),
      e = direction.dot(w),
      denominator = 1 - b * b;
    let rayT = 0,
      axisT = 0;
    if (denominator > 1e-8) {
      rayT = Math.max(0, (b * e - d) / denominator);
      axisT = b * rayT + e;
    } else axisT = -e;
    const rayPoint = ray.origin.clone().addScaledVector(ray.direction, rayT),
      point = origin.clone().addScaledVector(direction, axisT),
      gap = point.distanceTo(rayPoint);
    if (gap <= radius)
      candidates.push({
        id: `scene:${"xyz"[i]}`,
        kind: "scene-axis",
        point,
        normal: new Vector3(0, 1, 0),
        distance: rayT,
        gap,
      });
  }
  candidates.sort((a, b) => (Math.abs(a.gap - b.gap) > 1e-9 ? a.gap - b.gap : 0));
  const candidate = candidates[0];
  return candidate
    ? {
        target: { id: candidate.id, kind: candidate.kind },
        point: candidate.point,
        normal: candidate.normal,
        distance: candidate.distance,
        faceIndex: -1,
      }
    : null;
}

/** Snap a ray to visible target bounding-box centres and face centres. */
export function raycastBoundsAlignment(
  ray: Ray,
  targets: readonly SurfaceSnapTarget[],
  radius: number,
  excludedIds: ReadonlySet<string> = new Set(),
): SurfaceSnapHit | null {
  if (!Number.isFinite(radius) || radius < 0) return null;
  let best: SurfaceSnapHit | null = null,
    bestGap = Infinity;
  const axes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
  for (const target of targets) {
    const mesh = target.mesh;
    if (!mesh?.visible || excludedIds.has(target.id) || !mesh.geometry) continue;
    const geometry = mesh.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) continue;
    const box = geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld),
      center = box.getCenter(new Vector3());
    const candidates: Array<{ point: Vector3; normal: Vector3; kind: SurfaceSnapTarget["kind"] }> =
      [{ point: center, normal: new Vector3(0, 1, 0), kind: "bounds-center" }];
    for (let i = 0; i < 3; i++)
      for (const sign of [-1, 1]) {
        const point = center.clone(),
          normal = axes[i].clone().multiplyScalar(sign);
        point.setComponent(i, sign < 0 ? box.min.getComponent(i) : box.max.getComponent(i));
        candidates.push({ point, normal, kind: "bounds-face" });
      }
    for (const candidate of candidates) {
      const distance = Math.max(0, candidate.point.clone().sub(ray.origin).dot(ray.direction)),
        gap = candidate.point.distanceTo(
          ray.origin.clone().addScaledVector(ray.direction, distance),
        );
      if (
        gap <= radius &&
        (gap < bestGap || (gap === bestGap && distance < (best?.distance ?? Infinity)))
      ) {
        bestGap = gap;
        best = {
          target: { id: target.id, mesh, kind: candidate.kind },
          point: candidate.point,
          normal: candidate.normal,
          distance,
          faceIndex: -1,
        };
      }
    }
  }
  return best;
}

/** Minimal-twist alignment. The current up direction defines roll; antiparallel cases stay finite. */
export function alignAxisToNormal(
  current: Quaternion,
  localAxis: "x" | "y" | "z",
  normal: Vector3,
  rotateAboutNormal = 0,
): Quaternion | null {
  if (
    !normal.toArray().every(Number.isFinite) ||
    normal.lengthSq() < 1e-12 ||
    !Number.isFinite(rotateAboutNormal)
  )
    return null;
  const n = normal.clone().normalize(),
    axis = AXIS[localAxis].clone().applyQuaternion(current).normalize(),
    delta = new Quaternion().setFromUnitVectors(axis, n),
    aligned = delta.multiply(current.clone()).normalize(),
    roll = new Quaternion().setFromAxisAngle(n, rotateAboutNormal);
  return roll.multiply(aligned).normalize();
}

/** Apply a hit to the selected pivot/contact point without changing its scale or dimensions. */
export function snappedPose(
  rotation: Quaternion,
  scale: Vector3,
  localContact: Vector3,
  hit: SurfaceSnapHit,
  settings: Pick<
    SurfaceSnapSettings,
    "align" | "localAxis" | "offsetMM" | "flipNormal" | "rotateAboutNormal"
  >,
  modelUnitsPerMM: number,
): { position: Vector3; rotation: Quaternion; scale: Vector3; normal: Vector3 } | null {
  if (
    !Number.isFinite(modelUnitsPerMM) ||
    modelUnitsPerMM <= 0 ||
    !Number.isFinite(settings.offsetMM)
  )
    return null;
  const normal = hit.normal.clone();
  if (!normal.toArray().every(Number.isFinite) || normal.lengthSq() < 1e-12) return null;
  if (settings.flipNormal) normal.negate();
  let nextRotation = rotation.clone();
  if (settings.align === "position-and-orientation") {
    const aligned = alignAxisToNormal(
      nextRotation,
      settings.localAxis,
      normal,
      settings.rotateAboutNormal,
    );
    if (!aligned) return null;
    nextRotation = aligned;
  }
  const contactWorld = localContact.clone().multiply(scale).applyQuaternion(nextRotation),
    nextPosition = hit.point
      .clone()
      .addScaledVector(normal, settings.offsetMM * modelUnitsPerMM)
      .sub(contactWorld);
  return { position: nextPosition, rotation: nextRotation, scale: scale.clone(), normal };
}

/** Transform a local contact point to world space using an object's full affine matrix. */
export function worldContactPoint(matrix: Matrix4, local: Vector3): Vector3 {
  return local.clone().applyMatrix4(matrix);
}

/** Apply a physical offset in model-anchor coordinates before removing navigation/parent pose. */
export function hitInParentSpace(
  hit: SurfaceSnapHit,
  modelAnchorWorld: Matrix4,
  parentWorld: Matrix4,
  offsetModelUnits: number,
  flipNormal = false,
): { point: Vector3; normal: Vector3 } | null {
  if (!Number.isFinite(offsetModelUnits)) return null;
  const modelInverse = modelAnchorWorld.clone().invert(),
    point = hit.point.clone().applyMatrix4(modelInverse),
    modelNormal = hit.normal
      .clone()
      .applyMatrix3(new Matrix3().getNormalMatrix(modelInverse))
      .normalize();
  if (!modelNormal.toArray().every(Number.isFinite) || modelNormal.lengthSq() < 1e-12) return null;
  if (flipNormal) modelNormal.negate();
  point.addScaledVector(modelNormal, offsetModelUnits).applyMatrix4(modelAnchorWorld);
  const parentInverse = parentWorld.clone().invert(),
    parentPoint = point.applyMatrix4(parentInverse),
    parentNormal = hit.normal
      .clone()
      .applyMatrix3(new Matrix3().getNormalMatrix(parentInverse))
      .normalize();
  if (
    !parentPoint.toArray().every(Number.isFinite) ||
    !parentNormal.toArray().every(Number.isFinite) ||
    parentNormal.lengthSq() < 1e-12
  )
    return null;
  return { point: parentPoint, normal: parentNormal };
}
