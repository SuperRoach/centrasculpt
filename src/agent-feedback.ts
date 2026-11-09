import {
  Box3,
  Group,
  type Object3D,
  type PerspectiveCamera,
  Scene,
  Vector2,
  type WebGLRenderer,
} from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutlinePass } from "three/examples/jsm/postprocessing/OutlinePass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import type { AgentActivity } from "./agent-activity";
import { partBounds } from "./assembly-tools";
import type { IndependentLayers } from "./independent-layers";

export { type AgentNavigation, frameAgentBounds } from "./desktop-navigation";
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
/** Presentation-only screen-space silhouettes of visible rendered surfaces. */
export class AgentFeedback {
  readonly group = new Group();
  private owner?: IndependentLayers;
  private revision = "";
  private started = 0;
  readonly selectedObjects: Object3D[] = [];
  opacity = 0.9;
  private composer?: EffectComposer;
  private outlinePass?: OutlinePass;
  private renderPass?: RenderPass;
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
    if (entry.outcome !== "committed") return;
    this.highlightObjects(
      entry.objects.filter((object) => object.status !== "deleted").map((object) => object.id),
    );
  }
  private highlightObjects(ids: readonly string[]): void {
    this.clear();
    const editor = this.editor();
    this.owner = editor;
    this.revision = editor.sourceRevision;
    this.started = this.now();
    const stack = editor.project.layerStack;
    const members = new Set(ids.flatMap((id) => [id, ...stack.hierarchy.descendants(id)]));
    for (const layer of stack.layers) {
      if (!members.has(layer.id) || !stack.hierarchy.get(layer.id).visible) continue;
      const surface = editor.runtime(layer.id).surface.group;
      if (!this.selectedObjects.includes(surface)) this.selectedObjects.push(surface);
    }
    // Boolean mode displays one evaluated composed result, never cutter shells.
    if (editor.viewMode === "boolean" && this.selectedObjects.length) {
      this.selectedObjects.splice(0, this.selectedObjects.length, editor.composite.group);
    }
    this.group.visible = this.selectedObjects.length > 0;
  }
  render(renderer: WebGLRenderer, camera: PerspectiveCamera): boolean {
    if (
      !this.group.visible ||
      !this.selectedObjects.length ||
      this.blocked() ||
      renderer.xr.isPresenting ||
      !(this.scene instanceof Scene)
    )
      return false;
    if (!this.composer) {
      this.composer = new EffectComposer(renderer);
      this.renderPass = new RenderPass(this.scene, camera);
      this.outlinePass = new OutlinePass(new Vector2(1, 1), this.scene, camera);
      // Background meshes must not masquerade as foreground occluders when
      // OutlinePass temporarily installs its depth/mask override materials.
      const drawOutline = this.outlinePass.render.bind(this.outlinePass);
      this.outlinePass.render = (...args) => {
        const backgrounds: Object3D[] = [];
        this.scene.traverse((object) => {
          if (object.visible && object.userData.excludeFromAgentOutline === true) {
            backgrounds.push(object);
            object.visible = false;
          }
        });
        try {
          drawOutline(...args);
        } finally {
          for (const object of backgrounds) object.visible = true;
        }
      };
      this.outlinePass.visibleEdgeColor.set("#00e64d");
      this.outlinePass.hiddenEdgeColor.set(0x000000);
      this.outlinePass.edgeThickness = 12;
      // Match sampling density to the wider border to avoid separated green bands.
      this.outlinePass.separableBlurMaterial1.defines.MAX_RADIUS = 12;
      this.outlinePass.separableBlurMaterial1.needsUpdate = true;
      this.outlinePass.edgeGlow = 0;
      this.outlinePass.downSampleRatio = 1;
      this.composer.addPass(this.renderPass);
      this.composer.addPass(this.outlinePass);
      this.composer.addPass(new OutputPass());
    }
    const size = renderer.getSize(new Vector2());
    this.composer.setPixelRatio(Math.min(renderer.getPixelRatio(), 1.5));
    this.composer.setSize(size.x, size.y);
    this.renderPass!.camera = camera;
    this.outlinePass!.renderCamera = camera;
    this.outlinePass!.selectedObjects = this.selectedObjects;
    this.outlinePass!.edgeStrength = this.opacity * 12;
    this.composer.render();
    return true;
  }
  tick(): boolean {
    if (!this.selectedObjects.length) return false;
    const editor = this.editor(),
      elapsed = this.now() - this.started;
    if (editor !== this.owner || editor.sourceRevision !== this.revision) {
      this.clear();
      return false;
    }
    this.group.visible = !this.blocked();
    if (!this.group.visible) {
      this.started = this.now();
      return true;
    }
    if (elapsed >= 6000) {
      this.clear();
      return false;
    }
    const opacity = this.reducedMotion()
      ? 0.9
      : (0.65 + 0.25 * (0.5 + 0.5 * Math.cos((elapsed * Math.PI) / 650))) *
        Math.min(1, (6000 - elapsed) / 350);
    this.opacity = opacity;
    return true;
  }
  show(ids: readonly string[]): { ok: boolean; message: string } {
    if (this.blocked())
      return { ok: false, message: "Finish the current interaction before framing objects." };
    const bounds = agentVisibleBounds(this.editor(), ids);
    if (!bounds) return { ok: false, message: "These objects are hidden, deleted or unavailable." };
    this.frame(bounds);
    this.highlightObjects(ids);
    return { ok: true, message: "Framed affected objects." };
  }
  clear(): void {
    this.selectedObjects.length = 0;
    if (this.outlinePass) this.outlinePass.selectedObjects = [];
    for (const pass of this.composer?.passes ?? []) pass.dispose();
    this.composer?.dispose();
    this.composer = undefined;
    this.outlinePass = undefined;
    this.renderPass = undefined;
    this.owner = undefined;
    this.group.visible = false;
  }
  dispose(): void {
    this.clear();
    this.group.removeFromParent();
  }
}
