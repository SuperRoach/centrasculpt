import { z } from "zod";

const number = z.number().finite();
const positive = number.positive().max(10000);
const id = z.string().min(1).max(128);
const unit = z.enum(["mm", "cm", "in"]);
const vector = z.tuple([number, number, number]);
const source = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("box"), width: positive, height: positive, depth: positive }).strict(),
  z.object({ kind: z.literal("sphere"), diameter: positive }).strict(),
  z.object({ kind: z.literal("cylinder"), diameter: positive, height: positive }).strict(),
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
      "Set world pose: position in explicit unit, rotation XYZ radians, scale dimensionless.",
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
      "Set absolute dimensionless world scale, preserving position/rotation. Requires editing permission.",
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
export const requestSchema = z
  .object({
    name: z.enum(Object.keys(tools)),
    args: z.record(z.string(), z.unknown()),
  })
  .strict();
export const isWrite = (name) =>
  ![
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
