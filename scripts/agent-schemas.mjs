import { z } from "zod";

const number = z.number().finite();
const positive = number.positive().max(10000);
const id = z.string().min(1).max(128);
const unit = z.enum(["mm", "cm", "in"]);
const vector = z.tuple([number, number, number]);
const source = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("box"), width: positive, height: positive, depth: positive }).strict(),
  z
    .object({
      kind: z.literal("sphere"),
      diameter: positive.optional(),
      width: positive.optional(),
      height: positive.optional(),
      depth: positive.optional(),
    })
    .strict()
    .refine(
      (s) => s.diameter !== undefined || [s.width, s.height, s.depth].every((v) => v !== undefined),
      "Supply diameter or width, height and depth",
    ),
  z
    .object({
      kind: z.literal("cylinder"),
      diameter: positive.optional(),
      topDiameter: positive.optional(),
      bottomDiameter: positive.optional(),
      height: positive,
    })
    .strict()
    .refine(
      (s) =>
        s.diameter !== undefined || (s.topDiameter !== undefined && s.bottomDiameter !== undefined),
      "Supply diameter or both topDiameter and bottomDiameter",
    ),
]);
const transform = z.object({ position: vector, rotation: vector, scale: vector }).strict();
const name = z.string().trim().min(1).max(128);
const operation = z.enum(["union", "difference", "intersect"]);
const modifier = z.object({ id, sourceId: id, operation, enabled: z.boolean() }).strict();
const arrayFields = {
  enabled: z.boolean(),
  count: number.int().min(1).max(16),
  scalePerItem: positive.optional(),
  axis: vector,
};
const arrayDefinition = (arrayId) =>
  z.discriminatedUnion("kind", [
    z
      .object({
        ...arrayFields,
        id: arrayId,
        kind: z.literal("linear"),
        spacingModelUnits: positive,
        centered: z.boolean(),
      })
      .strict(),
    z
      .object({
        ...arrayFields,
        id: arrayId,
        kind: z.literal("radial"),
        totalAngleRadians: number.positive().max(2 * Math.PI),
        pivot: vector,
        angularOffsetRadians: number,
        orientation: z.enum(["rotate", "retain"]),
      })
      .strict(),
  ]);
const mate = z
  .object({
    moving: id,
    target: id,
    mode: z.enum(["centres", "faces", "axes"]),
    axis: z.enum(["x", "y", "z"]),
    offsetMM: number,
    matchNormal: z.boolean().optional(),
    movingNormal: vector.optional(),
    targetNormal: vector.optional(),
  })
  .strict();
const connector = z
  .object({
    pegPart: id,
    socketPart: id,
    pegDiameterMM: positive,
    pegLengthMM: positive,
    socketDiameterMM: positive,
    socketDepthMM: positive,
    radialClearanceMM: number.nonnegative(),
    positionMM: vector,
    socketPositionMM: vector.optional(),
    rotationRadians: vector,
  })
  .strict();
