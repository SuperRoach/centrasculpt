import { cpus } from "node:os";
import { createHeadlessEditor, enclosureSteps } from "./headless-enclosure.mjs";

const samples = { batchMS: [], dryRunMS: [], queryMS: [] };
let trackedBytes = 0;
for (let i = 0; i < 11; i++) {
  const { layers, api } = createHeadlessEditor();
  try {
    let start = performance.now();
    const preview = await api.batch(enclosureSteps, {
      expectedRevision: api.revision,
      dryRun: true,
    });
    const dryRunMS = performance.now() - start;
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    start = performance.now();
    const result = await api.batch(enclosureSteps, { expectedRevision: api.revision });
    const batchMS = performance.now() - start;
    if (!result.ok) throw new Error(JSON.stringify(result));
    start = performance.now();
    for (let j = 0; j < 1000; j++) JSON.stringify(api.query({ type: "object.list" }));
    const queryMS = (performance.now() - start) / 1000;
    trackedBytes = layers.trackedBytes;
    if (i >= 2) {
      samples.batchMS.push(batchMS);
      samples.dryRunMS.push(dryRunMS);
      samples.queryMS.push(queryMS);
    }
  } finally {
    layers.dispose();
  }
}
const summary = Object.fromEntries(
  Object.entries(samples).map(([name, values]) => {
    const sorted = [...values].sort((a, b) => a - b);
    return [name, { median: sorted[4], p95: sorted[8] }];
  }),
);
console.log(
  JSON.stringify(
    {
      node: process.version,
      cpu: cpus()[0].model,
      warmups: 2,
      samples,
      summary,
      trackedBytes,
      limitations:
        "Host CPU only; source runtime tracking excludes JS/GPU/process peak memory. Nine samples; p95 is maximum sample. No headset or physical printing measurement.",
    },
    null,
    2,
  ),
);
