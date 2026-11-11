import "../scripts/compile-core.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { BrickVolume } from "../scripts/research/brick-volume.mjs";
import { extractMesh } from "../work/test-build/mesh.mjs";
import { SDFVolume } from "../work/test-build/sdf.mjs";

test("lossless signed constants, zero and no-surface semantics", () => {
  for (const value of [2, -2, 0, -0]) {
    const d = new SDFVolume(16, 1, false);
    d.values.fill(value);
    const s = new BrickVolume(d);
    assert.equal(s.typedBytes, 0);
    for (let i = 0; i < d.values.length; i++) assert(Object.is(s.readVoxel(i), value));
    assert.equal(extractMesh(s).getAttribute("position").count, 0);
  }
});
test("grown negative lattice, boundaries, normals and exterior sampling are exact", () => {
  const d = new SDFVolume(16, 1, false, { dimensions: [25, 21, 19], latticeMin: [-9, -5, -3] });
  for (let z = 0; z < 19; z++)
    for (let y = 0; y < 21; y++)
      for (let x = 0; x < 25; x++)
        d.values[d.index(x, y, z)] =
          Math.hypot(d.coordinate(x), d.coordinate(y, 1), d.coordinate(z, 2)) - 0.6;
  for (const b of [8, 16]) {
    const s = new BrickVolume(d, b);
    for (let i = 0; i < d.values.length; i++) assert.equal(s.readVoxel(i), d.values[i]);
    for (let i = 0; i < 200; i++) {
      const p = [Math.sin(i) * 2, Math.cos(i) * 2, Math.sin(i * 7)];
      const q = { x: p[0], y: p[1], z: p[2] };
      assert.equal(s.sampleLocal(q), d.sampleLocal(q));
      assert.deepEqual(s.normalAt(p), d.normalAt(p));
    }
    const a = extractMesh(d),
      c = extractMesh(s);
    assert.deepEqual(c.getAttribute("position").array, a.getAttribute("position").array);
    assert.deepEqual(c.getAttribute("normal").array, a.getAttribute("normal").array);
    a.dispose();
    c.dispose();
  }
});
test("prototype refuses missing regions, nonfinite samples and allocation overflow", () => {
  const d = new SDFVolume(8, 1);
  assert.throws(() => new BrickVolume(d, 8, 0), /cap/);
  const s = new BrickVolume(d);
  s.bricks.clear();
  assert.throws(() => s.readVoxel(0), /Missing/);
  assert.throws(() => s.readVoxel(-1), /index/);
  d.values[0] = NaN;
  assert.throws(() => new BrickVolume(d), /Nonfinite/);
});

test("cropped global origins and mixed signed constant bricks preserve region identity", () => {
  const source = {
    resolution: 32,
    extent: 1,
    step: 2 / 31,
    dimensions: [16, 16, 16],
    latticeMin: [-8, 8, -16],
    index: (x, y, z) => x + 16 * (y + 16 * z),
    readVoxel: (i) => (i % 16 < 8 ? -2 : 2),
  };
  const s = new BrickVolume(source);
  assert.equal(s.typedBytes, 0);
  assert.equal(s.bricks.get("-1,1,-2"), -2);
  assert.equal(s.bricks.get("0,1,-2"), 2);
  for (let i = 0; i < 16 ** 3; i++) assert.equal(s.readVoxel(i), source.readVoxel(i));
  assert.equal(s.coordinate(0, 2), -1 - 16 * source.step);
  const plane = new SDFVolume(17, 1, false);
  for (let i = 0; i < plane.values.length; i++) plane.values[i] = plane.coordinate(i % 17);
  const a = extractMesh(plane),
    b = extractMesh(new BrickVolume(plane));
  assert.deepEqual(a.getAttribute("position").array, b.getAttribute("position").array);
  assert.deepEqual(a.getAttribute("normal").array, b.getAttribute("normal").array);
  a.dispose();
  b.dispose();
});
