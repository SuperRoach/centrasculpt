// Instrument the real editor animation loop only in this loopback Vite session.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { strokeTrace } from "./research/compact-sculpt/trace.mjs";

const [tracePath, outputPath, baseline] = process.argv.slice(2);
assert(tracePath && outputPath, "Pass the Phase 8.3 metre trace and a report filename.");
const metre = JSON.parse(await readFile(tracePath, "utf8"));
assert(metre.complete);
const workloads = [
  { kind: "compact", resolution: 129, extent: 0.064, strokes: strokeTrace() },
  ...metre.cases.map(({ kind, strokes }) => ({
    kind,
    resolution: 192,
    extent: 0.54,
    strokes: strokes.map((stroke) => ({ ...stroke, radius: 6 })),
  })),
];
const sources = new Map(
  baseline
    ? ["main", "mesh", "sparse-sdf", "independent-layers", "xr-experience", "xr-performance"].map(
        (name) => [
          `src/${name}.ts`,
          execFileSync("git", ["show", `${baseline}:src/${name}.ts`], { encoding: "utf8" }),
        ],
      )
    : [],
);

const server = await createServer({
  server: { host: "127.0.0.1", port: 0 },
  plugins: [
    {
      name: "sparse-editor-replay",
      enforce: "pre",
      transform(source, id) {
        const path = id.split("/").slice(-2).join("/");
        const original = sources.get(path);
        if (path !== "src/main.ts") return original;
        source = original ?? source;
        const anchor = "  const cpuStart = performance.now();";
        assert(source.includes(anchor));
        return (
          source.replace(
            anchor,
            `${anchor}
  window.sparseReplayFrame?.(layers, now);
`,
          ) +
          `
window.installSparseReplay = ({ sparse, resolution, extent }) => {
  const volume = sparse
    ? new SparseSDFVolume(resolution, extent)
    : new SDFVolume(resolution, extent, false);
  if (!sparse) volume.values.fill(extent * 4);
  const next = new IndependentLayers(createBaseProject(volume, layers.project.settings), display);
  next.setUndoMeshCacheEnabled(true);
  xrExperience.rig.sculptureRoot.remove(layers.group, layers.composite.group);
  layers.dispose();
  layers = next;
  xrExperience.rig.sculptureRoot.add(layers.group, layers.composite.group);
  recovery?.dispose();
  recovery = undefined;
  refresh();
};
`
        );
      },
    },
  ],
});
let browser;
const results = [];
try {
  await server.listen();
  const port = server.httpServer.address().port;
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  });
  for (const workload of workloads) {
    for (const sparse of [false, true]) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${port}`);
      await page.waitForFunction(() => !!window.installSparseReplay);
      const result = await page.evaluate(
        async ({ sparse, resolution, extent, strokes }) => {
          window.installSparseReplay({ sparse, resolution, extent });
          await new Promise((resolve) => setTimeout(resolve, 600));
          window.centraPerformance.start(sparse ? "sparse" : "dense");
          const frames = [],
            actions = [];
          const point = ([x, y, z]) => ({ x: x / 1000, y: y / 1000, z: z / 1000 });
          const geometry = await new Promise((resolve, reject) => {
            let previous,
              released,
              index = 0;
            window.sparseReplayFrame = (layers, now) => {
              try {
                if (previous !== undefined) frames.push(now - previous);
                previous = now;
                if (released !== undefined) {
                  if (layers.pendingChunks) return;
                  actions.at(-1).drainMs = now - released;
                  released = undefined;
                }
                if (index > strokes.length + 1) {
                  delete window.sparseReplayFrame;
                  const runtime = layers.active;
                  resolve({
                    triangles: runtime.triangles,
                    memory: layers.sparseDiagnostics?.()?.trackedBytes ?? layers.trackedBytes,
                  });
                  return;
                }
                const start = performance.now();
                let mode;
                if (index === strokes.length) {
                  mode = "undo";
                  layers.undo();
                } else if (index === strokes.length + 1) {
                  mode = "redo";
                  layers.undo(true);
                } else {
                  const stroke = strokes[index];
                  mode = stroke.mode;
                  const construct = mode === "construct";
                  layers.beginStroke();
                  for (const end of [stroke.a, stroke.b])
                    layers.applyStrokeLocal(
                      point(end),
                      stroke.radius / 1000,
                      construct ? "add" : mode,
                      0.5,
                      1 / 120,
                      1,
                      construct,
                    );
                  layers.finishStroke();
                }
                const pending = layers.pendingChunks;
                actions.push({ mode, cpuMs: performance.now() - start, pending, drainMs: 0 });
                if (pending) released = now;
                index++;
              } catch (error) {
                delete window.sparseReplayFrame;
                reject(error);
              }
            };
          });
          const capture = window.centraPerformance.snapshot();
          window.centraPerformance.stop();
          await new Promise((resolve) => setTimeout(resolve, 220));
          const details = document.querySelector("#rebuild-info").textContent;
          return { frames, actions, geometry: { ...geometry, details }, capture };
        },
        { ...workload, sparse },
      );
      assert.deepEqual(errors, []);
      if (sparse && !baseline)
        assert.match(result.geometry.details, /pages.*tracked.*queue.*brush.*mesh/);
      results.push({ kind: workload.kind, sparse, ...result });
      console.log(
        workload.kind,
        sparse ? "sparse" : "dense",
        result.frames.length,
        result.geometry,
      );
      await page.close();
    }
    assert.equal(results.at(-1).geometry.triangles, results.at(-2).geometry.triangles);
  }
  await writeFile(outputPath, JSON.stringify(results, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
