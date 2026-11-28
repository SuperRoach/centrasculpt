// Uses a disposable WebGL browser profile and simulated XR pose updates.
import "./compile-core.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { createBaseProject, SdfLayer } from "../work/test-build/layers.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { SparseSDFVolume } from "../work/test-build/sparse-sdf.mjs";

const port = Number(process.env.SPARSE_MOVE_SMOKE_PORT ?? 5209);
const origin = `http://127.0.0.1:${port}`;
const startServer = (command = []) =>
  spawn(process.execPath, [
    "node_modules/vite/bin/vite.js",
    ...command,
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ]);
const waitServer = (server) =>
  new Promise((resolve, reject) => {
    server.stdout.on("data", (data) => {
      if (data.toString().includes(origin)) resolve();
    });
    server.stderr.on("data", (data) => process.stderr.write(data));
    server.on("error", reject);
    server.on("exit", (code) => reject(new Error(`Vite exited (${code})`)));
  });
let server = startServer(),
  browser;
try {
  await waitServer(server);
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const has = (selector, hasText) => page.locator(selector).filter({ hasText }).waitFor();
  for (const mirrored of [false, true]) {
    await page.goto(
      `${origin}/scripts/persistent-move-browser.html?sparse${mirrored ? "&mirror" : ""}`,
    );
    await has("#check", "PASS");
    await has("#state", "hold Tool trigger");
    await page.locator("#grab").click();
    await page.locator("#pull").click();
    await page.locator("#commit").click();
    await has("#state", "Move committed");
    await has("#metrics", '"backend":"worker"');
    await page.locator("#verify").click();
    await has("#check", "committed source changed");
    await page.locator("#undo").click();
    await has("#check", "0 undo / 1 redo");
    await page.locator("#redo").click();
    await has("#check", "1 undo / 0 redo");
    await has("#check", "PASS");
    console.log(
      `PASS: browser WebGL preview, ${mirrored ? "mirrored " : ""}sparse Move worker, Undo/Redo and v25 roundtrip`,
    );
  }
  const exited = new Promise((resolve) => server.once("exit", resolve));
  server.kill();
  await exited;
  server = startServer(["preview"]);
  await waitServer(server);

  const cutSource = new SparseSDFVolume(33);
  cutSource.brush({ x: 0, y: 0, z: 0 }, 0.55, "add", 0.8, undefined, 0.6, true);
  const project = createBaseProject(cutSource, {
    mode: "add",
    radius: 0.22,
    strength: 0.8,
    hardness: 0.6,
    camera: { position: [2.4, 1.7, 3.3], target: [0, 0, 0] },
  });
  project.layerStack.insert(new SdfLayer(new SDFVolume(33), { name: "Dense control" }));
  const original = saveSculptProject(project);
  await page.goto(origin);
  await page.locator("#project-file").setInputFiles({
    name: "Sparse Plane Cut.form",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(original),
  });
  await page.locator('[data-library-action="library:open"]').click();
  await has("#project-message", /^Opened /);
  await page.locator("#cut-plane").click();
  await page.locator("#cut-scope").selectOption("all-editable");
  await page.locator("#cut-apply").click();
  await has("#cut-preview-status", "Cut complete");
  await page.keyboard.press("Escape");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    (async () => {
      await page.locator("#project-menu-toggle").click();
      await page
        .locator("#project-menu")
        .getByRole("button", { name: "Download .form", exact: true })
        .click();
    })(),
  ]);
  const bytes = await readFile(await download.path());
  assert.equal(bytes.readUInt32LE(8), 25);
  const opened = openSculptProject(Uint8Array.from(bytes).buffer);
  assert.equal(opened.layerStack.layers.length, 4);
  assert(
    opened.layerStack.layers.every(({ volume }) =>
      volume instanceof SparseSDFVolume
        ? volume.hasInterior()
        : volume.values.some((value) => value < 0),
    ),
  );
  assert.equal(
    opened.layerStack.layers.filter(({ volume }) => volume instanceof SparseSDFVolume).length,
    2,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: production Cut All of Library-imported mixed sources and four-piece v25 download",
  );
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) {
    for (const selector of ["#state", "#check", "#metrics", "#cut-error"]) {
      const item = page.locator(selector);
      if (await item.count()) console.error(selector, await item.textContent());
    }
  }
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
