import assert from "node:assert/strict";
import test from "node:test";
import { Color, Vector3 } from "three";
import { installFileReader } from "../scripts/fixtures/export-node.mjs";
import { RecoveryBrowserWorker } from "../scripts/fixtures/node-recovery-worker.mjs";
import {
  combineSdf,
  prepareComposite,
  prepareCompositeColour,
} from "../work/test-build/compositor.mjs";
import { encodeExport } from "../work/test-build/glb-export.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { renameNative } from "../work/test-build/library-codec.mjs";
import {
  booleanRoots,
  validateBooleanGraph,
  validateModifiers,
} from "../work/test-build/live-boolean.mjs";
import { ModellingAPI } from "../work/test-build/modelling-api.mjs";
import { physicalExportLongestMM, physicalGLBSources } from "../work/test-build/physical-units.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { encodeRecovery } from "../work/test-build/recovery-client.mjs";
import { sculptMask } from "../work/test-build/sculpt-mask.mjs";
import { sculptPaint } from "../work/test-build/sculpt-paint.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { encodeSTL, validatePrintMesh } from "../work/test-build/stl-export.mjs";
import { identityTransform, transformMatrix } from "../work/test-build/transform.mjs";
import { TransformPreview } from "../work/test-build/transform-preview.mjs";

