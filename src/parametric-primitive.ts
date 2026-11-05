import { ExtrudeGeometry, Shape } from "three";
import { SDFVolume } from "./sdf";
import { transformMatrix, type Vec3 } from "./transform";
/** Dimensions are layer-local model units, never tracking/workspace metres. */
export type PrimitiveSource =
  | { kind: "box"; width: number; height: number; depth: number; cornerRadius?: number }
  | { kind: "cylinder"; diameter: number; height: number }
  | { kind: "sphere"; diameter: number };
export const PRIMITIVE_KINDS = ["box", "cylinder", "sphere"] as const;
export function validatePrimitive(value: unknown): PrimitiveSource {
  if (!value || typeof value !== "object") throw new Error("Invalid primitive definition.");
  const s = value as Record<string, unknown>;
  const keys =
    s.kind === "box"
      ? ["width", "height", "depth"]
      : s.kind === "cylinder"
        ? ["diameter", "height"]
        : s.kind === "sphere"
          ? ["diameter"]
          : [];
  if (
    !keys.length ||
    Object.keys(s).some(
      (k) => k !== "kind" && !(s.kind === "box" && k === "cornerRadius") && !keys.includes(k),
    )
  )
    throw new Error("Unsupported primitive type or parameter.");
  for (const key of keys)
    if (
      typeof s[key] !== "number" ||
      !Number.isFinite(s[key]) ||
      (s[key] as number) < 0.001 ||
      (s[key] as number) > 16
    )
      throw new Error("Primitive dimensions must be finite, from 0.001 to 16 model units.");
  const sizes = keys.map((k) => s[k] as number);
  if (
    s.cornerRadius !== undefined &&
    (s.kind !== "box" ||
      typeof s.cornerRadius !== "number" ||
      !Number.isFinite(s.cornerRadius) ||
      s.cornerRadius < 0 ||
      s.cornerRadius > Math.min(s.width as number, s.depth as number) / 2)
  )
    throw new Error("Corner radius must be finite and within half the box width/depth.");
  if (Math.min(...sizes) / Math.max(...sizes) < 1 / (s.cornerRadius === undefined ? 8 : 128))
    throw new Error(
      `Primitive aspect ratio exceeds ${s.kind === "box" && s.cornerRadius !== undefined ? 128 : 8}:1; use separate parts.`,
    );
  return { ...s } as PrimitiveSource;
}
export function primitiveDimensions(source: PrimitiveSource): Vec3 {
  const s = validatePrimitive(source);
  return s.kind === "box"
    ? [s.width, s.height, s.depth]
    : s.kind === "cylinder"
      ? [s.diameter, s.height, s.diameter]
      : [s.diameter, s.diameter, s.diameter];
}
/** Exact Euclidean signed distance; negative inside. */
export function primitiveDistance(s: PrimitiveSource, x: number, y: number, z: number): number {
  if (![x, y, z].every(Number.isFinite)) throw new Error("Primitive query must be finite.");
  if (s.kind === "sphere") return Math.hypot(x, y, z) - s.diameter / 2;
  if (s.kind === "cylinder") {
    const a = Math.hypot(x, z) - s.diameter / 2,
      b = Math.abs(y) - s.height / 2;
    return Math.hypot(Math.max(a, 0), Math.max(b, 0)) + Math.min(Math.max(a, b), 0);
  }
  if (s.cornerRadius === undefined) {
    const a = Math.abs(x) - s.width / 2,
      b = Math.abs(y) - s.height / 2,
      c = Math.abs(z) - s.depth / 2;
    return (
      Math.hypot(Math.max(a, 0), Math.max(b, 0), Math.max(c, 0)) + Math.min(Math.max(a, b, c), 0)
    );
  }
  const radius = s.cornerRadius;
  const a = Math.abs(x) - s.width / 2 + radius,
    b = Math.abs(y) - s.height / 2,
    c = Math.abs(z) - s.depth / 2 + radius;
  const radial = Math.hypot(Math.max(a, 0), Math.max(c, 0)) + Math.min(Math.max(a, c), 0) - radius;
  return Math.hypot(Math.max(radial, 0), Math.max(b, 0)) + Math.min(Math.max(radial, b), 0);
}
/** Bounded disposable preview lattice required by the existing chunk mesher and native codec.
 * Fitted spacing preserves small parts without rebuilding the project's sculpt lattice. */
