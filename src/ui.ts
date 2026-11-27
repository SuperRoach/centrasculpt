import { activityLogo } from "./activity-logo";
import { BRUSH_RADIUS_LIMITS } from "./brush-settings";
import { EXPORT_MEMORY_BUDGETS_MIB } from "./export-mesh";
import { MAX_PROJECT_LAYERS } from "./project";
import type { RenderStyle } from "./render-style";
import { volumeLabel } from "./volume-store";
import "./style.css";
import type { BakeOptions, BakePlan, BakeProgress, SurfaceView } from "./bake";
import type { ViewportMode } from "./display-preferences";
import type { EditorMode, TransformSpace } from "./interaction";
import type { SdfLayer } from "./layers";
import type { SculptSettings } from "./project";
import type { BrushMode } from "./sdf";
import type { VolumeTransform } from "./transform";
import { hasUniformScale } from "./transform";

const renderStyleIcons: Record<RenderStyle, string> = {
  normal:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor" opacity=".18"/></svg>',
  matte:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M5 12h14M7 7.5h10M7 16.5h10"/></svg>',
  glossy:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="13" r="7"/><path d="M17 3l.9 2.6 2.6.9-2.6.9L17 10l-.9-2.6-2.6-.9 2.6-.9L17 3zM6 4v4M4 6h4M18 15v5M15.5 17.5h5"/></svg>',
};
export type TransformField = "px" | "py" | "pz" | "rx" | "ry" | "rz" | "scale";
export type TransformUIAction =
  | { type: "mode"; mode: EditorMode }
  | { type: "space"; space: TransformSpace }
  | { type: "field"; field: TransformField; value: number }
  | { type: "reset" };
export type LayerAction =
  | "new"
  | "new-empty"
  | "new-sparse"
  | "select"
  | "rename"
  | "duplicate"
  | "delete"
  | "up"
  | "down"
  | "visible"
  | "lock"
  | "colour"
  | "mode"
  | "operation";
