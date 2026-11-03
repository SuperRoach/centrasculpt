import {
  Box3,
  BufferAttribute,
  type BufferGeometry,
  Color,
  type Group,
  Mesh,
  type MeshStandardMaterial,
  Vector3,
} from "three";
import { sculptPaint } from "./sculpt-paint";
import type { VolumeStore } from "./volume-store";
export function paintColours(
  geometry: BufferGeometry,
  volume: VolumeStore,
  base: Color,
): Float32Array {
  const p = geometry.getAttribute("position"),
    out = new Float32Array(p.count * 3),
    paint = sculptPaint(volume),
    point = { x: 0, y: 0, z: 0 },
    colour = new Color();
  for (let i = 0; i < p.count; i++) {
    point.x = p.getX(i);
    point.y = p.getY(i);
    point.z = p.getZ(i);
    paint.sample(point, base, colour).toArray(out, i * 3);
  }
  return out;
}
type RefreshState = { volume: VolumeStore; cursor: number; again: boolean };
/** Local attribute updates share the existing draw/material. No SDF remesh. */
export class PaintSurface {
  base = new Color("#afbd94");
  private next = 0;
  private baseKey = "";
  private box = new Box3();
  private states = new WeakMap<object, RefreshState>();
  private settled?: {
    group: Group;
    volume: VolumeStore;
    mesh: number;
    paint: number;
    base: string;
  };
  update(
    group: Group,
    volume: VolumeStore,
    material: MeshStandardMaterial,
    deadline: number,
    meshRevision?: number,
  ) {
    const paint = sculptPaint(volume),
      key = this.base.getHexString(),
      baseChanged = key !== this.baseKey;
    this.baseKey = key;
    const cached = this.settled;
    if (
      meshRevision !== undefined &&
      cached?.group === group &&
      cached.volume === volume &&
      cached.mesh === meshRevision &&
      cached.paint === paint.revision &&
      cached.base === key
    ) {
      material.color.copy(material.vertexColors ? white : this.base);
      return;
    }
    this.settled = undefined;
    const dirty = paint.channels.map((c) => c.takeDirty()),
      all = baseChanged || dirty.includes("all");
    let region = false;
    this.box.makeEmpty();
    for (const b of dirty)
      if (b && b !== "all") {
        region = true;
        for (const corner of [b.min, b.max])
          this.box.expandByPoint(
            new Vector3(
              volume.coordinate(corner[0], 0),
              volume.coordinate(corner[1], 1),
              volume.coordinate(corner[2], 2),
            ),
          );
      }
    if (region) this.box.expandByScalar(volume.step);
    const enabled =
      !paint.empty ||
      group.children.some((o) => o instanceof Mesh && !!o.geometry.getAttribute("color"));
    if (material.vertexColors !== enabled) {
      material.vertexColors = enabled;
      material.needsUpdate = true;
    }
    material.color.copy(enabled ? white : this.base);
    const defaults = material as MeshStandardMaterial & {
      defaultAttributeValues?: Record<string, number[]>;
    };
    if (baseChanged || !defaults.defaultAttributeValues?.color)
      defaults.defaultAttributeValues = {
        ...defaults.defaultAttributeValues,
        color: this.base.toArray(),
      };
    const pending: {
      geometry: BufferGeometry;
      attribute: BufferAttribute | undefined;
      p: ReturnType<BufferGeometry["getAttribute"]>;
      state: RefreshState;
    }[] = [];
    for (const o of group.children) {
      if (!(o instanceof Mesh)) continue;
      const g = o.geometry,
        p = g.getAttribute("position");
      let state = this.states.get(g),
        attr = g.getAttribute("color") as BufferAttribute | undefined;
      const fresh = !state || state.volume !== volume;
      if (fresh) {
        state = { volume, cursor: 0, again: false };
        this.states.set(g, state);
      }
      if (all || (region && (!g.boundingSphere || this.box.intersectsSphere(g.boundingSphere)))) {
        // Finish an in-flight pass before revisiting newer edits, so continuous input cannot starve its tail.
        if (state!.cursor > 0 && state!.cursor < p.count) state!.again = true;
        else state!.cursor = 0;
      }
      if (!enabled) {
        state!.cursor = p.count;
        continue;
      }
      if (!attr) state!.cursor = 0;
      if (state!.cursor < p.count) pending.push({ geometry: g, attribute: attr, p, state: state! });
    }
    const point = { x: 0, y: 0, z: 0 },
      colour = new Color();
    for (let j = 0; j < pending.length; j++) {
      const at = (this.next + j) % pending.length,
        { geometry, p, state } = pending[at];
      let { attribute } = pending[at];
      // Allocate only the admitted chunk; untouched chunks use the base-colour shader default.
      if (!attribute) {
        attribute = new BufferAttribute(new Float32Array(p.count * 3), 3);
        for (let i = 0; i < p.count; i++)
          attribute.setXYZ(i, this.base.r, this.base.g, this.base.b);
        geometry.setAttribute("color", attribute);
      }
      let expired = false;
      const start = state.cursor;
      while (state.cursor < p.count) {
        const i = state.cursor++;
        point.x = p.getX(i);
        point.y = p.getY(i);
        point.z = p.getZ(i);
        paint.sample(point, this.base, colour);
        attribute.setXYZ(i, colour.r, colour.g, colour.b);
        if (state.cursor % 128 === 0 && performance.now() >= deadline) {
          expired = true;
          break;
        }
      }
      if (state.cursor > start) {
        attribute.addUpdateRange(start * 3, (state.cursor - start) * 3);
        attribute.needsUpdate = true;
      }
      if (state.cursor === p.count && state.again) {
        state.cursor = 0;
        state.again = false;
      }
      if (expired || performance.now() >= deadline) {
        this.next = at + 1;
        return;
      }
    }
    this.next = 0;
    if (meshRevision !== undefined && pending.every(({ p, state }) => state.cursor === p.count))
      this.settled = { group, volume, mesh: meshRevision, paint: paint.revision, base: key };
  }
}
const white = new Color(1, 1, 1);
