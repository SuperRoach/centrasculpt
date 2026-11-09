/** Experimental STL-only reduction. Values are physical millimetres after sizing. */
export const CURVED_TOLERANCES = [0.01, 0.025, 0.05, 0.1] as const;
export type CurvedReductionOptions = { toleranceMM: number };
export type CurvedReductionReport = {
  status: "applied" | "kept-original";
  reason: string;
  toleranceMM: number;
  inputTriangles: number;
  outputTriangles: number;
  sampledMaxMM?: number;
  sectionMaxMM?: number;
  workspaceBytes?: number;
};
export function validateCurvedReduction(options: CurvedReductionOptions): void {
  if (
    !Number.isFinite(options.toleranceMM) ||
    options.toleranceMM < 0.01 ||
    options.toleranceMM > 0.1
  )
    throw new Error("Curved reduction tolerance must be 0.01–0.1 mm.");
}
export function curvedReductionSummary(report: CurvedReductionReport): string {
  return report.status === "applied"
    ? `✓ Curved reduction applied: ${((1 - report.outputTriangles / report.inputTriangles) * 100).toFixed(1)}% fewer triangles · sampled surface change up to ${report.sampledMaxMM?.toFixed(4)} mm.`
    : `Curved reduction: ✕ ${report.reason}`;
}
