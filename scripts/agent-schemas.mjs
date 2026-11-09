import { z } from "zod";

const number = z.number().finite();
const positive = number.positive().max(10000);
const id = z.string().min(1).max(128);
const unit = z.enum(["mm", "cm", "in"]);
const vector = z.tuple([number, number, number]);
const source = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("capsule"), diameter: positive, height: positive })
    .strict()
    .refine((s) => s.height >= s.diameter, "Overall height must be at least diameter"),
  z
    .object({
      kind: z.literal("torus"),
      majorRadius: positive,
      tubeDiameter: positive,
      tyre: number.min(0).max(100).optional(),
    })
    .strict()
    .refine(
      (s) => s.majorRadius > s.tubeDiameter / 2,
      "Ring centreline radius must exceed tube radius",
    ),
  z
    .object({ kind: z.literal("pyramid"), width: positive, height: positive, depth: positive })
    .strict(),
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
      topDiameter: number.min(0).max(10000).optional(),
      bottomDiameter: number.min(0).max(10000).optional(),
      height: positive,
    })
    .strict()
    .refine(
      (s) =>
        s.diameter !== undefined || (s.topDiameter !== undefined && s.bottomDiameter !== undefined),
      "Supply diameter or both topDiameter and bottomDiameter",
    )
    .refine(
      (s) => Math.max(s.topDiameter ?? s.diameter ?? 0, s.bottomDiameter ?? s.diameter ?? 0) > 0,
      "At least one cylinder end must be positive",
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
        objectId: id.optional(),
        partId: id.optional(),
        viewpoint: z
          .enum(["front", "back", "left", "right", "top", "isometric"])
          .default("isometric"),
        width: number.int().min(64).max(512).default(384),
        height: number.int().min(64).max(512).default(384),
      })
      .strict(),
    description:
      "Read-only PNG at one revision. Omit scope IDs for the visible scene; set exactly one objectId or partId for an independently evaluated hierarchy/printable part, including Booleans and arrays. Choose front/isometric to inspect layout. Compare returned bounds/revision with get_bounds and get_geometry_diagnostics; images do not prove dimensions, topology or fit. Requires ready evaluated display for Boolean/array scenes.",
  },
  scene_summary: {
    schema: z.object({}).strict(),
    description:
      "Start every task here. Read the approved editor's stable project/revision, object count, units and busy state before choosing queries or edits.",
  },
  list_objects: {
    schema: z.object({}).strict(),
    description:
      "Read all objects: stable IDs, names, world transforms, source dimensions in mm, hierarchy, visibility, Boolean modifiers and arrays. Use IDs or earlier batch aliases in later calls.",
  },
  get_object: {
    schema: z.object({ id }).strict(),
    description:
      "Read one stable object ID: source dimensions in mm, world pose, Boolean/array state and parent/part. Does not edit.",
  },
  create_primitive: {
    schema: z.object({ ...revision, unit, source }).strict(),
    description:
      "Create one editable box, sphere/ellipsoid, cylinder/cone, capsule, torus or pyramid in mm/cm/in. For several related objects use apply_changes or stage them with propose_changes; aliases return stable output IDs. Requires browser editing permission; one call is one Undo.",
  },
  update_primitive: {
    schema: z.object({ ...revision, id, unit, source }).strict(),
    description:
      "Change an existing primitive's source dimensions while preserving its stable ID. Requires editing permission; one call is one Undo.",
  },
  transform_object: {
    schema: z.object({ ...revision, id, unit, transform }).strict(),
    description:
      "Set exact world position (explicit mm/cm/in), XYZ rotation (radians) and scale. For multi-object work put object.transform commands in one apply_changes/proposal. Uniform scale changes only; use scale_primitive for supported source-dimension scaling.",
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
      "Multiply local source dimensions, preserving pose/ID. Box/pyramid XYZ independent; cylinder/capsule require equal X/Z factors; torus requires equal XYZ. Sphere/ellipsoid XYZ independent. One Undo; no arbitrary affine deformation.",
  },
  preview_changes: {
    schema: z.object(batch).strict(),
    description:
      "Dry-run 1–64 supported commands at an exact revision. Checks isolated source caches and returns provisional IDs; scene and Undo remain unchanged. Requires editing permission. For final evaluated bounds/geometry, apply then query; this is not a mesh certification.",
  },
  apply_changes: {
    schema: z.object(batch).strict(),
    description:
      "Apply 1–64 ordered commands atomically as one Undo transaction. Give creation steps `as` aliases and refer to earlier results as `$alias`; create/update primitives, set exact transforms, add Boolean modifiers and configure arrays in the same batch. Requires browser editing permission and current revision. For separate human review use propose_changes, then wait for browser approval and call apply_approved_proposal.",
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
    description: `Apply ${type} through the authoritative engine. Use apply_changes for several commands and one Undo, or propose_changes for a separately reviewed plan. Requires browser editing permission; Bake is explicit only.`,
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
    description: `Read ${type}. Use after scene_summary and edits to inspect stable IDs, Boolean/array state or conservative source bounds; evaluated mesh diagnostics are a separate query.`,
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
    "After editing, evaluate printable-part STL topology and optional sampled clearance. Bounded and cancellable; query bounds and capture front/isometric at the same revision too. Physical fit remains unknown.",
};
tools.update_enclosure = {
  schema: z
    .object({ ...revision, baseId: id, lidId: id, parameters, dryRun: z.boolean().optional() })
    .strict(),
  description: "Update an existing enclosure through its authoritative recipe; standalone only.",
};
tools.get_capabilities = {
  schema: z.object({}).strict(),
  description:
    "Read the live adapter/build/session identity, registered tools, feature availability, limits and reconnect steps. Run after connecting or restarting; compare with tools/list to detect a stale client schema.",
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
    "Stage an immutable 1–64 command batch without changing scene/history. Use stable aliases, exact dimensions/transforms and Boolean/array commands; inspect the rendered review, then wait for the user to approve this exact plan in the browser before apply_approved_proposal. Expires in two minutes; enclosure recipes/connectors cannot be mixed into this batch. One apply is one Undo.",
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
    "Stage one standalone Phase 7.1 enclosure recipe. Separate browser approval required; it cannot nest in apply_changes/propose_changes or combine with connector commands.",
};
for (const name of ["get_proposal", "cancel_proposal", "apply_approved_proposal"])
  tools[name] = {
    schema: z.object({ proposalId: id }).strict(),
    description:
      name === "apply_approved_proposal"
        ? "Commit the exact browser-approved proposal once as one Undo transaction. This tool cannot approve. Stale, changed or expired plans reject; inspect scene state before making a new proposal."
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

// One source of truth for get_capabilities and the live tools/list adapter.
export const capabilityRegistry = {
  scenePreview: {
    scopes: ["whole-visible-scene", "object-hierarchy", "printable-part"],
    objectId:
      "Independently evaluates an object hierarchy and its required Boolean dependencies/arrays.",
    partId: "Independently evaluates printable-part membership, including Booleans/arrays.",
    viewpoints: ["front", "back", "left", "right", "top", "isometric"],
    maxEdge: 512,
    maxPngBytes: 524288,
    requiresReadyDisplay: true,
  },
  exactPrimitiveTransforms: true,
  primitiveDimensionScaling: true,
  booleans: ["union", "difference", "intersect"],
  arrays: ["linear", "radial"],
  batchCommands: Object.values(commandTools),
  batchLimits: { minCommands: 1, maxCommands: 64, oneUndo: true, aliases: true },
  proposal: {
    available: true,
    requiresSeparateBrowserApproval: true,
    maxAgeSeconds: 120,
    standaloneRecipesAndConnectors: false,
  },
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
