// Isolated real-browser lifecycle regression; never attaches to an existing editor.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "@playwright/test";

const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    ...(process.env.EXPORT_SMOKE_PRODUCTION === "1" ? ["preview"] : []),
    "--host",
    "127.0.0.1",
    "--port",
    "5201",
    "--strictPort",
  ],
  { stdio: "ignore" },
);
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch("http://127.0.0.1:5201")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5201");
  await page.locator("#open-export").click();
  await page.locator("#export-actual-size").waitFor();
  await page.locator("#export-advanced").evaluate((el) => {
    el.open = true;
  });
  await page.locator("#export-actual-size").evaluate((el) => {
    for (let p = el.parentElement; p; p = p.parentElement)
      if (p.tagName === "DETAILS") p.open = true;
  });
  await page.locator("#export-format").selectOption("stl");
  await page.locator("#export-quality").selectOption("high");
  await page.locator("#export-resolution").selectOption("256");
  await page.locator("#export-memory").selectOption("512");
  const history = await page.locator("#history-info").textContent();
  if (process.argv.includes("--baseline")) {
    await page.locator("#export-boolean").click();
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    const status = page.locator("#export-result [role=status]");
    await status.filter({ hasText: "Export cancelled by request" }).waitFor({ timeout: 10000 });
    console.log("REPRODUCED: window blur without Cancel reports: " + (await status.textContent()));
  } else {
    const download = page.waitForEvent("download", { timeout: 120000 });
    await page.locator("#export-boolean").click();
    await page.evaluate(() => {
      window.dispatchEvent(new Event("blur"));
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.locator("#export-download").waitFor({ state: "visible", timeout: 120000 });
    await page.locator("#export-download").click();
    await download;
    assert.equal(await page.locator("#history-info").textContent(), history);
    assert.match(
      await page.locator("#export-result [role=status]").textContent(),
      /Download requested/,
    );
    await page.evaluate(() => {
      delete document.visibilityState;
      document.dispatchEvent(new Event("visibilitychange"));
    });
    for (const method of ["button", "escape", "error"]) {
      await page.locator("#export-boolean").click();
      if (method === "button") await page.locator("#cancel-export").click();
      else if (method === "escape") await page.keyboard.press("Escape");
      else await page.evaluate(() => window.dispatchEvent(new Event("error")));
      const status = page.locator(
        `#export-result [role=${method === "error" ? "alert" : "status"}]`,
      );
      await status
        .filter({
          hasText: method === "error" ? "Export interrupted" : "Export cancelled by request",
        })
        .waitFor();
      if (method === "error") assert.match(await status.textContent(), /application error/);
      assert.equal(await page.locator("#history-info").textContent(), history);
    }
    console.log(
      "PASS: High unified export survives blur/hidden, explicit Cancel/Escape remain user cancellations, application error is an interruption; Undo unchanged.",
    );
  }
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
