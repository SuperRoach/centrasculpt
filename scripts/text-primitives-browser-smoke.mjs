// Run npm run build first. Uses a disposable browser profile and generated text project.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import "./compile-core.mjs";
import { createTextSource } from "../work/test-build/parametric-primitive.mjs";
import { openSculptProject, saveSculptProject } from "../work/test-build/project.mjs";
import { createHeadlessEditor } from "./headless-enclosure.mjs";

const output = resolve(process.argv[2] ?? "work/text-primitives-browser");
await mkdir(output, { recursive: true });
const { layers } = createHeadlessEditor();
try {
  await layers.regeneratePrimitive(
    createTextSource({ text: "LUCAS", letterHeight: 0.42, depth: 0.12, letterSpacing: 0.02 }),
  );
  await writeFile(
    resolve(output, "lucas-nameplate.form"),
    Buffer.from(saveSculptProject(layers.project)),
  );
} finally {
  layers.dispose();
}

const port = 5278;
const url = `http://127.0.0.1:${port}`;
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
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(url)).ok) break;
    } catch (error) {
      if (i === 59) throw error;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: ["--enable-unsafe-swiftshader"],
  });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.locator("#project-file").setInputFiles({
    name: "lucas-nameplate.form",
    mimeType: "application/octet-stream",
    buffer: await readFile(resolve(output, "lucas-nameplate.form")),
  });
  await page.locator('[data-library-action="library:open"]').click();
  await page
    .locator("#project-message")
    .filter({ hasText: /^Opened / })
    .waitFor();
  const panel = page.locator(".primitive-panel").first();
  await page.waitForFunction(() => {
    const panel = document.querySelector(".primitive-panel");
    return (
      panel?.open &&
      panel.querySelector(".primitive-heading strong")?.textContent?.startsWith("Text ·")
    );
  });
  const lighting = page.locator(".lighting-panel").nth(1);
  await page.getByText("World Settings · Lighting", { exact: true }).click();
  assert.match(await lighting.textContent(), /Key Light · main light · casts shadows/);
  assert.match(await lighting.textContent(), /Fill Light · softens shadows/);
  assert.match(await lighting.textContent(), /Rim Light · edge light/);
  assert.match(
    await lighting.textContent(),
    /Inspection Light · temporary orbiting shadow preview/,
  );
  await lighting.locator("details").first().locator(":scope > summary").click();
  assert.equal(await page.getByLabel("Key shadows · Cast shadows").count(), 1);
  const textInput = () => page.getByLabel("Text", { exact: true });
  await textInput().waitFor();
  assert.equal(await textInput().inputValue(), "LUCAS");
  const activeRow = page.locator(".hierarchy-row.active");
  const visibility = activeRow.locator(".layer-visibility");
  await visibility.focus();
  await page.keyboard.press("Space");
  assert.equal(await visibility.getAttribute("aria-pressed"), "false");
  assert(await visibility.evaluate((el) => document.activeElement === el));
  await page.keyboard.press("Space");
  assert.equal(await visibility.getAttribute("aria-pressed"), "true");
  await panel.locator(":scope > summary").click();
  await activeRow.getByRole("button", { name: "Edit Text", exact: true }).focus();
  await page.keyboard.press("Enter");
  assert(await textInput().evaluate((el) => document.activeElement === el));
  await page.screenshot({ path: resolve(output, "text-panel-before-edit.png"), fullPage: true });
  await textInput().fill("LUCAS II");
  await textInput().press("Tab");
  await page.waitForFunction(
    () =>
      document.querySelector('[aria-label="Text"]')?.value === "LUCAS II" &&
      !document.querySelector('.primitive-dimensions [aria-label="depth (mm)"]')?.disabled,
  );
  const depth = () => page.getByLabel("depth (mm)", { exact: true });
  await depth().fill("16");
  await depth().press("Tab");
  await page.waitForFunction(
    () =>
      document.querySelector('.primitive-dimensions [aria-label="depth (mm)"]')?.value === "16" &&
      !document.querySelector('.primitive-dimensions [aria-label="depth (mm)"]')?.disabled,
  );
  assert.equal(await textInput().inputValue(), "LUCAS II");
  await page.screenshot({ path: resolve(output, "text-panel-after-edit.png"), fullPage: true });
  await panel.getByRole("button", { name: "Create new" }).click();
  await panel.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByRole("button", { name: "Move (W)" }).click();
  await page.getByText(/^Move · New text/).waitFor();
  assert.equal(
    await page.locator("#save-project").getAttribute("title"),
    "Save the current project to this browser’s Project Library",
  );
  assert.equal(
    await page.locator("#open-project").getAttribute("title"),
    "Open a native .form project file",
  );
  const exportOpener = page.locator("#open-export");
  await exportOpener.click();
  const exportDialog = page.locator("#export-dialog");
  assert(await exportDialog.evaluate((el) => el.open));
  await page.locator("#export-quality").selectOption("high");
  assert.match(await page.locator("#export-quality-note").textContent(), /simplify flat regions/);
  await page.locator("#close-export").click();
  assert.equal(await page.evaluate(() => document.activeElement?.id), "open-export");
  await page.locator("#project-menu-toggle").focus();
  await page.keyboard.press("Enter");
  const menu = page.locator("#project-menu");
  for (const name of ["Save in Browser", "Open from Library", "Import .form"])
    assert(await menu.getByRole("button", { name, exact: true }).isVisible());
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    menu.getByRole("button", { name: "Download .form", exact: true }).click(),
    page
      .locator("#project-message")
      .filter({ hasText: "Download requested." })
      .waitFor({ timeout: 10000 })
      .catch(async () => {
        throw new Error(
          `Project download status: ${await page.locator("#project-message").textContent()}`,
        );
      }),
  ]);
  assert.match(download.suggestedFilename(), /\.form$/);
  const downloaded = await readFile(await download.path());
  const project = openSculptProject(Uint8Array.from(downloaded).buffer);
  assert(project.layerStack.layers.some((layer) => layer.primitive?.text === "LUCAS II"));
  await page.locator("#project-menu-toggle").click();
  await menu.getByRole("button", { name: "Save in Browser", exact: true }).click();
  await page.locator("#project-message").filter({ hasText: "Saved in this browser." }).waitFor();
  await page.screenshot({ path: resolve(output, "text-draft-move-mode.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#project-menu-toggle").click();
  const menuBounds = await menu.boundingBox();
  assert(menuBounds && menuBounds.x >= 0 && menuBounds.x + menuBounds.width <= 390);
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    menu.getByRole("button", { name: "Import .form", exact: true }).click(),
  ]);
  assert.equal(await chooser.element().getAttribute("accept"), ".form");
  await page.locator("#project-menu-toggle").click();
  await menu.getByRole("button", { name: "Open from Library", exact: true }).click();
  await page.getByRole("dialog", { name: "Project library", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(`Editable text panel passed; screenshots in ${output}`);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
