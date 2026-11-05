import assert from "node:assert/strict";
import test from "node:test";
import { installFileReader } from "../scripts/fixtures/export-node.mjs";
import { RecoveryBrowserWorker } from "../scripts/fixtures/node-recovery-worker.mjs";
import {
  compositeLayout,
  prepareComposite,
  prepareLayerSampler,
} from "../work/test-build/compositor.mjs";
import { encodeExport } from "../work/test-build/glb-export.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { renameNative } from "../work/test-build/library-codec.mjs";
import { ModellingAPI } from "../work/test-build/modelling-api.mjs";
import { arrayInstanceAngles, validateArrayDefinition } from "../work/test-build/object-array.mjs";
import { physicalGLBSources } from "../work/test-build/physical-units.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { encodeRecovery } from "../work/test-build/recovery-client.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { encodeSTL } from "../work/test-build/stl-export.mjs";
import { identityTransform } from "../work/test-build/transform.mjs";

const settings = {
  mode: "add",
  radius: 0.12,
  strength: 0.5,
  hardness: 0.5,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
const make = () => {
  const volume = new SDFVolume(17, 1.6, false);
  volume.values.fill(6.4);
  return new IndependentLayers(createBaseProject(volume, structuredClone(settings)));
};
const radial = (id, count, angle = Math.PI * 2, orientation = "retain") => ({
  id: "repeat",
  kind: "radial",
  enabled: true,
  count,
  totalAngleRadians: angle,
  pivot: [0, 0, 0],
  axis: [0, 0, 1],
  angularOffsetRadians: 0,
  orientation,
});
const linear = (id, count, spacingModelUnits = 0.2, centered = false) => ({
  id: "repeat",
  kind: "linear",
  enabled: true,
  count,
  spacingModelUnits,
  axis: [1, 0, 0],
  centered,
});
const near = (a, b, e = 1e-5) => assert(Math.abs(a - b) <= e, `${a} != ${b}`);
installFileReader();

test("radial count 4/6/8 uses equal full-circle gaps; partial arcs include both ends", () => {
  for (const count of [4, 6, 8]) {
    const values = arrayInstanceAngles(validateArrayDefinition(radial("ignored", count)));
    assert.equal(values.length, count);
    near(values[count - 1] + (Math.PI * 2) / count, Math.PI * 2);
  }
  const partial = arrayInstanceAngles(validateArrayDefinition(radial("ignored", 4, Math.PI / 2)));
  near(partial[0], 0);
  near(partial.at(-1), Math.PI / 2);
  assert.throws(
    () => validateArrayDefinition({ ...radial("x", 17), count: 17 }),
    /between 1 and 16/,
  );
  assert.throws(
    () => validateArrayDefinition({ ...radial("x", 4), axis: [0, 0, 0] }),
    /cannot be zero/,
  );
});

test("array preview refuses work beyond the explicit evaluation quota", async () => {
  const l = make(),
    shape = await l.regeneratePrimitive({ kind: "sphere", diameter: 0.02 });
  const pose = identityTransform();
  pose.position = [100, 0, 0];
  l.select(shape.id);
  l.setActiveTransform(pose);
  shape.array = validateArrayDefinition(radial("quota", 16));
  assert.throws(
    () => compositeLayout(l.project.layerStack.compositionLayers, 192),
    /64 million sample budget/,
  );
  l.dispose();
});

test("radial and linear samplers preserve one authoritative primitive source and orientation modes", async () => {
  const l = make();
  const shape = await l.regeneratePrimitive({ kind: "sphere", diameter: 0.2 });
  const pose = identityTransform();
  pose.position = [0.5, 0, 0];
  l.select(shape.id);
  l.setActiveTransform(pose);
  shape.array = validateArrayDefinition(radial("repeat", 4));
  const sample = prepareLayerSampler(shape);
  assert(sample(0.5, 0, 0) < 0);
  assert(sample(0, 0.5, 0) < 0);
  assert(sample(-0.5, 0, 0) < 0);
  assert(sample(0, -0.5, 0) < 0);
  shape.array = validateArrayDefinition(radial("repeat", 4, Math.PI / 2));
  const arc = prepareLayerSampler(shape);
  assert(arc(0.5, 0, 0) < 0);
  assert(arc(0, 0.5, 0) < 0);
  assert(arc(-0.5, 0, 0) > 0);
  shape.array = validateArrayDefinition(linear("repeat", 3, 0.3, true));
  const line = prepareLayerSampler(shape);
  assert(line(0.2, 0, 0) < 0);
  assert(line(0.5, 0, 0) < 0);
  assert(line(0.8, 0, 0) < 0);
  shape.array = undefined;
  const source = prepareLayerSampler(shape);
  assert(source(0.5, 0, 0) < 0);
  assert(source(0, 0.5, 0) > 0);
  shape.array = validateArrayDefinition(radial("repeat", 6));
  const oldId = shape.array.id;
  await l.regeneratePrimitive({ kind: "sphere", diameter: 0.3 }, shape.id);
  assert.equal(shape.array.id, oldId);
  assert(
    prepareLayerSampler(shape)(0.25, (0.5 * Math.sqrt(3)) / 2, 0) < 0,
    "edited source dimensions propagate to every evaluated instance",
  );
  await l.dispose();
});

test("array commands are revision guarded, history atomic, and keep stable IDs through native v13", async () => {
  const l = make(),
    shape = await l.regeneratePrimitive({ kind: "box", width: 0.2, height: 0.2, depth: 0.2 }),
    api = new ModellingAPI(l),
    create = await api.execute(
      { type: "array.create", id: shape.id, definition: radial("ignored", 4) },
      { expectedRevision: api.revision },
    );
  assert.equal(create.ok, true);
  const stored = l.project.layerStack.get(shape.id).array;
  assert(stored);
  const stable = stored.id;
  assert.equal(api.query({ type: "array.get", id: shape.id }).value.id, stable);
  const movedPivot = await api.execute(
    { type: "array.update", id: shape.id, definition: { ...stored, pivot: [100, 0, 0] } },
    { expectedRevision: api.revision },
  );
  assert.equal(movedPivot.ok, true);
  assert.equal(l.project.layerStack.get(shape.id).array.pivot[0], 1);
  assert.equal(api.query({ type: "array.get", id: shape.id }).value.pivot[0], 100);
  const updated = await api.execute(
    {
      type: "array.update",
      id: shape.id,
      definition: { ...api.query({ type: "array.get", id: shape.id }).value, count: 8 },
    },
    { expectedRevision: api.revision },
  );
  assert.equal(updated.ok, true);
  assert.equal(l.project.layerStack.get(shape.id).array.count, 8);
  const stale = await api.execute(
    { type: "array.remove", id: shape.id },
    { expectedRevision: "stale" },
  );
  assert.equal(stale.ok, false);
  assert.equal(stale.error.code, "revision_conflict");
  l.undo();
  assert.equal(l.project.layerStack.get(shape.id).array.count, 4);
  l.undo(true);
  assert.equal(l.project.layerStack.get(shape.id).array.count, 8);
  const native = saveSculptProject(l.project),
    restored = openSculptProject(native);
  assert.equal(new DataView(native).getUint32(8, true), 13);
  assert.deepEqual(
    restored.layerStack.get(shape.id).array,
    l.project.layerStack.get(shape.id).array,
  );
  const duplicate = openSculptProject(renameNative(native, "Array copy", true));
  const duplicateArray = duplicate.layerStack.layers.find((layer) => layer.array)?.array;
  assert(duplicateArray);
  assert.notEqual(duplicateArray.id, stable);
  const linearCommand = await api.execute(
    { type: "array.update", id: shape.id, definition: linear(stable, 3, 20, true) },
    { expectedRevision: api.revision },
  );
  assert.equal(linearCommand.ok, true);
  assert.equal(l.project.layerStack.get(shape.id).array.spacingModelUnits, 0.2);
  assert.equal(api.query({ type: "array.get", id: shape.id }).value.spacingModelUnits, 20);
  await l.dispose();
});

test("actual recovery worker preserves arrays and legacy native projects remain readable", async () => {
  const l = make(),
    shape = await l.regeneratePrimitive({ kind: "sphere", diameter: 0.2 });
  l.setArrayDefinition(shape.id, radial("recovery-array", 6));
  const previous = globalThis.Worker;
  globalThis.Worker = RecoveryBrowserWorker;
  let recovered;
  try {
    recovered = await encodeRecovery(
      l,
      settings,
      undefined,
      undefined,
      new AbortController().signal,
      () => true,
    );
  } finally {
    globalThis.Worker = previous;
  }
  const reopened = openSculptProject(recovered.data);
  assert.deepEqual(reopened.layerStack.get(shape.id).array, shape.array);
  const legacyVolume = new SDFVolume(17, 1.6, false);
  legacyVolume.values.fill(6.4);
  const legacy = saveSculptProject(createBaseProject(legacyVolume, structuredClone(settings)));
  assert(legacy.byteLength > 16);
  assert(openSculptProject(legacy).layerStack.layers.length > 0);
  l.dispose();
});

test("array evaluation exports repeated GLB/STL geometry and physical dimensions", async () => {
  const l = make(),
    shape = await l.regeneratePrimitive({ kind: "cylinder", diameter: 0.08, height: 0.12 });
  shape.array = validateArrayDefinition(radial("repeat", 4));
  l.viewMode = "boolean";
  await l.composite.flush();
  const sources = l.exportSources("visible"),
    glb = new Uint8Array(
      (await encodeExport(physicalGLBSources(sources, 100), "fast", 64 * 1024 * 1024)).data,
    );
  assert.equal(new DataView(glb.buffer).getUint32(0, true), 0x46546c67);
  const glbView = new DataView(glb.buffer, glb.byteOffset, glb.byteLength),
    jsonLength = glbView.getUint32(12, true),
    document = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + jsonLength))),
    positions = document.meshes.flatMap((mesh) =>
      mesh.primitives.map((primitive) => primitive.attributes.POSITION),
    ),
    vertexCount = positions.reduce((sum, index) => sum + document.accessors[index].count, 0),
    minX = Math.min(...positions.map((index) => document.accessors[index].min[0])),
    maxX = Math.max(...positions.map((index) => document.accessors[index].max[0]));
  assert(vertexCount > 384);
  assert(minX < -0.01 && maxX > 0.01, "GLB contains all four calibrated world-space repeats");
  const stl = await encodeSTL(sources, "fast", 64 * 1024 * 1024, 100),
    bytes = new Uint8Array(stl.data),
    count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(80, true);
  assert(count > 384);
  const report = stl.report;
  assert.equal(report.degenerateTriangles, 0);
  assert.equal(report.boundaryEdges, 0);
  assert.equal(report.nonManifoldEdges, 0, JSON.stringify(report));
  assert(report.dimensions[0] > 10 && report.dimensions[1] > 10);
  await l.dispose();
});

