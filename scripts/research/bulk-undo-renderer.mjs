import {
  BufferAttribute,
  BufferGeometry,
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
import { BulkMeshRebuild, stagePageMap } from "./bulk-revision.mjs";
import { LatestUndoMesh } from "./latest-undo-mesh.mjs";
import {
  AnalyticField,
  BandCache,
  brickCoords,
  bricksIn,
  FAR,
  publishStroke,
  stageStroke,
} from "./narrow-band.mjs";
import { createHalo, PerfCache } from "./narrow-band-perf.mjs";
import { frames } from "./renderer-frames.mjs";

const lo = [-540, -540, -540],
  hi = [540, 540, 540];
const status = document.querySelector("#status");
const canvas = document.querySelector("canvas");
const rounded = (n) => Number(n.toFixed(2));
function stats(values) {
  if (!values.length) return { count: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p) => rounded(sorted[Math.ceil(sorted.length * p) - 1]);
  return { count: sorted.length, p50: percentile(0.5), p95: percentile(0.95), max: percentile(1) };
}

function signature(entries) {
  let hash = 2166136261;
  for (const [key, arrays] of [...entries].sort(([a], [b]) => a - b)) {
    hash = Math.imul(hash ^ key, 16777619);
    for (const array of arrays) {
      hash = Math.imul(hash ^ array.length, 16777619);
      for (const word of new Uint32Array(array.buffer, array.byteOffset, array.length))
        hash = Math.imul(hash ^ word, 16777619);
    }
  }
  return hash >>> 0;
}

async function replay(
  trace,
  renderer,
  camera,
  material,
  policy,
  nextFrame,
  profile,
  residentLayers,
) {
  const scene = new Scene();
  const sculpt = new Group();
  scene.add(sculpt);
  const immersive = renderer.xr.isPresenting;
  const checkpoints = [];
  const residentPages = [];
  const residentMeshes = [];
  let residentPageBytes = 0;
  let residentMeshBytes = 0;
  async function record(phase, counts) {
    if (!profile) return;
    const point = {
      ...profile,
      phase,
      browserEpochMs: Date.now(),
      residentPageBytes,
      residentMeshBytes,
      ...counts,
    };
    checkpoints.push(point);
    if (location.protocol === "http:" && location.hostname === "127.0.0.1") {
      const response = await fetch("/profile", {
        method: "POST",
        body: JSON.stringify(point),
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) throw new Error("Memory checkpoint collector refused the sample");
    }
    // Give host-side process sampling a window outside the timed restore.
    const until = performance.now() + 2500;
    while (performance.now() < until) await nextFrame(() => renderer.render(scene, camera));
  }
  await record("before-growth", { exactPageBytes: 0, liveMeshBytes: 0, cacheBytes: 0 });
  const field = new AnalyticField();
  const read = (x, y, z) => field.read(x, y, z);
  const cache = new BandCache(3, 1, read, true);
  cache.entry = () => undefined;
  for (const { a, b, mode } of trace)
    publishStroke(field, cache, stageStroke(field, cache, a, b, mode));
  const originalField = field.edits;
  const source = new PerfCache(FAR, 1, read, true, "linear");
  source.entries = originalField;
  const halo = createHalo(source, lo, hi, 8);
  const meshes = new Map();
  const awaitingDraw = new Set();
  const restoredDrawn = new Set();
  let restoring = false;
  function extract(key) {
    const min = brickCoords(key).map((v, i) => v * 8 - lo[i]);
    return extractMesh(
      halo.region(
        min,
        min.map((v) => v + 8),
      ),
    );
  }
  function install(key, geometry) {
    const old = meshes.get(key);
    if (old) {
      sculpt.remove(old);
      old.geometry.dispose();
      meshes.delete(key);
    }
    if (!geometry) return;
    if (!geometry.attributes.position.count) {
      geometry.dispose();
      return;
    }
    const mesh = new Mesh(geometry, material);
    if (restoring) {
      awaitingDraw.add(key);
      mesh.onBeforeRender = () => {
        awaitingDraw.delete(key);
        restoredDrawn.add(key);
      };
    }
    meshes.set(key, mesh);
    sculpt.add(mesh);
  }
  const candidates = new Set();
  for (const key of originalField.keys()) {
    const start = brickCoords(key).map((v) => v * 8);
    for (const neighbor of bricksIn(
      start.map((v) => v - 1),
      start.map((v) => v + 7),
    ))
      candidates.add(neighbor);
  }
  for (const key of candidates) install(key, extract(key));
  const originalKeys = [...meshes.keys()];
  const fieldSignature = () => signature([...field.edits].map(([key, page]) => [key, [page]]));
  const meshSignature = () =>
    signature(
      [...meshes].map(([key, mesh]) => {
        const { position, normal } = mesh.geometry.attributes;
        return [key, [position.array, normal.array]];
      }),
    );
  const originalFieldHash = fieldSignature();
  const originalMeshHash = meshSignature();
  const triangles = [...meshes.values()].reduce(
    (n, mesh) => n + mesh.geometry.attributes.position.count / 3,
    0,
  );
  if (triangles !== 461818) throw new Error(`Unexpected branch topology: ${triangles} triangles`);

  const limitMiB = policy === "cache-refused" ? 24 : policy.startsWith("cache-") ? 40 : 0;
  const snapshot = new LatestUndoMesh(limitMiB * 1024 ** 2);
  const revision = Symbol("erase");
  const cacheStart = performance.now();
  const admitted =
    limitMiB > 0 &&
    snapshot.capture(
      revision,
      [...meshes].map(([key, mesh]) => {
        const { position, normal } = mesh.geometry.attributes;
        return [key, { position: position.array, normal: normal.array }];
      }),
    );
  const captureMs = performance.now() - cacheStart;
  const retainedBytes = snapshot.bytes;
  if (limitMiB && admitted !== (policy !== "cache-refused"))
    throw new Error("Cache admission did not match fixture budget");

  const exactPageBytes = [...originalField.values()].reduce(
    (sum, page) => sum + page.byteLength,
    0,
  );
  const liveMeshBytes = [...meshes.values()].reduce((sum, mesh) => {
    const { position, normal } = mesh.geometry.attributes;
    return sum + position.array.byteLength + normal.array.byteLength;
  }, 0);
  // Copies model independently owned edited layers with the same exact payload.
  for (let layer = 0; layer < residentLayers; layer++) {
    const pages = new Map([...originalField].map(([key, page]) => [key, page.slice()]));
    residentPages.push(pages);
    const group = new Group();
    group.position.y = (layer === 0 ? -1 : 1) * 140;
    sculpt.add(group);
    for (const { geometry } of meshes.values()) {
      const copy = geometry.clone();
      residentMeshes.push(copy);
      group.add(new Mesh(copy, material));
    }
    residentPageBytes += exactPageBytes;
    residentMeshBytes += liveMeshBytes;
  }
  const haloScratchBytes = halo.scratchBytes;
  const poseDeadline = performance.now() + 3000;
  let viewerPositionEmulated = null;
  for (;;) {
    const placed = await nextFrame((_, frame) => {
      if (immersive) {
        const pose = frame.getViewerPose(renderer.xr.getReferenceSpace());
        if (!pose) return false;
        viewerPositionEmulated = pose.emulatedPosition;
        const { position, orientation } = pose.transform;
        sculpt.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);
        sculpt.position
          .set(position.x, position.y, position.z)
          .add(new Vector3(0, 0, -1.45).applyQuaternion(sculpt.quaternion));
        sculpt.scale.setScalar(0.001);
      } else {
        camera.position.set(90, 280, 1800);
        camera.lookAt(0, 0, 0);
      }
      renderer.render(scene, camera);
      return true;
    });
    if (placed) break;
    if (performance.now() >= poseDeadline)
      throw new Error("Immersive session supplied no viewer pose");
  }
  await record("grown", {
    exactPageBytes,
    liveMeshBytes,
    cacheBytes: retainedBytes,
    cacheSharesLiveBuffers: true,
    haloScratchBytes,
  });
  const erased = new Map();
  field.edits = source.entries = erased;
  const remove = new BulkMeshRebuild(() => null, install);
  remove.begin(originalKeys);
  if (policy === "interrupted") {
    for (let i = 0; i < 3; i++) {
      await nextFrame(() => {
        remove.slice();
        renderer.render(scene, camera);
      });
    }
  } else {
    while (remove.pending) remove.slice();
    await nextFrame(() => renderer.render(scene, camera));
  }
  await record("erased", {
    exactPageBytes,
    exactPagesHeldForUndo: true,
    liveMeshBytes: 0,
    cacheBytes: retainedBytes,
    haloScratchBytes,
  });
  const missing = originalKeys.filter((key) => !meshes.has(key));
  if (!missing.length || (policy === "interrupted" ? !remove.pending : remove.pending))
    throw new Error("Unexpected erase state");

  const rebuild = new BulkMeshRebuild(extract, install);
  let cached;
  function installCached(key) {
    const buffers = cached.get(key);
    if (!buffers) throw new Error("Incomplete mesh snapshot");
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(buffers.position, 3));
    geometry.setAttribute("normal", new BufferAttribute(buffers.normal, 3));
    install(key, geometry);
    cached.delete(key);
  }
  const inputIntervals = 1000 / 60;
  const scheduledInput = [],
    dispatchedInput = [],
    frameGaps = [],
    frameCpu = [];
  const pendingInput = [];
  let due;
  function accept(event) {
    const now = performance.now();
    for (const time of event.detail) pendingInput.push({ time, now });
  }
  canvas.addEventListener("fixture-camera", accept);
  let firstDraw,
    finished,
    publicationMs,
    priorFrame,
    origin,
    timer,
    releaseFrames = 0;
  const restoreDeadlineMs = immersive ? 45_000 : residentLayers ? 30_000 : 15_000;
  try {
    while (releaseFrames < 4)
      await nextFrame((frame) => {
        const start = performance.now();
        if (origin !== undefined && start - origin > restoreDeadlineMs)
          throw new Error("Bulk render deadline");
        if (priorFrame !== undefined) frameGaps.push(frame - priorFrame);
        priorFrame = frame;
        if (origin === undefined) {
          origin = start;
          due = origin + inputIntervals;
          if (!immersive)
            timer = setInterval(() => {
              const now = performance.now();
              const ready = [];
              while (due <= now) {
                ready.push(due);
                due += inputIntervals;
              }
              if (ready.length)
                canvas.dispatchEvent(new CustomEvent("fixture-camera", { detail: ready }));
            }, 4);
          field.edits = source.entries = stagePageMap(erased, originalField);
          restoring = true;
          cached = snapshot.take(revision);
          if (admitted !== Boolean(cached)) throw new Error("Cache revision mismatch");
          if (!cached && policy !== "synchronous") rebuild.begin(missing);
          publicationMs = performance.now() - start;
          if (policy === "synchronous") for (const key of missing) install(key, extract(key));
        }
        if (cached) {
          const sliceStart = performance.now();
          let count = 0;
          for (const key of cached.keys()) {
            installCached(key);
            if (
              policy === "cache-batched" &&
              (++count >= 96 || performance.now() - sliceStart >= 2)
            )
              break;
          }
        } else if (policy !== "synchronous" && rebuild.pending) rebuild.slice();
        if (pendingInput.length) {
          const angle = (pendingInput.at(-1).time - origin) / 1000;
          camera.position.x = 90 + Math.sin(angle) * 75;
          camera.position.y = 280 + Math.cos(angle) * 20;
          camera.lookAt(0, 0, 0);
        }
        renderer.render(scene, camera);
        const rendered = performance.now();
        for (const event of pendingInput) {
          if (finished === undefined || event.time <= finished) {
            scheduledInput.push(rendered - event.time);
            dispatchedInput.push(rendered - event.now);
          }
        }
        pendingInput.length = 0;
        frameCpu.push(rendered - start);
        if (firstDraw === undefined && restoredDrawn.size) firstDraw = rendered - origin;
        if (finished === undefined && restoredDrawn.size === missing.length && !awaitingDraw.size)
          finished = rendered;
        if (finished !== undefined) releaseFrames++;
      });
    if (fieldSignature() !== originalFieldHash || meshSignature() !== originalMeshHash)
      throw new Error("Exact field or ordered mesh changed during Undo");
    await record("restored", { exactPageBytes, liveMeshBytes, cacheBytes: 0, haloScratchBytes });
    const nominalHz = renderer.xr.getSession()?.frameRate;
    if (
      residentPages.some(
        (pages) => signature([...pages].map(([key, page]) => [key, [page]])) !== originalFieldHash,
      )
    )
      throw new Error("Resident layer exact pages changed");
    return {
      policy,
      checkpoints,
      requestedHz: profile?.requestedHz ?? null,
      viewerPositionEmulated,
      nominalHz: nominalHz ?? null,
      estimatedMissedSlots: nominalHz
        ? frameGaps.reduce(
            (sum, gap) => sum + Math.max(0, Math.round((gap * nominalHz) / 1000) - 1),
            0,
          )
        : null,
      cache: { limitMiB, admitted, retainedBytes, captureMs: rounded(captureMs) },
      triangles,
      restoredChunks: missing.length,
      oldPending: remove.pending,
      exactField: originalFieldHash,
      exactMesh: originalMeshHash,
      publicationMs: rounded(publicationMs),
      firstDraw: rounded(firstDraw),
      fullDraw: rounded(finished - origin),
      frames: frameCpu.length - 3,
      cameraDueToDraw: stats(scheduledInput),
      cameraDispatchToDraw: stats(dispatchedInput),
      frameGaps: stats(frameGaps),
      frameCpu: stats(frameCpu),
      sliceMs:
        policy === "synchronous" || admitted
          ? null
          : stats(rebuild.queue.slices.map((slice) => slice.ms)),
      queuePeak: policy === "synchronous" || admitted ? null : rebuild.queue.peak,
    };
  } finally {
    clearInterval(timer);
    canvas.removeEventListener("fixture-camera", accept);
    for (const mesh of meshes.values()) mesh.geometry.dispose();
    for (const geometry of residentMeshes) geometry.dispose();
    scene.clear();
  }
}

