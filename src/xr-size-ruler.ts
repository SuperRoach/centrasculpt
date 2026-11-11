import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  type Matrix4,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from "three";

export type XRSizeRulerState = { position: number; opacity: number };

const HEIGHT = 0.115;
const EDGE = 0.0009;
const INK = new Color("#68ff9b");
const OUTLINE = new Color("#142b21");

/** Presentation in tracking metres. The logarithmic tick scale is shared by radius and Stamp scale. */
export class XRSizeRuler {
  readonly group = new Group();
  private readonly material = new MeshBasicMaterial({
    vertexColors: true,
    side: DoubleSide,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
    forceSinglePass: true,
  });
  private readonly ticks: Mesh<BufferGeometry, MeshBasicMaterial>;
  private readonly pointer: Mesh<BufferGeometry, MeshBasicMaterial>;
  private readonly eye = new Vector3();
  private readonly right = new Vector3();
  private lastTime = 0;

  constructor(private readonly root: Group) {
    const outline: number[] = [],
      ink: number[] = [];
    const rect = (points: number[], x: number, y: number, width: number, height: number) => {
      const r = x + width,
        t = y + height;
      points.push(x, y, 0, r, y, 0, r, t, 0, x, y, 0, r, t, 0, x, t, 0);
    };
    const stroke = (x: number, y: number, width: number, height: number) => {
      rect(outline, x - EDGE, y - EDGE, width + 2 * EDGE, height + 2 * EDGE);
      rect(ink, x, y, width, height);
    };
    stroke(-0.001, 0, 0.002, HEIGHT);
    for (let i = 0; i <= 8; i++) {
      const major = i % 2 === 0;
      stroke(0, (i / 8) * HEIGHT - 0.00075, major ? 0.017 : 0.01, 0.0015);
    }
    this.ticks = this.mesh(outline, ink);
    this.pointer = this.mesh(
      [-0.001, 0, 0, 0.028, -0.0105, 0, 0.028, 0.0105, 0],
      [0.002, 0, 0, 0.027, -0.009, 0, 0.027, 0.009, 0],
    );
    this.group.name = "Tool controller size ruler";
    this.group.visible = false;
    this.group.add(this.ticks, this.pointer);
    root.add(this.group);
  }

  private mesh(outline: number[], ink: number[]): Mesh<BufferGeometry, MeshBasicMaterial> {
    const geometry = new BufferGeometry(),
      colours: number[] = [];
    for (let i = 0; i < outline.length; i += 3) colours.push(OUTLINE.r, OUTLINE.g, OUTLINE.b);
    for (let i = 0; i < ink.length; i += 3) colours.push(INK.r, INK.g, INK.b);
    geometry.setAttribute("position", new Float32BufferAttribute([...outline, ...ink], 3));
    geometry.setAttribute("color", new Float32BufferAttribute(colours, 3));
    const mesh = new Mesh(geometry, this.material);
    mesh.renderOrder = 28;
    mesh.raycast = () => {};
    return mesh;
  }

  update(
    state: XRSizeRulerState | null,
    grip: Matrix4 | undefined,
    viewer: { x: number; y: number; z: number } | null,
    time: number,
    left: boolean,
  ): void {
    if (!state || !grip || !viewer) {
      this.hide();
      return;
    }
    const p = this.group.position;
    p.setFromMatrixPosition(grip);
    this.right.set(viewer.z - p.z, 0, p.x - viewer.x);
    if (this.right.lengthSq() < 1e-8) this.right.set(1, 0, 0);
    p.addScaledVector(this.right.normalize(), left ? -0.075 : 0.052);
    p.y += 0.012;
    this.root.worldToLocal(p);
    this.group.lookAt(this.eye.set(viewer.x, viewer.y, viewer.z));
    const target = state.position * HEIGHT,
      dt = Math.min(50, Math.max(0, time - this.lastTime));
    this.pointer.position.y = this.group.visible
      ? this.pointer.position.y + (target - this.pointer.position.y) * (1 - Math.exp(-dt / 45))
      : target;
    this.lastTime = time;
    this.material.opacity = state.opacity;
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.ticks.geometry.dispose();
    this.pointer.geometry.dispose();
    this.material.dispose();
  }
}
