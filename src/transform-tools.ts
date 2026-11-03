import type { Camera, Scene } from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import type { IndependentLayers } from "./independent-layers";
import type { EditorMode, InputOwnership, TransformSpace } from "./interaction";
import type { VolumeTransform } from "./transform";
import { uniformScale } from "./transform";

/** Every built-in scale handle uses TransformControls' isotropic XYZ path. */
export class UniformTransformControls extends TransformControls {
  rotateAxisConstraint: "X" | "Y" | "Z" | null = null;
  translateAxisConstraint: "X" | "Y" | "Z" | null = null;
  pointerDownBaseAxis: UniformTransformControls["axis"] = null;

  pointerDownAt(x: number, y: number, button: number): void {
    this.pointerDown({ x, y, button } as unknown as PointerEvent);
  }

  override pointerDown(pointer: PointerEvent | null): void {
    this.pointerDownBaseAxis = this.axis;
    if (this.mode === "rotate" && this.axis !== null && this.rotateAxisConstraint !== null) {
      this.axis = this.rotateAxisConstraint;
      this.getHelper().updateMatrixWorld(true);
    }
    if (this.mode === "translate" && this.axis !== null && this.translateAxisConstraint !== null) {
      this.axis = this.translateAxisConstraint;
      this.getHelper().updateMatrixWorld(true);
    }
    if (this.mode === "scale" && this.axis !== null) {
      this.axis = "XYZ";
      this.getHelper().updateMatrixWorld(true);
    }
    super.pointerDown(pointer);
  }
}
export type TransformToolCallbacks = {
  beforeDrag: () => void;
  camera: (enabled: boolean) => void;
  changed: () => void;
  error: (message: string) => void;
  busy: () => boolean;
  hitLayer?: (event: PointerEvent) => string | null;
  selectionChanged?: () => void;
};
const ROTATE_AXIS_KEYS: Record<string, "X" | "Y" | "Z"> = {
  KeyR: "X",
  KeyF: "Y",
  KeyV: "Z",
};
export function rotateAxisForShortcut(code: string): "X" | "Y" | "Z" | null {
  return ROTATE_AXIS_KEYS[code] ?? null;
}
const TRANSLATE_AXIS_KEYS: Record<string, "X" | "Y" | "Z"> = {
  KeyE: "X",
  KeyD: "Y",
  KeyC: "Z",
};
export function translateAxisForShortcut(code: string): "X" | "Y" | "Z" | null {
  return TRANSLATE_AXIS_KEYS[code] ?? null;
}
export class LayerTransformTools {
  readonly controls: UniformTransformControls;
  private readonly heldRotateAxisKeys: string[] = [];
  private readonly heldTranslateAxisKeys: string[] = [];
  private baseRotateAxis: UniformTransformControls["axis"] = "XYZE";
  private baseTranslateAxis: UniformTransformControls["axis"] = "XYZ";
  private surfaceBaseRotateAxis: UniformTransformControls["axis"] = "XYZE";
  private surfaceBaseTranslateAxis: UniformTransformControls["axis"] = "XYZ";
  private startingSurfaceRotate = false;
  private startingSurfaceTranslate = false;
  private readonly onCanvasPointerDown = (event: Event) =>
    this.beginSurfaceTransform(event as PointerEvent);
  constructor(
    camera: Camera,
    private readonly canvas: HTMLElement,
    scene: Scene,
    private readonly layers: () => IndependentLayers,
    readonly input: InputOwnership,
    private readonly callbacks: TransformToolCallbacks,
  ) {
    this.controls = new UniformTransformControls(camera, canvas);
    this.controls.setSize(0.85);
    scene.add(this.controls.getHelper());
    Object.assign(this.controls, {
      minX: -1000,
      minY: -1000,
      minZ: -1000,
      maxX: 1000,
      maxY: 1000,
      maxZ: 1000,
    });
    canvas.addEventListener("pointerdown", this.onCanvasPointerDown, true);
    this.controls.addEventListener("mouseDown", () => {
      if (this.controls.mode === "rotate")
        this.baseRotateAxis = this.startingSurfaceRotate
          ? this.surfaceBaseRotateAxis
          : (this.controls.pointerDownBaseAxis ?? this.controls.axis ?? "XYZE");
      if (this.controls.mode === "translate")
        this.baseTranslateAxis = this.startingSurfaceTranslate
          ? this.surfaceBaseTranslateAxis
          : (this.controls.pointerDownBaseAxis ?? this.controls.axis ?? "XYZ");
      this.callbacks.beforeDrag();
      try {
        if (!input.beginTransform(this.layers().transformNode.editable, callbacks.busy()))
          throw new Error("This layer cannot be transformed now.");
        this.layers().beginTransform();
        callbacks.camera(false);
      } catch (error) {
        input.end("transform");
        this.controls.pointerUp(null);
        callbacks.error(error instanceof Error ? error.message : "Unable to transform layer.");
      }
    });
    this.controls.addEventListener("objectChange", () => {
      if (!this.layers().transforming) return;
      const object = this.controls.object!;
      const next: VolumeTransform = {
        position: [object.position.x, object.position.y, object.position.z],
        rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
        scale: [object.scale.x, object.scale.y, object.scale.z],
      };
      if (this.controls.mode === "scale") {
        const previous = this.layers().transformNode.transform.scale[0],
          value = Number.isNaN(next.scale[0])
            ? previous
            : Math.min(1000, Math.max(0.001, next.scale[0]));
        next.scale = [value, value, value];
      }
      try {
        this.layers().updateTransform(next);
        callbacks.changed();
      } catch (error) {
        this.layers().cancelTransform();
        this.controls.pointerUp(null);
        callbacks.error(error instanceof Error ? error.message : "Invalid transform.");
      }
    });
    this.controls.addEventListener("dragging-changed", (event) => {
      if (event.value) return;
      this.layers().finishTransform();
      input.end("transform");
      callbacks.camera(input.cameraEnabled);
      callbacks.changed();
    });
    this.sync();
  }
  holdRotateAxis(code: string): boolean {
    if (this.input.mode !== "rotate" || !rotateAxisForShortcut(code)) return false;
    const index = this.heldRotateAxisKeys.indexOf(code);
    if (index >= 0) this.heldRotateAxisKeys.splice(index, 1);
    this.heldRotateAxisKeys.push(code);
    this.controls.rotateAxisConstraint = rotateAxisForShortcut(code);
    this.applyHeldAxis("rotate");
    return true;
  }
  releaseRotateAxis(code: string): void {
    const index = this.heldRotateAxisKeys.indexOf(code);
    if (index < 0) return;
    this.heldRotateAxisKeys.splice(index, 1);
    const next = this.heldRotateAxisKeys.at(-1);
    this.controls.rotateAxisConstraint = next ? rotateAxisForShortcut(next) : null;
    this.applyHeldAxis("rotate");
  }
  holdTranslateAxis(code: string): boolean {
    if (this.input.mode !== "translate" || !translateAxisForShortcut(code)) return false;
    const index = this.heldTranslateAxisKeys.indexOf(code);
    if (index >= 0) this.heldTranslateAxisKeys.splice(index, 1);
    this.heldTranslateAxisKeys.push(code);
    this.controls.translateAxisConstraint = translateAxisForShortcut(code);
    this.applyHeldAxis("translate");
    return true;
  }
  releaseTranslateAxis(code: string): void {
    const index = this.heldTranslateAxisKeys.indexOf(code);
    if (index < 0) return;
    this.heldTranslateAxisKeys.splice(index, 1);
    const next = this.heldTranslateAxisKeys.at(-1);
    this.controls.translateAxisConstraint = next ? translateAxisForShortcut(next) : null;
    this.applyHeldAxis("translate");
  }
  clearRotateAxes(): void {
    this.heldRotateAxisKeys.length = 0;
    this.controls.rotateAxisConstraint = null;
    this.applyHeldAxis("rotate");
  }
  clearAxisConstraints(): void {
    this.clearRotateAxes();
    this.heldTranslateAxisKeys.length = 0;
    this.controls.translateAxisConstraint = null;
    this.applyHeldAxis("translate");
  }
  private applyHeldAxis(mode: "rotate" | "translate"): void {
    if (!this.controls.dragging) return;
    const rotate = mode === "rotate",
      code = (rotate ? this.heldRotateAxisKeys : this.heldTranslateAxisKeys).at(-1),
      axis = rotate ? rotateAxisForShortcut(code ?? "") : translateAxisForShortcut(code ?? "");
    this.controls.axis = axis ?? (rotate ? this.baseRotateAxis : this.baseTranslateAxis);
    this.controls.getHelper().updateMatrixWorld(true);
  }
  private normalizedPointer(event: PointerEvent): { x: number; y: number; button: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      button: event.button,
    };
  }
  private beginSurfaceTransform(event: PointerEvent): void {
    if (
      event.target !== this.canvas ||
      event.button !== 0 ||
      event.isPrimary === false ||
      (this.input.mode !== "rotate" && this.input.mode !== "translate") ||
      this.controls.dragging ||
      this.callbacks.busy() ||
      !this.callbacks.hitLayer
    )
      return;
    const targetLayerId = this.callbacks.hitLayer(event);
    if (!targetLayerId) return;
    const layers = this.layers();
    if (!layers.project.layerStack.get(targetLayerId).editable) return;
    if (layers.transformNode.id !== targetLayerId) {
      layers.select(targetLayerId);
      this.sync();
      this.callbacks.changed();
      this.callbacks.selectionChanged?.();
    }
    if (!layers.transformNode.editable || this.callbacks.busy()) return;

    const point = this.normalizedPointer(event);
    this.controls.getHelper().updateMatrixWorld(true);
    this.controls.pointerHover(point as unknown as PointerEvent);
    if (this.input.mode === "rotate") {
      this.surfaceBaseRotateAxis = this.controls.axis ?? "XYZE";
      const code = this.heldRotateAxisKeys.at(-1);
      this.controls.axis = (code && rotateAxisForShortcut(code)) || this.surfaceBaseRotateAxis;
    } else {
      this.surfaceBaseTranslateAxis = this.controls.axis ?? "XYZ";
      const code = this.heldTranslateAxisKeys.at(-1);
      this.controls.axis =
        (code && translateAxisForShortcut(code)) || this.surfaceBaseTranslateAxis;
    }
    this.controls.getHelper().updateMatrixWorld(true);
    this.startingSurfaceRotate = this.input.mode === "rotate";
    this.startingSurfaceTranslate = this.input.mode === "translate";
    try {
      this.controls.pointerDownAt(point.x, point.y, event.button);
    } finally {
      this.startingSurfaceRotate = false;
      this.startingSurfaceTranslate = false;
    }
  }
  setMode(mode: EditorMode): void {
    this.clearAxisConstraints();
    this.finish();
    this.input.mode = mode;
    this.sync();
  }
  setSpace(space: TransformSpace): void {
    this.finish();
    this.input.space = space;
    this.sync();
  }
  sync(): void {
    const layer = this.layers().transformNode;
    let allowed = this.input.mode !== "sculpt" && layer.editable && !this.callbacks.busy();
    if (allowed && this.input.mode === "scale") {
      try {
        uniformScale(layer.transform);
      } catch (error) {
        allowed = false;
        this.callbacks.error((error as Error).message);
      }
    }
    this.controls.enabled = allowed;
    if (!allowed) {
      this.controls.detach();
      return;
    }
    this.controls.setMode(this.input.mode === "sculpt" ? "translate" : this.input.mode);
    this.controls.setSpace(this.input.space);
    const object = this.layers().transformObject;
    if (this.controls.object !== object) this.controls.attach(object);
  }
  finish(): void {
    if (this.controls.dragging) {
      this.controls.pointerUp(null);
      this.controls.disconnect();
      this.controls.connect(this.canvas);
    }
    this.layers().finishTransform();
    this.input.end("transform");
    this.callbacks.camera(this.input.cameraEnabled);
  }
  dispose(): void {
    this.finish();
    this.clearAxisConstraints();
    this.canvas.removeEventListener("pointerdown", this.onCanvasPointerDown, true);
    this.controls.dispose();
    this.controls.getHelper().removeFromParent();
  }
}