export async function run(
  trace,
  cacheComparison = false,
  memoryProfile = null,
  residentLayers = 0,
  panelPolicy = null,
) {
  const immersive = memoryProfile === "immersive";
  const renderer = new WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(1);
  renderer.setSize(900, 600, false);
  renderer.setClearColor(0x17202d);
  const camera = immersive
    ? new PerspectiveCamera(60, 1.5, 0.01, 30)
    : new OrthographicCamera(-780, 780, 520, -520, 1, 4000);
  let session;
  let ended = false;
  const material = new MeshNormalMaterial();
  const reports = [];
  const policies = cacheComparison
    ? ["progressive", "cache-refused", "cache-immediate", "cache-batched"]
    : ["synchronous", "progressive", "interrupted"];
  try {
    if (immersive) {
      renderer.xr.enabled = true;
      renderer.xr.setReferenceSpaceType("local");
      session = await navigator.xr.requestSession("immersive-vr");
      session.addEventListener(
        "end",
        () => {
          ended = true;
        },
        { once: true },
      );
      await renderer.xr.setSession(session);
    }
    const nextFrame = frames(renderer);
    const supported = [...(session?.supportedFrameRates ?? [])];
    const rates = memoryProfile ? [72, 90].filter((hz) => supported.includes(hz)) : [];
    const runId = crypto.randomUUID();
    const variants = panelPolicy
      ? [panelPolicy]
      : memoryProfile
        ? ["progressive", "cache-batched"]
        : policies;
    for (const hz of rates.length && typeof session.updateTargetFrameRate === "function"
      ? rates
      : [null]) {
      if (hz !== null) await session.updateTargetFrameRate(hz);
      for (let trial = 0; trial < 3; trial++) {
        for (const policy of [
          ...variants.slice(trial % variants.length),
          ...variants.slice(0, trial % variants.length),
        ]) {
          status.textContent = `Trial ${trial + 1}/3 · ${hz ?? session?.frameRate ?? "desktop"} · ${policy}`;
          const profile = memoryProfile
            ? {
                runId,
                trial: trial + 1,
                requestedHz: hz,
                actualHz: session?.frameRate ?? null,
                mode: memoryProfile,
                policy,
              }
            : null;
          reports.push(
            await replay(
              trace,
              renderer,
              camera,
              material,
              policy,
              nextFrame,
              profile,
              residentLayers,
            ),
          );
          await nextFrame(() => {});
        }
      }
    }
    if (
      reports.some(
        (r) => r.exactField !== reports[0].exactField || r.exactMesh !== reports[0].exactMesh,
      )
    )
      throw new Error("Final checksums differ across runs");
    const report = {
      userAgent: navigator.userAgent,
      immersive,
      memoryProfile,
      supportedFrameRates: supported,
      panelPolicy,
      residentLayers,
      reports,
    };
    globalThis.rendererReport = report;
    const download = document.querySelector("#download");
    download.href = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    download.hidden = false;
    status.textContent =
      `PASS · ${reports.length} restores · ${reports[0].triangles} exact triangles\n` +
      reports.map((r) => `${r.policy}: ${r.firstDraw}/${r.fullDraw} ms first/full draw`).join("\n");
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
