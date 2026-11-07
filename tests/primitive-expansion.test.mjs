import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "three";
import { validateCall } from "../scripts/agent-schemas.mjs";
import { installFileReader } from "../scripts/fixtures/export-node.mjs";
import { createHeadlessEditor } from "../scripts/headless-enclosure.mjs";
import { AgentProposals, agentExecutor } from "../work/test-build/agent-access.mjs";
import { compositeLayout, prepareLayerSampler } from "../work/test-build/compositor.mjs";
import { encodeExport } from "../work/test-build/glb-export.mjs";
import {
  evaluatePrimitive,
  primitiveDimensions,
  primitiveDistance,
  primitiveGeometry,
  primitiveWorldBounds,
  primitiveWorldDimensions,
  validatePrimitive,
} from "../work/test-build/parametric-primitive.mjs";
import { physicalGLBSources } from "../work/test-build/physical-units.mjs";
import { PrimitiveTools } from "../work/test-build/primitive-tools.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { encodeSTL, validatePrintMesh } from "../work/test-build/stl-export.mjs";
import { identityTransform, transformMatrix } from "../work/test-build/transform.mjs";
import { scaledPrimitive } from "../work/test-build/transform-tools.mjs";

installFileReader();
const cone = { kind: "cylinder", diameter: 0.6, bottomDiameter: 0.6, topDiameter: 0, height: 0.8 };
const capsule = { kind: "capsule", diameter: 0.2, height: 0.8 };
const torus = { kind: "torus", majorRadius: 0.3, tubeDiameter: 0.12 };
const pyramid = { kind: "pyramid", width: 0.6, height: 0.8, depth: 0.4 };
const shapes = [cone, capsule, torus, pyramid];
const near = (a, b, e = 1e-6) => assert(Math.abs(a - b) < e, `${a} != ${b}`);
const physical = (s) =>
  Object.fromEntries(Object.entries(s).map(([k, v]) => [k, typeof v === "number" ? v * 100 : v]));

test("expanded primitive exact distances, sharp/tiny/blunt cone apex, hemispheres and open torus hole", () => {
  near(primitiveDistance(cone, 0, 0.5, 0), 0.1);
  near(primitiveDistance(cone, 0, -0.5, 0), 0.1);
  near(primitiveDistance(cone, 0, 0.4, 0), 0);
  assert(primitiveDistance(cone, 0, 0, 0) < 0);
  near(primitiveDistance(cone, 0.15, 0, 0), 0);
  for (const tip of [0, 1e-12, 1e-7, 0.02]) {
    const s = validatePrimitive({ ...cone, topDiameter: tip });
    for (const p of [
      [0, 0.4, 0],
      [1e-20, 0.4, 0],
      [0, 0, 0],
      [0.001, 0.399, 0],
    ])
      assert(Number.isFinite(primitiveDistance(s, ...p)));
    near(primitiveDistance(s, tip / 2, 0.4, 0), 0, 1e-12);
  }
  near(primitiveDistance(capsule, 0, 0, 0), -0.1);
  near(primitiveDistance(capsule, 0, 0.5, 0), 0.1);
  near(primitiveDistance(capsule, 0.2, 0.3, 0), 0.1);
  near(primitiveDistance(capsule, 0.06, 0.38, 0), 0);
  near(primitiveDistance(torus, 0, 0, 0), 0.24);
  near(primitiveDistance(torus, 0.3, 0, 0), -0.06);
  near(primitiveDistance(torus, 0.3, 0.16, 0), 0.1);
  near(primitiveDistance(pyramid, 0, -0.5, 0), 0.1);
  near(primitiveDistance(pyramid, 0, 0.5, 0), 0.1);
  near(primitiveDistance(pyramid, 0.15, 0, 0), 0);
  assert(primitiveDistance(pyramid, 0, 0, 0) < 0);
  near(primitiveDistance(pyramid, 0.4, -0.4, 0.3), Math.SQRT2 * 0.1);
});