installFileReader();
const settings = {
  mode: "add",
  radius: 0.12,
  strength: 0.5,
  hardness: 0.5,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
const make = () => {
  const v = new SDFVolume(17, 1.6, false);
  v.values.fill(6.4);
  return new IndependentLayers(createBaseProject(v, structuredClone(settings)));
};
const modifier = (sourceId, operation = "difference", id = "hole") => ({
  id,
  sourceId,
  operation,
  enabled: true,
});
const fixture = async () => {
  const l = make();
  const box = await l.regeneratePrimitive({ kind: "box", width: 0.4, height: 0.3, depth: 0.1 });
  const cutter = await l.regeneratePrimitive({ kind: "cylinder", diameter: 0.03, height: 0.2 });
  l.select(cutter.id);
  const t = identityTransform();
  t.rotation[0] = Math.PI / 2;
  l.setActiveTransform(t);
  l.setBooleanModifiers(box.id, [modifier(cutter.id)]);
  return { l, box, cutter };
};
const sample = (l) => prepareComposite(l.project.layerStack.compositionLayers);
const run = (api, c, o = {}) => api.execute(c, { expectedRevision: api.revision, ...o });
const near = (a, b, e = 1e-5) => assert(Math.abs(a - b) < e, `${a} != ${b}`);

for (const [op, expected] of [
  ["union", -2],
  ["difference", 3],
  ["intersect", -2],
]) {
  test(`${op}: negative-inside min/max sign composition`, () =>
    near(combineSdf(-2, -3, op), op === "union" ? -3 : expected));
}
test("live analytical hole, source relocation/resize/rotation and unchanged source fields", async () => {
  const { l, box, cutter } = await fixture();
  try {
    const before = l.project.layerStack.layers.map((s) => s.volume.getDenseView().slice());
    assert(sample(l)(0, 0, 0) > 0);
    assert(sample(l)(0.05, 0, 0) < 0);
    assert(sample(l)(0.3, 0, 0) > 0);
    l.select(cutter.id);
    const t = structuredClone(cutter.transform);
    t.position[0] = 0.08;
    l.setActiveTransform(t);
    assert(sample(l)(0, 0, 0) < 0);
    assert(sample(l)(0.08, 0, 0) > 0);
    l.project.layerStack.layers.forEach((s, i) => {
      assert.deepEqual(s.volume.getDenseView(), before[i]);
    });
    await l.regeneratePrimitive({ kind: "cylinder", diameter: 0.08, height: 0.2 }, cutter.id);
    assert(sample(l)(0.11, 0, 0) > 0);
    assert(box.primitive);
    assert(cutter.primitive);
    l.undo();
    near(cutter.primitive.diameter, 0.03);
    l.undo(true);
    near(cutter.primitive.diameter, 0.08);
  } finally {
    l.dispose();
  }
});
test("ordered persistent stack differs from flattened sequence; enable/remove/reorder atomic Undo/Redo", async () => {
  const { l, box, cutter } = await fixture();
  try {
    const add = await l.regeneratePrimitive({ kind: "sphere", diameter: 0.02 });
    const a = modifier(cutter.id),
      b = modifier(add.id, "union", "fill");
    l.setBooleanModifiers(box.id, [a, b]);
    assert(sample(l)(0, 0, 0) < 0);
    l.setBooleanModifiers(box.id, [b, a]);
    assert(sample(l)(0, 0, 0) > 0);
    l.undo();
    assert(sample(l)(0, 0, 0) < 0);
    l.undo(true);
    assert(sample(l)(0, 0, 0) > 0);
    l.setBooleanModifiers(box.id, [{ ...a, enabled: false }, b]);
    assert(sample(l)(0, 0, 0) < 0);
    assert(booleanRoots(l.project.layerStack.layers).some((s) => s.id === cutter.id));
    l.setBooleanModifiers(box.id, []);
    assert(sample(l)(0, 0, 0) < 0);
  } finally {
    l.dispose();
  }
});
test("graph cycles, missing/self refs, duplicate IDs and locks reject atomically retaining history", async () => {
  const { l, box, cutter } = await fixture();
  try {
    const key = l.recoveryKey();
    assert.throws(() => l.setBooleanModifiers(cutter.id, [modifier(box.id)]), /acyclic|Duplicate/);
    assert.throws(
      () => l.setBooleanModifiers(box.id, [modifier("missing")]),
      /exist|Unknown|found/i,
    );
    assert.throws(() => l.setBooleanModifiers(box.id, [modifier(box.id)]), /acyclic/);
    assert.equal(l.recoveryKey(), key);
    l.setFlag(cutter.id, "locked", true);
    assert.throws(() => l.setBooleanModifiers(box.id, []), /locked/);
    l.setFlag(cutter.id, "locked", false);
    assert.throws(() => l.remove(cutter.id), /references/);
    assert.throws(() => validateModifiers([modifier(cutter.id), modifier(cutter.id)]), /Duplicate/);
    assert.throws(() => validateModifiers([{ ...modifier(cutter.id), enabled: "yes" }]), /Invalid/);
    assert.throws(
      () => validateModifiers([{ ...modifier(cutter.id), operation: "xor" }]),
      /Invalid/,
    );
  } finally {
    l.dispose();
  }
});
test("parented rotated operands evaluate in inherited world coordinates; visibility affects output rather than source", async () => {
  const { l, box, cutter } = await fixture();
  try {
    const group = l.groupNode(box.id, "assembly");
    l.reparent(cutter.id, group);
    const t = identityTransform();
    t.position = [1, 2, 3];
    t.rotation = [0.2, 0.6, 0.4];
    t.scale = [2, 2, 2];
    l.selectGroup(group);
    l.setActiveTransform(t);
    const matrix = transformMatrix(t),
      hole = new Vector3(0, 0, 0).applyMatrix4(matrix),
      solid = new Vector3(0.05, 0, 0).applyMatrix4(matrix);
    assert(sample(l)(hole.x, hole.y, hole.z) > 0);
    assert(sample(l)(solid.x, solid.y, solid.z) < 0);
    l.setFlag(cutter.id, "visible", false);
    assert(sample(l)(hole.x, hole.y, hole.z) > 0);
    l.setFlag(box.id, "visible", false);
    assert(sample(l)(solid.x, solid.y, solid.z) > 0);
  } finally {
    l.dispose();
  }
});
test("disjoint intersection is empty; no phantom cutter output", async () => {
  const { l, box, cutter } = await fixture();
  try {
    l.select(cutter.id);
    const t = structuredClone(cutter.transform);
    t.position[0] = 1;
    l.setActiveTransform(t);
    l.setBooleanModifiers(box.id, [modifier(cutter.id, "intersect")]);
    assert(sample(l)(0, 0, 0) > 0);
    assert(sample(l)(1, 0, 0) > 0);
    await l.composite.flush();
    assert.equal(l.composite.stats.triangles, 0);
  } finally {
    l.dispose();
  }
});
test("v12 native, Save As and ID-remapped library duplication preserve graph and editable parameters", async () => {
  const { l, box, cutter } = await fixture();
  try {
    const data = saveSculptProject(l.project);
    assert.equal(new DataView(data).getUint32(8, true), 12);
    const opened = openSculptProject(data);
    assert.deepEqual(opened.layerStack.get(box.id).booleanModifiers, box.booleanModifiers);
    assert(prepareComposite(opened.layerStack.compositionLayers)(0, 0, 0) > 0);
    const copy = openSculptProject(renameNative(data, "Copy", true));
    assert.notEqual(copy.id, l.project.id);
    assert(!copy.layerStack.layers.some((s) => s.id === cutter.id));
    validateBooleanGraph(copy.layerStack.layers);
    assert(prepareComposite(copy.layerStack.compositionLayers)(0, 0, 0) > 0);
    const copyBox = copy.layerStack.layers.find((s) => s.booleanModifiers?.length);
    assert.notEqual(copyBox.booleanModifiers[0].id, "hole");
    assert.equal(
      copy.layerStack.get(copyBox.booleanModifiers[0].sourceId).primitive.kind,
      "cylinder",
    );
  } finally {
    l.dispose();
  }
});
test("headless command revision, typed graph queries, update/remove and UI/backend parity", async () => {
  const { l, box, cutter } = await fixture();
  try {
    l.setBooleanModifiers(box.id, []);
    const api = new ModellingAPI(l),
      revision = api.revision;
    const r = await run(api, {
      type: "boolean.create",
      id: box.id,
      sourceId: cutter.id,
      operation: "difference",
    });
    assert(r.ok, JSON.stringify(r));
    const query = api.query({ type: "boolean.get", id: box.id });
    assert(query.ok);
    assert.equal(query.value.length, 1);
    const stale = await api.execute(
      { type: "boolean.remove", id: box.id, modifierId: query.value[0].id },
      { expectedRevision: revision },
    );
    assert.equal(stale.error.code, "revision_conflict");
    query.value[0].enabled = false;
    assert(box.booleanModifiers[0].enabled);
    assert((await run(api, { type: "boolean.update", id: box.id, modifiers: query.value })).ok);
    assert.equal(api.query({ type: "boolean.list" }).value.length, 1);
    assert(
      (await run(api, { type: "boolean.remove", id: box.id, modifierId: query.value[0].id })).ok,
    );
    assert.equal(box.booleanModifiers.length, 0);
  } finally {
    l.dispose();
  }
});
test("explicit target Bake retains sources and supports atomic Undo/Redo", async () => {
  const { l, box, cutter } = await fixture();
  try {
    const fields = l.project.layerStack.layers.map((s) => s.volume.getDenseView().slice());
    const api = new ModellingAPI(l);
    const r = await run(api, { type: "boolean.bake", id: box.id });
    assert(r.ok, JSON.stringify(r));
    const baked = l.project.layerStack.get(r.value.id);
    assert(!baked.primitive);
    assert(!baked.booleanModifiers);
    assert(!box.visible);
    assert(!cutter.visible);
    fields.forEach((v, i) => {
      assert.deepEqual(l.project.layerStack.layers[i].volume.getDenseView(), v);
    });
    l.undo();
    assert(box.visible);
    assert(cutter.visible);
    assert(sample(l)(0, 0, 0) > 0);
    l.undo(true);
    assert(!box.visible);
    assert.equal(l.project.activeLayerId, baked.id);
  } finally {
    l.dispose();
  }
});
test("preview cancellation/revision discard, stale export rejection and disposal lifecycle", async () => {
  const { l, box, cutter } = await fixture();
  try {
    const job = l.composite.rebuild();
    l.select(cutter.id);
    const t = structuredClone(cutter.transform);
    t.position[0] = 0.08;
    l.setActiveTransform(t);
    l.composite.syncMetadata();
    assert.equal(await job, false);
    assert.throws(() => l.exportSources(), /Wait/);
    await l.composite.flush();
    const sources = l.exportSources();
    assert.equal(sources.length, 1);
    assert(sources[0].current());
    l.setBooleanModifiers(box.id, []);
    assert(!sources[0].current());
    l.setBooleanModifiers(box.id, [modifier(cutter.id)]);
    const next = l.composite.rebuild();
    l.dispose();
    assert.equal(await next, false);
  } finally {
    l.dispose();
  }
});
test("actual GLB/STL export contains closed 3mm Boolean hole at calibrated 40x30x10mm dimensions", async () => {
  const { l } = await fixture();
  try {
    l.composite.setQuality(192);
    await l.composite.flush();
    const sources = l.exportSources();
    near(physicalExportLongestMM(sources, 100), 40, 0.15);
    const positions = new Float32Array(
      sources[0].chunks.reduce((n, c) => n + c.positions.length, 0),
    );
    let offset = 0;
    for (const c of sources[0].chunks) {
      positions.set(c.positions, offset);
      offset += c.positions.length;
    }
    const d = await validatePrintMesh(positions);
    assert.equal(d.boundaryEdges, 0);
    assert.equal(d.nonManifoldEdges, 0);
    assert.equal(d.components, 1);
    // A triangle crossing the through-hole's centre would falsely cap the bore.
    let boreFaces = 0;
    for (let i = 0; i < positions.length; i += 9) {
      const x = (positions[i] + positions[i + 3] + positions[i + 6]) / 3,
        y = (positions[i + 1] + positions[i + 4] + positions[i + 7]) / 3,
        z = (positions[i + 2] + positions[i + 5] + positions[i + 8]) / 3;
      if (Math.hypot(x, y) < 0.012 && Math.abs(z) > 0.045) assert.fail("hole was capped");
      if (Math.abs(Math.hypot(x, y) - 0.015) < 0.003 && Math.abs(z) < 0.04) boreFaces++;
    }
    assert(boreFaces > 20);
    const stl = await encodeSTL(sources, "fast", 256 * 1024 ** 2, 40);
    assert(stl.data.byteLength > 84);
    [40, 30, 10].forEach((d, i) => {
      near(stl.report.dimensions[i], d, 0.15);
    });
    assert.equal(stl.report.blocking.length, 0);
    const glb = await encodeExport(physicalGLBSources(sources, 100), "fast", 256 * 1024 ** 2);
    assert(glb.data.byteLength > 100);
    const glbView = new DataView(glb.data),
      jsonLength = glbView.getUint32(12, true),
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(glb.data, 20, jsonLength)));
    const accessor = json.accessors[json.meshes[0].primitives[0].attributes.POSITION],
      bufferView = json.bufferViews[accessor.bufferView],
      start = 28 + jsonLength + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0),
      stride = bufferView.byteStride ?? 12;
    let encodedBore = 0;
    for (let i = 0; i < accessor.count; i++) {
      const x = glbView.getFloat32(start + i * stride, true),
        y = glbView.getFloat32(start + i * stride + 4, true),
        z = glbView.getFloat32(start + i * stride + 8, true);
      if (Math.abs(Math.hypot(x, y) - 0.015) < 0.003 && Math.abs(z) < 0.04) encodedBore++;
    }
    assert(encodedBore > 20);
    assert(json.nodes.some((n) => n.matrix?.[0] === 0.1 || n.scale?.[0] === 0.1));
    const stlView = new DataView(stl.data);
    let printedBore = 0;
    for (let i = 0; i < stlView.getUint32(80, true); i++) {
      let x = 0,
        y = 0,
        z = 0;
      for (let k = 0; k < 3; k++) {
        x += stlView.getFloat32(96 + i * 50 + k * 12, true) / 3;
        y += stlView.getFloat32(100 + i * 50 + k * 12, true) / 3;
        z += stlView.getFloat32(104 + i * 50 + k * 12, true) / 3;
      }
      if (Math.hypot(x, y) < 1.2 && Math.abs(z) > 4.5) assert.fail("encoded STL capped the bore");
      if (Math.abs(Math.hypot(x, y) - 1.5) < 0.3 && Math.abs(z) < 4) printedBore++;
    }
    assert(printedBore > 20);
  } finally {
    l.dispose();
  }
});

