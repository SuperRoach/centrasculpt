// Disposable profile; real UI and worker downloads. Never connects to an existing editor.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { Box3, Vector3 } from "three";
import { readGlb } from "./fixtures/export-node.mjs";

const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    ...(process.env.EXPORT_SMOKE_PRODUCTION === "1" ? ["preview"] : []),
    "--host",
    "127.0.0.1",
    "--port",
    "5199",
    "--strictPort",
  ],
  { stdio: "ignore" },
);
let browser, page;
try {
  await mkdir("work/phase-7-5-2", { recursive: true });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch("http://127.0.0.1:5199")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto("http://127.0.0.1:5199");
  await page.locator("#open-export").click();
  await page.locator("#export-actual-size").waitFor();
  await page.locator("#export-advanced").evaluate((el) => {
    el.open = true;
  });
  await page.locator("#export-format").press("Escape");
  assert.equal(await page.locator("#export-dialog").isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement?.id), "open-export");
  await page.locator("#open-export").click();
  await page.locator("#export-quality").selectOption("standard");
  assert.equal(await page.locator("#export-quality").inputValue(), "standard");
  assert.match(await page.locator("#export-estimate").textContent(), /uncertainty/);
  // Open containing details panels without relying on their current presentation defaults.
  await page.locator("#export-actual-size").evaluate((el) => {
    for (let p = el.parentElement; p; p = p.parentElement)
      if (p.tagName === "DETAILS") p.open = true;
  });
  assert.equal(await page.locator("#export-sizing").inputValue(), "actual");
  assert.equal(await page.locator("#print-size").inputValue(), "200");
  assert.equal(await page.locator("#export-resolution").inputValue(), "192");
  await page.locator("#export-quality").selectOption("fast");
  for (const [format, target, scope] of [
    ["stl", null],
    ["stl", null, "composite"],
    ["stl", 200],
    ["stl", 100],
    ["glb", 100],
  ]) {
    await page.locator("#export-format").selectOption(format);
    await page.locator("#export-actual-size").setChecked(target === null);
    if (target !== null) await page.locator("#print-size").fill(String(target));
    await page.locator("#export-resolution").selectOption(scope === "composite" ? "256" : "192");
    await page.locator(scope === "composite" ? "#export-boolean" : "#export-selected").click();
    await page.locator("#export-download").waitFor({ state: "visible", timeout: 120000 });
    const download = page.waitForEvent("download", { timeout: 120000 });
    await page.locator("#export-download").click();
    const file = await download;
    if (scope === "composite")
      assert.match(await page.locator("#export-summary").textContent(), /max 256³/);
    const path = `work/phase-7-5-2/browser-${scope ?? "selected"}-${target ?? "actual"}.${format}`;
    await file.saveAs(path);
    const bytes = await readFile(path);
    if (format === "stl") {
      const n = bytes.readUInt32LE(80);
      assert.equal(bytes.length, 84 + n * 50);
      const min = [Infinity, Infinity, Infinity],
        max = [-Infinity, -Infinity, -Infinity];
      for (let f = 0; f < n; f++)
        for (let k = 0; k < 9; k++) {
          const x = bytes.readFloatLE(96 + f * 50 + k * 4),
            a = k % 3;
          min[a] = Math.min(min[a], x);
          max[a] = Math.max(max[a], x);
        }
      const summary = await page.locator("#export-summary").textContent();
      const actual = summary.match(/Actual ([0-9.]+) × ([0-9.]+) × ([0-9.]+) mm/);
      const expected = target ?? Math.max(...actual.slice(1).map(Number));
      assert(Math.abs(Math.max(...max.map((v, i) => v - min[i])) - expected) < 0.002);
    } else {
      assert.equal(bytes.readUInt32LE(0), 0x46546c67);
      const parsed = await readGlb(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      );
      const size = new Box3().setFromObject(parsed.scene).getSize(new Vector3());
      assert(Math.abs(Math.max(size.x, size.y, size.z) * 1000 - target) < 0.001);
    }
    assert.match(
      await page.locator("#export-summary").textContent(),
      /Actual .*Export .*mm.*×.*fast/,
    );
  }
  await page.setViewportSize({ width: 480, height: 800 });
  assert(
    await page.locator("#export-dialog").evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  );
  await page.screenshot({ path: "work/phase-7-5-2/browser-summary.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  // A large box contains the starter sphere: unified output is a densely sampled cube.
  // Create it only in this disposable profile, then compare actual worker files.
  await page.locator("#close-export").click();
  const primitivePanel = page.locator("details.primitive-panel");
  await primitivePanel.locator("summary").first().click();
  await primitivePanel.getByRole("button", { name: "Create new", exact: true }).click();
  await primitivePanel.getByRole("button", { name: "Box", exact: true }).click();
  for (const dimension of ["width", "height", "depth"]) {
    const input = primitivePanel.getByRole("spinbutton", {
      name: `${dimension} (mm)`,
      exact: true,
    });
    await input.fill("300");
    await input.press("Tab");
  }
  for (const dimension of ["width", "height", "depth"])
    assert.equal(
      await primitivePanel
        .getByRole("spinbutton", { name: `${dimension} (mm)`, exact: true })
        .inputValue(),
      "300",
    );
  await primitivePanel.getByRole("button", { name: "Create Box", exact: true }).click();
  await page.locator("#history-info").filter({ hasText: "1 undo" }).waitFor();
  const history = await page.locator("#history-info").textContent(),
    boxCounts = [];
  await page.locator("#open-export").click();
  await page.locator("#export-format").selectOption("stl");
  await page.locator("#export-actual-size").setChecked(true);
  await page.locator("#export-memory").selectOption("512");
  if (!(await page.locator("#export-dialog").isVisible()))
    await page.locator("#open-export").click();
  for (const quality of ["fast", "high"]) {
    await page.locator("#export-quality").selectOption(quality);
    await page.locator("#export-boolean").click();
    await page.locator("#export-download").waitFor({ state: "visible", timeout: 120000 });
    const download = page.waitForEvent("download", { timeout: 120000 });
    await page.locator("#export-download").click();
    const file = await download,
      path = `work/phase-7-5-2/browser-planar-${quality}.stl`;
    await file.saveAs(path);
    const bytes = await readFile(path),
      count = bytes.readUInt32LE(80);
    assert.equal(bytes.length, 84 + count * 50);
    boxCounts.push(count);
    const min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    for (let f = 0; f < count; f++)
      for (let k = 0; k < 9; k++) {
        const x = bytes.readFloatLE(96 + f * 50 + k * 4),
          axis = k % 3;
        min[axis] = Math.min(min[axis], x);
        max[axis] = Math.max(max[axis], x);
      }
    for (let axis = 0; axis < 3; axis++) assert(Math.abs(max[axis] - min[axis] - 300) < 0.001);
    assert.equal(await page.locator("#history-info").textContent(), history);
  }
  assert(boxCounts[1] < boxCounts[0] * 0.75, `Whole planar patch reduction: ${boxCounts}`);
  console.log(
    `Real browser planar cube: Fast ${boxCounts[0]}, High ${boxCounts[1]} triangles; unchanged 300 mm bounds and Undo.`,
  );
  await page.screenshot({ path: "work/phase-7-5-2/browser-planar-patches.png" });
  await page.locator("#close-export").click();
  await primitivePanel.locator("summary").first().click();
  for (const [axis, degrees] of [
    ["X", 17],
    ["Y", 23],
    ["Z", -11],
  ]) {
    const input = page.getByRole("spinbutton", { name: `Rotation ${axis} degrees`, exact: true });
    await input.fill(String(degrees));
    await input.press("Tab");
  }
  const tiltedHistory = await page.locator("#history-info").textContent(),
    tilted = [];
  if (!(await page.locator("#export-dialog").isVisible()))
    await page.locator("#open-export").click();
  for (const quality of ["fast", "high"]) {
    await page.locator("#export-quality").selectOption(quality);
    await page.locator("#export-boolean").click();
    await page.locator("#export-download").waitFor({ state: "visible", timeout: 120000 });
    const download = page.waitForEvent("download", { timeout: 120000 });
    await page.locator("#export-download").click();
    const file = await download,
      path = `work/phase-7-5-2/browser-oblique-${quality}.stl`;
    await file.saveAs(path);
    const bytes = await readFile(path),
      count = bytes.readUInt32LE(80);
    assert.equal(bytes.length, 84 + count * 50);
    const min = [Infinity, Infinity, Infinity],
      max = [-Infinity, -Infinity, -Infinity];
    for (let f = 0; f < count; f++)
      for (let k = 0; k < 9; k++) {
        const value = bytes.readFloatLE(96 + f * 50 + k * 4),
          axis = k % 3;
        min[axis] = Math.min(min[axis], value);
        max[axis] = Math.max(max[axis], value);
      }
    tilted.push({ count, dimensions: max.map((value, axis) => value - min[axis]) });
    assert.equal(await page.locator("#history-info").textContent(), tiltedHistory);
  }
  tilted[1].dimensions.forEach((value, axis) => {
    assert(Math.abs(value - tilted[0].dimensions[axis]) < 0.001);
  });
  assert(tilted[1].count < tilted[0].count);
  await page.locator("#print-panel").evaluate((el) => {
    el.open = true;
  });
  const reportDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download optional print report (.json)", exact: true })
    .click();
  const reportFile = await reportDownload,
    reportPath = "work/phase-7-5-2/browser-oblique-report.json";
  await reportFile.saveAs(reportPath);
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  assert(report.repairs[0].planarPatchDeviationBound > 0);
  assert(report.planarPatchDeviationMM > 0 && report.planarPatchDeviationMM < 0.001);
  assert.equal(report.boundaryEdges, 0);
  assert.equal(report.inconsistentEdges, 0);
  assert.deepEqual(report.blocking, []);
  console.log(
    `Real browser oblique cube: Fast ${tilted[0].count}, High ${tilted[1].count}; matching bounds/Undo, recorded plane bound ${report.repairs[0].planarPatchDeviationBound}.`,
  );
  // Exercise a real worker failure response in this disposable test profile.
  await page.route(
    /\/(?:src\/export-worker\.ts|assets\/export-worker-[^/]+\.js)(?:\?.*)?$/,
    (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: `self.onmessage = ({data}) => {
      self.postMessage({id:data.id,progress:{stage:"Optimising planar regions",completed:1,total:2}});
      self.postMessage({id:data.id,error:"Injected planar optimisation failure: memory budget exceeded."});
    };`,
      }),
  );
  await page.locator("#export-selected").click();
  const failure = page.locator("#export-result [role=alert]");
  await failure.waitFor();
  assert.match(
    await failure.textContent(),
    /Export failed during Optimising planar regions:.*memory budget exceeded/,
  );
  assert.match(await failure.textContent(), /Source sculpture kept/);
  assert.equal(await page.locator("#export-download").isVisible(), false);
  await page.screenshot({ path: "work/phase-7-5-2/browser-failure.png" });
  console.log(
    "Injected worker optimisation failure is shown with its stage, cause and alert role.",
  );

  console.log(
    "Real browser UI / worker STL 1:1, STL 200 mm, STL 100 mm and metre-calibrated GLB downloads passed.",
  );
} catch (error) {
  if (page) {
    await page
      .screenshot({ path: "work/phase-7-5-2/browser-unexpected-failure.png" })
      .catch(() => {});
    console.error(
      await page
        .locator("#export-result")
        .textContent()
        .catch(() => "Page unavailable"),
    );
  }
  throw error;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
