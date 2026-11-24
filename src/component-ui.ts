import type { Raycaster } from "three";
import { partOwner } from "./assembly";
import {
  componentOpening,
  type OpeningMeasurements,
  openingIsStale,
  pickComponentWall,
  suggestedOpeningWall,
} from "./component-openings";
import {
  COMPONENT_LIMIT,
  COMPONENT_PRESETS,
  type ComponentPreset,
  type ComponentReference,
  componentDimensions,
  type FunctionalFeature,
  functionalFeatures,
  presetFor,
} from "./component-references";
import { componentMounting } from "./component-view";
import type { EnclosureControls } from "./enclosure-controls";
import { WALL_ANCHORS, type WallAnchor } from "./enclosure-features";
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
  function button(
    parent: HTMLElement,
    name: string,
    action: () => void | Promise<void>,
    allowPending = false,
  ) {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = name;
    el.onclick = async () => {
      if (blocked() || (tools.pending && !allowPending)) return;
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
    editor().replaceComponentReferences([...records(), added]);
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
    editor().replaceComponentReferences(
      records().map((item) => (item.id === record.id ? record : item)),
    );
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
    editor().replaceComponentReferences(list.filter((item) => item.id !== id));
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

  const openings = document.createElement("fieldset");
  const openingLegend = document.createElement("legend");
  openingLegend.textContent = "Connector and button openings";
  const fit = document.createElement("p");
  const connectorDrawing = document.createElement("a");
  connectorDrawing.textContent = "Connector drawing";
  connectorDrawing.target = "_blank";
  connectorDrawing.rel = "noopener";
  connectorDrawing.hidden = true;
  openings.append(openingLegend, fit, connectorDrawing);
  form.append(openings);
  const featureChoice = document.createElement("select");
  field(openings, "Functional feature", featureChoice);
  const facing = document.createElement("select");
  options(
    facing,
    [
      ["front", "+Z"],
      ["right", "+X"],
      ["back", "−Z"],
      ["left", "−X"],
      ["top", "+Y"],
      ["bottom", "−Y"],
    ],
    "front",
  );
  field(openings, "Generic outward axis", facing);
  const walls = document.createElement("select");
  options(
    walls,
    [
      ["", "Propose from functional axis"],
      ...WALL_ANCHORS.map((id): [string, string] => [id, id.split(".").at(-1)!]),
    ],
    "",
  );
  field(openings, "Target base wall", walls);
  const shape = document.createElement("select");
  options(
    shape,
    [
      ["rectangle", "Rectangular"],
      ["round", "Circular"],
    ],
    "rectangle",
  );
  field(openings, "Opening shape", shape);
  const blank = (parent: HTMLElement, label: string) => {
    const input = num(parent, label, 0);
    input.value = "";
    return input;
  };
  const centre = [
    blank(openings, "Functional face local X (mm)"),
    blank(openings, "Functional face local Y (mm)"),
    blank(openings, "Functional face local Z (mm)"),
  ];
  const width = blank(openings, "Measured envelope width or diameter (mm)");
  const height = blank(openings, "Measured envelope height (mm)");
  const horizontal = num(openings, "Horizontal or radial clearance per side (mm)", 0);
  const vertical = num(openings, "Vertical clearance per side (mm)", 0);
  const cable = num(openings, "Cable access allowance per side (mm)", 0);
  const travel = blank(openings, "Measured actuator travel (mm)");
  const usableDepth = blank(openings, "Usable inward actuator depth (mm)");
  const include = document.createElement("input");
  include.type = "checkbox";
  field(openings, "Include printable button plunger", include);
  const plungerFields = document.createElement("fieldset");
  openings.append(plungerFields);
  const cap = blank(plungerFields, "Cap diameter (mm)");
  const capHeight = blank(plungerFields, "Cap height (mm)");
  const shaft = blank(plungerFields, "Shaft diameter (mm)");
  const shaftLength = blank(plungerFields, "Shaft length (mm)");
  const capture = document.createElement("input");
  capture.type = "checkbox";
  field(plungerFields, "Captured button with separate retainer", capture);
  const retainerDiameter = blank(plungerFields, "Retainer diameter (mm)");
  const retainerThickness = blank(plungerFields, "Retainer thickness (mm)");
  const generated = document.createElement("fieldset");
  const generatedLegend = document.createElement("legend");
  generatedLegend.textContent = "Generated openings";
  const generatedRows = document.createElement("div");
  generated.append(generatedLegend, generatedRows);
  form.after(generated);
  let generatedKey = "";
  let updatingId: string | undefined;
  const owner = Symbol("component opening");
  let openingRecord: ComponentReference | undefined;
  let openingSelection = "";
  const generic: FunctionalFeature = {
    id: "generic",
    name: "Generic connector",
    type: "port",
    outward: [0, 0, 1],
    up: [0, 1, 0],
    confidence: "user-measured",
  };
  function chosenFeature(record: ComponentReference): FunctionalFeature {
    const feature = functionalFeatures(record.preset).find(
      (item) => item.id === featureChoice.value,
    );
    if (feature) return feature;
    const axis = facing.value;
    if (axis === "top" || axis === "bottom")
      return { ...generic, outward: [0, axis === "top" ? 1 : -1, 0], up: [0, 0, 1] };
    return {
      ...generic,
      outward:
        axis === "right"
          ? [1, 0, 0]
          : axis === "left"
            ? [-1, 0, 0]
            : [0, 0, axis === "front" ? 1 : -1],
    };
  }
  function openingFields() {
    const round = shape.value === "round";
    const actuator = featureChoice.value === "actuator";
    facing.parentElement!.hidden = featureChoice.value !== generic.id;
    height.parentElement!.hidden = vertical.parentElement!.hidden = round;
    cable.parentElement!.hidden = actuator;
    travel.parentElement!.hidden =
      usableDepth.parentElement!.hidden =
      include.parentElement!.hidden =
        !actuator;
    plungerFields.hidden = !actuator || !include.checked;
    retainerDiameter.parentElement!.hidden = retainerThickness.parentElement!.hidden =
      !capture.checked;
    const record = records().find(({ id }) => id === selectedId);
    const suggestion = record && suggestedOpeningWall(record, chosenFeature(record));
    walls.options[0].text = suggestion
      ? `Suggested ${suggestion.split(".").at(-1)} wall`
      : "Choose wall · no aligned axis";
  }
  function invalidateOpening() {
    if (openingRecord && (tools.ownsFeature(owner) || tools.pending)) tools.cancel();
    openingRecord = undefined;
    updatingId = undefined;
  }
  for (const input of openings.querySelectorAll("input, select")) {
    input.addEventListener("input", () => {
      cancelWallPick();
      invalidateOpening();
      fit.textContent = "Preview the opening to check its dimensions and wall fit.";
      openingFields();
      refreshOpeningButtons();
    });
  }
  function clearMeasurements() {
    walls.value = "";
    for (const input of [
      width,
      height,
      travel,
      usableDepth,
      ...centre,
      cap,
      capHeight,
      shaft,
      shaftLength,
    ])
      input.value = "";
    include.checked = capture.checked = false;
    retainerDiameter.value = retainerThickness.value = "";
    const record = records().find(({ id }) => id === selectedId);
    const preset = record && chosenFeature(record).measurements;
    connectorDrawing.hidden = !preset;
    if (preset) {
      connectorDrawing.href = preset.sourceUrl;
      centre[0].value = String(preset.centre[0]);
      centre[2].value = String(preset.centre[2]);
      width.value = String(preset.width);
      height.value = preset.height === undefined ? "" : String(preset.height);
    }
    fit.textContent = preset
      ? `${preset.model} · ${preset.revision}. Prefilled manufacturer nominal values are editable. Measure the blank fields from the underside centre, and allow for your cable and print fit.`
      : "Measure the functional face relative to the component origin at the underside centre.";
    openingFields();
  }
  featureChoice.addEventListener("change", () => {
    shape.value = featureChoice.value === "actuator" ? "round" : "rectangle";
    clearMeasurements();
  });
  async function previewOpening(
    record: ComponentReference,
    feature: FunctionalFeature,
    measurements: OpeningMeasurements,
    wall?: WallAnchor,
    attachmentId?: string,
  ) {
    cancelWallPick();
    invalidateOpening();
    const part = hosts().find(({ id }) => id === record.hostId);
    if (!part) throw new Error("Attach this component to an enclosure base.");
    const result = componentOpening(record, part, feature, measurements, wall, !!attachmentId);
    updatingId = attachmentId;
    const previous = part.assemblyPart?.enclosure?.features?.find(
      ({ sourceIds }) => sourceIds[0] === attachmentId,
    );
    if (previous) result.opening.name = previous.definition.name;
    tools.editPart(part.id);
    openingRecord = record;
    await tools.stageFeature(result.opening, attachmentId, false, {
      owner,
      envelope: result.envelope,
      plunger: result.plunger,
    });
    status.textContent = tools.feedback;
    if (openingRecord !== record || !tools.ownsFeature(owner)) return;
    if (attachmentId) applyOpening.scrollIntoView({ block: "nearest" });
    const { opening, depth, wallThickness } = result;
    const clearance =
      opening.shape === "round"
        ? `${result.horizontal} mm radial clearance`
        : `${result.horizontal} mm horizontal and ${result.vertical} mm vertical clearance per side`;
    fit.textContent = [
      result.plunger
        ? `${opening.association?.measurements.plunger?.length.toFixed(2)} mm fitted length from outside cap to actuator contact face.`
        : "",
      `${opening.anchor.split(".").at(-1)} wall · ${opening.widthMm.toFixed(2)} × ${opening.heightMm.toFixed(2)} mm opening · ${wallThickness} mm wall · ${depth.toFixed(2)} mm inside gap.`,
      `${clearance}.`,
      result.cable ? `${result.cable} mm extra cable allowance per side.` : "",
      result.travel ? `${result.travel} mm measured actuator travel.` : "",
      result.outwardPlay !== undefined
        ? `${result.outwardPlay.toFixed(2)} mm outward play past the resting actuator.`
        : "",
      "Amber shows the opening. Cyan shows the measured envelope.",
      result.plunger
        ? result.plunger.retainer
          ? "Violet shows the plunger. Pink shows the socketed retainer. Insert the shaft from outside, then bond the retainer to the shaft from inside before fitting the switch."
          : "Violet shows the plunger. The cap limits inward travel and can lift out."
        : "",
    ]
      .filter(Boolean)
      .join(" ");
  }
  const stageOpening = button(openings, "Preview opening in 3D", async () => {
    const record = current();
    const feature = chosenFeature(record);
    await previewOpening(
      record,
      feature,
      {
        centre: centre.map((input) => input.valueAsNumber) as ComponentReference["positionMm"],
        shape: shape.value === "round" ? "round" : "rectangle",
        width: width.valueAsNumber,
        height: height.valueAsNumber,
        horizontal: horizontal.valueAsNumber,
        vertical: vertical.valueAsNumber,
        cable: cable.valueAsNumber,
        travel: travel.valueAsNumber,
        usableDepth: usableDepth.valueAsNumber,
        plunger:
          feature.type === "button" && include.checked
            ? {
                diameter: cap.valueAsNumber,
                height: capHeight.valueAsNumber,
                shaft: shaft.valueAsNumber,
                length: shaftLength.valueAsNumber,
                retainer: capture.checked
                  ? {
                      diameter: retainerDiameter.valueAsNumber,
                      thickness: retainerThickness.valueAsNumber,
                    }
                  : undefined,
              }
            : undefined,
      },
      (walls.value || undefined) as WallAnchor | undefined,
    );
  });
  const applyOpening = button(openings, "Create connector opening", async () => {
    if (openingRecord !== current() || !tools.ownsFeature(owner))
      throw new Error("Preview this opening again after changing the component or enclosure.");
    await tools.confirm(owner);
    openingRecord = undefined;
    updatingId = undefined;
    status.textContent = tools.feedback;
  });
  const cancelOpening = button(
    openings,
    "Cancel opening preview",
    () => {
      invalidateOpening();
      status.textContent = "Opening preview cancelled.";
    },
    true,
  );
  let wallPickRecord: ComponentReference | undefined;
  function cancelWallPick() {
    if (!wallPickRecord) return false;
    wallPickRecord = undefined;
    refreshOpeningButtons();
    status.textContent = "Wall picking cancelled.";
    return true;
  }
  const pickWall = button(openings, "Pick wall in viewport", () => {
    if (cancelWallPick()) return;
    const record = current();
    const base = hosts().find(({ id }) => id === record.hostId);
    if (
      !base?.visible ||
      base.assemblyPart?.enclosure?.role !== "base" ||
      editor().viewMode !== "separate"
    )
      throw new Error("Attach to a visible enclosure base and switch to the separate layers view.");
    invalidateOpening();
    viewportMode(null);
    wallPickRecord = record;
    status.textContent = "Click a flat wall on the attached enclosure base. Escape cancels.";
  });
  openings.insertBefore(pickWall, stageOpening);
  function pickWallAt(ray: Raycaster) {
    if (!wallPickRecord || tools.pending || blocked()) return;
    const base = hosts().find(({ id }) => id === wallPickRecord?.hostId);
    const wall = base && pickComponentWall(ray, editor(), base);
    if (!wall) {
      status.textContent = "Click a visible flat wall on the attached enclosure base.";
      return;
    }
    wallPickRecord = undefined;
    walls.value = wall;
    refreshOpeningButtons();
    stageOpening.click();
  }
  function refreshOpeningButtons() {
    pickWall.textContent = wallPickRecord ? "Cancel wall picking" : "Pick wall in viewport";
    pickWall.disabled = tools.pending;
    pickWall.setAttribute("aria-pressed", String(!!wallPickRecord));
    stageOpening.disabled = tools.pending;
    applyOpening.disabled = tools.pending || !tools.ownsFeature(owner);
    cancelOpening.disabled = !openingRecord;
    applyOpening.textContent = updatingId
      ? "Apply updated opening"
      : featureChoice.value !== "actuator"
        ? "Create connector opening"
        : include.checked
          ? "Create opening and printable plunger"
          : "Create button opening";
  }

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
    if (
      openingRecord &&
      (openingRecord !== record ||
        !panel.open ||
        (parent instanceof HTMLDetailsElement && !parent.open))
    )
      invalidateOpening();
    if (
      wallPickRecord &&
      (wallPickRecord !== record ||
        !panel.open ||
        (parent instanceof HTMLDetailsElement && !parent.open) ||
        blocked())
    )
      cancelWallPick();
    refreshOpeningButtons();
    const openingKey = JSON.stringify([id, record?.id, record?.preset]);
    if (openingKey !== openingSelection) {
      openingSelection = openingKey;
      options(
        featureChoice,
        [
          ...(record ? functionalFeatures(record.preset) : []).map((feature): [string, string] => [
            feature.id,
            feature.name,
          ]),
          [generic.id, generic.name],
        ],
        functionalFeatures(record?.preset ?? "pcb")[0]?.id ?? generic.id,
      );
      shape.value = featureChoice.value === "actuator" ? "round" : "rectangle";
      clearMeasurements();
    }
    openingFields();
    const openingsForComponent = available.flatMap((part) =>
      (part.assemblyPart?.enclosure?.features ?? []).flatMap(({ definition, sourceIds }) => {
        if (definition.kind !== "cutout" || !definition.association) return [];
        const association = definition.association;
        const linked = list.find(({ id }) => id === association.componentId);
        if (linked && linked.id !== record?.id) return [];
        return [
          {
            part,
            definition,
            association,
            linked,
            id: sourceIds[0],
            stale: openingIsStale(association, linked, part),
          },
        ];
      }),
    );
    const nextGeneratedKey = JSON.stringify(
      openingsForComponent.map(({ id, stale, linked, definition, part }) => [
        id,
        stale,
        linked?.hostId,
        definition,
        part.name,
      ]),
    );
    if (generatedKey !== nextGeneratedKey) {
      generatedKey = nextGeneratedKey;
      generatedRows.replaceChildren();
      generated.hidden = !openingsForComponent.length;
      for (const { part, definition, association, linked, id, stale } of openingsForComponent) {
        const row = document.createElement("div");
        const message = document.createElement("p");
        message.textContent = `${definition.name} · ${part.name}${
          !linked
            ? " · Reference deleted"
            : stale
              ? linked.hostId !== part.id
                ? " · Opening is stale. The reference now belongs to a different part or the sculpture."
                : " · Opening is stale."
              : ""
        }`;
        row.append(message);
        generatedRows.append(row);
        if (stale && linked?.hostId === part.id && association.partId === part.id) {
          button(row, "Preview updated opening", async () => {
            const currentRecord = current();
            const feature = functionalFeatures(currentRecord.preset).find(
              ({ id }) => id === association.featureId,
            );
            await previewOpening(
              currentRecord,
              {
                ...(feature ?? generic),
                ...association.axes,
                id: association.featureId,
              },
              association.measurements,
              undefined,
              id,
            );
          });
        }
      }
    }
    if (previewOwner && previewOwner !== record) {
      tools.cancel();
      previewOwner = undefined;
    }
    snap.disabled = !snapHost();
    preview.disabled = confirm.disabled = cancel.disabled = tools.pending;
    confirm.disabled ||= !tools.featureReady || tools.componentFeatureReady;
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
  panel.addEventListener("toggle", () => {
    if (!panel.open) invalidateOpening();
  });
  if (parent instanceof HTMLDetailsElement)
    parent.addEventListener("toggle", () => {
      if (!parent.open) invalidateOpening();
    });
  host.onchange = () => {
    snap.disabled = !snapHost();
  };
  sync();
  return {
    sync,
    get pickingWall() {
      return !!wallPickRecord;
    },
    pickWallAt,
    cancelWallPick,
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