export function createUI() {
  document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
    <header><button type="button" id="project-menu-toggle" class="brand" popovertarget="project-menu" aria-label="Centra Sculpt project menu"><span class="brand-mark" aria-hidden="true"><span class="brand-idle">◎</span><span class="brand-activity"><span class="brand-pulse">◎</span></span></span><span>Centra <em>Sculpt</em></span></button><div id="project-menu" popover><button type="button" data-project-menu="new-project">New Project</button><button type="button" data-project-menu="save-project">Save in Browser</button><button type="button" data-project-menu="download-current">Download .form</button><button type="button" data-project-menu="library">Open from Library</button><button type="button" data-project-menu="open-project">Import .form</button><a id="project-help" href="${import.meta.env.BASE_URL}read-the-docs/" target="_blank" rel="noopener" aria-label="Help — opens in a new tab">Help ↗</a><button type="button" data-project-menu="about">About</button></div><dialog id="about-dialog" aria-labelledby="about-title"><form method="dialog"><svg class="about-logo" viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" stroke-width="4" aria-hidden="true"><circle cx="32" cy="32" r="23"/><circle cx="32" cy="32" r="14"/></svg><h2 id="about-title">Centra Sculpt</h2><p id="about-version"></p><p>2026<br>Made by Brett James</p><div class="dialog-actions"><button>Close</button></div></form></dialog><span class="subtitle">A SPACE TO SHAPE</span><div id="xr-entry-slot"></div><button type="button" id="header-save" data-state="unsaved" aria-label="Save in browser — Unsaved changes" title="Unsaved changes · Click to save in this browser · Hold to download .form"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/></svg><span class="save-state-dot" aria-hidden="true"></span></button><span id="header-save-status" class="sr-only" role="status"></span></header>
    <main><aside><h1>Make room<br>for an idea.</h1>
    <div id="recovery-slot"></div><div id="shape-library-slot"></div>
    <details id="sculpt-brush" open><summary>Sculpt Brush</summary><section class="sculpt-brush-body"><div class="modes"><button id="add" title="Add clay to the surface." class="active" aria-pressed="true"><b>＋</b> Add</button><button id="subtract" title="Remove clay from the surface." aria-pressed="false"><b>−</b> Subtract</button><button id="smooth" title="Soften bumps and blend the surface." aria-pressed="false"><b>≈</b> Smooth</button><button id="flatten" title="Level the surface toward a plane.">Flatten</button><button id="inflate" title="Expand the surface along its normals.">Inflate</button><button id="scrape" title="Scrape away raised areas.">Scrape</button><button id="pinch" title="Pull nearby clay into a sharper ridge.">Pinch</button><button id="crease" title="Carve a narrow crease into the surface.">Crease</button><button id="paint" title="Paint colour onto clay without changing its shape.">Paint Colour</button><button id="paint-erase" title="Erase painted colour.">Erase Colour</button><button id="mask" title="Protect painted areas from sculpting.">Mask Paint</button><button id="mask-erase" title="Remove protection from masked areas.">Mask Erase</button></div>
    <div class="range-label"><label for="radius">BRUSH RADIUS · WORLD</label><output id="radius-value">0.220</output></div><input id="radius" type="range" min="${BRUSH_RADIUS_LIMITS.min}" max="${BRUSH_RADIUS_LIMITS.max}" step="0.01" value="0.22"/><div class="range-ends"><span>Fine detail</span><span>Broad strokes</span></div>
    <div class="range-label strength-label"><label for="strength">BRUSH STRENGTH</label><output id="strength-value">35%</output></div><input id="strength" type="range" min="0.01" max="1" step="0.01" value="0.35"/><div class="range-ends"><span>Gentle</span><span>Strong</span></div>
    <div class="range-label strength-label"><label for="hardness">BRUSH HARDNESS</label><output id="hardness-value">0%</output></div><input id="hardness" type="range" min="0" max="1" step="0.01" value="0"/><div class="range-ends"><span>Soft clay</span><span>Sharp edge · Smooth unchanged</span></div>
    <label for="resolution" class="strength-label">VOXEL RESOLUTION</label><div class="resolution-controls"><select id="resolution"><option value="64">64³ · Default</option><option value="128">128³ · Fine</option><option value="192">192³ · High memory</option></select><button id="apply-resolution">Resample</button></div><p class="resolution-note">Higher resolution allows finer detail. Resampling clears sculpt undo for this layer.</p></section></details>
    <div id="sidebar-tools"></div>
    <details class="instructions"><summary>CONTROLS & SHORTCUTS</summary><p><kbd>I</kbd> Cycle Normal / Matte / Glossy</p><p><kbd>G</kbd> Move stamp preview / finish moving</p><p><kbd>T</kbd> Rotate stamp ghost / finish rotation</p><p><kbd>W</kbd> Activate layer move</p><p><kbd>E</kbd> Activate layer rotation (or constrain X while moving)</p><p><kbd>E</kbd> / <kbd>D</kbd> / <kbd>C</kbd> Hold during layer move to constrain X / Y / Z</p><p><kbd>R</kbd> / <kbd>F</kbd> / <kbd>V</kbd> Hold during layer rotation to constrain X / Y / Z</p><p><kbd>B</kbd> Return to brush (hides shape ghost)</p><p><kbd>Drag</kbd> Sculpt the surface or move / rotate the layer</p><p><kbd>Right drag</kbd> Orbit the camera</p><p><kbd>Scroll</kbd> Zoom in / out</p><p><kbd>Shift + right drag</kbd> Pan the view</p><p><kbd>Middle drag</kbd> Pan the view</p><p><kbd>.</kbd> Frame selected layer or group</p><p><kbd>Delete / Backspace</kbd> Delete selected layer (undoable)</p><p><kbd>Cmd/Ctrl + Z</kbd> Undo</p><p><kbd>+ Shift</kbd> Redo</p></details>
    <div id="xr-tips-slot"></div>
    <div class="actions"><div class="history-buttons"><button id="undo" disabled title="Undo (Cmd/Ctrl+Z)">↶ Undo</button><button id="redo" disabled title="Redo (Cmd/Ctrl+Shift+Z)">↷ Redo</button></div><p id="history-info">0 undo · 0 redo</p>
    <div class="project-buttons"><button id="new-project">New Project…</button><button id="save-project" title="Save the current project to this browser’s Project Library">Save in Browser</button><button id="open-project" title="Open a native .form project file">Import Project</button></div><input id="project-file" type="file" accept=".form" hidden/><p id="project-message" role="status"></p>
    <label for="export-format">EXPORT FORMAT</label><select id="export-format"><option value="stl">STL (.stl) · 3D printing</option><option value="glb">GLB (.glb) · 3D mesh and colour</option></select><label for="export-quality">EXPORT QUALITY</label><select id="export-quality"><option value="fast">Fast · existing triangles</option><option value="standard">Standard · welded and cleaned</option><option value="high">High · planar optimisation</option></select><label for="export-resolution">BOOLEAN EXPORT RESOLUTION</label><select id="export-resolution"><option value="192">Default · up to 192³</option><option value="256">Extra detail · up to 256³</option></select><label for="export-memory">EXPORT MEMORY</label><select id="export-memory">${EXPORT_MEMORY_BUDGETS_MIB.map((mib) => `<option value="${mib}">${mib === 256 ? "Default" : mib === 384 ? "More" : "Maximum"} · ${mib} MiB</option>`).join("")}</select><p id="export-estimate" role="status"></p><button id="cancel-export" hidden>Cancel export</button><button id="export-selected">Export current layer</button>
    <button id="export">Export all layers</button><button id="export-boolean">Export unified boolean</button><button id="reset">↺ &nbsp; Reset sphere</button><p>All layers exports visible sculpt layers as separate parts. Hidden layers and references are excluded. Unified boolean exports the composed result.</p></div><div id="xr-diagnostics-slot"></div></aside>
    <div id="viewport"><button type="button" id="cycle-render-style" class="render-style-toggle" aria-label="Cycle rendering style" title="Cycle Normal, Matte and Glossy (I)"><span id="cycle-render-style-icon" aria-hidden="true">${renderStyleIcons.normal}</span><span id="cycle-render-style-name">Normal</span></button><button type="button" id="cycle-camera-view" class="viewport-label" title="Cycle Perspective, Top, Side and Bottom views" aria-label="Camera view: Perspective. Switch to Top"><span class="dot" aria-hidden="true"></span> <span id="camera-view-label">Perspective</span></button><button type="button" id="frame-selected" class="frame-selected" title="Center and fit the selected layer or group (.) · Right drag to orbit · Shift + right drag to pan" aria-keyshortcuts="." aria-label="Frame selected layer or group">Frame selected <kbd>.</kbd></button><div id="status" role="status">Ready to sculpt</div><div id="viewport-toast" class="viewport-toast" role="status" aria-live="polite" hidden></div><div class="bottom-label"><span id="mesh-info"></span><span id="rebuild-info">Measuring mesh…</span></div></div><aside class="layers-panel"><h2>Layers</h2>
    <label id="surface-view-label">SURFACE VIEW</label><div id="composition-mode" class="surface-view-toggle" role="group" aria-labelledby="surface-view-label"><button type="button" data-surface-view="separate" aria-pressed="true" title="Show separate layers">Layers</button><button type="button" data-surface-view="boolean" aria-pressed="false" title="Show Boolean preview. Desktop editing adapts detail to frame rate, then refines after release.">Boolean</button></div><p id="composite-info" class="layers-hint composite-activity" role="status" aria-busy="false" data-busy="false" hidden><span class="composite-activity-logo" aria-hidden="true">${activityLogo}</span><span class="composite-activity-text"></span></p><label id="render-style-label">RENDERING STYLE</label><div id="render-style" class="render-style-options" role="group" aria-labelledby="render-style-label" aria-describedby="render-style-help"><button type="button" data-render-style="normal" aria-label="Normal · Clay" aria-pressed="true" title="Normal · Clay">${renderStyleIcons.normal}</button><button type="button" data-render-style="matte" aria-label="Matte · Soft reflections" aria-pressed="false" title="Matte · Soft reflections">${renderStyleIcons.matte}</button><button type="button" data-render-style="glossy" aria-label="Glossy · Surface inspection" aria-pressed="false" title="Glossy · Surface inspection">${renderStyleIcons.glossy}</button></div><span id="render-style-help" class="sr-only">Lighting style changes the viewport only; painted colours are exported. Press I to cycle.</span><label id="viewport-mode-label">LAYER DISPLAY COLOURS</label><div id="viewport-mode" class="viewport-mode-toggle" role="group" aria-labelledby="viewport-mode-label"><button type="button" data-viewport-mode="clay" aria-pressed="false" title="Use a single clay colour">Clay</button><button type="button" data-viewport-mode="layer-colours" aria-pressed="true" title="Colour each layer">Layer Colours</button></div>
    <div class="new-layer-controls"><select id="new-layer-resolution" aria-label="New layer resolution"><option value="64">64³</option><option value="128">128³</option><option value="192">192³</option></select><select id="new-layer-contents" aria-label="New layer contents"><option value="empty">Empty clay volume</option><option value="sphere">Starter sphere</option><option value="sparse">Empty clay volume (experimental sparse)</option></select><button id="new-layer">＋ New layer</button></div>
    <div class="layer-geometry-actions"><button id="cut-plane" title="Split layers with a plane">Plane Cut…</button><button id="bake-layers">Bake / Merge…</button></div><div id="bake-running" hidden><p id="bake-progress" role="status"></p><button id="cancel-bake">Cancel Bake</button></div>
    <section class="transform-panel active-layer-tools"><label>ACTIVE LAYER TOOLS</label><div class="transform-modes"><button data-tool="sculpt" aria-pressed="true" title="Sculpt (B)"><svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19c2-4 4-5 8-5s6 2 8 5M4 21h16M14 4l6 6-6 6-4 1 1-4zM13 6l6 6"/></svg>Sculpt (B)</button><button data-tool="translate" aria-pressed="false" title="Move (W): drag a layer surface to move it freely; hold E/D/C to constrain to X/Y/Z"><svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4"/></svg>Move (W)</button><button data-tool="rotate" aria-pressed="false" title="Rotate (E): drag a layer surface for free rotation; hold R/F/V to constrain to X/Y/Z"><svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7A9 9 0 1 0 21 15M20 2v6h-6"/></svg>Rotate (E)</button><button data-tool="scale" aria-pressed="false" title="Resize primitive dimensions with local axes: Box/Tapered box/Pyramid width/height/depth; Cylinder/Cone diameter/height; Sphere/ellipsoid axes; Capsule diameter/overall height; Torus ring radius/tube diameter. Other layers scale uniformly."><svg class="tool-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3H3v6M15 21h6v-6M3 3l7 7M21 21l-7-7"/></svg>Scale (R)</button></div>

    </section>
    <div id="layer-list" aria-label="Layers"></div><section class="transform-panel layer-space-settings">    <label for="transform-space">GIZMO SPACE</label><select id="transform-space"><option value="world">World</option><option value="local">Local</option></select><details class="preview-settings"><summary>Preview settings</summary><label for="composite-quality">COMPOSITE QUALITY CAP</label><select id="composite-quality"><option value="64">64³ · Fast</option><option value="128">128³ · Balanced</option><option value="192" selected>192³ · Detail</option></select></details><details class="preview-settings"><summary>Experimental</summary><label><input id="undo-mesh-cache" type="checkbox" autocomplete="off" checked/> Cache the latest sculpt Undo (up to 40 MiB)</label></details></section><section class="transform-panel transform-values"><label>ACTIVE LAYER NUMERIC TRANSFORM</label><fieldset class="numeric-transform"><legend>Position · world mm</legend><label>X<input data-transform-field="px" type="number" step="any" aria-label="Position X (mm)"/></label><label>Y<input data-transform-field="py" type="number" step="any" aria-label="Position Y (mm)"/></label><label>Z<input data-transform-field="pz" type="number" step="any" aria-label="Position Z (mm)"/></label></fieldset>
    <fieldset class="numeric-transform"><legend>Rotation · XYZ degrees</legend><label>X<input data-transform-field="rx" type="number" step="1" aria-label="Rotation X degrees"/></label><label>Y<input data-transform-field="ry" type="number" step="1" aria-label="Rotation Y degrees"/></label><label>Z<input data-transform-field="rz" type="number" step="1" aria-label="Rotation Z degrees"/></label></fieldset>
    <label for="uniform-scale">UNIFORM SCALE</label><input id="uniform-scale" data-transform-field="scale" type="number" min="0.001" max="1000" step="0.01" aria-label="Uniform scale"/>
    <button id="reset-transform">Reset Transform</button><p id="transform-note" class="layers-hint" role="status" aria-live="polite">Move: drag a layer surface to move it freely; hold E/D/C to constrain to X/Y/Z. Rotate: drag for free rotation; hold R/F/V to constrain to X/Y/Z. All scale handles are uniform. Numeric position fields use absolute world millimetres. Use Sculpt to resume brushing.</p></section></aside></main>
    <dialog id="new-project-dialog" aria-labelledby="new-project-title"><form method="dialog"><h2 id="new-project-title">New Project</h2><p>Replaces the open project and starts fresh history. Save your current work first. Existing recovery checkpoints are kept.</p><label for="new-project-resolution">Resolution</label><select id="new-project-resolution"><option value="64">64³ · Default</option><option value="128">128³ · Fine</option><option value="192">192³ · High memory</option></select><label for="new-project-contents">First layer</label><select id="new-project-contents"><option value="sphere">Starter sphere</option><option value="empty">Empty clay volume</option></select><div class="dialog-actions"><button value="cancel">Cancel</button><button value="create">Create project</button></div></form></dialog>
    <dialog id="bake-dialog" aria-labelledby="bake-title"><form method="dialog"><h2 id="bake-title">Bake visible Boolean result</h2><label for="bake-name">RESULT NAME</label><input id="bake-name" type="text" required maxlength="128" value="Baked sculpture"/><label for="bake-resolution">OUTPUT RESOLUTION</label><select id="bake-resolution"><option value="64">64³</option><option value="128" selected>128³</option><option value="192">192³</option></select><p id="bake-detail-note" role="status"></p><label class="bake-hide"><input id="bake-sparse" type="checkbox"/> Use experimental sparse storage</label><label class="bake-hide"><input id="bake-hide" type="checkbox" checked/> Hide source layers after baking</label><p id="bake-overlap-note"></p><details id="bake-merge-options"><summary>Merge two layers instead</summary><label for="bake-other">MERGE WITH</label><select id="bake-other"></select></details><p id="bake-error" role="alert"></p><div class="dialog-actions"><button value="cancel" formnovalidate>Cancel</button><button id="confirm-bake" value="bake">Bake new layer</button></div></form></dialog>
    <dialog id="cut-dialog" aria-labelledby="cut-title"><form method="dialog"><h2 id="cut-title">Plane Cut</h2><p>Preview the cutting plane. The two closed SDF pieces will remain separate; the second piece becomes a new layer.</p><label for="cut-axis">PLANE NORMAL</label><select id="cut-axis"><option value="x">X axis</option><option value="y">Y axis</option><option value="z">Z axis</option></select><label for="cut-scope">AFFECTED LAYERS</label><select id="cut-scope"><option value="active">Active layer</option><option value="all-editable">All visible, unlocked SDF layers</option></select><label for="cut-offset">PLANE POSITION</label><input id="cut-offset" type="range" min="-1.4" max="1.4" step="0.02" value="0"/><output id="cut-offset-value">0.00</output><label for="cut-tilt-x">TILT X</label><input id="cut-tilt-x" type="range" min="-90" max="90" step="15" value="0"/><label for="cut-tilt-y">TILT Y</label><input id="cut-tilt-y" type="range" min="-90" max="90" step="15" value="0"/><p id="cut-preview-status" role="status">Plane preview only · no geometry changed</p><p id="cut-error" role="alert"></p><div class="dialog-actions"><button value="cancel" formnovalidate>Cancel</button><button id="cut-apply" value="apply">Cut into new layer</button></div></form></dialog>`;
  let brushSelection: ((mode: BrushMode) => void) | null = null;
  let mode: BrushMode = "add";
  let clayMode: "add" | "subtract" = "add";
  function setMode(value: BrushMode): void {
    mode = value;
    if (value === "add" || value === "subtract") clayMode = value;
    for (const other of [
      "add",
      "subtract",
      "smooth",
      "flatten",
      "inflate",
      "scrape",
      "pinch",
      "crease",
      "mask",
      "mask-erase",
      "paint",
      "paint-erase",
    ]) {
      document.getElementById(other)!.classList.toggle("active", other === value);
      document.getElementById(other)!.setAttribute("aria-pressed", String(other === value));
    }
  }
  for (const value of [
    "add",
    "subtract",
    "smooth",
    "flatten",
    "inflate",
    "scrape",
    "pinch",
    "crease",
    "mask",
    "mask-erase",
    "paint",
    "paint-erase",
  ] as const)
    document
      .getElementById(value)!
      .addEventListener("click", () => (brushSelection ? brushSelection(value) : setMode(value)));
  const radius = document.querySelector<HTMLInputElement>("#radius")!;
  radius.addEventListener(
    "input",
    () => (document.getElementById("radius-value")!.textContent = Number(radius.value).toFixed(3)),
  );
  const strength = document.querySelector<HTMLInputElement>("#strength")!;
  strength.addEventListener(
    "input",
    () =>
      (document.getElementById("strength-value")!.textContent =
        `${Math.round(Number(strength.value) * 100)}%`),
  );
  const hardness = document.querySelector<HTMLInputElement>("#hardness")!;
  hardness.addEventListener(
    "input",
    () =>
      (document.getElementById("hardness-value")!.textContent =
        `${Math.round(Number(hardness.value) * 100)}%`),
  );
  let transformAction: (action: TransformUIAction) => void = () => {};
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-tool]"))
    button.addEventListener("click", () =>
      transformAction({ type: "mode", mode: button.dataset.tool as EditorMode }),
    );
  document.getElementById("transform-space")!.addEventListener("change", (event) =>
    transformAction({
      type: "space",
      space: (event.target as HTMLSelectElement).value as TransformSpace,
    }),
  );
  for (const input of document.querySelectorAll<HTMLInputElement>("[data-transform-field]")) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
    });
    input.addEventListener("change", () =>
      transformAction({
        type: "field",
        field: input.dataset.transformField as TransformField,
        value: input.valueAsNumber,
      }),
    );
  }
  document
    .getElementById("reset-transform")!
    .addEventListener("click", () => transformAction({ type: "reset" }));
  let layerAction: (action: LayerAction, id: string, value?: string) => void = () => {};
  const list = document.getElementById("layer-list")!;
  list.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("button[data-action]"),
      row = button?.closest<HTMLElement>("[data-layer-id]");
    if (button && row) layerAction(button.dataset.action as LayerAction, row.dataset.layerId!);
  });
  list.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement,
      row = input.closest<HTMLElement>("[data-layer-id]");
    if (row && (input.dataset.action === "rename" || input.dataset.action === "operation"))
      layerAction(input.dataset.action, row.dataset.layerId!, input.value);
  });
  list.addEventListener("input", (event) => {
    const input = event.target as HTMLInputElement,
      row = input.closest<HTMLElement>("[data-layer-id]");
    if (row && input.dataset.action === "colour")
      layerAction("colour", row.dataset.layerId!, input.value);
  });
  document.getElementById("new-layer")!.addEventListener("click", () => {
    const contents = document.querySelector<HTMLSelectElement>("#new-layer-contents")!.value;
    layerAction(
      contents === "sparse" ? "new-sparse" : contents === "empty" ? "new-empty" : "new",
      "",
      document.querySelector<HTMLSelectElement>("#new-layer-resolution")!.value,
    );
  });
  document.getElementById("viewport-mode")!.addEventListener("click", (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>("[data-viewport-mode]");
    if (button) layerAction("mode", "", button.dataset.viewportMode!);
  });
  const bakeDialog = document.querySelector<HTMLDialogElement>("#bake-dialog")!;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const activeTasks = new Set<string>();
  function activity(source: "boolean" | "export" | "project" | "library", busy: boolean) {
    if (busy) activeTasks.add(source);
    else activeTasks.delete(source);
    const brand = document.getElementById("project-menu-toggle")!;
    const value = String(activeTasks.size > 0);
    if (brand.dataset.busy !== value) brand.dataset.busy = value;
  }
  window.addEventListener("pagehide", () => clearTimeout(toastTimer), { once: true });
  return {
    activity,
    toast(text: string) {
      const element = document.getElementById("viewport-toast")!;
      clearTimeout(toastTimer);
      element.textContent = text;
      element.hidden = false;
      toastTimer = setTimeout(() => {
        element.hidden = true;
      }, 2500);
    },
    onBrushSelection(callback: (mode: BrushMode) => void) {
      brushSelection = callback;
    },
    selectBrushTool(tool: "brush" | "smooth") {
      setMode(tool === "smooth" ? "smooth" : clayMode);
    },
    onTransformAction(callback: typeof transformAction) {
      transformAction = callback;
    },
    transformState(
      transform: VolumeTransform,
      editable: boolean,
      mode: EditorMode,
      space: TransformSpace,
      busy = false,
      millimetresPerUnit = 1,
      faceResize = false,
    ) {
      for (const button of document.querySelectorAll<HTMLButtonElement>("[data-tool]")) {
        button.setAttribute("aria-pressed", String(button.dataset.tool === mode));
        button.classList.toggle("active", button.dataset.tool === mode);
        button.disabled = busy;
      }
      document.querySelector<HTMLSelectElement>("#transform-space")!.value = space;
      for (const input of document.querySelectorAll<HTMLInputElement>("[data-transform-field]")) {
        const field = input.dataset.transformField as TransformField;
        const value =
          field === "scale"
            ? hasUniformScale(transform)
              ? transform.scale[0]
              : NaN
            : field[0] === "p"
              ? transform.position["xyz".indexOf(field[1])] * millimetresPerUnit
              : (transform.rotation["xyz".indexOf(field[1])] * 180) / Math.PI;
        input.value = Number.isFinite(value) ? String(Number(value.toFixed(6))) : "";
        input.disabled = !editable || busy;
        input.dataset.editable = String(editable);
      }
      document.querySelector<HTMLButtonElement>("#reset-transform")!.disabled = !editable || busy;
      document.getElementById("reset-transform")!.dataset.editable = String(editable);
      document.getElementById("transform-note")!.textContent = !editable
        ? "Show and unlock the active layer to edit it."
        : !hasUniformScale(transform)
          ? "Legacy non-uniform scale preserved. Enter a uniform scale before sculpting or using Scale."
          : mode === "translate"
            ? "Move: drag a layer surface to move it freely; hold E/D/C to constrain to X/Y/Z. Drag another layer to select and move it."
            : mode === "rotate"
              ? "Rotate: drag a layer surface for free rotation; hold R/F/V to constrain to X/Y/Z. Drag another layer to select and rotate it."
              : mode === "scale"
                ? faceResize
                  ? "Scale is active: drag a highlighted box edge or face marker to move that face; the opposite face stays fixed. Drag the centre handle to scale evenly from the centre. For a small cutout, select its cutter in Layers and use Frame selected."
                  : "Scale is active: the centre handle scales evenly from the centre. Face handles appear for rectangular boxes without child layers."
                : "";
    },
    onLayerAction(callback: typeof layerAction) {
      layerAction = callback;
    },
    surfaceView(view: SurfaceView, triangles?: number) {
      document.getElementById("composite-info")!.hidden = view !== "boolean";
      for (const button of document.querySelectorAll<HTMLButtonElement>("[data-surface-view]")) {
        button.setAttribute("aria-pressed", String(button.dataset.surfaceView === view));
        if (button.dataset.surfaceView === "boolean")
          button.title = `Show Boolean preview${triangles === undefined ? "" : ` · ${triangles.toLocaleString()} triangles`}`;
      }
    },
    requestBake(
      getPlan: (resolution: number, sourceIds?: string[]) => BakePlan,
      onBounds: (plan: BakePlan | null) => void,
      sourceLayers: readonly SdfLayer[],
      activeId: string,
    ): Promise<BakeOptions | null> {
      const name = document.querySelector<HTMLInputElement>("#bake-name")!,
        resolution = document.querySelector<HTMLSelectElement>("#bake-resolution")!,
        sparse = document.querySelector<HTMLInputElement>("#bake-sparse")!,
        hide = document.querySelector<HTMLInputElement>("#bake-hide")!,
        confirm = document.querySelector<HTMLButtonElement>("#confirm-bake")!;
      name.value = "Baked sculpture";
      resolution.value = "128";
      sparse.checked = false;
      hide.checked = true;
      const merge = document.querySelector<HTMLDetailsElement>("#bake-merge-options")!,
        other = document.querySelector<HTMLSelectElement>("#bake-other")!;
      merge.open = false;
      other.replaceChildren();
      for (const layer of sourceLayers.filter((l) => l.id !== activeId)) {
        const option = document.createElement("option");
        option.value = layer.id;
        option.textContent = layer.name;
        other.append(option);
      }
      merge.hidden = !other.options.length;
      const sources = () => (merge.open ? [activeId, other.value] : undefined);
      const update = () => {
        document.getElementById("bake-title")!.textContent = merge.open
          ? "Merge two layers (Union)"
          : "Bake visible Boolean result";
        document.querySelector('label[for="bake-other"]')!.textContent =
          `MERGE ${sourceLayers.find((l) => l.id === activeId)?.name ?? "SELECTED LAYER"} WITH`;
        document.getElementById("bake-overlap-note")!.textContent = hide.checked
          ? ""
          : "Visible sources may overlap the baked layer.";
        try {
          other.disabled = !merge.open;
          const plan = getPlan(Number(resolution.value), sources());
          onBounds(plan);
          document.getElementById("bake-detail-note")!.textContent = plan.detailLimited
            ? "Lower resolution may soften fine detail."
            : "";
          if (!name.value.trim()) throw new Error("Enter a name for the baked layer.");
          confirm.disabled = false;
          document.getElementById("bake-error")!.textContent = "";
        } catch (error) {
          onBounds(null);
          confirm.disabled = true;
          document.getElementById("bake-error")!.textContent = (error as Error).message;
          document.getElementById("bake-detail-note")!.textContent = "";
        }
      };
      for (const element of [name, resolution, hide, other])
        element.addEventListener("input", update);
      merge.addEventListener("toggle", update);
      update();
      bakeDialog.returnValue = "cancel";
      bakeDialog.showModal();
      return new Promise((resolve) =>
        bakeDialog.addEventListener(
          "close",
          () => {
            for (const element of [name, resolution, hide, other])
              element.removeEventListener("input", update);
            merge.removeEventListener("toggle", update);
            onBounds(null);
            resolve(
              bakeDialog.returnValue === "bake"
                ? {
                    name: name.value.trim(),
                    resolution: Number(resolution.value),
                    hideSources: hide.checked,
                    storage: sparse.checked ? "sparse" : "dense",
                    ...(sources() ? { sourceIds: sources() } : {}),
                  }
                : null,
            );
          },
          { once: true },
        ),
      );
    },
    bakeBusy(busy: boolean) {
      document.getElementById("bake-running")!.hidden = !busy;
      document.querySelector<HTMLButtonElement>("#cancel-bake")!.disabled = false;
    },
    bakeProgress(progress: BakeProgress) {
      document.getElementById("bake-progress")!.textContent =
        `${progress.stage === "sampling" ? "Sampling SDF" : "Generating chunks"}: ${progress.completed}/${progress.total}`;
    },
    get modalOpen() {
      return !!document.querySelector("dialog[open]");
    },
    compositeBusy(busy: boolean) {
      activity("boolean", busy);
      const host = document.getElementById("composite-info")!;
      const value = String(busy);
      if (host.dataset.busy === value) return;
      host.dataset.busy = value;
      host.setAttribute("aria-busy", value);
    },
    compositeInfo(text: string, detail = text) {
      const label = document.querySelector<HTMLElement>(
        "#composite-info .composite-activity-text",
      )!;
      if (label.textContent !== text) label.textContent = text;
      label.title = detail;
    },
    renderStyle(style: RenderStyle) {
      for (const button of document.querySelectorAll<HTMLButtonElement>("[data-render-style]"))
        button.setAttribute("aria-pressed", String(button.dataset.renderStyle === style));
      document.getElementById("cycle-render-style-icon")!.innerHTML = renderStyleIcons[style];
      const button = document.getElementById("cycle-render-style")!;
      button.setAttribute(
        "aria-label",
        `${style[0].toUpperCase()}${style.slice(1)} rendering style; click to cycle`,
      );
      button.setAttribute(
        "title",
        `${style[0].toUpperCase()}${style.slice(1)} · Click to cycle (I)`,
      );
      document.getElementById("cycle-render-style-name")!.textContent = {
        normal: "Normal",
        matte: "Matte",
        glossy: "Glossy",
      }[style];
    },
    viewportMode(mode: ViewportMode) {
      for (const button of document.querySelectorAll<HTMLButtonElement>("[data-viewport-mode]"))
        button.setAttribute("aria-pressed", String(button.dataset.viewportMode === mode));
    },
    layerName(layer: SdfLayer) {
      const row = Array.from(list.children).find(
        (node) => (node as HTMLElement).dataset.layerId === layer.id,
      ) as HTMLElement | undefined;
      if (!row) return;
      const select = row.querySelector<HTMLButtonElement>('[data-action="select"]')!;
      select.textContent = `${layer.name} · ${volumeLabel(layer.volume)}`;
      select.setAttribute("aria-label", `Select ${layer.name}`);
      row
        .querySelector<HTMLInputElement>('[data-action="rename"]')!
        .setAttribute("aria-label", `Rename ${layer.name}`);
      row
        .querySelector<HTMLInputElement>('[data-action="colour"]')!
        .setAttribute("aria-label", `Viewport colour for ${layer.name}`);
      row
        .querySelector<HTMLSelectElement>('[data-action="operation"]')!
        .setAttribute("aria-label", `Boolean operation for ${layer.name}`);
      for (const [action, label] of [
        ["visible", `${layer.visible ? "Hide" : "Show"} ${layer.name}`],
        ["lock", `${layer.locked ? "Unlock" : "Lock"} ${layer.name}`],
        ["up", `Move ${layer.name} up`],
        ["down", `Move ${layer.name} down`],
        ["duplicate", `Duplicate ${layer.name}`],
        ["delete", `Delete ${layer.name}`],
      ])
        row
          .querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!
          .setAttribute("aria-label", label);
    },
    layerRows(layers: readonly SdfLayer[], activeId: string, colour: (layer: SdfLayer) => string) {
      list.replaceChildren();
      for (const [index, layer] of layers.entries()) {
        const row = document.createElement("div");
        row.className = `layer-row${layer.id === activeId ? " active" : ""}`;
        row.dataset.layerId = layer.id;
        const heading = document.createElement("div");
        heading.className = "layer-heading";
        const select = document.createElement("button");
        select.dataset.action = "select";
        select.className = "layer-select";
        select.textContent = `${layer.name} · ${volumeLabel(layer.volume)}`;
        select.setAttribute("aria-label", `Select ${layer.name}`);
        select.setAttribute("aria-pressed", String(layer.id === activeId));
        heading.append(select);
        const picker = document.createElement("input");
        picker.type = "color";
        picker.dataset.action = "colour";
        picker.value = colour(layer);
        picker.setAttribute("aria-label", `Viewport colour for ${layer.name}`);
        heading.append(picker);
        row.append(heading);
        const name = document.createElement("input");
        name.type = "text";
        name.value = layer.name;
        name.maxLength = 128;
        name.dataset.action = "rename";
        name.setAttribute("aria-label", `Rename ${layer.name}`);
        row.append(name);
        const operation = document.createElement("select");
        operation.dataset.action = "operation";
        operation.setAttribute("aria-label", `Boolean operation for ${layer.name}`);
        for (const [value, label] of [
          ["union", "Add / Union"],
          ["difference", "Subtract / Difference"],
          ["intersect", "Intersect"],
        ])
          operation.add(new Option(label, value));
        operation.value = layer.operation;
        operation.disabled = layer.locked;
        operation.dataset.unavailable = String(layer.locked);
        row.append(operation);
        const direction = document.createElement("p");
        direction.className = "layers-hint";
        direction.textContent = `${index + 1} · ${layer.visible ? (layers.find((l) => l.visible)?.id === layer.id ? "Initializes result (operation ignored)" : "Applied to result above") : "Hidden · excluded from preview"}`;
        row.append(direction);
        const tools = document.createElement("div");
        tools.className = "layer-tools";
        for (const [action, text, label, disabled] of [
          [
            "visible",
            layer.visible ? "Visible" : "Hidden",
            `${layer.visible ? "Hide" : "Show"} ${layer.name}`,
            false,
          ],
          [
            "lock",
            layer.locked ? "Locked" : "Unlocked",
            `${layer.locked ? "Unlock" : "Lock"} ${layer.name}`,
            false,
          ],
          ["up", "↑", `Move ${layer.name} up`, index === 0],
          ["down", "↓", `Move ${layer.name} down`, index === layers.length - 1],
          ["duplicate", "Copy", `Duplicate ${layer.name}`, false],
          ["delete", "Delete", `Delete ${layer.name}`, layers.length === 1],
        ] as const) {
          const button = document.createElement("button");
          button.dataset.action = action;
          button.textContent = text;
          button.setAttribute("aria-label", label);
          button.disabled = disabled;
          button.dataset.unavailable = String(disabled);
          if (action === "delete" && disabled) button.title = "Keep at least one layer";
          tools.append(button);
        }
        row.append(tools);
        list.append(row);
      }
      const create = document.querySelector<HTMLButtonElement>("#new-layer")!;
      create.disabled = layers.length >= MAX_PROJECT_LAYERS;
      create.dataset.unavailable = String(create.disabled);
    },
    get hardness() {
      return Number(hardness.value);
    },
    resolution(value: number) {
      const select = document.querySelector<HTMLSelectElement>("#resolution")!;
      for (const option of Array.from(select.options)) if (option.dataset.custom) option.remove();
      if (!Array.from(select.options).some((o) => o.value === String(value))) {
        const option = new Option(`${value}³ · Loaded`, String(value));
        option.dataset.custom = "true";
        select.add(option);
      }
      select.value = String(value);
    },
    get settings(): SculptSettings {
      return {
        mode,
        radius: Number(radius.value),
        strength: Number(strength.value),
        hardness: Number(hardness.value),
      };
    },
    setSettings(settings: SculptSettings) {
      // Preserve validated imported precision rather than snapping to the slider's default step.
      radius.step = "any";
      strength.step = "any";
      hardness.step = "any";
      hardness.value = String(settings.hardness);
      document.getElementById("hardness-value")!.textContent =
        `${Math.round(settings.hardness * 100)}%`;
      setMode(settings.mode);
      radius.value = String(settings.radius);
      strength.value = String(settings.strength);
      document.getElementById("radius-value")!.textContent = Number(radius.value).toFixed(3);
      document.getElementById("strength-value")!.textContent =
        `${Math.round(Number(strength.value) * 100)}%`;
    },
    history(undo: number, redo: number, busy = false) {
      document.querySelector<HTMLButtonElement>("#undo")!.disabled = busy || undo === 0;
      document.querySelector<HTMLButtonElement>("#redo")!.disabled = busy || redo === 0;
      document.getElementById("history-info")!.textContent = `${undo} undo · ${redo} redo`;
    },
    projectBusy(busy: boolean, preserveExportFocus = false) {
      activity("project", busy);
      for (const id of [
        "new-project",
        "open-project",
        "save-project",
        "reset",
        "apply-resolution",
        "export",
        "export-selected",
        "export-boolean",
        "export-format",
        "export-sizing",
        "print-size",
        "export-quality",
        "export-memory",
        "export-resolution",
        "cycle-render-style",
      ]) {
        const control = document.querySelector<HTMLButtonElement>(`#${id}`)!;
        const scopeButton = ["export", "export-selected", "export-boolean"].includes(id);
        control.disabled = busy && !(preserveExportFocus && scopeButton);
        if (scopeButton) control.setAttribute("aria-disabled", String(busy));
      }
      for (const control of document.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
        "#export-report-download,#print-panel button,#print-panel input",
      ))
        control.disabled = busy;
      for (const control of document.querySelectorAll<
        HTMLInputElement | HTMLButtonElement | HTMLSelectElement
      >(".layers-panel button,.layers-panel input,.layers-panel select"))
        control.disabled =
          busy ||
          control.dataset.unavailable === "true" ||
          (control.matches("[data-transform-field],#reset-transform") &&
            control.dataset.editable === "false");
    },
    projectMessage(text: string, error = false) {
      const element = document.getElementById("project-message")!;
      element.textContent = text;
      element.classList.toggle("error", error);
      element.setAttribute("role", error ? "alert" : "status");
    },
    get strength() {
      return Number(strength.value);
    },
    performance(text: string) {
      document.getElementById("rebuild-info")!.textContent = text;
    },
    viewport: document.getElementById("viewport")!,
    get mode() {
      return mode;
    },
    get radius() {
      return Number(radius.value);
    },
    status(text: string) {
      document.getElementById("status")!.textContent = text;
    },
    meshInfo(triangles: number, resolution: number | string, composite = false) {
      document.getElementById("mesh-info")!.textContent =
        `${triangles.toLocaleString()} TRIANGLES · ACTIVE ${typeof resolution === "number" ? `${resolution}³` : resolution} SAMPLES`;
      if (composite)
        document.getElementById("mesh-info")!.textContent =
          `${triangles.toLocaleString()} TRIANGLES · COMPOSITE ${resolution || "…"}³ SAMPLES`;
    },
  };
}
