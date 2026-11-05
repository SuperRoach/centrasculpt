import { mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { createHeadlessEditor } from "./headless-enclosure.mjs";

const { DEFAULT_ENCLOSURE } = await import("../work/test-build/enclosure-recipe.mjs");
const { exportPartSTL } = await import("../work/test-build/assembly-tools.mjs");
const timings = { create: [], dryRun: [], update: [] };
let memory = 0;
const check = (r) => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.value;
};
for (let i = 0; i < 7; i++) {
  const { layers: l, api } = createHeadlessEditor();
  try {
    let start = performance.now();
    check(
      await api.enclosure.create(DEFAULT_ENCLOSURE, {
        expectedRevision: api.revision,
        dryRun: true,
      }),
    );
    if (i >= 2) timings.dryRun.push(performance.now() - start);
    start = performance.now();
    const result = check(
      await api.enclosure.create(DEFAULT_ENCLOSURE, { expectedRevision: api.revision }),
    );
    if (i >= 2) timings.create.push(performance.now() - start);
    const p = structuredClone(DEFAULT_ENCLOSURE);
    p.lid.clearanceMm = 0.6;
    start = performance.now();
    check(
      await api.enclosure.update(result.partIds.base, result.partIds.lid, p, {
        expectedRevision: api.revision,
      }),
    );
    if (i >= 2) timings.update.push(performance.now() - start);
    memory = Math.max(memory, l.trackedBytes);
  } finally {
    l.dispose();
  }
}
const { layers: l, api } = createHeadlessEditor();
const exports = [];
try {
  const result = check(
    await api.enclosure.create(DEFAULT_ENCLOSURE, { expectedRevision: api.revision }),
  );
  for (const [role, id] of Object.entries(result.partIds)) {
    const start = performance.now(),
      out = await exportPartSTL(l, id, undefined, "high");
    exports.push({
      role,
      elapsedMs: performance.now() - start,
      bytes: out.data.byteLength,
      report: out.report,
    });
  }
} finally {
  l.dispose();
}
const stats = Object.fromEntries(
  Object.entries(timings).map(([key, values]) => {
    const v = [...values].sort((a, b) => a - b);
    return [key, { medianMs: v[2], p95Ms: v.at(-1), samplesMs: values }];
  }),
);
const output = {
  node: process.version,
  cpu: cpus()[0].model,
  warmups: 2,
  observations: 5,
  stats,
  trackedSourceAndHistoryBytes: memory,
  exports,
  limitations:
    "Host CPU only. Five-sample p95 is maximum observed. No JS/process/GPU peak or headset timing/physical print acceptance.",
};
mkdirSync("work/phase-7-1", { recursive: true });
writeFileSync("work/phase-7-1/benchmark.json", JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));
