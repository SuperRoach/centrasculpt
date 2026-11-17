// Disposable localhost editor + real stdio MCP transport; no project files are saved.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { chromium } from "@playwright/test";

const port = Number(process.env.AGENT_BENCHMARK_PORT ?? 5198);
const origin = `http://127.0.0.1:${port}`;
const temp = await mkdtemp(join(tmpdir(), "centra-enclosure-benchmark-"));
const sessionPath = join(temp, "session.json");
const params = {
  units: "mm",
  name: "MCP enclosure fixture",
  innerWidthMm: 24,
  innerDepthMm: 20,
  innerHeightMm: 14,
  wallThicknessMm: 3,
  floorThicknessMm: 3,
  cornerRadiusMm: 4,
  lid: { type: "friction-fit", clearanceMm: 0.3, lipDepthMm: 4, thicknessMm: 3 },
};
const cutout = {
  kind: "cutout",
  name: "Front port",
  anchor: "enclosure.base.wall.front",
  shape: "round",
  uMm: 2,
  vMm: 5,
  widthMm: 4,
  heightMm: 4,
  insetMm: 0,
};
const mounting = {
  kind: "mounting",
  name: "Board mounts",
  anchor: "enclosure.base.floor",
  centresMm: [
    [-4, -4],
    [4, -4],
  ],
  outerDiameterMm: 3,
  boreDiameterMm: 1.5,
  heightMm: 4,
  floorOffsetMm: 0,
};
const finalParams = { ...params, innerDepthMm: 24 };
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", `${port}`],
  {
    env: {
      ...process.env,
      CENTRA_AGENT: "1",
      CENTRA_AGENT_DISCOVERY_FILE: sessionPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let serverOutput = "";
server.stdout.on("data", (chunk) => (serverOutput += chunk));
server.stderr.on("data", (chunk) => (serverOutput += chunk));
let browser;
let client;
const measurements = [];
let currentVariant = "setup";
const waitUntil = async (check, message) => {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`${message}\n${serverOutput}`);
};
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
};
const summary = (values) => ({
  p50Ms: Number(percentile(values, 0.5).toFixed(2)),
  p95Ms: Number(percentile(values, 0.95).toFixed(2)),
  samples: values.length,
});
const safeSummary = (values) => (values.length ? summary(values) : null);

