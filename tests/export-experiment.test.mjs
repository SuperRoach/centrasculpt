import assert from "node:assert/strict";
import test from "node:test";
import { compareSections, sectionProbes } from "../scripts/fixtures/export-section-probes.mjs";
import { sampledDistance } from "../scripts/fixtures/export-surface-probes.mjs";
import { qualityVolume } from "../scripts/fixtures/mesh-quality.mjs";
import { ExportBrowserWorker } from "../scripts/fixtures/node-export-worker.mjs";
import { exportGlbAsync } from "../work/test-build/export-client.mjs";
import { compactPlanarSources, ExportWork } from "../work/test-build/export-mesh.mjs";
import { IncrementalMesher } from "../work/test-build/mesh.mjs";
import { encodeSTL } from "../work/test-build/stl-export.mjs";
import { identityTransform } from "../work/test-build/transform.mjs";

const points = Float32Array.of(0, 0, 0, 1, 0, 0, 0, 1, 0);
test("production chunk compaction matches the original buffers and respects cancellation and admission", async () => {
  const sources = [
    {
      name: "open patch",
      step: 0.1,
      transform: identityTransform(),
      chunks: [{ positions: points, normals: Float32Array.of(0, 0, 1, 0, 0, 1, 0, 0, 1) }],
    },
  ];
  assert.deepEqual(
    await compactPlanarSources(sources, 1e6, undefined, true),
    await compactPlanarSources(sources, 1e6, undefined, false),
  );
  assert.deepEqual(
    await compactPlanarSources(sources, 1e6),
    await compactPlanarSources(sources, 1e6, undefined, true),
  );
  const controller = new AbortController();
  const duringWork = new ExportWork(controller.signal);
  duringWork.pause = async () => {
    controller.abort();
    duringWork.check();
  };
  await assert.rejects(compactPlanarSources(sources, 1e6, duringWork, true), /cancelled/);
  await assert.rejects(
    compactPlanarSources(sources, 1e6, new ExportWork(undefined, () => false), true),
    /source changed/,
  );
  await assert.rejects(compactPlanarSources(sources, 1, undefined, true), /memory/);
  await assert.rejects(
    compactPlanarSources(sources, 1e6, new ExportWork(AbortSignal.abort()), true),
    /cancelled/,
  );
});
test("section probes detect hidden wall changes and surface probes retain physical distance", () => {
  const moved = points.map((v, i) => v + (i % 3 === 2 ? 0.25 : 0));
  const section = sectionProbes(Float32Array.from([...points, ...moved]), 4);
  const delta = compareSections(section, sectionProbes(points, 4));
  assert.ok(delta.changedCounts > 0);
  assert.equal(sampledDistance(points, moved).maxMM, 0.25);
  assert.ok(sampledDistance(moved, moved).maxMM < 1e-12);
});

test("production compaction preserves feature fixtures, transforms and multipart worker bytes", async () => {
  const meshers = [];
  const sources = ["sphere", "aligned-box", "thin-stroke", "narrow-groove"].map((kind, i) => {
    const { volume } = qualityVolume(25, kind);
    const mesher = new IncrementalMesher(volume);
    meshers.push(mesher);
    mesher.rebuildChunks();
    return {
      name: kind,
      step: volume.step,
      transform: { position: [i * 3, 0, 0], rotation: [0.2, 0.3, 0.1], scale: [1, 0.9, 1.1] },
      chunks: mesher.snapshotUpdates().map(({ geometry }) => ({
        positions: geometry.getAttribute("position").array,
        normals: geometry.getAttribute("normal").array,
        colours: new Float32Array(geometry.getAttribute("position").array.length).fill(0.4),
      })),
    };
  });
  const before = structuredClone(sources);
  const previousWorker = globalThis.Worker;
  try {
    const original = await compactPlanarSources(sources, 256 * 1024 ** 2, undefined, false);
    const production = await compactPlanarSources(sources, 256 * 1024 ** 2);
    assert.deepEqual(production, original);
    globalThis.Worker = ExportBrowserWorker;
    for (const quality of ["fast", "high"]) {
      const reference = await encodeSTL(original.sources, quality, 256 * 1024 ** 2, 237);
      const result = await exportGlbAsync(production.sources, quality, { stlMM: 237 });
      assert.equal(result.backend, "worker");
      assert.deepEqual(result.data, reference.data);
      assert.deepEqual(result.report, reference.report);
      assert.ok(Math.abs(Math.max(...result.report.dimensions) - 237) < 1e-4);
    }
    assert.deepEqual(sources, before);
    assert.deepEqual(production, original); // Worker transfer must not detach prepared buffers.
  } finally {
    globalThis.Worker = previousWorker;
    for (const mesher of meshers) mesher.dispose();
  }
});
