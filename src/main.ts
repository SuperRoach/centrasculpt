import whatsNew from "../WHATS_NEW.md?raw";
import { exportFilename } from "./export-filename";
import { questCapture } from "./performance-capture";
import { TransformPreview } from "./transform-preview";
import { mountWhatsNew } from "./whats-new";

Object.assign(window, { centraPerformance: questCapture });

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { AppLifecycle } from "./app-lifecycle";
import type { BakePlan } from "./bake";
import { ClayStrokeSession } from "./clay-stroke-session";
import { installDesktopColourPicker } from "./desktop-colour-picker";
import { DesktopTubeTool } from "./desktop-tube-tool";
import { LayerDisplayPreferences } from "./display-preferences";
import { EditorToolState } from "./editor-tool-state";
import { exportGlbAsync } from "./export-client";
import type { ExportQuality, ExportSource } from "./export-mesh";
import { EXPORT_MEMORY_LIMIT, exportAdmission } from "./export-mesh";
import { IndependentLayers } from "./independent-layers";
import type { EditorMode } from "./interaction";
import { InputOwnership } from "./interaction";
import { DesktopLayerPalette } from "./layer-palette";
import { pickEditableLayer } from "./layer-picking";
import type { LayerOperation } from "./layers";
import { createBaseProject } from "./layers";
import { prepareLibrary } from "./library-worker-client";
import { LightRig } from "./light-rig";
import { lightingUI } from "./lighting-ui";
import { MAX_PROJECT_BYTES } from "./project";
import { ProjectBrowser } from "./project-browser";
import { ProjectLibrary } from "./project-library";
import { checksum } from "./project-snapshot";
import { captureProjectThumbnail } from "./project-thumbnail";
import { hydrateProject } from "./project-transfer";
import { leaveForProject } from "./project-workflow";
import { RecoveryController } from "./recovery";
import { encodeRecovery } from "./recovery-client";
import { IndexedRecoveryStore } from "./recovery-store";
import { ReferenceTransformTool } from "./reference-transform";
import { referenceUI } from "./reference-ui";
import { ReferenceView } from "./reference-view";
import { RENDER_STYLES, type RenderStyle, validateRenderStyle } from "./render-style";
import { DEFAULT_RESOLUTION } from "./resolution";
import { SAVE_LABELS, saveState } from "./save-status";
import { reflectPoint, SDFVolume } from "./sdf";
import { placeShapeOnSurface, StampClickGesture } from "./shape-placement";
import { ShapeGhost } from "./shape-preview";
import { ShapeRotationTool } from "./shape-rotation";
import { createShapeLibraryUI } from "./shape-ui";
import type { ShapeDefinition } from "./shapes";
import { StabilityMetrics } from "./stability-metrics";
import { copyTransform, hasUniformScale, identityTransform, uniformScale } from "./transform";
import {
  LayerTransformTools,
  rotateAxisForShortcut,
  translateAxisForShortcut,
} from "./transform-tools";
import { createUI } from "./ui";
import { createViewportTools, type WorkspaceTool } from "./viewport-tools";
import { volumeLabel } from "./volume-store";
import { XRBrushPreview } from "./xr-brush-preview";
import { XRExperience } from "./xr-experience";
import { XRMirrorPlane } from "./xr-mirror-plane";
import { countVisibleMeshes } from "./xr-performance";
import { XRSceneRig } from "./xr-scene";

let renderEmulatorFrame: ((time: number) => void) | null = null;
if (
  import.meta.env.DEV &&
  window.isSecureContext &&
  new URLSearchParams(location.search).get("xrEmulate") === "quest3"
) {
  try {
    const { installQuestEmulator } = await import("./xr-emulator");
    renderEmulatorFrame = await installQuestEmulator();
  } catch (error) {
    console.error("Quest emulator setup failed; desktop editor retained.", error);
  }
}
let editorTools: EditorToolState | undefined;
const ui = createUI();
let display = new LayerDisplayPreferences();
let layers = new IndependentLayers(
  createBaseProject(new SDFVolume(DEFAULT_RESOLUTION), {
    mode: "add",
    radius: 0.22,
    strength: 0.35,
    hardness: 0,
    camera: { position: [2.4, 1.7, 3.3], target: [0, 0, 0] },
  }),
  display,
);
let restoredSaveKey = "",
  manualSaveError = "",
  manualSaving = false;
