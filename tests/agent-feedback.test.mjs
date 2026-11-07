import assert from "node:assert/strict";
import test from "node:test";
import { PerspectiveCamera, Raycaster, Scene, Vector3 } from "three";
import { createHeadlessEditor } from "../scripts/headless-enclosure.mjs";
import { AgentProposals, agentExecutor } from "../work/test-build/agent-access.mjs";
import { AgentActivityHistory } from "../work/test-build/agent-activity.mjs";
import {
  AgentFeedback,
  agentVisibleBounds,
  frameAgentBounds,
} from "../work/test-build/agent-feedback.mjs";
import { saveSculptProject } from "../work/test-build/project.mjs";

const create = {
  type: "primitive.create",
  unit: "mm",
  source: { kind: "box", width: 20, height: 30, depth: 40 },
};
const signal = () => new AbortController().signal;
const job = (name, args = {}) => ({
  id: crypto.randomUUID(),
  name,
  args,
  deadline: Date.now() + 10000,
});
function fixture() {
  const { layers, api } = createHeadlessEditor(),
    entries = [],
    proposals = new AgentProposals();
  let current = layers,
    blocked = false;
  const run = agentExecutor(
    () => current,
    () => true,
    () => blocked,
    () => {},
    proposals,
    (entry) => entries.push(entry),
  );
  const call = (name, args = {}) =>
    run(job(name, { expectedRevision: api.revision, ...args }), signal());
  return {
    layers,
    api,
    entries,
    proposals,
    run,
    call,
    replace: (e) => {
      current = e;
    },
    block: () => {
      blocked = true;
    },
  };
}
test("committed agent create/transform/delete have accurate names and IDs; dry-run, reject, stale and failure never succeed", async () => {
  const f = fixture();
  try {
    assert((await f.call("dry_run_changes", { steps: [{ command: create }] })).ok);
    assert.equal(f.entries.length, 0);
    const made = await f.call("create_primitive", { unit: "mm", source: create.source });
    const id = made.value.results[0].id;
    assert.equal(f.entries.length, 1);
    assert.equal(f.entries[0].outcome, "committed");
    assert(f.entries[0].objects.some((o) => o.id === id && o.status === "created" && o.name));
    assert((await f.call("move_object", { id, unit: "mm", translation: [30, 0, 0] })).ok);
    assert(f.entries.at(-1).objects.some((o) => o.id === id && o.status === "modified"));
    const stale = await f.call("move_object", {
      id,
      unit: "mm",
      translation: [1, 0, 0],
      expectedRevision: "stale",
    });
    assert.equal(stale.ok, false);
    assert.equal(f.entries.at(-1).outcome, "failed");
    assert(f.entries.at(-1).objects.some((o) => o.id === id && o.status === "unchanged"));
    const count = f.entries.length;
    const staged = await f.call("propose_changes", {
      title: "Two objects",
      description: "Create two boxes",
      steps: [{ command: create }, { command: create }],
    });
    assert(staged.ok);
    f.proposals.invalidate();
    assert.equal(f.entries.length, count);
    assert.equal(
      (await f.call("apply_approved_proposal", { proposalId: staged.value.id })).ok,
      false,
    );
    assert.equal(f.entries.at(-1).outcome, "failed");
    assert((await f.call("object_delete", { id })).ok);
    assert(f.entries.at(-1).objects.some((o) => o.id === id && o.status === "deleted"));
    f.block();
    assert.equal(
      (await f.call("create_primitive", { unit: "mm", source: create.source })).error.code,
      "busy",
    );
    assert.equal(f.entries.at(-1).outcome, "failed");
  } finally {
    f.layers.dispose();
  }
});
test("approved multi-step proposal generates one committed activity and one Undo; presentation failure cannot change the result", async () => {
  const f = fixture();
  try {
    const before = f.layers.undoCount;
    const staged = await f.call("propose_changes", {
      title: "Body and cutter",
      description: "Subtract cylinder",
      steps: [
        { command: create, as: "body" },
        {
          command: {
            type: "primitive.create",
            unit: "mm",
            source: { kind: "cylinder", diameter: 10, height: 40 },
          },
          as: "hole",
        },
        {
          command: {
            type: "boolean.create",
            id: "$body",
            sourceId: "$hole",
            operation: "difference",
          },
        },
      ],
    });
    assert(staged.ok);
    assert.equal(f.entries.length, 0);
    assert(f.proposals.approve(f.layers, f.api.revision));
    assert((await f.call("apply_approved_proposal", { proposalId: staged.value.id })).ok);
    assert.equal(f.entries.length, 1);
    assert.equal(f.entries[0].description, "Body and cutter");
    assert.equal(f.entries[0].objects.filter((o) => o.status === "created").length, 2);
    assert.equal(f.layers.undoCount, before + 1);
    const broken = agentExecutor(
      f.layers,
      () => true,
      () => false,
      () => {
        throw new Error("UI refresh");
      },
      undefined,
      () => {
        throw new Error("Presentation");
      },
    );
    const result = await broken(
      job("create_primitive", {
        expectedRevision: f.api.revision,
        unit: "mm",
        source: create.source,
      }),
      signal(),
    );
    assert(result.ok);
    assert.equal(f.layers.undoCount, before + 2);
  } finally {
    f.layers.dispose();
  }
});
test("session history is detached, bounded to twenty and clears on editor lifetime changes/revocation", async () => {
  const f = fixture(),
    other = createHeadlessEditor();
  const history = new AgentActivityHistory();
  try {
    history.sync(f.layers);
    await f.call("create_primitive", { unit: "mm", source: create.source });
    for (let i = 0; i < 25; i++) history.add({ ...f.entries[0], id: String(i) });
    assert.equal(history.snapshot().length, 20);
    const copy = history.snapshot();
    copy[0].objects[0].name = "Changed";
    assert.notEqual(history.snapshot()[0].objects[0].name, "Changed");
    assert.equal(history.sync(f.layers), false);
    assert.equal(history.sync(other.layers), true);
    assert.deepEqual(history.snapshot(), []);
    history.add(f.entries[0]);
    history.clear();
    assert.deepEqual(history.snapshot(), []);
  } finally {
    f.layers.dispose();
    other.layers.dispose();
  }
});
test("two-second presentation-only pulse supports multiple objects, reduced motion, source edits and owner replacement", async () => {
  const f = fixture(),
    scene = new Scene(),
    other = createHeadlessEditor();
  let time = 0,
    reduced = false,
    blocked = false,
    current = f.layers;
  const feedback = new AgentFeedback(
    scene,
    () => current,
    () => blocked,
    () => reduced,
    () => {},
    () => time,
  );
  try {
    await f.call("apply_changes", { steps: [{ command: create }, { command: create }] });
    const before = saveSculptProject(f.layers.project),
      count = f.layers.undoCount,
      selected = f.layers.project.activeLayerId;
    feedback.highlight(f.entries[0]);
    assert.equal(feedback.group.children.length, 2);
    assert.equal(feedback.group.parent, scene);
    assert.deepEqual(new Raycaster().intersectObject(feedback.group, true), []);
    const first = feedback.group.children[0].material.opacity;
    time = 500;
    feedback.tick();
    assert.notEqual(feedback.group.children[0].material.opacity, first);
    reduced = true;
    time = 1000;
    feedback.tick();
    const fixed = feedback.group.children[0].material.opacity;
    time = 1500;
    feedback.tick();
    assert.equal(feedback.group.children[0].material.opacity, fixed);
    assert.deepEqual(saveSculptProject(f.layers.project), before);
    assert.equal(f.layers.undoCount, count);
    assert.equal(f.layers.project.activeLayerId, selected);
    time = 2001;
    assert.equal(feedback.tick(), false);
    assert.equal(feedback.group.children.length, 0);
    feedback.highlight({ ...f.entries[0], outcome: "failed" });
    assert.equal(feedback.group.children.length, 0);
    time = 3000;
    feedback.highlight(f.entries[0]);
    blocked = true;
    feedback.tick();
    assert.equal(feedback.group.visible, false);
    blocked = false;
    current = other.layers;
    assert.equal(feedback.tick(), false);
    assert.equal(feedback.group.children.length, 0);
  } finally {
    feedback.dispose();
    f.layers.dispose();
    other.layers.dispose();
  }
});
test("Show me frames visible affected objects, preserves bytes/history/selection and handles hidden/deleted/blocked targets", async () => {
  const f = fixture(),
    camera = new PerspectiveCamera(38, 1.5, 0.01, 100),
    scene = new Scene();
  const controls = { target: new Vector3(), minDistance: 1.2, maxDistance: 9, update: () => {} };
  camera.position.set(2.4, 1.7, 3.3);
  let blocked = false;
  const feedback = new AgentFeedback(
    scene,
    () => f.layers,
    () => blocked,
    () => false,
    (box) => frameAgentBounds(camera, controls, box),
  );
  try {
    const made = await f.call("create_primitive", { unit: "mm", source: create.source }),
      id = made.value.results[0].id;
    await f.call("move_object", { id, unit: "mm", translation: [130, 20, 0] });
    f.layers.group.position.set(1, 2, 3);
    f.layers.group.scale.setScalar(0.8);
    const before = saveSculptProject(f.layers.project),
      count = f.layers.undoCount,
      selected = f.layers.project.activeLayerId;
    const bounds = agentVisibleBounds(f.layers, [id]);
    assert(feedback.show([id]).ok);
    assert(camera.position.distanceTo(controls.target) > 0);
    assert.deepEqual(controls.target.toArray(), bounds.getCenter(new Vector3()).toArray());
    camera.updateMatrixWorld();
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const projected = new Vector3(x, y, z).project(camera);
          assert(
            Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 && Math.abs(projected.z) <= 1,
          );
        }
    assert.deepEqual(saveSculptProject(f.layers.project), before);
    assert.equal(f.layers.undoCount, count);
    assert.equal(f.layers.project.activeLayerId, selected);
    const position = camera.position.clone();
    blocked = true;
    assert.equal(feedback.show([id]).ok, false);
    assert(camera.position.equals(position));
    blocked = false;
    f.layers.setFlag(id, "visible", false);
    assert.equal(feedback.show([id]).ok, false);
    f.layers.setFlag(id, "visible", true);
    assert((await f.call("object_delete", { id })).ok);
    assert.equal(feedback.show([id]).ok, false);
    assert(camera.position.equals(position));
  } finally {
    feedback.dispose();
    f.layers.dispose();
  }
});

