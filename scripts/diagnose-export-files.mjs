// Post-export diagnostics. Timings/RSS here are deliberately separate from benchmark runs.
import assert from "node:assert/strict";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Box3, Vector3 } from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import "./compile-core.mjs";
import { prepareComposite } from "../work/test-build/compositor.mjs";
import { openSculptProject } from "../work/test-build/project.mjs";
import { validatePrintMesh } from "../work/test-build/stl-export.mjs";
import { readGlb } from "./fixtures/export-node.mjs";
import { silhouetteMasks, silhouettePNG } from "./fixtures/export-silhouette.mjs";

const directory = process.argv[2];
if (!directory)
  throw new Error(
    "Usage: node scripts/diagnose-export-files.mjs OUTPUT_DIRECTORY [NATIVE_COPY.form]",
  );
const native = process.argv[3] ? await readFile(process.argv[3]) : undefined;
const project = native
  ? openSculptProject(native.buffer.slice(native.byteOffset, native.byteOffset + native.byteLength))
  : undefined;
const field = project ? prepareComposite(project.layerStack.compositionLayers) : undefined;
const calibration = project?.displayPreferences?.precision?.millimetresPerUnit ?? 100;
const rows = [],
  masksByName = new Map();
for (const file of (await readdir(directory)).filter((f) => /\.(stl|glb)$/.test(f)).sort()) {
  const bytes = await readFile(join(directory, file));
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  let p;
  if (file.endsWith(".stl")) {
    const geometry = new STLLoader().parse(data);
    p = new Float32Array(geometry.getAttribute("position").array);
    geometry.dispose();
  } else {
    const loaded = await readGlb(data),
      positions = [];
    loaded.scene.updateMatrixWorld(true);
    loaded.scene.traverse((o) => {
      if (!o.isMesh) return;
      const a = o.geometry.getAttribute("position"),
        indices = o.geometry.index,
        v = new Vector3();
      for (let i = 0; i < (indices?.count ?? a.count); i++) {
        v.fromBufferAttribute(a, indices?.getX(i) ?? i)
          .applyMatrix4(o.matrixWorld)
          .multiplyScalar(1000);
        positions.push(v.x, v.y, v.z);
      }
      o.geometry.dispose();
    });
    p = new Float32Array(positions);
  }
  const bounds = new Box3();
  for (let i = 0; i < p.length; i += 3) bounds.expandByPoint(new Vector3().fromArray(p, i));
  const dimensions = bounds.getSize(new Vector3()).toArray(),
    center = bounds.getCenter(new Vector3()).toArray();
  const row = {
    file,
    bytes: bytes.length,
    triangles: p.length / 9,
    decodedDimensionsMM: dimensions,
  };
  if (p.length / 9 <= 600000) row.topology = await validatePrintMesh(p);
  else row.topologyRefused = "Decoded topology diagnostic retains the 600,000 triangle limit.";
  // GLB retains world origin; STL is centred by its encoder and requires source bounds
  // to invert. STL residuals therefore come from the benchmark harness, not this pass.
  if (field && file.endsWith(".glb")) {
    let residual = 0;
    for (let i = 0; i < p.length; i += 9)
      for (let k = 0; k < 4; k++) {
        const probe = [0, 1, 2].map(
          (a) =>
            (k < 3 ? p[i + k * 3 + a] : (p[i + a] + p[i + a + 3] + p[i + a + 6]) / 3) / calibration,
        );
        residual = Math.max(residual, Math.abs(field(...probe)) * calibration);
      }
    row.fieldResidualMM = residual;
  }
  for (let i = 0; i < p.length; i++) p[i] -= center[i % 3];
  const masks = silhouetteMasks(p, Math.max(...dimensions));
  masksByName.set(file, masks);
  row.silhouettePixels = masks.map((m) => m.reduce((n, v) => n + v, 0));
  await writeFile(join(directory, `${file}.png`), silhouettePNG(masks));
  rows.push(row);
}
const comparisons = [];
for (const [file, fast] of masksByName) {
  if (!file.includes("-fast.")) continue;
  const high = masksByName.get(file.replace("-fast.", "-high."));
  if (high)
    comparisons.push({
      fast: file,
      high: file.replace("-fast.", "-high."),
      differentPixels: fast.map((m, a) => m.reduce((n, v, i) => n + Number(v !== high[a][i]), 0)),
      raster:
        "Three 300×300 orthographic projections, 260 pixels per longest extent. Separate recentering/bounds normalisation can conceal size differences: use numeric bounds checks too.",
    });
}
if (native) assert.deepEqual(await readFile(process.argv[3]), native);
await writeFile(
  join(directory, "decoded-diagnostics.json"),
  JSON.stringify(
    {
      method:
        "Post-export, transformed Float32 coordinates in mm; GLB diagnostic topology is not a product print report or a repair. STL residuals stay in benchmark.json. Three projections cannot prove Hausdorff distance or print fit.",
      rows,
      comparisons,
      maxRssMiB: process.resourceUsage().maxRSS / 1024,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ files: rows.length, comparisons }, null, 2));
