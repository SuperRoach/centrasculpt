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
  summary.textContent = "World Settings · Studio Background";
  panel.append(summary);
  const hint = document.createElement("p");
  hint.textContent =
    "Skybox adds a level horizon in Studio only. The background colour fills the view with Skybox off, or tints the lower half with it on. The ground grid stays independent. Passthrough always shows your room.";
  panel.append(hint);
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
    preset = document.createElement("select");
  presetLabel.textContent = "Studio background";
  preset.setAttribute("aria-label", "Studio background");
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
  presetLabel.append(preset);
  panel.append(presetLabel);
  parent.append(panel);
  function sync() {
    skybox.checked = display().world.skybox ?? true;
    preset.value = display().world.studioBackground;
    skybox.disabled = preset.disabled = busy();
  }
  sync();
  return { sync };
}
