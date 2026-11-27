import { LayerStack, SculptProject, SdfLayer } from "./layers";
import type { ProjectSnapshot } from "./project-snapshot";
import { sculptMask } from "./sculpt-mask";
import { sculptPaint } from "./sculpt-paint";
import { SDFVolume } from "./sdf";
import { MAX_SDF_PAGES, SparseSDFVolume } from "./sparse-sdf";
/** Structured-clone boundary after native validation in a worker. */
export function projectTransfer(p: SculptProject): ProjectSnapshot {
  return {
    id: p.id,
    name: p.name,
    activeLayerId: p.activeLayerId,
    settings: p.settings,
    displayPreferences: p.displayPreferences,
    toolPreferences: p.toolPreferences,
    hierarchy: p.layerStack.hierarchy.enabled ? p.layerStack.hierarchy.snapshot() : undefined,
    layers: p.layerStack.layers.map((l) => ({
      metadata: l.metadata(),
      resolution: l.volume.resolution,
      extent: l.volume.extent,
      dimensions: l.volume.dimensions,
      latticeMin: l.volume.latticeMin ?? [0, 0, 0],
      values: l.volume.getDenseView(),
      sparse:
        l.volume instanceof SparseSDFVolume
          ? { defaultValue: l.volume.defaultValue, pages: new Map(l.volume.residentPages()) }
          : undefined,
      mask: sculptMask(l.volume).snapshot(),
      paint: sculptPaint(l.volume).snapshot(),
    })),
  };
}
export function hydrateProject(s: ProjectSnapshot, newSparse = false): SculptProject {
  if (newSparse && s.layers.length !== 1)
    throw new Error("A new sparse project requires a single empty layer.");
  const layers = s.layers.map((l) => {
    let first = true;
    if (
      newSparse &&
      (!l.latticeMin.every((value) => value === 0) ||
        !l.dimensions.every((value) => value === l.resolution) ||
        !l.values?.every((value) => value === Math.fround(l.extent * 4)))
    )
      throw new Error("A new sparse project requires an empty, unexpanded lattice.");
    const v = newSparse
      ? new SparseSDFVolume(l.resolution, l.extent)
      : l.sparse
        ? new SparseSDFVolume(
            l.resolution,
            l.extent,
            MAX_SDF_PAGES,
            { dimensions: l.dimensions, latticeMin: l.latticeMin },
            l.sparse,
          )
        : new SDFVolume(
            l.resolution,
            l.extent,
            false,
            { dimensions: l.dimensions, latticeMin: l.latticeMin },
            (n) => {
              if (first) {
                first = false;
                if (!l.values) throw new Error("Missing snapshot voxel values.");
                return l.values;
              }
              return new Float32Array(n);
            },
          );
    if (l.mask) sculptMask(v).restore(l.mask);
    if (l.paint) sculptPaint(v).restore(l.paint);
    return new SdfLayer(v, l.metadata);
  });
  const p = new SculptProject(new LayerStack(layers, s.activeLayerId), s.settings, s.name, s.id);
  if (s.hierarchy) p.layerStack.hierarchy.restore(s.hierarchy);
  p.displayPreferences = s.displayPreferences;
  p.toolPreferences = s.toolPreferences;
  return p;
}

/** Transfer only owned voxel buffers. Recovery captures independent copies first. */
export function projectFieldBuffers(snapshot: ProjectSnapshot): ArrayBuffer[] {
  return snapshot.layers.flatMap(({ values, sparse }) =>
    values
      ? [values.buffer as ArrayBuffer]
      : [...(sparse?.pages.values() ?? [])].map((page) => page.buffer as ArrayBuffer),
  );
}