test("dimension constraints refuse malformed, self-intersecting, over-aspect and unsupported elliptical shapes", () => {
  for (const s of [
    { ...capsule, height: 0.1 },
    { ...capsule, height: 2 },
    { ...torus, majorRadius: 0.06 },
    { ...torus, tubeDiameter: 0 },
    { ...pyramid, width: NaN },
    { ...cone, topDiameter: -1 },
    { ...cone, bottomDiameter: 0 },
    { ...torus, depth: 1 },
    { ...capsule, height: Infinity },
  ])
    assert.throws(() => validatePrimitive(s));
  assert.deepEqual(primitiveDimensions(capsule), [0.2, 0.8, 0.2]);
  assert.deepEqual(primitiveDimensions(torus), [0.72, 0.12, 0.72]);
  near(primitiveDistance({ ...capsule, height: 0.2 }, 0, 0, 0), -0.1);
  assert.equal(validatePrimitive({ ...capsule, height: 1.6 }).height, 1.6);
});

for (const s of shapes) {
  test(`${s.kind} geometry, exact transformed bounds, outward normals and closed source STL/GLB at physical scale`, async () => {
    const { layers } = createHeadlessEditor();
    try {
      const pose = identityTransform();
      pose.rotation = [0.4, 0.7, 0.2];
      pose.position = [0.3, -0.2, 0.1];
      pose.scale = [1.2, 1.2, 1.2];
      const g = primitiveGeometry(s);
      const p = g.getAttribute("position"),
        n = g.getAttribute("normal");
      for (let i = 0; i < p.count; i += Math.max(1, Math.floor(p.count / 100))) {
        const point = new Vector3().fromBufferAttribute(p, i),
          normal = new Vector3().fromBufferAttribute(n, i);
        assert(Number.isFinite(normal.length()));
        assert(
          primitiveDistance(s, ...point.clone().addScaledVector(normal, 0.0001).toArray()) >= -1e-6,
        );
      }
      const bounds = primitiveWorldBounds(s, pose),
        m = transformMatrix(pose),
        dims = primitiveWorldDimensions(s, pose);
      for (let a = 0; a < 3; a++) near(bounds.max[a] - bounds.min[a], dims[a], 1e-12);
      for (let i = 0; i < p.count; i++) {
        const q = new Vector3().fromBufferAttribute(p, i).applyMatrix4(m).toArray();
        for (let a = 0; a < 3; a++)
          assert(q[a] >= bounds.min[a] - 1e-6 && q[a] <= bounds.max[a] + 1e-6);
      }
      g.dispose();
      await layers.regeneratePrimitive(s);
      const sources = layers.exportSources("selected");
      const topology = await validatePrintMesh(sources[0].chunks[0].positions);
      for (const field of [
        "boundaryEdges",
        "nonManifoldEdges",
        "degenerateTriangles",
        "inconsistentEdges",
      ])
        if (field in topology) assert.equal(topology[field], 0, JSON.stringify(topology));
      assert.equal(topology.components, 1);
      const stl = await encodeSTL(
        sources,
        "fast",
        256 * 1024 ** 2,
        Math.max(...primitiveDimensions(s)) * 100,
      );
      const view = new DataView(stl.data),
        coords = [[], [], []];
      for (let t = 0; t < view.getUint32(80, true); t++)
        for (let v = 0; v < 3; v++)
          for (let a = 0; a < 3; a++)
            coords[a].push(view.getFloat32(84 + t * 50 + 12 + v * 12 + a * 4, true));
      const encodedDims = coords.map((v) => Math.max(...v) - Math.min(...v));
      primitiveDimensions(s).forEach((d, i) => {
        near(encodedDims[i], d * 100, 0.01);
      });
      const calibrated = physicalGLBSources(sources, 100);
      const glb = await encodeExport(calibrated, "fast", 256 * 1024 ** 2);
      const gv = new DataView(glb.data),
        json = JSON.parse(
          new TextDecoder().decode(new Uint8Array(glb.data, 20, gv.getUint32(12, true))),
        );
      assert(json.nodes.some((node) => node.matrix?.[0] === 0.1 || node.scale?.[0] === 0.1));
      assert.equal(json.meshes.length, 1);
    } finally {
      layers.dispose();
    }
  });
  test(`${s.kind} v20 native/source cache, lower-version refusal, duplication and editable one Undo`, async () => {
    const { layers } = createHeadlessEditor();
    try {
      const p = await layers.regeneratePrimitive(s),
        id = p.id;
      const bytes = saveSculptProject(layers.project);
      assert.equal(new DataView(bytes).getUint32(8, true), 20);
      assert.deepEqual(openSculptProject(bytes).layerStack.active.primitive, s);
      for (const version of [11, 16, 17, 18, 19]) {
        const bad = bytes.slice(0);
        new DataView(bad).setUint32(8, version, true);
        assert.throws(() => openSculptProject(bad), /version/);
      }
      const before = layers.undoCount;
      const next = scaledPrimitive(s, [1.1, 1.1, 1.1], "XYZ");
      await layers.regeneratePrimitive(next, id);
      assert.equal(layers.undoCount, before + 1);
      assert.equal(layers.active.layer.id, id);
      layers.undo();
      assert.deepEqual(layers.active.layer.primitive, s);
      layers.undo(true);
      assert.deepEqual(layers.active.layer.primitive, next);
      const duplicate = layers.duplicate(id);
      assert(duplicate);
      assert.notEqual(layers.active.layer.id, id);
      assert.deepEqual(layers.active.layer.primitive, next);
    } finally {
      layers.dispose();
    }
  });
}

