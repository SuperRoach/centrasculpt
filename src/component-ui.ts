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
  blocked: () => boolean,
) {
  const panel = document.createElement("details");
  panel.className = "precision-settings";
  panel.id = "component-panel";
  panel.innerHTML =
    "<summary>3D Components</summary><p>Physical references for enclosure design. Dimensions use mm. References stay out of exports.</p>";
  parent.append(panel);
  const picker = document.createElement("select");
  const selected = document.createElement("select");
  const host = document.createElement("select");
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const form = document.createElement("div");
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
    selectedId = added.id;
  });
  field(panel, "Project component", selected);
  selected.onchange = () => {
    selectedId = selected.value;
    sync(true);
  };
  panel.append(form, status);
  form.append(metadata, source);
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
      diameter: num(row, `Hole ${i + 1} diameter (mm)`, 2.7),
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
  const snap = button(form, "Snap to enclosure surface", () => {
    const record = current();
    if (!hosts().some(({ id }) => id === record.hostId))
      throw new Error("Apply an enclosure attachment first.");
    replace({ ...record, gapMm: gap.valueAsNumber });
  });
  button(form, "Remove component", () => {
    const list = records();
    list.splice(list.indexOf(current()), 1);
    selectedId = "";
  });
  const mounting = document.createElement("fieldset");
  const legend = document.createElement("legend");
  legend.textContent = "Pi 4 mounting posts";
  mounting.append(legend);
  const outer = num(mounting, "Post diameter (mm)", 6);
  const bore = num(mounting, "Bore diameter (mm)", 2);
  const preview = button(mounting, "Preview mounting posts", async () => {
    if (tools.pending) return;
    const record = current();
    const part = hosts().find(({ id }) => id === record.hostId);
    if (!part) throw new Error("Attach this Pi 4 to an enclosure base.");
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

  function sync(force = false) {
    tools.sync();
    const id = editor().project.id;
    if (projectId !== id) {
      projectId = id;
      selectedId = "";
      previewOwner = undefined;
      status.textContent = "";
    }
    const list = records();
    if (!list.some((record) => record.id === selectedId)) selectedId = list[0]?.id ?? "";
    const record = list.find((record) => record.id === selectedId);
    const available = hosts();
    if (previewOwner && previewOwner !== record) {
      tools.cancel();
      previewOwner = undefined;
    }
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
    metadata.textContent = `${width} × ${depth} × ${thickness} mm · ${preset.verified}. ${preset.unspecified}.`;
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
      diameter.value = String(record.holes?.[i]?.diameter ?? 2.7);
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
    snap.disabled = !available.some(({ id }) => id === record.hostId);
    mounting.hidden = record.preset !== "pi4";
  }
  sync();
  return { sync };
}
