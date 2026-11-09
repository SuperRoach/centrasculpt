import assert from "node:assert/strict";
import test from "node:test";
import { BoxGeometry } from "three";
import { compareSections, sectionProbes } from "../scripts/fixtures/export-section-probes.mjs";
import { sampledDistance } from "../scripts/fixtures/export-surface-probes.mjs";
import { ExportBrowserWorker } from "../scripts/fixtures/node-export-worker.mjs";
import { prepareBooleanExport } from "../work/test-build/boolean-export.mjs";
import { reduceCurvedSTL } from "../work/test-build/curved-decimation.mjs";
import { exportGlbAsync } from "../work/test-build/export-client.mjs";
import {
  curvedReductionSummary,
  validateCurvedReduction,
} from "../work/test-build/export-decimation.mjs";
import { ExportWork } from "../work/test-build/export-mesh.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { physicalExportDimensionsMM } from "../work/test-build/physical-units.mjs";
import { saveSculptProject } from "../work/test-build/project.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { encodeSTL, validatePrintMesh } from "../work/test-build/stl-export.mjs";
import { identityTransform } from "../work/test-build/transform.mjs";

const memory = 512 * 1024 ** 2;
const settings = {
  mode: "add",
  radius: 0.22,
  hardness: 0.5,
  strength: 0.35,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
function positions(data) {
  const view = new DataView(data),
    p = new Float32Array(view.getUint32(80, true) * 9);
  for (let i = 0; i < p.length; i++)
    p[i] = view.getFloat32(96 + Math.floor(i / 9) * 50 + (i % 9) * 4, true);
  return p;
}
function source(p) {
  const normals = new Float32Array(p.length);
  for (let i = 2; i < normals.length; i += 3) normals[i] = 1;
  return {
    name: "fixture",
    step: 0.01,
    transform: identityTransform(),
    chunks: [{ positions: p, normals }],
  };
}
test("experimental reduction validates options and keeps exact originals for ineligible or unaffordable meshes", async () => {
  for (const toleranceMM of [NaN, Infinity, 0, -1, 0.001, 1])
    assert.throws(() => validateCurvedReduction({ toleranceMM }));
  const geometry = new BoxGeometry(10, 10, 10).toNonIndexed();
  const s = source(geometry.attributes.position.array);
  const exact = await encodeSTL([s], "high", memory, 100);
  const input = positions(exact.data),
    before = await validatePrintMesh(input),
    copy = input.slice();
  const denied = await reduceCurvedSTL(
    input,
    before,
    { toleranceMM: 0.05 },
    1,
    new ExportWork(),
    validatePrintMesh,
  );
  assert.equal(denied.positions, input);
  assert.equal(denied.report.status, "kept-original");
  assert.match(denied.report.reason, /workspace/);
  const doubled = new Float32Array([...input, ...input]);
  const bad = await validatePrintMesh(doubled);
  const blocked = await reduceCurvedSTL(
    doubled,
    bad,
    { toleranceMM: 0.05 },
    memory,
    new ExportWork(),
    validatePrintMesh,
  );
  assert.equal(blocked.positions, doubled);
  assert.match(blocked.report.reason, /closed/);
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    reduceCurvedSTL(
      input,
      before,
      { toleranceMM: 0.05 },
      memory,
      new ExportWork(abort.signal),
      validatePrintMesh,
    ),
    /cancelled/,
  );
  await assert.rejects(
    reduceCurvedSTL(
      input,
      before,
      { toleranceMM: 0.05 },
      memory,
      new ExportWork(undefined, () => false),
      validatePrintMesh,
    ),
    /source changed/,
  );
  const open = input.slice(0, -9),
    openReport = await validatePrintMesh(open);
  assert.equal(openReport.blocking.length, 0);
  assert(openReport.boundaryEdges > 0);
  const openResult = await reduceCurvedSTL(
    open,
    openReport,
    { toleranceMM: 0.05 },
    memory,
    new ExportWork(),
    validatePrintMesh,
  );
  assert.equal(openResult.positions, open);
  assert.equal(openResult.report.status, "kept-original");
  await assert.rejects(
    exportGlbAsync([], "high", { curvedReduction: { toleranceMM: 0.05 } }),
    /STL only/,
  );
  await assert.rejects(
    reduceCurvedSTL(
      input,
      before,
      { toleranceMM: 0.05 },
      1,
      new ExportWork(AbortSignal.abort()),
      validatePrintMesh,
    ),
    /cancelled/,
  );
  assert.deepEqual(input, copy);
  geometry.dispose();
});

