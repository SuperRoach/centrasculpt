import { newId } from "./layers";
import {
  type PersonalShapeLibrary,
  type PersonalShapeRecord,
  unpackPersonalShape,
} from "./personal-shapes";
import { openSculptProject } from "./project";
import { LIBRARY_COUNT, libraryName } from "./project-library";

// Binary envelope: magic, manifest byte length, SHA-256(manifest), UTF-8 manifest, exact payloads.
export const BACKUP_LIMIT = 64 * 1024 ** 2;
const MAGIC = "CSHAPE01",
  HEADER = 44,
  MANIFEST_LIMIT = 4 * 1024 ** 2;
type Entry = { record: PersonalShapeRecord; hash: string; fingerprint: string };
type Manifest = { format: "centra-shapes"; version: 1; entries: Entry[] };
export type ShapeBackupPreview = {
  entries: { record: PersonalShapeRecord; data: ArrayBuffer }[];
  bytes: number;
};
function cancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("Library backup operation cancelled. Existing shapes kept.");
}
async function hash(data: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
function metadata(r: PersonalShapeRecord) {
  if (
    !r ||
    typeof r.id !== "string" ||
    !r.id ||
    r.id.length > 128 ||
    libraryName(r.name) !== r.name ||
    r.shapeVersion !== 1 ||
    !["native", "gzip"].includes(r.encoding) ||
    !Number.isSafeInteger(r.bytes) ||
    r.bytes < 16 ||
    r.bytes > BACKUP_LIMIT ||
    !Number.isSafeInteger(r.masterBytes) ||
    r.masterBytes < 16 ||
    r.masterBytes * 6 > 192 * 1024 ** 2 ||
    !Number.isSafeInteger(r.checksum) ||
    r.checksum < 0 ||
    r.checksum > 0xffffffff ||
    ![r.created, r.modified, r.opened].every((v) => Number.isFinite(v) && v >= 0) ||
    !Array.isArray(r.dimensionsMM) ||
    r.dimensionsMM.length !== 3 ||
    !r.dimensionsMM.every((v) => Number.isFinite(v) && v > 0) ||
    !Number.isFinite(r.millimetresPerUnit) ||
    r.millimetresPerUnit <= 0 ||
    !["centre", "base"].includes(r.pivot) ||
    !r.thumbnail ||
    r.thumbnail.length > 32768 ||
    !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(r.thumbnail)
  )
    throw new Error("Invalid or oversized shape metadata/master/thumbnail.");
}
async function thumbnail(data: string) {
  const blob = await (await fetch(data)).blob();
  const bytes = new Uint8Array(await blob.arrayBuffer()),
    view = new DataView(bytes.buffer);
  let width = 0,
    height = 0;
  const ascii = (a: number, b: number) => new TextDecoder().decode(bytes.subarray(a, b));
  if (bytes.length >= 24 && ascii(1, 4) === "PNG" && ascii(12, 16) === "IHDR") {
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (bytes.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    const kind = ascii(12, 16);
    if (kind === "VP8X") {
      if (bytes[20] & 2) throw new Error("Animated thumbnails are unsupported.");
      width = 1 + bytes[24] + bytes[25] * 256 + bytes[26] * 65536;
      height = 1 + bytes[27] + bytes[28] * 256 + bytes[29] * 65536;
    } else if (kind === "VP8 ") {
      width = view.getUint16(26, true) & 0x3fff;
      height = view.getUint16(28, true) & 0x3fff;
    } else if (kind === "VP8L" && bytes[20] === 0x2f) {
      const bits = view.getUint32(21, true);
      width = 1 + (bits & 0x3fff);
      height = 1 + ((bits >>> 14) & 0x3fff);
    }
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let offset = 2; offset + 9 < bytes.length; ) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1],
        length = view.getUint16(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        height = view.getUint16(offset + 5);
        width = view.getUint16(offset + 7);
        break;
      }
      offset += 2 + length;
    }
  }
  if (width < 1 || height < 1 || width > 256 || height > 256)
    throw new Error("Invalid or oversized thumbnail header.");
  const image = await createImageBitmap(blob);
  try {
    if (image.width < 1 || image.height < 1 || image.width > 256 || image.height > 256)
      throw new Error("Invalid thumbnail dimensions.");
  } finally {
    image.close();
  }
}
async function validate(r: PersonalShapeRecord, data: ArrayBuffer) {
  metadata(r);
  if (data.byteLength !== r.bytes) throw new Error("Shape payload length mismatch.");
  await thumbnail(r.thumbnail ?? "");
  const master = await unpackPersonalShape(r, data),
    project = openSculptProject(master),
    layer = project.activeLayer;
  if (
    project.layerStack.layers.length !== 1 ||
    layer.booleanModifiers?.length ||
    layer.array ||
    layer.primitive ||
    layer.procedural
  )
    throw new Error("Invalid evaluated SDF master.");
  return hash(
    new TextEncoder().encode(
      JSON.stringify([
        await hash(master),
        r.name,
        r.dimensionsMM,
        r.millimetresPerUnit,
        r.pivot,
        r.thumbnail,
      ]),
    ).buffer,
  );
}
export async function exportShapeBackup(
  library: PersonalShapeLibrary,
  signal?: AbortSignal,
): Promise<Blob & { shapeCount: number }> {
  const snapshot = await library.backupSnapshot();
  const entries: Entry[] = [],
    payloads: ArrayBuffer[] = [];
  let total = HEADER;
  for (const { record, data } of snapshot) {
    cancelled(signal);
    total += data.byteLength;
    if (total > BACKUP_LIMIT)
      throw new Error(
        "Library exceeds the 64 MiB portable backup memory limit. No shapes changed.",
      );
    entries.push({ record, hash: await hash(data), fingerprint: await validate(record, data) });
    payloads.push(data);
  }
  const manifest = new TextEncoder().encode(
    JSON.stringify({ format: "centra-shapes", version: 1, entries } satisfies Manifest),
  );
  if (manifest.length > MANIFEST_LIMIT || total + manifest.length > BACKUP_LIMIT)
    throw new Error("Backup exceeds memory limit.");
  const header = new Uint8Array(HEADER);
  header.set(new TextEncoder().encode(MAGIC));
  new DataView(header.buffer).setUint32(8, manifest.length, true);
  header.set(new Uint8Array(await crypto.subtle.digest("SHA-256", manifest)), 12);
  cancelled(signal);
  return Object.assign(
    new Blob([header, manifest, ...payloads], { type: "application/octet-stream" }),
    { shapeCount: snapshot.length },
  );
}
export async function previewShapeBackup(
  file: Blob,
  signal?: AbortSignal,
): Promise<ShapeBackupPreview> {
  cancelled(signal);
  if (file.size < HEADER || file.size > BACKUP_LIMIT)
    throw new Error("Backup is truncated or exceeds the 64 MiB limit.");
  const header = await file.slice(0, HEADER).arrayBuffer(),
    h = new Uint8Array(header),
    length = new DataView(header).getUint32(8, true);
  if (new TextDecoder().decode(h.subarray(0, 8)) !== MAGIC)
    throw new Error("Unsupported backup format/version.");
  if (length > MANIFEST_LIMIT || HEADER + length > file.size)
    throw new Error("Invalid backup manifest length.");
  const raw = await file.slice(HEADER, HEADER + length).arrayBuffer();
  if (
    (await hash(raw)) !== [...h.subarray(12)].map((v) => v.toString(16).padStart(2, "0")).join("")
  )
    throw new Error("Backup manifest integrity check failed.");
  const manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)) as Manifest;
  if (
    manifest.format !== "centra-shapes" ||
    manifest.version !== 1 ||
    !Array.isArray(manifest.entries) ||
    manifest.entries.length > LIBRARY_COUNT
  )
    throw new Error("Unsupported backup version or shape count.");
  let offset = HEADER + length;
  const ids = new Set<string>(),
    entries: ShapeBackupPreview["entries"] = [];
  for (const e of manifest.entries) {
    cancelled(signal);
    metadata(e.record);
    if (file.size + e.record.masterBytes * 6 > 224 * 1024 ** 2)
      throw new Error("Backup and master exceed the combined validation memory limit.");
    if (ids.has(e.record.id) || offset + e.record.bytes > file.size)
      throw new Error("Duplicate identifier or truncated payload.");
    ids.add(e.record.id);
    const data = await file.slice(offset, offset + e.record.bytes).arrayBuffer();
    offset += e.record.bytes;
    if ((await hash(data)) !== e.hash || (await validate(e.record, data)) !== e.fingerprint)
      throw new Error("Shape integrity check failed.");
    entries.push({
      record: { ...e.record, backupFingerprint: e.fingerprint } as PersonalShapeRecord,
      data,
    });
  }
  if (offset !== file.size) throw new Error("Unexpected trailing backup data.");
  cancelled(signal);
  return { entries, bytes: file.size };
}
export function shapeMerge(existing: PersonalShapeRecord[], preview: ShapeBackupPreview) {
  const ids = new Set(existing.map((r) => r.id)),
    fingerprints = new Set(existing.map((r) => r.backupFingerprint).filter(Boolean));
  let duplicates = 0,
    conflicts = 0;
  const additions: ShapeBackupPreview["entries"] = [];
  for (const entry of preview.entries) {
    const r = entry.record;
    if (fingerprints.has(r.backupFingerprint)) {
      duplicates++;
      continue;
    }
    const conflict = ids.has(r.id);
    if (conflict) conflicts++;
    const record = { ...r, id: conflict ? newId() : r.id, revision: 1 };
    ids.add(record.id);
    fingerprints.add(r.backupFingerprint);
    additions.push({ record, data: entry.data });
  }
  return { additions, duplicates, conflicts };
}
