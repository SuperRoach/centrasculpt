// Dedicated loopback editor benchmark. Instrumentation is injected by Vite only.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import { strokeTrace } from "./research/compact-sculpt/trace.mjs";

const [mode, tracePath, output] = process.argv.slice(2);
if (!["desktop", "serve"].includes(mode))
  throw new Error("Usage: profile-sparse-readiness.mjs desktop|serve [trace JSON] [output JSON]");
const port = Number(process.env.PHASE97_PORT ?? 5387);
const origin = `http://127.0.0.1:${port}`;
const url = `${origin}/?phase97Replay=1`;
const compact = { kind: "compact", resolution: 129, extent: 0.064, strokes: strokeTrace() };
const metre = tracePath ? JSON.parse(await readFile(tracePath, "utf8")) : null;
const growth = process.env.PHASE97_GROWTH === "1";
const cases = growth
  ? [
      compact,
      ...(metre?.cases ?? []).flatMap((row) =>
        row.checkpoints.map(({ span, strokeCount }) => ({
          kind: row.kind,
          span,
          resolution: 65,
          extent: 0.032,
          strokes: (row.kind === "islands"
            ? row.islandStrokes.find((entry) => entry.span === span).strokes
            : row.strokes.slice(0, strokeCount)
          ).map((stroke) => ({ ...stroke, radius: 6 })),
        })),
      ),
    ]
  : [
      compact,
      ...(metre?.cases ?? []).map(({ kind, strokes }) => ({
        kind,
        resolution: 192,
        extent: 0.54,
        strokes: strokes.map((stroke) => ({ ...stroke, radius: 6 })),
      })),
    ];

