import { type BakePlan, bakeSources, sampleBake } from "./bake";
import { compositeLayout } from "./compositor";
import { LayerStack, newId, SculptProject, SdfLayer } from "./layers";
import { openSculptProject, PROJECT_VERSION, saveSculptProject } from "./project";
import { ProjectLibrary, type ProjectRecord } from "./project-library";
import { SDFVolume } from "./sdf";
import { copyTransform } from "./transform";
import { volumeSampleCount } from "./volume-store";
export type PersonalShapeRecord = ProjectRecord & {
  shapeVersion: 1;
  checksum: number;
  encoding: "native" | "gzip";
  masterBytes: number;
  created: number;
  dimensionsMM: [number, number, number];
  millimetresPerUnit: number;
  pivot: "centre" | "base";
};
export class PersonalShapeLibrary extends ProjectLibrary {
  constructor(
    factory: IDBFactory = globalThis.indexedDB,
    name = "centra-personal-shapes-v1",
    budget?: number,
  ) {
    super(factory, name, budget);
  }
  async shapes(): Promise<PersonalShapeRecord[]> {
    const records = await this.list();
    return records.map((r) => {
      const s = r as PersonalShapeRecord;
      if (
        s.shapeVersion !== 1 ||
        !["native", "gzip"].includes(s.encoding) ||
        !Number.isSafeInteger(s.checksum) ||
        !Number.isSafeInteger(s.masterBytes) ||
        s.masterBytes < 16 ||
        s.masterBytes > 128 * 1024 ** 2 ||
        !Number.isFinite(s.created) ||
        !Array.isArray(s.dimensionsMM) ||
        s.dimensionsMM.length !== 3 ||
        !s.dimensionsMM.every((v) => Number.isFinite(v) && v > 0) ||
        !Number.isFinite(s.millimetresPerUnit) ||
        s.millimetresPerUnit <= 0 ||
        !["centre", "base"].includes(s.pivot)
      )
        throw new Error("Personal shape metadata is damaged or unsupported. Saved data was kept.");
      return s;
    });
  }
  async master(id: string): Promise<{ record: PersonalShapeRecord; layer: SdfLayer }> {
    const record = (await this.shapes()).find((r) => r.id === id);
    if (!record) throw new Error("Personal shape no longer exists. Refresh the library.");
    const { data: stored } = await this.read(id);
    const data = await unpackPersonalShape(record, stored);
    const project = openSculptProject(data);
    if (project.layerStack.layers.length !== 1) throw new Error("Invalid personal shape master.");
    const layer = project.activeLayer;
    if (layer.booleanModifiers?.length || layer.array || layer.primitive || layer.procedural)
      throw new Error("Personal shape master must contain evaluated geometry.");
    layer.name = record.name;
    return { record, layer };
  }
}
/** Exact dense copy for a sculpt; evaluated Booleans are admitted only at source detail. */
export async function capturePersonalShape(
  project: SculptProject,
  id: string,
  signal: AbortSignal,
): Promise<SdfLayer> {
  const source = project.layerStack.get(id);
  if (
    source.operation !== "union" ||
    project.layerStack.layers.some((l) =>
      l.booleanModifiers?.some((m) => m.enabled && m.sourceId === id),
    )
  )
    throw new Error("Select the evaluated Boolean result/root rather than a raw cutter.");
  if (!source.visible) throw new Error("Show the selected sculpt before saving it.");
  if (signal.aborted) throw new Error("Save as Shape cancelled.");
  if (source.primitive && !source.booleanModifiers?.length && !source.array?.enabled)
    throw new Error(
      "This object is an analytic primitive. Bake it to an editable sculpt at your chosen quality before saving a shape, or keep its original .form construction. No cached low-detail substitute was saved.",
    );
  if (!source.booleanModifiers?.length && !source.array?.enabled) {
    const original = source.volume;
    if (volumeSampleCount(original) * 12 > 128 * 1024 ** 2)
      throw new Error(
        "Shape exceeds the 128 MiB staging limit. Save a .form backup or split the sculpt; detail was not reduced.",
      );
    const volume = new SDFVolume(original.resolution, original.extent, false, {
      dimensions: original.dimensions,
      latticeMin: original.latticeMin ?? [0, 0, 0],
    });
    for (let i = 0; i < volume.values.length; i++) {
      volume.values[i] = original.readVoxel(i);
      if (i % 65536 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (signal.aborted) throw new Error("Save as Shape cancelled.");
      }
    }
    return new SdfLayer(volume, { name: source.name, transform: copyTransform(source.transform) });
  }
  const sources = bakeSources(project, [id]),
    layout = compositeLayout(sources, 192);
  const scale = layout.extent / 1.6,
    resolution = layout.resolution;
  const step = (2 * layout.extent) / (resolution - 1);
  if (step > layout.desiredStep * 1.001)
    throw new Error(
      "Evaluating this shape exceeds the supported 192³ master at original detail. Save a .form backup or split the object. No lower-detail shape was saved.",
    );
  const plan: BakePlan = {
    resolution,
    center: layout.center,
    extent: layout.extent,
    scale,
    min: layout.center.map((v) => v - layout.extent) as [number, number, number],
    max: layout.center.map((v) => v + layout.extent) as [number, number, number],
    worldStep: step,
    sourceIds: sources.map((l) => l.id),
    requestedSourceIds: [id],
    gridBytes: resolution ** 3 * 8,
    projectGridBytes: 0,
    detailLimited: false,
  };
  const { volume } = await sampleBake(project, plan, signal);
  return new SdfLayer(volume, {
    name: source.name,
    transform: { position: [...layout.center], rotation: [0, 0, 0], scale: [scale, scale, scale] },
  });
}
export function encodePersonalShape(
  project: SculptProject,
  layer: SdfLayer,
  name: string,
  thumbnail: string,
  dimensionsMM: [number, number, number],
  millimetresPerUnit: number,
  pivot: "centre" | "base",
) {
  layer.name = name;
  const master = new SculptProject(new LayerStack([layer]), project.settings, name);
  const data = saveSculptProject(master),
    now = Date.now();
  const record: PersonalShapeRecord = {
    id: newId(),
    name,
    modified: now,
    opened: now,
    created: now,
    revision: 0,
    bytes: data.byteLength,
    version: PROJECT_VERSION,
    sourceVersion: PROJECT_VERSION,
    resolutions: [layer.volume.resolution],
    layers: 1,
    thumbnail,
    shapeVersion: 1,
    encoding: "native",
    masterBytes: data.byteLength,
    checksum: shapeChecksum(data),
    dimensionsMM,
    millimetresPerUnit,
    pivot,
  };
  return { record, data };
}

