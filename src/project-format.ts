import { BRUSH_RADIUS_LIMITS } from "./brush-settings";
import { REFERENCE_LIMITS } from "./reference-images";
import { MAX_RESOLUTION } from "./resolution";
import type { BrushMode } from "./sdf";
export type SculptSettings = {
  mode: BrushMode;
  radius: number;
  strength: number;
  hardness: number;
};
export type ProjectSettings = SculptSettings & {
  camera: { position: [number, number, number]; target: [number, number, number] };
};
export const MAGIC = [70, 79, 82, 77, 83, 68, 70, 0]; // FORMSDF\0
export const PROJECT_VERSION = 24;
/** Compatibility alias for the first analytic format. */
export const ANALYTIC_PROJECT_VERSION = PROJECT_VERSION;
export const SPARSE_PROJECT_VERSION = 25;
export const isCanonicalProjectVersion = (version: number) =>
  version === PROJECT_VERSION || version === SPARSE_PROJECT_VERSION;
export const ANALYTIC_ENCODING = "primitive-sdf-v1";
export const MAX_ANALYTIC_SAMPLES = 20 * 63 ** 3;
export const MAX_NATIVE_DECODE_BYTES = 256 * 1024 ** 2;
export const MAX_METADATA_BYTES = 65_536;
// Include per-page overhead before allocating dense fields or restoring sparse channels.
export const SPARSE_PAGE_SAMPLES = 256;
export const SPARSE_PAGE_BYTES = 4 * SPARSE_PAGE_SAMPLES + 64;

export const MAX_PROJECT_RESOLUTION = MAX_RESOLUTION;
export const MAX_PROJECT_TRIANGLES = 1_000_000;
export const MAX_PROJECT_LAYERS = 20;
export const MAX_PROJECT_VOXELS = 2 * MAX_PROJECT_RESOLUTION ** 3;
export const MAX_PROJECT_BYTES =
  16 + MAX_METADATA_BYTES + MAX_PROJECT_VOXELS * 12 + REFERENCE_LIMITS.totalBytes;
const CAMERA_MIN_DISTANCE = 1.2;
const CAMERA_MAX_DISTANCE = 9;
const CAMERA_MAX_COORDINATE = 1000;

/** Desktop framing may exceed the camera range saved in portable projects. */
export function cameraForProjectSave(
  camera: ProjectSettings["camera"],
  fallback: ProjectSettings["camera"],
): ProjectSettings["camera"] {
  const { position, target } = camera;
  const fits = (point: readonly number[]) =>
    point.every((value) => Number.isFinite(value) && Math.abs(value) <= CAMERA_MAX_COORDINATE);
  if (!fits(position) || !fits(target)) return fallback;
  const [x, y, z] = position.map((value, i) => value - target[i]);
  const distance = Math.hypot(x, y, z);
  if (distance === 0) return fallback;
  if (distance >= CAMERA_MIN_DISTANCE && distance <= CAMERA_MAX_DISTANCE) return camera;
  const boundedDistance =
    distance < CAMERA_MIN_DISTANCE ? CAMERA_MIN_DISTANCE : CAMERA_MAX_DISTANCE;
  const bounded: ProjectSettings["camera"]["position"] = [
    target[0] + (x / distance) * boundedDistance,
    target[1] + (y / distance) * boundedDistance,
    target[2] + (z / distance) * boundedDistance,
  ];
  return fits(bounded) ? { position: bounded, target } : fallback;
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Project metadata must be an object.");
  return value as Record<string, unknown>;
}
function triple(value: unknown): [number, number, number] {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every(
      (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= CAMERA_MAX_COORDINATE,
    )
  )
    throw new Error("Invalid camera coordinates.");
  return [...value] as [number, number, number];
}
export function validateSettings(value: unknown, version = PROJECT_VERSION): ProjectSettings {
  const data = object(value),
    camera = object(data.camera);
  if (
    ![
      "add",
      "subtract",
      "smooth",
      "flatten",
      "inflate",
      "scrape",
      "pinch",
      "crease",
      "mask",
      "mask-erase",
      "paint",
      "paint-erase",
    ].includes(String(data.mode)) ||
    typeof data.mode !== "string"
  )
    throw new Error("Unknown brush mode.");
  if (
    typeof data.radius !== "number" ||
    !Number.isFinite(data.radius) ||
    data.radius < BRUSH_RADIUS_LIMITS.min ||
    data.radius > BRUSH_RADIUS_LIMITS.max
  )
    throw new Error("Brush radius must be between 0.12 and 0.50.");
  if (
    typeof data.strength !== "number" ||
    !Number.isFinite(data.strength) ||
    data.strength < 0.01 ||
    data.strength > 1
  )
    throw new Error("Brush strength must be between 0.01 and 1.");
  const hardness = version === 1 ? 0 : data.hardness;
  if (typeof hardness !== "number" || !Number.isFinite(hardness) || hardness < 0 || hardness > 1)
    throw new Error("Brush hardness must be between 0 and 1.");
  const position = triple(camera.position),
    target = triple(camera.target);
  const distance = Math.hypot(...position.map((v, i) => v - target[i]));
  if (distance < CAMERA_MIN_DISTANCE - 1e-6 || distance > CAMERA_MAX_DISTANCE + 1e-6)
    throw new Error("Camera distance is outside the supported range.");
  return {
    mode: data.mode as BrushMode,
    radius: data.radius,
    strength: data.strength,
    hardness,
    camera: { position, target },
  };
}
