import { newId } from "./layers";
import { openSculptProject, saveSculptProject } from "./project";
import { libraryName, type ProjectRecord } from "./project-library";
/** Called on validated native bytes. Only metadata is rewritten; binary asset offsets are payload-relative. */
export function renameNative(data: ArrayBuffer, name: string, duplicate = false): ArrayBuffer {
  const view = new DataView(data),
    length = view.getUint32(12, true),
    metadata = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 16, length)));
  metadata.name = libraryName(name);
  if (duplicate) {
    const ids = new Map<string, string>();
    const add = (id: string) => ids.set(id, newId());
    add(metadata.id);
    for (const l of metadata.layers) add(l.id);
    for (const g of metadata.hierarchy?.groups ?? []) add(g.id);
    for (const r of metadata.displayPreferences?.references ?? []) add(r.id);
    const remap = (v: unknown): unknown =>
      typeof v === "string"
        ? (ids.get(v) ?? v)
        : Array.isArray(v)
          ? v.map(remap)
          : v && typeof v === "object"
            ? Object.fromEntries(Object.entries(v).map(([k, x]) => [ids.get(k) ?? k, remap(x)]))
            : v;
    // Remap identifier fields without accidentally renaming user-facing names.
    metadata.id = ids.get(metadata.id);
    metadata.activeLayerId = ids.get(metadata.activeLayerId);
    for (const l of metadata.layers) {
      l.id = ids.get(l.id);
      for (const feature of l.assemblyPart?.enclosure?.features ?? [])
        feature.sourceIds = feature.sourceIds.map((id: string) => ids.get(id));
      if (l.array?.id) l.array.id = newId();
      for (const m of l.booleanModifiers ?? []) {
        m.id = newId();
        m.sourceId = ids.get(m.sourceId);
      }
      for (const point of l.procedural?.points ?? []) point.id = newId();
    }
    if (metadata.hierarchy) {
      const h = metadata.hierarchy;
      for (const n of [...h.layers, ...h.groups]) {
        n.id = ids.get(n.id);
        if (n.parentId) n.parentId = ids.get(n.parentId);
      }
      h.order = h.order.map((id: string) => ids.get(id));
      h.compositionOrder = h.compositionOrder.map((id: string) => ids.get(id));
    }
    if (metadata.displayPreferences?.colours)
      metadata.displayPreferences.colours = remap(metadata.displayPreferences.colours);
    for (const r of metadata.displayPreferences?.references ?? []) r.id = ids.get(r.id);
  }
  const text = new TextEncoder().encode(JSON.stringify(metadata));
  if (text.length > 65536) throw new Error("Project metadata limit exceeded.");
  const result = new Uint8Array(16 + text.length + data.byteLength - 16 - length);
  result.set(new Uint8Array(data, 0, 16));
  new DataView(result.buffer).setUint32(12, text.length, true);
  result.set(text, 16);
  result.set(new Uint8Array(data, 16 + length), 16 + text.length);
  return result.buffer;
}
export function describeNative(
  data: ArrayBuffer,
  name: string,
  sourceVersion = new DataView(data).getUint32(8, true),
): ProjectRecord {
  const v = new DataView(data),
    m = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 16, v.getUint32(12, true))));
  return {
    id: m.id,
    name: libraryName(name),
    modified: Date.now(),
    opened: 0,
    revision: 0,
    bytes: data.byteLength,
    version: v.getUint32(8, true),
    sourceVersion,
    resolutions: m.layers.map(
      (l: { grid: { initialResolution?: number; dimensions: number[] } }) =>
        l.grid.initialResolution ?? l.grid.dimensions[0],
    ),
    layers: m.layers.length,
  };
}
export function importNative(
  data: ArrayBuffer,
  name: string,
): { data: ArrayBuffer; record: ProjectRecord } {
  const source = new DataView(data).getUint32(8, true),
    project = openSculptProject(data);
  project.name = libraryName(name);
  const canonical = renameNative(
    saveSculptProject(project, project.displayPreferences),
    name,
    true,
  );
  return { data: canonical, record: describeNative(canonical, name, source) };
}
