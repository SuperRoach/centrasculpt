import { Vector3 } from "three";
import { SDFVolume } from "./sdf";
import { MAX_SDF_PAGES, SparseSDFVolume } from "./sparse-sdf";
import type { Vec3 } from "./transform";
import type { VolumeStore } from "./volume-store";

export type CutPlane = { point: Vec3; normal: Vec3 };
export type PlaneCutFields = {
  negative: VolumeStore;
  positive: VolumeStore;
  negativeSamples: number;
  positiveSamples: number;
  intersections: number;
};

function prepareSignedDistance(source: VolumeStore, plane: CutPlane) {
  const normal = new Vector3(...plane.normal),
    point = new Vector3(...plane.point);
  if (![...plane.point, ...plane.normal].every(Number.isFinite) || normal.length() < 1e-8)
    throw new Error("Cut plane needs a finite point and non-zero normal.");
  normal.normalize();
  return (x: number, y: number, z: number) =>
    (source.coordinate(x, 0) - point.x) * normal.x +
    (source.coordinate(y, 1) - point.y) * normal.y +
    (source.coordinate(z, 2) - point.z) * normal.z;
}
function* visitCutSamples(
  source: VolumeStore,
  visit: (x: number, y: number, z: number, value: number) => void,
): Generator<void> {
  const dims = source.dimensions;
  if (source instanceof SparseSDFVolume) {
    // min(limit, max(implicit, signed)) always rounds back to implicit,
    // including beyond the plane's saturation distance. Resident positive
    // samples can change even in pages that never contribute triangles.
    for (const [key] of source.residentPages()) {
      const { min, max } = source.pageBounds(key);
      for (let z = min[2]; z <= max[2]; z++)
        for (let y = min[1]; y <= max[1]; y++)
          for (let x = min[0]; x <= max[0]; x++) {
            const value = source.readSample(x, y, z);
            if (value !== source.defaultValue) visit(x, y, z, value);
          }
      yield;
    }
    return;
  }
  for (let z = 0; z < dims[2]; z++) {
    for (let y = 0; y < dims[1]; y++)
      for (let x = 0; x < dims[0]; x++) visit(x, y, z, source.readVoxel(source.index(x, y, z)));
    yield;
  }
}

/** Read-only plane review before allocation or mesh construction. */
export function previewSdfPlaneCut(
  source: VolumeStore,
  plane: CutPlane,
): Pick<PlaneCutFields, "negativeSamples" | "positiveSamples" | "intersections"> {
  const signedDistance = prepareSignedDistance(source, plane);
  let negativeSamples = 0,
    positiveSamples = 0,
    intersections = 0;
  const samples = visitCutSamples(source, (x, y, z, value) => {
    const signed = signedDistance(x, y, z);
    if (Math.max(value, signed) < 0) negativeSamples++;
    if (Math.max(value, -signed) < 0) positiveSamples++;
    if (value < 0 && Math.abs(signed) <= source.step * 1.75) intersections++;
  });
  for (const slice of samples) void slice;
  return { negativeSamples, positiveSamples, intersections };
}

/** Intersect an authoritative negative-inside field with both closed half-spaces.
 * The plane itself becomes an implicit zero-set cap; rendered triangles are never cut. */
export function splitSdfByPlane(source: VolumeStore, plane: CutPlane): PlaneCutFields {
  const work = splitSdfByPlaneSteps(source, plane);
  let step = work.next();
  while (!step.done) step = work.next();
  return step.value;
}

export function* splitSdfByPlaneSteps(
  source: VolumeStore,
  plane: CutPlane,
): Generator<void, PlaneCutFields> {
  const signedDistance = prepareSignedDistance(source, plane);
  const dims = source.dimensions,
    layout = { dimensions: dims, latticeMin: source.latticeMin ?? [0, 0, 0] },
    output = () =>
      source instanceof SparseSDFVolume
        ? new SparseSDFVolume(source.resolution, source.extent, MAX_SDF_PAGES, layout)
        : new SDFVolume(source.resolution, source.extent, false, layout),
    negative = output(),
    positive = output(),
    limit = source.extent * 4;
  let negativeSamples = 0,
    positiveSamples = 0,
    intersections = 0;
  yield* visitCutSamples(source, (x, y, z, value) => {
    const id = source.index(x, y, z),
      signed = signedDistance(x, y, z);
    const n = Math.min(limit, Math.max(value, signed)),
      p = Math.min(limit, Math.max(value, -signed));
    if (
      !Number.isFinite(n) ||
      !Number.isFinite(p) ||
      Math.abs(Math.fround(n)) > Math.fround(limit) ||
      Math.abs(Math.fround(p)) > Math.fround(limit)
    )
      throw new Error("Cut produced an invalid SDF sample.");
    negative.writeVoxel(id, n);
    positive.writeVoxel(id, p);
    if (n < 0) negativeSamples++;
    if (p < 0) positiveSamples++;
    if (value < 0 && Math.abs(signed) <= source.step * 1.75) intersections++;
  });
  if (!intersections || !negativeSamples || !positiveSamples)
    throw new Error("Cut plane does not split the sculpture into two measurable pieces.");
  return { negative, positive, negativeSamples, positiveSamples, intersections };
}
