import { type FitReport, partMembers, partOwner } from "./assembly";
import {
  type ConnectorOptions,
  generateConnector,
  inspectAssembly,
  type MateOptions,
  mateParts,
} from "./assembly-tools";
import type { IndependentLayers } from "./independent-layers";
import { LayerGroup } from "./layer-hierarchy";
import { newId, validateAssemblyPart } from "./layers";
import { type BooleanModifier, validateModifiers } from "./live-boolean";
import { type ArrayDefinition, validateArrayDefinition } from "./object-array";
import { objectDimensions } from "./object-dimensions";
import {
  type PrimitiveSource,
  primitiveWorldDimensions,
  validatePrimitive,
} from "./parametric-primitive";
import { type PhysicalUnit, unitMM } from "./physical-units";
import { type Vec3, type VolumeTransform, validateTransform } from "./transform";

/** Dimensions are local, translations are sculpture-world coordinates, rotations XYZ radians.
 * Scale is dimensionless. Workspace navigation is deliberately excluded. */
export type ModellingCommand =
  | { type: "part.inspect"; partA: string; partB: string }
  | { type: "part.define"; objectId: string; clearanceMM: number }
  | { type: "part.remove"; partId: string }
  | { type: "part.assign"; objectId: string; partId: string | null }
  | { type: "part.select"; partId: string }
  | { type: "part.clearance"; partId: string; clearanceMM: number }
  | { type: "part.mate"; options: MateOptions }
  | { type: "connector.create"; options: ConnectorOptions }
  | { type: "array.create"; id: string; definition: Omit<ArrayDefinition, "id"> & { id?: string } }
  | { type: "array.update"; id: string; definition: ArrayDefinition }
  | { type: "array.remove"; id: string }
  | { type: "array.bake"; id: string }
  | {
      type: "boolean.create";
      id: string;
      sourceId: string;
      operation: BooleanModifier["operation"];
    }
  | { type: "boolean.update"; id: string; modifiers: BooleanModifier[] }
  | { type: "boolean.remove"; id: string; modifierId: string }
  | { type: "boolean.bake"; id: string }
  | { type: "primitive.create"; unit: PhysicalUnit; source: PrimitiveSource }
  | { type: "primitive.update"; id: string; unit: PhysicalUnit; source: PrimitiveSource }
  | { type: "object.transform"; id: string; unit: PhysicalUnit; transform: VolumeTransform }
  | { type: "object.rename"; id: string; name: string }
  | { type: "primitive.bake"; id: string }
  | { type: "object.delete"; id: string };
export type ModellingQuery =
  | { type: "part.list" }
  | { type: "part.get"; partId: string }
  | { type: "array.list" }
  | { type: "array.get"; id: string }
  | { type: "boolean.list" }
  | { type: "boolean.get"; id: string }
  | { type: "scene.summary" }
  | { type: "object.list" }
  | { type: "object.get"; id: string };
export type ErrorCode =
  | "invalid_input"
  | "not_found"
  | "permission_denied"
  | "busy"
  | "unsupported"
  | "revision_conflict"
  | "cancelled"
  | "operation_failed";
export type ModellingResult<T> =
  | { ok: true; revision: string; value: T }
  | { ok: false; revision: string; error: { code: ErrorCode; message: string } };
export type ObjectMetadata = ReturnType<ModellingAPI["objectMetadata"]>;
export type SceneSummary = {
  projectId: string;
  objects: number;
  millimetresPerModelUnit: number;
  busy: boolean;
};
export type PartMetadata = {
  id: string;
  name: string;
  members: string[];
  clearanceMM: number;
  visible: boolean;
  locked: boolean;
};
export type QueryValue<Q extends ModellingQuery> = Q extends { type: "part.list" }
  ? PartMetadata[]
  : Q extends { type: "part.get" }
    ? PartMetadata
    : Q extends { type: "scene.summary" }
      ? SceneSummary
      : Q extends { type: "array.list" }
        ? { id: string; array: ArrayDefinition }[]
        : Q extends { type: "array.get" }
          ? ArrayDefinition | null
          : Q extends { type: "object.list" }
            ? ObjectMetadata[]
            : Q extends { type: "boolean.list" }
              ? { id: string; modifiers: BooleanModifier[] }[]
              : Q extends { type: "boolean.get" }
                ? BooleanModifier[]
                : ObjectMetadata;