try {
  await waitUntil(
    async () => serverOutput.includes("Local:") && serverOutput.includes("Agent session:"),
    "Vite did not start",
  );
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(origin);
  await page.evaluate(() => {
    window.__centraAgentProfileEnabled = true;
    window.__centraAgentProfile = [];
  });
  await page.getByRole("button", { name: "Open local agent access", exact: true }).click();
  await page.getByRole("button", { name: "Approve connection", exact: true }).waitFor();
  client = new Client({ name: "centra-enclosure-benchmark", version: "1" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [resolve("scripts/agent-mcp.mjs")],
      env: { ...process.env, CENTRA_AGENT_DISCOVERY_FILE: sessionPath },
      stderr: "pipe",
    }),
  );
  const call = async (name, args = {}) => {
    const start = performance.now();
    const response = await client.callTool({ name, arguments: args });
    measurements.push({
      name,
      variant: currentVariant,
      ms: performance.now() - start,
      ok: response.structuredContent?.ok === true,
    });
    console.info(
      `[${currentVariant}] ${name} ${measurements.at(-1).ok ? "ok" : response.structuredContent?.error?.code} ${measurements.at(-1).ms.toFixed(1)} ms`,
    );
    return response.structuredContent;
  };
  assert.equal(
    (await call("scene_summary")).ok,
    false,
    "editing is unavailable before explicit connection approval",
  );
  await page.getByRole("button", { name: "Approve connection", exact: true }).click();
  await page.getByText("Connected · read-only", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Dismiss agent access", exact: true }).click();
  await page.getByRole("button", { name: "Open local agent access", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Remember editing choice on this browser", exact: true })
    .check();
  await page.getByRole("checkbox", { name: "Allow editing (includes Undo)", exact: true }).check();
  await page.getByRole("button", { name: "Open local agent access", exact: true }).click();
  await page.getByText("Connected · editing allowed", { exact: true }).waitFor();

  const approve = async () => {
    const started = performance.now();
    if (await page.locator("#local-agent-panel").evaluate((panel) => panel.hidden))
      await page.getByRole("button", { name: "Open local agent access", exact: true }).click();
    const button = page.getByRole("button", { name: "Approve this exact plan", exact: true });
    await button.waitFor({ state: "visible" });
    await button.click();
    return performance.now() - started;
  };
  const proposal = async (revision, recipe, title) => {
    const staged = await call("propose_enclosure", {
      expectedRevision: revision,
      title,
      description:
        "Disposable MCP transport performance fixture; inspect this exact change before approval.",
      waitForPreview: false,
      recipe,
    });
    assert(staged.ok, JSON.stringify(staged));
    let status = staged.value;
    while (status.state === "preview computing") {
      await new Promise((resolvePoll) => setTimeout(resolvePoll, 500));
      const polled = await call("get_proposal", { proposalId: status.id, summaryOnly: true });
      assert(polled.ok, JSON.stringify(polled));
      status = polled.value;
    }
    assert.equal(status.state, "awaiting approval", JSON.stringify(status));
    const approvalMs = await approve();
    const startedApply = await call("apply_approved_proposal", {
      proposalId: staged.value.id,
      waitForApply: false,
    });
    assert(startedApply.ok, JSON.stringify(startedApply));
    status = startedApply.value;
    while (status.state === "applying") {
      await new Promise((resolvePoll) => setTimeout(resolvePoll, 500));
      const polled = await call("get_proposal", { proposalId: status.id, summaryOnly: true });
      assert(polled.ok, JSON.stringify(polled));
      status = polled.value;
    }
    assert.equal(status.state, "applied", JSON.stringify(status));
    return { ...status.result, approvalMs };
  };
  const inspectFinal = async (baseId, lidId) => {
    const result = await call("inspect_enclosure", { baseId, lidId });
    assert(result.ok, JSON.stringify(result));
    return {
      parameters: result.value.parameters,
      features: result.value.features.map((feature) => feature.definition),
      featureSourceCounts: result.value.features.map((feature) => feature.sourceIds.length),
    };
  };
  const oldFlow = async () => {
    const start = performance.now();
    let revision = (await call("scene_summary")).revision;
    let result = await proposal(
      revision,
      { type: "create", parameters: params },
      "Create enclosure",
    );
    revision = result.revision;
    const { base, lid } = result.value.partIds;
    assert((await call("inspect_enclosure", { baseId: base, lidId: lid })).ok);
    result = await proposal(
      revision,
      { type: "feature-set", baseId: base, lidId: lid, definition: cutout },
      "Add wall cutout",
    );
    revision = result.revision;
    const cutoutId = result.value.features.find(
      (feature) => feature.definition.name === cutout.name,
    ).sourceIds[0];
    result = await proposal(
      revision,
      { type: "feature-set", baseId: base, lidId: lid, definition: mounting },
      "Add mounting posts",
    );
    revision = result.revision;
    result = await proposal(
      revision,
      { type: "update", baseId: base, lidId: lid, parameters: finalParams },
      "Resize enclosure",
    );
    revision = result.revision;
    result = await proposal(
      revision,
      { type: "feature-set", baseId: base, lidId: lid, attachmentId: cutoutId, definition: cutout },
      "Update wall cutout",
    );
    const final = await inspectFinal(base, lid);
    assert.deepEqual(final.parameters, finalParams);
    assert.deepEqual(final.features, [cutout, mounting]);
    const browserHeapBytes = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
    return {
      ms: performance.now() - start,
      revision: result.revision,
      baseId: base,
      lidId: lid,
      final,
      browserHeapBytes,
      proposals: 5,
      undoEntries: 5,
    };
  };
  const combinedFlow = async () => {
    const start = performance.now();
    const revision = (await call("scene_summary")).revision;
    const result = await proposal(
      revision,
      { type: "create", parameters: finalParams, features: [cutout, mounting] },
      "Create enclosure with cutout and posts",
    );
    const { base, lid } = result.value.partIds;
    const final = await inspectFinal(base, lid);
    assert.deepEqual(final.parameters, finalParams);
    assert.deepEqual(final.features, [cutout, mounting]);
    const browserHeapBytes = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? null);
    return {
      ms: performance.now() - start,
      revision: result.revision,
      baseId: base,
      lidId: lid,
      final,
      browserHeapBytes,
      proposals: 1,
      undoEntries: 1,
    };
  };
  const undo = async (count, revision) => {
    for (let i = 0; i < count; i++) {
      const result = await call("undo", { expectedRevision: revision });
      assert(result.ok, JSON.stringify(result));
      revision = result.revision;
    }
    return revision;
  };
  const oldRuns = [];
  const combinedRuns = [];
  const failures = [];
  for (let trial = 0; trial < 3; trial++) {
    currentVariant = "combinedCreateProposal";
    try {
      const mark = measurements.length;
      const combined = await combinedFlow();
      combinedRuns.push({ ...combined, toolCalls: measurements.length - mark });
      await undo(combined.undoEntries, combined.revision);
    } catch (error) {
      failures.push({ variant: currentVariant, trial: trial + 1, message: String(error) });
      break;
    }
  }
  if (combinedRuns.length === 3) {
    for (let trial = 0; trial < 3; trial++) {
      currentVariant = "sequentialApprovedRecipes";
      try {
        const mark = measurements.length;
        const old = await oldFlow();
        oldRuns.push({ ...old, toolCalls: measurements.length - mark });
        await undo(old.undoEntries, old.revision);
      } catch (error) {
        failures.push({ variant: currentVariant, trial: trial + 1, message: String(error) });
        break;
      }
    }
  }
  if (oldRuns.length && combinedRuns.length) {
    const firstGeometry = oldRuns[0].final;
    for (const run of [...oldRuns, ...combinedRuns])
      assert.deepEqual(
        run.final,
        firstGeometry,
        "recipe dimensions and feature definitions remain identical",
      );
  }
  const toolGroups = Object.groupBy(measurements, (measurement) => measurement.name);
  const profileEntries = await page.evaluate(() => window.__centraAgentProfile ?? []);
  const profileGroups = Object.groupBy(profileEntries, (entry) => entry.name);
  const result = {
    date: new Date().toISOString(),
    transport:
      "actual local MCP stdio client -> temporary HTTP bridge -> disposable Chromium editor",
    fixture: { parameters: finalParams, features: [cutout, mounting], trials: 3 },
    sequentialApprovedRecipes: {
      flowMs: safeSummary(oldRuns.map((run) => run.ms)),
      mcpToolCallsPerFlow: safeSummary(oldRuns.map((run) => run.toolCalls)),
      approvalCountPerFlow: 5,
      undoEntriesPerFlow: 5,
      proposalPreviewMs: safeSummary(
        measurements
          .filter(
            (item) =>
              item.variant === "sequentialApprovedRecipes" && item.name === "propose_enclosure",
          )
          .map((item) => item.ms),
      ),
      applyMs: safeSummary(
        measurements
          .filter(
            (item) =>
              item.variant === "sequentialApprovedRecipes" &&
              item.name === "apply_approved_proposal",
          )
          .map((item) => item.ms),
      ),
      inspectionMs: safeSummary(
        measurements
          .filter(
            (item) =>
              item.variant === "sequentialApprovedRecipes" && item.name === "inspect_enclosure",
          )
          .map((item) => item.ms),
      ),
    },
    combinedCreateProposal: {
      flowMs: safeSummary(combinedRuns.map((run) => run.ms)),
      mcpToolCallsPerFlow: safeSummary(combinedRuns.map((run) => run.toolCalls)),
      approvalCountPerFlow: 1,
      undoEntriesPerFlow: 1,
      proposalPreviewMs: safeSummary(
        measurements
          .filter(
            (item) =>
              item.variant === "combinedCreateProposal" && item.name === "propose_enclosure",
          )
          .map((item) => item.ms),
      ),
      applyMs: safeSummary(
        measurements
          .filter(
            (item) =>
              item.variant === "combinedCreateProposal" && item.name === "apply_approved_proposal",
          )
          .map((item) => item.ms),
      ),
      inspectionMs: safeSummary(
        measurements
          .filter(
            (item) =>
              item.variant === "combinedCreateProposal" && item.name === "inspect_enclosure",
          )
          .map((item) => item.ms),
      ),
    },
    perToolWallMs: Object.fromEntries(
      Object.entries(toolGroups).map(([name, values]) => [
        name,
        summary(values.map((item) => item.ms)),
      ]),
    ),
    agentInternalsMs: Object.fromEntries(
      Object.entries(profileGroups).map(([name, entries]) => [
        name,
        summary(entries.map((entry) => entry.durationMs)),
      ]),
    ),
    errors: {
      beforeConsentRefusals: measurements.filter(
        (measurement) => !measurement.ok && measurement.variant === "setup",
      ).length,
      duringFlows: measurements.filter(
        (measurement) => !measurement.ok && measurement.variant !== "setup",
      ).length,
    },
    failures,
    browserHeapBytes: {
      sequentialMedian: percentile(
        oldRuns.map((run) => run.browserHeapBytes ?? 0),
        0.5,
      ),
      combinedMedian: percentile(
        combinedRuns.map((run) => run.browserHeapBytes ?? 0),
        0.5,
      ),
    },
    limitations: [
      "Tool wall times include MCP stdio, local HTTP bridge, editor queue and response serialization; the current public protocol does not expose separate queue, validation, cache preparation, transaction or UI refresh timers.",
      "Browser heap is an exposed Chromium estimate, not the editor's tracked source bytes or total process/GPU working set.",
      "Dry-run reports validate generated source caches; they do not evaluate final Boolean mesh topology or physical fit.",
    ],
  };
  await mkdir("outputs/phase-8-6", { recursive: true });
  await writeFile(
    "outputs/phase-8-6/enclosure-mcp-benchmark.json",
    `${JSON.stringify(result, null, 2)}\n`,
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await client?.close().catch(() => {});
  await browser?.close().catch(() => {});
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolveExit) => server.once("exit", resolveExit));
  }
  await rm(temp, { recursive: true, force: true });
}
