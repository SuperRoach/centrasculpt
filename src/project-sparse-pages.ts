import { object } from "./project-format";
import {
  MAX_SDF_PAGES,
  SDF_PAGE_SAMPLES,
  type SparsePageSnapshot,
  type SparseSDFVolume,
  sparsePageCoordinates,
  sparsePageId,
} from "./sparse-sdf";
import type { Vec3 } from "./transform";

const ENCODING = "sdf-pages-f32-le-v1";
export const SDF_PAGE_WORDS = 3 + SDF_PAGE_SAMPLES;

export function sparseDescriptor(volume: SparseSDFVolume) {
  return {
    encoding: ENCODING,
    defaultValue: volume.defaultValue,
    pageCount: volume.allocatedPages,
  };
}

export function parseSparseDescriptor(value: unknown, extent: number) {
  const { encoding, defaultValue, pageCount } = object(value);
  if (
    encoding !== ENCODING ||
    defaultValue !== Math.fround(extent * 4) ||
    typeof pageCount !== "number" ||
    !Number.isInteger(pageCount) ||
    pageCount < 0 ||
    pageCount > MAX_SDF_PAGES
  )
    throw new Error("Invalid sparse SDF descriptor or page budget.");
  return { defaultValue, pageCount };
}

export function writeSparsePages(view: DataView, start: number, volume: SparseSDFVolume): void {
  const records = [...volume.residentPages()].sort((a, b) => a[0] - b[0]);
  for (const [id, values] of records) {
    for (const p of sparsePageCoordinates(id)) {
      view.setInt32(start, p, true);
      start += 4;
    }
    for (const v of values) {
      view.setFloat32(start, v, true);
      start += 4;
    }
  }
}

export function readSparsePages(
  view: DataView,
  start: number,
  { pageCount, defaultValue }: ReturnType<typeof parseSparseDescriptor>,
  origin: Vec3,
  dims: Vec3,
): SparsePageSnapshot {
  const pages = new Map<number, Float32Array>();
  let previous = -1;
  for (let i = 0; i < pageCount; i++) {
    const coordinate = [0, 4, 8].map((offset) => view.getInt32(start + offset, true)) as Vec3;
    const base = coordinate.map((p, a) => p * 8 - origin[a]);
    if (base.some((p, a) => p >= dims[a] || p + 7 < 0))
      throw new Error("Sparse SDF page is outside the declared lattice.");
    const id = sparsePageId(...coordinate);
    if (id <= previous) throw new Error("Duplicate or unordered sparse SDF page.");
    previous = id;
    start += 12;
    const page = new Float32Array(SDF_PAGE_SAMPLES);
    for (let j = 0; j < page.length; j++, start += 4) {
      const v = view.getFloat32(start, true);
      const p = [base[0] + (j & 7), base[1] + ((j >> 3) & 7), base[2] + (j >> 6)];
      if (!Number.isFinite(v) || Math.abs(v) > defaultValue)
        throw new Error("Sparse SDF page contains non-finite or out-of-range samples.");
      if (p.some((n, a) => n < 0 || n >= dims[a])) {
        if (v !== defaultValue) throw new Error("Sparse SDF page has non-default padding.");
      } else if (v <= 0 && p.some((n, a) => n === 0 || n === dims[a] - 1))
        throw new Error("The SDF volume boundary must remain positive.");
      page[j] = v;
    }
    pages.set(id, page);
  }
  return { defaultValue, pages };
}
