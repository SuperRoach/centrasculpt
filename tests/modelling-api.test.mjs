import assert from "node:assert/strict";
import test from "node:test";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { ModellingAPI } from "../work/test-build/modelling-api.mjs";
import { PrimitiveTools } from "../work/test-build/primitive-tools.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";

const make = () => {
  const v = new SDFVolume(17, 1.6, false);
  v.values.fill(6.4);
  const layers = new IndependentLayers(
    createBaseProject(v, {
      mode: "add",
      radius: 0.12,
      strength: 0.5,
      hardness: 0.5,
      camera: { position: [2, 2, 3], target: [0, 0, 0] },
    }),
  );
  return { l: layers, api: new ModellingAPI(layers) };
};
const box = { kind: "box", width: 50, height: 60, depth: 40 };
const run = (api, command, options = {}) =>
  api.execute(command, { expectedRevision: api.revision, ...options });
const create = (api) =>
  run(api, JSON.parse(JSON.stringify({ type: "primitive.create", unit: "mm", source: box })));
const get = (api, id) => {
  const r = api.query({ type: "object.get", id });
  assert(r.ok, JSON.stringify(r));
  return r.value;
};
test("command/query JSON round trips, explicit units, detached metadata and read-only state", async () => {
  const { l, api } = make();
  try {
    const r = await create(api);
    assert(r.ok);
    assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
    const response = api.query({ type: "object.get", id: r.value.id });
    assert.deepEqual(JSON.parse(JSON.stringify(response)), response);
    const id = r.value.id;
    const before = l.recoveryKey(),
      values = l.runtime(id).volume.getDenseView().slice();
    const metadata = get(api, id);
    assert.deepEqual(metadata.dimensionsMM, [50, 60, 40]);
    assert.deepEqual(JSON.parse(JSON.stringify(metadata)), metadata);
    assert.equal(api.query({ type: "scene.summary" }).value.millimetresPerModelUnit, 100);
    assert.equal(api.query({ type: "object.list" }).value.length, 2);
    metadata.worldTransform.positionMM[0] = 999;
    metadata.primitive.width = 999;
    assert.equal(get(api, id).primitive.width, 50);
    assert.equal(l.recoveryKey(), before);
    assert.deepEqual(l.runtime(id).volume.getDenseView(), values);
    const edit = await run(api, {
      type: "primitive.update",
      id,
      unit: "in",
      source: { kind: "box", width: 1, height: 1, depth: 1 },
    });
    assert(edit.ok, JSON.stringify(edit));
    assert.deepEqual(get(api, id).dimensionsMM, [25.4, 25.4, 25.4]);
    l.undo();
    assert.deepEqual(get(api, id).dimensionsMM, [50, 60, 40]);
    l.undo(true);
    assert.equal(get(api, id).type, "box");
  } finally {
    l.dispose();
  }
});
test("nested world transforms, rename and undoable delete preserve identity and redo", async () => {
  const { l, api } = make();
  try {
    const id = (await create(api)).value.id;
    const g = l.createGroup("Assembly");
    l.reparent(id, g);
    l.selectGroup(g);
    l.setActiveTransform({ position: [1, 0, 0], rotation: [0, 0, 0], scale: [2, 2, 2] });
    assert.equal(get(api, id).worldTransform.positionMM[0], 100);
    assert.deepEqual(get(api, id).dimensionsMM, [100, 120, 80]);
    assert(
      (
        await run(api, {
          type: "object.transform",
          id,
          unit: "cm",
          transform: { position: [20, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        })
      ).ok,
    );
    assert.equal(get(api, id).worldTransform.positionMM[0], 200);
    assert.equal(get(api, id).localTransform.positionMM[0], 50);
    assert((await run(api, { type: "object.rename", id, name: "Part" })).ok);
    assert.equal(get(api, id).name, "Part");
    l.undo();
    assert.notEqual(get(api, id).name, "Part");
    l.undo(true);
    assert((await run(api, { type: "object.delete", id })).ok);
    assert.equal(api.query({ type: "object.get", id }).error.code, "not_found");
    l.undo();
    assert.equal(get(api, id).name, "Part");
    assert.equal(get(api, id).parentId, g);
    l.undo(true);
    assert.equal(api.query({ type: "object.get", id }).ok, false);
    l.undo();
  } finally {
    l.dispose();
  }
});
test("validation, permissions, hidden ancestors, unsupported and revision conflicts are atomic", async () => {
  const { l, api } = make();
  try {
    const id = (await create(api)).value.id;
    for (const source of [
      { ...box, width: NaN },
      { ...box, width: Infinity },
      { ...box, width: -1 },
      { ...box, width: 1e9 },
      { ...box, width: "50" },
      { ...box, bevel: 1 },
    ]) {
      const before = api.revision;
      const r = await run(api, { type: "primitive.update", id, unit: "mm", source });
      assert.equal(r.error.code, "invalid_input");
      assert.equal(api.revision, before);
    }
    const revision = api.revision;
    l.renameNode(id, "UI edit");
    assert.equal(
      (await run(api, { type: "object.delete", id }, { expectedRevision: revision })).error.code,
      "revision_conflict",
    );
    const g = l.createGroup();
    l.reparent(id, g);
    l.setNodeFlag(g, "locked", true);
    assert.equal((await run(api, { type: "object.delete", id })).error.code, "permission_denied");
    l.setNodeFlag(g, "locked", false);
    l.setNodeFlag(g, "visible", false);
    assert.equal(get(api, id).visible, false);
    assert.equal((await run(api, { type: "primitive.bake", id })).error.code, "permission_denied");
    assert.equal(
      (await run(new ModellingAPI(l, () => false), { type: "object.delete", id })).error.code,
      "permission_denied",
    );
    assert.equal((await run(api, { type: "unknown" })).error.code, "unsupported");
  } finally {
    l.dispose();
  }
});
test("asynchronous cancellation and busy rejection retain source, history, selection and redo", async () => {
  const { l, api } = make();
  try {
    const id = (await create(api)).value.id;
    l.renameNode(id, "Temporary");
    l.undo();
    const before = api.revision,
      controller = new AbortController();
    const promise = run(
      api,
      { type: "primitive.update", id, unit: "mm", source: { ...box, width: 70 } },
      { signal: controller.signal },
    );
    const busy = await run(api, { type: "object.delete", id });
    assert.equal(busy.error.code, "busy");
    controller.abort();
    assert.equal((await promise).error.code, "cancelled");
    assert.equal(api.revision, before);
    assert.deepEqual(get(api, id).dimensionsMM, [50, 60, 40]);
    l.undo(true);
    assert.equal(get(api, id).name, "Temporary");
    const aborted = new AbortController();
    aborted.abort();
    assert.equal((await createWithSignal(api, aborted.signal)).error.code, "cancelled");
  } finally {
    l.dispose();
  }
});
function createWithSignal(api, signal) {
  return run(api, { type: "primitive.create", unit: "mm", source: box }, { signal });
}
test("Bake shares UI backend, preserves source, and is one undo/redo action", async () => {
  const { l, api } = make(),
    other = make();
  try {
    const id = (await create(api)).value.id;
    const ui = new PrimitiveTools(() => other.l);
    ui.draft = { kind: "box", width: 0.5, height: 0.6, depth: 0.4 };
    await ui.create();
    assert.deepEqual(l.active.layer.primitive, other.l.active.layer.primitive);
    assert.deepEqual(l.active.volume.getDenseView(), other.l.active.volume.getDenseView());
    const r = await run(api, { type: "primitive.bake", id });
    assert(r.ok);
    await ui.bake();
    assert.equal(other.l.project.layerStack.layers.length, l.project.layerStack.layers.length);
    assert.deepEqual(l.active.volume.getDenseView(), other.l.active.volume.getDenseView());
    assert.equal(get(api, id).visible, false);
    assert.equal(get(api, r.value.id).type, "sculpt");
    l.undo();
    assert.equal(get(api, id).visible, true);
    assert.equal(api.query({ type: "object.get", id: r.value.id }).ok, false);
    l.undo(true);
    assert.equal(get(api, r.value.id).type, "sculpt");
    ui.dispose();
  } finally {
    l.dispose();
    other.l.dispose();
  }
});
for (const [source, expected] of [
  [{ kind: "box", width: 5, height: 6, depth: 4 }, [50, 60, 40]],
  [{ kind: "cylinder", diameter: 3, height: 6 }, [30, 60, 30]],
  [{ kind: "sphere", diameter: 2.5 }, [25, 25, 25]],
])
  test(`${source.kind} physical calibration and rotated command/UI transform parity`, async () => {
    const { l, api } = make();
    try {
      l.display.precision.millimetresPerUnit = 200;
      const r = await run(api, { type: "primitive.create", unit: "cm", source });
      assert(r.ok);
      const id = r.value.id;
      get(api, id).dimensionsMM.forEach((v, i) => {
        assert(Math.abs(v - expected[i]) < 1e-8);
      });
      const transform = { position: [10, 20, 30], rotation: [0, 0, Math.PI / 2], scale: [2, 2, 2] };
      assert((await run(api, { type: "object.transform", id, unit: "mm", transform })).ok);
      const commanded = get(api, id);
      l.undo();
      l.select(id);
      l.setActiveTransform({ ...transform, position: [0.05, 0.1, 0.15] });
      assert.deepEqual(get(api, id), commanded);
      const d = commanded.dimensionsMM;
      assert(Math.abs(d[0] - expected[1] * 2) < 1e-8);
      assert(Math.abs(d[1] - expected[0] * 2) < 1e-8);
      const revision = api.revision;
      l.undo();
      assert.notEqual(api.revision, revision);
    } finally {
      l.dispose();
    }
  });
test("failed transforms roll back without losing redo; failed deletes keep final layer", async () => {
  const { l, api } = make();
  try {
    const base = l.project.activeLayerId;
    const r = await run(api, { type: "object.delete", id: base });
    assert.equal(r.ok, false);
    assert.equal(l.project.activeLayerId, base);
    const id = (await create(api)).value.id;
    l.renameNode(id, "Redo survives");
    l.undo();
    const before = api.revision;
    const invalid = await run(api, {
      type: "object.transform",
      id,
      unit: "mm",
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 2, 1] },
    });
    assert.equal(invalid.ok, false);
    assert.equal(api.revision, before);
    assert.deepEqual(get(api, id).worldTransform.scale, [1, 1, 1]);
    l.undo(true);
    assert.equal(get(api, id).name, "Redo survives");
  } finally {
    l.dispose();
  }
});
test("create and Bake cancellation never publish partial objects or hide sources", async () => {
  const { l, api } = make();
  try {
    const before = api.revision,
      abort = new AbortController();
    const creating = createWithSignal(api, abort.signal);
    abort.abort();
    assert.equal((await creating).error.code, "cancelled");
    assert.equal(api.revision, before);
    assert.equal(l.project.layerStack.layers.length, 1);
    const id = (await create(api)).value.id,
      beforeBake = api.revision,
      bakeAbort = new AbortController();
    const baking = run(api, { type: "primitive.bake", id }, { signal: bakeAbort.signal });
    bakeAbort.abort();
    assert.equal((await baking).error.code, "cancelled");
    assert.equal(api.revision, beforeBake);
    assert.equal(get(api, id).visible, true);
    assert.equal(l.project.layerStack.layers.length, 2);
  } finally {
    l.dispose();
  }
});
test("revisions span adapters, invalidate calibration changes and reject reopened editor tokens", async () => {
  const { l, api } = make(),
    other = make();
  try {
    const sibling = new ModellingAPI(l),
      revision = api.revision;
    assert.equal(sibling.revision, revision);
    l.display.precision.millimetresPerUnit = 150;
    assert.notEqual(sibling.revision, revision);
    assert.equal(
      (
        await run(
          api,
          { type: "primitive.create", unit: "mm", source: box },
          { expectedRevision: revision },
        )
      ).error.code,
      "revision_conflict",
    );
    other.l.project.id = l.project.id;
    assert.notEqual(other.api.revision, api.revision);
  } finally {
    l.dispose();
    other.l.dispose();
  }
});
test("delete preparation failure restores reparented children and preserves history redo", async () => {
  const { l, api } = make();
  try {
    const id = (await create(api)).value.id,
      base = l.project.layerStack.layers.find((n) => n.id !== id).id;
    l.reparent(base, id);
    l.renameNode(id, "Redo");
    l.undo();
    const before = api.revision,
      stack = l.project.layerStack,
      remove = stack.remove;
    stack.remove = () => {
      throw Error("injected admission failure");
    };
    try {
      assert.equal((await run(api, { type: "object.delete", id })).ok, false);
    } finally {
      stack.remove = remove;
    }
    assert.equal(api.revision, before);
    assert.equal(get(api, base).parentId, id);
    l.undo(true);
    assert.equal(get(api, id).name, "Redo");
  } finally {
    l.dispose();
  }
});
test("editor disposal during asynchronous preparation returns a structured failure", async () => {
  const { l, api } = make();
  const pending = create(api);
  l.dispose();
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "operation_failed");
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});
