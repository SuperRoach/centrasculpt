/** Isolated directory and bounded halo experiments. */
import { SDFVolume } from "../../src/sdf";
import { BandCache, ENTRY_ALLOWANCE, PAGE_BYTES } from "./narrow-band.mjs";

// Canonical keys still use the original 9-bit axis encoding. Each outer
// entry owns a 4³ group of bricks, with an array indexed by low axis bits.
class PagedDirectory {
  groups = new Map();
  size = 0;

  address(key) {
    return ((key & 508) >> 2) | (((key >> 11) & 127) << 7) | (((key >> 20) & 127) << 14);
  }

  slot(key) {
    return (key & 3) | (((key >> 9) & 3) << 2) | (((key >> 18) & 3) << 4);
  }

  get(key) {
    return this.groups.get(this.address(key))?.entries[this.slot(key)];
  }

  has(key) {
    return this.get(key) !== undefined;
  }

  set(key, value) {
    const address = this.address(key);
    let group = this.groups.get(address);
    if (!group) {
      group = { keys: new Int32Array(64), entries: Array(64).fill(undefined), count: 0 };
      this.groups.set(address, group);
    }
    const slot = this.slot(key);
    if (group.entries[slot] === undefined) {
      group.count++;
      this.size++;
    }
    group.entries[slot] = value;
    group.keys[slot] = key;
  }

  delete(key) {
    const address = this.address(key);
    const group = this.groups.get(address);
    const slot = this.slot(key);
    if (group?.entries[slot] === undefined) return;
    group.entries[slot] = undefined;
    this.size--;
    if (--group.count === 0) this.groups.delete(address);
  }

  *entries() {
    for (const group of this.groups.values())
      for (let slot = 0; slot < 64; slot++)
        if (group.entries[slot] !== undefined) yield [group.keys[slot], group.entries[slot]];
  }

  *values() {
    for (const [, value] of this.entries()) yield value;
  }

  get directoryBytes() {
    // Int32 keys are measured. Reference slots and object metadata are modeled.
    return this.groups.size * (64 * (4 + 8) + ENTRY_ALLOWANCE);
  }
}

export class PerfCache extends BandCache {
  constructor(width, step, exact, defaultOutside, directory) {
    super(width, step, exact, defaultOutside);
    if (directory === "paged") this.entries = new PagedDirectory();
  }

  footprint() {
    const footprint = super.footprint();
    footprint.directoryAllowanceBytes =
      this.entries.directoryBytes ?? footprint.directoryAllowanceBytes;
    return footprint;
  }

  // Write runs from one brick at a time, including sign-only pages.
  gatherRow(x0, x1, y, z, target, offset) {
    const yzKey = ((y >> 3) + 256) * 512 + ((z >> 3) + 256) * 512 ** 2 + 256;
    const yzOffset = ((y & 7) << 3) + ((z & 7) << 6);
    for (let x = x0; x <= x1; ) {
      const start = x & 7;
      const count = Math.min(8 - start, x1 - x + 1);
      const entry = this.entries.get(yzKey + (x >> 3));
      if (entry instanceof Float32Array) {
        for (let i = 0; i < count; i++) target[offset + i] = entry[yzOffset + start + i];
      } else {
        if (entry === undefined && !this.defaultOutside) throw new Error("Unclassified brick");
        target.fill((entry ?? 1) * this.limit, offset, offset + count);
      }
      x += count;
      offset += count;
    }
  }
}

// Use the exact mesher and SDF normal arithmetic. Only storage indexing
// changes. At the last sample plane normalAt clamps exactly as on the full
// volume, including its fractional epsilon and one-sided differences.
export function createHalo(cache, lo, hi, maxCells, step = 1, extent = 0) {
  const values = new Float32Array((maxCells + 5) ** 3);
  const fullShape = hi.map((n, i) => n - lo[i] + 1);
  const fullCoordinate = (i, axis) => -extent + (i + lo[axis]) * step;
  const stats = { tiles: 0, gatherMs: 0, samples: 0 };
  function region(min, max) {
    const start = min.map((n, i) => Math.max(0, n - 2) + lo[i]);
    const end = max.map((n, i) => Math.min(fullShape[i] - 1, n + 2) + lo[i]);
    const [nx, ny] = end.map((n, i) => n - start[i] + 1);
    const count = nx * ny * (end[2] - start[2] + 1);
    if (count > values.length) throw new Error("Halo scratch limit");
    const t = performance.now();
    let offset = 0;
    for (let z = start[2]; z <= end[2]; z++)
      for (let y = start[1]; y <= end[1]; y++) {
        cache.gatherRow(start[0], end[0], y, z, values, offset);
        offset += nx;
      }
    stats.tiles++;
    stats.samples += count;
    stats.gatherMs += performance.now() - t;
    const origin = lo.map((n, i) => n - start[i]);
    const [ox, oy, oz] = origin;
    const index = (x, y, z) => x + ox + nx * (y + oy + ny * (z + oz));
    const normalVolume = { shape: fullShape, minimum: lo, step, extent };
    const sample = (x, y, z) => values[index(x, y, z)];
    return {
      step,
      dimensions: max.map((n, i) => n - min[i] + 1),
      getDenseView: () => values,
      index: (x, y, z) => index(x + min[0], y + min[1], z + min[2]),
      coordinate: (i, axis) => fullCoordinate(i + min[axis], axis),
      normalAt: (point) => SDFVolume.prototype.normalAt.call(normalVolume, point, sample),
    };
  }
  return { region, stats, scratchBytes: values.byteLength };
}

export function cacheBytes(cache) {
  const { payloadBytes, directoryAllowanceBytes } = cache.footprint();
  return payloadBytes + directoryAllowanceBytes;
}

export function patchBytes(patch) {
  const pages =
    patch.after.size + patch.cacheAfter.filter(([, value]) => value instanceof Float32Array).length;
  return pages * PAGE_BYTES + (2 * patch.after.size + 3 * patch.affected.length) * ENTRY_ALLOWANCE;
}
