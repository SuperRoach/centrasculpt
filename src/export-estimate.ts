import { EXPORT_PRESETS, type ExportQuality } from "./export-mesh";

/** O(1) metadata only: never inspect colour/position buffers or schedule mesh work. */
export function exportCountEstimate(triangles: number, quality: ExportQuality, evaluated: boolean) {
  if (!Number.isSafeInteger(triangles) || triangles < 0 || !Object.hasOwn(EXPORT_PRESETS, quality))
    throw new Error("Invalid export estimate metadata.");
  if (evaluated)
    return {
      lower: 0,
      upper: 1_000_000,
      exact: false,
      text: "Evaluated count unknown until preparation (up to 1,000,000 intermediate triangles; final STL ceiling 600,000).",
    };
  return {
    lower: quality === "fast" ? triangles : 0,
    upper: triangles,
    exact: quality === "fast",
    text:
      quality === "fast"
        ? `All-layers estimate: ${triangles.toLocaleString()} triangles (committed input; selected scope may be smaller).`
        : `All-layers estimate: 0–${triangles.toLocaleString()} triangles; reduction unknown (up to 100% uncertainty).`,
  };
}
