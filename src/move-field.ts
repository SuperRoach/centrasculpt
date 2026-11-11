import { Vector3 } from "three";
import type { MoveInteraction } from "./tool-preferences";
import type { VolumeBounds } from "./volume-store";
/** Shared field contract for preview and reconstruction evaluation.
 * Original-position CPU evaluation is shared with preview and persistent reconstruction. */
export interface DeformationField {
  position(point: Vector3, out: Vector3): Vector3;
  normal(point: Vector3, normal: Vector3, out: Vector3): Vector3;
  affectedBounds(): VolumeBounds;
}
export const MOVE_DEFORMATION_MODES = Object.freeze([
  { id: "non-elastic", label: "Non-Elastic", enabled: true },
  { id: "elastic", label: "Elastic", enabled: true },
] as const);
export const FREE_MOVE_CORE = 0.25;
export class RadialMoveField implements DeformationField {
  readonly center = new Vector3();
  readonly delta = new Vector3();
  radius = 0.3;
  falloff = 2;
  strength = 1;
  mode: "non-elastic" | "elastic" = "non-elastic";
  stiffness = 1;
  private readonly r = new Vector3();
  private readonly columns = [new Vector3(), new Vector3(), new Vector3()];
  private readonly cross = new Vector3();
  configure(mode: "non-elastic" | "elastic", stiffness = 1): void {
    if (
      !["non-elastic", "elastic"].includes(mode) ||
      !Number.isFinite(stiffness) ||
      stiffness < 0.25 ||
      stiffness > 4
    )
      throw new Error("Invalid Elastic stiffness.");
    this.mode = mode;
    this.stiffness = stiffness;
  }
  /** Compactly windowed, center-normalized regularized Kelvinlet, nu=0.5.
   * epsilon=radius/3; K=(.5/s+.5*eps²/s³)I+.5*rrT/s³.
   * eps*K(0)=I. Window supplies exact finite support; stiffness scales compliance. */
  private elastic(point: Vector3, out: Vector3, column = -1): Vector3 {
    const r = this.r.copy(point).sub(this.center),
      rr = r.lengthSq(),
      R2 = this.radius * this.radius,
      q = rr / R2;
    if (q >= 1) return out.set(0, 0, 0);
    const e = this.radius / 3,
      s = Math.sqrt(rr + e * e),
      inv = 1 / s,
      inv3 = inv * inv * inv,
      inv5 = inv3 * inv * inv,
      n = this.falloff + 1,
      t = (1 - q) ** n / this.stiffness,
      A = e * (0.5 * inv + 0.5 * e * e * inv3),
      B = 0.5 * e * inv3,
      dot = r.dot(this.delta);
    if (column < 0)
      return out
        .copy(this.delta)
        .multiplyScalar(A * t)
        .addScaledVector(r, B * dot * t);
    const rj = r.getComponent(column),
      dj = this.delta.getComponent(column),
      dt = (((-2 * n * rj) / R2) * (1 - q) ** (n - 1)) / this.stiffness,
      dA = e * (-0.5 * inv3 - 1.5 * e * e * inv5) * rj,
      dB = -1.5 * e * inv5 * rj;
    out
      .copy(this.delta)
      .multiplyScalar(dA * t + A * dt)
      .addScaledVector(r, (dB * t + B * dt) * dot + B * t * dj);
    out.setComponent(column, out.getComponent(column) + B * t * dot);
    return out;
  }
  interaction: MoveInteraction = "translate";
  readonly axis = new Vector3(0, 1, 0);
  angle = 0;
  setRotation(axis: Vector3, angle: number): void {
    if (
      !Number.isFinite(axis.x) ||
      !Number.isFinite(axis.y) ||
      !Number.isFinite(axis.z) ||
      axis.lengthSq() < 1e-12 ||
      !Number.isFinite(angle)
    )
      throw new Error("Invalid Move rotation.");
    this.axis.copy(axis).normalize();
    this.angle = angle;
  }
  private readonly rotated = new Vector3();
  private readonly angleGradient = new Vector3();
  private readonly translationGradient = new Vector3();
  private rotation(point: Vector3, out: Vector3): Vector3 {
    const r = this.rotated.copy(point).sub(this.center),
      w = this.weight(point),
      profile = this.interaction === "twist" ? (1 + r.dot(this.axis) / this.radius) * 0.5 : 1;
    out
      .copy(r)
      .applyAxisAngle(this.axis, this.angle * w * profile)
      .add(this.center);
    if (this.interaction === "free") out.addScaledVector(this.delta, w);
    return out;
  }
  private readonly g = new Vector3();
  capture(center: Vector3, radius: number, falloff: number, strength: number): void {
    if (
      !center.toArray().every(Number.isFinite) ||
      !Number.isFinite(radius) ||
      radius <= 0 ||
      !Number.isFinite(falloff) ||
      falloff < 1 ||
      falloff > 4 ||
      !Number.isFinite(strength) ||
      strength < 0.01 ||
      strength > 1
    )
      throw new Error("Invalid Move preview parameters.");
    this.center.copy(center);
    this.radius = radius;
    this.falloff = falloff;
    this.strength = strength;
    this.delta.set(0, 0, 0);
    this.angle = 0;
    this.interaction = "translate";
  }
  setDisplacement(value: Vector3): void {
    if (
      !Number.isFinite(Math.fround(value.x)) ||
      !Number.isFinite(Math.fround(value.y)) ||
      !Number.isFinite(Math.fround(value.z))
    )
      throw new Error("Invalid Move displacement.");
    this.delta.copy(value).multiplyScalar(this.strength);
    // Radius controls the initial influence, not allowed controller travel.
    // Long pulls stretch existing triangles before the release-time SDF reconstruction.
  }
  weight(point: Vector3): number {
    const distanceSquared = point.distanceToSquared(this.center) / (this.radius * this.radius),
      q = this.interaction === "free" ? this.coreDistanceSquared(distanceSquared) : distanceSquared;
    return q >= 1 ? 0 : (1 - q) ** (this.falloff + 1);
  }
  private coreDistanceSquared(distanceSquared: number): number {
    const t = Math.max(0, (Math.sqrt(distanceSquared) - FREE_MOVE_CORE) / (1 - FREE_MOVE_CORE));
    return t * t;
  }
  gradient(point: Vector3, out: Vector3): Vector3 {
    const distanceSquared = point.distanceToSquared(this.center) / (this.radius * this.radius),
      free = this.interaction === "free",
      q = free ? this.coreDistanceSquared(distanceSquared) : distanceSquared;
    return q >= 1 || (free && q === 0)
      ? out.set(0, 0, 0)
      : out
          .copy(point)
          .sub(this.center)
          .multiplyScalar(
            (-2 *
              (this.falloff + 1) *
              (1 - q) ** this.falloff *
              (free ? Math.sqrt(q / distanceSquared) / (1 - FREE_MOVE_CORE) : 1)) /
              (this.radius * this.radius),
          );
  }
  position(point: Vector3, out: Vector3): Vector3 {
    if (this.interaction !== "translate") return this.rotation(point, out);
    if (this.mode === "elastic") {
      const x = point.x,
        y = point.y,
        z = point.z;
      this.elastic(point, out);
      out.x += x;
      out.y += y;
      out.z += z;
      return out;
    }
    const weight = this.weight(point);
    return out.copy(point).addScaledVector(this.delta, weight);
  }
  normal(point: Vector3, normal: Vector3, out: Vector3): Vector3 {
    if (this.interaction !== "translate") {
      const r = this.rotated.copy(point).sub(this.center),
        w = this.weight(point),
        profile = this.interaction === "twist" ? (1 + r.dot(this.axis) / this.radius) * 0.5 : 1,
        theta = this.angle * w * profile;
      this.gradient(point, this.translationGradient);
      this.angleGradient.copy(this.translationGradient).multiplyScalar(this.angle * profile);
      if (this.interaction === "twist")
        this.angleGradient.addScaledVector(this.axis, (this.angle * w) / (2 * this.radius));
      r.applyAxisAngle(this.axis, theta);
      this.g.crossVectors(this.axis, r);
      for (let j = 0; j < 3; j++)
        this.columns[j]
          .set(0, 0, 0)
          .setComponent(j, 1)
          .applyAxisAngle(this.axis, theta)
          .addScaledVector(this.g, this.angleGradient.getComponent(j));
      if (this.interaction === "free")
        for (let j = 0; j < 3; j++)
          this.columns[j].addScaledVector(this.delta, this.translationGradient.getComponent(j));
      const [a, b, c] = this.columns,
        nx = normal.x,
        ny = normal.y,
        nz = normal.z;
      out
        .crossVectors(b, c)
        .multiplyScalar(nx)
        .addScaledVector(this.cross.crossVectors(c, a), ny)
        .addScaledVector(this.cross.crossVectors(a, b), nz);
      return out.lengthSq() > 1e-12 ? out.normalize() : out.copy(normal).normalize();
    }
    if (this.mode === "elastic") {
      for (let j = 0; j < 3; j++) {
        this.elastic(point, this.columns[j], j);
        this.columns[j].setComponent(j, this.columns[j].getComponent(j) + 1);
      }
      const [a, b, c] = this.columns;
      const nx = normal.x,
        ny = normal.y,
        nz = normal.z;
      out
        .crossVectors(b, c)
        .multiplyScalar(nx)
        .addScaledVector(this.cross.crossVectors(c, a), ny)
        .addScaledVector(this.cross.crossVectors(a, b), nz);
      return out.lengthSq() > 1e-12 ? out.normalize() : out.copy(normal).normalize();
    }
    const g = this.gradient(point, this.g),
      determinant = 1 + g.dot(this.delta),
      dot = this.delta.dot(normal),
      nx = normal.x,
      ny = normal.y,
      nz = normal.z;
    // Cofactor(J) maps oriented surface normals without dividing by det(J).
    // Remains finite through inversions; a collapsed tangent plane uses the source normal.
    out.copy(normal).multiplyScalar(determinant).addScaledVector(g, -dot);
    return out.lengthSq() > 1e-12 ? out.normalize() : out.set(nx, ny, nz).normalize();
  }
  affectedBounds(): VolumeBounds {
    const c = this.center,
      d = this.delta,
      r = this.radius;
    if (this.interaction === "rotate" || this.interaction === "twist")
      return { min: [c.x - r, c.y - r, c.z - r], max: [c.x + r, c.y + r, c.z + r] };
    if (this.interaction === "translate" && this.mode === "elastic") {
      const m = d.length() / this.stiffness;
      return {
        min: [c.x - r - m, c.y - r - m, c.z - r - m],
        max: [c.x + r + m, c.y + r + m, c.z + r + m],
      };
    }
    return {
      min: [c.x - r + Math.min(0, d.x), c.y - r + Math.min(0, d.y), c.z - r + Math.min(0, d.z)],
      max: [c.x + r + Math.max(0, d.x), c.y + r + Math.max(0, d.y), c.z + r + Math.max(0, d.z)],
    };
  }
}
