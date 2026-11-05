import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Euler, Quaternion, Vector3 } from "three";
import { installFileReader } from "../scripts/fixtures/export-node.mjs";
import { RecoveryBrowserWorker } from "../scripts/fixtures/node-recovery-worker.mjs";
import {
  inspectFit,
  partMembers,
  partOwner,
  partSources,
  validateAssembly,
} from "../work/test-build/assembly.mjs";
import { AssemblyControls } from "../work/test-build/assembly-controls.mjs";
import {
  exportPartSTL,
  generateConnector,
  inspectAssembly,
  mateParts,
} from "../work/test-build/assembly-tools.mjs";
import { prepareComposite } from "../work/test-build/compositor.mjs";
import { ExportWork } from "../work/test-build/export-mesh.mjs";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { renameNative } from "../work/test-build/library-codec.mjs";
import { ModellingAPI } from "../work/test-build/modelling-api.mjs";
import { PrimitiveTools } from "../work/test-build/primitive-tools.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { encodeRecovery } from "../work/test-build/recovery-client.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { identityTransform } from "../work/test-build/transform.mjs";

installFileReader();
const settings = {
  mode: "add",
  radius: 0.12,
  strength: 0.5,
  hardness: 0.5,
  camera: { position: [2, 2, 3], target: [0, 0, 0] },
};
const near = (a, b, e = 1e-4) => assert(Math.abs(a - b) < e, `${a} != ${b}`);
async function setup(distance = 0.3, resolution = 17) {
  const v = new SDFVolume(resolution, 1.6, false);
  v.values.fill(6.4);
  const l = new IndependentLayers(createBaseProject(v, structuredClone(settings)));
  const a = await l.regeneratePrimitive({ kind: "box", width: 0.2, height: 0.2, depth: 0.2 });
  const pose = identityTransform();
  pose.position = [distance, 0, 0];
  const b = await l.regeneratePrimitive(
    { kind: "box", width: 0.2, height: 0.2, depth: 0.2 },
    undefined,
    undefined,
    pose,
  );
  l.setAssemblyPart(a.id, { clearanceMM: 0.3 });
  l.setAssemblyPart(b.id, { clearanceMM: 0.3 });
  return { l, a, b };
}
const connector = (a, b) => ({
  pegPart: a.id,
  socketPart: b.id,
  pegDiameterMM: 4,
  pegLengthMM: 6,
  socketDiameterMM: 4.6,
  socketDepthMM: 6.5,
  radialClearanceMM: 0.3,
  positionMM: [10, 0, 0],
  rotationRadians: [0, 0, Math.PI / 2],
});

