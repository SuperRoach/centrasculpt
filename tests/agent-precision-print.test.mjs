import assert from "node:assert/strict";
import test from "node:test";
import { validateCall } from "../scripts/agent-schemas.mjs";
import { createHeadlessEditor } from "../scripts/headless-enclosure.mjs";
import { agentExecutor } from "../work/test-build/agent-access.mjs";
import { ExportWork } from "../work/test-build/export-mesh.mjs";
import { evaluateMeshScope, inspectMeshTriangles } from "../work/test-build/mesh-inspection.mjs";
import {
  primitiveDistance,
  primitiveWorldBounds,
} from "../work/test-build/parametric-primitive.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { identityTransform } from "../work/test-build/transform.mjs";

const box = { kind: "box", width: 20, height: 10, depth: 20 };
const taper = {
  kind: "tapered-box",
  bottomWidth: 20,
  bottomDepth: 20,
  topWidth: 30,
  topDepth: 12,
  height: 10,
};
const create = (as, source) => ({ as, command: { type: "primitive.create", unit: "mm", source } });
const step = (type, fields) => ({ command: { type, ...fields } });
const move = (id, y) =>
  step("object.transform", {
    id,
    unit: "mm",
    transform: { ...identityTransform(), position: [0, y, 0] },
  });

test("a coloured, named and joined batch measures its final mesh and records a retry receipt", async () => {
  const { layers, api } = createHeadlessEditor();
  let editing = true;
  const execute = agentExecutor(
    layers,
    () => editing,
    () => false,
    () => {},
  );
  const call = (name, args, signal = new AbortController().signal) =>
    execute({ ...validateCall({ name, args }), id: "test", deadline: Date.now() + 10000 }, signal);
  const steps = [
    create("base", box),
    move("$base", 5),
    step("object.rename", { id: "$base", name: "Base tier" }),
    step("object.colour", { id: "$base", colour: "#ff9900" }),
    create("transition", taper),
    move("$transition", 14),
    step("object.colour", { id: "$transition", colour: "#2288ff" }),
    step("boolean.create", { id: "$base", sourceId: "$transition", operation: "union" }),
  ];
  const initial = layers.undoCount;
  const args = {
    expectedRevision: api.revision,
    steps,
    transactionId: "tier-job",
    measureBounds: "$base",
  };
  try {
    const result = await call("apply_changes", args);
    assert(result.ok, JSON.stringify(result));
    const { aliases, evaluatedBounds, objects } = result.value;
    assert.equal(result.value.transactionId, args.transactionId);
    assert.equal(evaluatedBounds.id, aliases.base);
    assert.equal(evaluatedBounds.accuracy, "evaluated_mesh");
    assert(Math.abs(evaluatedBounds.max[1] - 19) < 0.5);
    assert(Math.abs(evaluatedBounds.max[0] - 15) < 0.5);
    const base = objects.find((o) => o.id === aliases.base);
    assert.equal(base.name, "Base tier");
    assert.equal(base.colour, "#ff9900");
    assert.deepEqual(base.worldTransform.positionMM, [0, 5, 0]);
    assert.equal(layers.undoCount, initial + 1);

    // An interrupted caller can query the editor after access is approved again.
    editing = false;
    const status = await call("get_transaction", { transactionId: args.transactionId });
    assert.equal(status.value.status, "committed");
    assert.deepEqual(status.value.result, result);
    editing = true;
    assert.deepEqual(await call("apply_changes", args), result);
    assert.equal(
      (await call("apply_changes", { ...args, steps: steps.slice(0, 1) })).error.code,
      "invalid_input",
    );
    assert.equal(layers.undoCount, initial + 1);

    const broken = await call("apply_changes", {
      expectedRevision: api.revision,
      transactionId: "failed",
      steps: [step("object.colour", { id: aliases.base, colour: "#ffffff" })],
      measureBounds: "$absent",
    });
    assert.equal(broken.ok, false);
    assert.equal(
      (await call("get_transaction", { transactionId: "failed" })).value.status,
      "unknown",
    );
    assert.equal(api.objectMetadata(aliases.base).colour, "#ff9900");
    assert.equal(layers.undoCount, initial + 1);
    layers.undo();
    assert.equal(layers.undoCount, initial);
    assert.equal(layers.project.layerStack.layers.length, 1);
    layers.undo(true);
    assert.equal(api.objectMetadata(aliases.transition).colour, "#2288ff");

    const native = saveSculptProject(layers.project);
    assert.equal(new DataView(native).getUint32(8, true), 24);
    assert.equal(
      openSculptProject(native).layerStack.get(aliases.transition).primitive.kind,
      "tapered-box",
    );
    new DataView(native).setUint32(8, 21, true);
    assert.throws(() => openSculptProject(native), /Tapered boxes require project version 22/);
  } finally {
    layers.dispose();
  }
});

test("a tapered box has independent end dimensions and exact support under rotation", () => {
  const s = { ...taper, bottomWidth: 4, bottomDepth: 8, topWidth: 8, topDepth: 4, height: 4 };
  assert.equal(Math.abs(primitiveDistance(s, 3, 0, 0)), 0);
  assert.equal(Math.abs(primitiveDistance(s, 0, 0, 3)), 0);
  assert.equal(primitiveDistance(s, 0, 3, 0), 1);
  assert(primitiveDistance(s, 0, 0, 0) < 0);
  const bounds = primitiveWorldBounds(s, { ...identityTransform(), rotation: [0, 0, Math.PI / 4] });
  assert(Math.abs(bounds.max[0] - 4 * Math.SQRT1_2) < 1e-10);
  assert(Math.abs(bounds.min[0] + 6 * Math.SQRT1_2) < 1e-10);
});

test("print inspection sections the evaluated union and classifies overhangs in the chosen direction", async () => {
  const { layers, api } = createHeadlessEditor();
  try {
    const result = await api.batch(
      [
        create("base", box),
        move("$base", 5),
        create("ledge", { ...box, width: 30 }),
        move("$ledge", 14),
        step("boolean.create", { id: "$base", sourceId: "$ledge", operation: "union" }),
      ],
      { expectedRevision: api.revision },
    );
    assert(result.ok, JSON.stringify(result));
    const prepared = await evaluateMeshScope(layers, { objectId: result.value.aliases.base });
    try {
      const mm = layers.display.precision.millimetresPerUnit;
      const upright = await inspectMeshTriangles(
        prepared.sources,
        mm,
        { direction: [0, 2, 0], sectionOffsetMM: 14 },
        new ExportWork(),
      );
      assert.deepEqual(upright.report.direction, [0, 1, 0]);
      assert(upright.report.overhang.areaMM2 > 120, JSON.stringify(upright.report.overhang));
      assert(upright.report.section.segments > 0);
      for (const line of upright.report.section.sampleSegmentsMM) {
        assert(Math.abs(line[1] - 14) < 1e-8);
        assert(Math.abs(line[4] - 14) < 1e-8);
        for (const i of [0, 3]) assert(Math.abs(line[i]) > 14.4 || Math.abs(line[i + 2]) > 9.5);
      }
      const inverted = await inspectMeshTriangles(
        prepared.sources,
        mm,
        { direction: [0, -1, 0], sectionOffsetMM: -14 },
        new ExportWork(),
      );
      assert(
        inverted.report.overhang.areaMM2 < upright.report.overhang.areaMM2,
        JSON.stringify([inverted.report.overhang, upright.report.overhang]),
      );
      assert.equal(inverted.report.section.segments, upright.report.section.segments);
      assert.equal(api.revision, result.revision);
    } finally {
      prepared.dispose();
    }
  } finally {
    layers.dispose();
  }
});