test("explicit array Bake creates independent geometry and history restores the editable array", async () => {
  const l = make(),
    shape = await l.regeneratePrimitive({ kind: "sphere", diameter: 0.2 });
  const api = new ModellingAPI(l),
    created = await api.execute(
      { type: "array.create", id: shape.id, definition: radial("pending", 4) },
      { expectedRevision: api.revision },
    );
  assert.equal(created.ok, true);
  const baked = await new ModellingAPI(l).execute(
    { type: "array.bake", id: shape.id },
    { expectedRevision: new ModellingAPI(l).revision },
  );
  assert.equal(baked.ok, true);
  const result = l.project.layerStack.get(baked.value.id);
  assert.equal(result.array, undefined);
  assert.equal(result.primitive, undefined);
  assert.equal(l.project.layerStack.get(shape.id).array.enabled, true);
  l.undo();
  assert.equal(l.project.layerStack.get(shape.id).localVisible, true);
  l.undo(true);
  assert.equal(l.project.layerStack.get(shape.id).localVisible, false);
  l.dispose();
});

test("radial array used as a live Boolean cutter yields four real holes in binary STL", async () => {
  const l = make(),
    target = await l.regeneratePrimitive({ kind: "box", width: 0.4, height: 0.3, depth: 0.1 }),
    cutter = await l.regeneratePrimitive({ kind: "cylinder", diameter: 0.04, height: 0.2 }),
    pose = identityTransform();
  pose.position = [0.09, 0, 0];
  pose.rotation[0] = Math.PI / 2;
  l.select(cutter.id);
  l.setActiveTransform(pose);
  l.setArrayDefinition(cutter.id, radial("hole-array", 4));
  l.setBooleanModifiers(target.id, [
    { id: "mounting-holes", sourceId: cutter.id, operation: "difference", enabled: true },
  ]);
  const evaluate = prepareComposite(l.project.layerStack.compositionLayers);
  assert(evaluate(0.09, 0, 0) > 0);
  assert(
    evaluate(0, 0, 0) < 0,
    `centre sample ${evaluate(0, 0, 0)}; target ${prepareLayerSampler(target)(0, 0, 0)}`,
  );
  assert.equal(new ModellingAPI(l).query({ type: "array.list" }).value.length, 1);
  await l.composite.flush();
  const source = l.exportSources("visible");
  assert.equal(
    source.length,
    1,
    "the live cutter is consumed and appears only through the result mesh",
  );
  const stl = await encodeSTL(source, "fast", 128 * 1024 * 1024, 40),
    bytes = new Uint8Array(stl.data),
    triangleCount = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
      80,
      true,
    );
  assert.equal(bytes.byteLength, 84 + triangleCount * 50);
  assert(triangleCount > 1000);
  assert.equal(stl.report.boundaryEdges, 0, JSON.stringify(stl.report));
  assert.equal(stl.report.nonManifoldEdges, 0, JSON.stringify(stl.report));
  assert.equal(stl.report.components, 1);
  assert.equal(stl.report.blocking.length, 0);
  assert(stl.report.dimensions[0] > 35 && stl.report.dimensions[0] < 45);
  await l.dispose();
});

