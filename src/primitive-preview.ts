import {
  BoxGeometry,
  type BufferGeometry,
  type Camera,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Scene,
} from "three";
import type { EditorMode, InputOwnership } from "./interaction";
import {
  type PrimitiveSource,
  primitiveDimensions,
  primitivePreviewGeometry,
} from "./parametric-primitive";
import type { PrimitiveTools } from "./primitive-tools";
import { identityTransform } from "./transform";
import { scaledPrimitive, UniformTransformControls } from "./transform-tools";

/** Desktop draft sizing reuses the source-editing gizmo; nothing enters the layer stack. */
export class PrimitiveDraftPreview {
  readonly root = new Group();
  readonly target = new Group();
  readonly mesh = new Mesh<BufferGeometry, MeshBasicMaterial>(
    new BoxGeometry(1, 1, 1),
    new MeshBasicMaterial({
      color: "#268b78",
      wireframe: true,
      depthTest: false,
      transparent: true,
      opacity: 0.85,
    }),
  );
  readonly controls: UniformTransformControls;
  open = false;
  active = false;
  private kind = "box";
  private project?: object;
  private drag?: PrimitiveSource;
  private dragPose?: import("./transform").VolumeTransform;
  private disposed = false;
  private readonly cancelPointer = () => this.cancel();
  constructor(
    camera: Camera,
    private readonly canvas: HTMLElement,
    scene: Scene,
    private readonly tools: PrimitiveTools,
    private readonly input: InputOwnership,
    private readonly blocked: () => boolean,
    private readonly changed: () => void,
    private readonly cameraEnabled: (enabled: boolean) => void,
  ) {
    this.root.add(this.target);
    this.target.add(this.mesh);
    this.mesh.raycast = () => {};
    this.mesh.renderOrder = 20;
    this.root.visible = false;
    this.controls = new UniformTransformControls(camera, canvas);
    this.controls.setMode("scale");
    this.controls.setSpace("local");
    this.controls.setSize(0.85);
    this.controls.parametricScale = true;
    this.controls.enabled = false;
    scene.add(this.controls.getHelper());
    this.controls.addEventListener("mouseDown", () => {
      if (!this.active || !this.input.beginPreview(true, this.blocked())) {
        this.controls.pointerUp(null);
        return;
      }
      this.drag = structuredClone(this.tools.draft);
      this.dragPose = structuredClone(this.tools.draftPose);
      this.cameraEnabled(false);
    });
    this.controls.addEventListener("objectChange", () => {
      if (!this.drag) return;
      try {
        if (this.controls.mode === "scale") {
          this.tools.draft = scaledPrimitive(
            this.drag,
            this.target.scale.toArray(),
            this.controls.axis ?? "XYZ",
          );
          // Keep circular shapes circular while the pointer continues to use its original scale.
          const dimensions = primitiveDimensions(this.tools.draft);
          this.mesh.scale.fromArray(
            dimensions.map((v, i) => v / this.target.scale.getComponent(i)),
          );
        } else {
          const rotation = this.target.rotation;
          this.tools.draftPose = {
            position: this.target.position.toArray() as [number, number, number],
            rotation: [rotation.x, rotation.y, rotation.z],
            scale: [1, 1, 1],
          };
        }
        this.changed();
      } catch {
        const previous = primitiveDimensions(this.tools.draft),
          base = primitiveDimensions(this.drag);
        this.target.scale.fromArray(previous.map((v, i) => v / base[i]));
        this.mesh.scale.set(...base);
      }
    });
    this.controls.addEventListener("mouseUp", () => this.finish());
    canvas.addEventListener("pointercancel", this.cancelPointer, true);
  }
  get dragging(): boolean {
    return !!this.drag;
  }
  get mode(): "translate" | "rotate" | "scale" {
    return this.controls.mode as "translate" | "rotate" | "scale";
  }
  setMode(mode: EditorMode): void {
    if (mode !== "translate" && mode !== "rotate" && mode !== "scale") return;
    if (this.drag) this.cancel();
    this.controls.setMode(mode);
    this.controls.setSpace(mode === "scale" ? "local" : "world");
    this.changed();
  }
  setOpen(open: boolean): void {
    if (!open) this.cancel();
    this.open = open;
    this.sync();
  }
  sync(): void {
    if (this.disposed) return;
    const layers = this.tools.layers();
    if (this.project && this.project !== layers.project) {
      this.cancel();
      this.open = false;
      this.tools.draftPose = identityTransform();
    }
    this.project = layers.project;
    const enabled =
      this.open &&
      !this.tools.editing &&
      !this.tools.placing &&
      !this.tools.pending &&
      layers.recoveryReady &&
      !this.blocked();
    if (!enabled && this.drag) this.cancel();
    this.active = enabled;
    this.controls.enabled = enabled;
    this.root.visible = enabled;
    if (!enabled) {
      this.controls.detach();
      return;
    }
    const parent = layers.group.parent ?? layers.group;
    if (this.root.parent !== parent) parent.add(this.root);
    this.root.position.copy(layers.group.position);
    this.root.quaternion.copy(layers.group.quaternion);
    this.root.scale.copy(layers.group.scale);
    if (parent === layers.group) {
      this.root.position.set(0, 0, 0);
      this.root.quaternion.identity();
      this.root.scale.setScalar(1);
    }
    const draft = this.tools.draft;
    const geometryKey =
      draft.kind === "text"
        ? JSON.stringify(draft)
        : draft.kind === "cylinder"
          ? `cylinder:${(draft.topDiameter ?? draft.diameter) / primitiveDimensions(draft)[0]}:${(draft.bottomDiameter ?? draft.diameter) / primitiveDimensions(draft)[0]}`
          : ["capsule", "torus", "pyramid", "tapered-box"].includes(draft.kind)
            ? JSON.stringify(draft)
            : draft.kind;
    if (this.kind !== geometryKey) {
      this.kind = geometryKey;
      this.mesh.geometry.dispose();
      this.mesh.geometry = primitivePreviewGeometry(draft);
    }
    if (!this.drag) {
      this.target.scale.setScalar(1);
      this.target.position.fromArray(this.tools.draftPose.position);
      this.target.rotation.set(...this.tools.draftPose.rotation, "XYZ");
      this.mesh.scale.set(...primitiveDimensions(this.tools.draft));
    }
    if (this.controls.object !== this.target) this.controls.attach(this.target);
  }
  private finish(): void {
    if (!this.drag) return;
    this.drag = undefined;
    this.dragPose = undefined;
    this.target.scale.setScalar(1);
    this.mesh.scale.set(...primitiveDimensions(this.tools.draft));
    this.input.end("preview");
    this.cameraEnabled(this.input.cameraEnabled);
    this.changed();
  }
  cancel(): void {
    if (!this.drag) return;
    this.tools.draft = this.drag;
    if (this.dragPose) this.tools.draftPose = this.dragPose;
    this.controls.pointerUp(null);
    this.finish();
  }
  dispose(): void {
    this.disposed = true;
    this.cancel();
    this.canvas.removeEventListener("pointercancel", this.cancelPointer, true);
    this.controls.dispose();
    this.controls.getHelper().removeFromParent();
    this.root.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
