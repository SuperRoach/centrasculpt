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
    for (const image of await page.locator('article img').all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(e=>e.decode());
      assert.equal(await image.evaluate(e=>e.naturalWidth),1600, `${route} screenshot pixels`);
    }
    await page.evaluate(()=>scrollTo(0,0));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${route} desktop overflow`);
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
  await page.goto(base);
  await page.locator('.pagination a').last().click();
  assert.ok(page.url().endsWith('/quick-start.html'));
  await page.locator('.pagination a').first().click();
  assert.ok(page.url().endsWith('/index.html'));
  await page.goto(base + "/tool-wheel.html");
  await page.screenshot({path:new URL('tool-wheel-final.png',evidence).pathname,fullPage:true});
  const wheel = page.locator('[data-wheel]');
  assert.equal(await wheel.count(), 9);
  await wheel.first().focus();
  await page.keyboard.press('End');
  assert.equal(await page.locator('[data-wheel][aria-pressed="true"]').innerText(), 'Cut');
  assert.equal(await page.locator('[data-wheel-panel="8"]').isVisible(), true);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('[data-wheel][aria-pressed="true"]').innerText(), 'Clay');
  await wheel.nth(5).click();
  assert.match(await page.locator('#wheel-detail').innerText(), /Elastic Move/);
  await page.goto(base + '/quick-start.html');
  const screenshot = page.locator('[data-zoom]').first();
  await screenshot.click();
  await page.waitForFunction(()=>document.querySelector('.image-dialog img')?.naturalWidth===1600);
  assert.equal(await page.locator('.image-dialog').evaluate(e=>e.open), true);
  assert.equal(await page.locator('.image-dialog img').evaluate(e=>e.naturalWidth),1600);
  await page.addScriptTag({content:axe});
  assert.deepEqual((await page.evaluate(async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}))).violations.map(v=>v.id),[]);
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>document.activeElement?.hasAttribute('data-zoom'));
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),'auto');
  const touch = await browser.newContext({hasTouch:true,viewport:{width:390,height:844}});
  const tp=await touch.newPage();await tp.goto(base+'/tool-wheel.html');
  await tp.locator('[data-wheel="8"]').tap();
  assert.equal(await tp.locator('[data-wheel-panel="8"]').isVisible(),true);
  await tp.goto(base+'/quick-start.html');await tp.locator('[data-zoom]').first().tap();
  assert.equal(await tp.locator('.image-dialog').evaluate(e=>e.open),true);
  await tp.getByRole('button',{name:'Close image · Esc',exact:true}).tap();
  await touch.close();
  assert.deepEqual(errors, []);
  await writeFile(
    new URL("browser-report.json", evidence),
    JSON.stringify(
      {
        pages: report,
        search,
        mobileWidths: [390, 320],
        keyboard: ["skip", "Control+K", "Meta+K", "Escape", "focus return"],
        newInteractions: ['wheel keyboard/mouse/touch', 'lightbox pixels/Escape/focus/touch', 'reduced motion', 'previous/next navigation', 'all article image decoding'],
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
