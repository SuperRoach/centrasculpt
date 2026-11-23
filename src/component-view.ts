import {
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
  verticalExtent?: [number, number];
};

function verticalExtent(object: Group, rotation: Quaternion): [number, number] {
  const point = new Vector3();
  let minimum = Infinity;
  let maximum = -Infinity;
  for (const child of object.children) {
    if (!(child instanceof Mesh)) continue;
    const vertices = child.geometry.getAttribute("position");
    for (let index = 0; index < vertices.count; index++) {
      point.fromBufferAttribute(vertices, index).applyQuaternion(rotation);
      minimum = Math.min(minimum, point.y);
      maximum = Math.max(maximum, point.y);
    }
  }
  return [minimum, maximum];
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

export function componentMounting(
  record: ComponentReference,
  host: SdfLayer,
  outerDiameterMm: number,
  boreDiameterMm: number,
): MountingDefinition {
  if (
    record.preset !== "pi4" ||
    host.id !== record.hostId ||
    host.assemblyPart?.enclosure?.role !== "base" ||
    record.gapMm === undefined ||
    record.gapMm <= 0 ||
    record.rotation[0] !== 0 ||
    record.rotation[2] !== 0 ||
    record.scale !== 1
  )
    throw new Error("Use a full-size Pi 4 snapped above a base, with rotation around Y only.");
  const rotation = componentRotation(record);
  return {
    kind: "mounting",
    name: "Pi 4 mounting posts",
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
  private readonly cache = new Map<string, ComponentGeometry>();

  constructor(parent: Group) {
    this.group.name = "3D component references";
    parent.add(this.group);
  }

  sync(records: ComponentReference[], hosts: readonly SdfLayer[], mm: number) {
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
      if (host && record.gapMm !== undefined) {
        const rotationKey = record.rotation.join(",");
        if (cached.rotationKey !== rotationKey || !cached.verticalExtent) {
          cached.rotationKey = rotationKey;
          cached.verticalExtent = verticalExtent(object, rotation);
        }
        const [minimum, maximum] = cached.verticalExtent;
        const inverted = host.assemblyPart?.enclosure?.role === "lid";
        position.y =
          componentSurfaceMm(host) +
          (inverted
            ? -record.gapMm - maximum * record.scale
            : record.gapMm - minimum * record.scale);
      }
      object.matrix.compose(
        position.divideScalar(mm),
        rotation,
        new Vector3().setScalar(record.scale / mm),
      );
      if (host) object.matrix.premultiply(transformMatrix(host.transform));
      object.matrixWorldNeedsUpdate = true;
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
    this.group.removeFromParent();
  }
}
