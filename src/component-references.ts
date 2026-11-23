export const COMPONENT_LIMIT = 12;

type XYZ = [number, number, number];
export type ComponentHole = { x: number; z: number; diameter: number };
type Housing = { at: XYZ; size: XYZ; colour: number };

const pcb = 0x237750,
  metal = 0xb9c1c7,
  black = 0x242832;
const housing = (at: XYZ, size: XYZ, colour = metal): Housing => ({ at, size, colour });
const fourHoles = (left: number, right: number, halfDepth: number): ComponentHole[] =>
  [left, right].flatMap((x) => [-halfDepth, halfDepth].map((z) => ({ x, z, diameter: 2.7 })));

type Preset = {
  name: string;
  dimensions: XYZ;
  holes: ComponentHole[];
  housings: Housing[];
  cornerRadius?: number;
  colour: number;
  manufacturer?: string;
  drawing?: string;
  revision?: string;
  checked?: string;
  verified: string;
  unspecified: string;
};

export const COMPONENT_PRESETS = {
  pcb: {
    name: "Generic PCB",
    dimensions: [50, 1.6, 30],
    colour: pcb,
    holes: [],
    housings: [],
    verified: "User-entered nominal dimensions",
    unspecified: "Manufacturing tolerances",
  },
  pi4: {
    name: "Raspberry Pi 4 Model B",
    dimensions: [85, 1.6, 56],
    colour: pcb,
    holes: fourHoles(-39, 19, 24.5),
    cornerRadius: 3,
    housings: [
      housing([34.9, 6.75, -17.75], [21.4, 13.5, 15.5]),
      housing([36.8, 8, 1], [17.6, 16, 13]),
      housing([36.8, 8, 19], [17.6, 16, 13]),
      housing([-31.3, 1.6, 24.8], [8.8, 3.2, 7.8]),
      housing([-16.5, 1.5, 25.3], [6.2, 3, 8]),
      housing([-3, 1.5, 25.3], [6.2, 3, 8]),
      housing([11.5, 3, 23], [7, 6, 15]),
      housing([-10, 4.25, -24.5], [51, 8.5, 5], black),
      housing([-13.25, 1.2, -4.5], [15, 2.4, 15], black),
    ],
    manufacturer: "Raspberry Pi",
    drawing:
      "https://pip-assets.raspberrypi.com/categories/559-mechanical/documents/RP-001185-MD-1-Mechanical%20Drawing.pdf",
    checked: "2026-11-23",
    revision: "RP-001185-MD-1",
    verified: "PCB outline, mounting holes and dimensioned connector positions",
    unspecified:
      "PCB thickness, housing envelopes, cable clearance and tolerances are illustrative",
  },
  zero2: {
    name: "Raspberry Pi Zero 2 W",
    dimensions: [65, 1.6, 30],
    colour: pcb,
    holes: fourHoles(-29, 29, 11.5),
    housings: [
      housing([-20.1, 1.5, 14], [11, 3, 7]),
      housing([8.9, 1.5, 14], [8, 3, 6]),
      housing([21.5, 1.5, 14], [8, 3, 6]),
      housing([0, 1, 0], [12, 2, 12], black),
    ],
    manufacturer: "Raspberry Pi",
    drawing: "https://pip.raspberrypi.com/documents/RP-008358-DS",
    checked: "2026-11-23",
    revision: "RP-008358-DS-1",
    verified: "PCB outline, mounting centres and Mini HDMI and Micro USB positions",
    unspecified: "Hole diameter, thickness, housing envelopes and tolerances are illustrative",
  },
  devkit: {
    name: "ESP32-DevKitC V4",
    dimensions: [27.94, 1.6, 48.26],
    colour: 0x293033,
    holes: [],
    housings: [
      housing([0, 1.5, -11.5], [18, 3, 25.26]),
      housing([0, 0.45, -27.15], [18, 0.9, 6.04], pcb),
      housing([-12.7, 3, 0], [2.54, 6, 48.26], black),
      housing([12.7, 3, 0], [2.54, 6, 48.26], black),
      housing([0, 1.5, 23], [8, 3, 6]),
      housing([-7, 1, 20], [4, 2, 4], metal),
      housing([7, 1, 20], [4, 2, 4], metal),
    ],
    manufacturer: "Espressif",
    drawing: "https://dl.espressif.com/dl/schematics/esp32_devkitc_v4_dimensions.pdf",
    checked: "2026-11-23",
    revision: "DevKitC V4 dimension drawing",
    verified: "PCB outline, antenna overhang, header pitch and row spacing",
    unspecified: "Thickness, header heights, housing envelopes and tolerances are illustrative",
  },
  tactile: {
    name: "Generic 6 × 6 mm tactile switch",
    dimensions: [6, 3.5, 6],
    colour: 0x33363b,
    holes: [],
    housings: [-1, 1].flatMap((side) =>
      [-2.25, 2.25].map((z) => housing([side * 3.45, -2.1, z], [0.9, 2.2, 0.6])),
    ),
    drawing:
      "https://rapidroboticsaustralia.com.au/products/spst-push-button-tactile-switch-4-pins",
    checked: "2026-11-23",
    revision: "Retail listing",
    verified: "6 × 6 mm body footprint and 1 mm cap height",
    unspecified:
      "Body height, cap diameter and four pin envelopes are illustrative. Travel unspecified",
  },
} satisfies Record<string, Preset>;

