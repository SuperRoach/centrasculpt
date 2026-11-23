import { partOwner } from "./assembly";
import {
  COMPONENT_LIMIT,
  COMPONENT_PRESETS,
  type ComponentPreset,
  type ComponentReference,
  componentDimensions,
  presetFor,
  validateComponents,
} from "./component-references";
import { componentMounting } from "./component-view";
import type { EnclosureControls } from "./enclosure-controls";
import type { IndependentLayers } from "./independent-layers";
import { newId } from "./layers";

export function componentUI(
  parent: Element,
  editor: () => IndependentLayers,
  tools: EnclosureControls,
  layerList: Element,
  blocked: () => boolean,
  viewportMode: (mode: "translate" | "rotate" | null) => void,
) {
  const panel = document.createElement("details");
  panel.className = "precision-settings";
  panel.id = "component-panel";
  panel.innerHTML = "<summary>3D Components</summary><p>References don't appear in exports.</p>";
  parent.append(panel);
  const picker = document.createElement("select");
  const selected = document.createElement("select");
  const host = document.createElement("select");
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const form = document.createElement("div");
  form.className = "reference-card";
  const group = document.createElement("section");
  group.id = "component-layers";
  group.setAttribute("aria-label", "Component references");
  const heading = document.createElement("h3");
  heading.className = "eyebrow";
  heading.textContent = "Components";
  const rows = document.createElement("div");
  group.append(heading, rows);
  group.hidden = true;
  layerList.after(group);
  const clearanceLabel = document.createElement("p");
  const metadata = document.createElement("p");
  const source = document.createElement("a");
  source.target = "_blank";
  source.rel = "noopener";
  source.textContent = "Mechanical source";
  function field(parent: HTMLElement, name: string, input: HTMLInputElement | HTMLSelectElement) {
    const label = document.createElement("label");
    label.textContent = name;
    label.append(input);
    parent.append(label);
  }
  function num(parent: HTMLElement, name: string, value: number) {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "any";
    input.value = String(value);
    field(parent, name, input);
    return input;
  }
  function button(parent: HTMLElement, name: string, action: () => void | Promise<void>) {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = name;
    el.onclick = async () => {
      if (blocked()) return;
      try {
        status.textContent = "";
        await action();
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error);
        return;
      }
      sync(true);
    };
    parent.append(el);
    return el;
  }
  function options(select: HTMLSelectElement, entries: [string, string][], value: string) {
    select.replaceChildren(...entries.map(([id, label]) => new Option(label, id)));
    select.value = value;
  }
  const records = () => editor().display.components;
  const hosts = () =>
    editor().project.layerStack.layers.filter((layer) => !!layer.assemblyPart?.enclosure);
  let selectedId = "";
  let layerSelection = "";
  let layerKey = "";
  let projectId = "";
  let lastKey = "";
  let previewOwner: ComponentReference | undefined;

  function current() {
    const record = records().find(({ id }) => id === selectedId);
    if (!record) throw new Error("Select a 3D component.");
    return record;
  }
  field(panel, "Component preset", picker);
  options(
    picker,
    Object.entries(COMPONENT_PRESETS).map(([id, item]) => [id, item.name]),
    "pcb",
  );
  const insert = button(panel, "Insert component", () => {
    const added: ComponentReference = {
      id: newId(),
      preset: picker.value as ComponentPreset,
      positionMm: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 1,
      opacity: 1,
      visible: true,
    };
    const next = validateComponents([...records(), added]);
    records().push(next[next.length - 1]);
    selectComponent(added.id);
  });
  field(panel, "Project component", selected);
  selected.onchange = () => selectComponent(selected.value);
  panel.append(form, status);
  form.append(metadata, source, clearanceLabel);
  const toolbar = document.createElement("div");
  toolbar.className = "reference-edit-toolbar";
  form.append(toolbar);
  const move = button(toolbar, "Move", () => {
    layerSelection = selectedId;
    viewportMode("translate");
  });
  const rotate = button(toolbar, "Rotate", () => {
    layerSelection = selectedId;
    viewportMode("rotate");
  });
  button(toolbar, "Done", () => viewportMode(null));
  const dims = document.createElement("fieldset");
  const holes = document.createElement("fieldset");
  const dimensions = ["Width X (mm)", "Thickness Y (mm)", "Depth Z (mm)"].map((label) =>
    num(dims, label, 0),
  );
  const holeCount = document.createElement("select");
  options(
    holeCount,
    [0, 1, 2, 3, 4].map((n) => [String(n), String(n)]),
    "0",
  );
  field(holes, "Mounting holes", holeCount);
  const holeFields = Array.from({ length: 4 }, (_, i) => {
    const row = document.createElement("div");
    holes.append(row);
    return {
      row,
      x: num(row, `Hole ${i + 1} X (mm)`, 0),
      z: num(row, `Hole ${i + 1} Z (mm)`, 0),
      diameter: num(row, `Hole ${i + 1} diameter (mm)`, 0),
    };
  });
  function showHoles() {
    holeFields.forEach(({ row }, i) => {
      row.hidden = i >= Number(holeCount.value);
    });
  }
  holeCount.onchange = showHoles;
  form.append(dims, holes);
  field(form, "Attach to enclosure part", host);
  const position = ["X", "Y", "Z"].map((axis) => num(form, `Position ${axis} (mm)`, 0));
  const rotation = ["X", "Y", "Z"].map((axis) => num(form, `Rotation ${axis} (degrees)`, 0));
  const scale = num(form, "Size multiplier", 1);
  const opacity = num(form, "Opacity", 1);
  const visible = document.createElement("input");
  visible.type = "checkbox";
  field(form, "Visible", visible);
  function replace(record: ComponentReference) {
    const [valid] = validateComponents([record]);
    const list = records();
    list[list.findIndex((item) => item.id === valid.id)] = valid;
  }
  button(form, "Apply placement", () => {
    const record = current();
    const next: ComponentReference = {
      ...record,
      hostId: host.value || undefined,
      positionMm: position.map((input) => input.valueAsNumber) as ComponentReference["positionMm"],
      rotation: rotation.map((input) => input.valueAsNumber) as ComponentReference["rotation"],
      scale: scale.valueAsNumber,
      opacity: opacity.valueAsNumber,
      visible: visible.checked,
    };
    if (next.hostId !== record.hostId || next.positionMm[1] !== record.positionMm[1])
      delete next.gapMm;
    if (record.preset === "pcb") {
      next.dimensions = dimensions.map(
        (input) => input.valueAsNumber,
      ) as ComponentReference["positionMm"];
      next.holes = holeFields.slice(0, Number(holeCount.value)).map(({ x, z, diameter }) => ({
        x: x.valueAsNumber,
        z: z.valueAsNumber,
        diameter: diameter.valueAsNumber,
      }));
    }
    replace(next);
  });
  const gap = num(form, "Underside gap (mm)", 5);
  function snapHost() {
    const stack = editor().project.layerStack;
    const active = partOwner(stack, stack.activeLayerId);
    return hosts().find(({ id }) => id === host.value) ?? hosts().find(({ id }) => id === active);
  }
  const snap = button(form, "Snap to enclosure surface", () => {
    const record = current();
    const part = snapHost();
    if (!part) throw new Error("Select an enclosure base or lid.");
    replace({ ...record, hostId: part.id, gapMm: gap.valueAsNumber });
    status.textContent = `Snapped to ${part.name} with ${gap.valueAsNumber} mm clearance.`;
  });
  function remove(id: string) {
    const list = records();
    const index = list.findIndex((record) => record.id === id);
    if (blocked() || tools.pending || index < 0) return;
    if (!window.confirm(`Delete ${presetFor(list[index].preset).name} reference?`)) return;
    viewportMode(null);
    list.splice(index, 1);
    selectedId = layerSelection = "";
    sync(true);
  }
  button(form, "Delete reference…", () => remove(selectedId));
  const mounting = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = "Board mounting posts";
  mounting.append(legend);
  const outer = num(mounting, "Post diameter (mm)", 6);
  const bore = num(mounting, "Bore diameter (mm)", 2);
  const preview = button(mounting, "Preview mounting posts", async () => {
    if (tools.pending) return;
    const record = current();
    const part = hosts().find(({ id }) => id === record.hostId);
    if (!part) throw new Error("Snap this board to an enclosure base.");
    const definition = componentMounting(record, part, outer.valueAsNumber, bore.valueAsNumber);
    tools.editPart(part.id);
    previewOwner = record;
    await tools.stageFeature(definition);
    status.textContent = tools.feedback;
  });
  const confirm = button(mounting, "Create mounting posts", async () => {
    if (previewOwner !== current() || !tools.featureReady)
      throw new Error("Preview the posts first.");
    await tools.confirm();
    status.textContent = tools.feedback;
    previewOwner = undefined;
  });
  const cancel = button(mounting, "Cancel mounting preview", () => {
    tools.cancel();
    previewOwner = undefined;
    status.textContent = tools.feedback;
  });
  form.append(mounting);
  for (const input of [outer, bore])
    input.oninput = () => {
      if (previewOwner) tools.cancel();
      previewOwner = undefined;
    };

  function selectComponent(id: string) {
    selectedId = layerSelection = id;
    if (parent instanceof HTMLDetailsElement) parent.open = true;
    panel.open = true;
    sync(true);
  }

  function syncLayers(list: ComponentReference[]) {
    const entries = list.map(
      (item, index) =>
        [item.id, `${presetFor(item.preset).name} · ${index + 1}`, item.visible] as const,
    );
    const disabled = blocked();
    const key = JSON.stringify([entries, layerSelection, disabled]);
    if (key === layerKey) return;
    layerKey = key;
    group.hidden = entries.length === 0;
    const focused = (document.activeElement as HTMLElement | null)?.dataset.componentId;
    rows.replaceChildren(
      ...entries.map(([id, label, visible]) => {
        const row = document.createElement("div");
        row.className = `layer-row${id === layerSelection ? " active" : ""}`;
        const select = document.createElement("button");
        select.type = "button";
        select.className = "layer-select";
        select.textContent = visible ? label : `${label} · Hidden`;
        select.dataset.componentId = id;
        select.setAttribute("aria-pressed", String(id === layerSelection));
        select.disabled = disabled;
        select.onclick = () => {
          viewportMode(null);
          selectComponent(id);
          selected.scrollIntoView({ block: "nearest" });
        };
        row.append(select);
        return row;
      }),
    );
    if (focused)
      Array.from(rows.querySelectorAll("button"))
        .find((button) => button.dataset.componentId === focused)
        ?.focus();
  }

  let borePreset: ComponentPreset | undefined;
  function sync(force = false) {
    tools.sync();
    const id = editor().project.id;
    if (projectId !== id) {
      projectId = id;
      selectedId = layerSelection = "";
      previewOwner = undefined;
      status.textContent = "";
    }
    const list = records();
    if (!list.some((record) => record.id === layerSelection)) layerSelection = "";
    syncLayers(list);
    form.classList.toggle("is-selected", !!layerSelection);
    if (!list.some((record) => record.id === selectedId)) selectedId = list[0]?.id ?? "";
    const record = list.find((record) => record.id === selectedId);
    const available = hosts();
    if (previewOwner && previewOwner !== record) {
      tools.cancel();
      previewOwner = undefined;
    }
    snap.disabled = !snapHost();
    preview.disabled = confirm.disabled = cancel.disabled = tools.pending;
    confirm.disabled ||= !tools.featureReady;
    cancel.disabled = !previewOwner;
    insert.disabled = list.length >= COMPONENT_LIMIT;
    const key = JSON.stringify([list, selectedId, available.map(({ id, name }) => [id, name])]);
    if (!force && key === lastKey) return;
    lastKey = key;
    options(
      selected,
      list.map((item, i) => [item.id, `${presetFor(item.preset).name} · ${i + 1}`]),
      selectedId,
    );
    selected.disabled = !record;
    form.hidden = !record;
    if (!record) return;
    const preset = presetFor(record.preset);
    const [width, thickness, depth] = componentDimensions(record);
    metadata.textContent = `${[width, depth, thickness].map((size) => Number((size * record.scale).toFixed(3))).join(" × ")} mm · ${preset.verified}. ${preset.unspecified}.`;
    source.hidden = !preset.drawing;
    if (preset.drawing) {
      source.href = preset.drawing;
      source.title = [preset.manufacturer, preset.revision, preset.checked]
        .filter(Boolean)
        .join(" · ");
    }
    dims.hidden = holes.hidden = record.preset !== "pcb";
    dimensions.forEach((input, i) => {
      input.value = String([width, thickness, depth][i]);
    });
    holeCount.value = String(record.holes?.length ?? 0);
    showHoles();
    holeFields.forEach(({ x, z, diameter }, i) => {
      x.value = String(record.holes?.[i]?.x ?? 0);
      z.value = String(record.holes?.[i]?.z ?? 0);
      diameter.value = record.holes?.[i] ? String(record.holes[i].diameter) : "";
    });
    const hostOptions: [string, string][] = [
      ["", "Sculpture"],
      ...available.map((layer): [string, string] => [layer.id, layer.name]),
    ];
    if (record.hostId && !available.some(({ id }) => id === record.hostId))
      hostOptions.push([record.hostId, "Missing enclosure part · hidden"]);
    options(host, hostOptions, record.hostId ?? "");
    position.forEach((input, i) => {
      input.value = String(record.positionMm[i]);
    });
    rotation.forEach((input, i) => {
      input.value = String(record.rotation[i]);
    });
    scale.value = String(record.scale);
    opacity.value = String(record.opacity);
    visible.checked = record.visible;
    gap.value = String(record.gapMm ?? 5);
    snap.disabled = !snapHost();
    move.disabled = rotate.disabled =
      !record.visible || (!!record.hostId && !available.some(({ id }) => id === record.hostId));
    mounting.hidden = !["pi4", "pcb", "zero2"].includes(record.preset);
    if (borePreset !== record.preset) {
      borePreset = record.preset;
      bore.value = record.preset === "pi4" ? "2" : "";
    }
  }
  host.onchange = () => {
    snap.disabled = !snapHost();
  };
  sync();
  return {
    sync,
    get selectedId() {
      return selectedId;
    },
    select: selectComponent,
    deselect() {
      if (!layerSelection) return;
      layerSelection = "";
      sync();
    },
    get deletionTarget() {
      return layerSelection;
    },
    remove,
    clearance(text: string) {
      if (clearanceLabel.textContent !== text) clearanceLabel.textContent = text;
    },
  };
}
