import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Euler, Ray, Vector3 } from "three";
import { createHeadlessEditor } from "./headless-enclosure.mjs";

const { validatePrintMesh } = await import("../work/test-build/stl-export.mjs");
const { IndependentLayers } = await import("../work/test-build/independent-layers.mjs");
const { exportPartSTL } = await import("../work/test-build/assembly-tools.mjs");
const { openSculptProject, saveSculptProject } = await import("../work/test-build/project.mjs");
const args = process.argv.slice(2);
const [folder = "work/phase-8-8e", filename = "electronics-enclosure.form"] = args.filter(
  (arg) => arg !== "--enclosure-parts",
);
const directory = resolve(folder);
const native = await readFile(join(directory, filename));
const input = openSculptProject(Uint8Array.from(native).buffer);
const base = input.layerStack.layers.find(
  (layer) => layer.assemblyPart?.enclosure?.role === "base",
);
assert(base, "Expected an enclosure base in the validated native file");
const { parameters, features } = base.assemblyPart.enclosure;
const cuts = features
  .map(({ definition }) => definition)
  .filter((definition) => definition.association);
assert.equal(cuts.length, 3);
const parts = [
  { slug: "pi4-usb-wall", cut: cuts.find((cut) => cut.association.featureId === "usb3") },
  { slug: "esp32-usb-wall", cut: cuts.find((cut) => cut.association.featureId === "usb") },
  {
    slug: "tactile-switch-wall",
    cut: cuts.find((cut) => cut.association.featureId === "actuator"),
  },
];
const { layers, api } = createHeadlessEditor();
const seed = layers.project.activeLayerId;
const wall = parameters.wallThicknessMm;
const steps = [];
const definitions = [];
function addPart(slug, position, body, tool, shift, operation) {
  const part = `part${definitions.length}`;
  const mate = `${part}Tool`;
  definitions.push({ part, slug });
  const shape = (alias, source, centre) => {
    steps.push(
      { as: alias, command: { type: "primitive.create", unit: "mm", source } },
      {
        command: {
          type: "object.transform",
          id: `$${alias}`,
          unit: "mm",
          transform: { position: centre, rotation: [0, 0, 0], scale: [1, 1, 1] },
        },
      },
    );
  };
  const [x, y, z] = position;
  const tile = body.kind === "box" && Math.max(body.width, body.depth) > 8 * body.height;
  if (tile) {
    const overlap = 1;
    const width = (body.width + overlap) / 2;
    const depth = (body.depth + overlap) / 2;
    const dx = (body.width - overlap) / 4;
    const dz = (body.depth - overlap) / 4;
    for (const [index, [u, v]] of [
      [-dx, -dz],
      [dx, -dz],
      [-dx, dz],
      [dx, dz],
    ].entries()) {
      const alias = index ? `${part}Tile${index}` : part;
      shape(alias, { ...body, width, depth }, [x + u, y, z + v]);
      if (index)
        steps.push({
          command: {
            type: "boolean.create",
            id: `$${part}`,
            sourceId: `$${alias}`,
            operation: "union",
          },
        });
    }
  } else shape(part, body, position);
  shape(mate, tool, [x, y + shift, z]);
  steps.push(
    { command: { type: "object.rename", id: `$${part}`, name: slug } },
    { command: { type: "boolean.create", id: `$${part}`, sourceId: `$${mate}`, operation } },
    { command: { type: "part.define", objectId: `$${part}`, clearanceMM: 0 } },
    { command: { type: "part.assign", objectId: `$${mate}`, partId: `$${part}` } },
  );
  if (tile)
    for (let index = 1; index <= 3; index++)
      steps.push({
        command: { type: "part.assign", objectId: `$${part}Tile${index}`, partId: `$${part}` },
      });
}
for (const [index, { cut, slug }] of parts.entries()) {
  assert(cut, `Missing validated opening for ${slug}`);
  const span = (size) => Math.max(12, Math.ceil(size + 8));
  const tool =
    cut.shape === "round"
      ? { kind: "cylinder", diameter: cut.widthMm, height: wall + 2 }
      : { kind: "box", width: cut.widthMm, depth: cut.heightMm, height: wall + 2 };
  addPart(
    slug,
    [index * 30 - 30, 0, 0],
    { kind: "box", width: span(cut.widthMm), depth: span(cut.heightMm), height: wall },
    tool,
    0,
    "difference",
  );
}
const printable = parts[2].cut.association.printableIds;
assert.equal(printable.length, 4);
const mm = input.displayPreferences.precision.millimetresPerUnit;
for (const [index, slug] of ["button-plunger", "button-retainer"].entries()) {
  const root = input.layerStack.get(printable[index * 2]);
  const child = input.layerStack.get(printable[index * 2 + 1]);
  assert.equal(root.primitive.kind, "cylinder");
  assert.equal(child.primitive.kind, "cylinder");
  const source = ({ diameter, height }) => ({
    kind: "cylinder",
    diameter: diameter * mm,
    height: height * mm,
  });
  const axis = new Vector3(0, 1, 0).applyEuler(new Euler(...root.transform.rotation));
  const shift =
    new Vector3(...child.transform.position)
      .sub(new Vector3(...root.transform.position))
      .dot(axis) * mm;
  addPart(
    slug,
    [index * 16 - 8, 0, 26],
    source(root.primitive),
    source(child.primitive),
    shift,
    index === 0 ? "union" : "difference",
  );
}
steps.push({ command: { type: "object.delete", id: seed } });
const result = await api.batch(steps, {
  expectedRevision: api.revision,
  coalesceSourceMeshYields: true,
});
assert(result.ok, JSON.stringify(result));
const stack = layers.project.layerStack;
const reports = [];
function crossings(positions, origin, axis) {
  const direction = new Vector3().setComponent(axis, 1);
  const ray = new Ray(new Vector3(...origin), direction);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const hit = new Vector3();
  const points = [];
  for (let offset = 0; offset < positions.length; offset += 9) {
    if (
      ray.intersectTriangle(
        a.fromArray(positions, offset),
        b.fromArray(positions, offset + 3),
        c.fromArray(positions, offset + 6),
        false,
        hit,
      )
    )
      points.push(hit.getComponent(axis));
  }
  points.sort((left, right) => left - right);
  return points.filter((value, index) => index === 0 || value - points[index - 1] > 0.0001);
}

