import { Matrix3, type Raycaster, Vector3 } from "three";
import type { ComponentReference, FunctionalFeature } from "./component-references";
import { componentPositionMm, componentRotation } from "./component-view";
import {
  type CutoutDefinition,
  enclosureAnchors,
  featurePlan,
  WALL_ANCHORS,
  type WallAnchor,
} from "./enclosure-features";
import type { IndependentLayers } from "./independent-layers";
import type { SdfLayer } from "./layers";
import type { PrimitiveSource } from "./parametric-primitive";
import { transformMatrix, type Vec3 } from "./transform";

export type OpeningPiece<Source extends PrimitiveSource = PrimitiveSource> = {
  source: Source;
  positionMm: Vec3;
  rotation: Vec3;
};
export type OpeningEnvelope = OpeningPiece<Extract<PrimitiveSource, { kind: "box" | "cylinder" }>>;
export type Plunger = {
  pieces: [OpeningPiece, OpeningPiece];
};

export type OpeningMeasurements = {
  centre: Vec3;
  shape: CutoutDefinition["shape"];
  width: number;
  height: number;
  horizontal: number;
  vertical: number;
  cable: number;
  travel?: number;
  usableDepth?: number;
  plunger?: { diameter: number; height: number; shaft: number; length: number };
};

function measure(value: number, label: string, min = 0) {
  if (!Number.isFinite(value) || value < min || value > 1000)
    throw new Error(`Enter a measured ${label} between ${min} and 1000 mm.`);
  return value;
}

export function componentOpening(
  record: ComponentReference,
  host: SdfLayer,
  feature: FunctionalFeature,
  measurements: OpeningMeasurements,
  wall?: WallAnchor,
) {
  const intent = host.assemblyPart?.enclosure;
  if (record.hostId !== host.id || intent?.role !== "base" || !record.visible)
    throw new Error("Attach the visible component to an enclosure base first.");
  if (record.scale !== 1 || host.transform.scale.some((value) => Math.abs(value - 1) > 1e-8))
    throw new Error("Use a full-size component and an unscaled enclosure for measured openings.");
  const p = intent.parameters;
  const rotation = componentRotation(record);
  const m = measurements;
  if (m.centre.some((value) => !Number.isFinite(value) || Math.abs(value) > 1000))
    throw new Error("Enter all three measured coordinates for the functional face.");
  const face = new Vector3(...m.centre)
    .applyQuaternion(rotation)
    .add(componentPositionMm(record, host));
  const direction = new Vector3(...feature.outward).applyQuaternion(rotation);
  const button = feature.type === "button";
  const width = measure(m.width, "envelope width or diameter", 0.05);
  const height = m.shape === "round" ? width : measure(m.height, "envelope height", 0.05);
  const horizontal = measure(m.horizontal, "horizontal clearance");
  const vertical = m.shape === "round" ? horizontal : measure(m.vertical, "vertical clearance");
  const cable = button ? 0 : measure(m.cable, "cable allowance");
  const anchor = enclosureAnchors(p).find(
    (candidate) =>
      WALL_ANCHORS.some((id) => id === candidate.id) &&
      (!wall || wall === candidate.id) &&
      direction.dot(new Vector3(...candidate.normal)) > 1 - 1e-10,
  );
  if (!anchor)
    throw new Error(
      "The functional axis must point straight toward the selected base wall. Rotate the component or choose another wall.",
    );
  const normal = new Vector3(...anchor.normal);
  const depth = new Vector3(...anchor.originMm).sub(face).dot(normal) - p.wallThicknessMm;
  if (
    depth < -1e-6 ||
    Math.abs(face.x) > p.innerWidthMm / 2 + 1e-6 ||
    Math.abs(face.z) > p.innerDepthMm / 2 + 1e-6
  )
    throw new Error("The measured functional face must start inside the enclosure cavity.");
  const u = new Vector3(...anchor.u);
  const v = new Vector3(...anchor.v);
  const rel = face.clone().sub(new Vector3(...anchor.originMm));
  const featureUp = new Vector3(...feature.up).applyQuaternion(rotation);
  const swap = Math.abs(featureUp.dot(u)) > 1 - 1e-10;
  if (m.shape === "rectangle" && !swap && Math.abs(featureUp.dot(v)) <= 1 - 1e-10)
    throw new Error("Align the rectangular feature edges with the wall before previewing.");
  let travel = 0;
  if (button) {
    travel = measure(m.travel ?? NaN, "actuator travel", 0.05);
    const usableDepth = measure(m.usableDepth ?? NaN, "usable inward actuator depth", 0.05);
    if (travel > usableDepth)
      throw new Error("The requested travel exceeds the measured usable inward depth.");
    const oppositeGap = (normal.x ? p.innerWidthMm : p.innerDepthMm) - depth;
    if (travel >= oppositeGap)
      throw new Error("The actuator travel reaches the opposite enclosure wall.");
    if (depth <= 0) throw new Error("Leave space behind the wall for the switch actuator.");
    if (
      rel.y - (swap ? width : height) / 2 <= 0 ||
      rel.y + (swap ? width : height) / 2 >= p.innerHeightMm - p.lid.lipDepthMm
    )
      throw new Error("The actuator overlaps the floor or lid seating region.");
  }
  const shaft = m.plunger ? measure(m.plunger.shaft, "shaft diameter", 0.05) : undefined;
  const opening: CutoutDefinition = {
    kind: "cutout",
    name: `${feature.name} opening`,
    anchor: anchor.id as WallAnchor,
    shape: m.shape,
    uMm: rel.dot(u),
    vMm: rel.dot(v),
    widthMm: (shaft ?? (swap ? height : width)) + 2 * (horizontal + cable),
    heightMm: (shaft ?? (swap ? width : height)) + 2 * (vertical + cable),
    insetMm: 0,
  };
  const [cut] = featurePlan(p, opening);
  if (opening.vMm + opening.heightMm / 2 >= p.innerHeightMm - p.lid.lipDepthMm)
    throw new Error("The opening reaches the lid seating region.");
  let plunger: Plunger | undefined;
  if (m.plunger && shaft !== undefined) {
    if (!button || m.shape !== "round" || horizontal <= 0)
      throw new Error("Use a round button opening with positive radial shaft clearance.");
    const cap = measure(m.plunger.diameter, "cap diameter", 0.05);
    const height = measure(m.plunger.height, "cap height", 0.05);
    const length = measure(m.plunger.length, "shaft length", 0.05);
    const required = depth + p.wallThicknessMm + travel;
    if (Math.abs(length - required) > 0.01)
      throw new Error(
        `Set shaft length to ${required.toFixed(3)} mm so the cap reaches the wall at the entered travel.`,
      );
    if (cap <= opening.widthMm)
      throw new Error("The cap must be wider than the opening to stop against the outside wall.");
    featurePlan(p, { ...opening, widthMm: cap, heightMm: cap });
    const piece = (diameter: number, height: number, offset: number) => ({
      source: { kind: "cylinder" as const, diameter, height },
      positionMm: face.clone().addScaledVector(normal, offset).toArray() as Vec3,
      rotation: cut.rotation,
    });
    const overlap = Math.min(height / 2, 0.5);
    plunger = {
      pieces: [
        piece(cap, height, length + height / 2),
        piece(shaft, length + overlap, (length + overlap) / 2),
      ],
    };
  }
  // The cyan envelope starts at the measured mating face and shows inward travel.
  const motion = travel || 0.1;
  const envelope: OpeningEnvelope = {
    source:
      m.shape === "round"
        ? { kind: "cylinder", diameter: width, height: motion }
        : {
            kind: "box",
            width: swap ? height : width,
            height: swap ? width : height,
            depth: motion,
          },
    positionMm: face
      .clone()
      .addScaledVector(normal, -motion / 2)
      .toArray(),
    rotation: cut.rotation,
  };
  return {
    opening,
    plunger,
    envelope,
    depth,
    travel,
    horizontal,
    vertical,
    cable,
    wallThickness: p.wallThicknessMm,
  };
}

