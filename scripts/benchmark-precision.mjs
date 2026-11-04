import { mkdirSync, writeFileSync } from "node:fs";

await import("./compile-core.mjs");
const { IndependentLayers } = await import("../work/test-build/independent-layers.mjs");
const { createBaseProject } = await import("../work/test-build/layers.mjs");
const { SDFVolume } = await import("../work/test-build/sdf.mjs");
const { PrecisionTools, selectionDimensions, measurementHit } = await import(
  "../work/test-build/precision-tools.mjs"
);
const { Raycaster, Vector3 } = await import("three");
const settings = {
  mode: "add",
  radius: 0.2,
  strength: 0.7,
  hardness: 0.3,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
const rows = [];
for (const resolution of [64, 128]) {
  const l = new IndependentLayers(createBaseProject(new SDFVolume(resolution), settings)),
    p = new PrecisionTools(() => l);
  p.sync();
  try {
    const ray = new Raycaster(new Vector3(0, 0, 4), new Vector3(0, 0, -1)),
      surfaces = [l.active.surface.group];
    const measure = (fn, n) => {
      const samples = [];
      for (let i = 0; i < n; i++) {
        const start = performance.now();
        fn();
        samples.push(performance.now() - start);
      }
      samples.sort((a, b) => a - b);
      return {
        iterations: n,
        medianMs: samples[Math.floor(n / 2)],
        p95Ms: samples[Math.floor(n * 0.95)],
      };
    };
    const raycast = measure(() => measurementHit(ray, surfaces, l.group), 50),
      dimensions = measure(() => selectionDimensions(l), 50);
    const history = l.undoCount;
    p.start(2);
    const annotations = measure(() => {
      p.pick(ray);
      p.pick(ray);
    }, 32);
    p.start(0);
    const unchangedSync = measure(() => p.sync(), 10000);
    rows.push({
      resolution,
      raycast,
      dimensions,
      annotations,
      unchangedSync,
      annotationsRetained: p.settings.measurements.length,
      historyDelta: l.undoCount - history,
    });
  } finally {
    p.dispose();
    l.dispose();
  }
}
const result = {
  scope:
    "Single host Node run; committed sphere surfaces. Event-triggered raycast, full bounds traversal and annotation rebuild. Annotation run accumulates 32 records without canvas/GPU labels. Unchanged sync measures identity/reparent guard only. No Quest CPU/GPU/frame-time claim.",
  node: process.version,
  rows,
};
mkdirSync("outputs/phase-6-1", { recursive: true });
writeFileSync("outputs/phase-6-1/benchmark.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
