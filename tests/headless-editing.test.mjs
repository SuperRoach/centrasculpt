import assert from "node:assert/strict";
import test from "node:test";
import { createHeadlessEditor, enclosureSteps } from "../scripts/headless-enclosure.mjs";
import { ModellingAPI } from "../work/test-build/modelling-api.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { sculptMask } from "../work/test-build/sculpt-mask.mjs";
import { sculptPaint } from "../work/test-build/sculpt-paint.mjs";

const create = {
  type: "primitive.create",
  unit: "mm",
  source: { kind: "box", width: 20, height: 20, depth: 20 },
};
const execute = (api, command) => api.execute(command, { expectedRevision: api.revision });
const batch = (api, steps, options = {}) =>
  api.batch(steps, { expectedRevision: api.revision, ...options });
const snapshot = (layers) => Buffer.from(saveSculptProject(layers.project));
const requireOK = (r) => {
  assert(r.ok, JSON.stringify(r));
  return r.value;
};

test("headless editable Boolean assembly uses native persistence and one Undo/Redo", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const before = snapshot(l),
      revision = api.revision;
    const result = requireOK(await batch(api, enclosureSteps));
    assert.notEqual(api.revision, revision);
    assert.equal(result.geometryValidation, "source_caches_only");
    assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
    const { body, cutter } = result.aliases;
    assert.deepEqual(new Set(result.changes.created), new Set([body, cutter]));
    assert.deepEqual(result.changes.deleted, []);
    const objects = requireOK(api.query({ type: "object.list" }));
    assert.equal(objects.find((o) => o.id === body).booleanModifiers[0].sourceId, cutter);
    assert.equal(objects.find((o) => o.id === cutter).partId, body);
    assert.equal(requireOK(api.query({ type: "assembly.parts" }))[0].members.length, 2);
    const reopened = openSculptProject(saveSculptProject(l.project));
    assert.equal(reopened.layerStack.get(body).primitive.kind, "box");
    assert.equal(reopened.layerStack.get(body).booleanModifiers[0].sourceId, cutter);
    assert.equal(reopened.layerStack.hierarchy.parent(cutter), body);
    l.undo();
    assert.deepEqual(snapshot(l), before);
    l.undo(true);
    assert.equal(l.project.layerStack.get(body).assemblyPart.clearanceMM, 0.3);
  } finally {
    l.dispose();
  }
});

test("dry-run evaluates sources with provisional IDs and leaves native state, revision, SDF, masks, paint and redo intact", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const base = l.project.activeLayerId,
      volume = l.runtime(base).volume;
    const mask = sculptMask(volume),
      paint = sculptPaint(volume);
    mask.write(123, 0.75);
    paint.channels[0].write(123, 0.5);
    paint.channels[3].write(123, 0.8);
    const values = volume.getDenseView().slice(),
      masks = mask.snapshot(),
      colours = paint.snapshot();
    requireOK(await execute(api, { type: "object.rename", id: base, name: "Renamed" }));
    l.undo();
    const before = snapshot(l),
      revision = api.revision;
    const preview = requireOK(await batch(api, enclosureSteps, { dryRun: true }));
    assert(preview.dryRun);
    assert.deepEqual(
      preview.objects.find((o) => o.id === preview.aliases.body).dimensionsMM,
      [50, 20, 40],
    );
    assert.equal(api.revision, revision);
    assert.deepEqual(snapshot(l), before);
    assert.deepEqual(volume.getDenseView(), values);
    assert.deepEqual(mask.snapshot(), masks);
    assert.deepEqual(paint.snapshot(), colours);
    l.undo(true);
    assert.equal(l.project.activeLayer.name, "Renamed");
  } finally {
    l.dispose();
  }
});

for (const failure of [
  { type: "object.rename", id: "missing", name: "No" },
  { type: "primitive.create", unit: "yards", source: create.source },
  { type: "boolean.create", id: "$body", sourceId: "$body", operation: "difference" },
  { type: "object.rename", id: "$later", name: "No" },
  { type: "array.create", id: "$body", definition: { kind: "linear", count: 999999 } },
])
  test(`atomic rollback preserves redo and native bytes: ${JSON.stringify(failure)}`, async () => {
    const { layers: l, api } = createHeadlessEditor();
    try {
      const base = l.project.activeLayerId;
      requireOK(await execute(api, { type: "object.rename", id: base, name: "Redo target" }));
      l.undo();
      const before = snapshot(l);
      const r = await batch(api, [{ command: create, as: "body" }, { command: failure }]);
      assert(!r.ok);
      assert.deepEqual(snapshot(l), before);
      l.undo(true);
      assert.equal(l.project.activeLayer.name, "Redo target");
    } finally {
      l.dispose();
    }
  });

