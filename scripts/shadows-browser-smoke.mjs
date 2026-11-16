import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";

const output = resolve(process.argv[2] ?? "work/shadows-browser");
await mkdir(output, { recursive: true });
const port = 5279;
const url = `http://127.0.0.1:${port}/scripts/fixtures/shadows.html`;
const server = spawn(process.execPath, [
  "node_modules/vite/bin/vite.js",
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
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.waitForFunction(() => typeof window.runShadowFixture === "function");
  const on = await page.evaluate(() => window.runShadowFixture(true));
  assert.equal(on.enabled, true);
  assert.deepEqual(on.map, [1024, 1024]);
  assert.equal(on.keyCasts, true);
  assert.equal(on.fillCasts, false);
  assert.equal(on.rimCasts, false);
  assert.equal(on.bodyReceives, true);
  assert.equal(on.floorReceives, true);
  assert(on.calls > 0 && on.triangles > 0);
  assert.equal(on.glError, 0);
  await page.screenshot({ path: resolve(output, "key-shadow-on.png") });
  const off = await page.evaluate(() => window.runShadowFixture(false));
  assert.equal(off.enabled, false);
  assert.equal(off.keyCasts, false);
  assert.equal(off.bodyReceives, false);
  assert.equal(off.floorReceives, true);
  assert.equal(off.glError, 0);
  assert.deepEqual(errors, []);
  console.log(`Key shadow WebGL fixture passed; screenshots in ${output}`);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
