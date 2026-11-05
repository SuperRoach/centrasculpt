import {
  Box3,
  Box3Helper,
  BufferGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  type Matrix4,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  Raycaster,
  Vector3,
} from "three";
import type { FitReport } from "./assembly";
import { partOwner } from "./assembly";
import {
  type ConnectorOptions,
  exportPartSTL,
  inspectLayers,
  partBounds,
  previewAssembly,
  validateConnectorSizes,
  withExportMemory,
} from "./assembly-tools";
import { type ConnectorPlacement, ConnectorPlacer, placedConnector } from "./connector-placement";
import { type ExportQuality, ExportWork } from "./export-mesh";
import type { IndependentLayers } from "./independent-layers";
import { pickVisibleLayer } from "./layer-picking";
import { ModellingAPI, type ModellingCommand, type PartMetadata } from "./modelling-api";
import type { XRControllerState } from "./xr-input";
import type { MenuContent } from "./xr-menu-model";
export const CONNECTOR_LABELS = {
  pegDiameterMM: "Peg diameter",
  pegLengthMM: "Peg length",
  socketDiameterMM: "Socket diameter",
  socketDepthMM: "Socket depth",
  radialClearanceMM: "Radial clearance",
};
/** Shared desktop/XR actions. Fit is explicit and cached until a revision changes. */
export class AssemblyControls {
  private readonly markers = new Points(
    new BufferGeometry(),
    new PointsMaterial({ color: 0xff604d, size: 0.012, depthTest: false }),
  );
  exportQuality: ExportQuality = "fast";
  open = false;
  partA = "";
  partB = "";
  offsetMM = 0;
  clearanceMM = 0.3;
  axis: "x" | "y" | "z" = "y";
  matchNormal = false;
  connector: Omit<ConnectorOptions, "pegPart" | "socketPart"> = {
    pegDiameterMM: 4,
    pegLengthMM: 6,
    socketDiameterMM: 4.6,
    socketDepthMM: 6.5,
    radialClearanceMM: 0.3,
    positionMM: [0, 0, 0],
    rotationRadians: [0, 0, 0],
  };
  feedback = "Press Check fit, then tap two layers.";
  pending = false;
  private abort?: AbortController;
  private field = "";
  private entry = "";
  private resultRevision = "";
  onExport?: (result: Awaited<ReturnType<typeof exportPartSTL>>) => void;
  constructor(
    readonly layers: () => IndependentLayers,
    private readonly changed: () => void = () => {},
  ) {
    this.placer = new ConnectorPlacer(layers);
    this.connectorPreview.add(this.pegGhost, this.socketGhost);
    this.connectorPreview.visible = false;
    this.connectorPreview.userData.previewOnly = true;
    this.connectorPreview.name = "Connector placement preview";
    for (const mesh of [this.pegGhost, this.socketGhost]) {
      mesh.raycast = () => {};
      mesh.renderOrder = 997;
    }
  }
  get parts(): PartMetadata[] {
    const q = new ModellingAPI(this.layers()).query({ type: "part.list" });
    return q.ok ? q.value : [];
  }
  get status(): string {
    if (this.resultRevision !== this.layers().modellingRevision) this.markers.visible = false;
    return this.resultRevision && this.resultRevision !== this.layers().modellingRevision
      ? "Fit result is stale — press Check fit again."
      : this.feedback;
  }
  fitResult: FitReport | null = null;
  picking: "first" | "second" | "joint" | null = null;
  checking = false;
  beforePick?: () => void;
  private pickMode: "fit" | "pair" | "connector" = "fit";
  generatingConnector = false;
  connectorPlaced = false;
  socketSizingAuto = true;
  private connectorCommitted = false;
  private previewAfterConnector = false;
  private readonly placer: ConnectorPlacer;
  private readonly connectorPreview = new Group();
  private readonly pegGhost = new Mesh(
    new CylinderGeometry(0.5, 0.5, 1, 32),
    new MeshBasicMaterial({ color: 0x70d5ba, wireframe: true, transparent: true, opacity: 0.8 }),
  );
  private readonly socketGhost = new Mesh(
    this.pegGhost.geometry,
    new MeshBasicMaterial({ color: 0xffc287, wireframe: true, transparent: true, opacity: 0.8 }),
  );
  placement: ConnectorPlacement | null = null;
  private placementRevision = "";
  get interactionTitle(): string {
    return this.pickMode === "connector" || this.connectorPlaced ? "Peg & socket" : "Check fit";
  }
  private pickProject?: object;
  private previousPair: [string, string] = ["", ""];
  private pickView: "separate" | "boolean" = "separate";
  private job = 0;
  private disposed = false;
  private readonly ray = new Raycaster();
  private readonly direction = new Vector3();
  private readonly firstOutline = new Box3Helper(new Box3(), 0x7fd5c0);
  private readonly hoverOutline = new Box3Helper(new Box3(), 0xffc287);
  private xrOwner = 0;
  private xrArmed = false;
  private xrHeld = false;
  private lastHover = 0;
  get ownsPointer(): boolean {
    return !!this.picking || this.checking || this.generatingConnector || this.xrHeld;
  }
  get pairLabel(): string {
    const stack = this.layers().project.layerStack;
    return [this.partA, this.partB]
      .map((id) => stack.layers.find((l) => l.id === id)?.name ?? "…")
      .join(" ↔ ");
  }
  beginPick(mode: "fit" | "pair" | "connector" = "fit"): void {
    if (this.pending || !this.layers().recoveryReady) {
      this.feedback = "Finish the current edit before checking fit.";
      this.changed();
      return;
    }
    if (mode === "connector") {
      try {
        validateConnectorSizes(this.connector, this.layers().display.precision.millimetresPerUnit);
      } catch (e) {
        this.feedback = e instanceof Error ? e.message : String(e);
        this.changed();
        return;
      }
    }
    this.cancelPick();
    this.beforePick?.();
    const l = this.layers();
    this.previousPair = [this.partA, this.partB];
    this.pickView = l.viewMode;
    l.clearAssemblyPreview();
    l.viewMode = "separate";
    l.syncPresentation();
    this.partA = this.partB = "";
    this.pickMode = mode;
    this.connectorPlaced = this.connectorCommitted = this.previewAfterConnector = false;
    this.placement = null;
    this.placer.clear();
    this.pickProject = l.project;
    this.fitResult = null;
    this.resultRevision = "";
    this.markers.visible = false;
    this.picking = "first";
    this.xrArmed = false;
    this.xrOwner = 0;
    this.feedback =
      mode === "connector"
        ? "Tap the layer that gets the peg. Escape cancels."
        : "Tap the first layer in the scene or Layers list. Escape cancels.";
    this.changed();
  }
  cancelPick(): void {
    this.job++;
    this.abort?.abort();
    if (this.checking || this.generatingConnector) {
      this.pending = false;
      this.abort = undefined;
    }
    if (this.picking) [this.partA, this.partB] = this.previousPair;
    this.picking = null;
    this.checking = this.generatingConnector = false;
    this.previewAfterConnector = false;
    this.placement = null;
    this.placer.clear();
    this.connectorPreview.visible = false;
    this.connectorPreview.removeFromParent();
    this.xrArmed = false;
    this.firstOutline.visible = this.hoverOutline.visible = false;
    if (this.pickProject === this.layers().project) {
      this.layers().viewMode = this.pickView;
      this.layers().syncPresentation();
    }
    this.pickProject = undefined;
  }
  dismiss(): void {
    this.cancelPick();
    this.connectorPlaced = this.connectorCommitted = false;
    this.pickMode = "fit";
    this.fitResult = null;
    this.resultRevision = "";
    this.markers.visible = false;
    this.feedback = "Press Check fit, then tap two layers.";
    this.changed();
  }
  sync(): void {
    if (this.pickProject && this.pickProject !== this.layers().project) {
      this.cancelPick();
      this.partA = this.partB = "";
      this.fitResult = null;
      this.resultRevision = "";
      this.feedback = "Project changed. Press Check fit to choose layers.";
      this.changed();
    }
    if (this.picking === "joint") {
      const l = this.layers();
      for (const layer of l.project.layerStack.layers)
        l.runtime(layer.id).surface.group.visible =
          layer.visible && this.resolve(layer.id) === this.partA;
      if (this.placement && this.placementRevision !== l.modellingRevision) {
        this.placement = null;
        this.connectorPreview.visible = false;
        this.feedback = "Layers changed — point at the joint face again.";
      }
    }
    if (this.resultRevision && this.resultRevision !== this.layers().modellingRevision) {
      this.markers.visible = this.firstOutline.visible = this.hoverOutline.visible = false;
    }
  }
  private resolve(id: string): string {
    const stack = this.layers().project.layerStack;
    stack.get(id);
    for (let depth = 0; depth < 8; depth++) {
      const owner = partOwner(stack, id);
      if (owner) return owner;
      const consumers = stack.layers.filter((l) =>
        l.booleanModifiers?.some((m) => m.enabled && m.sourceId === id),
      );
      if (consumers.length !== 1) return id;
      id = consumers[0].id;
    }
    return id;
  }
  private outline(id: string, helper: Box3Helper): void {
    try {
      helper.box.copy(partBounds(this.layers(), id, true));
      helper.visible = true;
      helper.raycast = () => {};
      helper.renderOrder = 998;
      for (const m of Array.isArray(helper.material) ? helper.material : [helper.material])
        m.depthTest = false;
      this.layers().group.add(helper);
    } catch {
      helper.visible = false;
    }
  }
  private lastPointerHover = 0;
  hoverRay(ray: Raycaster): void {
    if (!this.picking) return;
    const now = performance.now();
    if (now - this.lastPointerHover < 50) return;
    this.lastPointerHover = now;
    if (this.picking === "joint") {
      this.previewJoint(ray);
      return;
    }
    const id = pickVisibleLayer(ray, this.layers());
    if (id) this.outline(this.resolve(id), this.hoverOutline);
    else this.hoverOutline.visible = false;
  }
  pickRay(ray: Raycaster): void {
    if (!this.picking) return;
    if (this.picking === "joint") {
      if (!this.previewJoint(ray)) {
        this.changed();
        return;
      }
      this.connector = placedConnector(this.connector, this.placement!);
      this.picking = null;
      this.connectorPreview.visible = false;
      this.generatingConnector = this.previewAfterConnector = true;
      void this.run("connector");
      return;
    }
    const id = pickVisibleLayer(ray, this.layers());
    if (id) this.pickLayer(id);
    else {
      this.feedback = "No layer there — tap a visible layer.";
      this.changed();
    }
  }
  pickLayer(raw: string): void {
    if (!this.picking) return;
    if (this.picking === "joint") {
      this.feedback = "Point at the peg layer’s joint face in the scene, then tap to place.";
      this.changed();
      return;
    }
    try {
      const l = this.layers(),
        id = this.resolve(raw),
        node = l.project.layerStack.get(id);
      if (l.project !== this.pickProject) {
        this.sync();
        return;
      }
      if (!node.visible) throw new Error("Choose a visible layer.");
      if (this.pickMode === "connector") node.assertEditable();
      if (this.picking === "first") {
        this.partA = id;
        this.picking = "second";
        this.outline(id, this.firstOutline);
        this.feedback =
          this.pickMode === "connector"
            ? `${node.name} gets the peg. Tap the layer that gets the socket.`
            : `${node.name} selected. Tap the second layer.`;
      } else {
        if (id === this.partA) throw new Error("Choose a different layer for the second tap.");
        const h = l.project.layerStack.hierarchy;
        if (h.descendants(id).includes(this.partA) || h.descendants(this.partA).includes(id))
          throw new Error("Choose two independent layers, not a parent and child.");
        this.partB = id;
        this.picking = null;
        this.hoverOutline.visible = false;
        if (this.pickMode === "fit") void this.checkPicked();
        else if (this.pickMode === "connector") {
          this.picking = "joint";
          this.outline(this.partB, this.hoverOutline);
          this.feedback = `Tap ${this.layers().project.layerStack.get(this.partA).name}’s joint face. The socket layer is shown as an outline.`;
          this.sync();
        } else {
          this.feedback = `${this.pairLabel} selected. Configure the connector or alignment below.`;
          this.pickProject = undefined;
        }
      }
    } catch (e) {
      this.feedback = e instanceof Error ? e.message : String(e);
    }
    this.changed();
  }
  private previewJoint(ray: Raycaster): boolean {
    try {
      this.placement = this.placer.place(ray, this.partA, this.partB);
      this.placementRevision = this.layers().modellingRevision;
      const mm = this.layers().display.precision.millimetresPerUnit;
      for (const [mesh, position, diameter, length] of [
        [
          this.pegGhost,
          this.placement.positionMM,
          this.connector.pegDiameterMM,
          this.connector.pegLengthMM,
        ],
        [
          this.socketGhost,
          this.placement.socketPositionMM,
          this.connector.socketDiameterMM,
          this.connector.socketDepthMM,
        ],
      ] as const) {
        mesh.position.fromArray(position).multiplyScalar(1 / mm);
        mesh.rotation.set(...this.placement.rotationRadians);
        mesh.scale.set(diameter / mm, length / mm, diameter / mm);
      }
      this.layers().group.add(this.connectorPreview);
      this.connectorPreview.visible = true;
      this.feedback = `Matching joint found · faces ${this.placement.faceGapMM.toFixed(2)} mm apart. Tap to create the peg and socket.`;
      return true;
    } catch (e) {
      this.placement = null;
      this.connectorPreview.visible = false;
      this.feedback = e instanceof Error ? e.message : String(e);
      return false;
    }
  }
  matchSocketSizes(): void {
    this.socketSizingAuto = true;
    this.connector.socketDiameterMM =
      this.connector.pegDiameterMM + 2 * this.connector.radialClearanceMM;
    this.connector.socketDepthMM = this.connector.pegLengthMM + 0.5;
  }
  private showFit(r: FitReport): void {
    this.fitResult = r;
    const mm = this.layers().display.precision.millimetresPerUnit;
    this.markers.geometry.dispose();
    this.markers.geometry.setAttribute(
      "position",
      new Float32BufferAttribute(
        r.collisionRegionsMM.flat().map((v) => v / mm),
        3,
      ),
    );
    this.markers.frustumCulled = false;
    this.markers.raycast = () => {};
    this.markers.visible = true;
    this.markers.renderOrder = 999;
    this.layers().group.add(this.markers);
    this.resultRevision = this.layers().modellingRevision;
    this.feedback = r.sampledOverlap
      ? "Overlap detected — these layers intersect."
      : r.minimumSeparationMM === null
        ? "Gap unknown — no reliable surface samples."
        : `Approx gap ${r.minimumSeparationMM.toFixed(2)} mm · ${r.clearanceViolation ? "smaller than desired" : "no overlap found"}`;
  }
  private async checkPicked(): Promise<void> {
    const job = ++this.job,
      project = this.layers().project;
    this.pending = this.checking = true;
    this.abort = new AbortController();
    this.feedback = "Checking fit…";
    this.changed();
    try {
      const result = await inspectLayers(
        this.layers(),
        this.partA,
        this.partB,
        this.clearanceMM,
        this.abort.signal,
      );
      if (job === this.job && !this.disposed && project === this.layers().project)
        this.showFit(result);
    } catch (e) {
      if (job === this.job) this.feedback = e instanceof Error ? e.message : String(e);
    } finally {
      if (job === this.job) {
        this.pending = this.checking = false;
        this.abort = undefined;
        this.pickProject = undefined;
        this.layers().viewMode = this.pickView;
        this.layers().syncPresentation();
        this.changed();
      }
    }
  }
  step(tool: XRControllerState | undefined, pose: Matrix4 | undefined, enabled: boolean): boolean {
    if (!this.ownsPointer) return false;
    this.sync();
    if (!tool?.connected || !tool.tracked || !tool.gripTracked || tool.role !== "tool") {
      if (this.picking) {
        this.cancelPick();
        this.feedback = "Fit selection cancelled — controller tracking lost.";
        this.changed();
      }
      this.xrHeld = false;
      return true;
    }
    if (this.xrOwner && this.xrOwner !== tool.connectionId) {
      this.cancelPick();
      this.xrHeld = false;
      this.feedback = "Controller changed. Press Check fit again.";
      this.changed();
      return true;
    }
    this.xrOwner = tool.connectionId;
    if (!enabled || !pose || !pose.elements.every(Number.isFinite)) {
      this.xrArmed = false;
      return true;
    }
    if (!tool.buttons.trigger.pressed && tool.buttons.trigger.rawValue < 0.45) {
      this.xrHeld = false;
      this.xrArmed = true;
    }
    if (!this.picking) return true;
    this.ray.ray.origin.setFromMatrixPosition(pose);
    this.ray.ray.direction.copy(this.direction.set(0, 0, -1).transformDirection(pose));
    this.ray.far = 5;
    const now = performance.now();
    if (now - this.lastHover > 50) {
      this.hoverRay(this.ray);
      this.lastHover = now;
    }
    if (this.xrArmed && tool.buttons.trigger.justPressed) {
      this.xrArmed = false;
      this.xrHeld = true;
      this.pickRay(this.ray);
    }
    return true;
  }
  private async command(command: ModellingCommand): Promise<void> {
    const job = this.job;
    const api = new ModellingAPI(this.layers());
    const result = await api.execute(command, {
      expectedRevision: api.revision,
      signal: this.abort?.signal,
    });
    if (job !== this.job || this.disposed) throw new Error("Operation cancelled.");
    if (!result.ok) throw new Error(result.error.message);
    if (result.value.fit) {
      this.showFit(result.value.fit);
    } else this.feedback = "Assembly updated · Undo available.";
  }
  private running?: Promise<void>;
  private runningAction = "";
  run(action: string): Promise<void> {
    if (
      (action === "export" || action === "export-all") &&
      this.pending &&
      (this.runningAction === "preview" || this.runningAction === "connector")
    ) {
      const layers = this.layers(),
        job = this.job;
      return this.running!.then(() => {
        if (!this.disposed && job === this.job && layers === this.layers()) return this.run(action);
      });
    }
    const pending = this.pending,
      result = this.perform(action);
    if (!pending && this.pending) {
      this.running = result;
      this.runningAction = action;
      const clear = () => {
        if (this.running === result) {
          this.running = undefined;
          this.runningAction = "";
        }
      };
      void result.then(clear, clear);
    }
    return result;
  }
  private async perform(action: string): Promise<void> {
    if (action === "match-socket") {
      this.matchSocketSizes();
      this.changed();
      return;
    }
    if (action === "pick-fit" || action === "pick-pair" || action === "place-connector") {
      this.beginPick(
        action === "pick-fit" ? "fit" : action === "place-connector" ? "connector" : "pair",
      );
      return;
    }
    if (action === "dismiss") {
      this.dismiss();
      return;
    }
    if (action === "cancel") {
      const committed = this.connectorCommitted;
      this.cancelPick();
      this.pending = false;
      this.feedback = committed
        ? "Peg and socket created; preview cancelled. Undo is available."
        : "Cancelled. The model is unchanged.";
      this.changed();
      return;
    }
    if (this.pending) return;
    const job = this.job,
      interactiveConnector = this.previewAfterConnector;
    if (!interactiveConnector) {
      this.connectorPlaced = this.connectorCommitted = false;
    }
    this.pending = true;
    this.abort = new AbortController();
    this.resultRevision = "";
    this.fitResult = null;
    this.markers.visible = false;
    const l = this.layers(),
      selected = l.project.activeLayerId;
    try {
      if (action === "define") {
        await this.command({
          type: "part.define",
          objectId: selected,
          clearanceMM: this.clearanceMM,
        });
        this.partA = selected;
      } else if (action === "assign")
        await this.command({ type: "part.assign", objectId: selected, partId: this.partA || null });
      else if (action === "detach")
        await this.command({ type: "part.assign", objectId: selected, partId: null });
      else if (action === "remove") await this.command({ type: "part.remove", partId: this.partA });
      else if (action === "clearance")
        await this.command({
          type: "part.clearance",
          partId: this.partA,
          clearanceMM: this.clearanceMM,
        });
      else if (action === "select") await this.command({ type: "part.select", partId: this.partA });
      else if (action === "inspect")
        await this.command({ type: "part.inspect", partA: this.partA, partB: this.partB });
      else if (["centres", "faces", "axes"].includes(action)) {
        const checkpoint = l.assemblyCheckpoint();
        try {
          for (const id of [this.partA, this.partB])
            if (!l.project.layerStack.get(id).assemblyPart)
              await this.command({
                type: "part.define",
                objectId: id,
                clearanceMM: this.clearanceMM,
              });
          await this.command({
            type: "part.mate",
            options: {
              moving: this.partA,
              target: this.partB,
              axis: this.axis,
              offsetMM: this.offsetMM,
              mode: action as "centres" | "faces" | "axes",
              matchNormal: this.matchNormal,
            },
          });
          l.finishAssemblyTransaction(checkpoint);
        } catch (e) {
          l.rollbackAssemblyTransaction(checkpoint);
          throw e;
        }
      } else if (action === "connector") {
        await this.command({
          type: "connector.create",
          options: { ...this.connector, pegPart: this.partA, socketPart: this.partB },
        });
        if (interactiveConnector) {
          this.connectorCommitted = this.connectorPlaced = true;
          this.feedback = "Peg and socket created. Preparing the assembly preview…";
          this.changed();
          try {
            const detail = await previewAssembly(l, this.abort.signal);
            if (job === this.job)
              this.feedback =
                "Peg and socket created — Undo is available." +
                (detail.capped
                  ? ` Preview detail: ${detail.effectiveResolutionMM.toFixed(2)} mm.`
                  : "");
          } catch (e) {
            if (job === this.job)
              this.feedback = `Peg and socket created. Preview unavailable: ${e instanceof Error ? e.message : String(e)}`;
          }
        }
      } else if (action === "visible" || action === "locked") {
        const p = l.project.layerStack.get(this.partA);
        l.setNodeFlag(p.id, action, !p[action]);
      } else if (action === "export" || action === "export-all") {
        const parts =
          action === "export" ? [this.partA] : this.parts.filter((p) => p.visible).map((p) => p.id);
        if (!parts.length) throw new Error("Show a printable part first.");
        if (!this.onExport) throw new Error("STL download is unavailable in this host.");
        const onExport = this.onExport;
        const exportSignal = this.abort.signal;
        let previewWarning = "";
        await withExportMemory(
          l,
          async () => {
            for (const [index, id] of parts.entries()) {
              this.feedback = `Exporting part ${index + 1} of ${parts.length}…`;
              this.changed();
              const result = await exportPartSTL(l, id, exportSignal, this.exportQuality);
              new ExportWork(exportSignal, () => job === this.job && l === this.layers()).check();
              if (result.report.blocking.length)
                throw new Error(`STL blocked: ${result.report.blocking.join(" ")}`);
              onExport(result);
            }
          },
          (message) => {
            previewWarning = message;
          },
        );
        this.feedback =
          "STLs use project millimetres. Review each print report and inspect in your slicer." +
          (previewWarning ? ` ${previewWarning}` : "");
      } else if (action === "end-preview") {
        l.clearAssemblyPreview();
        l.syncPresentation();
        this.feedback = "Assembly preview closed.";
      } else if (action === "preview") {
        const detail = await previewAssembly(l, this.abort.signal);
        this.feedback =
          "Assembly preview: evaluated independent parts. Editing exits this preview." +
          (detail.capped ? ` Preview detail: ${detail.effectiveResolutionMM.toFixed(2)} mm.` : "");
      }
    } catch (e) {
      if (job === this.job) this.feedback = e instanceof Error ? e.message : String(e);
    } finally {
      if (job === this.job) {
        this.pending = this.generatingConnector = false;
        this.previewAfterConnector = false;
        this.abort = undefined;
        if (interactiveConnector) {
          this.pickProject = undefined;
          this.placer.clear();
          this.placement = null;
          this.firstOutline.visible = this.hoverOutline.visible = false;
          this.connectorPreview.visible = false;
          l.syncPresentation();
        }
        this.changed();
      }
    }
  }
  content(): MenuContent {
    if (this.picking || this.checking || this.generatingConnector)
      return {
        title: this.interactionTitle.toUpperCase(),
        subtitle: this.partA ? this.pairLabel : "Tap two layers in the scene",
        buttons: [
          {
            id: "assembly:cancel",
            label: "Cancel",
            rect: { x: 40, y: 244, width: 1072, height: 104 },
          },
        ],
        labels: [],
        footer: this.status,
      };
    const buttons: MenuContent["buttons"] = [];
    const add = (action: string, label: string, i: number) =>
      buttons.push({
        id: `assembly:${action}`,
        label,
        disabled: action !== "cancel" && (this.pending || !this.layers().recoveryReady),
        rect: { x: 40 + (i % 2) * 548, y: 244 + Math.floor(i / 2) * 116, width: 524, height: 104 },
      });
    if (this.field) {
      ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "-", "back", "apply"].forEach(
        (key, i) => {
          add(`key:${key}`, key, i);
        },
      );
    } else {
      add("home", "‹ Primitives", 0);
      add("pick-fit", "Check fit · tap two layers", 1);
      add("field:clearanceMM", `Desired gap · ${this.clearanceMM} mm`, 2);
      add("pick-pair", "Choose layers for connector / alignment", 3);
      add("connectors", "Peg & socket…", 4);
      add("alignment", "Alignment…", 5);
      add("more", "Parts & export…", 6);
      if (this.picking || this.checking) add("cancel", "Cancel selection / check", 7);
      if (this.alignmentPage) {
        buttons.splice(0);
        add("alignment", "‹ Assembly", 0);
        add("pick-pair", "Tap two layers", 1);
        add("axis", `Axis · ${this.axis.toUpperCase()}`, 2);
        add("offset", `Offset · ${this.offsetMM} mm`, 3);
        add("centres", "Align centres", 4);
        add("faces", "Align bounding faces", 5);
        add("axes", "Align axes", 6);
        add("normal", `Oppose normals · ${this.matchNormal ? "on" : "off"}`, 7);
      }
      if (this.morePage) {
        buttons.splice(0);
        add("more", "‹ Assembly", 0);
        add("define", "Make selected a printable part", 13);
        add("connectors", "Connector dimensions…", 1);
        add("select", "Select A · rename in Layers", 2);
        add("visible", "Show / hide A", 3);
        add("locked", "Lock / unlock A", 4);
        add("export", "Export A STL + print report", 5);
        add("export-all", "Export visible parts separately", 6);
        add("preview", "Preview assembly", 7);
        add("detach", "Detach selected", 8);
        add("remove", "Remove A boundary", 9);
        add("cancel", "Cancel work", 10);
        add("quality", `STL quality · ${this.exportQuality}`, 11);
        add("end-preview", "Exit assembly preview", 12);
      }
      if (this.connectorPage) {
        buttons.splice(0);
        add("connectors", "‹ Assembly", 0);
        add("place-connector", "Place peg & socket · tap layers, then joint", 1);
        add("field:pegDiameterMM", `Peg diameter · ${this.connector.pegDiameterMM} mm`, 2);
        add("field:pegLengthMM", `Peg length · ${this.connector.pegLengthMM} mm`, 3);
        add("field:radialClearanceMM", `Clearance · ${this.connector.radialClearanceMM} mm`, 4);
        add("connector-advanced", "Advanced sizes / numeric placement…", 5);
        if (this.connectorAdvanced) {
          buttons.splice(0);
          add("connector-advanced", "‹ Peg & socket", 0);
          for (const [i, key] of ["px", "py", "pz", "rx", "ry", "rz"].entries())
            add(
              `field:${key}`,
              `${key[0] === "p" ? "Position mm" : "Rotation degrees"} ${key[1].toUpperCase()}`,
              i + 1,
            );
          add(
            "field:socketDiameterMM",
            `Socket diameter · ${this.connector.socketDiameterMM} mm`,
            7,
          );
          add("field:socketDepthMM", `Socket depth · ${this.connector.socketDepthMM} mm`, 8);
          add("pick-pair", "Pick layers only", 9);
          add("connector", "Create at numeric position", 10);
          add("match-socket", "Use matching socket sizes", 11);
        }
      }
    }
    return {
      title: "ASSEMBLY / FIT",
      subtitle: "Independent printable parts · physical millimetres · approximate inspection",
      buttons,
      labels: [],
      footer: this.status,
    };
  }
  private connectorAdvanced = false;
  private alignmentPage = false;
  private connectorPage = false;
  private morePage = false;
  activate(id: string): boolean {
    if (!id.startsWith("assembly:")) return false;
    const action = id.slice(9);
    if (action === "home") this.open = false;
    else if (action === "a" || action === "b") {
      const key = action === "a" ? "partA" : "partB",
        parts = this.parts;
      this[key] = parts[(parts.findIndex((p) => p.id === this[key]) + 1) % parts.length]?.id ?? "";
    } else if (action === "axis")
      this.axis = (["x", "y", "z"] as const)[("xyz".indexOf(this.axis) + 1) % 3];
    else if (action === "quality") {
      const choices = ["fast", "standard", "high"] as const;
      this.exportQuality = choices[(choices.indexOf(this.exportQuality) + 1) % 3];
    } else if (action === "normal") this.matchNormal = !this.matchNormal;
    else if (action === "connector-advanced") this.connectorAdvanced = !this.connectorAdvanced;
    else if (action === "more") {
      this.morePage = !this.morePage;
      this.connectorPage = this.alignmentPage = false;
    } else if (action === "alignment") {
      this.alignmentPage = !this.alignmentPage;
      this.morePage = this.connectorPage = false;
    } else if (action === "connectors") {
      this.connectorPage = !this.connectorPage;
      this.morePage = this.alignmentPage = false;
    } else if (action === "offset" || action.startsWith("field:")) {
      this.field = action === "offset" ? "offsetMM" : action.slice(6);
      this.entry = "";
    } else if (action.startsWith("key:")) {
      const key = action.slice(4);
      if (key === "back") this.entry = this.entry.slice(0, -1);
      else if (key === "apply") {
        const n = Number(this.entry);
        if (!this.entry.trim() || !Number.isFinite(n)) this.feedback = "Enter a finite number.";
        else {
          this.setField(this.field, n);
          this.field = "";
        }
      } else this.entry = (this.entry + key).slice(0, 24);
    } else void this.run(action);
    this.changed();
    return true;
  }
  setField(key: string, n: number): void {
    if (key === "offsetMM") this.offsetMM = n;
    else if (key === "clearanceMM") {
      this.clearanceMM = n;
      this.resultRevision = "";
      this.fitResult = null;
      this.markers.visible = false;
      this.feedback = "Desired gap updated. Press Check fit to choose layers.";
    } else if (/^[pr][xyz]$/.test(key)) {
      if (key[0] === "p") this.connector.socketPositionMM = undefined;
      this.connector[key[0] === "p" ? "positionMM" : "rotationRadians"]["xyz".indexOf(key[1])] =
        key[0] === "r" ? (n * Math.PI) / 180 : n;
    } else if (key in this.connector) {
      (this.connector as unknown as Record<string, number>)[key] = n;
      if (key === "socketDiameterMM" || key === "socketDepthMM") this.socketSizingAuto = false;
      else if (
        this.socketSizingAuto &&
        ["pegDiameterMM", "pegLengthMM", "radialClearanceMM"].includes(key)
      )
        this.matchSocketSizes();
    }
  }
  selectedOwner(): string | null {
    return partOwner(this.layers().project.layerStack, this.layers().project.activeLayerId);
  }
  dispose(): void {
    this.disposed = true;
    this.cancelPick();
    for (const outline of [this.firstOutline, this.hoverOutline]) {
      outline.removeFromParent();
      outline.geometry.dispose();
      for (const m of Array.isArray(outline.material) ? outline.material : [outline.material])
        m.dispose();
    }
    this.connectorPreview.removeFromParent();
    this.pegGhost.geometry.dispose();
    this.pegGhost.material.dispose();
    this.socketGhost.material.dispose();
    this.markers.removeFromParent();
    this.markers.geometry.dispose();
    this.markers.material.dispose();
  }
}
