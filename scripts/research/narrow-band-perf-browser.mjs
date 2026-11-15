/** Disposable Chromium fixture. No HTTP listener or profile data. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";
import { researchChunkAdapter } from "./narrow-band-perf-bundle.mjs";

const output = resolve(process.argv[2]);
const entry = await build({
  stdin: {
    contents: `
      import { compact, compareCompactSculpts } from "./scripts/research/narrow-band-perf-compact.mjs";
      globalThis.runFixture = async () => {
        const runs = [];
        for (const variant of ["dense", "baseline", "linear-3"])
          runs.push(await compact(variant, () => performance.memory?.usedJSHeapSize ?? null));
        compareCompactSculpts(runs[0], runs[1]);
        compareCompactSculpts(runs[0], runs[2]);
        if (!runs[2].haloStats.tiles) throw new Error("Halo path was not exercised");
        return { userAgent: navigator.userAgent, runs };
      };
    `,
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: "iife",
  write: false,
  plugins: [researchChunkAdapter],
});
const script = entry.outputFiles[0].text;
if (process.argv[3] === "--html") {
  writeFileSync(
    output,
    `<!doctype html><meta charset="utf-8"><title>Centra sparse halo fixture</title>
<h1>Centra sparse halo fixture</h1><pre id="status">Running the compact replay…</pre>
<script>${script.replaceAll("</script", "<\\/script")}</script>
<script>
  const statusElement = document.querySelector("#status");
  globalThis.runFixture().then(({ userAgent, runs }) => {
    const [dense, , halo] = runs;
    const finish = dense.checkpoints.find((row) => row.phase === "finish");
    statusElement.textContent =
      "PASS — 7 exact field and mesh checkpoints agree across dense, direct reads, and the halo.\\n" +
      finish.surface.triangles + " triangles. " + halo.haloStats.tiles + " gathered tiles.\\n" +
      userAgent;
  }, (error) => { statusElement.textContent = String(error); });
</script>`,
  );
  console.log(output);
  process.exit(0);
}
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  timeout: 10_000,
});
let timer;
try {
  const page = await browser.newPage();
  await page.addScriptTag({ content: script });
  const report = await Promise.race([
    page.evaluate(() => globalThis.runFixture()),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Chromium fixture exceeded 120 seconds")), 120_000);
    }),
  ]);
  assert.equal(report.runs.length, 3);
  writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(output);
} finally {
  clearTimeout(timer);
  await browser.close();
}
