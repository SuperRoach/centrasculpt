import { Vector3 } from "three";
import { SDFVolume } from "./sdf";
import type { Vec3 } from "./transform";
import type { VolumeStore } from "./volume-store";

export type CutPlane = { point: Vec3; normal: Vec3 };
export type PlaneCutFields = {
  negative: SDFVolume;
  positive: SDFVolume;
  negativeSamples: number;
  positiveSamples: number;
  intersections: number;
};

/** Cheap read-only plane review used before allocation or mesh construction. */
export function previewSdfPlaneCut(
  source: VolumeStore,
  plane: CutPlane,
): Pick<PlaneCutFields, "negativeSamples" | "positiveSamples" | "intersections"> {
  const normal = new Vector3(...plane.normal),
    point = new Vector3(...plane.point);
  if (![...plane.point, ...plane.normal].every(Number.isFinite) || normal.length() < 1e-8)
    throw new Error("Cut plane needs a finite point and non-zero normal.");
  normal.normalize();
  const dims = source.dimensions;
  let negativeSamples = 0,
    positiveSamples = 0,
    intersections = 0;
  for (let z = 0; z < dims[2]; z++)
    for (let y = 0; y < dims[1]; y++)
      for (let x = 0; x < dims[0]; x++) {
        const value = source.readVoxel(source.index(x, y, z)),
          signed =
            (source.coordinate(x, 0) - point.x) * normal.x +
            (source.coordinate(y, 1) - point.y) * normal.y +
            (source.coordinate(z, 2) - point.z) * normal.z;
        if (Math.max(value, signed) < 0) negativeSamples++;
        if (Math.max(value, -signed) < 0) positiveSamples++;
        if (value < 0 && Math.abs(signed) <= source.step * 1.75) intersections++;
      }
  return { negativeSamples, positiveSamples, intersections };
}

/** Intersect an authoritative negative-inside field with both closed half-spaces.
 * The plane itself becomes an implicit zero-set cap; rendered triangles are never cut. */
export function splitSdfByPlane(source: VolumeStore, plane: CutPlane): PlaneCutFields {
  const normal = new Vector3(...plane.normal),
    point = new Vector3(...plane.point);
  if (![...plane.point, ...plane.normal].every(Number.isFinite) || normal.length() < 1e-8)
    throw new Error("Cut plane needs a finite point and non-zero normal.");
  normal.normalize();
  const dims = source.dimensions,
    layout = { dimensions: dims, latticeMin: source.latticeMin ?? [0, 0, 0] },
    negative = new SDFVolume(source.resolution, source.extent, false, layout),
    positive = new SDFVolume(source.resolution, source.extent, false, layout);
  let negativeSamples = 0,
    positiveSamples = 0,
    intersections = 0;
  for (let z = 0; z < dims[2]; z++)
    for (let y = 0; y < dims[1]; y++)
      for (let x = 0; x < dims[0]; x++) {
        const id = source.index(x, y, z),
          value = source.readVoxel(id),
          signed =
            (source.coordinate(x, 0) - point.x) * normal.x +
            (source.coordinate(y, 1) - point.y) * normal.y +
            (source.coordinate(z, 2) - point.z) * normal.z;
        const n = Math.min(negative.extent * 4, Math.max(value, signed)),
          p = Math.min(positive.extent * 4, Math.max(value, -signed));
        if (
          !Number.isFinite(n) ||
          !Number.isFinite(p) ||
          Math.abs(n) > negative.extent * 4 ||
          Math.abs(p) > positive.extent * 4
        )
          throw new Error("Cut produced an invalid SDF sample.");
        negative.values[id] = n;
        positive.values[id] = p;
        if (n < 0) negativeSamples++;
        if (p < 0) positiveSamples++;
        if (value < 0 && Math.abs(signed) <= source.step * 1.75) intersections++;
      }
  if (!intersections || !negativeSamples || !positiveSamples)
    throw new Error("Cut plane does not split the sculpture into two measurable pieces.");
  return { negative, positive, negativeSamples, positiveSamples, intersections };
}
