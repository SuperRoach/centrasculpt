import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { chromium } from "@playwright/test";
import { createHeadlessEditor } from "./headless-enclosure.mjs";

const { saveSculptProject } = await import("../work/test-build/project.mjs");

const output = resolve(process.env.CENTRA_COMPONENT_REPORT ?? "work/phase-8-8e");
await mkdir(output, { recursive: true });
const isolation = await mkdtemp(join(tmpdir(), "centra-component-mcp-"));
const discovery = join(isolation, "session.json");
const port = process.env.CENTRA_COMPONENT_MCP_PORT ?? "5282";
const exportOnly = process.argv.includes("--export-only");
const modelOnly = process.argv.includes("--model-only");
const origin = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  CENTRA_AGENT: "1",
  CENTRA_AGENT_PROFILE: "1",
  CENTRA_AGENT_DISCOVERY_FILE: discovery,
};
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", port, "--strictPort"],
  { env, stdio: ["ignore", "pipe", "pipe"] },
);
let serverLog = "";
server.stdout.on("data", (chunk) => {
  serverLog += chunk;
});
server.stderr.on("data", (chunk) => {
  serverLog += chunk;
});
const report = {
  scenarios: [],
  calls: [],
  exports: [],
  browserProfile: [],
  rendererHeapPeakBytes: 0,
};
let browser,
  client,
  page,
  heapTimer,
  cdp,
  mcpLog = "";
const errors = [];
const started = performance.now();
const pause = (ms) => new Promise((done) => setTimeout(done, ms));
async function until(check, description, ms = 45000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await check()) return;
    await pause(350);
  }
  throw new Error(description);
}
async function scenario(name, test) {
  const start = performance.now();
  const firstCall = report.calls.length;
  const entry = { name, ok: false };
  report.scenarios.push(entry);
  try {
    await test();
    entry.ok = true;
    console.log(`PASS ${name}`);
  } catch (error) {
    entry.error = String(error);
    throw error;
  } finally {
    entry.ms = performance.now() - start;
    entry.calls = report.calls.length - firstCall;
  }
}
async function call(name, args = {}) {
  const start = performance.now();
  const response = await client.callTool({ name, arguments: args });
  const result = response.structuredContent ?? {
    ok: false,
    error: { message: response.content?.[0]?.text },
  };
  report.calls.push({ name, ms: performance.now() - start, ok: result.ok, error: result.error });
  return result;
}
const ok = (result) => {
  assert(result.ok, JSON.stringify(result));
  return result;
};
const scene = () => call("scene_summary").then(ok);
const inspect = (id) => call("inspect_components", id ? { componentId: id } : {}).then(ok);
const button = (name) => page.getByRole("button", { name, exact: true });
async function showAgent() {
  if (await page.locator("#local-agent-panel").evaluate((panel) => panel.hidden))
    await button("Open local agent access").click();
}
async function closeAgent() {
  if (await button("Dismiss agent access").isVisible())
    await button("Dismiss agent access").click();
}
async function editing() {
  await page
    .getByRole("checkbox", { name: "Remember editing choice on this browser", exact: true })
    .check();
  await page.getByRole("checkbox", { name: "Allow editing (includes Undo)", exact: true }).check();
  await showAgent();
  await page.getByText("Connected · editing allowed", { exact: true }).waitFor();
}
async function change(edit, expectedRevision) {
  return call("edit_component", {
    expectedRevision: expectedRevision ?? (await scene()).revision,
    edit,
  });
}
async function place(preset, baseId, positionMm, rotation, gapMm) {
  const { componentId } = ok(await change({ type: "insert", preset })).value;
  ok(await change({ type: "place", componentId, hostId: baseId, positionMm, rotation, gapMm }));
  return componentId;
}
async function stage(recipe, expectedRevision) {
  return call(recipe.type === "create" ? "propose_enclosure" : "propose_component_feature", {
    expectedRevision: expectedRevision ?? (await scene()).revision,
    title: recipe.type,
    description:
      "Disposable electronics fixture. Review dimensions and generated sources before approval.",
    recipe,
  });
}
async function apply(proposal) {
  await showAgent();
  await button("Approve this exact plan").click();
  const proposalId = proposal.id;
  let result = ok(await call("apply_approved_proposal", { proposalId, waitForApply: false }));
  if (result.value.state === "applying") {
    await until(
      async () => {
        result = ok(await call("get_proposal", { proposalId, summaryOnly: true }));
        return result.value.state !== "applying";
      },
      "Proposal apply did not finish",
      110000,
    );
    assert.equal(result.value.state, "applied", JSON.stringify(result));
    result = ok(result.value.result);
  }
  return result;
}
async function download(trigger, file, timeout = 120000) {
  const [item] = await Promise.all([page.waitForEvent("download", { timeout }), trigger()]);
  await item.saveAs(join(output, file));
}
async function nativeRoundTrip(file) {
  await closeAgent();
  await button("Centra Sculpt project menu").click();
  await download(() => button("Download .form").click(), file, 45000).catch(async (error) => {
    throw new Error(`Native download: ${await page.locator("#project-message").textContent()}`, {
      cause: error,
    });
  });
  await openNative(join(output, file));
}
async function openNative(file) {
  await page.locator("#project-file").setInputFiles(file);
  const library = page.getByRole("dialog", { name: "Project library" });
  await library.getByRole("button", { name: "Open project", exact: true }).click();
  const discard = library.getByRole("button", { name: "Discard edits & continue", exact: true });
  let confirmed = false;
  await until(
    async () => {
      if (!(await library.isVisible())) return true;
      if (!confirmed && (await discard.isVisible()) && (await discard.isEnabled())) {
        await discard.click();
        confirmed = true;
      }
      return false;
    },
    "Native project did not open",
    120000,
  );
}