test("queries are detached, JSON compatible, read-only; bounds distinguish conservative estimates", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const id = requireOK(await execute(api, create)).id;
    const before = snapshot(l),
      revision = api.revision;
    for (const query of [
      { type: "scene.summary" },
      { type: "scene.hierarchy" },
      { type: "object.get", id },
      { type: "geometry.bounds", id },
      { type: "geometry.diagnostics", id },
      { type: "assembly.parts" },
    ]) {
      const r = requireOK(api.query(query));
      assert.deepEqual(JSON.parse(JSON.stringify(r)), r);
    }
    const bounds = requireOK(api.query({ type: "geometry.bounds", id }));
    assert.equal(bounds.accuracy, "conservative");
    assert.deepEqual(bounds.min, [-10, -10, -10]);
    assert.deepEqual(bounds.max, [10, 10, 10]);
    assert.equal(api.revision, revision);
    assert.deepEqual(snapshot(l), before);
  } finally {
    l.dispose();
  }
});

test("groups, parenting, duplication, flags and arrays use existing backend history", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const r = requireOK(
      await batch(api, [
        { command: create, as: "body" },
        { command: { type: "group.create", name: "Group" }, as: "group" },
        { command: { type: "object.parent", id: "$body", parentId: "$group" } },
        { command: { type: "object.duplicate", id: "$body" }, as: "copy" },
        {
          command: {
            type: "array.create",
            id: "$copy",
            definition: {
              kind: "linear",
              enabled: true,
              count: 3,
              axis: [1, 0, 0],
              spacingModelUnits: 30,
              centered: false,
            },
          },
        },
      ]),
    );
    assert.equal(
      requireOK(api.query({ type: "object.get", id: r.aliases.body })).parentId,
      r.aliases.group,
    );
    assert.equal(
      requireOK(api.query({ type: "array.get", id: r.aliases.copy })).spacingModelUnits,
      30,
    );
    for (const flag of ["locked", "visible"]) {
      const value = flag === "locked";
      requireOK(await execute(api, { type: "object.flag", id: r.aliases.group, flag, value }));
      assert.equal(
        (await execute(api, { type: "object.rename", id: r.aliases.body, name: "Blocked" })).error
          .code,
        "permission_denied",
      );
      requireOK(
        await execute(api, { type: "object.flag", id: r.aliases.group, flag, value: !value }),
      );
    }
  } finally {
    l.dispose();
  }
});

test("revision guards observe newer human edits and adapters; lease blocks edits, queries and autosave during batch", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const revision = api.revision,
      base = l.project.activeLayerId;
    l.renameNode(base, "Human edit");
    assert.equal(
      (await api.batch([{ command: create }], { expectedRevision: revision })).error.code,
      "revision_conflict",
    );
    const work = batch(api, [{ command: create }]);
    assert.equal(l.recoveryReady, false);
    assert.throws(() => l.renameNode(base, "Concurrent"), /transaction/);
    assert.equal(api.query({ type: "scene.summary" }).error.code, "busy");
    assert.equal((await execute(new ModellingAPI(l), create)).error.code, "busy");
    requireOK(await work);
    assert.equal(l.recoveryReady, true);
    assert.equal(l.project.layerStack.get(base).name, "Human edit");
  } finally {
    l.dispose();
  }
});

test("cancellation rolls back completed steps and retains redo", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const before = snapshot(l),
      controller = new AbortController();
    const work = batch(
      api,
      [
        { command: { type: "object.rename", id: l.project.activeLayerId, name: "Temporary" } },
        { command: create },
      ],
      { signal: controller.signal },
    );
    controller.abort();
    assert.equal((await work).error.code, "cancelled");
    assert.deepEqual(snapshot(l), before);
    assert.equal(l.modellingBusy, false);
    assert.equal(
      (await batch(api, [{ command: create }], { signal: controller.signal })).error.code,
      "cancelled",
    );
  } finally {
    l.dispose();
  }
});

test("invalid commands, aliases, units, policy and limits fail without edits", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const before = snapshot(l);
    for (const steps of [
      [],
      Array.from({ length: 65 }, () => ({ command: create })),
      [
        { command: create, as: "x" },
        { command: create, as: "x" },
      ],
      [{ command: { type: "remote.execute" } }],
      [{ command: { ...create, source: { ...create.source, width: Infinity } } }],
      [{ command: { type: "object.rename", id: "a", name: "x".repeat(66000) } }],
    ]) {
      assert.equal((await batch(api, steps)).ok, false);
      assert.deepEqual(snapshot(l), before);
    }
    assert.equal(
      (await batch(new ModellingAPI(l, () => false), [{ command: create }])).error.code,
      "permission_denied",
    );
    const full = await batch(
      api,
      Array.from({ length: 20 }, () => ({ command: create })),
    );
    assert(!full.ok);
    assert.match(full.error.message, /20 independent layers/);
    assert.deepEqual(snapshot(l), before);
  } finally {
    l.dispose();
  }
});