const featureDefinition = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("cutout"),
      name: z.string().trim().min(1).max(90),
      anchor: z.enum([
        "enclosure.base.wall.front",
        "enclosure.base.wall.right",
        "enclosure.base.wall.back",
        "enclosure.base.wall.left",
      ]),
      shape: z.enum(["rectangle", "round"]),
      uMm: number.min(-1000).max(1000),
      vMm: number.min(-1000).max(1000),
      widthMm: positive,
      heightMm: positive,
      insetMm: number.min(0).max(1000),
    })
    .strict(),
  z
    .object({
      kind: z.literal("mounting"),
      name: z.string().trim().min(1).max(90),
      anchor: z.literal("enclosure.base.floor"),
      centresMm: z
        .array(z.tuple([number.min(-1000).max(1000), number.min(-1000).max(1000)]))
        .min(1)
        .max(4),
      outerDiameterMm: positive,
      boreDiameterMm: positive,
      heightMm: positive,
      floorOffsetMm: z.literal(0),
    })
    .strict(),
]);
export const commandFields = {
  "primitive.create": { unit, source },
  "primitive.update": { id, unit, source },
  "object.transform": { id, unit, transform },
  "group.create": { name },
  "object.parent": { id, parentId: id.nullable() },
  "object.flag": { id, flag: z.enum(["visible", "locked"]), value: z.boolean() },
  "object.duplicate": { id },
  "object.delete": { id },
  "object.rename": { id, name },
  "boolean.create": { id, sourceId: id, operation },
  "boolean.update": { id, modifiers: z.array(modifier).max(64) },
  "boolean.remove": { id, modifierId: id },
  "array.create": { id, unit, definition: arrayDefinition(id.optional()) },
  "array.update": { id, unit, definition: arrayDefinition(id) },
  "array.remove": { id },
  "part.define": { objectId: id, clearanceMM: number.nonnegative().max(1000) },
  "part.remove": { partId: id },
  "part.assign": { objectId: id, partId: id.nullable() },
  "part.clearance": { partId: id, clearanceMM: number.nonnegative().max(1000) },
  "part.mate": { options: mate },
  "primitive.bake": { id },
  "boolean.bake": { id },
  "array.bake": { id },
};
const command = z.discriminatedUnion(
  "type",
  Object.entries(commandFields).map(([type, fields]) =>
    z.object({ type: z.literal(type), ...fields }).strict(),
  ),
);
const revision = { expectedRevision: id };
const batch = {
  ...revision,
  steps: z
    .array(
      z
        .object({
          command,
          as: z
            .string()
            .regex(/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/)
            .optional(),
        })
        .strict(),
    )
    .min(1)
    .max(64),
};
const parameters = z
  .object({
    units: z.literal("mm"),
    name: z.string().trim().min(1).max(90),
    innerWidthMm: positive,
    innerDepthMm: positive,
    innerHeightMm: positive,
    wallThicknessMm: positive,
    floorThicknessMm: positive,
    cornerRadiusMm: number.nonnegative(),
    lid: z
      .object({
        type: z.literal("friction-fit"),
        clearanceMm: positive,
        lipDepthMm: positive,
        thicknessMm: positive,
      })
      .strict(),
  })
  .strict();
