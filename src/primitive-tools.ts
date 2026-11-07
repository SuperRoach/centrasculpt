import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  Group,
  type Matrix4,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import { AssemblyControls } from "./assembly-controls";
import { EnclosureControls } from "./enclosure-controls";
import type { IndependentLayers } from "./independent-layers";
import { ModellingAPI, type ModellingCommand } from "./modelling-api";
import type { ArrayDefinition } from "./object-array";
import {
  PRIMITIVE_KINDS,
  type PrimitiveSource,
  primitiveDimensions,
  primitiveFields,
  primitiveWorldDimensions,
  validatePrimitive,
} from "./parametric-primitive";
import { fromDisplay, toDisplay } from "./physical-units";
import { identityTransform, type Vec3 } from "./transform";
import type { XRControllerState } from "./xr-input";
import type { MenuContent } from "./xr-menu-model";
/** Source editing and temporary placement. Preview is never an export/compositor source. */
export class PrimitiveTools {
  readonly assembly: AssemblyControls;
  readonly enclosure: EnclosureControls;
  draft: PrimitiveSource = { kind: "box", width: 0.5, height: 0.5, depth: 0.5 };
  editing = true;
  private lastTime = 0;
  placing = false;
  pending = false;
  feedback = "Choose a type · Place preview · release menu · Tool trigger confirms";
  readonly preview: Mesh<BufferGeometry, MeshBasicMaterial> = new Mesh(
    new BoxGeometry(1, 1, 1),
    new MeshBasicMaterial({ color: "#70d5ba", wireframe: true, depthTest: false }),
  );
  readonly previewRoot = new Group();
  private position: Vec3 = [0, 0, 0];
  private armed = false;
  private owner = -1;
  private project?: object;
  private abort?: AbortController;
  private field = "";
  private entry = "";
  private arrayCount = 4;
  private arrayKind: "linear" | "radial" = "radial";
  private arrayAxis = 2;
  private arrayAngle = 360;
  private arraySpacing = 10;
  private arrayScale = 100;
  private arrayOrientation: "rotate" | "retain" = "retain";
  private arrayMenu = false;
  constructor(
    readonly layers: () => IndependentLayers,
    private readonly changed: () => void = () => {},
  ) {
    this.assembly = new AssemblyControls(layers, changed);
    this.enclosure = new EnclosureControls(layers, changed);
    this.previewRoot.matrixAutoUpdate = false;
    this.previewRoot.add(this.preview);
    this.preview.visible = false;
    this.preview.raycast = () => {};
  }
  get source() {
    return this.editing && !this.layers().selectedGroupId
      ? this.layers().active.layer.primitive
      : undefined;
  }
  get settings() {
    return this.layers().display.precision;
  }
  select(kind: PrimitiveSource["kind"]): void {
    if (!PRIMITIVE_KINDS.includes(kind)) throw new Error("Unknown primitive type.");
    this.editing = false;
    const size = Math.max(...primitiveDimensions(this.draft));
    this.draft =
      kind === "box"
        ? { kind, width: size, height: size, depth: size }
        : kind === "cylinder"
          ? { kind, diameter: size, height: size }
          : { kind, diameter: size };
    this.updatePreview();
  }
  begin(): void {
    if (!this.layers().recoveryReady || this.pending)
      throw new Error("Finish the current edit first.");
    this.feedback =
      "Tool hand positions preview · Tool stick sizes · release trigger, then tap to confirm · Support menu cancels";
    this.lastTime = performance.now();
    this.project = this.layers().project;
    this.placing = true;
    this.armed = false;
    this.owner = -1;
    this.updatePreview();
  }
  cancel(): void {
    this.assembly.cancelPick();
    this.enclosure.cancel();
    this.abort?.abort();
    this.placing = false;
    this.preview.visible = false;
    this.armed = false;
  }
  private updatePreview(): void {
    this.preview.geometry.dispose();
    this.preview.geometry =
      this.draft.kind === "box"
        ? new BoxGeometry(1, 1, 1)
        : this.draft.kind === "cylinder"
          ? new CylinderGeometry(
              (this.draft.kind === "cylinder"
                ? (this.draft.topDiameter ?? this.draft.diameter)
                : 1) /
                primitiveDimensions(this.draft)[0] /
                2,
              (this.draft.kind === "cylinder"
                ? (this.draft.bottomDiameter ?? this.draft.diameter)
                : 1) /
                primitiveDimensions(this.draft)[0] /
                2,
              1,
              48,
            )
          : new SphereGeometry(0.5, 48, 32);
    this.preview.scale.set(...primitiveDimensions(this.draft));
  }
  async create(position: Vec3 = [0, 0, 0]): Promise<void> {
    const pose = identityTransform();
    pose.position = [...position];
    await this.run(async () => {
      await this.layers().regeneratePrimitive(this.draft, undefined, this.abort?.signal, pose);
      this.cancel();
      this.editing = true;
    });
  }
  private async run(action: () => Promise<void>): Promise<void> {
    if (this.pending) return;
    this.pending = true;
    this.abort = new AbortController();
    try {
      await action();
      this.feedback = "Applied · Undo available · source remains editable";
    } catch (e) {
      this.feedback = e instanceof Error ? e.message : "Primitive operation failed";
    } finally {
      this.pending = false;
      this.changed();
    }
  }
  async dimension(field: string, displayValue: number, edit = true): Promise<void> {
    const source = edit ? this.source : this.draft;
    if (
      !source ||
      (!(field in primitiveFields(source)) &&
        !(source.kind === "sphere" && field === "diameter")) ||
      field === "kind"
    )
      throw new Error("Unsupported primitive dimension.");
    const next = validatePrimitive({
      ...source,
      [field]: fromDisplay(displayValue, this.settings),
    });
    if (edit)
      await this.run(async () => {
        await this.layers().regeneratePrimitive(
          next,
          this.layers().active.layer.id,
          this.abort?.signal,
        );
      });
    else {
      this.draft = next;
      this.updatePreview();
    }
  }
  async restoreOriginal(): Promise<void> {
    const layer = this.layers().active.layer;
    const initial = layer.primitiveOriginal;
    if (!layer.primitive || !initial) throw new Error("Select a primitive first.");
    await this.run(async () => {
      await this.layers().regeneratePrimitive(initial, layer.id, this.abort?.signal);
    });
  }
  async bake(): Promise<void> {
    const l = this.layers(),
      source = l.active.layer;
    if (l.selectedGroupId || !source.primitive) throw new Error("Select a primitive first.");
    source.assertEditable();
    await this.run(async () => {
      await l.bake(
        {
          name: `${source.name} baked`.slice(0, 128),
          resolution: source.volume.resolution,
          sourceIds: [source.id],
          hideSources: true,
        },
        this.abort?.signal,
      );
    });
  }
  step(tool: XRControllerState | undefined, pose: Matrix4 | undefined, enabled: boolean): boolean {
    this.enclosure.observeController(tool);
    if (this.assembly.step(tool, pose, enabled)) return true;
    if (!this.placing) return false;
    const l = this.layers();
    if (l.project !== this.project) {
      this.cancel();
      return true;
    }
    if (
      !enabled ||
      !pose ||
      !tool?.connected ||
      !tool.tracked ||
      tool.role !== "tool" ||
      this.pending
    ) {
      this.preview.visible = false;
      this.armed = false;
      return true;
    }
    if (this.owner !== tool.connectionId) {
      this.owner = tool.connectionId;
      this.armed = false;
    }
    const now = performance.now(),
      dt = Math.min(0.05, Math.max(0, (now - this.lastTime) / 1000));
    this.lastTime = now;
    if (tool.stick.available && Math.abs(tool.stick.y) > 0.25) {
      const factor = Math.exp(-tool.stick.y * dt);
      const next = Object.fromEntries(
        Object.entries(this.draft).map(([k, v]) => [k, k === "kind" ? v : Number(v) * factor]),
      );
      try {
        this.draft = validatePrimitive(next);
        this.updatePreview();
      } catch {
        /* Keep last valid size at limits. */
      }
    }
    l.group.updateWorldMatrix(true, false);
    const p = new Vector3(0, 0, -0.25).applyMatrix4(pose);
    l.group.worldToLocal(p);
    this.position = p.toArray() as Vec3;
    const parent = l.group.parent ?? l.group;
    parent.add(this.previewRoot);
    if (parent === l.group) this.previewRoot.matrix.identity();
    else this.previewRoot.matrix.copy(l.group.matrix);
    this.previewRoot.matrixWorldNeedsUpdate = true;
    this.preview.position.copy(p);
    this.preview.visible = true;
    if (!tool.buttons.trigger.pressed) this.armed = true;
    if (this.armed && tool.buttons.trigger.justPressed) {
      this.armed = false;
      void this.create(this.position);
    }
    return true;
  }
  content(): MenuContent {
    if (this.enclosure.open) return this.enclosure.content();
    if (this.assembly.open) return this.assembly.content();
    const buttons: MenuContent["buttons"] = [
      {
        id: "precision:home",
        label: "‹ Measure & Precision",
        rect: { x: 40, y: 140, width: 700, height: 74 },
      },
    ];
    const add = (id: string, label: string, i: number, disabled = false): void => {
      buttons.push({
        id: `primitive:${id}`,
        label,
        disabled:
          id === "cancel" ? false : disabled || this.pending || !this.layers().recoveryReady,
        rect: { x: 40 + (i % 2) * 548, y: 244 + Math.floor(i / 2) * 125, width: 524, height: 112 },
      });
    };
    if (this.field) {
      for (const [i, key] of [
        "7",
        "8",
        "9",
        "4",
        "5",
        "6",
        "1",
        "2",
        "3",
        "0",
        ".",
        "back",
      ].entries())
        add(`key:${key}`, key, i);
      add("apply", `Apply ${this.entry || "…"}`, 12);
      add("cancel-field", "Cancel", 13);
    } else if (this.arrayMenu) {
      const active = this.layers().active.layer,
        array = active.array;
      add(
        "array-scale",
        `Scale per item · ${(array?.scalePerItem ?? this.arrayScale / 100) * 100}%`,
        13,
        !active.editable,
      );
      add("array-home", "‹ Primitives", 0);
      add("array-count", `Repeat count · ${array?.count ?? this.arrayCount}`, 1, !active.editable);
      add("array-kind", `Pattern · ${array?.kind ?? this.arrayKind}`, 2, !active.editable);
      add("array-axis", `Axis · ${"XYZ"[this.arrayAxis]}`, 3, !active.editable);
      add(
        "array-angle",
        `Arc · ${array?.kind === "radial" ? Math.round((array.totalAngleRadians * 180) / Math.PI) : this.arrayAngle}°`,
        4,
        !active.editable,
      );
      add(
        "array-spacing",
        `Spacing · ${array?.kind === "linear" ? (array.spacingModelUnits * this.settings.millimetresPerUnit).toFixed(1) : this.arraySpacing} mm`,
        5,
        !active.editable,
      );
      add(
        "array-orientation",
        `Orientation · ${array?.kind === "radial" ? array.orientation : this.arrayOrientation}`,
        6,
        !active.editable,
      );
      add("array-pivot", "Pivot = selected object centre", 7, !active.editable);
      add(
        "array-apply",
        array ? "Update array preview" : "Create array preview",
        8,
        !active.editable,
      );
      add(
        "array-toggle",
        array?.enabled ? "Disable array" : "Enable array",
        9,
        !array || !active.editable,
      );
      add("array-remove", "Remove array", 10, !array || !active.editable);
      add("array-bake", "Bake instances to sculpt", 11, !array?.enabled || !active.editable);
      add(
        "array-distribution",
        `Distribution · ${array?.kind === "linear" ? (array.centered ? "centred" : "one way") : "centred"}`,
        12,
        !active.editable,
      );
    } else {
      PRIMITIVE_KINDS.forEach((kind, i) => {
        add(`type:${kind}`, `New ${kind}`, i);
      });
      add(
        this.placing ? "cancel" : "place",
        this.placing ? "Cancel placement" : "Place preview…",
        3,
      );
      add("edit", "Edit selected primitive", 4, !this.layers().active.layer.primitive);

      add("unit", `Units · ${this.settings.unit}`, 5);
      const s = this.source ?? this.draft;
      Object.entries(primitiveFields(s))
        .filter(([k]) => k !== "kind" && k !== "cornerRadius")
        .forEach(([k, v], i) => {
          add(
            `field:${k}`,
            `${this.source ? "Selected" : "New"} ${k} · ${toDisplay(Number(v), this.settings).toFixed(3)} ${this.settings.unit}`,
            6 + i,
            !!this.source && !this.layers().active.layer.editable,
          );
        });
      add(
        "restore",
        "Restore initial dimensions",
        12,
        !this.source || !this.layers().active.layer.editable,
      );
      add("bake", "Bake to Sculpt Layer", 9, !this.source || !this.layers().active.layer.editable);
      add("transform", "Exact position / rotation / scale…", 10);
      add("assembly-open", "Assembly / Fit…", 12);
      add("enclosure-open", "Enclosure…", 11);
      add("array-open", "Array / Repeat…", 13, !this.layers().active.layer.editable);
    }
    return {
      title: this.arrayMenu ? "ARRAY / REPEAT" : "PRIMITIVES",
      subtitle: this.arrayMenu
        ? "Editable evaluated instances · count · axis · spacing or arc · pivot · explicit Bake"
        : this.source
          ? `Physical bounds · ${primitiveWorldDimensions(
              this.source,
              this.layers().active.layer.transform,
            )
              .map((v) => toDisplay(v, this.settings).toFixed(3))
              .join(" × ")} ${this.settings.unit} · fields are local`
          : "Editable Box · Cylinder · Sphere · model physical scale",
      buttons,
      labels: [],
      footer: this.feedback,
    };
  }
  private async applyArrayCommand(command: ModellingCommand): Promise<void> {
    const api = new ModellingAPI(this.layers()),
      result = await api.execute(command, { expectedRevision: api.revision });
    if (!result.ok) throw new Error(result.error.message);
    this.feedback = "Array updated · source stays editable · Undo available";
    this.changed();
  }
  private arrayDefinition(): ArrayDefinition {
    const layer = this.layers().active.layer,
      existing = layer.array,
      axis: [number, number, number] =
        this.arrayAxis === 0 ? [1, 0, 0] : this.arrayAxis === 1 ? [0, 1, 0] : [0, 0, 1],
      count = existing?.count ?? this.arrayCount,
      scalePerItem = existing?.scalePerItem ?? this.arrayScale / 100;
    if (this.arrayKind === "linear")
      return {
        id: existing?.id ?? "pending",
        kind: "linear",
        enabled: true,
        count,
        scalePerItem,
        spacingModelUnits:
          existing?.kind === "linear"
            ? existing.spacingModelUnits * this.settings.millimetresPerUnit
            : this.arraySpacing,
        axis: existing?.kind === "linear" ? [...existing.axis] : axis,
        centered: existing?.kind === "linear" ? existing.centered : true,
      };
    return {
      id: existing?.id ?? "pending",
      kind: "radial",
      enabled: true,
      count,
      scalePerItem,
      totalAngleRadians:
        existing?.kind === "radial"
          ? existing.totalAngleRadians
          : (this.arrayAngle * Math.PI) / 180,
      pivot: (existing?.kind === "radial" ? existing.pivot : layer.transform.position).map(
        (v) => v * this.settings.millimetresPerUnit,
      ) as [number, number, number],
      axis: existing?.kind === "radial" ? [...existing.axis] : axis,
      angularOffsetRadians: existing?.kind === "radial" ? existing.angularOffsetRadians : 0,
      orientation: existing?.kind === "radial" ? existing.orientation : this.arrayOrientation,
    };
  }
  activate(id: string): boolean {
    if (this.enclosure.activate(id)) return true;
    if (this.assembly.activate(id)) return true;
    if (!id.startsWith("primitive:")) return false;
    if (id === "primitive:cancel") {
      this.cancel();
      return true;
    }
    if (this.pending || !this.layers().recoveryReady) return true;
    const a = id.slice(10);
    try {
      if (a.startsWith("type:")) {
        this.select(a.slice(5) as PrimitiveSource["kind"]);
      } else if (a === "edit") this.editing = true;
      else if (a === "place") this.begin();
      else if (a === "cancel") this.cancel();
      else if (a.startsWith("field:")) {
        this.field = a.slice(6);
        this.entry = "";
      } else if (a.startsWith("key:"))
        this.entry =
          a === "key:back" ? this.entry.slice(0, -1) : (this.entry + a.slice(4)).slice(0, 24);
      else if (a === "cancel-field") this.field = "";
      else if (a === "apply") {
        if (!this.entry.trim()) throw new Error("Enter a dimension.");
        void this.dimension(this.field, Number(this.entry), !!this.source).catch((e) => {
          this.feedback = String(e);
        });
        this.field = "";
      } else if (a === "restore") void this.restoreOriginal();
      else if (a === "bake") void this.bake();
      else if (a === "unit") {
        const units = ["mm", "cm", "in"] as const;
        this.settings.unit = units[(units.indexOf(this.settings.unit) + 1) % 3];
      } else if (a === "enclosure-open") {
        this.enclosure.open = true;
        this.enclosure.openSelected();
      } else if (a === "assembly-open") this.assembly.open = true;
      else if (a === "array-open") this.arrayMenu = true;
      else if (a === "array-home") this.arrayMenu = false;
      else if (a === "array-scale") {
        const values = [100, 90, 80, 110, 120],
          layer = this.layers().active.layer,
          current = (layer.array?.scalePerItem ?? this.arrayScale / 100) * 100;
        this.arrayScale = values[(values.indexOf(current) + 1) % values.length];
        if (layer.array) {
          const definition = this.arrayDefinition();
          definition.scalePerItem = this.arrayScale / 100;
          void this.applyArrayCommand({ type: "array.update", id: layer.id, definition });
        }
      } else if (a === "array-count") {
        const counts = [4, 6, 8, 12, 16],
          current = this.layers().active.layer.array?.count ?? this.arrayCount;
        this.arrayCount = counts[(counts.indexOf(current) + 1) % counts.length];
        const layer = this.layers().active.layer,
          definition = this.arrayDefinition();
        if (layer.array) {
          definition.count = this.arrayCount;
          void this.applyArrayCommand({ type: "array.update", id: layer.id, definition });
        }
      } else if (a === "array-kind") {
        this.arrayKind =
          (this.layers().active.layer.array?.kind ?? this.arrayKind) === "radial"
            ? "linear"
            : "radial";
      } else if (a === "array-axis") {
        this.arrayAxis = (this.arrayAxis + 1) % 3;
        const layer = this.layers().active.layer,
          definition = this.arrayDefinition();
        definition.axis =
          this.arrayAxis === 0 ? [1, 0, 0] : this.arrayAxis === 1 ? [0, 1, 0] : [0, 0, 1];
        if (layer.array)
          void this.applyArrayCommand({ type: "array.update", id: layer.id, definition });
      } else if (a === "array-angle") {
        const values = [90, 180, 270, 360],
          layer = this.layers().active.layer,
          current =
            layer.array?.kind === "radial"
              ? Math.round((layer.array.totalAngleRadians * 180) / Math.PI)
              : this.arrayAngle;
        this.arrayAngle = values[(values.indexOf(current) + 1) % values.length];
        if (layer.array?.kind === "radial") {
          const definition = this.arrayDefinition() as Extract<ArrayDefinition, { kind: "radial" }>;
          definition.totalAngleRadians = (this.arrayAngle * Math.PI) / 180;
          void this.applyArrayCommand({ type: "array.update", id: layer.id, definition });
        }
      } else if (a === "array-spacing") {
        const values = [5, 10, 20, 40],
          layer = this.layers().active.layer,
          current =
            layer.array?.kind === "linear"
              ? layer.array.spacingModelUnits * this.settings.millimetresPerUnit
              : this.arraySpacing;
        this.arraySpacing = values[(values.indexOf(current) + 1) % values.length];
        if (layer.array?.kind === "linear") {
          const definition = this.arrayDefinition() as Extract<ArrayDefinition, { kind: "linear" }>;
          definition.spacingModelUnits = this.arraySpacing;
          void this.applyArrayCommand({ type: "array.update", id: layer.id, definition });
        }
      } else if (a === "array-orientation") {
        const layer = this.layers().active.layer,
          current =
            layer.array?.kind === "radial" ? layer.array.orientation : this.arrayOrientation;
        this.arrayOrientation = current === "rotate" ? "retain" : "rotate";
        if (layer.array?.kind === "radial") {
          const definition = this.arrayDefinition() as Extract<ArrayDefinition, { kind: "radial" }>;
          definition.orientation = this.arrayOrientation;
          void this.applyArrayCommand({ type: "array.update", id: layer.id, definition });
        }
      } else if (a === "array-pivot") {
        const layer = this.layers().active.layer;
        if (layer.array?.kind === "radial") {
          const definition = this.arrayDefinition() as Extract<ArrayDefinition, { kind: "radial" }>;
          definition.pivot = layer.transform.position.map(
            (v) => v * this.settings.millimetresPerUnit,
          ) as [number, number, number];
          void this.applyArrayCommand({ type: "array.update", id: layer.id, definition });
        }
      } else if (a === "array-distribution") {
        const layer = this.layers().active.layer;
        if (layer.array?.kind === "linear") {
          const definition = this.arrayDefinition() as Extract<ArrayDefinition, { kind: "linear" }>;
          definition.centered = !layer.array.centered;
          void this.applyArrayCommand({ type: "array.update", id: layer.id, definition });
        }
      } else if (a === "array-apply") {
        const layer = this.layers().active.layer,
          definition = this.arrayDefinition();
        if (layer.array)
          void this.applyArrayCommand({ type: "array.update", id: layer.id, definition });
        else {
          const { id: _id, ...definitionWithoutId } = definition;
          void this.applyArrayCommand({
            type: "array.create",
            id: layer.id,
            definition: definitionWithoutId,
          });
        }
      } else if (a === "array-toggle") {
        const layer = this.layers().active.layer;
        if (layer.array)
          void this.applyArrayCommand({
            type: "array.update",
            id: layer.id,
            definition: {
              ...this.arrayDefinition(),
              id: layer.array.id,
              enabled: !layer.array.enabled,
            },
          });
      } else if (a === "array-remove") {
        void this.applyArrayCommand({ type: "array.remove", id: this.layers().active.layer.id });
      } else if (a === "array-bake") {
        void this.applyArrayCommand({ type: "array.bake", id: this.layers().active.layer.id });
      }
    } catch (e) {
      this.feedback = e instanceof Error ? e.message : "Invalid primitive";
    }
    return true;
  }
  dispose(): void {
    this.assembly.dispose();
    this.enclosure.dispose();
    this.cancel();
    this.previewRoot.removeFromParent();
    this.preview.removeFromParent();
    this.preview.geometry.dispose();
    this.preview.material.dispose();
  }
}
