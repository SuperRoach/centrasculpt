import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { startAgentBridge } from "../scripts/agent-bridge.mjs";
import { capabilityRegistry, tools, validateCall } from "../scripts/agent-schemas.mjs";
import { publishSession, readSession } from "../scripts/agent-session.mjs";
import { createHeadlessEditor } from "../scripts/headless-enclosure.mjs";
import { AgentProposals, agentExecutor } from "../work/test-build/agent-access.mjs";
import {
  MAX_PROJECT_LAYERS,
  openSculptProject,
  saveSculptProject,
} from "../work/test-build/project.mjs";

const source = { kind: "box", width: 20, height: 30, depth: 40 };
const create = { type: "primitive.create", unit: "mm", source };
const job = (name, args = {}) => ({ name, args, id: "test", deadline: Date.now() + 10000 });
const signal = () => new AbortController().signal;

test("20 layers round-trip natively and the twenty-first is refused without history changes", async () => {
  const { layers, api } = createHeadlessEditor();
  try {
    assert.equal(MAX_PROJECT_LAYERS, 20);
    while (layers.project.layerStack.layers.length < 19) layers.create(64);
    assert((await api.execute(create, { expectedRevision: api.revision })).ok);
    const native = saveSculptProject(layers.project);
    const opened = openSculptProject(native);
    assert.deepEqual(
      opened.layerStack.layers.map((l) => l.id),
      layers.project.layerStack.layers.map((l) => l.id),
    );
    const history = layers.undoCount;
    assert.throws(() => layers.create(64), /20 independent layers/);
    assert.equal(layers.undoCount, history);
    layers.undo();
    assert.equal(layers.project.layerStack.layers.length, 19);
    layers.undo(true);
    assert.equal(layers.project.layerStack.layers.length, 20);
  } finally {
    layers.dispose();
  }
});

test("move, rotate and scale preserve the other pose components, reject stale/read-only writes and Undo", async () => {
  const { layers, api } = createHeadlessEditor();
  let editing = true;
  const run = agentExecutor(
    layers,
    () => editing,
    () => false,
    () => {},
  );
  const call = (name, args) =>
    run(job(name, { ...args, expectedRevision: api.revision }), signal());
  try {
    const made = await call("create_primitive", { source, unit: "mm" });
    const id = made.value.results[0].id;
    const before = api.objectMetadata(id).worldTransform;
    assert((await call("move_object", { id, unit: "cm", translation: [1, 2, 3] })).ok);
    assert.deepEqual(api.objectMetadata(id).worldTransform.positionMM, [10, 20, 30]);
    assert((await call("rotate_object", { id, rotationDegrees: [0, 90, 0] })).ok);
    const pose = api.objectMetadata(id).worldTransform;
    assert.deepEqual(pose.positionMM, [10, 20, 30]);
    assert(Math.abs(pose.rotationRadians[1] - Math.PI / 2) < 1e-10);
    assert((await call("scale_object", { id, scale: [2, 2, 2] })).ok);
    assert.deepEqual(api.objectMetadata(id).worldTransform.scale, [2, 2, 2]);
    assert((await call("move_object", { id, unit: "in", mode: "set", translation: [1, 0, 0] })).ok);
    assert(Math.abs(api.objectMetadata(id).worldTransform.positionMM[0] - 25.4) < 1e-10);
    editing = false;
    assert.equal(
      (await call("rotate_object", { id, rotationDegrees: [0, 0, 90] })).error.code,
      "permission_denied",
    );
    editing = true;
    for (let i = 0; i < 4; i++) layers.undo();
    assert.deepEqual(api.objectMetadata(id).worldTransform, before);
    assert.equal(
      validateCall({
        name: "rotate_object",
        args: { id, expectedRevision: api.revision, rotationDegrees: [0, 0, 90] },
      }).args.mode,
      "by",
    );
  } finally {
    layers.dispose();
  }
});