test("coarse curved SDF can reduce only after physical gates; rejection is byte-exact and worker cancellation retains history", async () => {
  const volume = new SDFVolume(65, 1.6, false);
  for (let z = 0; z < 65; z++)
    for (let y = 0; y < 65; y++)
      for (let x = 0; x < 65; x++) {
        const py = volume.coordinate(y);
        volume.values[volume.index(x, y, z)] =
          Math.hypot(volume.coordinate(x) + 0.15 * Math.sin(py * 4), py, volume.coordinate(z)) -
          0.85;
      }
  const editor = new IndependentLayers(createBaseProject(volume, structuredClone(settings)));
  const native = saveSculptProject(editor.project),
    history = [editor.undoCount, editor.redoCount];
  let prepared;
  const previous = globalThis.Worker;
  try {
    prepared = await prepareBooleanExport(
      editor,
      editor.project,
      undefined,
      true,
      undefined,
      memory,
    );
    const mm = Math.max(...physicalExportDimensionsMM(prepared.sources, 100));
    const exact = await encodeSTL(prepared.sources, "high", prepared.availableBytes(), mm);
    const accepted = await encodeSTL(
      prepared.sources,
      "high",
      prepared.availableBytes(),
      mm,
      new ExportWork(),
      { toleranceMM: 0.05 },
    );

    assert.equal(accepted.report.curvedReduction.status, "applied");
    assert.match(
      curvedReductionSummary(accepted.report.curvedReduction),
      /^✓ Curved reduction applied:/,
    );
    assert(accepted.report.triangles < exact.report.triangles);
    assert(accepted.report.curvedReduction.sampledMaxMM <= 0.05);
    assert(accepted.report.curvedReduction.sectionMaxMM <= 0.05);
    assert.deepEqual(accepted.report.blocking, []);
    assert.deepEqual(accepted.report.dimensions, exact.report.dimensions);
    const referencePoints = positions(exact.data),
      reducedPoints = positions(accepted.data);
    assert(sampledDistance(referencePoints, reducedPoints).maxMM <= 0.05);
    assert(sampledDistance(reducedPoints, referencePoints).maxMM <= 0.05);
    const extent = Math.max(...exact.report.dimensions) * 1.005;
    const sections = compareSections(
      sectionProbes(referencePoints, extent),
      sectionProbes(reducedPoints, extent),
    );
    assert.equal(sections.changedCounts, 0);
    assert(sections.maxIntervalMM <= 0.05 && sections.maxDepthMM <= 0.05);
    let current = true;
    const stale = new ExportWork(
      undefined,
      () => current,
      (p) => {
        if (p.stage === "Checking curved surface distance") current = false;
      },
    );
    await assert.rejects(
      encodeSTL(prepared.sources, "high", prepared.availableBytes(), mm, stale, {
        toleranceMM: 0.05,
      }),
      /source changed/,
    );

    const rejected = await encodeSTL(
      prepared.sources,
      "high",
      prepared.availableBytes(),
      mm,
      new ExportWork(),
      { toleranceMM: 0.1 },
    );
    assert.equal(rejected.report.curvedReduction.status, "kept-original");
    assert.match(curvedReductionSummary(rejected.report.curvedReduction), /^Curved reduction: ✕ /);
    assert.doesNotMatch(
      curvedReductionSummary(rejected.report.curvedReduction),
      /original mesh kept/i,
    );
    assert.deepEqual(rejected.data, exact.data);
    globalThis.Worker = ExportBrowserWorker;
    const worker = await exportGlbAsync(prepared.sources, "high", {
      stlMM: mm,
      maxBytes: prepared.availableBytes(),
      curvedReduction: { toleranceMM: 0.05 },
    });
    assert.equal(worker.backend, "worker");
    assert.deepEqual(worker.data, accepted.data);
    const abort = new AbortController();
    await assert.rejects(
      exportGlbAsync(prepared.sources, "high", {
        stlMM: mm,
        maxBytes: prepared.availableBytes(),
        curvedReduction: { toleranceMM: 0.05 },
        signal: abort.signal,
        progress: (p) => {
          if (p.stage.includes("curved")) abort.abort();
        },
      }),
      /cancelled/,
    );
    assert.deepEqual(saveSculptProject(editor.project), native);
    assert.deepEqual([editor.undoCount, editor.redoCount], history);
  } finally {
    globalThis.Worker = previous;
    prepared?.dispose();
    editor.dispose();
  }
});
