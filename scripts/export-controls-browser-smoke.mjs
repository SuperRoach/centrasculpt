// Run npm run build first. Synthetic native input and disposable browser profiles only.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import "./compile-core.mjs";
import { createBaseProject } from "../work/test-build/layers.mjs";
import { saveSculptProject } from "../work/test-build/project.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";
import { validatePrintMesh } from "../work/test-build/stl-export.mjs";

await mkdir("work/export-controls", { recursive: true });
const output = await mkdtemp("work/export-controls/run-");
const volume = new SDFVolume(65, 1.6, false);
for (let z = 0; z < 65; z++)
  for (let y = 0; y < 65; y++)
    for (let x = 0; x < 65; x++) {
      const py = volume.coordinate(y);
      volume.values[volume.index(x, y, z)] =
        Math.hypot(volume.coordinate(x) + 0.15 * Math.sin(py * 4), py, volume.coordinate(z)) - 0.85;
    }
const native = new Uint8Array(
  saveSculptProject(
    createBaseProject(volume, {
      mode: "add",
      radius: 0.22,
      hardness: 0.5,
      strength: 0.35,
      camera: { position: [2, 2, 3], target: [0, 0, 0] },
    }),
  ),
);
const file = `${output}/curved.form`;
await writeFile(file, native);
await chmod(file, 0o444);
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "5250",
    "--strictPort",
  ],
  { stdio: "ignore" },
);
let browser, page;
async function openExport(p) {
  await p.locator("#open-export").click();
  await p.locator("#export-format").selectOption("stl");
  await p.locator("#export-quality").selectOption("high");
  await p.locator("#export-advanced").evaluate((el) => {
    el.open = true;
  });
}
async function prepare(p, button, name) {
  await p.locator(button).click();
  await p.waitForFunction(
    () =>
      document.querySelector("#export-download")?.getAttribute("href") ||
      document.querySelector("#export-result [role=alert]")?.textContent?.includes("Export failed"),
    undefined,
    { timeout: 180000 },
  );
  assert.equal(
    await p.locator("#export-download").isVisible(),
    true,
    await p.locator("#export-result").textContent(),
  );
  const pending = p.waitForEvent("download");
  await p.locator("#export-download").click();
  const download = await pending,
    path = `${output}/${name}`;
  await download.saveAs(path);
  return readFile(path);
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch("http://127.0.0.1:5250")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.goto("http://127.0.0.1:5250");
  const history = await page.locator("#history-info").textContent();
  await openExport(page);
  assert.equal(await page.locator("#export-dialog .export-basics #export-quality").count(), 1);
  assert.equal(await page.locator("#export-format option:checked").textContent(), "STL");
  assert.match(await page.locator("#export-format").getAttribute("title"), /millimetres/);
  assert.equal(await page.locator("#export-actual-size").isChecked(), true);
  assert.equal(await page.locator("#export-curved").isChecked(), false);
  await page.locator("#export-actual-size").uncheck();
  assert.equal(await page.locator("#export-sizing").inputValue(), "target");
  assert.equal(await page.locator("#print-size").isVisible(), true);
  await page.locator("#print-size").fill("200");
  await page.locator("#export-curved").check();
  assert.equal(await page.locator("#export-curved-value").textContent(), "0.05 mm");
  await page.screenshot({ path: `${output}/desktop-controls.png` });
  const rejected = await prepare(page, "#export", "fallback.stl");
  assert.match(await page.locator("#export-summary").textContent(), /Curved reduction: ✕ /);
  await page.screenshot({ path: `${output}/fallback.png` });
  await page.locator("#export-curved").uncheck();
  assert.equal(await page.locator("#export-download").isVisible(), false);
  const exact = await prepare(page, "#export", "exact.stl");
  assert.deepEqual(rejected, exact);
  assert.equal(await page.locator("#history-info").textContent(), history);
  await page.locator("#export-format").selectOption("glb");
  assert.equal(await page.locator("#export-curved").isDisabled(), true);
  assert.equal(await page.locator("#export-curved").isChecked(), false);
  const glb = await prepare(page, "#export", "sized.glb");
  assert.equal(glb.readUInt32LE(0), 0x46546c67);
  await page.locator("#export-format").selectOption("stl");
  await page.locator("#export-actual-size").check();
  await page.locator("#export-curved").check();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#export-dialog").evaluate((el) => {
    el.scrollTop = 0;
  });
  const bounds = await page.locator("#export-dialog").boundingBox();
  assert(bounds.width <= 390 && bounds.x >= 0);
  const overflow = await page
    .locator("#export-dialog")
    .evaluate((el) => el.scrollWidth > el.clientWidth + 1);
  assert.equal(overflow, false);
  await page.screenshot({ path: `${output}/mobile-controls.png` });
  await page.close();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  page = await context.newPage();
  await page.goto("http://127.0.0.1:5250");
  await page.locator("#project-file").setInputFiles(file);
  await page.locator('[data-library-action="library:open"]').click({ timeout: 30000 });
  await page
    .locator("#project-message")
    .filter({ hasText: /^Opened / })
    .waitFor();
  const curvedHistory = await page.locator("#history-info").textContent();
  await openExport(page);
  await page.locator("#export-curved").check();
  const accepted = await prepare(page, "#export-boolean", "reduced.stl");
  assert.match(await page.locator("#export-summary").textContent(), /✓ Curved reduction applied:/);
  const count = accepted.readUInt32LE(80),
    p = new Float32Array(count * 9);
  for (let i = 0; i < p.length; i++)
    p[i] = accepted.readFloatLE(96 + Math.floor(i / 9) * 50 + (i % 9) * 4);
  const report = await validatePrintMesh(p);
  assert.deepEqual(report.blocking, []);
  assert.equal(report.boundaryEdges, 0);
  assert.equal(count, 33686);
  assert.equal(await page.locator("#history-info").textContent(), curvedHistory);
  assert.deepEqual(await readFile(file), Buffer.from(native));
  await page.screenshot({ path: `${output}/applied.png` });
  await writeFile(
    `${output}/verification.json`,
    JSON.stringify(
      {
        fallbackByteExact: true,
        appliedTriangles: count,
        report,
        historyPreserved: true,
        mobileNoOverflow: true,
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS: desktop/mobile controls, actual/target toggle, STL/GLB, ✓ applied / ✕ byte-exact fallback, original history; ${output}`,
  );
} catch (error) {
  if (page) {
    await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
    console.error(
      await page
        .locator("body")
        .textContent()
        .catch(() => "Unavailable"),
    );
  }
  throw error;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
