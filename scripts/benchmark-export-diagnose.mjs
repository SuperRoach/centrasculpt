// Research harness. No production algorithms, source files or recovery records are modified.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { cpus, release } from "node:os";
import { parseBenchmarkOptions, summarise } from "./fixtures/export-benchmark-options.mjs";

if (!process.argv.includes("--child")) {
  const options = parseBenchmarkOptions(process.argv.slice(2));
  await import("./compile-core.mjs");
  await mkdir(options.output, { recursive: true });
  options.output = await mkdtemp(`${options.output}/run-`);
  const sourceHashes = {};
  for (const file of [
    "src/boolean-export.ts",
    "src/compositor.ts",
    "src/mesh.ts",
    "src/export-mesh.ts",
    "src/planar-patches.ts",
    "src/stl-export.ts",
    "src/glb-export.ts",
    "scripts/benchmark-export-diagnose.mjs",
  ]) {
    sourceHashes[file] = createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
  }
  const rows = [];
  for (const name of options.native ? [options.label ?? "native-copy"] : options.fixtures)
    for (const resolution of options.resolutions)
      for (const quality of ["fast", "high"])
        for (const format of options.formats)
          for (let repeat = -options.warmup; repeat < options.repeats; repeat++) {
            const config = {
              name,
              resolution,
              quality,
              format,
              repeat,
              output: options.output,
              native: options.native,
              probe: options.probe,
            };
            const child = spawnSync(
              process.execPath,
              [import.meta.filename, "--child", JSON.stringify(config)],
              {
                encoding: "utf8",
                maxBuffer: 8 * 1024 ** 2,
                timeout: 600000,
              },
            );
            if (child.status !== 0)
              throw new Error(child.stderr || child.stdout || String(child.error));
            rows.push(JSON.parse(child.stdout));
            console.error(
              `${name} ${resolution} ${quality} ${format} run ${repeat}: ${rows.at(-1).refused ?? rows.at(-1).pipelineWallMs ?? "encoder refused"}`,
            );
            await writeFile(
              `${options.output}/benchmark.json`,
              JSON.stringify(
                {
                  node: process.version,
                  cpu: cpus()[0]?.model,
                  osRelease: release(),
                  sourceHashes,
                  platform: process.platform,
                  arch: process.arch,
                  options,
                  rows,
                  summary: summarise(rows),
                },
                null,
                2,
              ),
            );
          }
  process.exit(0);
}
const config = JSON.parse(process.argv.at(-1));
const { name, resolution, quality: selectedQuality, format, output } = config;
const setupStart = performance.now();
const { Box3, Vector3 } = await import("three");
const { prepareBooleanExport } = await import("../work/test-build/boolean-export.mjs");
const { prepareComposite } = await import("../work/test-build/compositor.mjs");
const { IndependentLayers } = await import("../work/test-build/independent-layers.mjs");
const { LayerStack, SculptProject, SdfLayer } = await import("../work/test-build/layers.mjs");
const { evaluatePrimitive } = await import("../work/test-build/parametric-primitive.mjs");
const { physicalExportDimensionsMM, physicalGLBSources } = await import(
  "../work/test-build/physical-units.mjs"
);
const { openSculptProject, saveSculptProject } = await import("../work/test-build/project.mjs");
const { SDFVolume } = await import("../work/test-build/sdf.mjs");
const { encodeSTL } = await import("../work/test-build/stl-export.mjs");
const { STLLoader } = await import("three/addons/loaders/STLLoader.js");
const { identityTransform, transformMatrix } = await import("../work/test-build/transform.mjs");
const { ExportWork } = await import("../work/test-build/export-mesh.mjs");
const { encodeExport } = await import("../work/test-build/glb-export.mjs");
const { installFileReader, readGlb } = await import("./fixtures/export-node.mjs");
installFileReader();
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
if (name === "enclosure") {
  layers = [
    box(1.8, 1, 0.8, 0),
    box(1.7, 0.9, 0.8, 1, [0, 0, 0.05], "difference"),
    box(0.08, 0.08, 0.16, 2, [0, 0, -0.39], "difference"),
  ];
} else if (name === "holder-443" || name === "boolean-array") {
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
const native = config.native ? await readFile(config.native) : undefined;
const editor = new IndependentLayers(
  native
    ? openSculptProject(
        native.buffer.slice(native.byteOffset, native.byteOffset + native.byteLength),
      )
    : new SculptProject(new LayerStack(layers), structuredClone(settings)),
);
const before = saveSculptProject(editor.project),
  history = [editor.undoCount, editor.redoCount];
const row = {
  ...config,
  requestedResolution: resolution,
  native: undefined,
  sourcePreparationMs: performance.now() - setupStart,
  budgetMiB: 512,
  nativeInputBytes: native?.length,
  nativeSha256: native ? createHash("sha256").update(native).digest("hex") : undefined,
  qualities: [],
};
const mmPerUnit = editor.project.displayPreferences?.precision?.millimetresPerUnit ?? 100;
row.mmPerUnit = mmPerUnit;
row.memoryBefore = process.memoryUsage();
const pipelineStart = performance.now();
const cpuStart = process.cpuUsage();
let prepared;
let phase = "preparation";
try {
  const start = performance.now();
  prepared = await prepareBooleanExport(
    editor,
    editor.project,
    undefined,
    format === "stl",
    undefined,
    512 * 1024 ** 2,
    resolution,
    config.experimentalChunk,
  );
  row.preparationWallMs = performance.now() - start;
  row.preparation = prepared.profile;
  row.resolution = prepared.resolution;
  row.preparedTriangles = prepared.sources.reduce(
    (n, s) => n + s.chunks.reduce((n, c) => n + c.positions.length / 9, 0),
    0,
  );
  row.availableBytes = prepared.availableBytes();
  row.memoryAfterPreparation = process.memoryUsage();
  const dims = physicalExportDimensionsMM(prepared.sources, mmPerUnit);
  for (const quality of [selectedQuality]) {
    try {
      phase = "encoding";
      const controller = new AbortController();
      if (config.probe === "cancel") controller.abort();
      const work = new ExportWork(controller.signal, () => config.probe !== "stale");
      const available = config.probe === "memory" ? 1 : prepared.availableBytes();
      const result =
        format === "glb"
          ? await encodeExport(
              physicalGLBSources(prepared.sources, mmPerUnit),
              quality,
              available,
              work,
            )
          : await encodeSTL(prepared.sources, quality, available, Math.max(...dims), work);
      row.cpuMicros = process.cpuUsage(cpuStart);
      row.pipelineWallMs = performance.now() - pipelineStart;
      row.memoryAfterEncoding = process.memoryUsage();
      phase = "diagnostics";
      const field = prepareComposite(editor.project.layerStack.compositionLayers);
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

      let parsed, p;
      if (format === "stl") {
        parsed = new STLLoader().parse(result.data);
        p = parsed.getAttribute("position").array;
        assert.equal(p.length / 9, result.report.triangles);
        assert.equal(result.data.byteLength, 84 + result.report.triangles * 50);
        parsed.computeBoundingBox();
        row.encodedDimensions = parsed.boundingBox.getSize(new Vector3()).toArray();
      } else {
        const loaded = await readGlb(result.data);
        row.encodedDimensions = new Box3()
          .setFromObject(loaded.scene)
          .getSize(new Vector3())
          .toArray();
        loaded.scene.traverse((o) => {
          if (o.isMesh) o.geometry.dispose();
        });
      }
      row.units = format === "stl" ? "mm" : "m";
      row.expectedDimensions = dims.map((d) => (format === "stl" ? d : d / 1000));
      row.boundsError = row.encodedDimensions.map((d, a) =>
        Math.abs(d - row.expectedDimensions[a]),
      );
      assert.ok(
        row.boundsError.every((d, a) => d < Math.max(1e-5, row.expectedDimensions[a] * 1e-5)),
      );
      // Keep rejected topology in the evidence; never present it as a printable pass.
      const residualBins = [0, 0, 0, 0, 0];
      let probeResidualMM = 0;
      // Every triangle centroid plus every vertex, evaluated against the original ordered field.
      for (let i = 0; i < (p?.length ?? 0); i += 9) {
        for (let k = 0; k < 4; k++) {
          const probe = [0, 1, 2].map(
            (a) =>
              (k < 3 ? p[i + k * 3 + a] : (p[i + a] + p[i + a + 3] + p[i + a + 6]) / 3) /
                mmPerUnit +
              center[a],
          );
          const residual = Math.abs(field(...probe)) * mmPerUnit;
          residualBins[
            residual <= 0.01
              ? 0
              : residual <= 0.05
                ? 1
                : residual <= 0.1
                  ? 2
                  : residual <= 1
                    ? 3
                    : 4
          ]++;
          probeResidualMM = Math.max(probeResidualMM, residual);
        }
      }
      if (p) {
        const paths = [0, 1, 2].map((axis) => {
          const a = (axis + 1) % 3,
            b = (axis + 2) % 3,
            points = [];
          for (let i = 0; i < p.length; i += Math.max(9, Math.ceil(p.length / 18000 / 9) * 9)) {
            const xy = (k) =>
              `${150 + (p[i + k * 3 + a] / Math.max(...dims)) * 260},${150 - (p[i + k * 3 + b] / Math.max(...dims)) * 260}`;
            points.push(`M${xy(0)}L${xy(1)}L${xy(2)}Z`);
          }
          return `<g transform="translate(${axis * 300},0)"><path d="${points.join("")}" fill="none" stroke="#234" stroke-width="0.3"/></g>`;
        });
        await writeFile(
          `${output}/${name}-${resolution}-${quality}-silhouette.svg`,
          `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300" viewBox="0 0 900 300">${paths.join("")}</svg>`,
        );
      }
      parsed?.dispose();
      await mkdir(output, { recursive: true });
      const writeStart = performance.now();
      await writeFile(
        `${output}/${name}-${resolution}-${quality}.${format}`,
        new Uint8Array(result.data),
      );
      row.qualities.push({
        quality,
        blocked: (result.report?.blocking.length ?? 0) > 0,
        ...result,
        data: undefined,
        stats: result.stats,
        sha256: createHash("sha256").update(new Uint8Array(result.data)).digest("hex"),
        residualBins,
        probeResidualMM: p ? probeResidualMM : null,
        fileWriteMs: performance.now() - writeStart,
        outputBytes: result.data.byteLength,
      });
    } catch (e) {
      if (e instanceof assert.AssertionError || phase === "diagnostics") throw e;
      row.qualities.push({ quality, refused: e.message, refusedAt: phase });
    }
  }
} catch (e) {
  if (e instanceof assert.AssertionError || phase === "diagnostics") throw e;
  row.refused = e.message;
  row.refusedAt = phase;
} finally {
  row.attemptWallMs = performance.now() - pipelineStart;
  assert.deepEqual(saveSculptProject(editor.project), before);
  assert.deepEqual([editor.undoCount, editor.redoCount], history);
  if (native) assert.deepEqual(await readFile(config.native), native);
  row.preserved = true;
  row.memoryAfter = process.memoryUsage();
  row.maxRssMiB = process.resourceUsage().maxRSS / 1024;
  prepared?.dispose();
  editor.dispose();
}
console.log(JSON.stringify(row));
