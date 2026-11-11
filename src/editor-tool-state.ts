import { BRUSH_RADIUS_LIMITS } from "./brush-settings";
import { ClayPathControls } from "./clay-path";
import type { IndependentLayers } from "./independent-layers";
import type { EditorMode } from "./interaction";
import { deleteTubePoint, insertTubePoint, validateTube } from "./procedural-tube";
import type { SculptSettings } from "./project";
import { PAINT_SWATCHES } from "./sculpt-paint";
import type { ShapePreviewModel } from "./shape-preview";
import { shapeDimensionsForKind } from "./shape-preview";
import type { ShapeKind } from "./shapes";
import { SHAPE_KINDS, SHAPE_METADATA } from "./shapes";
import {
  defaultToolPreferences,
  type MoveInteraction,
  type MoveVariant,
  type ToolPreferences,
  validateToolPreferences,
} from "./tool-preferences";
import { copyTransform, hasUniformScale, identityTransform, uniformScale } from "./transform";
export type EditorTool =
  | "paint"
  | "mask"
  | "clay"
  | "smooth"
  | "flatten"
  | "inflate"
  | "scrape"
  | "pinch"
  | "crease"
  | "stamp"
  | "transform"
  | "move"
  | "tube"
  | "edit-spline";
export const EDITOR_TOOLS = Object.freeze([
  {
    id: "clay",
    label: "Clay",
    detail: "Add / subtract",
    enabled: true,
    layerGrab: false,
    sizing: "brush-radius",
  },
  {
    id: "paint",
    label: "Paint",
    detail: "Colour / erase paint",
    enabled: true,
    layerGrab: false,
    sizing: "brush-radius",
  },
  {
    id: "mask",
    label: "Mask",
    detail: "Paint / erase protection",
    enabled: true,
    layerGrab: false,
    sizing: "brush-radius",
  },
  {
    id: "smooth",
    label: "Smooth",
    detail: "Soften surfaces",
    enabled: true,
    layerGrab: false,
    sizing: "brush-radius",
  },
  {
    id: "flatten",
    label: "Flatten",
    detail: "Relax toward local tangent plane",
    enabled: true,
    layerGrab: false,
    sizing: "brush-radius",
  },
  {
    id: "inflate",
    label: "Inflate",
    detail: "Local outward field offset",
    enabled: true,
    layerGrab: false,
    sizing: "brush-radius",
  },
  {
    id: "scrape",
    label: "Scrape",
    detail: "Remove above applicator plane",
    enabled: true,
    layerGrab: false,
    sizing: "brush-radius",
  },
  {
    id: "pinch",
    label: "Pinch",
    detail: "Contract surface tangentially",
    enabled: true,
    layerGrab: false,
    sizing: "brush-radius",
  },
  {
    id: "crease",
    label: "Crease",
    detail: "Pinch with inward displacement",
    enabled: true,
    layerGrab: false,
    sizing: "brush-radius",
  },
  {
    id: "tube",
    label: "Tube",
    detail: "Draw tubes · grab spline points to edit",
    enabled: true,
    layerGrab: false,
    sizing: "brush-radius",
  },
  {
    id: "edit-spline",
    label: "Edit Spline",
    detail: "Grab points · stick changes thickness",
    enabled: true,
    layerGrab: false,
    sizing: null,
  },
  {
    id: "stamp",
    label: "Stamp",
    detail: "Shape settings",
    enabled: true,
    layerGrab: false,
    sizing: "shape-scale",
  },
  {
    id: "transform",
    label: "Transform Layer",
    detail: "Move / wrist rotate",
    enabled: true,
    layerGrab: true,
    sizing: null,
  },
  {
    id: "move",
    label: "Move Tool",
    detail: "Surface deformation · release commits",
    enabled: true,
    layerGrab: false,
    sizing: "brush-radius",
  },
] as const);
/** Presentation hierarchy only; EDITOR_TOOLS retains every engine and desktop binding. */
export const VR_WHEEL_TOOLS = [
  ...["clay", "smooth", "flatten", "inflate", "stamp", "move", "tube", "transform"].map(
    (id) => EDITOR_TOOLS.find((t) => t.id === id)!,
  ),
  { id: "cut", label: "Cut", detail: "Plane · separate pieces", enabled: true } as const,
];
export const MOVE_VARIANT_LABELS: Record<MoveVariant, string> = {
  free: "Free Move",
  "non-elastic": "Non-Elastic Move",
  elastic: "Elastic Move",
  "rotate-twist": "Rotate / Twist",
  pinch: "Pinch",
  crease: "Crease",
  scrape: "Scrape",
};
export function toolAllowsLayerGrab(tool: EditorTool): boolean {
  return EDITOR_TOOLS.some((t) => t.id === tool && t.layerGrab);
}
export function toolSizingBinding(tool: EditorTool) {
  return EDITOR_TOOLS.find((t) => t.id === tool)?.sizing ?? null;
}
export function toolAllowsLiveBrushSizing(tool: EditorTool): boolean {
  return tool === "clay" || tool === "inflate" || tool === "mask" || tool === "paint";
}
export type ToolOption = {
  id: string;
  label: string;
  value: string;
  decrease: boolean;
  increase: boolean;
  disabled: boolean;
  action?: string;
  stepActions?: { decrease: string; increase: string };
  slider?: { min: number; max: number; value: number };
};
type Declaration = {
  id: string;
  label: string;
  read: () => number | string;
  write?: (v: number | string) => void;
  min?: number;
  max?: number;
  step?: number;
  choices?: readonly string[];
  names?: readonly string[];
  format?: (v: number | string) => string;
  disabled?: boolean;
  action?: string;
  stepActions?: { decrease: string; increase: string };
  slider?: boolean;
};
/** The port reads/writes the existing application state. There is no VR copy of tool values. */
export type EditorToolPort = {
  layers: () => IndependentLayers;
  shape: ShapePreviewModel;
  settings: () => SculptSettings;
  setSettings: (v: SculptSettings) => void;
  mode: () => EditorMode;
  selectTool: (tool: EditorTool) => void;
  selectTransform: (mode: Exclude<EditorMode, "sculpt">) => void;
  busy: () => boolean;
  changed: () => void;
};
export class EditorToolState {
  private rememberedMoveVariant: MoveVariant = "free";
  alternateTool: "off" | "clay" | "smooth" | "opposite" = "opposite";
  splinePointId: string | null = null;
  private selectedTubeLayer: string | null = null;
  private selectedTubeProject: object | null = null;
  get tubeSplineSelected(): boolean {
    return (
      this.selectedTubeProject === this.port.layers().project &&
      this.selectedTubeLayer === this.port.layers().project.activeLayerId &&
      this.splinePointId === null
    );
  }
  selectTubeSpline(): void {
    this.selectedTubeProject = this.port.layers().project;
    this.selectedTubeLayer = this.port.layers().project.activeLayerId;
    this.splinePointId = null;
    this.port.changed();
  }
  selectSplinePoint(id: string): void {
    this.selectedTubeLayer = null;
    this.splinePointId = id;
  }
  private splineSelected: "tube" | "edit-spline" | null = null;
  private moveSelected = false;
  private previewOwner: { cancel: () => void } | null = null;
  readonly move = {
    snap: 0 as 0 | 15 | 45 | 90,
    precision: false,
    interaction: "free" as MoveInteraction,
    placement: "free" as "surface" | "free",
    axis: "free" as "free" | "x" | "y" | "z",
    angularStrength: 1,
    angleClamp: 120,
    radius: 0.3,
    falloff: 2,
    strength: 1,
    stiffness: 1,
    mode: "non-elastic" as "non-elastic" | "elastic",
  };
  get brushRadius(): number {
    return this.active === "move" ? this.move.radius : this.port.settings().radius;
  }
  beginPreview(owner: { cancel: () => void }): void {
    if (this.busy) throw new Error("Finish the current interaction first.");
    this.previewOwner = owner;
  }
  endPreview(owner: object): void {
    if (this.previewOwner === owner) this.previewOwner = null;
  }
  clearMoveSelection(): void {
    this.previewOwner?.cancel();
    this.moveSelected = false;
    this.splineSelected = null;
  }
  readonly path = new ClayPathControls();
  readonly stampAttachment = {
    position: [0, 0, 0] as [number, number, number],
    rotation: [0, 0, 0, 1] as [number, number, number, number],
    mode: "single" as "single" | "continuous",
    spacing: 0.35,
  };
  resetStampOffset(): void {
    this.assertIdle();
    this.stampAttachment.position.splice(0, 3, 0, 0, 0);
    this.stampAttachment.rotation.splice(0, 4, 0, 0, 0, 1);
    this.stampRotation.fill(0);
    this.port.changed();
  }
  readonly stampRotation: [number, number, number] = [0, 0, 0];
  readonly surfaceSnap = {
    enabled: false,
    targetMode: "surface" as "surface" | "scene" | "bounds",
    radiusMM: 10,
    align: "position" as "position" | "position-and-orientation",
    localAxis: "y" as "x" | "y" | "z",
    offsetMM: 0,
    flipNormal: false,
    rotateAboutNormal: 0,
    hysteresis: 0.003,
  };
  constructor(readonly port: EditorToolPort) {}
  snapshotPreferences(): ToolPreferences {
    return validateToolPreferences({
      ...(["pinch", "crease", "scrape"].includes(this.lastMoveVariant)
        ? { moveVariant: this.lastMoveVariant }
        : {}),
      symmetry: this.port.layers().symmetry,
      path: this.path,
      move: this.move,
      alternateTool: this.alternateTool,
      stampAttachment: this.stampAttachment,
      stampRotation: this.stampRotation,
      surfaceSnap: this.surfaceSnap,
    });
  }
  restorePreferences(value?: unknown): void {
    const p = value === undefined ? defaultToolPreferences() : validateToolPreferences(value);
    Object.assign(this.path, p.path);
    Object.assign(this.move, p.move);
    this.rememberedMoveVariant = p.moveVariant ?? this.deformationVariant;
    Object.assign(this.port.layers().symmetry, p.symmetry);
    Object.assign(
      this.surfaceSnap,
      p.surfaceSnap ?? {
        enabled: false,
        targetMode: "surface",
        radiusMM: 10,
        align: "position",
        localAxis: "y",
        offsetMM: 0,
        flipNormal: false,
        rotateAboutNormal: 0,
        hysteresis: 0.003,
      },
    );
    this.alternateTool = p.alternateTool;
    Object.assign(
      this.stampAttachment,
      p.stampAttachment ?? {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
        mode: "single",
        spacing: 0.35,
      },
    );
    this.stampRotation.splice(0, 3, ...p.stampRotation);
  }