class CommandError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}
/** One adapter per editor. No DOM, XR, network, persistence or voxel ownership.
 * Each execute is one atomic backend edit, never an implicit multi-command batch. */
export class ModellingAPI {
  private pending = false;
  constructor(
    private readonly layers: IndependentLayers,
    private readonly canEdit: () => boolean = () => true,
  ) {}
  // Editor-lifetime revision observes existing UI operations as well as commands.
  get revision(): string {
    return this.layers.modellingRevision;
  }
  private fail(code: ErrorCode, message: string): never {
    throw new CommandError(code, message);
  }
  private node(id: string) {
    const stack = this.layers.project.layerStack;
    if (![...stack.layers, ...stack.hierarchy.groups].some((n) => n.id === id))
      this.fail("not_found", "Object does not exist.");
    return stack.hierarchy.get(id);
  }
  objectMetadata(id: string) {
    const n = this.node(id),
      group = n instanceof LayerGroup,
      mm = this.layers.display.precision.millimetresPerUnit;
    const pose = (t: VolumeTransform) => ({
      positionMM: t.position.map((v) => v * mm),
      rotationRadians: [...t.rotation],
      scale: [...t.scale],
    });
    const layer = group ? undefined : this.layers.runtime(id).layer;
    return {
      id,
      partId: partOwner(this.layers.project.layerStack, id),
      array: layer?.array ? this.externalArray(layer.array) : null,
      booleanModifiers: structuredClone(layer?.booleanModifiers ?? []),
      consumedBy: this.layers.project.layerStack.layers
        .filter((l) => l.booleanModifiers?.some((m) => m.enabled && m.sourceId === id))
        .map((l) => l.id),
      name: n.name,
      parentId: this.layers.project.layerStack.hierarchy.parent(id),
      children: this.layers.project.layerStack.hierarchy.children(id),
      type: group ? "group" : (layer?.primitive?.kind ?? (layer?.procedural ? "tube" : "sculpt")),
      localTransform: pose(n.localTransform),
      worldTransform: pose(n.transform),
      dimensionsMM: layer?.primitive
        ? primitiveWorldDimensions(layer.primitive, n.transform).map((v) => v * mm)
        : this.layers.recoveryReady
          ? objectDimensions(this.layers, id).map((v) => v * mm)
          : null,
      visible: n.visible,
      locked: n.locked,
      localVisible: n.localVisible,
      localLocked: n.localLocked,
      primitiveUnit: "mm" as const,
      primitive: layer?.primitive ? this.convertSource(layer.primitive, mm) : null,
      geometry: group
        ? null
        : {
            resolution: this.layers.runtime(id).volume.resolution,
            triangles: this.layers.runtime(id).triangles,
            parametric: !!layer?.primitive,
          },
      status: this.layers.recoveryReady ? "ready" : "busy",
    };
  }
  private convertSource(source: PrimitiveSource, factor: number): PrimitiveSource {
    return Object.fromEntries(
      Object.entries(source).map(([k, v]) => [
        k,
        k === "kind" ? v : typeof v === "number" ? v * factor : NaN,
      ]),
    ) as PrimitiveSource;
  }
  private factor(unit: PhysicalUnit): number {
    if (!Object.hasOwn(unitMM, unit))
      this.fail("invalid_input", "Explicit unit must be mm, cm or in.");
    return unitMM[unit] / this.layers.display.precision.millimetresPerUnit;
  }
  query<Q extends ModellingQuery>(query: Q): ModellingResult<QueryValue<Q>> {
    try {
      let value: unknown;
      switch (query.type) {
        case "part.list":
          value = this.layers.project.layerStack.layers
            .filter((l) => l.assemblyPart)
            .map((l) => this.partMetadata(l.id));
          break;
        case "part.get":
          value = this.partMetadata(query.partId);
          break;
        case "array.list":
          value = this.layers.project.layerStack.layers
            .filter((l) => l.array)
            .map((l) => ({ id: l.id, array: this.externalArray(l.array!) }));
          break;
        case "array.get":
          this.node(query.id);
          {
            const array = this.layers.project.layerStack.get(query.id).array;
            value = array ? this.externalArray(array) : null;
          }
          break;
        case "boolean.list":
          value = this.layers.project.layerStack.layers
            .filter((l) => l.booleanModifiers?.length)
            .map((l) => ({ id: l.id, modifiers: structuredClone(l.booleanModifiers) }));
          break;
        case "boolean.get":
          this.node(query.id);
          value = structuredClone(
            this.layers.project.layerStack.get(query.id).booleanModifiers ?? [],
          );
          break;
        case "scene.summary":
          value = {
            projectId: this.layers.project.id,
            objects:
              this.layers.project.layerStack.layers.length +
              this.layers.project.layerStack.hierarchy.groups.length,
            millimetresPerModelUnit: this.layers.display.precision.millimetresPerUnit,
            busy: !this.layers.recoveryReady,
          };
          break;
        case "object.list":
          value = [
            ...this.layers.project.layerStack.layers,
            ...this.layers.project.layerStack.hierarchy.groups,
          ].map((n) => this.objectMetadata(n.id));
          break;
        case "object.get":
          value = this.objectMetadata(query.id);
          break;
        default:
          this.fail("unsupported", "Unsupported query.");
      }
      return { ok: true, revision: this.revision, value: value as QueryValue<Q> };
    } catch (e) {
      return this.error(e);
    }
  }
  private partMetadata(id: string): PartMetadata {
    this.node(id);
    const l = this.layers.project.layerStack.get(id);
    if (!l.assemblyPart) this.fail("not_found", "Printable part does not exist.");
    return {
      id,
      name: l.name,
      members: partMembers(this.layers.project.layerStack, id),
      clearanceMM: l.assemblyPart.clearanceMM,
      visible: l.visible,
      locked: l.locked,
    };
  }
  private externalArray(array: ArrayDefinition): ArrayDefinition {
    const value = structuredClone(array);
    if (value.kind === "linear")
      value.spacingModelUnits *= this.layers.display.precision.millimetresPerUnit;
    else
      value.pivot = value.pivot.map(
        (v) => v * this.layers.display.precision.millimetresPerUnit,
      ) as Vec3;
    return value;
  }
  private error(e: unknown): ModellingResult<never> {
    return {
      ok: false,
      revision: this.revision,
      error: {
        code: e instanceof CommandError ? e.code : "operation_failed",
        message: e instanceof Error ? e.message : "Operation failed.",
      },
    };
  }
  async execute(
    command: ModellingCommand,
    options: { expectedRevision: string; signal?: AbortSignal },
  ): Promise<ModellingResult<{ id: string; fit?: FitReport }>> {
    let selected: string | undefined,
      group: string | null = null;
    try {
      if (!this.canEdit()) this.fail("permission_denied", "Editing is not permitted.");
      if (this.pending || !this.layers.recoveryReady)
        this.fail("busy", "Editor has an active operation.");
      if (options.expectedRevision !== this.revision)
        this.fail("revision_conflict", "Scene changed; query again before editing.");
      if (options.signal?.aborted) this.fail("cancelled", "Operation cancelled.");
      if (
        ![
          "part.inspect",
          "part.define",
          "part.remove",
          "part.assign",
          "part.select",
          "part.clearance",
          "part.mate",
          "connector.create",
          "boolean.create",
          "boolean.update",
          "boolean.remove",
          "boolean.bake",
          "primitive.create",
          "primitive.update",
          "object.transform",
          "object.rename",
          "primitive.bake",
          "object.delete",
          "array.create",
          "array.update",
          "array.remove",
          "array.bake",
        ].includes(command.type)
      )
        this.fail("unsupported", "Unsupported command.");
      if (command.type === "part.inspect") {
        this.partMetadata(command.partA);
        this.partMetadata(command.partB);
        this.pending = true;
        try {
          const fit = await inspectAssembly(
            this.layers,
            command.partA,
            command.partB,
            options.signal,
          );
          return { ok: true, revision: this.revision, value: { id: command.partA, fit } };
        } finally {
          this.pending = false;
        }
      }
      let source: PrimitiveSource | undefined,
        transform: VolumeTransform | undefined,
        arrayDefinition: ArrayDefinition | undefined;
      try {
        if (command.type === "primitive.create" || command.type === "primitive.update")
          source = validatePrimitive(this.convertSource(command.source, this.factor(command.unit)));
        if (command.type === "object.transform") {
          const f = this.factor(command.unit);
          transform = validateTransform({
            ...command.transform,
            position: command.transform.position.map((v) => v * f) as Vec3,
          });
        }
        if (command.type === "array.create" || command.type === "array.update") {
          const raw = structuredClone(command.definition) as ArrayDefinition;
          if (raw.kind === "radial")
            raw.pivot = raw.pivot.map(
              (v) => v / this.layers.display.precision.millimetresPerUnit,
            ) as Vec3;
          arrayDefinition = validateArrayDefinition({ ...raw, id: raw.id ?? newId() });
          if (arrayDefinition.kind === "linear")
            arrayDefinition.spacingModelUnits /= this.layers.display.precision.millimetresPerUnit;
        }
        if (
          command.type === "object.rename" &&
          (typeof command.name !== "string" ||
            !command.name.trim() ||
            command.name.trim().length > 128)
        )
          throw new Error("Name must contain 1–128 characters.");
      } catch (e) {
        this.fail("invalid_input", e instanceof Error ? e.message : "Invalid input.");
      }
      if (command.type === "part.define" || command.type === "part.clearance") {
        try {
          validateAssemblyPart({ clearanceMM: command.clearanceMM });
        } catch (e) {
          this.fail("invalid_input", e instanceof Error ? e.message : "Invalid clearance.");
        }
      }
      const partEditIds =
        command.type === "part.define" || command.type === "part.assign"
          ? [command.objectId]
          : command.type === "part.clearance" || command.type === "part.remove"
            ? [command.partId]
            : command.type === "part.mate"
              ? [command.options.moving]
              : command.type === "connector.create"
                ? [command.options.pegPart, command.options.socketPart]
                : [];
      for (const partId of partEditIds)
        if (!this.node(partId).editable)
          this.fail("permission_denied", "Part or ancestor is hidden or locked.");
      if ("id" in command) {
        const node = this.node(command.id);
        if (!node.editable)
          this.fail("permission_denied", "Object or ancestor is hidden or locked.");
        if (
          (command.type === "primitive.update" || command.type === "primitive.bake") &&
          (node instanceof LayerGroup || !this.layers.runtime(command.id).layer.primitive)
        )
          this.fail("unsupported", "Object is not an editable primitive.");
      }
      if (
        command.type === "primitive.update" &&
        source?.kind !== this.layers.runtime(command.id).layer.primitive?.kind
      )
        this.fail("unsupported", "Changing primitive type requires creating a new source.");
      selected = this.layers.project.activeLayerId;
      group = this.layers.selectedGroupId;
      this.pending = true;
      let id = "id" in command ? command.id : "";
      if (command.type === "part.select") {
        this.partMetadata(command.partId);
        this.layers.select(command.partId);
        return { ok: true, revision: this.revision, value: { id: command.partId } };
      }
      // Generation uses the same selected-source ownership rules as desktop and XR.
      this.layers.selectedGroupId = null;
      if ("id" in command) {
        if (this.node(command.id) instanceof LayerGroup) this.layers.selectGroup(command.id);
        else this.layers.select(command.id);
      }
      switch (command.type) {
        case "part.define":
          this.node(command.objectId);
          id = command.objectId;
          this.layers.setAssemblyPart(id, { clearanceMM: command.clearanceMM });
          break;
        case "part.remove":
          this.partMetadata(command.partId);
          id = command.partId;
          this.layers.setAssemblyPart(id, undefined);
          break;
        case "part.clearance":
          this.partMetadata(command.partId);
          id = command.partId;
          this.layers.setAssemblyPart(id, { clearanceMM: command.clearanceMM });
          break;
        case "part.assign":
          this.node(command.objectId);
          id = command.objectId;
          if (command.partId) this.partMetadata(command.partId);
          this.layers.reparent(id, command.partId);
          break;
        case "part.mate":
          this.partMetadata(command.options.moving);
          this.partMetadata(command.options.target);
          mateParts(this.layers, command.options);
          id = command.options.moving;
          break;
        case "connector.create":
          this.node(command.options.pegPart);
          this.node(command.options.socketPart);
          id = await generateConnector(this.layers, command.options, options.signal);
          break;
        case "array.create": {
          const layer = this.layers.project.layerStack.get(id);
          if (layer.array)
            this.fail("unsupported", "Object already has an array; update it instead.");
          this.layers.setArrayDefinition(id, arrayDefinition);
          break;
        }
        case "array.update": {
          const layer = this.layers.project.layerStack.get(id);
          if (!layer.array) this.fail("not_found", "Object has no array to update.");
          if (arrayDefinition?.id !== layer.array.id)
            this.fail("invalid_input", "Array ID is stable and cannot be changed.");
          this.layers.setArrayDefinition(id, arrayDefinition);
          break;
        }
        case "array.remove": {
          const layer = this.layers.project.layerStack.get(id);
          if (!layer.array) this.fail("not_found", "Object has no array to remove.");
          this.layers.setArrayDefinition(id, undefined);
          break;
        }
        case "array.bake": {
          const layer = this.layers.project.layerStack.get(id);
          if (!layer.array?.enabled)
            this.fail("unsupported", "Enable an array before baking its evaluated instances.");
          await this.layers.bake(
            {
              name: `${layer.name} array baked`.slice(0, 128),
              resolution: 128,
              sourceIds: [id],
              hideSources: true,
            },
            options.signal,
          );
          id = this.layers.project.activeLayerId;
          break;
        }
        case "boolean.create": {
          const modifiers = this.layers.project.layerStack.get(id).booleanModifiers ?? [];
          this.layers.setBooleanModifiers(id, [
            ...modifiers,
            {
              id: newId(),
              sourceId: command.sourceId,
              operation: command.operation,
              enabled: true,
            },
          ]);
          break;
        }
        case "boolean.update":
          this.layers.setBooleanModifiers(id, validateModifiers(command.modifiers));
          break;
        case "boolean.remove": {
          const modifiers = this.layers.project.layerStack.get(id).booleanModifiers ?? [];
          if (!modifiers.some((m) => m.id === command.modifierId))
            this.fail("not_found", "Boolean modifier does not exist.");
          this.layers.setBooleanModifiers(
            id,
            modifiers.filter((m) => m.id !== command.modifierId),
          );
          break;
        }
        case "boolean.bake":
          if (!this.layers.project.layerStack.get(id).booleanModifiers?.length)
            this.fail("unsupported", "Object has no live Boolean modifiers.");
          await this.layers.bake(
            { name: "Boolean baked", resolution: 128, hideSources: true, sourceIds: [id] },
            options.signal,
          );
          id = this.layers.project.activeLayerId;
          break;
        case "primitive.create":
          id = (
            await this.layers.regeneratePrimitive(
              source ?? this.fail("invalid_input", "Primitive source required."),
              undefined,
              options.signal,
            )
          ).id;
          break;
        case "primitive.update":
          await this.layers.regeneratePrimitive(
            source ?? this.fail("invalid_input", "Primitive source required."),
            id,
            options.signal,
          );
          break;
        case "object.transform":
          this.layers.setActiveTransform(
            transform ?? this.fail("invalid_input", "Transform required."),
          );
          break;
        case "object.rename":
          this.layers.renameNode(id, command.name);
          break;
        case "object.delete":
          this.layers.deleteObject(id);
          break;
        case "primitive.bake": {
          const layer = this.layers.runtime(id).layer;
          await this.layers.bake(
            {
              name: `${layer.name} baked`.slice(0, 128),
              resolution: layer.volume.resolution,
              sourceIds: [id],
              hideSources: true,
            },
            options.signal,
          );
          id = this.layers.project.activeLayerId;
          break;
        }
      }
      return { ok: true, revision: this.revision, value: { id } };
    } catch (e) {
      if (selected && this.layers.recoveryReady) {
        this.layers.select(selected);
        if (group) this.layers.selectGroup(group);
      }
      return this.error(
        options.signal?.aborted
          ? new CommandError("cancelled", "Operation cancelled; source retained.")
          : e,
      );
    } finally {
      if (selected) this.pending = false;
    }
  }
}
