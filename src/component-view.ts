import {
  Box3,
  Box3Helper,
  BoxGeometry,
  BufferAttribute,
  type BufferGeometry,
  Color,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Path,
  Quaternion,
  type Raycaster,
  Shape,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  type ComponentReference,
  componentDimensions,
  componentHoles,
  presetFor,
} from "./component-references";
import type { MountingDefinition } from "./enclosure-features";
import type { SdfLayer } from "./layers";
import { transformMatrix } from "./transform";

const radians = Math.PI / 180;

function meshFor(record: ComponentReference): Group {
  const group = new Group();
  const preset = presetFor(record.preset);
  const [width, height, depth] = componentDimensions(record);
  const parts: BufferGeometry[] = [];
  function addPart(geometry: BufferGeometry, colour: number) {
    const vertices = geometry.index ? geometry.toNonIndexed() : geometry;
    if (vertices !== geometry) geometry.dispose();
    const color = new Color(colour);
    const count = vertices.getAttribute("position").count;
    const values = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) color.toArray(values, i * 3);
    vertices.setAttribute("color", new BufferAttribute(values, 3));
    parts.push(vertices);
  }
  const board = new Shape();
  const w = width / 2;
  const d = depth / 2;
  const radius = preset.cornerRadius ?? 0;
  board.moveTo(-w + radius, -d);
  board.lineTo(w - radius, -d);
  if (radius) board.absarc(w - radius, -d + radius, radius, -Math.PI / 2, 0);
  board.lineTo(w, d - radius);
  if (radius) board.absarc(w - radius, d - radius, radius, 0, Math.PI / 2);
  board.lineTo(-w + radius, d);
  if (radius) board.absarc(-w + radius, d - radius, radius, Math.PI / 2, Math.PI);
  board.lineTo(-w, -d + radius);
  if (radius) board.absarc(-w + radius, -d + radius, radius, Math.PI, (3 * Math.PI) / 2);
  board.closePath();
  for (const { x, z, diameter } of componentHoles(record)) {
    const path = new Path();
    path.absarc(x, -z, diameter / 2, 0, Math.PI * 2, true);
    board.holes.push(path);
  }
  const geometry = new ExtrudeGeometry(board, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 8,
  });
  geometry.rotateX(-Math.PI / 2);
  addPart(geometry, preset.colour);
  for (const { at, size, colour } of preset.housings) {
    addPart(new BoxGeometry(...size).translate(at[0], height + at[1], at[2]), colour);
  }
  if (record.preset === "tactile")
    addPart(new CylinderGeometry(1.65, 1.65, 1, 16).translate(0, height + 0.5, 0), 0x1b1d21);
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error("Failed to build component geometry.");
  group.add(new Mesh(merged, new MeshStandardMaterial({ vertexColors: true, roughness: 0.78 })));
  return group;
}

type ComponentGeometry = {
  object: Group;
  geometryKey: string;
  rotationKey?: string;
  bounds?: Box3;
};

function rotatedBounds(object: Group, rotation: Quaternion): Box3 {
  const point = new Vector3();
  const bounds = new Box3();
  for (const child of object.children) {
    if (!(child instanceof Mesh)) continue;
    const vertices = child.geometry.getAttribute("position");
    for (let index = 0; index < vertices.count; index++)
      bounds.expandByPoint(point.fromBufferAttribute(vertices, index).applyQuaternion(rotation));
  }
  return bounds;
}

