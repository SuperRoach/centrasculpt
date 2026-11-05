import { radialGap } from "./array-spacing";
import type { ModellingCommand } from "./modelling-api";
import type { ArrayDefinition } from "./object-array";
import type { PrimitiveSource } from "./parametric-primitive";
import { PRIMITIVE_KINDS, primitiveWorldDimensions } from "./parametric-primitive";
import { toDisplay } from "./physical-units";
import type { PrecisionField, PrecisionTools } from "./precision-tools";
import type { PrimitiveTools } from "./primitive-tools";
import { uniformScale } from "./transform";
/** Contextual creation/editing controls; refresh never replaces an input being typed. */
export function primitiveUI(
  tools: PrimitiveTools,
  host: HTMLElement,
  busy: () => boolean,
  precision: PrecisionTools,
  runArrayCommand?: (command: ModellingCommand) => Promise<void>,
  preview?: {
    state: (open: boolean, editing: boolean) => void;
    source: () => PrimitiveSource | undefined;
  },
): { sync: () => void } {
  if (!tools.source) tools.editing = false;
  const panel = document.createElement("details");
  panel.className = "primitive-panel";
  const title = document.createElement("summary");
  title.textContent = "Primitives";
  panel.append(title);
  panel.ontoggle = () => {
    preview?.state(panel.open, tools.editing);
    sync();
  };
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
  const repeat = document.createElement("details");
  repeat.className = "primitive-transform array-panel";
  const repeatTitle = document.createElement("summary");
  repeatTitle.textContent = "Array / Repeat";
  repeat.append(repeatTitle);
  const repeatForm = document.createElement("div");
  repeatForm.className = "numeric-transform";
  repeat.append(repeatForm);
  const kind = document.createElement("select");
  kind.setAttribute("aria-label", "Array type");
  for (const [value, label] of [
    ["linear", "Linear"],
    ["radial", "Radial"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    kind.append(option);
  }
  repeatForm.append(kind);
  const fields = new Map<string, HTMLInputElement>();
  const field = (key: string, label: string, value: string, step = "any") => {
    const row = document.createElement("label"),
      input = document.createElement("input");
    row.textContent = label;
    input.type = "number";
    input.step = step;
    input.value = value;
    input.setAttribute("aria-label", label);
    row.append(input);
    repeatForm.append(row);
    fields.set(key, input);
    return input;
  };
  field("count", "Count", "4", "1");
  field("scale", "Scale per item (%)", "100");
  field("spacing", "Spacing (mm)", "10");
  const gapInput = field("gap", "Gap between copies (mm)", "10");
  let gapEdited = false;
  gapInput.oninput = () => {
    gapEdited = true;
  };
  gapInput.title =
    "Gap between projected source bounds. Adjusts the circle centre and keeps the original object fixed.";
  field("angle", "Total angle (degrees)", "360");
  field("offset", "Angular offset (degrees)", "0");
  const axis = document.createElement("select");
  axis.setAttribute("aria-label", "Array axis");
  for (const value of ["x", "y", "z"]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = `Axis ${value.toUpperCase()}`;
    axis.append(option);
  }
  repeatForm.append(axis);
  for (const [i, value] of ["0", "0", "0"].entries())
    field(`pivot${i}`, `Pivot ${"XYZ"[i]} (mm)`, value);
  const centered = document.createElement("input");
  centered.type = "checkbox";
  centered.setAttribute("aria-label", "Centre linear distribution");
  const centeredLabel = document.createElement("label");
  centeredLabel.append(centered, " Centre linear distribution");
  repeatForm.append(centeredLabel);
  const orientation = document.createElement("select");
  orientation.setAttribute("aria-label", "Radial orientation");
  for (const [value, label] of [
    ["rotate", "Rotate with array"],
    ["retain", "Keep object orientation"],
  ]) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    orientation.append(option);
  }
  repeatForm.append(orientation);
  const syncArrayKind = () => {
    const radial = kind.value === "radial";
    for (const key of ["angle", "offset", "pivot0", "pivot1", "pivot2", "gap"])
      fields.get(key)!.parentElement!.hidden = !radial;
    fields.get("spacing")!.parentElement!.hidden = radial;
    centeredLabel.hidden = radial;
    orientation.hidden = !radial;
  };
  kind.onchange = syncArrayKind;
  const repeatButtons = document.createElement("div");
  repeatButtons.className = "primitive-source-actions array-actions";
  repeat.append(repeatButtons);
  const repeatAction = (label: string, action: () => Promise<void>) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.onclick = () =>
      void action()
        .then(sync)
        .catch((e) => {
          status.hidden = false;
          status.textContent = e instanceof Error ? e.message : String(e);
        });
    repeatButtons.append(b);
    return b;
  };
  const applyArray = repeatAction("Create array", async () => {
    if (!runArrayCommand) throw new Error("Array commands are unavailable.");
    const layer = tools.layers().active.layer,
      count = Number(fields.get("count")!.value),
      axisName = axis.value,
      axisVector: [number, number, number] =
        axisName === "x" ? [1, 0, 0] : axisName === "y" ? [0, 1, 0] : [0, 0, 1],
      existing = layer.array;
    let definition: ArrayDefinition;
    if (kind.value === "linear")
      definition = {
        id: existing?.id ?? "pending",
        kind: "linear",
        enabled: true,
        count,
        scalePerItem: Number(fields.get("scale")!.value) / 100,
        spacingModelUnits: Number(fields.get("spacing")!.value),
        axis: axisVector,
        centered: centered.checked,
      };
    else
      definition = {
        id: existing?.id ?? "pending",
        kind: "radial",
        enabled: true,
        count,
        scalePerItem: Number(fields.get("scale")!.value) / 100,
        totalAngleRadians: (Number(fields.get("angle")!.value) * Math.PI) / 180,
        pivot: [
          Number(fields.get("pivot0")!.value),
          Number(fields.get("pivot1")!.value),
          Number(fields.get("pivot2")!.value),
        ],
        axis: axisVector,
        angularOffsetRadians: (Number(fields.get("offset")!.value) * Math.PI) / 180,
        orientation: orientation.value as "rotate" | "retain",
      };
    if (definition.kind === "radial" && (gapEdited || !existing) && count > 1) {
      const mm = tools.settings.millimetresPerUnit,
        inheritedScale =
          uniformScale(tools.layers().project.layerStack.hierarchy.world(layer.id)) /
          uniformScale(layer.transform),
        local = {
          ...definition,
          pivot: definition.pivot.map((v) => v / mm) as [number, number, number],
        };
      definition.pivot = radialGap(
        local,
        layer.transform,
        layer.volume.bounds,
        layer.primitive,
        Number(gapInput.value) / mm / inheritedScale,
      ).pivot.map((v) => v * mm) as [number, number, number];
    }
    if (existing) await runArrayCommand({ type: "array.update", id: layer.id, definition });
    else {
      const { id: _id, ...newDefinition } = definition;
      await runArrayCommand({ type: "array.create", id: layer.id, definition: newDefinition });
    }
  });
  const toggleArray = repeatAction("Array enabled", async () => {
    if (!runArrayCommand) throw new Error("Array commands are unavailable.");
    const layer = tools.layers().active.layer,
      a = layer.array;
    if (!a) throw new Error("Create an array first.");
    const definition = structuredClone(a);
    definition.enabled = !a.enabled;
    if (definition.kind === "linear")
      definition.spacingModelUnits *= tools.settings.millimetresPerUnit;
    else
      definition.pivot = definition.pivot.map((v) => v * tools.settings.millimetresPerUnit) as [
        number,
        number,
        number,
      ];
    await runArrayCommand({ type: "array.update", id: layer.id, definition });
  });
  const removeArray = repeatAction("×", async () => {
    const layer = tools.layers().active.layer;
    if (!runArrayCommand) throw new Error("Array commands are unavailable.");
    await runArrayCommand({ type: "array.remove", id: layer.id });
  });
  removeArray.className = "array-remove";
  removeArray.title = "Remove array";
  removeArray.setAttribute("aria-label", "Remove array");
  toggleArray.className = "array-toggle";
  const bakeArray = repeatAction("Bake to Independent Sculpt", async () => {
    const layer = tools.layers().active.layer;
    if (!runArrayCommand) throw new Error("Array commands are unavailable.");
    await runArrayCommand({ type: "array.bake", id: layer.id });
  });
  body.append(repeat);
  host.append(panel);
  let key = "",
    arrayKey = "",
    project = tools.layers().project;
  const sync = () => {
    if (project !== tools.layers().project) {
      project = tools.layers().project;
      panel.open = false;
    }
    if (panel.open && tools.editing && !tools.source) tools.editing = false;
    const selected = tools.source,
      editing = tools.editing,
      source = (selected && preview?.source()) ?? selected ?? tools.draft,
      blocked = busy() || tools.pending;
    preview?.state(panel.open, editing);
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
    repeat.hidden = !tools.layers().active.layer || !!tools.layers().selectedGroupId;
    const activeArray = tools.layers().active.layer.array;
    const layer = tools.layers().active.layer,
      nextArrayKey = JSON.stringify([
        tools.layers().project.id,
        layer.id,
        activeArray,
        layer.transform,
        layer.primitive,
        tools.settings.millimetresPerUnit,
      ]);
    if (nextArrayKey !== arrayKey) {
      arrayKey = nextArrayKey;
      gapEdited = false;
      if (activeArray) {
        kind.value = activeArray.kind;
        fields.get("count")!.value = String(activeArray.count);
        fields.get("scale")!.value = String((activeArray.scalePerItem ?? 1) * 100);
        fields.get("spacing")!.value =
          activeArray.kind === "linear"
            ? String(activeArray.spacingModelUnits * tools.settings.millimetresPerUnit)
            : "10";
        fields.get("angle")!.value =
          activeArray.kind === "radial"
            ? String((activeArray.totalAngleRadians * 180) / Math.PI)
            : "360";
        fields.get("offset")!.value =
          activeArray.kind === "radial"
            ? String((activeArray.angularOffsetRadians * 180) / Math.PI)
            : "0";
        axis.value = activeArray.axis[0] !== 0 ? "x" : activeArray.axis[1] !== 0 ? "y" : "z";
        if (activeArray.kind === "radial")
          activeArray.pivot.forEach((v, i) => {
            fields.get(`pivot${i}`)!.value = String(v * tools.settings.millimetresPerUnit);
          });
        centered.checked = activeArray.kind === "linear" && activeArray.centered;
        orientation.value = activeArray.kind === "radial" ? activeArray.orientation : "rotate";
        if (activeArray.kind === "radial") {
          const inheritedScale =
            uniformScale(tools.layers().project.layerStack.hierarchy.world(layer.id)) /
            uniformScale(layer.transform);
          gapInput.value = String(
            Number(
              Math.max(
                0,
                radialGap(activeArray, layer.transform, layer.volume.bounds, layer.primitive).gap *
                  tools.settings.millimetresPerUnit *
                  inheritedScale,
              ).toFixed(6),
            ),
          );
        }
      }
      syncArrayKind();
    }
    applyArray.textContent = activeArray ? "Update array" : "Create array";
    for (const control of [
      kind,
      axis,
      centered,
      orientation,
      ...fields.values(),
      applyArray,
      toggleArray,
      removeArray,
      bakeArray,
    ])
      control.disabled = blocked || !tools.layers().active.layer.editable;
    if (kind.value === "radial" && Number(fields.get("count")!.value) < 2) gapInput.disabled = true;
    toggleArray.hidden = !activeArray;
    toggleArray.textContent = activeArray?.enabled ? "Array enabled" : "Array disabled";
    toggleArray.setAttribute("aria-pressed", String(!!activeArray?.enabled));
    toggleArray.title = activeArray?.enabled ? "Disable array" : "Enable array";
    removeArray.hidden = !activeArray;
    bakeArray.hidden = !activeArray;
    transformPanel.hidden = !selected;
    units.textContent = tools.settings.unit;
    name.textContent = selected ? tools.layers().active.layer.name : `New ${tools.draft.kind}`;
    for (const [kind, b] of shapeButtons)
      b.setAttribute("aria-pressed", String(tools.draft.kind === kind));
    create.textContent = `Create ${tools.draft.kind[0].toUpperCase() + tools.draft.kind.slice(1)}`;
    result.hidden = editing && !selected;
    result.textContent = selected
      ? `${primitiveWorldDimensions(source, tools.layers().active.layer.transform)
          .map((v) => toDisplay(v, tools.settings).toFixed(2))
          .join(" × ")} ${tools.settings.unit} · physical bounds`
      : `${source.kind === "box" ? "X width · Y height · Z depth" : source.kind === "cylinder" ? "X/Z diameter · Y height" : "Any axis changes diameter"} · drag handles to size, then Create`;
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
      activeArray,
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
      if (!selected)
        input.oninput = () => {
          const dimension = Number(input.value);
          if (!input.value.trim() || !Number.isFinite(dimension) || dimension <= 0) return;
          void tools
            .dimension(field, dimension, false)
            .then(sync)
            .catch(() => {});
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
