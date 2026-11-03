import {
  type Camera,
  type Group,
  Matrix4,
  Plane,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
} from "three";
import { CLAY_TIP_REACH_METRES } from "./clay-path";
import type { EditorToolState } from "./editor-tool-state";
import type { IndependentLayers } from "./independent-layers";
import { type TubeInputState, XRTubeTool } from "./xr-tube-tool";

/** Mouse adapter for the same draw/edit transactions and handles used in VR. */
export class DesktopTubeTool {
  private readonly tube: XRTubeTool;
  private readonly pointer = new Vector2();
  private readonly ray = new Raycaster();
  private readonly plane = new Plane();
  private readonly pose = new Matrix4();
  private readonly grip = new Matrix4();
  private readonly input: TubeInputState = {
    pointing: false,
    connected: true,
    tracked: true,
    gripTracked: true,
    role: "tool",
    connectionId: 1,
    stick: { available: false, x: 0, y: 0 },
    buttons: {
      trigger: {
        available: true,
        value: 0,
        rawValue: 0,
        pressed: false,
        touched: false,
        justPressed: false,
        justReleased: false,
      },
    },
  };
  private captured: number | null = null;
  constructor(
    layers: () => IndependentLayers,
    private readonly tools: EditorToolState,
    root: Group,
    private readonly camera: Camera,
    private readonly canvas: HTMLCanvasElement,
    private readonly target: () => Vector3,
    private readonly enabled: () => boolean,
    changed: () => void,
  ) {
    this.tube = new XRTubeTool(layers, tools, root, changed, () => {}, 100);
    canvas.addEventListener("pointermove", (e) => this.locate(e));
    canvas.addEventListener("pointerleave", () => {
      this.input.pointing = false;
      canvas.style.cursor = "";
    });
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !this.available || this.tools.busy) return;
      this.locate(e);
      this.plane.setFromNormalAndCoplanarPoint(
        camera.getWorldDirection(new Vector3()),
        this.target(),
      );
      // Arm before the press, even if no animation frame has run since tool selection.
      this.update(performance.now());
      this.captured = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      this.input.buttons.trigger.pressed = true;
      this.input.buttons.trigger.justPressed = true;
      this.update(performance.now());
    });
    canvas.addEventListener("pointerup", (e) => {
      if (e.pointerId !== this.captured || e.button !== 0) return;
      this.locate(e);
      this.input.buttons.trigger.pressed = false;
      this.update(performance.now());
      this.release();
    });
    canvas.addEventListener("pointercancel", () => this.cancel());
    canvas.addEventListener("lostpointercapture", () => {
      if (this.captured !== null) this.cancel();
    });
    window.addEventListener("blur", () => this.cancel());
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.cancel();
    });
  }
  private get available(): boolean {
    return this.enabled() && (this.tools.active === "tube" || this.tools.active === "edit-spline");
  }
  private locate(e: PointerEvent): void {
    this.input.pointing = true;
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      (-(e.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }
  private release(): void {
    const id = this.captured;
    this.captured = null;
    if (id !== null && this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id);
  }
  cancel(): void {
    this.input.buttons.trigger.pressed = false;
    this.input.buttons.trigger.justPressed = false;
    this.tube.cancel();
    this.canvas.style.cursor = "";
    this.release();
  }
  update(now: number): void {
    if (!this.available) {
      this.cancel();
      return;
    }
    this.ray.setFromCamera(this.pointer, this.camera);
    const direction = this.ray.ray.direction,
      rotation = new Quaternion().setFromUnitVectors(new Vector3(0, 0, -1), direction);
    this.pose.compose(this.ray.ray.origin, rotation, new Vector3(1, 1, 1));
    const point = this.ray.ray.intersectPlane(this.plane, new Vector3()) ?? this.target().clone();
    this.grip.compose(
      point.addScaledVector(direction, -CLAY_TIP_REACH_METRES),
      rotation,
      new Vector3(1, 1, 1),
    );
    this.tube.update(this.input, this.pose, now, true, this.grip);
    this.canvas.style.cursor =
      this.input.pointing && this.tube.hoverTarget ? "pointer" : "crosshair";
    this.input.buttons.trigger.justPressed = false;
  }
}