async function verifyBrowserExports() {
  await scenario("Actual-size browser STL exports and topology", async () => {
    await closeAgent();
    await page.locator("#open-export").click();
    await page.locator("#export-format").selectOption("stl");
    await page.locator("#export-quality").selectOption("high");
    await page.locator("#export-advanced > summary").click();
    await page.locator("#export-memory").selectOption("512");
    const start = performance.now();
    await page.locator("#export-marked-parts").click();
    const names = [
      "Electronics validation Base",
      "Electronics validation Lid",
      "Button plunger",
      "Button retainer",
    ];
    for (const name of names) {
      const link = page.getByRole("link", { name: `Download ${name} STL`, exact: true });
      await until(
        async () => {
          if (await link.isVisible()) return true;
          const status = await page.locator("#export-result").innerText();
          assert(
            !/STL blocked|exceeds? .*budget|export requires|unable to export/i.test(status),
            status,
          );
          return false;
        },
        `Timed out preparing ${name} STL`,
        300000,
      );
      const row = page.locator(".export-part").filter({ has: link });
      const slug = name.toLowerCase().replaceAll(" ", "-");
      await download(() => link.click(), `${slug}.stl`);
      await row.locator("summary").click();
      await download(
        () => row.getByRole("link", { name: /Download print report/ }).click(),
        `${slug}.json`,
      );
      const mesh = JSON.parse(await readFile(join(output, `${slug}.json`), "utf8"));
      report.exports.push({ name, ...mesh });
      for (const key of [
        "boundaryEdges",
        "nonManifoldEdges",
        "inconsistentEdges",
        "degenerateTriangles",
        "invertedComponents",
      ])
        assert.equal(mesh[key], 0, `${name}: ${key}`);
      assert.equal(mesh.components, 1, name);
      const bytes = await readFile(join(output, `${slug}.stl`));
      assert.equal(bytes.length, 84 + 50 * mesh.triangles);
    }
    report.browserExportMs = performance.now() - start;
  });
}

