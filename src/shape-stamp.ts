import type { SdfLayer } from "./layers";
import { MAX_PROJECT_VOXELS } from "./project-format";
import { sculptMask } from "./sculpt-mask";
import type { Bounds, MirrorPlane } from "./sdf";
import { reflectPoint } from "./sdf";
import { prepareShape } from "./shape-library";
import { validateShapeDefinition } from "./shapes";
import { SparseSDFVolume } from "./sparse-sdf";
import { uniformScale, validateTransform } from "./transform";

export type StampPatch = {
  indices: Uint32Array;
  before: Float32Array;
  after: Float32Array;
  bounds: Bounds | null;
  evaluationMs: number;
  scanned: number;
  evaluated: number;
  allocatedStagingBytes: number;
  peakStagingBytes: number;
  stagingAllocations: number;
  retainedStagingBytes: number;
};
/** Stage exact CSG deltas before any write. Shape pose and distances are target-layer-local.
 * A shape's geometric AABB alone is insufficient: min/max can change far-field distances.
 * The storage distance limit expands the conservative scan bounds; per-sample AABB lower
 * bounds cheaply reject values that cannot change, before evaluating the prepared kernel.
 */
export function prepareStamp(
  layer: SdfLayer,
  value: unknown,
  maxStagingBytes = Infinity,
  mirror?: MirrorPlane,
): StampPatch {
  const work = prepareStampSteps(layer, value, maxStagingBytes, mirror);
  let step = work.next();
  while (!step.done) step = work.next();
  return step.value;
}
/** Shared exact kernel; the XR caller advances bounded batches across frames. */
export function* prepareStampSteps(
  layer: SdfLayer,
  value: unknown,
  maxStagingBytes = Infinity,
  mirror?: MirrorPlane,
): Generator<void, StampPatch> {
  const start = performance.now(),
    d = validateShapeDefinition(value);
  if (d.targetLayerId !== layer.id) throw new Error("Stamp must target the active layer.");
  layer.assertEditable();
  validateTransform(layer.transform);
  uniformScale(layer.transform);
  const volume = layer.volume,
    dims = volume.dimensions,
    { min: origin, max: end } = volume.bounds,
    mask = sculptMask(volume),
    readSparse = volume instanceof SparseSDFVolume ? volume.prepareSampleReader() : undefined,
    n = volume.dimensions.reduce((a, b) => a * b, 1),
    shape = prepareShape(d),
    box = shape.worldBounds;
  if (mirror?.enabled) {
    const a = "xyz".indexOf(mirror.axis),
      low = box.min[a],
      high = box.max[a];
    box.min[a] = Math.min(low, 2 * mirror.offset - high);
    box.max[a] = Math.max(high, 2 * mirror.offset - low);
  }
  if (
    d.operation === "add" &&
    box.min.some((v, i) => v <= origin[i] + volume.step || box.max[i] >= end[i] - volume.step)
  )
    throw new Error(
      "Add shape extends beyond the layer’s safe volume bounds. Move or shrink it; resolution and bounds are never changed automatically.",
    );
  const limit = Math.fround(volume.extent * 4),
    padding = limit;
  const lo = box.min.map((v, a) =>
    d.personal ? 0 : Math.max(0, Math.ceil((v - padding - origin[a]) / volume.step)),
  );
  const hi = box.max.map((v, a) =>
    d.personal
      ? dims[a] - 1
      : Math.min(dims[a] - 1, Math.floor((v + padding - origin[a]) / volume.step)),
  );
  if (
    readSparse &&
    lo.reduce((count, v, a) => count * Math.max(0, hi[a] - v + 1), 1) > MAX_PROJECT_VOXELS
  )
    throw new Error("Stamp exceeds the exact sparse scan limit. Use a smaller target or stamp.");
  if (
    maxStagingBytes !== Infinity &&
    (!Number.isSafeInteger(maxStagingBytes) || maxStagingBytes < 0)
  )
    throw new Error("Invalid stamp staging budget.");
  const maxCapacity = Math.floor(maxStagingBytes / 24),
    initial = Math.min(n, 1024, maxCapacity);
  let indices = new Uint32Array(initial),
    before = new Float32Array(initial),
    after = new Float32Array(initial),
    count = 0,
    scanned = 0,
    evaluated = 0,
    allocatedStagingBytes = initial * 12,
    peakStagingBytes = initial * 12,
    stagingAllocations = 3;
  const bounds: Bounds = { min: [...dims], max: [0, 0, 0] },
    p = { x: 0, y: 0, z: 0 },
    margin =
      16 *
      Number.EPSILON *
      [...box.min, ...box.max, ...origin, ...end].reduce((sum, v) => sum + Math.abs(v), 0);
  for (let z = lo[2]; z <= hi[2]; z++)
    for (let y = lo[1]; y <= hi[1]; y++)
      for (let x = lo[0]; x <= hi[0]; x++) {
        if (scanned && scanned % 2048 === 0) yield;
        scanned++;
        const index = volume.index(x, y, z),
          old = readSparse ? readSparse(x, y, z) : volume.readVoxel(index);
        p.x = volume.coordinate(x, 0);
        p.y = volume.coordinate(y, 1);
        p.z = volume.coordinate(z, 2);
        if (!Number.isFinite(old) || Math.abs(old) > limit)
          throw new Error("Target contains invalid SDF values.");
        if (!d.personal) {
          const dx = Math.max(box.min[0] - p.x, 0, p.x - box.max[0]),
            dy = Math.max(box.min[1] - p.y, 0, p.y - box.max[1]),
            dz = Math.max(box.min[2] - p.z, 0, p.z - box.max[2]),
            threshold = Math.max(0, d.operation === "add" ? old : -old) + margin;
          // Largest slab is a lower bound on the full AABB distance.
          if (Math.max(dx, dy, dz) > threshold || Math.hypot(dx, dy, dz) > threshold) continue;
        }
        evaluated++;
        const distance = Math.min(
            shape.sampleWorld(p),
            mirror?.enabled ? shape.sampleWorld(reflectPoint(p, mirror)) : Infinity,
          ),
          next = mask.blend(
            index,
            old,
            d.operation === "add" ? Math.min(old, distance) : Math.max(old, -distance),
          );
        if (
          !Number.isFinite(next) ||
          Math.abs(next) > limit ||
          ((x === 0 ||
            y === 0 ||
            z === 0 ||
            x === dims[0] - 1 ||
            y === dims[1] - 1 ||
            z === dims[2] - 1) &&
            next <= 0)
        )
          throw new Error(
            "Stamp exceeds the supported SDF distance or positive-boundary limits. Reduce its dimensions.",
          );
        if (Object.is(next, old)) continue;
        if ((indices.length + count + 1) * 12 > maxStagingBytes)
          throw new Error(
            "Stamp exceeds the staging/history memory safety limit. Source voxels and redo were kept.",
          );
        if (count === indices.length) {
          // Leave room for the retained history instead of rejecting a patch
          // just because doubling the scratch capacity would overshoot the budget.
          const capacity = Math.min(n, Math.max(1, count * 2), maxCapacity);
          allocatedStagingBytes += capacity * 12;
          peakStagingBytes = Math.max(peakStagingBytes, (indices.length + capacity) * 12);
          stagingAllocations += 3;
          const i = new Uint32Array(capacity),
            b = new Float32Array(capacity),
            a = new Float32Array(capacity);
          i.set(indices);
          b.set(before);
          a.set(after);
          indices = i;
          before = b;
          after = a;
        }
        indices[count] = index;
        before[count] = old;
        after[count] = next;
        count++;
        bounds.min[0] = Math.min(bounds.min[0], x);
        bounds.min[1] = Math.min(bounds.min[1], y);
        bounds.min[2] = Math.min(bounds.min[2], z);
        bounds.max[0] = Math.max(bounds.max[0], x);
        bounds.max[1] = Math.max(bounds.max[1], y);
        bounds.max[2] = Math.max(bounds.max[2], z);
      }
  return {
    indices: indices.subarray(0, count),
    before: before.subarray(0, count),
    after: after.subarray(0, count),
    bounds: count ? bounds : null,
    evaluationMs: performance.now() - start,
    scanned,
    evaluated,
    allocatedStagingBytes,
    peakStagingBytes,
    stagingAllocations,
    retainedStagingBytes: indices.byteLength * 3,
  };
}
