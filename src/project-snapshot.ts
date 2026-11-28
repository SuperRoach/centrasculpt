import type { ProjectDisplayPreferences } from "./display-preferences";
import type { IndependentLayers } from "./independent-layers";
import type { HierarchyState } from "./layer-hierarchy";
import { type LayerMetadata, SculptProject } from "./layers";
import { type ProjectSettings, saveSculptProject } from "./project";
import { MAX_NATIVE_DECODE_BYTES } from "./project-format";
import { type MaskSnapshot, sculptMask } from "./sculpt-mask";
import { type PaintSnapshot, sculptPaint } from "./sculpt-paint";
import { type SparsePageSnapshot, SparseSDFVolume } from "./sparse-sdf";
import type { ToolPreferences } from "./tool-preferences";
import { volumeSampleCount } from "./volume-store";
export type ProjectSnapshot = {
  hierarchy?: HierarchyState;
  id: string;
  name: string;
  activeLayerId: string;
  settings: ProjectSettings;
  displayPreferences?: ProjectDisplayPreferences;
  toolPreferences?: ToolPreferences;
  layers: {
    metadata: LayerMetadata;
    resolution: number;
    extent: number;
    dimensions: [number, number, number];
    latticeMin: [number, number, number];
    values?: Float32Array;
    sparse?: SparsePageSnapshot;
    paint?: PaintSnapshot;
    mask?: MaskSnapshot;
  }[];
};
export type EncodedSnapshot = {
  data: ArrayBuffer;
  checksum: number;
  milliseconds: number;
  copyMs: number;
  temporaryBytes: number;
};
export class RecoveryMemoryError extends Error {}

/** Encode a completed edit directly when the worker snapshot would exceed its budget. */
export function encodeManualProject(
  layers: IndependentLayers,
  settings: ProjectSettings,
  display: ProjectDisplayPreferences | undefined,
  tools: ToolPreferences | undefined,
): ArrayBuffer {
  if (!layers.recoveryReady) throw new Error("Finish the current edit before saving.");
  const { layerStack, name, id } = layers.project;
  const project = new SculptProject(layerStack, settings, name, id);
  project.toolPreferences = tools;
  const sparse = layerStack.layers.some(({ volume }) => volume instanceof SparseSDFVolume);
  const available = sparse
    ? MAX_NATIVE_DECODE_BYTES - layers.trackedBytes - layers.composite.trackedBytes
    : undefined;
  return saveSculptProject(project, display, available);
}

/** Native codec adapter with independent immutable values; no GPU/undo/preview state. */
export async function captureProject(
  layers: IndependentLayers,
  settings: ProjectSettings,
  display: ProjectDisplayPreferences | undefined,
  tools: ToolPreferences | undefined,
  signal: AbortSignal,
  current: () => boolean,
  maxBytes = 256 * 1024 ** 2,
): Promise<{ snapshot: ProjectSnapshot; copyMs: number; temporaryBytes: number }> {
  if (!layers.recoveryReady) throw new Error("Recovery waits for completed edits.");
  const fields = layers.project.layerStack.layers.reduce(
      (n, { volume }) =>
        n +
        (volume instanceof SparseSDFVolume
          ? volume.pageMemoryBytes * 4
          : volumeSampleCount(volume) * 16),
      0,
    ),
    temporaryBytes =
      fields +
      layers.project.layerStack.layers.reduce(
        (n, l) => n + (sculptMask(l.volume).memoryBytes + sculptPaint(l.volume).memoryBytes) * 3,
        0,
      ) +
      65536 +
      (display?.references?.reduce((n, r) => n + r.bytes.byteLength, 0) ?? 0) * 4;
  if (layers.trackedBytes + layers.composite.trackedBytes + temporaryBytes > maxBytes)
    throw new RecoveryMemoryError(
      "Recovery memory safety estimate reached. Use Save in Browser or Download current. Last checkpoint kept.",
    );
  const start = performance.now(),
    check = () => {
      if (signal.aborted || !current() || !layers.recoveryReady)
        throw new Error("Recovery snapshot interrupted by an edit.");
    };
  check();
  const snapshot: ProjectSnapshot = {
    hierarchy: layers.project.layerStack.hierarchy.enabled
      ? layers.project.layerStack.hierarchy.snapshot()
      : undefined,
    id: layers.project.id,
    name: layers.project.name,
    activeLayerId: layers.project.activeLayerId,
    settings: structuredClone(settings),
    displayPreferences: display === undefined ? undefined : structuredClone(display),
    toolPreferences: tools === undefined ? undefined : structuredClone(tools),
    layers: [],
  };
  // Reservation is released synchronously on user interruption, before new edit admission.
  const release = () => {
    layers.backgroundBytes = 0;
  };
  layers.backgroundBytes = temporaryBytes;
  signal.addEventListener("abort", release, { once: true });
  try {
    let deadline = performance.now() + 2;
    for (const layer of layers.project.layerStack.layers) {
      const v = layer.volume,
        dense = v.getDenseView(),
        values = dense && new Float32Array(dense.length),
        sparse =
          v instanceof SparseSDFVolume
            ? { defaultValue: v.defaultValue, pages: new Map<number, Float32Array>() }
            : undefined;
      snapshot.layers.push({
        metadata: layer.metadata(),
        resolution: v.resolution,
        extent: v.extent,
        dimensions: v.dimensions,
        latticeMin: v.latticeMin ?? [0, 0, 0],
        values,
        sparse,
        paint: sculptPaint(v).snapshot(),
        mask: sculptMask(v).snapshot(),
      });
      const pause = async () => {
        await new Promise<void>((r) => setTimeout(r, 0));
        deadline = performance.now() + 2;
        check();
      };
      if (sparse && v instanceof SparseSDFVolume) {
        const release = v.pinResidentPages();
        try {
          for (const [id, page] of v.residentPages()) {
            check();
            sparse.pages.set(id, page.slice());
            if (performance.now() >= deadline) await pause();
          }
        } finally {
          release();
        }
      } else if (dense && values) {
        for (let i = 0; i < values.length; i += 16384) {
          check();
          values.set(dense.subarray(i, i + 16384), i);
          if (performance.now() >= deadline) await pause();
        }
      } else throw new Error("Unsupported recovery volume storage.");
    }
    check();
    return { snapshot, copyMs: performance.now() - start, temporaryBytes };
  } catch (error) {
    release();
    throw error;
  } finally {
    signal.removeEventListener("abort", release);
  }
}
export function checksum(data: ArrayBuffer): number {
  let hash = 0xffffffff;
  const bytes = new Uint8Array(data);
  for (let i = 0; i < bytes.length; i++) hash = TABLE[(hash ^ bytes[i]) & 255] ^ (hash >>> 8);
  return (hash ^ 0xffffffff) >>> 0;
}
const TABLE = Uint32Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let b = 0; b < 8; b++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
