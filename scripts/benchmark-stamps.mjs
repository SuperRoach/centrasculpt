import "./compile-core.mjs";
import { writeFileSync } from "node:fs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { defineShape, SHAPE_KINDS } from "../work/test-build/shapes.mjs";

const settings = {
    mode: "add",
    radius: 0.22,
    strength: 0.35,
    hardness: 0.5,
    camera: { position: [2.4, 1.7, 3.3], target: [0, 0, 0] },
  },
  rows = [];
for (const resolution of [64, 128, 192]) {
  const c = new IndependentLayers(createBaseProject(new SDFVolume(resolution), settings));
  try {
    for (const kind of SHAPE_KINDS)
      for (const operation of ["add", "subtract"]) {
        const definition = defineShape({
          kind,
          operation,
          targetLayerId: c.project.activeLayerId,
          dimensions: [0.5, 0.5, 0.5],
          transform: { position: [0.25, 0.15, 0.75], rotation: [0.2, 0.35, 0.1], scale: [1, 1, 1] },
        });
        c.stampShape(definition);
        const stats = { ...c.lastStampStats };
        const start = performance.now();
        c.undo();
        const undoMs = performance.now() - start;
        const row = {
          resolution,
          kind,
          operation,
          ...stats,
          undoMs,
          undoChunks: c.active.lastChanged,
        };
        rows.push(row);
        console.log(
          `${resolution} ${kind} ${operation}: evaluate ${stats.evaluationMs.toFixed(1)}, mesh ${stats.meshingMs.toFixed(1)}, total ${stats.totalMs.toFixed(1)} ms; ${stats.chunks}/${stats.totalChunks} chunks`,
        );
      }
  } finally {
    c.dispose();
  }
}
writeFileSync(
  "outputs/phase-1-11-stamp-benchmarks.json",
  JSON.stringify(
    {
      description:
        "Single command per primitive/operation/resolution after source mesh construction, restored by exact undo. CPU Node only, uncontrolled machine load; excludes UI, rendering and asynchronous Boolean preview. Exact far-field CSG changes may scan the whole dense grid; sampling culled with conservative AABB distance bounds. Total includes sparse history allocation/write/commit and local remesh.",
      runtime: process.version,
      rows,
    },
    null,
    2,
  ) + "\n",
);
