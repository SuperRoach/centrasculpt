import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function reports(dir, pattern) {
  return readdirSync(dir)
    .filter((name) => pattern.test(name))
    .map((name) => JSON.parse(readFileSync(resolve(dir, name), "utf8")));
}
function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted.at(-1),
  };
}
const growth = reports(process.argv[2], /^growth-.*\.json$/).filter((run) => run.complete);
const compact = reports(process.argv[3], /^trial-\d+\.json$/);
const queues = [];
for (const kind of ["tube", "branch", "islands"]) {
  const runs = growth
    .filter((run) => run.variant.endsWith("-scheduled"))
    .map((run) => run.cases.find((item) => item.kind === kind));
  const samples = runs.flatMap((c) =>
    c.islandStrokes.length ? c.islandStrokes.map((r) => r.queue) : [c.queue],
  );
  const checkpoints = runs.flatMap((c) => c.checkpoints);
  queues.push({
    kind,
    peak: Math.max(...samples.map((q) => q.peak)),
    slicesMs: stats(samples.flatMap((q) => q.slices.map((s) => s.ms))),
    ageTicks: stats(samples.flatMap((q) => q.ageTicks)),
    coalesced: stats(samples.map((q) => q.coalesced)),
    pendingAtUndo: stats(checkpoints.map((c) => c.pendingAtUndo)),
    backpressureTicks: stats(checkpoints.map((c) => c.backpressureTicks)),
  });
}
const compactRows = ["dense", "sparse"].map((kind) => ({
  kind,
  slicesMs: stats(compact.flatMap((run) => run[kind].batches.flat().map((slice) => slice.ms))),
  slicesPerEdit: stats(compact.flatMap((run) => run[kind].batches.map((slices) => slices.length))),
  smoothMs: stats(
    compact.flatMap((run) =>
      run[kind].strokes.filter((s) => s.mode === "smooth").map((s) => s.totalMs),
    ),
  ),
  workingBytes: stats(
    compact.map((run) => Math.max(...run[kind].strokes.map((s) => s.workingHighWaterBytes ?? 0))),
  ),
}));
console.log(JSON.stringify({ queues, compactRows }, null, 2));