const parameters = {
  units: "mm",
  name: "Electronics validation",
  innerWidthMm: 100,
  innerDepthMm: 64,
  innerHeightMm: 30,
  wallThicknessMm: 3,
  floorThicknessMm: 3,
  cornerRadiusMm: 4,
  lid: { type: "friction-fit", clearanceMm: 0.3, lipDepthMm: 4, thicknessMm: 3 },
};
const rectangle = { shape: "rectangle", horizontal: 0.4, vertical: 0.4, cable: 0 };
const opening = (pair, componentId, featureId, measurements) => ({
  type: "component-opening",
  ...pair,
  componentId,
  featureId,
  measurements,
});
let pair, pi, esp, tactile, espRecipe, buttonRecipe, settled;
try {
  await until(
    () => serverLog.includes("Agent session:") && serverLog.includes("Local:"),
    "Vite startup failed",
  );
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: ["--enable-unsafe-swiftshader"],
  });
  page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (entry) => {
    if (entry.type() === "error") console.error(entry.text());
  });
  await page.goto(origin);
  if (exportOnly) {
    await openNative(join(output, "electronics-enclosure.form"));
    await verifyBrowserExports();
  } else {
    // Parametric source caches inherit the selected layer resolution. Use a 17³
    // empty seed so this 20-source fixture stays within the native triangle budget.
    const seed = createHeadlessEditor();
    const blank = join(isolation, "blank.form");
    try {
      await writeFile(blank, new Uint8Array(saveSculptProject(seed.layers.project)));
    } finally {
      seed.layers.dispose();
    }
    await openNative(blank);
    await page.evaluate(() => {
      window.__centraAgentProfileEnabled = true;
      window.__centraAgentProfile = [];
    });
    cdp = await page.context().newCDPSession(page);
    heapTimer = setInterval(() => {
      void cdp
        .send("Runtime.getHeapUsage")
        .then(({ usedSize }) => {
          report.rendererHeapPeakBytes = Math.max(report.rendererHeapPeakBytes, usedSize);
        })
        .catch(() => {});
    }, 500);
    client = new Client({ name: "centra-component-integration", version: "1" });
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve("scripts/agent-mcp.mjs")],
      env,
      stderr: "pipe",
    });
    transport.stderr.on("data", (chunk) => {
      mcpLog += chunk;
    });
    await client.connect(transport);
    await scenario("Connection, tool inventory and read-only access", async () => {
      await showAgent();
      assert.equal((await call("inspect_components")).ok, false);
      await button("Approve connection").click();
      await page.getByText("Connected · read-only", { exact: true }).waitFor();
      const inventory = ok(await call("get_capabilities")).value;
      const registry = await client.listTools();
      assert.deepEqual(registry.tools.map(({ name }) => name).sort(), [...inventory.tools].sort());
      assert(inventory.tools.includes("propose_component_feature"));
      await writeFile(join(output, "capabilities.json"), JSON.stringify(inventory, null, 2));
      const inspection = await inspect();
      assert.equal(inspection.value.presets.length, 5);
      assert.equal(
        (await change({ type: "insert", preset: "pi4" }, inspection.revision)).ok,
        false,
      );
      await editing();
    });

    await scenario("Pi 4 enclosure, snap, four posts and USB opening", async () => {
      const initial = ok(await call("list_objects")).value;
      const proposed = ok(await stage({ type: "create", parameters })).value;
      const created = await apply(proposed);
      pair = { baseId: created.value.partIds.base, lidId: created.value.partIds.lid };
      for (const object of initial)
        ok(
          await call("object_delete", {
            expectedRevision: (await scene()).revision,
            id: object.id,
          }),
        );
      pi = await place("pi4", pair.baseId, [0, 0, 0], [0, 0, 0], 5.5);
      const board = (await inspect(pi)).value.references[0];
      assert.equal(board.holes.length, 4);
      assert.match(board.envelope.clearance, /Floor clearance 5.50 mm/);
      const mounts = ok(
        await stage({
          type: "component-mounting",
          ...pair,
          componentId: pi,
          outerDiameterMm: 6,
          boreDiameterMm: 2,
        }),
      ).value;
      await apply(mounts);
      const recipe = opening(pair, pi, "usb3", { ...rectangle, y: 9 });
      const portPlan = ok(await stage(recipe)).value;
      const fit = portPlan.preview.value.fit;
      assert.equal(fit.opening.anchor, "enclosure.base.wall.right");
      assert(Math.abs(fit.opening.widthMm - 14.62) < 1e-9);
      assert.equal(fit.opening.heightMm, 16.8);
      assert.equal(fit.depth, 4.5);
      assert.equal((await call("apply_approved_proposal", { proposalId: portPlan.id })).ok, false);
      await apply(portPlan);
      const features = ok(await call("list_enclosure_features", pair)).value;
      assert.equal(
        features.find(({ definition }) => definition.kind === "mounting").definition.centresMm
          .length,
        4,
      );
      assert.equal((await inspect(pi)).value.openings[0].stale, false);
    });

    await scenario(
      "Rotated ESP32 and rejection of missing or incompatible measurements",
      async () => {
        esp = await place("devkit", pair.baseId, [0, -2, -18], [0, 90, 0]);
        const before = await scene();
        const recipe = opening(pair, esp, "usb", { ...rectangle, y: 3 });
        const missingHeight = await stage(recipe, before.revision);
        assert.equal(missingHeight.ok, false);
        assert.match(missingHeight.error.message, /measured envelope height/i);
        espRecipe = { ...recipe, measurements: { ...recipe.measurements, height: 4 } };
        const wrongWall = await stage(
          { ...espRecipe, wall: "enclosure.base.wall.front" },
          before.revision,
        );
        assert.equal(wrongWall.ok, false);
        assert.match(wrongWall.error.message, /functional axis/i);
        assert.equal((await scene()).revision, before.revision);
        const proposed = ok(await stage(espRecipe, before.revision)).value;
        const { opening: cut } = proposed.preview.value.fit;
        assert.equal(cut.anchor, "enclosure.base.wall.right");
        assert(Math.abs(cut.widthMm - 7.4) < 1e-9);
        assert.equal(cut.heightMm, 4.8);
        await apply(proposed);
      },
    );

    await scenario(
      "Associated update rejection, approval, stable identity and Undo/Redo",
      async () => {
        const prior = (await inspect(esp)).value.openings[0];
        ok(
          await change({
            type: "place",
            componentId: esp,
            hostId: pair.baseId,
            positionMm: [0, -2, -17],
            rotation: [0, 90, 0],
          }),
        );
        const stale = await inspect(esp);
        assert.equal(stale.value.openings[0].stale, true);
        const recipe = {
          type: "component-update",
          ...pair,
          componentId: esp,
          attachmentId: prior.attachmentId,
        };
        const proposal = ok(await stage(recipe, stale.revision)).value;
        await showAgent();
        await button("Reject proposal").click();
        assert.equal(
          (await call("apply_approved_proposal", { proposalId: proposal.id })).ok,
          false,
        );
        assert.deepEqual(await inspect(esp), stale);
        const cancelled = ok(await stage(recipe)).value;
        ok(await call("cancel_proposal", { proposalId: cancelled.id }));
        assert.equal(
          (await call("apply_approved_proposal", { proposalId: cancelled.id })).ok,
          false,
        );
        assert.deepEqual(await inspect(esp), stale);

        await apply(ok(await stage(recipe)).value);
        const fresh = await inspect(esp);
        const updated = fresh.value.openings[0];
        assert.equal(updated.attachmentId, prior.attachmentId);
        assert.equal(updated.stale, false);
        assert.equal(updated.definition.widthMm, prior.definition.widthMm);
        assert.notEqual(updated.definition.uMm, prior.definition.uMm);
        assert.notEqual(fresh.revision, stale.revision);
        const undone = ok(await call("undo", { expectedRevision: fresh.revision }));
        assert.deepEqual((await inspect(esp)).value.openings, stale.value.openings);
        ok(await call("redo", { expectedRevision: undone.revision }));
        assert.deepEqual((await inspect(esp)).value.openings, fresh.value.openings);
      },
    );

    await scenario("Captured tactile button, clearance and safe refit", async () => {
      tactile = await place("tactile", pair.baseId, [0, -2, 23.5], [90, 0, 0]);
      buttonRecipe = opening(pair, tactile, "actuator", {
        shape: "round",
        x: 0,
        y: 4.5,
        z: 0,
        width: 3.3,
        horizontal: 0.3,
        vertical: 0,
        cable: 0,
        travel: 0.5,
        usableDepth: 1,
        plunger: { diameter: 8, height: 2, shaft: 4, retainer: { diameter: 8, thickness: 3 } },
      });
      const before = await scene();
      const impossible = await stage(
        { ...buttonRecipe, measurements: { ...buttonRecipe.measurements, usableDepth: 0.25 } },
        before.revision,
      );
      assert.equal(impossible.ok, false);
      assert.match(impossible.error.message, /usable inward depth/);
      assert.equal((await scene()).revision, before.revision);
      const proposal = ok(await stage(buttonRecipe)).value;
      const fit = proposal.preview.value.fit;
      assert.equal(fit.opening.widthMm, 4.6);
      assert.equal(fit.travel, 0.5);
      assert(fit.plunger.retainer.length === 2 && fit.plunger.pieces.length === 2);
      await apply(proposal);
      const original = (await inspect(tactile)).value.openings[0];
      assert.equal(original.definition.association.printableIds.length, 4);
      ok(
        await change({
          type: "place",
          componentId: tactile,
          hostId: pair.baseId,
          positionMm: [1, -2, 23.5],
          rotation: [90, 0, 0],
        }),
      );
      assert.equal((await inspect(tactile)).value.openings[0].stale, true);
      await apply(
        ok(
          await stage({
            type: "component-update",
            ...pair,
            componentId: tactile,
            attachmentId: original.attachmentId,
          }),
        ).value,
      );
      const refitted = (await inspect(tactile)).value.openings[0];
      assert.equal(refitted.stale, false);
      assert.equal(refitted.attachmentId, original.attachmentId);
      assert.deepEqual(
        refitted.definition.association.printableIds,
        original.definition.association.printableIds,
      );
    });

    await scenario("Native round trip and stale revision and deletion guards", async () => {
      const before = await inspect();
      ok(await change({ type: "delete", componentId: esp }, before.revision));
      assert.equal((await inspect(esp)).value.openings[0].referenceDeleted, true);
      assert.equal((await change({ type: "delete", componentId: pi }, before.revision)).ok, false);
      ok(await call("undo", { expectedRevision: (await scene()).revision }));
      assert.deepEqual((await inspect()).value, before.value);
      await nativeRoundTrip("electronics-enclosure.form");
      await showAgent();
      if (await button("Approve connection").isVisible()) {
        await button("Approve connection").click();
        await page.getByText("Connected · editing allowed", { exact: true }).waitFor();
      }
      settled = await inspect();
      assert.notEqual(settled.revision, before.revision);
      assert.equal(settled.value.references.length, 3);
      assert.deepEqual(
        settled.value.openings.map(({ definition, stale }) => [
          definition.name,
          definition.widthMm,
          definition.heightMm,
          stale,
        ]),
        before.value.openings.map(({ definition, stale }) => [
          definition.name,
          definition.widthMm,
          definition.heightMm,
          stale,
        ]),
      );
      report.geometry = settled.value.openings;
      report.scene = (await scene()).value;
      const objects = ok(await call("list_objects")).value;
      report.layers = objects.filter(({ geometry }) => geometry !== null).length;
      report.parametricSources = objects.filter(({ geometry }) => geometry?.parametric).length;
    });

    if (!modelOnly) await verifyBrowserExports();
  }
  assert.deepEqual(errors, []);
} catch (error) {
  console.error(
    serverLog
      .split("\n")
      .filter((line) => !line.startsWith("[centra-agent-profile]"))
      .join("\n"),
  );
  throw error;
} finally {
  clearInterval(heapTimer);
  report.elapsedMs = performance.now() - started;
  report.browserProfile =
    (await page?.evaluate(() => window.__centraAgentProfile ?? []).catch(() => [])) ?? [];
  report.bridgeProfile = serverLog
    .split("\n")
    .filter((line) => line.startsWith("[centra-agent-profile] "))
    .map((line) => JSON.parse(line.slice("[centra-agent-profile] ".length)));
  report.adapterProfile = mcpLog
    .split("\n")
    .filter((line) => line.startsWith("[centra-agent-profile] "))
    .map((line) => JSON.parse(line.slice("[centra-agent-profile] ".length)));
  report.errors = errors;
  await writeFile(
    join(output, exportOnly ? "browser-export.json" : "integration.json"),
    JSON.stringify(report, null, 2),
  );
  await client?.close();
  await browser?.close();
  server.kill("SIGTERM");
}
