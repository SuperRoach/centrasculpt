import type { Vector3Tuple } from "three";

export type ArrayAxis = "x" | "y" | "z";
export type ArrayOrientation = "rotate" | "retain";
export type ArrayDefinition =
  | {
      id: string;
      kind: "radial";
      enabled: boolean;
      count: number;
      totalAngleRadians: number;
      pivot: Vector3Tuple;
      axis: Vector3Tuple;
      angularOffsetRadians: number;
      orientation: ArrayOrientation;
    }
  | {
      id: string;
      kind: "linear";
      enabled: boolean;
      count: number;
      spacingModelUnits: number;
      axis: Vector3Tuple;
      centered: boolean;
    };

export const ARRAY_MAX_INSTANCES = 16;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

export function validateArrayDefinition(value: unknown): ArrayDefinition {
  if (!value || typeof value !== "object") throw new Error("Invalid array definition.");
  const v = value as Record<string, unknown>;
  if (typeof v.id !== "string" || !ID.test(v.id)) throw new Error("Invalid array ID.");
  if (typeof v.enabled !== "boolean") throw new Error("Invalid array enabled flag.");
  if (
    !Number.isInteger(v.count) ||
    (v.count as number) < 1 ||
    (v.count as number) > ARRAY_MAX_INSTANCES
  )
    throw new Error(`Array count must be between 1 and ${ARRAY_MAX_INSTANCES}.`);
  const axis = vec(v.axis, "Array axis");
  if (Math.hypot(...axis) < 1e-9) throw new Error("Array axis cannot be zero.");
  if (v.kind === "linear") {
    if (
      typeof v.spacingModelUnits !== "number" ||
      !Number.isFinite(v.spacingModelUnits) ||
      v.spacingModelUnits <= 0 ||
      v.spacingModelUnits > 160
    )
      throw new Error("Linear spacing must be a positive finite physical distance.");
    if (typeof v.centered !== "boolean") throw new Error("Invalid centred distribution flag.");
    return {
      id: v.id,
      kind: "linear",
      enabled: v.enabled,
      count: v.count as number,
      spacingModelUnits: v.spacingModelUnits,
      axis: norm(axis),
      centered: v.centered,
    };
  }
  if (v.kind !== "radial") throw new Error("Array kind must be linear or radial.");
  const pivot = vec(v.pivot, "Array pivot"),
    angle = v.totalAngleRadians,
    offset = v.angularOffsetRadians;
  if (
    typeof angle !== "number" ||
    !Number.isFinite(angle) ||
    angle <= 0 ||
    angle > Math.PI * 2 + 1e-8
  )
    throw new Error("Radial angle must be greater than 0 and at most 360 degrees.");
  if (typeof offset !== "number" || !Number.isFinite(offset) || Math.abs(offset) > Math.PI * 200)
    throw new Error("Invalid radial angular offset.");
  if (v.orientation !== "rotate" && v.orientation !== "retain")
    throw new Error("Radial orientation must be rotate or retain.");
  return {
    id: v.id,
    kind: "radial",
    enabled: v.enabled,
    count: v.count as number,
    totalAngleRadians: angle,
    pivot,
    axis: norm(axis),
    angularOffsetRadians: offset,
    orientation: v.orientation,
  };
}

function vec(value: unknown, label: string): Vector3Tuple {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    !value.every((n) => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1000)
  )
    throw new Error(`${label} must contain three finite bounded numbers.`);
  return value as Vector3Tuple;
}
function norm(v: Vector3Tuple): Vector3Tuple {
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
}

export function arrayInstanceAngles(array: Extract<ArrayDefinition, { kind: "radial" }>): number[] {
  return Array.from({ length: array.count }, (_, i) => {
    const full = Math.abs(array.totalAngleRadians - Math.PI * 2) < 1e-8;
    const fraction = array.count <= 1 ? 0 : i / (full ? array.count : array.count - 1);
    return array.angularOffsetRadians + array.totalAngleRadians * fraction;
  });
}
