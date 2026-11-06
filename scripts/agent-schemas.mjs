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
const command = z.discriminatedUnion("type", [
  z.object({ type: z.literal("primitive.create"), unit, source }).strict(),
  z.object({ type: z.literal("primitive.update"), id, unit, source }).strict(),
  z.object({ type: z.literal("object.transform"), id, unit, transform }).strict(),
]);
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
export const requestSchema = z
  .object({
    name: z.enum(Object.keys(tools)),
    args: z.record(z.string(), z.unknown()),
  })
  .strict();
export const isWrite = (name) => !["scene_summary", "list_objects", "get_object"].includes(name);
export function validateCall(value) {
  const call = requestSchema.parse(value);
  return { name: call.name, args: tools[call.name].schema.parse(call.args) };
}
