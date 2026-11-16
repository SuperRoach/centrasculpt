import type { LayerDisplayPreferences } from "./display-preferences";
import { STUDIO_BACKGROUNDS } from "./world-settings";

/** Desktop companion to the XR Studio Background panel; edits project display metadata only. */
export function worldSettingsUI(
  display: () => LayerDisplayPreferences,
  parent: HTMLElement,
  busy: () => boolean,
) {
  const panel = document.createElement("details");
  panel.className = "lighting-panel";
  const summary = document.createElement("summary");
  summary.textContent = "Studio Background";
  const headingSwatch = document.createElement("span");
  headingSwatch.className = "studio-background-heading-swatch";
  headingSwatch.setAttribute("aria-hidden", "true");
  summary.append(headingSwatch);
  panel.append(summary);
  const label = document.createElement("label"),
    skybox = document.createElement("input");
  label.textContent = "Skybox";
  skybox.type = "checkbox";
  skybox.setAttribute("aria-label", "Skybox");
  skybox.onchange = () => {
    if (!busy()) display().world.skybox = skybox.checked;
    sync();
  };
  label.append(skybox);
  panel.append(label);
  const presetLabel = document.createElement("label"),
    presetName = document.createElement("span"),
    presetControl = document.createElement("span"),
    swatch = document.createElement("span"),
    preset = document.createElement("select");
  presetLabel.className = "studio-background-control";
  presetName.className = "studio-background-label";
  presetName.textContent = "Studio background";
  presetControl.className = "studio-background-select";
  swatch.className = "studio-background-swatch";
  swatch.setAttribute("aria-hidden", "true");
  presetControl.append(swatch, preset);
  presetLabel.append(presetName, presetControl);
  preset.setAttribute("aria-label", "Studio background");
  preset.title =
    "Affects the Studio view only. Passthrough always shows your room and is not changed by this setting.";
  for (const p of STUDIO_BACKGROUNDS) {
    const option = document.createElement("option");
    option.value = p.id;
    option.textContent = p.label;
    preset.append(option);
  }
  preset.onchange = () => {
    const selected = STUDIO_BACKGROUNDS.find((p) => p.id === preset.value);
    if (!busy() && selected) display().world.studioBackground = selected.id;
    sync();
  };
  panel.append(presetLabel);
  parent.append(panel);
  function sync() {
    skybox.checked = display().world.skybox ?? true;
    preset.value = display().world.studioBackground;
    swatch.style.backgroundColor =
      STUDIO_BACKGROUNDS.find((p) => p.id === preset.value)?.colour ?? "#808080";
    headingSwatch.style.backgroundColor = swatch.style.backgroundColor;
    skybox.disabled = preset.disabled = busy();
  }
  sync();
  return { sync };
}
