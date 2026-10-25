export function mergeBounds(a, b) {
    if (!a)
        return b;
    if (!b)
        return a;
    return { min: a.min.map((v, i) => Math.min(v, b.min[i])), max: a.max.map((v, i) => Math.max(v, b.max[i])) };
}
/** Negative values are inside. Samples on the fixed volume boundary stay positive. */
export class SDFVolume {
    resolution;
    extent;
    values;
    scratch;
    step;
    constructor(resolution = 64, extent = 1.6) {
        this.resolution = resolution;
        this.extent = extent;
        if (!Number.isInteger(resolution) || resolution < 3 || !Number.isFinite(extent) || extent <= 0.85)
            throw new Error('Invalid SDF volume dimensions');
        this.step = extent * 2 / (resolution - 1);
        this.values = new Float32Array(resolution ** 3);
        this.scratch = new Float32Array(this.values.length);
        this.reset();
    }
    index(x, y, z) {
        return x + this.resolution * (y + this.resolution * z);
    }
    coordinate(i) { return -this.extent + i * this.step; }
    reset(record) {
        const n = this.resolution;
        for (let z = 0; z < n; z++)
            for (let y = 0; y < n; y++)
                for (let x = 0; x < n; x++) {
                    const i = this.index(x, y, z);
                    const next = Math.fround(Math.hypot(this.coordinate(x), this.coordinate(y), this.coordinate(z)) - 0.85);
                    if (next !== this.values[i])
                        record?.(i, this.values[i], next);
                    this.values[i] = next;
                }
    }
    /** Trilinear interpolation of central-difference grid gradients; shared positions have shared normals. */
    normalAt(point) {
        const n = this.resolution, gradient = [0, 0, 0];
        const grid = point.map(v => Math.max(0, Math.min(n - 1.000001, (v + this.extent) / this.step)));
        const base = grid.map(Math.floor), fraction = grid.map((v, i) => v - base[i]);
        for (let dz = 0; dz <= 1; dz++)
            for (let dy = 0; dy <= 1; dy++)
                for (let dx = 0; dx <= 1; dx++) {
                    const x = base[0] + dx, y = base[1] + dy, z = base[2] + dz;
                    const weight = (dx ? fraction[0] : 1 - fraction[0]) * (dy ? fraction[1] : 1 - fraction[1]) * (dz ? fraction[2] : 1 - fraction[2]);
                    const xm = Math.max(0, x - 1), xp = Math.min(n - 1, x + 1);
                    const ym = Math.max(0, y - 1), yp = Math.min(n - 1, y + 1);
                    const zm = Math.max(0, z - 1), zp = Math.min(n - 1, z + 1);
                    gradient[0] += weight * (this.values[this.index(xp, y, z)] - this.values[this.index(xm, y, z)]) / (xp - xm);
                    gradient[1] += weight * (this.values[this.index(x, yp, z)] - this.values[this.index(x, ym, z)]) / (yp - ym);
                    gradient[2] += weight * (this.values[this.index(x, y, zp)] - this.values[this.index(x, y, zm)]) / (zp - zm);
                }
        const length = Math.hypot(...gradient);
        return length > 1e-12 ? gradient.map(v => v / length) : [0, 1, 0];
    }
    /** Compact C1 falloff. Smooth uses a Jacobi pass, never partially updated neighbors.
     * For Smooth, amount is an interpolation coefficient clamped to [0,1].
     * For Add/Subtract, amount is displacement in world units, clamped for stability.
     */
    brush(center, radius, mode, amount, record, hardness = 0) {
        if (![center.x, center.y, center.z, radius, amount, hardness].every(Number.isFinite) || radius <= 0 || amount <= 0)
            return null;
        amount = Math.min(amount, mode === 'smooth' ? 1 : this.step * 0.5);
        const n = this.resolution;
        const lo = (v) => Math.max(1, Math.floor((v - radius + this.extent) / this.step));
        const hi = (v) => Math.min(n - 2, Math.ceil((v + radius + this.extent) / this.step));
        const bounds = { min: [lo(center.x), lo(center.y), lo(center.z)], max: [hi(center.x), hi(center.y), hi(center.z)] };
        let changed = false;
        for (let z = bounds.min[2]; z <= bounds.max[2]; z++)
            for (let y = bounds.min[1]; y <= bounds.max[1]; y++)
                for (let x = bounds.min[0]; x <= bounds.max[0]; x++) {
                    const i = this.index(x, y, z);
                    const d = Math.hypot(this.coordinate(x) - center.x, this.coordinate(y) - center.y, this.coordinate(z) - center.z) / radius;
                    let next = this.values[i];
                    if (d < 1) {
                        // Smooth always retains its original gentle diffusion kernel.
                        const inner = mode === 'smooth' ? 0 : Math.max(0, Math.min(1, hardness)) * 0.9;
                        const t = Math.max(0, (d - inner) / (1 - inner));
                        const falloff = (1 - t * t) ** 2;
                        if (mode === 'smooth') {
                            const average = (this.values[i - 1] + this.values[i + 1] + this.values[i - n] + this.values[i + n] + this.values[i - n * n] + this.values[i + n * n]) / 6;
                            next += (average - next) * amount * falloff;
                        }
                        else
                            next += (mode === 'add' ? -1 : 1) * amount * falloff;
                    }
                    // Bounded fields remain finite even through prolonged repeated strokes.
                    this.scratch[i] = Math.max(-this.extent * 4, Math.min(this.extent * 4, next));
                    changed ||= this.scratch[i] !== this.values[i];
                }
        if (!changed)
            return null;
        for (let z = bounds.min[2]; z <= bounds.max[2]; z++)
            for (let y = bounds.min[1]; y <= bounds.max[1]; y++)
                for (let x = bounds.min[0]; x <= bounds.max[0]; x++) {
                    const i = this.index(x, y, z);
                    if (this.values[i] !== this.scratch[i])
                        record?.(i, this.values[i], this.scratch[i]);
                    this.values[i] = this.scratch[i];
                }
        return bounds;
    }
}
