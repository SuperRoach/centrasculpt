import assert from "node:assert/strict";
import test from "node:test";
import { installFileReader } from "../scripts/fixtures/export-node.mjs";
import { createHeadlessEditor } from "../scripts/headless-enclosure.mjs";
import { partSources } from "../work/test-build/assembly.mjs";
import { exportPartSTL } from "../work/test-build/assembly-tools.mjs";
import { prepareComposite } from "../work/test-build/compositor.mjs";
import { EnclosureControls } from "../work/test-build/enclosure-controls.mjs";
import {
  DEFAULT_ENCLOSURE,
  enclosurePlan,
  validateEnclosure,
} from "../work/test-build/enclosure-recipe.mjs";
import { primitiveDistance } from "../work/test-build/parametric-primitive.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";

installFileReader();
const params = () => structuredClone(DEFAULT_ENCLOSURE);
const ok = (r) => {
  assert(r.ok, JSON.stringify(r));
  return r.value;
};
const create = (api, p = params(), extra = {}) =>
  api.enclosure.create(p, { expectedRevision: api.revision, ...extra });
const bytes = (l) => Buffer.from(saveSculptProject(l.project));
const near = (a, b, e = 1e-4) => assert(Math.abs(a - b) < e, `${a} != ${b}`);
const sample = (l, id) => {
  const s = prepareComposite(partSources(l.project.layerStack, id)),
    mm = l.display.precision.millimetresPerUnit;
  return (x, y, z) => s(x / mm, y / mm, z / mm) * mm;
};

test("enclosure validates dimensions, radius, rim clearance, lip opening/depth and strict malformed inputs", () => {
  for (const key of [
    "innerWidthMm",
    "innerDepthMm",
    "innerHeightMm",
    "wallThicknessMm",
    "floorThicknessMm",
    "cornerRadiusMm",
  ])
    for (const v of [NaN, Infinity, -1, "3", null, undefined])
      assert.throws(() => validateEnclosure({ ...params(), [key]: v }));
  for (const patch of [
    { lid: { ...params().lid, type: "screw-on" } },
    { cornerRadiusMm: 2 },
    { cornerRadiusMm: 30 },
    { lid: { ...params().lid, clearanceMm: 2 } },
    { lid: { ...params().lid, lipDepthMm: 14 } },
    { innerWidthMm: 6 },
    { extra: true },
  ])
    assert.throws(() => validateEnclosure({ ...params(), ...patch }));
  const cyclic = params();
  cyclic.lid = cyclic;
  assert.throws(() => validateEnclosure(cyclic));
  assert.equal(validateEnclosure({ ...params(), cornerRadiusMm: 0 }).cornerRadiusMm, 0);
  assert.deepEqual(enclosurePlan(params()).outerDimensionsMm, [30, 17, 26]);
  assert.equal(enclosurePlan(params()).usableHeightUnderLipMm, 10);
});

test("rounded prism SDF has negative interior, planar caps and true rounded vertical corners", () => {
  const s = { kind: "box", width: 30, height: 17, depth: 26, cornerRadius: 4 };
  assert(primitiveDistance(s, 0, 0, 0) < 0);
  assert(primitiveDistance(s, 14, 0, 12) > 0);
  near(primitiveDistance(s, 15, 0, 0), 0);
  near(primitiveDistance(s, 0, 8.5, 0), 0);
  assert(primitiveDistance(s, 0, 9, 0) > 0);
});

test("recipe dry-run/commit use five independent sources, ordered live CSG, marked parts, one Undo/Redo and saved intent", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const before = bytes(l),
      revision = api.revision;
    const preview = ok(await create(api, params(), { dryRun: true }));
    assert(preview.dryRun);
    assert.equal(api.revision, revision);
    assert.deepEqual(bytes(l), before);
    const result = ok(await create(api)),
      { base, lid } = result.partIds;
    assert.notEqual(base, lid);
    assert.equal(l.project.layerStack.layers.length, 6);
    const inspected = api.enclosure.inspect(base, lid);
    assert.equal(Object.keys(inspected.ids).length, 5);
    assert.equal(l.project.layerStack.get(lid).booleanModifiers[0].operation, "union");
    const b = sample(l, base),
      d = sample(l, lid);
    assert(b(0, 0, 0) > 0, "open cavity");
    assert(b(0, 20, 0) > 0, "open top");
    assert(b(0, -7, 0) < 0, "floor");
    assert(b(13.5, 0, 0) < 0, "wall");
    assert(d(0, 10, 0) < 0, "lid plate");
    assert(d(10, 6, 0) < 0, "lip ring");
    assert(d(0, 6, 0) > 0, "lip is hollow");
    assert(d(12, 6, 0) > 0, "clearance gap outside lip");
    const reopened = openSculptProject(saveSculptProject(l.project));
    assert.equal(reopened.layerStack.get(base).assemblyPart.enclosure.role, "base");
    assert.equal(new DataView(saveSculptProject(l.project)).getUint32(8, true), 16);
    l.undo();
    assert.deepEqual(bytes(l), before);
    l.undo(true);
    assert.equal(
      l.project.layerStack.get(base).assemblyPart.enclosure.parameters.lid.clearanceMm,
      0.3,
    );
  } finally {
    l.dispose();
  }
});

