import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve(process.argv[2]);
const runs = readdirSync(dir)
  .filter((name) => /^growth-.*\.json$/.test(name))
  .map((name) => JSON.parse(readFileSync(resolve(dir, name), "utf8")))
  .filter((run) => run.complete);
function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted.at(-1),
  };
}
const rows = [];
for (const [variant, group] of Map.groupBy(runs, (run) => run.variant)) {
  for (const kind of ["tube", "branch", "islands"]) {
    const cases = group.map((run) => run.cases.find((c) => c.kind === kind));
    const intervals = Number(variant.split("-").at(-1));
    const slots = cases.flatMap((c) => (c.islandStrokes.length ? c.islandStrokes : [c]));
    const strokes = slots.flatMap((s) => s.strokes);
    const queues = slots.map((s) => s.queue);
    const occupancy = slots.map((s) => s.occupancy);
    const previews = strokes.flatMap((s) => (s.preview ? [s.preview] : []));
    const slices = queues.flatMap((q) => q.slices);
    rows.push({
      variant,
      kind,
      trials: group.length,
      modeledInputHz: 90 / intervals,
      peakQueue: Math.max(...queues.map((q) => q.peak)),
      age: stats(queues.flatMap((q) => q.ageTicks)),
      localAge: stats(queues.flatMap((q) => q.localAgeTicks)),
      sliceMs: stats(slices.map((s) => s.ms)),
      keysPerSlice: stats(slices.map((s) => s.chunks)),
      slicesOverBudget: slices.filter((s) => s.ms > 2).length,
      slicesOverTwoAndHalf: slices.filter((s) => s.ms > 2.5).length,
      predictedStops: queues.reduce((sum, q) => sum + (q.predictedStops ?? 0), 0),
      firstChunkOverBudget: queues.reduce((sum, q) => sum + (q.firstChunkOverBudget ?? 0), 0),
      preview: previews.length
        ? {
            cpuMs: stats(previews.map((p) => p.cpuMs)),
            nonempty: previews.filter((p) => p.triangles > 0).length,
            retainedAfterExactSlice: previews.filter((p) => p.retainedBytes > 0).length,
          }
        : null,
      strokeCpuMs: stats(strokes.map((s) => s.totalMs)),
      strokeCallsOverSlot: strokes.filter((s) => s.totalMs > 1000 / 90).length,
      occupancy: {
        skipped: occupancy.reduce((sum, item) => sum + item.skipped, 0),
        screened: occupancy.reduce((sum, item) => sum + item.screened, 0),
        cpuMs: occupancy.reduce((sum, item) => sum + item.occupancyMs, 0),
      },
      deadlineSelections: queues.reduce((sum, q) => sum + q.deadlineSelections, 0),
      checkpoints: [0, 1, 2].map((i) => {
        const checkpoints = cases.map((c) => c.checkpoints[i]);
        return {
          span: checkpoints[0].span,
          exactTopology: checkpoints[0].meshTopology,
          coarseTopology: checkpoints[0].coarseAudit,
          previewPeakBytes: Math.max(...checkpoints.map((c) => c.previewPeakBytes ?? 0)),
          previewScratchBytes: checkpoints[0].previewScratchBytes,
          releaseTicks: stats(checkpoints.map((c) => c.releaseDrainTicks)),
          releaseCpuMs: stats(checkpoints.map((c) => c.releaseCpuMs)),
          extraAdmissionSlices: stats(checkpoints.map((c) => c.backpressureTicks)),
        };
      }),
    });
  }
}
console.log(JSON.stringify(rows, null, 2));