let libraryAbort = new AbortController();
let loadingProject = false;
let recovery: RecoveryController | undefined;
const stabilityMetrics = new StabilityMetrics();
let stabilityText = "";
let xrExperience: XRExperience | undefined;
const xrBlocked = () => xrExperience?.blocking ?? false;
const input = new InputOwnership();
const stampClick = new StampClickGesture();
let transformTools: LayerTransformTools | undefined;
let ghostRotation: ShapeRotationTool | undefined;
let referenceEditor: ReferenceTransformTool | undefined;
let viewportTools: ReturnType<typeof createViewportTools> | undefined;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#e9e9e3");
scene.add(layers.group, layers.composite.group);
const cutPlanePreview = new THREE.Mesh(
  new THREE.PlaneGeometry(4, 4),
  new THREE.MeshBasicMaterial({
    color: "#e34b45",
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
);
cutPlanePreview.name = "Cut plane preview · presentation only";
cutPlanePreview.visible = false;
cutPlanePreview.renderOrder = 12;
scene.add(cutPlanePreview);
const shapeGhost = new ShapeGhost(() => layers.project.layerStack);
scene.add(shapeGhost.group);
const shapeLibraryUI = createShapeLibraryUI(
  document.getElementById("shape-library-slot")!,
  shapeGhost,
  () => layers.project.layerStack,
  () => loadingProject || ui.modalOpen || xrBlocked(),
  stop,
  () => {
    transformTools?.sync();
    cursor.visible = false;
    ui.status(
      shapeGhost.model.moveMode
        ? "Move preview · drag arrows or planes · Apply stamp when ready"
        : shapeGhost.model.rotationMode
          ? "Rotate stamp · drag a ring · T to finish"
          : shapeGhost.model.enabled
            ? shapeGhost.model.followPointer
              ? "Stamp — place on a visible surface"
              : "Preview held · G to move · T to rotate · Apply to stamp"
            : "Ghost hidden — sculpting available",
    );
  },
  () => applyShapeStamp(),
  () => toggleGhostRotation(),
  () => toggleGhostRotation("translate"),
);
const transformPreview = new TransformPreview();
let booleanPreview = false,
  lastCompositePoll = 0;
function syncView() {
  booleanPreview = layers.viewMode === "boolean";
  ui.surfaceView(
    layers.viewMode,
    layers.composite.pending ? undefined : layers.composite.stats?.triangles,
  );
  if (!booleanPreview) ui.compositeInfo("");
  transformPreview.sync(layers);
}
syncView();
const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
camera.position.set(2.4, 1.7, 3.3);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
ui.viewport.append(renderer.domElement);
renderer.domElement.tabIndex = 0;
function createCameraControls() {
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.minDistance = 1.2;
  orbit.maxDistance = 9;
  orbit.mouseButtons = {
    LEFT: null as unknown as THREE.MOUSE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.ROTATE,
  };
  orbit.addEventListener("start", () => {
    if (cameraView !== 0) {
      cameraView = 0;
      updateCameraViewLabel();
    }
  });
  return orbit;
}
let controls = createCameraControls();
const cameraViews = ["Perspective", "Top", "Side", "Bottom"] as const;
let cameraView = 0;
const cameraViewButton = document.querySelector<HTMLButtonElement>("#cycle-camera-view")!;
function updateCameraViewLabel() {
  document.getElementById("camera-view-label")!.textContent = cameraViews[cameraView];
  cameraViewButton.setAttribute(
    "aria-label",
    `Camera view: ${cameraViews[cameraView]}. Switch to ${cameraViews[(cameraView + 1) % cameraViews.length]}`,
  );
}
cameraViewButton.addEventListener("click", () => {
  if (xrBlocked() || loadingProject || desktopStroke.active) return;
  const target = controls.target.clone(),
    distance = camera.position.distanceTo(target),
    enabled = controls.enabled;
  controls.dispose();
  cameraView = (cameraView + 1) % cameraViews.length;
  const direction =
    cameraView === 1
      ? new THREE.Vector3(0, 1, 0)
      : cameraView === 2
        ? new THREE.Vector3(1, 0, 0)
        : cameraView === 3
          ? new THREE.Vector3(0, -1, 0)
          : new THREE.Vector3(2.4, 1.7, 3.3).normalize();
  camera.up.set(
    0,
    cameraView === 1 || cameraView === 3 ? 0 : 1,
    cameraView === 1 ? -1 : cameraView === 3 ? 1 : 0,
  );
  camera.position.copy(target).addScaledVector(direction, distance);
  controls = createCameraControls();
  controls.target.copy(target);
  controls.enabled = enabled;
  controls.update();
  updateCameraViewLabel();
});
const ambient = new THREE.HemisphereLight(0xffffff, 0x687267, 2.7);
scene.add(ambient);
const light = new THREE.DirectionalLight(0xfff4df, 3.4);
light.position.set(-3, 5, 4);
scene.add(light);
const fill = new THREE.DirectionalLight(0xd6eaff, 1.4);
fill.position.set(4, 1, -2);
scene.add(fill);
const grid = new THREE.GridHelper(8, 40, 0xc9cdc2, 0xdaddd3);
grid.position.y = -1.12;
scene.add(grid);
const cursor = new THREE.Mesh(
  new THREE.RingGeometry(0.97, 1, 64),
  new THREE.MeshBasicMaterial({
    color: 0x435d2c,
    side: THREE.DoubleSide,
    depthTest: false,
    transparent: true,
    opacity: 0.85,
  }),
);
cursor.renderOrder = 10;
cursor.visible = false;
scene.add(cursor);
const raycaster = new THREE.Raycaster(),
  pointer = new THREE.Vector2(),
  normal = new THREE.Vector3(),
  normalMatrix = new THREE.Matrix3();
let pointerInside = false,
  activePointer: number | null = null,
  lastRebuild = performance.now();
const message = (error: unknown) => (error instanceof Error ? error.message : "Unknown error.");
function syncStats() {
  const runtime = layers.active;
  const triangles = layers.project.layerStack.layers.reduce(
    (sum, layer) => sum + (layer.visible ? layers.runtime(layer.id).triangles : 0),
    0,
  );
  if (booleanPreview) {
    const s = layers.composite.stats;
    ui.meshInfo(s?.triangles ?? 0, s?.resolution ?? 0, true);
    ui.performance(
      s
        ? `COMPOSITE SAMPLE ${s.samplingMs.toFixed(1)} ms · MESH ${s.meshingMs.toFixed(1)} ms · ${s.chunks}/${s.totalChunks} CHUNKS`
        : "COMPOSITE PENDING",
    );
  } else {
    ui.meshInfo(triangles, volumeLabel(runtime.layer.volume));
    ui.performance(
      `BRUSH ${runtime.brushMs.toFixed(1)} ms (AVG ${(runtime.brushTotal / Math.max(1, runtime.brushFrames)).toFixed(1)}) · MESH ${runtime.lastMeshMs.toFixed(1)} ms · ${runtime.lastChanged}/${runtime.totalChunks} CHUNKS`,
    );
  }
  ui.history(layers.undoCount, layers.redoCount, loadingProject || xrBlocked());
}
function syncTransformUI() {
  syncViewportTools();
  ui.transformState(
    layers.transformNode.transform,
    layers.transformNode.editable,
    input.mode,
    input.space,
    loadingProject || xrBlocked(),
  );
  syncStats();
}
function refresh() {
  exportEstimate();
  syncView();
  ui.layerRows(layers.project.layerStack.layers, layers.project.activeLayerId, (layer) =>
    display.colour(layers.project.id, layer.id, layer.order),
  );
  desktopLayers?.render();
  ui.resolution(layers.active.layer.volume.resolution);
  syncRenderStyle();
  ui.viewportMode(display.mode);
  syncTransformUI();
  transformTools?.sync();
}
var desktopLayers: DesktopLayerPalette | undefined;
const desktopStroke = new ClayStrokeSession(
  () => layers,
  () => refresh(),
);
function stopSculpt(commit = false) {
  const captured = activePointer;
  activePointer = null;
  input.end("sculpt");
  controls.enabled = input.cameraEnabled;
  if (desktopStroke.active) {
    if (desktopStroke.phase === "drawing" && (commit || !desktopStroke.buffered))
      desktopStroke.end();
    else if (!commit) desktopStroke.cancel();
  } else layers.finishStroke();
  syncStats();
  lastRebuild = performance.now();
  if (captured !== null && renderer.domElement.hasPointerCapture(captured))
    renderer.domElement.releasePointerCapture(captured);
}
function stop() {
  referenceEditor?.setMode(null);
  stampClick.cancel();
  ghostRotation?.finish();
  transformTools?.finish();
  stopSculpt();
}
function updatePointer(e: PointerEvent) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    (-(e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  pointerInside = true;
}
transformTools = new LayerTransformTools(camera, renderer.domElement, scene, () => layers, input, {
  beforeDrag: stopSculpt,
  camera: (enabled) => {
    controls.enabled = enabled;
  },
  changed: syncTransformUI,
  error: (text) => ui.projectMessage(text, true),
  hitLayer: (event) => {
    updatePointer(event);
    raycaster.setFromCamera(pointer, camera);
    return pickEditableLayer(raycaster, layers)?.layerId ?? null;
  },
  selectionChanged: refresh,
  busy: () =>
    loadingProject ||
    ui.modalOpen ||
    xrBlocked() ||
    shapeGhost.model.enabled ||
    input.referenceEditing,
});
ghostRotation = new ShapeRotationTool(
  camera,
  renderer.domElement,
  scene,
  shapeGhost.model,
  () => layers.project.layerStack,
  input,
  {
    beforeDrag: () => {
      stampClick.cancel();
      transformTools?.finish();
      stopSculpt();
    },
    camera: (enabled) => {
      controls.enabled = enabled;
    },
    changed: () => {
      shapeGhost.sync();
      shapeLibraryUI.refresh();
    },
    error: (text) => ui.projectMessage(text, true),
    busy: () => loadingProject || ui.modalOpen || xrBlocked() || input.referenceEditing,
  },
);
function toggleGhostRotation(mode: "rotate" | "translate" = "rotate"): void {
  if (loadingProject || ui.modalOpen || xrBlocked()) return;
  stop();
  try {
    ghostRotation!.toggle(mode);
    ui.status(
      shapeGhost.model.moveMode
        ? "Move preview · drag arrows or planes · Apply stamp when ready"
        : shapeGhost.model.rotationMode
          ? "Rotate stamp · drag a ring · T to finish"
          : "Preview held · G to move · T to rotate · Apply stamp",
    );
    shapeLibraryUI.refresh();
  } catch (error) {
    ui.status(message(error));
  }
}
function applyShapeStamp(definition?: ShapeDefinition): void {
  if (
    input.referenceEditing ||
    loadingProject ||
    ui.modalOpen ||
    xrBlocked() ||
    !shapeGhost.model.canApply(
      layers.project.layerStack,
      loadingProject || ui.modalOpen || xrBlocked(),
    ) ||
    !input.cameraEnabled
  )
    return;
  stop();
  try {
    const changed = layers.stampShape(
        definition ?? shapeGhost.model.futureStampIntent(layers.project.layerStack).definition,
      ),
      s = layers.lastStampStats!;
    ui.projectMessage(
      `Stamp ${changed ? "applied" : "unchanged"} · ${s.changedVoxels.toLocaleString()} voxels · evaluate ${s.evaluationMs.toFixed(1)} ms · mesh ${s.meshingMs.toFixed(1)} ms · total ${s.totalMs.toFixed(1)} ms · ${s.chunks}/${s.totalChunks} chunks`,
    );
    ui.status(changed ? "Shape stamped · one undo action" : "No voxel changes · history kept");
    refresh();
  } catch (error) {
    ui.projectMessage(`Stamp failed: ${message(error)}`, true);
  }
}
function placePointerShape(): boolean {
  if (
    input.referenceEditing ||
    !shapeGhost.model.enabled ||
    shapeGhost.model.manipulating ||
    loadingProject ||
    ui.modalOpen ||
    xrBlocked() ||
    !input.cameraEnabled ||
    shapeGhost.model.availability(layers.project.layerStack)
  )
    return false;
  if (!shapeGhost.model.followPointer) return true;
  raycaster.setFromCamera(pointer, camera);
  const meshes: THREE.Object3D[] = [];
  (booleanPreview ? layers.composite.group : layers.group).traverseVisible((object) => {
    if (object instanceof THREE.Mesh) meshes.push(object);
  });
  const hit = raycaster.intersectObjects(meshes, false)[0];
  if (!hit) return false;
  placeShapeOnSurface(shapeGhost.model, layers.project.layerStack, hit.point);
  shapeGhost.sync();
  shapeLibraryUI.refresh();
  return true;
}
renderer.domElement.addEventListener("pointermove", (event) => {
  stampClick.move(event.pointerId, event.clientX, event.clientY, event.buttons);
  if (event.buttons === 0) {
    updatePointer(event);
    try {
      placePointerShape();
    } catch (error) {
      ui.status(message(error));
    }
  }
});
function syncViewportTools(): void {
  viewportTools?.sync(
    editorTools?.active === "tube" || editorTools?.active === "edit-spline"
      ? "tube"
      : shapeGhost.model.enabled
        ? "boolean"
        : ui.mode === "smooth"
          ? "smooth"
          : ui.mode === "paint" || ui.mode === "paint-erase"
            ? "paint"
            : "brush",
    input.mode,
    layers.active.layer.editable,
    loadingProject || ui.modalOpen || xrBlocked(),
    { colour: layers.paintColour, radius: ui.radius, strength: ui.strength },
  );
}
function chooseWorkspace(tool: WorkspaceTool, fromXR = false): void {
  if (loadingProject || ui.modalOpen || (xrBlocked() && !fromXR)) return;
  editorTools?.clearMoveSelection();
  stop();
  shapeLibraryUI.setOpen(tool === "boolean", fromXR);
  if (tool === "tube") {
    editorTools!.select("tube");
    precisionPanel.open = true;
    return;
  }
  if (tool === "paint") ui.setSettings({ ...ui.settings, mode: "paint" });
  else if (tool !== "boolean") ui.selectBrushTool(tool);
  transformTools!.setMode("sculpt");
  syncTransformUI();
  cursor.visible = false;
  ui.status(
    tool === "boolean"
      ? "Boolean shapes · position and click once to stamp"
      : `${tool === "smooth" ? "Smooth" : tool === "paint" ? "Paint" : "Brush"} tool · ${layers.active.layer.name}`,
  );
}
function chooseLayerMode(mode: EditorMode, fromXR = false): void {
  if (loadingProject || ui.modalOpen || (xrBlocked() && !fromXR)) return;
  editorTools?.clearMoveSelection();
  stop();
  shapeLibraryUI.setOpen(false, fromXR);
  transformTools!.setMode(mode);
  syncTransformUI();
  cursor.visible = false;
  ui.status(
    mode === "rotate"
      ? `Rotate · ${layers.transformNode.name} · drag the surface; hold R/F/V for X/Y/Z`
      : mode === "translate"
        ? `Move · ${layers.transformNode.name} · drag the surface; hold E/D/C for X/Y/Z`
        : `${mode} · ${layers.transformNode.name}`,
  );
}
viewportTools = createViewportTools(ui.viewport, chooseWorkspace, chooseLayerMode, {
  colour: (value) => {
    editorTools?.setPaintColour(value);
    syncViewportTools();
  },
  brush: (field, value) => {
    ui.setSettings({ ...ui.settings, [field]: value });
    syncViewportTools();
  },
});
syncViewportTools();
renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
renderer.domElement.addEventListener("pointermove", updatePointer);
renderer.domElement.addEventListener("pointerleave", () => {
  pointerInside = false;
  cursor.visible = false;
});
renderer.domElement.addEventListener("pointerdown", (e) => {
  if (input.referenceEditing) return;
  if (shapeGhost.model.enabled) {
    if (shapeGhost.model.manipulating) {
      stampClick.cancel();
      return;
    }
    if (e.button !== 0) {
      stampClick.cancel();
      return;
    }
    updatePointer(e);
    try {
      if (
        placePointerShape() &&
        stampClick.begin(
          e.pointerId,
          e.button,
          e.clientX,
          e.clientY,
          shapeGhost.model.definition,
          e.buttons,
          e.isPrimary,
        )
      )
        renderer.domElement.setPointerCapture(e.pointerId);
    } catch (error) {
      ui.status(message(error));
    }
    return;
  }
  if (
    e.button !== 0 ||
    desktopStroke.active ||
    activePointer !== null ||
    !input.canSculpt(
      layers.active.layer.editable,
      loadingProject || ui.modalOpen || xrBlocked() || shapeGhost.model.enabled,
    )
  )
    return;
  if (editorTools?.active === "tube" || editorTools?.active === "edit-spline") return;
  try {
    desktopStroke.begin(ui.settings, editorTools!.path, performance.now());
    if (!input.beginSculpt(layers.active.layer.editable, loadingProject)) {
      desktopStroke.cancel();
      return;
    }
    updatePointer(e);
    activePointer = e.pointerId;
    controls.enabled = input.cameraEnabled;
    renderer.domElement.setPointerCapture(e.pointerId);
  } catch (error) {
    desktopStroke.cancel();
    input.end("sculpt");
    controls.enabled = input.cameraEnabled;
    ui.status(message(error));
  }
});
renderer.domElement.addEventListener("pointerup", (event) => {
  if (input.referenceEditing) {
    stampClick.cancel();
    return;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  if (
    event.buttons !== 0 ||
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    stampClick.cancel();
  const definition = stampClick.complete(
    event.pointerId,
    event.button,
    event.clientX,
    event.clientY,
    layers.project.activeLayerId,
  );
  if (definition) applyShapeStamp(definition);
  if (activePointer !== null) stopSculpt(true);
  else if (!desktopStroke.active) stop();
});
renderer.domElement.addEventListener("pointercancel", stop);
renderer.domElement.addEventListener("lostpointercapture", () => {
  if (activePointer !== null) stop();
});
// AppLifecycle resolves suspension/blur without committing partial gestures.
function changeHistory(redo: boolean) {
  if (loadingProject || ui.modalOpen || xrBlocked()) return;
  stop();
  try {
    const id = layers.undo(redo);
    if (id) {
      cursor.visible = false;
      ui.status(`${redo ? "Redone" : "Undone"} on ${layers.active.layer.name}`);
    }
    refresh();
  } catch (error) {
    ui.projectMessage(message(error), true);
  }
}
document.getElementById("undo")!.addEventListener("click", () => changeHistory(false));
document.getElementById("redo")!.addEventListener("click", () => changeHistory(true));
window.addEventListener("keydown", (event) => {
  if (ui.modalOpen || xrBlocked()) return;
  if (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.repeat &&
    event.key.toLowerCase() === "s"
  ) {
    event.preventDefault();
    document.getElementById("save-project")!.click();
    return;
  }
  if (event.key === "Escape" && shapeGhost.model.enabled && !loadingProject) {
    stop();
    shapeGhost.clear();
    shapeLibraryUI.refresh();
    transformTools?.sync();
    ui.status("Ghost hidden — sculpting available");
    return;
  }
  if (
    event.target instanceof Element &&
    event.target.closest('input:not([type="range"]),textarea,select,[contenteditable="true"]')
  )
    return;
  if (input.referenceEditing && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const mode = ({ w: "translate", e: "rotate", r: "scale" } as const)[
      event.key.toLowerCase() as "w" | "e" | "r"
    ];
    if (event.key === "Escape" || mode) {
      event.preventDefault();
      referenceEditor?.setMode(event.key === "Escape" ? null : mode);
      return;
    }
  }
  if (!event.metaKey && !event.ctrlKey && !event.altKey && input.mode === "rotate") {
    if (rotateAxisForShortcut(event.code)) {
      event.preventDefault();
      if (!event.repeat) transformTools?.holdRotateAxis(event.code);
      return;
    }
  }
  if (!event.metaKey && !event.ctrlKey && !event.altKey && input.mode === "translate") {
    if (translateAxisForShortcut(event.code)) {
      event.preventDefault();
      if (!event.repeat) transformTools?.holdTranslateAxis(event.code);
      return;
    }
  }
  if (
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    event.key.toLowerCase() === "i" &&
    !event.repeat
  ) {
    event.preventDefault();
    cycleRenderStyle();
    return;
  }
  if (
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    event.key.toLowerCase() === "g" &&
    !event.repeat
  ) {
    event.preventDefault();
    toggleGhostRotation("translate");
    return;
  }
  if (
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    event.key.toLowerCase() === "t" &&
    !event.repeat
  ) {
    event.preventDefault();
    toggleGhostRotation();
    return;
  }
  if (
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    event.key.toLowerCase() === "b" &&
    !loadingProject
  ) {
    event.preventDefault();
    chooseWorkspace("brush");
    return;
  }
  if (!event.metaKey && !event.ctrlKey && !event.altKey && !input.transforming) {
    const mode = ({ w: "translate", e: "rotate", r: "scale" } as Record<string, EditorMode>)[
      event.key.toLowerCase()
    ];
    if (mode && shapeGhost.model.enabled) {
      event.preventDefault();
      ui.status(
        "Hide the shape ghost to use layer gizmos. Ghost pose fields are in Shape Library.",
      );
      return;
    }
    if (mode) {
      event.preventDefault();
      stop();
      transformTools!.setMode(mode);
      syncTransformUI();
      ui.status(
        mode === "rotate"
          ? `Rotate · ${layers.transformNode.name} · drag the surface; hold R/F/V for X/Y/Z`
          : mode === "translate"
            ? `Move · ${layers.transformNode.name} · drag the surface; hold E/D/C for X/Y/Z`
            : `${mode} · ${layers.transformNode.name}`,
      );
      return;
    }
  }
  if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (!event.repeat) changeHistory(event.shiftKey);
  }
});
window.addEventListener("keyup", (event) => {
  transformTools?.releaseRotateAxis(event.code);
  transformTools?.releaseTranslateAxis(event.code);
});
window.addEventListener("blur", () => transformTools?.clearAxisConstraints());
let studioEnvironment: THREE.WebGLRenderTarget | null = null;
function syncRenderStyle(): void {
  const style = display.renderStyle;
  if (style !== "normal" && !studioEnvironment) {
    const room = new RoomEnvironment(),
      generator = new THREE.PMREMGenerator(renderer);
    try {
      studioEnvironment = generator.fromScene(room, 0.04);
    } finally {
      room.dispose();
      generator.dispose();
    }
  }
  scene.environment = style !== "normal" ? studioEnvironment!.texture : null;
  renderer.toneMapping = style !== "normal" ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.toneMappingExposure = style !== "normal" ? 0.9 : 1;
  ui.renderStyle(style);
}
function setRenderStyle(style: RenderStyle): void {
  if (loadingProject || ui.modalOpen || xrBlocked()) return;
  stop();
  display.renderStyle = style;
  layers.syncPresentation();
  syncRenderStyle();
  ui.status(
    `${style === "normal" ? "Normal clay" : style === "matte" ? "Matte soft reflections" : "Glossy surface inspection"} · viewport only`,
  );
}
document
  .getElementById("render-style")!
  .addEventListener("change", (event) =>
    setRenderStyle(validateRenderStyle((event.target as HTMLSelectElement).value)),
  );
function cycleRenderStyle(): void {
  setRenderStyle(
    RENDER_STYLES[(RENDER_STYLES.indexOf(display.renderStyle) + 1) % RENDER_STYLES.length],
  );
}
document.getElementById("cycle-render-style")!.addEventListener("click", cycleRenderStyle);
const paint = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
async function heavy(text: string, work: () => void) {
  if (loadingProject || xrBlocked()) return;
  stop();
  loadingProject = true;
  ui.projectBusy(true);
  syncTransformUI();
  transformTools?.sync();
  ui.projectMessage(text);
  await paint();
  try {
    work();
    cursor.visible = false;
    pointerInside = false;
    lastRebuild = performance.now();
  } catch (error) {
    ui.projectMessage(message(error), true);
  } finally {
    loadingProject = false;
    refresh();
    ui.projectBusy(false);
  }
}
ui.onTransformAction((action) => {
  if (loadingProject || ui.modalOpen || xrBlocked()) return;
  stop();
  try {
    if (action.type === "mode") {
      if (action.mode === "sculpt") chooseWorkspace("brush");
      else chooseLayerMode(action.mode);
    } else if (action.type === "space") transformTools!.setSpace(action.space);
    else if (action.type === "reset") layers.setActiveTransform(identityTransform());
    else {
      if (!Number.isFinite(action.value)) throw new Error("Enter a finite transform value.");
      const next = copyTransform(layers.transformNode.transform),
        axis = "xyz".indexOf(action.field[1]);
      if (action.field === "scale") next.scale = [action.value, action.value, action.value];
      else if (action.field[0] === "p") next.position[axis] = action.value;
      else next.rotation[axis] = (action.value * Math.PI) / 180;
      layers.setActiveTransform(next);
    }
    cursor.visible = false;
    ui.status(`${layers.transformNode.name} · ${input.mode} · transforms use metadata only`);
  } catch (error) {
    ui.projectMessage(message(error), true);
  }
  syncTransformUI();
  transformTools!.sync();
});
ui.onLayerAction(async (action, id, value) => {
  if (loadingProject || xrBlocked()) return;
  stop();
  try {
    if (action === "new" || action === "new-empty")
      return await heavy("Creating independent layer…", () => {
        layers.create(Number(value), action === "new-empty");
        ui.projectMessage("Independent layer created. Overlapping volumes remain separate.");
      });
    if (action === "duplicate") {
      await layers.duplicateAsync(id, undefined, (text) => ui.projectMessage(text));
      refresh();
      return;
    }
    if (action === "delete") {
      const layer = layers.project.layerStack.get(id);
      if (layers.isEmpty(id) || (await ui.confirmDelete(layer.name))) {
        layers.remove(id);
        ui.projectMessage(`Deleted ${layer.name}. Only its history was removed.`);
      }
    } else if (action === "select") layers.select(id);
    else if (action === "rename") {
      layers.rename(id, value!);
      ui.layerName(layers.project.layerStack.get(id));
      return;
    } else if (action === "visible")
      layers.setFlag(id, "visible", !layers.project.layerStack.get(id).visible);
    else if (action === "lock")
      layers.setFlag(id, "locked", !layers.project.layerStack.get(id).locked);
    else if (action === "operation") layers.setOperation(id, value as LayerOperation);
    else if (action === "up") layers.move(id, -1);
    else if (action === "down") layers.move(id, 1);
    else if (action === "colour") {
      display.setColour(layers.project.id, id, value!);
      layers.syncPresentation();
      return;
    } else if (action === "mode") {
      display.mode = value === "layer-colours" ? "layer-colours" : "clay";
      layers.syncPresentation();
      return;
    }
    cursor.visible = false;
    refresh();
  } catch (error) {
    ui.projectMessage(message(error), true);
    refresh();
  }
});
document.getElementById("composition-mode")!.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>("[data-surface-view]");
  if (xrBlocked() || !button) return;
  stop();
  layers.viewMode = button.dataset.surfaceView === "boolean" ? "boolean" : "separate";
  syncView();
  syncStats();
  cursor.visible = false;
  layers.composite.syncMetadata();
  const s = layers.composite.stats;
  ui.compositeInfo(
    booleanPreview
      ? s && !layers.composite.pending
        ? `${s.resolution}³ cached Boolean preview · ${s.triangles.toLocaleString()} triangles${s.capped ? " · Quality capped; fine detail may be lost." : ""}`
        : "Preparing Boolean preview…"
      : "",
  );
});
document.getElementById("composite-quality")!.addEventListener("change", (event) => {
  if (xrBlocked()) return;
  layers.composite.setQuality(Number((event.target as HTMLSelectElement).value));
});
let bakeAbort: AbortController | null = null;
let bakeBounds: THREE.Box3Helper | null = null;
function showBakeBounds(plan: BakePlan | null): void {
  if (bakeBounds) {
    bakeBounds.removeFromParent();
    bakeBounds.geometry.dispose();
    const materials = Array.isArray(bakeBounds.material)
      ? bakeBounds.material
      : [bakeBounds.material];
    materials.forEach((m) => {
      m.dispose();
    });
    bakeBounds = null;
  }
  if (plan) {
    bakeBounds = new THREE.Box3Helper(
      new THREE.Box3(new THREE.Vector3(...plan.min), new THREE.Vector3(...plan.max)),
      0xa04b36,
    );
    scene.add(bakeBounds);
  }
}
document.getElementById("cancel-bake")!.addEventListener("click", () => bakeAbort?.abort());
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && bakeAbort) {
    event.preventDefault();
    bakeAbort.abort();
  }
});
document.getElementById("bake-layers")!.addEventListener("click", async () => {
  if (loadingProject || ui.modalOpen || xrBlocked()) return;
  stop();
  cursor.visible = false;
  const configured = ui.requestBake(
    (resolution, ids) => layers.bakePlan(resolution, ids),
    showBakeBounds,
    layers.project.layerStack.layers,
    layers.project.activeLayerId,
  );
  transformTools?.sync();
  const options = await configured;
  if (!options) {
    transformTools?.sync();
    return;
  }
  loadingProject = true;
  bakeAbort = new AbortController();
  ui.projectBusy(true);
  ui.bakeBusy(true);
  syncTransformUI();
  transformTools?.sync();
  ui.projectMessage("Baking a new independent SDF layer…");
  await paint();
  try {
    const layer = await layers.bake(options, bakeAbort.signal, ui.bakeProgress),
      s = layers.lastBakeStats!;
    cursor.visible = false;
    pointerInside = false;
    ui.projectMessage(
      `Baked “${layer.name}” at ${s.resolution}³ · sample ${s.samplingMs.toFixed(0)} ms · mesh ${s.meshingMs.toFixed(0)} ms · total ${s.totalMs.toFixed(0)} ms. Original sources kept${options.hideSources ? " hidden" : "; Separate Layers selected"}. Undo restores the previous stack.`,
    );
    ui.status(`Baked ${layer.name} · ready to sculpt`);
  } catch (error) {
    ui.projectMessage(message(error), !bakeAbort.signal.aborted);
  } finally {
    bakeAbort = null;
    loadingProject = false;
    ui.bakeBusy(false);
    refresh();
    ui.projectBusy(false);
  }
});
document.getElementById("reset")!.addEventListener("click", () => {
  if (loadingProject || xrBlocked()) return;
  stop();
  try {
    layers.resetActive();
    ui.status(`Reset ${layers.active.layer.name} — undo available`);
    syncStats();
  } catch (error) {
    ui.projectMessage(message(error), true);
  }
});
document.getElementById("apply-resolution")!.addEventListener("click", () => {
  const requested = Number(document.querySelector<HTMLSelectElement>("#resolution")!.value);
  if (requested === layers.active.layer.volume.resolution) return;
  void heavy("Resampling only the active layer…", () => {
    const name = layers.active.layer.name,
      start = performance.now();
    layers.resampleActive(requested);
    ui.projectMessage(
      `${name}: ${requested}³ in ${(performance.now() - start).toFixed(0)} ms. Only this layer’s voxel history cleared; transforms retained. Other volumes unchanged.`,
    );
  });
});
function download(data: Blob, name: string) {
  const url = URL.createObjectURL(data),
    link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
document
  .getElementById("save-project")!
  .addEventListener("click", () => void projectBrowser.activate("library:save"));
const cutDialog = document.querySelector<HTMLDialogElement>("#cut-dialog")!;
let activeCut: AbortController | null = null;
const cutAxis = document.querySelector<HTMLSelectElement>("#cut-axis")!,
  cutScope = document.querySelector<HTMLSelectElement>("#cut-scope")!,
  cutOffset = document.querySelector<HTMLInputElement>("#cut-offset")!,
  cutTiltX = document.querySelector<HTMLInputElement>("#cut-tilt-x")!,
  cutTiltY = document.querySelector<HTMLInputElement>("#cut-tilt-y")!;
function previewCutPlane() {
  const axis = cutAxis.value,
    normal = new THREE.Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0)
      .applyEuler(
        new THREE.Euler(
          (Number(cutTiltX.value) * Math.PI) / 180,
          (Number(cutTiltY.value) * Math.PI) / 180,
          0,
          "XYZ",
        ),
      )
      .normalize();
  cutPlanePreview.position.copy(normal).multiplyScalar(Number(cutOffset.value));
  cutPlanePreview.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  cutPlanePreview.visible = cutDialog.open;
  document.querySelector<HTMLOutputElement>("#cut-offset-value")!.value = Number(
    cutOffset.value,
  ).toFixed(2);
}
document.getElementById("cut-plane")!.addEventListener("click", () => {
  if (loadingProject || xrBlocked() || ui.modalOpen || !layers.recoveryReady) return;
  stop();
  cutAxis.value = "x";
  cutOffset.value = "0";
  cutTiltX.value = "0";
  cutTiltY.value = "0";
  previewCutPlane();
  cutDialog.showModal();
  previewCutPlane();
});
for (const control of [cutAxis, cutScope, cutOffset, cutTiltX, cutTiltY])
  control.addEventListener("input", previewCutPlane);
