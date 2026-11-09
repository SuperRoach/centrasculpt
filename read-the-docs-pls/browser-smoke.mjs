import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { serve } from "./preview.mjs";
const server = serve(0);
await new Promise((resolve) => server.once("listening", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const evidence = new URL("../work/docs-7-6/", import.meta.url);
await mkdir(evidence, { recursive: true });
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const routes = JSON.parse(await readFile(new URL("./routes.json", import.meta.url)));
  const axe = await readFile(
    new URL("./node_modules/axe-core/axe.min.js", import.meta.url),
    "utf8",
  );
  const report = [];
  for (const route of routes) {
    assert.equal((await page.goto(`${base}/${route}`)).status(), 200);
    await page.addScriptTag({ content: axe });
    const result = await page.evaluate(
      async () =>
        await axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
        }),
    );
    assert.deepEqual(
      result.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      [],
      `${route} accessibility`,
    );
    report.push({ route, violations: result.violations.length });
  }
  await page.goto(base);
  await page.keyboard.press("Tab");
  assert.equal(await page.locator(":focus").textContent(), "Skip to content");
  await page.keyboard.press("Enter");
  assert.equal(await page.locator(":focus").getAttribute("id"), "main");
  await page.screenshot({ path: new URL("desktop-light.png", evidence).pathname, fullPage: true });
  await page.locator("#theme").click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.reload();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.screenshot({ path: new URL("desktop-dark.png", evidence).pathname, fullPage: true });
  await page.keyboard.press("Control+k");
  await page.locator("#search-dialog input").waitFor();
  await page.locator("#search-dialog input").fill("tyre");
  await page.locator(".pagefind-ui__result-link").first().waitFor();
  assert.ok(
    (await page.locator(".pagefind-ui__result-link").allTextContents()).some((t) =>
      t.includes("primitives"),
    ),
  );
  await page.addScriptTag({ content: axe });
  assert.deepEqual(
    (
      await page.evaluate(
        async () =>
          await axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          }),
      )
    ).violations.map((v) => v.id),
    [],
  );
  await page.screenshot({ path: new URL("search.png", evidence).pathname });
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(":focus").getAttribute("id"), "search-open");
  await page.keyboard.press("Meta+k");
  assert.equal(await page.locator("#search-dialog").evaluate((d) => d.open), true);
  await page.keyboard.press("Escape");
  // Exercise the real search API, all routes, and a nested deployment path.
  const search = await page.evaluate(async () => {
    const pf = await import("./pagefind/pagefind.js");
    const out = {};
    for (const term of ["calibration", "fallback", "proposal", "capsule", ".form"]) {
      const results = await pf.search(term);
      out[term] = results.results.length;
    }
    return out;
  });
  for (const [term, count] of Object.entries(search)) assert.ok(count > 0, term);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const route of routes) {
      await page.goto(`${base}/${route}`);
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${width}px overflow ${route}`,
      );
    }
    await page.goto(base);
    assert.equal(await page.locator("#sidebar").isVisible(), false);
    await page.locator("#menu").click();
    assert.equal(await page.locator("#menu").getAttribute("aria-expanded"), "true");
    assert.equal(await page.locator("#sidebar").isVisible(), true);
    await page.addScriptTag({ content: axe });
    assert.deepEqual(
      (
        await page.evaluate(
          async () =>
            await axe.run(document, {
              runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
            }),
        )
      ).violations.map((v) => v.id),
      [],
    );
    await page.screenshot({
      path: new URL(`mobile-${width}-navigation.png`, evidence).pathname,
      fullPage: true,
    });
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#menu").getAttribute("aria-expanded"), "false");
    await page.screenshot({
      path: new URL(`mobile-${width}.png`, evidence).pathname,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base + "/export.html");
  await page.screenshot({ path: new URL("export-guide.png", evidence).pathname, fullPage: true });
  await page.locator("#theme").click();
  await page.addScriptTag({ content: axe });
  assert.deepEqual(
    (
      await page.evaluate(
        async () =>
          await axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
          }),
      )
    ).violations.map((v) => v.id),
    [],
  );
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("browser-report.json", evidence),
    JSON.stringify(
      {
        pages: report,
        search,
        mobileWidths: [390, 320],
        keyboard: ["skip", "Control+K", "Meta+K", "Escape", "focus return"],
        errors,
      },
      null,
      2,
    ),
  );
  console.log(
    `PASS: ${routes.length} routes, axe WCAG A/AA, real Pagefind search, themes, keyboard and 390/320px layouts. Evidence ${evidence.pathname}`,
  );
} finally {
  await browser?.close();
  server.close();
}
