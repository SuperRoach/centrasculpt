// Run after npm test (uses its transpiled modules). CPU timings exclude XR/GPU/browser.
import { writeFileSync } from "node:fs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";

const settings = {
  mode: "add",
  radius: 0.14,
  strength: 0.35,
  hardness: 0.6,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
const percentile = (a, p) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)];
const results = [];
for (const n of [64, 128]) {
  const v = new SDFVolume(n, 1.6, false);
  v.values.fill(6.4);
  const c = new IndependentLayers(createBaseProject(v, settings)),
    brush = [],
    mesh = [];
  let changed = 0;
  c.beginStroke();
  for (let i = 0; i < 90; i++) {
    const t = Math.PI + (i * Math.PI) / 89,
      start = performance.now();
    c.applyStrokeLocal(
      { x: 0.6 * Math.cos(t), y: 0.15 + 0.6 * Math.sin(t), z: 0 },
      0.14,
      "add",
      0.35,
      1 / 90,
      0.6,
      true,
    );
    brush.push(performance.now() - start);
    if (i % 3 === 0) {
      const start = performance.now();
      c.active.rebuild();
      mesh.push(performance.now() - start);
      changed += c.active.lastChanged;
    }
  }
  const start = performance.now();
  c.finishStroke();
  const finishMs = performance.now() - start;
  c.beginStroke();
  const empty = performance.now();
  for (let i = 0; i < 100; i++)
    c.applyStrokeLocal({ x: 0, y: 1, z: 0 }, 0.14, "smooth", 0.35, 1 / 90, 0.6, true);
  const emptySmoothMs = (performance.now() - empty) / 100;
  c.finishStroke();
  results.push({
    resolution: n,
    gridAndScratchMiB: (2 * n ** 3 * 4) / 1024 ** 2,
    brushMedianMs: percentile(brush, 0.5),
    brushP95Ms: percentile(brush, 0.95),
    brushMaxMs: Math.max(...brush),
    meshMedianMs: percentile(mesh, 0.5),
    meshP95Ms: percentile(mesh, 0.95),
    meshMaxMs: Math.max(...mesh),
    finishMs,
    emptySmoothMs,
    rebuiltChunks: changed,
    totalChunks: c.active.totalChunks,
    triangles: c.active.triangles,
  });
  c.dispose();
}
const report = {
  description:
    "Node CPU measurements, 90 moving samples, mesh every 3 samples; no GPU/XR timing claim",
  results,
};
writeFileSync("outputs/phase-1-13f-1-benchmark.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
