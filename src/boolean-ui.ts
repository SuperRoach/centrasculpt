import type { IndependentLayers } from "./independent-layers";
import type { LayerOperation } from "./layers";
import { newId } from "./layers";

/** Uses the same atomic backend as headless commands and the controller palette. */
export function booleanUI(
  getLayers: () => IndependentLayers,
  host: HTMLElement,
  busy: () => boolean,
  changed: () => void,
) {
  const panel = document.createElement("details"),
    title = document.createElement("summary"),
    body = document.createElement("div"),
    status = document.createElement("p");
  title.textContent = "Live Boolean Shapes";
  panel.className = "primitive-panel";
  body.className = "primitive-body";
  status.setAttribute("role", "status");
  panel.append(title, body, status);
  host.append(panel);
  let key = "";
  let selectedSource = "";
  const act = (action: () => void | Promise<unknown>) => {
    if (busy()) return;
    void Promise.resolve()
      .then(() => {
        const result = action();
        sync();
        return result;
      })
      .then(() => {
        key = "";
        changed();
        sync();
      })
      .catch((e) => {
        status.textContent = e instanceof Error ? e.message : String(e);
      });
  };
  const button = (label: string, action: () => void | Promise<unknown>) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.onclick = () => act(action);
    return b;
  };
  function sync() {
    const l = getLayers(),
      target = l.project.activeLayer;
    const next = JSON.stringify([l.modellingRevision, busy(), l.recoveryReady]);
    if (key === next) return;
    key = next;
    body.replaceChildren();
    status.textContent = "";
    const heading = document.createElement("p");
    heading.textContent = `Target: ${target.name}. Modifiers apply top to bottom.`;
    body.append(heading);
    const explanation = document.createElement("p");
    explanation.textContent =
      "Sources remain editable. Enabled operands appear only in the result; their eye controls independent output when released. Select a source below to edit its shape or transform. Layers view inspects individual sources; exports use the Boolean result. Bake explicitly creates sculpt geometry.";
    body.append(explanation);
    const source = document.createElement("select");
    source.setAttribute("aria-label", "Boolean source operand");
    for (const layer of l.project.layerStack.layers.filter((s) => s.id !== target.id)) {
      const option = document.createElement("option");
      option.value = layer.id;
      option.textContent = layer.name;
      source.append(option);
    }
    if ([...source.options].some((o) => o.value === selectedSource)) source.value = selectedSource;
    else if (source.options.length) source.selectedIndex = source.options.length - 1;
    source.onchange = () => {
      selectedSource = source.value;
    };
    body.append(source);
    for (const [operation, label] of [
      ["union", "Add / Union"],
      ["difference", "Subtract / Difference"],
      ["intersect", "Intersect"],
    ] as const)
      body.append(
        button(label, () =>
          l.setBooleanModifiers(target.id, [
            ...(target.booleanModifiers ?? []),
            {
              id: newId(),
              sourceId: source.value,
              operation: operation as LayerOperation,
              enabled: true,
            },
          ]),
        ),
      );
    (target.booleanModifiers ?? []).forEach((m, i) => {
      const row = document.createElement("div"),
        label = document.createElement("p");
      label.textContent = `${i + 1}. ${m.operation}: ${l.project.layerStack.get(m.sourceId).name} (${m.enabled ? "enabled" : "disabled"})`;
      const operation = document.createElement("select");
      operation.setAttribute("aria-label", `Modifier ${i + 1} operation`);
      for (const value of ["union", "difference", "intersect"] as const) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        operation.append(option);
      }
      operation.value = m.operation;
      operation.onchange = () =>
        act(() =>
          l.setBooleanModifiers(
            target.id,
            target.booleanModifiers?.map((s) =>
              s.id === m.id ? { ...s, operation: operation.value as LayerOperation } : s,
            ),
          ),
        );
      row.append(operation);
      const change = (modifiers: typeof target.booleanModifiers) =>
        l.setBooleanModifiers(target.id, modifiers);
      row.append(
        label,
        button("Select source", () => {
          l.select(m.sourceId);
        }),
        button(m.enabled ? "Disable" : "Enable", () =>
          change(
            target.booleanModifiers?.map((s) =>
              s.id === m.id ? { ...s, enabled: !s.enabled } : s,
            ),
          ),
        ),
        button("Remove", () => change(target.booleanModifiers?.filter((s) => s.id !== m.id))),
      );
      if (i > 0)
        row.append(
          button("Move earlier", () => {
            const ms = [...(target.booleanModifiers ?? [])];
            [ms[i - 1], ms[i]] = [ms[i], ms[i - 1]];
            change(ms);
          }),
        );
      body.append(row);
    });
    body.append(
      button("Bake visible result to sculpt layer", () =>
        l.bake({ name: "Boolean baked", resolution: 128, hideSources: true }),
      ),
    );
    for (const b of body.querySelectorAll("button, select"))
      (b as HTMLButtonElement).disabled = busy() || !l.recoveryReady || !target.editable;
  }
  sync();
  return { sync, element: panel };
}
