import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";

const output = resolve(process.argv[2] ?? "work/paced-renderer/fixture.html");
const reference =
  process.argv[3] ?? "work/narrow-band-perf/cost-aware/growth-exact-3-narrow-cap8-1-1.json";
const mode = process.argv[4];
const alternative =
  mode === "--tracked"
    ? "tracked"
    : mode === "--predictive"
      ? "predictive"
      : mode === "--adaptive"
        ? "adaptive"
        : mode === "--budget"
          ? "budget"
          : mode === "--extract"
            ? "extract"
            : mode === "--batch"
              ? "batch"
              : mode === "--compare"
                ? "compare"
                : mode === "--preview"
                  ? "guarded"
                  : mode === "--local"
                    ? "local"
                    : "recent";
const reportName = {
  tracked: "brush-tracked",
  predictive: "brush-predictive",
  adaptive: "brush-adaptive",
  budget: "brush-budget",
  extract: "brush-extraction",
  batch: "brush-batch",
  compare: "brush-response",
  guarded: "guarded-preview",
  local: "local-exact",
  recent: "paced-renderer",
}[alternative];
const raw = JSON.parse(readFileSync(reference, "utf8"));
if (!raw.complete) throw new Error("Use a completed growth fixture");
const trace = raw.cases
  .find((c) => c.kind === "branch")
  .strokes.map(({ a, b, mode }) => ({ a, b, mode }));
const bundle = await build({
  stdin: {
    contents: `import { run } from "./scripts/research/paced-renderer.mjs";
const start = document.querySelector("#start");
const vr = document.querySelector("#vr");
navigator.xr?.isSessionSupported("immersive-vr").then((supported) => { vr.disabled = !supported; }).catch(() => {});
async function launch(immersive) {
  start.disabled = vr.disabled = true;
  try { await run(${JSON.stringify(trace)}, ${JSON.stringify(alternative)}, immersive); }
  catch (error) { document.querySelector("#status").textContent = String(error); }
}
start.onclick = () => launch(false);
vr.onclick = () => launch(true);`,
    resolveDir: process.cwd(),
  },
  format: "iife",
  bundle: true,
  write: false,
});
mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  `<!doctype html><meta charset="utf-8"><title>Centra paced renderer</title>
<h1>Centra paced renderer</h1><button id="start">Run paced comparison</button>
<button id="vr" disabled>Enter VR and run</button>
<a id="download" download="${reportName}.json" hidden>Download JSON</a>
<pre id="status">Ready</pre><canvas style="width:min(100%,900px);height:auto"></canvas>
<script>${bundle.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script>`,
);
console.log(output);