test("part membership follows hierarchy; assignment preserves world pose and independent fields", async () => {
  const { l, a, b } = await setup();
  try {
    const child = await l.regeneratePrimitive({ kind: "sphere", diameter: 0.05 });
    const values = child.volume.getDenseView().slice(),
      pose = structuredClone(child.transform);
    l.reparent(child.id, a.id);
    assert.equal(partOwner(l.project.layerStack, child.id), a.id);
    assert.deepEqual(child.transform, pose);
    assert.deepEqual([...child.volume.getDenseView()], [...values]);
    assert.deepEqual(new Set(partMembers(l.project.layerStack, a.id)), new Set([a.id, child.id]));
    l.select(a.id);
    const t = identityTransform();
    t.position = [0.1, 0.2, 0];
    l.setActiveTransform(t);
    near(child.transform.position[0], 0.1);
    near(b.transform.position[0], 0.3);
    l.undo();
    near(child.transform.position[0], 0);
    l.undo(true);
    near(child.transform.position[0], 0.1);
    l.setNodeFlag(a.id, "locked", true);
    assert(child.locked);
    assert(!b.locked);
    l.setNodeFlag(a.id, "locked", false);
    l.setNodeFlag(a.id, "visible", false);
    assert(!child.visible);
    assert(b.visible);
  } finally {
    l.dispose();
  }
});
test("nested parts, cyclic hierarchy and cross-part Boolean references reject atomically", async () => {
  const { l, a, b } = await setup();
  try {
    assert.throws(() => l.reparent(b.id, a.id), /nested/);
    assert.equal(l.project.layerStack.hierarchy.parent(b.id), null);
    assert.throws(
      () =>
        l.setBooleanModifiers(a.id, [
          { id: "bad", sourceId: b.id, operation: "union", enabled: true },
        ]),
      /boundaries/,
    );
    assert.equal(a.booleanModifiers, undefined);
    assert.throws(() => l.reparent(a.id, a.id));
    assert.throws(() => l.setAssemblyPart(a.id, { clearanceMM: NaN }));
    validateAssembly(l.project.layerStack);
  } finally {
    l.dispose();
  }
});
test("bounded fit reports physical gaps, overlaps and below-resolution clearances", async () => {
  const { l, a, b } = await setup();
  try {
    const gap = await inspectAssembly(l, a.id, b.id);
    near(gap.minimumSeparationMM, 10, 0.1);
    assert.equal(gap.sampledOverlap, false);
    assert.equal(gap.units, "mm");
    assert.equal(gap.approximate, true);
    assert.equal(gap.samples, 32768);
    assert(gap.belowResolution);
    assert.equal(gap.clearanceViolation, false);
    l.setAssemblyPart(a.id, { clearanceMM: 12 });
    const threshold = await inspectAssembly(l, a.id, b.id);
    assert(threshold.clearanceViolation);
    l.select(b.id);
    const pose = identityTransform();
    pose.position = [0.15, 0, 0];
    l.setActiveTransform(pose);
    const overlap = await inspectAssembly(l, a.id, b.id);
    assert(overlap.sampledOverlap);
    assert.equal(overlap.minimumSeparationMM, 0);
    assert(overlap.collisionRegionsMM.length > 0 && overlap.collisionRegionsMM.length <= 32);
    assert(overlap.warnings.some((s) => s.includes("not guaranteed")));
  } finally {
    l.dispose();
  }
});
test("fit cancellation, stale revisions and cache invalidation do not mutate geometry", async () => {
  const { l, a, b } = await setup();
  const c = new AbortController();
  try {
    const values = a.volume.getDenseView().slice();
    c.abort();
    await assert.rejects(inspectAssembly(l, a.id, b.id, c.signal), /cancelled/);
    const pending = inspectFit(
      l.project.layerStack,
      a.id,
      b.id,
      100,
      new ExportWork(undefined, () => false),
    );
    await assert.rejects(pending, /changed/);
    assert.deepEqual([...a.volume.getDenseView()], [...values]);
    const ui = new AssemblyControls(() => l);
    ui.partA = a.id;
    ui.partB = b.id;
    await ui.run("inspect");
    assert(ui.status.includes("gap"));
    l.renameNode(a.id, "Changed");
    assert(ui.status.includes("stale"));
    ui.dispose();
  } finally {
    l.dispose();
  }
});
test("centre, face and axis mates use mm offsets, parent transforms and one-action Undo", async () => {
  const { l, a, b } = await setup();
  try {
    const group = l.createGroup("Parent");
    l.reparent(a.id, group);
    mateParts(l, { moving: a.id, target: b.id, mode: "faces", axis: "x", offsetMM: 2 });
    near(a.transform.position[0], 0.52);
    l.undo();
    near(a.transform.position[0], 0);
    l.undo(true);
    near(a.transform.position[0], 0.52);
    mateParts(l, { moving: a.id, target: b.id, mode: "centres", axis: "y", offsetMM: 1 });
    near(a.transform.position[0], 0.3);
    near(a.transform.position[1], 0.01);
    const normal = [1, 0, 0];
    mateParts(l, {
      moving: a.id,
      target: b.id,
      mode: "axes",
      axis: "y",
      offsetMM: 0,
      matchNormal: true,
      movingNormal: [0, 1, 0],
      targetNormal: normal,
    });
    const n = new Vector3(0, 1, 0).applyQuaternion(
      new Quaternion().setFromEuler(new Euler(...a.transform.rotation)),
    );
    near(n.x, -1);
    near(n.y, 0);
    assert.deepEqual(a.primitive, { kind: "box", width: 0.2, height: 0.2, depth: 0.2 });
  } finally {
    l.dispose();
  }
});
test("editable peg/socket uses deliberate radial clearance, live CSG and atomic Undo/Redo", async () => {
  const { l, a, b } = await setup(0.2);
  try {
    const count = l.project.layerStack.layers.length;
    const pegId = await generateConnector(l, connector(a, b));
    const peg = l.project.layerStack.get(pegId);
    const socket = l.project.layerStack.layers.find((s) => s.name === "Assembly socket cutter");
    near(peg.primitive.diameter, 0.04);
    near(socket.primitive.diameter, 0.046);
    near(peg.primitive.height, 0.06);
    near(socket.primitive.height, 0.065);
    assert.equal(a.booleanModifiers[0].operation, "union");
    assert.equal(b.booleanModifiers[0].operation, "difference");
    assert(prepareComposite(partSources(l.project.layerStack, a.id))(0.115, 0, 0) < 0);
    assert(prepareComposite(partSources(l.project.layerStack, b.id))(0.115, 0, 0) > 0);
    assert.equal(partOwner(l.project.layerStack, socket.id), b.id);
    l.undo();
    assert.equal(l.project.layerStack.layers.length, count);
    assert.equal(a.booleanModifiers, undefined);
    l.undo(true);
    assert.equal(l.project.layerStack.layers.length, count + 2);
    assert.equal(a.booleanModifiers.length, 1);
    l.select(pegId);
    await l.regeneratePrimitive({ kind: "cylinder", diameter: 0.05, height: 0.06 }, pegId);
    assert.equal(a.booleanModifiers[0].sourceId, pegId);
  } finally {
    l.dispose();
  }
});
test("connector generation rejects impossible clearance and cancellation leaves no partial sources", async () => {
  const { l, a, b } = await setup();
  try {
    const count = l.project.layerStack.layers.length;
    await assert.rejects(
      generateConnector(l, { ...connector(a, b), socketDiameterMM: 4.1 }),
      /twice/,
    );
    const c = new AbortController();
    c.abort();
    await assert.rejects(generateConnector(l, connector(a, b), c.signal), /cancelled/);
    assert.equal(l.project.layerStack.layers.length, count);
    assert.equal(a.booleanModifiers, undefined);
    const original = l.regeneratePrimitive.bind(l);
    let calls = 0;
    l.regeneratePrimitive = async (...args) => {
      if (++calls === 2) throw new Error("injected second-source failure");
      return original(...args);
    };
    await assert.rejects(generateConnector(l, connector(a, b)), /second-source/);
    assert.equal(l.project.layerStack.layers.length, count);
    assert.equal(a.booleanModifiers, undefined);
  } finally {
    l.dispose();
  }
});
test("matching connector radial arrays evaluate independently and duplicate source remains editable", async () => {
  const { l, a, b } = await setup(0.2);
  try {
    const pegId = await generateConnector(l, connector(a, b));
    const socket = l.project.layerStack.layers.find((s) => s.name === "Assembly socket cutter");
    for (const id of [pegId, socket.id])
      l.setArrayDefinition(id, {
        id: `repeat-${id}`,
        kind: "radial",
        enabled: true,
        count: 4,
        totalAngleRadians: Math.PI * 2,
        pivot: [0.1, 0, 0],
        axis: [1, 0, 0],
        angularOffsetRadians: 0,
        orientation: "rotate",
      });
    assert(prepareComposite(partSources(l.project.layerStack, a.id))(0.115, 0, 0) < 0);
    assert(prepareComposite(partSources(l.project.layerStack, b.id))(0.115, 0, 0) > 0);
    l.select(pegId);
    l.duplicate(pegId);
    assert(l.active.layer.primitive);
    assert(l.active.layer.array);
  } finally {
    l.dispose();
  }
});
test("native v14, Save As duplication and worker recovery preserve parts and connector membership", async () => {
  const { l, a, b } = await setup(0.2);
  try {
    await generateConnector(l, connector(a, b));
    const native = saveSculptProject(l.project);
    assert.equal(new DataView(native).getUint32(8, true), 14);
    const reopened = openSculptProject(native);
    assert.equal(partMembers(reopened.layerStack, a.id).length, 2);
    const copied = openSculptProject(renameNative(native, "Portable assembly", true));
    assert.equal(copied.layerStack.layers.filter((s) => s.assemblyPart).length, 2);
    validateAssembly(copied.layerStack);
    assert(!copied.layerStack.layers.some((s) => s.id === a.id));
    const prev = globalThis.Worker;
    globalThis.Worker = RecoveryBrowserWorker;
    try {
      const recovered = await encodeRecovery(
        l,
        settings,
        undefined,
        undefined,
        new AbortController().signal,
        () => true,
      );
      const p = openSculptProject(recovered.data);
      assert.equal(partMembers(p.layerStack, a.id).length, 2);
    } finally {
      globalThis.Worker = prev;
    }
    const malformed = native.slice(0);
    new DataView(malformed).setUint32(8, 13, true);
    assert.throws(() => openSculptProject(malformed), /version 14/);
  } finally {
    l.dispose();
  }
});
test("legacy projects remain readable and part metadata Undo/Redo roundtrips", async () => {
  const { l, a } = await setup();
  try {
    l.setAssemblyPart(a.id, undefined);
    l.undo();
    assert(a.assemblyPart);
    l.undo(true);
    assert.equal(a.assemblyPart, undefined);
    for (const p of l.project.layerStack.layers) p.assemblyPart = undefined;
    const data = saveSculptProject(l.project);
    assert(new DataView(data).getUint32(8, true) < 14);
    assert(openSculptProject(data).layerStack.layers.every((s) => !s.assemblyPart));
  } finally {
    l.dispose();
  }
});
test("actual independent binary STL exports retain calibrated millimetres and print validation", async () => {
  const { l, a, b } = await setup();
  try {
    for (const part of [a, b]) {
      const result = await exportPartSTL(l, part.id);
      const view = new DataView(result.data);
      assert.equal(result.data.byteLength, 84 + view.getUint32(80, true) * 50);
      for (const d of result.report.dimensions) near(d, 20, 0.3);
      assert.equal(result.report.units, "mm");
      assert.equal(result.report.boundaryEdges, 0);
      assert.equal(result.report.nonManifoldEdges, 0);
      assert.equal(result.report.blocking.length, 0);
    }
    const c = new AbortController();
    c.abort();
    await assert.rejects(exportPartSTL(l, a.id, c.signal), /cancelled/);
    l.display.precision.millimetresPerUnit = 200;
    const double = await exportPartSTL(l, a.id);
    near(double.report.dimensions[0], 40, 0.6);
  } finally {
    l.dispose();
  }
});
test("connector STLs contain evaluated union / holes, not overlapping cutter shells", async () => {
  const { l, a, b } = await setup(0.2);
  try {
    await generateConnector(l, { ...connector(a, b), pegDiameterMM: 8, socketDiameterMM: 8.6 });
    for (const p of [a, b]) {
      const r = await exportPartSTL(l, p.id);
      assert.equal(r.report.components, 1, JSON.stringify(r.report));
      assert.equal(r.report.boundaryEdges, 0);
      assert.equal(r.report.blocking.length, 0);
    }
  } finally {
    l.dispose();
  }
});
test("typed command API guards revisions, parts, inspection and locked edits", async () => {
  const { l, a, b } = await setup();
  try {
    const api = new ModellingAPI(l);
    assert.equal(api.query({ type: "part.list" }).value.length, 2);
    const stale = await api.execute(
      { type: "part.clearance", partId: a.id, clearanceMM: 1 },
      { expectedRevision: "stale" },
    );
    assert.equal(stale.error.code, "revision_conflict");
    const missing = await api.execute(
      { type: "part.select", partId: "missing" },
      { expectedRevision: api.revision },
    );
    assert.equal(missing.error.code, "not_found");
    const fit = await api.execute(
      { type: "part.inspect", partA: a.id, partB: b.id },
      { expectedRevision: api.revision },
    );
    assert(fit.ok, JSON.stringify(fit));
    assert(fit.value.fit.approximate);
    const cmd = await api.execute(
      { type: "part.clearance", partId: a.id, clearanceMM: 0.5 },
      { expectedRevision: api.revision },
    );
    assert(cmd.ok);
    l.setNodeFlag(a.id, "locked", true);
    const locked = await api.execute(
      { type: "part.clearance", partId: a.id, clearanceMM: 1 },
      { expectedRevision: api.revision },
    );
    assert(!locked.ok);
    const denied = await new ModellingAPI(l, () => false).execute(
      { type: "part.select", partId: b.id },
      { expectedRevision: api.revision },
    );
    assert.equal(denied.error.code, "permission_denied");
  } finally {
    l.dispose();
  }
});
test("VR Assembly controls are hand-independent, bounded and preserve main-wheel Cut", async () => {
  const { l, a, b } = await setup();
  try {
    for (const handedness of ["left", "right"]) {
      const tools = new PrimitiveTools(() => l);
      assert(tools.activate("primitive:assembly-open"));
      const ui = tools.assembly;
      ui.partA = a.id;
      ui.partB = b.id;
      assert.equal(tools.content().title, "ASSEMBLY / FIT", handedness);
      for (const action of [null, "assembly:more", "assembly:connectors"]) {
        if (action) tools.activate(action);
        for (const button of tools.content().buttons)
          assert(button.rect.y + button.rect.height <= 1152, button.id);
      }
      assert(tools.activate("assembly:field:pegDiameterMM"));
      tools.activate("assembly:key:5");
      tools.activate("assembly:key:apply");
      near(ui.connector.pegDiameterMM, 5);
      tools.dispose();
    }
    const desktop = readFileSync("src/assembly-ui.ts", "utf8");
    assert(desktop.includes("Check fit"));
    assert(desktop.includes("Export visible parts separately"));
    assert(readFileSync("src/xr-menu-model.ts", "utf8").includes("cut"));
  } finally {
    l.dispose();
  }
});