test("clearance updates rebuild dependent lip geometry, stable part IDs, source-only edits and transformed independent roots", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const {
        partIds: { base, lid },
      } = ok(await create(api)),
      old = api.enclosure.inspect(base, lid),
      before = bytes(l);
    const p = params();
    p.innerWidthMm = 28;
    p.innerHeightMm = 16;
    p.wallThicknessMm = 3.5;
    p.floorThicknessMm = 4;
    p.cornerRadiusMm = 5;
    p.lid.clearanceMm = 0.6;
    const out = ok(await api.enclosure.update(base, lid, p, { expectedRevision: api.revision }));
    assert.deepEqual(out.partIds, { base, lid });
    const next = api.enclosure.inspect(base, lid);
    assert.deepEqual(next.ids, old.ids);
    near(
      l.project.layerStack.get(next.ids.lip).primitive.width *
        l.display.precision.millimetresPerUnit,
      26.8,
    );
    const cavity = l.project.layerStack.get(next.ids.cavity);
    near(cavity.transform.position[1] * l.display.precision.millimetresPerUnit, 4);
    assert.equal(l.project.layerStack.get(base).primitive.kind, "box");
    l.undo();
    assert.deepEqual(bytes(l), before);
    l.undo(true);
    const pose = structuredClone(l.project.layerStack.get(lid).transform);
    pose.position[0] += 0.5;
    ok(
      await api.execute(
        {
          type: "object.transform",
          id: lid,
          unit: "mm",
          transform: {
            ...pose,
            position: pose.position.map((v) => v * l.display.precision.millimetresPerUnit),
          },
        },
        { expectedRevision: api.revision },
      ),
    );
    const moved = l.project.layerStack.get(lid).transform.position[0];
    ok(
      await api.enclosure.update(
        base,
        lid,
        { ...p, lid: { ...p.lid, clearanceMm: 0.8 } },
        { expectedRevision: api.revision },
      ),
    );
    near(l.project.layerStack.get(lid).transform.position[0], moved);
    near(l.project.layerStack.get(next.ids.lip).transform.position[0], moved);
  } finally {
    l.dispose();
  }
});

test("failed/cancelled/stale recipe batches preserve bytes and redo, capacity/feature limits refuse atomically", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const before = bytes(l);
    const abort = new AbortController();
    abort.abort();
    assert.equal((await create(api, params(), { signal: abort.signal })).error.code, "cancelled");
    assert.deepEqual(bytes(l), before);
    assert.equal(
      (await create(api, params(), { expectedRevision: "stale" })).error.code,
      "revision_conflict",
    );
    const p = params();
    p.innerWidthMm = 900;
    assert(!(await create(api, p)).ok);
    assert.deepEqual(bytes(l), before);
    const good = ok(await create(api));
    const after = bytes(l);
    assert(!(await create(api)).ok);
    assert.deepEqual(bytes(l), after);
    l.undo();
    assert.deepEqual(bytes(l), before);
    l.undo(true);
    assert(l.project.layerStack.get(good.partIds.base));
  } finally {
    l.dispose();
  }
});

