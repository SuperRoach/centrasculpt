import {
  BufferGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { compareCompactSculpts, runCompactSculpt } from "./benchmark.mjs";

const status = document.querySelector("pre");
const canvas = document.querySelector("canvas");
const desktopButton = document.querySelector("#desktop");
const vrButton = document.querySelector("#vr");
const download = document.querySelector("#download");
const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.xr.enabled = true;
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
const scene = new Scene();
const camera = new PerspectiveCamera(44, canvas.clientWidth / canvas.clientHeight, 0.01, 10);
camera.position.set(0.22, 1.39, 0.03);
camera.lookAt(0, 1.35, -0.75);
scene.add(new HemisphereLight(0xffffff, 0x70757c, 2));
const key = new DirectionalLight(0xffebd8, 2);
key.position.set(2, 4, 2);
scene.add(key);
const bust = new Group();
bust.scale.setScalar(0.004);
bust.position.set(0, 1.35, -0.75);
scene.add(bust);
const chunks = new Map();
const material = new MeshStandardMaterial({ color: 0xd99872, roughness: 0.75 });
const emptyGeometry = new BufferGeometry();
let lastFrame = null;
let frameReady;
renderer.setAnimationLoop((now) => {
  const delta = lastFrame === null ? null : now - lastFrame;
  lastFrame = now;
  renderer.render(scene, camera);
  const callback = frameReady;
  frameReady = undefined;
  callback?.(delta);
});

function nextFrame() {
  return new Promise((resolve) => {
    frameReady = resolve;
  });
}

function updateChunks(updates) {
  for (const { id, geometry } of updates) {
    const mesh = chunks.get(id);
    if (!geometry.attributes.position.count) {
      if (mesh) bust.remove(mesh);
      chunks.delete(id);
    } else if (mesh) mesh.geometry = geometry;
    else {
      const next = new Mesh(geometry, material);
      chunks.set(id, next);
      bust.add(next);
    }
  }
}

let running = false;
async function run(immersive) {
  if (running) return;
  running = true;
  desktopButton.disabled = vrButton.disabled = true;
  download.hidden = true;
  let session;
  let interrupted = false;
  try {
    if (immersive) {
      session = await navigator.xr.requestSession("immersive-vr", {
        optionalFeatures: ["local-floor"],
      });
      session.addEventListener(
        "end",
        () => {
          interrupted = true;
        },
        { once: true },
      );
      await renderer.xr.setSession(session);
    }
    const runs = [];
    const order = document.querySelector("#order").value.split(",");
    for (const kind of order) {
      status.textContent = `Running ${kind}…`;
      const result = await runCompactSculpt(kind, {
        beforeStroke: async () => {
          if (interrupted) throw new Error("The immersive session ended before the run completed.");
          await nextFrame();
        },
        afterStroke: nextFrame,
        onChunks: updateChunks,
        snapshot: () => performance.memory?.usedJSHeapSize ?? null,
      });
      // The mesher has disposed these buffers. Remove references before the next run.
      for (const mesh of chunks.values()) mesh.geometry = emptyGeometry;
      chunks.clear();
      bust.clear();
      runs.push(result);
    }
    compareCompactSculpts(...runs);
    const result = {
      immersive,
      userAgent: navigator.userAgent,
      xrFrameRate: session?.frameRate ?? null,
      date: new Date().toISOString(),
      runs,
    };
    const body = JSON.stringify(result, null, 2);
    if (!download.hidden) URL.revokeObjectURL(download.href);
    download.href = URL.createObjectURL(new Blob([body], { type: "application/json" }));
    download.download = "compact-sculpt-results.json";
    download.hidden = false;
    status.textContent = "Complete. Dense and sparse field and mesh checksums agree.";
    try {
      const saved = await fetch("./results", { method: "POST", body });
      if (saved.ok) status.textContent += ` Saved as ${await saved.text()}.`;
    } catch {}
    window.compactSculptResults = result;
  } catch (error) {
    status.textContent = error.message;
  } finally {
    chunks.clear();
    bust.clear();
    if (session && !interrupted) await session.end();
    running = false;
    desktopButton.disabled = false;
    vrButton.disabled = !(await navigator.xr?.isSessionSupported("immersive-vr"));
  }
}

desktopButton.addEventListener("click", () => void run(false));
vrButton.addEventListener("click", () => void run(true));
try {
  vrButton.disabled = !(await navigator.xr?.isSessionSupported("immersive-vr"));
} catch {}
