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
  const format = dialog.querySelector<HTMLElement>("#export-format")!;
  const sizing = dialog.querySelector<HTMLElement>("#export-sizing")!;
  dialog.querySelector('label[for="export-format"]')!.textContent = "File format";
  dialog.querySelector('label[for="export-quality"]')!.textContent = "Quality preset";
  const target = dialog.querySelector<HTMLElement>("#print-size")!.closest("label")!;
  const basic = document.createElement("div");
  basic.className = "export-basics";
  const formatField = document.createElement("div");
  formatField.append(dialog.querySelector('label[for="export-format"]')!, format);
  const sizingField = document.createElement("div");
  sizingField.append(sizing.closest("label")!, target);
  basic.append(formatField, sizingField);
  const qualitySection = document.createElement("section");
  qualitySection.className = "export-quality-section";
  qualitySection.innerHTML =
    '<div class="export-quality-heading"><label for="export-quality-slider">Surface quality</label><output id="export-quality-value"></output></div>';
  const advanced = document.createElement("details");
  advanced.id = "export-advanced";
  advanced.innerHTML =
    '<summary>Advanced settings</summary><div class="export-advanced-grid"></div>';
  const advancedGrid = advanced.querySelector("div")!;
  // Keep original controls and listeners; less-frequent settings live together.
  for (const id of ["export-resolution", "export-memory", "export-quality"]) {
    const control = dialog.querySelector<HTMLElement>(`#${id}`)!;
    const label = dialog.querySelector(`label[for="${id}"]`)!;
    const field = document.createElement("div");
    const next = control.nextElementSibling;
    field.append(label, control);
    if (next?.tagName === "P" && next.id !== "export-estimate") field.append(next);
    advancedGrid.append(field);
  }
  const estimate = document.createElement("details");
  estimate.className = "export-count-details";
  estimate.innerHTML = "<summary>Triangle estimate</summary>";
  estimate.append(dialog.querySelector<HTMLElement>("#export-estimate")!);
  const scopes = document.createElement("section");
  scopes.id = "export-scopes";
  scopes.innerHTML =
    '<h3>Prepare export</h3><p>Current layer, visible layers, or one evaluated Boolean mesh.</p><div class="export-scope-actions"></div>';
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
  settings.replaceChildren(basic, qualitySection, estimate, advanced, scopes, result, print);
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
  const quality = document.querySelector<HTMLSelectElement>("#export-quality")!;
  const slider = document.createElement("input");
  slider.id = "export-quality-slider";
  slider.type = "range";
  slider.min = "0";
  slider.max = "2";
  slider.step = "1";
  slider.value = String(quality.selectedIndex);
  slider.setAttribute("aria-label", "Export surface quality");
  slider.setAttribute("aria-describedby", "export-estimate export-quality-note");
  const sync = () => {
    slider.value = String(quality.selectedIndex);
    slider.setAttribute("aria-valuetext", quality.selectedOptions[0].textContent ?? "");
    slider.disabled = quality.disabled;
    dialog.querySelector("#export-quality-value")!.textContent = ["Fast", "Standard", "High"][
      quality.selectedIndex
    ];
    const note = dialog.querySelector("#export-quality-note");
    if (note)
      note.textContent = [
        "Retain prepared triangles. No additional simplification.",
        "Weld and clean the mesh while retaining its surface.",
        "Also simplify eligible flat regions, preserving holes and sharp edges.",
      ][quality.selectedIndex];
  };
  slider.oninput = () => {
    if (busy()) {
      sync();
      return;
    }
    quality.selectedIndex = Number(slider.value);
    quality.dispatchEvent(new Event("change"));
  };
  quality.addEventListener("change", sync);
  // Busy state is owned by the existing UI; mirror it without polling or remeshing.
  new MutationObserver(sync).observe(quality, { attributes: true, attributeFilter: ["disabled"] });
  const qualityNote = document.createElement("p");
  qualityNote.id = "export-quality-note";
  qualityNote.textContent = "Retain prepared triangles. No additional simplification.";
  qualitySection.append(slider, qualityNote);
  sync();
}