/** Use the visible shell so lids, other parts and existing openings occlude wall picks. */
export function pickComponentWall(ray: Raycaster, editor: IndependentLayers, base: SdfLayer) {
  const p = base.assemblyPart?.enclosure?.parameters;
  if (!p || !base.visible || editor.viewMode !== "separate") return;
  const scene = editor.group;
  scene.updateWorldMatrix(true, true);
  const meshes: import("three").Object3D[] = [];
  scene.traverseVisible((object) => {
    if (object.type === "Mesh") meshes.push(object);
  });
  const hit = ray.intersectObjects(meshes, false)[0];
  if (!hit?.face) return;

  let owner = hit.object;
  while (owner.parent && typeof owner.userData.layerId !== "string") owner = owner.parent;
  if (owner.userData.layerId !== base.id) return;

  const worldToBase = scene.matrixWorld.clone().multiply(transformMatrix(base.transform)).invert();
  const normal = hit.face.normal
    .clone()
    .applyNormalMatrix(
      new Matrix3().getNormalMatrix(worldToBase.clone().multiply(hit.object.matrixWorld)),
    );
  const point = hit.point
    .clone()
    .applyMatrix4(worldToBase)
    .multiplyScalar(editor.display.precision.millimetresPerUnit);
  const anchors = enclosureAnchors(p);
  return WALL_ANCHORS.find((wall) => {
    const anchor = anchors.find(({ id }) => id === wall)!;
    const outward = new Vector3(...anchor.normal);
    if (Math.abs(normal.dot(outward)) < 0.98) return false;
    const relative = point.clone().sub(new Vector3(...anchor.originMm));
    const depth = relative.dot(outward);
    const tolerance = Math.min(p.wallThicknessMm / 4, 0.25);
    const straight = anchor.spanMm / 2 - Math.max(0, p.cornerRadiusMm - p.wallThicknessMm);
    return (
      Math.min(Math.abs(depth), Math.abs(depth + p.wallThicknessMm)) <= tolerance &&
      Math.abs(relative.dot(new Vector3(...anchor.u))) < straight &&
      relative.y > 0 &&
      relative.y < p.innerHeightMm
    );
  });
}
