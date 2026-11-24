import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { EnclosureParameters } from "./enclosure-recipe";
import type { PrimitiveSource } from "./parametric-primitive";
import { transformMatrix, type Vec3, type VolumeTransform } from "./transform";

export const WALL_ANCHORS = [
  "enclosure.base.wall.front",
  "enclosure.base.wall.right",
  "enclosure.base.wall.back",
  "enclosure.base.wall.left",
] as const;
export type WallAnchor = (typeof WALL_ANCHORS)[number];
export type CutoutDefinition = {
  kind: "cutout";
  name: string;
  anchor: WallAnchor;
  shape: "rectangle" | "round";
  uMm: number;
  vMm: number;
  widthMm: number;
  heightMm: number;
  insetMm: number;
  cornerRadiusMm?: number;
  outsideFlareMm?: number;
};
export type MountingDefinition = {
  kind: "mounting";
  name: string;
  anchor: "enclosure.base.floor";
  centresMm: [number, number][];
  outerDiameterMm: number;
  boreDiameterMm: number;
  heightMm: number;
  floorOffsetMm: number;
};
export type FeatureDefinition = CutoutDefinition | MountingDefinition;
export type EnclosureFeature = { sourceIds: string[]; definition: FeatureDefinition };
const obj = (v: unknown, keys: string[]) => {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !keys.includes(k))
  )
    throw new Error("Unsupported feature fields.");
  return v as Record<string, unknown>;
};
const num = (v: unknown, min: number, max = 1000) => {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max)
    throw new Error("Invalid feature dimension in mm.");
  return v;
};
export function validateFeature(value: unknown): FeatureDefinition {
  const v = value as FeatureDefinition;
  if (v?.kind === "cutout") {
    obj(v, [
      "kind",
      "name",
      "anchor",
      "shape",
      "uMm",
      "vMm",
      "widthMm",
      "heightMm",
      "insetMm",
      "cornerRadiusMm",
      "outsideFlareMm",
    ]);
    if (!WALL_ANCHORS.includes(v.anchor) || !["rectangle", "round"].includes(v.shape))
      throw new Error("Choose a named base wall and rectangle or round opening.");
    for (const key of ["uMm", "vMm"] as const) num(v[key], -1000);
    for (const key of ["widthMm", "heightMm"] as const) num(v[key], 0.05);
    num(v.insetMm, 0);
    const radius = v.cornerRadiusMm === undefined ? 0 : num(v.cornerRadiusMm, 0);
    const flare = v.outsideFlareMm === undefined ? 0 : num(v.outsideFlareMm, 0);
    if (radius > 0 && (v.shape !== "rectangle" || radius > Math.min(v.widthMm, v.heightMm) / 2))
      throw new Error("Corner radius must fit inside the rectangular opening.");
    if (radius > 0 && flare > 0)
      throw new Error("Choose rounded corners or an outside taper for this rectangle.");
    if (v.shape === "round" && v.widthMm !== v.heightMm)
      throw new Error("Round openings require equal width and height.");
  } else if (v?.kind === "mounting") {
    obj(v, [
      "kind",
      "name",
      "anchor",
      "centresMm",
      "outerDiameterMm",
      "boreDiameterMm",
      "heightMm",
      "floorOffsetMm",
    ]);
    if (
      v.anchor !== "enclosure.base.floor" ||
      !Array.isArray(v.centresMm) ||
      v.centresMm.length < 1 ||
      v.centresMm.length > 4
    )
      throw new Error("Supply one to four explicit floor-relative mounting centres.");
    for (const c of v.centresMm) {
      if (!Array.isArray(c) || c.length !== 2)
        throw new Error("Mounting centres are [X,Z] mm pairs.");
      for (const n of c) num(n, -1000);
    }
    for (const key of ["outerDiameterMm", "boreDiameterMm", "heightMm"] as const) num(v[key], 0.05);
    num(v.floorOffsetMm, 0, 100);
    if (v.boreDiameterMm >= v.outerDiameterMm)
      throw new Error("Post bore must be smaller than its outside diameter.");
  } else throw new Error("Unknown attachment kind.");
  if (typeof v.name !== "string" || !v.name.trim() || v.name.length > 90)
    throw new Error("Feature name must contain 1–90 characters.");
  return structuredClone(v);
}
export function validateFeatures(value: unknown): EnclosureFeature[] {
  if (!Array.isArray(value) || value.length > 10) throw new Error("Invalid enclosure attachments.");
  const ids = new Set<string>();
  return value.map((raw) => {
    const v = obj(raw, ["sourceIds", "definition"]),
      definition = validateFeature(v.definition);
    if (
      !Array.isArray(v.sourceIds) ||
      v.sourceIds.length !== (definition.kind === "cutout" ? 1 : definition.centresMm.length * 2)
    )
      throw new Error("Invalid attachment source count.");
    for (const id of v.sourceIds) {
      if (typeof id !== "string" || !id || id.length > 128 || ids.has(id))
        throw new Error("Invalid or repeated attachment source ID.");
      ids.add(id);
    }
    return { sourceIds: [...v.sourceIds] as string[], definition };
  });
}
/** Local mm frames: outward N, U follows the wall clockwise viewed from above, V=+Y. */
export function enclosureAnchors(p: EnclosureParameters) {
  const x = p.innerWidthMm / 2 + p.wallThicknessMm,
    z = p.innerDepthMm / 2 + p.wallThicknessMm;
  const floor = -(p.innerHeightMm + p.floorThicknessMm) / 2 + p.floorThicknessMm;
  return [
    {
      id: WALL_ANCHORS[0],
      originMm: [0, floor, z],
      u: [1, 0, 0],
      v: [0, 1, 0],
      normal: [0, 0, 1],
      spanMm: p.innerWidthMm,
    },
    {
      id: WALL_ANCHORS[1],
      originMm: [x, floor, 0],
      u: [0, 0, -1],
      v: [0, 1, 0],
      normal: [1, 0, 0],
      spanMm: p.innerDepthMm,
    },
    {
      id: WALL_ANCHORS[2],
      originMm: [0, floor, -z],
      u: [-1, 0, 0],
      v: [0, 1, 0],
      normal: [0, 0, -1],
      spanMm: p.innerWidthMm,
    },
    {
      id: WALL_ANCHORS[3],
      originMm: [-x, floor, 0],
      u: [0, 0, 1],
      v: [0, 1, 0],
      normal: [-1, 0, 0],
      spanMm: p.innerDepthMm,
    },
    {
      id: "enclosure.base.floor",
      originMm: [0, floor, 0],
      u: [1, 0, 0],
      v: [0, 0, -1],
      normal: [0, 1, 0],
      spanMm: p.innerWidthMm,
    },
    {
      id: "enclosure.lid.top",
      originMm: [0, p.lid.thicknessMm / 2, 0],
      u: [1, 0, 0],
      v: [0, 0, -1],
      normal: [0, 1, 0],
      spanMm: p.innerWidthMm,
    },
  ];
}
export function featurePlan(p: EnclosureParameters, raw: FeatureDefinition) {
  const d = validateFeature(raw),
    anchor = enclosureAnchors(p).find((a) => a.id === d.anchor);
  if (!anchor) throw new Error("Unknown anchor.");
  const output: {
    source: PrimitiveSource;
    positionMm: Vec3;
    rotation: Vec3;
    operation: "difference" | "union";
    target: number | "base";
  }[] = [];
  if (d.kind === "cutout") {
    // Only the straight interior wall span; all corner, floor and rim overlaps refuse.
    const straight = anchor.spanMm / 2 - Math.max(0, p.cornerRadiusMm - p.wallThicknessMm);
    const flare = d.outsideFlareMm ?? 0;
    const radius = d.cornerRadiusMm ?? 0;
    if (
      Math.abs(d.uMm) + d.widthMm / 2 + flare >= straight ||
      d.vMm - d.heightMm / 2 - flare <= 0 ||
      d.vMm + d.heightMm / 2 + flare >= p.innerHeightMm
    )
      throw new Error("Opening overlaps a corner, floor or rim, or lies outside the wall.");
    const margin = Math.max(0.1, p.wallThicknessMm * 0.1),
      depth = p.wallThicknessMm + 2 * margin + 2 * d.insetMm;
    const position = new Vector3(...anchor.originMm)
      .addScaledVector(new Vector3(...anchor.u), d.uMm)
      .addScaledVector(new Vector3(...anchor.v), d.vMm)
      .addScaledVector(new Vector3(...anchor.normal), -p.wallThicknessMm / 2 - d.insetMm);
    const basis = new Matrix4().makeBasis(
      new Vector3(...anchor.u),
      new Vector3(...anchor.v),
      new Vector3(...anchor.normal),
    );
    if (d.shape === "round" || radius || flare)
      basis.makeBasis(
        new Vector3(...anchor.u),
        new Vector3(...anchor.normal),
        new Vector3(...anchor.v).negate(),
      );
    const rotation = new Euler().setFromRotationMatrix(basis, "XYZ").toArray().slice(0, 3) as Vec3;
    const slope = (2 * flare) / p.wallThicknessMm;
    // Extend the same taper through both clearance margins so the requested sizes
    // land at the actual inside and outside wall faces.
    const smaller = (dimension: number) => dimension - slope * (margin + 2 * d.insetMm);
    const larger = (dimension: number) => dimension + slope * (p.wallThicknessMm + margin);
    if (flare && smaller(Math.min(d.widthMm, d.heightMm)) < 0.05)
      throw new Error("Reduce the outside taper or the extra inward reach.");
    let source: PrimitiveSource;
    if (d.shape === "round") {
      source = {
        kind: "cylinder",
        diameter: d.widthMm,
        height: depth,
        ...(flare ? { topDiameter: larger(d.widthMm), bottomDiameter: smaller(d.widthMm) } : {}),
      };
    } else if (flare) {
      source = {
        kind: "tapered-box",
        height: depth,
        bottomWidth: smaller(d.widthMm),
        bottomDepth: smaller(d.heightMm),
        topWidth: larger(d.widthMm),
        topDepth: larger(d.heightMm),
      };
    } else {
      source = radius
        ? { kind: "box", width: d.widthMm, height: depth, depth: d.heightMm, cornerRadius: radius }
        : { kind: "box", width: d.widthMm, height: d.heightMm, depth, cornerRadius: 0 };
    }
    output.push({
      source,
      positionMm: position.toArray() as Vec3,
      rotation,
      operation: "difference",
      target: "base",
    });
  } else {
    const r = d.outerDiameterMm / 2,
      floor = anchor.originMm[1];
    if (d.heightMm + d.floorOffsetMm >= p.innerHeightMm - p.lid.lipDepthMm)
      throw new Error("Posts reach the reserved lid region.");
    for (let i = 0; i < d.centresMm.length; i++) {
      const [x, z] = d.centresMm[i];
      if (
        Math.abs(x) + r >= p.innerWidthMm / 2 - Math.max(0, p.cornerRadiusMm - p.wallThicknessMm) ||
        Math.abs(z) + r >= p.innerDepthMm / 2 - Math.max(0, p.cornerRadiusMm - p.wallThicknessMm)
      )
        throw new Error("Post overlaps the wall/corner boundary.");
      if (d.centresMm.slice(0, i).some((c) => Math.hypot(c[0] - x, c[1] - z) <= 2 * r))
        throw new Error("Mounting posts overlap.");
      const overlap = Math.min(p.floorThicknessMm / 2, 0.5),
        post = output.length;
      output.push({
        source: { kind: "cylinder", diameter: d.outerDiameterMm, height: d.heightMm + overlap },
        positionMm: [x, floor + d.floorOffsetMm + (d.heightMm - overlap) / 2, z],
        rotation: [0, 0, 0],
        operation: "union",
        target: "base",
      });
      output.push({
        source: {
          kind: "cylinder",
          diameter: d.boreDiameterMm,
          height: d.heightMm + overlap + 0.2,
        },
        positionMm: [x, floor + d.floorOffsetMm + (d.heightMm - overlap) / 2, z],
        rotation: [0, 0, 0],
        operation: "difference",
        target: post,
      });
    }
    if (d.floorOffsetMm !== 0)
      throw new Error("Floating/internal offset posts are deferred; floorOffsetMm must be zero.");
  }
  return output;
}
/** Interpret a source resize in the recipe's millimetres. Wall depth and floor seating are derived. */
export function scaledEnclosureFeature(
  parameters: EnclosureParameters,
  definition: FeatureDefinition,
  sourceIndex: number,
  before: PrimitiveSource,
  after: PrimitiveSource,
  mm: number,
  centreMm?: Vec3,
): FeatureDefinition {
  const next = structuredClone(definition);
  if (next.kind === "cutout") {
    if (before.kind === "box" && after.kind === "box") {
      if (before.width !== after.width) next.widthMm = after.width * mm;
      // Rounded rectangles run through the wall along their local Y axis.
      const oldHeight = next.cornerRadiusMm ? before.depth : before.height;
      const height = next.cornerRadiusMm ? after.depth : after.height;
      if (oldHeight !== height) next.heightMm = height * mm;
    } else if (before.kind === "tapered-box" && after.kind === "tapered-box") {
      next.widthMm += (after.bottomWidth - before.bottomWidth) * mm;
      next.heightMm += (after.bottomDepth - before.bottomDepth) * mm;
    } else if (before.kind === "cylinder" && after.kind === "cylinder") {
      next.widthMm *= after.diameter / before.diameter;
      next.heightMm = next.widthMm;
    } else throw new Error("Restore the cutout source before scaling it.");
    if (centreMm) {
      const wall = enclosureAnchors(parameters).find(({ id }) => id === next.anchor)!;
      const offset = new Vector3(...centreMm).sub(new Vector3(...wall.originMm));
      next.uMm = offset.dot(new Vector3(...wall.u));
      next.vMm = offset.dot(new Vector3(...wall.v));
    }
  } else {
    if (before.kind !== "cylinder" || after.kind !== "cylinder")
      throw new Error("Restore the mounting source before scaling it.");
    const bore = sourceIndex % 2 === 1;
    if (before.diameter !== after.diameter) {
      if (bore) next.boreDiameterMm = after.diameter * mm;
      else next.outerDiameterMm = after.diameter * mm;
    }
    if (before.height !== after.height) {
      const overlap = Math.min(parameters.floorThicknessMm / 2, 0.5);
      next.heightMm = after.height * mm - overlap - (bore ? 0.2 : 0);
    }
  }
  // Store dimensions at sub-micron precision without floating-point noise in the form.
  const clean = (value: number) => Math.round(value * 1e9) / 1e9;
  if (next.kind === "cutout") {
    next.widthMm = clean(next.widthMm);
    next.heightMm = clean(next.heightMm);
    next.uMm = clean(next.uMm);
    next.vMm = clean(next.vMm);
  } else {
    next.outerDiameterMm = clean(next.outerDiameterMm);
    next.boreDiameterMm = clean(next.boreDiameterMm);
    next.heightMm = clean(next.heightMm);
  }
  return next;
}

