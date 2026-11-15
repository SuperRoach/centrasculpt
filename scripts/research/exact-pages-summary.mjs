import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve(process.argv[2]);
const bandReport = JSON.parse(readFileSync(process.argv[3], "utf8"));
const runs = readdirSync(dir)
  .filter((name) => /^\d+-\d+-\d+\.json$/.test(name))
  .map((name) => JSON.parse(readFileSync(resolve(dir, name), "utf8")))
  .filter((run) => run.complete);
const valuesBytes = 192 ** 3 * 4;
const p = (values, q) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * q) - 1];
const stats = (values) => [p(values, 0.5), p(values, 0.95), Math.max(...values)];
const summaries = [];
for (const [configuration, group] of Map.groupBy(runs, (r) => `${r.block}-${r.slots}`)) {
  const rows = group.flatMap((r) => r.rows);
  const timings = {};
  for (const name of Object.keys(rows[0].timings)) {
    const cold = rows.map((r) => r.timings[name][0]);
    const warm = rows.flatMap((r) => r.timings[name].slice(1));
    timings[name] = {
      coldMs: stats(cold.map((r) => r.packedMs)),
      warmMs: stats(warm.map((r) => r.packedMs)),
      warmRatio: stats(warm.map((r) => r.packedMs / r.denseMs)),
      warmMisses: stats(warm.map((r) => r.misses)),
    };
  }
  const working = rows.map((r) => {
    const band = bandReport.rows.find((b) => b.id === r.id).linearCacheBytes;
    // First patch's after pages are shared with edits. Reserve one old patch
    // of the same size, one additional stream block, and patch references.
    return (
      Object.values(r.footprint).reduce((n, bytes) => n + bytes, 0) +
      band +
      r.stagedBytes +
      Number(group[0].block) +
      256 * 32
    );
  });
  summaries.push({
    configuration,
    trials: group.length,
    fixtures: rows.length,
    timings,
    modeledWorkingVsValues: stats(working.map((bytes) => bytes / valuesBytes)),
    modeledWithOriginalVsValuesScratch: stats(
      working.map((bytes, i) => (bytes + rows[i].originalMasterBytes) / (2 * valuesBytes)),
    ),
    workingCasesOver75Percent: working.filter((bytes) => bytes > valuesBytes * 0.75).length,
    encodeMs: stats(rows.map((r) => r.encodeMs)),
    stageMs: stats(rows.map((r) => r.stageMs)),
    saveMs: stats(rows.map((r) => r.saveMs)),
    reopenMs: stats(rows.map((r) => r.reopenMs)),
    sampledPostSaveRSSMiB: stats(rows.map((r) => r.afterSave.rss / 1024 ** 2)),
    processPeakRSSMiB: stats(group.map((r) => r.maxRSSKiB / 1024)),
  });
}
console.log(JSON.stringify(summaries, null, 2));
