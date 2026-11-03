import assert from "node:assert/strict";
import test from "node:test";
import { Matrix4, Vector3 } from "three";
import { RadialMoveField } from "../work/test-build/move-field.mjs";

const field = (radius = 0.4, strength = 0.7, stiffness = 1) => {
  const f = new RadialMoveField();
  f.configure("elastic", stiffness);
  f.capture(new Vector3(0.1, -0.2, 0.3), radius, 2, strength);
  f.setDisplacement(new Vector3(0.2, 0.1, -0.3));
  return f;
};
test("Kelvinlet center is finite with calibrated strength and inverse stiffness; support is exact", () => {
  for (const radius of [0.001, 0.1, 1, 10])
    for (const stiffness of [0.25, 1, 4]) {
      const f = field(radius, 0.7, stiffness),
        out = new Vector3(),
        expected = f.center.clone().addScaledVector(f.delta, 1 / stiffness);
      assert(f.position(f.center, out).distanceTo(expected) < 1e-12);
      for (const factor of [1, 1.001, 2]) {
        const p = f.center.clone().add(new Vector3(radius * factor, 0, 0));
        assert(f.position(p, out).equals(p));
      }
      const p = f.center.clone().addScalar(radius * 0.1),
        copy = p.clone();
      assert(f.position(p, p).distanceTo(f.position(copy, out)) < 1e-12);
    }
});
test("Kelvinlet tensor matches independent paper formula and has transverse elastic response", () => {
  const f = field(),
    p = f.center.clone().add(new Vector3(0.08, 0.06, 0)),
    r = p.clone().sub(f.center),
    e = f.radius / 3,
    s = Math.sqrt(r.lengthSq() + e * e),
    a = 1,
    b = 0.5,
    K = f.delta
      .clone()
      .multiplyScalar((a - b) / s + (a * e * e) / (2 * s ** 3))
      .addScaledVector(r, (b * r.dot(f.delta)) / s ** 3)
      .multiplyScalar(
        (e * Math.pow(1 - r.lengthSq() / f.radius ** 2, f.falloff + 1)) / f.stiffness,
      );
  assert(f.position(p, new Vector3()).sub(p).distanceTo(K) < 1e-12);
  f.setDisplacement(new Vector3(0, 0, 0.2));
  p.copy(f.center).add(new Vector3(0.08, 0, 0.06));
  assert(f.position(p, new Vector3()).x > p.x);
});
test("analytic cofactor normals match independent central-difference tangents including folds and support boundary", () => {
  for (const travel of [0.05, 1, 4]) {
    const f = field();
    f.setDisplacement(new Vector3(travel, -travel * 0.2, travel * 0.5));
    for (const offset of [
      [0, 0, 0],
      [0.08, 0.03, 0.04],
      [0.399999, 0, 0],
      [0.4, 0, 0],
      [0.5, 0.1, 0],
      [-0.12, 0.09, 0.04],
    ]) {
      const p = f.center.clone().add(new Vector3(...offset)),
        n = new Vector3(0.3, 0.4, 0.8).normalize(),
        u = new Vector3().crossVectors(n, new Vector3(0, 1, 0)).normalize(),
        v = new Vector3().crossVectors(n, u),
        h = 1e-6;
      const tangent = (t) =>
          f
            .position(p.clone().addScaledVector(t, h), new Vector3())
            .sub(f.position(p.clone().addScaledVector(t, -h), new Vector3()))
            .multiplyScalar(0.5 / h),
        numeric = new Vector3().crossVectors(tangent(u), tangent(v)).normalize(),
        actual = f.normal(p, n, new Vector3());
      assert(
        numeric.distanceTo(actual) < 1e-5,
        `${travel} ${offset}: ${numeric.distanceTo(actual)}`,
      );
      assert(actual.toArray().every(Number.isFinite));
    }
  }
});
test("Kelvinlet is rotation equivariant and conservative bounds contain all sampled long pull directions", () => {
  const f = field(0.4, 0.7, 0.25),
    g = field(0.4, 0.7, 0.25),
    rot = new Matrix4().makeRotationAxis(new Vector3(1, 2, 3).normalize(), 0.8);
  g.center.copy(f.center).applyMatrix4(rot);
  g.delta.copy(f.delta).transformDirection(rot).multiplyScalar(f.delta.length());
  const bounds = f.affectedBounds();
  for (let i = 0; i < 500; i++) {
    const p = f.center
        .clone()
        .add(new Vector3(Math.sin(i), Math.cos(i * 3), Math.sin(i * 7)).multiplyScalar(0.4)),
      out = f.position(p, new Vector3());
    assert(
      g
        .position(p.clone().applyMatrix4(rot), new Vector3())
        .distanceTo(out.clone().applyMatrix4(rot)) < 1e-12,
    );
    for (let a = 0; a < 3; a++)
      assert(out.getComponent(a) >= bounds.min[a] && out.getComponent(a) <= bounds.max[a]);
  }
});
test("Kelvinlet rejects invalid configuration and does not accumulate held updates", () => {
  const f = field(),
    p = f.center.clone().addScalar(0.04),
    first = f.position(p, new Vector3());
  for (let i = 0; i < 100; i++) f.setDisplacement(new Vector3(0.2, 0.1, -0.3));
  assert(f.position(p, new Vector3()).equals(first));
  for (const stiffness of [NaN, 0, -1, Infinity, 4.1])
    assert.throws(() => f.configure("elastic", stiffness));
});