test("optional remembered editing choice stores only explicit UI intent, defaults off and tolerates blocked storage", async () => {
  const { AGENT_EDITING_PREFERENCE, readAgentEditingPreference, saveAgentEditingPreference } =
    await import("../work/test-build/agent-preferences.mjs");
  const map = new Map(),
    storage = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
    };
  assert.equal(readAgentEditingPreference(storage), undefined);
  assert(saveAgentEditingPreference(storage, true));
  assert.equal(readAgentEditingPreference(storage), true);
  assert.deepEqual([...map], [[AGENT_EDITING_PREFERENCE, "edit"]]);
  assert(saveAgentEditingPreference(storage, false));
  assert.equal(readAgentEditingPreference(storage), false);
  assert(saveAgentEditingPreference(storage, undefined));
  assert.equal(map.size, 0);
  map.set(AGENT_EDITING_PREFERENCE, '{"approved":true}');
  assert.equal(readAgentEditingPreference(storage), undefined);
  const denied = {
    getItem: () => {
      throw new Error("Blocked");
    },
    setItem: () => {
      throw new Error("Blocked");
    },
    removeItem: () => {
      throw new Error("Blocked");
    },
  };
  assert.equal(readAgentEditingPreference(denied), undefined);
  assert.equal(saveAgentEditingPreference(denied, true), false);
});
