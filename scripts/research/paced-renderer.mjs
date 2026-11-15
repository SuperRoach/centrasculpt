import {
  Group,
  Mesh,
  MeshNormalMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { extractMesh } from "../../src/mesh";
import { prepareBrushBatch } from "./brush-batch.mjs";
import { changedChunks } from "./changed-chunks.mjs";
import { chunkCost } from "./chunk-cost.mjs";
import { DirtyChunkQueue } from "./dirty-chunk-queue.mjs";
import { previewEligibility } from "./guarded-preview.mjs";
import {
  AnalyticField,
  BandCache,
  brickCoords,
  brickKey,
  FAR,
  publishStroke,
  stageStroke,
} from "./narrow-band.mjs";
import { createHalo, PerfCache } from "./narrow-band-perf.mjs";
import { frames } from "./renderer-frames.mjs";

const lo = [-540, -540, -540];
const hi = [540, 540, 540];
const status = document.querySelector("#status");

function statistics(values) {
  if (!values.length) return { count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p) => Number(sorted[Math.ceil(p * sorted.length) - 1].toFixed(2));
  return { count: values.length, p50: percentile(0.5), p95: percentile(0.95), max: percentile(1) };
}

function signature(entries) {
  let hash = 2166136261;
  for (const [key, arrays] of [...entries].sort(([a], [b]) => a - b)) {
    hash = Math.imul(hash ^ key, 16777619);
    for (const array of arrays) {
      hash = Math.imul(hash ^ array.length, 16777619);
      for (const bits of new Uint32Array(array.buffer, array.byteOffset, array.length))
        hash = Math.imul(hash ^ bits, 16777619);
    }
  }
  return hash >>> 0;
}

function distanceFromBrush(key, [x, y, z]) {
  const cx = ((key & 511) - 256) * 8 + 4;
  const cy = (((key >> 9) & 511) - 256) * 8 + 4;
  const cz = ((key >> 18) - 256) * 8 + 4;
  return (cx - x) ** 2 + (cy - y) ** 2 + (cz - z) ** 2;
}

async function replay(
  trace,
  renderer,
  camera,
  material,
  hz,
  policy,
  nextFrame,
  profile = false,
  tracked = false,
) {
  const scene = new Scene();
  const sculpt = new Group();
  scene.add(sculpt);
  let placed = !renderer.xr.isPresenting;
  const field = new AnalyticField();
  const exact = (x, y, z) => field.read(x, y, z);
  const staging = new BandCache(3, 1, exact, true);
  staging.entry = () => undefined;
  const source = new PerfCache(FAR, 1, exact, true, "linear");
  source.entries = field.edits;
  const halo = createHalo(source, lo, hi, 8);
  const meshes = new Map();
  const previews = new Map();
  const previewDrawn = new Map();
  const previewCounts = { boundary: 0, detail: 0, empty: 0, staleNeighbor: 0, eligible: 0 };
  const previewCpu = [];
  const coarseOrigin = lo.map((n) => n / 2);
  const coarse =
    policy === "guarded"
      ? createHalo(
          {
            gatherRow(x0, x1, y, z, target, offset) {
              for (let x = x0; x <= x1; x++) target[offset++] = exact(2 * x, 2 * y, 2 * z);
            },
          },
          coarseOrigin,
          hi.map((n) => n / 2),
          4,
          2,
        )
      : null;
  function retire(key) {
    const prior = previews.get(key);
    if (!prior) return;
    sculpt.remove(prior);
    prior.geometry.dispose();
    previews.delete(key);
    const old = meshes.get(key);
    if (old) old.visible = true;
  }
  function displayPreview(key) {
    const coords = brickCoords(key);
    const origin = coords.map((v) => v * 8);
    const result = previewEligibility(exact, origin);
    if (result !== "eligible") {
      previewCounts[result]++;
      return;
    }
    // Stale displayed neighbors may still touch a face that is exterior
    // in the current field. Keep exact display until they catch up.
    for (const [axis, component] of ["x", "y", "z"].entries()) {
      for (const direction of [-1, 1]) {
        const neighbor = coords.map((v, i) => v + (i === axis ? direction : 0));
        const old = meshes.get(brickKey(...neighbor));
        if (!old) continue;
        old.geometry.computeBoundingBox();
        const box = old.geometry.boundingBox;
        const face = origin[axis] + (direction === 1 ? 8 : 0);
        if (box.min[component] <= face && box.max[component] >= face) {
          previewCounts.staleNeighbor++;
          return;
        }
      }
    }
    const start = coords.map((v, i) => v * 4 - coarseOrigin[i]);
    const geometry = extractMesh(
      coarse.region(
        start,
        start.map((n) => n + 4),
      ),
    );
    if (!geometry.attributes.position.count) {
      geometry.dispose();
      previewCounts.empty++;
      return;
    }
    previewCounts.eligible++;
    const mesh = new Mesh(geometry, material);
    const revision = wantedRevision.get(key);
    mesh.onBeforeRender = () => previewDrawn.set(key, revision);
    const old = meshes.get(key);
    if (old) old.visible = false;
    previews.set(key, mesh);
    sculpt.add(mesh);
  }
  const wantedRevision = new Map();
  const builtRevision = new Map();
  const submittedRevision = new Map();
  const changes = [];
  const frameIntervals = [];
  const frameCpu = [];
  const drawCpu = [];
  const extractionOnly = policy === "extract";
  const phaseCpu = { input: [], extraction: [], sceneUpdate: [], revisionTracking: [] };
  let extractionMs = 0;
  let sceneUpdateMs = 0;
  let triangles = 0;
  let waitingFrames = 0;
  let next = 0;
  let releaseAt;
  const batchLimit = policy === "batch4" ? 4 : policy === "batch8" ? 8 : 0;
  const batchSizes = [];
  let finished;
  const localQuota = policy === "local";
  const adaptive = policy === "adaptive" || policy === "predictive";
  const predictor =
    policy === "predictive"
      ? chunkCost((key) => {
          const vertices = meshes.get(key)?.geometry.attributes.position.count ?? 0;
          return vertices === 0 ? 0 : vertices < 192 ? 1 : vertices < 576 ? 2 : 3;
        }, 1.15)
      : null;
  const callbackTarget = 1000 / 90;
  const activeBudgets = [];
  const activeFrameCpu = [];
  let drawEstimate = 7.8;
  let releaseCallbacks = 0;
  let slicesOverBudget = 0;
  const sliceBudgetMs = policy === "budget4" ? 4 : policy === "budget6" ? 6 : 2;
  const queue = new DirtyChunkQueue(
    192,
    ([key]) => {
      retire(key);
      const extractionStart = profile ? performance.now() : 0;
      const start = brickCoords(key).map((v, i) => v * 8 - lo[i]);
      const geometry = extractMesh(
        halo.region(
          start,
          start.map((v) => v + 8),
        ),
      );
      const publicationStart = profile ? performance.now() : 0;
      if (profile) extractionMs += publicationStart - extractionStart;
      const old = meshes.get(key);
      if (old) {
        triangles -= old.geometry.attributes.position.count / 3;
        sculpt.remove(old);
        old.geometry.dispose();
        meshes.delete(key);
      }
      const revision = wantedRevision.get(key);
      builtRevision.set(key, revision);
      if (geometry.attributes.position.count) {
        const mesh = new Mesh(geometry, material);
        mesh.onBeforeRender = () => submittedRevision.set(key, revision);
        sculpt.add(mesh);
        meshes.set(key, mesh);
        triangles += geometry.attributes.position.count / 3;
      } else geometry.dispose();
      if (profile) sceneUpdateMs += performance.now() - publicationStart;
    },
    8,
    sliceBudgetMs,
    localQuota ? distanceFromBrush : null,
    localQuota,
    localQuota ? 8 : null,
    policy === "recent" ? chunkCost() : null,
    undefined,
    localQuota ? 2 : null,
  );
  let origin;
  let previous;
  let prepared;
  try {
    while (finished === undefined)
      await nextFrame((frame, xrFrame) => {
        origin ??= frame;
        previous ??= frame;
        if (frame - origin >= 30_000) throw new Error("Render replay exceeded 30 seconds");
        if (!placed) {
          const viewer = xrFrame.getViewerPose(renderer.xr.getReferenceSpace());
          if (!viewer) return;
          if (tracked && viewer.emulatedPosition)
            throw new Error("Tracked benchmark received an emulated viewer position");
          if (tracked) status.dataset.tracking = "tracked viewer pose";
          const { position, orientation } = viewer.transform;
          sculpt.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);
          sculpt.position
            .set(position.x, position.y, position.z)
            .add(new Vector3(0, 0, -1.45).applyQuaternion(sculpt.quaternion));
          sculpt.scale.setScalar(0.001);
          placed = true;
        }
        const cpuStart = performance.now();
        if (frame > previous) frameIntervals.push(frame - previous);
        previous = frame;
        let applied = 0;
        const previewCandidates = new Set();
        function recordEdit(keys, b) {
          const revision = next + 1;
          for (const key of keys) {
            retire(key);
            wantedRevision.set(key, revision);
          }
          if (localQuota) queue.focus = b;
          const local = keys.filter((key) => distanceFromBrush(key, b) <= 12 ** 2);
          if (coarse) for (const key of local) previewCandidates.add(key);
          changes.push({
            keys,
            local,
            revision,
            due: origin + (next * 1000) / hz,
            commit: performance.now(),
          });
          next++;
          if (next === trace.length) releaseAt = performance.now();
        }
        if (batchLimit) {
          const due = Math.min(
            trace.length,
            next + batchLimit,
            1 + Math.floor(((frame - origin) * hz) / 1000),
          );
          if (next < due) {
            const batch = prepareBrushBatch(field, staging, trace.slice(next, due), queue, (key) =>
              meshes.has(key),
            );
            if (batch.blocked) waitingFrames++;
            if (batch.items.length) {
              queue.publish(batch.keys, () => {
                for (const { patch } of batch.items) publishStroke(field, staging, patch);
              });
              batchSizes.push(batch.items.length);
              for (const { keys, b } of batch.items) recordEdit(keys, b);
            }
          }
        } else {
          while (next < trace.length && frame >= origin + (next * 1000) / hz && applied < 3) {
            const { a, b, mode } = trace[next];
            if (!prepared) {
              const patch = stageStroke(field, staging, a, b, mode);
              prepared = {
                patch,
                keys: changedChunks(patch, (key) => meshes.has(key) || queue.pending.has(key)),
              };
            }
            if (!queue.canAdmit(prepared.keys)) {
              waitingFrames++;
              break;
            }
            const { patch, keys } = prepared;
            queue.publish(keys, () => publishStroke(field, staging, patch));
            recordEdit(keys, b);
            applied++;
            prepared = undefined;
          }
        }
        if (profile) phaseCpu.input.push(performance.now() - cpuStart);
        const inputReleased = frame >= origin + ((trace.length - 1) * 1000) / hz;
        if (adaptive) {
          const available = callbackTarget - drawEstimate - (performance.now() - cpuStart) - 0.7;
          queue.budgetMs = inputReleased ? 6 : Math.max(2, Math.min(4, available));
          if (inputReleased) releaseCallbacks++;
          else activeBudgets.push(queue.budgetMs);
        }
        extractionMs = sceneUpdateMs = 0;
        if (predictor) queue.cost = inputReleased ? null : predictor;
        const sliceCount = queue.slices.length;
        queue.slice();
        if (queue.slices.length !== sliceCount && queue.slices.at(-1).ms > queue.budgetMs)
          slicesOverBudget++;
        if (profile) {
          phaseCpu.extraction.push(extractionMs);
          phaseCpu.sceneUpdate.push(sceneUpdateMs);
        }
        if (next === trace.length) queue.focus = null;
        if (coarse && previewCandidates.size) {
          const start = performance.now();
          let checked = 0;
          for (const key of previewCandidates) {
            if (!queue.pending.has(key)) continue;
            displayPreview(key);
            if (++checked >= 4 || performance.now() - start >= 1) break;
          }
          if (checked) previewCpu.push(performance.now() - start);
        }
        const drawStart = performance.now();
        if (!extractionOnly) renderer.render(scene, camera);
        const drawEnd = performance.now();
        if (!extractionOnly) drawCpu.push(drawEnd - drawStart);
        if (adaptive) drawEstimate += 0.15 * (drawEnd - drawStart - drawEstimate);
        const readyRevision = extractionOnly ? builtRevision : submittedRevision;
        for (const change of changes) {
          const { local, keys, revision } = change;
          if (
            change.localDraw === undefined &&
            local.some((key) => (readyRevision.get(key) ?? 0) >= revision)
          )
            change.localDraw = drawEnd;
          if (
            change.previewDraw === undefined &&
            local.some((key) => (previewDrawn.get(key) ?? 0) >= revision)
          )
            change.previewDraw = drawEnd;
          if (
            change.exactDraw === undefined &&
            keys.every(
              (key) =>
                (builtRevision.get(key) ?? 0) >= revision &&
                (!meshes.has(key) || (readyRevision.get(key) ?? 0) >= revision),
            )
          )
            change.exactDraw = drawEnd;
        }
        const cpuEnd = performance.now();
        if (profile) phaseCpu.revisionTracking.push(cpuEnd - drawEnd);
        frameCpu.push(cpuEnd - cpuStart);
        if (!inputReleased) activeFrameCpu.push(cpuEnd - cpuStart);
        if (next === trace.length && !queue.pending.size) {
          finished = drawEnd;
        }
      });
    if (previews.size) throw new Error("Preview survived exact replacement");
    if (finished === undefined || changes.some((change) => change.exactDraw === undefined))
      throw new Error("Incomplete render replay or a dirty mesh was outside the camera");
    const readiness = (name, values) => ({
      [extractionOnly ? name.replace("Draw", "Build") : name]: statistics(values),
    });
    return {
      hz,
      policy,
      triangles,
      edits: changes.length,
      peak: queue.peak,
      waitingFrames,
      pendingAge: statistics(queue.ageTicks),
      deadlineSelections: queue.deadlineSelections,
      localSelections: queue.localSelections,
      field: signature([...field.edits].map(([key, array]) => [key, [array]])),
      mesh: signature(
        [...meshes].map(([key, mesh]) => {
          const { position, normal } = mesh.geometry.attributes;
          return [key, [position.array, normal.array]];
        }),
      ),
      inputToCommit: statistics(changes.map((c) => c.commit - c.due)),
      ...readiness(
        "localDraw",
        changes.flatMap((c) => (c.localDraw === undefined ? [] : [c.localDraw - c.due])),
      ),
      previewCounts,
      previewCpu: statistics(previewCpu),
      previewDraw: statistics(
        changes.flatMap((c) => (c.previewDraw === undefined ? [] : [c.previewDraw - c.due])),
      ),
      ...readiness(
        "firstLocalDraw",
        changes.flatMap((c) => {
          const first = Math.min(c.localDraw ?? Infinity, c.previewDraw ?? Infinity);
          return Number.isFinite(first) ? [first - c.due] : [];
        }),
      ),
      ...readiness(
        "exactDraw",
        changes.map((c) => c.exactDraw - c.due),
      ),
      ...(profile && {
        phaseCpu: Object.fromEntries(
          Object.entries(phaseCpu).map(([phase, values]) => [phase, statistics(values)]),
        ),
      }),
      batchSizes: statistics(batchSizes),
      servicedChunks: queue.serviced,
      sliceBudgetMs: adaptive ? null : sliceBudgetMs,
      ...(adaptive && { activeBudgets: statistics(activeBudgets), releaseCallbacks }),
      activeFrameCpu: statistics(activeFrameCpu),
      predictedStops: queue.predictedStops,
      firstChunkOverBudget: queue.firstChunkOverBudget,
      activeCpuOverTarget: activeFrameCpu.filter((ms) => ms > callbackTarget).length,
      chunksPerCallback: Number((queue.serviced / frameCpu.length).toFixed(2)),
      callbacksCpuOver11ms: frameCpu.filter((ms) => ms > callbackTarget).length,
      slicesOverBudget,
      finalInputToExactMs: Number(
        (finished - (origin + ((trace.length - 1) * 1000) / hz)).toFixed(2),
      ),
      releaseMs: Number((finished - releaseAt).toFixed(2)),
      frameIntervals: statistics(frameIntervals),
      frameCpu: statistics(frameCpu),
      drawCpu: statistics(drawCpu),
      sliceMs: statistics(queue.slices.map((s) => s.ms)),
      sliceOver2: queue.slices.filter((s) => s.ms > 2).length,
    };
  } finally {
    for (const mesh of [...meshes.values(), ...previews.values()]) mesh.geometry.dispose();
    scene.clear();
  }
}

