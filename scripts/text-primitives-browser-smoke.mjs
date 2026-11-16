// Run npm run build first. Uses a disposable browser profile and generated text project.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import "./compile-core.mjs";
import { createTextSource } from "../work/test-build/parametric-primitive.mjs";
import { saveSculptProject } from "../work/test-build/project.mjs";
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
  await panel.evaluate((el) => (el.open = true));
  await panel.getByRole("button", { name: "Edit selected" }).click();
  const textInput = () => page.getByLabel("Text", { exact: true });
  await textInput().waitFor();
  assert.equal(await textInput().inputValue(), "LUCAS");
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
  await page.screenshot({ path: resolve(output, "text-draft-move-mode.png"), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(`Editable text panel passed; screenshots in ${output}`);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