export function featureWorldPose(
  def: Pick<ReturnType<typeof featurePlan>[number], "positionMm" | "rotation">,
  root: VolumeTransform,
  mm: number,
): VolumeTransform {
  const matrix = transformMatrix(root).multiply(
    new Matrix4().compose(
      new Vector3(...def.positionMm).multiplyScalar(1 / mm),
      new Quaternion().setFromEuler(new Euler(...def.rotation, "XYZ")),
      new Vector3(1, 1, 1),
    ),
  );
  const pos = new Vector3(),
    q = new Quaternion(),
    scale = new Vector3();
  matrix.decompose(pos, q, scale);
  return {
    position: pos.multiplyScalar(mm).toArray() as Vec3,
    rotation: new Euler().setFromQuaternion(q, "XYZ").toArray().slice(0, 3) as Vec3,
    scale: scale.toArray() as Vec3,
  };
}
/** Validate native links without inferring association from arbitrary absolute geometry. */
export function validateFeatureLinks(stack: import("./layers").LayerStack, baseId: string) {
  const base = stack.get(baseId),
    intent = base.assemblyPart?.enclosure;
  if (!intent?.features?.length) return;
  if (intent.role !== "base") throw new Error("Attachments require an enclosure base.");
  for (const feature of intent.features) {
    const generated = featurePlan(intent.parameters, feature.definition);
    for (const [i, id] of feature.sourceIds.entries()) {
      const source = stack.get(id),
        def = generated[i];
      if (
        id === baseId ||
        stack.hierarchy.parent(id) !== baseId ||
        !source.primitive ||
        source.array ||
        source.assemblyPart ||
        source.primitive.kind !== def.source.kind
      )
        throw new Error(
          "Invalid attachment source membership/type; restore the source before editing the recipe.",
        );
      const target = stack.get(def.target === "base" ? baseId : feature.sourceIds[def.target]);
      if (!target.booleanModifiers?.some((m) => m.sourceId === id && m.operation === def.operation))
        throw new Error(
          "Invalid attachment Boolean reference; restore the operation before editing the recipe.",
        );
    }
  }
}