const editor = `
window.phase97Replay = {
  install(sparse, resolution, extent) {
    const volume = sparse ? new SparseSDFVolume(resolution, extent) : new SDFVolume(resolution, extent, false);
    if (!sparse) volume.values.fill(extent * 4);
    const next = new IndependentLayers(createBaseProject(volume, layers.project.settings), display);
    next.setUndoMeshCacheEnabled(true);
    recovery?.cancelJob();
    xrExperience.rig.sculptureRoot.remove(layers.group, layers.composite.group);
    layers.dispose();
    layers = next;
    layers.interruptBackground = () => recovery?.cancelJob();
    xrExperience.rig.sculptureRoot.add(layers.group, layers.composite.group);
    recovery?.replaceProject();
    refresh();
  },
  run(strokes, immersive, growth = false) {
    return new Promise((resolve, reject) => {
      let previous, current, index = 0, idleSince, timeout, session, frameStart;
      let poseFrames = 0, trackedFrames = 0;
      const frames = [], frameCpu = [], actions = [], resources = [];
      function stop(error) {
        clearTimeout(timeout);
        delete window.phase97Before;
        delete window.phase97After;
        if (error) reject(error);
      }
      timeout = setTimeout(() => stop(new Error("Editor replay timed out")), 120000);
      window.phase97Before = (now, frame) => {
        if (immersive !== !!frame || (frame && frame.session.visibilityState !== "visible")) return;
        try {
          session = frame?.session;
          if (frame) {
            const space = renderer.xr.getReferenceSpace();
            const pose = space && frame.getViewerPose(space);
            if (pose) {
              poseFrames++;
              if (!pose.emulatedPosition) trackedFrames++;
            }
          }
          if (previous !== undefined && idleSince === undefined) frames.push(now - previous);
          previous = now;
          frameStart = performance.now();
          if (current || index >= strokes.length + 2) return;
          const start = performance.now(), revision = layers.active.surface.revision;
          let operation;
          if (index >= strokes.length) {
            operation = index === strokes.length ? "undo" : "redo";
            if (!layers.undo(operation === "redo")) throw new Error("History action unavailable");
          } else {
            const { mode, a, b, radius } = strokes[index];
            operation = mode;
            const construct = mode === "construct";
            layers.beginStroke();
            const ends = growth && a.every((value, i) => value === b[i]) ? [a] : [a,b];
            for (const [x, y, z] of ends)
              layers.applyStrokeLocal({x:x/1000,y:y/1000,z:z/1000}, radius/1000,
                construct ? "add" : mode, growth ? (mode === "smooth" ? 0.24 : 0.8) : 0.5,
                growth ? 1/60 : 1/120, growth ? 0.6 : 1, growth || construct);
            layers.finishStroke();
          }
          current = { operation, start, revision, editMs:performance.now()-start,
            queueDepth: layers.pendingChunks, queueAgeMs: 0 };
          index++;
        } catch (error) { stop(error); }
      };
      window.phase97After = (now, frame) => {
        if (now !== previous || immersive !== !!frame) return;
        try {
          const end = performance.now();
          if (idleSince === undefined) frameCpu.push(end-frameStart);
          if (current) {
            if (current.visibleMs === undefined && current.revision !== layers.active.surface.revision)
              current.visibleMs = end - current.start;
            current.queueDepth = Math.max(current.queueDepth, layers.pendingChunks);
            const queuedAt = layers.active.mesher.oldestPendingAt;
            if (queuedAt !== undefined)
              current.queueAgeMs = Math.max(current.queueAgeMs, performance.now()-queuedAt);
            if (!layers.pendingChunks) {
              actions.push({ operation: current.operation, editMs: current.editMs,
                firstMeshSubmissionMs: current.visibleMs ?? null, releaseToDrainSubmissionMs: end-current.start,
                pendingDepth:current.queueDepth, oldestPendingMs:current.queueAgeMs });
              current = undefined;
            }
          }
          if (!resources.length || now - resources.at(-1).now >= 100) {
            resources.push({ now, epochMs: Date.now(), trackedBytes:layers.trackedBytes,
              resourceStats: layers.resourceStats(), memory: {...renderer.info.memory},
              calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
              autosave: recovery && {active:recovery.active, bytes:recovery.lastBytes,
                copyMs:recovery.lastCopyMs, totalMs:recovery.lastMs, warning:recovery.warning} });
          }
          if (index === strokes.length + 2 && !current) {
            idleSince ??= now;
            if (now - idleSince >= (growth ? 0 : 5500)) {
              const rate = session?.frameRate ?? null;
              const missedCallbackSlots = rate ? frames.reduce((n, ms) =>
                n + Math.max(0, Math.round(ms * rate / 1000) - 1), 0) : null;
              stop();
              resolve({ immersive, rate, frames, frameCpu, poseFrames, trackedFrames, missedCallbackSlots, actions, resources,
                triangles:layers.active.triangles, spacingMm:layers.active.volume.step*1000,
                renderer: { framebufferScale: renderer.xr.getFramebufferScaleFactor?.(),
                  foveation:renderer.xr.getFoveation() } });
            }
          }
        } catch (error) { stop(error); }
      };
    });
  }
};
`;
const autoQuest = `
if (location.search.includes("phase97Auto=1")) {
  const startup = document.createElement("span");
  startup.textContent = "Phase 9.7 paired replay will start when you enter Studio.";
  document.querySelector("#xr-entry-slot").after(startup);
  let started = false;
  renderer.xr.addEventListener("sessionstart", () => {
    if (started) return;
    started = true;
    setTimeout(async () => {
      const workloads = ${JSON.stringify(growth ? cases : [compact])};
      const growth = ${growth};
      const result = [];
      async function publish(state, error) {
        await fetch("/__phase97_quest_result", {
          method: "POST", headers: {"Content-Type":"application/json"},
          body: JSON.stringify({state, error, result}),
        });
      }
      try {
        await publish("entered");
        for (let trial = 0; trial < (growth ? 1 : 2); trial++)
          for (const {kind, span, resolution, extent, strokes} of workloads)
            for (const sparse of growth ? [true] : trial ? [true, false] : [false, true]) {
              window.phase97Replay.install(sparse, resolution, extent);
              const row = await window.phase97Replay.run(strokes, true, growth);
              const paired = result.find((r) => r.trial === trial && r.kind === kind && r.sparse !== sparse);
              if (paired && (paired.triangles !== row.triangles || paired.rate !== row.rate))
                throw new Error("Paired detail or refresh rate differed");
              result.push({trial, kind, span, sparse, ...row});
              await publish("running");
            }
        await publish("complete");
      } catch (error) {
        await publish("failed", String(error));
      } finally {
        await renderer.xr.getSession()?.end();
      }
    }, 0);
  });
}
`;
function inject(source, anchor, replacement) {
  assert(source.includes(anchor), `Missing editor benchmark anchor ${anchor}`);
  return source.replace(anchor, replacement);
}
async function serve() {
  const server = await createServer({
    server: { host: "127.0.0.1", port, strictPort: true, hmr: false, watch: null },
    plugins: [
      {
        name: "centra-phase97-editor-profile",
        enforce: "pre",
        configureServer(server) {
          if (mode !== "serve" || !output) return;
          server.middlewares.use("/__phase97_quest_result", async (req, res) => {
            if (req.method !== "POST" || req.headers.origin !== origin) {
              res.writeHead(403).end();
              return;
            }
            try {
              const parts = [];
              let bytes = 0;
              for await (const part of req) {
                bytes += part.length;
                if (bytes > 8 * 1024 ** 2)
                  throw new Error("Benchmark report exceeded its envelope");
                parts.push(part);
              }
              const data = JSON.parse(Buffer.concat(parts).toString("utf8"));
              await writeFile(output, JSON.stringify(data, null, 2));
              res.writeHead(204).end();
            } catch (error) {
              console.error(error);
              res.writeHead(400).end();
            }
          });
        },
        transform(source, id) {
          if (!id.endsWith("/src/main.ts")) return;
          return (
            inject(
              inject(
                inject(
                  source,
                  "  const cpuStart = performance.now();",
                  "  window.phase97Before?.(now, frame);\n  const cpuStart = performance.now();",
                ),
                "    xrExperience!.finishFrame(performance.now() - cpuStart);",
                "    window.phase97After?.(now, frame);\n    xrExperience!.finishFrame(performance.now() - cpuStart);",
              ),
              "  if (questCapture.active) {\n    const time",
              "  window.phase97After?.(now, frame);\n  if (questCapture.active) {\n    const time",
            ) +
            `\nif (location.search.includes("phase97Replay=1")) {
              ${editor}
              ${mode === "serve" && output ? autoQuest : ""}
            }\n`
          );
        },
      },
    ],
  });
  await server.listen();
  console.log(mode === "serve" && output ? `${url}&phase97Auto=1` : url);
  return server;
}
async function instrumentProcesses(browser) {
  const cdp = await browser.newBrowserCDPSession(),
    run = promisify(execFile),
    samples = [];
  let pending;
  const timer = setInterval(() => {
    pending ??= (async () => {
      const from = Date.now();
      const { processInfo } = await cdp.send("SystemInfo.getProcessInfo");
      const { stdout } = await run("ps", [
        "-o",
        "pid=,rss=",
        "-p",
        processInfo.map(({ id }) => id).join(","),
      ]);
      const rss = new Map(
        stdout
          .trim()
          .split("\n")
          .map((line) => line.trim().split(/\s+/).map(Number)),
      );
      samples.push({
        from,
        to: Date.now(),
        processes: processInfo.map(({ id, type, cpuTime }) => ({
          id,
          type,
          cpuTime,
          rssKiB: rss.get(id) ?? null,
        })),
      });
    })()
      .catch((error) => samples.push({ error: String(error) }))
      .finally(() => {
        pending = undefined;
      });
  }, 350);
  return async () => {
    clearInterval(timer);
    await pending;
    await cdp.detach();
    return samples;
  };
}
async function runDesktopCase(page, workload, sparse) {
  await page.evaluate(
    ({ sparse, resolution, extent }) => window.phase97Replay.install(sparse, resolution, extent),
    { sparse, resolution: workload.resolution, extent: workload.extent },
  );
  return page.evaluate(({ strokes, growth }) => window.phase97Replay.run(strokes, false, growth), {
    strokes: workload.strokes,
    growth,
  });
}
if (mode === "serve") {
  await serve();
} else {
  assert(output);
  const server = await serve();
  const result = [];
  try {
    for (let trial = 0; trial < (growth ? 1 : 2); trial++)
      for (const workload of cases)
        for (const sparse of growth ? [true] : trial ? [true, false] : [false, true]) {
          const browser = await chromium.launch({
            executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
          });
          try {
            const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
              errors = [];
            page.on("pageerror", (error) => errors.push(error.message));
            await page.goto(url);
            await page.waitForFunction(() => !!window.phase97Replay);
            const stop = await instrumentProcesses(browser);
            try {
              const row = await runDesktopCase(page, workload, sparse);
              assert.deepEqual(errors, []);
              const paired = result.find(
                (r) => r.trial === trial && r.kind === workload.kind && r.sparse !== sparse,
              );
              if (paired) assert.equal(paired.triangles, row.triangles);
              result.push({
                trial,
                kind: workload.kind,
                span: workload.span,
                sparse,
                ...row,
                processes: await stop(),
              });
              console.log(workload.kind, sparse, row.triangles, row.actions.length);
              await writeFile(output, JSON.stringify(result, null, 2));
            } catch (error) {
              await stop();
              throw error;
            }
          } finally {
            await browser.close();
          }
        }
  } finally {
    await server.close();
  }
}