test("shared desktop/VR stage-confirm workflow guards revisions, cancellation and replacement", async () => {
  const { layers: l, api } = createHeadlessEditor();
  const controls = new EnclosureControls(() => l);
  try {
    assert(controls.activate("enclosure:open"));
    assert(controls.open);
    assert(controls.content().buttons.some((b) => b.id === "enclosure:field:clearanceMm"));
    await controls.stage();
    assert(controls.ready);
    assert.equal(l.project.layerStack.layers.length, 1);
    assert.equal(controls.preview.children.length, 5);
    controls.set("clearanceMm", 0.5);
    assert(!controls.ready);
    assert.equal(controls.preview.children.length, 0);
    await controls.stage();
    ok(
      await api.execute(
        { type: "object.rename", id: l.project.activeLayerId, name: "Changed" },
        { expectedRevision: api.revision },
      ),
    );
    assert(!controls.ready);
    await controls.stage();
    controls.cancel();
    assert(!controls.ready);
    assert.equal(l.project.layerStack.layers.length, 1);
  } finally {
    controls.dispose();
    l.dispose();
  }
});

test("actual part binary STL uses common assembly mm conversion, closed consistently wound shells and independent geometry", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const {
      partIds: { base, lid },
    } = ok(await create(api));
    for (const [id, expected] of [
      [base, [30, 17, 26]],
      [lid, [30, 7, 26]],
    ]) {
      const result = await exportPartSTL(l, id, undefined, "high");
      console.log("enclosure print", JSON.stringify({ id, report: result.report }));
      const view = new DataView(result.data);
      const lo = [Infinity, Infinity, Infinity],
        hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < view.getUint32(80, true); i++)
        for (let v = 0; v < 3; v++)
          for (let a = 0; a < 3; a++) {
            const n = view.getFloat32(84 + i * 50 + 12 + v * 12 + a * 4, true);
            lo[a] = Math.min(lo[a], n);
            hi[a] = Math.max(hi[a], n);
          }
      expected.forEach((n, i) => {
        near(hi[i] - lo[i], n, 0.00001);
      });
      assert.equal(result.report.blocking.length, 0);
      assert.equal(result.report.boundaryEdges, 0);
    }
  } finally {
    l.dispose();
  }
});

test("sampled actual SDF sections explain wall, floor, ring and plate thickness and clearance changes", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const {
      partIds: { base, lid },
    } = ok(await create(api));
    const sections = api.enclosure.samples(base, lid);
    near(sections.sampledMinimumThicknessMm, 3, 0.03);
    assert.equal(sections.physicalFit, "unknown");
    const findOuter = (s) => {
      let lo = 9,
        hi = 13;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (s(mid, 6, 0) < 0) lo = mid;
        else hi = mid;
      }
      return (lo + hi) / 2;
    };
    near(12 - findOuter(sample(l, lid)), 0.3, 1e-7);
    const p = params();
    p.lid.clearanceMm = 0.6;
    ok(await api.enclosure.update(base, lid, p, { expectedRevision: api.revision }));
    near(12 - findOuter(sample(l, lid)), 0.6, 1e-7);
    near(api.enclosure.samples(base, lid).sections.lip.thicknessMm, 3, 0.03);
  } finally {
    l.dispose();
  }
});

test("native v16, real worker recovery, Save As and Project Library duplication retain editable recipe and remapped independent parts", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const {
      partIds: { base, lid },
    } = ok(await create(api));
    const { renameNative } = await import("../work/test-build/library-codec.mjs");
    const { IndependentLayers } = await import("../work/test-build/independent-layers.mjs");
    const { ModellingAPI } = await import("../work/test-build/modelling-api.mjs");
    const native = saveSculptProject(l.project),
      copy = openSculptProject(renameNative(native, "Duplicate enclosure", true));
    assert(!copy.layerStack.layers.some((n) => n.id === base || n.id === lid));
    const editor = new IndependentLayers(copy);
    try {
      const api2 = new ModellingAPI(editor),
        a = copy.layerStack.layers.find((n) => n.assemblyPart?.enclosure?.role === "base").id,
        b = copy.layerStack.layers.find((n) => n.assemblyPart?.enclosure?.role === "lid").id;
      assert.equal(api2.enclosure.inspect(a, b).parameters.innerWidthMm, 24);
      ok(
        await api2.enclosure.update(
          a,
          b,
          { ...params(), innerDepthMm: 22 },
          { expectedRevision: api2.revision },
        ),
      );
      assert.equal(
        l.project.layerStack.get(base).assemblyPart.enclosure.parameters.innerDepthMm,
        20,
      );
    } finally {
      editor.dispose();
    }
    const { RecoveryBrowserWorker } = await import("../scripts/fixtures/node-recovery-worker.mjs");
    const { encodeRecovery } = await import("../work/test-build/recovery-client.mjs");
    const prev = globalThis.Worker;
    globalThis.Worker = RecoveryBrowserWorker;
    try {
      const recovered = await encodeRecovery(
        l,
        l.project.settings,
        undefined,
        undefined,
        new AbortController().signal,
        () => true,
      );
      const restored = openSculptProject(recovered.data);
      assert.equal(
        restored.layerStack.get(base).assemblyPart.enclosure.parameters.lid.clearanceMm,
        0.3,
      );
      assert.equal(restored.layerStack.get(lid).booleanModifiers.length, 1);
    } finally {
      globalThis.Worker = prev;
    }
    const old = native.slice(0);
    new DataView(old).setUint32(8, 15, true);
    assert.throws(() => openSculptProject(old), /version 16/);
    const legacy = createHeadlessEditor();
    try {
      const data = saveSculptProject(legacy.layers.project);
      assert(new DataView(data).getUint32(8, true) < 16);
      assert(openSculptProject(data));
    } finally {
      legacy.layers.dispose();
    }
  } finally {
    l.dispose();
  }
});

