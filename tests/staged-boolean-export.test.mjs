import assert from "node:assert/strict";
import test from "node:test";
import { MeshBasicMaterial } from "three";
import { ExportBrowserWorker } from "../scripts/fixtures/node-export-worker.mjs";
import { prepareBooleanExport } from "../work/test-build/boolean-export.mjs";
import {
  BooleanComposite,
  compositeLayout,
  compositeSamplingStages,
} from "../work/test-build/compositor.mjs";
import { exportGlbAsync } from "../work/test-build/export-client.mjs";
import { EXPORT_MEMORY_LIMIT, exportMemoryBudget } from "../work/test-build/export-mesh.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { LayerStack, SculptProject, SdfLayer } from "../work/test-build/layers.mjs";
import { evaluatePrimitive } from "../work/test-build/parametric-primitive.mjs";
import { saveSculptProject } from "../work/test-build/project.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { encodeSTL } from "../work/test-build/stl-export.mjs";
import { identityTransform } from "../work/test-build/transform.mjs";

const settings = {
  mode: "add",
  radius: 0.22,
  strength: 0.35,
  hardness: 0.5,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
test("house unified STL preserves winding when admitted or refuses denser output without changing history", async () => {
  const boxes = [
    [[60, 40, 50], [0, -15, 0], 0],
    [[42, 6, 46], [14, 15, 0], -35],
    [[42, 6, 46], [-14, 15, 0], 35],
    [[14, 26, 4], [0, -22.5, 27], 0],
    ...[-18, 18].flatMap((x) => [
      [[10, 12, 3], [x, -4, 27], 0],
      [[1.5, 12, 2], [x, -4, 29.5], 0],
      [[10, 1.5, 2], [x, -4, 29.5], 0],
      [[12, 1.5, 4], [x, -10.75, 29.5], 0],
    ]),
  ];
  const layers = boxes.map(([dimensions, position, angle], order) => {
    const [width, height, depth] = dimensions.map((x) => x / 100),
      primitive = { kind: "box", width, height, depth },
      generator = evaluatePrimitive(primitive, 63, 1_000_000);
    let result = generator.next();
    while (!result.done) result = generator.next();
    return new SdfLayer(result.value, {
      order,
      primitive,
      transform: {
        position: position.map((x) => x / 100),
        rotation: [0, 0, (angle * Math.PI) / 180],
        scale: [1, 1, 1],
      },
    });
  });
  const editor = new IndependentLayers(
      new SculptProject(new LayerStack(layers), structuredClone(settings)),
    ),
    before = saveSculptProject(editor.project),
    history = editor.undoCount;
  try {
    let prepared;
    try {
      prepared = await prepareBooleanExport(
        editor,
        editor.project,
        undefined,
        true,
        undefined,
        exportMemoryBudget(512),
      );
    } catch (error) {
      if (!/1,000,000 intermediate triangles/.test(error.message)) throw error;
      assert.deepEqual(saveSculptProject(editor.project), before);
      assert.equal(editor.undoCount, history);
      return;
    }
    try {
      assert(prepared.removedTriangles > 0);
      const triangles = prepared.sources.reduce(
        (n, source) => n + source.chunks.reduce((n, c) => n + c.positions.length / 9, 0),
        0,
      );
      // Tighter bounds spend more samples on the house's fine window/roof detail.
      // Preserve final safety limits instead of silently falling back to the old coarser field.
      if (triangles > 600_000) {
        await assert.rejects(
          encodeSTL(prepared.sources, "fast", prepared.availableBytes(), 100),
          /safety limits/,
        );
        assert.deepEqual(saveSculptProject(editor.project), before);
        assert.equal(editor.undoCount, history);
        return;
      }
      for (const mm of [100, 60]) {
        const result = await encodeSTL(prepared.sources, "fast", prepared.availableBytes(), mm);
        assert.deepEqual(result.report.blocking, []);
        assert.equal(result.report.inconsistentEdges, 0);
        assert.equal(result.report.boundaryEdges, 0);
        assert.equal(result.report.nonManifoldEdges, 0);
        assert.equal(result.report.degenerateTriangles, 0);
        assert.equal(Math.max(...result.report.dimensions), mm);
      }
      const defaultAvailable =
        prepared.availableBytes() - (exportMemoryBudget(512) - EXPORT_MEMORY_LIMIT);
      for (const quality of ["standard", "high"])
        await assert.rejects(
          encodeSTL(prepared.sources, quality, defaultAvailable, 100),
          /Not enough memory/,
        );
      const worker = globalThis.Worker;
      globalThis.Worker = ExportBrowserWorker;
      try {
        for (const quality of ["standard", "high"]) {
          const result = await exportGlbAsync(prepared.sources, quality, {
            maxBytes: prepared.availableBytes(),
            stlMM: 100,
          });
          assert.equal(result.backend, "worker");
          assert.deepEqual(result.report.blocking, []);
          assert.equal(result.report.boundaryEdges, 0);
          assert.equal(result.report.nonManifoldEdges, 0);
          assert.equal(Math.max(...result.report.dimensions), 100);
          assert(result.estimatedBytes <= prepared.availableBytes());
          if (quality === "high") assert(result.stats[0].planarRemoved > 0);
        }
      } finally {
        globalThis.Worker = worker;
      }
      assert.deepEqual(saveSculptProject(editor.project), before);
      assert.equal(editor.undoCount, history);
    } finally {
      prepared.dispose();
    }
  } finally {
    editor.dispose();
  }
});
function fixture(count = 12) {
  const sources = Array.from(
    { length: count },
    (_, i) =>
      new SdfLayer(new SDFVolume(17), {
        name: `Source ${i}`,
        order: i,
        transform: { ...identityTransform(), position: [i * 5, 0, 0] },
      }),
  );
  return new IndependentLayers(
    new SculptProject(new LayerStack(sources), structuredClone(settings)),
  );
}
test("full-resolution export stages cover one unchanged 192 cubed lattice within per-stage work limits", () => {
  const editor = fixture();
  try {
    const sources = editor.project.layerStack.compositionLayers;
    assert.throws(() => compositeLayout(sources, 192, true), /64 million/);
    const layout = compositeLayout(sources, 192, true, true);
    assert.equal(layout.resolution, 192);
    assert.equal(layout.samplingStages.length, 2);
    const rows = layout.samplingStages.flatMap((s) =>
      Array.from({ length: s.maxZ - s.minZ + 1 }, (_, i) => s.minZ + i),
    );
    assert.deepEqual(
      rows,
      Array.from({ length: 192 }, (_, i) => i),
    );
    for (const s of layout.samplingStages)
      assert((s.maxZ - s.minZ + 1) * 192 * 192 * 12 <= 64_000_000);
    assert.throws(() => compositeSamplingStages(192, 12, 100), /budget/);
    for (const source of sources)
      source.array = {
        id: `repeat-${source.id}`,
        kind: "linear",
        count: 16,
        enabled: true,
        axis: [1, 0, 0],
        spacingModelUnits: 5,
        centered: false,
      };
    assert.throws(() => compositeLayout(sources, 192, true, true), /256 million/);
  } finally {
    editor.dispose();
  }
});
test("staged and ordinary sampling preserve identical ordered Boolean fields and mesh buffers", async () => {
  const editor = fixture(3),
    material = new MeshBasicMaterial();
  editor.project.layerStack.layers[1].operation = "difference";
  editor.project.layerStack.layers[1].transform.position = [0.3, 0, 0];
  editor.project.layerStack.layers[2].operation = "intersect";
  editor.project.layerStack.layers[2].transform.position = [0, 0.3, 0];
  const normal = new BooleanComposite(editor.project, material, 32);
  const staged = new BooleanComposite(editor.project, material, 32, material, () => true, {
    stagedEvaluation: true,
  });
  try {
    await normal.flush();
    await staged.flush();
    assert.deepEqual(staged.volume.values, normal.volume.values);
    const mesh = (c) =>
      c.exportSources().flatMap((s) => s.chunks.map((c) => Array.from(c.positions)));
    assert.deepEqual(mesh(staged), mesh(normal));
  } finally {
    normal.dispose();
    staged.dispose();
    material.dispose();
    editor.dispose();
  }
});
test("twelve-source unified export keeps 192 resolution, reports stages and changes no native bytes/history", async () => {
  const editor = fixture(),
    before = saveSculptProject(editor.project),
    count = editor.undoCount,
    progress = [];
  try {
    for (const limit of [NaN, Infinity, 0, -1, exportMemoryBudget(512) + 1])
      await assert.rejects(
        prepareBooleanExport(editor, editor.project, undefined, true, undefined, limit),
        /memory budget/,
      );
    const prepared = await prepareBooleanExport(editor, editor.project, undefined, true, (p) =>
      progress.push(p),
    );
    try {
      assert(prepared.sources.length > 0);
      assert(progress.some((p) => p.stage.includes("stage 2/2")));
      assert.equal(
        progress
          .filter((p) => p.stage.startsWith("Evaluating Boolean") && p.completed === p.total)
          .reduce((sum, p) => sum + p.total, 0),
        192 ** 3,
      );
      const layout = compositeLayout(editor.project.layerStack.compositionLayers, 192, true, true);
      assert.equal(prepared.sources[0].step, (2 * layout.extent) / 191);
      const stl = await encodeSTL(prepared.sources, "fast", prepared.availableBytes(), 100);
      assert(stl.data.byteLength > 84);
      assert.deepEqual(saveSculptProject(editor.project), before);
      assert.equal(editor.undoCount, count);
    } finally {
      prepared.dispose();
    }
    const abort = new AbortController();
    await assert.rejects(
      prepareBooleanExport(editor, editor.project, abort.signal, false, () => abort.abort()),
      /cancelled/i,
    );
    assert.deepEqual(saveSculptProject(editor.project), before);
    assert.equal(editor.undoCount, count);
    let changed;
    await assert.rejects(
      prepareBooleanExport(editor, editor.project, undefined, false, () => {
        if (!changed) {
          editor.rename(editor.project.activeLayerId, "Changed during export");
          changed = saveSculptProject(editor.project);
        }
      }),
      /source changed/i,
    );
    assert.deepEqual(saveSculptProject(editor.project), changed);
    const finalCount = editor.undoCount;
    Object.defineProperty(editor, "trackedBytes", { value: 256 * 1024 ** 2 });
    await assert.rejects(prepareBooleanExport(editor, editor.project), /memory budget/);
    assert.deepEqual(saveSculptProject(editor.project), changed);
    assert.equal(editor.undoCount, finalCount);
  } finally {
    editor.dispose();
  }
});

test("mixed organic SDF and three-slot holder export evaluated surfaces, not primitive shells", async () => {
  const { prepareComposite } = await import("../work/test-build/compositor.mjs");
  const { physicalExportDimensionsMM } = await import("../work/test-build/physical-units.mjs");
  const { parseSTL } = await import("../work/test-build/stl.mjs");
  const { BufferGeometry, BufferAttribute, Mesh, Raycaster, Vector3, DoubleSide } = await import(
    "three"
  );
  const box = (width, height, depth, position, order, operation = "union") => {
    const primitive = { kind: "box", width, height, depth };
    const generator = evaluatePrimitive(primitive, 33, 1_000_000);
    let result = generator.next();
    while (!result.done) result = generator.next();
    return new SdfLayer(result.value, {
      primitive,
      order,
      operation,
      transform: { ...identityTransform(), position },
    });
  };
  const organic = new SDFVolume(33);
  // A curved asymmetric stored field, representative of committed SDF edits.
  for (let z = 0; z < 33; z++)
    for (let y = 0; y < 33; y++)
      for (let x = 0; x < 33; x++) {
        const px = -1.6 + x * organic.step,
          py = -1.6 + y * organic.step,
          pz = -1.6 + z * organic.step;
        organic.values[organic.index(x, y, z)] =
          Math.hypot(px + 0.2 * Math.sin(py * 3), py, pz) - 0.65;
      }
  const sources = [
    box(4.43, 0.6, 1.5, [0, 0, 0], 0),
    ...[-1.3, 0, 1.3].map((x, i) => box(0.45, 1.2, 0.7, [x, 0, 0], i + 1, "difference")),
    new SdfLayer(organic, {
      order: 4,
      transform: { ...identityTransform(), position: [0, 1.2, 0] },
    }),
  ];
  const editor = new IndependentLayers(
    new SculptProject(new LayerStack(sources), structuredClone(settings)),
  );
  const before = saveSculptProject(editor.project),
    undo = editor.undoCount;
  const field = prepareComposite(editor.project.layerStack.compositionLayers);
  const prepared = await prepareBooleanExport(
    editor,
    editor.project,
    undefined,
    true,
    undefined,
    exportMemoryBudget(512),
  );
  try {
    const dims = physicalExportDimensionsMM(prepared.sources, 100);
    assert(Math.abs(dims[0] - 443) < 0.1);
    for (const source of prepared.sources)
      for (const c of source.chunks)
        for (let i = 0; i < c.positions.length; i += 3) {
          const p = c.positions;
          assert(
            Math.abs(
              field(
                p[i] + source.transform.position[0],
                p[i + 1] + source.transform.position[1],
                p[i + 2] + source.transform.position[2],
              ),
            ) <
              source.step * 2,
          );
        }
    const result = await encodeSTL(
      prepared.sources,
      "fast",
      prepared.availableBytes(),
      Math.max(...dims),
    );
    const { installFileReader, readGlb } = await import("../scripts/fixtures/export-node.mjs");
    const { encodeExport } = await import("../work/test-build/glb-export.mjs");
    const { physicalGLBSources } = await import("../work/test-build/physical-units.mjs");
    installFileReader();
    const glb = await encodeExport(
      physicalGLBSources(prepared.sources, 100),
      "fast",
      prepared.availableBytes(),
    );
    const parsed = await readGlb(glb.data);
    parsed.scene.updateMatrixWorld(true);
    let organicVertices = 0;
    parsed.scene.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const p = mesh.geometry.attributes.position,
        normal = mesh.geometry.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        const point = new Vector3()
          .fromBufferAttribute(p, i)
          .applyMatrix4(mesh.matrixWorld)
          .multiplyScalar(10);
        assert(Math.abs(field(point.x, point.y, point.z)) < prepared.sources[0].step * 2);
        const n = new Vector3().fromBufferAttribute(normal, i);
        assert(Math.abs(n.length() - 1) < 0.001);
        if (point.y > 1) organicVertices++;
      }
    });
    assert(organicVertices > 100, "encoded GLB retains curved sculpt above holder");

    assert.deepEqual(result.report.blocking, []);
    assert.equal(result.report.inconsistentEdges, 0);
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(parseSTL(new Uint8Array(result.data)), 3),
    );
    const material = new MeshBasicMaterial({ side: DoubleSide }),
      mesh = new Mesh(geometry, material);
    // STL is centred at export bounds centre; cast through each slot along Y.
    const points = geometry.attributes.position.array;
    let lo = Infinity;
    for (let i = 1; i < points.length; i += 3) {
      lo = Math.min(lo, points[i]);
    }
    // y origin in centred STL equals original -centreY. Start below base; organic sits above.
    for (const x of [-130, 0, 130]) {
      const hits = new Raycaster(
        new Vector3(x, lo - 10, 0),
        new Vector3(0, 1, 0),
        0,
        80,
      ).intersectObject(mesh);
      assert.equal(hits.length, 0, "slot stays open in encoded STL");
    }
    geometry.dispose();
    material.dispose();
    assert.deepEqual(saveSculptProject(editor.project), before);
    assert.equal(editor.undoCount, undo);
  } finally {
    prepared.dispose();
    editor.dispose();
  }
});