export const tools = {
  capture_scene_preview: {
    schema: z
      .object({
        expectedRevision: z.string().min(1).max(128).optional(),
        viewpoint: z
          .enum(["front", "back", "left", "right", "top", "isometric"])
          .default("isometric"),
        width: number.int().min(64).max(512).default(384),
        height: number.int().min(64).max(512).default(384),
      })
      .strict(),
    description:
      "Read-only model-only PNG of current rendered visible geometry. Whole scene only. Boolean/array scenes require ready Boolean preview. Neutral untextured material; excludes references/UI/guides. Use with get_geometry_diagnostics; no fit or topology guarantee.",
  },
  scene_summary: {
    schema: z.object({}).strict(),
    description: "Inspect the approved active scene and its revision.",
  },
  list_objects: {
    schema: z.object({}).strict(),
    description: "List stable IDs, transforms and physical dimensions (mm).",
  },
  get_object: {
    schema: z.object({ id }).strict(),
    description: "Inspect one object by stable ID; dimensions are mm.",
  },
  create_primitive: {
    schema: z.object({ ...revision, unit, source }).strict(),
    description:
      "Create a box, sphere or cylinder in one Undo transaction. Requires browser editing permission.",
  },
  update_primitive: {
    schema: z.object({ ...revision, id, unit, source }).strict(),
    description: "Update an existing primitive, preserving its ID. Requires editing permission.",
  },
  transform_object: {
    schema: z.object({ ...revision, id, unit, transform }).strict(),
    description:
      "Set world pose: position in explicit unit, rotation XYZ radians. Scale changes require equal XYZ; non-uniform legacy scale can only be retained unchanged.",
  },
  create_enclosure: {
    schema: z.object({ ...revision, parameters, dryRun: z.boolean().optional() }).strict(),
    description:
      "Create the Phase 7.1 friction-fit enclosure recipe, or dry-run its source caches. Requires editing permission.",
  },
  move_object: {
    schema: z
      .object({
        ...revision,
        id,
        unit,
        translation: vector,
        mode: z.enum(["by", "set"]).default("by"),
      })
      .strict(),
    description:
      "Move in world axes, preserving rotation/scale. translation uses explicit mm/cm/in; mode by adds offset, set sets world position. Requires editing permission.",
  },
  rotate_object: {
    schema: z
      .object({
        ...revision,
        id,
        rotationDegrees: vector,
        mode: z.enum(["by", "set"]).default("by"),
      })
      .strict(),
    description:
      "Rotate about the object origin, preserving position/scale. XYZ Euler degrees; by composes a world-axis rotation, set sets world orientation. Requires editing permission.",
  },
  scale_object: {
    schema: z.object({ ...revision, id, scale: z.tuple([positive, positive, positive]) }).strict(),
    description:
      "Set absolute uniform world scale (equal XYZ), preserving position/rotation. Unequal XYZ is unsupported; use scale_primitive for independent box/ellipsoid dimensions or cylinder height/radius.",
  },
  scale_primitive: {
    schema: z
      .object({ ...revision, id, factors: z.tuple([positive, positive, positive]) })
      .strict(),
    description:
      "Multiply local source dimensions, preserving pose/ID. Box XYZ independent; cylinder requires equal X/Z factors and preserves taper; sphere/ellipsoid XYZ independent. One Undo; no arbitrary affine deformation.",
  },
  preview_changes: {
    schema: z.object(batch).strict(),
    description:
      "Isolated source-cache dry-run; provisional IDs, no scene/history changes. Requires editing permission under the existing API. Not final mesh certification.",
  },
  apply_changes: {
    schema: z.object(batch).strict(),
    description:
      "Apply 1–64 ordered supported commands as one Undo transaction; $alias references earlier results. Requires browser editing permission and current revision.",
  },
  undo: {
    schema: z.object(revision).strict(),
    description:
      "Undo the editor's most recent logical action (including user actions). Requires editing permission and current revision.",
  },
};
export const commandTools = Object.fromEntries(
  Object.keys(commandFields).map((type) => [type.replace(".", "_"), type]),
);
export const queryTools = {
  get_hierarchy: "scene.hierarchy",
  list_booleans: "boolean.list",
  get_booleans: "boolean.get",
  list_arrays: "array.list",
  get_array: "array.get",
  list_parts: "part.list",
  get_part: "part.get",
  get_bounds: "geometry.bounds",
  get_source_diagnostics: "geometry.diagnostics",
  inspect_enclosure: "enclosure.inspect",
  sample_enclosure: "enclosure.samples",
};
for (const [tool, type] of Object.entries(commandTools))
  tools[tool] = {
    schema: z.object({ ...revision, ...commandFields[type] }).strict(),
    description: `Execute ${type} through the authoritative engine. Requires editing permission; explicit Bake only.`,
  };
for (const [tool, type] of Object.entries(queryTools))
  tools[tool] = {
    schema: z
      .object(
        type.startsWith("enclosure.")
          ? { baseId: id, lidId: id }
          : type === "part.get"
            ? { partId: id }
            : type.endsWith(".get") || type.startsWith("geometry.")
              ? { id }
              : {},
      )
      .strict(),
    description: `Read ${type}; source bounds are conservative, not evaluated topology.`,
  };
