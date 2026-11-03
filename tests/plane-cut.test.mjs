import assert from "node:assert/strict";
import test from "node:test";
import { prepareDenseGrowth } from "../work/test-build/dense-growth.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { previewSdfPlaneCut, splitSdfByPlane } from "../work/test-build/plane-cut.mjs";
import { sculptMask } from "../work/test-build/sculpt-mask.mjs";
import { sculptPaint } from "../work/test-build/sculpt-paint.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { encodeSTL } from "../work/test-build/stl-export.mjs";

const settings = {
  mode: "add",
  radius: 0.2,
  strength: 0.7,
  hardness: 0.3,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};

test("negative-inside half-space intersections form two nonempty capped SDF fields at centre, offset and rotated planes", () => {
  for (const plane of [
    { point: [0, 0, 0], normal: [1, 0, 0] },
    { point: [0.2, 0, 0], normal: [1, 0, 0] },
    { point: [0, 0, 0], normal: [0.707, 0, 0.707] },
  ]) {
    const source = new SDFVolume(17),
      preview = previewSdfPlaneCut(source, plane),
      split = splitSdfByPlane(source, plane);
    assert(preview.negativeSamples > 0 && preview.positiveSamples > 0 && preview.intersections > 0);
    assert.equal(split.negativeSamples, preview.negativeSamples);
    assert.equal(split.positiveSamples, preview.positiveSamples);
    assert.equal(split.intersections, preview.intersections);
    for (const field of [split.negative, split.positive])
      for (const [x, y, z] of [
        [0, 8, 8],
        [16, 8, 8],
        [8, 0, 8],
        [8, 16, 8],
        [8, 8, 0],
        [8, 8, 16],
      ])
        assert(field.readVoxel(field.index(x, y, z)) > 0);
    let cap = -1,
      distance = Infinity;
    for (let i = 0; i < source.values.length; i++) {
      const x = i % 17,
        y = Math.floor(i / 17) % 17,
        z = Math.floor(i / 289),
        d = Math.abs(
          (source.coordinate(x, 0) - plane.point[0]) * plane.normal[0] +
            (source.coordinate(y, 1) - plane.point[1]) * plane.normal[1] +
            (source.coordinate(z, 2) - plane.point[2]) * plane.normal[2],
        );
      if (source.readVoxel(i) < 0 && d < distance) {
        cap = i;
        distance = d;
      }
    }
    for (const field of [split.negative, split.positive])
      assert(Math.abs(field.readVoxel(cap)) < 1e-6);
  }
});

test("tangent/no-op and invalid cuts are rejected without changing source", () => {
  const source = new SDFVolume(17),
    before = source.values.slice();
  assert.throws(
    () => splitSdfByPlane(source, { point: [1.2, 0, 0], normal: [1, 0, 0] }),
    /does not split/,
  );
  assert.throws(
    () => previewSdfPlaneCut(source, { point: [0, 0, 0], normal: [0, 0, 0] }),
    /non-zero/,
  );
  assert.deepEqual(source.values, before);
});

test("expanded sparse lattice keeps its origin and dimensions through both cut pieces", () => {
  const compact = new SDFVolume(17),
    expanded = prepareDenseGrowth(compact, { min: [-2, -0.1, -0.1], max: [-1.5, 0.1, 0.1] }).volume;
  assert(expanded.latticeMin[0] < 0);
  const split = splitSdfByPlane(expanded, { point: [0, 0, 0], normal: [1, 0, 0] });
  for (const field of [split.negative, split.positive]) {
    assert.deepEqual(field.dimensions, expanded.dimensions);
    assert.deepEqual(field.latticeMin, expanded.latticeMin);
    assert.equal(field.step, expanded.step);
    assert.equal(field.values.length, expanded.values.length);
  }
});

test("Plane Cut creates independently editable grouped pieces, preserves cap paint/mask, and undoes/redoes atomically", async () => {
  const layers = new IndependentLayers(createBaseProject(new SDFVolume(17), settings));
  try {
    const original = layers.active.layer,
      group = layers.createGroup("Assembly");
    layers.reparent(original.id, group);
    layers.select(original.id);
    original.transform = { position: [0.1, 0, 0], rotation: [0, Math.PI / 4, 0], scale: [1, 1, 1] };
    const cutPoint = original.volume.index(8, 8, 8);
    sculptMask(original.volume).write(cutPoint, 0.75);
    sculptPaint(original.volume).channels[0].write(cutPoint, 0.4);
    sculptPaint(original.volume).channels[3].write(cutPoint, 1);
    const old = original.volume.values.slice(),
      rotation = original.transform.rotation.slice(),
      undoBefore = layers.undoCount,
      normal = [0, 0, 1],
      id = await layers.cutByPlane({ point: [0.1, 0, 0], normal }, new AbortController().signal);
    assert.equal(layers.project.layerStack.layers.length, 2);
    const piece = layers.project.layerStack.get(id);
    assert.equal(layers.project.layerStack.hierarchy.parent(piece.id), group);
    assert.deepEqual(piece.transform.rotation, rotation);
    assert.notEqual(piece.volume, original.volume);
    assert.notEqual(piece.volume.values.buffer, original.volume.values.buffer);
    assert.equal(sculptMask(original.volume).read(cutPoint), 0.75);
    assert.equal(sculptMask(piece.volume).read(cutPoint), 0.75);
    assert(Math.abs(sculptPaint(piece.volume).channels[0].read(cutPoint) - 0.4) < 1e-6);
    assert.equal(sculptPaint(piece.volume).channels[3].read(cutPoint), 1);
    const sources = layers.exportSources("visible", false);
    assert.equal(sources.length, 2);
    for (const source of sources) {
      const result = await encodeSTL([source], "standard", 256 * 1024 ** 2, 100);
      assert.equal(result.report.boundaryEdges, 0);
      assert.equal(result.report.nonManifoldEdges, 0);
      assert.equal(result.report.inconsistentEdges, 0);
      assert.deepEqual(result.report.blocking, []);
    }
    assert.equal(layers.undoCount, undoBefore + 1);
    layers.undo();
    assert.equal(layers.undoCount, undoBefore);
    assert.equal(layers.project.layerStack.layers.length, 1);
    assert.deepEqual(original.volume.values, old);
    assert.equal(layers.project.layerStack.hierarchy.parent(original.id), group);
    layers.undo(true);
    assert.equal(layers.project.layerStack.layers.length, 2);
    assert.equal(layers.project.activeLayerId, id);
    assert.equal(layers.project.layerStack.hierarchy.parent(id), group);
  } finally {
    layers.dispose();
  }
});