test("actual recovery worker roundtrip and independent source duplication keep valid live references", async () => {
  const { l, box } = await fixture();
  try {
    const previous = globalThis.Worker;
    globalThis.Worker = RecoveryBrowserWorker;
    let encoded;
    try {
      encoded = await encodeRecovery(
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
    const reopened = openSculptProject(encoded.data);
    validateBooleanGraph(reopened.layerStack.layers);
    assert(prepareComposite(reopened.layerStack.compositionLayers)(0, 0, 0) > 0);
    const copy = await l.duplicateAsync(box.id);
    validateBooleanGraph(l.project.layerStack.layers);
    assert.notEqual(copy.booleanModifiers[0].id, box.booleanModifiers[0].id);
    assert.equal(copy.booleanModifiers[0].sourceId, box.booleanModifiers[0].sourceId);
  } finally {
    l.dispose();
  }
});

test("compatible sculpt source preserves masks/paint and winning cutter supplies generated face colour", async () => {
  const { l, box, cutter } = await fixture();
  try {
    l.setBooleanModifiers(box.id, []);
    const sculpt = await l.bake({
      name: "Sculpt target",
      resolution: box.volume.resolution,
      hideSources: true,
      sourceIds: [box.id],
    });
    const mask = sculptMask(sculpt.volume);
    mask.write(10, 0.75);
    const paint = sculptPaint(sculpt.volume);
    paint.channels[2].uniform(1);
    paint.channels[3].uniform(1);
    const beforeMask = mask.snapshot(),
      beforePaint = paint.snapshot(),
      before = sculpt.volume.getDenseView().slice();
    l.setBooleanModifiers(sculpt.id, [modifier(cutter.id, "difference", "sculpt-hole")]);
    assert(sample(l)(0, 0, 0) > 0);
    assert(sample(l)(0.05, 0, 0) < 0);
    const colour = prepareCompositeColour(
      l.project.layerStack.compositionLayers,
      (layer) => new Color(layer.id === cutter.id ? "red" : "blue"),
    );
    const face = colour(new Vector3(0.015, 0, 0), new Color());
    near(face.r, 1);
    near(face.g, 0);
    near(face.b, 0);
    l.select(cutter.id);
    const t = structuredClone(cutter.transform);
    t.position[0] = 0.08;
    l.setActiveTransform(t);
    assert.deepEqual(mask.snapshot(), beforeMask);
    assert.deepEqual(paint.snapshot(), beforePaint);
    assert.deepEqual(sculpt.volume.getDenseView(), before);
  } finally {
    l.dispose();
  }
});
test("quality/memory cap refusal, suspend/resume and finite empty result lifecycle", async () => {
  const { l } = await fixture();
  try {
    l.composite.setQuality(64);
    await l.composite.flush();
    assert(l.composite.stats.capped);
    assert.throws(() => l.exportSources(), /quality cap/);
    l.composite.setSuspended(true);
    await assert.rejects(l.composite.flush(), /tracking/);
    l.composite.setSuspended(false);
    l.composite.availableBytes = () => 1;
    await assert.rejects(l.composite.flush(), /memory budget/);
    assert.equal(l.composite.trackedBytes, 0);
  } finally {
    l.dispose();
  }
});
test("malformed serialized graph rejects missing refs/cycles; nonuniform operands rejected before publication", async () => {
  const { l, box, cutter } = await fixture();
  try {
    const data = saveSculptProject(l.project),
      view = new DataView(data),
      length = view.getUint32(12, true),
      metadata = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 16, length)));
    const corrupt = (sourceId) => {
      const copy = structuredClone(metadata);
      copy.layers.find((s) => s.id === box.id).booleanModifiers[0].sourceId = sourceId;
      const text = new TextEncoder().encode(JSON.stringify(copy)),
        out = new Uint8Array(16 + text.length + data.byteLength - 16 - length);
      out.set(new Uint8Array(data, 0, 16));
      new DataView(out.buffer).setUint32(12, text.length, true);
      out.set(text, 16);
      out.set(new Uint8Array(data, 16 + length), 16 + text.length);
      return out.buffer;
    };
    assert.throws(() => openSculptProject(corrupt(box.id)), /acyclic/);
    assert.throws(() => openSculptProject(corrupt("missing")), /source/);
    l.setBooleanModifiers(box.id, []);
    cutter.transform = { ...cutter.transform, scale: [1, 2, 1] };
    const before = l.recoveryKey();
    assert.throws(() => l.setBooleanModifiers(box.id, [modifier(cutter.id)]), /Non-uniform/);
    assert.equal(l.recoveryKey(), before);
  } finally {
    l.dispose();
  }
});

