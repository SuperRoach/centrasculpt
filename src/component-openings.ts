import { Matrix3, type Raycaster, Vector3 } from "three";
import type { OpeningAssociation } from "./component-opening-association";
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
  retainer?: [OpeningPiece, OpeningPiece];
};

export type OpeningMeasurements = OpeningAssociation["measurements"];

function openingPose(
  record: ComponentReference,
  host: SdfLayer,
  hasPlunger: boolean,
): OpeningAssociation["pose"] {
  const parameters = host.assemblyPart?.enclosure?.parameters;
  if (!parameters) throw new Error("This opening requires an enclosure.");
  return {
    position: [...record.positionMm],
    rotation: [...record.rotation],
    scale: record.scale,
    ...(record.dimensions ? { dimensions: [...record.dimensions] } : {}),
    ...(record.gapMm === undefined ? {} : { gap: record.gapMm }),
    ...(hasPlunger
      ? {
          partPosition: [...host.transform.position] as Vec3,
          partRotation: [...host.transform.rotation] as Vec3,
        }
      : {}),
    wallThickness: parameters.wallThicknessMm,
    cavity: [
      parameters.innerWidthMm,
      parameters.innerDepthMm,
      parameters.innerHeightMm,
      parameters.floorThicknessMm,
      parameters.lid.lipDepthMm,
    ],
  };
}

export function openingIsStale(
  association: OpeningAssociation,
  record: ComponentReference | undefined,
  host: SdfLayer,
) {
  if (
    association.manuallyEdited ||
    !record ||
    record.hostId !== host.id ||
    association.partId !== host.id
  )
    return true;
  const previous = association.pose;
  const current = openingPose(record, host, !!association.measurements.plunger);
  return (
    current.scale !== previous.scale ||
    current.gap !== previous.gap ||
    current.wallThickness !== previous.wallThickness ||
    current.cavity.some((value, i) => value !== previous.cavity[i]) ||
    current.partPosition?.some((value, i) => value !== previous.partPosition?.[i]) ||
    current.partRotation?.some((value, i) => value !== previous.partRotation?.[i]) ||
    JSON.stringify(current.dimensions) !== JSON.stringify(previous.dimensions) ||
    current.position.some((value, i) => Math.abs(value - previous.position[i]) > 1e-8) ||
    current.rotation.some((value, i) => value !== previous.rotation[i]) ||
    host.transform.scale.some((value) => Math.abs(value - 1) > 1e-8)
  );
}

export function suggestedOpeningWall(record: ComponentReference, feature: FunctionalFeature) {
  const direction = new Vector3(...feature.outward).applyQuaternion(componentRotation(record));
  const normals = [
    [0, 0, 1],
    [1, 0, 0],
    [0, 0, -1],
    [-1, 0, 0],
  ] as const;
  return WALL_ANCHORS[normals.findIndex((axis) => direction.dot(new Vector3(...axis)) > 1 - 1e-10)];
}

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
  refitPlunger = false,
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
  const suggestedWall = suggestedOpeningWall(record, feature);
  const button = feature.type === "button";
  const width = measure(m.width, "envelope width or diameter", 0.05);
  const height = m.shape === "round" ? width : measure(m.height, "envelope height", 0.05);
  const horizontal = measure(m.horizontal, "horizontal clearance");
  const vertical = m.shape === "round" ? horizontal : measure(m.vertical, "vertical clearance");
  const cable = button ? 0 : measure(m.cable, "cable allowance");
  const anchor = enclosureAnchors(p).find(
    (candidate) => candidate.id === suggestedWall && (!wall || wall === candidate.id),
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
  const preset = feature.measurements;
  const fields: NonNullable<OpeningAssociation["manufacturer"]>["fields"] = [];
  if (preset && m.shape === "rectangle") {
    if (m.centre[0] === preset.centre[0]) fields.push("x");
    if (m.centre[2] === preset.centre[2]) fields.push("z");
    if (width === preset.width) fields.push("width");
    if (height === preset.height) fields.push("height");
  }
  opening.association = {
    version: 1,
    componentId: record.id,
    partId: host.id,
    featureId: feature.id,
    pose: openingPose(record, host, !!m.plunger),
    axes: { outward: [...feature.outward], up: [...feature.up] },
    measurements: {
      centre: [...m.centre],
      shape: m.shape,
      width,
      height,
      horizontal,
      vertical,
      cable,
      ...(button ? { travel, usableDepth: m.usableDepth } : {}),
      ...(m.plunger
        ? {
            plunger: {
              diameter: m.plunger.diameter,
              height: m.plunger.height,
              shaft: m.plunger.shaft,
              length: m.plunger.length,
              ...(m.plunger.retainer ? { retainer: { ...m.plunger.retainer } } : {}),
            },
          }
        : {}),
    },
    ...(preset && fields.length
      ? {
          manufacturer: {
            verification: preset.verification,
            model: preset.model,
            revision: preset.revision,
            sourceUrl: preset.sourceUrl,
            ...(preset.heightSourceUrl ? { heightSourceUrl: preset.heightSourceUrl } : {}),
            fields,
          },
        }
      : {}),
  };
  if (opening.vMm + opening.heightMm / 2 >= p.innerHeightMm - p.lid.lipDepthMm)
    throw new Error("The opening reaches the lid seating region.");
  let plunger: Plunger | undefined;
  let outwardPlay: number | undefined;
  if (m.plunger && shaft !== undefined) {
    if (!button || m.shape !== "round" || horizontal <= 0)
      throw new Error("Use a round button opening with positive radial shaft clearance.");
    const cap = measure(m.plunger.diameter, "cap diameter", 0.05);
    const height = measure(m.plunger.height, "cap height", 0.05);
    const required = depth + p.wallThicknessMm + travel;
    const length =
      refitPlunger || (m.plunger.retainer && Number.isNaN(m.plunger.length))
        ? required
        : measure(m.plunger.length, "shaft length", 0.05);
    opening.association.measurements.plunger!.length = length;
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
    let shaftTip = 0;
    let retainer: Plunger["retainer"];
    if (m.plunger.retainer) {
      const diameter = measure(m.plunger.retainer.diameter, "retainer diameter", 0.05);
      const thickness = measure(m.plunger.retainer.thickness, "retainer thickness", 2);
      const socket = shaft + 2 * horizontal;
      if (diameter < socket + 2)
        throw new Error("Allow at least 1 mm of retainer material radially around the socket.");
      if (thickness > depth)
        throw new Error("The retainer is thicker than the gap behind the wall.");
      if (opening.vMm + diameter / 2 >= p.innerHeightMm - p.lid.lipDepthMm)
        throw new Error("The retainer reaches the lid seating region.");
      featurePlan(p, { ...opening, widthMm: diameter, heightMm: diameter });
      outwardPlay = Math.max(0, depth - thickness);
      const socketDepth = thickness - 1;
      const overshoot = 0.2;
      shaftTip = thickness - socketDepth;
      retainer = [
        piece(diameter, thickness, thickness / 2),
        piece(socket, socketDepth + overshoot, shaftTip + (socketDepth + overshoot) / 2),
      ];
    }
    plunger = {
      pieces: [
        piece(cap, height, length + height / 2),
        piece(shaft, length + overlap - shaftTip, (length + overlap + shaftTip) / 2),
      ],
      retainer,
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
    outwardPlay,
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
