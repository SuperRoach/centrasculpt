import type { IndependentLayers } from "./independent-layers";
import { LayerGroup } from "./layer-hierarchy";
import { newId } from "./layers";
import { type BooleanModifier, validateModifiers } from "./live-boolean";
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
export type QueryValue<Q extends ModellingQuery> = Q extends { type: "scene.summary" }
  ? SceneSummary
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
  ): Promise<ModellingResult<{ id: string }>> {
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
        ].includes(command.type)
      )
        this.fail("unsupported", "Unsupported command.");
      let source: PrimitiveSource | undefined, transform: VolumeTransform | undefined;
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
      // Generation uses the same selected-source ownership rules as desktop and XR.
      this.layers.selectedGroupId = null;
      if ("id" in command) {
        if (this.node(command.id) instanceof LayerGroup) this.layers.selectGroup(command.id);
        else this.layers.select(command.id);
      }
      switch (command.type) {
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
