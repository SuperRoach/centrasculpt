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
    count: values.length,
    min: sorted[0],
    p50: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted.at(-1),
  };
}
const mib = (value) => value / 1024 ** 2;
const groups = Map.groupBy(
  runs.flatMap((run) => run.points),
  (point) => point.phase,
);
const phases = [...groups].map(([phase, rows]) => ({
  phase,
  livePages: stats(rows.map((r) => r.livePages)),
  historyPages: stats(rows.map((r) => r.historyPages)),
  retainedMiB: stats(rows.map((r) => mib(r.retained))),
  geometryMiB: stats(rows.map((r) => mib(r.geometry))),
  rssMiB: stats(rows.map((r) => mib(r.processMemory.rss))),
  arrayBuffersMiB: stats(rows.map((r) => mib(r.processMemory.arrayBuffers))),
  heapMiB: stats(rows.map((r) => mib(r.processMemory.heapUsed))),
  immediateArrayBuffersMiB: stats(rows.map((r) => mib(r.immediateMemory.arrayBuffers))),
}));
const totals = Object.fromEntries(
  ["rounds", "edits", "erasedPages", "refused", "cancelled"].map((name) => [
    name,
    runs.reduce((sum, run) => sum + run[name], 0),
  ]),
);
const durations = Object.fromEntries(
  ["brush", "reset", "undo", "redo"].map((name) => [
    name,
    stats(runs.flatMap((run) => run.durations[name])),
  ]),
);
console.log(
  JSON.stringify(
    {
      trials: runs.length,
      totals,
      phases,
      durations,
      retainedPeakMiB: stats(runs.map((run) => mib(run.peak))),
      workingPeakMiB: stats(runs.map((run) => mib(run.peakWorking))),
      processMaxRSSMiB: stats(runs.map((run) => run.memory.maxRSSKiB / 1024)),
    },
    null,
    2,
  ),
);
