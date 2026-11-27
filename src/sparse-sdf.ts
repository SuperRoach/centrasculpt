import { type Bounds, type DenseLatticeLayout, LatticeVolume } from "./sdf";
import type { Vec3 } from "./transform";

export const SDF_PAGE_SAMPLES = 8 ** 3;
export const SDF_PAGE_MEMORY = SDF_PAGE_SAMPLES * 4 + 96;
export const MAX_SDF_PAGES = 192 ** 3 / SDF_PAGE_SAMPLES;
export const MAX_SPARSE_AXIS = 1153;
export const MAX_SPARSE_CHUNKS = 32768;
const KEY_BASE = 4096;
const KEY_BIAS = KEY_BASE / 2;
export type SparsePageSnapshot = { defaultValue: number; pages: Map<number, Float32Array> };

export function sparsePageId(x: number, y: number, z: number): number {
  return x + KEY_BIAS + KEY_BASE * (y + KEY_BIAS + KEY_BASE * (z + KEY_BIAS));
}
export function sparsePageCoordinates(id: number): Vec3 {
  return [
    (id % KEY_BASE) - KEY_BIAS,
    (Math.floor(id / KEY_BASE) % KEY_BASE) - KEY_BIAS,
    Math.floor(id / KEY_BASE ** 2) - KEY_BIAS,
  ];
}
export function sparseChunkCount({ dimensions, latticeMin }: DenseLatticeLayout): number {
  return dimensions.reduce(
    (count, n, a) =>
      count * (Math.ceil((latticeMin[a] + n - 1) / 16) - Math.floor(latticeMin[a] / 16)),
    1,
  );
}
const MAX_BRUSH_SAMPLES = 2 * 1024 ** 2;

