import { type Box3, Euler, Quaternion, Ray, type Raycaster, Vector3 } from "three";
import { layerSources } from "./assembly";
import { type ConnectorOptions, partBounds } from "./assembly-tools";
import { prepareComposite } from "./compositor";
import type { IndependentLayers } from "./independent-layers";
import type { Vec3 } from "./transform";

type Field = { sample: (x: number, y: number, z: number) => number; bounds: Box3 };
export type ConnectorPlacement = {
  positionMM: Vec3;
  socketPositionMM: Vec3;
  rotationRadians: Vec3;
  normal: Vec3;
  faceGapMM: number;
};
/** A finite AABB interval and at most 96 SDF queries per surface. No meshing or field edits. */
function trace(
  ray: Ray,
  field: Field,
  epsilon: number,
): { point: Vector3; normal: Vector3 } | null {
  let enter = 0,
    exit = Infinity;
  for (const axis of ["x", "y", "z"] as const) {
    const d = ray.direction[axis],
      o = ray.origin[axis],
      lo = field.bounds.min[axis],
      hi = field.bounds.max[axis];
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return null;
      continue;
    }
    const a = (lo - o) / d,
      b = (hi - o) / d;
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
  }
  if (!Number.isFinite(exit) || exit < enter) return null;
  const point = new Vector3();
  for (let i = 0; i < 96 && enter <= exit + epsilon; i++) {
    ray.at(enter, point);
    const d = field.sample(point.x, point.y, point.z);
    if (!Number.isFinite(d)) return null;
    if (Math.abs(d) <= epsilon) {
      const h = epsilon * 2,
        n = new Vector3(
          field.sample(point.x + h, point.y, point.z) - field.sample(point.x - h, point.y, point.z),
          field.sample(point.x, point.y + h, point.z) - field.sample(point.x, point.y - h, point.z),
          field.sample(point.x, point.y, point.z + h) - field.sample(point.x, point.y, point.z - h),
        );
      if (!n.toArray().every(Number.isFinite) || n.lengthSq() < 1e-20) return null;
      n.normalize();
      point.addScaledVector(n, -d);
      return { point: point.clone(), normal: n };
    }
    enter += Math.max(Math.abs(d) * 0.8, epsilon * 0.5);
  }
  return null;
}
/** Cached model-space fields preserve hierarchy, arrays, CSG and presentation transforms. */
export class ConnectorPlacer {
  private key = "";
  private fields: Field[] = [];
  constructor(private readonly layers: () => IndependentLayers) {}
  clear(): void {
    this.key = "";
    this.fields = [];
  }
  place(raycaster: Raycaster, first: string, second: string): ConnectorPlacement {
    const l = this.layers(),
      stack = l.project.layerStack;
    if (!l.recoveryReady) throw new Error("Finish the current edit before placing a connector.");
    if (first === second) throw new Error("Choose two different layers.");
    if (
      stack.hierarchy.descendants(first).includes(second) ||
      stack.hierarchy.descendants(second).includes(first)
    )
      throw new Error("Choose independent layers.");
    for (const id of [first, second]) stack.get(id).assertEditable();
    const key = JSON.stringify([l.modellingRevision, first, second]);
    if (key !== this.key) {
      this.fields = [first, second].map((id) => ({
        sample: prepareComposite(layerSources(stack, id)),
        bounds: partBounds(l, id, true),
      }));
      this.key = key;
    }
    l.group.updateWorldMatrix(true, false);
    if (Math.abs(l.group.matrixWorld.determinant()) < 1e-12)
      throw new Error("The workspace transform cannot be used for placement.");
    const ray = raycaster.ray.clone().applyMatrix4(l.group.matrixWorld.clone().invert());
    if (![...ray.origin.toArray(), ...ray.direction.toArray()].every(Number.isFinite))
      throw new Error("Point at a valid layer surface.");
    const mm = l.display.precision.millimetresPerUnit,
      epsilon = Math.max(1e-7, Math.min(0.01, 0.01 / mm));
    const peg = trace(ray, this.fields[0], epsilon);
    if (!peg) throw new Error("Point at the peg layer’s joint face.");
    const distance = peg.point
      .clone()
      .applyMatrix4(l.group.matrixWorld)
      .distanceTo(raycaster.ray.origin);
    if (distance < raycaster.near || distance > raycaster.far)
      throw new Error("Point at the peg layer’s joint face within reach.");
    const origin = peg.point.clone().addScaledVector(peg.normal, -epsilon * 4),
      socketField = this.fields[1];
    if (socketField.sample(origin.x, origin.y, origin.z) < -epsilon * 8)
      throw new Error("Separate overlapping layers before placing their joint.");
    const socket = trace(new Ray(origin, peg.normal.clone()), socketField, epsilon);
    if (!socket || socket.normal.dot(peg.normal) > -0.5)
      throw new Error("Choose a face that points toward the socket layer.");
    const gap = socket.point.clone().sub(peg.point).dot(peg.normal);
    if (gap < -epsilon * 8) throw new Error("Choose facing joint surfaces.");
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), peg.normal),
      e = new Euler().setFromQuaternion(q, "XYZ");
    return {
      positionMM: peg.point.multiplyScalar(mm).toArray(),
      socketPositionMM: socket.point.multiplyScalar(mm).toArray(),
      rotationRadians: [e.x, e.y, e.z],
      normal: peg.normal.toArray(),
      faceGapMM: Math.max(0, gap * mm),
    };
  }
}

export function placedConnector(
  options: Omit<ConnectorOptions, "pegPart" | "socketPart">,
  placement: ConnectorPlacement,
): Omit<ConnectorOptions, "pegPart" | "socketPart"> {
  return {
    ...options,
    positionMM: [...placement.positionMM],
    socketPositionMM: [...placement.socketPositionMM],
    rotationRadians: [...placement.rotationRadians],
  };
}