test("torus thin tube/hole asks for finer CSG grid and existing caps refuse, high aspect capsule stays bounded", async () => {
  const { layers } = createHeadlessEditor();
  try {
    for (const s of [
      { ...torus, tubeDiameter: 0.006 },
      { ...torus, majorRadius: 0.061 },
    ]) {
      const p = await layers.regeneratePrimitive(s);
      p.array = {
        id: "repeat",
        kind: "linear",
        enabled: true,
        count: 2,
        axis: [1, 0, 0],
        spacingModelUnits: 1,
        centered: true,
      };
      const layout = compositeLayout([p], 192, true);
      assert(layout.capped);
      assert(layout.resolution <= 192);
      assert(prepareLayerSampler(p)(0, 0, 0) > 0);
      p.array = undefined;
    }
    const start = performance.now();
    const gen = evaluatePrimitive({ ...capsule, height: 1.6 }, 63, 63 ** 3);
    let r = gen.next(),
      yields = 0;
    while (!r.done) {
      yields++;
      r = gen.next();
    }
    assert.equal(r.value.values.length, 63 ** 3);
    assert(yields >= 1900);
    assert(performance.now() - start < 10000);
  } finally {
    layers.dispose();
  }
});

test("Quest creation subpage has all seven choices, disjoint targets, exact fields/units, Cone stays editable cylinder", async () => {
  const { layers } = createHeadlessEditor();
  const tools = new PrimitiveTools(() => layers);
  try {
    tools.activate("primitive:types");
    const picker = tools.content();
    for (const name of ["Cone", "Capsule", "Torus", "Pyramid"])
      assert(picker.buttons.some((b) => b.label === `New ${name}`));
    for (const kind of ["cone", "capsule", "torus", "pyramid"]) {
      tools.activate(`primitive:type:${kind}`);
      const menu = tools.content();
      for (let i = 0; i < menu.buttons.length; i++)
        for (let j = i + 1; j < menu.buttons.length; j++) {
          const a = menu.buttons[i].rect,
            b = menu.buttons[j].rect;
          assert(
            !(
              a.x < b.x + b.width &&
              a.x + a.width > b.x &&
              a.y < b.y + b.height &&
              a.y + a.height > b.y
            ),
            `${menu.buttons[i].id}/${menu.buttons[j].id}`,
          );
        }
      assert(
        menu.buttons.some((b) => b.id.startsWith("primitive:field:") && b.label.includes("mm")),
      );
      if (kind === "cone") {
        assert.equal(tools.draft.kind, "cylinder");
        assert.equal(tools.draft.topDiameter, 0);
        await tools.create();
        assert.equal(tools.source.topDiameter, 0);
      }
    }
  } finally {
    tools.dispose();
    layers.dispose();
  }
});

