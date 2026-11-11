/** Offline Phase 8.3b. Distances use millimetres in the synthetic space and
 * model units in the native master experiment. Brick ownership never moves. */
export const brickKey = (x, y, z) => x + 512 * (y + 256) + 512 ** 2 * (z + 256) + 256;
export const brickCoords = (key) => [
  (key % 512) - 256,
  (Math.floor(key / 512) % 512) - 256,
  Math.floor(key / 512 ** 2) - 256,
];
const offset = (x, y, z) => (x & 7) + 8 * ((y & 7) + 8 * (z & 7));
const owner = (x, y, z) => brickKey(x >> 3, y >> 3, z >> 3);
export const PAGE_BYTES = 8 ** 3 * 4;
export const ENTRY_ALLOWANCE = 256;
const MAX_BRICKS = 16000;

export function* bricksIn(lo, hi) {
  if ([...lo, ...hi].some((n) => !Number.isInteger(n) || n < -2048 || n >= 2048))
    throw new Error("Research lattice limit");
  for (let z = lo[2] >> 3; z <= hi[2] >> 3; z++)
    for (let y = lo[1] >> 3; y <= hi[1] >> 3; y++)
      for (let x = lo[0] >> 3; x <= hi[0] >> 3; x++) yield brickKey(x, y, z);
}

export function page(key, read) {
  const [bx, by, bz] = brickCoords(key).map((b) => b * 8);
  const data = new Float32Array(512);
  for (let z = 0; z < 8; z++)
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) data[offset(x, y, z)] = read(bx + x, by + y, bz + z);
  return data;
}

export function summarize(key, read) {
  const [bx, by, bz] = brickCoords(key).map((b) => b * 8);
  let min = Infinity,
    max = -Infinity,
    coreMin = Infinity,
    coreMax = -Infinity;
  // A cell touching a brick can need a corner on its neighbor and a
  // central difference one sample farther out. Keep both layers exact.
  for (let z = -2; z < 10; z++)
    for (let y = -2; y < 10; y++)
      for (let x = -2; x < 10; x++) {
        const v = read(bx + x, by + y, bz + z);
        min = Math.min(min, v);
        max = Math.max(max, v);
        if ((x | y | z) >= 0 && x < 8 && y < 8 && z < 8) {
          coreMin = Math.min(coreMin, v);
          coreMax = Math.max(coreMax, v);
        }
      }
  return { min, max, coreMin, coreMax };
}

export class BandCache {
  entries = new Map();
  constructor(width, step, exact, defaultOutside = false) {
    this.limit = width * step;
    this.exact = exact;
    this.defaultOutside = defaultOutside;
  }
  entry(key, read, bounds = summarize(key, read)) {
    if (bounds.min > this.limit) return this.defaultOutside ? undefined : 1;
    if (bounds.max < -this.limit) return -1;
    return page(key, read);
  }
  install(key, entry) {
    if (entry === undefined) this.entries.delete(key);
    else {
      if (this.entries.size >= MAX_BRICKS && !this.entries.has(key))
        throw new Error("Research cache budget");
      this.entries.set(key, entry);
    }
  }
  read(x, y, z, exact = true) {
    const entry = this.entries.get(owner(x, y, z));
    if (entry instanceof Float32Array) return entry[offset(x, y, z)];
    if (exact) return this.exact(x, y, z);
    if (entry === undefined && !this.defaultOutside) throw new Error("Unclassified brick");
    return (entry ?? 1) * this.limit;
  }
  footprint() {
    let payloads = 0;
    for (const v of this.entries.values()) if (v instanceof Float32Array) payloads++;
    return {
      payloads,
      signedEntries: this.entries.size - payloads,
      payloadBytes: payloads * PAGE_BYTES,
      directoryAllowanceBytes: this.entries.size * ENTRY_ALLOWANCE,
      duplicatedHaloBytes: 0,
    };
  }
}

/** Production-style clamped interpolation plus exterior distance. The grid
 * sampler gets identical traces for dense and sparse storage. */
export function sampler(read, lo, hi, step) {
  return (x, y, z) => {
    const gx = Math.max(lo[0], Math.min(hi[0], x));
    const gy = Math.max(lo[1], Math.min(hi[1], y));
    const gz = Math.max(lo[2], Math.min(hi[2], z));
    const ix = Math.min(hi[0] - 1, Math.floor(gx));
    const iy = Math.min(hi[1] - 1, Math.floor(gy));
    const iz = Math.min(hi[2] - 1, Math.floor(gz));
    const tx = gx - ix,
      ty = gy - iy,
      tz = gz - iz;
    let value = 0;
    for (let k = 0; k < 2; k++)
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++)
          value +=
            read(ix + i, iy + j, iz + k) *
            (i ? tx : 1 - tx) *
            (j ? ty : 1 - ty) *
            (k ? tz : 1 - tz);
    return (
      value + (x === gx && y === gy && z === gz ? 0 : Math.hypot(x - gx, y - gy, z - gz) * step)
    );
  };
}

