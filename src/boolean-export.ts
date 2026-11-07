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

/** Independent export cache: analytic primitives need no sampling from their dense caches. */
export async function prepareBooleanExport(
  layers: IndependentLayers,
  project: SculptProject,
  signal?: AbortSignal,
  stl = true,
  progress?: (p: ExportProgress) => void,
  memoryLimit = EXPORT_MEMORY_LIMIT,
) {
  if (!Number.isFinite(memoryLimit) || memoryLimit <= 0 || memoryLimit > EXPORT_MEMORY_MAX)
    throw new Error("Invalid export memory budget; maximum is 512 MiB.");
  const revision = layers.sourceRevision,
    current = () => layers.recoveryReady && layers.sourceRevision === revision,
    work = new ExportWork(signal, current, progress),
    material = new MeshBasicMaterial(),
    composite = new BooleanComposite(project, material, 192, material, current, {
      analyticPrimitives: true,
      stagedEvaluation: true,
      samplingProgress: (completed, total, stage, stages) => {
        work.check();
        work.progress({
          stage: `Evaluating Boolean · stage ${stage}/${stages} · 192³ maximum`,
          completed,
          total,
        });
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
    let sources = composite.exportSources(),
      ownedBytes = 0;
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