export function* evaluatePrimitive(
  source: PrimitiveSource,
  resolution: number,
  maxSamples: number,
  onAllocate?: (samples: number) => void,
): Generator<void, SDFVolume> {
  const s = validatePrimitive(source),
    dimensions = primitiveDimensions(s),
    longest = Math.max(...dimensions);
  if (
    Math.min(...dimensions) / longest <
    1 / (s.kind === "box" && s.cornerRadius !== undefined ? 128 : 8)
  )
    throw new Error(
      `Primitive aspect ratio exceeds ${s.kind === "box" && s.cornerRadius !== undefined ? 128 : 8}:1; use separate parts.`,
    );
  const extent = longest * 0.6;
  resolution = Math.max(33, Math.min(resolution % 2 ? resolution : resolution - 1, 63));
  if (resolution ** 3 > maxSamples) throw new Error("Primitive exceeds the staging memory budget.");
  onAllocate?.(resolution ** 3);
  const volume = new SDFVolume(resolution, extent, false);
  let i = 0;
  for (let z = 0; z < resolution; z++)
    for (let y = 0; y < resolution; y++)
      for (let x = 0; x < resolution; x++) {
        volume.values[i++] = primitiveDistance(
          s,
          volume.coordinate(x),
          volume.coordinate(y),
          volume.coordinate(z),
        );
        if (i % 128 === 0) yield;
      }
  return volume;
}
/** Reject source/cache mismatches on native import and manual save, including tampered payloads. */
export function validatePrimitiveCache(
  source: PrimitiveSource,
  volume: import("./volume-store").VolumeStore,
): void {
  const s = validatePrimitive(source),
    expectedExtent = Math.max(...primitiveDimensions(s)) * 0.6;
  if (
    Math.abs(volume.extent - expectedExtent) > 1e-10 ||
    volume.resolution < 33 ||
    volume.resolution > 63 ||
    volume.dimensions.some((n) => n !== volume.resolution) ||
    volume.latticeMin?.some((n) => n !== 0)
  )
    throw new Error("Invalid primitive cache layout.");
  let i = 0;
  for (let z = 0; z < volume.resolution; z++)
    for (let y = 0; y < volume.resolution; y++)
      for (let x = 0; x < volume.resolution; x++) {
        const expected = Math.fround(
          primitiveDistance(s, volume.coordinate(x), volume.coordinate(y), volume.coordinate(z)),
        );
        if (volume.readVoxel(i++) !== expected)
          throw new Error("Primitive cache does not match its source parameters.");
      }
}
/** Exact model-axis bounds of the mathematical shape under its inherited affine pose. */
export function primitiveWorldDimensions(
  source: PrimitiveSource,
  transform: import("./transform").VolumeTransform,
): Vec3 {
  const s = validatePrimitive(source),
    m = transformMatrix(transform).elements,
    d = primitiveDimensions(s);
  return [0, 1, 2].map((a) => {
    const x = m[a],
      y = m[a + 4],
      z = m[a + 8];
    return s.kind === "sphere"
      ? s.diameter * Math.hypot(x, y, z)
      : s.kind === "cylinder"
        ? s.diameter * Math.hypot(x, z) + s.height * Math.abs(y)
        : d[0] * Math.abs(x) + d[1] * Math.abs(y) + d[2] * Math.abs(z);
  }) as Vec3;
}

/** Exact planar extents; curved corners are tessellated only for source presentation/export. */
export function roundedBoxGeometry(s: Extract<PrimitiveSource, { kind: "box" }>) {
  const r = s.cornerRadius ?? 0,
    x = s.width / 2,
    z = s.depth / 2,
    path = new Shape();
  path.moveTo(-x + r, -z);
  path.lineTo(x - r, -z);
  if (r) path.absarc(x - r, -z + r, r, -Math.PI / 2, 0, false);
  path.lineTo(x, z - r);
  if (r) path.absarc(x - r, z - r, r, 0, Math.PI / 2, false);
  path.lineTo(-x + r, z);
  if (r) path.absarc(-x + r, z - r, r, Math.PI / 2, Math.PI, false);
  path.lineTo(-x, -z + r);
  if (r) path.absarc(-x + r, -z + r, r, Math.PI, Math.PI * 1.5, false);
  path.closePath();
  const g = new ExtrudeGeometry(path, {
    depth: s.height,
    bevelEnabled: false,
    curveSegments: 24,
    steps: 1,
  });
  g.translate(0, 0, -s.height / 2);
  g.rotateX(Math.PI / 2);
  return g;
}
