import "./compile-core.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { exportPartSTL, inspectAssembly } from "../work/test-build/assembly-tools.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { identityTransform } from "../work/test-build/transform.mjs";

const v = new SDFVolume(17, 1.6, false);
v.values.fill(6.4);
const l = new IndependentLayers(
  createBaseProject(v, {
    mode: "add",
    radius: 0.12,
    strength: 0.5,
    hardness: 0.5,
    camera: { position: [2, 2, 3], target: [0, 0, 0] },
  }),
);
try {
  const a = await l.regeneratePrimitive({ kind: "box", width: 0.2, height: 0.2, depth: 0.2 });
  const pose = identityTransform();
  pose.position = [0.205, 0, 0];
  const b = await l.regeneratePrimitive(
    { kind: "box", width: 0.2, height: 0.2, depth: 0.2 },
    undefined,
    undefined,
    pose,
  );
  for (const part of [a, b]) l.setAssemblyPart(part.id, { clearanceMM: 0.3 });
  const times = [];
  let report;
  for (let i = 0; i < 11; i++) {
    const start = performance.now();
    report = await inspectAssembly(l, a.id, b.id);
    if (i >= 2) times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  const start = performance.now(),
    stl = await exportPartSTL(l, a.id),
    exportMs = performance.now() - start;
  const result = {
    scope: "Host CPU only; no physical Quest/GPU/thermal measurement",
    node: process.version,
    runs: 9,
    warmups: 2,
    fitMedianMs: times[4],
    fitP95Ms: times[8],
    samples: report.samples,
    gapMM: report.minimumSeparationMM,
    resolutionMM: report.effectiveResolutionMM,
    exportMs,
    triangles: stl.report.triangles,
    dimensionsMM: stl.report.dimensions,
  };
  mkdirSync("work/phase-6-6", { recursive: true });
  writeFileSync("work/phase-6-6/assembly-benchmark.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  l.dispose();
}