test("radial gap changes neighbouring sphere clearance without moving the original source", async () => {
  const { radialGap } = await import("../work/test-build/array-spacing.mjs");
  const l = make();
  try {
    const shape = await l.regeneratePrimitive({ kind: "sphere", diameter: 0.1 });
    for (const count of [2, 4, 8]) {
      for (const angle of [Math.PI, Math.PI * 1.9, Math.PI * 2]) {
        const definition = radial("repeat", count, angle);
        for (const gap of [0, 0.03, 0.1]) {
          definition.pivot = radialGap(
            definition,
            shape.transform,
            shape.volume.bounds,
            shape.primitive,
            gap,
          ).pivot;
          const read = radialGap(definition, shape.transform, shape.volume.bounds, shape.primitive);
          assert(Math.abs(read.gap - gap) < 1e-8);
          l.setArrayDefinition(shape.id, definition);
          const sampler = prepareLayerSampler(shape);
          assert(sampler(...shape.transform.position) < -0.049);
          assert.deepEqual(shape.transform.position, [0, 0, 0]);
          assert.equal(shape.primitive.diameter, 0.1);
        }
      }
    }
    assert.throws(
      () =>
        radialGap(radial("repeat", 4), shape.transform, shape.volume.bounds, shape.primitive, -1),
      /non-negative/,
    );
    assert.throws(
      () =>
        radialGap(radial("repeat", 1), shape.transform, shape.volume.bounds, shape.primitive, 1),
      /at least two/,
    );
  } finally {
    l.dispose();
  }
});