tools.dry_run_changes = tools.preview_changes;
tools.create_connector = {
  schema: z.object({ ...revision, options: connector }).strict(),
  description: "Generate editable peg/socket sources atomically; standalone only.",
};
tools.inspect_parts = {
  schema: z.object({ ...revision, partA: id, partB: id }).strict(),
  description:
    "Read-only sampled fit inspection; requires an exact revision, not editing permission. Physical fit unknown.",
};
tools.get_geometry_diagnostics = {
  schema: z
    .object({ id, otherId: id.optional(), clearanceMM: number.nonnegative().max(1000).optional() })
    .strict(),
  description:
    "Evaluate printable-part STL topology and optional sampled clearance; bounded, cancellable, physical fit unknown.",
};
tools.update_enclosure = {
  schema: z
    .object({ ...revision, baseId: id, lidId: id, parameters, dryRun: z.boolean().optional() })
    .strict(),
  description: "Update an existing enclosure through its authoritative recipe; standalone only.",
};
tools.get_capabilities = {
  schema: z.object({}).strict(),
  description: "Read implemented tools, command support, conventions and resource limitations.",
};
tools.propose_changes = {
  schema: z
    .object({
      ...batch,
      title: z.string().trim().min(1).max(120),
      description: z.string().trim().min(1).max(2000),
    })
    .strict(),
  description:
    "Stage an immutable multi-step proposal without changing source/history. Human must approve this exact proposal in the browser; expires in two minutes. Recipes/connectors excluded.",
};
tools.propose_enclosure = {
  schema: z
    .object({
      ...revision,
      title: z.string().trim().min(1).max(120),
      description: z.string().trim().min(1).max(2000),
      recipe: z.discriminatedUnion("type", [
        z.object({ type: z.literal("create"), parameters }).strict(),
        z.object({ type: z.literal("update"), baseId: id, lidId: id, parameters }).strict(),
        z
          .object({
            type: z.literal("feature-set"),
            baseId: id,
            lidId: id,
            definition: featureDefinition,
            attachmentId: id.optional(),
          })
          .strict(),
        z
          .object({ type: z.literal("feature-remove"), baseId: id, lidId: id, attachmentId: id })
          .strict(),
      ]),
    })
    .strict(),
  description:
    "Stage one standalone Phase 7.1 enclosure create/update transaction. Separate browser approval required; cannot nest in a command batch or combine with connectors.",
};
for (const name of ["get_proposal", "cancel_proposal", "apply_approved_proposal"])
  tools[name] = {
    schema: z.object({ proposalId: id }).strict(),
    description:
      name === "apply_approved_proposal"
        ? "Commit the exact browser-approved proposal once, as one Undo transaction. Cannot approve; stale plans reject."
        : "Inspect or cancel the current memory-only proposal.",
  };

for (const name of ["enclosure_anchors", "list_enclosure_features", "get_enclosure_feature"])
  tools[name] = {
    schema: z
      .object({
        baseId: id,
        lidId: id,
        ...(name === "get_enclosure_feature" ? { attachmentId: id } : {}),
      })
      .strict(),
    readOnly: true,
    description:
      "Inspect named enclosure frames or associative attachments. Local mm intent; physical fit unknown.",
  };
tools.set_enclosure_feature = {
  schema: z
    .object({
      ...revision,
      baseId: id,
      lidId: id,
      definition: featureDefinition,
      attachmentId: id.optional(),
      dryRun: z.boolean().optional(),
    })
    .strict(),
  description:
    "Create or update one associative wall cutout or explicit floor post pattern in one standalone atomic recipe. Omit attachmentId to create. Dry-run validates source caches only.",
};
tools.remove_enclosure_feature = {
  schema: z
    .object({
      ...revision,
      baseId: id,
      lidId: id,
      attachmentId: id,
      dryRun: z.boolean().optional(),
    })
    .strict(),
  description: "Remove an attachment and its generated sources atomically. Standalone only.",
};

export const requestSchema = z
  .object({
    name: z.enum(Object.keys(tools)),
    args: z.record(z.string(), z.unknown()),
  })
  .strict();
export const isWrite = (name) =>
  ![
    "get_proposal",
    "cancel_proposal",
    "enclosure_anchors",
    "list_enclosure_features",
    "get_enclosure_feature",
    "capture_scene_preview",
    "scene_summary",
    "list_objects",
    "get_object",
    "get_capabilities",
    "get_geometry_diagnostics",
    "inspect_parts",
    ...Object.keys(queryTools),
  ].includes(name);
export function validateCall(value) {
  const call = requestSchema.parse(value);
  return { name: call.name, args: tools[call.name].schema.parse(call.args) };
}
