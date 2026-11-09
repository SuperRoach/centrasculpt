import assert from "node:assert/strict";
import test from "node:test";
import { Box3, MeshBasicMaterial, Vector3 } from "three";
import { installFileReader, readGlb } from "../scripts/fixtures/export-node.mjs";
import {
  exportNeedsEvaluation,
  exportResolution,
  prepareBooleanExport,
} from "../work/test-build/boolean-export.mjs";
import {
  BooleanComposite,
  compositeLayout,
  compositeSamplingStages,
} from "../work/test-build/compositor.mjs";
import { encodeExport } from "../work/test-build/glb-export.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { LayerStack, SculptProject, SdfLayer } from "../work/test-build/layers.mjs";
import { evaluatePrimitive } from "../work/test-build/parametric-primitive.mjs";
import {
  physicalExportDimensionsMM,
  physicalGLBSources,
} from "../work/test-build/physical-units.mjs";
import { saveSculptProject } from "../work/test-build/project.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { encodeSTL } from "../work/test-build/stl-export.mjs";
import { identityTransform } from "../work/test-build/transform.mjs";

const settings = {
  mode: "add",
  radius: 0.2,
  strength: 0.35,
  hardness: 0.5,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
const box = (width, height, depth, order, position = [0, 0, 0], operation = "union") => {
  const primitive = { kind: "box", width, height, depth };
  const g = evaluatePrimitive(primitive, 63, 1_000_000);
  let r = g.next();
  while (!r.done) r = g.next();
  return new SdfLayer(r.value, {
    order,
    primitive,
    operation,
    transform: { ...identityTransform(), position },
  });
};
const fixture = () => {
  const empty = new SDFVolume(17, 1.6, false);
  empty.values.fill(1);
  return new IndependentLayers(
    new SculptProject(
      new LayerStack([
        new SdfLayer(empty, {
          order: 0,
          transform: { ...identityTransform(), position: [-10, 0, 0] },
        }),
        box(4.43, 0.6, 1.5, 1),
        ...[-1.3, 0, 1.3].map((x, i) => box(0.12, 0.9, 0.7, i + 2, [x, 0.3, 0], "difference")),
      ]),
      structuredClone(settings),
    ),
  );
};
test("export layout ignores empty dense volumes and primitive cache padding without changing preview layout", () => {
  const e = fixture();
  try {
    const all = e.project.layerStack.compositionLayers,
      solids = all.slice(1);
    for (const cap of [192, 256]) {
      assert.deepEqual(
        { ...compositeLayout(all, cap, true, true), samplingStages: undefined },
        { ...compositeLayout(solids, cap, true, true), samplingStages: undefined },
      );
      const layout = compositeLayout(all, cap, true, true);
      assert.equal(layout.resolution, cap);
      assert(layout.extent < 2.4, "uses actual primitive bounds, not padded caches");
    }
    assert(compositeLayout(all, 192).extent > 6, "preview layout remains unchanged");
    // Sparse/unknown occupancy is conservative: never discard a possibly occupied store.
    const volume = all[0].volume,
      dense = volume.getDenseView;
    volume.getDenseView = () => undefined;
    assert(compositeLayout(all, 192, true, true).extent > 6);
    volume.getDenseView = dense;
    const repeated = all
      .slice(1)
      .map((layer) => Object.assign(Object.create(Object.getPrototypeOf(layer)), layer));
    repeated[0].array = {
      id: "quota",
      kind: "linear",
      count: 16,
      enabled: true,
      axis: [1, 0, 0],
      spacingModelUnits: 0.01,
      centered: false,
    };
    assert.throws(() => compositeLayout(repeated, 256, true, true), /256 million/);

    assert.throws(() => compositeLayout(all, 256), /staged export/);
    assert.throws(() => compositeLayout(all, 256, true, false), /staged export/);
    assert.throws(() => new SDFVolume(256), /allocation/);
    assert.throws(() => new SDFVolume(256, 1.6, false), /allocation/);
    assert.equal(exportResolution(192), 192);
    assert.equal(exportResolution(256), 256);
    for (const n of [64, 255, 257, NaN]) assert.throws(() => exportResolution(n));
    assert.throws(() => compositeSamplingStages(257, 1), /budget/);
    const stages = compositeSamplingStages(256, 9);
    assert.equal(stages.at(-1).maxZ, 255);
    assert(stages.every((s) => (s.maxZ - s.minZ + 1) * 256 ** 2 * 9 <= 64_000_000));
  } finally {
    e.dispose();
  }
});
test("192 and 256 export grids preserve holder dimensions/topology/native bytes and 256 gives finer spacing", async () => {
  const e = fixture(),
    before = saveSculptProject(e.project),
    undo = e.undoCount;
  let previousStep = Infinity;
  try {
    for (const resolution of [192, 256]) {
      const p = await prepareBooleanExport(
        e,
        e.project,
        undefined,
        true,
        undefined,
        512 * 1024 ** 2,
        resolution,
      );
      try {
        assert.equal(p.resolution, resolution);
        assert(p.sources[0].step < previousStep);
        previousStep = p.sources[0].step;
        const dims = physicalExportDimensionsMM(p.sources, 100);
        assert(Math.abs(dims[0] - 443) < 0.001);
        const result = await encodeSTL(p.sources, "fast", p.availableBytes(), Math.max(...dims));
        assert.equal(result.report.boundaryEdges, 0);
        assert.equal(result.report.inconsistentEdges, 0);
        assert.equal(result.report.nonManifoldEdges, 0);
        assert.deepEqual(result.report.blocking, []);
        assert(Math.abs(result.report.dimensions[0] - 443) < 0.001);
        if (resolution === 256) {
          installFileReader();
          const glb = await encodeExport(
            physicalGLBSources(p.sources, 100),
            "fast",
            p.availableBytes(),
          );
          const parsed = await readGlb(glb.data);
          const size = new Box3().setFromObject(parsed.scene).getSize(new Vector3());
          assert(Math.abs(size.x * 1000 - 443) < 0.001);
        }

        assert.deepEqual(saveSculptProject(e.project), before);
        assert.equal(e.undoCount, undo);
      } finally {
        p.dispose();
      }
    }
    const abort = new AbortController();
    await assert.rejects(
      prepareBooleanExport(
        e,
        e.project,
        abort.signal,
        true,
        () => abort.abort(),
        512 * 1024 ** 2,
        256,
      ),
      /cancelled/i,
    );
    await assert.rejects(
      prepareBooleanExport(e, e.project, undefined, true, undefined, 1024, 256),
      /memory/,
    );
    const material = new MeshBasicMaterial(),
      c = new BooleanComposite(e.project, material, 256, material, () => true, {
        analyticPrimitives: true,
        stagedEvaluation: true,
      });
    c.availableBytes = () => 1024;
    try {
      await assert.rejects(c.flush(), /memory/);
    } finally {
      c.dispose();
      material.dispose();
    }
    assert.deepEqual(saveSculptProject(e.project), before);
    assert.equal(e.undoCount, undo);
  } finally {
    e.dispose();
  }
});

test("visible STL evaluates ordered cutters while selected and separate GLB scopes retain their meaning", () => {
  const e = fixture();
  try {
    assert.equal(exportNeedsEvaluation(e.project, "visible", true), true);
    assert.equal(exportNeedsEvaluation(e.project, "visible", false), false);
    assert.equal(exportNeedsEvaluation(e.project, "selected", true), false);
    assert.equal(exportNeedsEvaluation(e.project, "composite", true), true);
    assert.equal(exportNeedsEvaluation(e.project, "composite", false), true);
    const cutters = e.project.layerStack.layers.filter((l) => l.operation === "difference");
    for (const layer of cutters) layer.visible = false;
    assert.equal(exportNeedsEvaluation(e.project, "visible", true), false);
    cutters[0].operation = "intersect";
    cutters[0].visible = true;
    assert.equal(exportNeedsEvaluation(e.project, "visible", true), true);
    assert.equal(exportNeedsEvaluation(e.project, "visible", false), false);
  } finally {
    e.dispose();
  }
});
