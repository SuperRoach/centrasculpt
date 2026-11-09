import { CURVED_TOLERANCES } from "./export-decimation";

/** Move existing controls, preserving their handlers and the shared Quest export path. */
export function mountExportDialog(refresh: () => void, busy: () => boolean): void {
  const first = document.querySelector('label[for="export-format"]')!;
  const parent = first.parentElement!;
  const opener = document.createElement("button");
  opener.id = "open-export";
  opener.textContent = "Export…";
  const dialog = document.createElement("dialog");
  dialog.id = "export-dialog";
  dialog.setAttribute("aria-labelledby", "export-dialog-title");
  dialog.innerHTML =
    '<header><h2 id="export-dialog-title">Export sculpture</h2><button type="button" id="close-export" aria-label="Close export">Close</button></header><p class="export-intro">Prepare a mesh, review its dimensions, then download.</p><div class="export-settings"></div>';
  const settings = dialog.querySelector(".export-settings")!;
  let node: Element | null = first;
  while (node && node.id !== "reset") {
    const next: Element | null = node.nextElementSibling;
    settings.append(node);
    node = next;
  }
  settings.append(document.getElementById("print-panel")!);
  const format = dialog.querySelector<HTMLSelectElement>("#export-format")!;
  const quality = dialog.querySelector<HTMLSelectElement>("#export-quality")!;
  const sizing = dialog.querySelector<HTMLSelectElement>("#export-sizing")!;
  dialog.querySelector('label[for="export-format"]')!.textContent = "File type";
  dialog.querySelector('label[for="export-quality"]')!.textContent = "Quality preset";
  for (const option of format.options) option.textContent = option.value.toUpperCase();
  for (const [index, option] of Array.from(quality.options).entries())
    option.textContent = ["Fast", "Standard", "High"][index];
  const target = dialog.querySelector<HTMLElement>("#print-size")!.closest("label")!;
  const basic = document.createElement("div");
  basic.className = "export-basics";
  const formatField = document.createElement("div");
  formatField.append(dialog.querySelector('label[for="export-format"]')!, format);
  const qualityField = document.createElement("div");
  qualityField.append(dialog.querySelector('label[for="export-quality"]')!, quality);
  basic.append(formatField, qualityField);
  const qualityNote = document.createElement("p");
  qualityNote.id = "export-quality-note";
  quality.setAttribute("aria-describedby", qualityNote.id);
  const sizingRow = document.createElement("div");
  sizingRow.className = "export-sizing-row";
  const actualLabel = document.createElement("label");
  actualLabel.className = "export-toggle";
  actualLabel.innerHTML =
    '<input id="export-actual-size" type="checkbox" role="switch"><span>Actual size (1:1)</span>';
  actualLabel.title = "Use calibrated project dimensions. Turn off to set a target longest side.";
  const actual = actualLabel.querySelector<HTMLInputElement>("input")!;
  // Keep the shared sizing state/handlers used by desktop, Quest and existing callers.
  const sizingState = sizing.closest("label")!;
  sizingState.hidden = true;
  sizing.hidden = true;
  sizingRow.append(actualLabel, sizingState, target);
  const advanced = document.createElement("details");
  advanced.id = "export-advanced";
  advanced.innerHTML =
    '<summary>Advanced settings</summary><div class="export-advanced-grid"></div>';
  const advancedGrid = advanced.querySelector("div")!;
  for (const id of ["export-resolution", "export-memory"]) {
    const control = dialog.querySelector<HTMLElement>(`#${id}`)!;
    const label = dialog.querySelector(`label[for="${id}"]`)!;
    const field = document.createElement("div");
    const next = control.nextElementSibling;
    field.append(label, control);
    if (next?.tagName === "P" && next.id !== "export-estimate") field.append(next);
    advancedGrid.append(field);
  }
  const curved = document.createElement("div");
  curved.className = "export-curved";
  curved.innerHTML =
    '<label class="export-toggle"><input id="export-curved" type="checkbox" aria-describedby="export-curved-note"><span>Curved reduction <small>Experimental · STL</small></span></label><p id="export-curved-note">Sampled checks are not a fit guarantee. Original mesh kept if checks fail. Printable parts stay exact.</p><div id="export-curved-settings" hidden><div class="export-tolerance-heading"><label for="export-curved-tolerance">Surface tolerance</label><output id="export-curved-value"></output></div><input id="export-curved-tolerance" type="range" min="0" max="3" step="1" value="2" aria-describedby="export-curved-note"><div class="export-range-labels"><span>Finer surface</span><span>More reduction</span></div></div>';
  advancedGrid.append(curved);
  const enable = curved.querySelector<HTMLInputElement>("#export-curved")!;
  const tolerance = curved.querySelector<HTMLInputElement>("#export-curved-tolerance")!;
  const estimate = document.createElement("details");
  estimate.className = "export-count-details";
  estimate.innerHTML = "<summary>Triangle estimate</summary>";
  estimate.append(dialog.querySelector<HTMLElement>("#export-estimate")!);
  const scopes = document.createElement("section");
  scopes.id = "export-scopes";
  scopes.innerHTML =
    '<h3>Prepare export</h3><p>Current layer, visible layers, or one evaluated Boolean mesh. Visible STL applies layer subtraction and intersection.</p><div class="export-scope-actions"></div>';
  const actions = scopes.querySelector("div")!;
  for (const [id, label] of [
    ["export-selected", "Current layer"],
    ["export", "All visible layers"],
    ["export-boolean", "Unified Boolean"],
  ]) {
    const button = dialog.querySelector<HTMLElement>(`#${id}`)!;
    button.textContent = label;
    actions.append(button);
  }
  const result = dialog.querySelector<HTMLElement>("#export-result")!;
  const print = dialog.querySelector<HTMLElement>("#print-panel")!;
  settings.replaceChildren(
    basic,
    qualityNote,
    sizingRow,
    estimate,
    advanced,
    scopes,
    result,
    print,
  );
  parent.insertBefore(opener, document.getElementById("reset"));
  document.body.append(dialog);
  opener.onclick = () => {
    if (busy() || document.querySelector("dialog[open]")) return;
    refresh();
    dialog.showModal();
    dialog.querySelector<HTMLSelectElement>("#export-format")!.focus();
  };
  dialog.querySelector<HTMLButtonElement>("#close-export")!.onclick = () => {
    if (busy()) document.getElementById("cancel-export")!.click();
    else dialog.close();
  };
  dialog.addEventListener("cancel", (event) => {
    if (busy()) {
      event.preventDefault();
      document.getElementById("cancel-export")!.click();
    }
  });
  dialog.addEventListener("close", () => opener.focus());
  const sync = () => {
    actual.checked = sizing.value === "actual";
    actual.disabled = sizing.disabled;
    const descriptions: Record<string, string> = {
      stl: "STL · 3D printing mesh in millimetres; no colour.",
      glb: "GLB · 3D scene in metres, with colour and layer transforms.",
    };
    format.title = descriptions[format.value] ?? "Choose the export file type.";
    qualityNote.textContent = [
      enable.checked && format.value === "stl"
        ? "Keep prepared triangles, then try curved reduction."
        : "Keep prepared triangles.",
      "Weld and clean the surface.",
      "Also simplify flat regions, preserving holes and sharp edges.",
    ][quality.selectedIndex];
    if (format.value !== "stl") enable.checked = false;
    enable.disabled = format.disabled || quality.disabled || format.value !== "stl";
    tolerance.disabled = enable.disabled || !enable.checked;
    curved.querySelector<HTMLElement>("#export-curved-settings")!.hidden =
      !enable.checked || format.value !== "stl";
    const mm = CURVED_TOLERANCES[Number(tolerance.value)];
    curved.querySelector("#export-curved-value")!.textContent = `${mm} mm`;
    tolerance.setAttribute("aria-valuetext", `${mm} millimetres sampled tolerance`);
  };
  actual.onchange = () => {
    if (busy()) {
      sync();
      return;
    }
    sizing.value = actual.checked ? "actual" : "target";
    sizing.dispatchEvent(new Event("change"));
  };
  for (const control of [format, quality, sizing, enable, tolerance])
    control.addEventListener("change", sync);
  tolerance.addEventListener("input", sync);
  const observer = new MutationObserver(sync);
  for (const control of [format, quality, sizing])
    observer.observe(control, { attributes: true, attributeFilter: ["disabled"] });
  sync();
}