  setStampScale(value: number): boolean {
    if (this.busy || this.active !== "stamp" || !Number.isFinite(value)) return false;
    const shape = this.port.shape,
      stack = this.port.layers().project.layerStack;
    if (shape.availability(stack)) return false;
    const d = shape.definition,
      next = Math.max(0.02, Math.min(10, value));
    if (Math.abs(next - d.transform.scale[0]) < 1e-12) return false;
    shape.set({ ...d, transform: { ...d.transform, scale: [next, next, next] } }, stack);
    return true;
  }
  get active(): EditorTool {
    return this.splineSelected && !this.port.shape.enabled && this.port.mode() === "sculpt"
      ? this.splineSelected
      : this.moveSelected && !this.port.shape.enabled && this.port.mode() === "sculpt"
        ? "move"
        : this.port.shape.enabled
          ? "stamp"
          : this.port.mode() !== "sculpt"
            ? "transform"
            : this.port.settings().mode === "paint" || this.port.settings().mode === "paint-erase"
              ? "paint"
              : this.port.settings().mode === "mask" || this.port.settings().mode === "mask-erase"
                ? "mask"
                : ["smooth", "flatten", "inflate", "scrape", "pinch", "crease"].includes(
                      this.port.settings().mode,
                    )
                  ? (this.port.settings().mode as EditorTool)
                  : "clay";
  }
  get busy(): boolean {
    const l = this.port.layers();
    return (
      !!this.previewOwner ||
      this.port.busy() ||
      l.drawing ||
      l.transforming ||
      l.previewing ||
      l.deforming ||
      l.bakingLayer ||
      l.generatingTube ||
      l.duplicating ||
      l.cutting
    );
  }
  setLiveTubeRadius(value: number): boolean {
    if (
      this.active !== "tube" ||
      !this.previewOwner ||
      !this.port.layers().previewing ||
      this.port.layers().generatingTube ||
      !Number.isFinite(value)
    )
      return false;
    const radius = Math.max(BRUSH_RADIUS_LIMITS.min, Math.min(BRUSH_RADIUS_LIMITS.max, value));
    if (radius === this.brushRadius) return false;
    this.port.setSettings({ ...this.port.settings(), radius });
    return true;
  }
  setLiveClayRadius(value: number): boolean {
    const l = this.port.layers();
    if (
      !toolAllowsLiveBrushSizing(this.active) ||
      !l.drawing ||
      l.previewing ||
      l.deforming ||
      l.transforming ||
      this.port.busy() ||
      !Number.isFinite(value)
    )
      return false;
    const radius = Math.max(BRUSH_RADIUS_LIMITS.min, Math.min(BRUSH_RADIUS_LIMITS.max, value));
    if (radius === this.brushRadius) return false;
    this.port.setSettings({ ...this.port.settings(), radius });
    return true;
  }
  setLiveMoveFalloff(value: number): boolean {
    if (
      this.active !== "move" ||
      !this.previewOwner ||
      this.port.layers().deforming ||
      this.move.mode !== "elastic" ||
      this.move.interaction !== "translate" ||
      this.port.busy() ||
      !Number.isFinite(value)
    )
      return false;
    const next = Math.max(1, Math.min(4, value));
    if (next === this.move.falloff) return false;
    this.move.falloff = next;
    return true;
  }
  setBrushRadius(value: number, current?: SculptSettings): boolean {
    if (this.busy || toolSizingBinding(this.active) !== "brush-radius" || !Number.isFinite(value))
      return false;
    const settings = current ?? this.port.settings(),
      radius = Math.max(BRUSH_RADIUS_LIMITS.min, Math.min(BRUSH_RADIUS_LIMITS.max, value));
    if (Math.abs(this.brushRadius - radius) < 1e-12) return false;
    if (this.active === "move") this.move.radius = radius;
    else this.port.setSettings({ ...settings, radius });
    return true;
  }
  select(tool: EditorTool): void {
    const cancelled = !!this.previewOwner;
    this.previewOwner?.cancel();
    const l = this.port.layers(),
      onlyCancelledMove =
        cancelled &&
        l.deforming &&
        !this.previewOwner &&
        !l.previewing &&
        !l.drawing &&
        !l.transforming &&
        !this.port.busy();
    if (this.busy && !onlyCancelledMove) throw new Error("Finish the current interaction first.");
    if (!EDITOR_TOOLS.some((t) => t.id === tool && t.enabled))
      throw new Error("This tool is unavailable.");
    if (this.moveFamily) this.rememberedMoveVariant = this.lastMoveVariant;
    this.port.selectTool(tool);
    if (tool === "paint") this.port.setSettings({ ...this.port.settings(), mode: "paint" });
    if (tool === "mask") this.port.setSettings({ ...this.port.settings(), mode: "mask" });
    if (
      tool === "flatten" ||
      tool === "inflate" ||
      tool === "scrape" ||
      tool === "pinch" ||
      tool === "crease"
    )
      this.port.setSettings({ ...this.port.settings(), mode: tool });
    this.moveSelected = tool === "move";
    if (["pinch", "crease", "scrape"].includes(tool))
      this.rememberedMoveVariant = tool as MoveVariant;
    this.splineSelected = tool === "tube" || tool === "edit-spline" ? tool : null;
    this.port.changed();
  }
  get snapApplicable(): boolean {
    return this.active === "move"
      ? this.move.interaction !== "translate"
      : ["clay", "mask", "paint", "flatten", "inflate", "scrape", "pinch", "crease"].includes(
          this.active,
        ) &&
          this.path.straightLine &&
          this.path.axis === "free";
  }
  get moveFamily(): boolean {
    return ["move", "pinch", "crease", "scrape"].includes(this.active);
  }
  get lastMoveVariant(): MoveVariant {
    return this.active === "move" ||
      (!["pinch", "crease", "scrape"].includes(this.rememberedMoveVariant) &&
        !["pinch", "crease", "scrape"].includes(this.active))
      ? this.deformationVariant
      : ["pinch", "crease", "scrape"].includes(this.active)
        ? (this.active as MoveVariant)
        : this.rememberedMoveVariant;
  }
  private get deformationVariant(): MoveVariant {
    if (this.move.interaction === "free") return "free";
    if (this.move.interaction !== "translate") return "rotate-twist";
    return this.move.mode;
  }
  get contextLabel(): string {
    if (this.active === "transform" && this.port.layers().selectedGroupId) return "Transform Group";
    return this.moveFamily
      ? `Move · ${MOVE_VARIANT_LABELS[this.lastMoveVariant]}`
      : EDITOR_TOOLS.find((t) => t.id === this.active)!.label;
  }
  /** Compact menu status; derived from authoritative settings, never a second tool state. */
  get workflowStatus(): string {
    const l = this.port.layers(),
      mode = this.port.settings().mode;
    const operation =
      this.active === "stamp"
        ? this.port.shape.definition.operation
        : this.active === "move"
          ? this.move.interaction
          : mode;
    const names: Record<string, string> = {
      add: "Add",
      subtract: "Subtract",
      paint: "Paint colour",
      "paint-erase": "Erase colour",
      mask: "Paint protection",
      "mask-erase": "Erase protection",
      rotate: "Rotate",
      twist: "Twist",
    };
    const detail = names[operation];
    return `${this.contextLabel}${detail ? " · " + detail : ""}${this.busy ? " · Working…" : l.selectedGroupId && this.active !== "transform" ? " · Select a source layer" : !l.active.layer.editable ? " · Layer hidden or locked" : (l.active.layer.procedural || l.active.layer.primitive) && !["transform", "tube", "edit-spline"].includes(this.active) ? " · Bake source first" : ""}`;
  }
  /** Wheel recall preserves the exact deformation settings, when reselecting Move. */
  selectMoveGroup(): void {
    const variant = this.lastMoveVariant;
    this.select(["pinch", "crease", "scrape"].includes(variant) ? (variant as EditorTool) : "move");
  }
  selectMoveVariant(variant: MoveVariant): void {
    if (!Object.hasOwn(MOVE_VARIANT_LABELS, variant)) throw new Error("Unknown Move variant.");
    this.select(["pinch", "crease", "scrape"].includes(variant) ? (variant as EditorTool) : "move");
    if (variant === "non-elastic" || variant === "elastic") {
      this.move.mode = variant;
      this.move.interaction = "translate";
    } else if (variant === "free") {
      this.move.interaction = "free";
    } else if (
      variant === "rotate-twist" &&
      (this.move.interaction === "translate" || this.move.interaction === "free")
    )
      this.move.interaction = "rotate";
    this.rememberedMoveVariant = variant;
    this.port.changed();
  }
  /** Match desktop's default: a separate empty 64³ clay volume, selected immediately. */
  createLayer(): void {
    this.assertIdle();
    const layers = this.port.layers();
    layers.create(64, true);
    this.port.shape.sync(layers.project.layerStack);
    this.port.changed();
  }
  selectLayer(id: string): void {
    this.assertIdle();
    this.port.layers().select(id);
    this.port.shape.sync(this.port.layers().project.layerStack);
    this.port.changed();
  }
  toggleLayer(id: string, flag: "visible" | "locked"): void {
    this.assertIdle();
    const l = this.port.layers();
    const n = l.project.layerStack.hierarchy.get(id);
    l.setNodeFlag(id, flag, !(flag === "visible" ? n.localVisible : n.localLocked));
    this.port.changed();
  }
  resetLayerTransform(id: string): void {
    this.assertIdle();
    const l = this.port.layers();
    if (this.active !== "transform" || id !== l.transformNode.id)
      throw new Error("Reset cancelled: selected layer changed.");
    l.setActiveTransform(identityTransform());
    this.port.changed();
  }
  private assertIdle(): void {
    if (this.busy) throw new Error("Finish the current interaction first.");
  }
  setPaintColour(value: string): void {
    this.assertIdle();
    if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error("Invalid paint colour.");
    this.port.layers().paintColour = value.toLowerCase();
    this.port.changed();
  }
  paintAction(): void {
    this.assertIdle();
    this.port.layers().clearPaint();
    this.port.changed();
  }
  maskAction(action: string): void {
    this.assertIdle();
    if (!["mask-invert", "mask-clear", "mask-all"].includes(action))
      throw new Error("Unknown mask action.");
    this.port.layers().maskOperation(action.slice(5) as "invert" | "clear" | "all");
    this.port.changed();
  }
  async splineAction(action: string): Promise<void> {
    this.assertIdle();
    const l = this.port.layers(),
      layer = l.active.layer,
      source = validateTube(layer.procedural),
      index = Math.max(
        0,
        source.points.findIndex((p) => p.id === this.splinePointId),
      );
    if (action === "tube-bake") {
      await l.bake({
        name: `${layer.name} baked`.slice(0, 128),
        resolution: layer.volume.resolution,
        hideSources: false,
        sourceIds: [layer.id],
      });
    } else {
      let next = source;
      if (action === "tube-insert") next = insertTubePoint(source, index);
      else if (action === "tube-delete") next = deleteTubePoint(source, source.points[index].id);
      else if (action === "tube-thinner" || action === "tube-thicker") {
        next = validateTube(source);
        const points = this.tubeSplineSelected ? next.points : [next.points[index]],
          factor = Math.max(
            0.005 / Math.min(...points.map((p) => p.radius)),
            Math.min(
              2 / Math.max(...points.map((p) => p.radius)),
              action === "tube-thicker" ? 1.1 : 1 / 1.1,
            ),
          );
        for (const point of points) point.radius *= factor;
      } else if (action === "tube-close") next = { ...source, closed: !source.closed };
      else throw new Error("Unknown spline action.");
      await l.regenerateTube(next, layer.id);
    }
    this.port.changed();
  }
  private declarations(): Declaration[] {
    const p = this.port,
      l = p.layers(),
      settings = p.settings(),
      active = this.active,
      options: Declaration[] = [],
      mirrorOptions: Declaration[] = [];
    if (this.moveFamily)
      options.push({
        id: "move-variants",
        label: "Move variant",
        read: () => this.contextLabel,
        action: "move-variants",
      });
    if (active === "paint")
      options.push(
        {
          id: "paint-colour",
          label: "Paint colour",
          read: () => l.paintColour,
          write: (v) => (l.paintColour = String(v)),
          format: (v) => String(v),
          choices: PAINT_SWATCHES,
        },
        {
          id: "paint-mode",
          label: "Paint operation",
          read: () => settings.mode,
          write: (v) => p.setSettings({ ...p.settings(), mode: v as "paint" | "paint-erase" }),
          choices: ["paint", "paint-erase"],
          names: ["Paint colour", "Erase to base"],
        },
        {
          id: "paint-clear",
          label: "Reset to layer base colour",
          read: () => "One Undo action",
          action: "paint-clear",
          disabled:
            !l.active.layer.editable || !!(l.active.layer.procedural || l.active.layer.primitive),
        },
      );
    if (active === "mask")
      for (const [action, label] of [
        ["invert", "Invert mask"],
        ["clear", "Clear mask"],
        ["all", "Mask all"],
      ])
        options.push({
          id: `mask-${action}`,
          label,
          read: () => "One Undo action",
          action: `mask-${action}`,
          disabled:
            !l.active.layer.editable || !!(l.active.layer.procedural || l.active.layer.primitive),
        });
    const brush = (
      id: "radius" | "strength" | "hardness",
      label: string,
      min: number,
      max: number,
      step: number,
    ) =>
      options.push({
        id,
        label,
        read: () => settings[id],
        write: (v) => p.setSettings({ ...p.settings(), [id]: v }),
        min,
        max,
        step,
        format: (v) => (id === "radius" ? Number(v).toFixed(3) : `${Math.round(Number(v) * 100)}%`),
      });
    if (
      active === "paint" ||
      active === "mask" ||
      active === "clay" ||
      active === "smooth" ||
      active === "flatten" ||
      active === "inflate" ||
      active === "scrape" ||
      active === "pinch" ||
      active === "crease" ||
      active === "stamp"
    ) {
      const mirror = l.symmetry;
      mirrorOptions.push(
        {
          id: "symmetry",
          label: "Mirror symmetry · layer local",
          read: () => (mirror.enabled ? "on" : "off"),
          write: (v) => (mirror.enabled = v === "on"),
          choices: ["off", "on"],
          disabled: !l.active.layer.editable,
        },
        {
          id: "symmetry-axis",
          label: "Mirror plane normal",
          read: () => mirror.axis,
          write: (v) => (mirror.axis = v as typeof mirror.axis),
          choices: ["x", "y", "z"],
          disabled: !l.active.layer.editable,
        },
        {
          id: "symmetry-offset",
          label: "Mirror plane offset",
          read: () => mirror.offset,
          write: (v) => (mirror.offset = Number(v)),
          min: -100,
          max: 100,
          step: 0.05,
          disabled: !l.active.layer.editable,
        },
      );
    }
    if (
      active === "paint" ||
      active === "mask" ||
      active === "clay" ||
      active === "smooth" ||
      active === "flatten" ||
      active === "inflate" ||
      active === "scrape" ||
      active === "pinch" ||
      active === "crease"
    ) {
      if (active === "mask") {
        options.push(
          {
            id: "mask-mode",
            label: "Mask operation",
            read: () => settings.mode,
            write: (v) => p.setSettings({ ...p.settings(), mode: v as "mask" | "mask-erase" }),
            choices: ["mask", "mask-erase"],
            names: ["Paint protection", "Erase protection"],
          },
          {
            id: "mask-overlay",
            label: "Mask overlay",
            read: () => (l.maskOverlayVisible ? "on" : "off"),
            write: (v) => {
              l.maskOverlayVisible = v === "on";
            },
            choices: ["off", "on"],
          },
        );
      }
      if (active === "clay")
        options.push({
          id: "operation",
          label: "Clay operation",
          read: () => settings.mode,
          write: (v) => p.setSettings({ ...p.settings(), mode: v as "add" | "subtract" }),
          choices: ["add", "subtract"],
          names: ["Add", "Subtract"],
        });
      if (active !== "paint")
        options.push({
          id: "placement",
          label: "Placement",
          read: () => this.path.placement,
          write: (v) => (this.path.placement = v as "free" | "surface"),
          choices: ["free", "surface"],
          names: ["Free space", "Surface follow"],
        });
      brush("radius", "Brush radius", BRUSH_RADIUS_LIMITS.min, BRUSH_RADIUS_LIMITS.max, 0.02);
      brush(
        "strength",
        active === "paint"
          ? "Paint opacity"
          : active === "smooth"
            ? "Smoothing strength"
            : "Strength",
        0.01,
        1,
        0.05,
      );
      if (active !== "smooth") {
        brush("hardness", active === "mask" ? "Falloff hardness" : "Hardness", 0, 1, 0.05);
        options.push(
          {
            id: "steady",
            label: "Steady",
            read: () => this.path.steady,
            write: (v) => (this.path.steady = Number(v)),
            min: 0,
            max: 100,
            step: 5,
            format: (v) => `${v}%`,
            disabled: this.path.straightLine,
            slider: true,
          },
          {
            id: "straight-line",
            label: "Straight Line",
            read: () => (this.path.straightLine ? "on" : "off"),
            write: (v) => (this.path.straightLine = v === "on"),
            choices: ["off", "on"],
            names: ["Off", "On"],
          },
        );
        options.push({
          id: "line-axis",
          label: "Straight Line axis · layer local",
          read: () => this.path.axis,
          write: (v) => (this.path.axis = v as typeof this.path.axis),
          choices: ["free", "x", "y", "z"],
          disabled: !this.path.straightLine,
        });
        options.push({
          id: "spacing",
          label: "Stroke spacing",
          read: () => "Automatic",
          disabled: true,
        });
      }
      options.push({
        id: "quality",
        label: "Geometry quality",
        read: () => {
          const v = l.active.volume;
          return `Radius ${(settings.radius / uniformScale(l.active.layer.transform) / v.step).toFixed(1)} voxels · finer new layers: 128³ / 192³`;
        },
        disabled: true,
      });
      options.push({
        id: "application",
        label: "VR strokes",
        read: () =>
          active === "paint"
            ? "Tool trigger · surface paint"
            : this.path.placement === "free"
              ? "Tool trigger · free space"
              : "Tool trigger · surface",
        disabled: true,
      });
      if (active === "pinch" || active === "crease")
        options.push({
          id: "brush-behaviour",
          label: active === "pinch" ? "Pinch behaviour" : "Crease behaviour",
          read: () =>
            active === "pinch"
              ? "Contracts existing ridges; subtle on a smooth sphere"
              : "Indents and contracts · release to finish queued work",
          disabled: true,
        });
    }
    if (active === "mask") {
      options.push({
        id: "mask-source",
        label: "Target",
        read: () =>
          l.active.layer.procedural || l.active.layer.primitive
            ? "Explicitly Bake this source before painting"
            : "Selected editable sculpt layer · geometry stays separate",
        disabled: true,
      });
    }
    if (active === "tube") {
      brush("radius", "New tube radius", BRUSH_RADIUS_LIMITS.min, BRUSH_RADIUS_LIMITS.max, 0.02);
      options.push(
        {
          id: "steady",
          label: "Steady",
          read: () => this.path.steady,
          write: (v) => (this.path.steady = Number(v)),
          min: 0,
          max: 100,
          step: 5,
        },
        {
          id: "straight-line",
          label: "Straight Line",
          read: () => (this.path.straightLine ? "on" : "off"),
          write: (v) => (this.path.straightLine = v === "on"),
          choices: ["off", "on"],
        },
        {
          id: "tube-note",
          label: "Draw",
          read: () => "Drag empty space to draw · grab a point to edit",
          disabled: true,
        },
      );
    }
    if (active === "tube" || active === "edit-spline") {
      const source = l.active.layer.procedural,
        selected = source?.points.find((p) => p.id === this.splinePointId) ?? source?.points[0];
      options.push(
        {
          id: "tube-selected",
          label: "Spline selection",
          read: () =>
            source
              ? `${l.active.layer.name} · ${this.tubeSplineSelected ? "whole spline" : "point " + (source.points.findIndex((p) => p.id === selected?.id) + 1)} · ${source.points.length} points`
              : "Select a Tube in Layers, or point at its surface",
          disabled: true,
        },
        {
          id: "tube-radius",
          label: this.tubeSplineSelected ? "Tube radius · all points" : "Point radius",
          read: () =>
            source
              ? this.tubeSplineSelected
                ? source.points.reduce((sum, p) => sum + p.radius, 0) / source.points.length
                : selected!.radius
              : 0,
          format: (v) => (source ? Number(v).toFixed(3) : "No tube"),
          min: 0.005,
          max: 2,
          stepActions: { decrease: "tube-thinner", increase: "tube-thicker" },
          disabled: !source || !l.active.layer.editable,
        },
        {
          id: "tube-edit-note",
          label: "Controls",
          read: () => "Hover a point, then drag to move · tap line to select all",
          disabled: true,
        },
      );
      for (const [action, label] of [
        ["tube-insert", "Insert point after selected"],
        ["tube-delete", "Delete selected point"],
        ["tube-close", source?.closed ? "Open spline" : "Close spline"],
        ["tube-bake", "Bake to Sculpt Layer"],
      ])
        options.push({
          id: action,
          label,
          read: () => (action === "tube-bake" ? "Original source preserved" : "One Undo action"),
          action,
          disabled:
            !source ||
            !l.active.layer.editable ||
            (this.tubeSplineSelected && ["tube-insert", "tube-delete"].includes(action)),
        });
    }
    if (active === "move") {
      options.push({
        id: "move-interaction",
        label: "Move gesture",
        read: () => this.move.interaction,
        write: (v) => (this.move.interaction = v as typeof this.move.interaction),
        choices: ["free", "translate", "rotate", "twist"],
        names: ["Free Move", "Translate", "Rotate region", "Twist region"],
      });
      options.push({
        id: "move-placement",
        label: "Move placement",
        read: () => this.move.placement,
        write: (v) => (this.move.placement = v as typeof this.move.placement),
        choices: ["surface", "free"],
        names: ["Surface · aim at clay", "Free · at controller tip"],
      });
      if (this.move.interaction === "translate")
        options.push({
          id: "move-translation-axis",
          label: "Axis constraint · layer local",
          read: () => this.move.axis,
          write: (v) => (this.move.axis = v as typeof this.move.axis),
          choices: ["free", "x", "y", "z"],
        });
      if (this.move.interaction !== "translate")
        options.push({
          id: "move-snap",
          label: "Rotation snap · degrees",
          read: () => String(this.move.snap),
          write: (v) => (this.move.snap = Number(v) as typeof this.move.snap),
          choices: ["0", "15", "45", "90"],
          names: ["Off", "15°", "45°", "90°"],
        });
      if (this.move.interaction !== "translate")
        options.push(
          {
            id: "move-axis",
            label:
              this.move.interaction === "free"
                ? "Move axis · layer local"
                : "Rotation axis · layer local",
            read: () => this.move.axis,
            write: (v) => (this.move.axis = v as typeof this.move.axis),
            choices: ["free", "x", "y", "z"],
            names: [
              this.move.interaction === "free" ? "Unconstrained" : "Wrist axis",
              "X",
              "Y",
              "Z",
            ],
          },
          {
            id: "move-angular-strength",
            label: "Wrist sensitivity",
            read: () => this.move.angularStrength,
            write: (v) => (this.move.angularStrength = Number(v)),
            min: 0.1,
            max: 2,
            step: 0.1,
          },
          {
            id: "move-angle-clamp",
            label: "Angle limit · degrees",
            read: () => this.move.angleClamp,
            write: (v) => (this.move.angleClamp = Number(v)),
            min: 15,
            max: 180,
            step: 15,
          },
          {
            id: "move-compatibility",
            label: "Wrist behaviour",
            read: () =>
              this.move.interaction === "free"
                ? "Pull and turn together"
                : "Fixed pivot · Non-Elastic; lock axis for twist",
            disabled: true,
          },
        );
      options.push(
        {
          id: "move-precision",
          label: "Precision",
          read: () => (this.move.precision ? "on" : "off"),
          write: (v) => (this.move.precision = v === "on"),
          choices: ["off", "on"],
          names: ["Off · full sensitivity", "On · quarter sensitivity"],
        },
        {
          id: "move-mode",
          label:
            this.move.interaction === "translate"
              ? "Translation feel"
              : "Saved translation setting",
          read: () => this.move.mode,
          write: (v) => (this.move.mode = v as "non-elastic" | "elastic"),
          choices: ["non-elastic", "elastic"],
          names: ["Non-Elastic · direct pull", "Elastic · soft pull"],
          disabled: this.move.interaction !== "translate",
        },
        {
          id: "move-radius",
          label: "Influence Radius",
          read: () => this.move.radius,
          write: (v) => (this.move.radius = Number(v)),
          min: BRUSH_RADIUS_LIMITS.min,
          max: BRUSH_RADIUS_LIMITS.max,
          step: 0.02,
          format: (v) => Number(v).toFixed(3),
        },
        {
          id: "move-falloff",
          label: "Edge softness",
          read: () => this.move.falloff,
          write: (v) => (this.move.falloff = Number(v)),
          min: 1,
          max: 4,
          step: 0.5,
        },
        {
          id: "move-strength",
          label: "Translation strength",
          read: () => this.move.strength,
          write: (v) => (this.move.strength = Number(v)),
          min: 0.01,
          max: 1,
          step: 0.05,
          disabled: this.move.interaction === "rotate" || this.move.interaction === "twist",
        },
        {
          id: "move-stiffness",
          label: "Elastic firmness",
          read: () => this.move.stiffness,
          write: (v) => (this.move.stiffness = Number(v)),
          min: 0.25,
          max: 4,
          step: 0.25,
          disabled: this.move.mode !== "elastic" || this.move.interaction !== "translate",
        },
        {
          id: "application",
          label: "Release / cancel",
          read: () => "Commit one action · cancel restores",
          disabled: true,
        },
      );
    }
    if (active === "stamp") {
      p.shape.sync(l.project.layerStack);
      const d = p.shape.definition,
        blocked = !!p.shape.availability(l.project.layerStack),
        set = (v: typeof d) => p.shape.set(v, l.project.layerStack);
      options.push(
        {
          id: "shape",
          label: d.personal ? `Personal · ${d.personal.name}` : "Shape",
          read: () => (d.personal ? "personal" : d.kind),
          write: (v) => {
            if (v === "personal") return;
            const kind = v as ShapeKind;
            set({
              ...d,
              personal: undefined,
              kind,
              dimensions: shapeDimensionsForKind(kind, d.dimensions),
            });
          },
          choices: d.personal ? ["personal", ...SHAPE_KINDS] : SHAPE_KINDS,
          names: d.personal
            ? [d.personal.name, ...SHAPE_KINDS.map((k) => SHAPE_METADATA[k].name)]
            : SHAPE_KINDS.map((k) => SHAPE_METADATA[k].name),
          disabled: blocked,
        },
        {
          id: "operation",
          label: "Stamp operation",
          read: () => d.operation,
          write: (v) => set({ ...d, operation: v as "add" | "subtract" }),
          choices: ["add", "subtract"],
          names: ["Add", "Subtract"],
          disabled: blocked,
        },
      );
      options.push({
        id: "stamp-mode",
        label: "Stamp Mode",
        read: () => this.stampAttachment.mode,
        write: (v) => (this.stampAttachment.mode = v as "single" | "continuous"),
        choices: ["single", "continuous"],
        names: ["Single", "Continuous"],
        disabled: blocked,
      });
      if (this.stampAttachment.mode === "continuous")
        options.push({
          id: "stamp-spacing",
          label: "Spacing · fraction of smallest dimension",
          read: () => this.stampAttachment.spacing,
          write: (v) => (this.stampAttachment.spacing = Number(v)),
          min: 0.05,
          max: 3,
          step: 0.05,
          disabled: blocked,
        });
      options.push(
        {
          id: "reset-stamp-offset",
          label: "Reset Stamp Offset",
          read: () => "Default working point",
          action: "reset-stamp-offset",
          disabled: blocked,
        },
        {
          id: "stamp-grip",
          label: "Tool grip · adjust attachment",
          read: () => "Hold shape still; move wrist; release to attach",
          disabled: true,
        },
      );
      const rule = SHAPE_METADATA[d.kind].dimensionRule;
      for (let i = 0; i < 3; i++)
        options.push({
          id: `dimension-${i}`,
          label: d.personal
            ? "Size · longest dimension"
            : rule === "diameter" && i === 0
              ? "Diameter"
              : `Dimension ${"XYZ"[i]}`,
          read: () => d.dimensions[i],
          write: (v) => {
            const dimensions = [...d.dimensions] as [number, number, number];
            dimensions[i] = Number(v);
            if (d.personal || rule === "diameter") dimensions.fill(Number(v));
            if (rule === "square-base" && (i === 0 || i === 2))
              dimensions[0] = dimensions[2] = Number(v);
            set({ ...d, dimensions });
          },
          min: 0.001,
          max: 1000,
          step: 0.05,
          disabled:
            blocked ||
            ((d.personal || rule === "diameter") && i !== 0) ||
            (rule === "square-base" && i === 2),
        });
      for (let i = 0; i < 3; i++)
        options.push({
          id: `rotation-${i}`,
          label: `Wrist offset ${"XYZ"[i]} (°)`,
          read: () => (this.stampRotation[i] * 180) / Math.PI,
          write: (v) => {
            this.stampRotation[i] = (Number(v) * Math.PI) / 180;
            const transform = copyTransform(d.transform);
            transform.rotation[i] = this.stampRotation[i];
            set({ ...d, transform });
          },
          min: -360,
          max: 360,
          step: 15,
          format: (v) => `${Number(v).toFixed(0)}°`,
          disabled: blocked,
        });
      options.push(
        {
          id: "shape-scale",
          label: "Uniform scale",
          read: () => d.transform.scale[0],
          write: (v) =>
            set({ ...d, transform: { ...d.transform, scale: [Number(v), Number(v), Number(v)] } }),
          min: 0.02,
          max: 10,
          step: 0.1,
          disabled: blocked,
        },
        {
          id: "application",
          label: "VR stamp application",
          read: () => "Trigger once · free space",
          disabled: true,
        },
      );
    }
    if (active === "transform") {
      const editable = l.transformNode.editable,
        t = l.transformNode.transform,
        mode = p.mode();
      options.push(
        {
          id: "transform-mode",
          label: "Transform options",
          read: () => mode,
          write: (v) => p.selectTransform(v as "translate" | "rotate" | "scale"),
          choices: ["translate", "rotate", "scale"],
          names: ["Move", "Rotate", "Scale"],
        },
        {
          id: "surface-view",
          label: "Surface view",
          read: () => l.viewMode,
          write: (v) => {
            l.viewMode = v as "separate" | "boolean";
          },
          choices: ["separate", "boolean"],
          names: ["Separate Layers", "Boolean Preview"],
        },
      );
      if (mode === "translate" || mode === "rotate")
        for (let i = 0; i < 3; i++)
          options.push({
            id: `layer-${i}`,
            label: `${mode === "translate" ? "Move" : "Rotate"} ${"XYZ"[i]}`,
            read: () => (mode === "translate" ? t.position[i] : (t.rotation[i] * 180) / Math.PI),
            write: (v) => {
              const next = copyTransform(t);
              if (mode === "translate") next.position[i] = Number(v);
              else next.rotation[i] = (Number(v) * Math.PI) / 180;
              l.setActiveTransform(next);
            },
            min: -1000,
            max: 1000,
            step: mode === "translate" ? 0.1 : 5,
            format: (v) => (mode === "rotate" ? `${Number(v).toFixed(0)}°` : Number(v).toFixed(2)),
            disabled: !editable,
          });
      if (mode === "scale")
        options.push({
          id: "layer-scale",
          label: "Layer uniform scale",
          read: () => t.scale[0],
          write: (v) =>
            l.setActiveTransform({ ...copyTransform(t), scale: [Number(v), Number(v), Number(v)] }),
          min: 0.001,
          max: 1000,
          step: 0.1,
          disabled: !editable || !hasUniformScale(t),
        });
      options.push(
        {
          id: "selected-layer",
          label: "Selected layer",
          read: () => l.transformNode.name,
          disabled: true,
        },
        {
          id: "workspace-note",
          label: "Workspace / layer",
          read: () => "Support/both = view; Tool = saved layer",
          disabled: true,
        },
        {
          id: "reset-layer",
          label: "Reset Layer Transform…",
          read: () => "Position 0 · rotation 0 · scale 1",
          action: "reset-layer",
          disabled: !editable,
        },
      );
      options.push({
        id: "grip",
        label: "Tool grip",
        read: () =>
          l.transforming
            ? "Moving / rotating · release grip"
            : l.viewMode !== "separate"
              ? "Use Separate Layers"
              : !editable
                ? "Show / unlock layer"
                : !hasUniformScale(t)
                  ? "Uniform layer scale required"
                  : "Move + wrist rotate",
        disabled: true,
      });
      options.push(
        {
          id: "surface-snap-target-mode",
          label: "Snap targets",
          read: () => this.surfaceSnap.targetMode,
          write: (v) => {
            this.surfaceSnap.targetMode = v as typeof this.surfaceSnap.targetMode;
          },
          choices: ["surface", "scene", "bounds"],
          names: ["Surfaces", "Scene axes + centre", "Bounding box faces + centre"],
          disabled: !this.surfaceSnap.enabled,
        },
        {
          id: "surface-snap-radius",
          label: "Target radius (mm)",
          read: () => this.surfaceSnap.radiusMM,
          write: (v) => {
            this.surfaceSnap.radiusMM = Number(v);
          },
          min: 0.1,
          max: 100,
          step: 0.5,
          disabled: !this.surfaceSnap.enabled || this.surfaceSnap.targetMode === "surface",
        },
        {
          id: "surface-snap-enabled",
          label: "Surface snap",
          read: () => (this.surfaceSnap.enabled ? "on" : "off"),
          write: (v) => {
            this.surfaceSnap.enabled = v === "on";
          },
          choices: ["off", "on"],
          names: ["Freehand · default", "Surface snap"],
        },
        {
          id: "surface-snap-align",
          label: "Snap placement",
          read: () => this.surfaceSnap.align,
          write: (v) => {
            this.surfaceSnap.align = v as typeof this.surfaceSnap.align;
          },
          choices: ["position", "position-and-orientation"],
          names: ["Position only", "Position + orientation"],
          disabled: !this.surfaceSnap.enabled || this.surfaceSnap.targetMode === "scene",
        },
        {
          id: "surface-snap-offset",
          label: "Surface offset (mm)",
          read: () => this.surfaceSnap.offsetMM,
          write: (v) => {
            this.surfaceSnap.offsetMM = Number(v);
          },
          min: -1000,
          max: 1000,
          step: 0.1,
          disabled: !this.surfaceSnap.enabled || this.surfaceSnap.targetMode === "scene",
        },
        {
          id: "surface-snap-axis",
          label: "Local alignment axis",
          read: () => this.surfaceSnap.localAxis,
          write: (v) => {
            this.surfaceSnap.localAxis = v as typeof this.surfaceSnap.localAxis;
          },
          choices: ["x", "y", "z"],
          disabled:
            !this.surfaceSnap.enabled ||
            this.surfaceSnap.targetMode === "scene" ||
            this.surfaceSnap.align === "position",
        },
        {
          id: "surface-snap-flip",
          label: "Flip surface normal",
          read: () => (this.surfaceSnap.flipNormal ? "on" : "off"),
          write: (v) => {
            this.surfaceSnap.flipNormal = v === "on";
          },
          choices: ["off", "on"],
          disabled: !this.surfaceSnap.enabled || this.surfaceSnap.targetMode === "scene",
        },
        {
          id: "surface-snap-roll",
          label: "Rotate about normal (°)",
          read: () => (this.surfaceSnap.rotateAboutNormal * 180) / Math.PI,
          write: (v) => {
            this.surfaceSnap.rotateAboutNormal = (Number(v) * Math.PI) / 180;
          },
          min: -180,
          max: 180,
          step: 5,
          disabled:
            !this.surfaceSnap.enabled ||
            this.surfaceSnap.targetMode === "scene" ||
            this.surfaceSnap.align === "position",
        },
      );
    }
    options.push({
      id: "global-snap",
      label: "Angle snap · Line + Move rotation",
      read: () => (this.path.snap ? "on" : "off"),
      write: (v) => (this.path.snap = v === "on" ? 15 : 0),
      choices: ["off", "on"],
      names: ["Off", "15°"],
    });
    options.push(...mirrorOptions);
    options.push({
      id: "alternate-tool",
      label: "Support trigger alternate",
      read: () => this.alternateTool,
      write: (v) => (this.alternateTool = v as typeof this.alternateTool),
      choices: ["opposite", "smooth", "off"],
      names: [
        active === "paint" ? "Opposite Paint · Paint / Erase" : "Opposite Clay · Add / Subtract",
        "Smooth",
        "Off",
      ],
    });
    return options.filter(
      (o) =>
        !(
          active === "move" &&
          ((this.move.interaction !== "translate" && o.id === "move-mode") ||
            ((this.move.interaction === "rotate" || this.move.interaction === "twist") &&
              o.id === "move-strength") ||
            (o.id === "move-stiffness" &&
              (this.move.mode !== "elastic" || this.move.interaction !== "translate")))
        ),
    );
  }
  options(): ToolOption[] {
    const declarations = this.declarations();
    if (
      (this.active === "tube" || this.active === "edit-spline") &&
      this.port.layers().active.layer.procedural
    )
      declarations.sort((a, b) => {
        const rank = (id: string) => (id === "tube-selected" ? -2 : id === "tube-radius" ? -1 : 0);
        return rank(a.id) - rank(b.id);
      });
    return declarations.map((d) => {
      const value = d.read(),
        disabled = this.busy || !!d.disabled || (!d.write && !d.action && !d.stepActions),
        index = d.choices?.indexOf(String(value)) ?? 0;
      return {
        action: d.action,
        stepActions: d.stepActions,
        slider: d.slider ? { min: d.min!, max: d.max!, value: Number(value) } : undefined,
        id: d.id,
        label: d.label,
        value:
          d.format?.(value) ??
          (d.choices
            ? (d.names ?? d.choices)[index]
            : typeof value === "number"
              ? Number(value.toFixed(3)).toString()
              : value),
        disabled,
        decrease: !disabled && (!!d.choices || Number(value) > d.min!),
        increase: !disabled && (!!d.choices || Number(value) < d.max!),
      };
    });
  }
  setValue(id: string, value: number): void {
    this.assertIdle();
    const d = this.declarations().find((o) => o.id === id);
    if (!d?.slider || d.disabled || !d.write || !Number.isFinite(value)) return;
    value = Math.max(d.min!, Math.min(d.max!, Math.round(value)));
    if (d.read() === value) return;
    d.write(value);
    this.port.changed();
  }
  adjust(id: string, direction: -1 | 1): void {
    this.assertIdle();
    const d = this.declarations().find((o) => o.id === id);
    if (!d || d.disabled || !d.write) throw new Error("This option is unavailable.");
    let value: number | string;
    if (d.choices) {
      const index = d.choices.indexOf(String(d.read()));
      value = d.choices[(index + direction + d.choices.length) % d.choices.length];
    } else
      value = Math.max(
        d.min!,
        Math.min(d.max!, Number((Number(d.read()) + direction * d.step!).toFixed(6))),
      );
    d.write(value);
    this.port.changed();
  }
}