try {
  layers.project.name = "Electronics fit coupons";
  layers.project.displayPreferences = layers.display.snapshot(layers.project.id, stack.layers);
  await writeFile(
    join(directory, "electronics-fit-coupons.form"),
    new Uint8Array(saveSculptProject(layers.project)),
  );
  for (const { slug } of definitions) {
    const id = stack.layers.find((layer) => layer.name === slug).id;
    const start = performance.now();
    const { data, report } = await exportPartSTL(
      layers,
      id,
      undefined,
      "fast",
      512 * 1024 ** 2,
      undefined,
      256,
    );
    for (const key of [
      "boundaryEdges",
      "nonManifoldEdges",
      "inconsistentEdges",
      "degenerateTriangles",
      "invertedComponents",
    ])
      assert.equal(report[key], 0, `${slug}: ${key}`);
    assert.equal(report.components, 1, slug);
    const buffer = Buffer.from(data);
    assert.equal(buffer.length, 84 + 50 * report.triangles);
    // Use right-handed Z-up orientations for slicers. Put the plunger cap on the bed.
    const up = slug === "button-plunger" ? -1 : 1;
    const minimum = [Infinity, Infinity, Infinity];
    const maximum = [-Infinity, -Infinity, -Infinity];
    for (let offset = 84; offset < buffer.length; offset += 50)
      for (let vertex = 1; vertex <= 3; vertex++) {
        const point = offset + 12 * vertex;
        const values = [
          buffer.readFloatLE(point),
          -up * buffer.readFloatLE(point + 8),
          up * buffer.readFloatLE(point + 4),
        ];
        for (const [axis, value] of values.entries()) {
          minimum[axis] = Math.min(minimum[axis], value);
          maximum[axis] = Math.max(maximum[axis], value);
        }
      }
    const centre = [(minimum[0] + maximum[0]) / 2, (minimum[1] + maximum[1]) / 2, minimum[2]];
    for (let offset = 84; offset < buffer.length; offset += 50)
      for (let vertex = 0; vertex <= 3; vertex++) {
        const point = offset + 12 * vertex;
        const y = buffer.readFloatLE(point + 4);
        const z = buffer.readFloatLE(point + 8);
        if (vertex) buffer.writeFloatLE(buffer.readFloatLE(point) - centre[0], point);
        buffer.writeFloatLE(-up * z - (vertex ? centre[1] : 0), point + 4);
        buffer.writeFloatLE(up * y - (vertex ? centre[2] : 0), point + 8);
      }
    const positions = new Float32Array(report.triangles * 9);
    for (let face = 0; face < report.triangles; face++)
      for (let coordinate = 0; coordinate < 9; coordinate++)
        positions[face * 9 + coordinate] = buffer.readFloatLE(96 + face * 50 + 4 * coordinate);
    const encoded = await validatePrintMesh(positions);
    for (const key of [
      "components",
      "boundaryEdges",
      "nonManifoldEdges",
      "inconsistentEdges",
      "degenerateTriangles",
      "invertedComponents",
    ])
      assert.equal(encoded[key], report[key], `${slug} output: ${key}`);
    const dimensions = encoded.dimensions;
    const cut = parts.find((part) => part.slug === slug)?.cut;
    const apertureMm =
      cut &&
      [0, 1].map((axis) => {
        const from = axis === 0 ? [-100, 0.137, wall / 2] : [0.137, -100, wall / 2];
        const joints = crossings(positions, from, axis);
        assert.equal(joints.length, 4, `${slug} aperture intersections`);
        const opening = joints[2] - joints[1];
        assert(
          Math.abs(opening - [cut.widthMm, cut.heightMm][axis]) <=
            report.effectiveResolutionMM + 0.02,
        );
        return opening;
      });
    const socketFloorMm =
      slug === "button-retainer" ? crossings(positions, [0.137, 0.117, -10], 2) : undefined;
    if (socketFloorMm) {
      assert.equal(socketFloorMm.length, 2, "Blind socket must leave a floor and an open top");
      assert(
        Math.abs(socketFloorMm[1] - socketFloorMm[0] - 1) <= report.effectiveResolutionMM + 0.02,
      );
    }
    reports.push({
      slug,
      ...report,
      dimensions,
      apertureMm,
      socketFloorMm: socketFloorMm && socketFloorMm[1] - socketFloorMm[0],
      boundsMm: {
        min: minimum.map((value, axis) => value - centre[axis]),
        max: maximum.map((value, axis) => value - centre[axis]),
      },
      exportMs: performance.now() - start,
    });
    await writeFile(join(directory, `${slug}-coupon.stl`), buffer);
    console.log(`PASS ${slug}: ${dimensions.map((size) => size.toFixed(2)).join(" × ")} mm`);
  }
  await writeFile(join(directory, "coupon-geometry.json"), JSON.stringify(reports, null, 2));
  const button = parts[2].cut.association.measurements;
  await writeFile(
    join(directory, "PRINT-CHECKLIST.md"),
    `# Electronics fit coupons

Print each coupon STL at 100% using millimetres. The three wall coupons reproduce the openings and ${wall} mm wall thickness from the electronics enclosure fixture. The fixture uses explicit example measurements for missing hardware dimensions. Measure your own hardware before using these dimensions in an enclosure.

| Piece | Check in mm |
| --- | --- |
| Pi 4 USB wall | ${parts[0].cut.widthMm.toFixed(2)} × ${parts[0].cut.heightMm.toFixed(2)} opening |
| ESP32 USB wall | ${parts[1].cut.widthMm.toFixed(2)} × ${parts[1].cut.heightMm.toFixed(2)} opening |
| Tactile wall | ${parts[2].cut.widthMm.toFixed(2)} hole |
| Plunger | ${button.plunger.shaft.toFixed(2)} shaft and ${button.plunger.diameter.toFixed(2)} cap |
| Retainer | ${(button.plunger.shaft + 2 * button.horizontal).toFixed(2)} blind socket, ${button.plunger.retainer.diameter.toFixed(2)} outside diameter, ${button.plunger.retainer.thickness.toFixed(2)} thickness |

- Pi 4 USB 3 and ESP32 Micro USB. Check wall thickness and opening width and height with calipers. Test the connector housing and actual cable plug. Check shell engagement and overmould clearance against both wall faces.
- Button. Measure shaft and hole diameters. Slide the shaft through from outside. Fit the blind-socket retainer from inside and check free movement before bonding. Keep adhesive off the wall and sliding surfaces. Fit the switch after the bond cures.
- Check that the cap stops inward motion and the retainer prevents withdrawal. Record free play, actuation travel, return and any binding. Repeated actuation and adhesive retention require a physical trial.
`,
  );
} finally {
  layers.dispose();
}

if (args.includes("--enclosure-parts")) {
  const destination = join(directory, "evaluated-native");
  await mkdir(destination, { recursive: true });
  const editor = new IndependentLayers(input);
  const evaluated = [];
  try {
    for (const part of input.layerStack.layers.filter(({ assemblyPart }) => assemblyPart)) {
      const start = performance.now();
      const { data, report } = await exportPartSTL(
        editor,
        part.id,
        undefined,
        "high",
        512 * 1024 ** 2,
      );
      assert.equal(report.components, 1, part.name);
      for (const key of [
        "boundaryEdges",
        "nonManifoldEdges",
        "inconsistentEdges",
        "degenerateTriangles",
        "invertedComponents",
      ])
        assert.equal(report[key], 0, `${part.name}: ${key}`);
      const slug = part.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      await writeFile(join(destination, `${slug}.stl`), new Uint8Array(data));
      evaluated.push({ name: part.name, ms: performance.now() - start, ...report });
      await writeFile(join(destination, "report.json"), JSON.stringify(evaluated, null, 2));
      console.log(
        `PASS ${part.name}: ${report.dimensions.map((size) => size.toFixed(2)).join(" × ")} mm`,
      );
    }
  } finally {
    editor.dispose();
  }
}