test("strict MCP expanded primitives share dry-run, consent, stale guards and one transaction Undo", async () => {
  const { layers, api } = createHeadlessEditor(),
    proposals = new AgentProposals();
  let editing = true;
  const run = agentExecutor(
    layers,
    () => editing,
    () => false,
    () => {},
    proposals,
  );
  const call = (name, args = {}) =>
    run(
      { name, args, id: "expansion", deadline: Date.now() + 15000 },
      new AbortController().signal,
    );
  try {
    const steps = shapes.map((s, i) => ({
      as: `shape${i}`,
      command: { type: "primitive.create", unit: "mm", source: physical(s) },
    }));
    for (const { command } of steps)
      validateCall({
        name: "create_primitive",
        args: { expectedRevision: api.revision, unit: command.unit, source: command.source },
      });
    assert.throws(() =>
      validateCall({
        name: "create_primitive",
        args: {
          expectedRevision: api.revision,
          unit: "mm",
          source: { ...physical(torus), garbage: 1 },
        },
      }),
    );
    const before = saveSculptProject(layers.project),
      count = layers.undoCount;
    const stage = await call("propose_changes", {
      expectedRevision: api.revision,
      title: "Four editable shapes",
      description: "Create a cone, capsule, torus and pyramid.",
      steps,
    });
    assert(stage.ok, JSON.stringify(stage));
    assert.deepEqual(saveSculptProject(layers.project), before);
    assert.equal(layers.undoCount, count);
    assert.equal(
      (await call("apply_approved_proposal", { proposalId: stage.value.id })).error.code,
      "permission_denied",
    );
    assert(proposals.approve(layers, api.revision));
    editing = false;
    assert.equal(
      (await call("apply_approved_proposal", { proposalId: stage.value.id })).error.code,
      "permission_denied",
    );
    editing = true;
    const applied = await call("apply_approved_proposal", { proposalId: stage.value.id });
    assert(applied.ok, JSON.stringify(applied));
    assert.equal(layers.undoCount, count + 1);
    const ids = layers.project.layerStack.layers.filter((p) => p.primitive).map((p) => p.id);
    assert.equal(new Set(ids).size, 4);
    for (let i = 0; i < ids.length; i++) {
      const original = api.objectMetadata(ids[i]).primitive;
      const factors = i === 2 ? [1.2, 1.2, 1.2] : i === 3 ? [0.5, 0.75, 1.2] : [0.5, 0.75, 0.5];
      const scaled = await call("scale_primitive", {
        expectedRevision: api.revision,
        id: ids[i],
        factors,
      });
      assert(scaled.ok, JSON.stringify(scaled));
      assert.equal(layers.undoCount, count + 2);
      layers.undo();
      assert.deepEqual(api.objectMetadata(ids[i]).primitive, original);
    }
    const torusId = ids[2];
    const scaled = await call("scale_primitive", {
      expectedRevision: api.revision,
      id: torusId,
      factors: [2, 1, 2],
    });
    assert.equal(scaled.error.code, "unsupported");
    const stale = await call("update_primitive", {
      expectedRevision: "stale",
      id: torusId,
      unit: "mm",
      source: physical(torus),
    });
    assert.equal(stale.error.code, "revision_conflict");
    layers.undo();
    assert.deepEqual(saveSculptProject(layers.project), before);
  } finally {
    layers.dispose();
  }
});

