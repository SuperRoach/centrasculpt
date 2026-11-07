import { ExtrudeGeometry, Shape } from "three";
import { SDFVolume } from "./sdf";
import { transformMatrix, type Vec3 } from "./transform";
/** Dimensions are layer-local model units, never tracking/workspace metres. */
export type PrimitiveSource =
  | { kind: "box"; width: number; height: number; depth: number; cornerRadius?: number }
  | {
      kind: "cylinder";
      diameter: number;
      height: number;
      topDiameter?: number;
      bottomDiameter?: number;
    }
  | { kind: "sphere"; diameter: number; width?: number; height?: number; depth?: number };
/** Input may omit the legacy diameter when both end diameters are explicit. */
export type PrimitiveInput =
  | { kind: "sphere"; width: number; height: number; depth: number }
  | PrimitiveSource
  | {
      kind: "cylinder";
      topDiameter: number;
      bottomDiameter: number;
      height: number;
    };
export const PRIMITIVE_KINDS = ["box", "cylinder", "sphere"] as const;
export function validatePrimitive(value: unknown): PrimitiveSource {
  if (!value || typeof value !== "object") throw new Error("Invalid primitive definition.");
  const s = { ...(value as Record<string, unknown>) };
  if (
    s.kind === "cylinder" &&
    s.diameter === undefined &&
    typeof s.topDiameter === "number" &&
    typeof s.bottomDiameter === "number"
  )
    s.diameter = Math.max(s.topDiameter, s.bottomDiameter);
  if (
    s.kind === "sphere" &&
    s.diameter === undefined &&
    [s.width, s.height, s.depth].every((v) => typeof v === "number")
  )
    s.diameter = Math.max(s.width as number, s.height as number, s.depth as number);
  const keys =
    s.kind === "box"
      ? ["width", "height", "depth"]
      : s.kind === "cylinder"
        ? [
            "diameter",
            "height",
            ...["topDiameter", "bottomDiameter"].filter((k) => s[k] !== undefined),
          ]
        : s.kind === "sphere"
          ? ["diameter", ...["width", "height", "depth"].filter((k) => s[k] !== undefined)]
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
  const sizes =
    s.kind === "cylinder"
      ? ([s.topDiameter ?? s.diameter, s.bottomDiameter ?? s.diameter, s.height] as number[])
      : s.kind === "sphere"
        ? ([s.width ?? s.diameter, s.height ?? s.diameter, s.depth ?? s.diameter] as number[])
        : keys.map((k) => s[k] as number);
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
      ? [
          Math.max(s.topDiameter ?? s.diameter, s.bottomDiameter ?? s.diameter),
          s.height,
          Math.max(s.topDiameter ?? s.diameter, s.bottomDiameter ?? s.diameter),
        ]
      : [s.width ?? s.diameter, s.height ?? s.diameter, s.depth ?? s.diameter];
}
/** Exact Euclidean signed distance; negative inside. */
export function primitiveDistance(s: PrimitiveSource, x: number, y: number, z: number): number {
  if (![x, y, z].every(Number.isFinite)) throw new Error("Primitive query must be finite.");
  if (s.kind === "sphere") {
    const a = (s.width ?? s.diameter) / 2,
      b = (s.height ?? s.diameter) / 2,
      c = (s.depth ?? s.diameter) / 2;
    if (a === b && b === c) return Math.hypot(x, y, z) - a;
    return ellipsoidDistance(a, b, c, x, y, z);
  }
  if (s.kind === "cylinder") {
    const top = (s.topDiameter ?? s.diameter) / 2,
      bottom = (s.bottomDiameter ?? s.diameter) / 2;
    if (top !== bottom) {
      const radius = Math.hypot(x, z),
        half = s.height / 2;
      const dr = top - bottom,
        dy = s.height;
      const t = Math.max(
        0,
        Math.min(1, ((radius - bottom) * dr + (y + half) * dy) / (dr * dr + dy * dy)),
      );
      const side = Math.hypot(radius - bottom - dr * t, y + half - dy * t);
      const lower = Math.hypot(Math.max(radius - bottom, 0), y + half);
      const upper = Math.hypot(Math.max(radius - top, 0), y - half);
      const inside = y >= -half && y <= half && radius <= bottom + dr * ((y + half) / dy);
      return Math.min(side, lower, upper) * (inside ? -1 : 1);
    }
    const a = Math.hypot(x, z) - top,
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
/** Euclidean ellipsoid distance via a bounded closest-point multiplier solve.
 * The interior singular branch includes medial-axis points with zero coordinates.
 * 56 bisections bound numeric error; this is not a radial-distance approximation. */
export function ellipsoidDistance(
  a: number,
  b: number,
  c: number,
  x: number,
  y: number,
  z: number,
): number {
  const r = [a, b, c],
    q = [Math.abs(x), Math.abs(y), Math.abs(z)],
    sq = r.map((v) => v * v);
  const level = q.reduce((sum, v, i) => sum + (v * v) / sq[i], 0);
  if (Math.abs(level - 1) < 1e-15) return 0;
  const inside = level < 1,
    minimum = Math.min(...sq);
  const equation = (t: number) =>
    q.reduce((sum, v, i) => {
      const denominator = inside ? t + (sq[i] - minimum) : t + sq[i];
      return (
        sum +
        (denominator === 0
          ? v === 0
            ? 0
            : Infinity
          : (sq[i] * v * v) / (denominator * denominator))
      );
    }, 0);
  let low = inside ? Math.hypot(...q.map((v, i) => (sq[i] === minimum ? r[i] * v : 0))) : 0,
    high = inside ? minimum : Math.max(...r) * Math.hypot(...q);
  if (inside && equation(0) <= 1) {
    const nearest = q.map((v, i) => (sq[i] === minimum ? 0 : (sq[i] * v) / (sq[i] - minimum)));
    const remaining = Math.max(0, 1 - nearest.reduce((sum, v, i) => sum + (v * v) / sq[i], 0));
    nearest[sq.indexOf(minimum)] = Math.sqrt(minimum * remaining);
    return -Math.hypot(...nearest.map((v, i) => v - q[i]));
  }
  for (let i = 0; i < 56; i++) {
    const middle = inside && low > 0 ? Math.sqrt(low) * Math.sqrt(high) : (low + high) / 2;
    if (equation(middle) > 1) low = middle;
    else high = middle;
  }
  const t = (low + high) / 2;
  return (
    Math.hypot(...q.map((v, i) => (sq[i] * v) / (inside ? t + (sq[i] - minimum) : t + sq[i]) - v)) *
    (inside ? -1 : 1)
  );
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
      ? Math.hypot(d[0] * x, d[1] * y, d[2] * z)
      : s.kind === "cylinder"
        ? cylinderSupport(s, x, y, z) + cylinderSupport(s, -x, -y, -z)
        : d[0] * Math.abs(x) + d[1] * Math.abs(y) + d[2] * Math.abs(z);
  }) as Vec3;
}

/** Directional support of the capped frustum, including asymmetric end radii. */
export function cylinderSupport(
  s: Extract<PrimitiveSource, { kind: "cylinder" }>,
  x: number,
  y: number,
  z: number,
) {
  const radial = Math.hypot(x, z);
  return Math.max(
    ((s.bottomDiameter ?? s.diameter) * radial) / 2 - (s.height * y) / 2,
    ((s.topDiameter ?? s.diameter) * radial) / 2 + (s.height * y) / 2,
  );
}
/** Editable fields also expose the two ends of legacy straight cylinders. */
export function primitiveFields(s: PrimitiveSource): Record<string, string | number> {
  if (s.kind === "sphere")
    return {
      kind: s.kind,
      width: s.width ?? s.diameter,
      height: s.height ?? s.diameter,
      depth: s.depth ?? s.diameter,
    };
  if (s.kind !== "cylinder") return { ...s };
  return {
    kind: s.kind,
    bottomDiameter: s.bottomDiameter ?? s.diameter,
    topDiameter: s.topDiameter ?? s.diameter,
    height: s.height,
  };
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
