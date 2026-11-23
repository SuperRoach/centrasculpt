import {
  type Camera,
  Euler,
  Group,
  type Matrix4,
  Quaternion,
  Raycaster,
  type Scene,
  Vector2,
  Vector3,
} from "three";
import { type ComponentReference, validateComponents } from "./component-references";
import { type ComponentView, componentRotation } from "./component-view";
import type { InputOwnership } from "./interaction";
import {
  rotateAxisForShortcut,
  translateAxisForShortcut,
  UniformTransformControls,
} from "./transform-tools";

type Mode = "translate" | "rotate";
type Target = { record: ComponentReference; frame: Matrix4; mm: number };
type Drag = Target & { draft: ComponentReference; pointer: number };
const degrees = 180 / Math.PI;

export class ComponentTransformTool {
  private readonly gizmo: UniformTransformControls;
  private readonly proxy = new Group();
  private readonly ray = new Raycaster();
  private readonly events = new AbortController();
  private drag?: Drag;
  private hoveredPointer = -1;
  private mode: Mode | null = null;
  private axisKey = "";

  constructor(
    private readonly camera: Camera,
    private readonly canvas: HTMLElement,
    scene: Scene,
    private readonly view: ComponentView,
    private readonly input: InputOwnership,
    private readonly port: {
      target: () => Target | undefined;
      select: (id: string) => void;
      deselect: () => void;
      commit: (original: ComponentReference, draft: ComponentReference) => void;
      busy: () => boolean;
      before: () => void;
      changed: () => void;
      camera: (enabled: boolean) => void;
      status: (message: string) => void;
    },
  ) {
    this.gizmo = new UniformTransformControls(camera);
    this.gizmo.enabled = false;
    this.gizmo.setSize(0.85);
    scene.add(this.proxy, this.gizmo.getHelper());
    const options = { capture: true, signal: this.events.signal };
    canvas.addEventListener("pointermove", this.move, options);
    canvas.addEventListener("pointerup", this.finish, options);
    canvas.addEventListener("pointercancel", this.interrupt, options);
    canvas.addEventListener("lostpointercapture", this.interrupt, options);
    window.addEventListener(
      "keyup",
      (event) => {
        if (event.code === this.axisKey) this.constrain("");
      },
      options,
    );
    this.gizmo.addEventListener("mouseDown", () => {
      const target = this.port.target();
      if (!target || !input.beginPreview(true, port.busy())) return;
      this.drag = { ...target, draft: target.record, pointer: this.hoveredPointer };
      canvas.setPointerCapture(this.hoveredPointer);
      this.port.camera(false);
    });
    this.gizmo.addEventListener("objectChange", () => this.update());
    this.gizmo.addEventListener("mouseUp", () => {
      const drag = this.drag;
      if (!drag) return;
      this.release();
      if (this.matches(drag) && drag.draft !== drag.record)
        this.port.commit(drag.record, drag.draft);
    });
  }

  get active() {
    return this.mode !== null;
  }
  get draft() {
    return this.drag?.draft;
  }

