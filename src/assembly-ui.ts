import { type AssemblyControls, CONNECTOR_LABELS } from "./assembly-controls";
/** Progressive controls: checking fit is one action, followed by two scene/list taps. */
export function assemblyUI(
  tools: AssemblyControls,
  host: HTMLElement,
  busy: () => boolean,
  viewport?: HTMLElement,
): { sync: () => void } {
  const panel = document.createElement("details");
  panel.className = "assembly-panel";
  const title = document.createElement("summary");
  title.textContent = "Assembly";
  panel.append(title);
  host.append(panel);
  const buttons: HTMLButtonElement[] = [],
    inputs: HTMLInputElement[] = [],
    selects: HTMLSelectElement[] = [];
  const action = (parent: HTMLElement, label: string, id: string) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.dataset.assemblyAction = id;
    b.onclick = () => {
      void tools.run(id).then(sync);
      sync();
    };
    parent.append(b);
    buttons.push(b);
    return b;
  };
  const checkFit = action(panel, "Check fit", "pick-fit");
  checkFit.className = "assembly-primary";
  const preview = action(panel, "Show assembly preview", "preview");
  preview.onclick = () => {
    void tools.run(tools.layers().assemblyPreviewActive ? "end-preview" : "preview").then(sync);
    sync();
  };
  checkFit.onclick = () => {
    void tools
      .run(tools.picking || tools.checking || tools.generatingConnector ? "cancel" : "pick-fit")
      .then(sync);
    sync();
  };
  const pair = document.createElement("p");
  pair.className = "assembly-pair";
  panel.append(pair);
  const status = document.createElement("p");
  status.className = "assembly-status";
  status.setAttribute("role", "status");
  panel.append(status);
  const warning = document.createElement("p");
  warning.className = "assembly-warning";
  panel.append(warning);
  const disclosure = (label: string) => {
    const d = document.createElement("details"),
      s = document.createElement("summary");
    s.textContent = label;
    d.append(s);
    panel.append(d);
    return d;
  };
  const number = (parent: HTMLElement, label: string, key: string, value: number) => {
    const row = document.createElement("label"),
      input = document.createElement("input");
    row.textContent = label;
    input.dataset.assemblyField = key;
    input.type = "number";
    input.step = "any";
    input.value = String(value);
    input.setAttribute("aria-label", label);
    input.onchange = () => {
      const n = Number(input.value);
      if (input.value.trim() && Number.isFinite(n)) {
        tools.setField(key, n);
        sync();
      }
    };
    row.append(input);
    parent.append(row);
    inputs.push(input);
  };
  const options = disclosure("Fit settings & accuracy");
  number(options, "Desired gap (mm)", "clearanceMM", tools.clearanceMM);
  const accuracy = document.createElement("p");
  accuracy.textContent =
    "Approximate sampled check. Thin features and collisions can be missed; physical fit is not guaranteed.";
  options.append(accuracy);
  const resolution = document.createElement("p");
  options.append(resolution);
  const connector = disclosure("Peg & socket");
  const note = document.createElement("p");
  note.textContent =
    "Choose the peg layer, the socket layer, then tap the joint face. Half the peg sits inside its layer.";
  connector.append(note);
  for (const key of ["pegDiameterMM", "pegLengthMM", "radialClearanceMM"] as const)
    number(connector, CONNECTOR_LABELS[key] + " (mm)", key, tools.connector[key]);
  action(connector, "Place peg & socket", "place-connector");
  const sizing = document.createElement("p");
  connector.append(sizing);
  const placement = document.createElement("details"),
    placementTitle = document.createElement("summary");
  placementTitle.textContent = "Advanced sizes & numeric placement";
  placement.append(placementTitle);
  connector.append(placement);
  for (const key of ["socketDiameterMM", "socketDepthMM"] as const)
    number(placement, CONNECTOR_LABELS[key] + " (mm)", key, tools.connector[key]);
  action(placement, "Use matching socket sizes", "match-socket");
  for (const [i, a] of ["x", "y", "z"].entries()) {
    number(placement, `Connector position ${a} (mm)`, `p${a}`, tools.connector.positionMM[i]);
    number(placement, `Connector rotation ${a} (degrees)`, `r${a}`, 0);
  }
  action(placement, "Pick layers only", "pick-pair");
  action(placement, "Create at numeric position", "connector");
  const alignment = disclosure("Alignment");
  action(alignment, "Pick two layers", "pick-pair");
  const axis = document.createElement("select");
  axis.setAttribute("aria-label", "Assembly mate axis");
  for (const a of ["x", "y", "z"]) {
    const o = document.createElement("option");
    o.value = a;
    o.textContent = a.toUpperCase();
    axis.append(o);
  }
  axis.value = tools.axis;
  axis.onchange = () => {
    tools.axis = axis.value as typeof tools.axis;
  };
  alignment.append(axis);
  selects.push(axis);
  number(alignment, "Offset (mm)", "offsetMM", tools.offsetMM);
  const normal = document.createElement("label"),
    normalInput = document.createElement("input");
  normalInput.type = "checkbox";
  normalInput.onchange = () => {
    tools.matchNormal = normalInput.checked;
  };
  normal.append(normalInput, "Match opposite normals");
  alignment.append(normal);
  inputs.push(normalInput);
  for (const [label, id] of [
    ["Centres", "centres"],
    ["Bounding faces", "faces"],
    ["Axes", "axes"],
  ])
    action(alignment, label, id);
  const parts = disclosure("Parts & export");
  const partNote = document.createElement("p");
  partNote.textContent =
    "A printable part contains its root layer and children. Rename, move, hide and lock it in Layers.";
  parts.append(partNote);
  for (const [label, id] of [
    ["Make selected layer a printable part", "define"],
    ["Assign selected to first part", "assign"],
    ["Detach selected layer", "detach"],
    ["Remove first part boundary", "remove"],
  ])
    action(parts, label, id);
  const quality = document.createElement("select");
  quality.setAttribute("aria-label", "Assembly STL quality");
  for (const [value, label] of [
    ["fast", "Fast"],
    ["standard", "Standard"],
    ["high", "High"],
  ]) {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    quality.append(o);
  }
  quality.onchange = () => {
    tools.exportQuality = quality.value as typeof tools.exportQuality;
  };
  parts.append(quality);
  selects.push(quality);
  action(parts, "Export first part STL", "export");
  action(parts, "Export visible parts separately", "export-all");
  const card = document.createElement("div");
  card.className = "assembly-fit-card";
  card.hidden = true;
  const heading = document.createElement("strong");
  heading.textContent = "Check fit";
  const cardPair = document.createElement("p"),
    cardStatus = document.createElement("p"),
    cardWarning = document.createElement("p");
  cardStatus.setAttribute("role", "status");
  cardStatus.setAttribute("aria-live", "polite");
  cardWarning.className = "assembly-warning";
  card.append(heading, cardPair, cardStatus, cardWarning);
  const cancel = action(card, "Cancel", "cancel");
  cancel.onclick = () => {
    void tools
      .run(tools.picking || tools.checking || tools.generatingConnector ? "cancel" : "dismiss")
      .then(sync);
  };
  viewport?.append(card);
  const text = (node: HTMLElement, value: string) => {
    if (node.textContent !== value) node.textContent = value;
  };
  function sync(): void {
    tools.sync();
    preview.hidden = !tools.parts.length;
    text(
      preview,
      tools.layers().assemblyPreviewActive ? "Show source layers" : "Show assembly preview",
    );
    const result = tools.fitResult,
      picking = !!tools.picking || tools.checking || tools.generatingConnector;
    text(
      checkFit,
      picking
        ? tools.interactionTitle === "Peg & socket"
          ? "Cancel placement"
          : "Cancel check"
        : "Check fit",
    );
    text(heading, tools.interactionTitle);
    text(
      sizing,
      `Socket: ${tools.connector.socketDiameterMM.toFixed(2)} mm diameter · ${tools.connector.socketDepthMM.toFixed(2)} mm depth${tools.socketSizingAuto ? " · matched automatically" : " · custom sizes"}`,
    );
    checkFit.disabled = !picking && (busy() || tools.pending || !tools.layers().recoveryReady);
    text(pair, tools.partA ? tools.pairLabel : "Tap two layers to compare their fit.");
    text(status, tools.status);
    text(cardPair, tools.partA ? tools.pairLabel : "");
    text(cardStatus, tools.status);
    const warn = result?.belowResolution
      ? `Desired gap is below the check’s ${result.effectiveResolutionMM.toFixed(2)} mm resolution.`
      : "";
    text(warning, warn);
    warning.hidden = !warn;
    text(cardWarning, warn);
    cardWarning.hidden = !warn;
    text(
      resolution,
      result
        ? `Desired gap ${result.nominalClearanceMM} mm · effective resolution ${result.effectiveResolutionMM.toFixed(2)} mm.`
        : "",
    );
    card.hidden = !picking && !result && !tools.connectorPlaced;
    cancel.textContent = picking ? "Cancel" : "Dismiss";
    for (const b of buttons)
      if (b !== checkFit && b !== cancel)
        b.disabled =
          busy() ||
          tools.pending ||
          !!tools.picking ||
          (["connector", "centres", "faces", "axes"].includes(b.dataset.assemblyAction!) &&
            (!tools.partA || !tools.partB));
    for (const select of selects) select.disabled = busy() || tools.pending || !!tools.picking;
    for (const input of inputs) {
      input.disabled = busy() || tools.pending || !!tools.picking;
      if (input.type === "checkbox") {
        input.checked = tools.matchNormal;
        continue;
      }
      const key = input.dataset.assemblyField!,
        value =
          key === "clearanceMM"
            ? tools.clearanceMM
            : key === "offsetMM"
              ? tools.offsetMM
              : /^[pr][xyz]$/.test(key)
                ? tools.connector[key[0] === "p" ? "positionMM" : "rotationRadians"][
                    "xyz".indexOf(key[1])
                  ] * (key[0] === "r" ? 180 / Math.PI : 1)
                : (tools.connector as unknown as Record<string, number>)[key];
      if (document.activeElement !== input) input.value = String(value);
    }
    if (document.activeElement !== axis) axis.value = tools.axis;
    if (document.activeElement !== quality) quality.value = tools.exportQuality;
  }
  sync();
  return { sync };
}
