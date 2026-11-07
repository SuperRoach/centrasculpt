import type { EnclosureControls } from "./enclosure-controls";
import { type FeatureDefinition, WALL_ANCHORS } from "./enclosure-features";

const WALL_NAMES = ["Front", "Right", "Back", "Left"];
/** Compact authoring surface over the shared staged recipe workflow. */
export function enclosureFeatureUI(
  tools: EnclosureControls,
  host: HTMLElement,
  refresh: () => void,
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
  function field(
    parent: HTMLElement,
    key: string,
    text: string,
    aria: string,
    value: string,
    type = "number",
  ) {
    const el = document.createElement("input");
    el.type = type;
    el.value = value;
    el.setAttribute("aria-label", aria);
    if (type === "number") el.step = "any";
    else el.maxLength = 90;
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
  const name = field(body, "name", "Name", "Feature name", "Port", "text");
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
  const position = section("Position");
  field(position.grid, "uMm", "Across wall", "U from wall centre (mm)", "0");
  field(position.grid, "vMm", "Above floor", "V above inside floor (mm)", "5");
  const positionHint = document.createElement("p");
  positionHint.className = "feature-hint";
  positionHint.textContent = "Across is measured from the wall centre.";
  position.group.append(positionHint);
  const opening = section("Opening");
  field(opening.grid, "widthMm", "Width", "Opening width / diameter (mm)", "4");
  field(opening.grid, "heightMm", "Height", "Opening height (mm)", "4");
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
  const centreHint = document.createElement("p");
  centreHint.className = "feature-hint";
  centreHint.textContent = "From the inside floor centre. Use your own measured board centres.";
  centres.group.append(centreHint);
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
    return kind.value === "cutout"
      ? {
          kind: "cutout",
          name: name.value,
          anchor: face.value as (typeof WALL_ANCHORS)[number],
          shape: shape.value as "rectangle" | "round",
          uMm: n("uMm"),
          vMm: n("vMm"),
          widthMm: n("widthMm"),
          heightMm: shape.value === "round" ? n("widthMm") : n("heightMm"),
          insetMm: n("insetMm"),
        }
      : {
          kind: "mounting",
          name: name.value,
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
  const apply = action(actions, "Apply feature", "Apply attachment", () => tools.confirm());
  const cancel = action(secondary, "Cancel preview", "Cancel attachment preview", () =>
    tools.cancel(),
  );
  const remove = action(secondary, "Remove feature…", "Preview removal", () =>
    tools.stageFeature(undefined, selected.value),
  );
  remove.className = "feature-remove";
  const association = document.createElement("p");
  association.className = "feature-hint feature-association";
  body.append(association);
  const invalidate = () => {
    tools.cancel();
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
    association.textContent = mounting
      ? "Associated with the inside floor · follows enclosure edits."
      : `Associated with the ${WALL_NAMES[WALL_ANCHORS.indexOf(face.value as (typeof WALL_ANCHORS)[number])].toLowerCase()} wall · follows enclosure edits.`;
  }
  kind.onchange = () => {
    if (!selected.value) name.value = kind.value === "mounting" ? "Mounting posts" : "Port";
    invalidate();
  };
  selected.onchange = () => {
    tools.cancel();
    const feature = tools.attachments.find((f) => f.sourceIds[0] === selected.value);
    if (feature) {
      const d = feature.definition;
      kind.value = d.kind;
      for (const [key, value] of Object.entries(d)) {
        const input = inputs[key === "heightMm" && d.kind === "mounting" ? "heightPost" : key];
        if (input) input.value = String(value);
      }
      if (d.kind === "mounting") {
        count.value = String(d.centresMm.length);
        for (const [i, c] of d.centresMm.entries()) {
          inputs[`x${i}`].value = String(c[0]);
          inputs[`z${i}`].value = String(c[1]);
        }
      }
    }
    refresh();
    sync();
  };
  let signature = "",
    cached: EnclosureControls["attachments"] = [];
  function sync() {
    let features = cached;
    try {
      features = tools.attachments;
      cached = features;
    } catch {
      /* Retain the picker during preparation. */
    }
    const next = JSON.stringify(features);
    if (next !== signature) {
      signature = next;
      const id = selected.value;
      selected.replaceChildren();
      const fresh = document.createElement("option");
      fresh.value = "";
      fresh.textContent = "＋ New feature";
      selected.append(fresh);
      for (const feature of features) {
        const option = document.createElement("option");
        option.value = feature.sourceIds[0];
        option.textContent = feature.definition.name;
        selected.append(option);
      }
      selected.value = features.some((f) => f.sourceIds[0] === id) ? id : "";
    }
    const disabled = tools.pending || !tools.selectedPair;
    intro.textContent = tools.selectedPair
      ? "Add a wall opening or floor mounting posts. Sizes in mm."
      : "Select an enclosure above to add cutouts or mounting posts.";
    for (const el of [...controls, ...buttons]) el.disabled = disabled;
    cancel.disabled = false;
    cancel.hidden = !tools.featureReady && !tools.pending;
    remove.hidden = !selected.value;
    apply.disabled ||= !tools.featureReady;
    preview.classList.toggle("enclosure-primary", !tools.featureReady);
    apply.classList.toggle("enclosure-primary", tools.featureReady);
    visibility();
  }
  sync();
  return { sync };
}