export function capsule(a, b, radius) {
  const [ax, ay, az] = a,
    [dx, dy, dz] = b.map((v, i) => v - a[i]);
  const length = dx * dx + dy * dy + dz * dz;
  return {
    lo: a.map((v, i) => Math.min(v, b[i]) - radius),
    hi: a.map((v, i) => Math.max(v, b[i]) + radius),
    distance(x, y, z) {
      const px = x - ax,
        py = y - ay,
        pz = z - az;
      const t = length ? Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / length)) : 0;
      return Math.hypot(px - t * dx, py - t * dy, pz - t * dz) - radius;
    },
  };
}

export const FAR = 12;
export class AnalyticField {
  segments = [];
  bins = new Map();
  edits = new Map();
  append(segment) {
    if (this.segments.length >= 256) throw new Error("Research primitive budget");
    const keys = [
      ...bricksIn(
        segment.lo.map((n) => Math.floor(n - FAR - 2)),
        segment.hi.map((n) => Math.ceil(n + FAR + 2)),
      ),
    ];
    if (this.bins.size + keys.length > MAX_BRICKS) throw new Error("Research index budget");
    this.segments.push(segment);
    for (const key of keys) {
      const bin = this.bins.get(key);
      if (bin) bin.push(segment);
      else this.bins.set(key, [segment]);
    }
    return keys;
  }
  read(x, y, z, staged) {
    const key = owner(x, y, z);
    const data = staged?.has(key) ? staged.get(key) : this.edits.get(key);
    if (data) return data[offset(x, y, z)];
    let distance = FAR;
    const bin = this.bins.get(key);
    if (bin) for (const s of bin) distance = Math.min(distance, s.distance(x, y, z));
    return Math.fround(distance);
  }
  brute(x, y, z) {
    let distance = FAR;
    for (const s of this.segments) distance = Math.min(distance, s.distance(x, y, z));
    return Math.fround(distance);
  }
}

/** Fixed local swept dab, exact pointwise Add/Subtract and Jacobi Smooth
 * over canonical Float32 neighbors. A staged write is invisible until publish.
 * The caller owns patch retention. Synchronous research only. */
export function stageStroke(field, cache, a, b, mode, maxPages = 96, radius = 6) {
  if (!["add", "subtract", "smooth", "construct"].includes(mode))
    throw new Error("Research brush mode");
  if (!Number.isFinite(radius) || radius <= 0) throw new Error("Research brush radius");
  const shape = capsule(a, b, radius);
  const padding = mode === "construct" ? 2 : 0;
  const lo = shape.lo.map((n) => Math.floor(n - padding)),
    hi = shape.hi.map((n) => Math.ceil(n + padding));
  if (lo.some((n, i) => hi[i] - n > 32)) throw new Error("Research stroke extent");
  const affected = [
    ...bricksIn(
      lo.map((n) => n - 2),
      hi.map((n) => n + 2),
    ),
  ];
  const before = new Map(),
    after = new Map();
  let changed = 0,
    newEditPages = 0;
  const read = (x, y, z) => field.read(x, y, z);
  for (let z = lo[2]; z <= hi[2]; z++)
    for (let y = lo[1]; y <= hi[1]; y++)
      for (let x = lo[0]; x <= hi[0]; x++) {
        const d = shape.distance(x, y, z);
        if (d >= 0 && mode !== "construct") continue;
        const old = read(x, y, z);
        const weight = (1 - (1 + d / radius) ** 2) ** 2;
        let delta = mode === "add" ? -0.5 : 0.5;
        if (mode === "smooth") {
          const mean =
            (read(x - 1, y, z) +
              read(x + 1, y, z) +
              read(x, y - 1, z) +
              read(x, y + 1, z) +
              read(x, y, z - 1) +
              read(x, y, z + 1)) /
            6;
          delta = (mean - old) * 0.5;
        }
        const value = Math.fround(
          mode === "construct" ? Math.min(old, d) : Math.min(FAR, old + delta * weight),
        );
        if (Object.is(value, old)) continue;
        const key = owner(x, y, z);
        if (!after.has(key)) {
          if (after.size >= maxPages) throw new Error("Research stroke page budget");
          const previous = field.edits.get(key);
          if (!previous && field.edits.size + ++newEditPages > MAX_BRICKS)
            throw new Error("Research resident edit budget");
          before.set(key, previous);
          after.set(key, page(key, read));
        }
        after.get(key)[offset(x, y, z)] = value;
        changed++;
      }
  const withStage = (x, y, z) => field.read(x, y, z, after);
  const cacheAfter = affected.map((key) => [key, cache.entry(key, withStage)]);
  if (cache.entries.size + cacheAfter.length > MAX_BRICKS) throw new Error("Research cache budget");
  const cacheBefore = affected.map((key) => [key, cache.entries.get(key)]);
  return { before, after, cacheBefore, cacheAfter, affected, changed, lo, hi };
}

export function publishStroke(field, cache, patch, undo = false) {
  for (const [key, values] of undo ? patch.before : patch.after) {
    if (values) field.edits.set(key, values);
    else field.edits.delete(key);
  }
  for (const [key, entry] of undo ? patch.cacheBefore : patch.cacheAfter) cache.install(key, entry);
}