cutDialog.addEventListener("close", () => {
  cutPlanePreview.visible = false;
  if (activeCut) {
    activeCut.abort();
    activeCut = null;
  }
});
document.getElementById("cut-apply")!.addEventListener("click", (event) => {
  event.preventDefault();
  if (activeCut || loadingProject || xrBlocked()) return;
  const normal = new THREE.Vector3(
      cutAxis.value === "x" ? 1 : 0,
      cutAxis.value === "y" ? 1 : 0,
      cutAxis.value === "z" ? 1 : 0,
    )
      .applyEuler(
        new THREE.Euler(
          (Number(cutTiltX.value) * Math.PI) / 180,
          (Number(cutTiltY.value) * Math.PI) / 180,
          0,
          "XYZ",
        ),
      )
      .normalize(),
    plane = {
      normal: normal.toArray() as [number, number, number],
      point: normal.clone().multiplyScalar(Number(cutOffset.value)).toArray() as [
        number,
        number,
        number,
      ],
    },
    abort = new AbortController(),
    status = document.getElementById("cut-preview-status")!,
    button = document.getElementById("cut-apply") as HTMLButtonElement;
  activeCut = abort;
  button.disabled = true;
  document.getElementById("cut-error")!.textContent = "";
  void layers
    .cutByPlane(
      plane,
      abort.signal,
      (stage) => {
        status.textContent = stage;
      },
      cutScope.value as "active" | "all-editable",
    )
    .then(() => {
      status.textContent = "Cut complete · new layers created. Undo restores all sources.";
      ui.projectMessage(
        "Cut complete. The resulting pieces are editable, and one Undo restores the source layers.",
      );
      syncStats();
    })
    .catch((error) => {
      if (!abort.signal.aborted) document.getElementById("cut-error")!.textContent = message(error);
      status.textContent = abort.signal.aborted
        ? "Cut cancelled · original layers kept"
        : "Cut preview failed · original layers kept";
    })
    .finally(() => {
      if (activeCut === abort) activeCut = null;
      button.disabled = false;
    });
});
document
  .getElementById("header-save")!
  .addEventListener("click", () => document.getElementById("save-project")!.click());
