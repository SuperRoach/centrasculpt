import { analyticRecord } from "./analytic-cache";
import { validateAssembly } from "./assembly";
import { type ProjectDisplayPreferences, validateProjectDisplay } from "./display-preferences";
import { validateHierarchy } from "./layer-hierarchy";
import {
  assertIndependentLayerVolumes,
  LayerStack,
  SculptProject,
  SdfLayer,
  validateId,
  validateName,
} from "./layers";
import { validateBooleanGraph } from "./live-boolean";
import { validatePrimitiveCache } from "./parametric-primitive";
import {
  MAGIC,
  MAX_ANALYTIC_SAMPLES,
  MAX_METADATA_BYTES,
  MAX_NATIVE_DECODE_BYTES,
  MAX_PROJECT_BYTES,
  MAX_PROJECT_LAYERS,
  MAX_PROJECT_RESOLUTION,
  MAX_PROJECT_TRIANGLES,
  MAX_PROJECT_VOXELS,
  PROJECT_VERSION,
  type ProjectSettings,
  SPARSE_PROJECT_VERSION,
  validateSettings,
} from "./project-format";
import { SDF_PAGE_WORDS, sparseDescriptor, writeSparsePages } from "./project-sparse-pages";
import {
  projectTriangleBudgetError,
  validateSparseVoxels,
  validateVoxels,
} from "./project-validation";
import { sculptMask } from "./sculpt-mask";
import { sculptPaint } from "./sculpt-paint";
import type { SDFVolume } from "./sdf";
import { SparseSDFVolume } from "./sparse-sdf";
import { validateToolPreferences } from "./tool-preferences";
import { requireLegacyCubicGrid, volumeSampleCount } from "./volume-store";
/** Write the canonical native format with exact stored or reconstructed voxel fields. */
export function saveSculptProject(
  project: SculptProject,
  display: ProjectDisplayPreferences | undefined = project.displayPreferences,
  maxArchiveBytes = MAX_PROJECT_BYTES,
): ArrayBuffer {
  validateBooleanGraph(project.layerStack.layers);
  const settings = validateSettings(project.settings),
    layers = project.layerStack.layers;
  if (layers.length < 1 || layers.length > MAX_PROJECT_LAYERS)
    throw new Error(`Projects support 1–${MAX_PROJECT_LAYERS} stored layer records.`);
  const version = layers.some(({ volume }) => volume instanceof SparseSDFVolume)
    ? SPARSE_PROJECT_VERSION
    : PROJECT_VERSION;
  let sparseBytes = 0;
  let offset = 0,
    totalSamples = 0,
    analyticSamples = 0,
    totalTriangles = 0;
  const maskPayloads = layers.map((l) => ({
    base: sculptMask(l.volume).defaultValue,
    count: sculptMask(l.volume).entryCount,
    mask: sculptMask(l.volume),
  }));
  const hasMasks = maskPayloads.some((m) => m.base !== 0 || m.count > 0);
  let maskBytes = 0;
  const hasPaint = layers.some((l) => !sculptPaint(l.volume).empty);
  let paintBytes = 0;
  const descriptors = layers.map((layer, index) => {
    const metadata = layer.metadata(),
      volume = layer.volume,
      n = volume.resolution;
    if (n < 3 || n > MAX_PROJECT_RESOLUTION || volume.extent <= 0 || volume.extent > 10)
      throw new Error("Project grid exceeds supported limits.");
    const sparse = volume instanceof SparseSDFVolume ? volume : undefined;
    if (sparse && layer.primitive)
      throw new Error("Sparse native primitive caches are unsupported.");
    const source = analyticRecord(layer);
    if (!source && layer.primitive) validatePrimitiveCache(layer.primitive, volume);
    const count = volumeSampleCount(volume);
    if (sparse) sparseBytes += sparse.pageMemoryBytes;
    else totalSamples += count;
    if (source) analyticSamples += count;
    if (analyticSamples > MAX_ANALYTIC_SAMPLES)
      throw new Error("Analytic reconstruction sample budget exceeded.");
    if (totalSamples > MAX_PROJECT_VOXELS)
      throw new Error("Aggregate project voxel budget exceeded.");
    if (sparse) totalTriangles += validateSparseVoxels(sparse);
    else {
      const dense = volume.getDenseView();
      if (!dense) throw new Error("Unsupported native volume storage.");
      totalTriangles += validateVoxels(dense, volume.dimensions, volume.extent, !source);
    }
    if (totalTriangles > MAX_PROJECT_TRIANGLES)
      throw projectTriangleBudgetError(totalTriangles, layer.name);
    const mask = maskPayloads[index],
      maskDescriptor = hasMasks
        ? { encoding: "sparse-f32-le", base: mask.base, count: mask.count, byteOffset: maskBytes }
        : undefined;
    maskBytes += hasMasks ? mask.count * 8 : 0;
    const paint = hasPaint
      ? sculptPaint(volume).channels.map((c) => {
          const count = c.entryCount,
            d = { encoding: "sparse-linear-f32-le", count, byteOffset: paintBytes };
          paintBytes += count * 8;
          return d;
        })
      : undefined;
    const result = {
      ...metadata,
      source,
      sparse: sparse && sparseDescriptor(sparse),
      paint,
      mask: maskDescriptor,
      grid: {
        dimensions: volume.dimensions,
        extent: volume.extent,
        voxelSize: volume.voxelSize,
        initialResolution: volume.resolution,
        latticeMin: volume.latticeMin ?? [0, 0, 0],
      },
      voxelOffset: offset,
      voxelCount: sparse ? sparse.allocatedPages * SDF_PAGE_WORDS : source ? 0 : count,
    };
    offset += result.voxelCount;
    return result;
  });
  validateAssembly(project.layerStack);
  // Revalidate identity/order/selection after metadata may have been edited by clients.
  assertIndependentLayerVolumes(layers);
  if (
    new Set(layers.map((l) => l.id)).size !== layers.length ||
    new Set(layers.map((l) => l.order)).size !== layers.length
  )
    throw new Error("Layer IDs and ordering must be unique.");
  project.layerStack.get(project.activeLayerId);
  const displayPreferences =
    display === undefined
      ? undefined
      : validateProjectDisplay(
          display,
          layers.map((layer) => layer.id),
        );
  const assets = displayPreferences?.references ?? [];
  let assetOffset = 0;
  const references = assets.map(({ bytes, ...record }) => {
    const descriptor = { ...record, byteOffset: assetOffset, byteLength: bytes.length };
    assetOffset += bytes.length;
    return descriptor;
  });
  const storedDisplay = displayPreferences
    ? { ...displayPreferences, references: assets.length ? references : undefined }
    : undefined;
  const metadata = new TextEncoder().encode(
    JSON.stringify({
      hierarchy: project.layerStack.hierarchy.enabled
        ? validateHierarchy(
            project.layerStack.hierarchy.snapshot(),
            layers.map((l) => l.id),
          )
        : undefined,
      toolPreferences:
        project.toolPreferences === undefined
          ? undefined
          : validateToolPreferences(project.toolPreferences),
      displayPreferences: storedDisplay,
      id: validateId(project.id),
      name: validateName(project.name),
      activeLayerId: project.activeLayerId,
      settings,
      voxelEncoding: "float32-le",
      layers: descriptors,
    }),
  );
  if (metadata.length > MAX_METADATA_BYTES)
    throw new Error("Project metadata exceeds the supported limit.");
  if (16 + metadata.length + offset * 4 + maskBytes + paintBytes + assetOffset > MAX_PROJECT_BYTES)
    throw new Error("Project including paint exceeds the native file size limit.");
  if (
    16 +
      MAX_METADATA_BYTES +
      offset * 4 +
      maskBytes +
      paintBytes +
      2 * assetOffset +
      totalSamples * 8 +
      sparseBytes +
      layers.reduce(
        (sum, { volume }) => sum + sculptMask(volume).memoryBytes + sculptPaint(volume).memoryBytes,
        0,
      ) >
    MAX_NATIVE_DECODE_BYTES
  )
    throw new Error("Native project reconstruction exceeds the memory budget. Split the project.");
  const buffer = new ArrayBuffer(
      16 + metadata.length + offset * 4 + maskBytes + paintBytes + assetOffset,
    ),
    bytes = new Uint8Array(buffer),
    view = new DataView(buffer);
  bytes.set(MAGIC);
  view.setUint32(8, version, true);
  view.setUint32(12, metadata.length, true);
  bytes.set(metadata, 16);
  for (const [a, { volume }] of layers.entries()) {
    const { source, voxelOffset, voxelCount } = descriptors[a];
    if (source) continue;
    const start = 16 + metadata.length + voxelOffset * 4;
    if (volume instanceof SparseSDFVolume) writeSparsePages(view, start, volume);
    else
      for (let i = 0; i < voxelCount; i++)
        view.setFloat32(start + i * 4, volume.readVoxel(i), true);
  }
  let maskStart = 16 + metadata.length + offset * 4;
  if (hasMasks)
    for (const mask of maskPayloads)
      for (const [id, value] of mask.mask.entries()) {
        view.setUint32(maskStart, id, true);
        view.setFloat32(maskStart + 4, value, true);
        maskStart += 8;
      }
  if (hasPaint)
    for (const l of layers)
      for (const c of sculptPaint(l.volume).channels)
        for (const [id, value] of c.entries()) {
          view.setUint32(maskStart, id, true);
          view.setFloat32(maskStart + 4, value, true);
          maskStart += 8;
        }
  let assetStart = maskStart;
  for (const asset of assets) {
    bytes.set(asset.bytes, assetStart);
    assetStart += asset.bytes.length;
  }
  return buffer;
}
/** Compatibility entry point for callers saving a standalone volume. */
export function saveProject(volume: SDFVolume, settings: ProjectSettings): ArrayBuffer {
  requireLegacyCubicGrid(volume, "Standalone volume save");
  const layer = new SdfLayer(volume, { id: "base" });
  return saveSculptProject(
    new SculptProject(new LayerStack([layer]), settings, "Untitled", "base-project"),
  );
}
