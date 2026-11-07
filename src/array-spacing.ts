import { Euler, Quaternion, Vector3, type Vector3Tuple } from "three";
import type { ArrayDefinition } from "./object-array";
import { arrayInstanceAngles, arrayInstanceScales } from "./object-array";
import { type PrimitiveSource, primitiveSupport } from "./parametric-primitive";
import type { Bounds } from "./sdf";
import type { VolumeTransform } from "./transform";
import { uniformScale } from "./transform";

type Radial = Extract<ArrayDefinition, { kind: "radial" }>;
/** Gap between neighbouring projected source bounds. Exact directional support for primitives;
 * sculpt sources use their lattice bounds. The original source stays fixed; the pivot moves. */
export function radialGap(
  array: Radial,
  transform: VolumeTransform,
  bounds: Bounds,
  primitive?: PrimitiveSource,
  requestedGap?: number,
): { gap: number; pivot: Vector3Tuple } {
  if (requestedGap !== undefined && (!Number.isFinite(requestedGap) || requestedGap < 0))
    throw new Error("Gap between copies must be a finite non-negative distance.");
  if (array.count < 2) {
    if (requestedGap !== undefined) throw new Error("Choose at least two copies to set a gap.");
    return { gap: 0, pivot: [...array.pivot] };
  }
  const axis = new Vector3(...array.axis).normalize(),
    centre = new Vector3(...transform.position),
    offset = centre.clone().sub(new Vector3(...array.pivot)),
    axial = axis.clone().multiplyScalar(offset.dot(axis)),
    radial = offset.clone().sub(axial),
    radius = radial.length();
  if (radius < 1e-9) {
    radial.set(Math.abs(axis.x) < 0.9 ? 1 : 0, Math.abs(axis.x) < 0.9 ? 0 : 1, 0);
    radial.addScaledVector(axis, -radial.dot(axis));
  }
  radial.normalize();
  const inverse = new Quaternion().setFromEuler(new Euler(...transform.rotation)).invert(),
    scale = uniformScale(transform),
    angles = arrayInstanceAngles(array),
    scales = arrayInstanceScales(array),
    centres = angles.map((angle) => radial.clone().applyAxisAngle(axis, angle));
  const support = (direction: Vector3, angle: number) => {
    const d = direction.clone();
    if (array.orientation === "rotate") d.applyAxisAngle(axis, -angle);
    d.applyQuaternion(inverse);
    if (primitive) return scale * primitiveSupport(primitive, d.x, d.y, d.z);
    return (
      scale *
      [d.x, d.y, d.z].reduce((sum, v, i) => sum + v * (v < 0 ? bounds.min[i] : bounds.max[i]), 0)
    );
  };
  let gap = Infinity,
    requiredRadius = 0;
  // Every pair also covers the closing gap on partial arcs above 180 degrees.
  for (let a = 0; a < centres.length; a++)
    for (let b = a + 1; b < centres.length; b++) {
      const direction = centres[b].clone().sub(centres[a]),
        chord = direction.length();
      if (chord < 1e-9) throw new Error("Array copies share an angle; reduce the total angle.");
      direction.divideScalar(chord);
      const extent =
        support(direction, angles[a]) * scales[a] +
        support(direction.negate(), angles[b]) * scales[b];
      gap = Math.min(gap, radius * chord - extent);
      requiredRadius = Math.max(requiredRadius, ((requestedGap ?? 0) + extent) / chord);
    }
  return {
    gap,
    pivot:
      requestedGap === undefined
        ? [...array.pivot]
        : centre.clone().sub(axial).addScaledVector(radial, -requiredRadius).toArray(),
  };
}
