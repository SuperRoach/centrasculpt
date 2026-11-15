import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { build } from "esbuild";

const cacheComparison = process.argv[4] === "--cache";
const memoryProfile = process.argv[4] === "--profile";
const residentLayers = process.argv[5] === undefined ? 0 : Number(process.argv[5]);
if (
  !Number.isInteger(residentLayers) ||
  residentLayers < 0 ||
  residentLayers > 2 ||
  (residentLayers && !memoryProfile)
)
  throw new Error("Use --profile with zero, one or two resident layer copies");
const panelPolicy = process.argv[6] ?? null;
if (panelPolicy && (!memoryProfile || !["progressive", "cache-batched"].includes(panelPolicy)))
  throw new Error("Panel policy must be progressive or cache-batched with --profile");
const output = resolve(process.argv[2] ?? "work/paced-renderer/bulk-undo.html");
const fixture = JSON.parse(
  readFileSync(
    process.argv[3] ?? "work/narrow-band-perf/cost-aware/growth-exact-3-narrow-cap8-1-1.json",
    "utf8",
  ),
);
if (!fixture.complete) throw new Error("Use a completed branch fixture");
const trace = fixture.cases
  .find((c) => c.kind === "branch")
  .strokes.map(({ a, b, mode }) => ({ a, b, mode }));
const bundle = await build({
  stdin: {
    contents: `import { run } from "./scripts/research/bulk-undo-renderer.mjs";
const start = document.querySelector("#start");
const panel = document.querySelector("#panel");
if (${memoryProfile}) {
  start.disabled = true;
  if (${JSON.stringify(panelPolicy)}) document.querySelector("#status").textContent = "Panel-only policy is ready.";
  else if (navigator.xr) navigator.xr.isSessionSupported("immersive-vr").then((supported) => {
    start.disabled = !supported;
    if (!supported) document.querySelector("#status").textContent = "Immersive WebXR unavailable. Panel profiling is ready.";
  }).catch((error) => { document.querySelector("#status").textContent = String(error); });
  else document.querySelector("#status").textContent = "Immersive WebXR unavailable. Panel profiling is ready.";
}
async function launch(mode) {
  start.disabled = true;
  if (panel) panel.disabled = true;
  try { await run(${JSON.stringify(trace)}, ${cacheComparison}, mode, ${residentLayers}, ${JSON.stringify(panelPolicy)}); }
  catch (error) {
    document.querySelector("#status").textContent = String(error);
    if (panel) panel.disabled = false;
  }
}
start.onclick = () => launch(${memoryProfile ? '"immersive"' : "null"});
if (panel) panel.onclick = () => launch("panel");`,
    resolveDir: process.cwd(),
  },
  format: "iife",
  bundle: true,
  write: false,
});
mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  `<!doctype html><meta charset="utf-8"><title>Centra bulk Undo renderer</title>
<h1>Centra bulk Undo renderer</h1><button id="start">${memoryProfile ? "Enter VR and profile memory" : "Run bulk Undo comparison"}</button>
${memoryProfile ? '<button id="panel">Profile in Browser panel</button>' : ""}
<a id="download" download="${memoryProfile ? "quest-bulk-memory" : cacheComparison ? "bulk-undo-cache" : "bulk-undo-renderer"}.json" hidden>Download JSON</a>
<pre id="status">Ready</pre><canvas style="width:min(100%,900px);height:auto"></canvas>
<script>${bundle.outputFiles[0].text.replaceAll("</script", "<\\/script")}</script>`,
);
console.log(output);
