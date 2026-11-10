import assert from "node:assert/strict";
import test from "node:test";
import { FIXTURES, POSES } from "../scripts/fixtures/personal-stamp-baseline.mjs";

test("baseline fields have finite positive boundaries and specified solid/empty probes", () => {
  assert.equal(FIXTURES.length, 11);
  assert.equal(new Set(FIXTURES.map((f) => f.id)).size, 11);
  for (const f of FIXTURES) {
    for (const [x, y, z, sign] of f.probes) assert.equal(Math.sign(f.sample(x, y, z)), sign, f.id);
    for (const axis of [0, 1, 2])
      for (const side of [-50, 50]) {
        for (let a = -50; a <= 50; a += 5)
          for (let b = -50; b <= 50; b += 5) {
            const p = [a, b];
            p.splice(axis, 0, side);
            const value = f.sample(...p);
            assert(Number.isFinite(value) && value > 0, `${f.id}: boundary ${p}`);
          }
      }
  }
});

test("reference holes and slots stay open through Z; thin bars retain their stated width", () => {
  for (const f of FIXTURES.filter((f) => f.id === "hollow-part" || f.id.startsWith("slot-"))) {
    for (let z = -15; z <= 15; z += 0.25) assert(f.sample(0, 0, z) > 0, f.id);
  }
  for (const f of FIXTURES.filter((f) => f.id.startsWith("slot-"))) {
    const width = f.featuresMM[0];
    assert(f.sample(0, width / 2 - 0.01, 0) > 0);
    assert(f.sample(0, width / 2 + 0.01, 0) < 0);
  }
  for (const f of FIXTURES.filter((f) => f.id.startsWith("long-thin-"))) {
    const width = f.featuresMM[0];
    assert(f.sample(0, 0, width / 2 - 0.01) < 0);
    assert(f.sample(0, 0, width / 2 + 0.01) > 0);
  }
});

test("pose trace is bounded and repeatable for later stamp replay", () => {
  assert.equal(POSES.length, 20);
  for (const p of POSES) {
    assert(p.positionMM.every((v) => Number.isFinite(v) && Math.abs(v) <= 10));
    assert(p.rotationXYZ.every(Number.isFinite));
    assert.equal(p.uniformScale, 0.5);
  }
  assert.deepEqual(POSES[0], {
    positionMM: [0, -9.5, 0],
    rotationXYZ: [0, 0, 0],
    uniformScale: 0.5,
  });
});