document.getElementById("new-project")!.addEventListener("click", () => {
  if (loadingProject || xrBlocked() || ui.modalOpen || !layers.recoveryReady) return;
  stop();
  showProjectBrowser();
  void projectBrowser.activate("library:new");
});
const projectFile = document.querySelector<HTMLInputElement>("#project-file")!;
document.getElementById("open-project")!.addEventListener("click", () => {
  if (loadingProject || xrBlocked()) return;
  stop();
  projectFile.value = "";
  projectFile.click();
});
async function openProjectFile(
  file: File,
  buffer?: ArrayBuffer,
  expectedProjectId?: string,
  libraryOpen = false,
  replacementConfirmed = false,
): Promise<boolean> {
  if (loadingProject || (!libraryOpen && xrBlocked()) || !layers.recoveryReady) return false;
  if (
    !replacementConfirmed &&
    !libraryOpen &&
    projectBrowser.dirty &&
    !window.confirm("Replace unsaved work? Cancel and Save first to keep your edits.")
  )
    return false;
  recovery?.cancelJob();
  xrExperience?.controllers.suspend();
  editorTools?.clearMoveSelection();
  stop();
  loadingProject = true;
  ui.projectBusy(true);
  syncTransformUI();
  transformTools?.sync();
  ui.projectMessage("Validating all layer data…");
  let candidate: IndependentLayers | undefined;
  const signal = libraryAbort.signal;
  try {
    await recovery?.settle();
    if (file.size > MAX_PROJECT_BYTES)
      throw new Error("Project file exceeds the supported size limit.");
    const prepared = await prepareLibrary(
      { kind: "decode", data: buffer ?? (await file.arrayBuffer()) },
      signal,
    );
    const project = hydrateProject(prepared.snapshot!);
    if (expectedProjectId && project.id !== expectedProjectId)
      throw new Error("Recovery project identity does not match its record.");
    candidate = new IndependentLayers(project, new LayerDisplayPreferences(), true);
    for (const layer of project.layerStack.layers) {
      const runtime = candidate.runtime(layer.id);
      while (runtime.rebuild(2, 2)) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (signal.aborted) throw new Error("Project open cancelled.");
      }
    }
    if (signal.aborted) throw new Error("Project open cancelled.");
    candidate.viewMode = layers.viewMode;
    references.clear();
    referenceEditor?.finish();
    xrExperience!.rig.sculptureRoot.remove(layers.group, layers.composite.group);
    layers.dispose();
    layers = candidate;
    candidate = undefined;
    clearPreparedExport();
    display = layers.display;
    layers.interruptBackground = () => recovery?.cancelJob();
    shapeGhost.reset();
    layers.composite.setQuality(
      Number(document.querySelector<HTMLSelectElement>("#composite-quality")!.value),
    );
    xrExperience!.rig.sculptureRoot.add(layers.group, layers.composite.group);
    syncView();
    ui.setSettings(project.settings);
    editorTools?.restorePreferences(project.toolPreferences);
    controls.dispose();
    camera.up.set(0, 1, 0);
    cameraView = 0;
    updateCameraViewLabel();
    camera.position.fromArray(project.settings.camera.position);
    controls = createCameraControls();
    controls.target.fromArray(project.settings.camera.target);
    controls.update();
    cursor.visible = false;
    pointerInside = false;
    lastRebuild = performance.now();
    ui.projectMessage(
      `Opened ${file.name}: ${project.layerStack.layers.length} independent layers. History starts fresh.`,
    );
    ui.status("Project opened");
    recovery?.replaceProject();
    manualSaveError = "";
    restoredSaveKey = expectedProjectId ? recoveryKey() : "";
    if (!libraryOpen) projectBrowser.adopted(null, project.name);
    return true;
  } catch (error) {
    ui.projectMessage(`Open failed: ${message(error)} Current project kept.`, true);
    if (libraryOpen) throw error;
    return false;
  } finally {
    candidate?.dispose();
    loadingProject = false;
    refresh();
    ui.projectBusy(false);
    projectFile.value = "";
  }
}
projectFile.addEventListener("change", () => {
  const file = projectFile.files?.[0];
  if (file)
    void projectBrowser.run(async () => {
      if (file.size > MAX_PROJECT_BYTES)
        throw new Error("Project file exceeds the supported size limit.");
      const prepared = await prepareLibrary(
        {
          kind: "import",
          data: await file.arrayBuffer(),
          name: file.name.replace(/\.form$/i, "").slice(0, 80) || "Imported project",
        },
        libraryAbort.signal,
      );
      await projectBrowser.store.put(prepared.record!, prepared.data, null);
      projectBrowser.selected = prepared.record!.id;
      await projectBrowser.refresh();
      projectBrowser.status =
        "Imported into this browser. Select Open when ready; current edits are kept.";
      showProjectBrowser();
    });
});
let exportAbort: AbortController | null = null;
const cancelExport = document.querySelector<HTMLButtonElement>("#cancel-export")!;
cancelExport.addEventListener("click", () => exportAbort?.abort());
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && exportAbort) {
    event.preventDefault();
    exportAbort.abort();
  }
});
function exportEstimate(): void {
  const count = layers.project.layerStack.layers.reduce(
    (n, l) => n + (l.visible ? layers.runtime(l.id).triangles : 0),
    0,
  );
  let note = "Final count reported after export.";
  try {
    const q = document.querySelector<HTMLSelectElement>("#export-quality")!.value as ExportQuality;
    exportAdmission(
      layers.exportSources("visible", false),
      q,
      Math.max(1, EXPORT_MEMORY_LIMIT - layers.trackedBytes),
    );
  } catch (error) {
    note = message(error);
  }
  document.getElementById("export-estimate")!.textContent =
    `Visible source: ${count.toLocaleString()} triangles before optimisation. ${note}`;
}
document.getElementById("export-quality")!.addEventListener("change", exportEstimate);

async function exportSculpt(scope: "visible" | "selected" | "composite") {
  const format = exportFormat.value;
  if (format !== "stl" && format !== "glb") {
    exportMessage("Choose STL or GLB.", true);
    return;
  }
  const stlMM = format === "stl" ? Number(printSize.value) : undefined;
  if (loadingProject || xrBlocked()) return;
  stop();
  clearPreparedExport();
  const filename = exportFilename(
    scope === "selected"
      ? layers.active.layer.name
      : scope === "composite"
        ? `${layers.project.name}-boolean`
        : layers.project.name,
    format,
  );
  if (layers.deforming || layers.previewing) {
    exportMessage("Finish or cancel Move before exporting.", true);
    return;
  }
  recovery?.cancelJob();
  loadingProject = true;
  exportAbort = new AbortController();
  const signal = exportAbort.signal;
  ui.projectBusy(true, true);
  syncTransformUI();
  transformTools?.sync();
  cancelExport.style.visibility = "visible";
  try {
    await recovery?.settle();
    if (signal.aborted) throw new Error("Export cancelled.");
    await paint();
    let sources: ExportSource[];
    if (scope === "composite") {
      exportMessage("Evaluating Boolean result at the existing quality cap…");
      // Abort the export wait; the shared preview scheduler may finish its own cache.
      let release = () => {};
      try {
        await Promise.race([
          layers.composite.flush(),
          new Promise<never>((_, reject) => {
            const abort = () => reject(new Error("Export cancelled."));
            signal.addEventListener("abort", abort, { once: true });
            release = () => signal.removeEventListener("abort", abort);
            if (signal.aborted) abort();
          }),
        ]);
      } finally {
        release();
      }
      if (stlMM !== undefined && layers.composite.stats?.capped)
        throw new Error(
          "Unified STL unavailable at the current Boolean quality cap: detail would be lost. Export individual parts or reduce the model bounds.",
        );
      sources = layers.composite.exportSources();
    } else sources = layers.exportSources(scope, stlMM === undefined);
    if (stlMM !== undefined)
      sources = sources.map((source) => ({
        ...source,
        chunks: source.chunks.map(({ positions, normals }) => ({ positions, normals })),
      }));
    const quality = document.querySelector<HTMLSelectElement>("#export-quality")!
      .value as ExportQuality;
    const result = await exportGlbAsync(sources, quality, {
      signal,
      stlMM,
      maxBytes: Math.max(1, EXPORT_MEMORY_LIMIT - layers.trackedBytes),
      progress: (p) => {
        exportMessage(
          `${p.stage} · ${Math.round((100 * p.completed) / Math.max(1, p.total))}% · Cancel available`,
        );
      },
    });
    if (signal.aborted) throw new Error("Export cancelled.");
    const encodedView = new DataView(result.data);
    if (
      format === "stl"
        ? result.data.byteLength < 84 ||
          !result.report ||
          84 + encodedView.getUint32(80, true) * 50 !== result.data.byteLength
        : result.data.byteLength < 12 || encodedView.getUint32(0, true) !== 0x46546c67
    )
      throw new Error("Export format mismatch. No file downloaded.");
    if (stlMM !== undefined) {
      const report = result.report!;
      printReport.textContent = [
        `Physical size: ${report.dimensions.map((n) => n.toFixed(3)).join(" × ")} mm`,
        `${report.triangles.toLocaleString()} triangles · ${report.components} connected surfaces`,
        `Open edges: ${report.boundaryEdges} · Non-manifold edges: ${report.nonManifoldEdges} · Winding conflicts: ${report.inconsistentEdges}`,
        `Degenerate triangles: ${report.degenerateTriangles} · Inward surfaces: ${report.invertedComponents}`,
        ...report.blocking.map((s) => "BLOCKED: " + s),
        ...report.warnings.map((s) => "WARNING: " + s),
        ...report.unsupported.map((s) => "NOT CHECKED / LIMIT: " + s),
      ].join("\n");
      if (report.blocking.length) throw new Error("STL blocked: " + report.blocking.join(" "));
      prepareExportDownload(result.data, filename, "model/stl", report.warnings.length > 0);
      printReportDownload.hidden = false;
      printReportDownload.onclick = () =>
        download(
          new Blob(
            [
              JSON.stringify(
                { ...report, scope, targetLongestMM: stlMM, quality, repairs: result.stats },
                null,
                2,
              ),
            ],
            { type: "application/json" },
          ),
          filename.replace(/\.stl$/i, "-print-report.json"),
        );
      if (report.warnings.length) {
        exportMessage(`Review print warnings, then download ${filename}.`);
      } else {
        printDownload.click();
      }
      return;
    }
    prepareExportDownload(result.data, filename, "model/gltf-binary", false);
    printDownload.click();
  } catch (error) {
    exportMessage(`${message(error)} Source sculpture kept.`, !signal.aborted);
  } finally {
    exportAbort = null;
    cancelExport.style.visibility = "hidden";
    loadingProject = false;
    syncView();
    ui.projectBusy(false);
    syncTransformUI();
  }
}
document.getElementById("export")!.addEventListener("click", () => void exportSculpt("visible"));
document
  .getElementById("export-selected")!
  .addEventListener("click", () => void exportSculpt("selected"));
