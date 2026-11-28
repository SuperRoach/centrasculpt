import {
  BufferAttribute,
  type BufferGeometry,
  Color,
  Euler,
  Group,
  type Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from "three";
import { agentPerformanceEnabled, recordAgentPerformance } from "./agent-performance";
import { validateAssembly } from "./assembly";
import type { BakeOptions, BakeProgress, BakeStats, SurfaceView } from "./bake";
import {
  bakeSources,
  checkBakeCancelled,
  planBake,
  sampleBake,
  validateBakeOptions,
  yieldBake,
} from "./bake";
import { type ComponentReference, validateComponents } from "./component-references";
import { BooleanComposite, prepareCompositeColour } from "./compositor";
import type { MoveProgress } from "./deformation-reconstruction";
import { copyMoveVolume, MoveWork } from "./deformation-reconstruction";
import type { DenseGrowthLimits } from "./dense-growth";
import {
  DENSE_GROWTH_LIMITS,
  growthLayout,
  planDenseGrowth,
  prepareDenseGrowth,
} from "./dense-growth";
import { LayerDisplayPreferences } from "./display-preferences";
import {
  enclosureAnchors,
  type FeatureDefinition,
  featurePlan,
  scaledEnclosureFeature,
  validateFeatureLinks,
} from "./enclosure-features";
import type { ExportSource } from "./export-mesh";
import { anchoredBoxPose, checkedRectangularBox, type Face, resizeFace } from "./face-resize";
import { SculptHistory } from "./history";
import { type HierarchyState, LayerGroup, validateHierarchy } from "./layer-hierarchy";
import type { LayerOperation, SculptProject } from "./layers";
import {
  type AssemblyPart,
  assertIndependentLayerVolumes,
  newId,
  SdfLayer,
  validateAssemblyPart,
  validateName,
} from "./layers";
import { type BooleanModifier, validateBooleanGraph, validateModifiers } from "./live-boolean";
import { MaskOverlay } from "./mask-overlay";
import { IncrementalMesher } from "./mesh";
import { RadialMoveField } from "./move-field";
import { reconstructMoveAsync } from "./move-worker-client";
import { type ArrayDefinition, validateArrayDefinition } from "./object-array";
import { PaintSurface, paintColours } from "./paint-surface";
import {
  evaluatePrimitive,
  type PrimitiveSource,
  primitiveGeometry,
  validatePrimitive,
} from "./parametric-primitive";
import { type PersonalStamp, personalStampSource } from "./personal-stamp";
import { snapValue } from "./physical-units";
import { type CutPlane, splitSdfByPlaneSteps } from "./plane-cut";
import { evaluateTube, type TubeSource, validateTube } from "./procedural-tube";
import {
  assertProjectTriangleBudget,
  MAX_PROJECT_LAYERS,
  MAX_PROJECT_TRIANGLES,
  MAX_PROJECT_VOXELS,
} from "./project";
import { applyRenderStyle } from "./render-style";
import { resampleVolume } from "./resolution";
import {
  copySculptMask,
  type MaskSnapshot,
  maskSnapshotBytes,
  registerMaskSurface,
  SculptMask,
  sculptMask,
} from "./sculpt-mask";
import { SculptMetrics } from "./sculpt-metrics";
import {
  copySculptPaint,
  type PaintSnapshot,
  paintSnapshotBytes,
  sculptPaint,
  transportPaint,
} from "./sculpt-paint";
import type { Bounds, BrushMode, MirrorPlane, Point3 } from "./sdf";
import { reflectPoint, SDFVolume, validateMirrorPlane } from "./sdf";
import { prepareShape } from "./shape-library";
import { prepareStampSteps } from "./shape-stamp";
import { validateShapeDefinition } from "./shapes";
import { MAX_SPARSE_AXIS, SparseSDFVolume } from "./sparse-sdf";
import { ClayStroke } from "./stroke";
import { buildExportMesh, ChunkSurface } from "./surface";
import type { VolumeTransform } from "./transform";
import {
  copyTransform,
  sameTransform,
  toLocal,
  transformMatrix,
  uniformScale,
  type Vec3,
  validateTransformEdit,
} from "./transform";
import type { VolumeStore } from "./volume-store";
import { isLegacyCubicGrid, volumeSampleCount } from "./volume-store";

export class LayerRuntime {
  mesher: IncrementalMesher;
  surface: ChunkSurface;
  readonly history: SculptHistory;
  readonly material: MeshStandardMaterial;
  readonly maskOverlay = new MaskOverlay();
  readonly paintSurface = new PaintSurface();
  private primitiveGeometry?: BufferGeometry;
  metrics?: SculptMetrics;
  expansions = 0;
  lastExpansionMs = 0;
  triangles = 0;
  lastMeshMs = 0;
  lastChanged = 0;
  totalChunks = 0;
  brushMs = 0;
  brushTotal = 0;
  brushFrames = 0;
  constructor(
    readonly layer: SdfLayer,
    neutral: MeshStandardMaterial,
    public volume = layer.volume,
    deferMesh = false,
    readonly primitiveSource = layer.primitive,
  ) {
    this.material = neutral.clone();
    this.maskOverlay.bind(this.material);
    this.surface = new ChunkSurface(this.material, true);
    registerMaskSurface(this.surface.group, () => this.volume);
    this.surface.group.userData.layerId = layer.id;
    this.mesher = new IncrementalMesher(volume);
    this.history = new SculptHistory(volume, 32 * 1024 * 1024, 100, layer.id, () => layer.editable);
    try {
      if (!deferMesh) this.rebuild(Infinity, Infinity);
    } catch (error) {
      this.primitiveGeometry?.dispose();
      this.mesher.dispose();
      this.material.dispose();
      throw error;
    }
  }
  rebuild(
    maxChunks = this.volume instanceof SparseSDFVolume ? 4 : Infinity,
    maxMilliseconds = this.volume instanceof SparseSDFVolume ? 2 : Infinity,
    cached?: ReadonlyMap<number, BufferGeometry>,
  ): boolean {
    const measured = !!this.metrics?.enabled,
      start = measured ? performance.now() : 0;
    const update = this.mesher.rebuildChunks(maxChunks, maxMilliseconds, cached);
    if (!update) return false;
    this.surface.update(update.updates);
    this.triangles = update.triangles;
    this.lastMeshMs = update.stats.milliseconds;
    this.lastChanged = update.stats.chunks;
    this.totalChunks = update.stats.totalChunks;
    if (!this.mesher.pendingChunks && this.primitiveSource) {
      if (!this.primitiveGeometry) {
        const s = this.primitiveSource;
        const indexed = primitiveGeometry(s);
        this.primitiveGeometry = indexed.index ? indexed.toNonIndexed() : indexed.clone();
        indexed.dispose();
        const positions = this.primitiveGeometry.getAttribute("position");
        for (let i = 0; i < positions.array.length; i++)
          if (Math.abs(positions.array[i]) < this.volume.extent * 1e-14) positions.array[i] = 0;
      }
      this.surface.clear();
      this.surface.update([
        { id: 0, bounds: { min: [0, 0, 0], max: [1, 1, 1] }, geometry: this.primitiveGeometry },
      ]);
      this.triangles = this.primitiveGeometry.getAttribute("position").count / 3;
    }
    if (measured) this.metrics!.record("remesh", performance.now() - start);
    return true;
  }
  get sourceGeometryBytes(): number {
    return this.primitiveGeometry
      ? Object.values(this.primitiveGeometry.attributes).reduce(
          (bytes, attribute) => bytes + attribute.array.byteLength,
          0,
        )
      : 0;
  }
  exportUpdates() {
    return this.primitiveGeometry
      ? [{ geometry: this.primitiveGeometry }]
      : this.mesher.snapshotUpdates();
  }
  dispose(): void {
    this.primitiveGeometry?.dispose();
    this.mesher.dispose();
    this.material.dispose();
    this.surface.clear();
  }
}
export type MoveCommitStats = {
  backend: "worker" | "cooperative";
  waitMs: number;
  workerInputBytes: number;
  workerPostMs: number;
  slicePercentiles: { p50: number; p95: number; p99: number };
  wallMs: number;
  cpuMs: number;
  meshingMs: number;
  changedVoxels: number;
  sampled: number;
  indexBytes: number;
  patchBytes: number;
  estimatedPeakBytes: number;
  maxSliceMs: number;
  dirtyChunks: number;
  grew: boolean;
  slices: number;
};
type BakeState = {
  hierarchy?: HierarchyState;
  selectedGroup?: string | null;
  ids: string[];
  orders: Record<string, number>;
  visibility: Record<string, boolean>;
  activeId: string;
  view: SurfaceView;
};
type BakeEntry = {
  kind: "bake";
  layerId: string;
  runtime: LayerRuntime;
  before: BakeState;
  after: BakeState;
  index: number;
};
type CutEntry = {
  kind: "cut";
  layerId: string;
  original: LayerRuntime;
  negative: LayerRuntime;
  positive: LayerRuntime;
  originalVolume: VolumeStore;
  before: HierarchyState;
  after: HierarchyState;
  activeBefore: string;
  activeAfter: string;
  selectedBefore: string | null;
  selectedAfter: string | null;
};
type CutBatchEntry = { kind: "cut-batch"; layerId: string; entries: CutEntry[] };
type SourceState = {
  source: TubeSource | PrimitiveSource;
  volume: VolumeStore;
  primitiveOriginal?: PrimitiveSource;
  localPose?: VolumeTransform;
};
type TubeEntry = { kind: "tube"; layerId: string; before: SourceState; after: SourceState };
type MaskEntry = { kind: "mask"; layerId: string; before: MaskSnapshot; after: MaskSnapshot };
type HierarchyEntry = {
  kind: "hierarchy";
  layerId: string;
  before: HierarchyState;
  after: HierarchyState;
  removed: LayerRuntime[];
  bytes: number;
  activeBefore: string;
  activeAfter: string;
  selectedBefore: string | null;
  selectedAfter: string | null;
  booleans?: { layerId: string; before?: BooleanModifier[]; after: BooleanModifier[] }[];
};
type PaintEntry = { kind: "paint"; layerId: string; before: PaintSnapshot; after: PaintSnapshot };
type TimelineEntry =
  | {
      kind: "components";
      layerId: string;
      before: ComponentReference[];
      after: ComponentReference[];
    }
  | {
      kind: "assembly-batch";
      layerId: string;
      entries: TimelineEntry[];
      activeBefore: string;
      activeAfter: string;
      selectedBefore: string | null;
      selectedAfter: string | null;
    }
  | { kind: "assembly"; layerId: string; before?: AssemblyPart; after?: AssemblyPart }
  | {
      kind: "boolean";
      layerId: string;
      before: BooleanModifier[] | undefined;
      after: BooleanModifier[];
    }
  | {
      kind: "array";
      layerId: string;
      before: ArrayDefinition | undefined;
      after: ArrayDefinition | undefined;
    }
  | { kind: "colour"; layerId: string; before: string; after: string }
  | { kind: "name"; layerId: string; before: string; after: string }
  | PaintEntry
  | HierarchyEntry
  | MaskEntry
  | TubeEntry
  | BakeEntry
  | CutEntry
  | CutBatchEntry
  | { kind: "voxels"; layerId: string; paintBefore?: PaintSnapshot; paintAfter?: PaintSnapshot }
  | {
      kind: "transform";
      layerId: string;
      before: VolumeTransform;
      after: VolumeTransform;
      localBefore: VolumeTransform;
      localAfter: VolumeTransform;
    }
  | { kind: "operation"; layerId: string; before: LayerOperation; after: LayerOperation }
  | { kind: "order"; layerId: string; before: string[]; after: string[] };

type TransformOptions = { placeEnclosureFeature?: boolean };
type EnclosureFeatureMove = {
  base: SdfLayer;
  part: AssemblyPart;
  featureIndex: number;
  postIndex: number;
  sources: { layer: SdfLayer; planIndex: number; world: VolumeTransform; local: VolumeTransform }[];
  definition?: FeatureDefinition;
};

/** Owns one independent rendering/editing runtime per layer. The derived compositor only reads these independent sources. */
export class IndependentLayers {
  readonly metrics = new SculptMetrics();
  readonly group = new Group();
  readonly composite: BooleanComposite;
  readonly neutral = new MeshStandardMaterial({
    color: "#afbd94",
    roughness: 0.68,
    metalness: 0.03,
  });
  readonly compositeMaterial = this.neutral.clone();
  readonly paintedExport = new MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.68,
    metalness: 0.03,
  });
  private readonly runtimes = new Map<string, LayerRuntime>();
  viewMode: SurfaceView = "separate";
  lastBakeStats: BakeStats | null = null;
  /** Session preview reservation, charged to every edit admission while selected. */
  personalStamp?: PersonalStamp;
  lastStampStats: {
    allocatedStagingBytes: number;
    peakStagingBytes: number;
    stagingAllocations: number;
    retainedStagingBytes: number;
    evaluationMs: number;
    meshingMs: number;
    totalMs: number;
    changedVoxels: number;
    scanned: number;
    evaluated: number;
    chunks: number;
    totalChunks: number;
  } | null = null;
  private previewOwner: object | null = null;
  get previewing(): boolean {
    return this.previewOwner !== null;
  }
  beginPreview(owner: object): void {
    this.assertAvailable();
    if (this.selectedGroupId) throw new Error("Select a child layer to use this tool.");
    if (this.drawing || this.transforming) throw new Error("Finish the current edit first.");
    this.previewOwner = owner;
  }
  endPreview(owner: object): void {
    if (this.previewOwner === owner) this.previewOwner = null;
  }
  private tubePending = false;
  private tubeStagingBytes = 0;
  get generatingTube(): boolean {
    return this.tubePending;
  }
  private baking = false;
  private cutPending = false;
  get cutting() {
    return this.cutPending;
  }
  private movePending = false;
  private moveStagingBytes = 0;
  get bakingLayer(): boolean {
    return this.baking;
  }
  get deforming(): boolean {
    return this.movePending;
  }
  lastMoveStats: MoveCommitStats | null = null;
  private disposed = false;
  private revision = 0;
  private get committedRevision(): number {
    return this.revision;
  }
  private set committedRevision(value: number) {
    this.undoMesh = undefined;
    this.revision = value;
  }
  private undoMeshEnabled = false;
  private undoMesh?: {
    runtime: LayerRuntime;
    volume: LayerRuntime["volume"];
    mesher: IncrementalMesher;
    chunks: ReadonlyMap<number, BufferGeometry>;
    bytes: number;
    entry?: TimelineEntry;
  };
  get undoMeshCacheBytes(): number {
    return this.undoMesh?.bytes ?? 0;
  }
  setUndoMeshCacheEnabled(enabled: boolean): void {
    this.undoMeshEnabled = enabled;
    if (!enabled) {
      this.undoMesh = undefined;
      for (const runtime of this.runtimes.values()) runtime.mesher.clearUndoRestore();
    }
  }
  private captureUndoMesh(runtime: LayerRuntime): void {
    if (!this.undoMeshEnabled || runtime.mesher.pendingChunks || runtime.primitiveSource) return;
    const limit = Math.min(
      40 * 1024 ** 2,
      (this.growthLimits.maxTransientBytes ?? DENSE_GROWTH_LIMITS.maxTransientBytes) -
        this.trackedBytes,
    );
    const chunks = new Map<number, BufferGeometry>();
    let bytes = 0;
    for (const { id, geometry, mixedSigns } of runtime.mesher.snapshotUpdates()) {
      const position = geometry.getAttribute("position").array;
      // A zero-area chunk can still have mixed signs and gain triangles on the next edit.
      if (!mixedSigns) continue;
      bytes += position.byteLength + geometry.getAttribute("normal").array.byteLength;
      if (bytes > limit) return;
      chunks.set(id, geometry);
    }
    if (bytes)
      this.undoMesh = { runtime, volume: runtime.volume, mesher: runtime.mesher, chunks, bytes };
  }
  backgroundBytes = 0;
  interruptBackground: () => void = () => {};
  private past: TimelineEntry[] = [];
  private future: TimelineEntry[] = [];
  private transformSession: {
    layerId: string;
    before: VolumeTransform;
    localBefore: VolumeTransform;
    hierarchyBefore?: HierarchyState;
    featureMove?: EnclosureFeatureMove;
  } | null = null;
  selectedGroupId: string | null = null;
  readonly collapsedGroups = new Set<string>();
  private readonly groupProxy = new Group();
  private readonly retainedHierarchy = new Set<LayerRuntime>();
  private copyPending = false;
  private copyStagingBytes = 0;
  get duplicating() {
    return this.copyPending;
  }
  get transformNode() {
    return this.selectedGroupId
      ? this.project.layerStack.hierarchy.get(this.selectedGroupId)
      : this.active.layer;
  }
  get transformObject() {
    return this.selectedGroupId ? this.groupProxy : this.active.surface.group;
  }
  get sourceEditable() {
    return !this.selectedGroupId && this.active.layer.editable;
  }
  selectGroup(id: string): void {
    this.assertAvailable();
    this.finishStroke();
    this.finishTransform();
    if (!(this.project.layerStack.hierarchy.get(id) instanceof LayerGroup))
      throw new Error("Select a group.");
    this.selectedGroupId = id;
    this.syncPresentation();
  }
  hierarchyRows() {
    return this.project.layerStack.hierarchy.rows(this.collapsedGroups);
  }
  private replayHierarchy(target: HierarchyState, other: HierarchyState): void {
    const h = this.project.layerStack.hierarchy,
      current = h.snapshot(),
      next = structuredClone(target);
    for (const node of [...next.layers, ...next.groups]) {
      const now = [...current.layers, ...current.groups].find((n) => n.id === node.id),
        opposite = [...other.layers, ...other.groups].find((n) => n.id === node.id);
      if (!now || !opposite) continue;
      for (const key of ["name", "visible", "locked", "transform", "parentId"] as const)
        if (JSON.stringify(node[key]) === JSON.stringify(opposite[key]))
          Object.assign(node, { [key]: structuredClone(now[key]) });
    }
    for (const extra of current.layers)
      if (!next.layers.some((n) => n.id === extra.id)) {
        next.layers.push(extra);
        next.order.push(extra.id);
        next.compositionOrder.push(extra.id);
      }
    h.restore(next);
  }
  private releaseHierarchyOrphans(): void {
    const kept = new Set(
      this.historyEntries().flatMap((e) => (e.kind === "hierarchy" ? e.removed : [])),
    );
    for (const r of this.retainedHierarchy)
      if (!this.runtimes.has(r.layer.id) && !kept.has(r)) {
        r.dispose();
        this.display.remove(this.project.id, r.layer.id);
        this.retainedHierarchy.delete(r);
      }
  }
  private recordHierarchy(
    before: HierarchyState,
    activeBefore: string,
    selectedBefore: string | null,
    removed: LayerRuntime[] = [],
    booleans?: HierarchyEntry["booleans"],
  ): void {
    const after = this.project.layerStack.hierarchy.snapshot();
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    this.discardFuture();
    this.past.push({
      kind: "hierarchy",
      layerId: this.selectedGroupId ?? this.project.activeLayerId,
      before,
      after,
      removed,
      booleans,
      bytes:
        (JSON.stringify(before).length +
          JSON.stringify(after).length +
          JSON.stringify(booleans ?? []).length) *
        2,
      activeBefore,
      activeAfter: this.project.activeLayerId,
      selectedBefore,
      selectedAfter: this.selectedGroupId,
    });
    for (const r of removed) this.retainedHierarchy.add(r);
    let excess = this.past.filter((e) => e.kind === "hierarchy").length - 100;
    this.past = this.past.filter(
      (e) => e.kind !== "hierarchy" || this.assemblyTransaction || excess-- <= 0,
    );
    this.releaseHierarchyOrphans();
    this.committedRevision++;
    this.syncPresentation();
    this.composite.invalidate();
  }
  private hierarchyEdit(work: () => void): void {
    this.assertAvailable();
    this.finishStroke();
    this.finishTransform();
    const h = this.project.layerStack.hierarchy,
      before = h.snapshot(),
      active = this.project.activeLayerId,
      selected = this.selectedGroupId;
    try {
      work();
      validateAssembly(this.project.layerStack);
      this.recordHierarchy(before, active, selected);
    } catch (error) {
      h.restore(before);
      this.selectedGroupId = selected;
      throw error;
    }
  }
  createGroup(name = "Group"): string {
    let id = "";
    this.hierarchyEdit(() => {
      id = this.project.layerStack.hierarchy.create(name);
      this.selectedGroupId = id;
    });
    return id;
  }
  reparent(id: string, parentId: string | null): void {
    this.hierarchyEdit(() => {
      const h = this.project.layerStack.hierarchy;
      h.get(id).assertEditable();
      if (parentId) h.get(parentId).assertEditable();
      h.reparent(id, parentId);
    });
  }
  renameNode(id: string, name: string): void {
    this.assertAvailable();
    this.finishStroke();
    this.finishTransform();
    const n = this.project.layerStack.hierarchy.get(id);
    if (n.locked) throw new Error("Unlock the node before renaming.");
    name = validateName(name.trim());
    if (name === n.name) return;
    const before = n.name;
    n.name = name;
    this.discardFuture();
    this.past.push({ kind: "name", layerId: id, before, after: name });
    let excess = this.past.filter((e) => e.kind === "name").length - 100;
    this.past = this.past.filter(
      (e) => e.kind !== "name" || this.assemblyTransaction || excess-- <= 0,
    );
    this.committedRevision++;
    this.syncPresentation();
  }
  setNodeFlag(id: string, flag: "visible" | "locked", value: boolean): void {
    if (!this.project.layerStack.hierarchy.groups.some((g) => g.id === id)) {
      this.setFlag(id, flag, value);
      return;
    }
    this.hierarchyEdit(() => {
      const h = this.project.layerStack.hierarchy;
      if (h.parentsLocked(id)) throw new Error("Unlock the parent group.");
      h.get(id)[flag] = value;
    });
  }
  moveBoolean(id: string, delta: number): void {
    this.hierarchyEdit(() => {
      const layer = this.project.layerStack.get(id);
      if (layer.locked) throw new Error("Unlock the layer before changing Boolean order.");
      const h = this.project.layerStack.hierarchy,
        state = h.snapshot(),
        index = state.compositionOrder.indexOf(id),
        next = index + delta;
      if (next < 0 || next >= state.compositionOrder.length)
        throw new Error("Already at the edge of the Boolean sequence.");
      state.compositionOrder.splice(index, 1);
      state.compositionOrder.splice(next, 0, id);
      h.restore(state);
    });
  }
  moveNode(id: string, delta: number): void {
    this.hierarchyEdit(() => {
      const h = this.project.layerStack.hierarchy;
      h.get(id).assertEditable();
      const siblings = h.children(h.parent(id)),
        at = siblings.indexOf(id),
        target = siblings[at + delta];
      if (!target) throw new Error("Already at the edge of this group.");
      const state = h.snapshot(),
        a = state.order.indexOf(id),
        b = state.order.indexOf(target);
      state.order.splice(a, 1);
      state.order.splice(b, 0, id);
      h.restore(state);
    });
  }
  deleteGroup(id: string, children: "keep" | "delete" = "keep"): void {
    this.assertAvailable();
    this.finishStroke();
    this.finishTransform();
    const stack = this.project.layerStack,
      h = stack.hierarchy,
      node = h.get(id);
    if (!(node instanceof LayerGroup)) throw new Error("Select a group.");
    node.assertEditable();
    const before = h.snapshot(),
      active = this.project.activeLayerId,
      selected = this.selectedGroupId,
      descendants = h.descendants(id),
      removed =
        children === "delete"
          ? descendants
              .filter((n) => stack.layers.some((l) => l.id === n))
              .map((n) => this.runtime(n))
          : [];
    if (removed.length >= stack.layers.length) throw new Error("Keep at least one sculpt layer.");
    if (children === "delete" && descendants.some((n) => h.get(n).locked))
      throw new Error("Unlock descendants before deleting them.");
    try {
      if (children === "keep") for (const child of h.children(id)) h.reparent(child, node.parentId);
      const state = h.snapshot(),
        gone = new Set([id, ...(children === "delete" ? descendants : [])]);
      state.groups = state.groups.filter((g) => !gone.has(g.id));
      state.layers = state.layers.filter((l) => !gone.has(l.id));
      state.order = state.order.filter((n) => !gone.has(n));
      state.compositionOrder = state.compositionOrder.filter((n) => !gone.has(n));
      for (const r of removed) {
        stack.remove(r.layer.id);
        this.runtimes.delete(r.layer.id);
        this.group.remove(r.surface.group);
      }
      h.restore(state);
      this.selectedGroupId = null;
      this.recordHierarchy(before, active, selected, removed);
    } catch (error) {
      for (const r of removed)
        if (!this.runtimes.has(r.layer.id)) {
          stack.insert(r.layer);
          this.install(r);
        }
      h.restore(before);
      this.selectedGroupId = selected;
      throw error;
    }
  }

  growthLimits: Partial<DenseGrowthLimits> = {};
  readonly symmetry: MirrorPlane = { enabled: false, axis: "x", offset: 0 };
  private strokeMirror: MirrorPlane = { enabled: false, axis: "x", offset: 0 };
  private strokePoint: Point3 | null = null;
  private strokeLayer: string | null = null;
  private paintBefore: PaintSnapshot | null = null;
  paintColour = "#e34b45";
  private maskBefore: MaskSnapshot | null = null;
  maskOverlayVisible = true;
  clearPaint(): void {
    this.beginStroke("paint");
    sculptPaint(this.active.volume).clear();
    this.finishStroke();
  }
  private trimPaintHistory(): void {
    let bytes = 0,
      count = 0;
    for (const entry of [...this.future, ...this.past].reverse())
      if (entry.kind === "paint") {
        bytes += paintSnapshotBytes(entry.before) + paintSnapshotBytes(entry.after);
        if (++count > 1 && (bytes > 32 * 1024 ** 2 || count > 100)) {
          this.past = this.past.filter((e) => e !== entry);
          this.future = this.future.filter((e) => e !== entry);
        }
      }
  }
  private trimMaskHistory(): void {
    let bytes = 0,
      count = 0;
    for (const entry of [...this.future, ...this.past].reverse())
      if (entry.kind === "mask") {
        bytes += maskSnapshotBytes(entry.before) + maskSnapshotBytes(entry.after);
        count++;
        if (count > 1 && (bytes > 32 * 1024 ** 2 || count > 100)) {
          this.past = this.past.filter((e) => e !== entry);
          this.future = this.future.filter((e) => e !== entry);
        }
      }
  }
  updateMaskOverlays(budgetMs = 2): void {
    const deadline = performance.now() + budgetMs;
    for (const runtime of this.runtimes.values()) {
      runtime.paintSurface.update(
        runtime.surface.group,
        runtime.volume,
        runtime.material,
        deadline,
        runtime.surface.revision,
      );
      runtime.maskOverlay.update(
        runtime.surface.group,
        runtime.volume,
        this.maskOverlayVisible,
        deadline,
      );
    }
  }
  maskOperation(operation: "invert" | "clear" | "all"): void {
    this.assertAvailable();
    this.finishStroke();
    this.finishTransform();
    const r = this.editableRuntime(this.project.activeLayerId);
    this.assertSculptable(r.layer);
    const mask = sculptMask(r.volume);
    if (
      (operation === "clear" && mask.empty) ||
      (operation === "all" && mask.defaultValue === 1 && mask.entryCount === 0)
    )
      return;
    const before = mask.snapshot();
    if (operation === "invert") mask.invert();
    else mask.uniform(operation === "all" ? 1 : 0);
    this.discardFuture();
    this.past.push({ kind: "mask", layerId: r.layer.id, before, after: mask.snapshot() });
    this.trimMaskHistory();
    this.committedRevision++;
    this.updateMaskOverlays();
  }

  private readonly stroke = new ClayStroke();
  private strokeGeneration = 0;
  private resamplingGeneration?: number;
  private preparingStandaloneStamp = false;
  constructor(
    readonly project: SculptProject,
    readonly display = new LayerDisplayPreferences(),
    deferMesh = false,
  ) {
    this.composite = new BooleanComposite(
      project,
      this.compositeMaterial,
      192,
      this.neutral,
      () => true,
      {
        boundedPreview: true,
      },
    );
    this.composite.availableBytes = () => 256 * 1024 ** 2 - this.trackedBytes;
    if (project.layerStack.layers.some((l) => l.booleanModifiers?.length || l.array?.enabled))
      this.viewMode = "boolean";
    this.assertCapacity();
    assertIndependentLayerVolumes(project.layerStack.layers);
    if (project.displayPreferences)
      this.display.restore(project.id, project.layerStack.layers, project.displayPreferences);
    try {
      for (const layer of project.layerStack.layers)
        this.install(new LayerRuntime(layer, this.neutral, layer.volume, deferMesh));
      this.syncPresentation();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  /** Lower bound: current source grids+scratch, source geometry and retained payloads.
   * Includes retained Bake runtimes; excludes pending Maps, derived CSG and JS/GPU overhead. */
  get recoveryReady(): boolean {
    return (
      (!this.modellingOwner || this.modellingAccess) &&
      !this.copyPending &&
      !this.tubePending &&
      !this.cutPending &&
      !this.disposed &&
      !this.preparingStandaloneStamp &&
      this.resamplingGeneration === undefined &&
      !this.drawing &&
      !this.transforming &&
      !this.previewing &&
      !this.deforming &&
      !this.baking &&
      !this.pendingChunks
    );
  }
  private readonly commandScope = newId();
  private commandKey = "";
  private commandRevision = 0;
  private commandSerial = 0;
  /** Compact editor-lifetime token observing the same identity as recovery, including UI edits. */
  get modellingRevision(): string {
    this.updateCommandRevision();
    return `${this.commandScope}:${this.commandRevision}`;
  }
  private updateCommandRevision(): void {
    const key = JSON.stringify([
      this.recoveryKey(),
      this.selectedGroupId,
      this.display.components,
      this.display.precision.millimetresPerUnit,
      this.project.layerStack.layers.map((l) =>
        this.display.colour(this.project.id, l.id, l.order),
      ),
    ]);
    if (key !== this.commandKey) {
      this.commandKey = key;
      this.commandRevision = ++this.commandSerial;
    }
  }
  /** Derived views depend on source edits, not which layer the UI has selected. */
  get sourceRevision(): string {
    return this.recoveryKey(false);
  }
  recoveryKey(includeSelection = true): string {
    return JSON.stringify([
      this.project.id,
      this.committedRevision,
      this.project.layerStack.hierarchy.snapshot(),
      includeSelection ? this.project.activeLayerId : null,
      this.project.layerStack.layers.map((l) => [
        l.metadata(),
        l.volume.dimensions,
        l.volume.latticeMin,
      ]),
    ]);
  }
  resourceStats() {
    let paintAttributeBytes = 0,
      maskAttributeBytes = 0,
      voxelBytes = 0,
      geometryBytes = 0,
      historyBytes = 0,
      pendingHistoryBytes = 0,
      chunks = 0,
      meshChunks = 0,
      vertices = 0,
      triangles = 0;
    const held = new Set(this.runtimes.values());
    for (const entry of this.historyEntries())
      if (entry.kind === "bake") held.add(entry.runtime);
      else if (entry.kind === "hierarchy") for (const r of entry.removed) held.add(r);
      else if (entry.kind === "cut") {
        held.add(entry.original);
        held.add(entry.negative);
        held.add(entry.positive);
      } else if (entry.kind === "cut-batch")
        for (const cut of entry.entries) {
          held.add(cut.original);
          held.add(cut.negative);
          held.add(cut.positive);
        }
    for (const r of held) {
      voxelBytes +=
        r.volume instanceof SparseSDFVolume
          ? r.volume.pageMemoryBytes +
            r.volume.scratchBytes +
            r.mesher.haloBytes +
            r.mesher.allocatedChunks * 512
          : volumeSampleCount(r.volume) * 8;
      historyBytes += r.history.memoryBytes;
      pendingHistoryBytes += r.history.pendingMemoryEstimate;
      geometryBytes += r.mesher.ownedGeometryBytes;
      chunks += r.mesher.allocatedChunks;
      for (const mesh of r.surface.group.children) {
        const geometry = (mesh as Mesh).geometry;
        paintAttributeBytes += geometry?.getAttribute("color")?.array.byteLength ?? 0;
        maskAttributeBytes += geometry?.getAttribute("sculptMaskWeight")?.array.byteLength ?? 0;
        const count = geometry?.getAttribute("position").count ?? 0;
        vertices += count;
        triangles += count / 3;
        if (count) meshChunks++;
      }
    }
    const maskBytes = [...held].reduce((n, r) => n + sculptMask(r.volume).memoryBytes, 0),
      maskHistoryBytes = this.historyEntries().reduce(
        (n, e) =>
          n + (e.kind === "mask" ? maskSnapshotBytes(e.before) + maskSnapshotBytes(e.after) : 0),
        0,
      );
    const paintBytes = [...held].reduce((n, r) => n + sculptPaint(r.volume).memoryBytes, 0);
    return {
      paintAttributeBytes,
      maskAttributeBytes,
      paintBytes,
      maskBytes,
      maskHistoryBytes,
      voxelBytes,
      geometryBytes,
      historyBytes,
      pendingHistoryBytes,
      chunks,
      meshChunks,
      vertices,
      triangles,
      retainedRuntimes: held.size,
      pendingTubeJobs: Number(this.tubePending),
      tubeStagingBytes: this.tubeStagingBytes,
      pendingMoveJobs: Number(this.deforming),
      pendingBakeJobs: Number(this.baking),
      backgroundBytes: this.backgroundBytes,
      compositeBytes: this.composite.trackedBytes,
    };
  }
  get trackedBytes(): number {
    return this.memoryEstimate(false);
  }
  sparseDiagnostics() {
    const runtime = this.active,
      volume = runtime.volume;
    if (!(volume instanceof SparseSDFVolume)) return undefined;
    const queue = this.sparseQueue();
    return {
      backend: "sparse" as const,
      pages: volume.allocatedPages,
      spacing: volume.step,
      trackedBytes: this.memoryEstimate(true),
      pending: queue.pending,
      oldestMs: queue.oldest === Infinity ? 0 : performance.now() - queue.oldest,
      brushMs: runtime.brushMs,
      meshMs: runtime.lastMeshMs,
    };
  }
  private memoryEstimate(resident: boolean): number {
    let bytes =
      (this.assemblyPreview?.bytes() ?? 0) +
      (this.personalStamp ? personalStampSource(this.personalStamp).bytes : 0);
    const held = new Set(this.runtimes.values());
    for (const entry of this.historyEntries())
      if (entry.kind === "bake") held.add(entry.runtime);
      else if (entry.kind === "hierarchy") for (const r of entry.removed) held.add(r);
      else if (entry.kind === "cut") {
        held.add(entry.original);
        held.add(entry.negative);
        held.add(entry.positive);
      } else if (entry.kind === "cut-batch")
        for (const cut of entry.entries) {
          held.add(cut.original);
          held.add(cut.negative);
          held.add(cut.positive);
        }
    for (const r of held) {
      bytes +=
        (r.volume instanceof SparseSDFVolume
          ? r.volume.pageMemoryBytes +
            r.volume.scratchBytes +
            r.mesher.haloBytes +
            r.mesher.allocatedChunks * 512
          : volumeSampleCount(r.volume) * 8) +
        (resident ? r.history.pendingMemoryEstimate : 0) +
        (r.primitiveSource ? r.mesher.ownedGeometryBytes : 0) +
        r.mesher.undoRestoreBytes +
        r.history.memoryBytes +
        sculptMask(r.volume).memoryBytes +
        sculptPaint(r.volume).memoryBytes;
      for (const mesh of r.surface.group.children) {
        const geometry = (mesh as import("three").Mesh).geometry;
        if (geometry) {
          for (const attr of Object.values(geometry.attributes)) bytes += attr.array.byteLength;
          if (geometry.index) bytes += geometry.index.array.byteLength;
        }
      }
    }
    const caches = new Set<VolumeStore>();
    for (const e of this.historyEntries())
      if (e.kind === "tube") {
        caches.add(e.before.volume);
        caches.add(e.after.volume);
      }
    for (const v of caches)
      if (![...held].some((r) => r.volume === v)) bytes += volumeSampleCount(v) * 8;
    for (const e of this.historyEntries()) {
      if (e.kind === "hierarchy") bytes += e.bytes;
      if (e.kind === "name") bytes += (e.before.length + e.after.length) * 2;
    }
    for (const e of this.historyEntries())
      if (e.kind === "mask") bytes += maskSnapshotBytes(e.before) + maskSnapshotBytes(e.after);
    for (const e of this.historyEntries()) {
      if (e.kind === "paint") bytes += paintSnapshotBytes(e.before) + paintSnapshotBytes(e.after);
      if (e.kind === "voxels" && e.paintBefore && e.paintAfter)
        bytes += paintSnapshotBytes(e.paintBefore) + paintSnapshotBytes(e.paintAfter);
    }
    return (
      bytes +
      (this.paintBefore ? paintSnapshotBytes(this.paintBefore) : 0) +
      this.copyStagingBytes +
      (this.maskBefore ? maskSnapshotBytes(this.maskBefore) : 0) +
      this.tubeStagingBytes +
      this.moveStagingBytes +
      this.backgroundBytes +
      this.undoMeshCacheBytes
    );
  }
  private sparseQueue() {
    let runtime: LayerRuntime | undefined,
      oldest = Infinity,
      pending = 0;
    for (const candidate of this.runtimes.values()) {
      if (!(candidate.volume instanceof SparseSDFVolume)) continue;
      pending += candidate.mesher.pendingChunks;
      const queuedAt = candidate.mesher.oldestPendingAt;
      if (queuedAt !== undefined && queuedAt < oldest) {
        runtime = candidate;
        oldest = queuedAt;
      }
    }
    return { runtime, oldest, pending };
  }
  /** Give the oldest released queue one bounded slice when brush work does not own the frame. */
  drainSparseMeshes(): boolean {
    // Move and Cut own a staging allowance. An unrelated queued remesh
    // must not grow the live mesh allocation while that allowance is in use.
    if (this.strokeLayer || this.movePending || this.cutPending) return false;
    const rebuilt = this.sparseQueue().runtime?.rebuild() ?? false;
    if (
      rebuilt ||
      this.previewOwner ||
      this.baking ||
      this.copyPending ||
      this.modellingOwner ||
      this.preparingStandaloneStamp
    )
      return rebuilt;
    for (const { volume } of this.runtimes.values())
      if (volume instanceof SparseSDFVolume) volume.reclaimImplicitPages(8);
    return false;
  }
  get pendingChunks(): number {
    let count = 0;
    for (const r of this.runtimes.values()) count += r.mesher.pendingChunks;
    return count;
  }
  get active(): LayerRuntime {
    return this.runtime(this.project.activeLayerId);
  }
  runtime(id: string): LayerRuntime {
    const runtime = this.runtimes.get(id);
    if (!runtime) throw new Error("Layer runtime does not exist.");
    return runtime;
  }
  get undoCount(): number {
    return this.past.length;
  }
  get redoCount(): number {
    return this.future.length;
  }
  get transforming(): boolean {
    return this.transformSession !== null;
  }
  get drawing(): boolean {
    return this.strokeLayer !== null;
  }
  private modellingOwner: symbol | null = null;
  private modellingAccess = false;
  get modellingBusy(): boolean {
    return this.modellingOwner !== null;
  }
  acquireModellingLease(): symbol {
    this.assertAvailable();
    if (!this.recoveryReady) throw new Error("Finish the current edit first.");
    this.modellingOwner = Symbol("modelling transaction");
    return this.modellingOwner;
  }
  withModellingLease<T>(owner: symbol, work: () => T): T {
    if (this.modellingOwner !== owner) throw new Error("Invalid modelling lease.");
    const previous = this.modellingAccess;
    this.modellingAccess = true;
    try {
      return work();
    } finally {
      this.modellingAccess = previous;
    }
  }
  releaseModellingLease(owner: symbol): void {
    if (this.modellingOwner !== owner) throw new Error("Invalid modelling lease.");
    this.modellingOwner = null;
  }
  private assertAvailable(): void {
    if (this.modellingOwner && !this.modellingAccess)
      throw new Error("A modelling transaction is active.");
    this.interruptBackground();
    if (this.copyPending) throw new Error("Wait for layer duplication or cancel it.");
    if (this.tubePending) throw new Error("Wait for tube regeneration or cancel it.");
    if (this.cutPending) throw new Error("Wait for the cut preview or cancel it.");
    if (this.disposed) throw new Error("Project is closed.");
    if (this.previewOwner) throw new Error("Finish the Move preview first.");
    if (this.movePending) throw new Error("Wait for Move reconstruction to finish or cancel it.");
    if (this.baking) throw new Error("Wait for Bake to finish or cancel it.");
  }
  private editableRuntime(id: string, history = false): LayerRuntime {
    if (this.selectedGroupId && !history)
      throw new Error("Select a child layer to sculpt. Groups contain no SDF.");
    this.assertAvailable();
    assertIndependentLayerVolumes(this.project.layerStack.layers);
    const runtime = this.runtime(id);
    if (runtime.volume !== runtime.layer.volume)
      throw new Error(
        "Volume replaced outside the layer resolution command. Keep meshing and history bound to the original layer store.",
      );
    runtime.layer.assertEditable();
    return runtime;
  }
  private install(runtime: LayerRuntime): void {
    runtime.metrics = this.metrics;
    this.bindSparseBudget(runtime);
    this.runtimes.set(runtime.layer.id, runtime);
    this.group.add(runtime.surface.group);
  }
  private bindSparseBudget(runtime: LayerRuntime): void {
    if (runtime.volume instanceof SparseSDFVolume) {
      runtime.volume.pageHistory = runtime.history;
      runtime.volume.admitAllocation = (bytes) => {
        if (
          this.trackedBytes +
            this.composite.trackedBytes +
            runtime.history.pendingMemoryEstimate +
            bytes >
          (this.growthLimits.maxTransientBytes ?? DENSE_GROWTH_LIMITS.maxTransientBytes)
        )
          throw new Error("Sparse edit exceeds the resident and transient memory budget.");
      };
    }
  }
  private validateSparseGrowth(
    runtime: LayerRuntime,
    source: SparseSDFVolume,
    layout: import("./sdf").DenseLatticeLayout,
    options: Partial<DenseGrowthLimits>,
  ): void {
    if (
      layout.dimensions.some(
        (n) => n > Math.min(options.maxAxisSamples ?? MAX_SPARSE_AXIS, MAX_SPARSE_AXIS),
      ) ||
      (options.maxSamples !== undefined &&
        layout.dimensions.reduce((n, d) => n * d, 1) > options.maxSamples)
    )
      throw new Error("Sparse growth exceeds the logical lattice limit. Existing sculpture kept.");
    // A stamp/Boolean can replace even positive face distances. Such faces have
    // no defined implicit continuation in this growth policy.
    source.assertGrowthBoundary(layout);
    // A pending redo could restore a non-default old face after capacity grows.
    // Reject such history on a moving face, regardless of the live field.
    runtime.history.assertSparseGrowthBoundary(source, layout);
  }
  private prepareSparseChannelHistory(
    runtime: LayerRuntime,
    next: SparseSDFVolume,
    entries: Iterable<TimelineEntry>,
    check: (bytes: number) => void,
  ): () => void {
    const stagedMasks = new Map<MaskSnapshot, MaskSnapshot>();
    const rebindMask = (before: MaskSnapshot): MaskSnapshot => {
      const previous = stagedMasks.get(before);
      if (previous) return previous;
      const mask = new SculptMask(next);
      mask.restore(before, check);
      const result = mask.snapshot();
      stagedMasks.set(before, result);
      return result;
    };
    const rebindPaint = (before: PaintSnapshot) => before.map(rebindMask) as PaintSnapshot;
    const rebindChannels: (() => void)[] = [];
    for (const entry of entries) {
      if (entry.layerId !== runtime.layer.id) continue;
      if (entry.kind === "mask") {
        const before = rebindMask(entry.before),
          after = rebindMask(entry.after);
        rebindChannels.push(() => {
          entry.before = before;
          entry.after = after;
        });
      } else if (entry.kind === "paint") {
        const before = rebindPaint(entry.before),
          after = rebindPaint(entry.after);
        rebindChannels.push(() => {
          entry.before = before;
          entry.after = after;
        });
      } else if (entry.kind === "voxels" && entry.paintBefore && entry.paintAfter) {
        const before = rebindPaint(entry.paintBefore),
          after = rebindPaint(entry.paintAfter);
        rebindChannels.push(() => {
          entry.paintBefore = before;
          entry.paintAfter = after;
        });
      }
    }
    return () => {
      for (const publish of rebindChannels) publish();
    };
  }
  private growSparseRuntime(
    runtime: LayerRuntime,
    source: SparseSDFVolume,
    footprint: import("./volume-store").VolumeBounds,
  ): void {
    const started = performance.now(),
      options = this.growthLimits;
    const layout = growthLayout(source, footprint, options);
    if (!layout) return;
    this.validateSparseGrowth(runtime, source, layout, options);
    const chunks = runtime.mesher.allocatedChunks;
    const limit = options.maxTransientBytes ?? DENSE_GROWTH_LIMITS.maxTransientBytes;
    let staged =
      this.trackedBytes +
      this.composite.trackedBytes +
      runtime.history.pendingMemoryEstimate * 2.5 +
      runtime.history.memoryBytes / 3 +
      source.pageMemoryBytes +
      chunks * 512;
    const check = (bytes: number) => {
      staged += bytes;
      if (staged > limit)
        throw new Error(
          "Sparse growth exceeds the resident and transient memory budget. Existing sculpture kept.",
        );
    };
    check(0);
    const next = source.copyForGrowth(layout),
      snapshot = this.undoMesh;
    sculptMask(next).restore(sculptMask(source).snapshot(), check);
    sculptPaint(next).restore(sculptPaint(source).snapshot(), check);
    const publishChannels = this.prepareSparseChannelHistory(
      runtime,
      next,
      this.historyEntries(),
      check,
    );
    const cache =
      snapshot?.runtime === runtime
        ? new Map(
            [...snapshot.chunks].filter(([id]) =>
              runtime.mesher.chunkCanReuseAfterGrowth(id, next),
            ),
          )
        : undefined;
    const publishHistory = runtime.history.prepareVolumeRebind(next),
      publishMesh = runtime.mesher.prepareRebindVolume(next);
    publishMesh();
    publishHistory();
    publishChannels();
    source.admitAllocation = undefined;
    source.pageHistory = undefined;
    runtime.volume = runtime.layer.volume = next;
    this.bindSparseBudget(runtime);
    next.finishGrowth();
    runtime.totalChunks = runtime.mesher.allocatedChunks;
    if (cache && snapshot) {
      snapshot.volume = next;
      snapshot.chunks = cache;
    }
    runtime.history.pendingBudgetBytes = Math.min(
      runtime.history.pendingBudgetBytes,
      Math.max(0, limit - this.trackedBytes - this.composite.trackedBytes),
    );
    runtime.expansions++;
    runtime.lastExpansionMs = performance.now() - started;
    this.committedRevision++;
    this.composite.invalidateLayer(runtime.layer);
  }
  private assertCapacity(
    additional = 0,
    replacing?: string,
    extraLayers = 0,
    reactivating?: string,
  ): void {
    const layers = this.project.layerStack.layers;
    const held = new Set<LayerRuntime>();
    for (const entry of this.flattenEntries(this.future))
      if (
        entry.kind === "bake" &&
        !this.runtimes.has(entry.layerId) &&
        entry.layerId !== reactivating
      )
        held.add(entry.runtime);
    for (const r of this.retainedHierarchy)
      if (!this.runtimes.has(r.layer.id) && r.layer.id !== reactivating) held.add(r);
    for (const entry of this.flattenEntries(this.future))
      if (entry.kind === "cut") {
        held.add(entry.original);
        held.add(entry.negative);
        held.add(entry.positive);
      }
    for (const entry of this.flattenEntries(this.future))
      if (entry.kind === "cut-batch")
        for (const cut of entry.entries) {
          held.add(cut.original);
          held.add(cut.negative);
          held.add(cut.positive);
        }
    if (additional && !reactivating && this.trackedBytes + additional * 8 > 256 * 1024 ** 2)
      throw new Error("Layer allocation exceeds the memory safety budget.");
    const samples =
      layers.reduce(
        (sum, layer) =>
          sum +
          (layer.id === replacing || layer.volume instanceof SparseSDFVolume
            ? 0
            : volumeSampleCount(layer.volume)),
        0,
      ) +
      additional +
      [...held].reduce(
        (sum, r) => sum + (r.volume instanceof SparseSDFVolume ? 0 : volumeSampleCount(r.volume)),
        0,
      );
    if (layers.length + extraLayers > MAX_PROJECT_LAYERS)
      throw new Error(`Maximum of ${MAX_PROJECT_LAYERS} independent layers reached.`);
    if (samples > MAX_PROJECT_VOXELS)
      throw new Error(
        "Project voxel budget exceeded. Explicitly reduce a layer resolution or delete a layer; existing layers were kept.",
      );
  }
  private assemblyPreview?: {
    group: Group;
    current: () => boolean;
    dispose: () => void;
    bytes: () => number;
  };
  clearAssemblyPreview(): void {
    this.display.assemblyPreview = false;
    const preview = this.assemblyPreview;
    this.assemblyPreview = undefined;
    preview?.dispose();
  }
  installAssemblyPreview(preview: NonNullable<IndependentLayers["assemblyPreview"]>): void {
    this.clearAssemblyPreview();
    this.assemblyPreview = preview;
    this.display.assemblyPreview = true;
    this.group.add(preview.group);
    this.viewMode = "separate";
    this.syncPresentation();
  }
  get assemblyPreviewActive(): boolean {
    return !!this.assemblyPreview && this.assemblyPreview.current() && this.viewMode === "separate";
  }
  syncAssemblyPreview(): boolean {
    if (!this.assemblyPreview) return false;
    if (!this.assemblyPreview.current() || this.viewMode !== "separate") {
      this.clearAssemblyPreview();
      this.syncPresentation();
      return false;
    }
    for (const runtime of this.runtimes.values()) runtime.surface.group.visible = false;
    this.group.visible = true;
    this.composite.group.visible = false;
    return true;
  }
  syncPresentation(): void {
    if (this.selectedGroupId) {
      const n = this.transformNode,
        t = n.transform;
      this.groupProxy.name = n.name;
      this.groupProxy.position.fromArray(t.position);
      this.groupProxy.rotation.set(...t.rotation, "XYZ");
      this.groupProxy.scale.fromArray(t.scale);
      if (this.groupProxy.parent !== this.group) this.group.add(this.groupProxy);
    } else this.groupProxy.removeFromParent();
    applyRenderStyle(this.compositeMaterial, this.display.renderStyle);
    this.compositeMaterial.color.copy(
      this.compositeMaterial.vertexColors ? new Color(1, 1, 1) : this.neutral.color,
    );
    this.composite.paintBase = (l) => this.runtime(l.id).paintSurface.base;
    for (const layer of this.project.layerStack.layers) {
      const runtime = this.runtime(layer.id),
        group = runtime.surface.group;
      group.name = layer.name;
      group.visible = layer.visible;
      group.position.fromArray(layer.transform.position);
      group.rotation.set(...layer.transform.rotation, "XYZ");
      group.scale.fromArray(layer.transform.scale);
      group.renderOrder = layer.order;
      runtime.paintSurface.base.set(
        this.display.mode === "clay"
          ? this.neutral.color
          : this.display.colour(this.project.id, layer.id, layer.order),
      );
      if (!runtime.material.vertexColors) runtime.material.color.copy(runtime.paintSurface.base);
      applyRenderStyle(runtime.material, this.display.renderStyle);
      // A viewport-only depth tie-break for exactly coincident surfaces. Never moves geometry or voxels.
      runtime.material.polygonOffset = true;
      runtime.material.polygonOffsetFactor = -(layer.order + 1) * 0.1;
      runtime.material.polygonOffsetUnits = -(layer.order + 1) * 0.1;
      this.display.colour(this.project.id, layer.id, layer.order);
      group.updateWorldMatrix(true, true);
    }
    this.syncAssemblyPreview();
  }
  /** Preallocate every throwing stage, then publish store/history/mesh together.
   * Undo and cancellation retain harmless capacity but replay exact voxel values. */
  private growRuntime(
    runtime: LayerRuntime,
    footprint: import("./volume-store").VolumeBounds,
    extraBytes = 0,
  ): boolean {
    if (!(runtime.volume instanceof SDFVolume))
      throw new Error("Automatic growth requires a dense source.");
    const expansionStart = performance.now(),
      source = runtime.volume,
      options = { ...this.growthLimits },
      plan = planDenseGrowth(source, footprint, options);
    if (!plan) return false;
    this.undoMesh = undefined;
    this.assertCapacity(plan.samples, runtime.layer.id);
    const otherTracked = this.trackedBytes + extraBytes - volumeSampleCount(source) * 8,
      remapEstimate = runtime.history.memoryBytes / 3 + runtime.history.pendingMemoryEstimate * 1.5;
    if (
      plan.transientStorageBytes + otherTracked + remapEstimate >
      (options.maxTransientBytes ?? DENSE_GROWTH_LIMITS.maxTransientBytes)
    )
      throw new Error(
        "Volume growth exceeds the storage and history safety estimate. Existing sculpture kept.",
      );
    const result = prepareDenseGrowth(source, footprint, options),
      next = result.volume;
    const publishHistory = runtime.history.prepareVolumeRebind(next),
      publishMesh = runtime.mesher.prepareRebindVolume(next);
    publishMesh();
    publishHistory();
    runtime.volume = runtime.layer.volume = next;
    runtime.totalChunks = runtime.mesher.allocatedChunks;
    runtime.history.pendingBudgetBytes = Math.max(
      0,
      (options.maxTransientBytes ?? DENSE_GROWTH_LIMITS.maxTransientBytes) - this.trackedBytes,
    );
    runtime.expansions++;
    runtime.lastExpansionMs = performance.now() - expansionStart;
    this.composite.invalidateLayer(runtime.layer);
    return true;
  }
  private assertSculptable(layer: SdfLayer): void {
    if (
      layer.procedural ||
      layer.primitive ||
      layer.booleanModifiers?.length ||
      layer.array?.enabled
    )
      throw new Error("Bake the parametric source to a sculpt layer before brushing.");
  }
  select(id: string): void {
    this.assertAvailable();
    this.finishStroke();
    this.finishTransform();
    this.project.layerStack.select(id);
    this.selectedGroupId = null;
    this.groupProxy.removeFromParent();
  }
  beginStroke(mask: boolean | "paint" = false): void {
    validateMirrorPlane(this.symmetry);
    if (this.preparingStandaloneStamp) throw new Error("Finish or cancel the pending stamp.");
    if (mask === "paint" && this.viewMode !== "separate")
      throw new Error("Choose Separate Layers to paint an editable source.");
    if (this.transformSession) throw new Error("Finish the transform before sculpting.");
    if (this.strokeLayer) throw new Error("Finish the current stroke first.");
    const runtime = this.editableRuntime(this.project.activeLayerId);
    this.assertSculptable(runtime.layer);
    uniformScale(runtime.layer.transform);
    if (mask === "paint") {
      this.paintBefore = sculptPaint(runtime.volume).snapshot();
      sculptPaint(runtime.volume).colour = this.paintColour;
    } else if (mask) this.maskBefore = sculptMask(runtime.volume).snapshot();
    else runtime.history.begin();
    this.undoMesh = undefined;
    if (!mask) this.captureUndoMesh(runtime);
    runtime.history.pendingBudgetBytes = Math.max(
      0,
      (this.growthLimits.maxTransientBytes ?? DENSE_GROWTH_LIMITS.maxTransientBytes) -
        this.trackedBytes,
    );
    this.strokeLayer = runtime.layer.id;
    this.strokeMirror = { ...this.symmetry };
    this.resetStrokePath();
    this.metrics.beginStroke();
  }
  applyStroke(
    worldPoint: Point3,
    radius: number,
    mode: BrushMode,
    strength: number,
    dt: number,
    hardness: number,
  ): Bounds | null {
    if (!this.strokeLayer) return null;
    const layer = this.runtime(this.strokeLayer).layer;
    return this.applyStrokeLocal(
      toLocal(worldPoint, layer.transform),
      radius / uniformScale(layer.transform),
      mode,
      strength,
      dt,
      hardness,
    );
  }
  /** Trusted trajectory input is already layer-local; workspace presentation never enters source metadata. */
  applyStrokeLocal(
    point: Point3,
    radius: number,
    mode: BrushMode,
    strength: number,
    dt: number,
    hardness: number,
    freeSpace = false,
  ): Bounds | null {
    if (!this.strokeLayer) return null;
    if (this.resamplingGeneration === this.strokeGeneration)
      throw new Error("Finish the pending brush sample first.");
    const runtime = this.editableRuntime(this.strokeLayer);
    if ((mode === "paint" || mode === "paint-erase") !== !!this.paintBefore)
      throw new Error("Stroke kind changed; cancel before switching paint tools.");
    if ((mode === "mask" || mode === "mask-erase") !== !!this.maskBefore)
      throw new Error("Stroke kind changed; cancel before switching mask/sculpt tools.");
    if (
      ![point.x, point.y, point.z, radius, strength, dt, hardness].every(Number.isFinite) ||
      radius <= 0 ||
      strength <= 0 ||
      dt <= 0
    )
      return null;
    const start = performance.now();
    if (
      mode === "add" &&
      Number.isFinite(radius) &&
      radius > 0 &&
      [point.x, point.y, point.z].every(Number.isFinite)
    ) {
      const previous = this.strokePoint ?? point,
        now = [point.x, point.y, point.z],
        before = [previous.x, previous.y, previous.z];
      const points = [point, previous];
      if (this.strokeMirror.enabled)
        points.push(
          reflectPoint(point, this.strokeMirror),
          reflectPoint(previous, this.strokeMirror),
        );
      for (let a = 0; a < 3; a++) {
        now[a] = Math.max(...points.map((p) => [p.x, p.y, p.z][a]));
        before[a] = Math.min(...points.map((p) => [p.x, p.y, p.z][a]));
      }
      const footprint = {
        min: now.map((v, a) => Math.min(v, before[a]) - radius) as [number, number, number],
        max: now.map((v, a) => Math.max(v, before[a]) + radius) as [number, number, number],
      };
      if (runtime.volume instanceof SparseSDFVolume) {
        const margin = freeSpace ? runtime.volume.step * 2 : 0;
        for (let a = 0; a < 3; a++) {
          footprint.min[a] -= margin;
          footprint.max[a] += margin;
        }
        this.growSparseRuntime(runtime, runtime.volume, footprint);
      } else this.growRuntime(runtime, footprint);
    }
    const sparse = runtime.volume instanceof SparseSDFVolume;
    const record = sparse ? this.sparseStrokeRecorder(runtime) : runtime.history.record;
    const dirty = this.stroke.apply(
      runtime.layer.volume,
      point,
      radius,
      mode,
      strength,
      dt,
      record,
      hardness,
      (bounds) => {
        if (!sparse && !this.maskBefore && !this.paintBefore) runtime.mesher.invalidate(bounds);
      },
      freeSpace,
      this.strokeMirror,
    );
    this.strokePoint = { ...point };
    if (!this.maskBefore && !this.paintBefore) this.composite.invalidateLayer(runtime.layer, dirty);
    runtime.brushMs = performance.now() - start;
    runtime.brushTotal += runtime.brushMs;
    runtime.brushFrames++;
    this.metrics.record("brush", runtime.brushMs);
    return dirty;
  }
  private sparseStrokeRecorder(runtime: LayerRuntime) {
    const invalidate = this.replayInvalidator(runtime);
    return Object.assign(
      (index: number, before: number, after: number) => {
        runtime.history.record(index, before, after);
        invalidate(index, before, after);
      },
      {
        hasPendingSample: (index: number) => runtime.history.hasPendingSample(index),
        reservePendingSamples: (additional: number) =>
          runtime.history.reservePendingSamples(additional),
      },
    );
  }
  private replayInvalidator(runtime: LayerRuntime) {
    const invalidate = runtime.mesher.stampInvalidator(),
      tolerance = -runtime.volume.step * Number.EPSILON * 32;
    return (index: number, before: number, after: number) =>
      invalidate(index, before < tolerance !== after < tolerance);
  }
  /** Preserve the Pinch entry point for existing clients/tests. */
  *applyPinchSteps(
    point: Point3,
    radius: number,
    strength: number,
    dt: number,
    hardness: number,
  ): Generator<void, Bounds | null> {
    return yield* this.applyResamplingSteps("pinch", point, radius, strength, dt, hardness);
  }
  /** Cooperatively evaluate/publish Pinch/Crease against the same captured history owner. */
  *applyResamplingSteps(
    mode: "pinch" | "crease" | "mask" | "mask-erase" | "paint" | "paint-erase",
    point: Point3,
    radius: number,
    strength: number,
    dt: number,
    hardness: number,
  ): Generator<void, Bounds | null> {
    if (!this.strokeLayer) return null;
    const runtime = this.editableRuntime(this.strokeLayer);
    if ((mode === "paint" || mode === "paint-erase") !== !!this.paintBefore)
      throw new Error("Stroke kind changed; cancel before switching paint tools.");
    if ((mode === "mask" || mode === "mask-erase") !== !!this.maskBefore)
      throw new Error("Stroke kind changed; cancel before switching mask/sculpt tools.");
    const sparse = runtime.volume instanceof SparseSDFVolume;
    const generation = this.strokeGeneration;
    if (this.resamplingGeneration === generation)
      throw new Error("Finish the pending brush sample first.");
    const work = this.stroke.applySteps(
      runtime.volume,
      point,
      radius,
      mode,
      strength,
      dt,
      sparse ? this.sparseStrokeRecorder(runtime) : runtime.history.record,
      hardness,
      (b) => {
        if (!sparse && !this.maskBefore && !this.paintBefore) runtime.mesher.invalidate(b);
      },
      false,
      this.strokeMirror,
    );
    let step: IteratorResult<void, Bounds | null>,
      cpu = 0;
    this.resamplingGeneration = generation;
    try {
      do {
        const start = performance.now();
        step = work.next();
        cpu += performance.now() - start;
        if (!step.done) {
          yield;
          if (generation !== this.strokeGeneration) return null;
        }
      } while (!step.done);
    } finally {
      work.return(null);
      if (this.resamplingGeneration === generation) this.resamplingGeneration = undefined;
    }
    if (
      (this.maskBefore || this.paintBefore) &&
      this.trackedBytes >
        (this.growthLimits.maxTransientBytes ?? DENSE_GROWTH_LIMITS.maxTransientBytes)
    )
      throw new Error("Mask history memory safety limit reached; cancel the unfinished stroke.");
    const dirty = step.value;
    this.strokePoint = { ...point };
    if (!this.maskBefore && !this.paintBefore) this.composite.invalidateLayer(runtime.layer, dirty);
    // Completed input-sample CPU only: exclude time suspended between frames.
    runtime.brushMs = cpu;
    runtime.brushTotal += cpu;
    runtime.brushFrames++;
    this.metrics.record("brush", cpu);
    return dirty;
  }
  breakStrokePath(): void {
    this.resetStrokePath();
  }
  private resetStrokePath(): void {
    this.strokeGeneration++;
    this.stroke.reset();
    this.strokePoint = null;
  }
  finishStroke(): void {
    if (!this.strokeLayer) return;
    const runtime = this.runtime(this.strokeLayer),
      started = this.metrics.enabled ? performance.now() : 0;
    if (this.paintBefore) {
      const paint = sculptPaint(runtime.volume),
        before = this.paintBefore,
        after = paint.snapshot();
      this.paintBefore = null;
      this.strokeLayer = null;
      this.resetStrokePath();
      if (
        before.some(
          (c, k) =>
            c.pages.size !== after[k].pages.size ||
            [...c.pages].some(([id, data]) => data !== after[k].pages.get(id)),
        )
      ) {
        this.discardFuture();
        this.past.push({ kind: "paint", layerId: runtime.layer.id, before, after });
        this.trimPaintHistory();
        this.committedRevision++;
      }
      this.metrics.endStroke(0);
      this.updateMaskOverlays();
      return;
    }
    if (this.maskBefore) {
      const mask = sculptMask(runtime.volume),
        before = this.maskBefore;
      this.maskBefore = null;
      this.strokeLayer = null;
      this.resetStrokePath();
      const after = mask.snapshot();
      if (
        before.base !== after.base ||
        before.inverted !== after.inverted ||
        before.pages.size !== after.pages.size ||
        [...before.pages].some(([id, data]) => data !== after.pages.get(id))
      ) {
        this.discardFuture();
        this.past.push({ kind: "mask", layerId: runtime.layer.id, before, after });
        this.trimMaskHistory();
        this.committedRevision++;
      }
      this.metrics.endStroke(0);
      this.updateMaskOverlays();
      return;
    }
    let committed = false;
    try {
      committed = runtime.history.commit();
    } catch (error) {
      this.cancelStroke();
      throw error;
    }
    this.strokeLayer = null;
    this.resetStrokePath();
    const snapshot = this.undoMesh;
    const priorEntry = this.past.at(-1);
    this.undoMesh = undefined;
    if (committed) this.recordCommit(runtime.layer.id);
    const overhead = this.metrics.enabled ? performance.now() - started : 0;
    runtime.rebuild();
    const entry = this.past.at(-1);
    if (
      committed &&
      snapshot?.runtime === runtime &&
      entry !== priorEntry &&
      entry?.kind === "voxels"
    ) {
      snapshot.entry = entry;
      this.undoMesh = snapshot;
    }
    this.metrics.endStroke(overhead);
  }
  cancelStroke(): void {
    if (!this.strokeLayer) return;
    this.undoMesh = undefined;
    const runtime = this.runtime(this.strokeLayer),
      started = this.metrics.enabled ? performance.now() : 0;
    this.strokeLayer = null;
    this.resetStrokePath();
    if (this.paintBefore) {
      sculptPaint(runtime.volume).restore(this.paintBefore);
      this.paintBefore = null;
      this.metrics.endStroke(0);
      this.updateMaskOverlays();
      return;
    }
    if (this.maskBefore) {
      sculptMask(runtime.volume).restore(this.maskBefore);
      this.maskBefore = null;
      this.metrics.endStroke(0);
      this.updateMaskOverlays();
      return;
    }
    const dirty = runtime.history.cancel(this.replayInvalidator(runtime));
    this.composite.invalidateLayer(runtime.layer, dirty);
    const overhead = this.metrics.enabled ? performance.now() - started : 0;
    runtime.rebuild();
    this.metrics.endStroke(overhead);
  }
  private recordCommit(id: string): void {
    this.committedRevision++;
    this.discardFuture();
    this.past.push({ kind: "voxels", layerId: id });
    // Sparse history can evict old payloads. Drop matching timeline entries from the oldest end.
    let excess =
      this.past.filter((entry) => entry.kind === "voxels" && entry.layerId === id).length -
      this.runtime(id).history.undoCount;
    this.past = this.past.filter((entry) => {
      if (entry.kind === "voxels" && entry.layerId === id && excess > 0) {
        excess--;
        return false;
      }
      return true;
    });
  }
  private enclosureFeatureForSource(id: string) {
    const stack = this.project.layerStack;
    const parent = stack.hierarchy.parent(id);
    if (!parent) return;
    const base = stack.layers.find((layer) => layer.id === parent);
    const part = base?.assemblyPart;
    const intent = part?.enclosure;
    const features = intent?.features;
    const featureIndex = features?.findIndex(({ sourceIds }) => sourceIds.includes(id)) ?? -1;
    if (!base || !part || !intent || !features || featureIndex < 0) return;
    return { base, part, intent, features, feature: features[featureIndex], featureIndex };
  }

  private prepareEnclosureFeatureMove(id: string): EnclosureFeatureMove | undefined {
    const owner = this.enclosureFeatureForSource(id);
    if (!owner) return;
    const { base, part, feature, featureIndex } = owner;
    const stack = this.project.layerStack;
    validateFeatureLinks(stack, base.id);
    const postIndex = Math.floor(feature.sourceIds.indexOf(id) / 2);
    base.assertEditable();
    const sources = feature.sourceIds.flatMap((sourceId, planIndex) => {
      if (Math.floor(planIndex / 2) !== postIndex) return [];
      const layer = stack.get(sourceId);
      layer.assertEditable();
      return [
        {
          layer,
          planIndex,
          world: copyTransform(layer.transform),
          local: copyTransform(layer.localTransform),
        },
      ];
    });
    return { base, part, featureIndex, postIndex, sources };
  }

  get movingEnclosureFeature(): boolean {
    return !!this.transformSession?.featureMove;
  }

  private placeEnclosureFeature(move: EnclosureFeatureMove, position: Vec3) {
    const intent = move.part.enclosure!;
    const original = intent.features![move.featureIndex].definition;
    const target = new Vector3(...position)
      .applyMatrix4(transformMatrix(move.base.transform).invert())
      .multiplyScalar(this.display.precision.millimetresPerUnit);
    const snap = (value: number, previous: number) =>
      Math.abs(value - previous) < 1e-8
        ? previous
        : Math.round(snapValue(value, this.display.precision.translationSnapMM) * 1e9) / 1e9;
    const definition = structuredClone(original);
    if (definition.kind === "cutout") {
      const wall = enclosureAnchors(intent.parameters).find(({ id }) => id === definition.anchor)!;
      target.sub(new Vector3(...wall.originMm));
      definition.uMm = snap(target.dot(new Vector3(...wall.u)), definition.uMm);
      definition.vMm = snap(target.dot(new Vector3(...wall.v)), definition.vMm);
    } else {
      const [x, z] = definition.centresMm[move.postIndex];
      definition.centresMm[move.postIndex] = [snap(target.x, x), snap(target.z, z)];
    }
    const plan = featurePlan(intent.parameters, definition);
    const mm = this.display.precision.millimetresPerUnit;
    const poses = move.sources.map(({ layer, local, planIndex }) => {
      layer.assertEditable();
      const position = plan[planIndex].positionMm.map((coordinate) => coordinate / mm) as Vec3;
      return validateTransformEdit({ ...local, position }, local);
    });
    move.sources.forEach(({ layer }, index) => {
      layer.localTransform = poses[index];
    });
    move.definition = definition;
    this.syncPresentation();
  }

  private finishEnclosureFeatureMove(move: EnclosureFeatureMove, activeId: string): boolean {
    const intent = move.part.enclosure!;
    const feature = intent.features![move.featureIndex];
    if (!move.definition) return false;
    const before = feature.definition;
    const next = move.definition;
    const unchanged =
      before.kind === "mounting" && next.kind === "mounting"
        ? before.centresMm.every(
            ([x, z], i) =>
              Math.abs(x - next.centresMm[i][0]) < 1e-8 &&
              Math.abs(z - next.centresMm[i][1]) < 1e-8,
          )
        : before.kind === "cutout" &&
          next.kind === "cutout" &&
          Math.abs(before.uMm - next.uMm) < 1e-8 &&
          Math.abs(before.vMm - next.vMm) < 1e-8;
    if (unchanged) {
      this.restoreEnclosureFeatureMove(move);
      return false;
    }
    const features = intent.features!.map((f, index) =>
      index === move.featureIndex ? { ...f, definition: next } : f,
    );
    const after = { ...move.part, enclosure: { ...intent, features } };
    const entries: TimelineEntry[] = move.sources.map(({ layer, world, local }) => ({
      kind: "transform",
      layerId: layer.id,
      before: world,
      after: copyTransform(layer.transform),
      localBefore: local,
      localAfter: copyTransform(layer.localTransform),
    }));
    entries.push({ kind: "assembly", layerId: move.base.id, before: move.part, after });
    move.base.assemblyPart = after;
    this.discardFuture();
    this.past.push({
      kind: "assembly-batch",
      layerId: activeId,
      entries,
      activeBefore: activeId,
      activeAfter: activeId,
      selectedBefore: null,
      selectedAfter: null,
    });
    this.committedRevision++;
    this.syncPresentation();
    return true;
  }

  private restoreEnclosureFeatureMove(move: EnclosureFeatureMove) {
    for (const { layer, local } of move.sources) layer.localTransform = copyTransform(local);
    this.syncPresentation();
  }

  beginTransform(options: TransformOptions = {}): void {
    this.finishStroke();
    if (this.transformSession) throw new Error("A transform is already active.");
    this.assertAvailable();
    const node = this.transformNode;
    node.assertEditable();
    this.transformSession = {
      layerId: node.id,
      before: copyTransform(node.transform),
      localBefore: copyTransform(node.localTransform),
      featureMove:
        options.placeEnclosureFeature && !this.selectedGroupId
          ? this.prepareEnclosureFeatureMove(node.id)
          : undefined,
      hierarchyBefore:
        this.selectedGroupId || this.project.layerStack.hierarchy.children(node.id).length
          ? this.project.layerStack.hierarchy.snapshot()
          : undefined,
    };
  }
  updateTransform(value: unknown): void {
    if (!this.transformSession) throw new Error("No transform transaction is active.");
    if (this.transformNode.id !== this.transformSession.layerId)
      throw new Error("Transform selection changed.");
    const node = this.transformNode;
    node.assertEditable();
    const next = validateTransformEdit(value, this.transformSession.before);
    if (this.transformSession.featureMove) {
      this.placeEnclosureFeature(this.transformSession.featureMove, next.position);
      return;
    }
    node.transform = next;
    if (node instanceof LayerGroup || this.project.layerStack.hierarchy.children(node.id).length)
      this.syncPresentation();
    else this.syncLayerPose(node.id);
  }
  finishTransform(): boolean {
    const session = this.transformSession;
    if (!session) return false;
    this.transformSession = null;
    if (session.featureMove)
      return this.finishEnclosureFeatureMove(session.featureMove, session.layerId);
    const after = copyTransform(this.project.layerStack.hierarchy.get(session.layerId).transform);
    if (sameTransform(session.before, after)) {
      this.project.layerStack.hierarchy.get(session.layerId).localTransform = copyTransform(
        session.localBefore,
      );
      if (session.hierarchyBefore) this.syncPresentation();
      else this.syncLayerPose(session.layerId);
      return false;
    }
    if (session.hierarchyBefore) {
      this.recordHierarchy(
        session.hierarchyBefore,
        this.project.activeLayerId,
        this.selectedGroupId,
      );
      return true;
    }
    this.discardFuture();
    this.past.push({
      kind: "transform",
      layerId: session.layerId,
      before: session.before,
      after,
      localBefore: session.localBefore,
      localAfter: copyTransform(
        this.project.layerStack.hierarchy.get(session.layerId).localTransform,
      ),
    });
    let excess =
      this.past.filter((entry) => entry.kind === "transform" && entry.layerId === session.layerId)
        .length - 100;
    this.past = this.past.filter((entry) => {
      if (
        !this.assemblyTransaction &&
        entry.kind === "transform" &&
        entry.layerId === session.layerId &&
        excess > 0
      ) {
        excess--;
        return false;
      }
      return true;
    });
    return true;
  }
  cancelTransform(): void {
    const session = this.transformSession;
    if (!session) return;
    this.transformSession = null;
    if (session.featureMove) {
      this.restoreEnclosureFeatureMove(session.featureMove);
      return;
    }
    this.project.layerStack.hierarchy.get(session.layerId).localTransform = copyTransform(
      session.localBefore,
    );
    if (session.hierarchyBefore) this.syncPresentation();
    else this.syncLayerPose(session.layerId);
  }
  setActiveTransform(value: unknown, options?: TransformOptions): boolean {
    this.beginTransform(options);
    try {
      this.updateTransform(value);
      return this.finishTransform();
    } catch (error) {
      this.cancelTransform();
      throw error;
    }
  }
  private syncLayerPose(id: string): void {
    const runtime = this.runtime(id),
      t = runtime.layer.transform,
      group = runtime.surface.group;
    group.position.fromArray(t.position);
    group.rotation.set(...t.rotation, "XYZ");
    group.scale.fromArray(t.scale);
    group.updateWorldMatrix(true, true);
    this.composite.syncMetadata();
  }
  replaceComponentReferences(records: ComponentReference[]): void {
    this.assertAvailable();
    const after = validateComponents(records);
    const before = structuredClone(this.display.components);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    this.discardFuture();
    this.past.push({ kind: "components", layerId: "", before, after });
    if (this.past.filter((entry) => entry.kind === "components").length > 100)
      this.past.splice(
        this.past.findIndex((entry) => entry.kind === "components"),
        1,
      );
    this.display.components = structuredClone(after);
    this.committedRevision++;
  }
  undo(redo = false): string | null {
    this.assertAvailable();
    this.finishStroke();
    this.finishTransform();
    const from = redo ? this.future : this.past,
      to = redo ? this.past : this.future,
      entry = from.at(-1);
    if (!entry) return null;
    if (entry.kind === "assembly-batch") {
      from.pop();
      from.push(...(redo ? [...entry.entries].reverse() : entry.entries));
      for (let i = 0; i < entry.entries.length; i++) this.undo(redo);
      to.splice(to.length - entry.entries.length, entry.entries.length, entry);
      this.project.layerStack.select(redo ? entry.activeAfter : entry.activeBefore);
      this.selectedGroupId = redo ? entry.selectedAfter : entry.selectedBefore;
      this.syncPresentation();
      return this.project.activeLayerId;
    }
    if (entry.kind === "components") {
      this.display.components = structuredClone(redo ? entry.after : entry.before);
      from.pop();
      to.push(entry);
      this.committedRevision++;
      return this.project.activeLayerId;
    }
    if (entry.kind === "name") {
      this.project.layerStack.hierarchy.get(entry.layerId).name = redo ? entry.after : entry.before;
      from.pop();
      to.push(entry);
      this.committedRevision++;
      this.syncPresentation();
      return entry.layerId;
    }
    if (entry.kind === "hierarchy") {
      const stack = this.project.layerStack,
        h = stack.hierarchy;
      if (redo) {
        for (const change of entry.booleans ?? [])
          stack.get(change.layerId).booleanModifiers = structuredClone(change.after);
        entry.removed = entry.removed.map((r) => {
          const live = this.runtime(r.layer.id);
          this.retainedHierarchy.delete(r);
          this.retainedHierarchy.add(live);
          return live;
        });
        for (const r of entry.removed) {
          stack.remove(r.layer.id);
          this.runtimes.delete(r.layer.id);
          this.group.remove(r.surface.group);
        }
      } else
        for (const r of entry.removed) {
          this.assertCapacity(
            r.volume instanceof SparseSDFVolume ? 0 : volumeSampleCount(r.volume),
            undefined,
            1,
            r.layer.id,
          );
          stack.insert(r.layer);
          this.install(r);
        }
      if (!redo)
        for (const change of entry.booleans ?? [])
          stack.get(change.layerId).booleanModifiers = structuredClone(change.before);
      this.replayHierarchy(redo ? entry.after : entry.before, redo ? entry.before : entry.after);
      stack.select(redo ? entry.activeAfter : entry.activeBefore);
      this.selectedGroupId = redo ? entry.selectedAfter : entry.selectedBefore;
      from.pop();
      to.push(entry);
      this.committedRevision++;
      this.syncPresentation();
      this.composite.invalidate();
      return this.selectedGroupId ?? this.project.activeLayerId;
    }
    if (entry.kind === "bake") {
      this.replayBake(entry, redo);
      this.committedRevision++;
      from.pop();
      to.push(entry);
      return this.project.activeLayerId;
    }
    if (entry.kind === "cut" || entry.kind === "cut-batch") {
      const cuts = entry.kind === "cut" ? [entry] : entry.entries;
      if (redo) for (const cut of cuts) this.replayCut(cut, true);
      else for (const cut of [...cuts].reverse()) this.replayCut(cut, false);
      from.pop();
      to.push(entry);
      this.committedRevision++;
      this.syncPresentation();
      this.composite.invalidate();
      return this.project.activeLayerId;
    }
    const layer = this.project.layerStack.get(entry.layerId);
    if (entry.kind === "paint") {
      layer.assertEditable();
      sculptPaint(layer.volume).restore(redo ? entry.after : entry.before);
      this.updateMaskOverlays();
    } else if (entry.kind === "mask") {
      layer.assertEditable();
      sculptMask(layer.volume).restore(redo ? entry.after : entry.before);
      this.updateMaskOverlays();
    } else if (entry.kind === "tube") {
      layer.assertEditable();
      const state = redo ? entry.after : entry.before,
        old = this.runtime(layer.id),
        next = new LayerRuntime(
          layer,
          this.neutral,
          state.volume,
          false,
          state.source.kind === "tube" ? undefined : state.source,
        );
      if (state.localPose) layer.localTransform = copyTransform(state.localPose);
      layer.volume = state.volume;
      layer.procedural = state.source.kind === "tube" ? validateTube(state.source) : undefined;
      layer.primitive = state.source.kind !== "tube" ? validatePrimitive(state.source) : undefined;
      layer.primitiveOriginal = state.primitiveOriginal;
      this.group.remove(old.surface.group);
      old.dispose();
      this.install(next);
      for (const e of this.historyEntries())
        if (e.kind === "bake" && e.layerId === layer.id) e.runtime = next;
      this.composite.invalidate();
    } else if (entry.kind === "colour") {
      this.display.setColour(this.project.id, layer.id, redo ? entry.after : entry.before);
    } else if (entry.kind === "order") this.restoreOrder(redo ? entry.after : entry.before);
    else if (entry.kind === "boolean") {
      layer.assertEditable();
      layer.booleanModifiers = structuredClone(redo ? entry.after : entry.before);
      this.composite.invalidate();
    } else if (entry.kind === "assembly") {
      layer.assemblyPart = structuredClone(redo ? entry.after : entry.before);
    } else if (entry.kind === "array") {
      layer.assertEditable();
      layer.array = structuredClone(redo ? entry.after : entry.before);
      this.composite.invalidate();
    } else if (entry.kind === "operation") {
      if (layer.locked) throw new Error("Unlock the layer to change its operation.");
      layer.operation = redo ? entry.after : entry.before;
    } else {
      const runtime = this.editableRuntime(entry.layerId, true);
      if (entry.kind === "transform") {
        runtime.layer.localTransform = copyTransform(redo ? entry.localAfter : entry.localBefore);
        this.syncLayerPose(entry.layerId);
      } else {
        if (entry.kind === "voxels") {
          const paint = redo ? entry.paintAfter : entry.paintBefore;
          if (paint) sculptPaint(runtime.volume).restore(paint);
        }
        const record = this.replayInvalidator(runtime);
        const dirty = redo ? runtime.history.redo(record) : runtime.history.undo(record);
        if (!dirty) throw new Error("History payload unavailable.");
        const snapshot = this.undoMesh;
        this.undoMesh = undefined;
        const cached =
          !redo &&
          snapshot?.entry === entry &&
          snapshot.runtime === runtime &&
          snapshot.volume === runtime.volume &&
          snapshot.mesher === runtime.mesher
            ? snapshot.chunks
            : undefined;
        if (cached && snapshot && runtime.volume instanceof SparseSDFVolume) {
          runtime.mesher.queueUndoRestore(cached, snapshot.bytes);
          runtime.rebuild();
        } else if (cached) runtime.rebuild(Infinity, Infinity, cached);
        else runtime.rebuild();
        this.composite.invalidateLayer(layer, dirty);
      }
    }
    this.syncPresentation();
    from.pop();
    to.push(entry);
    this.committedRevision++;
    this.project.layerStack.select(entry.layerId);
    return entry.layerId;
  }
  private replayCut(entry: CutEntry, redo: boolean): void {
    const stack = this.project.layerStack;
    if (redo) {
      const old = this.runtime(entry.layerId);
      this.group.remove(old.surface.group);
      this.runtimes.delete(entry.layerId);
      entry.original.layer.volume = entry.negative.volume;
      stack.insert(
        entry.positive.layer,
        Math.min(
          stack.layers.findIndex((layer) => layer.id === entry.layerId) + 1,
          stack.layers.length,
        ),
      );
      this.install(entry.negative);
      this.install(entry.positive);
      stack.hierarchy.restore(entry.after);
      stack.select(entry.activeAfter);
      this.selectedGroupId = entry.selectedAfter;
    } else {
      this.group.remove(entry.negative.surface.group);
      this.group.remove(entry.positive.surface.group);
      this.runtimes.delete(entry.layerId);
      this.runtimes.delete(entry.positive.layer.id);
      stack.remove(entry.positive.layer.id);
      entry.original.layer.volume = entry.originalVolume;
      this.install(entry.original);
      stack.hierarchy.restore(entry.before);
      stack.select(entry.activeBefore);
      this.selectedGroupId = entry.selectedBefore;
    }
  }
  /** One explicit command, one sparse layer-bound action. Preparation is read-only. */
  stampShape(value: unknown, inStroke = false): boolean {
    const work = this.stampShapeSteps(value, inStroke);
    let step = work.next();
    while (!step.done) step = work.next();
    return step.value;
  }
  *stampShapeSteps(
    value: unknown,
    inStroke = false,
    deferMesh = false,
    signal?: AbortSignal,
  ): Generator<void, boolean> {
    if (signal?.aborted) return false;
    if (this.preparingStandaloneStamp) throw new Error("Finish or cancel the pending stamp.");
    validateMirrorPlane(this.symmetry);
    this.assertAvailable();
    if (!inStroke) this.finishStroke();
    this.finishTransform();
    if (inStroke && this.strokeLayer !== this.project.activeLayerId)
      throw new Error("Stamp stroke target changed.");
    const runtime = this.editableRuntime(this.project.activeLayerId);
    this.assertSculptable(runtime.layer);
    if (inStroke && !runtime.history.active) throw new Error("Stamp stroke target changed.");
    const start = performance.now(),
      definition = validateShapeDefinition(value);
    if (definition.targetLayerId !== runtime.layer.id)
      throw new Error("Stamp must target the active layer.");
    const sourceBytes =
      definition.personal && definition.personal !== this.personalStamp
        ? personalStampSource(definition.personal).bytes
        : 0;
    if (
      this.trackedBytes + sourceBytes >
      (this.growthLimits.maxTransientBytes ?? DENSE_GROWTH_LIMITS.maxTransientBytes)
    )
      throw new Error("Personal stamp exceeds the memory safety limit.");
    if (definition.operation === "add" && runtime.volume instanceof SDFVolume) {
      const box = prepareShape(definition).worldBounds;
      if (this.symmetry.enabled) {
        const a = "xyz".indexOf(this.symmetry.axis),
          lo = box.min[a],
          hi = box.max[a];
        box.min[a] = Math.min(lo, 2 * this.symmetry.offset - hi);
        box.max[a] = Math.max(hi, 2 * this.symmetry.offset - lo);
      }
      this.growRuntime(runtime, box, sourceBytes);
    }
    const generation = this.strokeGeneration,
      revision = this.committedRevision,
      volume = runtime.volume,
      sparse = volume instanceof SparseSDFVolume;
    const work = this.stageAndApplyStamp(
      runtime,
      definition,
      sourceBytes,
      inStroke,
      deferMesh,
      start,
    );
    if (!sparse) return yield* work;
    if (this.resamplingGeneration === generation)
      throw new Error("Finish the pending brush or stamp sample first.");
    if (inStroke) this.resamplingGeneration = generation;
    else this.preparingStandaloneStamp = true;
    try {
      let step = work.next();
      while (!step.done) {
        yield;
        if (
          signal?.aborted ||
          this.disposed ||
          (inStroke ? this.strokeGeneration !== generation : this.transforming || this.drawing) ||
          this.committedRevision !== revision ||
          this.project.activeLayerId !== runtime.layer.id ||
          runtime.volume !== volume ||
          !runtime.layer.editable
        )
          return false;
        this.assertAvailable();
        step = work.next();
      }
      return step.value;
    } finally {
      work.return(false);
      if (!inStroke) this.preparingStandaloneStamp = false;
      else if (this.resamplingGeneration === generation) this.resamplingGeneration = undefined;
    }
  }
  private *stageAndApplyStamp(
    runtime: LayerRuntime,
    definition: ReturnType<typeof validateShapeDefinition>,
    sourceBytes: number,
    inStroke: boolean,
    deferMesh: boolean,
    start: number,
  ): Generator<void, boolean> {
    const remaining =
      (this.growthLimits.maxTransientBytes ?? DENSE_GROWTH_LIMITS.maxTransientBytes) -
      this.trackedBytes -
      sourceBytes -
      runtime.history.pendingMemoryEstimate;
    const patch = yield* prepareStampSteps(
      runtime.layer,
      definition,
      Math.max(0, Math.floor(remaining)),
      inStroke ? this.strokeMirror : this.symmetry,
    );
    if (!patch.indices.length) {
      this.lastStampStats = {
        allocatedStagingBytes: patch.allocatedStagingBytes,
        peakStagingBytes: patch.peakStagingBytes,
        stagingAllocations: patch.stagingAllocations,
        retainedStagingBytes: patch.retainedStagingBytes,
        evaluationMs: patch.evaluationMs,
        scanned: patch.scanned,
        evaluated: patch.evaluated,
        meshingMs: 0,
        totalMs: performance.now() - start,
        changedVoxels: 0,
        chunks: 0,
        totalChunks: runtime.totalChunks,
      };
      return false;
    }
    const volume = runtime.volume,
      sparse = volume instanceof SparseSDFVolume,
      publishPages = sparse
        ? yield* volume.preparePatchPages(
            patch.indices,
            Math.max(0, remaining - patch.retainedStagingBytes * 2),
          )
        : undefined;
    // Allocate the exact history snapshots before source mutation; preparation owns
    // the patch, so no Map-based stroke recorder is needed for these unique indices.
    const committed = inStroke ? false : runtime.history.commitPatch("shape-stamp", patch);
    if (inStroke)
      yield* runtime.history.recordStampPatchSteps(patch, remaining - patch.retainedStagingBytes);
    publishPages?.();
    const invalidate = this.replayInvalidator(runtime);
    for (let i = 0; i < patch.indices.length; i++) {
      if (!sparse && inStroke && i && i % 4096 === 0) yield;
      runtime.volume.writeVoxel(patch.indices[i], patch.after[i]);
      invalidate(patch.indices[i], patch.before[i], patch.after[i]);
    }
    if (committed) this.recordCommit(runtime.layer.id);
    this.composite.invalidateLayer(runtime.layer, patch.bounds);
    const meshStart = performance.now();
    let rebuilt = false,
      chunks = 0;
    if (!sparse && inStroke && !deferMesh) {
      while (runtime.rebuild(1, 3)) {
        rebuilt = true;
        chunks += runtime.lastChanged;
        yield;
      }
      runtime.lastChanged = chunks;
    } else if (!deferMesh) rebuilt = runtime.rebuild();
    this.lastStampStats = {
      allocatedStagingBytes: patch.allocatedStagingBytes,
      peakStagingBytes: patch.peakStagingBytes,
      stagingAllocations: patch.stagingAllocations,
      retainedStagingBytes: patch.retainedStagingBytes,
      evaluationMs: patch.evaluationMs,
      meshingMs: performance.now() - meshStart,
      totalMs: performance.now() - start,
      changedVoxels: patch.indices.length,
      scanned: patch.scanned,
      evaluated: patch.evaluated,
      chunks: rebuilt ? runtime.lastChanged : 0,
      totalChunks: runtime.totalChunks,
    };
    return true;
  }
  resetActive(): void {
    this.assertAvailable();
    this.finishStroke();
    this.finishTransform();
    const runtime = this.editableRuntime(this.project.activeLayerId);
    this.assertSculptable(runtime.layer);
    runtime.history.pendingBudgetBytes = Math.max(
      0,
      (this.growthLimits.maxTransientBytes ?? DENSE_GROWTH_LIMITS.maxTransientBytes) -
        this.trackedBytes,
    );
    if (runtime.volume instanceof SparseSDFVolume && !isLegacyCubicGrid(runtime.volume))
      throw new Error("Reset is unavailable on an expanded sparse lattice.");
    runtime.history.begin("reset");
    try {
      runtime.layer.volume.reset(runtime.history.record);
      if (runtime.history.commit()) this.recordCommit(runtime.layer.id);
    } catch (error) {
      runtime.history.cancel();
      runtime.mesher.invalidate();
      runtime.rebuild();
      this.composite.invalidateLayer(runtime.layer);
      throw error;
    }
    runtime.mesher.invalidate();
    runtime.rebuild();
    this.composite.invalidateLayer(runtime.layer);
  }
  private uniqueName(
    base: string,
    names: ReadonlySet<string> = new Set(this.project.layerStack.layers.map((layer) => layer.name)),
  ): string {
    let result = base.slice(0, 128),
      suffix = 2;
    while (names.has(result)) {
      const ending = ` ${suffix++}`;
      result = base.slice(0, 128 - ending.length) + ending;
    }
    return result;
  }
  create(resolution = 64, empty = false, backend: "dense" | "sparse" = "dense"): SdfLayer {
    this.assertAvailable();
    this.finishStroke();
    this.finishTransform();
    if (![64, 128, 192].includes(resolution)) throw new Error("Choose 64³, 128³ or 192³.");
    this.assertCapacity(backend === "dense" ? resolution ** 3 : 0, undefined, 1);
    if (backend === "sparse" && !empty)
      throw new Error("Sparse sculpting requires a new empty layer.");
    const volume =
      backend === "sparse"
        ? new SparseSDFVolume(resolution)
        : new SDFVolume(resolution, 1.6, !empty);
    if (empty && volume instanceof SDFVolume) volume.values.fill(volume.extent * 4);
    const layer = new SdfLayer(volume, {
      name: this.uniqueName(`Layer ${this.project.layerStack.layers.length + 1}`),
      order: this.project.layerStack.layers.length,
    });
    const runtime = new LayerRuntime(layer, this.neutral);
    this.project.layerStack.insert(layer);
    this.selectedGroupId = null;
    this.install(runtime);
    this.syncPresentation();
    return layer;
  }
  async cutByPlane(
    plane: CutPlane,
    signal: AbortSignal,
    progress: (stage: string) => void = () => {},
    scope: "active" | "all-editable" = "active",
  ): Promise<string> {
    this.assertAvailable();
    this.finishStroke();
    this.finishTransform();
    if (this.selectedGroupId) throw new Error("Select a sculpt layer before cutting.");
    const stack = this.project.layerStack,
      activeBefore = stack.activeLayerId,
      targets =
        scope === "active"
          ? [stack.active]
          : stack.layers.filter(
              (layer) =>
                layer.editable &&
                !layer.procedural &&
                !layer.primitive &&
                (layer.volume instanceof SDFVolume || layer.volume instanceof SparseSDFVolume),
            );
    if (!targets.length) throw new Error("There are no visible, unlocked SDF layers to cut.");
    const originals = targets.map((layer) => {
      const runtime = this.editableRuntime(layer.id);
      this.assertSculptable(layer);
      this.assertBooleanUnreferenced(layer.id);
      if (layer.operation === "intersect")
        throw new Error(
          "Cut an Intersect layer only after converting it to separate Union layers.",
        );
      return runtime;
    });
    const extraSamples = originals.reduce(
      (sum, { volume }) =>
        sum + (volume instanceof SparseSDFVolume ? 0 : volumeSampleCount(volume)),
      0,
    );
    this.assertCapacity(extraSamples, undefined, originals.length);
    const sparse = originals.some(({ volume }) => volume instanceof SparseSDFVolume),
      limit = sparse
        ? (this.growthLimits.maxTransientBytes ?? DENSE_GROWTH_LIMITS.maxTransientBytes)
        : DENSE_GROWTH_LIMITS.maxTransientBytes;
    let additionalTriangles =
      MAX_PROJECT_TRIANGLES -
      [...this.runtimes.values()].reduce((sum, runtime) => sum + runtime.triangles, 0);
    const base = this.trackedBytes + (sparse ? this.composite.trackedBytes : 0);
    const entries: CutEntry[] = [],
      names = new Set(stack.layers.map(({ name }) => name)),
      guards: (() => void)[] = [];
    let hierarchy = stack.hierarchy.snapshot(),
      selected = activeBefore,
      stagedBytes = 0,
      published = false;
    this.cutPending = true;
    try {
      for (const original of originals) {
        const stage = (bytes: number, triangles: number) => {
          this.copyStagingBytes = stagedBytes + bytes;
          if (
            base + this.copyStagingBytes > limit ||
            triangles > additionalTriangles + original.triangles
          )
            throw new Error("Plane Cut exceeds the geometry or memory safety limit. Source kept.");
        };
        const { entry, check, bytes } = await this.preparePlaneCut(
          original,
          plane,
          signal,
          progress,
          hierarchy,
          selected,
          names,
          stage,
        );
        entries.push(entry);
        guards.push(check);
        stagedBytes += bytes;
        additionalTriangles +=
          original.triangles - entry.negative.triangles - entry.positive.triangles;
        hierarchy = entry.after;
        selected = entry.activeAfter;
      }
      for (const check of guards) check();
      // No yields, progress callbacks or partial timeline entries during publication.
      for (const entry of entries) {
        this.replayCut(entry, true);
        this.display.setColour(
          this.project.id,
          entry.positive.layer.id,
          this.display.colour(this.project.id, entry.original.layer.id, entry.original.layer.order),
        );
      }
      this.discardFuture();
      const first = entries[0];
      this.past.push(
        scope === "active" ? first : { kind: "cut-batch", layerId: activeBefore, entries },
      );
      this.committedRevision++;
      published = true;
      this.syncPresentation();
      this.composite.invalidate();
      return selected;
    } finally {
      if (!published)
        for (const entry of entries) {
          entry.negative.dispose();
          entry.positive.dispose();
        }
      this.copyStagingBytes = 0;
      this.cutPending = false;
    }
  }
  private async preparePlaneCut(
    original: LayerRuntime,
    plane: CutPlane,
    signal: AbortSignal,
    progress: (stage: string) => void,
    hierarchyBefore: HierarchyState,
    activeBefore: string,
    names: Set<string>,
    stage: (bytes: number, triangles: number) => void,
  ): Promise<{ entry: CutEntry; check: () => void; bytes: number }> {
    const source = original.volume,
      metadata = JSON.stringify(original.layer.metadata()),
      sampleCount = volumeSampleCount(source);
    const sparse = source instanceof SparseSDFVolume;
    const fieldRevision = sparse ? source.fieldRevision : undefined,
      maskRevision = sculptMask(source).revision,
      paintRevision = sculptPaint(source).revision;
    const staging =
      (sparse
        ? 2 *
          (source.pageMemoryBytes +
            original.mesher.allocatedChunks * 512 +
            original.mesher.haloBytes)
        : sampleCount * 16) +
      sculptMask(source).memoryBytes * 2 +
      sculptPaint(source).memoryBytes * 2;
    stage(staging, 0);
    const revision = this.committedRevision,
      projectId = this.project.id,
      normalWorld = new Vector3(...plane.normal),
      pointWorld = new Vector3(...plane.point);
    if (![...plane.normal, ...plane.point].every(Number.isFinite) || normalWorld.length() < 1e-8)
      throw new Error("Cut plane needs a finite point and non-zero normal.");
    normalWorld.normalize();
    const transform = original.layer.transform,
      rotation = new Quaternion().setFromEuler(new Euler(...transform.rotation, "XYZ")).invert();
    const localPoint = toLocal({ x: pointWorld.x, y: pointWorld.y, z: pointWorld.z }, transform),
      localPlane = {
        point: [localPoint.x, localPoint.y, localPoint.z] as [number, number, number],
        normal: normalWorld
          .applyQuaternion(rotation)
          .multiply(new Vector3(...transform.scale))
          .normalize()
          .toArray() as [number, number, number],
      };
    const releaseSource = sparse ? source.pinResidentPages() : undefined;
    let negative: LayerRuntime | undefined, positive: LayerRuntime | undefined;
    const check = () => {
      if (
        signal.aborted ||
        this.disposed ||
        this.project.id !== projectId ||
        this.committedRevision !== revision ||
        this.runtimes.get(original.layer.id) !== original ||
        original.layer.volume !== source ||
        (sparse && source.fieldRevision !== fieldRevision) ||
        sculptMask(source).revision !== maskRevision ||
        sculptPaint(source).revision !== paintRevision ||
        JSON.stringify(original.layer.metadata()) !== metadata
      )
        throw new Error("Plane Cut cancelled or source changed; original kept.");
    };
    try {
      check();
      progress("Preparing closed SDF pieces…");
      const work = splitSdfByPlaneSteps(source, localPlane);
      let step = work.next(),
        deadline = performance.now() + 3;
      while (!step.done) {
        if (performance.now() >= deadline) {
          await yieldBake();
          check();
          deadline = performance.now() + 3;
        }
        step = work.next();
      }
      const fields = step.value;
      const mask = sculptMask(source).snapshot(),
        paint = sculptPaint(source).snapshot();
      const copyChannels = async (target: VolumeStore) => {
        const clipped = async (snapshot: MaskSnapshot) => {
          const pages = new Map<number, Float32Array>();
          for (const [page, values] of snapshot.pages) {
            const copy = values.slice(),
              start = page * 256;
            for (let j = 0; j < copy.length && start + j < sampleCount; j++)
              if (target.readVoxel(start + j) > source.step * 2) copy[j] = snapshot.base;
            if (copy.some((value) => value !== snapshot.base)) pages.set(page, copy);
            if (performance.now() >= deadline) {
              await yieldBake();
              check();
              deadline = performance.now() + 3;
            }
          }
          return { ...snapshot, pages };
        };
        sculptMask(target).restore(await clipped(mask));
        const clippedPaint = [] as MaskSnapshot[];
        for (const channel of paint) clippedPaint.push(await clipped(channel));
        sculptPaint(target).restore(clippedPaint as PaintSnapshot);
      };
      await copyChannels(fields.negative);
      await copyChannels(fields.positive);
      check();
      negative = new LayerRuntime(original.layer, this.neutral, fields.negative, true);
      const { id: unused, ...sourceMetadata } = original.layer.metadata();
      void unused;
      const name = this.uniqueName(`${original.layer.name} cut`, names);
      names.add(name);
      const layer = new SdfLayer(fields.positive, {
        ...sourceMetadata,
        name,
        locked: false,
        visible: true,
        operation: original.layer.operation,
        order: sourceMetadata.order + 1,
      });
      positive = new LayerRuntime(layer, this.neutral, fields.positive, true);
      const pieces = [negative, positive];
      const bytes = () =>
        pieces.reduce((bytes, { volume, mesher }) => {
          const storage =
            volume instanceof SparseSDFVolume
              ? volume.pageMemoryBytes + mesher.haloBytes + mesher.allocatedChunks * 512
              : sampleCount * 8;
          return (
            bytes +
            storage +
            mesher.ownedGeometryBytes +
            sculptMask(volume).memoryBytes +
            sculptPaint(volume).memoryBytes
          );
        }, 0);
      stage(bytes(), 0);
      for (const candidate of pieces)
        while (candidate.mesher.pendingChunks) {
          check();
          candidate.rebuild(2, 3);
          stage(bytes(), negative.triangles + positive.triangles);
          progress("Building piece previews…");
          await yieldBake();
        }
      check();
      const after = structuredClone(hierarchyBefore),
        sourceLeaf = after.layers.find(({ id }) => id === original.layer.id);
      if (!sourceLeaf) throw new Error("Plane Cut source hierarchy changed.");
      after.layers.push({ ...sourceLeaf, id: layer.id, name, visible: true, locked: false });
      for (const order of [after.order, after.compositionOrder])
        order.splice(order.indexOf(sourceLeaf.id) + 1, 0, layer.id);
      const entry: CutEntry = {
        kind: "cut",
        layerId: original.layer.id,
        original,
        negative,
        positive,
        originalVolume: source,
        before: hierarchyBefore,
        after: validateHierarchy(
          after,
          after.layers.map(({ id }) => id),
        ),
        activeBefore,
        activeAfter: layer.id,
        selectedBefore: null,
        selectedAfter: null,
      };
      const retained = bytes();
      negative = undefined;
      positive = undefined;
      return { entry, check, bytes: retained };
    } finally {
      negative?.dispose();
      positive?.dispose();
      releaseSource?.();
    }
  }
  async duplicateAsync(
    id: string,
    signal?: AbortSignal,
    progress?: (text: string) => void,
  ): Promise<SdfLayer> {
    this.assertAvailable();
    this.finishStroke();
    this.finishTransform();
    const owner = this.enclosureFeatureForSource(id);
    if (!owner) return this.duplicateSingleLayer(id, signal, progress);

    const { base, part, intent, features, feature } = owner;
    const stack = this.project.layerStack;
    base.assertEditable();
    validateFeatureLinks(stack, base.id);
    const sources = feature.sourceIds.map((sourceId) => stack.get(sourceId));
    for (const source of sources) source.assertEditable();
    this.assertCapacity(
      sources.reduce((sum, source) => sum + volumeSampleCount(source.volume), 0),
      undefined,
      sources.length,
    );
    const lease = this.acquireModellingLease();
    const view = this.viewMode;
    let checkpoint: number | undefined;
    try {
      checkpoint = this.withModellingLease(lease, () => this.assemblyCheckpoint());
      const copies = new Map<string, SdfLayer>();
      for (const original of sources) {
        const copy = await this.withModellingLease(lease, () =>
          this.duplicateSingleLayer(original.id, signal, progress),
        );
        copies.set(original.id, copy);
      }
      return this.withModellingLease(lease, () => {
        if (signal?.aborted || this.disposed)
          throw new Error("Duplication cancelled; original and redo kept.");
        // Mounting bores are operands of their posts. Give copied posts their own bores.
        for (const copy of copies.values()) {
          const modifiers = copy.booleanModifiers;
          if (modifiers?.some(({ sourceId }) => copies.has(sourceId))) {
            this.setBooleanModifiers(
              copy.id,
              modifiers.map((modifier) => ({
                ...modifier,
                sourceId: copies.get(modifier.sourceId)?.id ?? modifier.sourceId,
              })),
            );
          }
        }
        // Keep each duplicate beside its original in the ordered Boolean stack.
        const modifiers = (base.booleanModifiers ?? []).flatMap((modifier) => {
          const copy = copies.get(modifier.sourceId);
          return copy ? [modifier, { ...modifier, id: newId(), sourceId: copy.id }] : [modifier];
        });
        this.setBooleanModifiers(base.id, modifiers);
        const copiedDefinition = structuredClone(feature.definition);
        if (copiedDefinition.kind === "cutout") delete copiedDefinition.association;
        this.setAssemblyPart(base.id, {
          ...part,
          enclosure: {
            ...intent,
            features: [
              ...features,
              {
                definition: {
                  ...copiedDefinition,
                  name: `${feature.definition.name.slice(0, 85)} copy`,
                },
                sourceIds: feature.sourceIds.map((sourceId) => copies.get(sourceId)!.id),
              },
            ],
          },
        });
        validateFeatureLinks(stack, base.id);
        const selected = copies.get(id)!;
        this.select(selected.id);
        this.viewMode = view;
        this.syncPresentation();
        this.finishAssemblyTransaction(checkpoint!);
        return selected;
      });
    } catch (error) {
      if (checkpoint !== undefined) {
        const start = checkpoint;
        this.withModellingLease(lease, () => this.rollbackAssemblyTransaction(start));
      }
      throw error;
    } finally {
      this.releaseModellingLease(lease);
    }
  }

  private async duplicateSingleLayer(
    id: string,
    signal?: AbortSignal,
    progress?: (text: string) => void,
  ): Promise<SdfLayer> {
    this.assertAvailable();
    this.finishStroke();
    this.finishTransform();
    const source = this.project.layerStack.get(id);
    source.assertEditable();
    if (source.assemblyPart?.enclosure)
      throw new Error(
        "Duplicate the enclosure project in Project Library to preserve its independent parts and dependencies. Single-root layer duplication is unsupported.",
      );
    if (source.volume instanceof SparseSDFVolume && !isLegacyCubicGrid(source.volume))
      throw new Error(
        "Layer duplication is unavailable on an expanded sparse lattice. Duplicate the project in Project Library.",
      );
    this.assertCapacity(volumeSampleCount(source.volume), undefined, 1);
    const before = this.bakeState(),
      metadata = source.metadata(),
      original = source.volume,
      copyBytes =
        volumeSampleCount(original) * 8 +
        (sculptMask(original).memoryBytes + sculptPaint(original).memoryBytes);
    if (this.trackedBytes + copyBytes > 256 * 1024 ** 2)
      throw new Error("Duplicate exceeds the memory safety budget.");
    this.copyPending = true;
    this.copyStagingBytes = copyBytes;
    let candidate: LayerRuntime | undefined;
    const check = () => {
      if (
        signal?.aborted ||
        this.disposed ||
        !source.editable ||
        source.volume !== original ||
        JSON.stringify(source.metadata()) !== JSON.stringify(metadata)
      )
        throw new Error("Duplication cancelled; original and redo kept.");
    };
    try {
      check();
      const volume = new SDFVolume(original.resolution, original.extent, false, {
        dimensions: original.dimensions,
        latticeMin: original.latticeMin ?? [0, 0, 0],
      });
      for (let i = 0; i < volume.values.length; i += 16384) {
        check();
        const end = Math.min(volume.values.length, i + 16384),
          dense = original.getDenseView();
        if (dense) volume.values.set(dense.subarray(i, end), i);
        else for (let j = i; j < end; j++) volume.values[j] = original.readVoxel(j);
        if (i % 65536 === 0) {
          progress?.("Copying layer…");
          await yieldBake();
        }
      }
      copySculptMask(original, volume);
      copySculptPaint(original, volume);
      const { id: unused, ...copy } = metadata;
      void unused;
      const layer = new SdfLayer(volume, {
        ...copy,
        booleanModifiers: source.booleanModifiers?.map((m) => ({ ...m, id: newId() })),
        array: source.array ? { ...structuredClone(source.array), id: newId() } : undefined,
        name: this.uniqueName(`${source.name.slice(0, 123)} copy`),
      });
      candidate = new LayerRuntime(layer, this.neutral, volume, true);
      const triangleBudget =
        MAX_PROJECT_TRIANGLES - [...this.runtimes.values()].reduce((n, r) => n + r.triangles, 0);
      while (candidate.mesher.pendingChunks) {
        check();
        candidate.rebuild(2, 3);
        this.copyStagingBytes = copyBytes + candidate.mesher.ownedGeometryBytes;
        if (this.trackedBytes > 256 * 1024 ** 2 || candidate.triangles > triangleBudget)
          throw new Error("Duplicate exceeds geometry or memory safety budget.");
        progress?.("Preparing duplicate…");
        await yieldBake();
      }
      check();
      const index = this.project.layerStack.layers.findIndex((l) => l.id === id);
      this.project.layerStack.insert(layer, index + 1);
      const state = this.project.layerStack.hierarchy.snapshot();
      state.layers.find((l) => l.id === layer.id)!.parentId =
        this.project.layerStack.hierarchy.parent(id);
      this.project.layerStack.hierarchy.restore(state);
      this.install(candidate);
      this.selectedGroupId = null;
      this.display.setColour(
        this.project.id,
        layer.id,
        this.display.colour(this.project.id, id, source.order),
      );
      this.discardFuture();
      this.past.push({
        kind: "bake",
        layerId: layer.id,
        runtime: candidate,
        before,
        after: this.bakeState(),
        index: index + 1,
      });
      candidate = undefined;
      this.committedRevision++;
      this.syncPresentation();
      return layer;
    } finally {
      candidate?.dispose();
      this.copyPending = false;
      this.copyStagingBytes = 0;
    }
  }
  groupNode(id: string, name = "Group"): string {
    let group = "";
    this.hierarchyEdit(() => {
      const h = this.project.layerStack.hierarchy;
      h.get(id).assertEditable();
      group = h.create(name, h.parent(id));
      h.reparent(id, group);
      this.selectedGroupId = group;
    });
    return group;
  }
  duplicate(id: string): SdfLayer {
    this.assertAvailable();
    this.finishStroke();
    this.finishTransform();
    const source = this.project.layerStack.get(id),
      n = source.volume.resolution;
    source.assertEditable();
    if (this.enclosureFeatureForSource(id))
      throw new Error("Use Layers → Duplicate to copy an enclosure feature and its Boolean links.");
    if (source.assemblyPart?.enclosure)
      throw new Error(
        "Duplicate the enclosure project in Project Library to preserve its independent parts and dependencies. Single-root layer duplication is unsupported.",
      );
    const before = this.bakeState();
    if (source.volume instanceof SparseSDFVolume && !isLegacyCubicGrid(source.volume))
      throw new Error(
        "Layer duplication is unavailable on an expanded sparse lattice. Duplicate the project in Project Library.",
      );
    this.assertCapacity(volumeSampleCount(source.volume), undefined, 1);
    if (
      this.trackedBytes +
        volumeSampleCount(source.volume) * 8 +
        (sculptMask(source.volume).memoryBytes + sculptPaint(source.volume).memoryBytes) >
      256 * 1024 ** 2
    )
      throw new Error("Duplicate exceeds the memory safety budget.");
    const volume = new SDFVolume(n, source.volume.extent, false, {
        dimensions: source.volume.dimensions,
        latticeMin: source.volume.latticeMin ?? [0, 0, 0],
      }),
      dense = source.volume.getDenseView();
    copySculptMask(source.volume, volume);
    copySculptPaint(source.volume, volume);
    volume.values.set(
      dense ??
        source.volume.readRegion({
          min: [0, 0, 0],
          max: source.volume.dimensions.map((n) => n - 1) as [number, number, number],
        }).values,
    );
    const { id: unused, ...metadata } = source.metadata();
    void unused;
    const layer = new SdfLayer(volume, {
        ...metadata,
        booleanModifiers: source.booleanModifiers?.map((m) => ({ ...m, id: newId() })),
        array: source.array ? { ...structuredClone(source.array), id: newId() } : undefined,
        name: this.uniqueName(`${source.name.slice(0, 123)} copy`),
      }),
      runtime = new LayerRuntime(layer, this.neutral);
    const index = this.project.layerStack.layers.findIndex((l) => l.id === id);
    this.project.layerStack.insert(layer, index + 1);
    const state = this.project.layerStack.hierarchy.snapshot();
    state.layers.find((l) => l.id === layer.id)!.parentId =
      this.project.layerStack.hierarchy.parent(source.id);
    this.project.layerStack.hierarchy.restore(state);
    this.install(runtime);
    this.selectedGroupId = null;
    this.display.setColour(
      this.project.id,
      layer.id,
      this.display.colour(this.project.id, source.id, source.order),
    );
    this.discardFuture();
    this.past.push({
      kind: "bake",
      layerId: layer.id,
      runtime,
      before,
      after: this.bakeState(),
      index: index + 1,
    });
    this.committedRevision++;
    this.syncPresentation();
    return layer;
  }
  isEmpty(id: string): boolean {
    const runtime = this.runtime(id);
    if (runtime.layer.procedural || runtime.layer.primitive) return false;
    if (runtime.volume instanceof SparseSDFVolume) return !runtime.volume.hasNonPositiveSample();
    const values = runtime.volume.getDenseView(),
      count = volumeSampleCount(runtime.volume);
    for (let i = 0; i < count; i++)
      if (!((values ? values[i] : runtime.volume.readVoxel(i)) > 0)) return false;
    return true;
  }
  /** Undoable leaf deletion using the same retained-runtime hierarchy history as groups. */
  deleteObject(id: string): void {
    if (
      this.project.layerStack.layers.some(
        (l) =>
          l.id !== id && l.assemblyPart?.enclosure?.features?.some((f) => f.sourceIds.includes(id)),
      )
    )
      throw new Error(
        "Remove this attachment through Enclosure → Cutouts / Mounting Features first.",
      );
    const stack = this.project.layerStack,
      h = stack.hierarchy,
      node = h.get(id);
    if (node instanceof LayerGroup) {
      this.deleteGroup(id, "keep");
      return;
    }
    this.assertAvailable();
    node.assertEditable();
    if (stack.layers.length <= 1) throw new Error("Keep at least one sculpt layer.");
    const consumers = stack.layers.filter((layer) =>
      layer.booleanModifiers?.some((modifier) => modifier.sourceId === id),
    );
    for (const consumer of consumers) consumer.assertEditable();
    const booleans = consumers.map((consumer) => ({
      layerId: consumer.id,
      before: structuredClone(consumer.booleanModifiers),
      after: (consumer.booleanModifiers ?? []).filter((modifier) => modifier.sourceId !== id),
    }));
    const runtime = this.runtime(id),
      before = h.snapshot(),
      active = this.project.activeLayerId,
      selected = this.selectedGroupId;
    try {
      for (const change of booleans)
        stack.get(change.layerId).booleanModifiers = structuredClone(change.after);
      for (const child of h.children(id)) h.reparent(child, h.parent(id));
      stack.remove(id);
      this.runtimes.delete(id);
      this.group.remove(runtime.surface.group);
      this.selectedGroupId = null;
    } catch (error) {
      for (const change of booleans)
        stack.get(change.layerId).booleanModifiers = structuredClone(change.before);
      if (!stack.layers.some((layer) => layer.id === id)) stack.insert(runtime.layer);
      if (!this.runtimes.has(id)) this.install(runtime);
      h.restore(before);
      stack.select(active);
      this.selectedGroupId = selected;
      throw error;
    }
    this.recordHierarchy(
      before,
      active,
      selected,
      [runtime],
      booleans.length ? booleans : undefined,
    );
  }
  remove(id: string): void {
    this.assertBooleanUnreferenced(id);
    this.assertAvailable();
    this.finishStroke();
    this.finishTransform();
    const runtime = this.runtime(id),
      hierarchy = this.project.layerStack.hierarchy;
    for (const child of hierarchy.children(id)) hierarchy.reparent(child, hierarchy.parent(id));
    this.project.layerStack.remove(id);
    this.group.remove(runtime.surface.group);
    this.retainedHierarchy.delete(runtime);
    if (this.undoMesh?.runtime === runtime) this.undoMesh = undefined;
    runtime.dispose();
    this.runtimes.delete(id);
    this.invalidateCutHistory(id);
    this.past = this.past.filter((entry) => entry.layerId !== id && entry.kind !== "hierarchy");
    this.future = this.future.filter((entry) => entry.layerId !== id && entry.kind !== "hierarchy");
    this.releaseHierarchyOrphans();
    this.display.remove(this.project.id, id);
    this.syncPresentation();
  }
  private invalidateCutHistory(layerId: string): void {
    const mentions = (entry: TimelineEntry) =>
      entry.kind === "cut"
        ? entry.layerId === layerId || entry.positive.layer.id === layerId
        : entry.kind === "cut-batch"
          ? entry.entries.some(
              (cut) => cut.layerId === layerId || cut.positive.layer.id === layerId,
            )
          : false;
    for (const history of [this.past, this.future]) {
      const removed = history.filter(mentions);
      for (const entry of removed) {
        const cuts =
          entry.kind === "cut" ? [entry] : entry.kind === "cut-batch" ? entry.entries : [];
        for (const cut of cuts) {
          for (const runtime of [cut.original, cut.negative, cut.positive])
            if (this.runtimes.get(runtime.layer.id) !== runtime) runtime.dispose();
          if (!this.project.layerStack.layers.some((layer) => layer.id === cut.positive.layer.id))
            this.display.remove(this.project.id, cut.positive.layer.id);
        }
      }
      for (let index = history.length - 1; index >= 0; index--)
        if (mentions(history[index])) history.splice(index, 1);
    }
  }
  rename(id: string, name: string): void {
    this.renameNode(id, name);
  }
  move(id: string, delta: number): void {
    this.moveNode(id, delta);
  }
  private restoreOrder(ids: string[]): void {
    const stack = this.project.layerStack,
      existing = new Set(stack.layers.map((l) => l.id));
    const ordered = [
      ...ids.filter((id) => existing.has(id)),
      ...stack.layers.map((l) => l.id).filter((id) => !ids.includes(id)),
    ];
    ordered.forEach((id, index) => {
      stack.move(id, index);
    });
  }
  private recordMetadata(
    entry: Extract<
      TimelineEntry,
      { kind: "operation" | "order" | "boolean" | "array" | "assembly" }
    >,
  ): void {
    this.discardFuture();
    this.past.push(entry);
    let excess =
      this.past.filter(
        (e) =>
          (e.kind === "operation" ||
            e.kind === "order" ||
            e.kind === "boolean" ||
            e.kind === "array" ||
            e.kind === "assembly") &&
          e.layerId === entry.layerId,
      ).length - 100;
    this.past = this.past.filter((e) => {
      if (
        (e.kind === "operation" ||
          e.kind === "order" ||
          e.kind === "boolean" ||
          e.kind === "array" ||
          e.kind === "assembly") &&
        e.layerId === entry.layerId &&
        excess > 0 &&
        !this.assemblyTransaction
      ) {
        excess--;
        return false;
      }
      return true;
    });
  }
  /** Atomically replace a validated modifier stack; fields and source transforms are borrowed read-only. */
  setBooleanModifiers(id: string, value: unknown): void {
    this.assertAvailable();
    this.finishStroke();
    this.finishTransform();
    const layer = this.project.layerStack.get(id);
    layer.assertEditable();
    const original = layer.booleanModifiers;
    const after = validateModifiers(value),
      before = structuredClone(layer.booleanModifiers ?? []);
    for (const m of [...before, ...after])
      if (this.project.layerStack.get(m.sourceId).locked)
        throw new Error(
          "Boolean source or its parent is locked. Unlock it before editing its operation.",
        );
    layer.booleanModifiers = after;
    try {
      validateBooleanGraph(this.project.layerStack.layers);
      validateAssembly(this.project.layerStack);
    } catch (error) {
      layer.booleanModifiers = original;
      throw error;
    }
    this.discardFuture();
    this.recordMetadata({
      kind: "boolean",
      layerId: id,
      before: original === undefined ? undefined : before,
      after: structuredClone(after),
    });
    this.committedRevision++;
    this.viewMode = "boolean";
    this.composite.invalidate();
    this.syncPresentation();
  }
  private flattenEntries(entries: TimelineEntry[]): TimelineEntry[] {
    return entries.flatMap((e) =>
      e.kind === "assembly-batch" ? this.flattenEntries(e.entries) : [e],
    );
  }
  private historyEntries(): TimelineEntry[] {
    return this.flattenEntries([...this.past, ...this.future, ...this.assemblyRedo]);
  }
  private assemblyTransaction = false;
  private assemblyRedo: TimelineEntry[] = [];
  private assemblyBefore: {
    active: string;
    group: string | null;
    revision: number;
    commandKey: string;
    commandRevision: number;
    view: "separate" | "boolean";
  } | null = null;
  assemblyCheckpoint(): number {
    if (this.assemblyTransaction) throw new Error("An assembly transaction is already active.");
    this.assemblyTransaction = true;
    this.assemblyRedo = this.future;
    this.future = [];
    this.updateCommandRevision();
    this.assemblyBefore = {
      active: this.project.activeLayerId,
      group: this.selectedGroupId,
      revision: this.committedRevision,
      commandKey: this.commandKey,
      commandRevision: this.commandRevision,
      view: this.viewMode,
    };
    return this.past.length;
  }
  finishAssemblyTransaction(start: number): void {
    if (this.past.length > start) assertProjectTriangleBudget(this.project.layerStack.layers);
    this.assemblyTransaction = false;
    const entries = this.past.splice(start);
    this.future = this.assemblyRedo;
    this.assemblyRedo = [];
    const before = this.assemblyBefore;
    this.assemblyBefore = null;
    if (entries.length && before) {
      this.past.push({
        kind: "assembly-batch",
        layerId: entries[0].layerId,
        entries,
        activeBefore: before.active,
        activeAfter: this.project.activeLayerId,
        selectedBefore: before.group,
        selectedAfter: this.selectedGroupId,
      });
      this.discardFuture();
    }
  }
  rollbackAssemblyTransaction(start: number): void {
    this.assemblyTransaction = false;
    // A replaced/closed editor has already disposed all retained runtimes, including saved redo.
    if (this.disposed) {
      this.assemblyRedo = [];
      this.assemblyBefore = null;
      return;
    }
    while (this.past.length > start) this.undo();
    // Discard only the failed batch's redo. Keep older redo and retained runtimes alive.
    this.discardFuture(true);
    this.future = this.assemblyRedo;
    this.assemblyRedo = [];
    const before = this.assemblyBefore;
    this.assemblyBefore = null;
    if (before) {
      this.project.layerStack.select(before.active);
      this.selectedGroupId = before.group;
      this.committedRevision = before.revision;
      this.viewMode = before.view;
      this.syncPresentation();
      this.updateCommandRevision();
      // Restore the published token only if all inputs match. Never reissue
      // revision numbers observed during the failed transaction.
      if (this.commandKey === before.commandKey) this.commandRevision = before.commandRevision;
    }
  }
  setLayerColour(id: string, colour: string): void {
    this.assertAvailable();
    const layer = this.project.layerStack.get(id);
    layer.assertEditable();
    const before = this.display.colour(this.project.id, id, layer.order);
    this.display.setColour(this.project.id, id, colour);
    const after = this.display.colour(this.project.id, id, layer.order);
    if (before === after) return;
    this.discardFuture();
    this.past.push({ kind: "colour", layerId: id, before, after });
    this.committedRevision++;
    this.syncPresentation();
  }
  setAssemblyPart(id: string, value: unknown): void {
    this.assertAvailable();
    this.finishStroke();
    this.finishTransform();
    const layer = this.project.layerStack.get(id);
    layer.assertEditable();
    const before = layer.assemblyPart;
    const after = value == null ? undefined : validateAssemblyPart(value);
    layer.assemblyPart = after;
    try {
      validateAssembly(this.project.layerStack);
    } catch (e) {
      layer.assemblyPart = before;
      throw e;
    }
    this.recordMetadata({ kind: "assembly", layerId: id, before, after });
    this.committedRevision++;
    this.syncPresentation();
  }
  /** Atomically replace one source array modifier; instances borrow the original source field. */
  setArrayDefinition(id: string, value: unknown): void {
    this.assertAvailable();
    this.finishStroke();
    this.finishTransform();
    const layer = this.project.layerStack.get(id);
    layer.assertEditable();
    const before = layer.array,
      after = value === undefined || value === null ? undefined : validateArrayDefinition(value);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    if (
      after &&
      this.project.layerStack.layers.some(
        (candidate) => candidate.id !== id && candidate.array?.id === after.id,
      )
    )
      throw new Error("Array IDs must be unique across source objects.");
    layer.array = after;
    this.discardFuture();
    this.recordMetadata({
      kind: "array",
      layerId: id,
      before: before && structuredClone(before),
      after: after && structuredClone(after),
    });
    this.committedRevision++;
    this.viewMode = "boolean";
    this.composite.invalidate();
    this.syncPresentation();
  }
  private assertBooleanUnreferenced(id: string): void {
    if (
      this.project.layerStack.layers.some((l) => l.booleanModifiers?.some((m) => m.sourceId === id))
    )
      throw new Error("Remove Boolean references before deleting or cutting this source.");
  }
  setOperation(id: string, operation: LayerOperation): void {
    this.assertAvailable();
    this.finishStroke();
    this.finishTransform();
    const layer = this.project.layerStack.get(id);
    if (layer.locked) throw new Error("Unlock the layer to change its operation.");
    if (!["union", "difference", "intersect"].includes(operation))
      throw new Error("Invalid Boolean operation.");
    if (layer.operation === operation) return;
    const before = layer.operation;
    layer.operation = operation;
    this.recordMetadata({ kind: "operation", layerId: id, before, after: operation });
  }
  setFlag(id: string, flag: "visible" | "locked", value: boolean): void {
    this.assertAvailable();
    this.finishStroke();
    this.finishTransform();
    if (this.project.layerStack.hierarchy.parentsLocked(id))
      throw new Error("Unlock the parent group.");
    this.project.layerStack.get(id)[flag] = value;
    this.syncPresentation();
  }
  resampleActive(resolution: number): void {
    this.assertAvailable();
    this.finishStroke();
    this.finishTransform();
    const runtime = this.editableRuntime(this.project.activeLayerId);
    this.assertSculptable(runtime.layer);
    if (![64, 128, 192].includes(resolution)) throw new Error("Choose 64³, 128³ or 192³.");
    if (resolution === runtime.layer.volume.resolution) return;
    this.assertCapacity(resolution ** 3, runtime.layer.id);
    const volume = resampleVolume(runtime.layer.volume, resolution);
    this.replaceVolume(runtime, volume);
  }
  private replaceVolume(previous: LayerRuntime, volume: VolumeStore): void {
    // Prepare separately, then retain the original SdfLayer identity/metadata on commit.
    const next = new LayerRuntime(previous.layer, this.neutral, volume);
    this.committedRevision++;
    previous.layer.volume = volume;
    this.group.remove(previous.surface.group);
    previous.dispose();
    this.install(next);
    for (const entry of this.historyEntries())
      if (entry.kind === "bake" && entry.layerId === previous.layer.id) entry.runtime = next;
    this.past = this.past.filter(
      (entry) => entry.layerId !== previous.layer.id || entry.kind !== "voxels",
    );
    this.future = this.future.filter(
      (entry) => entry.layerId !== previous.layer.id || entry.kind !== "voxels",
    );
    this.syncPresentation();
  }
  private discardFuture(preserveVoxelRedo = false): void {
    if (this.assemblyTransaction) return;
    const discarded = this.future;
    this.future = [];
    if (!preserveVoxelRedo)
      for (const runtime of this.runtimes.values()) runtime.history.discardRedo();
    for (const entry of this.flattenEntries(discarded))
      if (entry.kind === "bake" && !this.runtimes.has(entry.layerId)) {
        entry.runtime.dispose();
        this.display.remove(this.project.id, entry.layerId);
      } else if (entry.kind === "cut") {
        for (const runtime of [entry.original, entry.negative, entry.positive])
          if (this.runtimes.get(runtime.layer.id) !== runtime) runtime.dispose();
        if (!this.project.layerStack.layers.some((layer) => layer.id === entry.positive.layer.id))
          this.display.remove(this.project.id, entry.positive.layer.id);
      } else if (entry.kind === "cut-batch")
        for (const cut of entry.entries) {
          for (const runtime of [cut.original, cut.negative, cut.positive])
            if (this.runtimes.get(runtime.layer.id) !== runtime) runtime.dispose();
          if (!this.project.layerStack.layers.some((layer) => layer.id === cut.positive.layer.id))
            this.display.remove(this.project.id, cut.positive.layer.id);
        }
    this.releaseHierarchyOrphans();
  }
  private bakeState(): BakeState {
    return {
      hierarchy: this.project.layerStack.hierarchy.snapshot(),
      selectedGroup: this.selectedGroupId,
      ids: this.project.layerStack.layers.map((l) => l.id),
      orders: Object.fromEntries(this.project.layerStack.layers.map((l) => [l.id, l.order])),
      visibility: Object.fromEntries(
        this.project.layerStack.layers.map((l) => [l.id, l.localVisible]),
      ),
      activeId: this.project.activeLayerId,
      view: this.viewMode,
    };
  }
  private restoreCompatibleHierarchy(target: HierarchyState): void {
    const h = this.project.layerStack.hierarchy,
      current = h.snapshot(),
      ids = new Set(current.layers.map((l) => l.id)),
      state = structuredClone(target);
    state.layers = state.layers.filter((l) => ids.has(l.id));
    for (const leaf of current.layers)
      if (!state.layers.some((l) => l.id === leaf.id)) state.layers.push(leaf);
    for (const group of current.groups)
      if (!state.groups.some((g) => g.id === group.id)) state.groups.push(group);
    const all = new Set([...state.layers, ...state.groups].map((n) => n.id));
    state.order = [
      ...state.order.filter((id) => all.has(id)),
      ...current.order.filter((id) => !state.order.includes(id)),
    ];
    state.compositionOrder = [
      ...state.compositionOrder.filter((id) => ids.has(id)),
      ...current.compositionOrder.filter((id) => !state.compositionOrder.includes(id)),
    ];
    h.restore(state);
  }
  private restoreBakeState(state: BakeState): void {
    const stack = this.project.layerStack;
    for (const layer of stack.layers)
      if (layer.id in state.visibility) layer.visible = state.visibility[layer.id];
    if (state.hierarchy) this.restoreCompatibleHierarchy(state.hierarchy);
    this.selectedGroupId = state.selectedGroup ?? null;
    this.restoreOrder(state.ids);
    if (stack.layers.length === state.ids.length && stack.layers.every((l) => l.id in state.orders))
      for (const layer of stack.layers) layer.order = state.orders[layer.id];
    stack.select(
      stack.layers.some((l) => l.id === state.activeId) ? state.activeId : stack.layers[0].id,
    );
    this.viewMode = state.view;
    this.syncPresentation();
    this.composite.invalidate();
  }
  private replayBake(entry: BakeEntry, redo: boolean): void {
    const stack = this.project.layerStack;
    if (redo) {
      this.assertCapacity(
        entry.runtime.volume instanceof SparseSDFVolume
          ? 0
          : volumeSampleCount(entry.runtime.volume),
        undefined,
        1,
        entry.layerId,
      );
      stack.insert(entry.runtime.layer, Math.min(entry.index, stack.layers.length));
      this.install(entry.runtime);
      this.restoreBakeState(entry.after);
    } else {
      if (stack.layers.length === 1)
        throw new Error(
          "Cannot undo Bake after all original layers were deleted. Keep at least one other layer.",
        );
      entry.runtime = this.runtime(entry.layerId);
      entry.after.visibility[entry.layerId] = entry.runtime.layer.localVisible;
      if (entry.after.hierarchy) {
        const saved = entry.after.hierarchy.layers.find((l) => l.id === entry.layerId),
          now = stack.hierarchy.snapshot().layers.find((l) => l.id === entry.layerId);
        if (saved && now) Object.assign(saved, now);
      }
      stack.remove(entry.layerId);
      this.group.remove(entry.runtime.surface.group);
      this.runtimes.delete(entry.layerId);
      this.restoreBakeState(entry.before);
    }
  }
  bakePlan(resolution: number, sourceIds?: string[]) {
    this.assertAvailable();
    this.assertCapacity(resolution ** 3, undefined, 1);
    return planBake(this.project, resolution, sourceIds);
  }
  async insertPersonalShape(
    source: SdfLayer,
    factor: number,
    signal?: AbortSignal,
  ): Promise<SdfLayer> {
    this.assertAvailable();
    this.finishStroke();
    this.finishTransform();
    if (!Number.isFinite(factor) || factor <= 0) throw new Error("Invalid shape calibration.");
    if (source.volume instanceof SparseSDFVolume && !isLegacyCubicGrid(source.volume))
      throw new Error(
        "Expanded sparse masters cannot be inserted as dense Personal Shapes. Open the native project.",
      );
    const stack = this.project.layerStack;
    if (
      stack.layers.length >= MAX_PROJECT_LAYERS ||
      stack.layers.reduce(
        (n, l) => n + (l.volume instanceof SparseSDFVolume ? 0 : volumeSampleCount(l.volume)),
        0,
      ) +
        volumeSampleCount(source.volume) >
        MAX_PROJECT_VOXELS ||
      this.trackedBytes + this.composite.trackedBytes + volumeSampleCount(source.volume) * 16 >
        256 * 1024 ** 2
    )
      throw new Error(
        "Shape insertion exceeds project layer or memory limits. Save a .form backup or use a smaller project; the master was kept at full detail.",
      );
    const before = this.bakeState(),
      transform = copyTransform(source.transform);
    transform.position = transform.position.map((v) => v * factor) as [number, number, number];
    transform.scale = transform.scale.map((v) => v * factor) as [number, number, number];
    const volume = new SDFVolume(source.volume.resolution, source.volume.extent, false, {
      dimensions: source.volume.dimensions,
      latticeMin: source.volume.latticeMin ?? [0, 0, 0],
    });
    for (let i = 0; i < volume.values.length; i++) volume.values[i] = source.volume.readVoxel(i);
    const layer = new SdfLayer(volume, {
      name: this.uniqueName(source.name),
      transform,
      order: Math.max(...stack.layers.map((l) => l.order)) + 1,
    });
    let candidate: LayerRuntime | undefined;
    this.baking = true;
    try {
      candidate = new LayerRuntime(layer, this.neutral, volume, true);
      const budget =
        MAX_PROJECT_TRIANGLES - [...this.runtimes.values()].reduce((n, r) => n + r.triangles, 0);
      while (candidate.mesher.pendingChunks) {
        checkBakeCancelled(signal);
        if (this.disposed) throw new Error("Project closed during insertion.");
        candidate.rebuild(2, 3);
        if (candidate.triangles > budget)
          throw new Error("Shape exceeds the project triangle limit. Master and project kept.");
        await yieldBake();
      }
      checkBakeCancelled(signal);
      if (this.disposed || !candidate.triangles)
        throw new Error("Shape has no surface or the project closed.");
      stack.insert(layer);
      this.install(candidate);
      this.discardFuture();
      this.viewMode = "separate";
      this.past.push({
        kind: "bake",
        layerId: layer.id,
        runtime: candidate,
        before,
        after: this.bakeState(),
        index: stack.layers.length - 1,
      });
      this.committedRevision++;
      this.syncPresentation();
      this.composite.invalidate();
      candidate = undefined;
      return layer;
    } finally {
      candidate?.dispose();
      this.baking = false;
    }
  }
  async bake(
    options: BakeOptions,
    signal?: AbortSignal,
    progress?: (p: BakeProgress) => void,
  ): Promise<SdfLayer> {
    if (
      options.sourceIds?.length === 1 &&
      (this.project.layerStack.get(options.sourceIds[0]).booleanModifiers?.length ||
        this.project.layerStack.get(options.sourceIds[0]).array?.enabled) &&
      ![64, 128, 192].includes(options.resolution)
    )
      options = { ...options, resolution: 128 };
    if (
      options.sourceIds?.length === 1 &&
      !this.project.layerStack.get(options.sourceIds[0]).booleanModifiers?.length &&
      !this.project.layerStack.get(options.sourceIds[0]).array?.enabled &&
      (this.project.layerStack.get(options.sourceIds[0]).procedural ||
        this.project.layerStack.get(options.sourceIds[0]).primitive)
    ) {
      if (options.storage === "sparse")
        throw new Error("Sparse output is available for evaluated Boolean Bake.");
      return this.bakeTube(options, signal);
    }
    this.assertAvailable();
    const validated = validateBakeOptions(options),
      plan = this.bakePlan(validated.resolution, validated.sourceIds);
    plan.storage = validated.storage;
    if (
      this.project.layerStack.layers.some((l) => l.booleanModifiers?.length || l.array?.enabled) &&
      plan.detailLimited
    )
      throw new Error(
        "Live Boolean Bake exceeds the selected resolution; reduce bounds or choose higher resolution.",
      );
    if (
      this.project.layerStack.layers.some((l) => l.booleanModifiers?.length || l.array?.enabled) &&
      plan.sourceIds.some((id) => this.project.layerStack.get(id).locked)
    )
      throw new Error("Unlock Boolean sources before baking and changing their visibility.");
    this.finishStroke();
    this.finishTransform();
    const triangleBudget =
      MAX_PROJECT_TRIANGLES - [...this.runtimes.values()].reduce((sum, r) => sum + r.triangles, 0);
    if (triangleBudget <= 0)
      throw new Error(
        "Bake would exceed the native project triangle budget, including hidden sources.",
      );
    const before = this.bakeState(),
      start = performance.now();
    this.baking = true;
    let candidate: LayerRuntime | undefined;
    try {
      const { volume, samplingMs } = await sampleBake(this.project, plan, signal, (p) => {
        if (this.disposed) throw new Error("Bake cancelled: project closed.");
        progress?.(p);
      });
      if (this.disposed) throw new Error("Bake cancelled: project closed.");
      const layer = new SdfLayer(volume, {
        name: this.uniqueName(validated.name),
        operation: "union",
        order: this.project.layerStack.layers.length,
        transform: {
          position: [...plan.center],
          rotation: [0, 0, 0],
          scale: [plan.scale, plan.scale, plan.scale],
        },
      });
      const paintSources = plan.sourceIds.map((id) => this.project.layerStack.get(id));
      if (paintSources.some((l) => !sculptPaint(l.volume).empty)) {
        const sources = bakeSources(this.project, plan.requestedSourceIds);
        const sample = prepareCompositeColour(sources, (l) => this.runtime(l.id).paintSurface.base),
          paint = sculptPaint(volume),
          point = new Vector3(),
          colour = new Color(),
          n = volume.dimensions;
        for (let z = 0; z < n[2]; z++) {
          for (let y = 0; y < n[1]; y++)
            for (let x = 0; x < n[0]; x++) {
              const id = volume.index(x, y, z);
              if (Math.abs(volume.readVoxel(id)) > volume.step * 2) continue;
              point.set(
                volume.coordinate(x, 0) * plan.scale + plan.center[0],
                volume.coordinate(y, 1) * plan.scale + plan.center[1],
                volume.coordinate(z, 2) * plan.scale + plan.center[2],
              );
              sample(point, colour);
              [colour.r, colour.g, colour.b, 1].forEach((v, k) => {
                paint.channels[k].write(id, v);
              });
            }
          await yieldBake();
          checkBakeCancelled(signal);
          if (this.disposed) throw new Error("Bake cancelled: project closed.");
        }
      }
      candidate = new LayerRuntime(layer, this.neutral, volume, true);
      let meshingMs = 0,
        chunks = 0;
      const plannedChunks = candidate.mesher.pendingChunks;
      while (candidate.rebuild(8, 3)) {
        meshingMs += candidate.lastMeshMs;
        chunks += candidate.lastChanged;
        if (candidate.triangles > triangleBudget)
          throw new Error(
            "Bake would exceed the project triangle budget, including preserved sources. Choose a lower resolution.",
          );
        progress?.({ stage: "meshing", completed: chunks, total: plannedChunks });
        await yieldBake();
        checkBakeCancelled(signal);
        if (this.disposed) throw new Error("Bake cancelled: project closed.");
      }
      candidate.lastMeshMs = meshingMs;
      candidate.lastChanged = chunks;
      if (!candidate.triangles)
        throw new Error("Boolean result has no extractable surface. No layer was created.");
      checkBakeCancelled(signal);
      // Commit only after all sampling/mesh validation succeeds. No source voxels are written.
      this.project.layerStack.insert(layer);
      for (const source of this.project.layerStack.layers)
        if (source.id in before.orders) source.order = before.orders[source.id];
      layer.order = Math.max(...Object.values(before.orders)) + 1;
      this.install(candidate);
      if (validated.hideSources)
        for (const id of plan.sourceIds) this.project.layerStack.get(id).visible = false;
      else this.viewMode = "separate";
      if (plan.merge) this.viewMode = "separate";
      this.discardFuture();
      this.syncPresentation();
      this.composite.invalidate();
      this.committedRevision++;
      this.past.push({
        kind: "bake",
        layerId: layer.id,
        runtime: candidate,
        before,
        after: this.bakeState(),
        index: this.project.layerStack.layers.findIndex((l) => l.id === layer.id),
      });
      this.lastBakeStats = {
        samplingMs,
        meshingMs,
        totalMs: performance.now() - start,
        resolution: plan.resolution,
        triangles: candidate.triangles,
        worldStep: plan.worldStep,
        gridBytes: plan.gridBytes,
      };
      candidate = undefined;
      return layer;
    } finally {
      candidate?.dispose();
      this.baking = false;
    }
  }
  /** Explicit tube bake copies its evaluated lattice exactly: no normalization,
   * density reduction, source deletion or merging with unrelated layers. */
  private async bakeTube(options: BakeOptions, signal?: AbortSignal): Promise<SdfLayer> {
    this.assertAvailable();
    const validated = validateBakeOptions(options),
      source = this.project.layerStack.get(validated.sourceIds![0]);
    if (source.primitive) source.assertEditable();
    if (validated.resolution !== source.volume.resolution)
      throw new Error("Tube Bake preserves source resolution.");
    this.assertCapacity(volumeSampleCount(source.volume), undefined, 1);
    if (this.drawing || this.transforming) throw new Error("Finish the current edit first.");
    const before = this.bakeState(),
      metadata = JSON.stringify(source.metadata()),
      start = performance.now();
    this.baking = true;
    let candidate: LayerRuntime | undefined;
    const check = () => {
      checkBakeCancelled(signal);
      if (this.disposed || JSON.stringify(source.metadata()) !== metadata)
        throw new Error("Tube Bake cancelled: source changed.");
    };
    try {
      const original = source.volume,
        volume = new SDFVolume(original.resolution, original.extent, false, {
          dimensions: original.dimensions,
          latticeMin: original.latticeMin ?? [0, 0, 0],
        });
      if (this.trackedBytes + volumeSampleCount(volume) * 8 > 256 * 1024 ** 2)
        throw new Error("Tube Bake exceeds the staging memory budget.");
      for (let i = 0; i < volume.values.length; i += 16384) {
        check();
        for (let j = i; j < Math.min(volume.values.length, i + 16384); j++)
          volume.values[j] = original.readVoxel(j);
        await yieldBake();
      }
      const samplingMs = performance.now() - start,
        {
          id: unused,
          procedural: unusedSource,
          primitive: unusedPrimitive,
          primitiveOriginal: unusedOriginalPrimitive,
          ...metadataCopy
        } = source.metadata();
      void unused;
      void unusedSource;
      void unusedPrimitive;
      void unusedOriginalPrimitive;
      const layer = new SdfLayer(volume, {
        ...metadataCopy,
        transform: copyTransform(source.transform),
        name: validated.name,
        locked: false,
        visible: true,
        operation: "union",
        order: this.project.layerStack.layers.length,
      });
      candidate = new LayerRuntime(layer, this.neutral, volume, true);
      const meshStart = performance.now(),
        budget =
          MAX_PROJECT_TRIANGLES - [...this.runtimes.values()].reduce((n, r) => n + r.triangles, 0);
      while (candidate.mesher.pendingChunks) {
        check();
        candidate.rebuild(2, 3);
        if (candidate.triangles > budget)
          throw new Error("Tube Bake exceeds the project triangle budget.");
        await yieldBake();
      }
      check();
      this.project.layerStack.insert(layer);
      this.install(candidate);
      this.discardFuture();
      this.viewMode = "separate";
      if (validated.hideSources) source.visible = false;
      this.past.push({
        kind: "bake",
        layerId: layer.id,
        runtime: candidate,
        before,
        after: this.bakeState(),
        index: this.project.layerStack.layers.length - 1,
      });
      this.committedRevision++;
      this.syncPresentation();
      this.composite.invalidate();
      this.lastBakeStats = {
        samplingMs,
        meshingMs: performance.now() - meshStart,
        totalMs: performance.now() - start,
        resolution: volume.resolution,
        triangles: candidate.triangles,
        worldStep: volume.step * uniformScale(layer.transform),
        gridBytes: volume.values.byteLength * 2,
      };
      candidate = undefined;
      return layer;
    } finally {
      candidate?.dispose();
      this.baking = false;
    }
  }
  /** Source-first atomic regeneration. No source/cache publication before all slices
   * and chunks succeed. One in-flight candidate, cancelled on ownership changes. */
  async regenerateTube(
    value: TubeSource,
    id?: string,
    signal?: AbortSignal,
    progress?: (fraction: number) => void,
  ): Promise<SdfLayer> {
    return this.regenerateSource(value, id, signal, undefined, progress);
  }
  async regeneratePrimitive(
    value: PrimitiveSource,
    id?: string,
    signal?: AbortSignal,
    placement?: VolumeTransform,
    skipMeshing = false,
    coalesceMeshYields = false,
  ): Promise<SdfLayer> {
    return this.regenerateSource(
      value,
      id,
      signal,
      placement,
      undefined,
      undefined,
      skipMeshing,
      coalesceMeshYields,
    );
  }
  enclosureScaleRole(id: string): "cutout" | "post" | "bore" | undefined {
    const owner = this.enclosureFeatureForSource(id);
    if (!owner) return undefined;
    if (owner.feature.definition.kind === "cutout") return "cutout";
    return owner.feature.sourceIds.indexOf(id) % 2 ? "bore" : "post";
  }

  /** Commit gizmo dimensions and the owning recipe together. */
  async resizePrimitiveFromGizmo(
    id: string,
    source: PrimitiveSource,
    signal?: AbortSignal,
    centre?: Vec3,
  ): Promise<SdfLayer> {
    const owner = this.enclosureFeatureForSource(id);
    if (!owner) return this.regeneratePrimitive(source, id, signal);

    const { base, part, intent, features, feature, featureIndex } = owner;
    const stack = this.project.layerStack;
    const selected = stack.get(id);
    if (this.selectedGroupId || this.project.activeLayerId !== id || !selected.primitive)
      throw new Error("Select the enclosure feature before scaling it.");
    base.assertEditable();
    validateFeatureLinks(stack, base.id);
    const mm = this.display.precision.millimetresPerUnit;
    const centreMm = centre
      ? new Vector3(...centre)
          .applyMatrix4(transformMatrix(base.transform).invert())
          .multiplyScalar(mm)
          .toArray()
      : undefined;
    const definition = scaledEnclosureFeature(
      intent.parameters,
      feature.definition,
      feature.sourceIds.indexOf(id),
      selected.primitive,
      source,
      mm,
      centreMm,
    );
    if (JSON.stringify(definition) === JSON.stringify(feature.definition))
      throw new Error(
        "The enclosure controls cutter depth. Scale the opening across or up the wall.",
      );
    const plan = featurePlan(intent.parameters, definition);
    const changes = plan.flatMap((entry, index) => {
      const layer = stack.get(feature.sourceIds[index]);
      const primitive = validatePrimitive(
        Object.fromEntries(
          Object.entries(entry.source).map(([key, value]) => [
            key,
            typeof value === "number" ? value / mm : value,
          ]),
        ),
      );
      const pose = copyTransform(layer.localTransform);
      pose.position = entry.positionMm.map((value) => value / mm) as Vec3;
      if (
        sameTransform(pose, layer.localTransform) &&
        JSON.stringify(primitive) === JSON.stringify(layer.primitive)
      )
        return [];
      layer.assertEditable();
      return [{ layer, primitive, pose }];
    });
    const lease = this.acquireModellingLease();
    let checkpoint: number | undefined;
    try {
      checkpoint = this.withModellingLease(lease, () => this.assemblyCheckpoint());
      for (const change of changes) {
        await this.withModellingLease(lease, () =>
          this.regenerateSource(
            change.primitive,
            change.layer.id,
            signal,
            undefined,
            undefined,
            change.pose,
          ),
        );
      }
      const start = checkpoint;
      this.withModellingLease(lease, () => {
        if (signal?.aborted || this.disposed) throw new Error("Enclosure resize cancelled.");
        this.setAssemblyPart(base.id, {
          ...part,
          enclosure: {
            ...intent,
            features: features.map((entry, index) =>
              index === featureIndex ? { ...entry, definition } : entry,
            ),
          },
        });
        this.finishAssemblyTransaction(start);
      });
      return selected;
    } catch (error) {
      if (checkpoint !== undefined) {
        const start = checkpoint;
        this.withModellingLease(lease, () => this.rollbackAssemblyTransaction(start));
      }
      throw error;
    } finally {
      this.releaseModellingLease(lease);
    }
  }

  async resizeBoxFace(
    id: string,
    face: Face,
    delta: number,
    signal?: AbortSignal,
  ): Promise<SdfLayer> {
    if (this.selectedGroupId || this.project.activeLayerId !== id)
      throw new Error("Select the box before resizing its face.");
    const layer = this.runtime(id).layer;
    if (this.project.layerStack.hierarchy.children(id).length)
      throw new Error("Face Resize requires a box without child layers.");
    layer.assertEditable();
    uniformScale(layer.transform);
    const next = resizeFace(checkedRectangularBox(layer.primitive), face, delta);
    if (!next.delta) return layer;
    if (this.enclosureScaleRole(id) === "cutout") {
      if (face.axis === 2) throw new Error("The enclosure controls through-wall depth.");
      return this.resizePrimitiveFromGizmo(
        id,
        next.source,
        signal,
        anchoredBoxPose(layer.transform, face, next.delta).position,
      );
    }
    return this.regenerateSource(
      next.source,
      id,
      signal,
      undefined,
      undefined,
      anchoredBoxPose(layer.localTransform, face, next.delta),
    );
  }
  private async regenerateSource(
    value: TubeSource | PrimitiveSource,
    id?: string,
    signal?: AbortSignal,
    placement?: VolumeTransform,
    progress?: (fraction: number) => void,
    localPose?: VolumeTransform,
    skipMeshing = false,
    coalesceMeshYields = false,
  ): Promise<SdfLayer> {
    this.assertAvailable();
    if (this.selectedGroupId) throw new Error("Select a child layer for procedural editing.");
    if (this.drawing || this.transforming) throw new Error("Finish the current edit first.");
    const source = value.kind === "tube" ? validateTube(value) : validatePrimitive(value),
      old = id ? this.runtime(id) : undefined;
    if (old) {
      old.layer.assertEditable();
      if (source.kind === "tube" ? !old.layer.procedural : !old.layer.primitive)
        throw new Error("Select a matching parametric source.");
    }
    const activeId = this.project.activeLayerId,
      metadata = old ? JSON.stringify(old.layer.metadata()) : "",
      before = this.bakeState();
    const n = old?.volume.resolution ?? this.active.volume.resolution,
      extent = old?.volume.extent ?? this.active.volume.extent,
      baseTracked = this.trackedBytes,
      sourceLabel = source.kind === "tube" ? "Tube" : "Primitive";
    this.tubePending = true;
    let candidate: LayerRuntime | undefined;
    const check = () => {
      if (
        signal?.aborted ||
        this.disposed ||
        this.project.activeLayerId !== activeId ||
        (old && (!old.layer.editable || JSON.stringify(old.layer.metadata()) !== metadata))
      )
        throw new Error(`${sourceLabel} regeneration cancelled. Source kept.`);
    };
    try {
      const otherSamples = this.project.layerStack.layers.reduce(
        (sum, l) =>
          sum +
          (l.id === id || l.volume instanceof SparseSDFVolume ? 0 : volumeSampleCount(l.volume)),
        0,
      );
      if (!old && this.project.layerStack.layers.length >= MAX_PROJECT_LAYERS)
        throw new Error(`Maximum of ${MAX_PROJECT_LAYERS} independent layers reached.`);
      const maxSamples = Math.min(
        MAX_PROJECT_VOXELS - otherSamples,
        Math.floor((256 * 1024 ** 2 - baseTracked) / 8),
      );
      const allocate = (samples: number) => {
        this.tubeStagingBytes = samples * 8;
      };
      const cacheStarted = performance.now();
      const work =
        source.kind === "tube"
          ? evaluateTube(
              source,
              n,
              extent,
              maxSamples,
              allocate,
              progress && ((fraction) => progress(fraction * 0.65)),
            )
          : evaluatePrimitive(
              source,
              localPose ? n : Math.min(n, Math.floor(Math.cbrt(Math.max(0, maxSamples)))),
              maxSamples,
              allocate,
              512,
            );
      let result = work.next(),
        deadline = performance.now() + 3,
        sliceStarted = performance.now(),
        yieldCount = 0,
        yieldedMs = 0,
        maxSliceMs = 0;
      while (!result.done) {
        check();
        if (performance.now() >= deadline) {
          const sliceMs = performance.now() - sliceStarted;
          maxSliceMs = Math.max(maxSliceMs, sliceMs);
          yieldCount++;
          const yieldStarted = performance.now();
          await yieldBake();
          yieldedMs += performance.now() - yieldStarted;
          sliceStarted = performance.now();
          deadline = performance.now() + 3;
        }
        result = work.next();
      }
      recordAgentPerformance(
        "source.primitive-cache-evaluation",
        performance.now() - cacheStarted,
        {
          yieldCount,
          yieldedMs,
          maxSliceMs,
          resolution: result.value.resolution,
        },
      );
      check();
      const volume = result.value;
      this.assertCapacity(volumeSampleCount(volume), id, old ? 0 : 1);
      if (this.trackedBytes > 256 * 1024 ** 2)
        throw new Error(`${sourceLabel} exceeds the staging memory budget. Source kept.`);
      const layer = new SdfLayer(
        volume,
        old
          ? {
              ...old.layer.metadata(),
              primitiveOriginal:
                old.layer.primitive?.kind === source.kind ? old.layer.primitiveOriginal : undefined,
              procedural: source.kind === "tube" ? source : undefined,
              primitive: source.kind !== "tube" ? source : undefined,
            }
          : {
              ...(placement ? { transform: validateTransformEdit(placement, placement) } : {}),
              name: this.uniqueName(
                source.kind === "tube"
                  ? "Procedural Tube"
                  : source.kind === "cylinder" && source.topDiameter === 0
                    ? "Parametric Cone"
                    : `Parametric ${source.kind}`,
              ),
              order: this.project.layerStack.layers.length,
              procedural: source.kind === "tube" ? source : undefined,
              primitive: source.kind !== "tube" ? source : undefined,
            },
      );
      if (!this.assemblyTransaction)
        assertProjectTriangleBudget(this.project.layerStack.layers, layer);
      candidate = new LayerRuntime(
        old?.layer ?? layer,
        this.neutral,
        volume,
        true,
        source.kind === "tube" ? undefined : source,
      );
      const triangleBudget =
        MAX_PROJECT_TRIANGLES -
        [...this.runtimes.values()].reduce((n, r) => n + (r === old ? 0 : r.triangles), 0);
      const meshStarted = performance.now();
      const profile = agentPerformanceEnabled();
      let meshYieldedMs = 0;
      let meshYieldCount = 0;
      let meshSliceDeadline = meshStarted + 3;
      const meshChunks = candidate.mesher.pendingChunks;
      if (!skipMeshing) {
        progress?.(0.65);
        while (candidate.mesher.pendingChunks) {
          check();
          candidate.rebuild(2, 3);
          progress?.(0.65 + 0.31 * (1 - candidate.mesher.pendingChunks / meshChunks));
          this.tubeStagingBytes =
            volumeSampleCount(volume) * 8 +
            candidate.mesher.ownedGeometryBytes +
            candidate.sourceGeometryBytes;
          if (this.trackedBytes > 256 * 1024 ** 2)
            throw new Error(`${sourceLabel} staged mesh exceeds the memory budget. Source kept.`);
          if (candidate.triangles > triangleBudget)
            throw new Error(`${sourceLabel} exceeds the project triangle budget. Source kept.`);
          // Keep the existing two-chunk capacity checks. Enclosure proposals combine
          // cheap chunks into the same time slice to avoid thousands of timer turns.
          if (
            !coalesceMeshYields ||
            !candidate.mesher.pendingChunks ||
            performance.now() >= meshSliceDeadline
          ) {
            const yieldStarted = profile ? performance.now() : 0;
            await yieldBake();
            if (profile) {
              meshYieldedMs += performance.now() - yieldStarted;
              meshYieldCount++;
            }
            meshSliceDeadline = performance.now() + 3;
          }
        }
      }
      recordAgentPerformance("source.primitive-mesh-preparation", performance.now() - meshStarted, {
        skipMeshing,
        meshChunks,
        yieldedMs: meshYieldedMs,
        yieldCount: meshYieldCount,
      });
      check();
      this.discardFuture();
      if (old) {
        const previous = {
          source: old.layer.primitive
            ? validatePrimitive(old.layer.primitive)
            : validateTube(old.layer.procedural),
          volume: old.volume,
          primitiveOriginal: old.layer.primitiveOriginal,
          ...(localPose ? { localPose: copyTransform(old.layer.localTransform) } : {}),
        };
        this.group.remove(old.surface.group);
        this.runtimes.delete(id!);
        // Retain stable layer identity used by selection and transform tools.
        if (localPose) old.layer.localTransform = localPose;
        old.layer.volume = volume;
        old.layer.procedural = source.kind === "tube" ? source : undefined;
        old.layer.primitive = source.kind !== "tube" ? source : undefined;
        old.layer.primitiveOriginal = layer.primitiveOriginal;
        this.install(candidate);
        old.dispose();
        for (const e of this.flattenEntries(this.past))
          if (e.kind === "bake" && e.layerId === old.layer.id) e.runtime = candidate;
        this.past.push({
          kind: "tube",
          layerId: old.layer.id,
          before: previous,
          after: {
            source,
            volume,
            primitiveOriginal: layer.primitiveOriginal,
            ...(localPose ? { localPose } : {}),
          },
        });
        // Bound source-cache history to eight edits. Source coordinates never resample.
        let excess = this.past.filter((e) => e.kind === "tube").length - 8;
        if (!this.assemblyTransaction)
          this.past = this.past.filter((e) => e.kind !== "tube" || excess-- <= 0);
      } else {
        this.project.layerStack.insert(layer);
        this.install(candidate);
        this.past.push({
          kind: "bake",
          layerId: layer.id,
          runtime: candidate,
          before,
          after: this.bakeState(),
          index: this.project.layerStack.layers.length - 1,
        });
      }
      this.committedRevision++;
      this.syncPresentation();
      this.composite.invalidate();
      candidate = undefined;
      return old?.layer ?? layer;
    } finally {
      candidate?.dispose();
      this.tubeStagingBytes = 0;
      this.tubePending = false;
    }
  }
  /** Atomic branch command owned by XRMoveTool's existing preview lock. */
  async commitMove(
    owner: object,
    input: RadialMoveField,
    signal: AbortSignal,
    progress: (p: MoveProgress) => void = () => {},
    beforePublish: () => void = () => {},
    externalGuard: () => boolean = () => true,
  ): Promise<boolean> {
    if (
      this.disposed ||
      this.movePending ||
      this.baking ||
      this.previewOwner !== owner ||
      this.drawing ||
      this.transforming
    )
      throw new Error("Move does not own the editable source.");
    const runtime = this.active,
      source = runtime.volume,
      sourceSurface = runtime.surface,
      sourceMesher = runtime.mesher,
      transform = copyTransform(runtime.layer.transform),
      revision = sourceSurface.revision,
      maskRevision = sculptMask(source).revision,
      paintRevision = sculptPaint(source).revision,
      fieldRevision = source instanceof SparseSDFVolume ? source.fieldRevision : undefined,
      project = this.project.id,
      start = performance.now();
    this.assertSculptable(runtime.layer);
    if (
      runtime.layer.volume !== source ||
      !(source instanceof SDFVolume || source instanceof SparseSDFVolume) ||
      !runtime.layer.editable ||
      this.viewMode !== "separate" ||
      sourceMesher.pendingChunks
    )
      throw new Error("Move needs a ready, visible, unlocked sculpt source in Separate Layers.");
    const sparse = source instanceof SparseSDFVolume;
    const symmetry = { ...this.symmetry };
    if (
      (input.interaction === "rotate" ||
        input.interaction === "twist" ||
        input.delta.length() < source.step * 1e-4) &&
      (input.interaction === "translate" ||
        Math.abs(input.angle) * input.radius < source.step * 1e-4)
    )
      return false;
    const field = new RadialMoveField();
    field.capture(input.center, input.radius, input.falloff, 1);
    field.setDisplacement(input.delta);
    field.configure(input.mode, input.stiffness);
    field.interaction = input.interaction;
    field.setRotation(input.axis, input.angle);
    if (sparse) {
      field.setMirror(symmetry);
      field.assertSeparatedMirror(source.step * 4);
    }
    const limits = { ...this.growthLimits },
      footprint = field.affectedBounds();
    for (let a = 0; a < 3; a++) {
      footprint.min[a] -= source.step * 3;
      footprint.max[a] += source.step * 3;
    }
    const plan = sparse
        ? growthLayout(source, footprint, limits)
        : planDenseGrowth(source, footprint, limits),
      layout = plan ?? { dimensions: source.dimensions, latticeMin: source.latticeMin },
      samples = layout.dimensions.reduce((n, v) => n * v, 1);
    if (sparse && plan) this.validateSparseGrowth(runtime, source, layout, limits);
    const chunks = runtime.mesher.allocatedChunks;
    if (!sparse) this.assertCapacity(samples, runtime.layer.id);
    const limit = limits.maxTransientBytes ?? DENSE_GROWTH_LIMITS.maxTransientBytes,
      base = this.trackedBytes + (sparse ? this.composite.trackedBytes : 0),
      candidateStorage =
        (sparse ? source.pageMemoryBytes + chunks * 1024 + runtime.mesher.haloBytes : samples * 8) +
        sculptMask(source).memoryBytes * 3 +
        sculptPaint(source).memoryBytes * 12;
    let geometryBytes = 0;
    for (const o of sourceSurface.group.children)
      if ("geometry" in o) {
        const g = (o as import("three").Mesh).geometry;
        for (const a of Object.values(g.attributes)) geometryBytes += a.array.byteLength;
      }
    const available =
      limit - base - candidateStorage - geometryBytes - runtime.history.memoryBytes / 3;
    if (available <= 0)
      throw new Error("Move exceeds the source/candidate/history memory safety estimate.");
    this.movePending = true;
    this.moveStagingBytes = candidateStorage;
    const guard = () =>
      !this.disposed &&
      this.previewOwner === owner &&
      this.project.id === project &&
      this.active === runtime &&
      runtime.volume === source &&
      runtime.layer.volume === source &&
      runtime.surface === sourceSurface &&
      sourceSurface.revision === revision &&
      sculptMask(source).revision === maskRevision &&
      sculptPaint(source).revision === paintRevision &&
      runtime.layer.editable &&
      sameTransform(runtime.layer.transform, transform) &&
      (!sparse ||
        (this.symmetry.enabled === symmetry.enabled &&
          (!symmetry.enabled ||
            (this.symmetry.axis === symmetry.axis && this.symmetry.offset === symmetry.offset)) &&
          source.fieldRevision === fieldRevision)) &&
      this.viewMode === "separate" &&
      externalGuard();
    const work = new MoveWork(signal, guard);
    const releaseSource = sparse ? source.pinResidentPages() : undefined;
    let mesher: IncrementalMesher | undefined, stagedSurface: ChunkSurface | undefined;
    try {
      const next = await copyMoveVolume(source, layout, work, progress);
      let channelStaging = 0;
      const admitChannels = (bytes: number) => {
        channelStaging += bytes;
        this.moveStagingBytes = candidateStorage + channelStaging;
        if (base + this.moveStagingBytes > limit)
          throw new Error("Move channel remap exceeds the memory safety estimate.");
      };
      let publishChannels: (() => void) | undefined;
      if (next instanceof SparseSDFVolume) {
        sculptMask(next).restore(sculptMask(source).snapshot(), admitChannels);
        sculptPaint(next).restore(sculptPaint(source).snapshot(), admitChannels);
        if (plan)
          publishChannels = this.prepareSparseChannelHistory(
            runtime,
            next,
            this.historyEntries(),
            admitChannels,
          );
      }
      const reconstructionBudget = available - channelStaging;
      if (reconstructionBudget <= 0)
        throw new Error("Move exceeds the reconstruction memory safety estimate.");
      const result = await reconstructMoveAsync(
          sourceSurface.group,
          next,
          field,
          work,
          reconstructionBudget,
          progress,
        ),
        patch = result.patch;
      if (!patch.indices.length) return false;
      const patchBytes =
        patch.indices.buffer.byteLength +
        patch.before.buffer.byteLength +
        patch.after.buffer.byteLength;
      let retainedStaging =
        candidateStorage +
        channelStaging +
        result.indexBytes +
        patchBytes +
        patch.indices.length * 12 +
        runtime.history.memoryBytes / 3;
      this.moveStagingBytes = retainedStaging + geometryBytes;
      if (base + this.moveStagingBytes > limit)
        throw new Error("Move staging/history exceeds the memory safety estimate.");
      if (next instanceof SparseSDFVolume) {
        // The worker owns a read-only copy. Reserve all destination pages on the
        // detached candidate before applying any patch or preparing publication.
        next.admitAllocation = (bytes) => {
          retainedStaging += bytes;
          this.moveStagingBytes = retainedStaging + geometryBytes;
          if (base + this.moveStagingBytes > limit)
            throw new Error("Move exceeds the sparse page staging budget.");
        };
        const pages = next.preparePatchPages(patch.indices, limit - base - this.moveStagingBytes);
        let step = pages.next();
        while (!step.done) {
          await work.pause();
          step = pages.next();
        }
        step.value?.();
        next.admitAllocation = undefined;
      }
      const history = runtime.history.prepareMoveReplacement(next, patch);
      for (let i = 0; i < patch.indices.length; i++) {
        next.writeVoxel(patch.indices[i], patch.after[i]);
        if (i % 4096 === 4095) await work.pause();
      }
      let paintPeak = 0;
      await transportPaint(
        source,
        next,
        field,
        () => work.pause(),
        Math.max(0, limit - base - this.moveStagingBytes),
        sparse
          ? (bytes) => {
              paintPeak = Math.max(paintPeak, bytes);
            }
          : undefined,
      );
      mesher = sourceMesher.forkEdit(next, patch.bounds!);
      let meshMs = 0,
        dirtyChunks = 0;
      const triangleBudget =
        MAX_PROJECT_TRIANGLES -
        [...this.runtimes.values()].reduce((n, r) => n + (r === runtime ? 0 : r.triangles), 0);
      for (;;) {
        work.check();
        const batch = mesher.rebuildChunks(1);
        if (!batch) break;
        dirtyChunks += batch.stats.chunks;
        meshMs += batch.stats.milliseconds;
        this.moveStagingBytes = retainedStaging + mesher.ownedGeometryBytes;
        if (base + this.moveStagingBytes > limit)
          throw new Error("Move staged geometry exceeds the memory safety estimate. Source kept.");
        if (batch.triangles > triangleBudget)
          throw new Error("Move exceeds the native project triangle safety budget. Source kept.");
        progress({
          stage: "meshing",
          completed: dirtyChunks,
          total: dirtyChunks + mesher.pendingChunks,
        });
        await work.pause();
      }
      stagedSurface = new ChunkSurface(runtime.material, true);
      stagedSurface.group.name = sourceSurface.group.name;
      stagedSurface.group.userData = { ...sourceSurface.group.userData };
      stagedSurface.group.visible = sourceSurface.group.visible;
      stagedSurface.group.position.copy(sourceSurface.group.position);
      stagedSurface.group.quaternion.copy(sourceSurface.group.quaternion);
      stagedSurface.group.scale.copy(sourceSurface.group.scale);
      stagedSurface.group.renderOrder = sourceSurface.group.renderOrder;
      stagedSurface.update(mesher.snapshotUpdates());
      stagedSurface.revision = revision + 1;
      const invalidateComposite = this.composite.prepareInvalidation(),
        adopt = mesher.prepareAdoptionFrom(sourceMesher),
        entry: TimelineEntry = {
          kind: "voxels",
          layerId: runtime.layer.id,
          paintBefore: sculptPaint(source).snapshot(),
          paintAfter: sculptPaint(next).snapshot(),
        };
      let past = [...this.past, entry],
        excess =
          past.filter((e) => e.kind === "voxels" && e.layerId === runtime.layer.id).length -
          history.undoCount;
      past = past.filter((e) => {
        if (e.kind === "voxels" && e.layerId === runtime.layer.id && excess > 0) {
          excess--;
          return false;
        }
        return true;
      });
      const slot = this.group.children.indexOf(sourceSurface.group);
      if (slot < 0) throw new Error("Move source is no longer displayed.");
      const stats: MoveCommitStats = {
        backend: work.backend,
        waitMs: work.waitMs,
        workerInputBytes: work.workerInputBytes,
        workerPostMs: work.workerPostMs,
        slicePercentiles: work.slicePercentiles,
        wallMs: performance.now() - start,
        cpuMs: work.measuredCPU,
        maxSliceMs: work.maxSliceMs,
        meshingMs: meshMs,
        changedVoxels: patch.indices.length,
        sampled: result.sampled,
        indexBytes: result.indexBytes,
        patchBytes,
        estimatedPeakBytes:
          base +
          Math.max(
            this.moveStagingBytes,
            retainedStaging + geometryBytes + paintPeak,
            candidateStorage +
              channelStaging +
              work.workerSnapshotBytes +
              result.indexBytes +
              patchBytes,
          ),
        dirtyChunks,
        grew: !!plan,
        slices: work.slices,
      };
      work.check();
      beforePublish();
      work.check();
      // All arrays, history remaps, mesh extraction, display index and timeline
      // allocations precede this synchronous publication. No await below.
      history.publish();
      adopt();
      publishChannels?.();
      if (source instanceof SparseSDFVolume) {
        source.admitAllocation = undefined;
        source.pageHistory = undefined;
      }
      if (next instanceof SparseSDFVolume) next.finishGrowth();
      runtime.volume = runtime.layer.volume = next;
      runtime.mesher = mesher;
      this.bindSparseBudget(runtime);
      runtime.surface = stagedSurface;
      registerMaskSurface(stagedSurface.group, () => runtime.volume);
      this.group.children[slot] = stagedSurface.group;
      stagedSurface.group.parent = this.group;
      sourceSurface.group.parent = null;
      runtime.triangles = mesher.triangles;
      runtime.totalChunks = mesher.allocatedChunks;
      runtime.lastChanged = dirtyChunks;
      runtime.lastMeshMs = meshMs;
      if (plan) {
        runtime.expansions++;
        runtime.lastExpansionMs = performance.now() - start;
      }
      this.committedRevision++;
      this.past = past;
      this.lastMoveStats = stats;
      invalidateComposite();
      mesher = undefined;
      stagedSurface = undefined;
      // Source geometries still shared with the candidate changed ownership;
      // only superseded buffers are disposed. Cleanup cannot undo a publication.
      try {
        sourceMesher.dispose();
        sourceSurface.clear();
        this.discardFuture();
      } catch (error) {
        console.warn("Move committed; deferred resource cleanup failed", error);
      }
      return true;
    } finally {
      mesher?.dispose();
      stagedSurface?.clear();
      releaseSource?.();
      this.moveStagingBytes = 0;
      this.movePending = false;
    }
  }
  /** Borrow committed SDF-derived chunk buffers, never display/GPU deformation helpers.
   * Snapshotting owns copies; guards reject edits/replacement while those copies are made. */
  exportSources(scope: "visible" | "selected" = "visible", includePaint = true): ExportSource[] {
    if (
      this.project.layerStack.layers.some((l) => l.booleanModifiers?.length || l.array?.enabled)
    ) {
      if (scope === "selected")
        throw new Error("Export the visible Boolean result for scenes with live modifiers.");
      this.composite.syncMetadata();
      return this.composite
        .exportSources()
        .map((s) =>
          includePaint
            ? s
            : { ...s, chunks: s.chunks.map(({ positions, normals }) => ({ positions, normals })) },
        );
    }
    if (
      this.tubePending ||
      this.drawing ||
      this.transforming ||
      this.previewing ||
      this.deforming ||
      this.baking
    )
      throw new Error(
        "Finish or cancel the current sculpt / Move reconstruction before exporting.",
      );
    const selection = () =>
        JSON.stringify(
          this.project.layerStack.layers
            .filter(
              (l) => l.visible && (scope !== "selected" || l.id === this.project.activeLayerId),
            )
            .map((l) => l.id),
        ),
      selectionKey = selection();
    const selected = this.project.activeLayerId,
      layers = this.project.layerStack.layers.filter(
        (l) => l.visible && (scope !== "selected" || l.id === selected),
      );
    return layers.map((layer) => {
      const runtime = this.runtime(layer.id),
        volume = runtime.volume,
        revision = runtime.surface.revision,
        paintRevision = sculptPaint(volume).revision,
        metadata = JSON.stringify(layer.metadata());
      if (runtime.mesher.pendingChunks)
        throw new Error("Wait for committed surface meshing before exporting.");
      return {
        name: layer.name,
        layerId: layer.id,
        step: volume.step,
        transform: copyTransform(layer.transform),
        chunks: runtime
          .exportUpdates()
          .filter((u) => u.geometry.getAttribute("position").count)
          .map((u) => ({
            positions: u.geometry.getAttribute("position").array as Float32Array,
            normals: u.geometry.getAttribute("normal").array as Float32Array,
            colours:
              !includePaint || sculptPaint(volume).empty
                ? undefined
                : paintColours(u.geometry, volume, runtime.paintSurface.base),
          })),
        current: () =>
          selection() === selectionKey &&
          !this.disposed &&
          !this.drawing &&
          !this.previewing &&
          !this.deforming &&
          !this.transforming &&
          this.runtimes.get(layer.id) === runtime &&
          runtime.volume === volume &&
          runtime.surface.revision === revision &&
          sculptPaint(volume).revision === paintRevision &&
          !runtime.mesher.pendingChunks &&
          JSON.stringify(layer.metadata()) === metadata,
      };
    });
  }
  exportGroup(): Group {
    this.finishStroke();
    this.finishTransform();
    const group = new Group();
    group.name = this.project.name;
    for (const layer of this.project.layerStack.layers) {
      if (!layer.visible) continue;
      const r = this.runtime(layer.id),
        mesh = buildExportMesh(r.surface.group, this.neutral, "local");
      if (!sculptPaint(r.volume).empty) {
        mesh.geometry.setAttribute(
          "color",
          new BufferAttribute(paintColours(mesh.geometry, r.volume, r.paintSurface.base), 3),
        );
        mesh.material = this.paintedExport;
      }
      if (!mesh.geometry.getAttribute("position").count) {
        mesh.geometry.dispose();
        continue;
      }
      mesh.name = layer.name;
      mesh.userData.layerId = layer.id;
      mesh.position.fromArray(layer.transform.position);
      mesh.rotation.set(...layer.transform.rotation, "XYZ");
      mesh.scale.fromArray(layer.transform.scale);
      group.add(mesh);
    }
    if (!group.children.length) throw new Error("No visible surface to export.");
    return group;
  }
  dispose(): void {
    this.undoMesh = undefined;
    this.personalStamp = undefined;
    this.disposed = true;
    this.clearAssemblyPreview();
    this.composite.dispose();
    const all = new Set([...this.runtimes.values(), ...this.retainedHierarchy]);
    for (const entry of this.historyEntries())
      if (entry.kind === "bake") all.add(entry.runtime);
      else if (entry.kind === "hierarchy") for (const r of entry.removed) all.add(r);
      else if (entry.kind === "cut") {
        all.add(entry.original);
        all.add(entry.negative);
        all.add(entry.positive);
      } else if (entry.kind === "cut-batch")
        for (const cut of entry.entries) {
          all.add(cut.original);
          all.add(cut.negative);
          all.add(cut.positive);
        }
    for (const runtime of all) runtime.dispose();
    this.past = [];
    this.future = [];
    this.runtimes.clear();
    this.retainedHierarchy.clear();
    this.group.clear();
    this.compositeMaterial.dispose();
    this.paintedExport.dispose();
    this.neutral.dispose();
  }
}
