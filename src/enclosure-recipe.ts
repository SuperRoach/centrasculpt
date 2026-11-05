import { Vector3 } from "three";
import { partMembers, partSources } from "./assembly";
import { prepareComposite } from "./compositor";
import type { IndependentLayers } from "./independent-layers";
import type { BatchOptions, ModellingAPI, ModellingStep } from "./modelling-api";
import type { PrimitiveSource } from "./parametric-primitive";
import { identityTransform, transformMatrix, type Vec3 } from "./transform";

export type EnclosureParameters = {
  units: "mm";
  name: string;
  innerWidthMm: number;
  innerDepthMm: number;
  /** Floor top to open rim. The inserted lip occupies the top lipDepthMm. */
  innerHeightMm: number;
  wallThicknessMm: number;
  floorThicknessMm: number;
  /** Outer vertical-corner radius; horizontal rim/floor edges stay square. */
  cornerRadiusMm: number;
  lid: { type: "friction-fit"; clearanceMm: number; lipDepthMm: number; thicknessMm: number };
};
export type EnclosureIntent = { role: "base" | "lid"; parameters: EnclosureParameters };
export const DEFAULT_ENCLOSURE: EnclosureParameters = {
  units: "mm",
  name: "Enclosure",
  innerWidthMm: 24,
  innerDepthMm: 20,
  innerHeightMm: 14,
  wallThicknessMm: 3,
  floorThicknessMm: 3,
  cornerRadiusMm: 4,
  lid: { type: "friction-fit", clearanceMm: 0.3, lipDepthMm: 4, thicknessMm: 3 },
};
const record = (v: unknown, keys: string[]) => {
  if (
    !v ||
    typeof v !== "object" ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !keys.includes(k))
  )
    throw new Error("Unsupported enclosure parameters.");
  return v as Record<string, unknown>;
};
export function validateEnclosure(value: unknown): EnclosureParameters {
  const p = record(value, [
    "units",
    "name",
    "innerWidthMm",
    "innerDepthMm",
    "innerHeightMm",
    "wallThicknessMm",
    "floorThicknessMm",
    "cornerRadiusMm",
    "lid",
  ]);
  const lid = record(p.lid, ["type", "clearanceMm", "lipDepthMm", "thicknessMm"]);
  if (
    p.units !== "mm" ||
    typeof p.name !== "string" ||
    !p.name.trim() ||
    p.name.length > 90 ||
    lid.type !== "friction-fit"
  )
    throw new Error(
      "Use mm, a 1–90 character name and a friction-fit lid; screw lids are deferred.",
    );
  for (const [key, n] of [...Object.entries(p), ...Object.entries(lid)]) {
    if (["units", "name", "lid", "type"].includes(key)) continue;
    if (
      typeof n !== "number" ||
      !Number.isFinite(n) ||
      n < (key === "cornerRadiusMm" ? 0 : 0.05) ||
      n > 1000
    )
      throw new Error(
        `${key} must be finite, positive and within 0.05–1000 mm (radius may be zero).`,
      );
  }
  for (const key of [
    "innerWidthMm",
    "innerDepthMm",
    "innerHeightMm",
    "wallThicknessMm",
    "floorThicknessMm",
    "cornerRadiusMm",
  ])
    if (!(key in p)) throw new Error(`Missing ${key}.`);
  for (const key of ["clearanceMm", "lipDepthMm", "thicknessMm"])
    if (!(key in lid)) throw new Error(`Missing lid ${key}.`);
  const q = p as unknown as EnclosureParameters;
  const {
    innerWidthMm: w,
    innerDepthMm: d,
    innerHeightMm: h,
    wallThicknessMm: t,
    cornerRadiusMm: r,
  } = q;
  if (r > Math.min(w + 2 * t, d + 2 * t) / 2 || (r !== 0 && r < t + q.lid.clearanceMm))
    throw new Error(
      "Outer radius must be zero or at least wall + clearance, and at most half the outer width/depth.",
    );
  if (
    q.lid.clearanceMm > t / 2 ||
    Math.min(w, d) - 2 * q.lid.clearanceMm <= 2 * t ||
    q.lid.lipDepthMm >= h
  )
    throw new Error(
      "Clearance must be at most half the wall; the lip ring must have an opening and stop above the floor.",
    );
  // Reconstruct explicitly: no cyclic/unbounded extension data can enter native metadata.
  return {
    units: "mm",
    name: q.name.trim(),
    innerWidthMm: w,
    innerDepthMm: d,
    innerHeightMm: h,
    wallThicknessMm: t,
    floorThicknessMm: q.floorThicknessMm,
    cornerRadiusMm: r,
    lid: {
      type: "friction-fit",
      clearanceMm: q.lid.clearanceMm,
      lipDepthMm: q.lid.lipDepthMm,
      thicknessMm: q.lid.thicknessMm,
    },
  };
}
export function validateEnclosureIntent(value: unknown): EnclosureIntent {
  const p = record(value, ["role", "parameters"]);
  if (p.role !== "base" && p.role !== "lid") throw new Error("Invalid enclosure part role.");
  return { role: p.role, parameters: validateEnclosure(p.parameters) };
}
export function enclosurePlan(value: unknown) {
  const p = validateEnclosure(value),
    w = p.innerWidthMm,
    d = p.innerDepthMm,
    h = p.innerHeightMm,
    wall = p.wallThicknessMm,
    floor = p.floorThicknessMm,
    radius = p.cornerRadiusMm,
    clearance = p.lid.clearanceMm,
    thickness = p.lid.thicknessMm,
    lip = p.lid.lipDepthMm,
    baseHeight = h + floor,
    extra = Math.max(wall, thickness, lip),
    overlap = Math.min(thickness, wall) / 2,
    innerRadius = Math.max(0, radius - wall),
    lipRadius = Math.max(0, innerRadius - clearance);
  const box = (
    width: number,
    height: number,
    depth: number,
    cornerRadius: number,
  ): PrimitiveSource => ({ kind: "box", width, height, depth, cornerRadius });
  return {
    parameters: p,
    outerDimensionsMm: [w + 2 * wall, baseHeight, d + 2 * wall] as Vec3,
    usableHeightUnderLipMm: h - lip,
    nominalWallMm: wall,
    nominalFloorMm: floor,
    mating: {
      radialClearanceMm: clearance,
      rimYmm: baseHeight / 2,
      lipBottomYmm: baseHeight / 2 - lip,
      undercut: false,
    },
    sources: {
      base: { source: box(w + 2 * wall, baseHeight, d + 2 * wall, radius), y: 0 },
      cavity: { source: box(w, h + extra, d, innerRadius), y: (floor + extra) / 2 },
      lid: {
        source: box(w + 2 * wall, thickness, d + 2 * wall, radius),
        y: baseHeight / 2 + thickness / 2,
      },
      lip: {
        source: box(w - 2 * clearance, lip + overlap, d - 2 * clearance, lipRadius),
        y: baseHeight / 2 - (lip - overlap) / 2,
      },
      lipCavity: {
        source: box(
          w - 2 * clearance - 2 * wall,
          lip + overlap + 2 * extra,
          d - 2 * clearance - 2 * wall,
          Math.max(0, lipRadius - wall),
        ),
        y: baseHeight / 2 - (lip - overlap) / 2,
      },
    },
    warnings: [
      "Nominal analytical dimensions; sampled meshes can lose thin walls or gaps. Export can refuse insufficient resolution.",
      "Clearance is per side. Printer, material, shrinkage and physical friction are unknown; print a tolerance coupon.",
      "Lip occupies the upper cavity; no snap undercut, seal, board mounting or screw fasteners.",
    ],
  };
}
export class EnclosureRecipes {
  constructor(
    private readonly api: ModellingAPI,
    private readonly layers: IndependentLayers,
  ) {}
  inspect(baseId: string, lidId: string) {
    const stack = this.layers.project.layerStack,
      base = stack.get(baseId),
      lid = stack.get(lidId);
    if (this.layers.modellingBusy || !this.layers.recoveryReady) throw new Error("Editor is busy.");
    const b = base.assemblyPart?.enclosure,
      l = lid.assemblyPart?.enclosure;
    if (
      b?.role !== "base" ||
      l?.role !== "lid" ||
      JSON.stringify(b.parameters) !== JSON.stringify(l.parameters)
    )
      throw new Error("Choose matching enclosure base and lid parts.");
    const cavity = base.booleanModifiers,
      lip = lid.booleanModifiers;
    if (
      !cavity?.length ||
      cavity[0].operation !== "difference" ||
      !cavity[0].enabled ||
      !lip?.length ||
      lip[0].operation !== "union" ||
      !lip[0].enabled
    )
      throw new Error(
        "Enclosure Boolean structure changed; restore the first cavity and lip operations before resizing.",
      );
    const ring = stack.get(lip[0].sourceId),
      cut = ring.booleanModifiers;
    if (cut?.length !== 1 || cut[0].operation !== "difference" || !cut[0].enabled)
      throw new Error("Lid ring structure changed.");
    const ids = {
      base: baseId,
      cavity: cavity[0].sourceId,
      lid: lidId,
      lip: ring.id,
      lipCavity: cut[0].sourceId,
    };
    if (new Set(Object.values(ids)).size !== 5)
      throw new Error("Enclosure sources must be independent.");
    for (const [role, id] of Object.entries(ids)) {
      const node = stack.get(id);
      if (
        node.primitive?.kind !== "box" ||
        node.primitive.cornerRadius === undefined ||
        node.array ||
        (role !== "base" && role !== "lid" && node.assemblyPart)
      )
        throw new Error("Enclosure source changed type or was baked.");
      const parent = stack.hierarchy.parent(id);
      if (
        (role === "cavity" && parent !== baseId) ||
        ((role === "lip" || role === "lipCavity") && parent !== lidId)
      )
        throw new Error("Enclosure source membership changed.");
    }
    if (
      stack.get(ids.cavity).booleanModifiers?.length ||
      stack.get(ids.lipCavity).booleanModifiers?.length
    )
      throw new Error(
        "Enclosure cavity cutters changed; restore their operations before resizing.",
      );
    const primaryIds = new Set(Object.values(ids));
    const additionalMemberIds = [
      ...partMembers(stack, baseId),
      ...partMembers(stack, lidId),
    ].filter((id) => !primaryIds.has(id));
    return {
      revision: this.api.revision,
      ids,
      additionalMemberIds,
      additionalOperations: structuredClone({ base: cavity.slice(1), lid: lip.slice(1) }),
      ...enclosurePlan(b.parameters),
      accuracy: "analytical_intent_not_mesh_validation" as const,
    };
  }
  /** Sparse sections of the actual evaluated SDF. Does not certify the full surface. */
  samples(baseId: string, lidId: string) {
    const inspected = this.inspect(baseId, lidId),
      p = inspected.parameters,
      mm = this.layers.display.precision.millimetresPerUnit;
    const measure = (id: string, axis: number, centre: Vec3, halfSpan: number) => {
      const root = this.layers.project.layerStack.get(id),
        matrix = transformMatrix(root.transform),
        sdf = prepareComposite(partSources(this.layers.project.layerStack, id));
      let inside = 0;
      const count = 512,
        step = (2 * halfSpan) / count;
      for (let i = 0; i < count; i++) {
        const point = new Vector3(...centre);
        point.setComponent(axis, point.getComponent(axis) - halfSpan + (i + 0.5) * step);
        point.multiplyScalar(1 / mm).applyMatrix4(matrix);
        if (sdf(point.x, point.y, point.z) < 0) inside++;
      }
      const scale = new Vector3().setFromMatrixScale(matrix).getComponent(axis);
      return {
        thicknessMm: inside * step * scale,
        uncertaintyMm: 2 * step * scale,
        samples: count,
      };
    };
    const wall = measure(
        baseId,
        0,
        [p.innerWidthMm / 2 + p.wallThicknessMm / 2, 0, 0],
        p.wallThicknessMm * 1.5,
      ),
      floor = measure(
        baseId,
        1,
        [0, -(p.innerHeightMm + p.floorThicknessMm) / 2 + p.floorThicknessMm / 2, 0],
        p.floorThicknessMm * 1.5,
      ),
      lip = measure(
        lidId,
        0,
        [
          p.innerWidthMm / 2 - p.lid.clearanceMm - p.wallThicknessMm / 2,
          -p.lid.thicknessMm / 2 - p.lid.lipDepthMm / 2,
          0,
        ],
        p.wallThicknessMm * 1.5,
      ),
      plate = measure(lidId, 1, [0, 0, 0], p.lid.thicknessMm * 1.5);
    return {
      revision: this.api.revision,
      units: "mm" as const,
      approximate: true as const,
      sections: { wall, floor, lip, plate },
      sampledMinimumThicknessMm: Math.min(
        wall.thicknessMm,
        floor.thicknessMm,
        lip.thicknessMm,
        plate.thicknessMm,
      ),
      physicalFit: "unknown" as const,
      limitations: [
        "Four centre sections of actual SDF; may miss local thin regions, shifted sources and corner defects. Not a global minimum thickness test.",
        ...inspected.warnings,
      ],
    };
  }
  /** Outer height means base bottom to rim; lid plate height is additional. */
  withOuterDimensions(
    parameters: EnclosureParameters,
    dimensions: { widthMm: number; depthMm: number; heightMm: number },
  ) {
    const p = validateEnclosure(parameters);
    if (
      !dimensions ||
      ![dimensions.widthMm, dimensions.depthMm, dimensions.heightMm].every(
        (n) => typeof n === "number" && Number.isFinite(n) && n > 0,
      )
    )
      throw new Error("Outer dimensions must be positive and finite.");
    return validateEnclosure({
      ...p,
      innerWidthMm: dimensions.widthMm - 2 * p.wallThicknessMm,
      innerDepthMm: dimensions.depthMm - 2 * p.wallThicknessMm,
      innerHeightMm: dimensions.heightMm - p.floorThicknessMm,
    });
  }
  async create(parameters: EnclosureParameters, options: BatchOptions) {
    return this.apply(parameters, options);
  }
  async update(
    baseId: string,
    lidId: string,
    parameters: EnclosureParameters,
    options: BatchOptions,
  ) {
    return this.apply(parameters, options, { baseId, lidId });
  }
  private async apply(
    parameters: EnclosureParameters,
    options: BatchOptions,
    existing?: { baseId: string; lidId: string },
  ) {
    try {
      const plan = enclosurePlan(parameters),
        p = plan.parameters,
        steps: ModellingStep[] = [];
      const old = existing ? this.inspect(existing.baseId, existing.lidId) : undefined;
      const refs: Record<string, string> = {};
      const mm = this.layers.display.precision.millimetresPerUnit;
      for (const [key, def] of Object.entries(plan.sources)) {
        const id = old?.ids[key as keyof typeof old.ids];
        steps.push({
          as: key,
          command: id
            ? { type: "primitive.update", id, unit: "mm", source: def.source }
            : { type: "primitive.create", unit: "mm", source: def.source },
        });
        refs[key] = `$${key}`;
        const pose = identityTransform();
        if (old) {
          const owner = key === "base" || key === "cavity" ? old.ids.base : old.ids.lid;
          const root = this.layers.project.layerStack.get(owner).transform;
          const oldPlan = enclosurePlan(old.parameters);
          const rootY = owner === old.ids.base ? 0 : oldPlan.sources.lid.y;
          const targetY = key === "base" || key === "cavity" ? def.y : def.y - rootY;
          // Rebuild children relative to the independently moved root; retain root orientation/scale.
          Object.assign(pose, structuredClone(root));
          pose.position = new Vector3(0, targetY / mm, 0)
            .applyMatrix4(transformMatrix(root))
            .multiplyScalar(mm)
            .toArray() as Vec3;
        } else pose.position = [0, def.y, 0];
        steps.push({
          command: { type: "object.transform", id: refs[key], unit: "mm", transform: pose },
        });
        if (!old)
          steps.push({
            command: {
              type: "object.rename",
              id: refs[key],
              name: `${p.name} ${key === "base" ? "Base" : key === "lid" ? "Lid" : key}`,
            },
          });
      }
      if (!old) {
        for (const [target, source, operation] of [
          ["base", "cavity", "difference"],
          ["lip", "lipCavity", "difference"],
          ["lid", "lip", "union"],
        ] as const)
          steps.push({
            command: {
              type: "boolean.create",
              id: refs[target],
              sourceId: refs[source],
              operation,
            },
          });
      }
      for (const role of ["base", "lid"] as const)
        steps.push({
          command: {
            type: "part.define",
            objectId: refs[role],
            clearanceMM: p.lid.clearanceMm,
            enclosure: { role, parameters: p },
          },
        });
      if (!old)
        for (const [source, part] of [
          ["cavity", "base"],
          ["lip", "lid"],
          ["lipCavity", "lid"],
        ])
          steps.push({
            command: { type: "part.assign", objectId: refs[source], partId: refs[part] },
          });
      // A final no-op rename selects the base through the normal command boundary.
      steps.push({
        command: {
          type: "object.rename",
          id: refs.base,
          name:
            old && p.name === old.parameters.name
              ? this.layers.project.layerStack.get(old.ids.base).name
              : `${p.name} Base`,
        },
      });
      if (old && p.name !== old.parameters.name)
        steps.push({ command: { type: "object.rename", id: refs.lid, name: `${p.name} Lid` } });
      const result = await this.api.batch(steps, options);
      return result.ok
        ? {
            ...result,
            value: {
              ...result.value,
              plan,
              partIds: { base: result.value.aliases.base, lid: result.value.aliases.lid },
            },
          }
        : result;
    } catch (e) {
      return {
        ok: false as const,
        revision: this.api.revision,
        error: {
          code: "invalid_input" as const,
          message: e instanceof Error ? e.message : "Invalid enclosure.",
        },
      };
    }
  }
}
