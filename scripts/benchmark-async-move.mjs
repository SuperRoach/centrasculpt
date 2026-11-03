import "./compile-core.mjs";
import { writeFileSync } from "node:fs";
import { Vector3 } from "three";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { RadialMoveField } from "../work/test-build/move-field.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { BrowserWorker } from "./fixtures/node-browser-worker.mjs";

globalThis.Worker = BrowserWorker;
const rows = [],
  settings = {
    mode: "add",
    radius: 0.22,
    strength: 0.35,
    hardness: 0.5,
    camera: { position: [2, 2, 3], target: [0, 0, 0] },
  };
for (const resolution of [64, 114, 192])
  for (const mode of ["non-elastic", "elastic", "rotate", "twist"]) {
    const volume = new SDFVolume(resolution);
    if (resolution === 192) for (let i = 0; i < volume.values.length; i++) volume.values[i] -= 0.1;
    const layers = new IndependentLayers(createBaseProject(volume, settings)),
      field = new RadialMoveField();
    field.capture(new Vector3(0, 0, resolution === 192 ? 0.95 : 0.85), 0.2, 2, 1);
    field.setDisplacement(new Vector3(0.15, 0.03, 0.2));
    if (mode === "elastic") field.configure(mode);
    if (mode === "rotate" || mode === "twist") {
      field.interaction = mode;
      field.setRotation(new Vector3(0, 1, 0), 0.4);
    }
    const owner = {},
      gaps = [],
      before = process.memoryUsage();
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      gaps.push(now - last);
      last = now;
    }, 5);
    layers.beginPreview(owner);
    const vertices = layers.active.triangles * 3,
      start = performance.now();
    let error = "";
    try {
      await layers.commitMove(owner, field, new AbortController().signal);
    } catch (e) {
      error = e.message;
    } finally {
      clearInterval(timer);
      layers.endPreview(owner);
    }
    const sorted = [...gaps].sort((a, b) => a - b),
      p = (q) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1)] ?? null;
    rows.push({
      resolution,
      mode,
      vertices,
      error,
      wallMs: performance.now() - start,
      stats: layers.lastMoveStats,
      eventLoopGapMs: {
        samples: gaps.length,
        p50: p(0.5),
        p95: p(0.95),
        p99: p(0.99),
        max: sorted.at(-1),
      },
      memoryBefore: before,
      memoryAfter: process.memoryUsage(),
    });
    console.log(resolution, mode, rows.at(-1).wallMs.toFixed(1), error);
    layers.dispose();
  }
writeFileSync(
  "outputs/phase-2-4-worker-benchmark.json",
  JSON.stringify(
    {
      scope:
        "Mac Node worker_threads adapter running actual browser worker module. 5ms timer gaps are event loop observations, not XR frames. Single operation per case; percentiles are within-operation timer samples. Process counters are checkpoints, not peak/GPU memory. Cold worker per job; startup included in waitMs. radius .2.",
      rows,
    },
    null,
    2,
  ) + "\n",
);
