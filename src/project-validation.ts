import { analyticRecord } from "./analytic-cache";
import type { SdfLayer } from "./layers";
import { MAX_PROJECT_TRIANGLES } from "./project-format";

const TET_MASKS = [0b01100011, 0b01000111, 0b01001101, 0b11001001, 0b11010001, 0b01110001];
const POPCOUNT = Array.from(
  { length: 256 },
  (_, value) => value.toString(2).replaceAll("0", "").length,
);
const CELL_TRIANGLES = POPCOUNT.map((_, mask) =>
  TET_MASKS.reduce((count, tet) => {
    const inside = POPCOUNT[mask & tet];
    return count + (inside === 2 ? 2 : inside === 1 || inside === 3 ? 1 : 0);
  }, 0),
);
export function validateVoxels(
  values: Float32Array,
  resolution: number | [number, number, number],
  extent: number,
  countTriangles = true,
): number {
  const [nx, ny, nz] =
    typeof resolution === "number" ? [resolution, resolution, resolution] : resolution;
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const value = values[x + nx * (y + ny * z)];
        if (!Number.isFinite(value) || Math.abs(value) > Math.fround(extent * 4))
          throw new Error("Voxel data contains non-finite or out-of-range values.");
        if (
          (x === 0 || y === 0 || z === 0 || x === nx - 1 || y === ny - 1 || z === nz - 1) &&
          value <= 0
        )
          throw new Error("The SDF volume boundary must remain positive.");
      }
  return countTriangles ? countProjectVolumeTriangles(values, [nx, ny, nz]) : 0;
}

function countProjectVolumeTriangles(values: Float32Array, [nx, ny, nz]: [number, number, number]) {
  // Reject pathological checkerboard fields before they can allocate enormous meshes.
  let triangles = 0;
  const offsets = [0, 1, 1 + nx, nx, nx * ny, 1 + nx * ny, 1 + nx + nx * ny, nx + nx * ny];
  for (let z = 0; z < nz - 1; z++)
    for (let y = 0; y < ny - 1; y++)
      for (let x = 0; x < nx - 1; x++) {
        const index = x + nx * (y + ny * z);
        let mask = 0;
        for (let i = 0; i < 8; i++) if (values[index + offsets[i]] < 0) mask |= 1 << i;
        triangles += CELL_TRIANGLES[mask];
        if (triangles > MAX_PROJECT_TRIANGLES)
          throw new Error(
            `Project surface exceeds the ${MAX_PROJECT_TRIANGLES.toLocaleString()} triangle import limit.`,
          );
      }
  return triangles;
}
export function projectTriangleBudgetError(triangles: number, name: string): Error {
  return new Error(
    "Native project triangle budget exceeded at " +
      name +
      " (" +
      triangles.toLocaleString() +
      " counted; limit " +
      MAX_PROJECT_TRIANGLES.toLocaleString() +
      "). Undo the last change or split printable parts across projects.",
  );
}

/** Count stored source fields with the same rule as the native reader and writer. */
export function assertProjectTriangleBudget(
  layers: readonly SdfLayer[],
  candidate?: SdfLayer,
): void {
  let triangles = 0;
  for (const layer of candidate
    ? [...layers.filter((l) => l.id !== candidate.id), candidate]
    : layers) {
    if (analyticRecord(layer)) continue;
    const volume = layer.volume;
    const values =
      volume.getDenseView() ??
      volume.readRegion({
        min: [0, 0, 0],
        max: volume.dimensions.map((v) => v - 1) as [number, number, number],
      }).values;
    triangles += countProjectVolumeTriangles(values, volume.dimensions);
    if (triangles > MAX_PROJECT_TRIANGLES) throw projectTriangleBudgetError(triangles, layer.name);
  }
}
