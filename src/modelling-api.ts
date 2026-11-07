import { type FitReport, partMembers, partOwner } from "./assembly";
import {
  type ConnectorOptions,
  exportPartSTL,
  generateConnector,
  inspectAssembly,
  inspectLayers,
  type MateOptions,
  mateParts,
  partBounds,
} from "./assembly-tools";
import { type EnclosureIntent, EnclosureRecipes } from "./enclosure-recipe";
import { IndependentLayers } from "./independent-layers";
import { LayerGroup } from "./layer-hierarchy";
import { LayerStack, newId, SculptProject, SdfLayer, validateAssemblyPart } from "./layers";
import { type BooleanModifier, validateModifiers } from "./live-boolean";
import { type ArrayDefinition, validateArrayDefinition } from "./object-array";
import { objectDimensions } from "./object-dimensions";
import {
  type PrimitiveInput,
  type PrimitiveSource,
  primitiveWorldDimensions,
  validatePrimitive,
} from "./parametric-primitive";
import { type PhysicalUnit, unitMM } from "./physical-units";
import { MAX_PROJECT_LAYERS } from "./project";
import { type Vec3, type VolumeTransform, validateTransform } from "./transform";

/** Dimensions are local, translations are sculpture-world coordinates, rotations XYZ radians.
 * Scale is dimensionless. Workspace navigation is deliberately excluded. */
export type ModellingCommand =
  | { type: "group.create"; name: string }
  | { type: "object.parent"; id: string; parentId: string | null }
  | { type: "object.flag"; id: string; flag: "visible" | "locked"; value: boolean }
  | { type: "object.duplicate"; id: string }
  | { type: "part.inspect"; partA: string; partB: string }
  | { type: "part.define"; objectId: string; clearanceMM: number; enclosure?: EnclosureIntent }
  | { type: "part.remove"; partId: string }
  | { type: "part.assign"; objectId: string; partId: string | null }
  | { type: "part.select"; partId: string }
  | { type: "part.clearance"; partId: string; clearanceMM: number }
  | { type: "part.mate"; options: MateOptions }
  | { type: "connector.create"; options: ConnectorOptions }
  | {
      type: "array.create";
      id: string;
      unit?: PhysicalUnit;
      definition: Omit<ArrayDefinition, "id"> & { id?: string };
    }
  | { type: "array.update"; id: string; unit?: PhysicalUnit; definition: ArrayDefinition }
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
  | { type: "primitive.create"; unit: PhysicalUnit; source: PrimitiveInput }
  | { type: "primitive.update"; id: string; unit: PhysicalUnit; source: PrimitiveInput }
  | { type: "object.transform"; id: string; unit: PhysicalUnit; transform: VolumeTransform }
  | { type: "object.rename"; id: string; name: string }
  | { type: "primitive.bake"; id: string }
  | { type: "object.delete"; id: string };
export type ModellingQuery =
  | { type: "enclosure.inspect"; baseId: string; lidId: string }
  | { type: "enclosure.samples"; baseId: string; lidId: string }
  | { type: "scene.hierarchy" }
  | { type: "assembly.parts" }
  | { type: "geometry.bounds"; id: string }
  | { type: "geometry.diagnostics"; id: string }
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
export type QueryValue<Q extends ModellingQuery> = Q extends { type: "enclosure.inspect" }
  ? ReturnType<EnclosureRecipes["inspect"]>
  : Q extends { type: "enclosure.samples" }
    ? ReturnType<EnclosureRecipes["samples"]>
    : Q extends { type: "scene.hierarchy" }
      ? ReturnType<IndependentLayers["project"]["layerStack"]["hierarchy"]["snapshot"]>
      : Q extends { type: "geometry.bounds" }
        ? { units: "mm"; min: number[]; max: number[]; accuracy: "conservative" }
        : Q extends { type: "geometry.diagnostics" }
          ? { status: "not_evaluated"; limitations: string[]; triangles: number | null }
          : Q extends { type: "part.list" | "assembly.parts" }
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
/** `$alias` references resolve only to earlier results in this ordered batch. */
export type ModellingStep = { command: ModellingCommand; as?: string };
export type BatchOptions = {
  expectedRevision: string;
  signal?: AbortSignal;
  dryRun?: boolean;
  preserveSelection?: boolean;
};
export type BatchReport = {
  dryRun: boolean;
  results: { id: string }[];
  aliases: Record<string, string>;
  objects: ObjectMetadata[];
  changes: { created: string[]; modified: string[]; deleted: string[] };
  limits: { commands: number; layers: number; memoryBytes: number };
  geometryValidation: "source_caches_only";
  limitations: string[];
};
class CommandError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}
/** Local adapter over the authoritative editor. No DOM, XR, transport or voxel ownership.
 * execute() applies one operation; batch() explicitly groups ordered operations. */