test("disposal between cooperative colour preparation and publication cannot resurrect resources", async () => {
  const { l } = await fixture();
  const original = l.composite.cooperativeColours.bind(l.composite);
  l.composite.cooperativeColours = async (...args) => {
    const result = await original(...args);
    l.dispose();
    return result;
  };
  try {
    assert.equal(await l.composite.rebuild(), false);
    assert.equal(l.composite.trackedBytes, 0);
  } finally {
    l.dispose();
  }
});

test("deleting a shared live source removes enabled and disabled references in one reversible action", async () => {
  const { l, box, cutter } = await fixture();
  try {
    const other = await l.regeneratePrimitive({ kind: "box", width: 0.2, height: 0.2, depth: 0.2 });
    const spare = await l.regeneratePrimitive({ kind: "sphere", diameter: 0.02 });
    l.setBooleanModifiers(other.id, [
      modifier(spare.id, "union", "keep"),
      { ...modifier(cutter.id, "difference", "disabled-cut"), enabled: false },
    ]);
    const original = [box, other].map((layer) => structuredClone(layer.booleanModifiers));
    l.reparent(cutter.id, box.id);
    l.select(cutter.id);
    const hierarchy = l.project.layerStack.hierarchy.snapshot(),
      field = cutter.volume.getDenseView().slice(),
      before = l.undoCount;
    l.deleteObject(cutter.id);
    assert.equal(l.undoCount, before + 1);
    assert.equal(box.booleanModifiers.length, 0);
    assert.deepEqual(
      other.booleanModifiers.map((m) => m.id),
      ["keep"],
    );
    assert(!l.project.layerStack.layers.some((layer) => layer.id === cutter.id));
    validateBooleanGraph(l.project.layerStack.layers);
    const opened = openSculptProject(saveSculptProject(l.project));
    assert(!opened.layerStack.layers.some((layer) => layer.id === cutter.id));
    l.undo();
    assert.equal(l.project.layerStack.get(cutter.id), cutter);
    assert.deepEqual(cutter.volume.getDenseView(), field);
    assert.deepEqual(l.project.layerStack.hierarchy.snapshot(), hierarchy);
    [box, other].forEach((layer, i) => {
      assert.deepEqual(layer.booleanModifiers, original[i]);
    });
    l.undo(true);
    assert(!l.project.layerStack.layers.some((layer) => layer.id === cutter.id));
    validateBooleanGraph(l.project.layerStack.layers);
  } finally {
    l.dispose();
  }
});