export async function run(trace, alternative = "recent", immersive = false) {
  const tracked = alternative === "tracked";
  if (tracked && !immersive) throw new Error("This comparison requires tracked immersive WebXR");
  const renderer = new WebGLRenderer({
    canvas: document.querySelector("canvas"),
    antialias: false,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(900, 600, false);
  renderer.setClearColor(0x17202d);
  const camera = immersive
    ? new PerspectiveCamera(60, 1.5, 0.01, 30)
    : new OrthographicCamera(-780, 780, 520, -520, 1, 4000);
  if (!immersive) {
    camera.position.set(90, 280, 1800);
    camera.lookAt(0, 0, 0);
  }
  let session;
  let ended = false;
  const material = new MeshNormalMaterial();
  const trials = [];
  try {
    if (immersive) {
      renderer.xr.enabled = true;
      const referenceSpace = tracked ? "local" : "local-floor";
      renderer.xr.setReferenceSpaceType(referenceSpace);
      if (tracked) status.dataset.tracking = "requesting immersive session";
      session = await navigator.xr.requestSession("immersive-vr", {
        requiredFeatures: [referenceSpace],
      });
      if (tracked) status.dataset.tracking = "immersive session granted";
      session.addEventListener(
        "end",
        () => {
          ended = true;
        },
        { once: true },
      );
      await renderer.xr.setSession(session);
      if (tracked) status.dataset.tracking = "waiting for viewer pose";
    }
    const nextFrame = frames(renderer);
    const profile = ["extract", "budget", "adaptive", "predictive", "tracked"].includes(
      alternative,
    );
    const policies =
      alternative === "predictive"
        ? ["budget4", "adaptive", "predictive"]
        : alternative === "adaptive"
          ? ["fifo", "budget4", "adaptive"]
          : alternative === "budget"
            ? ["fifo", "budget4", "budget6"]
            : alternative === "batch"
              ? ["fifo", "batch4", "batch8"]
              : ["fifo", "guarded", "local"];
    for (let trial = 0; trial < 3; trial++) {
      for (const hz of trial % 2 ? [90, 45] : [45, 90]) {
        const ordered = ["compare", "batch", "budget", "adaptive", "predictive"].includes(
          alternative,
        )
          ? [...policies.slice(trial), ...policies.slice(0, trial)]
          : trial % 2
            ? [tracked ? "adaptive" : alternative, "fifo"]
            : ["fifo", tracked ? "adaptive" : alternative];
        for (const policy of ordered) {
          status.textContent = `Trial ${trial + 1}/3 · ${hz} edits/s · ${policy}`;
          trials.push(
            await replay(
              trace,
              renderer,
              camera,
              material,
              hz,
              policy,
              nextFrame,
              profile,
              tracked,
            ),
          );
        }
      }
    }
    const expected = trials[0];
    if (trials.some((r) => r.field !== expected.field || r.mesh !== expected.mesh))
      throw new Error("Final exact field or ordered mesh mismatch");
    const report = {
      userAgent: navigator.userAgent,
      immersive,
      xrFrameRate: session?.frameRate ?? null,
      trials,
    };
    const summary = trials.map((r) => [
      r.hz,
      r.policy,
      r.peak,
      r.waitingFrames,
      r.inputToCommit.p95,
      (r.localDraw ?? r.localBuild).count,
      (r.localDraw ?? r.localBuild).p50,
      (r.localDraw ?? r.localBuild).p95,
      (r.exactDraw ?? r.exactBuild).p50,
      (r.exactDraw ?? r.exactBuild).p95,
      r.releaseMs,
      r.frameIntervals.p50,
      r.frameIntervals.p95,
      r.frameCpu.p95,
      r.drawCpu.p95,
      r.sliceMs.p95,
      r.sliceOver2,
      r.sliceMs.count,
    ]);
    status.textContent =
      `PASS · ${expected.edits} edits · ${expected.triangles} triangles · exact checksums ${expected.field}/${expected.mesh}\n${navigator.userAgent}\n` +
      "Hz,policy,peak,blocked frames,commit p95,local ready count,local ready p50,local ready p95,exact ready p50,exact ready p95,release,rAF p50,rAF p95,frame CPU p95,draw CPU p95,slice p95,overruns,slices\n" +
      summary.map((row) => row.join(",")).join("\n");
    globalThis.rendererReport = report;
    const download = document.querySelector("#download");
    download.href = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    download.hidden = false;
  } finally {
    renderer.setAnimationLoop(null);
    try {
      if (session && !ended) await session.end();
    } finally {
      material.dispose();
      renderer.dispose();
    }
  }
}
