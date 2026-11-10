/** Millimetre-space reference fields. Curved fields are implicit approximations,
 * not exact Euclidean distances; version these formulas with their fixtures. */
export const FIXTURE_VERSION = 1;
const box = (x, y, z, a, b, c) => {
  const q = [Math.abs(x) - a / 2, Math.abs(y) - b / 2, Math.abs(z) - c / 2];
  return Math.hypot(...q.map((v) => Math.max(v, 0))) + Math.min(Math.max(...q), 0);
};
const arc = (x, y, z, radius, tube) => {
  const t = Math.max(0, Math.min(Math.PI / 2, Math.atan2(y + radius / 2, x + radius / 2)));
  return (
    Math.hypot(x + radius / 2 - radius * Math.cos(t), y + radius / 2 - radius * Math.sin(t), z) -
    tube(t)
  );
};
export const FIXTURES = [
  {
    id: "horn",
    description: "60 mm centreline arc, 90 degree bend, diameter 12 to 2 mm",
    featuresMM: [2, 12],
    sample: (x, y, z) => arc(x, y, z, 120 / Math.PI, (t) => 6 - (5 * t) / (Math.PI / 2)),
    probes: [
      [120 / Math.PI / 2, -120 / Math.PI / 2, 0, -1],
      [0, 0, 40, 1],
    ],
  },
  {
    id: "organic-curve",
    description: "60 mm centreline arc, 10 mm diameter with 1/2/4 mm radial ridge amplitudes",
    featuresMM: [1, 2, 4, 10],
    sample: (x, y, z) =>
      arc(x, y, z, 120 / Math.PI, (t) => {
        const u = t / (Math.PI / 2);
        return (
          5 +
          [1, 2, 4].reduce((s, a, i) => s + a * Math.exp(-(((u - (i + 1) / 4) / 0.035) ** 2)), 0)
        );
      }),
    probes: [
      [120 / Math.PI / 2, -120 / Math.PI / 2, 0, -1],
      [0, 0, 40, 1],
    ],
  },
  {
    id: "hollow-part",
    description: "40x30x20 mm shell, 3 mm walls, 8 mm Z through bore",
    featuresMM: [3, 8],
    sample: (x, y, z) =>
      Math.max(box(x, y, z, 40, 30, 20), -box(x, y, z, 34, 24, 14), -(Math.hypot(x, y) - 4)),
    probes: [
      [0, 0, 9, 1],
      [10, 0, 9, -1],
      [0, 0, 0, 1],
    ],
  },
  ...[1, 2, 3, 4].map((width) => ({
    id: `long-thin-${width}mm`,
    description: `75x${width}x${width} mm bar rotated 35 degrees about Z`,
    featuresMM: [width, 75],
    sample: (x, y, z) => {
      const a = (35 * Math.PI) / 180;
      return box(
        x * Math.cos(a) + y * Math.sin(a),
        -x * Math.sin(a) + y * Math.cos(a),
        z,
        75,
        width,
        width,
      );
    },
    probes: [
      [0, 0, 0, -1],
      [0, 0, 10, 1],
    ],
  })),
  ...[1, 2, 4, 8].map((width) => ({
    id: `slot-${width}mm`,
    description: `40x25x12 mm block, 20x${width} mm Z through slot`,
    featuresMM: [width, 12, 20],
    sample: (x, y, z) => Math.max(box(x, y, z, 40, 25, 12), -box(x, y, z, 20, width, 30)),
    probes: [
      [0, 0, 0, 1],
      [15, 0, 0, -1],
      [0, 10, 0, -1],
    ],
  })),
];
export const POSES = Array.from({ length: 20 }, (_, i) => ({
  positionMM: [8 * Math.sin((i * Math.PI) / 10), i - 9.5, 0],
  rotationXYZ: [0, (i * Math.PI) / 40, 0],
  uniformScale: 0.5,
}));