test("a refused or interrupted source deletion preserves references, selection and the redo branch", async () => {
  const { l, box, cutter } = await fixture();
  try {
    const other = await l.regeneratePrimitive({ kind: "sphere", diameter: 0.04 });
    l.setBooleanModifiers(other.id, [modifier(cutter.id, "union", "second-use")]);
    l.setFlag(other.id, "locked", true);
    l.renameNode(box.id, "Temporary name");
    l.undo();
    const before = l.recoveryKey(),
      undo = l.undoCount,
      redo = l.redoCount;
    assert.throws(() => l.deleteObject(cutter.id), /locked/);
    assert.equal(l.recoveryKey(), before);
    assert.equal(l.undoCount, undo);
    assert.equal(l.redoCount, redo);
    l.setFlag(other.id, "locked", false);
    l.reparent(other.id, cutter.id);
    l.renameNode(box.id, "Another name");
    l.undo();
    const state = l.recoveryKey(),
      history = [l.undoCount, l.redoCount],
      remove = l.project.layerStack.remove;
    l.project.layerStack.remove = () => {
      throw new Error("Injected removal failure");
    };
    try {
      assert.throws(() => l.deleteObject(cutter.id), /Injected/);
    } finally {
      l.project.layerStack.remove = remove;
    }
    assert.equal(l.recoveryKey(), state);
    assert.deepEqual([l.undoCount, l.redoCount], history);
    validateBooleanGraph(l.project.layerStack.layers);
  } finally {
    l.dispose();
  }
});
