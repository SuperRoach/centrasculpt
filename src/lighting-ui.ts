import type { LayerDisplayPreferences } from "./display-preferences";
import type { LightRig } from "./light-rig";
import {
  ambientIntensity,
  defaultLighting,
  LIGHT_IDS,
  type LightId,
  validateLighting,
} from "./lighting";
/** Desktop numerical companion to the XR World Settings panel. */
export function lightingUI(
  display: () => LayerDisplayPreferences,
  rig: LightRig,
  parent: HTMLElement,
  busy: () => boolean,
  frameLights?: () => void,
) {
  const panel = document.createElement("details");
  panel.className = "lighting-panel";
  panel.innerHTML =
    "<summary>World Settings · Lighting</summary><p>Directional lights aim toward their targets. Distance does not change brightness.</p>";
  parent.append(panel);
  const groups = new Map<LightId, HTMLDetailsElement>();
  panel.addEventListener("toggle", () => {
    sync();
    rig.sync();
    if (panel.open && !busy()) frameLights?.();
  });
  const defaults = defaultLighting();
  const inputs: { el: HTMLInputElement; read: () => string | boolean }[] = [];
  const edit = (fn: () => void) => {
    if (busy()) return;
    fn();
    rig.cancel();
    sync();
  };
  const config = () => (display().lighting ??= rig.preset());
  const input = (
    host: HTMLElement,
    label: string,
    type: string,
    read: () => string | boolean,
    write: (v: string) => void,
    min?: number,
    max?: number,
  ) => {
    const row = document.createElement("label");
    row.textContent = label;
    const el = document.createElement("input");
    el.type = type;
    if (min !== undefined) el.min = String(min);
    if (max !== undefined) el.max = String(max);
    if (type === "number") el.step = ".1";
    el.setAttribute("aria-label", label);
    el.onchange = () =>
      edit(() => {
        try {
          write(type === "checkbox" ? String(el.checked) : el.value);
          el.setCustomValidity("");
        } catch (e) {
          el.setCustomValidity(e instanceof Error ? e.message : String(e));
          el.reportValidity();
        }
      });
    if (type === "number" || type === "color")
      el.oninput = () => {
        if (el.value !== "" && el.validity.valid) el.onchange?.(new Event("change"));
      };
    row.append(el);
    host.append(row);
    inputs.push({ el, read });
    return el;
  };
  const button = (host: HTMLElement, label: string, action: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.onclick = () => edit(action);
    host.append(b);
  };
  input(
    panel,
    "Three-Point Lighting",
    "checkbox",
    () => !!display().lighting?.enabled,
    (v) => {
      config().enabled = v === "true";
    },
  );
  input(
    panel,
    "Ambient / Environment intensity",
    "number",
    () => String(ambientIntensity(display().lighting ?? defaults)),
    (v) => {
      display().lighting = validateLighting({ ...config(), ambientIntensity: Number(v) });
    },
    0,
    2,
  );
  button(panel, "Reset ambient to automatic", () => {
    delete config().ambientIntensity;
  });
  button(panel, "Frame Lights", () => frameLights?.());
  for (const id of LIGHT_IDS) {
    const group = document.createElement("details");
    group.innerHTML = `<summary>${id[0].toUpperCase() + id.slice(1)} Light</summary>`;
    panel.append(group);
    groups.set(id, group);
    const light = () => (display().lighting ?? defaults).lights[id];
    const update = (fn: (p: ReturnType<typeof light>) => void) => {
      const candidate = structuredClone(config());
      fn(candidate.lights[id]);
      display().lighting = validateLighting(candidate);
    };
    input(
      group,
      `${id} enabled`,
      "checkbox",
      () => light().enabled,
      (v) => update((p) => (p.enabled = v === "true")),
    );
    input(
      group,
      `${id} colour`,
      "color",
      () => light().colour,
      (v) => update((p) => (p.colour = v)),
    );
    input(
      group,
      `${id} intensity`,
      "number",
      () => String(light().intensity),
      (v) => update((p) => (p.intensity = Number(v))),
      0,
      6,
    );
    for (const property of ["position", "target"] as const)
      for (let axis = 0; axis < 3; axis++)
        input(
          group,
          `${id} ${property} ${"XYZ"[axis]}`,
          "number",
          () => String(light()[property][axis]),
          (v) => update((p) => (p[property][axis] = Number(v))),
          -1000,
          1000,
        );
    button(group, "Reset light", () => {
      config().lights[id as LightId] = rig.preset().lights[id];
    });
  }
  button(panel, "Reset All Lights", () => {
    config().lights = rig.preset().lights;
    delete config().ambientIntensity;
  });
  const inspection = document.createElement("details");
  inspection.innerHTML =
    "<summary>Inspection Light · temporary</summary><p>Overrides the rig; not saved. Stops when leaving XR or opening a project.</p>";
  panel.append(inspection);
  input(
    inspection,
    "Inspection Light",
    "checkbox",
    () => rig.inspection.enabled,
    (v) => {
      config();
      rig.sync();
      rig.inspection.enabled = v === "true";
    },
  );
  input(
    inspection,
    "Pause inspection",
    "checkbox",
    () => rig.inspection.paused,
    (v) => {
      rig.inspection.paused = v === "true";
    },
  );
  input(
    inspection,
    "Degrees per second",
    "number",
    () => String(rig.inspection.speed),
    (v) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 1 || n > 30)
        throw new Error("Choose 1–30 degrees per second.");
      rig.inspection.speed = n;
    },
    1,
    30,
  );
  button(inspection, "Reverse direction", () => {
    rig.inspection.direction *= -1;
  });
  button(inspection, "Reset angle", () => rig.resetInspection());
  function sync() {
    rig.desktopVisible = panel.open && !busy();
    for (const { el, read } of inputs) {
      el.disabled = busy();
      if (document.activeElement === el) continue;
      const value = read();
      if (el.type === "checkbox") el.checked = !!value;
      else if (el.value !== value) el.value = String(value);
    }
    for (const b of panel.querySelectorAll("button")) b.disabled = busy();
  }
  sync();
  return {
    sync,
    select(id: LightId) {
      if (!rig.desktopVisible || busy()) return;
      rig.selected = id;
      for (const [key, group] of groups) group.open = key === id;
      groups.get(id)?.scrollIntoView({ block: "nearest" });
      rig.sync();
    },
  };
}