test("malformed persisted membership and cyclic hierarchy are rejected before installation", async () => {
  const { l, a, b } = await setup();
  try {
    // Ensure hierarchy metadata exists, then mutate the detached serialized document.
    const g = l.createGroup("Container");
    l.reparent(a.id, g);
    const data = saveSculptProject(l.project),
      view = new DataView(data),
      size = view.getUint32(12, true);
    const metadata = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 16, size)));
    function damaged(change) {
      const m = structuredClone(metadata);
      change(m);
      const json = new TextEncoder().encode(JSON.stringify(m)),
        out = new Uint8Array(16 + json.length + data.byteLength - 16 - size);
      out.set(new Uint8Array(data, 0, 16));
      new DataView(out.buffer).setUint32(12, json.length, true);
      out.set(json, 16);
      out.set(new Uint8Array(data, 16 + size), 16 + json.length);
      return out.buffer;
    }
    assert.throws(
      () =>
        openSculptProject(
          damaged((m) => {
            m.hierarchy.layers.find((s) => s.id === b.id).parentId = a.id;
          }),
        ),
      /nested/,
    );
    assert.throws(
      () =>
        openSculptProject(
          damaged((m) => {
            m.hierarchy.groups[0].parentId = a.id;
          }),
        ),
      /cycle|cyclic/i,
    );
    assert.throws(
      () =>
        openSculptProject(
          damaged((m) => {
            m.layers.find((s) => s.id === a.id).assemblyPart = { clearanceMM: -1 };
          }),
        ),
      /clearance/,
    );
  } finally {
    l.dispose();
  }
});
test("in-flight part export aborts or rejects stale source edits and leaves source fields intact", async () => {
  const { l, a } = await setup();
  try {
    const original = a.volume.getDenseView().slice(),
      abort = new AbortController();
    const pending = exportPartSTL(l, a.id, abort.signal);
    setTimeout(() => abort.abort(), 0);
    await assert.rejects(pending, /cancelled/i);
    const stale = exportPartSTL(l, a.id);
    l.renameNode(a.id, "New name");
    await assert.rejects(stale, /changed/);
    assert.deepEqual([...a.volume.getDenseView()], [...original]);
    const okay = await exportPartSTL(l, a.id);
    assert.equal(okay.report.blocking.length, 0);
  } finally {
    l.dispose();
  }
});
test("discarding undone connector history releases derived resources and preserves independent parts", async () => {
  const { l, a, b } = await setup(0.2);
  try {
    await generateConnector(l, connector(a, b));
    l.undo();
    l.setAssemblyPart(a.id, { clearanceMM: 0.4 });
    assert.equal(l.project.layerStack.layers.length, 3);
    assert.equal(l.undo(true), null);
    assert.equal(partMembers(l.project.layerStack, a.id).length, 1);
    const sample = prepareComposite(partSources(l.project.layerStack, b.id));
    assert(sample(0.2, 0, 0) < 0);
  } finally {
    l.dispose();
  }
});
test("agent commands create, assign, mate, generate connectors and select a part for export", async () => {
  const { l, a, b } = await setup(0.2);
  try {
    const api = new ModellingAPI(l),
      run = (command) => api.execute(command, { expectedRevision: api.revision });
    let r = await run({
      type: "part.mate",
      options: { moving: a.id, target: b.id, mode: "faces", axis: "x", offsetMM: 0 },
    });
    assert(r.ok);
    l.undo();
    const child = await l.regeneratePrimitive({ kind: "sphere", diameter: 0.03 });
    r = await run({ type: "part.assign", objectId: child.id, partId: a.id });
    assert(r.ok);
    assert.equal(partOwner(l.project.layerStack, child.id), a.id);
    r = await run({ type: "connector.create", options: connector(a, b) });
    assert(r.ok, JSON.stringify(r));
    r = await run({ type: "part.select", partId: b.id });
    assert(r.ok);
    assert.equal(l.project.activeLayerId, b.id);
    r = await run({ type: "part.clearance", partId: b.id, clearanceMM: NaN });
    assert.equal(r.error.code, "invalid_input");
  } finally {
    l.dispose();
  }
});

test("evaluated assembly preview keeps separate results, hides cutters and cleans up on edits", async () => {
  const { l, a, b } = await setup();
  try {
    const { previewAssembly } = await import("../work/test-build/assembly-tools.mjs");
    const { TransformPreview } = await import("../work/test-build/transform-preview.mjs");
    const original = l.trackedBytes;
    await previewAssembly(l);
    assert(l.syncAssemblyPreview());
    new TransformPreview().sync(l);
    assert(l.group.visible);
    assert(!l.composite.group.visible);
    assert(!l.runtime(a.id).surface.group.visible);
    assert(!l.runtime(b.id).surface.group.visible);
    assert(l.trackedBytes > original);
    l.renameNode(a.id, "Edited after preview");
    assert(!l.syncAssemblyPreview());
    assert(l.runtime(a.id).surface.group.visible);
    assert(
      l.trackedBytes < original + 4096,
      "Preview cache is released; only rename history remains.",
    );
  } finally {
    l.dispose();
  }
});
test("part STL retains explicit high-quality optimisation and calibrated dimensions", async () => {
  const { l, a } = await setup();
  try {
    const result = await exportPartSTL(l, a.id, undefined, "high");
    near(result.report.dimensions[0], 20, 0.2);
    assert.equal(result.report.blocking.length, 0);
    assert(result.stats[0].planarRemoved > 0);
  } finally {
    l.dispose();
  }
});

