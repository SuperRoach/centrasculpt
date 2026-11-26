import { analyticDimensions, rebuildAnalyticCache } from "./analytic-cache";
import { validateAssembly } from "./assembly";
import { validateProjectDisplay } from "./display-preferences";
import { validateFeatureLinks } from "./enclosure-features";
import {
  createBaseProject,
  LayerStack,
  SculptProject,
  SdfLayer,
  validateId,
  validateLayerMetadata,
  validateName,
} from "./layers";
import { validateBooleanGraph } from "./live-boolean";
import { validatePrimitiveCache } from "./parametric-primitive";
import {
  ANALYTIC_ENCODING,
  MAGIC,
  MAX_ANALYTIC_SAMPLES,
  MAX_METADATA_BYTES,
  MAX_NATIVE_DECODE_BYTES,
  MAX_PROJECT_BYTES,
  MAX_PROJECT_LAYERS,
  MAX_PROJECT_RESOLUTION,
  MAX_PROJECT_TRIANGLES,
  MAX_PROJECT_VOXELS,
  object,
  PROJECT_VERSION,
  type ProjectSettings,
  SPARSE_PAGE_BYTES,
  SPARSE_PAGE_SAMPLES,
  validateSettings,
} from "./project-format";
import { openLegacyProject, validateLegacyLayerVersion } from "./project-legacy";
import { validateVoxels } from "./project-validation";
import { REFERENCE_LIMITS } from "./reference-images";
import { sculptMask } from "./sculpt-mask";
import { sculptPaint } from "./sculpt-paint";
import { SDFVolume } from "./sdf";
import { validateToolPreferences } from "./tool-preferences";
import type { VolumeStore } from "./volume-store";
export function openSculptProject(
  buffer: ArrayBuffer,
  onProgress?: (completed: number, total: number) => void,
): SculptProject {
  if (buffer.byteLength < 16 || buffer.byteLength > MAX_PROJECT_BYTES)
    throw new Error("Project file size is invalid or exceeds the supported limit.");
  const view = new DataView(buffer),
    bytes = new Uint8Array(buffer);
  if (!MAGIC.every((v, i) => bytes[i] === v))
    throw new Error("This is not a Centra Sculpt project (.form).");
  const version = view.getUint32(8, true);
  if (version === 1 || version === 2) {
    const legacy = openLegacyProject(buffer);
    return createBaseProject(legacy.volume, legacy.settings, true);
  }
  if (version < 3 || version > PROJECT_VERSION)
    throw new Error("Unsupported project version. This app supports versions 1–24.");
  const length = view.getUint32(12, true);
  if (length < 2 || length > MAX_METADATA_BYTES || 16 + length > buffer.byteLength)
    throw new Error("Invalid project metadata length.");
  let metadata: Record<string, unknown>;
  try {
    metadata = object(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(16, 16 + length))),
    );
  } catch {
    throw new Error("Project metadata is damaged or is not valid JSON.");
  }
  const id = validateId(metadata.id),
    name = validateName(metadata.name),
    active = validateId(metadata.activeLayerId),
    settings = validateSettings(metadata.settings);
  if (metadata.voxelEncoding !== "float32-le") throw new Error("Unsupported voxel encoding.");
  if (
    !Array.isArray(metadata.layers) ||
    metadata.layers.length < 1 ||
    metadata.layers.length > MAX_PROJECT_LAYERS
  )
    throw new Error("Invalid stored layer count.");
  let expectedOffset = 0,
    totalSamples = 0,
    analyticSamples = 0,
    totalTriangles = 0;
  const records = metadata.layers.map((value) => {
    const record = object(value);
    const layer = validateLayerMetadata(record);
    if (version < PROJECT_VERSION) validateLegacyLayerVersion(layer, version);
    return { record, layer };
  });
  const plans = records.map(({ record, layer }) => {
    const grid = object(record.grid),
      dimensions = grid.dimensions;
    if (
      !Array.isArray(dimensions) ||
      dimensions.length !== 3 ||
      !dimensions.every(
        (n) =>
          Number.isInteger(n) &&
          n >= 3 &&
          n <= (version >= 4 ? 512 : MAX_PROJECT_RESOLUTION) &&
          (version >= 4 || n === dimensions[0]),
      )
    )
      throw new Error("Invalid layer grid dimensions.");
    const dims = dimensions as [number, number, number],
      n = version >= 4 ? grid.initialResolution : dimensions[0],
      extent = grid.extent;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 3 || n > MAX_PROJECT_RESOLUTION)
      throw new Error("Invalid initial layer resolution.");
    const latticeMin = version >= 4 ? grid.latticeMin : [0, 0, 0];
    if (
      !Array.isArray(latticeMin) ||
      latticeMin.length !== 3 ||
      !latticeMin.every((v) => Number.isSafeInteger(v) && Math.abs(v) <= 1000000) ||
      !latticeMin.every((v, a) => v <= 0 && v + dims[a] >= n)
    )
      throw new Error("Invalid layer lattice origin.");
    if (
      typeof extent !== "number" ||
      !Number.isFinite(extent) ||
      extent <= (version >= 11 ? 0 : 0.85) ||
      extent > 10
    )
      throw new Error("Invalid layer volume extent.");
    const spacing = (2 * extent) / (n - 1);
    if (
      !Array.isArray(grid.voxelSize) ||
      grid.voxelSize.length !== 3 ||
      !grid.voxelSize.every(
        (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v - spacing) < 1e-10,
      )
    )
      throw new Error("Layer voxel size does not match its grid and bounds.");
    const count = dims.reduce((a, b) => a * b, 1);
    const source = record.source === undefined ? undefined : object(record.source);
    if (source) {
      if (version !== PROJECT_VERSION || source.encoding !== ANALYTIC_ENCODING)
        throw new Error("Unsupported native source encoding.");
      const physical = analyticDimensions(layer.primitive);
      if (
        !physical ||
        n < 33 ||
        n > 63 ||
        n % 2 !== 1 ||
        dims.some((d) => d !== n) ||
        latticeMin.some((v) => v !== 0) ||
        extent !== Math.max(...physical) * 0.6 ||
        grid.voxelSize.some((v) => v !== spacing) ||
        !Array.isArray(source.dimensions) ||
        source.dimensions.length !== 3 ||
        physical.some((v, i) => v !== (source.dimensions as number[])[i]) ||
        typeof source.fingerprint !== "number" ||
        !Number.isInteger(source.fingerprint) ||
        source.fingerprint < 0 ||
        source.fingerprint > 0xffffffff
      )
        throw new Error("Invalid analytic source definition or reconstruction grid.");
      analyticSamples += count;
    }
    totalSamples += count;
    if (analyticSamples > MAX_ANALYTIC_SAMPLES || totalSamples > MAX_PROJECT_VOXELS)
      throw new Error(
        "Project cache sample budget exceeded. Split the project into smaller files.",
      );
    const stored = source ? 0 : count;
    if (
      record.voxelOffset !== expectedOffset ||
      record.voxelCount !== stored ||
      16 + length + (expectedOffset + stored) * 4 > buffer.byteLength
    )
      throw new Error("Invalid layer voxel offset or payload length.");
    const offset = expectedOffset;
    expectedOffset += stored;
    return { layer, source, n, extent, dims, latticeMin, offset, count };
  });
  // Validate identities, hierarchy and linked metadata against lightweight holders.
  // These validators depend on definitions and poses. No source grid is allocated here.
  const layers = plans.map(({ layer }) => new SdfLayer(new SDFVolume(3, 1, false), layer));
  const stack = new LayerStack(layers, active);
  if (metadata.hierarchy !== undefined) {
    if (version < 7) throw new Error("Hierarchy requires project version 7.");
    stack.hierarchy.restore(metadata.hierarchy);
  }
  validateBooleanGraph(stack.layers);
  validateAssembly(stack);
  for (const layer of layers)
    if (layer.assemblyPart?.enclosure?.features?.length) validateFeatureLinks(stack, layer.id);
  const tools =
    metadata.toolPreferences === undefined
      ? undefined
      : validateToolPreferences(metadata.toolPreferences);
  const restoreChannels: (() => void)[] = [];
  let sparseBytes = 0;
  let assetStart = 16 + length + expectedOffset * 4;
  if (
    version >= 6 &&
    (metadata.layers as Record<string, unknown>[]).some((l) => l.mask !== undefined)
  ) {
    let offset = 0;
    for (let a = 0; a < layers.length; a++) {
      const descriptor = object(object(metadata.layers[a]).mask),
        count = descriptor.count,
        base = descriptor.base;
      if (
        descriptor.encoding !== "sparse-f32-le" ||
        (base !== 0 && base !== 1) ||
        !Number.isSafeInteger(count) ||
        typeof count !== "number" ||
        count < 0 ||
        count > plans[a].count ||
        descriptor.byteOffset !== offset ||
        assetStart + offset + count * 8 > buffer.byteLength
      )
        throw new Error("Invalid mask payload.");
      const start = assetStart + offset;
      restoreChannels.push(() => {
        const mask = sculptMask(layers[a].volume);
        mask.uniform(base);
        for (let i = start; i < start + count * 8; i += 8)
          mask.write(view.getUint32(i, true), view.getFloat32(i + 4, true));
      });
      let previous = -1;
      for (let i = 0; i < count; i++) {
        const id = view.getUint32(assetStart + offset, true),
          value = view.getFloat32(assetStart + offset + 4, true);
        if (
          id <= previous ||
          id >= plans[a].count ||
          !Number.isFinite(value) ||
          value < 0 ||
          value > 1 ||
          value === base
        )
          throw new Error("Invalid mask samples.");
        if (Math.floor(id / SPARSE_PAGE_SAMPLES) !== Math.floor(previous / SPARSE_PAGE_SAMPLES))
          sparseBytes += SPARSE_PAGE_BYTES;
        previous = id;
        offset += 8;
      }
    }
    assetStart += offset;
  } else if (metadata.layers.some((v) => object(v).mask !== undefined))
    throw new Error("Masks require project version 6.");
  if (metadata.layers.some((v) => object(v).paint !== undefined)) {
    if (version < 8) throw new Error("Paint requires project version 8.");
    let offset = 0;
    for (let a = 0; a < layers.length; a++) {
      const channels = object(metadata.layers[a]).paint;
      if (!Array.isArray(channels) || channels.length !== 4)
        throw new Error("Invalid paint channels.");
      for (let k = 0; k < 4; k++) {
        const d = object(channels[k]),
          count = d.count;
        if (
          d.encoding !== "sparse-linear-f32-le" ||
          typeof count !== "number" ||
          !Number.isSafeInteger(count) ||
          count < 0 ||
          count > plans[a].count ||
          d.byteOffset !== offset ||
          assetStart + offset + count * 8 > buffer.byteLength
        )
          throw new Error("Invalid paint payload.");
        const start = assetStart + offset;
        restoreChannels.push(() => {
          const channel = sculptPaint(layers[a].volume).channels[k];
          for (let i = start; i < start + count * 8; i += 8)
            channel.write(view.getUint32(i, true), view.getFloat32(i + 4, true));
        });
        let previous = -1;
        for (let i = 0; i < count; i++) {
          const id = view.getUint32(assetStart + offset, true),
            v = view.getFloat32(assetStart + offset + 4, true);
          if (id <= previous || id >= plans[a].count || !Number.isFinite(v) || v <= 0 || v > 1)
            throw new Error("Invalid paint sample.");
          if (Math.floor(id / SPARSE_PAGE_SAMPLES) !== Math.floor(previous / SPARSE_PAGE_SAMPLES))
            sparseBytes += SPARSE_PAGE_BYTES;
          previous = id;
          offset += 8;
        }
      }
      restoreChannels.push(() => {
        const paint = sculptPaint(layers[a].volume);
        for (let k = 0; k < 3; k++)
          for (const [id, v] of paint.channels[k].entries())
            if (v > paint.channels[3].read(id) + 1e-6)
              throw new Error("Invalid premultiplied paint.");
      });
    }
    assetStart += offset;
  }
  const savedDisplay = metadata.displayPreferences as
    | { references?: Record<string, unknown>[] }
    | undefined;
  if (savedDisplay?.references !== undefined) {
    if (
      version < 5 ||
      !Array.isArray(savedDisplay.references) ||
      savedDisplay.references.length > REFERENCE_LIMITS.count
    )
      throw new Error("Invalid reference records.");
    let offset = 0;
    savedDisplay.references = savedDisplay.references.map((r) => {
      if (r.mime === "model/stl" && version < 9)
        throw new Error("STL references require project version 9.");
      const n = r.byteLength;
      if (
        r.byteOffset !== offset ||
        typeof n !== "number" ||
        !Number.isSafeInteger(n) ||
        n < 24 ||
        n > REFERENCE_LIMITS.fileBytes ||
        offset + n > REFERENCE_LIMITS.totalBytes ||
        assetStart + offset + n > buffer.byteLength
      )
        throw new Error("Invalid reference payload.");
      const bytes = new Uint8Array(buffer.slice(assetStart + offset, assetStart + offset + n));
      offset += n;
      const { byteOffset, byteLength, ...record } = r;
      return { ...record, bytes };
    });
    sparseBytes += offset; // Retained reference copies.
    assetStart += offset;
  }
  if (buffer.byteLength !== assetStart)
    throw new Error("Unexpected voxel payload length or trailing data.");
  const display =
    metadata.displayPreferences === undefined
      ? undefined
      : validateProjectDisplay(
          metadata.displayPreferences,
          layers.map((layer) => layer.id),
        );
  if (
    version === PROJECT_VERSION &&
    buffer.byteLength - length + MAX_METADATA_BYTES + totalSamples * 8 + sparseBytes >
      MAX_NATIVE_DECODE_BYTES
  )
    throw new Error("Native project reconstruction exceeds the memory budget. Split the project.");
  for (const [index, { source, n, extent, dims, latticeMin, offset, count }] of plans.entries()) {
    const layer = layers[index];
    let volume: SDFVolume;
    if (source && layer.primitive) {
      volume = rebuildAnalyticCache(layer.primitive, n, count, source.fingerprint as number);
      validateVoxels(volume.values, dims, extent, false);
    } else {
      volume = new SDFVolume(n, extent, false, {
        dimensions: dims,
        latticeMin: latticeMin as [number, number, number],
      });
      for (let i = 0; i < count; i++)
        volume.values[i] = view.getFloat32(16 + length + (offset + i) * 4, true);
      totalTriangles += validateVoxels(volume.values, dims, extent);
      if (totalTriangles > MAX_PROJECT_TRIANGLES)
        throw new Error("Aggregate project triangle budget exceeded.");
      if (layer.primitive) validatePrimitiveCache(layer.primitive, volume);
    }
    onProgress?.(index + 1, plans.length);
    layer.volume = volume;
  }
  for (const restore of restoreChannels) restore();
  const project = new SculptProject(stack, settings, name, id);
  project.toolPreferences = tools;
  project.displayPreferences = display;
  return project;
}
/** Compatibility reader for existing consumers; new application code uses the project model. */
export function openProject(buffer: ArrayBuffer): {
  volume: VolumeStore;
  settings: ProjectSettings;
  project: SculptProject;
} {
  const project = openSculptProject(buffer);
  return { volume: project.activeLayer.volume, settings: project.settings, project };
}
