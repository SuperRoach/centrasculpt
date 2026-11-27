// Run after npm run build. Use PLAYWRIGHT_CHROMIUM_EXECUTABLE for system Chrome.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const port = Number(process.env.SPARSE_SMOKE_PORT ?? 5199);
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
  await page.locator("#new-layer-contents").selectOption("sparse");
  await page.locator("#new-layer").click();
  const mesh = page.locator("#mesh-info");
  await mesh.filter({ hasText: "Sparse trial" }).waitFor();
  await page.getByRole("button", { name: "Shape", exact: true }).click();
  await page.getByLabel("Follow pointer on visible surfaces").uncheck();
  await page.locator("#stamp-shape-overlay").click();
  await page.getByText("Shape stamped · one undo action", { exact: true }).waitFor();

  await page.locator("#undo").click();
  await page.locator("#redo").click();
  await page.getByRole("button", { name: "Shape", exact: true }).click();
  await page.locator("#bake-layers").click();
  assert.equal(await page.getByLabel("Use experimental sparse storage").isChecked(), false);
  await page.getByLabel("Use experimental sparse storage").check();
  await page.locator("#bake-resolution").selectOption("64");
  await page.locator("#bake-name").fill("Sparse smoke bake");
  await page.locator("#confirm-bake").click();
  await page.getByText("Baked Sparse smoke bake · ready to sculpt", { exact: true }).waitFor();
  await mesh.filter({ hasText: "Sparse trial" }).waitFor();
  await page.locator("#undo").click();
  await page.locator("#redo").click();
  await mesh.filter({ hasText: "Sparse trial" }).waitFor();

  await page.locator("#personal-shapes").click();
  const library = page.getByRole("dialog", { name: "Personal Shapes", exact: true });
  await library.getByRole("button", { name: "Save selected as Shape", exact: true }).click();
  await library.getByRole("textbox", { name: "Shape name" }).fill("Sparse smoke master");
  await library.getByRole("button", { name: "Save Shape", exact: true }).click();
  await library.getByRole("heading", { name: "Sparse smoke master" }).waitFor();
  await library.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator("#new-layer").click();
  await page.locator("#rebuild-info").filter({ hasText: "Sparse · 0 pages" }).waitFor();
  await page.locator("#personal-shapes").click();
  await library.getByRole("button", { name: "Use as Stamp", exact: true }).click();
  await library.waitFor({ state: "hidden" });
  await page.locator("#shape-description").filter({ hasText: "Sparse smoke master" }).waitFor();
  await page.getByLabel("Follow pointer on visible surfaces").uncheck();
  await page.getByLabel("Shape position X", { exact: true }).fill("0");
  await page.getByLabel("Shape uniform scale", { exact: true }).fill("0.35");
  await page.locator("#stamp-shape-overlay").click();
  await page.getByText("Shape stamped · one undo action", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: production sparse analytic and Personal Stamp, Bake opt-in, Undo/Redo and diagnostics",
  );
} finally {
  await browser?.close();
  server.kill();
}
