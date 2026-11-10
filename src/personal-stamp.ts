import type { SdfLayer } from "./layers";
import { IncrementalMesher } from "./mesh";
import type { Point3 } from "./sdf";
import type { Vec3 } from "./transform";
import { transformMatrix, uniformScale, validateTransform } from "./transform";

/** Opaque session capability. No library IDs are resolved during strokes. */
export type PersonalStamp = Readonly<{ id: string; name: string }>;
type Source = {
  bytes: number;
  size: number;
  minimumDimension: number;
  bounds: { min: Vec3; max: Vec3 };
  positions: Float32Array;
  sample: (p: Point3, dimension?: number) => number;
};
const sources = new WeakMap<PersonalStamp, Source>();
export function personalStampSource(token: PersonalStamp): Source {
  const source = sources.get(token);
  if (!source)
    throw new Error("Personal stamp is unavailable. Select it from Personal Shapes again.");
  return source;
}
/** Copy only the exact values, never resample or retain a mutable library layer.
 * Geometry is a bounded derived preview; it is never used for CSG. */
export function createPersonalStamp(
  layer: SdfLayer,
  calibration: number,
  maxBytes = 256 * 1024 ** 2,
): PersonalStamp {
  validateTransform(layer.transform);
  if (!Number.isFinite(maxBytes) || maxBytes < 0)
    throw new Error("Invalid personal stamp memory budget.");
  if (!Number.isFinite(calibration) || calibration <= 0)
    throw new Error("Invalid stamp calibration.");
  const scale = uniformScale(layer.transform) * calibration,
    matrix = transformMatrix(layer.transform).premultiply(
      transformMatrix({
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [calibration, calibration, calibration],
      }),
    ),
    inverse = matrix.clone().invert().elements,
    volume = layer.volume,
    count = volume.dimensions.reduce((a, b) => a * b, 1),
    dense = volume.getDenseView(),
    values = (() => {
      if (count * 4 > maxBytes) throw new Error("Personal stamp exceeds memory safety limits.");
      return dense
        ? dense.slice()
        : Float32Array.from({ length: count }, (_, i) => volume.readVoxel(i));
    })(),
    dims = volume.dimensions,
    bounds = volume.bounds,
    step = volume.step,
    extent = volume.extent,
    minimum = volume.latticeMin ?? [0, 0, 0],
    mesher = new IncrementalMesher(volume),
    positions: Float32Array[] = [],
    min: Vec3 = [Infinity, Infinity, Infinity],
    max: Vec3 = [-Infinity, -Infinity, -Infinity];
  let positionCount = 0;
  try {
    while (mesher.pendingChunks) {
      const update = mesher.rebuildChunks(1);
      if (!update) continue;
      if (update.triangles > 1000000)
        throw new Error("Personal stamp preview exceeds the triangle safety limit.");
      for (const chunk of update.updates) {
        const attribute = chunk.geometry.getAttribute("position"),
          e = matrix.elements;
        positionCount += attribute.count * 3;
        if (values.byteLength + positionCount * 4 * 12 > maxBytes)
          throw new Error("Personal stamp preview exceeds memory safety limits; detail was kept.");
        positions.push(Float32Array.from(attribute.array));
        for (let i = 0; i < attribute.count; i++) {
          const x = attribute.getX(i),
            y = attribute.getY(i),
            z = attribute.getZ(i),
            px = e[0] * x + e[4] * y + e[8] * z + e[12],
            py = e[1] * x + e[5] * y + e[9] * z + e[13],
            pz = e[2] * x + e[6] * y + e[10] * z + e[14];
          min[0] = Math.min(min[0], px);
          max[0] = Math.max(max[0], px);
          min[1] = Math.min(min[1], py);
          max[1] = Math.max(max[1], py);
          min[2] = Math.min(min[2], pz);
          max[2] = Math.max(max[2], pz);
        }
        chunk.geometry.dispose();
      }
    }
  } finally {
    mesher.dispose();
  }
  if (!positionCount) throw new Error("Personal shape has no sampled surface.");
  const size = Math.max(...max.map((v, a) => v - min[a])),
    geometry = new Float32Array(positionCount),
    e = matrix.elements;
  let at = 0;
  for (const chunk of positions)
    for (let i = 0; i < chunk.length; i += 3) {
      const x = chunk[i],
        y = chunk[i + 1],
        z = chunk[i + 2];
      geometry[at++] = (e[0] * x + e[4] * y + e[8] * z + e[12]) / size;
      geometry[at++] = (e[1] * x + e[5] * y + e[9] * z + e[13]) / size;
      geometry[at++] = (e[2] * x + e[6] * y + e[10] * z + e[14]) / size;
    }
  positions.length = 0;
  // One source sample margin covers all trilinear zero crossings, including extrema
  // that are not represented by a marching-tetrahedra surface vertex.
  const localBounds = {
    min: min.map((v) => (v - step * scale) / size) as Vec3,
    max: max.map((v) => (v + step * scale) / size) as Vec3,
  };
  // Scalar interpolation keeps the exact master lattice and accumulation order.
  // No point/grid/base/weight arrays are allocated per destination voxel.
  const sample = (p: Point3, dimension = 1) => {
    const x = (p.x / dimension) * size,
      y = (p.y / dimension) * size,
      z = (p.z / dimension) * size,
      e = inverse,
      px = e[0] * x + e[4] * y + e[8] * z + e[12],
      py = e[1] * x + e[5] * y + e[9] * z + e[13],
      pz = e[2] * x + e[6] * y + e[10] * z + e[14],
      gx = Math.max(0, Math.min(dims[0] - 1, (px + extent) / step - minimum[0])),
      gy = Math.max(0, Math.min(dims[1] - 1, (py + extent) / step - minimum[1])),
      gz = Math.max(0, Math.min(dims[2] - 1, (pz + extent) / step - minimum[2])),
      bx = Math.min(dims[0] - 2, Math.floor(gx)),
      by = Math.min(dims[1] - 2, Math.floor(gy)),
      bz = Math.min(dims[2] - 2, Math.floor(gz)),
      tx = gx - bx,
      ty = gy - by,
      tz = gz - bz;
    let value = 0;
    for (let k = 0; k < 2; k++)
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++)
          value +=
            values[bx + i + dims[0] * (by + j + dims[1] * (bz + k))] *
            (i ? tx : 1 - tx) *
            (j ? ty : 1 - ty) *
            (k ? tz : 1 - tz);
    return (
      (((value +
        Math.hypot(
          Math.max(0, bounds.min[0] - px, px - bounds.max[0]),
          Math.max(0, bounds.min[1] - py, py - bounds.max[1]),
          Math.max(0, bounds.min[2] - pz, pz - bounds.max[2]),
        )) *
        scale) /
        size) *
      dimension
    );
  };
  const token = Object.freeze({ id: crypto.randomUUID(), name: layer.name });
  sources.set(token, {
    size,
    minimumDimension: Math.min(...max.map((v, a) => v - min[a])),
    bounds: localBounds,
    positions: geometry,
    // Includes the source positions and conservative capacity for two live ghosts
    // (position, normal and edge buffers); pending trails share those buffers.
    bytes: values.byteLength + geometry.byteLength * 12,
    sample,
  });
  return token;
}