document
  .getElementById("export-boolean")!
  .addEventListener("click", () => void exportSculpt("composite"));
const exportFormat = document.querySelector<HTMLSelectElement>("#export-format")!;
const printPanel = document.createElement("details");
printPanel.id = "print-panel";
printPanel.innerHTML =
  "<summary>Print report</summary><p>Review this report before downloading STL. Unsupported checks still require inspection in your slicer.</p>";
const printSize = document.createElement("input");
printSize.id = "print-size";
printSize.type = "number";
printSize.min = "0.1";
printSize.max = "10000";
printSize.value = "100";
printSize.step = "0.1";
const printLabel = document.createElement("label");
printLabel.textContent = "Target longest dimension (mm)";
printLabel.append(printSize);
printLabel.append(document.createTextNode(" · aspect ratio locked"));
document.getElementById("export-selected")!.before(printLabel);
const exportResult = document.createElement("div");
exportResult.id = "export-result";
const exportStatus = document.createElement("p");
exportStatus.setAttribute("role", "status");
const printDownload = document.createElement("a");
printDownload.id = "export-download";
printDownload.style.visibility = "hidden";
exportResult.append(exportStatus, printDownload, cancelExport);
document.getElementById("export-boolean")!.after(exportResult);
cancelExport.hidden = false;
cancelExport.style.visibility = "hidden";
let preparedExportURL: string | null = null;
function exportMessage(text: string, error = false) {
  exportStatus.textContent = text;
  exportStatus.classList.toggle("error", error);
}
function clearPreparedExport() {
  if (preparedExportURL) URL.revokeObjectURL(preparedExportURL);
  preparedExportURL = null;
  printDownload.removeAttribute("href");
  printDownload.removeAttribute("download");
  printDownload.onclick = null;
  printDownload.style.visibility = "hidden";
  printReportDownload.hidden = true;
  printReportDownload.onclick = null;
  printReport.textContent = "";
}
function prepareExportDownload(
  data: ArrayBuffer,
  filename: string,
  mime: string,
  warnings: boolean,
) {
  preparedExportURL = URL.createObjectURL(new Blob([data], { type: mime }));
  printDownload.href = preparedExportURL;
  printDownload.download = filename;
  printDownload.textContent = `Download ${filename}${warnings ? " · accept report warnings" : ""}`;
  printDownload.style.visibility = "visible";
  printDownload.onclick = () => {
    exportMessage(
      `Download requested: ${filename}. If it did not appear, use the download link here.`,
    );
  };
}
window.addEventListener("pagehide", clearPreparedExport);
const printReportDownload = document.createElement("button");
printReportDownload.textContent = "Download optional print report (.json)";
printReportDownload.hidden = true;
printPanel.append(printReportDownload);
const printReport = document.createElement("pre");
printReport.style.whiteSpace = "pre-wrap";
printReport.setAttribute("role", "status");
printPanel.append(printReport);
document.getElementById("export-boolean")!.parentElement!.append(printPanel);
mountWhatsNew(printPanel, whatsNew);
function syncExportFormat() {
  printLabel.hidden = exportFormat.value !== "stl";
  printPanel.hidden = exportFormat.value !== "stl";
  clearPreparedExport();
}
exportFormat.addEventListener("change", () => {
  syncExportFormat();
  exportMessage(
    `${exportFormat.value.toUpperCase()} selected. Choose current layer, all layers, or unified boolean.`,
  );
});
syncExportFormat();

editorTools = new EditorToolState({
  layers: () => layers,
  shape: shapeGhost.model,
  settings: () => ui.settings,
  setSettings: (value) => ui.setSettings(value),
  mode: () => input.mode,
  selectTool: (tool) => {
    if (
      tool === "flatten" ||
      tool === "inflate" ||
      tool === "scrape" ||
      tool === "pinch" ||
      tool === "crease"
    ) {
      chooseWorkspace("brush", true);
      return;
    }
    if (tool === "transform") chooseLayerMode("translate", true);
    else
      chooseWorkspace(
        tool === "stamp"
          ? "boolean"
          : tool === "smooth"
            ? "smooth"
            : tool === "paint"
              ? "paint"
              : "brush",
        true,
      );
  },
  selectTransform: (mode) => chooseLayerMode(mode, true),
  busy: () => loadingProject || ui.modalOpen,
  changed: () => {
    shapeLibraryUI.refresh();
    cursor.visible = false;
    refresh();
    xrExperience?.refreshSculptureInfo();
  },
});
desktopLayers = new DesktopLayerPalette(
  () => layers,
  document.getElementById("layer-list")!,
  () => {
    stop();
    chooseLayerMode("translate");
    refresh();
  },
  () => refresh(),
  (text) => ui.projectMessage(text, true),
  () => loadingProject || ui.modalOpen || xrBlocked(),
  () => stop(),
);
desktopLayers.render();
const precisionPanel = document.createElement("details");
precisionPanel.className = "precision-settings";
const precisionTitle = document.createElement("summary");
precisionTitle.textContent = "PRECISION · SHARED TOOL SETTINGS";
const precisionOptions = document.createElement("div");
precisionOptions.className = "precision-options";
precisionPanel.append(precisionTitle, precisionOptions);
document.querySelector("#radius")!.closest("section")!.append(precisionPanel);
let precisionKey = "";
const tubeToolButtons = document.createElement("div");
for (const [tool, label] of [["tube", "Tube · draw & edit"]] as const) {
  const button = document.createElement("button");
  button.textContent = label;
  button.onclick = () => {
    try {
      editorTools!.select(tool);
      precisionPanel.open = true;
    } catch (error) {
      ui.status(message(error));
    }
  };
  tubeToolButtons.append(button);
}
precisionPanel.before(tubeToolButtons);
function syncPrecisionOptions() {
  const options = editorTools!.options(),
    key = JSON.stringify(options);
  if (key === precisionKey) return;
  precisionKey = key;
  precisionOptions.replaceChildren();
  for (const o of options) {
    if (
      editorTools!.active === "tube" &&
      !layers.active.layer.procedural &&
      [
        "tube-radius",
        "tube-edit-note",
        "tube-insert",
        "tube-delete",
        "tube-close",
        "tube-bake",
      ].includes(o.id)
    )
      continue;
    const row = document.createElement("div"),
      label = document.createElement("span"),
      value = document.createElement("span"),
      controls = document.createElement("div");
    row.className = "precision-option";
    label.className = "precision-option-label";
    value.className = "precision-option-value";
    controls.className = "precision-option-controls";
    label.textContent = o.label;
    value.textContent = o.value;
    row.append(label, value, controls);
    if (o.id === "paint-colour") {
      const picker = document.createElement("input");
      picker.type = "color";
      picker.value = layers.paintColour;
      picker.setAttribute("aria-label", "Custom paint colour");
      picker.disabled = o.disabled || editorTools!.busy;
      picker.oninput = () => {
        try {
          editorTools!.setPaintColour(picker.value);
        } catch (error) {
          ui.status(message(error));
        }
      };
      controls.append(picker);
    }
    if (o.stepActions || o.increase || o.decrease)
      for (const direction of [-1, 1] as const) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = direction === 1 ? "＋" : "−";
        button.setAttribute(
          "aria-label",
          `${direction === 1 ? "Increase" : "Decrease"} ${o.label}`,
        );
        button.disabled = o.disabled || !(direction === 1 ? o.increase : o.decrease);
        button.onclick = () => {
          try {
            if (o.stepActions) {
              void editorTools!
                .splineAction(direction === 1 ? o.stepActions.increase : o.stepActions.decrease)
                .catch((error) => ui.status(message(error)));
            } else editorTools!.adjust(o.id, direction);
            syncPrecisionOptions();
          } catch (error) {
            ui.status(message(error));
          }
        };
        controls.append(button);
      }
    if (
      o.action &&
      (o.action.startsWith("tube-") || o.action.startsWith("mask-") || o.action === "paint-clear")
    ) {
      const button = document.createElement("button");
      button.textContent = o.label;
      button.disabled = o.disabled;
      button.onclick = () => {
        try {
          if (o.action === "paint-clear") editorTools!.paintAction();
          else if (o.action!.startsWith("mask-")) editorTools!.maskAction(o.action!);
          else
            void editorTools!.splineAction(o.action!).catch((error) => ui.status(message(error)));
        } catch (error) {
          ui.status(message(error));
        }
      };
      row.classList.add("precision-option-action");
      label.hidden = true;
      value.hidden = o.action !== "tube-bake";
      controls.append(button);
    }
    if (!controls.childElementCount) row.classList.add("precision-option-note");
    precisionOptions.append(row);
  }
}
ui.onBrushSelection((mode) => {
  try {
    editorTools!.select(
      mode === "add" || mode === "subtract"
        ? "clay"
        : mode === "paint-erase"
          ? "paint"
          : mode === "mask-erase"
            ? "mask"
            : mode,
    );
    ui.setSettings({ ...ui.settings, mode });
    if (mode === "paint" || mode === "paint-erase") precisionPanel.open = true;
  } catch (error) {
    ui.status(message(error));
  }
});
const desktopPreviewRoot = new THREE.Group();
scene.add(desktopPreviewRoot);
const desktopFieldCursor = new XRBrushPreview(desktopPreviewRoot);
const desktopMirrorCursor = new XRBrushPreview(desktopPreviewRoot);
const desktopMirrorPlane = new XRMirrorPlane(editorTools!, desktopPreviewRoot);
const desktopPathGeometry = new THREE.BufferGeometry(),
  desktopPathMaterial = new THREE.LineBasicMaterial({ color: "#267c78", depthTest: false });
const desktopPath = new THREE.Line(desktopPathGeometry, desktopPathMaterial),
  desktopMirrorPath = new THREE.Line(desktopPathGeometry, desktopPathMaterial),
  desktopPaths = new THREE.Group();
