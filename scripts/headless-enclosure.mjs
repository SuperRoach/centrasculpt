// Run from repository root: node scripts/headless-enclosure.mjs [output.form]
// Uses the same TypeScript compiler harness as Node tests; no browser or XR required.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import "./compile-core.mjs";

const { IndependentLayers } = await import("../work/test-build/independent-layers.mjs");
const { createBaseProject } = await import("../work/test-build/layers.mjs");
const { ModellingAPI } = await import("../work/test-build/modelling-api.mjs");
const { SDFVolume } = await import("../work/test-build/sdf.mjs");
const { saveSculptProject } = await import("../work/test-build/project.mjs");

export function createHeadlessEditor() {
  const volume = new SDFVolume(17, 1.6, false);
  volume.values.fill(6.4);
  const layers = new IndependentLayers(
    createBaseProject(volume, {
      mode: "add",
      radius: 0.12,
      strength: 0.5,
      hardness: 0.5,
      camera: { position: [2, 2, 3], target: [0, 0, 0] },
    }),
  );
  return { layers, api: new ModellingAPI(layers) };
}
export const enclosureSteps = [
  {
    as: "body",
    command: {
      type: "primitive.create",
      unit: "mm",
      source: { kind: "box", width: 50, height: 20, depth: 40 },
    },
  },
  { command: { type: "object.rename", id: "$body", name: "Enclosure body" } },
  {
    as: "cutter",
    command: {
      type: "primitive.create",
      unit: "mm",
      source: { kind: "cylinder", diameter: 12, height: 30 },
    },
  },
  {
    command: { type: "boolean.create", id: "$body", sourceId: "$cutter", operation: "difference" },
  },
  { command: { type: "part.define", objectId: "$body", clearanceMM: 0.3 } },
  { command: { type: "part.assign", objectId: "$cutter", partId: "$body" } },
];
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { layers, api } = createHeadlessEditor();
  try {
    const start = performance.now();
    const preview = await api.batch(enclosureSteps, {
      expectedRevision: api.revision,
      dryRun: true,
    });
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    const result = await api.batch(enclosureSteps, { expectedRevision: api.revision });
    if (!result.ok) throw new Error(JSON.stringify(result));
    const output = process.argv[2] ?? "work/phase-7-0/headless-enclosure.form";
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, new Uint8Array(saveSculptProject(layers.project)));
    const diagnostics = await api.diagnostics({ id: result.value.aliases.body });
    console.log(
      JSON.stringify(
        {
          output,
          elapsedMS: performance.now() - start,
          scene: api.query({ type: "object.list" }),
          diagnostics,
        },
        null,
        2,
      ),
    );
  } finally {
    layers.dispose();
  }
}
