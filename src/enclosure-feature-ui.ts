import type { EnclosureControls } from "./enclosure-controls";
import { enclosureFeatureGuide } from "./enclosure-feature-guide";
import { type FeatureDefinition, featurePlan, WALL_ANCHORS } from "./enclosure-features";
import type { EnclosureViewportTarget } from "./enclosure-viewport-guide";

const WALL_NAMES = ["Front", "Right", "Back", "Left"];
/** Compact authoring surface over the shared staged recipe workflow. */
export function enclosureFeatureUI(
  tools: EnclosureControls,
  host: HTMLElement,
  refresh: () => void,
  busy: () => boolean,
  enclosureOpen: () => boolean,
) {
  const panel = document.createElement("details"),
    title = document.createElement("summary");
  panel.className = "enclosure-feature-panel";
  title.textContent = "Cutouts & mounting";
  panel.append(title);
  host.append(panel);
  const body = document.createElement("div");
  body.className = "enclosure-feature-body";
  panel.append(body);
  const intro = document.createElement("p");
  intro.className = "feature-hint";
  body.append(intro);
  const inputs: Record<string, HTMLInputElement | HTMLSelectElement> = {};
  const controls: (HTMLInputElement | HTMLSelectElement)[] = [];
  const rows: Record<string, HTMLElement> = {};
  function label(
    parent: HTMLElement,
    text: string,
    el: HTMLInputElement | HTMLSelectElement,
    key?: string,
  ) {
    const row = document.createElement("label"),
      caption = document.createElement("span");
    caption.textContent = text;
    row.append(caption, el);
    parent.append(row);
    controls.push(el);
    if (key) {
      inputs[key] = el;
      rows[key] = row;
    }
    return row;
  }
  function selectField(
    parent: HTMLElement,
    text: string,
    aria: string,
    options: [string, string][],
    key?: string,
  ) {
    const el = document.createElement("select");
    el.setAttribute("aria-label", aria);
    for (const [value, name] of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = name;
      el.append(option);
    }
    label(parent, text, el, key);
    return el;
  }
  function field(parent: HTMLElement, key: string, text: string, aria: string, value: string) {
    const el = document.createElement("input");
    el.type = "number";
    el.value = value;
    el.setAttribute("aria-label", aria);
    el.step = "any";
    label(parent, text, el, key);
    return el;
  }
  function section(text: string, unit = true) {
    const group = document.createElement("fieldset"),
      legend = document.createElement("legend"),
      grid = document.createElement("div");
    group.className = "enclosure-section";
    legend.textContent = text;
    if (unit) {
      const mm = document.createElement("span");
      mm.className = "enclosure-unit";
      mm.textContent = "mm";
      legend.append(mm);
    }
    grid.className = "enclosure-fields";
    group.append(legend, grid);
    body.append(group);
    return { group, grid };
  }
  const picker = document.createElement("div");
  picker.className = "feature-picker";
  body.append(picker);
  const selected = selectField(picker, "Feature", "Enclosure attachment", [["", "＋ New feature"]]);
  const kind = selectField(picker, "Type", "Feature kind", [
    ["cutout", "Wall cutout"],
    ["mounting", "Mounting posts"],
  ]);
  const placement = section("Placement", false);
  const face = selectField(
    placement.grid,
    "Wall",
    "Wall anchor",
    WALL_ANCHORS.map((anchor, i) => [anchor, WALL_NAMES[i]]),
    "anchor",
  );
  const shape = selectField(
    placement.grid,
    "Shape",
    "Opening shape",
    [
      ["rectangle", "Rectangle"],
      ["round", "Round"],
    ],
    "shape",
  );
  const edge = selectField(placement.grid, "Edge", "Opening edge", [
    ["straight", "Straight"],
    ["rounded", "Rounded corners"],
    ["tapered", "Tapered entrance"],
  ]);
  edge.parentElement?.classList.add("feature-wide-field");
  const guide = enclosureFeatureGuide((u, v) => {
    if (busy() || tools.pending) return;
    inputs.uMm.value = String(Math.round(u * 10) / 10);
    inputs.vMm.value = String(Math.round(v * 10) / 10);
    invalidate();
  });
  body.append(guide.canvas);
  const guideHint = document.createElement("p");
  guideHint.className = "feature-hint";
  body.append(guideHint);
  const position = section("Position");
  field(position.grid, "uMm", "Across wall", "U from wall centre (mm)", "0");
  field(position.grid, "vMm", "Above floor", "V above inside floor (mm)", "5");
  const opening = section("Opening");
  field(opening.grid, "widthMm", "Width", "Opening width / diameter (mm)", "4");
  field(opening.grid, "heightMm", "Height", "Opening height (mm)", "4");
  field(opening.grid, "cornerRadiusMm", "Corner radius", "Opening corner radius (mm)", "0.5");
  field(
    opening.grid,
    "outsideFlareMm",
    "Extra per outside edge",
    "Outside taper per edge (mm)",
    "0.5",
  );
  const posts = section("Post sizes");
  field(posts.grid, "outerDiameterMm", "Outside Ø", "Post outside diameter (mm)", "3");
  field(posts.grid, "boreDiameterMm", "Bore Ø", "Post bore diameter (mm)", "1.5");
  field(posts.grid, "heightPost", "Height", "Post height (mm)", "4");
  const centres = section("Mounting centres");
  const count = selectField(
    centres.grid,
    "Posts",
    "Number of mounting posts",
    [1, 2, 3, 4].map((n) => [String(n), String(n)]),
  );
  count.value = "4";
  const centreTable = document.createElement("div");
  centreTable.className = "feature-centres";
  centres.group.append(centreTable);
  const heading = document.createElement("div");
  heading.className = "feature-centre-row";
  for (const text of ["Post", "X", "Z"]) {
    const cell = document.createElement("span");
    cell.textContent = text;
    heading.append(cell);
  }
  centreTable.append(heading);
  const centreRows: HTMLElement[] = [];
  for (let i = 0; i < 4; i++) {
    const row = document.createElement("div");
    row.className = "feature-centre-row";
    const number = document.createElement("span");
    number.textContent = String(i + 1);
    row.append(number);
    field(row, `x${i}`, "X", `Post ${i + 1} X (mm)`, i % 2 ? "5" : "-5");
    field(row, `z${i}`, "Z", `Post ${i + 1} Z (mm)`, i < 2 ? "-4" : "4");
    centreTable.append(row);
    centreRows.push(row);
  }

  const advanced = document.createElement("details"),
    advancedTitle = document.createElement("summary"),
    advancedGrid = document.createElement("div");
  advanced.className = "feature-advanced";
  advancedTitle.textContent = "Advanced";
  advancedGrid.className = "enclosure-fields";
  advanced.append(advancedTitle, advancedGrid);
  body.append(advanced);
  field(advancedGrid, "insetMm", "Extra inward reach", "Extra inward traversal (mm)", "0");
  const advancedHint = document.createElement("p");
  advancedHint.className = "feature-hint";
  advancedHint.textContent =
    "mm beyond the automatic through-wall cutter. This does not create a blind pocket.";
  advanced.append(advancedHint);
  const actions = document.createElement("div");
  actions.className = "enclosure-actions";
  body.append(actions);
  const secondary = document.createElement("div");
  secondary.className = "feature-secondary";
  body.append(secondary);
  const buttons: HTMLButtonElement[] = [];
  function action(parent: HTMLElement, text: string, aria: string, fn: () => void | Promise<void>) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.setAttribute("aria-label", aria);
    parent.append(button);
    buttons.push(button);
    button.onclick = () => {
      try {
        void Promise.resolve(fn())
          .catch((e) => {
            tools.feedback = String(e);
          })
          .finally(() => {
            refresh();
            sync();
          });
      } catch (e) {
        tools.feedback = String(e);
      }
      refresh();
      sync();
    };
    return button;
  }
  function definition(): FeatureDefinition {
    const text = (key: string) => inputs[key].value;
    const n = (key: string) => {
      if (!text(key).trim()) throw new Error("Enter all dimensions in mm.");
      return Number(text(key));
    };
    const existing = cached.find(({ sourceIds }) => sourceIds[0] === selected.value);
    const name =
      existing?.definition.name ?? (kind.value === "mounting" ? "Mounting posts" : "Port");
    return kind.value === "cutout"
      ? {
          kind: "cutout",
          name,
          anchor: face.value as (typeof WALL_ANCHORS)[number],
          shape: shape.value as "rectangle" | "round",
          uMm: n("uMm"),
          vMm: n("vMm"),
          widthMm: n("widthMm"),
          heightMm: shape.value === "round" ? n("widthMm") : n("heightMm"),
          insetMm: n("insetMm"),
          ...(edge.value === "rounded" ? { cornerRadiusMm: n("cornerRadiusMm") } : {}),
          ...(edge.value === "tapered" ? { outsideFlareMm: n("outsideFlareMm") } : {}),
        }
      : {
          kind: "mounting",
          name,
          anchor: "enclosure.base.floor",
          centresMm: Array.from(
            { length: Number(count.value) },
            (_, i) => [n(`x${i}`), n(`z${i}`)] as [number, number],
          ),
          outerDiameterMm: n("outerDiameterMm"),
          boreDiameterMm: n("boreDiameterMm"),
          heightMm: n("heightPost"),
          floorOffsetMm: 0,
        };
  }
  const preview = action(actions, "Preview", "Preview attachment", () =>
    tools.stageFeature(definition(), selected.value || undefined),
  );
  const apply = action(actions, "Add feature", "Apply attachment", () =>
    tools.featureReady
      ? tools.confirm()
      : tools.saveFeature(definition(), selected.value || undefined),
  );
  const cancel = action(secondary, "Cancel preview", "Cancel attachment preview", () =>
    tools.cancel(),
  );
  let removing = false;
  const remove = action(secondary, "Remove feature…", "Preview removal", async () => {
    removing = true;
    await tools.stageFeature(undefined, selected.value);
  });
  remove.className = "feature-remove";
  const feedback = document.createElement("p");
  feedback.className = "feature-hint feature-association";
  feedback.setAttribute("role", "status");
  body.append(feedback);
  const invalidate = () => {
    removing = false;
    if (tools.featureReady) tools.cancel();
    refresh();
    sync();
  };
  for (const el of controls) if (el !== selected) el.oninput = invalidate;
  function visibility() {
    const mounting = kind.value === "mounting",
      round = shape.value === "round";
    for (const group of [placement.group, position.group, opening.group, advanced])
      group.hidden = mounting;
    posts.group.hidden = centres.group.hidden = !mounting;
    rows.heightMm.hidden = round;
    rows.widthMm.querySelector("span")!.textContent = round ? "Diameter" : "Width";
    for (const [i, row] of centreRows.entries()) row.hidden = i >= Number(count.value);
    kind.parentElement!.hidden = !!selected.value;
    const rounded = edge.querySelector<HTMLOptionElement>('[value="rounded"]');
    if (rounded) rounded.disabled = round;
    if (round && edge.value === "rounded") edge.value = "straight";
    rows.cornerRadiusMm.hidden = edge.value !== "rounded";
    rows.outsideFlareMm.hidden = edge.value !== "tapered";
    guideHint.textContent = mounting
      ? "Match the numbered posts to your board measurements. X and Z start at the floor centre."
      : edge.value === "tapered"
        ? "Click the wall to place the opening. Width and height are measured at the inside face."
        : "Click the wall to place the opening, or enter its position below.";
  }
  const defaults = new Map(
    controls.filter((control) => control !== selected).map((control) => [control, control.value]),
  );
  const reset = () => {
    for (const [control, value] of defaults) control.value = value;
  };
  let selectedDefinition: string | undefined;
  function loadFeature(feature: EnclosureControls["attachments"][number] | undefined) {
    removing = false;
    selectedDefinition = feature && JSON.stringify(feature.definition);
    if (tools.featureReady) tools.cancel();
    reset();
    if (feature) {
      const d = feature.definition;
      kind.value = d.kind;
      for (const [key, value] of Object.entries(d)) {
        const input = inputs[key === "heightMm" && d.kind === "mounting" ? "heightPost" : key];
        if (input) input.value = String(value);
      }
      if (d.kind === "cutout")
        edge.value = d.outsideFlareMm ? "tapered" : d.cornerRadiusMm ? "rounded" : "straight";
      if (d.kind === "mounting") {
        count.value = String(d.centresMm.length);
        for (const [i, c] of d.centresMm.entries()) {
          inputs[`x${i}`].value = String(c[0]);
          inputs[`z${i}`].value = String(c[1]);
        }
      }
    }
  }
  selected.onchange = () => {
    loadFeature(cached.find((feature) => feature.sourceIds[0] === selected.value));
    refresh();
    sync();
  };
  let previousSelection: string | undefined;
  let previousBase: string | undefined;
  let previousProject: object | undefined;
  let signature = "",
    cached: EnclosureControls["attachments"] = [];
  function sync() {
    const editor = tools.layers();
    const selection = editor.project.activeLayerId;
    const followSelection =
      enclosureOpen() &&
      !busy() &&
      !tools.pending &&
      !editor.selectedGroupId &&
      (previousSelection !== selection || previousProject !== editor.project);
    if (followSelection) tools.openSelected(true);
    const pair = tools.selectedPair;
    if (previousBase !== pair?.base || previousProject !== editor.project) {
      previousBase = pair?.base;
      previousProject = editor.project;
      removing = false;
      cached = [];
      signature = "";
      selected.value = "";
      reset();
    }
    const base = pair && editor.project.layerStack.layers.find((layer) => layer.id === pair.base);
    let features = cached;
    let attachmentsReady = false;
    try {
      features = tools.attachments;
      cached = features;
      attachmentsReady = true;
    } catch {
      /* Retain the picker during preparation. */
    }
    const options = features.map(({ sourceIds: [id], definition }) => ({
      id,
      name:
        editor.project.layerStack.layers.find((layer) => layer.id === id)?.name ?? definition.name,
    }));
    const next = JSON.stringify([features, options]);
    if (next !== signature) {
      signature = next;
      const id = selected.value;
      const previous = selectedDefinition;
      const current = features.find((feature) => feature.sourceIds[0] === id);
      if (current && previous !== JSON.stringify(current.definition)) loadFeature(current);
      selected.replaceChildren();
      const fresh = document.createElement("option");
      fresh.value = "";
      fresh.textContent = "＋ New feature";
      selected.append(fresh);
      for (const { id, name } of options) {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = name;
        selected.append(option);
      }
      selected.value = features.some((f) => f.sourceIds[0] === id) ? id : "";
    }
    if (followSelection && attachmentsReady) {
      previousSelection = selection;
      const feature = features.find(({ sourceIds }) => sourceIds.includes(selection));
      if (feature) {
        panel.open = true;
        if (feature.sourceIds[0] !== selected.value) {
          selected.value = feature.sourceIds[0];
          loadFeature(feature);
        }
      }
    }
    const disabled = busy() || tools.pending || !base;
    body.dataset.bound = String(!!base);
    intro.textContent = base
      ? `Editing ${base.name}`
      : "Select an enclosure base or lid in Layers, then open Cutouts & mounting.";
    for (const el of [...controls, ...buttons]) el.disabled = disabled;
    cancel.disabled = false;
    const ready = tools.featureReady;
    cancel.hidden = !ready && !tools.pending;
    remove.hidden = !selected.value;
    apply.textContent =
      removing && ready ? "Remove feature" : selected.value ? "Save feature" : "Add feature";
    apply.classList.add("enclosure-primary");
    preview.textContent = "Preview in 3D";
    visibility();
    if (base && panel.open) {
      const parameters = base.assemblyPart?.enclosure?.parameters ?? tools.parameters;
      let issue = "";
      try {
        const feature = definition();
        try {
          featurePlan(parameters, feature);
        } catch (error) {
          issue = error instanceof Error ? error.message : String(error);
        }
        guide.draw(parameters, feature, !issue, !disabled);
        guide.canvas.hidden = false;
      } catch (error) {
        issue = error instanceof Error ? error.message : String(error);
        guide.canvas.hidden = true;
      }
      feedback.textContent = tools.pending || ready ? tools.feedback : issue || tools.feedback;
      apply.disabled ||= !!issue && !(removing && ready);
      preview.disabled ||= !!issue;
    }
  }
  panel.ontoggle = () => {
    if (panel.open) previousSelection = undefined;
    refresh();
    sync();
  };
  sync();
  return {
    sync,
    focusSelected() {
      const active = tools.layers().project.activeLayerId;
      if (
        !panel.open ||
        selected.disabled ||
        !cached.some(
          ({ sourceIds }) => sourceIds[0] === selected.value && sourceIds.includes(active),
        )
      )
        return false;
      selected.focus();
      return true;
    },
    viewportTarget(): EnclosureViewportTarget | undefined {
      if (!panel.open || !enclosureOpen() || busy()) return;
      const editor = tools.layers();
      const base = editor.project.layerStack.layers.find((layer) => layer.id === previousBase);
      if (!base?.visible || previousProject !== editor.project) return;
      const feature = cached.find(({ sourceIds }) => sourceIds[0] === selected.value);
      const active = editor.project.activeLayerId;
      const sourceId = feature?.sourceIds.includes(active) ? active : feature?.sourceIds[0];
      const source = editor.project.layerStack.layers.find((layer) => layer.id === sourceId);
      return {
        base,
        selected: source,
      };
    },
    panel,
    followLayerSelection: () => {
      previousSelection = undefined;
    },
  };
}
