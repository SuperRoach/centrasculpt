import type { SculptProject } from "./layers";
import { openSculptProject } from "./project-decoder";
import { saveSculptProject } from "./project-encoder";
import { projectTransfer } from "./project-transfer";

function equalEditableData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a instanceof Float32Array || a instanceof Uint8Array)
    return (
      (b instanceof Float32Array || b instanceof Uint8Array) &&
      a.constructor === b.constructor &&
      a.length === b.length &&
      a.every((value, i) => Object.is(value, b[i]))
    );
  if (a instanceof Map)
    return (
      b instanceof Map &&
      a.size === b.size &&
      [...a].every(([key, value]) => b.has(key) && equalEditableData(value, b.get(key)))
    );
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  const left = Object.entries(a);
  const right = b as Record<string, unknown>;
  return (
    left.length === Object.keys(right).length &&
    left.every(([key, value]) => Object.hasOwn(right, key) && equalEditableData(value, right[key]))
  );
}

/** Convert a validated, materialised legacy project and compare all editable state before publication. */
export function verifyCanonicalProject(project: SculptProject): ArrayBuffer {
  const data = saveSculptProject(project);
  const reopened = openSculptProject(data);
  if (!equalEditableData(projectTransfer(project), projectTransfer(reopened)))
    throw new Error("Converted project differs from the original editable project.");
  return data;
}