function shapeChecksum(data: ArrayBuffer): number {
  let hash = 2166136261;
  for (const byte of new Uint8Array(data)) hash = Math.imul(hash ^ byte, 16777619);
  return hash >>> 0;
}
export async function compressPersonalShape(record: PersonalShapeRecord, data: ArrayBuffer) {
  if (typeof CompressionStream === "undefined") return { record, data };
  const compressed = await new Response(
    new Blob([data]).stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer();
  return compressed.byteLength < data.byteLength
    ? {
        record: { ...record, encoding: "gzip" as const, bytes: compressed.byteLength },
        data: compressed,
      }
    : { record, data };
}
async function unpackPersonalShape(
  record: PersonalShapeRecord,
  stored: ArrayBuffer,
): Promise<ArrayBuffer> {
  let data = stored;
  if (record.encoding === "gzip") {
    if (typeof DecompressionStream === "undefined")
      throw new Error(
        "This browser cannot read compressed shape masters. Use a browser with gzip stream support; data was kept.",
      );
    const reader = new Blob([stored])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"))
      .getReader();
    const bytes = new Uint8Array(record.masterBytes);
    let offset = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (offset + value.length > bytes.length)
          throw new Error("Damaged shape exceeds declared memory limit.");
        bytes.set(value, offset);
        offset += value.length;
      }
      if (offset !== bytes.length) throw new Error("Shape master is truncated.");
    } finally {
      await reader.cancel();
    }
    data = bytes.buffer;
  }
  if (data.byteLength !== record.masterBytes || shapeChecksum(data) !== record.checksum)
    throw new Error(
      "Shape master integrity check failed. Saved data and current project were kept.",
    );
  return data;
}
