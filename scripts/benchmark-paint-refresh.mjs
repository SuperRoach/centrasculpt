import "./compile-core.mjs";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";

const { PaintSurface } = await import("../work/test-build/paint-surface.mjs");

import { sculptPaint } from "../work/test-build/sculpt-paint.mjs";
import { PaintSurface as Baseline } from "./fixtures/phase52-paint-baseline.mjs";

const rows = [];
const q = (a) => {
  a.sort((a, b) => a - b);
  return {
    p50: a[Math.ceil(a.length * 0.5) - 1],
    p95: a[Math.ceil(a.length * 0.95) - 1],
    p99: a[Math.ceil(a.length * 0.99) - 1],
    max: a.at(-1),
  };
};
for (const n of [64, 128, 192]) {
  const l = new IndependentLayers(
      createBaseProject(new SDFVolume(n), {
        mode: "add",
        radius: 0.22,
        strength: 0.35,
        hardness: 0.5,
        camera: { position: [2, 2, 3], target: [0, 0, 0] },
      }),
    ),
    r = l.active;
  const outputs = [],
    timings = [];
  for (const Type of [Baseline, PaintSurface]) {
    for (const m of r.surface.group.children) m.geometry.deleteAttribute("color");
    const surface = new Type();
    sculptPaint(r.volume).clear();
    for (const _ of sculptPaint(r.volume).brush({ x: 0, y: 0, z: 0.8 }, 0.3, 0.5, 0.5, false)) {
    }
    const t = performance.now();
    surface.update(r.surface.group, r.volume, r.material, -Infinity, r.surface.revision);
    const firstMs = performance.now() - t;
    const initialAttributeBytes = r.surface.group.children.reduce(
      (n, m) => n + (m.geometry.getAttribute("color")?.array.byteLength ?? 0),
      0,
    );
    surface.update(r.surface.group, r.volume, r.material, Infinity, r.surface.revision);
    const completionMs = performance.now() - t;
    outputs.push(
      r.surface.group.children.map((m) => m.geometry.getAttribute("color").array.slice()),
    );
    const samples = [];
    for (let i = 0; i < 1200; i++) {
      const t = performance.now();
      surface.update(r.surface.group, r.volume, r.material, Infinity, r.surface.revision);
      if (i >= 200) samples.push(performance.now() - t);
    }
    timings.push({ firstMs, initialAttributeBytes, completionMs, idleMs: q(samples) });
  }
  assert.deepEqual(outputs[0], outputs[1]);
  rows.push({
    resolution: n,
    baseline: timings[0],
    optimized: timings[1],
    exactColours: true,
    resources: l.resourceStats(),
  });
  l.dispose();
}
writeFileSync(
  "outputs/phase-5-2/paint-ab.json",
  JSON.stringify(
    { scope: "Node CPU; same geometry, 200 warmup + 1000 idle calls; no GPU/headset timing", rows },
    null,
    2,
  ),
);
console.log(JSON.stringify(rows, null, 2));
