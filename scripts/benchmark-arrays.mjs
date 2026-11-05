import { mkdirSync, writeFileSync } from "node:fs";
import { prepareLayerSampler } from "../work/test-build/compositor.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { validateArrayDefinition } from "../work/test-build/object-array.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { identityTransform } from "../work/test-build/transform.mjs";

const settings = {
  mode: "add",
  radius: 0.12,
  strength: 0.5,
  hardness: 0.5,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
const percentile = (values, p) =>
  [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
const rows = [];
for (const count of [4, 8]) {
  const base = new SDFVolume(17, 1.6, false);
  base.values.fill(6.4);
  const layers = new IndependentLayers(createBaseProject(base, structuredClone(settings)));
  try {
    const source = await layers.regeneratePrimitive({
      kind: "cylinder",
      diameter: 0.08,
      height: 0.12,
    });
    const pose = identityTransform();
    pose.position = [0.24, 0, 0];
    pose.rotation[0] = Math.PI / 2;
    layers.select(source.id);
    layers.setActiveTransform(pose);
    layers.setArrayDefinition(
      source.id,
      validateArrayDefinition({
        id: `benchmark-${count}`,
        kind: "radial",
        enabled: true,
        count,
        totalAngleRadians: Math.PI * 2,
        pivot: [0, 0, 0],
        axis: [0, 0, 1],
        angularOffsetRadians: 0,
        orientation: "retain",
      }),
    );
    const sample = prepareLayerSampler(source),
      points = 40_000,
      timings = [];
    let checksum = 0;
    for (let pass = 0; pass < 11; pass++) {
      const start = performance.now();
      for (let i = 0; i < points; i++) {
        const angle = (i % 720) * (Math.PI / 360),
          radius = 0.2 + (i % 19) * 0.01;
        checksum += sample(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius,
          ((i % 11) - 5) * 0.005,
        );
      }
      const elapsed = performance.now() - start;
      if (pass >= 2) timings.push(elapsed);
    }
    await layers.composite.flush();
    const stats = layers.composite.stats;
    rows.push({
      count,
      samplerQueriesPerPass: points,
      samplerMs: {
        median: percentile(timings, 0.5),
        p95: percentile(timings, 0.95),
        max: Math.max(...timings),
      },
      checksum,
      composite: stats && {
        resolution: stats.resolution,
        triangles: stats.triangles,
        wallMs: stats.elapsedMs,
        maxSamplingSliceMs: stats.maxSamplingSliceMs,
        maxMeshingSliceMs: stats.maxMeshingSliceMs,
        trackedBytes: layers.composite.trackedBytes,
      },
    });
  } finally {
    layers.dispose();
  }
}
const report = {
  date: new Date().toISOString(),
  node: process.version,
  methodology:
    "Nine measured passes of 40,000 prepared source-SDF queries after two warmups; one cooperative derived-mesh build per count. Host CPU only; no headset/GPU measurement.",
  rows,
};
mkdirSync("work/phase-6-5", { recursive: true });
writeFileSync("work/phase-6-5/array-benchmark.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