desktopPaths.matrixAutoUpdate = false;
desktopPaths.add(desktopPath, desktopMirrorPath);
scene.add(desktopPaths);
const desktopTube = new DesktopTubeTool(
  () => layers,
  editorTools!,
  desktopPreviewRoot,
  camera,
  renderer.domElement,
  () => controls.target,
  () =>
    !loadingProject &&
    !ui.modalOpen &&
    !xrBlocked() &&
    !input.referenceEditing &&
    input.mode === "sculpt",
  () => refresh(),
);
const xrRig = new XRSceneRig(scene, camera);
xrRig.sculptureRoot.add(layers.group, layers.composite.group);
const lighting = new LightRig(
  () => display.lighting,
  xrRig.workspaceRoot,
  light,
  fill,
  ambient,
  () => {
    xrRig.sculptureRoot.updateMatrix();
    xrRig.turntable.group.updateMatrix();
    return xrRig
      .visibleBounds()
      .getCenter(new THREE.Vector3())
      .applyMatrix4(xrRig.sculptureRoot.matrix)
      .applyMatrix4(xrRig.turntable.group.matrix);
  },
);
const lightUI = lightingUI(
  () => display,
  lighting,
  precisionPanel.parentElement!,
  () => loadingProject || ui.modalOpen || xrBlocked(),
);
const references = new ReferenceView(
  () => display.references,
  xrRig.workspaceRoot,
  xrRig.turntable.group,
);
window.addEventListener("pagehide", () => references.clear());
referenceEditor = new ReferenceTransformTool(
  camera,
  renderer.domElement,
  scene,
  references,
  input,
  {
    beforeDrag: () => {
      stampClick.cancel();
      ghostRotation?.finish();
      transformTools?.finish();
      stopSculpt();
    },
    camera: (enabled) => (controls.enabled = enabled),
    changed: () => {
      cursor.visible = false;
      transformTools?.sync();
      ghostRotation?.sync();
    },
    busy: () => loadingProject || ui.modalOpen || xrBlocked(),
    error: (text) => ui.projectMessage(text, true),
  },
);
const referencesUI = referenceUI(
  () => display,
  references,
  precisionPanel.parentElement!,
  () => loadingProject || ui.modalOpen || xrBlocked(),
  referenceEditor,
);
const libraryDialog = document.createElement("dialog");
libraryDialog.className = "project-library-dialog";
libraryDialog.setAttribute("aria-label", "Project library");
document.body.append(libraryDialog);
let libraryRenderKey = "";
function renderProjectBrowser() {
  if (!libraryDialog.open) return;
  const content = projectBrowser.content(),
    key = JSON.stringify(content);
  if (key === libraryRenderKey) return;
  libraryRenderKey = key;
  const focus = (document.activeElement as HTMLElement)?.dataset.libraryAction;
  const title = document.createElement("h2");
  title.textContent = content.title;
  const subtitle = document.createElement("p");
  subtitle.textContent = content.subtitle;
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  status.textContent = content.footer;
  const close = document.createElement("button");
  close.textContent = "Close library";
  close.dataset.libraryAction = "close";
  close.onclick = () => libraryDialog.close();
  libraryDialog.replaceChildren(title, subtitle, close);
  const selectedRecord = projectBrowser.records.find(
    (record) => record.id === projectBrowser.selected,
  );
  if (selectedRecord?.thumbnail && !projectBrowser.form && !projectBrowser.confirmation) {
    const preview = document.createElement("img");
    preview.className = "project-library-preview";
    preview.src = selectedRecord.thumbnail;
    preview.alt = `Preview of ${selectedRecord.name}`;
    libraryDialog.append(preview);
  }
  if (projectBrowser.form) {
    const input = document.createElement("input");
    input.value = projectBrowser.draft;
    input.maxLength = 80;
    input.disabled = projectBrowser.busy;
    input.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void projectBrowser.activate("library:submit");
      }
    };
    input.setAttribute("aria-label", "Project name");
    input.oninput = () => {
      projectBrowser.draft = input.value;
    };
    libraryDialog.append(input);
  }
  for (const label of content.labels) {
    const p = document.createElement("p");
    p.textContent = label.text;
    libraryDialog.append(p);
  }
  const actions = document.createElement("div");
  actions.className = "project-library-actions";
  for (const b of content.buttons) {
    if (
      b.id.startsWith("library:key:") ||
      ["library:backspace", "library:clear-name"].includes(b.id)
    )
      continue;
    const button = document.createElement("button");
    button.textContent = b.detail ? `${b.label} · ${b.detail}` : b.label;
    button.disabled = !!b.disabled;
    button.dataset.libraryAction = b.id;
    if (b.id.startsWith("library:select:")) {
      const record = projectBrowser.records.find(
        (item) => item.id === b.id.slice("library:select:".length),
      );
      if (record?.thumbnail) {
        const image = document.createElement("img");
        image.className = "project-library-row-preview";
        image.src = record.thumbnail;
        image.alt = `Preview of ${record.name}`;
        button.prepend(image);
      }
    }
    button.onclick = () => void projectBrowser.activate(b.id);
    actions.append(button);
  }
  libraryDialog.append(actions, status);
  if (focus)
    Array.from(libraryDialog.querySelectorAll<HTMLButtonElement>("button"))
      .find((b) => b.dataset.libraryAction === focus)
      ?.focus();
}
function showProjectBrowser() {
  stop();
  if (!libraryDialog.open) libraryDialog.showModal();
  libraryRenderKey = "";
  renderProjectBrowser();
}
const projectBrowser = new ProjectBrowser(
  new ProjectLibrary(
    undefined,
    import.meta.env.DEV && new URLSearchParams(location.search).get("recoveryFixture") === "lab"
      ? "centra-sculpt-library-test"
      : "centra-sculpt-library",
  ),
  {
    key: () => recoveryKey(),
    ready: () => !loadingProject && layers.recoveryReady,
    changed: () => {
      renderProjectBrowser();
      if (!projectBrowser.busy) {
        layers.project.name = projectBrowser.name;
        ui.projectMessage(projectBrowser.status);
      }
    },
    encode: async () => {
      const source = layers,
        key = recoveryKey();
      loadingProject = true;
      manualSaving = true;
      recovery?.cancelJob();
      stop();
      try {
        await recovery?.settle();
        const result = await encodeRecovery(
          source,
          {
            ...ui.settings,
            camera: {
              position: xrBlocked()
                ? source.project.settings.camera.position
                : camera.position.toArray(),
              target: xrBlocked()
                ? source.project.settings.camera.target
                : controls.target.toArray(),
            },
          },
          display.snapshot(source.project.id, source.project.layerStack.layers),
          editorTools?.snapshotPreferences(),
          libraryAbort.signal,
          () => layers === source && recoveryKey() === key,
        );
        return result.data;
      } finally {
        loadingProject = false;
        manualSaving = false;
      }
    },
    thumbnail: () => captureProjectThumbnail(renderer, layers.group),
    open: (data, name) => openProjectFile(new File([], `${name}.form`), data, undefined, true),
    create: async (resolution, contents) =>
      (
        await prepareLibrary(
          {
            kind: "new",
            resolution,
            contents,
            settings: { ...ui.settings, camera: { position: [2.4, 1.7, 3.3], target: [0, 0, 0] } },
          },
          libraryAbort.signal,
        )
      ).data,
    handoff: async (action, data, name) => {
      const wasXR = xrBlocked();
      if (wasXR) await xrExperience!.session.exit();
      if (action === "import") {
        libraryDialog.close();
        document.getElementById("open-project")!.focus();
        if (!wasXR) {
          projectFile.value = "";
          projectFile.click();
        }
        ui.projectMessage("Click Import Project to choose a portable .form file.");
      } else if (data) {
        download(new Blob([data], { type: "application/octet-stream" }), `${name}.form`);
        projectBrowser.status =
          "Download requested. Check browser downloads; local save remains intact.";
      }
    },
  },
);
const libraryButton = document.createElement("button");
libraryButton.textContent = "Project Library";
libraryButton.onclick = () => {
  showProjectBrowser();
  void projectBrowser.run(() => projectBrowser.refresh());
};
document.getElementById("new-project")!.before(libraryButton);
document.getElementById("open-project")!.textContent = "Import Project";
document.getElementById("save-project")!.textContent = "Save in Browser";
window.addEventListener("beforeunload", (event) => {
  if (projectBrowser.dirty || projectBrowser.busy) {
    event.preventDefault();
    event.returnValue = "";
  }
});
// Initialize only after recoveryKey and the recovery controller have been defined below.
queueMicrotask(() => void projectBrowser.run(() => projectBrowser.refresh()));
let desktopLocked = false,
  savedTarget = controls.target.clone();
const disabledBeforeXR = new Map<
  HTMLInputElement | HTMLButtonElement | HTMLSelectElement,
  boolean
>();
xrExperience = new XRExperience(
  renderer,
  xrRig,
  {
    projectBrowser,
    projectStatus: () =>
      `${layers.project.layerStack.layers.length} layers · ${manualSaving ? "Saving…" : document.getElementById("header-save")!.dataset.state === "saved" ? "Manual save current" : "Save changes before replacing"}`,
    projectAction: async (action) => {
      try {
        await leaveForProject(
          xrExperience!.session,
          () => !loadingProject && !ui.modalOpen && layers.recoveryReady,
          () => {
            const target = document.getElementById(
              (
                {
                  new: "new-project",
                  open: "open-project",
                  save: "save-project",
                  export: "export-format",
                  print: "export-format",
                  recover: "restore-recovery",
                } as const
              )[action],
            )!;
            if (action === "print" || action === "export") {
              exportFormat.value = action === "print" ? "stl" : "glb";
              syncExportFormat();
            }
            if (action === "recover") {
              updateRecoveryUI();
              (recoveryAvailable as HTMLDetailsElement).open = true;
            }
            target.scrollIntoView({ block: "center" });
            target.focus();
            ui.projectMessage(
              `Continue ${action === "recover" ? "recovery" : action} in the browser panel. Use Enter Studio / Passthrough when ready.`,
            );
            if (action === "new") target.click();
          },
        );
      } catch (error) {
        ui.projectMessage(message(error), true);
        throw error;
      }
    },
    lighting,
    references,
    importReferences: () => {
      void leaveForProject(
        xrExperience!.session,
        () => !loadingProject && !ui.modalOpen && layers.recoveryReady,
        () => {
          ui.projectMessage("Use Import references in the browser panel, then re-enter VR.");
          const panel = document.getElementById("reference-panel") as HTMLDetailsElement | null;
          if (panel) {
            panel.open = true;
            panel.scrollIntoView({ block: "center" });
          }
        },
      ).catch((error) => ui.projectMessage(message(error), true));
    },
    tools: editorTools,
    layers: () => layers,
    stability: () => stabilityText,
    historyChanged: () => {
      cursor.visible = false;
      refresh();
    },
    sculptureInfo: () => ({
      activeResolution: volumeLabel(layers.active.layer.volume),
      resolutions: layers.project.layerStack.layers
        .map((layer) => `${volumeLabel(layer.volume)}`)
        .join(" / "),
      layerMeshes: countVisibleMeshes(layers.group),
      compositeMeshes: countVisibleMeshes(layers.composite.group),
    }),
    blockedReason: () =>
      !recovery?.initialized
        ? "Checking local recovery storage…"
        : recovery.blocked && recovery.enabled
          ? "Review saved recovery before entering."
          : ui.modalOpen
            ? "Close the open dialog before entering."
            : loadingProject
              ? "Wait for the current project operation to finish."
              : "Wait for Boolean Preview to finish, or select Separate Layers.",
    entryResolvable: () =>
      !!recovery?.initialized &&
      recovery.enabled &&
      recovery.blocked &&
      !loadingProject &&
      !ui.modalOpen &&
      layers.recoveryReady,
    resolveEntry: () => showEntryRecovery(),
    canEnter: () =>
      !!recovery?.initialized &&
      (!recovery.blocked || !recovery.enabled) &&
      !loadingProject &&
      !ui.modalOpen &&
      (!booleanPreview || !layers.composite.pending),
    hidden: [shapeGhost.group, cursor, grid],
    lockDesktop: (blocked) => {
      if (blocked === desktopLocked) return;
      desktopLocked = blocked;
      if (blocked) {
        recovery?.cancelJob();
        layers.project.settings = {
          ...ui.settings,
          camera: { position: camera.position.toArray(), target: controls.target.toArray() },
        };
        stop();
        savedTarget = controls.target.clone();
        input.suspended = true;
        controls.enabled = false;
        pointerInside = false;
        viewportTools?.close();
        for (const element of document.querySelectorAll<
          HTMLInputElement | HTMLButtonElement | HTMLSelectElement
        >("#app button,#app input,#app select")) {
          if (
            element.id === "xr-environment" ||
            element.id === "enter-vr" ||
            element.id === "xr-tool-hand" ||
            element.id === "xr-show-diagnostics" ||
            element.id === "xr-controller-display" ||
            element.id === "xr-hints" ||
            element.id === "xr-ui-scale" ||
            element.id === "xr-show-performance" ||
            element.id === "xr-reset-workspace"
          )
            continue;
          disabledBeforeXR.set(element, element.disabled);
          element.disabled = true;
        }
        transformTools?.sync();
        ghostRotation?.sync();
      } else {
        input.suspended = false;
        controls.enabled = input.cameraEnabled;
        for (const [element, disabled] of disabledBeforeXR) element.disabled = disabled;
        disabledBeforeXR.clear();
        pointerInside = false;
        refresh();
        resizeDesktop();
      }
      document.body.classList.toggle("xr-blocked", blocked);
    },
    restored: () => {
      queueMicrotask(() => void recovery?.tick(Date.now(), true));
      controls.dispose();
      controls = createCameraControls();
      controls.target.copy(savedTarget);
      controls.enabled = false;
      pointerInside = false;
      previous = performance.now();
    },
  },
  !!renderEmulatorFrame,
);
void xrExperience.check();
const recoveryPanel = document.getElementById("recovery-slot")!;
recoveryPanel.innerHTML =
  '<section class="recovery-panel"><label><input id="autosave-enabled" type="checkbox" checked> LOCAL AUTOSAVE</label><p id="recovery-status" role="status">Checking local recovery…</p><details id="recovery-available" hidden><summary>RECOVERY CHECKPOINTS <span id="recovery-info" tabindex="0" role="img" aria-label="Recovery status">ⓘ</span></summary><label for="recovery-selection">RECOVERY CHECKPOINT</label><select id="recovery-selection" title="Restore replaces the current open project. Save current work first. Manual files are never overwritten. Undo history starts fresh." aria-description="Restore replaces the current open project. Save current work first. Manual files are never overwritten. Undo history starts fresh."></select><button id="restore-recovery">Restore recovery…</button><button id="discard-recovery">Discard all recovery…</button><div id="recovery-confirm" hidden><p id="recovery-confirm-text"></p><div class="recovery-confirm-actions"><button id="confirm-recovery">Confirm</button><button id="cancel-recovery-action">Cancel</button></div></div></details><details id="session-resources"><summary>Session resource estimates</summary><output id="stability-status"></output></details></section>';