test("geometry diagnostics evaluate actual STL topology and sampled fit without edits", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const body = requireOK(await execute(api, create)).id;
    requireOK(await execute(api, { type: "part.define", objectId: body, clearanceMM: 0.3 }));
    const other = requireOK(await execute(api, create)).id;
    const before = snapshot(l),
      revision = api.revision;
    const d = requireOK(await api.diagnostics({ id: body, otherId: other }));
    assert.equal(d.topologyAccuracy, "exact_on_exported_mesh");
    assert.equal(d.fitAccuracy, "sampled_approximation");
    assert.deepEqual(d.print.dimensions, [20, 20, 20]);
    assert.equal(d.print.boundaryEdges, 0);
    assert.equal(d.print.nonManifoldEdges, 0);
    assert.equal(d.print.degenerateTriangles, 0);
    assert.equal(d.print.components, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(d)), d);
    assert.equal(api.revision, revision);
    assert.deepEqual(snapshot(l), before);
  } finally {
    l.dispose();
  }
});

test("primitive updates, Boolean edits, array updates/removal and explicit centimetres", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const { body, cutter } = requireOK(await batch(api, enclosureSteps)).aliases;
    const before = snapshot(l);
    const modifiers = requireOK(api.query({ type: "boolean.get", id: body }));
    requireOK(
      await batch(api, [
        {
          command: {
            type: "primitive.update",
            id: cutter,
            unit: "cm",
            source: { kind: "cylinder", diameter: 1.5, height: 3 },
          },
        },
        {
          command: {
            type: "boolean.update",
            id: body,
            modifiers: modifiers.map((m) => ({ ...m, enabled: false })),
          },
        },
        { command: { type: "boolean.remove", id: body, modifierId: modifiers[0].id } },
        {
          command: {
            type: "array.create",
            id: cutter,
            unit: "cm",
            definition: {
              kind: "linear",
              enabled: true,
              count: 2,
              axis: [1, 0, 0],
              spacingModelUnits: 3,
              centered: false,
            },
          },
        },
      ]),
    );
    const array = requireOK(api.query({ type: "array.get", id: cutter }));
    assert(Math.abs(array.spacingModelUnits - 30) < 1e-10);
    requireOK(
      await execute(api, {
        type: "array.update",
        id: cutter,
        unit: "mm",
        definition: { ...array, count: 3 },
      }),
    );
    requireOK(await execute(api, { type: "array.remove", id: cutter }));
    l.undo();
    l.undo();
    l.undo();
    assert.deepEqual(snapshot(l), before);
  } finally {
    l.dispose();
  }
});

test("explicit primitive Bake preserves original editable source and is one batch Undo", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const id = requireOK(await execute(api, create)).id,
      before = snapshot(l);
    const baked = requireOK(
      await batch(api, [{ command: { type: "primitive.bake", id }, as: "baked" }]),
    );
    assert.equal(l.project.layerStack.get(id).primitive.kind, "box");
    assert.equal(l.project.layerStack.get(baked.aliases.baked).primitive, undefined);
    l.undo();
    assert.deepEqual(snapshot(l), before);
    l.undo(true);
    assert.equal(l.project.layerStack.get(baked.aliases.baked).primitive, undefined);
  } finally {
    l.dispose();
  }
});

test("rollback after primitive regeneration, transforms, deletion and membership edits restores native bytes", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const { body, cutter } = requireOK(await batch(api, enclosureSteps)).aliases;
    const before = snapshot(l);
    const r = await batch(api, [
      {
        command: {
          type: "primitive.update",
          id: body,
          unit: "mm",
          source: { ...create.source, width: 35 },
        },
      },
      {
        command: {
          type: "object.transform",
          id: body,
          unit: "mm",
          transform: { position: [5, 3, 2], rotation: [0, 0.2, 0], scale: [1, 1, 1] },
        },
      },
      { command: { type: "boolean.update", id: body, modifiers: [] } },
      { command: { type: "part.assign", objectId: cutter, partId: null } },
      { command: { type: "object.delete", id: cutter } },
      { command: { type: "part.define", objectId: "missing", clearanceMM: 0.3 } },
    ]);
    assert(!r.ok);
    assert.deepEqual(snapshot(l), before);
  } finally {
    l.dispose();
  }
});