test("connector history remains atomic when existing metadata has reached its retention cap", async () => {
  const { l, a, b } = await setup(0.2);
  try {
    for (let i = 0; i < 110; i++) l.setAssemblyPart(a.id, { clearanceMM: i / 100 });
    const count = l.project.layerStack.layers.length;
    await generateConnector(l, connector(a, b));
    l.undo();
    assert.equal(l.project.layerStack.layers.length, count);
    assert.equal(a.booleanModifiers, undefined);
    l.undo(true);
    assert.equal(l.project.layerStack.layers.length, count + 2);
    assert.equal(a.booleanModifiers.length, 1);
  } finally {
    l.dispose();
  }
});

async function finishCheck(ui) {
  const deadline = performance.now() + 2000;
  while (ui.checking && performance.now() < deadline) await new Promise((r) => setTimeout(r, 5));
  assert(!ui.checking, "fit finishes within the bounded host deadline");
}
test("Check fit accepts two ordinary layer taps without defining parts or changing history", async () => {
  const { l, a, b } = await setup();
  const ui = new AssemblyControls(() => l);
  try {
    l.setAssemblyPart(a.id, undefined);
    l.setAssemblyPart(b.id, undefined);
    const before = l.recoveryKey(),
      undos = l.undoCount;
    ui.beginPick();
    assert.equal(ui.picking, "first");
    ui.pickLayer(a.id);
    assert.equal(ui.picking, "second");
    ui.pickLayer(b.id);
    await finishCheck(ui);
    assert(ui.fitResult, ui.status);
    near(ui.fitResult.minimumSeparationMM, 10, 0.1);
    assert.equal(l.recoveryKey(), before);
    assert.equal(l.undoCount, undos);
    assert(!a.assemblyPart && !b.assemblyPart);
    assert(ui.status.includes("Approx gap"));
  } finally {
    ui.dispose();
    l.dispose();
  }
});
test("interactive fit rejects misses, repeated taps, hidden layers and parent-child pairs", async () => {
  const { l, a, b } = await setup();
  const ui = new AssemblyControls(() => l);
  try {
    const { Raycaster, Vector3 } = await import("three");
    ui.beginPick();
    ui.pickRay(new Raycaster(new Vector3(10, 10, 1), new Vector3(0, 0, -1)));
    assert.equal(ui.picking, "first");
    ui.pickLayer(a.id);
    ui.pickLayer(a.id);
    assert.equal(ui.picking, "second");
    assert(ui.status.includes("different"));
    l.setNodeFlag(b.id, "visible", false);
    ui.pickLayer(b.id);
    assert.equal(ui.picking, "second");
    l.setNodeFlag(b.id, "visible", true);
    ui.cancelPick();
    l.setAssemblyPart(a.id, undefined);
    l.setAssemblyPart(b.id, undefined);
    l.reparent(b.id, a.id);
    ui.beginPick();
    ui.pickLayer(a.id);
    ui.pickLayer(b.id);
    assert.equal(ui.picking, "second");
    assert(ui.status.includes("independent"));
  } finally {
    ui.dispose();
    l.dispose();
  }
});
test("scene-ray selection reads locked layers and uses a part root when its connector is tapped", async () => {
  const { l, a, b } = await setup(0.2);
  const ui = new AssemblyControls(() => l);
  try {
    const { Raycaster, Vector3 } = await import("three");
    const peg = await generateConnector(l, connector(a, b));
    ui.beginPick("pair");
    ui.pickLayer(peg);
    assert.equal(ui.partA, a.id);
    ui.cancelPick();
    l.setNodeFlag(a.id, "locked", true);
    ui.beginPick();
    ui.pickRay(new Raycaster(new Vector3(0, 0, 1), new Vector3(0, 0, -1)));
    assert.equal(ui.partA, a.id);
    ui.pickLayer(b.id);
    await finishCheck(ui);
    assert(ui.fitResult, ui.status);
  } finally {
    ui.dispose();
    l.dispose();
  }
});
test("cancel, changed geometry and project replacement cannot publish stale interactive results", async () => {
  const { l, a, b } = await setup();
  let active = l;
  const ui = new AssemblyControls(() => active);
  let other;
  try {
    ui.beginPick();
    ui.pickLayer(a.id);
    await ui.run("cancel");
    assert.equal(ui.picking, null);
    assert(!ui.pending);
    ui.beginPick();
    ui.pickLayer(a.id);
    ui.pickLayer(b.id);
    await ui.run("cancel");
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(ui.fitResult, null);
    assert(!ui.pending);
    ui.beginPick();
    ui.pickLayer(a.id);
    ui.pickLayer(b.id);
    l.renameNode(a.id, "Changed");
    await finishCheck(ui);
    assert.equal(ui.fitResult, null);
    assert(ui.status.includes("changed"));
    ui.beginPick();
    ui.pickLayer(a.id);
    other = await setup();
    active = other.l;
    ui.sync();
    assert.equal(ui.picking, null);
    assert.equal(ui.partA, "");
    assert.equal(ui.fitResult, null);
  } finally {
    ui.dispose();
    other?.l.dispose();
    l.dispose();
  }
});
test("XR two-tap checks require a released trigger, work in either hand and own the held press", async () => {
  const { Matrix4 } = await import("three");
  for (const hand of ["left", "right"]) {
    const { l, a, b } = await setup();
    const ui = new AssemblyControls(() => l);
    try {
      const tool = {
        role: "tool",
        handedness: hand,
        connectionId: hand === "left" ? 11 : 22,
        connected: true,
        tracked: true,
        gripTracked: true,
        buttons: { trigger: { pressed: true, rawValue: 1, justPressed: true } },
      };
      const pose = new Matrix4().makeTranslation(0, 0, 1),
        release = () => {
          tool.buttons.trigger = { pressed: false, rawValue: 0, justPressed: false };
          ui.step(tool, pose, true);
        };
      ui.beginPick();
      ui.step(tool, pose, true);
      assert.equal(ui.picking, "first");
      release();
      tool.buttons.trigger = { pressed: true, rawValue: 1, justPressed: true };
      ui.step(tool, pose, true);
      assert.equal(ui.partA, a.id);
      tool.buttons.trigger.justPressed = false;
      ui.step(tool, pose, true);
      assert.equal(ui.picking, "second");
      release();
      pose.makeTranslation(0.3, 0, 1);
      tool.buttons.trigger = { pressed: true, rawValue: 1, justPressed: true };
      ui.step(tool, pose, true);
      await finishCheck(ui);
      assert(ui.fitResult, ui.status);
      tool.buttons.trigger.justPressed = false;
      assert(ui.step(tool, pose, true));
      assert(ui.ownsPointer);
      release();
      assert(!ui.ownsPointer);
      assert.equal(ui.step(tool, pose, true), false);
    } finally {
      ui.dispose();
      l.dispose();
    }
  }
});
test("XR menus pause selection and tracking/controller changes cancel partial picks", async () => {
  const { l, a } = await setup();
  const ui = new AssemblyControls(() => l);
  const { Matrix4 } = await import("three");
  try {
    const tool = {
      role: "tool",
      connectionId: 1,
      connected: true,
      tracked: true,
      gripTracked: true,
      buttons: { trigger: { pressed: false, rawValue: 0, justPressed: false } },
    };
    const pose = new Matrix4().makeTranslation(0, 0, 1);
    ui.beginPick();
    ui.step(tool, pose, true);
    ui.pickLayer(a.id);
    ui.step(tool, pose, false);
    assert.equal(ui.picking, "second");
    tool.tracked = false;
    ui.step(tool, pose, true);
    assert.equal(ui.picking, null);
    assert(!ui.pending);
    tool.tracked = true;
    ui.beginPick();
    ui.step(tool, pose, true);
    ui.pickLayer(a.id);
    tool.connectionId = 2;
    ui.step(tool, pose, true);
    assert.equal(ui.picking, null);
    assert(ui.content().buttons.length <= 8);
  } finally {
    ui.dispose();
    l.dispose();
  }
});
test("connector generation from picked ordinary layers defines parts in the same undo transaction", async () => {
  const { l, a, b } = await setup(0.2);
  const ui = new AssemblyControls(() => l);
  try {
    l.setAssemblyPart(a.id, undefined);
    l.setAssemblyPart(b.id, undefined);
    ui.beginPick("pair");
    ui.pickLayer(a.id);
    ui.pickLayer(b.id);
    assert(!a.assemblyPart && !b.assemblyPart);
    ui.connector = connector(a, b);
    await ui.run("connector");
    assert(a.assemblyPart && b.assemblyPart, ui.status);
    assert.equal(l.project.layerStack.layers.length, 5);
    l.undo();
    assert(!a.assemblyPart && !b.assemblyPart);
    assert.equal(l.project.layerStack.layers.length, 3);
  } finally {
    ui.dispose();
    l.dispose();
  }
});