document
  .querySelector("main > aside")!
  .append(
    document.getElementById("session-resources")!,
    document.getElementById("xr-diagnostics-slot")!,
  );
const recoveryStatus = document.getElementById("recovery-status")!,
  recoveryAvailable = document.getElementById("recovery-available")!,
  recoverySelect = document.querySelector<HTMLSelectElement>("#recovery-selection")!,
  autosaveEnabled = document.querySelector<HTMLInputElement>("#autosave-enabled")!,
  recoveryConfirm = document.getElementById("recovery-confirm")!;
let recoveryAction: "restore" | "discard" | null = null,
  recoveryListKey = "",
  recoveryChoice = "",
  recoveryWasBlocked = false,
  restoringRecovery = false;
const recoveryReady = () =>
  !input.transforming &&
  !recoveryAction &&
  !restoringRecovery &&
  layers.recoveryReady &&
  !loadingProject &&
  !ui.modalOpen &&
  document.visibilityState === "visible" &&
  !layers.composite.busy &&
  !xrExperience?.controllers.grab?.active &&
  !xrExperience?.controllers.layerGrab?.active &&
  !xrExperience?.alternate?.active &&
  !xrExperience?.menus?.active &&
  !xrExperience?.interaction?.active;
const recoveryKey = () =>
  JSON.stringify(
    [
      layers.recoveryKey(),
      ui.settings,
      display.snapshot(layers.project.id, layers.project.layerStack.layers),
      editorTools?.snapshotPreferences(),
    ],
    (key, value) => (key === "bytes" && value instanceof Uint8Array ? value.byteLength : value),
  );
function updateSaveIndicator(): void {
  const button = document.querySelector<HTMLButtonElement>("#header-save")!;
  const key = recoveryKey(),
    record = recovery?.records.find((r) => r.projectId === layers.project.id && r.revision === key);
  const state = saveState({
    key,
    manualKey: projectBrowser.savedKey,
    autosaveKey: record?.revision ?? restoredSaveKey,
    saving: manualSaving || !!recovery?.active,
    editing: !layers.recoveryReady,
    error: projectBrowser.error || !!manualSaveError || !!recovery?.warning,
    recoveryPending: !!recovery?.blocked,
  });
  button.disabled = loadingProject || xrBlocked() || ui.modalOpen || !layers.recoveryReady;
  const label = SAVE_LABELS[state],
    title = `${label}${projectBrowser.error ? " · " + projectBrowser.status : manualSaveError ? " · " + manualSaveError : recovery?.warning ? " · " + recovery.warning : ""} · Click to save project`;
  if (button.dataset.state !== state) {
    button.dataset.state = state;
    document.getElementById("header-save-status")!.textContent = label;
  }
  if (button.title !== title) {
    button.title = title;
    button.setAttribute("aria-label", `Save project — ${label}`);
  }
}
function updateRecoveryUI(): void {
  if (!recovery) return;
  updateSaveIndicator();
  recoveryStatus.textContent = recovery.status();
  recoveryStatus.hidden =
    !recovery.warning &&
    (recovery.blocked ||
      [
        "Autosave off · manual saves are separate.",
        "Autosave on · waiting for completed edits and an idle pause.",
      ].includes(recovery.status()));
  const info = document.getElementById("recovery-info")!;
  info.title = recovery.status();
  info.setAttribute("aria-label", recovery.status());
  autosaveEnabled.checked = recovery.enabled;
  autosaveEnabled.disabled = !recovery.initialized || xrBlocked();
  const key = JSON.stringify(recovery.records.map((r) => [r.id, r.createdAt]));
  if (key !== recoveryListKey) {
    const selected = recoverySelect.value;
    recoveryListKey = key;
    recoverySelect.replaceChildren(
      ...recovery.records.map(
        (r) =>
          new Option(
            `${r.projectName} · ${new Date(r.createdAt).toLocaleString()} · ${(r.bytes / 1048576).toFixed(1)} MiB`,
            r.id,
          ),
      ),
    );
    if (recovery.records.some((r) => r.id === selected)) recoverySelect.value = selected;
  }
  recoveryAvailable.hidden = !recovery.records.length;
  if (recoveryWasBlocked !== recovery.blocked) {
    (recoveryAvailable as HTMLDetailsElement).open = recovery.blocked;
    recoveryWasBlocked = recovery.blocked;
  }
  for (const id of ["restore-recovery", "discard-recovery", "confirm-recovery"])
    document.querySelector<HTMLButtonElement>(`#${id}`)!.disabled =
      loadingProject || xrBlocked() || !layers.recoveryReady;
}
recovery = new RecoveryController(
  new IndexedRecoveryStore(
    undefined,
    import.meta.env.DEV && new URLSearchParams(location.search).get("recoveryFixture") === "lab"
      ? "centra-sculpt-recovery-test"
      : "centra-sculpt-recovery",
  ),
  {
    key: recoveryKey,
    ready: recoveryReady,
    project: () => layers.project,
    changed: updateRecoveryUI,
    reserve: (bytes) => {
      layers.backgroundBytes = bytes;
    },
    encode: (signal) => {
      const source = layers,
        key = recoveryKey();
      return encodeRecovery(
        source,
        {
          ...ui.settings,
          camera: {
            position: xrBlocked()
              ? layers.project.settings.camera.position
              : camera.position.toArray(),
            target: xrBlocked() ? layers.project.settings.camera.target : controls.target.toArray(),
          },
        },
        display.snapshot(source.project.id, source.project.layerStack.layers),
        editorTools?.snapshotPreferences(),
        signal,
        () => layers === source && recoveryKey() === key && recoveryReady(),
      );
    },
  },
);
layers.interruptBackground = () => recovery?.cancelJob();
void recovery.init();
autosaveEnabled.addEventListener(
  "change",
  () => void recovery!.setEnabled(autosaveEnabled.checked),
);
for (const action of ["restore", "discard"] as const)
  document.getElementById(`${action}-recovery`)!.addEventListener("click", () => {
    recovery?.cancelJob();
    recoveryAction = action;
    recoveryChoice = recoverySelect.value;
    recoveryConfirm.hidden = false;
    document.getElementById("recovery-confirm-text")!.textContent =
      action === "restore"
        ? "Replace the currently open project with this checkpoint?"
        : "Permanently discard all local recovery checkpoints? Manual files are kept.";
  });
document.getElementById("cancel-recovery-action")!.addEventListener("click", () => {
  recoveryAction = null;
  recoveryConfirm.hidden = true;
});
async function restoreCheckpoint(choice: string): Promise<boolean> {
  const source = layers,
    key = layers.recoveryKey();
  restoringRecovery = true;
  try {
    const { record, data } = await recovery!.store.read(choice);
    if (
      layers !== source ||
      layers.recoveryKey() !== key ||
      loadingProject ||
      xrBlocked() ||
      !layers.recoveryReady
    )
      throw new Error("Recovery restore cancelled: current project changed. Current work kept.");
    if (checksum(data) !== record.checksum)
      throw new Error("Recovery checksum failed; checkpoint kept for inspection/discard.");
    const opened = await openProjectFile(
      new File([], `Recovery ${record.projectName}.form`),
      data,
      record.projectId,
      false,
      true,
    );
    if (!opened)
      throw new Error(
        "Could not restore checkpoint. Current project kept; review the project message.",
      );
    recovery!.restored(record);
    ui.projectMessage(
      "Recovery restored. Geometry, layers and tool preferences kept; Undo starts fresh. Save a manual project when ready.",
    );
    return true;
  } finally {
    restoringRecovery = false;
    updateRecoveryUI();
  }
}
document.getElementById("confirm-recovery")!.addEventListener(
  "click",
  () =>
    void (async () => {
      if (loadingProject || xrBlocked() || !layers.recoveryReady) return;
      const action = recoveryAction;
      recoveryAction = null;
      recoveryConfirm.hidden = true;
      try {
        if (action === "discard") await recovery!.discard();
        else if (action === "restore") await restoreCheckpoint(recoveryChoice);
      } catch (error) {
        recovery!.warning = message(error);
        updateRecoveryUI();
      }
    })(),
);
// Recovery choices run before XR entry; a later Enter click supplies a fresh browser gesture.
const entryRecoveryDialog = document.createElement("dialog");
entryRecoveryDialog.id = "entry-recovery-dialog";
entryRecoveryDialog.setAttribute("aria-labelledby", "entry-recovery-title");
entryRecoveryDialog.innerHTML =
  '<form><h2 id="entry-recovery-title">Pick up where you left off?</h2><p class="recovery-intro">A saved sculpture is ready to restore.</p><label for="entry-recovery-choice">Saved sculpture</label><select id="entry-recovery-choice"></select><details class="recovery-entry-details"><summary>What happens to my work?</summary><p>Restore replaces the open project and starts fresh Undo history. Save any current work first.</p><p>Discard permanently deletes all local recovery saves. Your open project and manual files stay safe.</p></details><div class="dialog-actions"><button class="recovery-primary" value="restore" autofocus>Restore</button><button class="recovery-secondary" value="discard">Discard and continue</button><button class="recovery-cancel" value="cancel">Cancel</button></div><p id="entry-recovery-status" role="status"></p><button type="button" id="entry-recovery-enter" hidden>Enter VR</button></form>';
document.body.append(entryRecoveryDialog);
function showEntryRecovery(): void {
  if (
    !recovery?.blocked ||
    !recovery.enabled ||
    loadingProject ||
    ui.modalOpen ||
    !layers.recoveryReady
  )
    return;
  recovery.cancelJob();
  const select = entryRecoveryDialog.querySelector<HTMLSelectElement>("select")!;
  select.replaceChildren(
    ...recovery.records.map(
      (r) => new Option(`${r.projectName} · ${new Date(r.createdAt).toLocaleString()}`, r.id),
    ),
  );
  select.value = recoverySelect.value;
  entryRecoveryDialog.querySelector<HTMLElement>(".dialog-actions")!.hidden = false;
  entryRecoveryDialog
    .querySelectorAll<HTMLButtonElement | HTMLSelectElement>("button,select")
    .forEach((control) => {
      control.disabled = false;
    });
  entryRecoveryDialog.querySelector<HTMLElement>("#entry-recovery-enter")!.hidden = true;
  entryRecoveryDialog.querySelector<HTMLElement>("#entry-recovery-status")!.textContent = "";
  entryRecoveryDialog.returnValue = "cancel";
  entryRecoveryDialog.showModal();
}
let entryRecoveryBusy = false;
const entryRecoveryStatus = document.getElementById("entry-recovery-status")!,
  entryRecoveryEnter = document.querySelector<HTMLButtonElement>("#entry-recovery-enter")!;