test("failed dry-run and stale dry-run cannot publish; cancellation during source preparation rolls back earlier changes", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const before = snapshot(l),
      revision = api.revision,
      base = l.project.activeLayerId;
    assert(
      !(
        await batch(
          api,
          [{ command: create }, { command: { type: "object.delete", id: "missing" } }],
          { dryRun: true },
        )
      ).ok,
    );
    assert.equal(api.revision, revision);
    assert.deepEqual(snapshot(l), before);
    const preview = batch(api, [{ command: create }], { dryRun: true });
    l.renameNode(base, "New human edit");
    assert.equal((await preview).error.code, "revision_conflict");
    const current = snapshot(l),
      controller = new AbortController();
    const work = batch(
      api,
      [{ command: { type: "object.rename", id: base, name: "Temporary" } }, { command: create }],
      { signal: controller.signal },
    );
    setTimeout(() => controller.abort(), 0);
    assert.equal((await work).error.code, "cancelled");
    assert.deepEqual(snapshot(l), current);
  } finally {
    l.dispose();
  }
});

test("failed batch preserves existing sculpt voxel redo as well as metadata redo", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    // Exercise the real sparse sculpt history without using an agent-specific field edit.
    const runtime = l.active;
    runtime.history.begin();
    const old = runtime.volume.readVoxel(0);
    runtime.history.record(0, old, old + 1);
    runtime.volume.writeVoxel(0, old + 1);
    runtime.history.commit();
    runtime.history.undo();
    assert(runtime.history.canRedo);
    assert(
      !(
        await batch(api, [
          { command: create },
          { command: { type: "object.delete", id: "missing" } },
        ])
      ).ok,
    );
    assert(runtime.history.canRedo);
    runtime.history.redo();
    assert.equal(runtime.volume.readVoxel(0), old + 1);
  } finally {
    l.dispose();
  }
});

test("committed deletion retains runtime for Undo even when older redo is discarded", async () => {
  const { layers: l, api } = createHeadlessEditor();
  try {
    const id = requireOK(await execute(api, create)).id;
    requireOK(await execute(api, { type: "object.rename", id, name: "Discarded redo" }));
    l.undo();
    const before = snapshot(l);
    requireOK(await batch(api, [{ command: { type: "object.delete", id } }]));
    l.undo();
    assert.deepEqual(snapshot(l), before);
    assert(l.runtime(id).triangles > 0);
    l.undo(true);
    assert.equal(api.query({ type: "object.get", id }).ok, false);
  } finally {
    l.dispose();
  }
});

for (const kind of ["boolean", "array"])
  test(`explicit ${kind} Bake in a batch uses existing evaluator and restores editable definitions`, async () => {
    const { layers: l, api } = createHeadlessEditor();
    try {
      const id = requireOK(await execute(api, create)).id;
      if (kind === "boolean") {
        const cutter = requireOK(
          await execute(api, { ...create, source: { kind: "cylinder", diameter: 8, height: 30 } }),
        ).id;
        requireOK(
          await execute(api, {
            type: "boolean.create",
            id,
            sourceId: cutter,
            operation: "difference",
          }),
        );
      } else {
        requireOK(
          await execute(api, {
            type: "array.create",
            id,
            unit: "mm",
            definition: {
              kind: "linear",
              enabled: true,
              count: 2,
              centered: false,
              spacingModelUnits: 30,
              axis: [1, 0, 0],
            },
          }),
        );
      }
      const before = snapshot(l);
      const r = requireOK(
        await batch(api, [{ command: { type: `${kind}.bake`, id }, as: "baked" }]),
      );
      assert(l.runtime(r.aliases.baked).triangles > 0);
      l.undo();
      assert.deepEqual(snapshot(l), before);
    } finally {
      l.dispose();
    }
  });

test("editor disposal during a batch returns a structured failure and releases ownership", async () => {
  const { layers, api } = createHeadlessEditor();
  const work = batch(api, [{ command: create }]);
  layers.dispose();
  const result = await work;
  assert.equal(result.ok, false);
  assert.equal(layers.modellingBusy, false);
});

test("calibration changes during async preparation reject the batch and retain human calibration", async () => {
  const { layers, api } = createHeadlessEditor();
  try {
    const work = batch(api, [{ command: create }]);
    layers.display.precision.millimetresPerUnit = 125;
    const result = await work;
    assert.equal(result.ok, false);
    assert.equal(result.error.code, "revision_conflict");
    assert.equal(layers.project.layerStack.layers.length, 1);
    assert.equal(layers.display.precision.millimetresPerUnit, 125);
  } finally {
    layers.dispose();
  }
});