const jointRay = async () => {
  const { Raycaster, Vector3 } = await import("three");
  return new Raycaster(new Vector3(1, 0, 0), new Vector3(-1, 0, 0));
};
async function waitForConnector(ui, l) {
  const deadline = performance.now() + 7000;
  while ((ui.pending || ui.generatingConnector || !l.recoveryReady) && performance.now() < deadline)
    await new Promise((r) => setTimeout(r, 5));
  assert(!ui.pending && !ui.generatingConnector && l.recoveryReady, ui.status);
}
test("surface placement finds matching points across a gap and at contact using explicit mm", async () => {
  const { l, a, b } = await setup();
  const { ConnectorPlacer } = await import("../work/test-build/connector-placement.mjs");
  try {
    const placer = new ConnectorPlacer(() => l),
      ray = await jointRay(),
      before = l.recoveryKey();
    let p = placer.place(ray, a.id, b.id);
    near(p.positionMM[0], 10, 0.02);
    near(p.socketPositionMM[0], 20, 0.02);
    near(p.faceGapMM, 10, 0.02);
    near(p.normal[0], 1);
    const axis = new Vector3(0, 1, 0).applyQuaternion(
      new Quaternion().setFromEuler(new Euler(...p.rotationRadians)),
    );
    near(axis.x, 1);
    near(axis.y, 0);
    assert.equal(l.recoveryKey(), before);
    ray.far = 0.5;
    assert.throws(() => placer.place(ray, a.id, b.id), /reach/);
    ray.far = Infinity;
    l.display.precision.millimetresPerUnit = 200;
    p = placer.place(ray, a.id, b.id);
    near(p.positionMM[0], 20, 0.02);
    near(p.socketPositionMM[0], 40, 0.02);
    l.display.precision.millimetresPerUnit = 100;
    l.select(b.id);
    const pose = identityTransform();
    pose.position = [0.2, 0, 0];
    l.setActiveTransform(pose);
    p = placer.place(ray, a.id, b.id);
    near(p.faceGapMM, 0, 0.02);
    near(p.socketPositionMM[0], 10, 0.02);
    placer.clear();
  } finally {
    l.dispose();
  }
});
test("placement removes workspace transforms and respects rotated scaled parent groups", async () => {
  const { l, a, b } = await setup();
  const { ConnectorPlacer } = await import("../work/test-build/connector-placement.mjs");
  const { Raycaster, Ray, Matrix4 } = await import("three");
  try {
    const group = l.createGroup("Parent");
    l.reparent(a.id, group);
    l.reparent(b.id, group);
    l.selectGroup(group);
    const t = identityTransform();
    t.position = [0.05, 0.1, -0.02];
    t.rotation = [0, 0, 0.3];
    t.scale = [1.2, 1.2, 1.2];
    l.setActiveTransform(t);
    const matrix = new Matrix4().compose(
      new Vector3(...t.position),
      new Quaternion().setFromEuler(new Euler(...t.rotation)),
      new Vector3(...t.scale),
    );
    l.group.position.set(0.4, 0.7, -0.5);
    l.group.rotation.set(0.1, 0.2, 0.3);
    l.group.scale.setScalar(2.5);
    l.group.updateWorldMatrix(true, false);
    const ray = new Ray(new Vector3(1, 0, 0), new Vector3(-1, 0, 0))
        .applyMatrix4(matrix)
        .applyMatrix4(l.group.matrixWorld),
      caster = new Raycaster();
    caster.ray.copy(ray);
    const p = new ConnectorPlacer(() => l).place(caster, a.id, b.id),
      expected = new Vector3(0.1, 0, 0).applyMatrix4(matrix).multiplyScalar(100),
      socket = new Vector3(0.2, 0, 0).applyMatrix4(matrix).multiplyScalar(100);
    p.positionMM.forEach((v, i) => {
      near(v, expected.getComponent(i), 0.03);
    });
    p.socketPositionMM.forEach((v, i) => {
      near(v, socket.getComponent(i), 0.03);
    });
    near(p.faceGapMM, 12, 0.03);
    const normal = new Vector3(1, 0, 0).transformDirection(matrix);
    near(new Vector3(...p.normal).dot(normal), 1, 0.001);
  } finally {
    l.dispose();
  }
});
test("placement refuses misses, non-facing or locked targets and Boolean-removed faces", async () => {
  const { l, a, b } = await setup();
  const { ConnectorPlacer } = await import("../work/test-build/connector-placement.mjs");
  const { Raycaster } = await import("three");
  try {
    const placer = new ConnectorPlacer(() => l),
      ray = await jointRay();
    assert.throws(
      () => placer.place(new Raycaster(new Vector3(1, 1, 0), new Vector3(-1, 0, 0)), a.id, b.id),
      /face/,
    );
    l.setNodeFlag(b.id, "locked", true);
    assert.throws(() => placer.place(ray, a.id, b.id), /locked/);
    l.setNodeFlag(b.id, "locked", false);
    l.select(b.id);
    const pose = identityTransform();
    pose.position = [0, 0.3, 0];
    l.setActiveTransform(pose);
    assert.throws(() => placer.place(ray, a.id, b.id), /toward/);
    pose.position = [0.3, 0, 0];
    l.setActiveTransform(pose);
    const cutter = await l.regeneratePrimitive({ kind: "cylinder", diameter: 0.08, height: 0.4 });
    const cp = identityTransform();
    cp.rotation = [0, 0, Math.PI / 2];
    l.select(cutter.id);
    l.setActiveTransform(cp);
    l.setBooleanModifiers(a.id, [
      { id: "joint-through-hole", sourceId: cutter.id, operation: "difference", enabled: true },
    ]);
    assert.throws(() => placer.place(ray, a.id, b.id), /peg layer/);
  } finally {
    l.dispose();
  }
});
test("joint hover previews without editing fields/history and cancellation restores the socket layer", async () => {
  const { l, a, b } = await setup();
  const ui = new AssemblyControls(() => l);
  try {
    l.setAssemblyPart(a.id, undefined);
    l.setAssemblyPart(b.id, undefined);
    const before = l.recoveryKey(),
      undos = l.undoCount;
    ui.beginPick("connector");
    ui.pickLayer(a.id);
    ui.pickLayer(b.id);
    assert.equal(ui.picking, "joint");
    assert(!l.runtime(b.id).surface.group.visible);
    ui.hoverRay(await jointRay());
    assert(ui.placement, ui.status);
    assert(l.group.getObjectByName("Connector placement preview")?.visible);
    assert.equal(l.recoveryKey(), before);
    assert.equal(l.undoCount, undos);
    assert(!a.assemblyPart && !b.assemblyPart);
    await ui.run("cancel");
    assert(l.runtime(b.id).surface.group.visible);
    assert(!l.group.getObjectByName("Connector placement preview"));
    assert.equal(l.recoveryKey(), before);
  } finally {
    ui.dispose();
    l.dispose();
  }
});
test("third tap creates separate peg/socket anchors, evaluated results, persistence and one Undo", async () => {
  const { l, a, b } = await setup();
  const ui = new AssemblyControls(() => l);
  try {
    l.setAssemblyPart(a.id, undefined);
    l.setAssemblyPart(b.id, undefined);
    ui.setField("pegDiameterMM", 8);
    ui.beginPick("connector");
    ui.pickLayer(a.id);
    ui.pickLayer(b.id);
    ui.pickRay(await jointRay());
    await waitForConnector(ui, l);
    assert(ui.connectorPlaced, ui.status);
    assert(ui.status.includes("created"));
    assert.equal(l.project.layerStack.layers.length, 5);
    const peg = l.project.layerStack.layers.find((s) => s.name === "Assembly peg"),
      socket = l.project.layerStack.layers.find((s) => s.name === "Assembly socket cutter");
    near(peg.transform.position[0], 0.1, 0.0002);
    near(socket.transform.position[0], 0.2, 0.0002);
    near(socket.primitive.diameter, 0.086);
    assert(prepareComposite(partSources(l.project.layerStack, a.id))(0.115, 0, 0) < 0);
    assert(prepareComposite(partSources(l.project.layerStack, b.id))(0.215, 0, 0) > 0);
    const opened = openSculptProject(saveSculptProject(l.project));
    near(opened.layerStack.get(socket.id).transform.position[0], 0.2, 0.0002);
    const stl = await exportPartSTL(l, b.id);
    assert.equal(stl.report.boundaryEdges, 0);
    assert.equal(stl.report.nonManifoldEdges, 0);
    assert.equal(stl.report.blocking.length, 0);
    l.undo();
    assert.equal(l.project.layerStack.layers.length, 3);
    assert(!a.assemblyPart && !b.assemblyPart);
    l.undo(true);
    assert.equal(l.project.layerStack.layers.length, 5);
    ui.dismiss();
    assert(!ui.connectorPlaced);
  } finally {
    ui.dispose();
    l.dispose();
  }
});
test("basic connector dimensions derive matching sockets while advanced overrides remain deliberate", async () => {
  const { l } = await setup();
  const ui = new AssemblyControls(() => l);
  try {
    ui.setField("pegDiameterMM", 8);
    near(ui.connector.socketDiameterMM, 8.6);
    ui.setField("radialClearanceMM", 0.4);
    near(ui.connector.socketDiameterMM, 8.8);
    ui.setField("pegLengthMM", 7);
    near(ui.connector.socketDepthMM, 7.5);
    ui.setField("socketDiameterMM", 9.2);
    ui.setField("radialClearanceMM", 0.5);
    near(ui.connector.socketDiameterMM, 9.2);
    assert(!ui.socketSizingAuto);
    ui.matchSocketSizes();
    near(ui.connector.socketDiameterMM, 9);
    assert(ui.socketSizingAuto);
    ui.setField("socketDiameterMM", 1);
    ui.beginPick("connector");
    assert.equal(ui.picking, null);
    assert(ui.status.includes("twice"));
  } finally {
    ui.dispose();
    l.dispose();
  }
});
test("both XR hands require a third released trigger tap to place a surface connector", async () => {
  const { Matrix4 } = await import("three");
  for (const hand of ["left", "right"]) {
    const { l, a, b } = await setup();
    const ui = new AssemblyControls(() => l);
    try {
      ui.setField("pegDiameterMM", 8);
      const tool = {
        role: "tool",
        handedness: hand,
        connectionId: hand === "left" ? 11 : 22,
        connected: true,
        tracked: true,
        gripTracked: true,
        buttons: { trigger: { pressed: true, rawValue: 1, justPressed: true } },
      };
      const pose = new Matrix4().makeTranslation(0, 0, 1),
        release = () => {
          tool.buttons.trigger = { pressed: false, rawValue: 0, justPressed: false };
          ui.step(tool, pose, true);
        },
        press = () => {
          tool.buttons.trigger = { pressed: true, rawValue: 1, justPressed: true };
          ui.step(tool, pose, true);
        };
      ui.beginPick("connector");
      ui.step(tool, pose, true);
      assert.equal(ui.picking, "first");
      release();
      press();
      assert.equal(ui.partA, a.id);
      release();
      pose.makeTranslation(0.3, 0, 1);
      press();
      assert.equal(ui.partB, b.id);
      assert.equal(ui.picking, "joint");
      tool.buttons.trigger.justPressed = false;
      ui.step(tool, pose, true);
      assert.equal(l.project.layerStack.layers.length, 3);
      pose.makeRotationY(Math.PI / 2);
      pose.setPosition(1, 0, 0);
      release();
      press();
      await waitForConnector(ui, l);
      assert(ui.connectorPlaced, ui.status);
      assert.equal(l.project.layerStack.layers.length, 5);
      tool.buttons.trigger.justPressed = false;
      assert(ui.step(tool, pose, true));
      release();
      assert(!ui.ownsPointer);
    } finally {
      ui.dispose();
      l.dispose();
    }
  }
});
test("joint selection cancels on tracking loss and aborted generation cannot leave partial parts", async () => {
  const { l, a, b } = await setup();
  const ui = new AssemblyControls(() => l);
  const { Matrix4 } = await import("three");
  try {
    l.setAssemblyPart(a.id, undefined);
    l.setAssemblyPart(b.id, undefined);
    ui.beginPick("connector");
    ui.pickLayer(a.id);
    ui.pickLayer(b.id);
    ui.hoverRay(await jointRay());
    ui.step(
      { connected: true, tracked: false, gripTracked: false, role: "tool" },
      new Matrix4(),
      true,
    );
    assert.equal(ui.picking, null);
    assert(l.runtime(b.id).surface.group.visible);
    ui.beginPick("connector");
    ui.pickLayer(a.id);
    ui.pickLayer(b.id);
    ui.pickRay(await jointRay());
    await ui.run("cancel");
    await waitForConnector(ui, l);
    assert.equal(l.project.layerStack.layers.length, 3);
    assert(!a.assemblyPart && !b.assemblyPart);
    assert(!ui.connectorPlaced);
    assert(!ui.pending);
  } finally {
    ui.dispose();
    l.dispose();
  }
});