entryRecoveryDialog.addEventListener("cancel", (event) => {
  if (entryRecoveryBusy) event.preventDefault();
});
entryRecoveryDialog.querySelector("form")!.addEventListener("submit", (event) => {
  event.preventDefault();
  if (entryRecoveryBusy) return;
  const action = (event as SubmitEvent).submitter?.getAttribute("value");
  if (action === "cancel") {
    entryRecoveryDialog.close();
    return;
  }
  if (action !== "restore" && action !== "discard") return;
  void (async () => {
    entryRecoveryBusy = true;
    const controls = entryRecoveryDialog.querySelectorAll<HTMLButtonElement | HTMLSelectElement>(
      "button,select",
    );
    controls.forEach((control) => {
      control.disabled = true;
    });
    entryRecoveryStatus.textContent =
      action === "restore" ? "Restoring saved sculpture…" : "Discarding recovery checkpoints…";
    try {
      if (!recovery?.blocked || loadingProject || xrBlocked() || !layers.recoveryReady)
        throw new Error("Finish the current edit, then try again.");
      if (action === "restore")
        await restoreCheckpoint(
          entryRecoveryDialog.querySelector<HTMLSelectElement>("select")!.value,
        );
      else await recovery.discard();
      if (booleanPreview) {
        entryRecoveryStatus.textContent = "Preparing Boolean preview…";
        await layers.composite.flush();
      }
      entryRecoveryStatus.textContent =
        action === "restore"
          ? "Saved sculpture restored. Ready to enter VR."
          : "Recovery cleared. Your current sculpture is ready.";
      entryRecoveryDialog.querySelector<HTMLElement>(".dialog-actions")!.hidden = true;
      entryRecoveryEnter.hidden = false;
      entryRecoveryEnter.disabled = false;
      entryRecoveryEnter.focus();
    } catch (error) {
      entryRecoveryStatus.textContent = message(error);
      controls.forEach((control) => {
        control.disabled = false;
      });
    } finally {
      entryRecoveryBusy = false;
      updateRecoveryUI();
    }
  })();
});
entryRecoveryEnter.addEventListener("click", () => {
  if (
    entryRecoveryBusy ||
    loadingProject ||
    !layers.recoveryReady ||
    (recovery?.blocked && recovery.enabled)
  )
    return;
  entryRecoveryDialog.close();
  void xrExperience!.session.enter();
});
function interruptSession(_reason: string): void {
  libraryAbort.abort();
  libraryAbort = new AbortController();
  recovery?.cancelJob();
  exportAbort?.abort();
  bakeAbort?.abort();
  xrExperience?.controllers.suspend();
  desktopStroke.cancel();
  layers.cancelStroke();
  layers.cancelTransform();
  stop();
  cursor.visible = false;
  desktopPaths.visible = false;
  desktopMirrorCursor.hide();
  pointerInside = false;
  previous = performance.now();
}
const lifecycle = new AppLifecycle(document, window, interruptSession, () => {
  previous = performance.now();
  pointerInside = false;
  void recovery?.tick(Date.now(), true);
});
const recoveryTimer = setInterval(() => {
  if (document.visibilityState === "visible") {
    const stats = stabilityMetrics.sample(layers, Date.now()),
      heap = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory
        ?.usedJSHeapSize;
    stabilityText = `History ${(stats.historyBytes / 1048576).toFixed(1)} MiB · recovery ${!recovery?.enabled ? "off" : recovery?.blocked ? "choice needed" : recovery?.warning ? "warning" : recovery?.active ? "working" : recovery?.lastSuccess ? "saved" : "waiting"} ${(recovery?.lastMs ?? 0).toFixed(0)} ms`;
    document.getElementById("stability-status")!.textContent =
      `${stats.chunks} allocated / ${stats.meshChunks} mesh chunks · ${stats.vertices.toLocaleString()} vertices / ${stats.triangles.toLocaleString()} triangles. Grid ${(stats.voxelBytes / 1048576).toFixed(1)} MiB · paint ${(stats.paintBytes / 1048576).toFixed(1)} MiB · history ${(stats.historyBytes / 1048576).toFixed(1)} MiB · derived Boolean ${(stats.compositeBytes / 1048576).toFixed(1)} MiB. Pending Move ${stats.pendingMoveJobs} / Bake ${stats.pendingBakeJobs} / export ${Number(!!exportAbort)} / recovery ${Number(!!recovery?.active)}. Checkpoint ${((recovery?.lastBytes ?? 0) / 1048576).toFixed(1)} MiB / ${(recovery?.lastMs ?? 0).toFixed(0)} ms, snapshot copy ${(recovery?.lastCopyMs ?? 0).toFixed(1)} ms. Tracked ${(stats.trackedBytes / 1048576).toFixed(1)} MiB (excludes JS/GPU overhead) · JS heap ${heap === undefined ? "unavailable" : (heap / 1048576).toFixed(1) + " MiB"} · renderer ${renderer.info.memory.geometries} geometries / ${renderer.info.memory.textures} textures.${stats.pressure ? " Resource pressure: save manually before further large edits." : ""}`;
    void recovery?.tick();
    updateRecoveryUI();
  }
}, 500);
import.meta.hot?.dispose(() => {
  clearInterval(recoveryTimer);
  lighting.dispose();
  referenceEditor?.dispose();
  references.dispose();
  lifecycle.dispose();
  recovery?.dispose();
  projectBrowser.store.close();
  exportAbort?.abort();
  bakeAbort?.abort();
  xrExperience?.controllers.suspend();
});
function resizeDesktop() {
  if (renderer.xr.isPresenting || xrBlocked()) return;
  const w = ui.viewport.clientWidth,
    h = ui.viewport.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resizeDesktop).observe(ui.viewport);
refresh();
let previous = performance.now();
function pollComposite(now: number): void {
  if (
    booleanPreview &&
    !layers.transforming &&
    !loadingProject &&
    !ui.modalOpen &&
    now - lastCompositePoll > 100
  ) {
    lastCompositePoll = now;
    const job = layers.composite.tick();
    if (job)
      ui.compositeInfo(
        "Preview pending · updates after a short pause. Brushes still target the selected source layer.",
      );
    if (job)
      void job
        .then((changed) => {
          const s = layers.composite.stats;
          if (changed) {
            syncView();
            syncStats();
          }
          if (changed && s)
            ui.compositeInfo(
              `${s.resolution}³ · voxel ${s.step.toFixed(4)} world · SAMPLE ${s.samplingMs.toFixed(1)} ms · MESH ${s.meshingMs.toFixed(1)} ms · ${s.chunks}/${s.totalChunks} chunks${s.capped ? " · Quality capped; fine detail may be lost." : ""}`,
            );
        })
        .catch((error) => {
          ui.compositeInfo(
            `Preview unavailable: ${message(error)} Sources kept; use Separate Layers.`,
          );
          ui.projectMessage(message(error), true);
        });
  }
}
renderer.setAnimationLoop((now, frame) => {
  const cpuStart = performance.now();
  lighting.sync(now, document.visibilityState !== "hidden");
  lightUI.sync();
  referenceEditor?.sync();
  referencesUI.sync();
  renderEmulatorFrame?.(now);
  if (xrBlocked()) {
    desktopTube.cancel();
    desktopMirrorPlane.group.visible = false;
    desktopFieldCursor.hide();
    desktopMirrorCursor.hide();
    desktopPaths.visible = false;
    if (desktopStroke.active) desktopStroke.cancel();
    if (frame && renderer.xr.isPresenting) xrExperience!.frame(now, frame);
    if (!xrExperience!.controllers.grab?.active && !xrExperience!.controllers.layerGrab?.active)
      pollComposite(now);
    transformPreview.sync(layers);
    layers.updateMaskOverlays();
    renderer.render(scene, camera);
    xrExperience!.finishFrame(performance.now() - cpuStart);
    return;
  }
  xrExperience?.refreshButton();
  const dt = Math.min((now - previous) / 1000, 0.05);
  previous = now;
  if (input.cameraEnabled) controls.update();
  const runtime = layers.active;
  if (desktopStroke.phase === "committing")
    try {
      desktopStroke.pump();
    } catch (error) {
      desktopStroke.cancel();
      ui.status(message(error));
    }
  if (
    pointerInside &&
    editorTools?.active !== "tube" &&
    editorTools?.active !== "edit-spline" &&
    input.canSculpt(
      runtime.layer.editable,
      loadingProject || ui.modalOpen || xrBlocked() || shapeGhost.model.enabled,
    ) &&
    hasUniformScale(runtime.layer.transform)
  ) {
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(
      booleanPreview ? layers.composite.group : runtime.surface.group,
      true,
    )[0];
    cursor.visible = !!hit;
    if (hit && hit.face) {
      normal
        .copy(hit.normal ?? hit.face.normal)
        .applyNormalMatrix(normalMatrix.getNormalMatrix(hit.object.matrixWorld));
      cursor.position.copy(hit.point).addScaledVector(normal, 0.006);
      cursor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      cursor.scale.setScalar(ui.radius);
      cursor.material.color.set(
        ui.mode === "paint" || ui.mode === "paint-erase"
          ? layers.paintColour
          : ui.mode === "add"
            ? "#435d2c"
            : ui.mode === "subtract"
              ? "#a04b36"
              : "#426ca0",
      );
      cursor.material.opacity = 0.4 + ui.strength * 0.6;
      if (desktopStroke.phase === "drawing") {
        try {
          runtime.surface.group.updateWorldMatrix(true, false);
          const local = hit.point
            .clone()
            .applyMatrix4(runtime.surface.group.matrixWorld.clone().invert());
          desktopStroke.sample(local, now);
          ui.status(`${ui.mode} · ${runtime.layer.name} · ${Math.round(ui.strength * 100)}%`);
        } catch (error) {
          desktopStroke.cancel();
          stop();
          ui.status(message(error));
        }
      }
    } else if (desktopStroke.phase === "drawing") desktopStroke.pauseSurface(now);
    else layers.breakStrokePath();
    if (layers.drawing && now - lastRebuild >= 1000 / 30) {
      runtime.rebuild();
      syncStats();
      lastRebuild = performance.now();
    }
  } else {
    cursor.visible = false;
    if (desktopStroke.phase === "drawing" && !pointerInside) desktopStroke.pauseSurface(now);
    else layers.breakStrokePath();
  }
  desktopTube.update(now);
  syncPrecisionOptions();
  desktopFieldCursor.hide();
  desktopMirrorPlane.sync();
  desktopMirrorCursor.hide();
  if (cursor.visible && layers.symmetry.enabled) {
    runtime.surface.group.updateWorldMatrix(true, false);
    const p = cursor.position
      .clone()
      .applyMatrix4(runtime.surface.group.matrixWorld.clone().invert());
    desktopMirrorCursor.show(
      runtime.surface.group,
      reflectPoint(p, layers.symmetry),
      ui.radius / uniformScale(runtime.layer.transform),
      ui.mode === "smooth",
    );
    desktopMirrorCursor.showField(runtime.volume, reflectPoint(p, layers.symmetry), ui.mode);
  }
  if (cursor.visible && ["flatten", "inflate", "scrape", "pinch", "crease"].includes(ui.mode)) {
    const p = cursor.position
      .clone()
      .applyMatrix4(runtime.surface.group.matrixWorld.clone().invert());
    desktopFieldCursor.show(
      runtime.surface.group,
      p,
      ui.radius / uniformScale(runtime.layer.transform),
    );
    desktopFieldCursor.showField(runtime.volume, p, ui.mode);
    cursor.visible = false;
  }
  desktopPaths.visible = desktopStroke.active && desktopStroke.preview.length > 0;
  if (desktopPaths.visible) {
    desktopPathGeometry.setFromPoints(
      desktopStroke.preview.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
    );
    desktopPaths.matrix.copy(runtime.surface.group.matrixWorld);
    const m = layers.symmetry;
    desktopMirrorPath.visible = m.enabled;
    desktopMirrorPath.scale.set(1, 1, 1);
    desktopMirrorPath.position.set(0, 0, 0);
    if (m.enabled) {
      desktopMirrorPath.scale[m.axis] = -1;
      desktopMirrorPath.position[m.axis] = 2 * m.offset;
    }
  }
  pollComposite(now);
  if (ghostRotation) {
    ghostRotation.space =
      document.querySelector<HTMLSelectElement>("#shape-space")!.value === "world"
        ? "world"
        : "local";
    ghostRotation.sync();
  }
  shapeGhost.mirror = layers.symmetry;
  shapeGhost.sync(loadingProject || ui.modalOpen || xrBlocked());
  shapeLibraryUI.refresh();
  syncViewportTools();
  transformPreview.sync(layers);
  layers.updateMaskOverlays();
  renderer.render(scene, camera);
  if (questCapture.active) {
    const time = performance.now();
    questCapture.tick(time, time - cpuStart, NaN, layers.pendingChunks);
    questCapture.sample(time, () => ({
      mode: "desktop",
      resources: layers.resourceStats(),
      trackedBytes: layers.trackedBytes,
      heapBytes:
        (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory
          ?.usedJSHeapSize ?? null,
      renderer: {
        ...renderer.info.memory,
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
      },
      loadingProject,
      exporting: !!exportAbort,
      recovery: {
        active: recovery?.active,
        copyMs: recovery?.lastCopyMs,
        lastMs: recovery?.lastMs,
      },
    }));
  }
});

// Explicit development-only native fixtures bypass platform file-picker issues
// during headset acceptance. Uses the same validated project-open path. Never
// fetches arbitrary URLs and is removed from production builds by Vite.
if (import.meta.env.DEV) {
  const fixture = new URLSearchParams(location.search).get("moveXRFixture");
  if (fixture && ["300k", "600k", "1m"].includes(fixture))
    void (async () => {
      try {
        const name = `move-xr-${fixture}.form`,
          response = await fetch(`/work/quest-move-fixtures/${name}`);
        if (!response.ok)
          throw new Error(
            "Prepare Move XR fixtures first: node scripts/prepare-move-xr-fixtures.mjs",
          );
        await openProjectFile(
          new File([await response.arrayBuffer()], name, { type: "application/octet-stream" }),
        );
      } catch (error) {
        ui.projectMessage(`Test fixture failed: ${message(error)}`, true);
      }
    })();
}

installDesktopColourPicker();