test("expanded sources compose Booleans and transformed arrays analytically without changing source fields", async () => {
  const { prepareComposite } = await import("../work/test-build/compositor.mjs");
  for (const s of shapes) {
    const { layers } = createHeadlessEditor();
    try {
      const body = await layers.regeneratePrimitive({
        kind: "box",
        width: 1.2,
        height: 1.2,
        depth: 1.2,
      });
      const cutter = await layers.regeneratePrimitive(s),
        field = cutter.volume.getDenseView().slice();
      const point = s.kind === "torus" ? [s.majorRadius, 0, 0] : [0, 0, 0];
      for (const operation of ["difference", "intersect", "union"]) {
        layers.setBooleanModifiers(body.id, [
          { id: "expanded-csg", sourceId: cutter.id, operation, enabled: true },
        ]);
        const sample = prepareComposite(layers.project.layerStack.compositionLayers);
        assert.equal(sample(...point) > 0, operation === "difference");
        assert.deepEqual(cutter.volume.getDenseView(), field);
      }
      layers.setBooleanModifiers(body.id, []);
      const pose = identityTransform();
      pose.rotation = [0.4, 0.2, 0.1];
      pose.position = [0.2, 0.1, 0.3];
      pose.scale = [1.3, 1.3, 1.3];
      layers.select(cutter.id);
      layers.setActiveTransform(pose);
      cutter.array = {
        id: "linear-expanded",
        kind: "linear",
        enabled: true,
        count: 2,
        centered: false,
        axis: [1, 0, 0],
        spacingModelUnits: 1,
      };
      const sampler = prepareLayerSampler(cutter),
        q = new Vector3(...point).applyMatrix4(transformMatrix(pose));
      near(sampler(q.x, q.y, q.z), primitiveDistance(s, ...point) * 1.3);
      near(sampler(q.x + 1, q.y, q.z), primitiveDistance(s, ...point) * 1.3);
      assert.deepEqual(cutter.volume.getDenseView(), field);
    } finally {
      layers.dispose();
    }
  }
});

test("all four definitions survive the actual recovery worker and ID-remapped Project Library copy", async () => {
  const { RecoveryBrowserWorker } = await import("../scripts/fixtures/node-recovery-worker.mjs");
  const { encodeRecovery } = await import("../work/test-build/recovery-client.mjs");
  const { renameNative } = await import("../work/test-build/library-codec.mjs");
  const { layers } = createHeadlessEditor();
  try {
    for (const s of shapes) await layers.regeneratePrimitive(s);
    const native = saveSculptProject(layers.project),
      ids = layers.project.layerStack.layers.map((l) => l.id);
    const copy = openSculptProject(renameNative(native, "Four shapes", true));
    assert(!copy.layerStack.layers.some((l) => ids.includes(l.id)));
    assert.deepEqual(
      copy.layerStack.layers.filter((l) => l.primitive).map((l) => l.primitive),
      shapes,
    );
    const previous = globalThis.Worker;
    globalThis.Worker = RecoveryBrowserWorker;
    let result;
    try {
      result = await encodeRecovery(
        layers,
        layers.project.settings,
        undefined,
        undefined,
        new AbortController().signal,
        () => true,
      );
    } finally {
      globalThis.Worker = previous;
    }
    const recovered = openSculptProject(result.data);
    assert.deepEqual(
      recovered.layerStack.layers.filter((l) => l.primitive).map((l) => l.primitive),
      shapes,
    );
  } finally {
    layers.dispose();
  }
});

test("capsule sphere limit, eight-to-one capsule and thin tube meshes have no pole/seam degeneracy", async () => {
  for (const s of [
    { ...capsule, height: capsule.diameter },
    { ...capsule, height: 1.6 },
    { ...torus, tubeDiameter: 0.006 },
  ]) {
    const g = primitiveGeometry(s),
      flat = g.index ? g.toNonIndexed() : g;
    const report = await validatePrintMesh(flat.getAttribute("position").array);
    assert.equal(report.boundaryEdges, 0);
    assert.equal(report.nonManifoldEdges, 0);
    assert.equal(report.degenerateTriangles, 0);
    assert.equal(report.invertedComponents, 0);
    if (flat !== g) flat.dispose();
    g.dispose();
  }
});

