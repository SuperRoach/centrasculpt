// Run npm run build first. Uses a disposable Chromium context.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { DEFAULT_ENCLOSURE } from "../work/test-build/enclosure-recipe.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { createHeadlessEditor } from "./headless-enclosure.mjs";

const { layers, api } = createHeadlessEditor();
const fixture = await api.enclosure.create(
  { ...DEFAULT_ENCLOSURE, innerWidthMm: 110, innerDepthMm: 75, innerHeightMm: 28 },
  { expectedRevision: api.revision },
);
assert(fixture.ok, JSON.stringify(fixture));
const native = Buffer.from(saveSculptProject(layers.project));
layers.dispose();

const port = "5279";
const url = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    port,
    "--strictPort",
  ],
  { stdio: "inherit" },
);
let browser;
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch (error) {
      if (attempt === 59) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: ["--enable-unsafe-swiftshader"],
  });
  const errors = [];
  async function newPage() {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url);
    return page;
  }
  const page = await newPage();
  async function open(page, buffer) {
    await page.locator("#project-file").setInputFiles({
      name: "components.form",
      mimeType: "application/octet-stream",
      buffer,
    });
    await page.locator('[data-library-action="library:open"]').click();
    const status = page.locator("#project-message");
    await status
      .filter({ hasText: /^Opened / })
      .waitFor({ timeout: 120000 })
      .catch(async (error) => {
        throw new Error(`Project reopen: ${await status.textContent()}`, { cause: error });
      });
  }
  await open(page, native);
  const references = page.locator("#reference-panel");
  const panel = page.locator("#component-panel");
  for (const details of [references, panel]) {
    if (!(await details.evaluate((el) => el.open)))
      await details.locator(":scope > summary").click();
  }
  const button = (name) => panel.getByRole("button", { name, exact: true });
  for (const preset of ["pcb", "tactile", "pi4"]) {
    await panel.getByLabel("Component preset").selectOption(preset);
    await button("Insert component").click();
  }
  const [base] = await panel
    .getByLabel("Attach to enclosure part")
    .selectOption({ label: "Enclosure Base" });
  await button("Apply placement").click();
  await panel.getByLabel("Underside gap (mm)").fill("5.5");
  await button("Snap to enclosure surface").click();
  await button("Preview mounting posts").click();
  await panel.getByRole("status").filter({ hasText: "Showing Pi 4 mounting posts" }).waitFor();
  await button("Cancel mounting preview").click();
  assert(await button("Create mounting posts").isDisabled());
  await button("Preview mounting posts").click();
  await panel.getByRole("status").filter({ hasText: "Showing Pi 4 mounting posts" }).waitFor();
  await button("Create mounting posts").click();
  await panel
    .getByRole("status")
    .filter({ hasText: "Attachment applied" })
    .waitFor({ timeout: 120000 })
    .catch(async (error) => {
      throw new Error(`Mounting confirmation: ${await panel.getByRole("status").textContent()}`, {
        cause: error,
      });
    });
  await page.locator("#project-menu-toggle").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .locator("#project-menu")
      .getByRole("button", { name: "Download .form", exact: true })
      .click(),
  ]);
  const bytes = await readFile(await download.path());
  const result = openSculptProject(Uint8Array.from(bytes).buffer);
  assert.deepEqual(
    result.displayPreferences.components.map((item) => item.preset),
    ["pcb", "tactile", "pi4"],
  );
  const pi = result.displayPreferences.components[2];
  assert.equal(pi.hostId, base);
  assert.equal(pi.gapMm, 5.5);
  const part = result.layerStack.get(base).assemblyPart.enclosure;
  assert.equal(part.features[0].definition.heightMm, 5.5);
  assert.deepEqual(part.features[0].definition.centresMm, [
    [-39, -24.5],
    [-39, 24.5],
    [19, -24.5],
    [19, 24.5],
  ]);
  await page.context().close();
  const reopened = await newPage();
  await open(reopened, bytes);
  const reopenedComponents = reopened.locator("#component-panel");
  await reopenedComponents
    .getByLabel("Project component")
    .locator("option")
    .filter({ hasText: "Raspberry Pi 4 Model B ·" })
    .waitFor({ state: "attached" });
  assert.equal(
    await reopenedComponents.getByLabel("Project component").locator("option").count(),
    3,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: component insertion, attachment, gap, cancelled preview, confirmed mounting posts and native round-trip",
  );
} finally {
  await browser?.close();
  server.kill();
}
