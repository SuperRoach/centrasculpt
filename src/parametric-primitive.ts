import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Triangle,
  Vector2,
  Vector3,
} from "three";
import { SDFVolume } from "./sdf";
import { transformMatrix, type Vec3 } from "./transform";
/** Dimensions are layer-local model units, never tracking/workspace metres. */
export type PrimitiveSource =
  | { kind: "capsule"; diameter: number; height: number }
  | { kind: "torus"; majorRadius: number; tubeDiameter: number; tyre?: number }
  | { kind: "pyramid"; width: number; height: number; depth: number }
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
export const PRIMITIVE_KINDS = [
  "box",
  "cylinder",
  "sphere",
  "capsule",
  "torus",
  "pyramid",
] as const;
/** Cone is a creation preset of the canonical capped frustum, never a second geometry kind. */
export const PRIMITIVE_CHOICES = [...PRIMITIVE_KINDS, "cone"] as const;
export type PrimitiveChoice = (typeof PRIMITIVE_CHOICES)[number];
export function primitiveLabel(s: PrimitiveSource): string {
  return s.kind === "cylinder" && s.topDiameter === 0
    ? "Cone"
    : s.kind[0].toUpperCase() + s.kind.slice(1);
}
export function primitiveFieldLabel(field: string, source?: PrimitiveSource): string {
  if (source?.kind === "capsule" && field === "height") return "Overall height";
  return (
    (
      {
        topDiameter:
          source?.kind === "cylinder" && source.topDiameter === 0 ? "Tip diameter" : "Top diameter",
        bottomDiameter:
          source?.kind === "cylinder" && source.topDiameter === 0
            ? "Base diameter"
            : "Bottom diameter",
        majorRadius: "Ring radius",
        tubeDiameter: "Tube diameter",
        tyre: "Tyre shape",
      } as Record<string, string>
    )[field] ?? field[0].toUpperCase() + field.slice(1)
  );
}
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
    s.kind === "box" || s.kind === "pyramid"
      ? ["width", "height", "depth"]
      : s.kind === "capsule"
        ? ["diameter", "height"]
        : s.kind === "torus"
          ? ["majorRadius", "tubeDiameter"]
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
      (k) =>
        k !== "kind" &&
        !(s.kind === "box" && k === "cornerRadius") &&
        !(s.kind === "torus" && k === "tyre") &&
        !keys.includes(k),
    )
  )
    throw new Error("Unsupported primitive type or parameter.");
  for (const key of keys)
    if (
      typeof s[key] !== "number" ||
      !Number.isFinite(s[key]) ||
      (s[key] as number) <
        (s.kind === "cylinder" && ["topDiameter", "bottomDiameter"].includes(key) ? 0 : 0.001) ||
      (s[key] as number) > 16
    )
      throw new Error("Primitive dimensions must be finite, from 0.001 to 16 model units.");
  if (
    s.kind === "cylinder" &&
    Math.max((s.topDiameter ?? s.diameter) as number, (s.bottomDiameter ?? s.diameter) as number) <
      0.001
  )
    throw new Error("At least one cylinder end diameter must be 0.001 or greater.");
  if (s.kind === "capsule" && (s.height as number) < (s.diameter as number))
    throw new Error("Capsule overall height must be at least its diameter.");
  if (s.kind === "torus" && (s.majorRadius as number) <= (s.tubeDiameter as number) / 2)
    throw new Error(
      "Torus ring centreline radius must exceed tube radius; the hole must remain open.",
    );
  if (
    s.tyre !== undefined &&
    (s.kind !== "torus" ||
      typeof s.tyre !== "number" ||
      !Number.isFinite(s.tyre) ||
      s.tyre < 0 ||
      s.tyre > 100)
  )
    throw new Error("Tyre shape must be between 0 and 100.");
  const sizes =
    s.kind === "cylinder"
      ? ([
          Math.max(
            (s.topDiameter ?? s.diameter) as number,
            (s.bottomDiameter ?? s.diameter) as number,
          ),
          s.height,
        ] as number[])
      : s.kind === "sphere"
        ? ([s.width ?? s.diameter, s.height ?? s.diameter, s.depth ?? s.diameter] as number[])
        : s.kind === "torus"
          ? [s.tubeDiameter as number, 2 * (s.majorRadius as number) + (s.tubeDiameter as number)]
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
  if (
    Math.min(...sizes) / Math.max(...sizes) <
    1 / (s.kind === "torus" || (s.kind === "box" && s.cornerRadius !== undefined) ? 128 : 8)
  )
    throw new Error(
      `Primitive aspect ratio exceeds ${s.kind === "torus" || (s.kind === "box" && s.cornerRadius !== undefined) ? 128 : 8}:1; use separate parts.`,
    );
  return { ...s } as PrimitiveSource;
}
export function primitiveDimensions(source: PrimitiveSource): Vec3 {
  const s = validatePrimitive(source);
  return s.kind === "box" || s.kind === "pyramid"
    ? [s.width, s.height, s.depth]
    : s.kind === "capsule"
      ? [s.diameter, s.height, s.diameter]
      : s.kind === "torus"
        ? [2 * s.majorRadius + s.tubeDiameter, s.tubeDiameter, 2 * s.majorRadius + s.tubeDiameter]
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
  if (s.kind === "capsule")
    return (
      Math.hypot(x, Math.max(0, Math.abs(y) - (s.height - s.diameter) / 2), z) - s.diameter / 2
    );
  if (s.kind === "torus") {
    if (!s.tyre) return Math.hypot(Math.hypot(x, z) - s.majorRadius, y) - s.tubeDiameter / 2;
    const r = torusCornerRadius(s),
      a = s.tubeDiameter / 2 - r;
    const u = Math.abs(Math.hypot(x, z) - s.majorRadius) - a,
      v = Math.abs(y) - a;
    return Math.hypot(Math.max(u, 0), Math.max(v, 0)) + Math.min(Math.max(u, v), 0) - r;
  }
  if (s.kind === "pyramid") return pyramidDistance(s, x, y, z);
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
    1 / (s.kind === "torus" || (s.kind === "box" && s.cornerRadius !== undefined) ? 128 : 8)
  )
    throw new Error(
      `Primitive aspect ratio exceeds ${s.kind === "torus" || (s.kind === "box" && s.cornerRadius !== undefined) ? 128 : 8}:1; use separate parts.`,
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
    m = transformMatrix(transform).elements;
  return [0, 1, 2].map((a) => {
    const x = m[a],
      y = m[a + 4],
      z = m[a + 8];
    return primitiveSupport(s, x, y, z) + primitiveSupport(s, -x, -y, -z);
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
  if (s.kind === "torus") return { ...s, tyre: s.tyre ?? 0 };
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

/** Exact directional support, including off-centre apex/base and curved solids. */
export function primitiveSupport(s: PrimitiveSource, x: number, y: number, z: number): number {
  if (s.kind === "cylinder") return cylinderSupport(s, x, y, z);
  if (s.kind === "capsule")
    return (s.diameter * Math.hypot(x, y, z) + (s.height - s.diameter) * Math.abs(y)) / 2;
  if (s.kind === "torus")
    return (
      (s.majorRadius + s.tubeDiameter / 2 - torusCornerRadius(s)) * Math.hypot(x, z) +
      (s.tubeDiameter / 2 - torusCornerRadius(s)) * Math.abs(y) +
      torusCornerRadius(s) * Math.hypot(x, y, z)
    );
  if (s.kind === "sphere")
    return (
      Math.hypot(
        (s.width ?? s.diameter) * x,
        (s.height ?? s.diameter) * y,
        (s.depth ?? s.diameter) * z,
      ) / 2
    );
  if (s.kind === "pyramid")
    return Math.max(
      (s.width * Math.abs(x) + s.depth * Math.abs(z) - s.height * y) / 2,
      (s.height * y) / 2,
    );
  return (s.width * Math.abs(x) + s.height * Math.abs(y) + s.depth * Math.abs(z)) / 2;
}
/** Smallest solid or hole feature used by bounded sampled CSG admission. A mathematical
 * cone/pyramid tip is zero width: sampling cannot preserve that tip exactly. */
export function primitiveFeatureSize(s: PrimitiveSource): number {
  if (s.kind === "torus") return Math.min(s.tubeDiameter, 2 * s.majorRadius - s.tubeDiameter);
  return Math.min(...primitiveDimensions(s));
}
function pyramidVertices(s: Extract<PrimitiveSource, { kind: "pyramid" }>): Vector3[] {
  const x = s.width / 2,
    y = s.height / 2,
    z = s.depth / 2;
  return [
    new Vector3(-x, -y, -z),
    new Vector3(x, -y, -z),
    new Vector3(x, -y, z),
    new Vector3(-x, -y, z),
    new Vector3(0, y, 0),
  ];
}
const pyramidFaces = [
  [0, 1, 2],
  [0, 2, 3],
  [0, 4, 1],
  [1, 4, 2],
  [2, 4, 3],
  [3, 4, 0],
];
const pyramidFacets = new WeakMap<PrimitiveSource, { key: string; triangles: Triangle[] }>();
const queryPoint = new Vector3(),
  closestPoint = new Vector3();
function pyramidDistance(
  s: Extract<PrimitiveSource, { kind: "pyramid" }>,
  x: number,
  y: number,
  z: number,
): number {
  const key = `${s.width}:${s.height}:${s.depth}`;
  let cache = pyramidFacets.get(s);
  if (cache?.key !== key) {
    const v = pyramidVertices(s);
    cache = { key, triangles: pyramidFaces.map(([a, b, c]) => new Triangle(v[a], v[b], v[c])) };
    pyramidFacets.set(s, cache);
  }
  queryPoint.set(x, y, z);
  let distance = Infinity;
  for (const triangle of cache.triangles) {
    triangle.closestPointToPoint(queryPoint, closestPoint);
    distance = Math.min(distance, queryPoint.distanceToSquared(closestPoint));
  }
  const t = (s.height / 2 - y) / s.height;
  const inside =
    y >= -s.height / 2 &&
    y <= s.height / 2 &&
    Math.abs(x) <= (s.width * t) / 2 &&
    Math.abs(z) <= (s.depth * t) / 2;
  return Math.sqrt(distance) * (inside ? -1 : 1);
}
/** Shared source/preview/export tessellation. Pivot is local bounding-box centre;
 * Y is the vertical axis; pyramid apex is +Y and torus ring lies in XZ. */
function buildPrimitiveGeometry(s: PrimitiveSource, segments = 96): BufferGeometry {
  if (s.kind === "box")
    return s.cornerRadius === undefined
      ? new BoxGeometry(s.width, s.height, s.depth)
      : roundedBoxGeometry(s);
  if (s.kind === "cylinder")
    return new CylinderGeometry(
      (s.topDiameter ?? s.diameter) / 2,
      (s.bottomDiameter ?? s.diameter) / 2,
      s.height,
      segments,
    );
  if (s.kind === "sphere")
    return new SphereGeometry(0.5, segments, Math.max(8, Math.floor((segments * 2) / 3))).scale(
      s.width ?? s.diameter,
      s.height ?? s.diameter,
      s.depth ?? s.diameter,
    );
  if (s.kind === "capsule") {
    if (s.height === s.diameter)
      return new SphereGeometry(s.diameter / 2, segments, segments < 48 ? 8 : 32);
    const g = new CapsuleGeometry(
      s.diameter / 2,
      s.height - s.diameter,
      segments < 48 ? 4 : 16,
      segments,
    );
    // Three's capsule includes two triangles per pole quad; one has two coincident
    // pole vertices. Omit those known collapsed triangles rather than exporting seams.
    const p = g.getAttribute("position"),
      index = g.getIndex()!;
    g.computeBoundingBox();
    const min = g.boundingBox!.min.y,
      max = g.boundingBox!.max.y,
      indices: number[] = [];
    for (let i = 0; i < index.count; i += 3) {
      const a = index.getX(i),
        b = index.getX(i + 1),
        c = index.getX(i + 2),
        ys = [p.getY(a), p.getY(b), p.getY(c)];
      if (ys.filter((y) => y === min).length >= 2 || ys.filter((y) => y === max).length >= 2)
        continue;
      indices.push(a, b, c);
    }
    g.setIndex(indices);
    return g;
  }
  if (s.kind === "torus" && s.tyre) {
    const r = torusCornerRadius(s),
      a = s.tubeDiameter / 2 - r,
      points: Vector2[] = [];
    const steps = segments < 48 ? 2 : 8;
    for (let corner = 0; corner < 4; corner++)
      for (let i = 0; i <= steps; i++) {
        const angle = ((corner + i / steps) * Math.PI) / 2;
        points.push(
          new Vector2(
            s.majorRadius + (corner === 0 || corner === 3 ? a : -a) + r * Math.cos(angle),
            (corner < 2 ? a : -a) + r * Math.sin(angle),
          ),
        );
      }
    points.push(points[0].clone());
    return new LatheGeometry(points, segments);
  }
  if (s.kind === "torus")
    return new TorusGeometry(
      s.majorRadius,
      s.tubeDiameter / 2,
      segments < 48 ? 8 : 32,
      segments,
    ).rotateX(Math.PI / 2);
  const v = pyramidVertices(s),
    positions = pyramidFaces.flatMap((face) => face.flatMap((i) => v[i].toArray()));
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}
/** Unit-box preview keeps the existing gizmo's dimensions contract. */
export function primitivePreviewGeometry(s: PrimitiveSource): BufferGeometry {
  const d = primitiveDimensions(s);
  return primitiveGeometry(s, 16).scale(1 / d[0], 1 / d[1], 1 / d[2]);
}

/** Exact affine AABB, with independent min/max support for asymmetric solids. */
export function primitiveWorldBounds(
  source: PrimitiveSource,
  transform: import("./transform").VolumeTransform,
): { min: Vec3; max: Vec3 } {
  const s = validatePrimitive(source),
    m = transformMatrix(transform).elements;
  return {
    min: [0, 1, 2].map((a) => m[12 + a] - primitiveSupport(s, -m[a], -m[a + 4], -m[a + 8])) as Vec3,
    max: [0, 1, 2].map((a) => m[12 + a] + primitiveSupport(s, m[a], m[a + 4], m[a + 8])) as Vec3,
  };
}

/** Canonicalise only floating trigonometric zeroes at poles and wrap seams. */
export function primitiveGeometry(s: PrimitiveSource, segments = 96): BufferGeometry {
  const g = buildPrimitiveGeometry(s, segments),
    p = g.getAttribute("position"),
    epsilon = Math.max(...primitiveDimensions(s)) * 1e-14;
  for (let i = 0; i < p.array.length; i++) if (Math.abs(p.array[i]) < epsilon) p.array[i] = 0;
  return g;
}

/** Rounded-square section: fixed outer dimensions, softer shoulders at zero. */
export function torusCornerRadius(s: Extract<PrimitiveSource, { kind: "torus" }>): number {
  return (s.tubeDiameter / 2) * (1 - (0.85 * (s.tyre ?? 0)) / 100);
}
