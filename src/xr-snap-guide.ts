import {
  BufferGeometry,
  Float32BufferAttribute,
  type Group,
  Line,
  LineBasicMaterial,
  Matrix4,
  Vector3,
} from "three";
import type { Point3 } from "./sdf";
/** One reusable presentation line. Never attached to exportable layer geometry. */
export class XRSnapGuide {
  readonly line = new Line(
    new BufferGeometry(),
    new LineBasicMaterial({
      color: "#b6f1e2",
      transparent: true,
      opacity: 0.65,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  private readonly positions = new Float32BufferAttribute(new Float32Array(6), 3);
  private readonly direction = new Vector3();
  private readonly inverse = new Matrix4();
  constructor(root: Group) {
    this.line.geometry.setAttribute("position", this.positions);
    this.line.name = "Snap direction guide · presentation only";
    this.line.matrixAutoUpdate = false;
    this.line.frustumCulled = false;
    this.line.raycast = () => {};
    this.line.renderOrder = 26;
    this.line.visible = false;
    root.add(this.line);
  }
  show(frame: Matrix4, origin: Point3, end: Point3, minimumLength = 0): void {
    this.direction.set(end.x - origin.x, end.y - origin.y, end.z - origin.z);
    const length = this.direction.length();
    if (!Number.isFinite(length) || length < 1e-6) {
      this.hide();
      return;
    }
    this.direction.multiplyScalar(Math.max(length * 1.35, minimumLength) / length);
    this.positions.setXYZ(0, origin.x, origin.y, origin.z);
    this.positions.setXYZ(
      1,
      origin.x + this.direction.x,
      origin.y + this.direction.y,
      origin.z + this.direction.z,
    );
    this.positions.needsUpdate = true;
    this.line.matrix.copy(frame);
    if (this.line.parent) {
      this.line.parent.updateWorldMatrix(true, false);
      this.inverse.copy(this.line.parent.matrixWorld).invert();
      this.line.matrix.premultiply(this.inverse);
    }
    this.line.updateWorldMatrix(false, false);
    this.line.visible = true;
  }
  hide(): void {
    this.line.visible = false;
  }
  dispose(): void {
    this.line.removeFromParent();
    this.line.geometry.dispose();
    this.line.material.dispose();
  }
}
