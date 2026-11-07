import {
  BoxGeometry,
  type BufferGeometry,
  type Camera,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Scene,
  SphereGeometry,
} from "three";
import type { InputOwnership } from "./interaction";
import { type PrimitiveSource, primitiveDimensions } from "./parametric-primitive";
import type { PrimitiveTools } from "./primitive-tools";
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
      this.cameraEnabled(false);
    });
    this.controls.addEventListener("objectChange", () => {
      if (!this.drag) return;
      try {
        this.tools.draft = scaledPrimitive(
          this.drag,
          this.target.scale.toArray(),
          this.controls.axis ?? "XYZ",
        );
        // Keep circular shapes circular while the pointer continues to use its original scale.
        const dimensions = primitiveDimensions(this.tools.draft);
        this.mesh.scale.fromArray(dimensions.map((v, i) => v / this.target.scale.getComponent(i)));
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
      draft.kind === "cylinder"
        ? `cylinder:${(draft.topDiameter ?? draft.diameter) / primitiveDimensions(draft)[0]}:${(draft.bottomDiameter ?? draft.diameter) / primitiveDimensions(draft)[0]}`
        : draft.kind;
    if (this.kind !== geometryKey) {
      this.kind = geometryKey;
      this.mesh.geometry.dispose();
      this.mesh.geometry =
        this.tools.draft.kind === "box"
          ? new BoxGeometry(1, 1, 1)
          : this.tools.draft.kind === "cylinder"
            ? new CylinderGeometry(
                (this.tools.draft.topDiameter ?? this.tools.draft.diameter) /
                  primitiveDimensions(this.tools.draft)[0] /
                  2,
                (this.tools.draft.bottomDiameter ?? this.tools.draft.diameter) /
                  primitiveDimensions(this.tools.draft)[0] /
                  2,
                1,
                48,
              )
            : new SphereGeometry(0.5, 48, 32);
    }
    if (!this.drag) {
      this.target.scale.setScalar(1);
      this.mesh.scale.set(...primitiveDimensions(this.tools.draft));
    }
    if (this.controls.object !== this.target) this.controls.attach(this.target);
  }
  private finish(): void {
    if (!this.drag) return;
    this.drag = undefined;
    this.target.scale.setScalar(1);
    this.mesh.scale.set(...primitiveDimensions(this.tools.draft));
    this.input.end("preview");
    this.cameraEnabled(this.input.cameraEnabled);
    this.changed();
  }
  cancel(): void {
    if (!this.drag) return;
    this.tools.draft = this.drag;
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
