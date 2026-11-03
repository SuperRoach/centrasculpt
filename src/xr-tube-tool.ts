import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  DoubleSide,
  Group,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Sphere,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import { CLAY_TIP_REACH_METRES, filterClayPath, type PathPoint } from "./clay-path";
import type { EditorToolState } from "./editor-tool-state";
import type { IndependentLayers } from "./independent-layers";
import { pickEditableLayer } from "./layer-picking";
import { PreparedTube, simplifyTubePath, type TubeSource, validateTube } from "./procedural-tube";
import type { XRStrokeInteraction } from "./xr-clay-stroke";
import type { XRControllerState } from "./xr-input";
export type TubeInputState = Pick<
  XRControllerState,
  "connected" | "tracked" | "gripTracked" | "role" | "connectionId" | "stick"
> & { buttons: Pick<XRControllerState["buttons"], "trigger">; pointing?: boolean };
/** All helpers are siblings of project geometry. Existing stroke routing owns
 * trigger/menu/grip/lifecycle cancellation, and the shared preview lock blocks edits. */
export class XRTubeTool implements XRStrokeInteraction {
  readonly preview = new Group();
  readonly guides = new Group();
  private readonly linePositions = new BufferAttribute(new Float32Array(8192 * 3), 3);
  private readonly skinPositions = new BufferAttribute(new Float32Array(511 * 8 * 6 * 3), 3);
  private readonly handles: Mesh[] = [];
  private readonly lineGeometry = new BufferGeometry();
  private readonly lineMaterial = new LineBasicMaterial({
    color: "#66ebdd",
    depthTest: false,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  });
  private readonly line = new Line(this.lineGeometry, this.lineMaterial);
  private readonly handleGeometry = new SphereGeometry(0.025, 12, 8);
  private readonly hollowGeometry = new TorusGeometry(0.025, 0.004, 6, 24);
  private readonly hoverMaterial = new MeshBasicMaterial({
    color: "#66ebdd",
    depthTest: false,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  });
  private readonly selectedLine = new Mesh(new BufferGeometry(), this.lineMaterial);
  private hoverPointId: string | null = null;
  private lineHovered = false;
  private previewLayerId: string | null = null;
  private hoveredTubeId: string | null = null;
  private readonly handleMaterial = new MeshBasicMaterial({
    color: "#fff0a3",
    depthTest: false,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  });
  private readonly skinGeometry = new BufferGeometry();
  private readonly skinMaterial = new MeshBasicMaterial({
    color: "#66dfce",
    transparent: true,
    opacity: 0.55,
    side: DoubleSide,
    depthWrite: false,
  });
  private readonly skin = new Mesh(this.skinGeometry, this.skinMaterial);
  private readonly ray = new Raycaster();
  private readonly anchor = new Matrix4();
  private held = false;
  private editing = false;
  private radiusHeld = false;
  private armed = false;
  private stickArmed = false;
  private owner = 0;
  private project: unknown;
  private target = "";
  private pointId = "";
  private distance = 0.2;
  private offset = new Vector3();
  private raw: PathPoint[] = [];
  private draft: TubeSource | null = null;
  private pending: AbortController | null = null;
  private lastTime = 0;
  private cacheKey = "";
  private note = "";
  private capturedMode = "";
  private capturedLayers?: IndependentLayers;
  get active(): boolean {
    return this.held || this.radiusHeld || !!this.pending;
  }
  get liveSizing(): "tube-radius" | null {
    return this.held && !this.editing && this.capturedMode === "tube" ? "tube-radius" : null;
  }
  get hoverTarget(): "point" | "spline" | null {
    return this.hoverPointId ? "point" : this.lineHovered || this.hoveredTubeId ? "spline" : null;
  }
  get feedback(): string {
    return this.pending ? "Regenerating Tube · source preserved until ready" : this.note;
  }
  constructor(
    private readonly layers: () => IndependentLayers,
    private readonly tools: EditorToolState,
    root: Group,
    private readonly changed: () => void = () => {},
    private readonly issue: (event: "cancel" | "error") => void = () => {},
    private readonly rayReach = 3,
  ) {
    this.lineGeometry.setAttribute("position", this.linePositions);
    this.skinGeometry.setAttribute("position", this.skinPositions);
    this.preview.matrixAutoUpdate = false;
    // Layer groups set their own render order. Draw the spline after those surfaces,
    // including the transparent draft skin, so points remain visible inside the tube.
    this.preview.renderOrder = 10000;
    this.guides.renderOrder = 10001;
    this.line.renderOrder = 1001;
    this.selectedLine.renderOrder = 1002;
    this.selectedLine.visible = false;
    this.preview.add(this.skin, this.line, this.selectedLine, this.guides);
    root.add(this.preview);
    this.preview.visible = false;
  }
  cancel(): void {
    if (this.active) this.issue("cancel");
    this.pending?.abort();
    this.pending = null;
    this.held = false;
    this.editing = false;
    this.radiusHeld = false;
    this.armed = false;
    this.stickArmed = false;
    this.draft = null;
    this.raw = [];
    this.preview.visible = false;
    this.cacheKey = "";
    this.hoverPointId = null;
    this.lineHovered = false;
    this.hoveredTubeId = null;
    this.release();
  }
  private release(): void {
    this.capturedLayers?.endPreview(this);
    this.tools.endPreview(this);
    this.capturedLayers = undefined;
  }
  private acquire(l: IndependentLayers): void {
    this.tools.beginPreview(this);
    try {
      l.beginPreview(this);
    } catch (e) {
      this.tools.endPreview(this);
      throw e;
    }
    this.capturedLayers = l;
    this.project = l.project;
    this.target = l.active.layer.id;
    this.capturedMode = this.tools.active;
  }
  private finish(): void {
    const source = this.draft;
    if (!source) {
      this.cancel();
      return;
    }
    const l = this.layers(),
      id = this.editing ? this.target : undefined;
    this.release();
    this.held = false;
    this.radiusHeld = false;
    const original = l.active.layer.procedural;
    if (
      id &&
      original &&
      source.points.length === original.points.length &&
      source.points.every(
        (point, i) =>
          point.id === original.points[i].id &&
          Math.abs(point.radius - original.points[i].radius) < 1e-12 &&
          point.position.every(
            (value, axis) => Math.abs(value - original.points[i].position[axis]) < 1e-9,
          ),
      )
    ) {
      this.draft = null;
      this.cacheKey = "";
      return;
    }
    const abort = new AbortController();
    this.pending = abort;
    void l
      .regenerateTube(source, id, abort.signal)
      .then(() => {
        if (this.pending !== abort) return;
        this.note = "Tube ready · grab a spline point to reshape";
        this.changed();
      })
      .catch((error) => {
        if (this.pending === abort) {
          this.issue("error");
          this.note = error instanceof Error ? error.message : String(error);
        }
      })
      .finally(() => {
        if (this.pending === abort) {
          this.pending = null;
          this.draft = null;
          this.editing = false;
          this.preview.visible = false;
          this.cacheKey = "";
        }
      });
  }
  private paint(
    source: TubeSource,
    matrix: Matrix4,
    handles: boolean,
    layerId: string | null = handles ? this.layers().project.activeLayerId : null,
  ): void {
    this.previewLayerId = layerId;
    const key = JSON.stringify([source, handles]);
    this.preview.visible = true;
    this.skin.visible = !handles || this.held || this.radiusHeld;
    this.preview.matrix.copy(matrix);
    if (this.preview.parent) {
      this.preview.parent.updateWorldMatrix(true, false);
      this.preview.matrix.premultiply(this.preview.parent.matrixWorld.clone().invert());
    }
    this.preview.updateWorldMatrix(false, true);
    if (key === this.cacheKey) {
      this.styleHandles();
      return;
    }
    this.cacheKey = key;
    const p = new PreparedTube(source, 0.04),
      samples = p.samples;
    samples.forEach((s, i) => {
      this.linePositions.setXYZ(i, s.p.x, s.p.y, s.p.z);
    });
    this.linePositions.needsUpdate = true;
    this.lineGeometry.setDrawRange(0, samples.length);
    this.line.frustumCulled = false;
    if (handles) {
      this.selectedLine.geometry.dispose();
      this.selectedLine.geometry = new TubeGeometry(
        new CatmullRomCurve3(
          samples.map((s) => s.p.clone()),
          source.closed,
          "centripetal",
        ),
        Math.min(512, samples.length - 1),
        0.007,
        6,
        source.closed,
      );
    }
    // Bounded 8-sided radius preview; final surface always comes from the SDF cache.
    const count = Math.min(512, samples.length);
    let vertexCount = 0;
    const rings: Vector3[][] = [];
    for (let j = 0; j < count; j++) {
      const i = Math.round((j * (samples.length - 1)) / (count - 1)),
        s = samples[i],
        t = samples[Math.min(samples.length - 1, i + 1)].p
          .clone()
          .sub(samples[Math.max(0, i - 1)].p)
          .normalize();
      if (t.lengthSq() < 1e-10) t.set(1, 0, 0);
      const u = new Vector3()
          .crossVectors(t, Math.abs(t.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1))
          .normalize(),
        v = new Vector3().crossVectors(t, u);
      rings.push(
        Array.from({ length: 8 }, (_, k) =>
          s.p
            .clone()
            .addScaledVector(u, Math.cos((k * Math.PI) / 4) * s.r)
            .addScaledVector(v, Math.sin((k * Math.PI) / 4) * s.r),
        ),
      );
    }
    for (let j = 1; j < count; j++)
      for (let k = 0; k < 8; k++) {
        const a = rings[j - 1][k],
          b = rings[j - 1][(k + 1) % 8],
          c = rings[j][k],
          d = rings[j][(k + 1) % 8];
        for (const p of [a, c, b, b, c, d]) this.skinPositions.setXYZ(vertexCount++, p.x, p.y, p.z);
      }
    this.skinPositions.needsUpdate = true;
    this.skinGeometry.setDrawRange(0, vertexCount);
    this.skin.frustumCulled = false;
    for (const h of this.handles) h.visible = false;
    if (handles)
      source.points.forEach((point, i) => {
        let mesh = this.handles[i];
        if (!mesh) {
          mesh = new Mesh(this.handleGeometry, this.handleMaterial);
          this.handles.push(mesh);
          this.guides.add(mesh);
        }
        mesh.visible = true;
        mesh.position.fromArray(point.position);
        mesh.scale.setScalar(point.id === this.tools.splinePointId ? 1.5 : 1);
        mesh.userData.pointId = point.id;
        mesh.renderOrder = 1000;
      });
    this.styleHandles();
    this.preview.updateWorldMatrix(false, true);
  }
  private styleHandles(): void {
    const activeLayer = this.previewLayerId === this.layers().project.activeLayerId,
      selected = activeLayer && this.tools.tubeSplineSelected;
    this.selectedLine.visible =
      this.guides.children.some((h) => h.visible) && (selected || this.lineHovered);
    this.lineMaterial.color.set(selected ? "#fff0a3" : this.lineHovered ? "#9effee" : "#66ebdd");
    const normal = this.ray.ray.direction
      .clone()
      .negate()
      .transformDirection(this.preview.matrixWorld.clone().invert());
    for (const handle of this.handles) {
      const hover = handle.userData.pointId === this.hoverPointId,
        active = activeLayer && handle.userData.pointId === this.tools.splinePointId;
      handle.geometry = hover || active ? this.handleGeometry : this.hollowGeometry;
      handle.material = hover ? this.hoverMaterial : this.handleMaterial;
      handle.scale.setScalar(hover ? 1.35 : active ? 1.5 : 1);
      handle.quaternion.setFromUnitVectors(new Vector3(0, 0, 1), normal);
    }
  }
  private hitHandle(): { object: Mesh; distance: number } | undefined {
    let best: { object: Mesh; distance: number } | undefined;
    for (const object of this.handles) {
      if (!object.visible) continue;
      // The hollow centre is still a hit target, with the same tolerance as the filled handle.
      const sphere = new Sphere(
          object.getWorldPosition(new Vector3()),
          0.035 * this.preview.matrixWorld.getMaxScaleOnAxis(),
        ),
        point = this.ray.ray.intersectSphere(sphere, new Vector3());
      if (!point) continue;
      const distance = point.distanceTo(this.ray.ray.origin);
      if (distance <= this.ray.far && (!best || distance < best.distance))
        best = { object, distance };
    }
    return best;
  }
  private selectSurface(): void {
    const layers = this.layers(),
      hit = pickEditableLayer(this.ray, layers);
    if (!hit || !layers.project.layerStack.get(hit.layerId).procedural) return;
    layers.select(hit.layerId);
    this.tools.selectTubeSpline();
    this.cacheKey = "";
    this.changed();
  }
  update(
    tool: TubeInputState | undefined,
    pose: Matrix4 | undefined,
    time: number,
    enabled: boolean,
    gripPose?: Matrix4,
  ): void {
    const mode = this.tools.active,
      l = this.layers(),
      dt = this.lastTime ? Math.min(0.05, Math.max(0, (time - this.lastTime) / 1000)) : 0,
      gap = this.lastTime ? time - this.lastTime : 0;
    this.lastTime = time;
    if (
      !Number.isFinite(time) ||
      !enabled ||
      (mode !== "tube" && mode !== "edit-spline") ||
      !tool?.connected ||
      !tool.tracked ||
      !tool.gripTracked ||
      tool.role !== "tool" ||
      !pose ||
      !pose.elements.every(Number.isFinite) ||
      Math.abs(pose.determinant()) < 1e-10
    ) {
      this.cancel();
      return;
    }
    if (
      this.active &&
      (this.project !== l.project ||
        this.owner !== tool.connectionId ||
        this.capturedMode !== mode ||
        this.target !== l.project.activeLayerId ||
        gap > 1000)
    ) {
      this.cancel();
      return;
    }
    if (this.pending) return;
    const surface =
      mode === "tube" && this.held && !this.editing ? l.group : l.active.surface.group;
    surface.updateWorldMatrix(true, true);
    if (
      (this.held || this.radiusHeld) &&
      this.anchor.elements.some((v, i) => Math.abs(v - surface.matrixWorld.elements[i]) > 1e-9)
    ) {
      this.cancel();
      return;
    }
    try {
      this.ray.ray.origin.setFromMatrixPosition(pose);
      this.ray.ray.direction.set(0, 0, -1).transformDirection(pose);
      this.ray.far = this.rayReach;
      if (!tool.buttons.trigger.pressed) this.armed = true;
      const pressed =
        tool.buttons.trigger.justPressed && tool.buttons.trigger.pressed && this.armed;
      if (!this.active) {
        this.editing = mode === "edit-spline";
        const surfaceHit = tool.pointing === false ? null : pickEditableLayer(this.ray, l),
          hovered = surfaceHit ? l.project.layerStack.get(surfaceHit.layerId) : null,
          shown = hovered?.procedural ? hovered : l.active.layer;
        this.hoveredTubeId = hovered?.procedural ? hovered.id : null;
        if (shown.procedural && shown.editable) {
          const shownSurface = l.runtime(shown.id).surface.group;
          shownSurface.updateWorldMatrix(true, false);
          this.paint(shown.procedural, shownSurface.matrixWorld, true, shown.id);
          if (shown.id !== l.project.activeLayerId || l.selectedGroupId) {
            this.hoverPointId =
              tool.pointing === false ? null : (this.hitHandle()?.object.userData.pointId ?? null);
            this.lineHovered = !!this.hoveredTubeId;
            if (pressed && this.hoveredTubeId && !this.tools.busy) {
              l.select(shown.id);
              this.tools.selectTubeSpline();
              this.armed = false;
              this.hoverPointId = null;
              this.changed();
            }
            this.styleHandles();
            return;
          }
          const hit = tool.pointing === false ? undefined : this.hitHandle();
          this.hoverPointId = hit?.object.userData.pointId ?? null;
          this.ray.params.Line.threshold = 0.035 * this.preview.matrixWorld.getMaxScaleOnAxis();
          this.lineHovered =
            tool.pointing !== false && !hit && !!this.ray.intersectObject(this.line)[0];
          this.styleHandles();
          if (pressed && (this.lineHovered || (this.hoveredTubeId && !hit)) && !this.tools.busy) {
            this.tools.selectTubeSpline();
            this.armed = false;
            this.styleHandles();
            this.note = "Spline selected · use Tube radius in tool settings";
            return;
          }
          if (mode === "tube") this.editing = !!hit;
        } else this.preview.visible = false;
      }
      if (mode === "tube" && !this.editing && !this.radiusHeld) {
        if (pressed && !this.held && !this.tools.busy) {
          this.acquire(l);
          l.group.updateWorldMatrix(true, false);
          this.anchor.copy(l.group.matrixWorld);
          this.owner = tool.connectionId;
          this.held = true;
          this.armed = false;
          this.raw = [];
          this.note = "Drawing Tube · release to finish";
        }
        if (this.held) {
          const matrix = gripPose ?? pose,
            p = new Vector3(0, 0, -CLAY_TIP_REACH_METRES)
              .applyMatrix4(matrix)
              .applyMatrix4(this.anchor.clone().invert()),
            radius = this.tools.brushRadius,
            previous = this.raw.at(-1);
          const spacing = Math.max(l.active.volume.step, radius * 0.25);
          if (
            !previous ||
            p.distanceTo(new Vector3(previous.x, previous.y, previous.z)) >= spacing ||
            !tool.buttons.trigger.pressed
          ) {
            this.raw.push({ x: p.x, y: p.y, z: p.z, t: time / 1000, radius });
            if (this.raw.length > 256)
              throw new Error("Tube reached 256 points; draw a shorter path.");
          }
          if (this.raw.length >= 2) {
            const filtered = filterClayPath(
                this.raw,
                this.tools.path.steady,
                radius,
                this.tools.path.straightLine,
              ),
              path = simplifyTubePath(filtered, l.active.volume.step * 0.35),
              final = this.tools.path.straightLine ? [path[0], path.at(-1)!] : path;
            if (final.length > 256)
              throw new Error("Tube exceeds 256 control points after smoothing.");
            this.draft = {
              kind: "tube",
              closed: false,
              interpolation: this.tools.path.straightLine ? "linear" : "centripetal",
              points: final.map((p, i) => ({
                id: `draw-${i}`,
                position: [p.x, p.y, p.z],
                radius: p.radius ?? radius,
              })),
            };
            this.paint(this.draft, this.anchor, false);
          }
          if (!tool.buttons.trigger.pressed) this.finish();
        }
        return;
      }
      const source = this.draft ?? l.active.layer.procedural;
      if (!source) {
        this.preview.visible = false;
        if (pressed && !this.tools.busy) this.selectSurface();
        return;
      }
      if (!l.active.layer.editable) {
        this.cancel();
        return;
      }
      if (
        !this.tools.tubeSplineSelected &&
        mode === "edit-spline" &&
        (!this.tools.splinePointId || !source.points.some((p) => p.id === this.tools.splinePointId))
      )
        this.tools.splinePointId = source.points[0].id;
      this.paint(source, this.held || this.radiusHeld ? this.anchor : surface.matrixWorld, true);
      if (pressed && !this.held && !this.radiusHeld && !this.tools.busy) {
        const hit = tool.pointing === false ? undefined : this.hitHandle();
        if (hit) {
          this.tools.selectSplinePoint(hit.object.userData.pointId);
          this.pointId = this.tools.splinePointId!;
          this.acquire(l);
          this.anchor.copy(surface.matrixWorld);
          this.owner = tool.connectionId;
          this.draft = validateTube(source);
          this.distance = hit.distance;
          this.offset
            .copy(new Vector3(...source.points.find((p) => p.id === this.pointId)!.position))
            .sub(
              this.ray.ray
                .at(this.distance, new Vector3())
                .applyMatrix4(this.anchor.clone().invert()),
            );
          this.held = true;
          this.armed = false;
        } else this.selectSurface();
      }
      const stick =
        tool.stick.available && Number.isFinite(tool.stick.y) && Number.isFinite(tool.stick.x)
          ? tool.stick.y
          : 0;
      if (Math.abs(stick) < 0.12) this.stickArmed = true;
      if (
        this.stickArmed &&
        this.tools.splinePointId &&
        Math.abs(stick) > 0.18 &&
        Math.abs(tool.stick.x) < Math.abs(stick) * 0.75 &&
        (this.held || !this.tools.busy)
      ) {
        if (!this.held && !this.radiusHeld) {
          this.acquire(l);
          this.anchor.copy(surface.matrixWorld);
          this.owner = tool.connectionId;
          this.draft = validateTube(source);
          this.pointId = this.tools.splinePointId!;
          this.radiusHeld = true;
        }
        const point = this.draft!.points.find((p) => p.id === this.pointId)!;
        point.radius = Math.max(0.005, Math.min(2, point.radius * Math.exp(-stick * dt)));
        this.note = `Point radius ${point.radius.toFixed(3)}`;
      }
      if (this.held) {
        const point = this.draft!.points.find((p) => p.id === this.pointId)!,
          p = this.ray.ray
            .at(this.distance, new Vector3())
            .applyMatrix4(this.anchor.clone().invert())
            .add(this.offset);
        point.position = p.toArray();
        if (!tool.buttons.trigger.pressed) this.finish();
      } else if (this.radiusHeld && Math.abs(stick) < 0.12) this.finish();
      if (this.draft) this.paint(this.draft, this.anchor, true);
    } catch (error) {
      this.cancel();
      this.issue("error");
      this.note = error instanceof Error ? error.message : "Tube cancelled";
    }
  }
  dispose(): void {
    this.cancel();
    this.preview.removeFromParent();
    this.skinGeometry.dispose();
    this.skinMaterial.dispose();
    this.lineGeometry.dispose();
    this.lineMaterial.dispose();
    this.handleGeometry.dispose();
    this.hollowGeometry.dispose();
    this.hoverMaterial.dispose();
    this.selectedLine.geometry.dispose();
    this.handleMaterial.dispose();
  }
}