test("tyre shape retains dimensions, changes shoulders, matches SDF and exports a closed outward mesh", async () => {
  const round = { ...torus, tyre: 0 };
  for (const p of [
    [0, 0, 0],
    [0.3, 0.02, 0],
    [0.4, 0.1, 0],
  ])
    assert.equal(primitiveDistance(round, ...p), primitiveDistance(torus, ...p));
  for (const tyre of [25, 50, 100]) {
    const source = { ...torus, tyre };
    assert.deepEqual(primitiveDimensions(source), primitiveDimensions(torus));
    assert(primitiveDistance(source, 0.345, 0.045, 0) < primitiveDistance(torus, 0.345, 0.045, 0));
    const g = primitiveGeometry(source),
      flat = g.toNonIndexed(),
      p = flat.getAttribute("position"),
      n = flat.getAttribute("normal");
    for (let i = 0; i < p.count; i += 17) {
      const v = new Vector3().fromBufferAttribute(p, i),
        normal = new Vector3().fromBufferAttribute(n, i);
      near(primitiveDistance(source, ...v.toArray()), 0, 1e-6);
      assert(primitiveDistance(source, ...v.addScaledVector(normal, 0.001).toArray()) > 0);
    }
    const report = await validatePrintMesh(p.array);
    for (const key of [
      "boundaryEdges",
      "nonManifoldEdges",
      "inconsistentEdges",
      "degenerateTriangles",
      "invertedComponents",
    ])
      assert.equal(report[key], 0, JSON.stringify(report));
    assert.equal(report.components, 1);
    flat.dispose();
    g.dispose();
  }
  for (const tyre of [-1, 101, NaN, Infinity, "50"])
    assert.throws(() => validatePrimitive({ ...torus, tyre }));
});

test("tyre percent survives units, source scaling, native v21 and Undo; old tags refuse it", async () => {
  const { layers, api } = createHeadlessEditor();
  const tools = new PrimitiveTools(() => layers);
  try {
    const result = await api.execute(
      {
        type: "primitive.create",
        unit: "cm",
        source: { kind: "torus", majorRadius: 3, tubeDiameter: 1.2, tyre: 75 },
      },
      { expectedRevision: api.revision },
    );
    assert(result.ok, JSON.stringify(result));
    const id = result.value.id;
    assert.equal(layers.active.layer.primitive.tyre, 75);
    assert.equal(api.objectMetadata(id).primitive.tyre, 75);
    const bytes = saveSculptProject(layers.project);
    assert.equal(new DataView(bytes).getUint32(8, true), 21);
    assert.equal(openSculptProject(bytes).activeLayer.primitive.tyre, 75);
    const old = bytes.slice(0);
    new DataView(old).setUint32(8, 20, true);
    assert.throws(() => openSculptProject(old), /version 21/);
    layers.display.precision.unit = "in";
    const before = layers.undoCount;
    await tools.dimension("tyre", 100);
    assert.equal(layers.active.layer.primitive.tyre, 100);
    assert.equal(layers.undoCount, before + 1);
    layers.undo();
    assert.equal(layers.active.layer.primitive.tyre, 75);
    assert.equal(scaledPrimitive(layers.active.layer.primitive, [2, 2, 2], "XYZ").tyre, 75);
    validateCall({
      name: "create_primitive",
      args: {
        expectedRevision: api.revision,
        unit: "mm",
        source: { ...physical(torus), tyre: 100 },
      },
    });
  } finally {
    tools.dispose();
    layers.dispose();
  }
});

test("curved previews reduce triangle detail and cone numeric edits clamp zero", async () => {
  const { primitivePreviewGeometry } = await import("../work/test-build/parametric-primitive.mjs");
  for (const s of [
    ...shapes,
    { kind: "sphere", diameter: 0.5 },
    { kind: "cylinder", diameter: 0.5, height: 0.5 },
  ]) {
    if (s.kind === "pyramid") continue;
    const preview = primitivePreviewGeometry(s),
      full = primitiveGeometry(s);
    const count = (g) => g.index?.count ?? g.getAttribute("position").count;
    assert(count(preview) < count(full) / 3);
    preview.dispose();
    full.dispose();
  }
  const { layers } = createHeadlessEditor(),
    tools = new PrimitiveTools(() => layers);
  try {
    tools.select("cone");
    await tools.dimension("topDiameter", -5, false);
    assert.equal(tools.draft.topDiameter, 0);
    await tools.create();
    await tools.dimension("topDiameter", -1);
    assert.equal(tools.source.topDiameter, 0);
  } finally {
    tools.dispose();
    layers.dispose();
  }
});