test("default 50 mm boxes and stock 4 mm connector render a bounded assembly preview without a quality-cap error", async () => {
  const { l, a, b } = await setup(0.6);
  try {
    const { previewAssembly } = await import("../work/test-build/assembly-tools.mjs");
    const { Raycaster } = await import("three");
    const size = { kind: "box", width: 0.5, height: 0.5, depth: 0.5 };
    await l.regeneratePrimitive(size, a.id);
    await l.regeneratePrimitive(size, b.id);
    const ui = new AssemblyControls(() => l);
    try {
      assert.equal(ui.connector.pegDiameterMM, 4);
      assert.equal(ui.connector.pegLengthMM, 6);
      assert.equal(ui.connector.radialClearanceMM, 0.3);
      const before = l.undoCount;
      await generateConnector(l, {
        ...ui.connector,
        pegPart: a.id,
        socketPart: b.id,
        positionMM: [25, 0, 0],
        socketPositionMM: [35, 0, 0],
        rotationRadians: [0, 0, -Math.PI / 2],
      });
      assert.equal(l.undoCount, before + 1);
      const detail = await previewAssembly(l);
      assert(detail.capped, "regression fixture must exercise the former refusal");
      assert(detail.effectiveResolutionMM > 0 && detail.effectiveResolutionMM < 0.5);
      assert(l.syncAssemblyPreview());
      const preview = l.group.getObjectByName("Assembly Preview");
      assert.equal(preview.children.length, 2);
      l.group.updateWorldMatrix(true, true);
      const socketHits = new Raycaster(
        new Vector3(0.33, 0, 0),
        new Vector3(1, 0, 0),
      ).intersectObject(preview, true);
      assert(socketHits.length);
      assert(socketHits[0].point.x > 0.375, "socket is a visible cavity in the evaluated mesh");
      assert.equal(l.undoCount, before + 1, "preview adds no model history");
      l.undo();
      assert(!l.syncAssemblyPreview());
      assert.equal(l.project.layerStack.layers.length, 3);
    } finally {
      ui.dispose();
    }
  } finally {
    l.dispose();
  }
});