export function componentClearance(bounds: Box3, host: SdfLayer): string {
  const intent = host.assemblyPart?.enclosure;
  if (!intent) return "";
  const p = intent.parameters;
  const x = Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x));
  const z = Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z));
  const wall = Math.min(p.innerWidthMm / 2 - x, p.innerDepthMm / 2 - z);
  const corner = Math.max(0, p.cornerRadiusMm - p.wallThicknessMm);
  const cornerOverlap =
    corner > 0 &&
    Math.hypot(
      Math.max(0, x - p.innerWidthMm / 2 + corner),
      Math.max(0, z - p.innerDepthMm / 2 + corner),
    ) > corner;
  const plane = componentSurfaceMm(host);
  const base = intent.role === "base";
  const gap = base ? bounds.min.y - plane : plane - bounds.max.y;
  const warnings = [];
  if (wall < 0) warnings.push("Component envelope crosses a wall.");
  else if (cornerOverlap) warnings.push("Component envelope may overlap a rounded corner.");
  if (gap < -0.001)
    warnings.push(base ? "Component intersects the floor." : "Component intersects the lid.");
  if (base && bounds.max.y > plane + p.innerHeightMm - p.lid.lipDepthMm)
    warnings.push("Component reaches the reserved lid region.");
  return `${base ? "Floor" : "Lid"} clearance ${gap.toFixed(2)} mm · wall margin ${wall.toFixed(2)} mm. ${warnings.join(" ")}`.trim();
}

function release(object: Group) {
  for (const child of object.children) {
    if (!(child instanceof Mesh)) continue;
    child.geometry.dispose();
    child.material.dispose();
  }
  object.removeFromParent();
}

export function componentRotation(record: ComponentReference): Quaternion {
  const [x, y, z] = record.rotation;
  return new Quaternion().setFromEuler(new Euler(x * radians, y * radians, z * radians));
}

export function componentSurfaceMm(host: SdfLayer): number {
  const intent = host.assemblyPart?.enclosure;
  if (!intent) throw new Error("Select an enclosure part.");
  const p = intent.parameters;
  return intent.role === "base"
    ? (p.floorThicknessMm - p.innerHeightMm) / 2
    : -p.lid.thicknessMm / 2;
}

export function componentPositionMm(record: ComponentReference, host: SdfLayer): Vector3 {
  const position = new Vector3(...record.positionMm);
  if (record.gapMm === undefined) return position;
  const object = meshFor(record);
  try {
    const bounds = rotatedBounds(object, componentRotation(record));
    position.y = snappedHeight(record, host, bounds);
    return position;
  } finally {
    release(object);
  }
}

function snappedHeight(record: ComponentReference, host: SdfLayer, bounds: Box3): number {
  const gap = record.gapMm ?? 0;
  return (
    componentSurfaceMm(host) +
    (host.assemblyPart?.enclosure?.role === "lid"
      ? -gap - bounds.max.y * record.scale
      : gap - bounds.min.y * record.scale)
  );
}

export function componentMounting(
  record: ComponentReference,
  host: SdfLayer,
  outerDiameterMm: number,
  boreDiameterMm: number,
): MountingDefinition {
  if (
    !["pi4", "zero2", "pcb"].includes(record.preset) ||
    componentHoles(record).length === 0 ||
    host.id !== record.hostId ||
    host.assemblyPart?.enclosure?.role !== "base" ||
    record.gapMm === undefined ||
    record.gapMm <= 0 ||
    record.rotation[0] !== 0 ||
    record.rotation[2] !== 0 ||
    record.scale !== 1
  )
    throw new Error(
      "Use a full-size board with mounting holes snapped above a base, with rotation around Y only.",
    );
  const rotation = componentRotation(record);
  return {
    kind: "mounting",
    name: `${record.preset === "pi4" ? "Pi 4" : presetFor(record.preset).name} mounting posts`,
    anchor: "enclosure.base.floor",
    centresMm: componentHoles(record).map(({ x, z }) => {
      const centre = new Vector3(x, 0, z).applyQuaternion(rotation);
      return [centre.x + record.positionMm[0], centre.z + record.positionMm[2]];
    }),
    outerDiameterMm,
    boreDiameterMm,
    heightMm: record.gapMm,
    floorOffsetMm: 0,
  };
}

export class ComponentView {
  readonly group = new Group();
  private readonly outline = new Box3Helper(new Box3(), 0x74dbff);
  clearance = "";
  private readonly cache = new Map<string, ComponentGeometry>();

