import { measurementValue, toDisplay } from "./physical-units";
import type { PrecisionField, PrecisionTools } from "./precision-tools";
import { selectionDimensions } from "./precision-tools";
/** Native fields commit on Enter/change; Escape cancels. Selection refresh never replaces active typing. */
export function precisionUI(
  tools: PrecisionTools,
  host: HTMLElement,
  busy: () => boolean,
  start: () => void,
): { sync: () => void } {
  const panel = document.createElement("details");
  panel.id = "measurement-precision";
  const title = document.createElement("summary");
  title.textContent = "Measure & precision";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  const button = (label: string, action: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.onclick = () => {
      if (busy()) return;
      try {
        action();
        status.textContent = tools.feedback;
        sync();
      } catch (e) {
        status.textContent = e instanceof Error ? e.message : "Invalid value";
      }
    };
    panel.append(b);
    return b;
  };
  panel.append(title);
  const note = document.createElement("p");
  note.textContent =
    "Position uses model axes in the selected units. Rotation uses XYZ degrees. Target dimensions preserve proportions. Enter or Tab applies; Escape cancels. Annotations stay at placed model points.";
  panel.append(note, status);
  button("Measure distance", () => {
    start();
    tools.start(2);
  });
  button("Measure angle", () => {
    start();
    tools.start(3);
    tools.feedback += " · point 2 is the vertex";
  });
  button("Stop measuring", () => tools.start(0));
  button("Selected dimensions", () => {
    tools.feedback = selectionDimensions(tools.layers())
      .map((v) => `${toDisplay(v, tools.settings).toFixed(3)} ${tools.settings.unit}`)
      .join(" × ");
  });
  const units = button("", () => {
    tools.activate("precision:unit");
    tools.feedback = `Display units: ${tools.settings.unit}`;
  });
  const snap = button("", () => {
    tools.activate("precision:snap");
    tools.feedback = `Position snap: ${tools.settings.translationSnapMM || "Off"} mm`;
  });
  const inputs = new Map<PrecisionField, HTMLInputElement>();
  const sections: { label: string; fields: [PrecisionField, string][] }[] = [
    {
      label: "Position · model axes",
      fields: [
        ["px", "X"],
        ["py", "Y"],
        ["pz", "Z"],
      ],
    },
    {
      label: "Rotation · XYZ degrees",
      fields: [
        ["rx", "X°"],
        ["ry", "Y°"],
        ["rz", "Z°"],
      ],
    },
    { label: "Scale", fields: [["scale", "Uniform scale"]] },
    {
      label: "Target dimensions · proportional",
      fields: [
        ["width", "Width"],
        ["height", "Height"],
        ["depth", "Depth"],
      ],
    },
    {
      label: "Calibration & snapping",
      fields: [
        ["calibration", "mm / model unit"],
        ["angle", "Angle step° (0 off)"],
      ],
    },
  ];
  for (const section of sections) {
    const group = document.createElement("fieldset");
    group.className = "numeric-transform";
    const legend = document.createElement("legend");
    legend.textContent = section.label;
    group.append(legend);
    for (const [field, label] of section.fields) {
      const row = document.createElement("label");
      row.textContent = label;
      const input = document.createElement("input");
      input.type = "number";
      input.step = "any";
      const accessible =
        field[0] === "p"
          ? `Physical position ${label}`
          : field[0] === "r"
            ? `Physical rotation ${label}`
            : field === "calibration"
              ? "Physical calibration mm per model unit"
              : field === "angle"
                ? "Transform angle snap degrees"
                : field === "scale"
                  ? "Physical uniform scale"
                  : `Target ${field}`;
      input.setAttribute("aria-label", accessible);
      inputs.set(field, input);
      let skipChange = false,
        initialValue = "";
      const apply = () => {
        if (busy()) return;
        try {
          if (!input.value.trim()) throw new Error("Enter a value.");
          tools.apply(field, Number(input.value));
          initialValue = input.value;
          status.textContent = `${accessible} applied · ${tools.settings.unit}`;
        } catch (e) {
          status.textContent = e instanceof Error ? e.message : "Invalid value";
        }
      };
      input.onfocus = () => {
        const value = tools.value(field);
        input.value = value === "set target" ? "" : value;
        initialValue = input.value;
      };
      input.onchange = () => {
        if (!skipChange) apply();
      };
      input.onblur = () => {
        if (!skipChange && input.value !== initialValue && input.value.trim()) apply();
      };
      input.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          skipChange = true;
          apply();
          input.blur();
          skipChange = false;
        }
        if (e.key === "Escape") {
          skipChange = true;
          input.value = initialValue;
          input.blur();
          skipChange = false;
        }
      };
      row.append(input);
      group.append(row);
    }
    panel.append(group);
  }
  const calibrationNote = document.createElement("p");
  calibrationNote.textContent =
    "Calibration changes physical interpretation only. Legacy and new projects start at 100 mm per model unit. STL target size overrides this calibration.";
  panel.append(calibrationNote);
  button("Review annotations", () => {
    list.replaceChildren();
    tools.settings.measurements.forEach((m, i) => {
      const row = document.createElement("div");
      row.textContent = `${i + 1}. ${measurementValue(m.points, tools.settings)} `;
      const remove = document.createElement("button");
      remove.textContent = "Remove";
      remove.onclick = () => {
        if (busy()) return;
        tools.remove(m.id);
        row.remove();
      };
      row.append(remove);
      m.points.forEach((_, index) => {
        const b = document.createElement("button");
        b.textContent = `Reposition point ${index + 1}`;
        b.onclick = () => {
          if (busy()) return;
          start();
          tools.reposition(m.id, index);
          status.textContent = tools.feedback;
        };
        row.append(b);
      });
      list.append(row);
    });
  });
  const list = document.createElement("div");
  panel.append(list);
  host.append(panel);
  let shownProject = tools.layers().project;
  let shownSettings = tools.settings;
  const sync = () => {
    if (shownProject !== tools.layers().project || shownSettings !== tools.settings) {
      shownProject = tools.layers().project;
      shownSettings = tools.settings;
      list.replaceChildren();
      status.textContent = "";
    }
    units.textContent = `Units · ${tools.settings.unit}`;
    snap.textContent = `Position snap · ${tools.settings.translationSnapMM ? `${tools.settings.translationSnapMM} mm` : "Off"}`;
    for (const [field, input] of inputs) {
      input.disabled = busy();
      if (document.activeElement !== input) {
        const value = tools.value(field);
        input.value = value === "set target" ? "" : value;
        input.placeholder = ["width", "height", "depth"].includes(field) ? tools.settings.unit : "";
      }
    }
  };
  panel.ontoggle = sync;
  sync();
  return { sync };
}
