import "./compile-core.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const { IndependentLayers } = await import("../work/test-build/independent-layers.mjs");
const { createBaseProject } = await import("../work/test-build/layers.mjs");
const { SDFVolume } = await import("../work/test-build/sdf.mjs");
const settings = {
  mode: "add",
  radius: 0.2,
  strength: 0.5,
  hardness: 0.5,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
const results = [];
const percentile = (a, p) =>
  [...a].sort((a, b) => a - b)[Math.min(a.length - 1, Math.floor(a.length * p))];
for (const resolution of [64, 128])
  for (const source of [
    { kind: "box", width: 0.5, height: 0.6, depth: 0.4 },
    { kind: "cylinder", diameter: 0.5, height: 0.6 },
    { kind: "sphere", diameter: 0.5 },
  ]) {
    const v = new SDFVolume(resolution, 1.6, false);
    v.values.fill(6.4);
    const l = new IndependentLayers(createBaseProject(v, settings));
    try {
      const start = performance.now(),
        p = await l.regeneratePrimitive(source),
        creationMs = performance.now() - start,
        times = [];
      for (let i = 0; i < 9; i++) {
        const t = performance.now();
        await l.regeneratePrimitive(
          { ...source, [source.kind === "box" ? "width" : "diameter"]: 0.5 + i * 0.01 },
          p.id,
        );
        times.push(performance.now() - t);
      }
      const bakeStart = performance.now();
      await l.bake({
        name: "Benchmark Bake",
        resolution: p.volume.resolution,
        sourceIds: [p.id],
        hideSources: true,
      });
      results.push({
        hostResolution: resolution,
        kind: source.kind,
        cacheResolution: p.volume.resolution,
        creationMs,
        editMedianMs: percentile(times, 0.5),
        editP95Ms: percentile(times, 0.95),
        bakeMs: performance.now() - bakeStart,
        trackedBytes: l.trackedBytes,
        sourceTriangles: l.runtime(p.id).triangles,
      });
    } finally {
      l.dispose();
    }
  }
mkdirSync("outputs/phase-6-2", { recursive: true });
writeFileSync(
  "outputs/phase-6-2/benchmark.json",
  JSON.stringify(
    {
      host: process.version,
      scope: "Host Node CPU wall times only; excludes browser GPU and physical Quest performance",
      editSamples: 9,
      results,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(results, null, 2));
