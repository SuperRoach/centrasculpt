import "./compile-core.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const { IndependentLayers } = await import("../work/test-build/independent-layers.mjs");
const { createBaseProject } = await import("../work/test-build/layers.mjs");
const { SDFVolume } = await import("../work/test-build/sdf.mjs");
const settings = {
  mode: "add",
  radius: 0.12,
  strength: 0.5,
  hardness: 0.5,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
const results = [];
for (const cap of [64, 128, 192]) {
  const v = new SDFVolume(64, 1.6, false);
  v.values.fill(6.4);
  const l = new IndependentLayers(createBaseProject(v, settings));
  try {
    const box = await l.regeneratePrimitive({ kind: "box", width: 0.4, height: 0.3, depth: 0.1 });
    const cutter = await l.regeneratePrimitive({ kind: "cylinder", diameter: 0.03, height: 0.2 });
    const pose = structuredClone(cutter.transform);
    pose.rotation[0] = Math.PI / 2;
    l.setActiveTransform(pose);
    l.setBooleanModifiers(box.id, [
      { id: "hole", sourceId: cutter.id, operation: "difference", enabled: true },
    ]);
    l.composite.setQuality(cap);
    for (let i = 0; i < 3; i++) {
      l.select(cutter.id);
      const t = structuredClone(cutter.transform);
      t.position[0] = i * 0.03;
      l.setActiveTransform(t);
      const start = performance.now();
      await l.composite.flush();
      results.push({
        cap,
        iteration: i,
        wallMs: performance.now() - start,
        ...l.composite.stats,
        trackedBytes: l.trackedBytes + l.composite.trackedBytes,
      });
    }
  } finally {
    l.dispose();
  }
}
mkdirSync("work/phase-6-3", { recursive: true });
writeFileSync(
  "work/phase-6-3/benchmark.json",
  `${JSON.stringify({ node: process.version, fixture: "40x30x10mm box minus rotated 3x20mm cylinder; 64^3 empty base", scope: "Host CPU wall and tracked allocations; not GPU/RSS or Quest frame timing", results }, null, 2)}\n`,
);
console.table(
  results.map(
    ({
      cap,
      iteration,
      wallMs,
      maxSamplingSliceMs,
      maxMeshingSliceMs,
      triangles,
      trackedBytes,
      capped,
    }) => ({
      cap,
      iteration,
      wallMs,
      maxSamplingSliceMs,
      maxMeshingSliceMs,
      triangles,
      trackedBytes,
      capped,
    }),
  ),
);