  pick = (event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || this.drag || this.port.busy()) return;
    const pointer = this.pointer(event);
    this.camera.updateWorldMatrix(true, false);
    if (this.gizmo.enabled) {
      this.gizmo.pointerHover({
        x: pointer.x,
        y: pointer.y,
        button: event.button,
      } as unknown as PointerEvent);
      if (this.gizmo.axis) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.hoveredPointer = event.pointerId;
        this.gizmo.pointerDownAt(pointer.x, pointer.y, event.button);
        if (!this.drag) this.cancel();
        return;
      }
    }
    this.ray.setFromCamera(pointer, this.camera);
    const id = this.view.pick(this.ray);
    if (!id) {
      this.port.deselect();
      if (this.active) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.setMode(null);
        this.port.status("Component placement ended");
      }
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    this.port.select(id);
    this.setMode(this.mode ?? "translate");
  };

  private pointer(event: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    return new Vector2(
      (2 * (event.clientX - rect.left)) / rect.width - 1,
      1 - (2 * (event.clientY - rect.top)) / rect.height,
    );
  }

  private move = (event: PointerEvent) => {
    if (!this.gizmo.enabled) return;
    const point = this.pointer(event);
    if (!this.drag) {
      this.gizmo.pointerHover({
        x: point.x,
        y: point.y,
        button: event.button,
      } as unknown as PointerEvent);
      return;
    }
    if (this.drag.pointer !== event.pointerId) return;
    event.stopImmediatePropagation();
    this.gizmo.pointerMove({ x: point.x, y: point.y, button: -1 } as unknown as PointerEvent);
  };

  private finish = (event: PointerEvent) => {
    if (this.drag?.pointer !== event.pointerId || event.button !== 0) return;
    event.stopImmediatePropagation();
    this.gizmo.pointerUp(null);
  };

  private interrupt = (event: PointerEvent) => {
    if (this.drag?.pointer !== event.pointerId) return;
    event.stopImmediatePropagation();
    this.cancel();
  };

  setMode(mode: Mode | null) {
    this.cancel();
    if (mode && this.port.busy()) return;
    if (mode) this.port.before();
    this.mode = mode;
    this.input.referenceEditing = !!mode;
    this.constrain("");
    this.sync();
    this.port.changed();
  }

  constrain(code: string): boolean {
    const axis =
      this.mode === "rotate" ? rotateAxisForShortcut(code) : translateAxisForShortcut(code);
    if (code && !axis) return false;
    const snapped = this.port.target()?.record.gapMm !== undefined;
    this.axisKey = code;
    this.gizmo.rotateAxisConstraint = !snapped || axis === "Y" ? axis : null;
    this.gizmo.translateAxisConstraint = !snapped || axis !== "Y" ? axis : null;
    return !!axis;
  }

  private matches(drag: Drag) {
    const target = this.port.target();
    return (
      !this.port.busy() &&
      target?.record === drag.record &&
      target.mm === drag.mm &&
      target.frame.elements.every(
        (value, index) => Math.abs(value - drag.frame.elements[index]) < 1e-9,
      )
    );
  }

  private update() {
    const drag = this.drag;
    if (!drag) return;
    if (!this.matches(drag)) {
      this.cancel();
      return;
    }
    const { record, frame, mm } = drag;
    const next = { ...record };
    if (this.mode === "translate") {
      next.positionMm = this.proxy.position
        .clone()
        .applyMatrix4(frame.clone().invert())
        .multiplyScalar(mm)
        .toArray();
      if (record.gapMm !== undefined) next.positionMm[1] = record.positionMm[1];
    } else {
      const local = new Quaternion();
      frame.decompose(new Vector3(), local, new Vector3());
      local.invert().multiply(this.proxy.quaternion);
      const e = new Euler();
      if (record.gapMm !== undefined) {
        const yaw = e.setFromQuaternion(local, "YXZ").y;
        if (record.rotation[0] === 0 && record.rotation[2] === 0) {
          next.rotation = [0, yaw * degrees, 0];
        } else {
          local.setFromAxisAngle(new Vector3(0, 1, 0), yaw - record.rotation[1] / degrees);
          e.setFromQuaternion(local.multiply(componentRotation(record)), "XYZ");
          next.rotation = [e.x * degrees, e.y * degrees, e.z * degrees];
        }
      } else {
        e.setFromQuaternion(local, "XYZ");
        next.rotation = [e.x * degrees, e.y * degrees, e.z * degrees];
      }
    }
    try {
      [drag.draft] = validateComponents([next]);
    } catch (error) {
      this.cancel();
      this.port.status(error instanceof Error ? error.message : String(error));
    }
  }

  private release() {
    if (!this.drag) return;
    const { pointer } = this.drag;
    this.drag = undefined;
    if (this.canvas.hasPointerCapture(pointer)) this.canvas.releasePointerCapture(pointer);
    this.input.end("preview");
    this.port.camera(this.input.cameraEnabled);
  }

  cancel(): boolean {
    const active = !!this.drag;
    this.release();
    if (this.gizmo.dragging) this.gizmo.pointerUp(null);
    return active;
  }

  sync() {
    if (!this.mode) {
      this.gizmo.enabled = false;
      this.gizmo.detach();
      return;
    }
    const target = this.port.target();
    const object = target && this.view.object(target.record.id);
    if (!target || !object || this.port.busy()) {
      this.setMode(null);
      return;
    }
    if (this.drag) {
      if (this.matches(this.drag)) return;
      this.cancel();
    }
    const snapped = target.record.gapMm !== undefined;
    this.gizmo.setMode(this.mode);
    this.gizmo.setSpace(snapped ? "local" : this.input.space);
    this.gizmo.showX = !snapped || this.mode === "translate";
    this.gizmo.showY = !snapped || this.mode === "rotate";
    this.gizmo.showZ = !snapped || this.mode === "translate";
    object.updateWorldMatrix(true, false);
    object.matrixWorld.decompose(this.proxy.position, this.proxy.quaternion, this.proxy.scale);
    if (snapped) {
      target.frame.decompose(new Vector3(), this.proxy.quaternion, new Vector3());
      if (this.mode === "rotate")
        this.proxy.quaternion.multiply(
          new Quaternion().setFromAxisAngle(
            new Vector3(0, 1, 0),
            target.record.rotation[1] / degrees,
          ),
        );
    }
    this.proxy.scale.setScalar(1);
    this.proxy.updateMatrixWorld(true);
    this.gizmo.enabled = true;
    if (this.gizmo.object !== this.proxy) this.gizmo.attach(this.proxy);
  }

  dispose() {
    this.setMode(null);
    this.events.abort();
    this.gizmo.getHelper().dispose();
    this.gizmo.getHelper().removeFromParent();
    this.proxy.removeFromParent();
  }
}
