import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { startAgentBridge } from "../scripts/agent-bridge.mjs";
import { tools, validateCall } from "../scripts/agent-schemas.mjs";
import { publishSession, readSession } from "../scripts/agent-session.mjs";
import { createHeadlessEditor } from "../scripts/headless-enclosure.mjs";
import { agentExecutor } from "../work/test-build/agent-access.mjs";
import {
  MAX_PROJECT_LAYERS,
  openSculptProject,
  saveSculptProject,
} from "../work/test-build/project.mjs";

const source = { kind: "box", width: 20, height: 30, depth: 40 };
const create = { type: "primitive.create", unit: "mm", source };
const job = (name, args = {}) => ({ name, args, id: "test", deadline: Date.now() + 10000 });
const signal = () => new AbortController().signal;

test("16 layers round-trip natively and the seventeenth is refused without history changes", async () => {
  const { layers, api } = createHeadlessEditor();
  try {
    assert.equal(MAX_PROJECT_LAYERS, 16);
    while (layers.project.layerStack.layers.length < 15) layers.create(64);
    assert((await api.execute(create, { expectedRevision: api.revision })).ok);
    const native = saveSculptProject(layers.project);
    const opened = openSculptProject(native);
    assert.deepEqual(
      opened.layerStack.layers.map((l) => l.id),
      layers.project.layerStack.layers.map((l) => l.id),
    );
    const history = layers.undoCount;
    assert.throws(() => layers.create(64), /16/);
    assert.equal(layers.undoCount, history);
    layers.undo();
    assert.equal(layers.project.layerStack.layers.length, 15);
    layers.undo(true);
    assert.equal(layers.project.layerStack.layers.length, 16);
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
      args: { steps: [{ command: { type: "object.delete", id: "x" } }], expectedRevision: "r" },
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
    assert.equal((await client.listTools()).tools.length, Object.keys(tools).length);
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
