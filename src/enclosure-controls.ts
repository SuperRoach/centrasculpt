import { Group, Mesh, MeshBasicMaterial, Vector3 } from "three";
import { partOwner } from "./assembly";
import { previewAssembly } from "./assembly-tools";
import { DEFAULT_ENCLOSURE, type EnclosureParameters, enclosurePlan } from "./enclosure-recipe";
import type { IndependentLayers } from "./independent-layers";
import { ModellingAPI } from "./modelling-api";
import { roundedBoxGeometry } from "./parametric-primitive";
import { transformMatrix } from "./transform";
import type { XRControllerState } from "./xr-input";
import type { MenuContent } from "./xr-menu-model";
export const ENCLOSURE_FIELDS = {
  innerWidthMm: "Inside width",
  innerDepthMm: "Inside depth",
  innerHeightMm: "Inside height",
  wallThicknessMm: "Wall thickness",
  floorThicknessMm: "Floor thickness",
  cornerRadiusMm: "Outer corner radius",
  clearanceMm: "Lid clearance per side",
  lipDepthMm: "Lip depth",
  thicknessMm: "Lid plate thickness",
} as const;
export type EnclosureField = keyof typeof ENCLOSURE_FIELDS;
/** Shared staged workflow: provisional wire sources and review, then one command transaction. */
export class EnclosureControls {
  open = false;
  parameters = structuredClone(DEFAULT_ENCLOSURE);
  feedback = "Set the size, preview your changes, then apply. All sizes are in mm.";
  pending = false;
  private project?: object;
  private abort?: AbortController;
  private controllerOwner = "";
  private field: EnclosureField | "" = "";
  private entry = "";
  private pair?: { base: string; lid: string };
  private staged?: {
    revision: string;
    parameters: EnclosureParameters;
    editor: IndependentLayers;
    pair?: { base: string; lid: string };
  };
  readonly preview = new Group();
  constructor(
    readonly layers: () => IndependentLayers,
    private readonly changed: () => void = () => {},
  ) {
    this.preview.name = "Enclosure staged source preview";
    this.preview.userData.previewOnly = true;
  }
  get ready() {
    this.sync();
    return !!this.staged && this.staged.revision === this.layers().modellingRevision;
  }
  get mode() {
    return this.pair ? "Update" : "Create";
  }
  value(key: EnclosureField): number {
    return key in this.parameters.lid
      ? this.parameters.lid[key as keyof Omit<EnclosureParameters["lid"], "type">]
      : this.parameters[key as keyof Omit<EnclosureParameters, "units" | "name" | "lid">];
  }
  set(key: EnclosureField, value: number) {
    if (this.pending) return;
    if (!Object.hasOwn(ENCLOSURE_FIELDS, key) || !Number.isFinite(value))
      throw new Error("Enter a finite dimension.");
    if (key in this.parameters.lid) Object.assign(this.parameters.lid, { [key]: value });
    else Object.assign(this.parameters, { [key]: value });
    this.clearStage();
  }
  sync() {
    const p = this.layers().project;
    if (this.project && p !== this.project) {
      this.cancel();
      this.pair = undefined;
      this.parameters = structuredClone(DEFAULT_ENCLOSURE);
    }
    this.project = p;
    if (this.staged && this.staged.revision !== this.layers().modellingRevision) this.clearStage();
  }
  private clearStage() {
    this.staged = undefined;
    this.preview.removeFromParent();
    for (const child of [...this.preview.children]) {
      const mesh = child as Mesh;
      mesh.geometry.dispose();
      (mesh.material as MeshBasicMaterial).dispose();
      this.preview.remove(mesh);
    }
  }
  cancel() {
    this.abort?.abort();
    this.clearStage();
    this.field = "";
    this.feedback = "Preview cancelled. Applied changes can be undone.";
  }
  newRecipe() {
    this.cancel();
    this.pair = undefined;
    this.parameters = structuredClone(DEFAULT_ENCLOSURE);
  }
  openSelected() {
    this.sync();
    if (this.pending || this.pair || this.staged) return;
    const stack = this.layers().project.layerStack,
      root = partOwner(stack, stack.activeLayerId);
    if (root && stack.get(root).assemblyPart?.enclosure) {
      try {
        this.editSelected();
      } catch (e) {
        this.feedback = e instanceof Error ? e.message : String(e);
      }
    }
  }
  editSelected() {
    this.sync();
    const l = this.layers(),
      stack = l.project.layerStack,
      root = partOwner(stack, l.project.activeLayerId);
    const intent = root ? stack.get(root).assemblyPart?.enclosure : undefined;
    if (!root || !intent) throw new Error("Select an enclosure Base or Lid first.");
    const others = stack.layers.filter(
      (n) =>
        n.id !== root &&
        n.assemblyPart?.enclosure?.role !== intent.role &&
        JSON.stringify(n.assemblyPart?.enclosure?.parameters) === JSON.stringify(intent.parameters),
    );
    if (others.length !== 1)
      throw new Error(
        "Select a matching base and lid. More than one matching pair was found, or a part is missing.",
      );
    const pair =
      intent.role === "base"
        ? { base: root, lid: others[0].id }
        : { base: others[0].id, lid: root };
    new ModellingAPI(l).enclosure.inspect(pair.base, pair.lid);
    this.pair = pair;
    this.parameters = structuredClone(intent.parameters);
    this.clearStage();
    this.feedback =
      "Editing this enclosure. Change a size, then choose Preview changes and Apply changes.";
  }
  async stage() {
    if (this.pending) return;
    this.sync();
    this.clearStage();
    const editor = this.layers(),
      api = new ModellingAPI(editor),
      revision = api.revision,
      parameters = structuredClone(this.parameters),
      pair = this.pair ? { ...this.pair } : undefined;
    this.pending = true;
    this.abort = new AbortController();
    this.feedback = "Preparing preview…";
    try {
      const options = { expectedRevision: revision, dryRun: true, signal: this.abort.signal };
      const result = pair
        ? await api.enclosure.update(pair.base, pair.lid, parameters, options)
        : await api.enclosure.create(parameters, options);
      if (!result.ok) throw new Error(result.error.message);
      if (this.abort.signal.aborted || this.layers() !== editor || api.revision !== revision)
        throw new Error("Preview cancelled or scene changed.");
      this.staged = { revision, parameters, editor, pair };
      const plan = result.value.plan,
        mm = editor.display.precision.millimetresPerUnit;
      // Preview sources are unpickable presentation meshes, never members of a part or export input.
      const previous = pair
        ? enclosurePlan(
            editor.project.layerStack.get(pair.base).assemblyPart!.enclosure!.parameters,
          )
        : undefined;
      for (const [role, def] of Object.entries(plan.sources)) {
        if (def.source.kind !== "box") continue;
        const mesh = new Mesh(
          roundedBoxGeometry(def.source),
          new MeshBasicMaterial({
            color: role === "base" || role === "lid" ? 0x70d5ba : 0xffbd70,
            wireframe: true,
            transparent: true,
            opacity: 0.65,
            depthTest: false,
          }),
        );
        mesh.scale.setScalar(1 / mm);
        mesh.position.y = def.y / mm;
        if (pair && previous) {
          const basePart = role === "base" || role === "cavity";
          const root = editor.project.layerStack.get(basePart ? pair.base : pair.lid).transform;
          const offset = def.y - (basePart ? 0 : previous.sources.lid.y);
          mesh.position.copy(new Vector3(0, offset / mm, 0).applyMatrix4(transformMatrix(root)));
          mesh.rotation.set(...root.rotation, "XYZ");
          mesh.scale.set(...(root.scale.map((v) => v / mm) as [number, number, number]));
        }
        mesh.name = role;
        mesh.raycast = () => {};
        this.preview.add(mesh);
      }
      editor.group.add(this.preview);
      this.feedback = `Preview: ${plan.outerDimensionsMm.join(" × ")} mm outside. Inside ${parameters.innerWidthMm} wide × ${parameters.innerDepthMm} deep × ${parameters.innerHeightMm} high. Lid gap ${parameters.lid.clearanceMm} mm per side. The coloured lines show the new size. Choose ${pair ? "Apply changes" : "Create enclosure"} to keep it.`;
    } catch (e) {
      if (this.layers() === editor) this.feedback = e instanceof Error ? e.message : String(e);
    } finally {
      this.pending = false;
      this.changed();
    }
  }
  async confirm() {
    if (this.pending || !this.ready) return;
    const staged = this.staged!;
    this.clearStage();
    const api = new ModellingAPI(staged.editor);
    this.pending = true;
    this.abort = new AbortController();
    this.feedback = "Applying changes…";
    try {
      const options = { expectedRevision: staged.revision, signal: this.abort.signal };
      const result = staged.pair
        ? await api.enclosure.update(staged.pair.base, staged.pair.lid, staged.parameters, options)
        : await api.enclosure.create(staged.parameters, options);
      if (!result.ok) throw new Error(result.error.message);
      if (this.layers() !== staged.editor) return;
      this.pair = result.value.partIds;
      this.feedback = "Changes applied. Updating the view…";
      try {
        await previewAssembly(staged.editor, this.abort.signal);
        if (this.layers() !== staged.editor) return;
        this.feedback =
          "Enclosure updated. You can move the base and lid separately, or undo this change.";
      } catch (e) {
        if (this.layers() !== staged.editor) return;
        this.feedback = `Changes applied. You can undo them. Could not update the view: ${e instanceof Error ? e.message : e}`;
      }
    } catch (e) {
      if (this.layers() === staged.editor)
        this.feedback = e instanceof Error ? e.message : String(e);
    } finally {
      this.pending = false;
      this.changed();
    }
  }
  activate(id: string): boolean {
    if (!id.startsWith("enclosure:")) return false;
    const a = id.slice(10);
    if (a === "cancel") {
      this.cancel();
      return true;
    }
    if (this.pending) return true;
    try {
      if (a === "open") {
        this.open = true;
        this.openSelected();
      } else if (a === "home") {
        this.open = false;
        this.clearStage();
      } else if (a === "new") this.newRecipe();
      else if (a === "edit") this.editSelected();
      else if (a === "stage") void this.stage();
      else if (a === "confirm") void this.confirm();
      else if (a.startsWith("field:")) {
        this.field = a.slice(6) as EnclosureField;
        this.entry = "";
      } else if (a.startsWith("key:"))
        this.entry =
          a === "key:back" ? this.entry.slice(0, -1) : (this.entry + a.slice(4)).slice(0, 16);
      else if (a === "apply") {
        if (!this.entry || !this.field) throw new Error("Enter a dimension.");
        this.set(this.field, Number(this.entry));
        this.field = "";
      } else if (a === "cancel-field") this.field = "";
    } catch (e) {
      this.feedback = e instanceof Error ? e.message : String(e);
    }
    this.changed();
    return true;
  }
  observeController(tool: XRControllerState | undefined): void {
    if (!this.open) return;
    const current =
      tool?.connected && tool.tracked && tool.role === "tool"
        ? `${tool.connectionId}:${tool.handedness}`
        : "";
    if (!current || (this.controllerOwner && current !== this.controllerOwner)) {
      if (this.staged || this.pending) {
        this.cancel();
        this.feedback = "Controller changed or tracking lost. Preview your changes again.";
        this.changed();
      }
    }
    this.controllerOwner = current;
  }
  content(): MenuContent {
    this.sync();
    const buttons: MenuContent["buttons"] = [];
    const add = (id: string, label: string, i: number, disabled = false): void => {
      buttons.push({
        id: `enclosure:${id}`,
        label,
        disabled,
        rect: { x: 40 + (i % 2) * 548, y: 180 + Math.floor(i / 2) * 112, width: 524, height: 100 },
      });
    };
    if (this.field) {
      ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "back"].forEach((k, i) => {
        add(`key:${k}`, k, i);
      });
      add("apply", `Apply ${this.entry || "…"} mm`, 12);
      add("cancel-field", "Cancel entry", 13);
    } else {
      add("home", "‹ Primitives", 0);
      add("new", "New enclosure", 1, this.pending);
      Object.entries(ENCLOSURE_FIELDS).forEach(([k, label], i) => {
        add(`field:${k}`, `${label} · ${this.value(k as EnclosureField)} mm`, i + 2, this.pending);
      });
      add("edit", "Edit selected enclosure", 11, this.pending);
      add("stage", "Preview changes", 12, this.pending);
      add(
        "confirm",
        this.pair ? "Apply changes" : "Create enclosure",
        13,
        this.pending || !this.ready,
      );
      add("cancel", "Cancel", 14);
    }
    return {
      title: "ENCLOSURE",
      subtitle: this.field
        ? `${ENCLOSURE_FIELDS[this.field]} · millimetres`
        : "Friction-fit lip · separate Base / Lid · no screws",
      buttons,
      labels: [],
      footer: this.feedback,
    };
  }
  dispose() {
    this.cancel();
  }
}
