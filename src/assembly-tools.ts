import { Box3, Euler, Group, type Material, Quaternion, Vector3 } from "three";
import { inspectFit, layerSources, partMembers, partSources } from "./assembly";
import { prepareBooleanExport } from "./boolean-export";
import { BooleanComposite, compositeLayout } from "./compositor";
import { type ExportQuality, ExportWork } from "./export-mesh";
import type { IndependentLayers } from "./independent-layers";
import { LayerStack, newId, SculptProject } from "./layers";
import { booleanRoots } from "./live-boolean";
import { primitiveDimensions, validatePrimitive } from "./parametric-primitive";
import { MAX_PROJECT_LAYERS } from "./project";
import { encodeSTL } from "./stl-export";
import { copyTransform, identityTransform, transformMatrix, type Vec3 } from "./transform";
export type MateOptions = {
  moving: string;
  target: string;
  mode: "centres" | "faces" | "axes";
  axis: "x" | "y" | "z";
  offsetMM: number;
  matchNormal?: boolean;
  movingNormal?: Vec3;
  targetNormal?: Vec3;
};
export type ConnectorOptions = {
  pegPart: string;
  socketPart: string;
  pegDiameterMM: number;
  pegLengthMM: number;
  socketDiameterMM: number;
  socketDepthMM: number;
  radialClearanceMM: number;
  positionMM: Vec3;
  socketPositionMM?: Vec3;
  rotationRadians: Vec3;
};
function finite(v: number, positive = false): void {
  if (!Number.isFinite(v) || Math.abs(v) > 100000 || (positive && v <= 0))
    throw new Error("Invalid physical dimension.");
}
export function partBounds(layers: IndependentLayers, id: string, plain = false): Box3 {
  const sources = plain
    ? layerSources(layers.project.layerStack, id)
    : partSources(layers.project.layerStack, id);
  const box = new Box3();
  const additive = new Set<string>();
  const visit = (id: string) => {
    if (additive.has(id)) return;
    additive.add(id);
    for (const m of sources.find((s) => s.id === id)?.booleanModifiers ?? [])
      if (m.enabled && m.operation === "union") visit(m.sourceId);
  };
  booleanRoots(sources).forEach((l, i) => {
    if (i === 0 || l.operation === "union") visit(l.id);
  });
  for (const layer of sources) {
    if (!additive.has(layer.id)) continue;
    if (layer.array?.enabled) {
      const layout = compositeLayout(sources),
        c = new Vector3(...layout.center),
        e = new Vector3().setScalar(layout.extent);
      return new Box3(c.clone().sub(e), c.clone().add(e));
    }
    if (layer.primitive) {
      const d = primitiveDimensions(layer.primitive),
        half = new Vector3(...d).multiplyScalar(0.5);
      box.union(
        new Box3(half.clone().negate(), half).applyMatrix4(transformMatrix(layer.transform)),
      );
    } else {
      const b = layer.volume.worldBounds(layer.transform);
      box.union(new Box3(new Vector3(...b.min), new Vector3(...b.max)));
    }
  }
  if (box.isEmpty()) throw new Error("Part has no visible geometry.");
  return box;
}
export function mateParts(layers: IndependentLayers, o: MateOptions): void {
  if (o.moving === o.target) throw new Error("Choose different parts.");
  finite(o.offsetMM);
  if (!["centres", "faces", "axes"].includes(o.mode) || !["x", "y", "z"].includes(o.axis))
    throw new Error("Invalid mate mode or axis.");
  const stack = layers.project.layerStack,
    moving = stack.get(o.moving),
    target = stack.get(o.target);
  partMembers(stack, o.moving);
  partMembers(stack, o.target);
  moving.assertEditable();
  const pose = copyTransform(moving.transform),
    axis = "xyz".indexOf(o.axis);
  const a = partBounds(layers, o.moving),
    b = partBounds(layers, o.target);
  const ca = a.getCenter(new Vector3()),
    cb = b.getCenter(new Vector3());
  if (o.mode === "centres")
    pose.position = pose.position.map(
      (v, i) => v + cb.getComponent(i) - ca.getComponent(i),
    ) as Vec3;
  else if (o.mode === "faces")
    pose.position[axis] += b.max.getComponent(axis) - a.min.getComponent(axis);
  if (o.mode === "axes" || o.matchNormal) {
    const q = new Quaternion().setFromEuler(new Euler(...pose.rotation));
    const tq = new Quaternion().setFromEuler(new Euler(...target.transform.rotation));
    const local = new Vector3().setComponent(axis, 1),
      from = local.clone().applyQuaternion(q),
      to = local.clone().applyQuaternion(tq);
    if (o.movingNormal || o.targetNormal) {
      if (
        !o.movingNormal ||
        !o.targetNormal ||
        o.movingNormal.length !== 3 ||
        o.targetNormal.length !== 3 ||
        ![...o.movingNormal, ...o.targetNormal].every(Number.isFinite)
      )
        throw new Error("Provide two finite model-world surface normals.");
      from.fromArray(o.movingNormal);
      to.fromArray(o.targetNormal);
      if (from.lengthSq() < 1e-12 || to.lengthSq() < 1e-12)
        throw new Error("Surface normals cannot be zero.");
      from.normalize();
      to.normalize();
    }
    if (o.matchNormal) to.negate();
    q.premultiply(new Quaternion().setFromUnitVectors(from, to));
    const e = new Euler().setFromQuaternion(q);
    pose.rotation = [e.x, e.y, e.z];
  }
  pose.position[axis] += o.offsetMM / layers.display.precision.millimetresPerUnit;
  layers.select(o.moving);
  layers.setActiveTransform(pose);
}
export function validateConnectorSizes(
  o: Pick<
    ConnectorOptions,
    "pegDiameterMM" | "pegLengthMM" | "socketDiameterMM" | "socketDepthMM" | "radialClearanceMM"
  >,
  mm: number,
): void {
  for (const v of [o.pegDiameterMM, o.pegLengthMM, o.socketDiameterMM, o.socketDepthMM])
    finite(v, true);
  finite(o.radialClearanceMM);
  if (o.radialClearanceMM < 0) throw new Error("Radial clearance cannot be negative.");
  if (o.socketDiameterMM < o.pegDiameterMM + 2 * o.radialClearanceMM - 1e-8)
    throw new Error("Socket diameter must include twice the radial clearance.");
  if (o.socketDepthMM < o.pegLengthMM)
    throw new Error("Socket depth must accommodate the peg length.");
  validatePrimitive({
    kind: "cylinder",
    diameter: o.pegDiameterMM / mm,
    height: o.pegLengthMM / mm,
  });
  validatePrimitive({
    kind: "cylinder",
    diameter: o.socketDiameterMM / mm,
    height: o.socketDepthMM / mm,
  });
}
/** Connector source edits, transforms and arrays continue through existing primitive/CSG tools. */
export async function generateConnector(
  layers: IndependentLayers,
  o: ConnectorOptions,
  signal?: AbortSignal,
): Promise<string> {
  const stack = layers.project.layerStack;
  if (o.pegPart === o.socketPart) throw new Error("Connector needs two independent parts.");
  stack.get(o.pegPart);
  stack.get(o.socketPart);
  if (
    stack.hierarchy.descendants(o.pegPart).includes(o.socketPart) ||
    stack.hierarchy.descendants(o.socketPart).includes(o.pegPart)
  )
    throw new Error("Choose independent layers for the connector.");
  stack.get(o.pegPart).assertEditable();
  stack.get(o.socketPart).assertEditable();
  validateConnectorSizes(o, layers.display.precision.millimetresPerUnit);
  if (o.positionMM.length !== 3 || o.rotationRadians.length !== 3)
    throw new Error("Position and rotation need three values.");
  if (o.socketPositionMM && o.socketPositionMM.length !== 3)
    throw new Error("Socket position needs three values.");
  [...o.positionMM, ...o.rotationRadians, ...(o.socketPositionMM ?? [])].forEach((v) => {
    finite(v);
  });
  if (stack.layers.length + 2 > MAX_PROJECT_LAYERS)
    throw new Error(
      `Connector needs room for two editable sources (${MAX_PROJECT_LAYERS}-layer limit).`,
    );
  const mm = layers.display.precision.millimetresPerUnit;
  const placement = identityTransform();
  placement.position = o.positionMM.map((v) => v / mm) as Vec3;
  placement.rotation = [...o.rotationRadians];
  const socketPlacement = copyTransform(placement);
  socketPlacement.position = (o.socketPositionMM ?? o.positionMM).map((v) => v / mm) as Vec3;
  // Roll back every completed backend edit if generation is cancelled or fails.
  const checkpoint = layers.assemblyCheckpoint();
  try {
    for (const id of [o.pegPart, o.socketPart])
      if (!stack.get(id).assemblyPart)
        layers.setAssemblyPart(id, { clearanceMM: o.radialClearanceMM });
    const peg = await layers.regeneratePrimitive(
      { kind: "cylinder", diameter: o.pegDiameterMM / mm, height: o.pegLengthMM / mm },
      undefined,
      signal,
      placement,
    );
    layers.reparent(peg.id, o.pegPart);
    layers.renameNode(peg.id, "Assembly peg");
    const socket = await layers.regeneratePrimitive(
      { kind: "cylinder", diameter: o.socketDiameterMM / mm, height: o.socketDepthMM / mm },
      undefined,
      signal,
      socketPlacement,
    );
    layers.reparent(socket.id, o.socketPart);
    layers.renameNode(socket.id, "Assembly socket cutter");
    if (signal?.aborted) throw new Error("Connector cancelled.");
    for (const [target, source, operation] of [
      [o.pegPart, peg.id, "union"],
      [o.socketPart, socket.id, "difference"],
    ] as const) {
      layers.setBooleanModifiers(target, [
        ...(stack.get(target).booleanModifiers ?? []),
        { id: newId(), sourceId: source, operation, enabled: true },
      ]);
    }
    layers.finishAssemblyTransaction(checkpoint);
    layers.select(peg.id);
    return peg.id;
  } catch (e) {
    layers.rollbackAssemblyTransaction(checkpoint);
    throw e;
  }
}
export async function inspectAssembly(
  layers: IndependentLayers,
  a: string,
  b: string,
  signal?: AbortSignal,
) {
  const revision = layers.modellingRevision;
  if (!layers.recoveryReady) throw new Error("Finish the current edit first.");
  return inspectFit(
    layers.project.layerStack,
    a,
    b,
    layers.display.precision.millimetresPerUnit,
    new ExportWork(signal, () => layers.recoveryReady && layers.modellingRevision === revision),
  );
}
export async function inspectLayers(
  layers: IndependentLayers,
  a: string,
  b: string,
  clearanceMM: number,
  signal?: AbortSignal,
) {
  const revision = layers.modellingRevision;
  if (!layers.recoveryReady) throw new Error("Finish the current edit first.");
  return inspectFit(
    layers.project.layerStack,
    a,
    b,
    layers.display.precision.millimetresPerUnit,
    new ExportWork(signal, () => layers.recoveryReady && layers.modellingRevision === revision),
    { layers: true, clearanceMM },
  );
}
/** Export borrows source fields; evict only rebuildable presentation caches. Nested leases are safe. */
export async function withExportMemory<T>(
  layers: IndependentLayers,
  action: () => Promise<T>,
  warning?: (message: string) => void,
): Promise<T> {
  const restore = layers.assemblyPreviewActive,
    wanted = layers.display.assemblyPreview,
    revision = layers.sourceRevision;
  layers.interruptBackground();
  layers.clearAssemblyPreview();
  layers.display.assemblyPreview = wanted;
  const release = await layers.composite.releaseForExport();
  try {
    new ExportWork(
      undefined,
      () => layers.recoveryReady && layers.sourceRevision === revision,
    ).check();
    return await action();
  } finally {
    release();
    if (restore && layers.recoveryReady && layers.sourceRevision === revision) {
      try {
        await previewAssembly(layers);
      } catch (error) {
        warning?.(
          `Assembly preview unavailable: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
/** One bounded temporary evaluated union per part, disposed even on cancellation. */
export async function exportPartSTL(
  layers: IndependentLayers,
  id: string,
  signal?: AbortSignal,
  quality: ExportQuality = "fast",
) {
  let previewWarning = "";
  const result = await withExportMemory(
    layers,
    () => encodePartSTL(layers, id, signal, quality),
    (message) => {
      previewWarning = message;
    },
  );
  return { ...result, ...(previewWarning ? { previewWarning } : {}) };
}
async function encodePartSTL(
  layers: IndependentLayers,
  id: string,
  signal: AbortSignal | undefined,
  quality: ExportQuality,
) {
  if (!layers.recoveryReady) throw new Error("Finish the current edit first.");
  const revision = layers.sourceRevision,
    current = () => layers.recoveryReady && layers.sourceRevision === revision;
  const sources = partSources(layers.project.layerStack, id);
  const project = new SculptProject(new LayerStack(sources), layers.project.settings);
  const prepared = await prepareBooleanExport(layers, project, signal);
  try {
    const exported = prepared.sources;
    const work = new ExportWork(signal, current);
    const box = new Box3(),
      point = new Vector3();
    for (const s of exported)
      for (const c of s.chunks)
        for (let i = 0; i < c.positions.length; i += 3) {
          if (i % 12288 === 0)
            await work.pause("Measuring physical part dimensions", i, c.positions.length);
          box.expandByPoint(
            point.fromArray(c.positions, i).applyMatrix4(transformMatrix(s.transform)),
          );
        }
    const size = box.getSize(point);
    const targetMM = Math.max(size.x, size.y, size.z) * layers.display.precision.millimetresPerUnit;
    const result = await encodeSTL(
      exported,
      quality,
      prepared.availableBytes(),
      targetMM,
      new ExportWork(signal, current),
    );
    result.report.effectiveResolutionMM =
      Math.max(...exported.map((source) => source.step)) *
      layers.display.precision.millimetresPerUnit;
    const intent = layers.project.layerStack.get(id).assemblyPart?.enclosure;
    if (intent) {
      const r = result.report;
      if (
        r.boundaryEdges ||
        r.nonManifoldEdges ||
        r.inconsistentEdges ||
        r.degenerateTriangles ||
        r.components !== 1 ||
        r.invertedComponents
      )
        throw new Error(
          `Enclosure export requires one closed, consistently wound manifold shell. Sampled mesh: ${r.boundaryEdges} boundary, ${r.nonManifoldEdges} non-manifold, ${r.inconsistentEdges} winding, ${r.degenerateTriangles} degenerate; ${r.components} components. Adjust dimensions/resolution or export quality and retry.`,
        );
      r.warnings.push(
        "Enclosure fit and minimum wall thickness are not certified. Inspect in your slicer and print a clearance coupon.",
      );
      if (intent.parameters.lid.clearanceMm < (r.effectiveResolutionMM ?? Infinity))
        r.warnings.push(
          "Lid clearance is below exported sampling spacing; mating-surface fit is approximate.",
        );
    }
    if (result.stats[0]) {
      result.stats[0].inputTriangles += prepared.removedTriangles;
      result.stats[0].planarRemoved += prepared.removedTriangles;
      result.stats[0].maxPlanarDeviation = Math.max(
        result.stats[0].maxPlanarDeviation,
        prepared.maxPlanarDeviation,
      );
    }
    return { ...result, name: layers.project.layerStack.get(id).name };
  } finally {
    prepared.dispose();
  }
}

/** Restore only the saved view intent; derived meshes are rebuilt from editable sources. */
export async function restoreAssemblyPreview(layers: IndependentLayers, signal?: AbortSignal) {
  if (layers.display.assemblyPreview) return previewAssembly(layers, signal);
}
/** Evaluated part meshes stay independent. No assembly-wide union or per-frame rebuild. */
export async function previewAssembly(
  layers: IndependentLayers,
  signal?: AbortSignal,
): Promise<{ capped: boolean; effectiveResolutionMM: number }> {
  if (!layers.recoveryReady) throw new Error("Finish the current edit first.");
  layers.clearAssemblyPreview();
  const revision = layers.sourceRevision,
    current = () => layers.recoveryReady && layers.sourceRevision === revision && !signal?.aborted;
  const group = new Group(),
    built: BooleanComposite[] = [],
    materials: Material[] = [];
  group.name = "Assembly Preview";
  let capped = false,
    effectiveResolutionMM = 0;
  const bytes = () => built.reduce((sum, c) => sum + c.trackedBytes, 0);
  const dispose = () => {
    for (const c of built) c.dispose();
    for (const m of materials) m.dispose();
    group.removeFromParent();
  };
  signal?.addEventListener("abort", dispose, { once: true });
  try {
    const parts = layers.project.layerStack.layers.filter((l) => l.assemblyPart && l.visible);
    if (!parts.length) throw new Error("Show at least one printable part.");
    for (const part of parts) {
      new ExportWork(signal, current).check();
      const sources = partSources(layers.project.layerStack, part.id),
        material = layers.runtime(part.id).material.clone();
      materials.push(material);
      const project = new SculptProject(new LayerStack(sources), layers.project.settings);
      const c = new BooleanComposite(project, material, 128, material, current);
      c.availableBytes = () =>
        256 * 1024 ** 2 -
        layers.trackedBytes -
        layers.composite.trackedBytes -
        (bytes() - c.trackedBytes);
      built.push(c);
      await c.flush();
      new ExportWork(signal, current).check();
      capped ||= c.stats?.capped ?? false;
      effectiveResolutionMM = Math.max(
        effectiveResolutionMM,
        (c.stats?.step ?? 0) * layers.display.precision.millimetresPerUnit,
      );
      group.add(c.group);
    }
    layers.installAssemblyPreview({ group, current, dispose, bytes });
    return { capped, effectiveResolutionMM };
  } catch (e) {
    dispose();
    throw e;
  } finally {
    signal?.removeEventListener("abort", dispose);
  }
}
