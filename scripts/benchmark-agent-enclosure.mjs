// Disposable localhost editors with actual stdio MCP transport and isolated project storage.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { chromium } from "@playwright/test";

const trials = 5;
const scenarios = process.argv.includes("--scenarios");
const fullStatus = process.argv.includes("--full-status");
const referenceMeshScheduling = process.argv.includes("--reference-mesh-scheduling");
const warmups = 1;
const reportPath = resolve(
  process.env.AGENT_BENCHMARK_REPORT ?? join(tmpdir(), "centra-enclosure-mcp.json"),
);
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
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", `${port}`, "--strictPort"],
  {
    env: {
      ...process.env,
      CENTRA_AGENT: "1",
      CENTRA_AGENT_PROFILE: "1",
      CENTRA_AGENT_DISCOVERY_FILE: sessionPath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
const parseProfile = (line) => {
  const prefix = "[centra-agent-profile] ";
  return line.startsWith(prefix) ? JSON.parse(line.slice(prefix.length)) : undefined;
};
const bridgeProfile = [];
const bridgeLogs = createInterface({ input: server.stdout });
bridgeLogs.on("line", (line) => {
  const entry = parseProfile(line);
  if (entry) bridgeProfile.push(entry);
});
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
  let calls = [];
  let mcpProfile = [];
  let proposalTimings = [];
  const call = async (name, args = {}) => {
    const start = performance.now();
    const message = { name, arguments: args };
    const requestBytes = Buffer.byteLength(JSON.stringify(message));
    const response = await client.callTool(message);
    calls.push({
      name,
      variant: currentVariant,
      ms: performance.now() - start,
      requestBytes,
      responseBytes: Buffer.byteLength(JSON.stringify(response)),
      ok: response.structuredContent?.ok === true,
    });
    console.info(
      `[${currentVariant}] ${name} ${calls.at(-1).ok ? "ok" : response.structuredContent?.error?.code} ${calls.at(-1).ms.toFixed(1)} ms`,
    );
    return response.structuredContent;
  };
  let page;
  const connect = async () => {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.goto(origin);
    await page.evaluate((reference) => {
      window.__centraAgentProfileEnabled = true;
      window.__centraAgentProfileReferenceMeshScheduling = reference;
      window.__centraAgentProfile = [];
    }, referenceMeshScheduling);
    await page.getByRole("button", { name: "Open local agent access", exact: true }).click();
    await page.getByRole("button", { name: "Approve connection", exact: true }).waitFor();
    client = new Client({ name: "centra-enclosure-benchmark", version: "1" });
    mcpProfile = [];
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve("scripts/agent-mcp.mjs")],
      env: {
        ...process.env,
        CENTRA_AGENT_DISCOVERY_FILE: sessionPath,
        CENTRA_AGENT_PROFILE: "1",
      },
      stderr: "pipe",
    });
    createInterface({ input: transport.stderr }).on("line", (line) => {
      const entry = parseProfile(line);
      if (entry) mcpProfile.push(entry);
    });
    await client.connect(transport);
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
    await page
      .getByRole("checkbox", { name: "Allow editing (includes Undo)", exact: true })
      .check();
    await page.getByRole("button", { name: "Open local agent access", exact: true }).click();
    await page.getByText("Connected · editing allowed", { exact: true }).waitFor();
  };
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
    const deadline = Date.now() + 120000;
    let pollingDelayMs = 0;
    let status = staged.value;
    while (status.state === "preview computing") {
      assert(Date.now() < deadline, `Proposal ${status.id} timed out in ${status.state}`);
      const sleepStarted = performance.now();
      await new Promise((resolvePoll) => setTimeout(resolvePoll, 500));
      pollingDelayMs += performance.now() - sleepStarted;
      const polled = await call("get_proposal", {
        proposalId: status.id,
        summaryOnly: !fullStatus,
      });
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
      assert(Date.now() < deadline, `Proposal ${status.id} timed out in ${status.state}`);
      const sleepStarted = performance.now();
      await new Promise((resolvePoll) => setTimeout(resolvePoll, 500));
      pollingDelayMs += performance.now() - sleepStarted;
      const polled = await call("get_proposal", {
        proposalId: status.id,
        summaryOnly: !fullStatus,
      });
      assert(polled.ok, JSON.stringify(polled));
      status = polled.value;
    }
    assert.equal(status.state, "applied", JSON.stringify(status));
    proposalTimings.push({ approvalMs, pollingDelayMs });
    return status.result;
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
  const typicalFeatures = [
    cutout,
    { ...cutout, name: "Rear port", anchor: "enclosure.base.wall.back", uMm: -2 },
    { ...mounting, centresMm: [...mounting.centresMm, [-4, 4], [4, 4]] },
  ];
  const createFlow = async (features, edit = false, addMounts = false) => {
    const start = performance.now();
    const scene = await call("scene_summary");
    assert(scene.ok, JSON.stringify(scene));
    const initial = await proposal(
      scene.revision,
      {
        type: "create",
        parameters: edit ? params : finalParams,
        features: addMounts ? features.slice(0, -1) : features,
      },
      "Create enclosure fixture",
    );
    const { base: baseId, lid: lidId } = initial.value.partIds;
    let revision = initial.revision;
    let expectedFeatures = features;
    if (addMounts) {
      const mounted = await proposal(
        revision,
        { type: "feature-set", baseId, lidId, definition: features.at(-1) },
        "Add four bored mounting posts",
      );
      revision = mounted.revision;
    }
    if (edit) {
      const initialFeatures = initial.value.features;
      const resized = await proposal(
        revision,
        { type: "update", baseId, lidId, parameters: finalParams },
        "Resize enclosure fixture",
      );
      assert.deepEqual(
        resized.value.features.map((feature) => feature.sourceIds),
        initialFeatures.map((feature) => feature.sourceIds),
      );
      const definition = { ...cutout, uMm: -1, widthMm: 5, heightMm: 5 };
      const moved = await proposal(
        resized.revision,
        {
          type: "feature-set",
          baseId,
          lidId,
          attachmentId: initialFeatures[0].sourceIds[0],
          definition,
        },
        "Resize and move front opening",
      );
      assert.deepEqual(
        moved.value.features.map((feature) => feature.sourceIds),
        initialFeatures.map((feature) => feature.sourceIds),
      );
      revision = moved.revision;
      expectedFeatures = [definition, ...features.slice(1)];
    }
    const final = await inspectFinal(baseId, lidId);
    assert.deepEqual(final.parameters, finalParams);
    assert.deepEqual(final.features, expectedFeatures);
    assert.deepEqual(
      final.featureSourceCounts,
      expectedFeatures.map((feature) =>
        feature.kind === "cutout" ? 1 : feature.centresMm.length * 2,
      ),
    );
    return {
      ms: performance.now() - start,
      revision,
      baseId,
      lidId,
      final,
      proposals: edit ? 3 : addMounts ? 2 : 1,
      undoEntries: edit ? 3 : addMounts ? 2 : 1,
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
  const verifyRoundTrip = async (run) => {
    for (let i = 0; i < run.undoEntries; i++) {
      await page.locator("#redo").click();
    }
    const read = () => call("inspect_enclosure", { baseId: run.baseId, lidId: run.lidId });
    const restored = await read();
    assert(restored.ok, JSON.stringify(restored));
    assert.deepEqual(restored.value.parameters, run.final.parameters);
    assert.deepEqual(
      restored.value.features.map((feature) => feature.definition),
      run.final.features,
    );
    if (!(await page.locator("#local-agent-panel").evaluate((panel) => panel.hidden)))
      await page.getByRole("button", { name: "Dismiss agent access", exact: true }).click();
    await page.getByRole("button", { name: "Centra Sculpt project menu", exact: true }).click();
    const downloaded = page.waitForEvent("download", { timeout: 30000 });
    await page.getByRole("button", { name: "Download .form", exact: true }).click();
    const download = await downloaded;
    assert.match(download.suggestedFilename(), /\.form$/);
    const formPath = join(temp, "round-trip.form");
    await download.saveAs(formPath);
    await page.locator("#project-file").setInputFiles(formPath);
    const library = page.getByRole("dialog", { name: "Project library" });
    await library.getByRole("button", { name: "Open project", exact: true }).click();
    const discard = library.getByRole("button", { name: "Discard edits & continue", exact: true });
    await discard.click();
    await library.waitFor({ state: "hidden", timeout: 60000 });
    const objects = await call("list_objects");
    assert(objects.ok, JSON.stringify(objects));
    const baseId = objects.value.find((object) => object.name === `${params.name} Base`).id;
    const lidId = objects.value.find((object) => object.name === `${params.name} Lid`).id;
    assert.deepEqual(await inspectFinal(baseId, lidId), run.final);
  };
  const oldRuns = [];
  const combinedRuns = [];
  const failures = [];
  const profileEntries = [];
  const basicRuns = [];
  const typicalRuns = [];
  const editRuns = [];
  const workflows = scenarios
    ? [
        ["basicEnclosure", () => createFlow([]), basicRuns],
        [
          "typicalElectronicsEnclosure",
          () => createFlow(typicalFeatures, false, true),
          typicalRuns,
        ],
        ["editEnclosure", () => createFlow([cutout, mounting], true), editRuns],
      ]
    : fullStatus
      ? [["combinedCreateFullStatus", combinedFlow, combinedRuns]]
      : [
          ["combinedCreateProposal", combinedFlow, combinedRuns],
          ["sequentialApprovedRecipes", oldFlow, oldRuns],
        ];
  for (let trial = 0; trial < trials + warmups; trial++) {
    for (const [variant, runFlow, runs] of workflows) {
      currentVariant = "setup";
      let sampler;
      calls = [];
      try {
        await connect();
        const cdp = await page.context().newCDPSession(page);
        let peakHeapBytes = 0;
        let track = true;
        const sample = async () => {
          const { usedSize } = await cdp.send("Runtime.getHeapUsage");
          peakHeapBytes = Math.max(peakHeapBytes, usedSize);
        };
        await sample();
        sampler = setInterval(() => {
          if (track) void sample().catch(() => {});
        }, 500);
        calls = [];
        mcpProfile = [];
        proposalTimings = [];
        const bridgeMark = bridgeProfile.length;
        currentVariant = variant;
        const run = await runFlow();
        track = false;
        clearInterval(sampler);
        await sample();
        const entries = await page.evaluate(() => window.__centraAgentProfile ?? []);
        const measuredCalls = calls;
        const measuredMcp = mcpProfile;
        const measuredBridge = bridgeProfile.slice(bridgeMark);
        calls = [];
        mcpProfile = [];
        assert(
          measuredCalls.every((item) => item.ok),
          "A measured tool call failed",
        );
        currentVariant = "verification";
        assert.match(
          await page.locator("#history-info").textContent(),
          new RegExp(`^${run.undoEntries} undo · 0 redo$`),
        );
        await undo(run.undoEntries, run.revision);
        const scene = await call("scene_summary");
        assert(scene.ok && scene.value.objects === 1, "Undo must restore the starting scene");
        if (scenarios && trial === 0) await verifyRoundTrip(run);
        if (trial >= warmups) {
          runs.push({
            ...run,
            toolCalls: measuredCalls.length,
            peakHeapBytes,
            calls: measuredCalls,
            transportProfile: { mcp: measuredMcp, bridge: measuredBridge },
            editorProfile: entries,
            proposalTimings,
          });
          measurements.push(...measuredCalls);
          profileEntries.push(...entries.map((entry) => ({ ...entry, variant, trial })));
        }
      } catch (error) {
        failures.push({ variant, trial, warmup: trial < warmups, message: String(error) });
        console.error(failures.at(-1));
      } finally {
        clearInterval(sampler);
        await client?.close().catch(() => {});
        client = undefined;
        await page
          ?.context()
          .close()
          .catch(() => {});
        page = undefined;
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
  const profileGroups = Object.groupBy(profileEntries, (entry) => entry.name);
  const result = {
    date: new Date().toISOString(),
    referenceMeshScheduling,
    fullStatus,
    transport:
      "actual local MCP stdio client -> temporary HTTP bridge -> disposable Chromium editor",
    fixture: {
      parameters: finalParams,
      features: scenarios ? typicalFeatures : [cutout, mounting],
      trials,
      warmups,
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
    workflows: Object.fromEntries(
      workflows.map(([variant, , runs]) => [
        variant,
        {
          wallMs: safeSummary(runs.map((run) => run.ms)),
          calls: safeSummary(runs.map((run) => run.toolCalls)),
          peakHeapBytes: safeSummary(runs.map((run) => run.peakHeapBytes)),
          approvals: runs[0]?.proposals ?? null,
          undoEntries: runs[0]?.undoEntries ?? null,
          runs,
        },
      ]),
    ),
    failures,
    limitations: [
      "Editor timings overlap batch, recipe, and JS job spans. Subtract recorded yields from cache and mesh wall time to estimate active elapsed time; this is not process CPU time.",
      "Peak sampled Chromium JavaScript heap excludes native and GPU allocations and may miss peaks between 500 ms samples.",
      "Dry-run reports validate generated source caches; they do not evaluate final Boolean mesh topology or physical fit.",
    ],
  };
  await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Report: ${reportPath}`);
  if (failures.length || workflows.some(([, , runs]) => runs.length !== trials))
    process.exitCode = 1;
} finally {
  await client?.close().catch(() => {});
  await browser?.close().catch(() => {});
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolveExit) => server.once("exit", resolveExit));
  }
  await rm(temp, { recursive: true, force: true });
}
