import { type Camera, type Object3D, type Scene, Vector2 } from "three";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
  anchoredBoxPose,
  type Face,
  FaceResizeGuide,
  faceResizeGizmoSize,
  isRectangularBox,
  pickBoxFace,
  resizeFace,
} from "./face-resize";
import type { IndependentLayers } from "./independent-layers";
import type { EditorMode, InputOwnership, TransformSpace } from "./interaction";
import {
  type PrimitiveSource,
  primitiveDimensions,
  validatePrimitive,
} from "./parametric-primitive";
import { snappedTransform, toDisplay } from "./physical-units";
import type { VolumeTransform } from "./transform";
import { hasUniformScale, transformMatrix, uniformScale } from "./transform";

/** Source dimension handles are local; ordinary layers retain isotropic XYZ scaling. */
export function scaledPrimitive(
  source: PrimitiveSource,
  ratios: readonly number[],
  axis: string,
): PrimitiveSource {
  const axes = ["X", "Y", "Z"].filter((a) => axis.includes(a));
  if (!axes.length || ratios.length !== 3 || ratios.some((v) => !Number.isFinite(v) || v <= 0))
    throw new Error("Primitive size must be positive and finite.");
  const factor = (a: string) => ratios[["X", "Y", "Z"].indexOf(a)];
  if (source.kind === "tapered-box")
    return validatePrimitive({
      ...source,
      bottomWidth: source.bottomWidth * ratios[0],
      topWidth: source.topWidth * ratios[0],
      height: source.height * ratios[1],
      bottomDepth: source.bottomDepth * ratios[2],
      topDepth: source.topDepth * ratios[2],
    });
  if (source.kind === "box" || source.kind === "pyramid")
    return validatePrimitive({
      ...source,
      ...(source.kind !== "box" || source.cornerRadius === undefined
        ? {}
        : { cornerRadius: source.cornerRadius * Math.min(ratios[0], ratios[2]) }),
      width: source.width * ratios[0],
      height: source.height * ratios[1],
      depth: source.depth * ratios[2],
    });
  if (source.kind === "sphere") {
    const factors = ["X", "Y", "Z"].map((a) => (axes.includes(a) ? factor(a) : 1));
    if (
      source.width === undefined &&
      source.height === undefined &&
      source.depth === undefined &&
      factors.every((v) => v === factors[0])
    )
      return validatePrimitive({ kind: "sphere", diameter: source.diameter * factors[0] });
    const dimensions = primitiveDimensions(source);
    return validatePrimitive({
      ...source,
      width: dimensions[0] * factors[0],
      height: dimensions[1] * factors[1],
      depth: dimensions[2] * factors[2],
    });
  }
  if (source.kind === "capsule") {
    const radial = axes.filter((a) => a !== "Y");
    const r = radial.length ? radial.reduce((v, a) => v * factor(a), 1) ** (1 / radial.length) : 1;
    return validatePrimitive({
      ...source,
      diameter: source.diameter * r,
      height: source.height * (axes.includes("Y") ? ratios[1] : 1),
    });
  }
  if (source.kind === "torus") {
    const radial = axes.filter((a) => a !== "Y");
    const r = radial.length ? radial.reduce((v, a) => v * factor(a), 1) ** (1 / radial.length) : 1;
    return validatePrimitive({
      ...source,
      majorRadius: source.majorRadius * r,
      tubeDiameter: source.tubeDiameter * (axes.includes("Y") ? ratios[1] : r),
    });
  }
  if (source.kind === "text") {
    return validatePrimitive({
      ...source,
      letterHeight: source.letterHeight * ratios[1],
      depth: source.depth * ratios[2],
      letterSpacing: source.letterSpacing * ratios[0],
      contours: source.contours.map((c) => ({
        outer: c.outer.map(([x, y]) => [x * ratios[0], y * ratios[1]]),
        holes: c.holes.map((r) => r.map(([x, y]) => [x * ratios[0], y * ratios[1]])),
      })),
    });
  }
  const radial = axes.filter((a) => a !== "Y");
  return validatePrimitive({
    kind: "cylinder",
    ...(source.topDiameter === undefined
      ? {}
      : {
          topDiameter:
            source.topDiameter *
            (radial.length ? radial.reduce((v, a) => v * factor(a), 1) ** (1 / radial.length) : 1),
        }),
    ...(source.bottomDiameter === undefined
      ? {}
      : {
          bottomDiameter:
            source.bottomDiameter *
            (radial.length ? radial.reduce((v, a) => v * factor(a), 1) ** (1 / radial.length) : 1),
        }),
    diameter:
      source.diameter *
      (radial.length ? radial.reduce((v, a) => v * factor(a), 1) ** (1 / radial.length) : 1),
    height: source.height * ratios[1],
  });
}
export class UniformTransformControls extends TransformControls {
  parametricScale = false;
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
    if (this.mode === "scale" && this.axis !== null && !this.parametricScale) {
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
  status?: (message: string) => void;
  hitLayer?: (event: PointerEvent) => string | null;
  selectionChanged?: () => void;
  surfaceSnap?: (transform: VolumeTransform) => VolumeTransform;
  clearSurfaceSnap?: () => void;
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
  private resize?: {
    editor: IndependentLayers;
    id: string;
    source: PrimitiveSource;
    next: PrimitiveSource;
    pose: VolumeTransform;
    object: Object3D;
    face?: Face;
    delta?: number;
    nextPose?: VolumeTransform;
  };
  private readonly faceGuide = new FaceResizeGuide();
  private hoveredFace?: Face;
  private facePointer?: { id: number; start: Vector2; pixelsPerUnit: Vector2 };

  private publishingFace?: NonNullable<LayerTransformTools["resize"]>;
  private resizeAbort?: AbortController;
  private resizeWork: Promise<void> = Promise.resolve();
  private disposed = false;
  get resizing(): boolean {
    return !!this.resize || !!this.resizeAbort;
  }
  get primitivePreview(): PrimitiveSource | undefined {
    return this.resize?.next;
  }
  get settled(): Promise<void> {
    return this.resizeWork;
  }
  private readonly onPointerCancel = (event: PointerEvent) => {
    if (this.facePointer) {
      event.stopImmediatePropagation();
      if (this.facePointer.id === event.pointerId) this.cancel();
    } else this.cancel();
  };
  private readonly onFaceLostCapture = (event: PointerEvent) => {
    if (this.facePointer?.id === event.pointerId) this.cancel();
  };
  private readonly onFaceLeave = () => {
    this.hoveredFace = undefined;
  };
  private readonly onFaceUp = (event: PointerEvent) => {
    if (!this.facePointer) return;
    event.stopImmediatePropagation();
    if (this.facePointer.id !== event.pointerId || event.button !== 0) return;
    if (!this.faceDragValid()) {
      this.cancel();
      return;
    }
    this.releaseFacePointer();
    this.completeResize();
    this.input.end("transform");
    this.callbacks.camera(this.input.cameraEnabled);
    this.sync();
    this.callbacks.changed();
  };
  private readonly heldRotateAxisKeys: string[] = [];
  private readonly heldTranslateAxisKeys: string[] = [];
  private baseRotateAxis: UniformTransformControls["axis"] = "XYZE";
  private baseTranslateAxis: UniformTransformControls["axis"] = "XYZ";
  private surfaceBaseRotateAxis: UniformTransformControls["axis"] = "XYZE";
  private surfaceBaseTranslateAxis: UniformTransformControls["axis"] = "XYZ";
  private startingSurfaceRotate = false;
  private startingSurfaceTranslate = false;
  private readonly onCanvasPointerDown = (event: PointerEvent) => {
    if (!this.beginFaceResize(event)) this.beginSurfaceTransform(event);
  };
  constructor(
    private readonly camera: Camera,
    private readonly canvas: HTMLElement,
    scene: Scene,
    private readonly layers: () => IndependentLayers,
    readonly input: InputOwnership,
    private readonly callbacks: TransformToolCallbacks,
  ) {
    this.controls = new UniformTransformControls(camera, canvas);
    this.controls.setSize(0.85);
    scene.add(this.controls.getHelper(), this.faceGuide.group);
    Object.assign(this.controls, {
      minX: -1000,
      minY: -1000,
      minZ: -1000,
      maxX: 1000,
      maxY: 1000,
      maxZ: 1000,
    });
    canvas.addEventListener("pointerdown", this.onCanvasPointerDown, true);
    canvas.addEventListener("pointercancel", this.onPointerCancel, true);
    canvas.addEventListener("pointermove", this.onFaceMove, true);
    canvas.addEventListener("pointerup", this.onFaceUp, true);
    canvas.addEventListener("pointerleave", this.onFaceLeave);
    canvas.addEventListener("lostpointercapture", this.onFaceLostCapture);
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
        this.layers().beginTransform({ placeEnclosureFeature: this.controls.mode === "translate" });
        const editor = this.layers(),
          layer = editor.active.layer;
        if (this.controls.mode === "scale" && !editor.selectedGroupId && layer.primitive) {
          const source = validatePrimitive(layer.primitive);
          this.resize = {
            editor,
            id: layer.id,
            source,
            next: source,
            pose: structuredClone(layer.transform),
            object: this.controls.object!,
          };
        }
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
      let next: VolumeTransform = {
        position: [object.position.x, object.position.y, object.position.z],
        rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
        scale: [object.scale.x, object.scale.y, object.scale.z],
      };
      if (this.controls.mode === "scale" && !this.resize) {
        const previous = this.layers().transformNode.transform.scale[0],
          value = Number.isNaN(next.scale[0])
            ? previous
            : Math.min(1000, Math.max(0.001, next.scale[0]));
        next.scale = [value, value, value];
      }
      try {
        if (this.resize) {
          const r = this.resize;
          const recipeRole = r.editor.enclosureScaleRole(r.id);
          const ratios = next.scale.map((v, i) => v / r.pose.scale[i]);
          if (recipeRole === "cutout") ratios[isRectangularBox(r.source) ? 2 : 1] = 1;
          r.next = scaledPrimitive(r.source, ratios, this.controls.axis ?? "XYZ");
          if (
            recipeRole === "cutout" &&
            r.source.kind === "tapered-box" &&
            r.next.kind === "tapered-box"
          ) {
            r.next = validatePrimitive({
              ...r.next,
              topWidth: r.source.topWidth + (r.next.bottomWidth - r.source.bottomWidth),
              topDepth: r.source.topDepth + (r.next.bottomDepth - r.source.bottomDepth),
            });
          } else if (recipeRole === "cutout" && r.source.kind === "box" && r.next.kind === "box") {
            r.next = validatePrimitive({
              ...r.next,
              ...(r.source.cornerRadius === undefined
                ? {}
                : { cornerRadius: r.source.cornerRadius }),
            });
          } else if (
            recipeRole === "cutout" &&
            r.source.kind === "cylinder" &&
            r.next.kind === "cylinder" &&
            r.source.topDiameter !== undefined &&
            r.source.bottomDiameter !== undefined
          ) {
            const delta = r.next.diameter - r.source.diameter;
            r.next = validatePrimitive({
              ...r.next,
              topDiameter: r.source.topDiameter + delta,
              bottomDiameter: r.source.bottomDiameter + delta,
            });
          } else if (
            recipeRole &&
            recipeRole !== "cutout" &&
            r.source.kind === "cylinder" &&
            r.next.kind === "cylinder"
          ) {
            r.nextPose = anchoredBoxPose(
              r.pose,
              { axis: 1, sign: 1 },
              r.next.height - r.source.height,
            );
          }
          this.applyResizePreview(r);
          const values = primitiveDimensions(r.next).map((v) =>
            toDisplay(v, r.editor.display.precision).toFixed(2),
          );
          callbacks.status?.(
            `${r.next.kind} size · ${values.join(" × ")} ${r.editor.display.precision.unit} · release to apply · Esc to cancel`,
          );
          callbacks.changed();
          return;
        }
        // Quantize saved model coordinates, independent of the renderer parent's navigation pose.
        const settings = this.layers().display.precision;
        const placedOnEnclosure = this.layers().movingEnclosureFeature;
        if (this.controls.mode === "translate" && settings.translationSnapMM && !placedOnEnclosure)
          next.position = snappedTransform(next, settings).position;
        if (this.controls.mode === "rotate" && settings.angleSnapDegrees)
          next.rotation = snappedTransform(next, settings).rotation;
        if (this.callbacks.surfaceSnap && !placedOnEnclosure)
          next = this.callbacks.surfaceSnap(next);
        this.layers().updateTransform(next);
        callbacks.changed();
      } catch (error) {
        this.cancel();
        callbacks.error(error instanceof Error ? error.message : "Invalid transform.");
      }
    });
    this.controls.addEventListener("dragging-changed", (event) => {
      if (event.value) return;
      if (this.resize) this.completeResize();
      else this.layers().finishTransform();
      this.callbacks.clearSurfaceSnap?.();
      input.end("transform");
      callbacks.camera(input.cameraEnabled);
      this.sync();
      if (!this.disposed) callbacks.changed();
    });
    this.sync();
  }
  private faceBounds(id: string, source?: PrimitiveSource) {
    if (source?.kind === "box" && !source.cornerRadius) return source;
    const role = this.layers().enclosureScaleRole(id);
    if (role === "cutout" && (source?.kind === "box" || source?.kind === "tapered-box")) {
      const [width, height, depth] = primitiveDimensions(source);
      return { kind: "box" as const, width, height, depth, cornerRadius: 0 };
    }
    if (role === "post" && source?.kind === "cylinder")
      return {
        kind: "box" as const,
        width: source.diameter,
        height: source.height,
        depth: source.diameter,
      };
  }
  get faceResizeAvailable(): boolean {
    const editor = this.layers();
    const layer = editor.active.layer;
    return (
      !editor.selectedGroupId &&
      editor.sourceEditable &&
      !!this.faceBounds(layer.id, layer.primitive) &&
      !editor.project.layerStack.hierarchy.children(layer.id).length &&
      hasUniformScale(layer.transform)
    );
  }
  private faceTarget() {
    const editor = this.layers();
    if (
      this.disposed ||
      this.input.mode !== "scale" ||
      this.input.suspended ||
      this.callbacks.busy() ||
      !this.faceResizeAvailable
    )
      return;
    const { id, primitive: source } = editor.active.layer;
    const bounds = this.faceBounds(id, source);
    if (!source || !bounds) return;
    return {
      editor,
      source,
      bounds,
      role: editor.enclosureScaleRole(id),
      object: editor.transformObject,
    };
  }
  private faceDragValid(): boolean {
    const r = this.resize;
    const target = this.faceTarget();
    return !!(
      r?.face &&
      target &&
      r.editor === target.editor &&
      target.editor.transforming &&
      target.editor.active.layer.id === r.id &&
      r.object === target.object
    );
  }
  updateFaceGuide(): void {
    if (this.facePointer && !this.faceDragValid()) this.cancel();
    const target = this.faceTarget();
    if (!target || (this.resize && !this.resize.face)) {
      this.hoveredFace = undefined;
      this.faceGuide.group.visible = false;
      if (!this.controls.dragging) this.controls.setSize(0.85);
      return;
    }
    const { editor, bounds, object } = target;
    const pending = this.publishingFace;
    const r = this.resize ?? (pending?.object === object ? pending : undefined);
    object.parent?.updateWorldMatrix(true, false);
    const matrix = transformMatrix(r?.nextPose ?? editor.active.layer.transform);
    if (object.parent) matrix.premultiply(object.parent.matrixWorld);
    const next = r ? this.faceBounds(r.id, r.next) : bounds;
    if (next) {
      const height = this.canvas.clientHeight;
      this.camera.updateWorldMatrix(true, false);
      this.faceGuide.show(next, matrix, this.camera, height, r?.face ?? this.hoveredFace);
      if (!this.resizing && !this.controls.dragging)
        this.controls.setSize(faceResizeGizmoSize(next, matrix, this.camera, height));
    }
  }
  private pickFace(event: PointerEvent) {
    const target = this.faceTarget();
    if (
      !target ||
      this.resizing ||
      !this.controls.enabled ||
      !target.editor.recoveryReady ||
      !this.input.cameraEnabled ||
      event.isPrimary === false
    )
      return;
    const pointer = this.normalizedPointer(event);
    this.camera.updateWorldMatrix(true, false);
    const rect = this.canvas.getBoundingClientRect();
    target.object.updateWorldMatrix(true, false);
    this.controls.setSize(
      faceResizeGizmoSize(target.bounds, target.object.matrixWorld, this.camera, rect.height),
    );
    this.controls.getHelper().updateMatrixWorld(true);
    this.controls.pointerHover(pointer as unknown as PointerEvent);
    if (this.controls.axis) return; // The existing symmetric gizmo owns overlaps.
    return pickBoxFace(
      target.bounds,
      target.object.matrixWorld,
      this.camera,
      rect.width,
      rect.height,
      new Vector2(event.clientX - rect.left, event.clientY - rect.top),
      (face) => {
        if (target.role === "post") return face.axis === 1 && face.sign === 1;
        if (target.role !== "cutout") return true;
        return face.axis !== (isRectangularBox(target.source) ? 2 : 1);
      },
    );
  }
  private beginFaceResize(event: PointerEvent): boolean {
    if (this.facePointer) {
      event.stopImmediatePropagation();
      return true;
    }
    if (
      event.button !== 0 ||
      this.controls.dragging ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return false;
    const hit = this.pickFace(event),
      target = this.faceTarget();
    if (!hit || !target) return false;
    const { editor, source, object } = target;
    this.callbacks.beforeDrag();
    if (!this.input.beginTransform(editor.sourceEditable, this.callbacks.busy())) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    try {
      editor.beginTransform();
      this.resize = {
        editor,
        id: editor.active.layer.id,
        source,
        next: source,
        pose: structuredClone(editor.active.layer.transform),
        object,
        face: hit.face,
      };
      this.facePointer = {
        id: event.pointerId,
        start: new Vector2(event.clientX, event.clientY),
        pixelsPerUnit: hit.pixelsPerUnit,
      };
      this.canvas.setPointerCapture(event.pointerId);
      this.callbacks.camera(false);
      this.callbacks.status?.("Face Resize · drag along the highlighted side · Esc to cancel");
    } catch (error) {
      this.cancel();
      this.callbacks.error(error instanceof Error ? error.message : "Unable to resize face.");
    }
    return true;
  }
  private readonly onFaceMove = (event: PointerEvent): void => {
    const pointer = this.facePointer;
    if (!pointer) {
      this.hoveredFace = event.buttons ? undefined : this.pickFace(event)?.face;
      return;
    }
    event.stopImmediatePropagation();
    if (event.pointerId !== pointer.id) return;
    if (!(event.buttons & 1) || !this.faceDragValid()) {
      this.cancel();
      return;
    }
    const r = this.resize;
    if (!r?.face) return;
    const box = this.faceBounds(r.id, r.source);
    if (!box) return;
    const motion = new Vector2(event.clientX, event.clientY).sub(pointer.start);
    const delta = motion.dot(pointer.pixelsPerUnit) / pointer.pixelsPerUnit.lengthSq();
    const precision = r.editor.display.precision;
    const step = precision.translationSnapMM / precision.millimetresPerUnit / uniformScale(r.pose);
    try {
      const result = resizeFace(box, r.face, delta, step);
      if (result.delta === (r.delta ?? 0)) return;
      const nextPose = anchoredBoxPose(r.pose, r.face, result.delta);
      const source = r.source;
      if (source.kind === "box")
        r.next = {
          ...source,
          width: result.source.width,
          height: result.source.height,
          depth: result.source.depth,
        };
      else if (source.kind === "cylinder") r.next = { ...source, height: result.source.height };
      else if (source.kind === "tapered-box") {
        const d = result.delta;
        r.next =
          r.face.axis === 0
            ? { ...source, bottomWidth: source.bottomWidth + d, topWidth: source.topWidth + d }
            : { ...source, bottomDepth: source.bottomDepth + d, topDepth: source.topDepth + d };
      }
      r.next = validatePrimitive(r.next);
      r.delta = result.delta;
      r.nextPose = nextPose;
      this.applyResizePreview(r);
      this.callbacks.changed();
    } catch (error) {
      this.cancel();
      this.callbacks.error(error instanceof Error ? error.message : "Unable to resize face.");
    }
  };
  private releaseFacePointer(): void {
    const pointer = this.facePointer;
    this.facePointer = undefined;
    this.hoveredFace = undefined;
    if (pointer && this.canvas.hasPointerCapture(pointer.id))
      this.canvas.releasePointerCapture(pointer.id);
  }
  private applyResizePreview(r: NonNullable<LayerTransformTools["resize"]>): void {
    const before = primitiveDimensions(r.source),
      after = primitiveDimensions(r.next);
    r.object.scale.set(
      ...(after.map((v, i) => (r.pose.scale[i] * v) / before[i]) as [number, number, number]),
    );
    if (r.nextPose) r.object.position.fromArray(r.nextPose.position);
    r.object.updateWorldMatrix(true, true);
    r.editor.composite.setPrimitivePreview(r.id, r.next, r.nextPose);
  }
  private completeResize(): void {
    const r = this.resize;
    this.resize = undefined;
    if (!r) return;
    const owned =
      r.editor === this.layers() &&
      r.editor.transforming &&
      r.editor.project.activeLayerId === r.id;
    if (owned) r.editor.finishTransform();
    if (!owned || JSON.stringify(r.source) === JSON.stringify(r.next)) return;
    this.applyResizePreview(r);
    const abort = new AbortController();
    this.resizeAbort = abort;
    if (r.face) this.publishingFace = r;
    this.resizeWork = (
      r.face && isRectangularBox(r.source)
        ? r.editor.resizeBoxFace(r.id, r.face, r.delta ?? 0, abort.signal)
        : r.editor.resizePrimitiveFromGizmo(r.id, r.next, abort.signal, r.nextPose?.position)
    )
      .then(() => {
        if (!this.disposed && r.editor === this.layers())
          this.callbacks.status?.("Primitive dimensions applied · Undo available");
      })
      .catch((error) => {
        if (!abort.signal.aborted && !this.disposed)
          this.callbacks.error(
            error instanceof Error ? error.message : "Unable to resize primitive.",
          );
      })
      .finally(() => {
        // Restore only the borrowed preview object. Successful publication owns a new runtime.
        r.editor.composite.setPrimitivePreview(r.id, null);
        r.object.position.fromArray(r.pose.position);
        r.object.scale.fromArray(r.pose.scale);
        r.object.updateWorldMatrix(true, true);
        if (this.resizeAbort === abort) this.resizeAbort = undefined;
        if (this.publishingFace === r) this.publishingFace = undefined;
        if (!this.disposed && this.layers().recoveryReady) {
          this.sync();
          this.callbacks.changed();
          this.callbacks.selectionChanged?.();
        }
      });
  }
  cancel(): void {
    this.releaseFacePointer();
    this.callbacks.clearSurfaceSnap?.();
    const r = this.resize;
    this.resize = undefined;
    this.resizeAbort?.abort();
    this.publishingFace = undefined;
    if (r) r.editor.finishTransform();
    else this.layers().cancelTransform();
    if (r) {
      r.editor.composite.setPrimitivePreview(r.id, null);
      if (r.face) r.object.position.fromArray(r.pose.position);
      r.object.scale.fromArray(r.pose.scale);
      r.object.updateWorldMatrix(true, true);
    }
    this.controls.pointerUp(null);
    this.input.end("transform");
    this.callbacks.camera(this.input.cameraEnabled);
    if (!this.disposed) this.callbacks.changed();
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
    const point = this.normalizedPointer(event);
    if (this.controls.enabled && this.controls.object) {
      this.camera.updateWorldMatrix(true, false);
      this.controls.getHelper().updateMatrixWorld(true);
      this.controls.pointerHover(point as unknown as PointerEvent);
      // TransformControls' normal pointer listener will capture and start this handle.
      if (this.controls.axis) return;
    }

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
    if (this.disposed || (!this.layers().recoveryReady && !this.layers().transforming)) {
      this.controls.enabled = false;
      this.controls.detach();
      return;
    }
    const layer = this.layers().transformNode;
    let allowed =
      this.input.mode !== "sculpt" &&
      layer.editable &&
      !this.callbacks.busy() &&
      !this.layers().generatingTube;
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
    this.controls.parametricScale =
      !this.layers().selectedGroupId && !!this.layers().active.layer.primitive;
    this.controls.setSpace(
      this.input.mode === "scale" && this.controls.parametricScale ? "local" : this.input.space,
    );
    const object = this.layers().transformObject;
    if (this.controls.object !== object) this.controls.attach(object);
  }
  finish(): void {
    if (this.facePointer) {
      this.cancel();
      return;
    }
    this.callbacks.clearSurfaceSnap?.();
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
    this.disposed = true;
    this.cancel();
    this.clearAxisConstraints();
    this.canvas.removeEventListener("pointerdown", this.onCanvasPointerDown, true);
    this.canvas.removeEventListener("pointercancel", this.onPointerCancel, true);
    this.canvas.removeEventListener("pointermove", this.onFaceMove, true);
    this.canvas.removeEventListener("pointerup", this.onFaceUp, true);
    this.canvas.removeEventListener("pointerleave", this.onFaceLeave);
    this.canvas.removeEventListener("lostpointercapture", this.onFaceLostCapture);
    this.faceGuide.dispose();
    this.controls.dispose();
    this.controls.getHelper().removeFromParent();
  }
}