/** Pages remain resident for the volume's lifetime so history replay needs no allocation. */
export class SparseSDFVolume extends LatticeVolume {
  protected override readonly yieldDuringBrushPublication = false;
  // A negative-axis growth shifts local indices but must not round old gradient fractions differently.
  protected override readonly normalsUseAbsoluteLattice = true;
  admitAllocation?: (bytes: number) => void;
  private scratch = new Float32Array(0);
  private readonly pages = new Map<number, Float32Array>();
  private pageRevision = 0;
  private readonly dirtyPages = new Set<number>();
  private writeRevision = 0;
  private growthSource?: { volume: SparseSDFVolume; revision: number };
  private readonly origin: Vec3;
  private readonly sparseShape: Vec3;
  readonly defaultValue: number;
  constructor(
    resolution: number,
    extent = 1.6,
    private readonly maxPages = MAX_SDF_PAGES,
    layout?: DenseLatticeLayout,
    snapshot?: SparsePageSnapshot,
  ) {
    if (
      layout &&
      (!layout.latticeMin.every((n) => n >= -MAX_SPARSE_AXIS) ||
        sparseChunkCount(layout) > MAX_SPARSE_CHUNKS)
    )
      throw new Error("Sparse lattice exceeds the logical chunk budget.");
    super(resolution, extent, false, layout, false, {
      axis: MAX_SPARSE_AXIS,
      samples: MAX_SPARSE_AXIS ** 3,
    });
    this.origin = this.latticeMin;
    this.sparseShape = this.dimensions;
    this.defaultValue = snapshot?.defaultValue ?? Math.fround(extent * 4);
    if (
      !Number.isSafeInteger(maxPages) ||
      maxPages < 0 ||
      maxPages > MAX_SDF_PAGES ||
      (snapshot && snapshot.pages.size > maxPages)
    )
      throw new Error("Invalid sparse page budget.");
    if (
      !Number.isFinite(this.defaultValue) ||
      this.defaultValue <= 0 ||
      this.defaultValue !== Math.fround(extent * 4)
    )
      throw new Error("Invalid sparse default field value.");
    if (snapshot) for (const [id, page] of snapshot.pages) this.pages.set(id, page);
  }
  /** Borrowed resident pages. Callers transfer ownership only from detached worker volumes. */
  *residentPages(): IterableIterator<[number, Float32Array]> {
    yield* this.pages;
  }
  pageState(id: number): "implicit" | "resident-clean" | "resident-dirty" {
    if (!this.pages.has(id)) return "implicit";
    return this.dirtyPages.has(id) ? "resident-dirty" : "resident-clean";
  }
  /** All allocated pages are pinned for this resident-only implementation. */
  isPagePinned(id: number): boolean {
    return this.pages.has(id);
  }
  get pageMemoryBytes(): number {
    return this.pages.size * SDF_PAGE_MEMORY;
  }
  pageBounds(id: number): Bounds {
    const start = sparsePageCoordinates(id).map((p, a) => p * 8 - this.origin[a]);
    return {
      min: start.map((p) => Math.max(0, p)) as Vec3,
      max: start.map((p, a) => Math.min(p + 7, this.sparseShape[a] - 1)) as Vec3,
    };
  }
  /** Candidate cell blocks. Each intersecting cell belongs to exactly one block. */
  *surfaceBlocks(block: number): Generator<Vec3> {
    const seen = new Set<number>();
    for (const [id, page] of this.pages) {
      if (!page.some((v) => v < 0)) continue;
      const { min, max } = this.pageBounds(id);
      const lo = min.map((p, a) => Math.floor((Math.max(0, p - 1) + this.origin[a]) / block));
      const hi = max.map((p, a) =>
        Math.floor((Math.min(this.sparseShape[a] - 2, p) + this.origin[a]) / block),
      );
      for (let z = lo[2]; z <= hi[2]; z++)
        for (let y = lo[1]; y <= hi[1]; y++)
          for (let x = lo[0]; x <= hi[0]; x++) {
            const key = sparsePageId(x, y, z);
            if (seen.has(key)) continue;
            seen.add(key);
            yield [x, y, z];
          }
    }
  }
  /** Only an implicit-valued boundary can be extended with implicit samples. */
  assertGrowthBoundary(layout: DenseLatticeLayout): void {
    const low = this.origin.map((v, a) => layout.latticeMin[a] < v);
    const high = this.origin.map(
      (v, a) => layout.latticeMin[a] + layout.dimensions[a] > v + this.sparseShape[a],
    );
    for (const [id, page] of this.pages) {
      const start = sparsePageCoordinates(id).map((p, a) => p * 8 - this.origin[a]);
      if (
        !start.some(
          (p, a) =>
            (low[a] && p <= 0 && p + 7 >= 0) ||
            (high[a] && p <= this.sparseShape[a] - 1 && p + 7 >= this.sparseShape[a] - 1),
        )
      )
        continue;
      for (let i = 0; i < page.length; i++) {
        if (page[i] === this.defaultValue) continue;
        const p = [start[0] + (i & 7), start[1] + ((i >> 3) & 7), start[2] + (i >> 6)];
        if (p.some((n, a) => (low[a] && n === 0) || (high[a] && n === this.sparseShape[a] - 1)))
          throw new Error(
            "Sparse growth requires the expanding boundary to retain its default distance.",
          );
      }
    }
  }
  /** New capacity uses the exact implicit value. Absolute page addresses never move. */
  copyForGrowth(layout: DenseLatticeLayout): SparseSDFVolume {
    const next = new SparseSDFVolume(this.resolution, this.extent, this.maxPages, layout, {
      defaultValue: this.defaultValue,
      pages: new Map([...this.pages].map(([id, values]) => [id, values.slice()])),
    });
    for (const id of this.dirtyPages) next.dirtyPages.add(id);
    next.growthSource = { volume: this, revision: this.writeRevision };
    return next;
  }
  assertGrowthFrom(source: SparseSDFVolume): Vec3 {
    if (source === this) return [0, 0, 0];
    const offset = source.origin.map((v, a) => v - this.origin[a]) as Vec3;
    if (
      this.growthSource?.volume !== source ||
      this.growthSource.revision !== source.writeRevision ||
      this.writeRevision !== 0 ||
      !offset.every((v, a) => v >= 0 && v + source.sparseShape[a] <= this.sparseShape[a])
    )
      throw new Error("Sparse growth copy is stale or would crop the original lattice.");
    return offset;
  }
  /** Break the staged source reference once the runtime has published the replacement. */
  finishGrowth(): void {
    this.growthSource = undefined;
  }
  get allocatedPages(): number {
    return this.pages.size;
  }
  get residentBytes(): number {
    return this.pages.size * SDF_PAGE_SAMPLES * Float32Array.BYTES_PER_ELEMENT;
  }
  get scratchBytes(): number {
    return this.scratch.byteLength;
  }
  hasNonPositiveSample(): boolean {
    for (const page of this.pages.values()) if (page.some((value) => value <= 0)) return true;
    return false;
  }
  hasInterior(): boolean {
    for (const page of this.pages.values()) if (page.some((value) => value < 0)) return true;
    return false;
  }
  private key(x: number, y: number, z: number): number {
    return sparsePageId(
      (x + this.origin[0]) >> 3,
      (y + this.origin[1]) >> 3,
      (z + this.origin[2]) >> 3,
    );
  }
  private offset(x: number, y: number, z: number): number {
    return (
      ((x + this.origin[0]) & 7) + 8 * (((y + this.origin[1]) & 7) + 8 * ((z + this.origin[2]) & 7))
    );
  }
  readSample(x: number, y: number, z: number): number {
    return this.pages.get(this.key(x, y, z))?.[this.offset(x, y, z)] ?? this.defaultValue;
  }
  /** Interpolation usually visits several samples in the same page. An empty
   * cached page must be looked up again if an edit made new pages resident. */
  prepareSampleReader(): (x: number, y: number, z: number) => number {
    let key = -1,
      page: Float32Array | undefined,
      revision = this.pageRevision;
    return (x, y, z) => {
      const next = this.key(x, y, z);
      if (key !== next || revision !== this.pageRevision) {
        key = next;
        revision = this.pageRevision;
        page = this.pages.get(key);
      }
      return page?.[this.offset(x, y, z)] ?? this.defaultValue;
    };
  }
  readVoxel(index: number): number {
    const [nx, ny] = this.sparseShape;
    return this.readSample(index % nx, Math.floor(index / nx) % ny, Math.floor(index / (nx * ny)));
  }
  writeVoxel(index: number, value: number): void {
    const [nx, ny] = this.sparseShape;
    this.writeSample(index % nx, Math.floor(index / nx) % ny, Math.floor(index / (nx * ny)), value);
  }
  protected writeSample(x: number, y: number, z: number, value: number): void {
    const key = this.key(x, y, z),
      next = Math.fround(value);
    let page = this.pages.get(key);
    if (!page && next === this.defaultValue) return;
    if (!page) {
      this.allocatePages(new Set([key]));
      page = this.pages.get(key);
    }
    const offset = this.offset(x, y, z);
    if (page && !Object.is(page[offset], next)) {
      page[offset] = next;
      this.dirtyPages.add(key);
      this.writeRevision++;
    }
  }
  /** Copy only resident samples for a detached exact source. */
  captureSamples(): (x: number, y: number, z: number) => number {
    const snapshot = this.copyForGrowth({ dimensions: this.sparseShape, latticeMin: this.origin });
    snapshot.finishGrowth();
    return snapshot.prepareSampleReader();
  }
  /** Reserve only pages that receive changed Float32 samples. Keep them detached
   * until history admission succeeds, so refusal/cancellation leaves residency intact. */
  *preparePatchPages(
    indices: Uint32Array,
    maxBytes = Infinity,
  ): Generator<void, (() => void) | undefined> {
    const [nx, ny] = this.sparseShape,
      keys = new Set<number>();
    for (let i = 0; i < indices.length; i++) {
      if (i && i % 8192 === 0) yield;
      const index = indices[i],
        key = this.key(index % nx, Math.floor(index / nx) % ny, Math.floor(index / (nx * ny)));
      if (!this.pages.has(key)) keys.add(key);
    }
    if (this.pages.size + keys.size > this.maxPages)
      throw new Error("Sparse sculpt page budget reached.");
    if (!keys.size) return;
    if (keys.size * SDF_PAGE_MEMORY > maxBytes)
      throw new Error("Sparse sculpt page staging exceeds the memory budget.");
    this.admitAllocation?.(keys.size * SDF_PAGE_MEMORY);
    const staged = new Map<number, Float32Array>();
    for (const key of keys) {
      if (staged.size && staged.size % 128 === 0) yield;
      staged.set(key, new Float32Array(SDF_PAGE_SAMPLES).fill(this.defaultValue));
    }
    return () => {
      for (const [key, page] of staged) {
        this.pages.set(key, page);
        this.dirtyPages.add(key);
      }
      this.pageRevision++;
    };
  }
  getDenseView(): undefined {
    return undefined;
  }
  protected brushScratch(samples: number): Float32Array {
    if (samples > MAX_BRUSH_SAMPLES)
      throw new Error("Sparse brush footprint exceeds its scratch budget.");
    if (samples > this.scratch.length) {
      const allocation = 2 ** Math.ceil(Math.log2(samples));
      this.admitAllocation?.(allocation * 4);
      this.scratch = new Float32Array(allocation);
    }
    return this.scratch;
  }
  private pageEnd(sample: number, axis: number): number {
    const origin = this.origin[axis];
    return ((sample + origin) | 7) - origin;
  }
  protected reserveWrites(bounds: Bounds, values?: Float32Array): void {
    const keys = new Set<number>();
    const { min, max } = bounds;
    const width = max[0] - min[0] + 1,
      height = max[1] - min[1] + 1;
    for (let z = min[2]; z <= max[2]; z = this.pageEnd(z, 2) + 1)
      for (let y = min[1]; y <= max[1]; y = this.pageEnd(y, 1) + 1)
        for (let x = min[0]; x <= max[0]; x = this.pageEnd(x, 0) + 1) {
          const key = this.key(x, y, z);
          if (this.pages.has(key)) continue;
          if (!values) {
            keys.add(key);
            continue;
          }
          page: for (let pz = z; pz <= Math.min(this.pageEnd(z, 2), max[2]); pz++)
            for (let py = y; py <= Math.min(this.pageEnd(y, 1), max[1]); py++)
              for (let px = x; px <= Math.min(this.pageEnd(x, 0), max[0]); px++)
                if (
                  values[px - min[0] + width * (py - min[1] + height * (pz - min[2]))] !==
                  this.defaultValue
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
    if (keys.size) this.admitAllocation?.(keys.size * SDF_PAGE_MEMORY);
    const staged = Array.from(
      keys,
      (key) => [key, new Float32Array(SDF_PAGE_SAMPLES).fill(this.defaultValue)] as const,
    );
    for (const [key, page] of staged) {
      this.pages.set(key, page);
      this.dirtyPages.add(key);
    }
    if (staged.length) this.pageRevision++;
  }
  /** Gather one page intersection at a time, keeping the output X-major. */
  gather(bounds: Bounds, target: Float32Array): void {
    const { min, max } = bounds;
    const width = max[0] - min[0] + 1,
      height = max[1] - min[1] + 1,
      plane = width * height;
    target.fill(this.defaultValue, 0, plane * (max[2] - min[2] + 1));
    for (let z = min[2]; z <= max[2]; z = this.pageEnd(z, 2) + 1)
      for (let y = min[1]; y <= max[1]; y = this.pageEnd(y, 1) + 1)
        for (let x = min[0]; x <= max[0]; x = this.pageEnd(x, 0) + 1) {
          const page = this.pages.get(this.key(x, y, z));
          if (!page) continue;
          const endZ = Math.min(this.pageEnd(z, 2), max[2]),
            endY = Math.min(this.pageEnd(y, 1), max[1]),
            length = Math.min(this.pageEnd(x, 0), max[0]) - x + 1;
          for (let pz = z; pz <= endZ; pz++)
            for (let py = y; py <= endY; py++) {
              const from = this.offset(x, py, pz),
                to = x - min[0] + width * (py - min[1]) + plane * (pz - min[2]);
              for (let i = 0; i < length; i++) target[to + i] = page[from + i];
            }
        }
  }
}
