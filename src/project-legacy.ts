import type { validateLayerMetadata } from "./layers";
import {
  MAGIC,
  MAX_METADATA_BYTES,
  MAX_PROJECT_BYTES,
  MAX_PROJECT_RESOLUTION,
  object,
  type ProjectSettings,
  validateSettings,
} from "./project-format";
import { validateVoxels } from "./project-validation";
import { SDFVolume } from "./sdf";
/** Fully validate before returning a new volume; never mutates the active project. */
export function openLegacyProject(buffer: ArrayBuffer): {
  volume: SDFVolume;
  settings: ProjectSettings;
} {
  if (buffer.byteLength < 16 || buffer.byteLength > MAX_PROJECT_BYTES)
    throw new Error("Project file size is invalid or exceeds the supported limit.");
  const bytes = new Uint8Array(buffer),
    view = new DataView(buffer);
  if (!MAGIC.every((value, i) => bytes[i] === value))
    throw new Error(
      "This is not a Centra Sculpt project (.form). GLB files cannot be opened as projects.",
    );
  const version = view.getUint32(8, true);
  if (version !== 1 && version !== 2)
    throw new Error("Unsupported project version. This app supports versions 1 and 2.");
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
  const grid = object(metadata.grid),
    dimensions = grid.dimensions;
  if (
    !Array.isArray(dimensions) ||
    dimensions.length !== 3 ||
    !dimensions.every((v) => Number.isInteger(v) && v >= 3 && v <= MAX_PROJECT_RESOLUTION) ||
    dimensions.some((v) => v !== dimensions[0])
  )
    throw new Error(
      `Only cubic grids from 3³ to ${MAX_PROJECT_RESOLUTION}³ samples are supported.`,
    );
  const n = dimensions[0] as number,
    extent = grid.extent;
  if (typeof extent !== "number" || !Number.isFinite(extent) || extent <= 0.85 || extent > 10)
    throw new Error("Project extent must be greater than 0.85 and at most 10.");
  if (metadata.voxelEncoding !== "float32-le") throw new Error("Unsupported voxel encoding.");
  if (buffer.byteLength !== 16 + length + n ** 3 * 4)
    throw new Error("Voxel payload length does not match the grid dimensions.");
  const settings = validateSettings(metadata.settings, version);
  const values = new Float32Array(n ** 3);
  for (let i = 0; i < values.length; i++) values[i] = view.getFloat32(16 + length + i * 4, true);
  validateVoxels(values, n, extent);
  const volume = new SDFVolume(n, extent);
  volume.values.set(values);
  return { volume, settings };
}

export function validateLegacyLayerVersion(
  layer: ReturnType<typeof validateLayerMetadata>,
  version: number,
) {
  if (
    (layer.assemblyPart?.enclosure ||
      (layer.primitiveOriginal?.kind === "box" &&
        layer.primitiveOriginal.cornerRadius !== undefined) ||
      (layer.primitive?.kind === "box" && layer.primitive.cornerRadius !== undefined)) &&
    version < 16
  )
    throw new Error("Enclosure recipes and rounded prisms require project version 16.");
  if (
    version < 17 &&
    [layer.primitive, layer.primitiveOriginal].some(
      (s) =>
        s?.kind === "cylinder" && (s.topDiameter !== undefined || s.bottomDiameter !== undefined),
    )
  )
    throw new Error("Tapered cylinders require project version 17.");
  if (
    version < 18 &&
    [layer.primitive, layer.primitiveOriginal].some(
      (s) =>
        s?.kind === "sphere" &&
        (s.width !== undefined || s.height !== undefined || s.depth !== undefined),
    )
  )
    throw new Error("Ellipsoids require project version 18.");
  if (
    version < 20 &&
    [layer.primitive, layer.primitiveOriginal].some(
      (s) =>
        s &&
        (["capsule", "torus", "pyramid"].includes(s.kind) ||
          (s.kind === "cylinder" && (s.topDiameter === 0 || s.bottomDiameter === 0))),
    )
  )
    throw new Error("Expanded primitives and zero cylinder ends require project version 20.");
  if (
    version < 21 &&
    [layer.primitive, layer.primitiveOriginal].some(
      (s) => s?.kind === "torus" && s.tyre !== undefined,
    )
  )
    throw new Error("Tyre shape requires project version 21.");
  if (
    version < 22 &&
    [layer.primitive, layer.primitiveOriginal].some((s) => s?.kind === "tapered-box")
  )
    throw new Error("Tapered boxes require project version 22.");
  if (version < 23 && [layer.primitive, layer.primitiveOriginal].some((s) => s?.kind === "text"))
    throw new Error("Editable text requires project version 23.");
  if (layer.booleanModifiers?.length && version < 12)
    throw new Error("Live Booleans require project version 12.");
  if (layer.assemblyPart?.enclosure?.features !== undefined && version < 19)
    throw new Error("Associative attachments require project version 19.");
  if (layer.assemblyPart && version < 14) throw new Error("Assembly requires project version 14.");
  if (layer.array?.scalePerItem !== undefined && layer.array.scalePerItem !== 1 && version < 15)
    throw new Error("Progressive array scaling requires project version 15.");
  if (layer.array && version < 13) throw new Error("Arrays require project version 13.");
  if (layer.primitive && version < 11) throw new Error("Primitives require project version 11.");
}
