import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const directory = resolve(process.argv[2] ?? "work/phase-8-9");
const files = (await readdir(directory)).filter((file) => /-(legacy|compact)\.form$/.test(file));
assert(files.length, "Run the native codec benchmark to prepare comparable archives first.");
const port = process.env.CENTRA_ANALYTIC_BENCH_PORT ?? "5287";
const origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", port, "--strictPort"],
  { stdio: "inherit", env: { ...process.env, VITE_CENTRA_ANALYTIC_PROJECTS: "1" } },
);
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100 && !ready; attempt++) {
    if (server.exitCode !== null) throw new Error("Vite exited before the benchmark could start.");
    ready = await fetch(origin).then(
      (response) => response.ok,
      () => false,
    );
    if (!ready) await new Promise((done) => setTimeout(done, 100));
  }
  assert(ready, "Vite did not start");
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: ["--enable-precise-memory-info"],
  });
  const page = await browser.newPage();
  await page.route(origin + "/analytic-benchmark", (route) =>
    route.fulfill({ contentType: "text/html", body: '<input type="file" id="source">' }),
  );
  await page.goto(origin + "/analytic-benchmark");
  const rows = [];
  for (const file of files) {
    await page.locator("#source").setInputFiles(resolve(directory, file));
    const row = await page.evaluate(async (fixture) => {
      const [
        { prepareLibrary },
        { hydrateProject },
        { describeNative, renameNative },
        { ProjectLibrary },
        { checksum },
        { IndexedRecoveryStore },
      ] = await Promise.all([
        import("/src/library-worker-client.ts"),
        import("/src/project-transfer.ts"),
        import("/src/library-codec.ts"),
        import("/src/project-library.ts"),
        import("/src/project-snapshot.ts"),
        import("/src/recovery-store.ts"),
      ]);
      const data = await document.querySelector("#source").files[0].arrayBuffer();
      const library = new ProjectLibrary(indexedDB, fixture + "-library");
      const recovery = new IndexedRecoveryStore(indexedDB, fixture + "-recovery");
      await recovery.setEnabled(true);
      const signal = new AbortController().signal;
      const record = describeNative(data, fixture);
      const trials = [];
      try {
        for (let i = -1; i < 5; i++) {
          const tasks = [];
          const observer = new PerformanceObserver((list) =>
            tasks.push(...list.getEntries().map((entry) => entry.duration)),
          );
          observer.observe({ type: "longtask" });
          let lastTick = performance.now();
          let maxTimerGapMs = 0;
          let peakRendererHeapBytes = performance.memory?.usedJSHeapSize ?? 0;
          const timer = setInterval(() => {
            const now = performance.now();
            maxTimerGapMs = Math.max(maxTimerGapMs, now - lastTick);
            peakRendererHeapBytes = Math.max(
              peakRendererHeapBytes,
              performance.memory?.usedJSHeapSize ?? 0,
            );
            lastTick = now;
          }, 8);
          try {
            const bytes = data.slice(0);
            const started = performance.now();
            let throughLastLayerMs = 0;
            const result = await prepareLibrary(
              { kind: "decode", data: bytes },
              signal,
              (done, total) => {
                if (done === total) throughLastLayerMs = performance.now() - started;
              },
            );
            const candidate = hydrateProject(result.snapshot);
            if (candidate.id !== record.id) throw new Error("Incorrect project identity");
            const openMs = performance.now() - started;
            let phaseStart = performance.now();
            const copy = renameNative(data, "Benchmark duplicate", true);
            await library.put(describeNative(copy, "Benchmark duplicate"), copy, null);
            const duplicateMs = performance.now() - phaseStart;
            await recovery.write(
              {
                id: "checkpoint",
                format: 1,
                projectId: record.id,
                projectName: fixture,
                createdAt: Date.now(),
                revision: String(i),
                bytes: data.byteLength,
                checksum: checksum(data),
              },
              data,
              signal,
            );
            phaseStart = performance.now();
            const restored = await recovery.read("checkpoint");
            if (checksum(restored.data) !== restored.record.checksum)
              throw new Error("Bad checksum");
            const saved = await prepareLibrary({ kind: "decode", data: restored.data }, signal);
            if (hydrateProject(saved.snapshot).id !== candidate.id)
              throw new Error("Incorrect recovery identity");
            const recoveryMs = performance.now() - phaseStart;
            await new Promise((done) => setTimeout(done, 16));
            tasks.push(...observer.takeRecords().map((entry) => entry.duration));
            if (i >= 0)
              trials.push({
                openMs,
                throughLastLayerMs,
                duplicateMs,
                recoveryMs,
                maxTimerGapMs,
                longTasks: tasks.length,
                maxLongTaskMs: Math.max(0, ...tasks),
                peakRendererHeapBytes,
              });
          } finally {
            clearInterval(timer);
            observer.disconnect();
          }
        }
      } finally {
        recovery.close();
        library.close();
      }
      return { fixture, bytes: data.byteLength, version: record.version, trials };
    }, file);
    row.summary = Object.fromEntries(
      Object.keys(row.trials[0]).map((key) => {
        const values = row.trials.map((trial) => trial[key]).sort((a, b) => a - b);
        return [key, { median: values[2], p95: values[4] }];
      }),
    );
    console.log(JSON.stringify({ ...row, trials: undefined }));
    rows.push(row);
  }
  const fullFixture = resolve(directory, "electronics-default-20-compact.form");
  await page.locator("#source").setInputFiles(fullFixture);
  const expected = await page.evaluate(async () => {
    const { IndexedRecoveryStore } = await import("/src/recovery-store.ts");
    const { checksum } = await import("/src/project-snapshot.ts");
    const { describeNative } = await import("/src/library-codec.ts");
    const data = await document.querySelector("#source").files[0].arrayBuffer();
    const record = describeNative(data, "Phase 8.9 enclosure");
    const store = new IndexedRecoveryStore(indexedDB, "centra-sculpt-recovery-test");
    try {
      await store.setEnabled(true);
      await store.write(
        {
          id: "phase-8-9-browser",
          format: 1,
          projectId: record.id,
          projectName: record.name,
          createdAt: Date.now(),
          revision: "disposable browser recovery test",
          bytes: record.bytes,
          checksum: checksum(data),
        },
        data,
        new AbortController().signal,
      );
      return record;
    } finally {
      store.close();
    }
  });
  await page.goto(origin + "/?recoveryFixture=lab");
  await page
    .locator("#recovery-selection option")
    .filter({ hasText: "Phase 8.9 enclosure" })
    .waitFor({ state: "attached", timeout: 30000 });
  await page.locator("#recovery-available").evaluate((details) => {
    details.open = true;
  });
  await page.getByRole("button", { name: "Restore selected checkpoint" }).click();
  const restoreStarted = performance.now();
  await page.locator("#confirm-recovery").click();
  await page
    .locator("#project-message")
    .filter({ hasText: "Recovery restored." })
    .waitFor({ timeout: 120000 });
  const fullEditorRestoreMs = performance.now() - restoreStarted;
  await page.getByRole("button", { name: "Centra Sculpt project menu" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 45000 }),
    page.getByRole("button", { name: "Download .form", exact: true }).click(),
  ]);
  const restoredBytes = await readFile(await download.path());
  const restoredMetadata = JSON.parse(
    restoredBytes.subarray(16, 16 + restoredBytes.readUInt32LE(12)),
  );
  assert.equal(restoredBytes.readUInt32LE(8), 24);
  assert.equal(restoredMetadata.id, expected.id);
  assert.equal(restoredMetadata.layers.length, 20);
  assert.equal(restoredMetadata.displayPreferences.components.length, 3);
  const fullEditorRecovery = {
    fullEditorRestoreMs,
    resaveBytes: restoredBytes.length,
    version: 24,
    layers: 20,
    componentReferences: 3,
    sameProjectId: true,
  };
  console.log(JSON.stringify({ fullEditorRecovery }));
  await writeFile(
    resolve(directory, "browser-benchmark.json"),
    JSON.stringify(
      {
        methodology:
          "Chromium with warmed Vite modules, one warmup and five trials per archive. Worker startup, native validation, transfer and hydration are inside open time. No viewport meshing. Real disposable Chromium IndexedDB for duplicate and recovery. Renderer JS heap is sampled by the heartbeat and excludes worker and GPU allocations.",
        chromium: browser.version(),
        fullEditorRecovery,
        rows,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  server.kill();
}
