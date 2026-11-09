import { MeshBasicMaterial } from "three";
import { BooleanComposite } from "./compositor";
import type { ExportProgress } from "./export-mesh";
import {
  compactPlanarSources,
  EXPORT_MEMORY_LIMIT,
  EXPORT_MEMORY_MAX,
  ExportWork,
} from "./export-mesh";
import type { IndependentLayers } from "./independent-layers";
import type { SculptProject } from "./layers";

export type ExportResolution = 192 | 256;
export function exportResolution(value: number): ExportResolution {
  if (value !== 192 && value !== 256) throw new Error("Choose export resolution 192³ or 256³.");
  return value;
}
/** Visible printable Booleans must evaluate cutters, not concatenate their shells.
 * GLB visible/current-layer exports retain their existing separate-layer semantics. */
export function exportNeedsEvaluation(
  project: SculptProject,
  scope: "visible" | "selected" | "composite",
  stl: boolean,
): boolean {
  return (
    scope === "composite" ||
    project.layerStack.layers.some(
      (layer) => layer.booleanModifiers?.length || layer.array?.enabled,
    ) ||
    (stl &&
      scope === "visible" &&
      project.layerStack.compositionLayers.some(
        (layer) => layer.visible && layer.operation !== "union",
      ))
  );
}
/** Independent export cache: analytic primitives need no sampling from their dense caches. */
export async function prepareBooleanExport(
  layers: IndependentLayers,
  project: SculptProject,
  signal?: AbortSignal,
  stl = true,
  progress?: (p: ExportProgress) => void,
  memoryLimit = EXPORT_MEMORY_LIMIT,
  resolution: ExportResolution = 192,
  // Pass false to retain the original chunk pipeline for diagnosis/rollback.
  optimisedChunks = true,
) {
  if (!Number.isFinite(memoryLimit) || memoryLimit <= 0 || memoryLimit > EXPORT_MEMORY_MAX)
    throw new Error("Invalid export memory budget; maximum is 512 MiB.");
  exportResolution(resolution);
  const revision = layers.sourceRevision,
    current = () => layers.recoveryReady && layers.sourceRevision === revision,
    work = new ExportWork(signal, current, progress),
    material = new MeshBasicMaterial(),
    composite = new BooleanComposite(project, material, resolution, material, current, {
      analyticPrimitives: true,
      stagedEvaluation: true,
      samplingProgress: (completed, total, stage, stages) => {
        work.check();
        work.progress({
          stage: `Evaluating Boolean · stage ${stage}/${stages} · ${resolution}³ maximum`,
          completed,
          total,
        });
      },
      meshingProgress: (completed, total) => {
        work.check();
        work.progress({ stage: "Meshing evaluated SDF", completed, total });
      },
      colours: !stl,
    });
  composite.availableBytes = () =>
    memoryLimit - layers.trackedBytes - layers.composite.trackedBytes;
  composite.paintBase = (layer) => layers.runtime(layer.id).paintSurface.base;
  const cancel = () => composite.dispose();
  signal?.addEventListener("abort", cancel, { once: true });
  const dispose = () => {
    signal?.removeEventListener("abort", cancel);
    composite.dispose();
    material.dispose();
  };
  try {
    work.check();
    await composite.flush();
    work.check();
    const evaluation = { ...composite.stats! },
      derivedBytes = composite.trackedBytes;
    const compactionStart = performance.now();
    const evaluatedResolution = composite.stats!.resolution;
    let sources = composite.exportSources(),
      ownedBytes = 0;
    const extractionMs = performance.now() - compactionStart,
      precompactionStart = performance.now();
    let removedTriangles = 0,
      maxPlanarDeviation = 0;
    if (stl) {
      const corners = sources.reduce(
        (n, s) => n + s.chunks.reduce((n, c) => n + c.positions.length / 3, 0),
        0,
      );
      const buffers = sources.reduce(
        (n, s) =>
          n + s.chunks.reduce((n, c) => n + c.positions.byteLength + c.normals.byteLength, 0),
        0,
      );
      // New rounded prisms already fitting the strictest final admission can skip
      // redundant chunk-local compaction. Final quality optimisation/topology still run.
      const direct =
        project.layerStack.layers.some(
          (l) => l.primitive?.kind === "box" && l.primitive.cornerRadius !== undefined,
        ) &&
        corners / 3 <= 300000 &&
        corners * 480 +
          buffers +
          layers.trackedBytes +
          layers.composite.trackedBytes +
          sources.length * 4096 <
          memoryLimit;
      const compact = direct
        ? { sources, removedTriangles: 0, maxPlanarDeviation: 0 }
        : await compactPlanarSources(
            sources,
            memoryLimit -
              layers.trackedBytes -
              layers.composite.trackedBytes -
              composite.trackedBytes,
            work,
            optimisedChunks,
          );
      sources = compact.sources.map((source) => ({ ...source, current }));
      removedTriangles = compact.removedTriangles;
      maxPlanarDeviation = compact.maxPlanarDeviation;
      ownedBytes = sources.reduce(
        (sum, source) =>
          sum +
          source.chunks.reduce(
            (bytes, chunk) => bytes + chunk.positions.byteLength + chunk.normals.byteLength,
            0,
          ),
        0,
      );
      composite.dispose();
    }
    return {
      sources,
      profile: {
        evaluation,
        derivedBytes,
        extractionMs,
        precompactionMs: performance.now() - precompactionStart,
        compactionMs: performance.now() - compactionStart,
      },
      resolution: evaluatedResolution,
      dispose,
      removedTriangles,
      maxPlanarDeviation,
      availableBytes: () =>
        Math.max(
          1,
          memoryLimit -
            layers.trackedBytes -
            layers.composite.trackedBytes -
            composite.trackedBytes -
            ownedBytes,
        ),
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