test("deleting generated peg or socket source restores the body and supports one-step Undo/Redo", async () => {
  for (const sourceName of ["Assembly peg", "Assembly socket cutter"]) {
    const { l, a, b } = await setup();
    try {
      const options = {
        ...connector(a, b),
        positionMM: [10, 0, 0],
        socketPositionMM: [20, 0, 0],
        rotationRadians: [0, 0, -Math.PI / 2],
      };
      await generateConnector(l, options);
      const source = l.project.layerStack.layers.find((layer) => layer.name === sourceName),
        target = sourceName === "Assembly peg" ? a : b,
        sibling = sourceName === "Assembly peg" ? b : a,
        mods = structuredClone(target.booleanModifiers),
        other = structuredClone(sibling.booleanModifiers),
        point = sourceName === "Assembly peg" ? [0.115, 0, 0] : [0.215, 0, 0],
        before = l.undoCount;
      const evaluate = () => prepareComposite(partSources(l.project.layerStack, target.id));
      const original = evaluate()(...point);
      l.select(source.id);
      l.deleteObject(source.id);
      assert.equal(l.undoCount, before + 1);
      assert(!target.booleanModifiers.some((m) => m.sourceId === source.id));
      assert.deepEqual(sibling.booleanModifiers, other);
      assert.equal(l.project.layerStack.layers.length, 4);
      assert.equal(original < 0, sourceName === "Assembly peg");
      assert.equal(evaluate()(...point) < 0, sourceName !== "Assembly peg");
      l.undo();
      assert.deepEqual(target.booleanModifiers, mods);
      assert.equal(l.project.layerStack.hierarchy.parent(source.id), target.id);
      near(evaluate()(...point), original);
      l.undo(true);
      assert(!l.project.layerStack.layers.some((layer) => layer.id === source.id));
      assert.deepEqual(sibling.booleanModifiers, other);
    } finally {
      l.dispose();
    }
  }
});

test("saved assembly preview intent rebuilds the socket result on native reopen without changing source geometry or history", async () => {
  const { l, a, b } = await setup();
  let restored;
  try {
    const { previewAssembly, restoreAssemblyPreview } = await import(
      "../work/test-build/assembly-tools.mjs"
    );
    const { Raycaster } = await import("three");
    await generateConnector(l, {
      ...connector(a, b),
      positionMM: [10, 0, 0],
      socketPositionMM: [20, 0, 0],
      rotationRadians: [0, 0, -Math.PI / 2],
    });
    await previewAssembly(l);
    const display = l.display.snapshot(l.project.id, l.project.layerStack.layers);
    assert.equal(display.assemblyPreview, true);
    const project = openSculptProject(saveSculptProject(l.project, display));
    restored = new IndependentLayers(project);
    const fields = project.layerStack.layers.map((layer) => layer.volume.getDenseView().slice());
    assert(!restored.assemblyPreviewActive, "derived meshes are not serialized");
    await restoreAssemblyPreview(restored);
    assert(restored.assemblyPreviewActive);
    assert.equal(restored.viewMode, "separate");
    restored.select(b.id);
    assert(restored.syncAssemblyPreview(), "selecting a part for export keeps the evaluated view");
    assert.equal(restored.undoCount, 0);
    project.layerStack.layers.forEach((layer, i) => {
      assert.deepEqual(layer.volume.getDenseView(), fields[i]);
      assert(
        !restored.runtime(layer.id).surface.group.visible,
        "raw cutters stay hidden behind evaluated results",
      );
    });
    const result = restored.group.getObjectByName("Assembly Preview");
    restored.group.updateWorldMatrix(true, true);
    const hits = new Raycaster(new Vector3(0.18, 0, 0), new Vector3(1, 0, 0)).intersectObject(
      result,
      true,
    );
    assert(hits.length && hits[0].point.x > 0.225, "restored result contains the socket cavity");
  } finally {
    restored?.dispose();
    l.dispose();
  }
});

test("actual recovery worker retains assembly view intent and restores evaluated parts", async () => {
  const { l, a, b } = await setup();
  let restored;
  const previous = globalThis.Worker;
  try {
    const { previewAssembly, restoreAssemblyPreview } = await import(
      "../work/test-build/assembly-tools.mjs"
    );
    await generateConnector(l, connector(a, b));
    await previewAssembly(l);
    globalThis.Worker = RecoveryBrowserWorker;
    const encoded = await encodeRecovery(
      l,
      settings,
      l.display.snapshot(l.project.id, l.project.layerStack.layers),
      undefined,
      new AbortController().signal,
      () => true,
    );
    const project = openSculptProject(encoded.data);
    assert.equal(project.displayPreferences.assemblyPreview, true);
    restored = new IndependentLayers(project);
    await restoreAssemblyPreview(restored);
    assert(restored.assemblyPreviewActive);
    assert.equal(restored.project.layerStack.layers.length, 5);
    assert.equal(restored.undoCount, 0);
  } finally {
    globalThis.Worker = previous;
    restored?.dispose();
    l.dispose();
  }
});

test("exiting preview persists source view, while legacy assemblies can reopen preview manually", async () => {
  const { l } = await setup();
  let restored;
  try {
    const { previewAssembly, restoreAssemblyPreview } = await import(
      "../work/test-build/assembly-tools.mjs"
    );
    const { validateProjectDisplay } = await import("../work/test-build/display-preferences.mjs");
    await previewAssembly(l);
    l.clearAssemblyPreview();
    l.syncPresentation();
    const display = l.display.snapshot(l.project.id, l.project.layerStack.layers);
    assert.equal(display.assemblyPreview, undefined);
    restored = new IndependentLayers(openSculptProject(saveSculptProject(l.project, display)));
    assert.equal(await restoreAssemblyPreview(restored), undefined);
    assert(!restored.assemblyPreviewActive);
    const controls = new AssemblyControls(() => restored);
    try {
      await controls.run("preview");
      assert(restored.assemblyPreviewActive);
      await controls.run("end-preview");
      assert(!restored.display.assemblyPreview);
    } finally {
      controls.dispose();
    }
    assert.throws(
      () =>
        validateProjectDisplay(
          { ...display, assemblyPreview: "yes" },
          l.project.layerStack.layers.map((layer) => layer.id),
        ),
      /assembly preview/,
    );
  } finally {
    restored?.dispose();
    l.dispose();
  }
});