test("mid-batch cancellation and update failure restore native bytes and retained redo", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const before = bytes(l),
      original = l.regeneratePrimitive.bind(l),
      abort = new AbortController();
    let calls = 0;
    l.regeneratePrimitive = async (...args) => {
      const result = await original(...args);
      if (++calls === 2) abort.abort();
      return result;
    };
    const result = await create(api, params(), { signal: abort.signal });
    assert(!result.ok);
    assert.equal(result.error.code, "cancelled");
    assert.deepEqual(bytes(l), before);
    l.regeneratePrimitive = original;
    const {
        partIds: { base, lid },
      } = ok(await create(api)),
      after = bytes(l);
    calls = 0;
    l.regeneratePrimitive = async (...args) => {
      if (++calls === 3) throw new Error("Injected source failure");
      return original(...args);
    };
    assert(
      !(
        await api.enclosure.update(
          base,
          lid,
          { ...params(), innerHeightMm: 16 },
          { expectedRevision: api.revision },
        )
      ).ok,
    );
    assert.deepEqual(bytes(l), after);
    l.regeneratePrimitive = original;
    l.undo();
    assert.deepEqual(bytes(l), before);
    l.undo(true);
    assert.deepEqual(bytes(l), after);
  } finally {
    l.dispose();
  }
});

test("manual source edits remain live; recipe inspection refuses baked, rewired or locked updates without partial writes", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const {
        partIds: { base, lid },
      } = ok(await create(api)),
      { ids } = api.enclosure.inspect(base, lid);
    ok(
      await api.execute(
        {
          type: "primitive.update",
          id: ids.cavity,
          unit: "mm",
          source: { kind: "box", width: 22, height: 18, depth: 20, cornerRadius: 1 },
        },
        { expectedRevision: api.revision },
      ),
    );
    assert(sample(l, base)(11.5, 0, 0) < 0);
    assert.equal(l.project.layerStack.get(base).primitive.kind, "box");
    ok(
      await api.execute(
        { type: "object.flag", id: lid, flag: "locked", value: true },
        { expectedRevision: api.revision },
      ),
    );
    const locked = bytes(l);
    assert(
      !(await api.enclosure.update(base, lid, params(), { expectedRevision: api.revision })).ok,
    );
    assert.deepEqual(bytes(l), locked);
    ok(
      await api.execute(
        { type: "object.flag", id: lid, flag: "locked", value: false },
        { expectedRevision: api.revision },
      ),
    );
    ok(
      await api.execute(
        { type: "boolean.update", id: base, modifiers: [] },
        { expectedRevision: api.revision },
      ),
    );
    assert.throws(() => api.enclosure.inspect(base, lid), /structure/);
  } finally {
    l.dispose();
  }
});

