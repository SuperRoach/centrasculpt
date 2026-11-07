// Actual browser + stdio MCP smoke, isolated browser profile and configurable unused Vite port.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
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
let server = start(true);
let browser, client, normal;
try {
  await waitUntil(
    () => /Agent session: (.+session.json)/.test(server.text()) && server.text().includes("Local:"),
    `Agent Vite failed: ${server.text()}`,
  );
  let sessionFile = server.text().match(/Agent session: (.+session.json)/)[1];
  let session = JSON.parse(await readFile(sessionFile, "utf8"));
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  assert.equal(
    (await fetch(`${origin}/__centra_agent_session`)).status,
    403,
    "discovery requires explicit request header",
  );
  assert.equal(
    (
      await fetch(`${origin}/__centra_agent_session`, {
        headers: {
          "X-Centra-Agent-Discovery": "1",
          Origin: "https://untrusted.example",
        },
      })
    ).status,
    403,
    "cross-origin discovery refused",
  );
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
  await page
    .getByRole("checkbox", { name: "Remember editing choice on this browser", exact: true })
    .check();
  await page.getByRole("checkbox", { name: "Allow editing (includes Undo)", exact: true }).check();
  await page.getByRole("button", { name: "Open local agent access", exact: true }).click();
  await page.getByText("Connected · editing allowed", { exact: true }).waitFor();
  // Reload remembers only desired editing mode; connection still requires a fresh explicit click.
  await page.reload();
  await page.getByRole("button", { name: "Open local agent access", exact: true }).click();
  assert.equal(
    await page
      .getByRole("checkbox", { name: "Allow editing (includes Undo)", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByRole("button", { name: "Approve connection", exact: true }).click();
  await page.locator('#local-agent-panel[data-state="editing"]').waitFor({ state: "attached" });
  if (await page.locator("#local-agent-panel").evaluate((node) => node.hidden))
    await page.getByRole("button", { name: "Open local agent access", exact: true }).click();
  assert.equal(
    await page
      .getByRole("checkbox", { name: "Allow editing (includes Undo)", exact: true })
      .isChecked(),
    true,
  );
  assert.equal(await page.locator(".agent-history li").count(), 0);
  args.expectedRevision = (await call("scene_summary")).revision;
  const made = await call("create_primitive", args);
  await page.locator('.agent-history li[data-outcome="committed"]').first().waitFor();
  assert.equal(await page.locator('.agent-history li[data-outcome="committed"]').count(), 1);
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
  await page.waitForTimeout(2200); // Commit pulse has expired; framing must move the camera, not geometry.
  const canvasBefore = await page.locator("#viewport canvas").first().screenshot();
  const revisionBeforeShow = (await call("scene_summary")).revision;
  const poseBeforeShow = (await call("get_object", { id })).value.worldTransform;
  const latestChange = page.locator('.agent-history li[data-outcome="committed"]').first();
  await latestChange.getByRole("button", { name: "Show me", exact: true }).click();
  await latestChange.getByText("Framed affected objects.", { exact: true }).waitFor();
  const canvasAfter = await page.locator("#viewport canvas").first().screenshot();
  assert(!canvasBefore.equals(canvasAfter), "Show me changes the desktop camera view");
  assert.equal((await call("scene_summary")).revision, revisionBeforeShow);
  assert.deepEqual((await call("get_object", { id })).value.worldTransform, poseBeforeShow);

  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
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
  const highlightedImage = await page.screenshot({ path: `${output}/browser-created.png` });
  const upperBorderPixels = await page.evaluate(
    async (bytes) => {
      const bitmap = await createImageBitmap(
        new Blob([new Uint8Array(bytes)], { type: "image/png" }),
      );
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext("2d");
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      // The box's upper silhouette is against studio grey, with no grid behind it.
      const pixels = context.getImageData(700, 250, 150, 30).data;
      let green = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (
          pixels[i + 1] > 100 &&
          pixels[i + 1] > pixels[i] * 1.25 &&
          pixels[i + 1] > pixels[i + 2] * 1.1
        )
          green++;
      return green;
    },
    [...highlightedImage],
  );
  assert(
    upperBorderPixels > 50,
    `visible green upper border against grey background: ${upperBorderPixels}`,
  );
  await page.evaluate(() => window.dispatchEvent(new Event("pageshow")));
  const previewRevision = (await call("scene_summary")).revision;
  for (const viewpoint of ["front", "isometric"]) {
    const preview = await client.callTool({
      name: "capture_scene_preview",
      arguments: {
        objectId: id,
        viewpoint,
        width: 384,
        height: 256,
        expectedRevision: previewRevision,
      },
    });
    assert(preview.structuredContent.ok, JSON.stringify(preview.structuredContent));
    const image = preview.content.find((block) => block.type === "image");
    assert.equal(image.mimeType, "image/png");
    const bytes = Buffer.from(image.data, "base64");
    assert.equal(bytes.readUInt32BE(16), 384);
    assert.equal(bytes.readUInt32BE(20), 256);
    assert.equal(bytes.length, preview.structuredContent.value.bytes);
    await writeFile(`${output}/model-${viewpoint}.png`, bytes);
  }
  assert.equal((await call("scene_summary")).revision, previewRevision);
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
  const oldCreate = page
    .locator('.agent-history li[data-outcome="committed"]')
    .filter({ hasText: "Create primitive" })
    .first();
  await oldCreate.getByRole("button", { name: "Show me", exact: true }).click();
  await oldCreate
    .getByText("These objects are hidden, deleted or unavailable.", { exact: true })
    .waitFor();
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
  const historyBeforePreview = await page
    .locator('.agent-history li[data-outcome="committed"]')
    .count();
  const preview = await call("dry_run_changes", { expectedRevision: revision, steps });
  assert(preview.ok, JSON.stringify(preview));
  assert.equal(preview.value.geometryValidation, "source_caches_only");
  assert.equal(
    await page.locator('.agent-history li[data-outcome="committed"]').count(),
    historyBeforePreview,
  );
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
  assert.equal(
    await page.locator('.agent-history li[data-outcome="committed"]').count(),
    historyBeforePreview + 1,
  );
  assert.equal(
    await page
      .locator('.agent-history li[data-outcome="committed"]')
      .filter({ hasText: "Editable enclosure body" })
      .count(),
    1,
  );
  const body = batch.value.aliases.body;
  assert.equal((await call("get_booleans", { id: body })).value[0].operation, "difference");
  const diagnostics = await call("get_geometry_diagnostics", { id: body });
  assert(diagnostics.ok, JSON.stringify(diagnostics));
  assert.equal(diagnostics.value.topologyAccuracy, "exact_on_exported_mesh");
  assert((await call("get_hierarchy")).ok);
  assert((await call("undo", { expectedRevision: batch.revision })).ok);
  assert.equal((await call("scene_summary")).value.objects, before.value.objects);
  // Phase 7.2: actual staged desktop authoring, native API reflow, approved attachment edit.
  const enclosureParameters = {
    units: "mm",
    name: "Associative enclosure",
    innerWidthMm: 24,
    innerDepthMm: 20,
    innerHeightMm: 14,
    wallThicknessMm: 3,
    floorThicknessMm: 3,
    cornerRadiusMm: 4,
    lid: { type: "friction-fit", clearanceMm: 0.3, lipDepthMm: 4, thicknessMm: 3 },
  };
  const enclosure = await call("create_enclosure", {
    expectedRevision: (await call("scene_summary")).revision,
    parameters: enclosureParameters,
  });
  assert(enclosure.ok, JSON.stringify(enclosure));
  const pair = enclosure.value.partIds;
  await page.locator(".enclosure-panel > summary").click();
  await page.getByRole("button", { name: "Edit selected enclosure", exact: true }).click();
  await page.getByText("Cutouts & mounting", { exact: true }).click();
  await page.getByLabel("U from wall centre (mm)", { exact: true }).fill("1");
  const beforeFeature = (await call("scene_summary")).revision;
  await page.getByRole("button", { name: "Preview attachment", exact: true }).click();
  await page.getByRole("button", { name: "Apply attachment", exact: true }).waitFor();
  await waitUntil(
    async () =>
      await page.getByRole("button", { name: "Apply attachment", exact: true }).isEnabled(),
    "Attachment preview not ready",
  );
  assert.equal((await call("scene_summary")).revision, beforeFeature);
  await page.screenshot({ path: `${output}/browser-associative-preview.png` });
  await page.getByRole("button", { name: "Apply attachment", exact: true }).click();
  await waitUntil(async () => {
    const r = await call("list_enclosure_features", { baseId: pair.base, lidId: pair.lid });
    return r.ok && r.value.length === 1;
  }, "Attachment did not commit");
  await waitUntil(
    async () => !(await call("scene_summary")).value?.busy,
    "Attachment preview still busy",
  );
  const attachment = (await call("list_enclosure_features", { baseId: pair.base, lidId: pair.lid }))
    .value[0];
  const resized = await call("update_enclosure", {
    expectedRevision: (await call("scene_summary")).revision,
    baseId: pair.base,
    lidId: pair.lid,
    parameters: {
      ...enclosureParameters,
      innerDepthMm: 24,
      wallThicknessMm: 3.5,
      cornerRadiusMm: 4,
    },
  });
  assert(resized.ok, JSON.stringify(resized));
  const proposal = await call("propose_enclosure", {
    expectedRevision: resized.revision,
    title: "Move associated port",
    description: "Keep the front wall association and move U to 2 mm.",
    recipe: {
      type: "feature-set",
      baseId: pair.base,
      lidId: pair.lid,
      attachmentId: attachment.sourceIds[0],
      definition: { ...attachment.definition, uMm: 2 },
    },
  });
  if (proposal.ok) {
    const openAccess = page.getByRole("button", {
      name: "Open local agent access",
      exact: true,
    });
    const accessPanel = page.locator("#local-agent-panel");
    if (await accessPanel.evaluate((panel) => panel.hidden)) await openAccess.click();
    await page
      .locator('.agent-proposal [role="status"]')
      .filter({ hasText: "awaiting approval" })
      .waitFor({ state: "visible", timeout: 5000 });
    const approvePlan = page.getByRole("button", {
      name: "Approve this exact plan",
      exact: true,
    });
    assert.equal(await approvePlan.isEnabled(), true, "staged proposal needs browser approval");
    await approvePlan.click();
    const portApplied = await call("apply_approved_proposal", { proposalId: proposal.value.id });
    assert(portApplied.ok, JSON.stringify(portApplied));
    assert.equal(
      (
        await call("get_enclosure_feature", {
          baseId: pair.base,
          lidId: pair.lid,
          attachmentId: attachment.sourceIds[0],
        })
      ).value.definition.uMm,
      2,
    );
  } else {
    assert.match(proposal.error.message, /128 MiB source budget/);
    assert.equal((await call("scene_summary")).revision, resized.revision);
  }
  for (let i = 0; i < (proposal.ok ? 4 : 3); i++)
    assert((await call("undo", { expectedRevision: (await call("scene_summary")).revision })).ok);
  assert.equal((await call("scene_summary")).value.objects, before.value.objects);
  const restartScene = await call("list_objects");
  await page.evaluate(() => {
    window.__centraRestartMarker = "preserve-scene";
  });
  await stop(server);
  await page.getByText(/Bridge disconnected|Agent disconnected/).waitFor({ state: "attached" });
  await client.close();
  server = start(true);
  await waitUntil(
    () => /Agent session: (.+session.json)/.test(server.text()) && server.text().includes("Local:"),
    "Restarted agent Vite failed",
  );
  sessionFile = server.text().match(/Agent session: (.+session.json)/)[1];
  session = JSON.parse(await readFile(sessionFile, "utf8"));
  client = new Client({ name: "centra-restart-smoke", version: "1" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [resolve("scripts/agent-mcp.mjs")],
      env: { ...process.env, CENTRA_AGENT_DISCOVERY_FILE: resolve(output, "smoke-session.json") },
      stderr: "pipe",
    }),
  );
  assert.equal((await call("scene_summary")).ok, false, "restart needs fresh approval");
  await page
    .getByText("Agent server is back · approve connection to reconnect", { exact: true })
    .waitFor();
  assert.equal(
    await page.locator("#local-agent-panel").evaluate((node) => node.hidden),
    false,
    "restart offers approval automatically",
  );
  const panel = page.locator("#local-agent-panel");
  if (await panel.evaluate((node) => node.hidden))
    await page.getByRole("button", { name: "Open local agent access", exact: true }).click();
  await page.getByRole("button", { name: "Approve connection", exact: true }).click();
  await page
    .getByText("Connected · editing allowed", { exact: true })
    .waitFor({ state: "attached" });
  assert.equal(
    await page.evaluate(() => window.__centraRestartMarker),
    "preserve-scene",
    "no page reload on restart",
  );
  assert.deepEqual(
    await call("list_objects"),
    restartScene,
    "unsaved scene and revision survive restart",
  );
  await client.close();
  client = undefined;
  await page.getByText(/Bridge disconnected|Agent disconnected/).waitFor({ state: "attached" });
  assert.equal(await page.locator(".agent-history li").count(), 0);
  // Ordinary editor history remains functional after the MCP process exits.
  const redo = page.locator("#redo");
  await redo.click();
  await page.getByText("Associative enclosure Base", { exact: true }).first().waitFor();
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
      "Agent activity outlines",
      "centra.agent.editing-choice",
      "capture_scene_preview",
      "preview-image",
      "evaluated-live-display",
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
