import { type Bounds, LatticeVolume } from "./sdf";

const PAGE_SAMPLES = 8 ** 3;
const MAX_BRUSH_SAMPLES = 2 * 1024 ** 2;

/** Pages remain resident for the volume's lifetime so history replay needs no allocation. */
export class SparseSDFVolume extends LatticeVolume {
  protected override readonly yieldDuringBrushPublication = false;
  private scratch = new Float32Array(0);
  private readonly pages = new Map<number, Float32Array>();
  private readonly axisPages: number;
  private readonly exterior: number;
  constructor(
    resolution: number,
    extent = 1.6,
    private readonly maxPages = Math.ceil(resolution / 8) ** 3,
  ) {
    super(resolution, extent, false);
    this.axisPages = Math.ceil(resolution / 8);
    this.exterior = Math.fround(extent * 4);
    if (!Number.isSafeInteger(maxPages) || maxPages < 0 || maxPages > this.axisPages ** 3)
      throw new Error("Invalid sparse page budget.");
  }
  get allocatedPages(): number {
    return this.pages.size;
  }
  get residentBytes(): number {
    return this.pages.size * PAGE_SAMPLES * Float32Array.BYTES_PER_ELEMENT;
  }
  get scratchBytes(): number {
    return this.scratch.byteLength;
  }
  private key(x: number, y: number, z: number): number {
    return (x >> 3) + this.axisPages * ((y >> 3) + this.axisPages * (z >> 3));
  }
  private offset(x: number, y: number, z: number): number {
    return (x & 7) + 8 * ((y & 7) + 8 * (z & 7));
  }
  readSample(x: number, y: number, z: number): number {
    return this.pages.get(this.key(x, y, z))?.[this.offset(x, y, z)] ?? this.exterior;
  }
  readVoxel(index: number): number {
    const n = this.resolution;
    return this.readSample(index % n, Math.floor(index / n) % n, Math.floor(index / (n * n)));
  }
  writeVoxel(index: number, value: number): void {
    const n = this.resolution;
    this.writeSample(index % n, Math.floor(index / n) % n, Math.floor(index / (n * n)), value);
  }
  protected writeSample(x: number, y: number, z: number, value: number): void {
    const key = this.key(x, y, z),
      next = Math.fround(value);
    let page = this.pages.get(key);
    if (!page && next === this.exterior) return;
    if (!page) {
      this.allocatePages(new Set([key]));
      page = this.pages.get(key);
    }
    if (page) page[this.offset(x, y, z)] = next;
  }
  /** Copy only resident samples for a detached exact source. */
  captureSamples(): (x: number, y: number, z: number) => number {
    const snapshot = new SparseSDFVolume(this.resolution, this.extent, this.maxPages);
    for (const [key, page] of this.pages) snapshot.pages.set(key, page.slice());
    return snapshot.readSample.bind(snapshot);
  }
  getDenseView(): undefined {
    return undefined;
  }
  protected brushScratch(samples: number): Float32Array {
    if (samples > MAX_BRUSH_SAMPLES)
      throw new Error("Sparse brush footprint exceeds its scratch budget.");
    if (samples > this.scratch.length)
      this.scratch = new Float32Array(2 ** Math.ceil(Math.log2(samples)));
    return this.scratch;
  }
  protected reserveWrites(bounds: Bounds, values?: Float32Array): void {
    const keys = new Set<number>();
    const { min, max } = bounds;
    const width = max[0] - min[0] + 1,
      height = max[1] - min[1] + 1;
    for (let z = min[2]; z <= max[2]; z = (z | 7) + 1)
      for (let y = min[1]; y <= max[1]; y = (y | 7) + 1)
        for (let x = min[0]; x <= max[0]; x = (x | 7) + 1) {
          const key = this.key(x, y, z);
          if (this.pages.has(key)) continue;
          if (!values) {
            keys.add(key);
            continue;
          }
          page: for (let pz = z; pz <= Math.min(z | 7, max[2]); pz++)
            for (let py = y; py <= Math.min(y | 7, max[1]); py++)
              for (let px = x; px <= Math.min(x | 7, max[0]); px++)
                if (
                  values[px - min[0] + width * (py - min[1] + height * (pz - min[2]))] !==
                  this.exterior
                ) {
                  keys.add(key);
                  break page;
                }
        }
    this.allocatePages(keys);
  }
  private allocatePages(keys: Set<number>): void {
    if (this.pages.size + keys.size > this.maxPages)
      throw new Error("Sparse sculpt page budget reached.");
    const staged = Array.from(
      keys,
      (key) => [key, new Float32Array(PAGE_SAMPLES).fill(this.exterior)] as const,
    );
    for (const [key, page] of staged) this.pages.set(key, page);
  }
  /** Gather one page intersection at a time, keeping the output X-major. */
  gather(bounds: Bounds, target: Float32Array): void {
    const { min, max } = bounds;
    const width = max[0] - min[0] + 1,
      height = max[1] - min[1] + 1,
      plane = width * height;
    target.fill(this.exterior, 0, plane * (max[2] - min[2] + 1));
    for (let z = min[2]; z <= max[2]; z = (z | 7) + 1)
      for (let y = min[1]; y <= max[1]; y = (y | 7) + 1)
        for (let x = min[0]; x <= max[0]; x = (x | 7) + 1) {
          const page = this.pages.get(this.key(x, y, z));
          if (!page) continue;
          const endZ = Math.min(z | 7, max[2]),
            endY = Math.min(y | 7, max[1]),
            length = Math.min(x | 7, max[0]) - x + 1;
          for (let pz = z; pz <= endZ; pz++)
            for (let py = y; py <= endY; py++) {
              const from = this.offset(x, py, pz),
                to = x - min[0] + width * (py - min[1]) + plane * (pz - min[2]);
              for (let i = 0; i < length; i++) target[to + i] = page[from + i];
            }
        }
  }
}
