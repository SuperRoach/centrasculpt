import type { SdfLayer } from "./layers";
import {
  evaluatePrimitive,
  type PrimitiveSource,
  primitiveDimensions,
  validatePrimitiveCache,
} from "./parametric-primitive";
import { ANALYTIC_ENCODING } from "./project-format";
export function analyticDimensions(source: PrimitiveSource | undefined) {
  // Limit v1 to constant-cost distance evaluators with a centred fitted lattice.
  if (
    !source ||
    source.kind === "text" ||
    source.kind === "pyramid" ||
    source.kind === "tapered-box"
  )
    return undefined;
  const dims = primitiveDimensions(source);
  if (source.kind === "sphere" && dims.some((n) => n !== dims[0])) return undefined;
  return dims;
}

export function cacheFingerprint(values: Float32Array): number {
  const words = new Uint32Array(values.buffer, values.byteOffset, values.length);
  let hash = 2166136261;
  for (const word of words) hash = Math.imul(hash ^ word, 16777619);
  return hash >>> 0;
}

export function analyticRecord(layer: SdfLayer) {
  const { primitive, volume } = layer;
  const dimensions = analyticDimensions(primitive);
  const values = volume.getDenseView();
  if (
    !primitive ||
    !dimensions ||
    !values ||
    volume.resolution < 33 ||
    volume.resolution > 63 ||
    volume.dimensions.some((n) => n !== volume.resolution) ||
    volume.latticeMin?.some((v) => v !== 0) ||
    volume.resolution % 2 !== 1 ||
    volume.extent !== Math.max(...dimensions) * 0.6 ||
    volume.voxelSize.some((v) => v !== (2 * volume.extent) / (volume.resolution - 1))
  )
    return undefined;
  // Byte equality includes signed zero. Existing voxel storage remains available.
  if (!validatePrimitiveCache(primitive, volume, true)) return undefined;
  return { encoding: ANALYTIC_ENCODING, dimensions, fingerprint: cacheFingerprint(values) };
}

export function rebuildAnalyticCache(
  primitive: PrimitiveSource,
  n: number,
  count: number,
  fingerprint: number,
) {
  const evaluation = evaluatePrimitive(primitive, n, count, undefined, 4096);
  let step = evaluation.next();
  while (!step.done) step = evaluation.next();
  const volume = step.value;
  if (cacheFingerprint(volume.values) !== fingerprint)
    throw new Error(
      "Analytic cache differs from the saved source. Reopen with a compatible Centra Sculpt build.",
    );
  return volume;
}