test("cancelled assembly view restoration releases temporary meshes and preserves editable sources", async () => {
  const { l, a, b } = await setup();
  try {
    const { restoreAssemblyPreview } = await import("../work/test-build/assembly-tools.mjs");
    await generateConnector(l, connector(a, b));
    l.display.assemblyPreview = true;
    const before = l.trackedBytes,
      history = l.undoCount,
      signal = new AbortController();
    const work = restoreAssemblyPreview(l, signal.signal);
    signal.abort();
    await assert.rejects(work, /cancel|abort|changed/i);
    assert(!l.assemblyPreviewActive);
    assert.equal(l.trackedBytes, before);
    assert.equal(l.undoCount, history);
    assert(l.project.layerStack.get(b.id).booleanModifiers.length);
    assert(l.project.layerStack.layers.every((layer) => l.runtime(layer.id).surface.group.visible));
  } finally {
    l.dispose();
  }
});

test("stock 50 mm box/4 mm connector exports both validated high-quality STLs with preview caches present", async () => {
  const { l, a, b } = await setup(0.6, 64);
  try {
    const { previewAssembly } = await import("../work/test-build/assembly-tools.mjs");
    const { parseSTL } = await import("../work/test-build/stl.mjs");
    const { BufferAttribute, BufferGeometry, Mesh, MeshBasicMaterial, Raycaster, DoubleSide } =
      await import("three");
    for (const part of [a, b])
      await l.regeneratePrimitive({ kind: "box", width: 0.5, height: 0.5, depth: 0.5 }, part.id);
    await generateConnector(l, {
      ...connector(a, b),
      positionMM: [25, 0, 0],
      socketPositionMM: [35, 0, 0],
      rotationRadians: [0, 0, -Math.PI / 2],
    });
    await previewAssembly(l);
    assert(l.trackedBytes > 120 * 1024 ** 2, "fixture includes the expensive displayed caches");
    const key = l.recoveryKey(),
      history = l.undoCount;
    for (const part of [a, b]) {
      const result = await exportPartSTL(l, part.id, undefined, "high");
      assert.equal(result.report.blocking.length, 0);
      assert.equal(result.report.boundaryEdges, 0);
      assert.equal(result.report.nonManifoldEdges, 0);
      assert.equal(result.report.degenerateTriangles, 0);
      assert.equal(result.report.inconsistentEdges, 0);
      assert.equal(result.report.components, 1);
      near(result.report.dimensions[0], part === a ? 53 : 50, 0.01);
      near(result.report.dimensions[1], 50, 0.01);
      near(result.report.dimensions[2], 50, 0.01);
      assert(result.report.effectiveResolutionMM > 0 && result.report.effectiveResolutionMM < 0.5);
      assert(result.stats[0].planarRemoved > 100000);
      assert(result.stats[0].maxPlanarDeviation < 1e-7);
      assert(result.estimatedBytes < 256 * 1024 ** 2);
      const geometry = new BufferGeometry().setAttribute(
          "position",
          new BufferAttribute(parseSTL(new Uint8Array(result.data)), 3),
        ),
        material = new MeshBasicMaterial({ side: DoubleSide }),
        mesh = new Mesh(geometry, material);
      mesh.updateMatrixWorld(true);
      const ray =
        part === b
          ? new Raycaster(new Vector3(-26, 0, 0), new Vector3(1, 0, 0))
          : new Raycaster(new Vector3(27.5, 0, 0), new Vector3(-1, 0, 0));
      const hits = ray.intersectObject(mesh);
      assert(hits.length);
      near(hits[0].point.x, part === b ? -21.75 : 26.5, 0.1);
      geometry.dispose();
      material.dispose();
      assert(l.assemblyPreviewActive && l.display.assemblyPreview);
      assert.equal(l.recoveryKey(), key);
      assert.equal(l.undoCount, history);
    }
  } finally {
    l.dispose();
  }
});

test("export memory leases evict stale display grids, pause background rebuilds and restore the assembly after failure", async () => {
  const { l, a, b } = await setup();
  try {
    const { previewAssembly, withExportMemory } = await import(
      "../work/test-build/assembly-tools.mjs"
    );
    await generateConnector(l, connector(a, b));
    await previewAssembly(l);
    const key = l.recoveryKey(),
      before = l.trackedBytes;
    await assert.rejects(
      withExportMemory(l, async () => {
        assert(!l.assemblyPreviewActive);
        assert(l.trackedBytes < before);
        assert.equal(l.composite.trackedBytes, 0);
        assert.equal(l.composite.tick(), null);
        await assert.rejects(l.composite.flush(), /paused/);
        await withExportMemory(l, async () => {
          assert.equal(l.composite.tick(), null);
        });
        assert.equal(l.composite.tick(), null, "nested export cannot resume the display cache");
        throw new Error("Export cancelled");
      }),
      /cancelled/,
    );
    assert(l.assemblyPreviewActive && l.display.assemblyPreview);
    assert.equal(l.recoveryKey(), key);
  } finally {
    l.dispose();
  }
});

test("independent Boolean export preparation retains GLB colours and rejects oversized feature bounds", async () => {
  const { l, a, b } = await setup();
  try {
    const { withExportMemory } = await import("../work/test-build/assembly-tools.mjs");
    const { prepareBooleanExport } = await import("../work/test-build/boolean-export.mjs");
    const { encodeExport } = await import("../work/test-build/glb-export.mjs");
    await generateConnector(l, connector(a, b));
    const key = l.recoveryKey();
    await withExportMemory(l, async () => {
      const prepared = await prepareBooleanExport(l, l.project, undefined, false);
      try {
        assert(
          prepared.sources.some((source) => source.chunks.some((chunk) => chunk.colours?.length)),
        );
        const result = await encodeExport(prepared.sources, "fast", prepared.availableBytes());
        assert.equal(new DataView(result.data).getUint32(0, true), 0x46546c67);
      } finally {
        prepared.dispose();
      }
    });
    assert.equal(l.recoveryKey(), key);
    l.renameNode(a.id, "Preserve source");
    l.undo();
    const history = [l.undoCount, l.redoCount],
      fields = a.volume.getDenseView().slice();
    Object.defineProperty(l, "trackedBytes", { configurable: true, get: () => 256 * 1024 ** 2 });
    try {
      await assert.rejects(exportPartSTL(l, a.id), /memory budget/);
    } finally {
      delete l.trackedBytes;
    }
    assert.deepEqual([l.undoCount, l.redoCount], history);
    assert.deepEqual(a.volume.getDenseView(), fields);
  } finally {
    l.dispose();
  }
});

for (const action of ["export", "export-all"]) {
  test(`${action} starts from the first request while assembly preview is finishing`, async () => {
    const { l, a } = await setup();
    const controls = new AssemblyControls(() => l);
    const downloads = [];
    controls.partA = a.id;
    controls.onExport = (result) => downloads.push(result);
    try {
      const revision = l.sourceRevision;
      const preview = controls.run("preview");
      assert(controls.pending);
      const exported = controls.run(action);
      await Promise.all([preview, exported]);
      assert.equal(downloads.length, action === "export" ? 1 : 2);
      for (const file of downloads) {
        assert(file.data.byteLength > 84);
        assert.deepEqual(file.report.blocking, []);
      }
      assert(l.assemblyPreviewActive);
      assert.equal(l.sourceRevision, revision);
      assert.match(controls.status, /STLs use project millimetres/);
    } finally {
      controls.dispose();
      l.dispose();
    }
  });
}

test("cancelling a pending preview also cancels its queued export", async () => {
  const { l, a } = await setup();
  const controls = new AssemblyControls(() => l);
  let downloads = 0;
  controls.partA = a.id;
  controls.onExport = () => downloads++;
  try {
    const preview = controls.run("preview");
    const exported = controls.run("export");
    await controls.run("cancel");
    await Promise.all([preview, exported]);
    assert.equal(downloads, 0);
    assert(!controls.pending);
  } finally {
    controls.dispose();
    l.dispose();
  }
});