test("radial projected gap accounts for rotated scaled boxes, orientation and sculpt bounds", async () => {
  const { radialGap } = await import("../work/test-build/array-spacing.mjs");
  const pose = identityTransform();
  pose.position = [0.3, 0.2, 0.1];
  pose.rotation = [0.2, 0.4, 0.6];
  pose.scale = [2, 2, 2];
  const bounds = { min: [-0.1, -0.2, -0.3], max: [0.1, 0.2, 0.3] };
  for (const orientation of ["retain", "rotate"]) {
    for (const primitive of [undefined, { kind: "box", width: 0.1, height: 0.2, depth: 0.3 }]) {
      const definition = radial("repeat", 6, Math.PI * 2, orientation);
      definition.axis = [0, 1, 0];
      definition.pivot = radialGap(definition, pose, bounds, primitive, 0.025).pivot;
      const actual = radialGap(definition, pose, bounds, primitive);
      assert(Math.abs(actual.gap - 0.025) < 1e-8);
      assert.equal(definition.pivot[1], 0);
    }
  }
});

test("per-item scale compounds at copy centres for linear and both radial orientations", async () => {
  const l = make();
  try {
    const shape = await l.regeneratePrimitive({ kind: "sphere", diameter: 0.1 });
    shape.transform.position = [0.5, 0, 0];
    for (const factor of [0.9, 1, 1.1]) {
      for (const mode of ["linear", "retain", "rotate"]) {
        shape.array = validateArrayDefinition(
          mode === "linear"
            ? {
                id: "scale",
                kind: "linear",
                enabled: true,
                count: 4,
                axis: [1, 0, 0],
                spacingModelUnits: 0.4,
                centered: false,
                scalePerItem: factor,
              }
            : { ...radial("scale", 4, Math.PI * 2, mode), scalePerItem: factor },
        );
        const sample = prepareLayerSampler(shape);
        for (let i = 0; i < 4; i++) {
          const angle = (i * Math.PI) / 2,
            centre =
              mode === "linear"
                ? [0.5 + i * 0.4, 0, 0]
                : [0.5 * Math.cos(angle), 0.5 * Math.sin(angle), 0],
            radius = 0.05 * factor ** i;
          assert(Math.abs(sample(...centre) + radius) < 1e-7);
          assert(Math.abs(sample(centre[0], centre[1], radius)) < 1e-7);
          assert(sample(centre[0], centre[1], radius * 1.1) > 0);
        }
        const layout = compositeLayout([shape], 192);
        const lastRadius = 0.05 * factor ** 3;
        if (mode === "linear") assert(layout.center[0] + layout.extent >= 1.7 + lastRadius);
        assert(layout.desiredStep <= shape.volume.step * Math.min(1, factor ** 3) + 1e-9);
      }
    }
  } finally {
    l.dispose();
  }
});

