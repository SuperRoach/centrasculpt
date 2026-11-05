import {
  BufferGeometry,
  CanvasTexture,
  Group,
  type Intersection,
  Line,
  LineBasicMaterial,
  type Matrix4,
  Mesh,
  type Object3D,
  Points,
  PointsMaterial,
  Raycaster,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";
import type { IndependentLayers } from "./independent-layers";
import { objectDimensions } from "./object-dimensions";
import {
  finitePositive,
  fromDisplay,
  measurementValue,
  toDisplay,
  validatePrecision,
} from "./physical-units";
import { PrimitiveTools } from "./primitive-tools";
import type { ReferenceView } from "./reference-view";
import { copyTransform, type Vec3 } from "./transform";
import type { XRControllerState } from "./xr-input";
import type { MenuContent } from "./xr-menu-model";

/** Raycast committed source meshes and STL references; presentation-only objects never intercept. */
export function measurementHit(
  ray: Raycaster,
  surfaces: Object3D[],
  modelRoot: Object3D,
  references?: ReferenceView,
): Vec3 | null {
  const hits: Intersection[] = [];
  for (const root of surfaces) {
    root.updateWorldMatrix(true, true);
    ray.intersectObject(root, true, hits);
  }
  if (references)
    for (const panel of references.panels.values()) {
      if (panel.record.mime !== "model/stl" || !panel.mesh.visible) continue;
      panel.mesh.updateWorldMatrix(true, false);
      // References intentionally disable editing raycasts. Invoke the standard mesh picker explicitly.
      Mesh.prototype.raycast.call(panel.mesh, ray, hits);
    }
  hits.sort((a, b) => a.distance - b.distance);
  const hit = hits.find((h) => {
    let object: Object3D | null = h.object;
    while (object) {
      if (!object.visible) return false;
      object = object.parent;
    }
    return true;
  });
  if (!hit) return null;
  modelRoot.updateWorldMatrix(true, false);
  return modelRoot.worldToLocal(hit.point.clone()).toArray() as Vec3;
}
export function selectionDimensions(layers: IndependentLayers): Vec3 {
  return objectDimensions(layers, layers.transformNode.id);
}
export type PrecisionField =
  | "px"
  | "py"
  | "pz"
  | "rx"
  | "ry"
  | "rz"
  | "scale"
  | "width"
  | "height"
  | "depth"
  | "calibration"
  | "angle";
export class PrecisionTools {
  readonly group = new Group();
  active: 0 | 2 | 3 = 0;
  pending: Vec3[] = [];
  feedback = "";
  private replacing: { id: string; index: number } | null = null;
  private annotationIndex = 0;
  private saved?: object;
  private project?: object;
  private readonly ray = new Raycaster();
  private readonly direction = new Vector3();
  private armed = false;
  private owner = 0;
  private field: PrecisionField | null = null;
  private entry = "";
  private page: "home" | "transform" | "annotations" | "primitives" = "home";
  readonly primitives: PrimitiveTools;
  constructor(
    readonly layers: () => IndependentLayers,
    private readonly references?: ReferenceView,
    private readonly changed: () => void = () => {},
  ) {
    this.primitives = new PrimitiveTools(layers, changed);
  }
  get settings() {
    return this.layers().display.precision;
  }
  sync(): void {
    this.primitives.assembly.sync();
    this.primitives.enclosure.sync();
    const layers = this.layers();
    if (this.project !== layers.project || this.saved !== this.settings) {
      this.primitives.cancel();
      this.active = 0;
      this.pending = [];
      this.replacing = null;
      this.field = null;
      this.project = layers.project;
      this.saved = this.settings;
      this.redraw();
    }
    // Sibling of the source root: Boolean preview hides source geometry, never annotations.
    const parent = layers.group.parent ?? layers.group;
    if (this.group.parent !== parent) parent.add(this.group);
    if (parent !== layers.group) {
      this.group.position.copy(layers.group.position);
      this.group.quaternion.copy(layers.group.quaternion);
      this.group.scale.copy(layers.group.scale);
    }
  }
  start(count: 0 | 2 | 3): void {
    this.primitives.cancel();
    this.active = count;
    this.pending = [];
    this.replacing = null;
    this.armed = false;
    this.redraw();
    this.feedback = count
      ? `Release menu · point at a surface · tap Tool trigger (${count} points)`
      : "Measurement off";
  }
  pick(ray: Raycaster): boolean {
    if (!this.active) return false;
    const layers = this.layers();
    const point = measurementHit(
      ray,
      layers.viewMode === "boolean" && layers.composite.group.visible
        ? [layers.composite.group]
        : layers.project.layerStack.layers
            .filter((l) => l.visible)
            .map((l) => layers.runtime(l.id).surface.group),
      layers.group,
      this.references,
    );
    if (!point) {
      this.feedback = "No surface hit · point at sculpt or STL reference";
      return false;
    }
    if (!point.every((v) => Number.isFinite(v) && Math.abs(v) <= 1e6)) {
      this.feedback = "Surface point is outside supported model coordinates";
      return false;
    }
    if (this.replacing) {
      const m = this.settings.measurements.find((m) => m.id === this.replacing?.id);
      if (m) m.points[this.replacing.index] = point;
      this.start(0);
      this.persist();
      return true;
    }
    this.pending.push(point);
    if (this.pending.length === this.active) {
      if (this.settings.measurements.length >= 64) {
        this.start(0);
        this.feedback = "64 measurements maximum · remove one first";
        return false;
      }
      this.settings.measurements.push({ id: crypto.randomUUID(), points: this.pending });
      this.pending = [];
      this.persist();
      this.feedback = `${measurementValue(this.settings.measurements[this.settings.measurements.length - 1].points, this.settings)} · tap to start another`;
      return true;
    }
    this.redraw();
    this.feedback = `${this.pending.length}/${this.active} points · tap next surface`;
    return true;
  }
  step(tool: XRControllerState | undefined, pose: Matrix4 | undefined, enabled: boolean): boolean {
    if (this.primitives.step(tool, pose, enabled)) return true;
    if (!this.active) {
      this.armed = false;
      return false;
    }
    if (!enabled || !pose || !tool?.connected || !tool.tracked || tool.role !== "tool") {
      this.armed = false;
      if (this.pending.length) {
        this.pending = [];
        this.redraw();
      }
      return true;
    }
    if (this.owner !== tool.connectionId) {
      this.owner = tool.connectionId;
      this.armed = false;
      if (this.pending.length) {
        this.pending = [];
        this.redraw();
      }
    }
    if (!tool.buttons.trigger.pressed) this.armed = true;
    if (this.armed && tool.buttons.trigger.justPressed) {
      this.ray.ray.origin.setFromMatrixPosition(pose);
      this.ray.ray.direction.copy(this.direction.set(0, 0, -1).transformDirection(pose));
      this.pick(this.ray);
      this.armed = false;
    }
    return true;
  }
  apply(field: PrecisionField, value: number): void {
    if (!Number.isFinite(value)) throw new Error("Enter a finite numeric value.");
    const settings = this.settings;
    if (field === "calibration") settings.millimetresPerUnit = finitePositive(value);
    else if (field === "angle") {
      if (value < 0 || value > 180)
        throw new Error("Angle increment must be 0–180°; zero disables snapping.");
      settings.angleSnapDegrees = value;
    } else {
      const layers = this.layers(),
        next = copyTransform(layers.transformNode.transform);
      const axis = "xyz".indexOf(field[1]);
      if (field === "scale") next.scale = [value, value, value];
      else if (["width", "height", "depth"].includes(field)) {
        const size = selectionDimensions(layers)[["width", "height", "depth"].indexOf(field)];
        if (!(size > 1e-9)) throw new Error("Cannot resize an empty or zero-size selection.");
        const factor = fromDisplay(finitePositive(value), settings) / size;
        next.scale = next.scale.map((v) => v * factor) as Vec3;
      } else if (field[0] === "p") next.position[axis] = fromDisplay(value, settings);
      else next.rotation[axis] = (value * Math.PI) / 180;
      layers.setActiveTransform(next);
    }
    this.persist();
  }
  remove(id: string): void {
    this.settings.measurements = this.settings.measurements.filter((m) => m.id !== id);
    this.persist();
  }
  reposition(id: string, index: number): void {
    const m = this.settings.measurements.find((m) => m.id === id);
    if (!m || !Number.isInteger(index) || index < 0 || index >= m.points.length)
      throw new Error("Invalid annotation point.");
    this.start(2);
    this.replacing = { id, index };
  }
  private persist(): void {
    validatePrecision(this.settings);
    this.redraw();
    this.changed();
  }
  private clear(): void {
    for (const child of [...this.group.children]) {
      if (child instanceof Points) {
        child.geometry.dispose();
        (child.material as PointsMaterial).dispose();
      }
      if (child instanceof Line) {
        child.geometry.dispose();
        (child.material as LineBasicMaterial).dispose();
      }
      if (child instanceof Sprite) {
        child.material.map?.dispose();
        child.material.dispose();
      }
      child.removeFromParent();
    }
  }
  private redraw(): void {
    this.clear();
    const endpoints = [...this.settings.measurements.flatMap((m) => m.points), ...this.pending];
    if (endpoints.length) {
      const markers = new Points(
        new BufferGeometry().setFromPoints(endpoints.map((p) => new Vector3(...p))),
        new PointsMaterial({ color: "#fff3ca", size: 6, sizeAttenuation: false, depthTest: false }),
      );
      markers.renderOrder = 102;
      markers.raycast = () => {};
      this.group.add(markers);
    }
    for (const m of this.settings.measurements) {
      const points = m.points.map((p) => new Vector3(...p));
      const line = new Line(
        new BufferGeometry().setFromPoints(points),
        new LineBasicMaterial({ color: "#ffe293", depthTest: false }),
      );
      line.renderOrder = 100;
      line.raycast = () => {};
      this.group.add(line);
      if (typeof document === "undefined") continue;
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 96;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      ctx.fillStyle = "#18221f";
      ctx.fillRect(0, 0, 512, 96);
      ctx.font = "bold 48px sans-serif";
      ctx.fillStyle = "#fff3ca";
      ctx.textAlign = "center";
      ctx.fillText(measurementValue(m.points, this.settings), 256, 66);
      const sprite = new Sprite(
        new SpriteMaterial({ map: new CanvasTexture(canvas), depthTest: false }),
      );
      sprite.position.copy(points[1]);
      sprite.scale.set(0.8, 0.15, 1);
      sprite.renderOrder = 101;
      sprite.raycast = () => {};
      this.group.add(sprite);
    }
  }
  dispose(): void {
    this.primitives.dispose();
    this.clear();
    this.group.removeFromParent();
  }
  content(): MenuContent {
    if (this.page === "primitives") return this.primitives.content();
    const buttons: MenuContent["buttons"] = [
      {
        id: "world:home",
        label: "‹ World Settings",
        rect: { x: 40, y: 140, width: 450, height: 74 },
      },
    ];
    const add = (id: string, label: string, i: number, detail?: string): void => {
      buttons.push({
        id: `precision:${id}`,
        label,
        detail,
        disabled: !this.layers().recoveryReady,
        rect: { x: 40 + (i % 2) * 548, y: 244 + Math.floor(i / 2) * 125, width: 524, height: 112 },
      });
    };
    const s = this.settings;
    if (this.field) {
      add("value", `${this.field}: ${this.entry || "…"}`, 0);
      for (const [i, key] of ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "-"].entries())
        buttons.push({
          id: `precision:key:${key}`,
          label: key,
          rect: {
            x: 40 + (i % 3) * 240,
            y: 380 + Math.floor(i / 3) * 130,
            width: 220,
            height: 112,
          },
        });
      buttons.push(
        {
          id: "precision:backspace",
          label: "⌫",
          rect: { x: 780, y: 380, width: 330, height: 112 },
        },
        {
          id: "precision:apply",
          label: "Apply",
          rect: { x: 780, y: 510, width: 330, height: 112 },
        },
        {
          id: "precision:cancel",
          label: "Cancel",
          rect: { x: 780, y: 640, width: 330, height: 112 },
        },
      );
    } else if (this.page === "transform") {
      (
        [
          "px",
          "py",
          "pz",
          "rx",
          "ry",
          "rz",
          "scale",
          "width",
          "height",
          "depth",
        ] as PrecisionField[]
      ).forEach((f, i) => {
        add(
          `field:${f}`,
          `${{ px: "Position X", py: "Position Y", pz: "Position Z", rx: "Rotation X°", ry: "Rotation Y°", rz: "Rotation Z°", scale: "Uniform scale", width: "Target width", height: "Target height", depth: "Target depth", calibration: "Calibration", angle: "Angle snap" }[f]} · ${this.value(f)}`,
          i,
        );
      });
      add("home", "‹ Measure", 10);
      add("field:angle", `Angle snap · ${s.angleSnapDegrees}°`, 11);
    } else if (this.page === "annotations") {
      const m = s.measurements[this.annotationIndex % Math.max(1, s.measurements.length)];
      if (m) {
        add("delete", `Remove annotation ${(this.annotationIndex % s.measurements.length) + 1}`, 0);
        add("next", "Next annotation", 5);
        m.points.forEach((_, i) => {
          add(`replace:${i}`, `Reposition point ${i + 1}`, i + 1);
        });
      }
      add("home", "‹ Measure", 6);
    } else {
      add("distance", "Measure distance", 0);
      add("angle", "Measure three-point angle", 1);
      add("off", `Measurement · ${this.active ? "On" : "Off"}`, 2);
      add("dimensions", "Selected width / height / depth", 3);
      add("transform", "Precision transforms…", 4, "Position · degrees · scale · dimensions");
      add("unit", `Units · ${s.unit}`, 5);
      add(
        "snap",
        `Position snap · ${s.translationSnapMM || "Off"}${s.translationSnapMM ? " mm" : ""}`,
        6,
      );
      add("field:angle", `Angle snap · ${s.angleSnapDegrees || "Off"}°`, 7);
      add("annotations", `Annotations · ${s.measurements.length}`, 8);
      add("field:calibration", `Calibration · ${s.millimetresPerUnit} mm/unit`, 9);
      add("primitives", "Primitives…", 10, "Editable Box · Cylinder · Sphere");
    }
    return {
      title: "MEASURE & PRECISION",
      subtitle: `${this.layers().transformNode.name} · Model coordinates · ${s.unit} · XYZ degrees · uniform dimensions`,
      buttons,
      labels: [],
      footer:
        this.feedback ||
        "Annotations stay at model-space points · measurements do not edit geometry",
    };
  }
  value(field: PrecisionField): string {
    const t = this.layers().transformNode.transform;
    if (field === "calibration") return String(this.settings.millimetresPerUnit);
    if (field === "angle") return String(this.settings.angleSnapDegrees);
    if (field === "scale") return String(t.scale[0]);
    if (["width", "height", "depth"].includes(field)) return "set target";
    const axis = "xyz".indexOf(field[1]);
    return (
      field[0] === "p"
        ? toDisplay(t.position[axis], this.settings)
        : (t.rotation[axis] * 180) / Math.PI
    ).toString();
  }
  activate(id: string): boolean {
    if (id === "primitive:place" || id === "assembly:pick-fit" || id === "assembly:pick-pair")
      this.start(0);
    if (id === "primitive:transform") {
      this.page = "transform";
      return true;
    }
    if (this.primitives.activate(id)) return true;
    if (!id.startsWith("precision:")) return false;
    if (!this.layers().recoveryReady) return true;
    const action = id.slice(10);
    try {
      if (action.startsWith("field:")) {
        this.field = action.slice(6) as PrecisionField;
        this.entry = "";
      } else if (action.startsWith("key:"))
        this.entry = (this.entry + action.slice(4)).slice(0, 24);
      else if (action === "backspace") this.entry = this.entry.slice(0, -1);
      else if (action === "cancel") this.field = null;
      else if (action === "apply" && this.field) {
        if (!this.entry.trim()) throw new Error("Enter a value first.");
        this.apply(this.field, Number(this.entry));
        this.field = null;
        this.feedback = "Applied · Undo available for transforms";
      } else if (action === "distance") this.start(2);
      else if (action === "angle") this.start(3);
      else if (action === "off") this.start(0);
      else if (action === "dimensions")
        this.feedback = selectionDimensions(this.layers())
          .map((v) => `${toDisplay(v, this.settings).toFixed(3)} ${this.settings.unit}`)
          .join(" × ");
      else if (action === "unit") {
        const units = ["mm", "cm", "in"] as const;
        this.settings.unit = units[(units.indexOf(this.settings.unit) + 1) % 3];
        this.persist();
      } else if (action === "snap") {
        const values = [0, 0.1, 1, 5];
        this.settings.translationSnapMM =
          values[(values.indexOf(this.settings.translationSnapMM) + 1) % 4];
        this.persist();
      } else if (action === "delete") {
        const m =
          this.settings.measurements[
            this.annotationIndex % Math.max(1, this.settings.measurements.length)
          ];
        if (m) this.remove(m.id);
      } else if (action.startsWith("replace:")) {
        const m =
          this.settings.measurements[
            this.annotationIndex % Math.max(1, this.settings.measurements.length)
          ];
        if (m) this.reposition(m.id, Number(action.slice(8)));
      } else if (action === "next") this.annotationIndex++;
      else if (
        action === "transform" ||
        action === "home" ||
        action === "annotations" ||
        action === "primitives"
      )
        this.page = action;
    } catch (error) {
      this.feedback = error instanceof Error ? error.message : "Invalid precision value";
    }
    return true;
  }
}
