/** Offline lossless snapshot. NOT a mutable VolumeStore or a narrow-band field. */

export class BrickVolume {
  constructor(source, brickSize = 8, maxBytes = 64 * 1024 ** 2) {
    if (![8, 16].includes(brickSize)) throw new Error("Unsupported brick size");
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > 64 * 1024 ** 2)
      throw new Error("Prototype byte cap");
    if (source.dimensions.reduce((a, b) => a * b, 1) > 2 * 192 ** 3)
      throw new Error("Prototype sample cap");
    this.resolution = source.resolution;
    this.extent = source.extent;
    this.step = source.step;
    this.shape = [...source.dimensions];
    this.minimum = [...source.latticeMin];
    this.brickSize = brickSize;
    this.bricks = new Map();
    this.typedBytes = 0;
    this.constantBricks = 0;
    this.surfaceCandidateBricks = 0;
    this.totalBricks = 0;
    const lo = this.minimum.map((v) => Math.floor(v / brickSize));
    const hi = this.minimum.map((v, a) => Math.floor((v + this.shape[a] - 1) / brickSize));
    // Global floor division is stable across negative growth and cropped snapshots.
    // One owner per lattice sample; interpolation/normal halos are neighboring reads,
    // never independently rounded duplicated boundary samples.
    for (let bz = lo[2]; bz <= hi[2]; bz++)
      for (let by = lo[1]; by <= hi[1]; by++)
        for (let bx = lo[0]; bx <= hi[0]; bx++) {
          this.totalBricks++;
          const key = `${bx},${by},${bz}`;
          let first,
            constant = true,
            near = false;
          const samples = [];
          for (let z = 0; z < brickSize; z++)
            for (let y = 0; y < brickSize; y++)
              for (let x = 0; x < brickSize; x++) {
                const p = [bx * brickSize + x, by * brickSize + y, bz * brickSize + z];
                if (p.some((v, a) => v < this.minimum[a] || v >= this.minimum[a] + this.shape[a]))
                  continue;
                const q = p.map((v, a) => v - this.minimum[a]);
                const value = source.readVoxel(source.index(...q));
                if (!Number.isFinite(value)) throw new Error("Nonfinite field");
                if (first === undefined) first = value;
                constant &&= Object.is(value, first);
                near ||= Math.abs(value) <= 4 * this.step;
                samples.push([x + brickSize * (y + brickSize * z), value]);
              }
          if (near) this.surfaceCandidateBricks++;
          if (constant) {
            this.bricks.set(key, first); // signed scalar, including negative and -0
            this.constantBricks++;
          } else {
            if (this.typedBytes + brickSize ** 3 * 4 > maxBytes)
              throw new Error("Prototype byte cap");
            const data = new Float32Array(brickSize ** 3);
            for (const [i, v] of samples) data[i] = v;
            this.typedBytes += data.byteLength;
            this.bricks.set(key, data);
          }
        }
    // Calculated conservative allowance, NOT a measurement of V8 Map metadata.
    this.metadataAllowanceBytes = this.bricks.size * 256;
    this.conversionScratchAllowanceBytes = brickSize ** 3 * 128;
  }
  get dimensions() {
    return [...this.shape];
  }
  get latticeMin() {
    return [...this.minimum];
  }
  get bounds() {
    return {
      min: this.shape.map((_, a) => this.coordinate(0, a)),
      max: this.shape.map((n, a) => this.coordinate(n - 1, a)),
    };
  }
  index(x, y, z) {
    return x + this.shape[0] * (y + this.shape[1] * z);
  }
  coordinate(i, a = 0) {
    return -this.extent + (i + this.minimum[a]) * this.step;
  }
  getDenseView() {
    return undefined;
  }
  readVoxel(i) {
    if (!Number.isSafeInteger(i) || i < 0 || i >= this.shape.reduce((a, b) => a * b, 1))
      throw new Error("Invalid index");
    const [nx, ny] = this.shape,
      b = this.brickSize;
    const x = (i % nx) + this.minimum[0],
      y = (Math.floor(i / nx) % ny) + this.minimum[1],
      z = Math.floor(i / (nx * ny)) + this.minimum[2];
    const bx = Math.floor(x / b),
      by = Math.floor(y / b),
      bz = Math.floor(z / b);
    const data = this.bricks.get(`${bx},${by},${bz}`);
    if (data === undefined) throw new Error("Missing region: no implicit positive default");
    if (typeof data === "number") return data;
    return data[x - bx * b + b * (y - by * b + b * (z - bz * b))];
  }

  sampleLocal(point) {
    if (![point.x, point.y, point.z].every(Number.isFinite))
      throw new Error("Sample coordinates must be finite.");
    const b = this.bounds,
      grid = [point.x, point.y, point.z].map((v, a) =>
        Math.max(0, Math.min(this.shape[a] - 1, (v + this.extent) / this.step - this.minimum[a])),
      );
    const base = grid.map((v, a) => Math.min(this.shape[a] - 2, Math.floor(v))),
      t = grid.map((v, i) => v - base[i]);
    let value = 0;
    for (let z = 0; z < 2; z++)
      for (let y = 0; y < 2; y++)
        for (let x = 0; x < 2; x++)
          value +=
            this.readVoxel(this.index(base[0] + x, base[1] + y, base[2] + z)) *
            (x ? t[0] : 1 - t[0]) *
            (y ? t[1] : 1 - t[1]) *
            (z ? t[2] : 1 - t[2]);
    return (
      value +
      Math.hypot(
        ...[point.x, point.y, point.z].map((v, a) => Math.max(0, b.min[a] - v, v - b.max[a])),
      )
    );
  }

  normalAt(point) {
    const [nx, ny, nz] = this.shape,
      gradient = [0, 0, 0];
    const grid = point.map((v, a) =>
      Math.max(
        0,
        Math.min(this.shape[a] - 1.000001, (v + this.extent) / this.step - this.minimum[a]),
      ),
    );
    const base = grid.map(Math.floor),
      fraction = grid.map((v, i) => v - base[i]);
    for (let dz = 0; dz <= 1; dz++)
      for (let dy = 0; dy <= 1; dy++)
        for (let dx = 0; dx <= 1; dx++) {
          const x = base[0] + dx,
            y = base[1] + dy,
            z = base[2] + dz;
          const weight =
            (dx ? fraction[0] : 1 - fraction[0]) *
            (dy ? fraction[1] : 1 - fraction[1]) *
            (dz ? fraction[2] : 1 - fraction[2]);
          const xm = Math.max(0, x - 1),
            xp = Math.min(nx - 1, x + 1);
          const ym = Math.max(0, y - 1),
            yp = Math.min(ny - 1, y + 1);
          const zm = Math.max(0, z - 1),
            zp = Math.min(nz - 1, z + 1);
          gradient[0] +=
            (weight *
              (this.readVoxel(this.index(xp, y, z)) - this.readVoxel(this.index(xm, y, z)))) /
            (xp - xm);
          gradient[1] +=
            (weight *
              (this.readVoxel(this.index(x, yp, z)) - this.readVoxel(this.index(x, ym, z)))) /
            (yp - ym);
          gradient[2] +=
            (weight *
              (this.readVoxel(this.index(x, y, zp)) - this.readVoxel(this.index(x, y, zm)))) /
            (zp - zm);
        }
    const length = Math.hypot(...gradient);
    return length > 1e-12 ? gradient.map((v) => v / length) : [0, 1, 0];
  }
}