test("scaled arrays validate, Undo/Redo and persist through native v15 and recovery", async () => {
  const l = make();
  try {
    const shape = await l.regeneratePrimitive({ kind: "box", width: 0.1, height: 0.1, depth: 0.1 });
    const definition = { ...radial("scale", 4), scalePerItem: 0.9 };
    for (const value of [0, -1, NaN, Infinity, "90", 0.001, 100])
      assert.throws(
        () => validateArrayDefinition({ ...definition, scalePerItem: value }),
        /Scale per item/,
      );
    assert.equal(
      validateArrayDefinition({ ...definition, scalePerItem: 1 }).scalePerItem,
      undefined,
    );
    l.setArrayDefinition(shape.id, definition);
    l.undo();
    assert.equal(shape.array, undefined);
    l.undo(true);
    assert.equal(shape.array.scalePerItem, 0.9);
    const data = saveSculptProject(l.project);
    assert.equal(new DataView(data).getUint32(8, true), 15);
    assert.equal(openSculptProject(data).layerStack.get(shape.id).array.scalePerItem, 0.9);
    const outdated = data.slice(0);
    new DataView(outdated).setUint32(8, 14, true);
    assert.throws(() => openSculptProject(outdated), /version 15/);
    const previous = globalThis.Worker;
    globalThis.Worker = RecoveryBrowserWorker;
    try {
      const saved = await encodeRecovery(
        l,
        settings,
        undefined,
        undefined,
        new AbortController().signal,
        () => true,
      );
      assert.equal(openSculptProject(saved.data).layerStack.get(shape.id).array.scalePerItem, 0.9);
    } finally {
      globalThis.Worker = previous;
    }
    const duplicated = openSculptProject(renameNative(data, "copy", true));
    assert.equal(duplicated.layerStack.layers.find((layer) => layer.array).array.scalePerItem, 0.9);
  } finally {
    l.dispose();
  }
});

test("radial gap uses each progressively scaled neighbour's dimensions", async () => {
  const { radialGap } = await import("../work/test-build/array-spacing.mjs");
  const definition = { ...radial("scaled-gap", 4), scalePerItem: 0.9 },
    pose = identityTransform(),
    bounds = { min: [-0.05, -0.05, -0.05], max: [0.05, 0.05, 0.05] },
    primitive = { kind: "sphere", diameter: 0.1 };
  definition.pivot = radialGap(definition, pose, bounds, primitive, 0.02).pivot;
  assert(Math.abs(radialGap(definition, pose, bounds, primitive).gap - 0.02) < 1e-8);
});

test("progressive geometry reaches actual STL and explicit Bake", async () => {
  const l = make();
  try {
    const shape = await l.regeneratePrimitive({ kind: "sphere", diameter: 0.1 });
    l.setFlag(l.project.layerStack.layers[0].id, "visible", false);
    l.setArrayDefinition(shape.id, {
      id: "progressive",
      kind: "linear",
      enabled: true,
      count: 3,
      axis: [1, 0, 0],
      spacingModelUnits: 0.15,
      centered: false,
      scalePerItem: 0.9,
    });
    l.viewMode = "boolean";
    await l.composite.flush();
    const { withExportMemory } = await import("../work/test-build/assembly-tools.mjs");
    const { prepareBooleanExport } = await import("../work/test-build/boolean-export.mjs");
    const stl = await withExportMemory(l, async () => {
      const prepared = await prepareBooleanExport(l, l.project);
      try {
        return await encodeSTL(prepared.sources, "fast", prepared.availableBytes(), 39.05);
      } finally {
        prepared.dispose();
      }
    });
    assert.equal(stl.report.boundaryEdges, 0);
    assert.equal(stl.report.nonManifoldEdges, 0);
    assert(Math.abs(stl.report.dimensions[0] - 39.05) < 0.5);
    assert(Math.abs(stl.report.dimensions[1] - 10) < 0.3);
    l.setArrayDefinition(shape.id, { ...shape.array, count: 2, spacingModelUnits: 0.1 });
    const api = new ModellingAPI(l),
      baked = await api.execute(
        { type: "array.bake", id: shape.id },
        { expectedRevision: api.revision },
      );
    assert(baked.ok, JSON.stringify(baked));
    const result = l.project.layerStack.get(baked.value.id),
      sample = prepareLayerSampler(result);
    assert(sample(0.1, 0, 0.04) < 0);
    assert(sample(0.1, 0, 0.048) > 0);
    l.undo();
    assert.equal(l.project.layerStack.get(shape.id).array.scalePerItem, 0.9);
  } finally {
    l.dispose();
  }
});
