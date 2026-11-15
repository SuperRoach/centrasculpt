import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const directory = resolve(process.argv[2]);
const manifest = JSON.parse(readFileSync(resolve(directory, "manifest.json"), "utf8"));
const reports = readdirSync(directory)
  .filter((name) => manifest.cases[name.slice(0, -5)]?.code === 0 && name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(resolve(directory, name), "utf8")))
  .filter((report) => report.complete);

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(p * sorted.length) - 1];
};
const stats = (values) => ({
  n: values.length,
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  max: Math.max(...values),
});
const peakRSS = (runs) => stats(runs.map((run) => run.end.maxRSSKiB));
const groups = (reports) => Map.groupBy(reports, (run) => run.variant);

const compact = reports.filter((row) => row.suite === "compact");
const compactReference = compact.find((row) => row.variant === "dense")?.checkpoints;
const compactRows = [];
for (const [variant, runs] of groups(compact)) {
  for (const run of runs) {
    if (!compactReference) continue;
    assert.deepEqual(
      run.checkpoints.map(({ phase, field, surface }) => ({ phase, field, surface })),
      compactReference.map(({ phase, field, surface }) => ({ phase, field, surface })),
      `${variant} checkpoint parity`,
    );
  }
  const strokes = runs.flatMap((run) => run.strokes);
  const modes = {};
  for (const [mode, rows] of Map.groupBy(strokes, (row) => row.mode))
    modes[mode] = Object.fromEntries(
      ["totalMs", "rebuildMs", "brushMs"].map((field) => [
        field,
        stats(rows.map((row) => row[field])),
      ]),
    );
  compactRows.push({
    variant,
    trials: runs.length,
    modes,
    peakRSSKiB: peakRSS(runs),
    retainedBytes: runs[0].checkpoints.find((row) => row.phase === "finish").retainedBytes,
    workingBytes: stats(
      runs.map((run) => Math.max(...run.strokes.map((s) => s.workingHighWaterBytes ?? 0))),
    ),
    haloGatherMs: runs.some((run) => run.haloStats)
      ? stats(runs.map((run) => run.haloStats.gatherMs))
      : null,
  });
}

const growth = reports.filter((row) => row.suite === "growth");
const growthRows = [];
const topologyReference = new Map();
for (const run of growth) {
  for (const { kind, checkpoints } of run.cases) {
    for (const { span, exactPages, meshTopology } of checkpoints) {
      const key = `${kind}-${span}`;
      const actual = { exactPages, meshTopology };
      if (!topologyReference.has(key)) topologyReference.set(key, actual);
      assert.deepEqual(actual, topologyReference.get(key), `${run.variant} ${key} growth parity`);
    }
  }
}
for (const [variant, runs] of groups(growth)) {
  for (const [index, entry] of runs[0].cases.entries()) {
    for (const [checkpoint, { span }] of entry.checkpoints.entries()) {
      const rows = runs.map((run) => run.cases[index].checkpoints[checkpoint]);
      const strokes = runs.flatMap((run) => {
        const item = run.cases[index];
        return entry.kind === "islands"
          ? item.islandStrokes[checkpoint].strokes
          : item.strokes.slice(
              item.checkpoints[checkpoint - 1]?.strokeCount ?? 0,
              item.checkpoints[checkpoint].strokeCount,
            );
      });
      growthRows.push({
        variant,
        kind: entry.kind,
        span,
        trials: runs.length,
        totalMs: stats(strokes.map((s) => s.totalMs)),
        stageMs: stats(strokes.map((s) => s.stageMs)),
        rebuildMs: stats(strokes.map((s) => s.rebuildMs)),
        workingBytes: stats(strokes.map((s) => s.workingBytes)),
        undoMs: stats(rows.map((s) => s.undoMs)),
        redoMs: stats(rows.map((s) => s.redoMs)),
        peakRSSKiB: peakRSS(runs),
        checkpoint: rows[0],
      });
    }
  }
}

const masters = reports.filter((row) => row.suite === "masters");
const masterRows = [];
for (const [variant, runs] of groups(masters)) {
  const all = runs.flatMap((run) => run.rows);
  const ratios = {};
  for (const name of ["8.3a-string", "8.3b-linear", "8.3b-paged"]) {
    ratios[name] = {};
    for (const trace of Object.keys(all[0].timings)) {
      const warm = all.flatMap((row) =>
        row.timings[trace].slice(2).map((pass) => pass[name] / pass.dense),
      );
      const gate = trace.startsWith("stamp") ? 1.5 : 3;
      const caseMedians = all.map((row) =>
        percentile(
          row.timings[trace].slice(2).map((pass) => pass[name] / pass.dense),
          0.5,
        ),
      );
      ratios[name][trace] = {
        ...stats(warm),
        cases: caseMedians.length,
        caseMediansAboveGate: caseMedians.filter((ratio) => ratio > gate).length,
        maxCaseMedian: Math.max(...caseMedians),
      };
    }
  }
  masterRows.push({
    variant,
    trials: runs.length,
    ratios,
    peakRSSKiB: peakRSS(runs),
    linearCoResidentRatio: stats(
      all.map(
        (r) => (r.coResidentMasterAndTargetBytes + r.linearCacheBytes) / r.denseValuesScratchBytes,
      ),
    ),
    pagedCoResidentRatio: stats(
      all.map(
        (r) => (r.coResidentMasterAndTargetBytes + r.pagedCacheBytes) / r.denseValuesScratchBytes,
      ),
    ),
    codecValuesRatio: stats(
      all.map((r) => (r.codec.payloadBytes + r.codec.indexBytes) / r.valuesBytes),
    ),
    modeledCodecAndLinearCacheVsValues: stats(
      all.map(
        (r) =>
          (r.codec.payloadBytes +
            r.codec.indexBytes +
            r.codec.codecTypedScratchBytes +
            r.linearCacheBytes) /
          r.valuesBytes,
      ),
    ),
    unionSentinelDifferences: all.reduce((sum, r) => sum + r.unionSentinelDifferences, 0),
    subtractSentinelDifferences: all.reduce((sum, r) => sum + r.subtractSentinelDifferences, 0),
  });
}
console.log(
  JSON.stringify({ identity: manifest.identity, compactRows, growthRows, masterRows }, null, 2),
);