export type ComponentPreset = keyof typeof COMPONENT_PRESETS;
export type ComponentReference = {
  id: string;
  preset: ComponentPreset;
  positionMm: XYZ;
  rotation: XYZ;
  scale: number;
  visible: boolean;
  opacity: number;
  hostId?: string;
  gapMm?: number;
  dimensions?: XYZ;
  holes?: ComponentHole[];
};

export function presetFor(id: ComponentPreset): Preset {
  return COMPONENT_PRESETS[id];
}

export function componentDimensions(record: ComponentReference): XYZ {
  return record.dimensions ?? presetFor(record.preset).dimensions;
}

export function componentHoles(record: ComponentReference): ComponentHole[] {
  return record.holes ?? presetFor(record.preset).holes;
}

export function validateComponents(value: unknown): ComponentReference[] {
  if (!Array.isArray(value) || value.length > COMPONENT_LIMIT)
    throw new Error(`At most ${COMPONENT_LIMIT} 3D component references are supported.`);
  const ids = new Set<string>();
  const fail = () => {
    throw new Error("Invalid 3D component reference or mounting hole.");
  };
  const number = (value: unknown, min: number, max: number): number =>
    typeof value === "number" && Number.isFinite(value) && value >= min && value <= max
      ? value
      : fail();
  function triple(value: unknown, min: number, max: number): XYZ {
    if (!Array.isArray(value) || value.length !== 3) return fail();
    return [number(value[0], min, max), number(value[1], min, max), number(value[2], min, max)];
  }
  return value.map((raw): ComponentReference => {
    if (!raw || typeof raw !== "object") return fail();
    const { id, preset, visible, hostId } = raw;
    if (
      typeof id !== "string" ||
      !id ||
      id.length > 128 ||
      ids.has(id) ||
      typeof preset !== "string" ||
      !Object.hasOwn(COMPONENT_PRESETS, preset) ||
      typeof visible !== "boolean" ||
      (hostId !== undefined && (typeof hostId !== "string" || !hostId || hostId.length > 128))
    )
      return fail();
    ids.add(id);
    const record: ComponentReference = {
      id,
      preset: preset as ComponentPreset,
      visible,
      positionMm: triple(raw.positionMm, -10000, 10000),
      rotation: triple(raw.rotation, -360, 360),
      scale: number(raw.scale, 0.01, 10),
      opacity: number(raw.opacity, 0.05, 1),
    };
    if (hostId !== undefined) record.hostId = hostId;
    if (raw.gapMm !== undefined) {
      if (!hostId) return fail();
      record.gapMm = number(raw.gapMm, 0, 1000);
    }
    if (preset === "pcb") {
      const [width, thickness, depth] = triple(
        raw.dimensions ?? presetFor("pcb").dimensions,
        0.1,
        1000,
      );
      record.dimensions = [width, thickness, depth];
      if (raw.holes !== undefined) {
        if (!Array.isArray(raw.holes) || raw.holes.length > 4) return fail();
        const holes: ComponentHole[] = [];
        for (const hole of raw.holes) {
          if (!hole || typeof hole !== "object") return fail();
          const diameter = number(hole.diameter, 0.1, Math.min(width, depth));
          const radius = diameter / 2;
          const x = number(hole.x, -width / 2 + radius, width / 2 - radius);
          const z = number(hole.z, -depth / 2 + radius, depth / 2 - radius);
          if (
            Math.abs(x) + radius >= width / 2 ||
            Math.abs(z) + radius >= depth / 2 ||
            holes.some((h) => Math.hypot(h.x - x, h.z - z) <= (h.diameter + diameter) / 2)
          )
            return fail();
          holes.push({ x, z, diameter });
        }
        record.holes = holes;
      }
    } else if (raw.dimensions !== undefined || raw.holes !== undefined) return fail();
    return record;
  });
}
