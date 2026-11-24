import "./compile-core.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import { IDBFactory } from "fake-indexeddb";
import { partSources } from "../work/test-build/assembly.mjs";
import { prepareBooleanExport } from "../work/test-build/boolean-export.mjs";
import { EXPORT_MEMORY_MAX } from "../work/test-build/export-mesh.mjs";
import { encodeExport } from "../work/test-build/glb-export.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { LayerStack, SculptProject, SdfLayer } from "../work/test-build/layers.mjs";
import { describeNative, renameNative } from "../work/test-build/library-codec.mjs";
import { evaluatePrimitive } from "../work/test-build/parametric-primitive.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { ProjectLibrary } from "../work/test-build/project-library.mjs";
import { checksum } from "../work/test-build/project-snapshot.mjs";
import { IndexedRecoveryStore } from "../work/test-build/recovery-store.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { installFileReader } from "./fixtures/export-node.mjs";

const [boundedFile, fullFile, output = "work/phase-8-9", workloadName, encoding] =
  process.argv.slice(2);
if (!boundedFile || !fullFile)
  throw new Error(
    "Pass the Phase 8.8f bounded archive and the default-resolution browser archive.",
  );
mkdirSync(output, { recursive: true });
const readNative = (file) => openSculptProject(Uint8Array.from(readFileSync(file)).buffer);
const settings = {
  mode: "add",
  radius: 0.12,
  strength: 0.5,
  hardness: 0.5,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
const make = (layers) =>
  new SculptProject(new LayerStack(layers), settings, "Benchmark", "benchmark-project");
function box(order = 0) {
  const primitive = { kind: "box", width: 0.4, height: 0.4, depth: 0.4 };
  const task = evaluatePrimitive(primitive, 63, 63 ** 3);
  let sample = task.next();
  while (!sample.done) sample = task.next();
  const layer = new SdfLayer(sample.value, {
    id: "box-" + order,
    primitive,
    order,
    name: "Box " + order,
  });
  layer.transform.position = [order * 0.03, order * 0.02, order * 0.02];
  return layer;
}
function buttonSubset() {
  const project = readNative(boundedFile);
  const buttonNames = ["Button plunger", "Button retainer"];
  const { layerStack: stack } = project;
  const roots = stack.layers.filter((layer) => buttonNames.includes(layer.name));
  assert.equal(roots.length, 2);
  const kept = new Set(roots.flatMap((root) => [root.id, ...stack.hierarchy.descendants(root.id)]));
  for (const layer of stack.layers) if (!kept.has(layer.id)) stack.remove(layer.id);
  project.displayPreferences.colours = Object.fromEntries(
    Object.entries(project.displayPreferences.colours).filter(([id]) => kept.has(id)),
  );
  return project;
}
const workloads = {
  "small-box": () => make([box()]),
  "electronics-bounded": () => readNative(boundedFile),
  "electronics-default-20": () => readNative(fullFile),
  "mixed-clay-and-boxes": () =>
    make([new SdfLayer(new SDFVolume(64), { id: "clay" }), box(1), box(2)]),
  "dense-clay-128": () => {
    const clay = new SDFVolume(128);
    clay.brush({ x: 0.1, y: 0, z: 0.7 }, 0.18, "subtract", 0.08);
    return make([new SdfLayer(clay, { id: "clay" })]);
  },
  "complex-live-boolean": () => {
    const layers = Array.from({ length: 6 }, (_, i) => box(i));
    layers[0].booleanModifiers = layers.slice(1).map((layer, i) => ({
      id: "cut-" + i,
      sourceId: layer.id,
      enabled: true,
      operation: i % 2 ? "union" : "difference",
    }));
    return make(layers);
  },
  "printable-button-and-component-references": buttonSubset,
};
function durations(rows) {
  return Object.fromEntries(
    Object.keys(rows[0]).map((key) => {
      const values = rows.map((row) => row[key]).sort((a, b) => a - b);
      return [
        key,
        {
          median: values[Math.floor(values.length / 2)],
          p95: values[Math.ceil(values.length * 0.95) - 1],
        },
      ];
    }),
  );
}
function gridCounts(data) {
  const view = new DataView(data);
  const metadata = JSON.parse(
    new TextDecoder().decode(new Uint8Array(data, 16, view.getUint32(12, true))),
  );
  return {
    version: view.getUint32(8, true),
    storedSamples: metadata.layers.reduce((sum, d) => sum + d.voxelCount, 0),
    regeneratedSamples: metadata.layers.reduce(
      (sum, d) => sum + (d.source ? d.grid.dimensions.reduce((a, b) => a * b, 1) : 0),
      0,
    ),
  };
}
function assertSame(a, b) {
  assert.deepEqual(a.displayPreferences, b.displayPreferences);
  for (const [i, layer] of a.layerStack.layers.entries()) {
    const restored = b.layerStack.layers[i];
    assert.deepEqual(layer.metadata(), restored.metadata());
    assert.deepEqual(layer.transform, restored.transform);
    assert.deepEqual(layer.volume.voxelSize, restored.volume.voxelSize);
    const bytes = (values) => Buffer.from(values.buffer, values.byteOffset, values.byteLength);
    assert(bytes(layer.volume.values).equals(bytes(restored.volume.values)));
  }
}
function hash(buffer) {
  return createHash("sha256").update(new Uint8Array(buffer)).digest("hex");
}
async function verifyGLB(project, workload) {
  const booleanFixture = workload === "complex-live-boolean" || workload === "electronics-bounded";
  if (!booleanFixture && workload !== "small-box" && workload !== "mixed-clay-and-boxes")
    return undefined;
  const editor = new IndependentLayers(project);
  const memoryLimit = workload === "electronics-bounded" ? EXPORT_MEMORY_MAX : 256 * 1024 ** 2;
  const makeGLB = async (scope) => {
    const evaluated = booleanFixture
      ? await prepareBooleanExport(editor, scope, undefined, false)
      : undefined;
    try {
      const sources = evaluated?.sources ?? editor.exportSources();
      const glb = await encodeExport(sources, "fast", memoryLimit);
      return { glbSHA256: hash(glb.data) };
    } finally {
      evaluated?.dispose();
    }
  };
  try {
    if (workload !== "electronics-bounded") return await makeGLB(project);
    const scopes = {};
    try {
      scopes.visibleAssembly = await makeGLB(project);
    } catch (error) {
      if (!error.message.startsWith("Too many triangles for fast export")) throw error;
      scopes.visibleAssembly = { refusal: error.message };
    }
    for (const part of project.layerStack.layers.filter((layer) => layer.assemblyPart)) {
      const scope = new SculptProject(
        new LayerStack(partSources(project.layerStack, part.id)),
        project.settings,
        project.name,
        project.id,
      );
      scopes[part.name] = await makeGLB(scope);
    }
    return scopes;
  } finally {
    editor.dispose();
  }
}
async function runTrial(workload, compact) {
  const project = workloads[workload]();
  const reference = openSculptProject(saveSculptProject(project, project.displayPreferences, true));
  installFileReader();
  const library = new ProjectLibrary(new IDBFactory(), "phase-8-9-library");
  const recovery = new IndexedRecoveryStore(new IDBFactory(), "phase-8-9-recovery");
  await recovery.setEnabled(true);
  const signal = new AbortController().signal;
  const trials = [];
  let geometry;
  let refusal;
  let last;
  for (let i = -1; i < 5; i++) {
    global.gc?.();
    const initialRSS = process.memoryUsage.rss();
    const start = performance.now();
    let data;
    try {
      data = saveSculptProject(project, project.displayPreferences, compact);
    } catch (error) {
      if (workload !== "electronics-default-20" || compact) throw error;
      refusal = error.message;
      break;
    }
    const saveMs = performance.now() - start;
    const afterSaveRSS = process.memoryUsage.rss();
    const openStart = performance.now();
    let reconstructionMs = 0;
    const rebuilt = openSculptProject(data, (done, total) => {
      if (done === total) reconstructionMs = performance.now() - openStart;
    });
    const openMs = performance.now() - openStart;
    const afterOpenRSS = process.memoryUsage.rss();
    assertSame(reference, rebuilt);
    const record = describeNative(data, workload);
    let phaseStart = performance.now();
    const copy = renameNative(data, "Copy", true);
    const duplicateBytesMs = performance.now() - phaseStart;
    await library.put(describeNative(copy, "Copy"), copy, null);
    const duplicateMs = performance.now() - phaseStart;
    const checkpoint = {
      id: "checkpoint",
      format: 1,
      projectId: record.id,
      projectName: workload,
      revision: String(i),
      createdAt: Date.now(),
      bytes: data.byteLength,
      checksum: checksum(data),
    };
    await recovery.write(checkpoint, data, signal);
    phaseStart = performance.now();
    const restored = await recovery.read(checkpoint.id);
    assert.equal(checksum(restored.data), restored.record.checksum);
    assert.equal(openSculptProject(restored.data).id, project.id);
    const recoveryMs = performance.now() - phaseStart;
    if (i >= 0)
      trials.push({
        saveMs,
        openMs,
        materializationThroughLastLayerMs: reconstructionMs,
        duplicateBytesMs,
        duplicateMs,
        recoveryMs,
        sampledPeakRSSMiB:
          Math.max(initialRSS, afterSaveRSS, afterOpenRSS, process.memoryUsage.rss()) / 1024 ** 2,
      });
    last = data;
  }
  const processPeakRSSKiB = process.resourceUsage().maxRSS;
  if (last) {
    writeFileSync(
      join(output, workload + (compact ? "-compact.form" : "-legacy.form")),
      new Uint8Array(last),
    );
    geometry = await verifyGLB(openSculptProject(last), workload);
  }
  const row = {
    workload,
    compact,
    layers: project.layerStack.layers.length,
    refusal,
    bytes: last?.byteLength,
    ...(last ? gridCounts(last) : {}),
    geometry,
    processPeakRSSKiB,
    trials,
    summary: trials.length ? durations(trials) : undefined,
  };
  library.close();
  recovery.close();
  return row;
}
if (workloadName) {
  console.log(JSON.stringify(await runTrial(workloadName, encoding === "compact")));
} else {
  const rows = [];
  for (const workload of Object.keys(workloads)) {
    for (const variant of ["legacy", "compact"]) {
      const child = spawnSync(
        process.execPath,
        ["--expose-gc", process.argv[1], boundedFile, fullFile, output, workload, variant],
        { encoding: "utf8" },
      );
      if (child.status !== 0) throw new Error(child.stderr || child.stdout || String(child.error));
      const row = JSON.parse(child.stdout.trim());
      console.log(JSON.stringify({ ...row, trials: undefined }));
      if (variant === "compact" && row.geometry && rows.at(-1).geometry)
        assert.deepEqual(row.geometry, rows.at(-1).geometry);
      rows.push(row);
    }
  }
  writeFileSync(
    join(output, "codec-benchmark.json"),
    JSON.stringify(
      {
        methodology:
          "One warmup and five trials per encoding. A fresh process per workload and encoding isolates phase-sampled RSS, including the native reference retained for verification. A separate process high-water mark through the last codec trial includes setup and verification, and excludes export. Recovery and Library use disposable fake IndexedDB.",
        runtime: process.version,
        platform: process.platform,
        architecture: process.arch,
        cpu: cpus()[0].model,
        rows,
      },
      null,
      2,
    ),
  );
}