  constructor(parent: Group) {
    this.group.name = "3D component references";
    parent.add(this.group, this.outline);
    this.outline.visible = false;
    const materials = this.outline.material;
    if (!Array.isArray(materials)) materials.depthTest = false;
    this.outline.renderOrder = 10;
  }

  object(id: string) {
    const object = this.cache.get(id)?.object;
    return object?.visible ? object : undefined;
  }

  pick(ray: Raycaster): string | undefined {
    let distance = Infinity;
    let selected: string | undefined;
    for (const [id, { object }] of this.cache) {
      if (!object.visible) continue;
      object.updateWorldMatrix(true, true);
      const hit = ray.intersectObject(object.children[0], false)[0];
      if (hit && hit.distance < distance) {
        distance = hit.distance;
        selected = id;
      }
    }
    return selected;
  }

  sync(records: ComponentReference[], hosts: readonly SdfLayer[], mm: number, selected?: string) {
    this.outline.visible = false;
    this.clearance = "";
    for (const [id, cached] of this.cache) {
      if (records.some((record) => record.id === id)) continue;
      release(cached.object);
      this.cache.delete(id);
    }
    for (const record of records) {
      const geometryKey = JSON.stringify([record.preset, record.dimensions, record.holes]);
      let cached = this.cache.get(record.id);
      if (cached?.geometryKey !== geometryKey) {
        if (cached) release(cached.object);
        const object = meshFor(record);
        object.matrixAutoUpdate = false;
        cached = { object, geometryKey };
        this.cache.set(record.id, cached);
        this.group.add(object);
      }
      const { object } = cached;
      const host = hosts.find(
        (layer) => layer.id === record.hostId && layer.assemblyPart?.enclosure,
      );
      object.visible = record.visible && (!record.hostId || !!host);
      if (!object.visible) continue;
      const rotation = componentRotation(record);
      const position = new Vector3(...record.positionMm);
      if (host && (record.gapMm !== undefined || selected === record.id)) {
        const rotationKey = record.rotation.join(",");
        if (cached.rotationKey !== rotationKey || !cached.bounds) {
          cached.rotationKey = rotationKey;
          cached.bounds = rotatedBounds(object, rotation);
        }
        const { min, max } = cached.bounds;
        if (record.gapMm !== undefined) position.y = snappedHeight(record, host, cached.bounds);
        if (selected === record.id)
          this.clearance = componentClearance(
            new Box3(
              min.clone().multiplyScalar(record.scale).add(position),
              max.clone().multiplyScalar(record.scale).add(position),
            ),
            host,
          );
      }
      object.matrix.compose(
        position.divideScalar(mm),
        rotation,
        new Vector3().setScalar(record.scale / mm),
      );
      if (host) object.matrix.premultiply(transformMatrix(host.transform));
      object.matrixWorldNeedsUpdate = true;
      if (selected === record.id) {
        const [mesh] = object.children as Mesh[];
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        this.outline.box.copy(mesh.geometry.boundingBox!);
        const material = this.outline.material;
        if ("color" in material && material.color instanceof Color)
          material.color.set(record.gapMm === undefined ? 0x74dbff : 0x79e6a3);
        if (this.outline.parent !== object) object.add(this.outline);
        this.outline.visible = true;
      }
      for (const child of object.children) {
        if (!(child instanceof Mesh)) continue;
        child.material.opacity = record.opacity;
        const transparent = record.opacity < 1;
        if (child.material.transparent !== transparent) {
          child.material.transparent = transparent;
          child.material.needsUpdate = true;
        }
        child.material.depthWrite = record.opacity === 1;
      }
    }
  }

  dispose() {
    for (const { object } of this.cache.values()) release(object);
    this.cache.clear();
    this.outline.dispose();
    this.outline.removeFromParent();
    this.group.removeFromParent();
  }
}
