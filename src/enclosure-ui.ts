import {
  ENCLOSURE_FIELDS,
  type EnclosureControls,
  type EnclosureField,
} from "./enclosure-controls";
import { enclosureFeatureUI } from "./enclosure-feature-ui";
export function enclosureUI(tools: EnclosureControls, host: HTMLElement, busy: () => boolean) {
  const panel = document.createElement("details"),
    title = document.createElement("summary");
  panel.className = "assembly-panel enclosure-panel";
  title.textContent = "Enclosure";
  title.title =
    "Create a box with a removable lid. Set the inside size and wall thickness, then adjust the lid clearance on each side.";
  const info = document.createElement("span");
  info.className = "enclosure-info";
  info.textContent = "ⓘ";
  info.setAttribute("aria-hidden", "true");
  title.append(info);
  panel.append(title);
  host.append(panel);
  const body = document.createElement("div");
  body.className = "enclosure-body";
  panel.append(body);
  const intro = document.createElement("p");
  intro.className = "enclosure-intro";
  intro.textContent = "Box + removable lid";
  body.append(intro);
  const modes = document.createElement("div");
  modes.className = "enclosure-modes";
  modes.setAttribute("role", "group");
  modes.setAttribute("aria-label", "Enclosure editing mode");
  body.append(modes);
  const inputs: HTMLInputElement[] = [],
    buttons: HTMLButtonElement[] = [];
  const action = (parent: HTMLElement, text: string, fn: () => void | Promise<void>) => {
    const b = document.createElement("button");
    b.textContent = text;
    b.type = "button";
    b.onclick = () => {
      try {
        void Promise.resolve(fn())
          .then(sync)
          .catch((e) => {
            tools.feedback = String(e);
            sync();
          });
      } catch (e) {
        tools.feedback = String(e);
      }
      sync();
    };
    buttons.push(b);
    parent.append(b);
    return b;
  };
  let hydrated = tools.parameters,
    displayedProject = tools.layers().project;
  const name = document.createElement("input"),
    nameLabel = document.createElement("label");
  nameLabel.className = "enclosure-name";
  nameLabel.textContent = "Name";
  name.type = "text";
  name.maxLength = 90;
  name.value = tools.parameters.name;
  name.setAttribute("aria-label", "Name");
  name.oninput = () => {
    tools.cancel();
    tools.parameters.name = name.value;
    sync();
  };
  nameLabel.append(name);
  body.append(nameLabel);
  const newMode = action(modes, "New enclosure", () => tools.newRecipe());
  const editMode = action(modes, "Edit selected", () => {
    tools.editSelected();
    for (const input of inputs)
      input.value = String(tools.value(input.dataset.enclosureField as EnclosureField));
  });
  editMode.setAttribute("aria-label", "Edit selected enclosure");
  const groups: Record<string, HTMLElement> = {};
  for (const [id, label] of [
    ["inside", "Inside size"],
    ["shell", "Walls & base"],
    ["lid", "Lid"],
  ]) {
    const section = document.createElement("fieldset"),
      legend = document.createElement("legend"),
      unit = document.createElement("span"),
      grid = document.createElement("div");
    section.className = "enclosure-section";
    legend.textContent = label;
    unit.textContent = "mm";
    unit.className = "enclosure-unit";
    legend.append(unit);
    grid.className = "enclosure-fields";
    section.append(legend, grid);
    body.append(section);
    groups[id] = grid;
  }
  const labels: Record<EnclosureField, string> = {
    innerWidthMm: "Width",
    innerDepthMm: "Depth",
    innerHeightMm: "Height",
    wallThicknessMm: "Wall",
    floorThicknessMm: "Floor",
    cornerRadiusMm: "Corner radius",
    clearanceMm: "Clearance",
    lipDepthMm: "Lip depth",
    thicknessMm: "Thickness",
  };
  for (const [key, label] of Object.entries(ENCLOSURE_FIELDS)) {
    const row = document.createElement("label"),
      input = document.createElement("input");
    row.textContent = labels[key as EnclosureField];
    input.type = "number";
    input.step = "any";
    input.value = String(tools.value(key as EnclosureField));
    input.dataset.enclosureField = key;
    input.setAttribute("aria-label", `${label} (mm)`);
    if (key === "clearanceMm")
      input.title = "Gap between the lid lip and the inside wall, on each side.";
    if (key === "innerHeightMm")
      input.title = "From the floor to the top edge. The lid lip uses some space at the top.";
    input.oninput = () => {
      try {
        tools.set(key as EnclosureField, input.value.trim() ? Number(input.value) : NaN);
      } catch (e) {
        tools.feedback = String(e);
      }
      sync();
    };
    row.append(input);
    groups[
      key.startsWith("inner")
        ? "inside"
        : ["clearanceMm", "lipDepthMm", "thicknessMm"].includes(key)
          ? "lid"
          : "shell"
    ].append(row);
    inputs.push(input);
  }
  const dimensions = document.createElement("div"),
    dimensionsLabel = document.createElement("span"),
    dimensionsValue = document.createElement("strong");
  dimensions.className = "enclosure-dimensions";
  dimensionsLabel.textContent = "Outside · W × D × H";
  dimensions.title = "Outside size of the base, without the lid.";
  dimensions.append(dimensionsLabel, dimensionsValue);
  body.append(dimensions);
  const actions = document.createElement("div");
  actions.className = "enclosure-actions";
  body.append(actions);
  const stage = action(actions, "Preview changes", () => {
    for (const input of inputs)
      tools.set(
        input.dataset.enclosureField as EnclosureField,
        input.value.trim() ? Number(input.value) : NaN,
      );
    return tools.stage();
  });
  const confirm = action(actions, "Create enclosure", () => tools.confirm());
  const cancel = action(body, "Cancel", () => tools.cancel()),
    status = document.createElement("p");
  status.setAttribute("role", "status");
  cancel.className = "enclosure-cancel";
  status.className = "enclosure-status";
  body.append(status);
  const features = enclosureFeatureUI(tools, body, () => sync());
  function sync() {
    tools.sync();
    if (displayedProject !== tools.layers().project) {
      displayedProject = tools.layers().project;
      if (panel.open) tools.openSelected();
    }
    if (hydrated !== tools.parameters) {
      hydrated = tools.parameters;
      name.value = tools.parameters.name;
      for (const input of inputs)
        input.value = String(tools.value(input.dataset.enclosureField as EnclosureField));
    }
    name.disabled = busy() || tools.pending;
    for (const b of buttons) b.disabled = b !== cancel && (busy() || tools.pending);
    for (const i of inputs) i.disabled = busy() || tools.pending;
    const invalid =
      inputs.some((i) => !i.value.trim() || !Number.isFinite(Number(i.value))) ||
      !name.value.trim();
    stage.disabled ||= invalid;
    confirm.disabled = busy() || tools.pending || !tools.ready || tools.featureReady || invalid;
    confirm.textContent = tools.mode === "Update" ? "Apply changes" : "Create enclosure";
    const ready = tools.ready;
    newMode.setAttribute("aria-pressed", String(tools.mode === "Create"));
    editMode.setAttribute("aria-pressed", String(tools.mode === "Update"));
    stage.classList.toggle("enclosure-primary", !ready);
    confirm.classList.toggle("enclosure-primary", ready);
    cancel.hidden = !ready && !tools.pending;
    const p = tools.parameters,
      outer = [
        p.innerWidthMm + 2 * p.wallThicknessMm,
        p.innerDepthMm + 2 * p.wallThicknessMm,
        p.innerHeightMm + p.floorThicknessMm,
      ];
    dimensionsValue.textContent = outer.every((v) => Number.isFinite(v) && v > 0)
      ? `${outer.map((v) => v.toLocaleString(undefined, { maximumFractionDigits: 2 })).join(" × ")} mm`
      : "—";
    status.textContent = tools.feedback;
    features.sync();
  }
  panel.ontoggle = () => {
    if (panel.open) tools.openSelected();
    sync();
  };
  sync();
  return { sync };
}
