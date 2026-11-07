// Actual browser + stdio MCP smoke, isolated browser profile and configurable unused Vite port.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { chromium } from "@playwright/test";

const port = Number(process.env.AGENT_SMOKE_PORT ?? 5197);
const origin = `http://127.0.0.1:${port}`;
const output = "work/phase-7-3";
await mkdir(output, { recursive: true });
const waitUntil = async (check, message) => {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(message);
};
function start(agent) {
  const child = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", `${port}`],
    {
      env: {
        ...process.env,
        CENTRA_AGENT: agent ? "1" : "0",
        CENTRA_AGENT_DISCOVERY_FILE: resolve(output, "smoke-session.json"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let text = "";
  child.stdout.on("data", (data) => {
    text += data;
  });
  child.stderr.on("data", (data) => {
    text += data;
  });
  return { child, text: () => text };
}
async function stop(server) {
  if (server.child.exitCode !== null) return;
  const exited = new Promise((r) => server.child.once("exit", r));
  server.child.kill("SIGTERM");
  await exited;
}
const server = start(true);
let browser, client, normal;
try {
  await waitUntil(
    () => /Agent session: (.+session.json)/.test(server.text()) && server.text().includes("Local:"),
    `Agent Vite failed: ${server.text()}`,
  );
  const sessionFile = server.text().match(/Agent session: (.+session.json)/)[1];
  const session = JSON.parse(await readFile(sessionFile, "utf8"));
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(origin);
  await page.getByRole("button", { name: "Open local agent access", exact: true }).click();
  await page.getByRole("button", { name: "Approve connection", exact: true }).waitFor();
  client = new Client({ name: "centra-browser-smoke", version: "1" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [resolve("scripts/agent-mcp.mjs")],
      env: { ...process.env, CENTRA_AGENT_DISCOVERY_FILE: resolve(output, "smoke-session.json") },
      stderr: "pipe",
    }),
  );
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args });
    return result.structuredContent;
  };
  assert.equal((await call("scene_summary")).ok, false, "disabled before approval");
  await page.getByRole("button", { name: "Approve connection", exact: true }).click();
  await page.getByText("Connected · read-only", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Dismiss agent access", exact: true }).click();
  await page.getByRole("button", { name: "Open local agent access", exact: true }).waitFor();
  await page.getByRole("button", { name: "Open local agent access", exact: true }).click();
  const before = await call("scene_summary");
  assert(before.ok, JSON.stringify(before));
  const args = {
    expectedRevision: before.revision,
    unit: "mm",
    source: { kind: "box", width: 20, height: 30, depth: 40 },
  };
  assert.equal((await call("create_primitive", args)).ok, false, "read-only rejects writes");
  await page.getByRole("checkbox", { name: "Allow editing (includes Undo)", exact: true }).check();
  await page.getByRole("button", { name: "Open local agent access", exact: true }).click();
  await page.getByText("Connected · editing allowed", { exact: true }).waitFor();
  const made = await call("create_primitive", args);
  assert(made.ok, JSON.stringify(made));
  const id = made.value.results[0].id;
  const object = await call("get_object", { id });
  assert.deepEqual(object.value.dimensionsMM, [20, 30, 40]);
  assert.equal((await call("scene_summary")).value.objects, before.value.objects + 1);
  assert.equal((await call("create_primitive", args)).error.code, "revision_conflict");
  const moved = await call("move_object", {
    id,
    expectedRevision: object.revision,
    unit: "mm",
    mode: "set",
    translation: [before.value.millimetresPerModelUnit * 1.2, 0, 0],
  });
  assert(moved.ok, JSON.stringify(moved));
  await page.getByText(object.value.name, { exact: true }).first().waitFor();
  const rotated = await call("rotate_object", {
    id,
    expectedRevision: moved.revision,
    rotationDegrees: [0, 30, 0],
    mode: "by",
  });
  assert(rotated.ok, JSON.stringify(rotated));
  assert(
    Math.abs(
      (await call("get_object", { id })).value.worldTransform.rotationRadians[1] - Math.PI / 6,
    ) < 1e-8,
  );
  await page.screenshot({ path: `${output}/browser-created.png` });
  const updated = await call("update_primitive", {
    ...args,
    id,
    expectedRevision: rotated.revision,
    source: { kind: "box", width: 24, height: 30, depth: 40 },
  });
  assert(updated.ok, JSON.stringify(updated));
  assert.deepEqual((await call("get_object", { id })).value.primitive, {
    kind: "box",
    width: 24,
    height: 30,
    depth: 40,
  });
  assert((await call("undo", { expectedRevision: updated.revision })).ok);
  const restored = await call("get_object", { id });
  assert.deepEqual(restored.value.primitive, args.source);
  assert((await call("undo", { expectedRevision: restored.revision })).ok);
  const unrotated = await call("get_object", { id });
  assert((await call("undo", { expectedRevision: unrotated.revision })).ok);
  const unmoved = await call("get_object", { id });
  assert((await call("undo", { expectedRevision: unmoved.revision })).ok);
  assert.equal((await call("scene_summary")).value.objects, before.value.objects);
  const caps = await call("get_capabilities");
  assert(caps.ok);
  assert(caps.value.tools.includes("boolean_create"));
  assert.equal(caps.value.limits.layers, 16);
  const steps = [
    {
      as: "body",
      command: {
        type: "primitive.create",
        unit: "mm",
        source: { kind: "box", width: 30, height: 20, depth: 30 },
      },
    },
    {
      as: "hole",
      command: {
        type: "primitive.create",
        unit: "mm",
        source: { kind: "cylinder", diameter: 8, height: 30 },
      },
    },
    {
      command: { type: "boolean.create", id: "$body", sourceId: "$hole", operation: "difference" },
    },
    { as: "group", command: { type: "group.create", name: "MCP assembly" } },
    { command: { type: "object.parent", id: "$body", parentId: "$group" } },
    { command: { type: "object.rename", id: "$body", name: "Editable body" } },
    { command: { type: "part.define", objectId: "$body", clearanceMM: 0.3 } },
    { command: { type: "part.assign", objectId: "$hole", partId: "$body" } },
  ];
  const revision = (await call("scene_summary")).revision;
  const preview = await call("dry_run_changes", { expectedRevision: revision, steps });
  assert(preview.ok, JSON.stringify(preview));
  assert.equal(preview.value.geometryValidation, "source_caches_only");
  assert.equal((await call("scene_summary")).revision, revision);
  const proposed = await call("propose_changes", {
    expectedRevision: revision,
    steps,
    title: "Editable enclosure body",
    description:
      "Create a body and cylindrical cutter, subtract the cutter, group and define a printable part.",
  });
  assert(proposed.ok, JSON.stringify(proposed));
  const proposalId = proposed.value.id;
  assert.equal((await call("scene_summary")).revision, revision);
  assert.equal(
    (await call("apply_approved_proposal", { proposalId })).error.code,
    "permission_denied",
  );
  await page.getByRole("button", { name: "Reject proposal", exact: true }).click();
  assert.equal((await call("apply_approved_proposal", { proposalId })).ok, false);
  const replacement = await call("propose_changes", {
    expectedRevision: revision,
    steps,
    title: "Editable enclosure body",
    description: "Revised plan: create body, subtract cutter and group parts.",
  });
  assert(replacement.ok, JSON.stringify(replacement));
  await page.getByRole("button", { name: "Approve this exact plan", exact: true }).click();
  await page.screenshot({ path: `${output}/browser-proposal.png` });
  const batch = await call("apply_approved_proposal", { proposalId: replacement.value.id });
  assert.equal(
    (await call("get_proposal", { proposalId: replacement.value.id })).value.state,
    "applied",
  );
  assert.equal(
    (await call("apply_approved_proposal", { proposalId: replacement.value.id })).ok,
    false,
  );
  assert(batch.ok, JSON.stringify(batch));
  const body = batch.value.aliases.body;
  assert.equal((await call("get_booleans", { id: body })).value[0].operation, "difference");
  const diagnostics = await call("get_geometry_diagnostics", { id: body });
  assert(diagnostics.ok, JSON.stringify(diagnostics));
  assert.equal(diagnostics.value.topologyAccuracy, "exact_on_exported_mesh");
  assert((await call("get_hierarchy")).ok);
  assert((await call("undo", { expectedRevision: batch.revision })).ok);
  assert.equal((await call("scene_summary")).value.objects, before.value.objects);
  await client.close();
  client = undefined;
  await page.getByText(/Bridge disconnected|Agent disconnected/).waitFor();
  // Ordinary editor history remains functional after the MCP process exits.
  const redo = page.locator("#redo");
  await redo.click();
  await page.getByText("Editable body", { exact: true }).first().waitFor();
  await page.screenshot({ path: `${output}/browser-disconnected-redo.png` });
  assert.deepEqual(pageErrors, []);
  await stop(server);
  await assert.rejects(readFile(sessionFile), "temporary credentials cleaned on shutdown");
  await assert.rejects(fetch(session.url), "bridge closed on Vite shutdown");
  normal = start(false);
  await waitUntil(() => normal.text().includes("Local:"), "Normal Vite failed");
  const normalRequests = [];
  page.on("request", (request) => normalRequests.push(request.url()));
  await page.goto(origin);
  await page.locator("canvas").first().waitFor();
  assert.equal(
    await page.getByRole("button", { name: "Approve connection", exact: true }).count(),
    0,
  );
  assert(
    !normalRequests.some((url) => /agent-browser|centra-agent/.test(url)),
    "normal startup does not load the browser adapter",
  );
  const assets = await readdir("dist/assets");
  for (const file of assets.filter((name) => name.endsWith(".js"))) {
    const content = await readFile(`dist/assets/${file}`, "utf8");
    for (const marker of [
      session.token,
      "Local agent access (development)",
      "centra-agent",
      "@modelcontextprotocol",
    ])
      assert(
        !content.includes(marker),
        `production asset contains agent marker: ${marker.slice(0, 20)}`,
      );
  }
  console.log(
    "PASS: real browser startup, stdio MCP, approval/read-only, live scene, visible box creation/transform/editor row/mm dimensions, update/stale revision, Undo restores original scene, MCP disconnect/ordinary Redo, Vite shutdown/credential cleanup, normal startup, production isolation.",
  );
} finally {
  await client?.close();
  await browser?.close();
  await stop(server);
  if (normal) await stop(normal);
}
