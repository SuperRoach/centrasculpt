// Run after npm run build. Uses a disposable Chromium profile and local preview.
import "./compile-core.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { IndependentLayers } from "../work/test-build/independent-layers.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { SparseSDFVolume } from "../work/test-build/sparse-sdf.mjs";

const source = new IndependentLayers(
  createBaseProject(new SparseSDFVolume(65, 0.032), {
    mode: "add",
    radius: 0.22,
    strength: 0.8,
    hardness: 0.6,
    camera: { position: [2.4, 1.7, 3.3], target: [0, 0, 0] },
  }),
);
let data, expected;
try {
  source.project.name = "Signed sparse fixture";
  for (const x of [-0.45, 0.45]) {
    source.beginStroke();
    source.applyStrokeLocal({ x, y: 0, z: 0 }, 0.006, "add", 0.8, 1 / 60, 0.6, true);
    source.finishStroke();
  }
  expected = source.active.volume;
  data = saveSculptProject(source.project);
} finally {
  source.dispose();
}

const port = Number(process.env.SPARSE_PERSISTENCE_SMOKE_PORT ?? 5203);
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, [
  "node_modules/vite/bin/vite.js",
  "preview",
  "--host",
  "127.0.0.1",
  "--port",
  String(port),
  "--strictPort",
]);
let browser;
try {
  await new Promise((resolve, reject) => {
    server.stdout.on("data", (data) => {
      if (data.toString().includes(origin)) resolve();
    });
    server.stderr.on("data", (data) => process.stderr.write(data));
    server.on("error", reject);
    server.on("exit", (code) => reject(new Error(`Preview exited (${code})`)));
  });
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await page.locator("#project-file").setInputFiles({
    name: "Signed sparse fixture.form",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(data),
  });
  await page.locator('[data-library-action="library:open"]').click();
  const message = page.locator("#project-message");
  await message.filter({ hasText: /^Opened / }).waitFor();
  await page
    .locator("#rebuild-info")
    .filter({ hasText: `Sparse · ${expected.allocatedPages} pages` })
    .waitFor();
  console.log("PASS: production Library import and sparse worker reopen");

  const menuAction = async (name) => {
    await page.locator("#project-menu-toggle").click();
    await page.locator("#project-menu").getByRole("button", { name, exact: true }).click();
  };
  const verifyDownload = async () => {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      menuAction("Download .form"),
    ]);
    const bytes = await readFile(await download.path());
    assert.equal(bytes.readUInt32LE(8), 25);
    const project = openSculptProject(Uint8Array.from(bytes).buffer);
    const reopened = project.layerStack.layers.find(
      ({ volume }) =>
        volume instanceof SparseSDFVolume && volume.allocatedPages === expected.allocatedPages,
    ).volume;
    assert.deepEqual(reopened.latticeMin, expected.latticeMin);
    assert.deepEqual(reopened.dimensions, expected.dimensions);
    assert.deepEqual(new Map(reopened.residentPages()), new Map(expected.residentPages()));
    return project;
  };
  const imported = await verifyDownload();
  await page.locator("#new-layer-contents").selectOption("sparse");
  await page.locator("#new-layer").click();
  await page.locator("#rebuild-info").filter({ hasText: "Sparse · 0 pages" }).waitFor();
  await menuAction("Save in Browser");
  await message.filter({ hasText: "Saved in this browser." }).waitFor();
  await page.locator("#recovery-available").waitFor({ timeout: 25000 });
  await page.reload();
  const recovery = page.locator("#recovery-available");
  await recovery.waitFor();
  if (!(await recovery.evaluate((details) => details.open)))
    await recovery.locator("summary").click();
  await page.locator("#restore-recovery").click();
  await page.locator("#confirm-recovery").click();
  await message.filter({ hasText: "Recovery restored." }).waitFor();
  const recovered = await verifyDownload();
  assert.equal(recovered.id, imported.id);
  assert.equal(recovered.layerStack.layers.length, 2);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: v25 Library save, portable download, autosave worker and recovery after reload",
  );
} finally {
  await browser?.close();
  server.kill();
}
