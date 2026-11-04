import type { LayerOperation, SdfLayer } from "./layers";
import { uniformScale } from "./transform";

/** A target's own field is the left operand; modifiers fold left in saved order.
 * Referenced layers retain their independent fields and hierarchy/world transforms. */
export type BooleanModifier = {
  id: string;
  sourceId: string;
  operation: LayerOperation;
  enabled: boolean;
};
export function validateModifiers(value: unknown): BooleanModifier[] {
  if (!Array.isArray(value) || value.length > 32)
    throw new Error("Invalid Boolean modifier stack (maximum 32).");
  const ids = new Set<string>();
  return value.map((v: unknown) => {
    if (!v || typeof v !== "object") throw new Error("Invalid Boolean modifier.");
    const m = v as Record<string, unknown>;
    for (const key of ["id", "sourceId"])
      if (
        typeof m[key] !== "string" ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(m[key] as string)
      )
        throw new Error("Invalid Boolean reference ID.");
    if (ids.has(m.id as string)) throw new Error("Duplicate Boolean modifier ID.");
    ids.add(m.id as string);
    if (
      !["union", "difference", "intersect"].includes(String(m.operation)) ||
      typeof m.enabled !== "boolean"
    )
      throw new Error("Invalid Boolean operation or enabled flag.");
    return {
      id: m.id as string,
      sourceId: m.sourceId as string,
      operation: m.operation as LayerOperation,
      enabled: m.enabled,
    };
  });
}
/** Validate disabled edges too: enabling a saved modifier can never introduce a cycle. */
export function validateBooleanGraph(layers: readonly SdfLayer[]): void {
  const byId = new Map(layers.map((l) => [l.id, l])),
    ids = new Set<string>();
  for (const l of layers)
    for (const m of validateModifiers(l.booleanModifiers ?? [])) {
      if (ids.has(m.id)) throw new Error("Duplicate Boolean modifier ID.");
      ids.add(m.id);
      uniformScale(l.transform);
      const source = byId.get(m.sourceId);
      if (source) uniformScale(source.transform);
      if (!byId.has(m.sourceId)) throw new Error("Boolean source does not exist.");
    }
  let visits = 0;
  const visit = (id: string, path: Set<string>) => {
    if (++visits > 256) throw new Error("Boolean graph exceeds evaluation budget.");
    if (path.has(id)) throw new Error("Boolean references must be acyclic.");
    if (path.size >= 8) throw new Error("Boolean graph exceeds depth 8.");
    const next = new Set(path).add(id);
    for (const m of byId.get(id)?.booleanModifiers ?? []) visit(m.sourceId, next);
  };
  for (const l of layers) visit(l.id, new Set());
}
/** Active operands are consumed by their result, regardless of their row eye state.
 * The eye controls independent output; disabling/removing a modifier releases its source. */
export function booleanRoots(layers: readonly SdfLayer[]): SdfLayer[] {
  const consumed = new Set(
    layers.flatMap((l) =>
      (l.booleanModifiers ?? []).filter((m) => m.enabled).map((m) => m.sourceId),
    ),
  );
  return layers.filter((l) => l.visible && !consumed.has(l.id));
}
