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
const output = [];
for (const [variant, group] of Map.groupBy(runs, (run) => run.variant)) {
  for (const kind of ["tube", "branch", "islands"]) {
    const cases = group.map((run) => run.cases.find((item) => item.kind === kind));
    const queues = cases.flatMap((c) =>
      c.islandStrokes.length ? c.islandStrokes.map((s) => s.queue) : [c.queue],
    );
    const strokes = cases.flatMap((c) =>
      c.islandStrokes.length ? c.islandStrokes.flatMap((s) => s.strokes) : c.strokes,
    );
    const metre = cases.map((c) => c.checkpoints.at(-1));
    output.push({
      variant,
      kind,
      trials: group.length,
      peak: Math.max(...queues.map((q) => q.peak)),
      sliceMs: stats(queues.flatMap((q) => q.slices.map((s) => s.ms))),
      age: stats(queues.flatMap((q) => q.ageTicks)),
      localAge: stats(queues.flatMap((q) => q.localAgeTicks)),
      dirtyChunks: stats(strokes.map((s) => s.dirtyChunks)),
      totalMs: stats(strokes.map((s) => s.totalMs)),
      backpressure: stats(metre.map((c) => c.backpressureTicks)),
      undoDrain: stats(metre.map((c) => c.undoDrainTicks)),
      redoDrain: stats(metre.map((c) => c.redoDrainTicks)),
    });
  }
}
console.log(JSON.stringify(output, null, 2));