test("stable discovery rotates temporary credentials and old cleanup never deletes a newer session", async () => {
  const directory = await mkdtemp(join(tmpdir(), "centra-discovery-test-"));
  const pointer = join(directory, "pointer.json"),
    first = join(directory, "first.json"),
    next = join(directory, "next.json");
  try {
    await writeFile(first, JSON.stringify({ url: "http://127.0.0.1:1234", token: "first" }));
    await writeFile(next, JSON.stringify({ url: "http://127.0.0.1:1235", token: "next" }));
    const cleanup = await publishSession(first, pointer);
    assert.equal((await readSession(undefined, pointer)).token, "first");
    const cleanupNext = await publishSession(next, pointer);
    await cleanup();
    assert.equal((await readSession(undefined, pointer)).token, "next");
    assert.equal((await stat(pointer)).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(await readFile(pointer, "utf8")), { sessionFile: next });
    await cleanupNext();
    await assert.rejects(readSession(undefined, pointer));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("agent adapter uses authoritative IDs, dimensions, transaction preview, save/load and Undo", async () => {
  const { layers, api } = createHeadlessEditor();
  let editing = false,
    blocked = false;
  const run = agentExecutor(
    layers,
    () => editing,
    () => blocked,
    () => {},
  );
  const before = Buffer.from(saveSculptProject(layers.project));
  try {
    assert.equal((await run(job("scene_summary"), signal())).value.objects, 1);
    const args = { unit: "mm", source, expectedRevision: api.revision };
    assert.equal(
      (await run(job("create_primitive", args), signal())).error.code,
      "permission_denied",
    );
    editing = true;
    const preview = await run(
      job("preview_changes", { steps: [{ command: create }], expectedRevision: api.revision }),
      signal(),
    );
    assert(preview.ok);
    assert.deepEqual(Buffer.from(saveSculptProject(layers.project)), before);
    const result = await run(job("create_primitive", args), signal());
    assert(result.ok, JSON.stringify(result));
    const id = result.value.results[0].id;
    assert.deepEqual(
      (await run(job("get_object", { id }), signal())).value.dimensionsMM,
      [20, 30, 40],
    );
    assert.equal(
      (await run(job("create_primitive", args), signal())).error.code,
      "revision_conflict",
    );
    blocked = true;
    assert.equal((await run(job("scene_summary"), signal())).error.code, "busy");
    blocked = false;
    const lease = layers.acquireModellingLease();
    assert.equal((await run(job("scene_summary"), signal())).error.code, "busy");
    layers.releaseModellingLease(lease);
    assert.equal((await run(job("scene_summary"), AbortSignal.abort())).error.code, "cancelled");
    assert.equal(
      (await run({ ...job("scene_summary"), deadline: 0 }, signal())).error.code,
      "cancelled",
    );
    assert((await run(job("undo", { expectedRevision: api.revision }), signal())).ok);
    assert.deepEqual(Buffer.from(saveSculptProject(layers.project)), before);
    assert(
      (await api.execute(create, { expectedRevision: api.revision })).ok,
      "ordinary editor still works",
    );
  } finally {
    layers.dispose();
  }
});

test("MCP schemas reject malformed/unsupported payloads and preserve explicit units", () => {
  for (const value of [
    {},
    { name: "save_project", args: {} },
    { name: "scene_summary", args: { extra: true } },
    { name: "create_primitive", args: { source, unit: "yards", expectedRevision: "r" } },
    {
      name: "create_primitive",
      args: { source: { ...source, width: Infinity }, unit: "mm", expectedRevision: "r" },
    },
    {
      name: "apply_changes",
      args: {
        steps: [{ command: { type: "connector.create", options: {} } }],
        expectedRevision: "r",
      },
    },
  ])
    assert.throws(() => validateCall(value));
  assert.equal(
    validateCall({ name: "create_primitive", args: { source, unit: "mm", expectedRevision: "r" } })
      .args.unit,
    "mm",
  );
  assert(!Object.hasOwn(tools, "save_project"));
});

test("agent batches roll back cancelled generation and retain locks, visibility and one logical Undo", async () => {
  const { layers, api } = createHeadlessEditor();
  const run = agentExecutor(
    layers,
    () => true,
    () => false,
    () => {},
  );
  try {
    const initial = Buffer.from(saveSculptProject(layers.project));
    const controller = new AbortController();
    const generate = layers.regeneratePrimitive.bind(layers);
    layers.regeneratePrimitive = async (...args) => {
      const value = await generate(...args);
      controller.abort();
      return value;
    };
    const cancelled = await run(
      job("create_primitive", { source, unit: "mm", expectedRevision: api.revision }),
      controller.signal,
    );
    assert.equal(cancelled.error.code, "cancelled");
    assert.deepEqual(Buffer.from(saveSculptProject(layers.project)), initial);
    layers.regeneratePrimitive = generate;
    const made = await run(
      job("apply_changes", {
        expectedRevision: api.revision,
        steps: [
          { command: create, as: "first" },
          { command: { ...create, source: { kind: "sphere", diameter: 20 } } },
        ],
      }),
      signal(),
    );
    assert(made.ok, JSON.stringify(made));
    const id = made.value.aliases.first;
    assert.equal(layers.project.layerStack.layers.length, 3);
    layers.undo();
    assert.deepEqual(Buffer.from(saveSculptProject(layers.project)), initial);
    layers.undo(true);
    for (const flag of ["locked", "visible"]) {
      const flagResult = await api.execute(
        { type: "object.flag", id, flag, value: flag === "locked" },
        { expectedRevision: api.revision },
      );
      assert(flagResult.ok, JSON.stringify(flagResult));
      const before = Buffer.from(saveSculptProject(layers.project));
      const denied = await run(
        job("update_primitive", { id, source, unit: "mm", expectedRevision: api.revision }),
        signal(),
      );
      assert.equal(denied.error.code, "permission_denied");
      assert.deepEqual(Buffer.from(saveSculptProject(layers.project)), before);
      assert(
        (
          await api.execute(
            { type: "object.flag", id, flag, value: flag !== "locked" },
            { expectedRevision: api.revision },
          )
        ).ok,
      );
    }
  } finally {
    layers.dispose();
  }
});

test("agent adapter follows the current editor after native project replacement", async () => {
  const first = createHeadlessEditor(),
    second = createHeadlessEditor();
  let current = first.layers;
  const run = agentExecutor(
    () => current,
    () => true,
    () => false,
    () => {},
  );
  try {
    const original = await run(job("scene_summary"), signal());
    assert.equal(original.value.projectId, first.layers.project.id);
    first.layers.dispose();
    current = second.layers;
    const next = await run(job("scene_summary"), signal());
    assert.equal(next.value.projectId, second.layers.project.id);
    assert.equal(
      (
        await run(
          job("create_primitive", { source, unit: "mm", expectedRevision: original.revision }),
          signal(),
        )
      ).error.code,
      "revision_conflict",
    );
    assert(
      (
        await run(
          job("create_primitive", { source, unit: "mm", expectedRevision: next.revision }),
          signal(),
        )
      ).ok,
    );
    assert.equal(second.layers.project.layerStack.layers.length, 2);
  } finally {
    second.layers.dispose();
  }
});

const post = (bridge, path, data, browser = false, overrides = {}) =>
  fetch(bridge.url + path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${browser ? bridge.browserToken : bridge.token}`,
      Origin: "http://127.0.0.1:5173",
      "Content-Type": "application/json",
      ...overrides,
    },
    body: JSON.stringify(data),
  });
const pollJob = async (bridge) => {
  for (let i = 0; i < 100; i++) {
    const result = await (await post(bridge, "/poll", { client: "editor" }, true)).json();
    if (result.job) return result.job;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("No bridge job delivered");
};

test("loopback bridge rejects disabled, authentication, origin, malformed, read-only, oversized and conflicting editors", async () => {
  const bridge = await startAgentBridge();
  try {
    assert.equal((await stat(bridge.sessionFile)).mode & 0o777, 0o600);
    assert(!JSON.parse(await readFile(bridge.sessionFile, "utf8")).browserToken);
    const call = { name: "scene_summary", args: {} };
    assert.equal((await post(bridge, "/call", call)).status, 403);
    assert.equal(
      (await post(bridge, "/call", call, false, { Authorization: "Bearer invalid" })).status,
      401,
    );
    assert.equal(
      (await post(bridge, "/call", call, false, { Origin: "https://evil.example" })).status,
      403,
    );
    assert.equal((await post(bridge, "/call", { name: "unsupported", args: {} })).status, 400);
    assert.equal((await post(bridge, "/call", { data: "a".repeat(65537) })).status, 413);
    await post(bridge, "/approve", { client: "editor" }, true);
    assert.equal((await post(bridge, "/approve", { client: "other" }, true)).status, 409);
    assert.equal(
      (
        await post(bridge, "/call", {
          name: "create_primitive",
          args: { source, unit: "mm", expectedRevision: "r" },
        })
      ).status,
      403,
    );
    const pending = post(bridge, "/call", call);
    await pollJob(bridge);
    assert.equal((await post(bridge, "/call", call)).status, 409);
    await post(bridge, "/revoke", { client: "editor" }, true);
    assert.equal((await (await pending).json()).ok, false);
    assert.equal(
      (
        await post(
          bridge,
          "/result",
          { client: "editor", id: "expired", result: { ok: true } },
          true,
        )
      ).status,
      403,
    );
  } finally {
    await bridge.close();
  }
  await assert.rejects(readFile(bridge.sessionFile));
  await assert.rejects(fetch(bridge.url));
});

test("official stdio MCP process drives the active authoritative editor and shutdown revokes access", async () => {
  const bridge = await startAgentBridge();
  const { layers, api } = createHeadlessEditor();
  const execute = agentExecutor(
    layers,
    () => true,
    () => false,
    () => {},
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve("scripts/agent-mcp.mjs"), bridge.sessionFile],
    stderr: "pipe",
  });
  const client = new Client({ name: "centra-test", version: "1" });
  try {
    await client.connect(transport);
    const listed = (await client.listTools()).tools;
    assert.equal(listed.length, Object.keys(tools).length);
    assert.deepEqual(
      listed.map((tool) => tool.name).sort(),
      Object.keys(tools).sort(),
      "official stdio tools/list matches executable adapter registrations",
    );
    for (const name of [
      "propose_changes",
      "propose_enclosure",
      "apply_approved_proposal",
      "transform_object",
      "update_primitive",
      "scale_primitive",
      "boolean_create",
      "array_create",
      "preview_changes",
      "apply_changes",
      "get_bounds",
      "get_geometry_diagnostics",
      "capture_scene_preview",
    ]) {
      const listedTool = listed.find((tool) => tool.name === name);
      assert(listedTool?.description, `${name} is described in official tools/list`);
      assert(listedTool.inputSchema?.type === "object", `${name} publishes its schema`);
    }
    const previewSchema = listed.find((tool) => tool.name === "capture_scene_preview").inputSchema;
    assert(previewSchema.properties.objectId);
    assert(previewSchema.properties.partId);
    assert((await client.callTool({ name: "scene_summary", arguments: {} })).isError);
    await post(bridge, "/approve", { client: "editor", editing: true }, true);
    async function call(name, args) {
      const result = client.callTool({ name, arguments: args });
      const work = await pollJob(bridge);
      await post(
        bridge,
        "/result",
        { client: "editor", id: work.id, result: await execute(work, signal()) },
        true,
      );
      return (await result).structuredContent;
    }
    const summary = await call("scene_summary", {});
    assert.equal(summary.value.projectId, layers.project.id);
    const capabilities = await call("get_capabilities", {});
    assert.deepEqual(capabilities.value.tools.sort(), Object.keys(tools).sort());
    assert.deepEqual(capabilities.value.featureAvailability, capabilityRegistry);
    assert.equal(
      capabilities.value.featureAvailability.scenePreview.scopes.includes("object-hierarchy"),
      true,
    );
    assert.equal(capabilities.value.adapter.sessionId.length > 0, true);
    assert.equal(capabilities.value.adapter.buildVersion.length > 0, true);
    const made = await call("create_primitive", {
      expectedRevision: summary.revision,
      source,
      unit: "mm",
    });
    assert(made.ok, JSON.stringify(made));
    const id = made.value.results[0].id;
    assert.equal(layers.project.layerStack.get(id).primitive.kind, "box");
    assert.deepEqual((await call("get_object", { id })).value.dimensionsMM, [20, 30, 40]);
    assert((await call("undo", { expectedRevision: api.revision })).ok);
    assert.equal(layers.project.layerStack.layers.length, 1);
    await client.close();
    assert.equal((await post(bridge, "/call", { name: "scene_summary", args: {} })).status, 403);
    assert((await api.execute(create, { expectedRevision: api.revision })).ok);
  } finally {
    await client.close();
    await bridge.close();
    layers.dispose();
  }
});

test("bridge timeout and shutdown settle pending calls and refuse late results", async () => {
  const bridge = await startAgentBridge({ timeout: 100 });
  try {
    await post(bridge, "/approve", { client: "editor" }, true);
    const result = post(bridge, "/call", { name: "scene_summary", args: {} });
    const work = await pollJob(bridge);
    assert.match((await (await result).json()).error.message, /timed out/);
    assert.equal(
      (await post(bridge, "/result", { client: "editor", id: work.id, result: {} }, true)).status,
      403,
    );
  } finally {
    await bridge.close();
  }
});

test("expanded schemas and executor preserve editable stacks, arrays, hierarchy and recipes", async () => {
  const { layers, api } = createHeadlessEditor();
  const run = agentExecutor(
    layers,
    () => true,
    () => false,
    () => {},
  );
  const call = async (name, fields = {}) => {
    const args = validateCall({
      name,
      args: {
        ...fields,
        ...(tools[name].schema.shape.expectedRevision ? { expectedRevision: api.revision } : {}),
      },
    }).args;
    const result = await run(job(name, args), signal());
    assert(result.ok, JSON.stringify(result));
    return result.value;
  };
  try {
    const a = (await call("create_primitive", { unit: "mm", source })).results[0].id;
    const b = (
      await call("create_primitive", {
        unit: "mm",
        source: { kind: "cylinder", diameter: 8, height: 40 },
      })
    ).results[0].id;
    await call("boolean_create", { id: a, sourceId: b, operation: "difference" });
    await call("boolean_create", { id: a, sourceId: b, operation: "union" });
    const stack = await call("get_booleans", { id: a });
    await call("boolean_update", {
      id: a,
      modifiers: stack.reverse().map((m, i) => ({ ...m, enabled: i !== 0 })),
    });
    assert.equal((await call("get_booleans", { id: a }))[0].enabled, false);
    await call("boolean_remove", { id: a, modifierId: stack[0].id });
    for (const definition of [
      {
        kind: "linear",
        enabled: true,
        count: 3,
        axis: [1, 0, 0],
        spacingModelUnits: 30,
        centered: false,
        scalePerItem: 0.9,
      },
      {
        kind: "radial",
        enabled: true,
        count: 3,
        axis: [0, 1, 0],
        pivot: [30, 0, 0],
        totalAngleRadians: 2 * Math.PI,
        angularOffsetRadians: 0,
        orientation: "rotate",
        scalePerItem: 0.9,
      },
    ]) {
      await call("array_create", { id: b, unit: "mm", definition });
      const current = await call("get_array", { id: b });
      await call("array_update", { id: b, unit: "mm", definition: { ...current, count: 2 } });
      assert.equal((await call("get_array", { id: b })).count, 2);
      await call("array_remove", { id: b });
    }
    const group = (await call("group_create", { name: "Assembly" })).results[0].id;
    await call("object_parent", { id: a, parentId: group });
    await call("object_rename", { id: a, name: "Body" });
    await call("object_duplicate", { id: b });
    const cycle = await run(
      job("object_parent", { id: group, parentId: a, expectedRevision: api.revision }),
      signal(),
    );
    assert.equal(cycle.ok, false);
    await call("part_define", { objectId: a, clearanceMM: 0.3 });
    await call("part_assign", { objectId: b, partId: a });
    const other = (await call("create_primitive", { unit: "mm", source })).results[0].id;
    await call("part_define", { objectId: other, clearanceMM: 0.3 });
    await call("part_mate", {
      options: { moving: other, target: a, mode: "faces", axis: "x", offsetMM: 1 },
    });
    const fit = await call("inspect_parts", { partA: a, partB: other });
    assert.equal(fit.fitAccuracy, "sampled_approximation");
    assert.equal(fit.fit.nominalClearanceMM, 0.3);
    await call("create_connector", {
      options: {
        pegPart: a,
        socketPart: other,
        pegDiameterMM: 4,
        pegLengthMM: 5,
        socketDiameterMM: 4.6,
        socketDepthMM: 6,
        radialClearanceMM: 0.3,
        positionMM: [0, 0, 0],
        rotationRadians: [0, 0, 0],
      },
    });
    const parameters = {
      units: "mm",
      name: "Case",
      innerWidthMm: 24,
      innerDepthMm: 20,
      innerHeightMm: 14,
      wallThicknessMm: 3,
      floorThicknessMm: 3,
      cornerRadiusMm: 4,
      lid: { type: "friction-fit", clearanceMm: 0.3, lipDepthMm: 4, thicknessMm: 3 },
    };
    const enclosure = await call("create_enclosure", { parameters });
    const { base: baseId, lid: lidId } = enclosure.partIds;
    await call("update_enclosure", {
      baseId,
      lidId,
      parameters: { ...parameters, innerWidthMm: 26 },
    });
    assert(await call("inspect_enclosure", { baseId, lidId }));
  } finally {
    layers.dispose();
  }
});

test("proposals stage without native/history changes, require browser consent, apply once and undo once", async () => {
  const { layers, api } = createHeadlessEditor();
  let editing = true;
  const proposals = new AgentProposals();
  const run = agentExecutor(
    layers,
    () => editing,
    () => false,
    () => {},
    proposals,
  );
  const call = (name, args) => run(job(name, args), signal());
  try {
    const before = saveSculptProject(layers.project);
    const history = layers.undoCount;
    const selected = layers.project.activeLayerId;
    const args = {
      expectedRevision: api.revision,
      title: "Hollow body",
      description: "Create two boxes and subtract the second.",
      steps: [
        { command: create, as: "body" },
        { command: { ...create, source: { ...source, width: 10 } }, as: "cutter" },
        {
          command: {
            type: "boolean.create",
            id: "$body",
            sourceId: "$cutter",
            operation: "difference",
          },
        },
      ],
    };
    const staged = await call("propose_changes", args);
    assert(staged.ok, JSON.stringify(staged));
    const proposalId = staged.value.id;
    args.steps.length = 0;
    assert.equal(proposals.current.steps.length, 3);
    assert.deepEqual(saveSculptProject(layers.project), before);
    assert.equal(layers.undoCount, history);
    assert.equal(
      (await call("apply_approved_proposal", { proposalId })).error.code,
      "permission_denied",
    );
    assert(proposals.approve(layers, api.revision));
    assert.equal(proposals.approve(layers, api.revision), false);
    editing = false;
    assert.equal(
      (await call("apply_approved_proposal", { proposalId })).error.code,
      "permission_denied",
    );
    editing = true;
    const applied = await call("apply_approved_proposal", { proposalId });
    assert(applied.ok, JSON.stringify(applied));
    assert.equal(layers.undoCount, history + 1);
    assert.equal(layers.project.activeLayerId, selected);
    assert.equal((await call("get_proposal", { proposalId })).value.state, "applied");
    assert.equal((await call("apply_approved_proposal", { proposalId })).ok, false);
    layers.undo();
    assert.deepEqual(saveSculptProject(layers.project), before);
  } finally {
    layers.dispose();
  }
});

test("proposals reject cancellation, stale revision, expiry, editor replacement and invalid schemas", async () => {
  const first = createHeadlessEditor(),
    second = createHeadlessEditor();
  let current = first.layers;
  const proposals = new AgentProposals();
  const run = agentExecutor(
    () => current,
    () => true,
    () => false,
    () => {},
    proposals,
  );
  const propose = () =>
    run(
      job("propose_changes", {
        expectedRevision: first.api.revision,
        title: "Box",
        description: "One box",
        steps: [{ command: create }],
      }),
      signal(),
    );
  try {
    let staged = await propose();
    assert(staged.ok);
    proposals.invalidate();
    assert.equal(proposals.approve(current, first.api.revision), false);
    assert.equal(
      (await run(job("apply_approved_proposal", { proposalId: staged.value.id }), signal())).ok,
      false,
    );
    staged = await propose();
    assert(staged.ok);
    proposals.current.expiresAt = 0;
    assert.equal(proposals.approve(current, first.api.revision), false);
    assert.equal(
      (await run(job("get_proposal", { proposalId: staged.value.id }), signal())).error.code,
      "revision_conflict",
    );
    staged = await propose();
    assert(staged.ok);
    await first.api.execute(create, { expectedRevision: first.api.revision });
    assert.equal(proposals.approve(current, first.api.revision), false);
    assert.equal(
      (await run(job("apply_approved_proposal", { proposalId: staged.value.id }), signal())).error
        .code,
      "revision_conflict",
    );
    staged = await propose();
    assert(staged.ok);
    current = second.layers;
    assert.equal(proposals.approve(current, second.api.revision), false);
    assert.equal(
      (await run(job("get_proposal", { proposalId: staged.value.id }), signal())).error.code,
      "revision_conflict",
    );
    assert.throws(() =>
      validateCall({
        name: "propose_changes",
        args: { expectedRevision: "x", title: "x", description: "x", steps: [], approved: true },
      }),
    );
    assert.throws(() => validateCall({ name: "approve_proposal", args: {} }));
  } finally {
    first.layers.dispose();
    second.layers.dispose();
  }
});

test("proposal staging failures after partial work retain bytes; locked/hidden, busy and cancellation refuse safely", async () => {
  const { layers, api } = createHeadlessEditor();
  const proposals = new AgentProposals();
  let busy = false,
    editing = true;
  const run = agentExecutor(
    layers,
    () => editing,
    () => busy,
    () => {},
    proposals,
  );
  const make = (steps, sig = signal()) =>
    run(
      job("propose_changes", {
        expectedRevision: api.revision,
        title: "Safety test",
        description: "Partial staging must roll back",
        steps,
      }),
      sig,
    );
  try {
    const original = saveSculptProject(layers.project),
      count = layers.undoCount;
    const failed = await make([
      { command: create, as: "first" },
      { command: { type: "object.delete", id: "missing" } },
    ]);
    assert.equal(failed.ok, false);
    assert.deepEqual(saveSculptProject(layers.project), original);
    assert.equal(layers.undoCount, count);
    assert.equal(proposals.current.state, "rejected/error");
    busy = true;
    assert.equal((await make([{ command: create }])).error.code, "busy");
    busy = false;
    editing = false;
    assert.equal((await make([{ command: create }])).error.code, "permission_denied");
    editing = true;
    const made = await api.execute(create, { expectedRevision: api.revision });
    const id = made.value.id;
    for (const flag of ["locked", "visible"]) {
      await api.execute(
        { type: "object.flag", id, flag, value: flag === "locked" },
        { expectedRevision: api.revision },
      );
      const before = saveSculptProject(layers.project);
      const denied = await make([{ command: { type: "object.rename", id, name: "Refused" } }]);
      assert.equal(denied.error.code, "permission_denied");
      assert.deepEqual(saveSculptProject(layers.project), before);
      await api.execute(
        { type: "object.flag", id, flag, value: flag !== "locked" },
        { expectedRevision: api.revision },
      );
    }
    const before = saveSculptProject(layers.project),
      history = layers.undoCount;
    const controller = new AbortController();
    const pending = make(
      [{ command: { ...create, source: { kind: "sphere", diameter: 60 } } }],
      controller.signal,
    );
    proposals.invalidate();
    controller.abort();
    assert.equal((await pending).ok, false);
    assert.deepEqual(saveSculptProject(layers.project), before);
    assert.equal(layers.undoCount, history);
  } finally {
    layers.dispose();
  }
});

test("standalone enclosure proposals stage and apply the retained recipe in one Undo, then revalidate updates", async () => {
  const { layers, api } = createHeadlessEditor();
  const proposals = new AgentProposals();
  const run = agentExecutor(
    layers,
    () => true,
    () => false,
    () => {},
    proposals,
  );
  const call = (name, args) => run(job(name, args), signal());
  const parameters = {
    units: "mm",
    name: "Approved enclosure",
    innerWidthMm: 24,
    innerDepthMm: 20,
    innerHeightMm: 14,
    wallThicknessMm: 3,
    floorThicknessMm: 3,
    cornerRadiusMm: 4,
    lid: { type: "friction-fit", clearanceMm: 0.3, lipDepthMm: 4, thicknessMm: 3 },
  };
  try {
    const before = saveSculptProject(layers.project),
      count = layers.undoCount;
    const stage = await call(
      "propose_enclosure",
      validateCall({
        name: "propose_enclosure",
        args: {
          expectedRevision: api.revision,
          title: "Enclosure",
          description: "Create a removable friction-fit lid",
          recipe: { type: "create", parameters },
        },
      }).args,
    );
    assert(stage.ok, JSON.stringify(stage));
    assert.equal(stage.value.preview.value.changes.created.length, 5);
    assert.deepEqual(saveSculptProject(layers.project), before);
    assert.equal(layers.undoCount, count);
    assert(proposals.approve(layers, api.revision));
    const made = await call("apply_approved_proposal", { proposalId: stage.value.id });
    assert(made.ok, JSON.stringify(made));
    assert.equal(layers.undoCount, count + 1);
    assert.equal(made.value.inspection.length, 5);
    const { base, lid } = made.value.partIds;
    const stagedUpdate = await call("propose_enclosure", {
      expectedRevision: api.revision,
      title: "Resize enclosure",
      description: "Increase the inside width by two millimetres",
      recipe: {
        type: "update",
        baseId: base,
        lidId: lid,
        parameters: { ...parameters, innerWidthMm: 26 },
      },
    });
    assert(stagedUpdate.ok, JSON.stringify(stagedUpdate));
    assert.equal(proposals.current.state, "awaiting approval");
    assert(proposals.approve(layers, api.revision));
    const updated = await call("apply_approved_proposal", { proposalId: stagedUpdate.value.id });
    assert(updated.ok, JSON.stringify(updated));
    assert.equal(layers.undoCount, count + 2);
    layers.undo();
    layers.undo();
    assert.deepEqual(saveSculptProject(layers.project), before);
    assert.throws(() =>
      validateCall({
        name: "propose_changes",
        args: {
          expectedRevision: api.revision,
          title: "No nesting",
          description: "Recipe cannot nest",
          steps: [{ command: { type: "enclosure.create", parameters } }],
        },
      }),
    );
  } finally {
    layers.dispose();
  }
});

test("agents create tapered cylinders, scale source dimensions independently and retain legacy cylinders", async () => {
  const { layers, api } = createHeadlessEditor();
  const run = agentExecutor(
    layers,
    () => true,
    () => false,
    () => {},
  );
  const call = (name, args) => {
    const parsed = validateCall({ name, args: { ...args, expectedRevision: api.revision } });
    return run(job(parsed.name, parsed.args), signal());
  };
  try {
    const made = await call("create_primitive", {
      unit: "mm",
      source: { kind: "cylinder", topDiameter: 10, bottomDiameter: 20, height: 30 },
    });
    assert(made.ok, JSON.stringify(made));
    const id = made.value.results[0].id;
    let object = api.objectMetadata(id);
    assert.equal(object.primitive.topDiameter, 10);
    assert.equal(object.primitive.bottomDiameter, 20);
    const pose = object.worldTransform;
    const scaled = await call("scale_primitive", { id, factors: [2, 0.5, 2] });
    assert(scaled.ok, JSON.stringify(scaled));
    object = api.objectMetadata(id);
    assert.equal(object.primitive.topDiameter, 20);
    assert.equal(object.primitive.bottomDiameter, 40);
    assert.equal(object.primitive.height, 15);
    assert.deepEqual(object.worldTransform, pose);
    assert.equal(
      (await call("scale_primitive", { id, factors: [2, 1, 3] })).error.code,
      "unsupported",
    );
    const boxResult = await call("create_primitive", { unit: "mm", source });
    const boxId = boxResult.value.results[0].id;
    assert((await call("scale_primitive", { id: boxId, factors: [2, 1, 0.5] })).ok);
    assert.deepEqual(api.objectMetadata(boxId).dimensionsMM, [40, 30, 20]);
    layers.undo();
    assert.deepEqual(api.objectMetadata(boxId).dimensionsMM, [20, 30, 40]);
    assert.throws(() =>
      validateCall({
        name: "create_primitive",
        args: {
          expectedRevision: api.revision,
          unit: "mm",
          source: { kind: "cylinder", topDiameter: 10, height: 20 },
        },
      }),
    );
  } finally {
    layers.dispose();
  }
});

test("agents create and stretch ellipsoids without affine scale, with preview/commit and Undo", async () => {
  const { layers, api } = createHeadlessEditor();
  const run = agentExecutor(
    layers,
    () => true,
    () => false,
    () => {},
  );
  const call = (name, args) => {
    const v = validateCall({ name, args: { ...args, expectedRevision: api.revision } });
    return run(job(v.name, v.args), signal());
  };
  try {
    const made = await call("create_primitive", {
      unit: "mm",
      source: { kind: "sphere", width: 40, height: 20, depth: 10 },
    });
    assert(made.ok, JSON.stringify(made));
    const id = made.value.results[0].id;
    assert.deepEqual(api.objectMetadata(id).dimensionsMM, [40, 20, 10]);
    const pose = api.objectMetadata(id).worldTransform;
    const scaled = await call("scale_primitive", { id, factors: [1.5, 1, 2] });
    assert(scaled.ok, JSON.stringify(scaled));
    assert.deepEqual(api.objectMetadata(id).dimensionsMM, [60, 20, 20]);
    assert.deepEqual(api.objectMetadata(id).worldTransform, pose);
    layers.undo();
    assert.deepEqual(api.objectMetadata(id).dimensionsMM, [40, 20, 10]);
    const bytes = saveSculptProject(layers.project),
      count = layers.undoCount;
    const steps = [
      {
        command: {
          type: "primitive.update",
          id,
          unit: "mm",
          source: { kind: "sphere", width: 30, height: 20, depth: 10 },
        },
      },
    ];
    assert((await call("dry_run_changes", { steps })).ok);
    assert.deepEqual(saveSculptProject(layers.project), bytes);
    assert.equal(layers.undoCount, count);
    assert((await call("apply_changes", { steps })).ok);
    assert.deepEqual(api.objectMetadata(id).dimensionsMM, [30, 20, 10]);
    layers.undo();
    assert.deepEqual(saveSculptProject(layers.project), bytes);
    assert.throws(() =>
      validateCall({
        name: "create_primitive",
        args: {
          expectedRevision: api.revision,
          unit: "mm",
          source: { kind: "sphere", width: 10, height: 20 },
        },
      }),
    );
  } finally {
    layers.dispose();
  }
});

test("associative attachment schemas, read grants and separately approved recipe proposals use the authoritative transaction", async () => {
  const { DEFAULT_ENCLOSURE } = await import("../work/test-build/enclosure-recipe.mjs");
  const { isWrite } = await import("../scripts/agent-schemas.mjs");
  const { layers, api } = createHeadlessEditor();
  let editing = true;
  const proposals = new AgentProposals();
  const run = agentExecutor(
    layers,
    () => editing,
    () => false,
    () => {},
    proposals,
  );
  const call = (name, args = {}) => run(job(name, args), signal());
  try {
    const created = await api.enclosure.create(DEFAULT_ENCLOSURE, {
      expectedRevision: api.revision,
    });
    assert(created.ok);
    const { base, lid } = created.value.partIds,
      definition = {
        kind: "cutout",
        name: "Port",
        anchor: "enclosure.base.wall.right",
        shape: "round",
        uMm: 0,
        vMm: 5,
        widthMm: 4,
        heightMm: 4,
        insetMm: 0,
      };
    const args = { baseId: base, lidId: lid, definition, expectedRevision: api.revision };
    assert(validateCall({ name: "set_enclosure_feature", args }));
    assert.throws(() =>
      validateCall({
        name: "set_enclosure_feature",
        args: { ...args, definition: { ...definition, extra: 1 } },
      }),
    );
    assert.equal(isWrite("enclosure_anchors"), false);
    assert.equal(isWrite("list_enclosure_features"), false);
    assert.equal(isWrite("set_enclosure_feature"), true);
    editing = false;
    assert((await call("enclosure_anchors", { baseId: base, lidId: lid })).ok);
    assert.equal((await call("set_enclosure_feature", args)).error.code, "permission_denied");
    editing = true;
    const before = saveSculptProject(layers.project),
      revision = api.revision;
    const staged = await call("propose_enclosure", {
      expectedRevision: revision,
      title: "Add wall port",
      description: "Named right wall opening",
      recipe: { type: "feature-set", baseId: base, lidId: lid, definition },
    });
    assert(staged.ok, JSON.stringify(staged));
    assert.equal(api.revision, revision);
    assert.deepEqual(saveSculptProject(layers.project), before);
    const proposalId = staged.value.id;
    assert.equal((await call("apply_approved_proposal", { proposalId })).ok, false);
    assert(proposals.approve(layers, api.revision));
    const applied = await call("apply_approved_proposal", { proposalId });
    assert(applied.ok, JSON.stringify(applied));
    const features = await call("list_enclosure_features", { baseId: base, lidId: lid });
    assert.equal(features.value.length, 1);
    const attachmentId = features.value[0].sourceIds[0];
    assert((await call("get_enclosure_feature", { baseId: base, lidId: lid, attachmentId })).ok);
    layers.undo();
    assert.deepEqual(saveSculptProject(layers.project), before);
  } finally {
    layers.dispose();
  }
});

test("HTTP LAN origins without randomUUID retain cryptographic proposal and activity IDs", async () => {
  const previous = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
  Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined });
  let layers;
  try {
    const editor = createHeadlessEditor();
    layers = editor.layers;
    const proposals = new AgentProposals(),
      activity = [];
    const run = agentExecutor(
      layers,
      () => true,
      () => false,
      () => {},
      proposals,
      (entry) => activity.push(entry),
    );
    const staged = await run(
      job("propose_changes", {
        expectedRevision: editor.api.revision,
        title: "LAN origin",
        description: "One measured primitive",
        steps: [{ command: create }],
      }),
      signal(),
    );
    assert(staged.ok, JSON.stringify(staged));
    assert.match(
      staged.value.id,
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
    assert(proposals.approve(layers, editor.api.revision));
    const applied = await run(
      job("apply_approved_proposal", { proposalId: staged.value.id }),
      signal(),
    );
    assert(applied.ok, JSON.stringify(applied));
    assert.equal(layers.undoCount, 1);
    assert.equal(activity.length, 1);
    assert.match(activity[0].id, /^[a-f0-9-]{36}$/);
    assert.notEqual(activity[0].id, staged.value.id);
  } finally {
    layers?.dispose();
    if (previous) Object.defineProperty(crypto, "randomUUID", previous);
    else delete crypto.randomUUID;
  }
});
