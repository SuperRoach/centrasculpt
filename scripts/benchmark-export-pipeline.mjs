// Disposable fixtures only. Single observations, not medians or hardware acceptance.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";

if (!process.argv.includes("--child")) {
  await import("./compile-core.mjs");
  const rows = [];
  for (const name of ["clay", "curved-192", "holder-443", "boolean-array"]) {
    const child = spawnSync(process.execPath, [import.meta.filename, "--child", name], {
      encoding: "utf8",
      maxBuffer: 4 * 1024 ** 2,
    });
    if (child.status !== 0) throw new Error(child.stderr || child.stdout);
    rows.push(JSON.parse(child.stdout));
  }
  await mkdir("work/phase-7-5-3", { recursive: true });
  const result = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    method:
      "One isolated Node process per fixture. Sampling/meshing are compositor compute time; other durations include cooperative waits. Same production algorithms as 7.5.2; Fast/High is a quality comparison, not a before/after speedup. Max RSS includes fixture setup and both qualities; tracked/admission bytes are not RSS. File writes are local Node writes, not browser download completion. Surface probes are field residuals at vertices and centroids, not Hausdorff or clearance guarantees.",
    rows,
  };
  await writeFile("work/phase-7-5-3/profile.json", JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}
const name = process.argv.at(-1);
const { Vector3 } = await import("three");
const { prepareBooleanExport } = await import("../work/test-build/boolean-export.mjs");
const { prepareComposite } = await import("../work/test-build/compositor.mjs");
const { IndependentLayers } = await import("../work/test-build/independent-layers.mjs");
const { LayerStack, SculptProject, SdfLayer } = await import("../work/test-build/layers.mjs");
const { evaluatePrimitive } = await import("../work/test-build/parametric-primitive.mjs");
const { physicalExportDimensionsMM } = await import("../work/test-build/physical-units.mjs");
const { saveSculptProject } = await import("../work/test-build/project.mjs");
const { SDFVolume } = await import("../work/test-build/sdf.mjs");
const { encodeSTL } = await import("../work/test-build/stl-export.mjs");
const { STLLoader } = await import("three/addons/loaders/STLLoader.js");
const { identityTransform, transformMatrix } = await import("../work/test-build/transform.mjs");
const settings = {
  mode: "add",
  radius: 0.22,
  strength: 0.35,
  hardness: 0.5,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
const box = (width, height, depth, order, position = [0, 0, 0], operation = "union") => {
  const primitive = { kind: "box", width, height, depth },
    g = evaluatePrimitive(primitive, 33, 1e6);
  let r = g.next();
  while (!r.done) r = g.next();
  return new SdfLayer(r.value, {
    primitive,
    order,
    operation,
    transform: { ...identityTransform(), position },
  });
};
let layers;
if (name === "holder-443" || name === "boolean-array") {
  layers = [
    box(4.43, 0.56, 1.5, 0, [0, -0.4, 0]),
    box(4, 0.6, 1.1, 1),
    ...[-1.25, 0, 1.25].map((x, i) =>
      box(name === "boolean-array" ? 0.45 : 0.18, 0.75, 0.7, i + 2, [x, 0.2, 0], "difference"),
    ),
  ];
  if (name === "boolean-array") {
    layers[2] = box(0.45, 0.75, 0.7, 2, [-1.25, 0.2, 0], "difference");
    layers[2].array = {
      enabled: true,
      kind: "linear",
      id: "profile-cutters",
      count: 3,
      spacingModelUnits: 1.25,
      centered: false,
      axis: [1, 0, 0],
    };
  }
} else {
  const n = name === "curved-192" ? 192 : 65,
    v = new SDFVolume(n, 1.6, false);
  for (let z = 0; z < n; z++)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const px = v.coordinate(x),
          py = v.coordinate(y),
          pz = v.coordinate(z);
        v.values[v.index(x, y, z)] = Math.hypot(px + 0.15 * Math.sin(py * 4), py, pz) - 0.85;
      }
  layers = [new SdfLayer(v)];
}
const editor = new IndependentLayers(
  new SculptProject(new LayerStack(layers), structuredClone(settings)),
);
const before = saveSculptProject(editor.project),
  history = editor.undoCount;
const row = { name, budgetMiB: 512, qualities: [] };
let prepared;
try {
  const start = performance.now();
  prepared = await prepareBooleanExport(
    editor,
    editor.project,
    undefined,
    true,
    undefined,
    512 * 1024 ** 2,
    192,
  );
  row.preparationWallMs = performance.now() - start;
  row.preparation = prepared.profile;
  row.resolution = prepared.resolution;
  row.preparedTriangles = prepared.sources.reduce(
    (n, s) => n + s.chunks.reduce((n, c) => n + c.positions.length / 9, 0),
    0,
  );
  row.availableBytes = prepared.availableBytes();
  const dims = physicalExportDimensionsMM(prepared.sources, 100),
    field = prepareComposite(editor.project.layerStack.compositionLayers);
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity],
    point = new Vector3();
  for (const source of prepared.sources)
    for (const chunk of source.chunks) {
      const matrix = transformMatrix(source.transform);
      for (let i = 0; i < chunk.positions.length; i += 3) {
        point.fromArray(chunk.positions, i).applyMatrix4(matrix);
        for (let a = 0; a < 3; a++) {
          min[a] = Math.min(min[a], point.getComponent(a));
          max[a] = Math.max(max[a], point.getComponent(a));
        }
      }
    }
  const center = min.map((v, a) => (v + max[a]) / 2);
  for (const quality of ["fast", "high"]) {
    try {
      const result = await encodeSTL(
        prepared.sources,
        quality,
        prepared.availableBytes(),
        Math.max(...dims),
      );
      const parsed = new STLLoader().parse(result.data),
        p = parsed.getAttribute("position").array;
      assert.equal(p.length / 9, result.report.triangles);
      // Keep rejected topology in the evidence; never present it as a printable pass.
      let probeResidualMM = 0;
      // Every triangle centroid plus every vertex, evaluated against the original ordered field.
      for (let i = 0; i < p.length; i += 9) {
        for (let k = 0; k < 4; k++) {
          const probe = [0, 1, 2].map(
            (a) =>
              (k < 3 ? p[i + k * 3 + a] : (p[i + a] + p[i + a + 3] + p[i + a + 6]) / 3) / 100 +
              center[a],
          );
          probeResidualMM = Math.max(probeResidualMM, Math.abs(field(...probe)) * 100);
        }
      }
      parsed.dispose();
      await mkdir("work/phase-7-5-3", { recursive: true });
      const writeStart = performance.now();
      await writeFile(`work/phase-7-5-3/${name}-${quality}.stl`, new Uint8Array(result.data));
      row.qualities.push({
        quality,
        blocked: result.report.blocking.length > 0,
        ...result,
        data: undefined,
        stats: result.stats,
        probeResidualMM,
        fileWriteMs: performance.now() - writeStart,
        outputBytes: result.data.byteLength,
      });
    } catch (e) {
      row.qualities.push({ quality, refused: e.message });
    }
  }
} catch (e) {
  row.refused = e.message;
} finally {
  assert.deepEqual(saveSculptProject(editor.project), before);
  assert.equal(editor.undoCount, history);
  row.maxRssMiB = process.resourceUsage().maxRSS / 1024;
  prepared?.dispose();
  editor.dispose();
}
console.log(JSON.stringify(row));