test("Quest recipe page and keypad stay bounded, distinct and routed through shared controls", async () => {
  const { layers: l } = createHeadlessEditor();
  try {
    const { PrimitiveTools } = await import("../work/test-build/primitive-tools.mjs");
    const tools = new PrimitiveTools(() => l);
    try {
      assert(tools.content().buttons.some((b) => b.id === "primitive:enclosure-open"));
      tools.activate("primitive:enclosure-open");
      for (const page of [
        tools.content(),
        (() => {
          tools.activate("enclosure:field:clearanceMm");
          return tools.content();
        })(),
      ]) {
        assert.equal(page.title, "ENCLOSURE");
        for (const b of page.buttons) {
          assert(
            b.rect.x >= 0 &&
              b.rect.y >= 0 &&
              b.rect.x + b.rect.width <= 1152 &&
              b.rect.y + b.rect.height <= 1108,
          );
        }
        for (let i = 0; i < page.buttons.length; i++)
          for (let j = i + 1; j < page.buttons.length; j++) {
            const a = page.buttons[i].rect,
              b = page.buttons[j].rect;
            assert(
              a.x + a.width <= b.x ||
                b.x + b.width <= a.x ||
                a.y + a.height <= b.y ||
                b.y + b.height <= a.y,
            );
          }
      }
      tools.activate("enclosure:key:0");
      tools.activate("enclosure:key:.");
      tools.activate("enclosure:key:6");
      tools.activate("enclosure:apply");
      near(tools.enclosure.parameters.lid.clearanceMm, 0.6);
      tools.activate("enclosure:home");
      assert.equal(tools.enclosure.open, false);
    } finally {
      tools.dispose();
    }
  } finally {
    l.dispose();
  }
});

test("outer-dimension derivation, structured queries and individual-root duplication protection retain recipe identity", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const p = api.enclosure.withOuterDimensions(params(), {
      widthMm: 34,
      depthMm: 30,
      heightMm: 21,
    });
    assert.deepEqual([p.innerWidthMm, p.innerDepthMm, p.innerHeightMm], [28, 24, 18]);
    assert.throws(() =>
      api.enclosure.withOuterDimensions(params(), { widthMm: 2, depthMm: 20, heightMm: 20 }),
    );
    const {
      partIds: { base, lid },
    } = ok(await create(api, p));
    const inspect = ok(api.query({ type: "enclosure.inspect", baseId: base, lidId: lid }));
    assert.equal(inspect.ids.base, base);
    assert.deepEqual(inspect.outerDimensionsMm, [34, 21, 30]);
    assert.equal(
      ok(api.query({ type: "enclosure.samples", baseId: base, lidId: lid })).physicalFit,
      "unknown",
    );
    const before = bytes(l);
    const duplicate = await api.execute(
      { type: "object.duplicate", id: base },
      { expectedRevision: api.revision },
    );
    assert(!duplicate.ok);
    assert.match(duplicate.error.message, /Project Library/);
    assert.deepEqual(bytes(l), before);
    assert(!api.query({ type: "enclosure.inspect", baseId: lid, lidId: base }).ok);
  } finally {
    l.dispose();
  }
});

test("tall square-corner recipe exports unequal longest dimensions using one explicit calibration; presentation meshes excluded", async () => {
  const { layers: l, api } = createHeadlessEditor();
  let guide;
  try {
    l.display.precision.millimetresPerUnit = 200;
    const p = params();
    p.innerHeightMm = 30;
    p.cornerRadiusMm = 0;
    p.lid.clearanceMm = 0.6;
    const {
      partIds: { base, lid },
    } = ok(await create(api, p));
    const { BoxGeometry, Mesh, MeshBasicMaterial } = await import("three");
    guide = new Mesh(new BoxGeometry(200, 200, 200), new MeshBasicMaterial());
    guide.name = "Reference / guide overlay";
    l.group.add(guide);
    for (const [id, expected] of [
      [base, [30, 33, 26]],
      [lid, [30, 7, 26]],
    ]) {
      const result = await exportPartSTL(l, id, undefined, "fast");
      assert.equal(result.report.components, 1);
      assert.equal(result.report.boundaryEdges, 0);
      assert.equal(result.report.nonManifoldEdges, 0);
      assert.equal(result.report.inconsistentEdges, 0);
      assert.equal(result.report.degenerateTriangles, 0);
      expected.forEach((value, i) => {
        near(result.report.dimensions[i], value, 1e-5);
      });
      assert(result.report.effectiveResolutionMM <= 0.51);
      assert.equal(l.display.precision.millimetresPerUnit, 200);
    }
  } finally {
    if (guide) {
      guide.geometry.dispose();
      guide.material.dispose();
    }
    l.dispose();
  }
});

