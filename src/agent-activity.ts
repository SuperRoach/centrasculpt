import type { IndependentLayers } from "./independent-layers";
import { ModellingAPI, type ObjectMetadata } from "./modelling-api";

export type AgentChange = {
  id: string;
  name: string;
  status: "created" | "modified" | "deleted" | "unchanged";
};
export type AgentActivity = {
  id: string;
  time: number;
  description: string;
  outcome: "committed" | "failed";
  revision: string;
  objects: AgentChange[];
  error?: string;
};
const actions: Record<string, string> = {
  create_primitive: "Create primitive",
  update_primitive: "Resize primitive",
  transform_object: "Transform object",
  move_object: "Move object",
  rotate_object: "Rotate object",
  scale_object: "Scale object",
  scale_primitive: "Resize primitive",
  apply_changes: "Apply modelling batch",
  apply_approved_proposal: "Apply approved plan",
  create_enclosure: "Create enclosure",
  update_enclosure: "Update enclosure",
  create_connector: "Create connector",
  undo: "Undo",
};
const commandActions = new Set([
  "group_create",
  "object_parent",
  "object_flag",
  "object_duplicate",
  "object_delete",
  "object_rename",
  "boolean_create",
  "boolean_update",
  "boolean_remove",
  "array_create",
  "array_update",
  "array_remove",
  "part_define",
  "part_remove",
  "part_assign",
  "part_clearance",
  "part_mate",
  "primitive_bake",
  "boolean_bake",
  "array_bake",
  "primitive_create",
  "primitive_update",
  "object_transform",
]);
export function agentTransaction(name: string, args: Record<string, unknown>): boolean {
  return args.dryRun !== true && (Object.hasOwn(actions, name) || commandActions.has(name));
}
export function agentObjects(editor: IndependentLayers): ObjectMetadata[] {
  const api = new ModellingAPI(editor);
  return [...editor.project.layerStack.layers, ...editor.project.layerStack.hierarchy.groups].map(
    (node) => api.objectMetadata(node.id),
  );
}
export function describeAgentResult(
  name: string,
  title: string | undefined,
  before: ObjectMetadata[],
  after: ObjectMetadata[],
  revision: string,
  result: unknown,
): AgentActivity {
  const r = result as { ok?: boolean; error?: { code?: string; message?: string } };
  const previous = new Map(before.map((o) => [o.id, o]));
  const next = new Map(after.map((o) => [o.id, o]));
  const objects: AgentChange[] = [];
  if (r?.ok) {
    for (const o of after) {
      if (!previous.has(o.id)) objects.push({ id: o.id, name: o.name, status: "created" });
      else if (JSON.stringify(previous.get(o.id)) !== JSON.stringify(o))
        objects.push({ id: o.id, name: o.name, status: "modified" });
    }
    for (const o of before)
      if (!next.has(o.id)) objects.push({ id: o.id, name: o.name, status: "deleted" });
  }
  return {
    id: crypto.randomUUID(),
    time: Date.now(),
    description: (title || actions[name] || name.replaceAll("_", " ")).slice(0, 160),
    outcome: r?.ok ? "committed" : "failed",
    revision: revision.slice(0, 128),
    objects: objects
      .slice(0, 128)
      .map((o) => ({ ...o, id: o.id.slice(0, 128), name: o.name.slice(0, 128) })),
    ...(r?.ok
      ? {}
      : {
          error:
            `${r?.error?.code ?? "operation_failed"}: ${r?.error?.message ?? "Operation failed"}`.slice(
              0,
              400,
            ),
        }),
  };
}
/** Bounded, detached session state; neither project data nor a claim about Undo availability. */
export class AgentActivityHistory {
  private entries: AgentActivity[] = [];
  private owner: IndependentLayers | undefined;
  constructor(readonly notify: () => void = () => {}) {}
  sync(editor: IndependentLayers): boolean {
    if (this.owner === editor) return false;
    this.owner = editor;
    this.clear();
    return true;
  }
  clear(): void {
    this.entries = [];
    this.notify();
  }
  add(entry: AgentActivity): void {
    this.entries.unshift(structuredClone(entry));
    this.entries.length = Math.min(this.entries.length, 20);
    this.notify();
  }
  snapshot(): AgentActivity[] {
    return structuredClone(this.entries);
  }
}