export class ModellingAPI {
  private pending = false;
  get enclosure() {
    return new EnclosureRecipes(this, this.layers);
  }
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
      arrayUnit: "mm" as const,
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
      dimensionsAccuracy:
        layer?.array?.enabled || layer?.booleanModifiers?.length
          ? "source_only"
          : "source_geometry",
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
  private convertSource(source: PrimitiveInput, factor: number): PrimitiveSource {
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
      if (this.layers.modellingBusy) this.fail("busy", "A modelling transaction is active.");
      let value: unknown;
      switch (query.type) {
        case "enclosure.inspect":
          value = this.enclosure.inspect(query.baseId, query.lidId);
          break;
        case "enclosure.samples":
          value = this.enclosure.samples(query.baseId, query.lidId);
          break;
        case "scene.hierarchy":
          value = structuredClone(this.layers.project.layerStack.hierarchy.snapshot());
          break;
        case "geometry.bounds": {
          this.node(query.id);
          if (!this.layers.recoveryReady) this.fail("busy", "Geometry is being edited.");
          const box = partBounds(this.layers, query.id, true),
            mm = this.layers.display.precision.millimetresPerUnit;
          value = {
            units: "mm",
            min: box.min.toArray().map((v) => v * mm),
            max: box.max.toArray().map((v) => v * mm),
            accuracy: "conservative",
          };
          break;
        }
        case "geometry.diagnostics": {
          const node = this.node(query.id);
          value = {
            status: "not_evaluated",
            triangles: node instanceof LayerGroup ? null : this.layers.runtime(query.id).triangles,
            limitations: [
              "Source preview triangle count is not evaluated Boolean topology.",
              "Use diagnostics() for STL mesh topology and fit samples; no physical printability guarantee.",
            ],
          };
          break;
        }
        case "assembly.parts":
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
  /** Executes existing operations, retaining only normal history deltas/runtimes.
   * Dry runs use independent metadata/runtimes, borrowing existing fields read-only. */
  async batch(
    steps: readonly ModellingStep[],
    options: BatchOptions,
  ): Promise<ModellingResult<BatchReport>> {
    let owner: symbol | undefined, checkpoint: number | undefined;
    let temporary: IndependentLayers | undefined;
    let admitted = false;
    try {
      if (!this.canEdit()) this.fail("permission_denied", "Editing is not permitted.");
      if (this.pending || this.layers.modellingBusy || !this.layers.recoveryReady)
        this.fail("busy", "Editor has an active operation.");
      if (options.expectedRevision !== this.revision)
        this.fail("revision_conflict", "Scene changed; query again before editing.");
      if (options.signal?.aborted) this.fail("cancelled", "Operation cancelled.");
      if (!Array.isArray(steps) || !steps.length || steps.length > 64)
        this.fail("invalid_input", "A batch requires 1–64 commands.");
      const encoded = JSON.stringify(steps, (_key, value) => {
        if (typeof value === "number" && !Number.isFinite(value))
          this.fail("invalid_input", "Numbers must be finite.");
        return value;
      });
      if (encoded.length > 65536) this.fail("invalid_input", "Command payload exceeds 64 KiB.");
      const input = JSON.parse(encoded) as ModellingStep[];
      const names = new Set<string>();
      for (const step of input) {
        if (!step || !step.command || typeof step.command.type !== "string")
          this.fail("invalid_input", "Each step requires a command.");
        if (step.as !== undefined) {
          if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(step.as) || names.has(step.as))
            this.fail("invalid_input", "Aliases must be unique identifiers.");
          names.add(step.as);
        }
        // Explicit allow-list: dry-run must never write borrowed SDF/mask/paint stores.
        if (
          ![
            "group.create",
            "object.parent",
            "object.flag",
            "object.duplicate",
            "part.define",
            "part.remove",
            "part.assign",
            "part.clearance",
            "part.mate",
            "array.create",
            "array.update",
            "array.remove",
            "array.bake",
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
          ].includes(step.command.type)
        )
          this.fail("unsupported", "This command is not supported inside a modelling batch.");
      }
      this.pending = true;
      admitted = true;
      let target = this.layers;
      if (options.dryRun) {
        if (this.layers.trackedBytes > 128 * 1024 ** 2)
          this.fail("operation_failed", "Dry-run staging exceeds its 128 MiB source budget.");
        const original = this.layers.project,
          stack = new LayerStack(
            original.layerStack.layers.map((l) => new SdfLayer(l.volume, l.metadata())),
            original.activeLayerId,
          );
        stack.hierarchy.restore(structuredClone(original.layerStack.hierarchy.snapshot()));
        const project = new SculptProject(
          stack,
          structuredClone(original.settings),
          original.name,
          original.id,
        );
        project.displayPreferences = structuredClone(
          this.layers.display.snapshot(project.id, stack.layers),
        );
        temporary = new IndependentLayers(project);
        temporary.selectedGroupId = this.layers.selectedGroupId;
        target = temporary;
      }
      const api = new ModellingAPI(target, this.canEdit);
      const selectedBefore = target.project.activeLayerId;
      const groupBefore = target.selectedGroupId;
      const calibration = target.display.precision.millimetresPerUnit;
      const beforeObjects = new Map(
        [...target.project.layerStack.layers, ...target.project.layerStack.hierarchy.groups].map(
          (n) => [n.id, JSON.stringify(api.objectMetadata(n.id))],
        ),
      );
      owner = target.acquireModellingLease();
      const start = target.withModellingLease(owner, () => target.assemblyCheckpoint());
      checkpoint = start;
      const aliases: Record<string, string> = {},
        results: { id: string }[] = [];
      const referenceKeys = new Set([
        "id",
        "objectId",
        "parentId",
        "sourceId",
        "partId",
        "moving",
        "target",
        "pegPart",
        "socketPart",
      ]);
      const resolve = (value: unknown, key = ""): unknown => {
        if (referenceKeys.has(key) && typeof value === "string" && value.startsWith("$")) {
          return Object.hasOwn(aliases, value.slice(1))
            ? aliases[value.slice(1)]
            : this.fail("not_found", `Unknown prior result ${value}.`);
        }
        if (Array.isArray(value)) return value.map((v) => resolve(v));
        if (value && typeof value === "object")
          return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v, k)]));
        return value;
      };
      for (const step of input) {
        if (options.signal?.aborted) this.fail("cancelled", "Operation cancelled.");
        const command = resolve(step.command) as ModellingCommand;
        const result = await target.withModellingLease(owner, () =>
          api.executeCommand(command, { expectedRevision: api.revision, signal: options.signal }),
        );
        if (!result.ok) throw new CommandError(result.error.code, result.error.message);
        if (target.display.precision.millimetresPerUnit !== calibration)
          this.fail("revision_conflict", "Physical calibration changed during the batch.");
        results.push({ id: result.value.id });
        if (step.as) aliases[step.as] = result.value.id;
      }
      if (options.signal?.aborted) this.fail("cancelled", "Operation cancelled.");
      if (options.dryRun && this.revision !== options.expectedRevision)
        this.fail("revision_conflict", "Scene changed during dry-run.");
      const objects = target.withModellingLease(owner, () =>
        [...target.project.layerStack.layers, ...target.project.layerStack.hierarchy.groups].map(
          (n) => api.objectMetadata(n.id),
        ),
      );
      target.withModellingLease(owner, () => {
        if (options.preserveSelection) {
          if (target.project.layerStack.layers.some((l) => l.id === selectedBefore))
            target.select(selectedBefore);
          if (
            groupBefore &&
            target.project.layerStack.hierarchy.groups.some((g) => g.id === groupBefore)
          )
            target.selectGroup(groupBefore);
        }
        target.finishAssemblyTransaction(start);
      });
      checkpoint = undefined;
      target.releaseModellingLease(owner);
      owner = undefined;
      return {
        ok: true,
        revision: this.revision,
        value: {
          dryRun: !!options.dryRun,
          results,
          aliases,
          objects,
          changes: {
            created: objects.filter((o) => !beforeObjects.has(o.id)).map((o) => o.id),
            modified: objects
              .filter(
                (o) => beforeObjects.has(o.id) && beforeObjects.get(o.id) !== JSON.stringify(o),
              )
              .map((o) => o.id),
            deleted: [...beforeObjects.keys()].filter((id) => !objects.some((o) => o.id === id)),
          },
          limits: { commands: 64, layers: MAX_PROJECT_LAYERS, memoryBytes: 256 * 1024 ** 2 },
          geometryValidation: "source_caches_only",
          limitations: [
            "Source caches are evaluated with backend resource limits; final Boolean/STL topology and physical fit are not validated.",
            "Dry-run object IDs are provisional; use aliases when executing the real batch.",
          ],
        },
      };
    } catch (error) {
      const target = temporary ?? this.layers;
      const failedCheckpoint = checkpoint;
      if (owner && failedCheckpoint !== undefined)
        target.withModellingLease(owner, () =>
          target.rollbackAssemblyTransaction(failedCheckpoint),
        );
      return this.error(
        options.signal?.aborted
          ? new CommandError("cancelled", "Operation cancelled; batch rolled back.")
          : error,
      );
    } finally {
      if (owner) (temporary ?? this.layers).releaseModellingLease(owner);
      temporary?.dispose();
      if (admitted) this.pending = false;
    }
  }
  /** Explicit asynchronous geometry evaluation. Reports refer to sampled/evaluated meshes,
   * never a certification that the physical object will print or fit. */
  async diagnostics(
    request: { id: string; otherId?: string; clearanceMM?: number },
    signal?: AbortSignal,
  ) {
    try {
      if (this.layers.modellingBusy || !this.layers.recoveryReady)
        this.fail("busy", "Editor has an active operation.");
      if (signal?.aborted) this.fail("cancelled", "Diagnostics cancelled.");
      if (
        request.clearanceMM !== undefined &&
        (!Number.isFinite(request.clearanceMM) ||
          request.clearanceMM < 0 ||
          request.clearanceMM > 1000)
      )
        this.fail("invalid_input", "Clearance must be 0–1000 mm.");
      this.node(request.id);
      if (request.otherId) this.node(request.otherId);
      const revision = this.revision;
      const fit = request.otherId
        ? await inspectLayers(
            this.layers,
            request.id,
            request.otherId,
            request.clearanceMM ?? 0,
            signal,
          )
        : null;
      const layer = this.layers.project.layerStack.layers.find((l) => l.id === request.id);
      const report = layer?.assemblyPart
        ? (await exportPartSTL(this.layers, request.id, signal)).report
        : null;
      if (revision !== this.revision)
        this.fail("revision_conflict", "Scene changed during diagnostics.");
      return {
        ok: true as const,
        revision,
        value: {
          fit,
          print: report,
          topologyAccuracy: report ? "exact_on_exported_mesh" : "unsupported",
          fitAccuracy: fit ? "sampled_approximation" : "not_evaluated",
          limitations: [
            "STL topology requires a printable part; mark the desired root with part.define.",
            "Topology is checked on the sampled export mesh, not the analytic solid. Physical printability/fit is not guaranteed.",
          ],
        },
      };
    } catch (e) {
      return this.error(
        signal?.aborted ? new CommandError("cancelled", "Diagnostics cancelled.") : e,
      );
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
    if (this.layers.modellingBusy)
      return this.error(new CommandError("busy", "A modelling transaction is active."));
    return this.executeCommand(command, options);
  }
  private async executeCommand(
    command: ModellingCommand,
    options: { expectedRevision: string; signal?: AbortSignal },
  ): Promise<ModellingResult<{ id: string; fit?: FitReport }>> {
    let selected: string | undefined,
      group: string | null = null;
    try {
      if (!command || typeof command !== "object" || typeof command.type !== "string")
        this.fail("invalid_input", "Command type is required.");
      if (!this.canEdit()) this.fail("permission_denied", "Editing is not permitted.");
      if (this.pending || !this.layers.recoveryReady)
        this.fail("busy", "Editor has an active operation.");
      if (options.expectedRevision !== this.revision)
        this.fail("revision_conflict", "Scene changed; query again before editing.");
      if (options.signal?.aborted) this.fail("cancelled", "Operation cancelled.");
      if (
        ![
          "group.create",
          "object.parent",
          "object.flag",
          "object.duplicate",
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
        if (command.type === "boolean.update") validateModifiers(command.modifiers);
        if (
          command.type === "boolean.create" &&
          !["union", "difference", "intersect"].includes(command.operation)
        )
          throw new Error("Invalid Boolean operation.");
        if (command.type === "object.transform") {
          const f = this.factor(command.unit);
          transform = validateTransform({
            ...command.transform,
            position: command.transform.position.map((v) => v * f) as Vec3,
          });
        }
        if (command.type === "array.create" || command.type === "array.update") {
          const raw = structuredClone(command.definition) as ArrayDefinition;
          const factor = this.factor(command.unit ?? "mm");
          if (raw.kind === "radial") raw.pivot = raw.pivot.map((v) => v * factor) as Vec3;
          if (raw.kind === "linear") raw.spacingModelUnits *= factor;
          arrayDefinition = validateArrayDefinition({ ...raw, id: raw.id ?? newId() });
        }
        if (
          command.type === "object.flag" &&
          (!["visible", "locked"].includes(command.flag) || typeof command.value !== "boolean")
        )
          throw new Error("Invalid object flag.");
        if (
          (command.type === "object.rename" || command.type === "group.create") &&
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
          validateAssemblyPart({
            clearanceMM: command.clearanceMM,
            ...(command.type === "part.define" ? { enclosure: command.enclosure } : {}),
          });
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
        const flagRecovery =
          command.type === "object.flag" &&
          !this.layers.project.layerStack.hierarchy.parentsLocked(command.id) &&
          ((command.flag === "locked" && !command.value) ||
            (command.flag === "visible" && command.value && !node.locked));
        if (!node.editable && !flagRecovery)
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
        case "group.create":
          id = this.layers.createGroup(command.name);
          break;
        case "object.parent":
          if (command.parentId) this.node(command.parentId);
          this.layers.reparent(id, command.parentId);
          break;
        case "object.flag":
          this.layers.setNodeFlag(id, command.flag, command.value);
          break;
        case "object.duplicate":
          if (this.node(id) instanceof LayerGroup)
            this.fail("unsupported", "Group duplication is unsupported.");
          id = (await this.layers.duplicateAsync(id, options.signal)).id;
          break;
        case "part.define":
          this.node(command.objectId);
          id = command.objectId;
          this.layers.setAssemblyPart(id, {
            clearanceMM: command.clearanceMM,
            ...(command.type === "part.define"
              ? { enclosure: command.enclosure }
              : { enclosure: this.layers.project.layerStack.get(id).assemblyPart?.enclosure }),
          });
          break;
        case "part.remove":
          this.partMetadata(command.partId);
          id = command.partId;
          this.layers.setAssemblyPart(id, undefined);
          break;
        case "part.clearance":
          this.partMetadata(command.partId);
          id = command.partId;
          this.layers.setAssemblyPart(id, {
            clearanceMM: command.clearanceMM,
            enclosure: this.layers.project.layerStack.get(id).assemblyPart?.enclosure,
          });
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
      if (selected && this.layers.recoveryReady && !this.layers.modellingBusy) {
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