test("both Quest tool hands retain staged review during menu ownership and cancel on tracking or controller reassignment", async () => {
  for (const handedness of ["left", "right"]) {
    const { layers: l } = createHeadlessEditor();
    const { PrimitiveTools } = await import("../work/test-build/primitive-tools.mjs");
    const tools = new PrimitiveTools(() => l);
    try {
      tools.activate("primitive:enclosure-open");
      const tool = { connected: true, tracked: true, role: "tool", connectionId: 1, handedness };
      tools.step(tool, undefined, false);
      await tools.enclosure.stage();
      assert(tools.enclosure.ready);
      tools.step(tool, undefined, false);
      assert(tools.enclosure.ready, "Support menu ownership must not cancel the review");
      tool.tracked = false;
      tools.step(tool, undefined, false);
      assert(!tools.enclosure.ready);
      assert.equal(l.project.layerStack.layers.length, 1);
      tool.tracked = true;
      tools.step(tool, undefined, false);
      await tools.enclosure.stage();
      tool.connectionId = 2;
      tools.step(tool, undefined, false);
      assert(!tools.enclosure.ready);
      assert.equal(l.project.layerStack.layers.length, 1);
    } finally {
      tools.dispose();
      l.dispose();
    }
  }
});

test("opening a loaded enclosure edits its existing pair and depth changes have a visible staged outline", async () => {
  const { layers: l, api } = createHeadlessEditor();
  const controls = new EnclosureControls(() => l);
  try {
    const {
      partIds: { base },
    } = ok(await create(api));
    l.select(base);
    controls.openSelected();
    assert.equal(controls.mode, "Update");
    const before = bytes(l);
    controls.set("innerDepthMm", 24);
    await controls.stage();
    assert(controls.ready);
    assert.equal(controls.preview.children.length, 5);
    const outline = controls.preview.getObjectByName("base");
    outline.geometry.computeBoundingBox();
    near(outline.geometry.boundingBox.max.z - outline.geometry.boundingBox.min.z, 30, 1e-5);
    assert.deepEqual(bytes(l), before);
    assert.match(controls.feedback, /Apply changes/);
    assert(!/recipe|physical fit unknown/i.test(controls.feedback));
    controls.cancel();
    assert.deepEqual(bytes(l), before);
  } finally {
    controls.dispose();
    l.dispose();
  }
});

test("USB-style live Boolean cutters and added part members survive enclosure resizing and native reopen", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const {
      partIds: { base, lid },
    } = ok(await create(api));
    assert(sample(l, base)(13.5, 0, 0) < 0);
    const cutter = ok(
      await api.execute(
        {
          type: "primitive.create",
          unit: "mm",
          source: { kind: "box", width: 6, height: 4, depth: 6 },
        },
        { expectedRevision: api.revision },
      ),
    ).id;
    ok(
      await api.execute(
        {
          type: "object.transform",
          id: cutter,
          unit: "mm",
          transform: { position: [14, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        },
        { expectedRevision: api.revision },
      ),
    );
    ok(
      await api.execute(
        { type: "boolean.create", id: base, sourceId: cutter, operation: "difference" },
        { expectedRevision: api.revision },
      ),
    );
    ok(
      await api.execute(
        { type: "part.assign", objectId: cutter, partId: base },
        { expectedRevision: api.revision },
      ),
    );
    const before = bytes(l),
      pose = structuredClone(l.project.layerStack.get(cutter).localTransform),
      modifiers = structuredClone(l.project.layerStack.get(base).booleanModifiers);
    assert(sample(l, base)(13.5, 0, 0) > 0, "port opening is cut through the wall");
    const inspect = api.enclosure.inspect(base, lid);
    assert.deepEqual(inspect.additionalMemberIds, [cutter]);
    assert.equal(inspect.additionalOperations.base[0].sourceId, cutter);
    ok(
      await api.enclosure.update(
        base,
        lid,
        { ...params(), innerDepthMm: 24 },
        { expectedRevision: api.revision },
      ),
    );
    assert.deepEqual(l.project.layerStack.get(base).booleanModifiers, modifiers);
    assert.deepEqual(l.project.layerStack.get(cutter).localTransform, pose);
    assert(sample(l, base)(13.5, 0, 0) > 0);
    const restored = openSculptProject(saveSculptProject(l.project));
    assert.deepEqual(restored.layerStack.get(base).booleanModifiers, modifiers);
    l.undo();
    assert.deepEqual(bytes(l), before);
    l.undo(true);
    assert(sample(l, base)(13.5, 0, 0) > 0);
  } finally {
    l.dispose();
  }
});