test("cancelled Plane Cut keeps source, active selection and redo history", async () => {
  const layers = new IndependentLayers(createBaseProject(new SDFVolume(17), settings));
  try {
    layers.createGroup("History");
    layers.undo();
    const before = layers.active.layer.volume.values.slice(),
      active = layers.project.activeLayerId,
      redo = layers.redoCount,
      abort = new AbortController();
    abort.abort();
    await assert.rejects(
      layers.cutByPlane({ point: [0, 0, 0], normal: [1, 0, 0] }, abort.signal),
      /cancelled/i,
    );
    assert.equal(layers.project.activeLayerId, active);
    assert.equal(layers.project.layerStack.layers.length, 1);
    assert.equal(layers.redoCount, redo);
    assert.deepEqual(layers.active.layer.volume.values, before);
  } finally {
    layers.dispose();
  }
});

test("all-editable cut creates a pair per layer and shares one undo/redo action", async () => {
  const layers = new IndependentLayers(createBaseProject(new SDFVolume(17), settings));
  try {
    const first = layers.active.layer,
      second = layers.create(64);
    layers.select(first.id);
    const firstBefore = first.volume.values.slice(),
      secondBefore = second.volume.values.slice(),
      undo = layers.undoCount;
    await layers.cutByPlane(
      { point: [0, 0, 0], normal: [1, 0, 0] },
      new AbortController().signal,
      () => {},
      "all-editable",
    );
    assert.equal(layers.project.layerStack.layers.length, 4);
    assert.equal(layers.undoCount, undo + 1);
    const cutIds = layers.project.layerStack.layers
      .filter((layer) => layer.name.includes("cut"))
      .map((layer) => layer.id);
    assert.equal(cutIds.length, 2);
    layers.undo();
    assert.equal(layers.project.layerStack.layers.length, 2);
    assert.deepEqual(first.volume.values, firstBefore);
    assert.deepEqual(second.volume.values, secondBefore);
    layers.undo(true);
    assert.equal(layers.project.layerStack.layers.length, 4);
    assert.equal(layers.project.activeLayerId, cutIds.at(-1));
  } finally {
    layers.dispose();
  }
});

test("all-editable cut rolls earlier pieces back if a later layer cannot be cut", async () => {
  const layers = new IndependentLayers(createBaseProject(new SDFVolume(17), settings));
  try {
    const first = layers.active.layer,
      second = layers.create(64);
    second.operation = "intersect";
    layers.select(first.id);
    const firstBefore = first.volume.values.slice(),
      secondBefore = second.volume.values.slice(),
      undo = layers.undoCount,
      redo = layers.redoCount;
    await assert.rejects(
      layers.cutByPlane(
        { point: [0, 0, 0], normal: [1, 0, 0] },
        new AbortController().signal,
        () => {},
        "all-editable",
      ),
      /Intersect/i,
    );
    assert.equal(layers.project.layerStack.layers.length, 2);
    assert.deepEqual(first.volume.values, firstBefore);
    assert.deepEqual(second.volume.values, secondBefore);
    assert.equal(layers.undoCount, undo);
    assert.equal(layers.redoCount, redo);
    assert.equal(layers.project.activeLayerId, first.id);
  } finally {
    layers.dispose();
  }
});

test("deleting a cut result invalidates the paired undo record before stale runtimes can be replayed", async () => {
  const layers = new IndependentLayers(createBaseProject(new SDFVolume(17), settings));
  try {
    const source = layers.active.layer,
      id = await layers.cutByPlane(
        { point: [0, 0, 0], normal: [1, 0, 0] },
        new AbortController().signal,
      );
    assert.equal(layers.undoCount, 1);
    layers.remove(id);
    assert.equal(layers.project.layerStack.layers.length, 1);
    assert.equal(layers.undoCount, 0);
    assert.equal(layers.undo(), null);
    assert(layers.active.layer === source);
  } finally {
    layers.dispose();
  }
});
