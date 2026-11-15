import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve(process.argv[2]);
const runs = readdirSync(dir)
  .filter((name) => /^trial-\d+\.json$/.test(name))
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
for (const [policy, trials] of Map.groupBy(
  runs.flatMap((run) => run.bulkRuns),
  (row) => row.policy,
)) {
  rows.push({
    policy,
    ...Object.fromEntries(
      [
        "oldPending",
        "dirtyPlan",
        "peakQueue",
        "slices",
        "prepareMs",
        "commitMs",
        "firstGeometryMs",
        "retryDrainMs",
        "totalUndoMs",
        "peakModel",
      ].map((field) => [field, stats(trials.map((trial) => trial[field]))]),
    ),
    sliceMs: stats(trials.flatMap((trial) => trial.sliceMs)),
    slicesOverBudget: trials.flatMap((trial) => trial.sliceMs).filter((ms) => ms > 2).length,
  });
}
console.log(
  JSON.stringify(
    {
      workers: runs.length,
      rows,
      maxRSSMiB: stats(runs.map((run) => run.memory.maxRSSKiB / 1024)),
    },
    null,
    2,
  ),
);
