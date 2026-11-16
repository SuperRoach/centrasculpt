import {
  BufferGeometry,
  type Camera,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import type { SdfLayer } from "./layers";
import { primitiveWorldBounds } from "./parametric-primitive";
import { transformMatrix } from "./transform";

export type EnclosureViewportTarget = {
  base: SdfLayer;
  selected?: SdfLayer;
};

const directions = [
  { name: "Left", x: -1, z: 0 },
  { name: "Right", x: 1, z: 0 },
  { name: "Back", x: 0, z: -1 },
  { name: "Front", x: 0, z: 1 },
] as const;

const directionArrows = ["→", "↗", "↑", "↖", "←", "↙", "↓", "↘"];

class GuideLabel {
  private readonly canvas = document.createElement("canvas");
  private texture = new CanvasTexture(this.canvas);
  readonly sprite: Sprite;
  private text = "";

  constructor(private readonly feature: boolean) {
    this.texture.colorSpace = SRGBColorSpace;
    this.sprite = new Sprite(
      new SpriteMaterial({
        map: this.texture,
        depthTest: false,
        depthWrite: false,
        sizeAttenuation: false,
        transparent: true,
        toneMapped: false,
      }),
    );
    this.sprite.renderOrder = feature ? 104 : 103;
    this.sprite.raycast = () => {};
  }

  setText(text: string) {
    if (text === this.text) return;
    this.text = text;
    const context = this.canvas.getContext("2d");
    if (!context) return;
    const font = "600 44px system-ui, sans-serif";
    context.font = font;
    const width = Math.ceil(Math.min(context.measureText(text).width, 690)) + 36;
    const resized = this.canvas.width !== width || this.canvas.height !== 70;
    if (resized) {
      this.canvas.width = width;
      this.canvas.height = 70;
    } else context.clearRect(0, 0, width, 70);
    context.font = font;
    context.beginPath();
    context.roundRect(1, 1, width - 2, 68, 16);
    context.fillStyle = this.feature ? "#172e29" : "#263d34";
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = this.feature ? "#ffd782" : "#a7c2ae";
    context.stroke();
    context.fillStyle = this.feature ? "#ffe5a7" : "#f2f8ef";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, width / 2, 35, width - 32);
    if (resized) {
      this.texture.dispose();
      this.texture = new CanvasTexture(this.canvas);
      this.texture.colorSpace = SRGBColorSpace;
      this.sprite.material.map = this.texture;
    } else this.texture.needsUpdate = true;
  }

  size(camera: Camera, height: number, pixels: number) {
    const scale = (2 * pixels) / (height * camera.projectionMatrix.elements[5]);
    this.sprite.scale.set(scale * (this.canvas.width / this.canvas.height), scale, 1);
  }

  dispose() {
    this.texture.dispose();
    this.sprite.material.dispose();
  }
}

/** Viewport-only guides kept outside project geometry, picking and export. */
export class EnclosureViewportGuide {
  readonly group = new Group();
  private readonly arrowGeometry = new BufferGeometry().setAttribute(
    "position",
    new Float32BufferAttribute(
      // A flat arrow pointing along +Z. Shaft and head are separate triangles.
      [
        -0.07, 0, 0, 0.07, 0, 0, -0.07, 0, 0.62, 0.07, 0, 0, 0.07, 0, 0.62, -0.07, 0, 0.62, -0.23,
        0, 0.57, 0.23, 0, 0.57, 0, 0, 1,
      ],
      3,
    ),
  );
  private readonly arrowMaterial = new MeshBasicMaterial({
    color: "#cce1cb",
    side: DoubleSide,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: 0.82,
    toneMapped: false,
  });
  private readonly name = new GuideLabel(true);
  private readonly markers = directions.map((direction) => {
    const arrow = new Mesh(this.arrowGeometry, this.arrowMaterial);
    arrow.raycast = () => {};
    arrow.renderOrder = 102;
    const label = new GuideLabel(false);
    this.group.add(arrow, label.sprite);
    return { ...direction, arrow, label };
  });

  constructor() {
    this.group.name = "Enclosure viewport guide";
    this.group.visible = false;
    this.name.sprite.center.y = -0.25;
    this.group.add(this.name.sprite);
  }

  sync(
    target: EnclosureViewportTarget | undefined,
    camera: Camera,
    height: number,
  ): number | undefined {
    const base = target?.base;
    this.group.visible = base?.primitive?.kind === "box" && height > 0;
    this.name.sprite.visible = false;
    if (!target || base?.primitive?.kind !== "box" || !this.group.visible) return;

    camera.updateWorldMatrix(true, false);
    const pose = base.transform;
    const matrix = transformMatrix(pose);
    const bounds = primitiveWorldBounds(base.primitive, pose);
    const floor = bounds.min[1] - 0.001;
    const [x, , z] = pose.position;
    const width = bounds.max[0] - bounds.min[0];
    const depth = bounds.max[2] - bounds.min[2];
    const length = Math.max(0.002, Math.min(width, depth) * 0.37);
    // Base axes are the same axes as the wall choices in Cutouts & mounting.
    // Drop the wall direction to the horizontal grid so arrows stay flat.
    const source = base.primitive;
    this.group.updateWorldMatrix(true, false);
    for (const { name, x: sideX, z: sideZ, arrow, label } of this.markers) {
      const edge = new Vector3(
        (sideX * source.width) / 2,
        0,
        (sideZ * source.depth) / 2,
      ).applyMatrix4(matrix);
      const direction = new Vector3(edge.x - x, 0, edge.z - z);
      const visible = direction.lengthSq() > 1e-12;
      arrow.visible = label.sprite.visible = visible;
      if (!visible) continue;
      direction.normalize();
      arrow.position.set(edge.x, floor + 0.002, edge.z).addScaledVector(direction, length * 0.45);
      arrow.rotation.y = Math.atan2(direction.x, direction.z);
      arrow.scale.setScalar(length);
      label.sprite.position.copy(arrow.position).addScaledVector(direction, length * 1.75);
      label.sprite.position.y += length * 0.19;
      // Keep the arrow in the caption aligned with the ground arrow as the camera orbits.
      const start = arrow.position.clone().applyMatrix4(this.group.matrixWorld).project(camera);
      const tip = arrow.position
        .clone()
        .addScaledVector(direction, length)
        .applyMatrix4(this.group.matrixWorld)
        .project(camera);
      const angle = Math.atan2(
        tip.y - start.y,
        ((tip.x - start.x) * camera.projectionMatrix.elements[5]) /
          camera.projectionMatrix.elements[0],
      );
      const quadrant = (Math.round(angle / (Math.PI / 4)) + 8) % 8;
      label.setText(`${directionArrows[quadrant]}  ${name}`);
      label.size(camera, height, 22);
    }

    const selected = target.selected;
    if (selected?.visible && selected.primitive) {
      const pose = selected.transform;
      const selectedBounds = primitiveWorldBounds(selected.primitive, pose);
      this.name.setText(selected.name);
      this.name.sprite.position.set(pose.position[0], selectedBounds.max[1], pose.position[2]);
      this.name.size(camera, height, 27);
      this.name.sprite.visible = true;
    }
    return floor;
  }

  dispose() {
    this.group.removeFromParent();
    this.arrowGeometry.dispose();
    this.arrowMaterial.dispose();
    for (const { label } of this.markers) label.dispose();
    this.name.dispose();
  }
}
