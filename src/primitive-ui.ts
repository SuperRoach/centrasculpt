import { PRIMITIVE_KINDS, primitiveWorldDimensions } from "./parametric-primitive";
import { toDisplay } from "./physical-units";
import type { PrecisionField, PrecisionTools } from "./precision-tools";
import type { PrimitiveTools } from "./primitive-tools";
/** Contextual creation/editing controls; refresh never replaces an input being typed. */
export function primitiveUI(
  tools: PrimitiveTools,
  host: HTMLElement,
  busy: () => boolean,
  precision: PrecisionTools,
): { sync: () => void } {
  if (!tools.source) tools.editing = false;
  const panel = document.createElement("details");
  panel.className = "primitive-panel";
  const title = document.createElement("summary");
  title.textContent = "Primitives";
  panel.append(title);
  const body = document.createElement("div");
  body.className = "primitive-body";
  panel.append(body);
  const status = document.createElement("p");
  status.className = "primitive-status";
  status.setAttribute("role", "status");
  const buttons: HTMLButtonElement[] = [];
  const button = (
    parent: HTMLElement,
    label: string,
    action: () => void | Promise<void>,
    className = "",
  ) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.className = className;
    b.onclick = () => {
      if (busy() || tools.pending) return;
      void Promise.resolve()
        .then(() => {
          const work = action();
          sync();
          return work;
        })
        .then(sync)
        .catch((e) => {
          status.hidden = false;
          status.textContent = e instanceof Error ? e.message : String(e);
        });
    };
    parent.append(b);
    buttons.push(b);
    return b;
  };
  const modes = document.createElement("div");
  modes.className = "primitive-modes";
  modes.setAttribute("role", "group");
  modes.setAttribute("aria-label", "Primitive workflow");
  body.append(modes);
  const newMode = button(modes, "Create new", () => {
    tools.editing = false;
  });
  const editMode = button(modes, "Edit selected", () => {
    tools.editing = true;
  });
  const shapes = document.createElement("div");
  shapes.className = "primitive-shapes";
  shapes.setAttribute("role", "group");
  shapes.setAttribute("aria-label", "New primitive type");
  body.append(shapes);
  const icons = {
    box: '<path d="m16 3 12 7v13l-12 7-12-7V10Zm-12 7 12 7 12-7M16 17v13"/>',
    cylinder:
      '<ellipse cx="16" cy="7" rx="11" ry="4"/><path d="M5 7v18c0 5 22 5 22 0V7M5 25c0-5 22-5 22 0"/>',
    sphere:
      '<circle cx="16" cy="16" r="13"/><ellipse cx="16" cy="16" rx="6" ry="13"/><path d="M3 16c5 5 21 5 26 0"/>',
  };
  const shapeButtons = new Map<string, HTMLButtonElement>();
  for (const kind of PRIMITIVE_KINDS) {
    const b = button(shapes, kind[0].toUpperCase() + kind.slice(1), () => tools.select(kind));
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 32 32");
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = icons[kind];
    b.prepend(icon);
    shapeButtons.set(kind, b);
  }
  const heading = document.createElement("div");
  heading.className = "primitive-heading";
  const name = document.createElement("strong");
  const units = button(
    heading,
    "mm",
    () => {
      precision.activate("precision:unit");
    },
    "primitive-units",
  );
  units.title = "Change physical units: millimetres, centimetres or inches";
  heading.prepend(name);
  body.append(heading);
  const dimensions = document.createElement("fieldset");
  dimensions.className = "numeric-transform primitive-dimensions";
  body.append(dimensions);
  const result = document.createElement("p");
  result.className = "primitive-bounds";
  body.append(result);
  const create = button(body, "Create Box", () => tools.create(), "primitive-primary");
  create.title = "Create at model origin, then position with Transform or exact coordinates";
  const empty = document.createElement("p");
  empty.className = "primitive-note";
  empty.textContent = "Select a primitive in Layers to edit its dimensions.";
  body.append(empty);
  const transformPanel = document.createElement("details");
  transformPanel.className = "primitive-transform";
  const transformTitle = document.createElement("summary");
  transformTitle.textContent = "Position, rotation & scale";
  transformPanel.append(transformTitle);
  body.append(transformPanel);
  const transformInputs = new Map<PrecisionField, HTMLInputElement>();
  for (const [label, fields] of [
    ["Position", ["px", "py", "pz"]],
    ["Rotation · degrees", ["rx", "ry", "rz"]],
    ["Uniform scale", ["scale"]],
  ] as [string, PrecisionField[]][]) {
    const group = document.createElement("fieldset");
    group.className = "numeric-transform";
    const legend = document.createElement("legend");
    legend.textContent = label;
    group.append(legend);
    transformPanel.append(group);
    for (const field of fields) {
      const row = document.createElement("label"),
        input = document.createElement("input");
      const text = field === "scale" ? "Scale" : "XYZ"["xyz".indexOf(field[1])];
      row.textContent = text;
      input.type = "number";
      input.step = "any";
      input.setAttribute("aria-label", `Primitive ${label} ${text}`);
      input.onchange = () => {
        try {
          if (!input.value.trim()) throw new Error("Enter a value.");
          precision.apply(field, Number(input.value));
          sync();
        } catch (e) {
          status.hidden = false;
          status.textContent = String(e);
        }
      };
      input.onkeydown = (e) => {
        if (e.key === "Enter") input.blur();
        if (e.key === "Escape") {
          input.value = precision.value(field);
          input.blur();
        }
      };
      row.append(input);
      group.append(row);
      transformInputs.set(field, input);
    }
  }
  const sourceActions = document.createElement("div");
  sourceActions.className = "primitive-source-actions";
  body.append(sourceActions);
  const restore = button(
    sourceActions,
    "Restore initial dimensions",
    () => tools.restoreOriginal(),
    "primitive-restore",
  );
  restore.title = "Restore the dimensions saved when this primitive was created; supports Undo";
  const bake = button(sourceActions, "Bake to Sculpt Layer", () => tools.bake(), "primitive-bake");
  bake.title = "Create editable sculpt geometry and keep the parametric source; supports Undo";
  const note = document.createElement("p");
  note.className = "primitive-note";
  sourceActions.append(note);
  note.textContent =
    "Bake when you’re ready to sculpt, cut or paint. Your editable source is kept.";
  body.append(status);
  host.append(panel);
  let key = "";
  const sync = () => {
    const selected = tools.source,
      editing = tools.editing,
      source = selected ?? tools.draft,
      blocked = busy() || tools.pending;
    for (const b of buttons) b.disabled = blocked;
    editMode.disabled =
      blocked || !tools.layers().active.layer.primitive || !!tools.layers().selectedGroupId;
    editMode.title = "Select a primitive in Layers to edit its dimensions";
    newMode.setAttribute("aria-pressed", String(!editing));
    editMode.setAttribute("aria-pressed", String(editing));
    shapes.hidden = editing;
    dimensions.hidden = editing && !selected;
    heading.hidden = editing && !selected;
    empty.hidden = !editing || !!selected;
    create.hidden = editing;
    sourceActions.hidden = !selected;
    transformPanel.hidden = !selected;
    units.textContent = tools.settings.unit;
    name.textContent = selected ? tools.layers().active.layer.name : `New ${tools.draft.kind}`;
    for (const [kind, b] of shapeButtons)
      b.setAttribute("aria-pressed", String(tools.draft.kind === kind));
    create.textContent = `Create ${tools.draft.kind[0].toUpperCase() + tools.draft.kind.slice(1)}`;
    result.hidden = editing && !selected;
    result.textContent = selected
      ? `${primitiveWorldDimensions(selected, tools.layers().active.layer.transform)
          .map((v) => toDisplay(v, tools.settings).toFixed(2))
          .join(" × ")} ${tools.settings.unit} · physical bounds`
      : "Created at model origin · workspace zoom won’t change its size";
    result.title = selected
      ? "Model-axis bounds include rotation, scale and parent transforms. Dimension fields edit local source parameters."
      : "Use Transform or Edit selected to position your new primitive.";
    const editable = !!selected && tools.layers().active.layer.editable;
    bake.disabled = restore.disabled = blocked || !editable;
    for (const [field, input] of transformInputs) {
      if (document.activeElement !== input) input.value = precision.value(field);
      input.disabled = blocked || !editable;
    }
    status.textContent = tools.pending
      ? "Updating primitive…"
      : tools.feedback.startsWith("Choose a type") || tools.feedback.startsWith("Applied")
        ? ""
        : tools.feedback;
    status.hidden = !status.textContent;
    const next = JSON.stringify([
      source,
      selected ? tools.layers().active.layer.id : null,
      editing,
      tools.settings.unit,
      tools.settings.millimetresPerUnit,
      blocked,
      editable,
    ]);
    for (const input of dimensions.querySelectorAll("input"))
      input.disabled = blocked || (!!selected && !editable);
    if (next === key || dimensions.contains(document.activeElement)) return;
    key = next;
    dimensions.replaceChildren();
    const legend = document.createElement("legend");
    legend.textContent = "Dimensions";
    dimensions.append(legend);
    for (const [field, value] of Object.entries(source)) {
      if (field === "kind") continue;
      const row = document.createElement("label"),
        input = document.createElement("input");
      row.textContent = field[0].toUpperCase() + field.slice(1);
      input.type = "number";
      input.step = "any";
      input.value = toDisplay(Number(value), tools.settings).toString();
      input.setAttribute("aria-label", `${field} (${tools.settings.unit})`);
      input.disabled = blocked || (!!selected && !editable);
      input.onchange = () => {
        if (!input.value.trim()) {
          status.hidden = false;
          status.textContent = "Enter a dimension.";
          return;
        }
        const work = tools.dimension(field, Number(input.value), !!selected);
        sync();
        void work.then(sync).catch((e) => {
          status.hidden = false;
          status.textContent = String(e);
        });
      };
      input.onkeydown = (e) => {
        if (e.key === "Enter") input.blur();
        if (e.key === "Escape") {
          input.value = toDisplay(Number(value), tools.settings).toString();
          input.blur();
        }
      };
      row.append(input);
      dimensions.append(row);
    }
  };
  sync();
  return { sync };
}
