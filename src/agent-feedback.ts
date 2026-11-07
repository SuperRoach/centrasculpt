import { Box3, Box3Helper, Group, type Object3D, type PerspectiveCamera, Vector3 } from "three";
import type { AgentActivity } from "./agent-activity";
import { partBounds } from "./assembly-tools";
import type { IndependentLayers } from "./independent-layers";

export type AgentNavigation = {
  target: Vector3;
  minDistance: number;
  maxDistance: number;
  update: () => unknown;
};
/** An explicit desktop navigation action, never a modelling command or selection edit. */
export function frameAgentBounds(
  camera: PerspectiveCamera,
  controls: AgentNavigation,
  box: Box3,
): void {
  const centre = box.getCenter(new Vector3()),
    radius = Math.max(box.getSize(new Vector3()).length() / 2, 1e-5);
  const vertical = (camera.fov * Math.PI) / 180,
    horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
  const distance = (radius / Math.sin(Math.min(vertical, horizontal) / 2)) * 1.15;
  const direction = camera.position.clone().sub(controls.target);
  if (direction.lengthSq() < 1e-12) direction.set(2.4, 1.7, 3.3);
  direction.normalize();
  controls.minDistance = Math.min(controls.minDistance, distance * 0.8);
  controls.maxDistance = Math.max(controls.maxDistance, distance * 1.2);
  camera.near = Math.min(camera.near, Math.max(1e-7, (distance - radius) / 2));
  camera.far = Math.max(camera.far, distance + radius * 2);
  camera.updateProjectionMatrix();
  controls.target.copy(centre);
  camera.position.copy(centre).addScaledVector(direction, distance);
  camera.lookAt(centre);
  controls.update();
}
export function agentVisibleBounds(
  editor: IndependentLayers,
  ids: readonly string[],
): Box3 | undefined {
  const result = new Box3();
  for (const id of new Set(ids)) {
    try {
      if (!editor.project.layerStack.hierarchy.get(id).visible) continue;
      const box = partBounds(editor, id, true);
      if (!box.isEmpty() && [...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite))
        result.union(box);
    } catch {
      /* Deleted, hidden, empty or unavailable bounds are not navigation targets. */
    }
  }
  if (result.isEmpty()) return;
  editor.group.updateWorldMatrix(true, false);
  return result.applyMatrix4(editor.group.matrixWorld);
}
/** Independent noninteractive bounds outlines, like existing assembly previews. */
export class AgentFeedback {
  readonly group = new Group();
  private owner?: IndependentLayers;
  private revision = "";
  private started = 0;
  private outlines: Box3Helper[] = [];
  constructor(
    readonly scene: Object3D,
    readonly editor: () => IndependentLayers,
    readonly blocked: () => boolean,
    readonly reducedMotion: () => boolean,
    readonly frame: (bounds: Box3) => void,
    readonly now: () => number = () => performance.now(),
  ) {
    this.group.name = "Agent activity outlines";
    this.group.raycast = () => {};
    scene.add(this.group);
  }
  highlight(entry: AgentActivity): void {
    this.clear();
    if (entry.outcome !== "committed" || this.blocked()) return;
    const editor = this.editor();
    this.owner = editor;
    this.revision = editor.sourceRevision;
    this.started = this.now();
    for (const object of entry.objects) {
      if (object.status === "deleted") continue;
      const box = agentVisibleBounds(editor, [object.id]);
      if (!box) continue;
      const outline = new Box3Helper(box, 0x83a973);
      outline.raycast = () => {};
      outline.renderOrder = 998;
      for (const material of Array.isArray(outline.material)
        ? outline.material
        : [outline.material]) {
        material.transparent = true;
        material.depthWrite = false;
        material.depthTest = false;
        material.opacity = 0.65;
      }
      this.group.add(outline);
      this.outlines.push(outline);
    }
    this.group.visible = this.outlines.length > 0;
  }
  tick(): boolean {
    if (!this.outlines.length) return false;
    const editor = this.editor(),
      elapsed = this.now() - this.started;
    if (editor !== this.owner || editor.sourceRevision !== this.revision || elapsed >= 2000) {
      this.clear();
      return false;
    }
    this.group.visible = !this.blocked();
    const opacity = this.reducedMotion()
      ? 0.65
      : (0.38 + 0.27 * (0.5 + 0.5 * Math.cos((elapsed * Math.PI) / 650))) *
        Math.min(1, (2000 - elapsed) / 350);
    for (const outline of this.outlines)
      for (const material of Array.isArray(outline.material)
        ? outline.material
        : [outline.material])
        material.opacity = opacity;
    return true;
  }
  show(ids: readonly string[]): { ok: boolean; message: string } {
    if (this.blocked())
      return { ok: false, message: "Finish the current interaction before framing objects." };
    const bounds = agentVisibleBounds(this.editor(), ids);
    if (!bounds) return { ok: false, message: "These objects are hidden, deleted or unavailable." };
    this.frame(bounds);
    return { ok: true, message: "Framed affected objects." };
  }
  clear(): void {
    for (const outline of this.outlines) {
      outline.removeFromParent();
      outline.geometry.dispose();
      for (const material of Array.isArray(outline.material)
        ? outline.material
        : [outline.material])
        material.dispose();
    }
    this.outlines = [];
    this.owner = undefined;
    this.group.visible = false;
  }
  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }
}
