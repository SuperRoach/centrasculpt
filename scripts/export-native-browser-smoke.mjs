// Run npm run build first. Disposable production-preview profile; native Lens COPY only.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import "./compile-core.mjs";
import { validatePrintMesh } from "../work/test-build/stl-export.mjs";

const native = resolve(process.argv[2] ?? "work/phase-7-5-4a/input/lensbenchmark.form");
assert.equal((await stat(native)).mode & 0o222, 0, "Supply a write-disabled native copy");
const input = await readFile(native);
const digest = (data) => createHash("sha256").update(data).digest("hex");
const base = "work/lens-visible-repro";
await mkdir(base, { recursive: true });
const output = await mkdtemp(`${base}/browser-`);
const port = 5246;
const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  { stdio: "ignore" },
);
let browser, page;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}`)).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("dialog", (dialog) => {
    console.log("Dialog", dialog.type(), dialog.message());
    void dialog.accept();
  });
  page.on("pageerror", (error) => console.error("Page error", error.message));
  page.on("crash", () => console.error("PAGE CRASHED"));
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) console.log("Navigation", frame.url());
  });
  await page.goto(`http://127.0.0.1:${port}`);
  await page.locator("#project-file").setInputFiles(native);
  await page.locator('[data-library-action="library:open"]').click({ timeout: 30000 });
  await page
    .locator("#project-message")
    .filter({ hasText: /^Opened / })
    .waitFor();
  const history = await page.locator("#history-info").textContent();
  async function nativeSnapshot(label) {
    await page.getByRole("button", { name: "Project Library", exact: true }).click();
    const pending = page.waitForEvent("download");
    await page.locator('[data-library-action="library:download-current"]').click();
    const file = await pending;
    const path = `${output}/${label}.form`;
    await file.saveAs(path);
    await page.getByRole("button", { name: "Close library", exact: true }).click();
    return readFile(path);
  }
  const before = await nativeSnapshot("before");
  console.log("Native copy opened and preservation snapshot downloaded.");
  await page.locator("#open-export").click();
  await page.locator("#export-advanced").evaluate((el) => {
    el.open = true;
  });
  await page.locator("#export-format").selectOption("stl");
  await page.locator("#export-quality").selectOption("high");
  assert.equal(await page.locator("#export-memory").inputValue(), "256");
  assert.equal(await page.locator("#export-sizing").inputValue(), "actual");
  assert.match(await page.locator("#export-estimate").textContent(), /Evaluated count unknown/);
  const rows = [];
  for (const [scope, resolution, target] of [
    ["visible", 192, null],
    ["visible", 256, null],
    ["composite", 256, null],
    ["visible", 256, 200],
  ]) {
    await page.locator("#export-resolution").selectOption(String(resolution));
    await page.locator("#export-actual-size").setChecked(target === null);
    if (target !== null) await page.locator("#print-size").fill(String(target));
    console.log("Preparing", scope, resolution, target ?? "actual");
    await page.locator(scope === "visible" ? "#export" : "#export-boolean").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#export-download")?.getAttribute("href") ||
        document
          .querySelector("#export-result [role=alert]")
          ?.textContent?.includes("Export failed"),
      undefined,
      { timeout: 180000 },
    );
    assert.equal(
      await page.locator("#export-download").isVisible(),
      true,
      await page.locator("#export-result").textContent(),
    );
    const summary = await page.locator("#export-summary").textContent();
    assert.match(summary, new RegExp(`evaluated ${resolution}³`));
    const pending = page.waitForEvent("download");
    await page.locator("#export-download").click();
    const file = await pending;
    const path = `${output}/${scope}-${resolution}-${target ?? "actual"}.stl`;
    await file.saveAs(path);
    const bytes = await readFile(path);
    const geometry = new STLLoader().parse(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    const report = await validatePrintMesh(geometry.getAttribute("position").array);
    geometry.dispose();
    assert.deepEqual(report.blocking, []);
    assert.equal(report.components, 1);
    const expected = target === null ? [450, 59, 70] : [200, (59 * 200) / 450, (70 * 200) / 450];
    report.dimensions.forEach((n, i) => {
      assert(Math.abs(n - expected[i]) < 0.001);
    });
    assert.equal(await page.locator("#history-info").textContent(), history);
    rows.push({ scope, resolution, target, summary, sha256: digest(bytes), report });
    console.log(JSON.stringify(rows.at(-1)));
    await writeFile(`${output}/rows.json`, JSON.stringify(rows, null, 2));
  }
  assert.equal(rows[1].sha256, rows[2].sha256, "Visible and Unified Boolean must match");
  await page.screenshot({ path: `${output}/visible-target.png` });
  await page.locator("#close-export").click();
  assert.deepEqual(await nativeSnapshot("after"), before);
  assert.equal(await page.locator("#history-info").textContent(), history);
  console.log(
    `PASS: visible High STL 192/256, unified parity, 200 mm target, native/history preserved; ${output}`,
  );
} catch (error) {
  if (page) {
    await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
    console.error(
      await page
        .locator("body")
        .textContent()
        .catch(() => "Page unavailable"),
    );
  }
  throw error;
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  assert.deepEqual(await readFile(native), input);
}
