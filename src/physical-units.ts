import { Vector3 } from "three";
import {
  copyTransform,
  transformMatrix,
  type Vec3,
  type VolumeTransform,
  validateTransform,
} from "./transform";
export type PhysicalUnit = "mm" | "cm" | "in";
export type Measurement = { id: string; points: Vec3[] };
export type PrecisionSettings = {
  unit: PhysicalUnit;
  millimetresPerUnit: number;
  translationSnapMM: number;
  angleSnapDegrees: number;
  measurements: Measurement[];
};
/** Model-space calibration, independent of workspace/view transforms. Legacy geometry is untouched. */
export function defaultPrecision(): PrecisionSettings {
  return {
    unit: "mm",
    millimetresPerUnit: 100,
    translationSnapMM: 0,
    angleSnapDegrees: 0,
    measurements: [],
  };
}
export const unitMM = { mm: 1, cm: 10, in: 25.4 };
export function finitePositive(value: number): number {
  if (!Number.isFinite(value) || value <= 0 || value > 1e6)
    throw new Error("Enter a positive finite dimension (up to 1,000,000).");
  return value;
}
export function toDisplay(model: number, settings: PrecisionSettings): number {
  return (model * settings.millimetresPerUnit) / unitMM[settings.unit];
}
export function fromDisplay(value: number, settings: PrecisionSettings): number {
  if (!Number.isFinite(value)) throw new Error("Enter a finite number.");
  return (value * unitMM[settings.unit]) / settings.millimetresPerUnit;
}
export function snapValue(value: number, increment: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(increment) || increment < 0)
    throw new Error("Invalid snap value.");
  return increment ? Math.round(value / increment) * increment : value;
}
export function snappedTransform(t: VolumeTransform, settings: PrecisionSettings): VolumeTransform {
  const next = copyTransform(t);
  next.position = next.position.map((v) =>
    snapValue(v, settings.translationSnapMM / settings.millimetresPerUnit),
  ) as Vec3;
  next.rotation = next.rotation.map((v) =>
    snapValue(v, (settings.angleSnapDegrees * Math.PI) / 180),
  ) as Vec3;
  return validateTransform(next);
}
export function validatePrecision(value: unknown): PrecisionSettings {
  if (!value || typeof value !== "object") throw new Error("Invalid precision settings.");
  const p = value as PrecisionSettings;
  if (
    !(p.unit === "mm" || p.unit === "cm" || p.unit === "in") ||
    ![0, 0.1, 1, 5].includes(p.translationSnapMM) ||
    !Number.isFinite(p.angleSnapDegrees) ||
    p.angleSnapDegrees < 0 ||
    p.angleSnapDegrees > 180
  )
    throw new Error("Invalid precision units or snapping.");
  finitePositive(p.millimetresPerUnit);
  if (!Array.isArray(p.measurements) || p.measurements.length > 64)
    throw new Error("At most 64 measurements are supported.");
  const ids = new Set<string>();
  const measurements = p.measurements.map((m) => {
    if (
      !m ||
      typeof m.id !== "string" ||
      !/^[a-zA-Z0-9-]{1,64}$/.test(m.id) ||
      ids.has(m.id) ||
      !Array.isArray(m.points) ||
      ![2, 3].includes(m.points.length)
    )
      throw new Error("Invalid measurement annotation.");
    ids.add(m.id);
    const points = m.points.map((point) => {
      if (
        !Array.isArray(point) ||
        point.length !== 3 ||
        !point.every((v) => Number.isFinite(v) && Math.abs(v) <= 1e6)
      )
        throw new Error("Invalid measurement point.");
      return [...point] as Vec3;
    });
    return { id: m.id, points };
  });
  return {
    unit: p.unit,
    millimetresPerUnit: p.millimetresPerUnit,
    translationSnapMM: p.translationSnapMM,
    angleSnapDegrees: p.angleSnapDegrees,
    measurements,
  };
}
export function measurementValue(points: Vec3[], settings: PrecisionSettings): string {
  const a = new Vector3(...points[0]),
    b = new Vector3(...points[1]);
  if (points.length === 2)
    return `${toDisplay(a.distanceTo(b), settings).toFixed(3)} ${settings.unit}`;
  a.sub(b);
  const c = new Vector3(...points[2]).sub(b);
  if (!a.lengthSq() || !c.lengthSq()) return "Undefined angle · coincident points";
  return `${((a.angleTo(c) * 180) / Math.PI).toFixed(2)}°`;
}
/** Same transformed model-space input bounds used by STL sizing; no navigation matrices. */
export function physicalExportLongestMM(
  sources: readonly import("./export-mesh").ExportSource[],
  millimetresPerUnit: number,
): number {
  finitePositive(millimetresPerUnit);
  const min = new Vector3(Infinity, Infinity, Infinity),
    max = new Vector3(-Infinity, -Infinity, -Infinity),
    point = new Vector3();
  for (const source of sources) {
    const matrix = transformMatrix(source.transform);
    for (const chunk of source.chunks)
      for (let i = 0; i < chunk.positions.length; i += 3) {
        point.fromArray(chunk.positions, i).applyMatrix4(matrix);
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z))
          throw new Error("Invalid physical export geometry.");
        min.min(point);
        max.max(point);
      }
  }
  const longest = Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
  if (!Number.isFinite(longest) || longest <= 0)
    throw new Error("No physical dimensions available for this export scope.");
  return longest * millimetresPerUnit;
}
