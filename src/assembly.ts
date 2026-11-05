import { compositeLayout, prepareComposite } from "./compositor";
import { ExportWork } from "./export-mesh";
import { type LayerStack, SdfLayer } from "./layers";
import { validateBooleanGraph } from "./live-boolean";
import type { Vec3 } from "./transform";

/** A printable part is a marked layer and its hierarchy descendants. No second graph. */
export function partOwner(stack: LayerStack, id: string): string | null {
  const h = stack.hierarchy;
  let current: string | null = id;
  for (let depth = 0; current && depth <= 9; depth++) {
    if (stack.layers.find((l) => l.id === current)?.assemblyPart) return current;
    current = h.parent(current);
  }
  return null;
}
export function validateAssembly(stack: LayerStack): void {
  for (const l of stack.layers) {
    l.metadata();
    const parent = stack.hierarchy.parent(l.id);
    if (l.assemblyPart && parent && partOwner(stack, parent))
      throw new Error("Printable parts cannot be nested. Detach the part first.");
    for (const m of l.booleanModifiers ?? []) {
      const a = partOwner(stack, l.id),
        b = partOwner(stack, m.sourceId);
      if (b && b !== a) throw new Error("Boolean operands cannot cross printable part boundaries.");
    }
  }
}
export function partMembers(stack: LayerStack, id: string): string[] {
  if (!stack.get(id).assemblyPart) throw new Error("Select a printable part.");
  return stack.layers.filter((l) => partOwner(stack, l.id) === id).map((l) => l.id);
}
/** Borrow immutable authoritative fields; flatten parent poses and include private CSG dependencies. */
export function partSources(stack: LayerStack, id: string): SdfLayer[] {
  return sourcesForMembers(stack, partMembers(stack, id));
}
/** Read-only object inspection also works before printable parts are defined. */
export function layerSources(stack: LayerStack, id: string): SdfLayer[] {
  stack.get(id);
  return sourcesForMembers(
    stack,
    [id, ...stack.hierarchy.descendants(id)].filter((id) => stack.layers.some((l) => l.id === id)),
  );
}
function sourcesForMembers(stack: LayerStack, ids: string[]): SdfLayer[] {
  validateAssembly(stack);
  validateBooleanGraph(stack.layers);
  const members = new Set(ids),
    needed = new Set(members);
  const visit = (source: string) => {
    for (const m of stack.get(source).booleanModifiers ?? []) {
      if (!needed.has(m.sourceId)) {
        needed.add(m.sourceId);
        visit(m.sourceId);
      }
    }
  };
  for (const member of members) visit(member);
  return stack.compositionLayers
    .filter((l) => needed.has(l.id))
    .map(
      (l) =>
        new SdfLayer(l.volume, {
          ...l.metadata(),
          assemblyPart: undefined,
          transform: l.transform,
          visible: members.has(l.id) && l.visible,
          // Retain saved member ordering and legacy CSG operations inside this boundary.
          operation: l.operation,
        }),
    );
}
export type FitReport = {
  units: "mm";
  approximate: true;
  minimumSeparationMM: number | null;
  sampledOverlap: boolean;
  nominalClearanceMM: number;
  effectiveResolutionMM: number;
  belowResolution: boolean;
  clearanceViolation: boolean | null;
  collisionRegionsMM: Vec3[];
  samples: number;
  warnings: string[];
};
/** Fixed 32³ lattice, projected SDF surface probes, cooperative cancellation. Never per-frame. */
export async function inspectFit(
  stack: LayerStack,
  a: string,
  b: string,
  mm: number,
  work = new ExportWork(),
  options: { layers?: boolean; clearanceMM?: number } = {},
): Promise<FitReport> {
  if (a === b) throw new Error("Choose two different printable parts.");
  if (!(mm > 0 && Number.isFinite(mm))) throw new Error("Invalid physical calibration.");
  if (
    options.layers &&
    (stack.hierarchy.descendants(a).includes(b) || stack.hierarchy.descendants(b).includes(a))
  )
    throw new Error("Choose independent layers, rather than a parent and its child.");
  const sa = options.layers ? layerSources(stack, a) : partSources(stack, a),
    sb = options.layers ? layerSources(stack, b) : partSources(stack, b);
  if (!sa.some((l) => l.visible) || !sb.some((l) => l.visible))
    throw new Error("Show both parts before inspecting fit.");
  const fa = prepareComposite(sa),
    fb = prepareComposite(sb);
  const la = compositeLayout(sa),
    lb = compositeLayout(sb);
  const lo = la.center.map((v, i) => Math.min(v - la.extent, lb.center[i] - lb.extent));
  const hi = la.center.map((v, i) => Math.max(v + la.extent, lb.center[i] + lb.extent));
  const step = Math.max(...hi.map((v, i) => (v - lo[i]) / 31));
  const resolution = Math.max(
    step,
    la.desiredStep,
    lb.desiredStep,
    (2 * la.extent) / (la.resolution - 1),
    (2 * lb.extent) / (lb.resolution - 1),
  );
  const clearance =
    options.clearanceMM ??
    Math.max(
      stack.get(a).assemblyPart?.clearanceMM ?? 0,
      stack.get(b).assemblyPart?.clearanceMM ?? 0,
    );
  if (!Number.isFinite(clearance) || clearance < 0 || clearance > 1000)
    throw new Error("Desired gap must be 0–1000 mm.");
  let gap = Infinity,
    overlap = false,
    samples = 0;
  const regions: Vec3[] = [];
  for (let z = 0; z < 32; z++) {
    await work.pause("Inspecting assembly fit", z, 32);
    for (let y = 0; y < 32; y++) {
      await work.pause("Inspecting assembly fit", z * 32 + y, 1024);
      for (let x = 0; x < 32; x++) {
        const p: Vec3 = [
          lo[0] + ((hi[0] - lo[0]) * x) / 31,
          lo[1] + ((hi[1] - lo[1]) * y) / 31,
          lo[2] + ((hi[2] - lo[2]) * z) / 31,
        ];
        const da = fa(...p),
          db = fb(...p);
        samples++;
        if (da < 0 && db < 0) {
          overlap = true;
          if (regions.length < 32) regions.push(p.map((v) => v * mm) as Vec3);
        }
        for (const [f, g, d] of [
          [fa, fb, da],
          [fb, fa, db],
        ] as const) {
          if (Math.abs(d) > step * 1.8) continue;
          const h = Math.max(resolution * 0.05, 1e-7);
          const gradient = [
            f(p[0] + h, p[1], p[2]) - f(p[0] - h, p[1], p[2]),
            f(p[0], p[1] + h, p[2]) - f(p[0], p[1] - h, p[2]),
            f(p[0], p[1], p[2] + h) - f(p[0], p[1], p[2] - h),
          ];
          const n = Math.hypot(...gradient);
          if (n < 1e-12) continue;
          const q = p.map((v, i) => v - (d * gradient[i]) / n) as Vec3;
          if (Math.abs(f(...q)) > resolution) continue;
          const distance = g(...q);
          gap = Math.min(gap, Math.max(0, distance));
          if (distance < 0) {
            overlap = true;
            if (regions.length < 32) regions.push(q.map((v) => v * mm) as Vec3);
          }
        }
      }
    }
  }
  work.check();
  const minimum = overlap ? 0 : Number.isFinite(gap) ? gap * mm : null;
  return {
    units: "mm",
    approximate: true,
    minimumSeparationMM: minimum,
    sampledOverlap: overlap,
    nominalClearanceMM: clearance,
    effectiveResolutionMM: resolution * mm,
    belowResolution: clearance < resolution * mm,
    clearanceViolation: minimum === null ? null : overlap || minimum < clearance,
    collisionRegionsMM: regions,
    samples,
    warnings: [
      "Approximate sampled check; thin features and collisions can be missed. Physical fit is not guaranteed.",
      ...(clearance < resolution * mm
        ? ["Requested clearance is smaller than effective geometry/inspection resolution."]
        : []),
      ...(minimum === null ? ["No reliable surface probes; separation is unknown."] : []),
    ],
  };
}
