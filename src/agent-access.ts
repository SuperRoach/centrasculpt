import { Euler, Quaternion } from "three";
import type { EnclosureParameters } from "./enclosure-recipe";
import type { IndependentLayers } from "./independent-layers";
import { ModellingAPI, type ModellingCommand, type ModellingStep } from "./modelling-api";
import { type PhysicalUnit, unitMM } from "./physical-units";
import type { Vec3 } from "./transform";

export type AgentJob = {
  id: string;
  deadline: number;
  name: string;
  args: Record<string, unknown>;
};
/** Transport adapter only: all generation, admission, revision checks and history remain authoritative. */
export function agentExecutor(
  editor: IndependentLayers | (() => IndependentLayers),
  canEdit: () => boolean,
  blocked: () => boolean,
  changed: () => void,
) {
  return async (job: AgentJob, signal: AbortSignal): Promise<unknown> => {
    const layers = typeof editor === "function" ? editor() : editor;
    const api = new ModellingAPI(layers, canEdit);
    const error = (code: string, message: string) => ({
      ok: false,
      revision: api.revision,
      error: { code, message },
    });
    if (signal.aborted || Date.now() >= job.deadline)
      return error("cancelled", "Request expired or connection revoked.");
    if (blocked() || layers.modellingBusy || !layers.recoveryReady)
      return error("busy", "Finish the current editor operation first.");
    const a = job.args;
    if (job.name === "scene_summary") return api.query({ type: "scene.summary" });
    if (job.name === "list_objects") return api.query({ type: "object.list" });
    if (job.name === "get_object") return api.query({ type: "object.get", id: a.id as string });
    if (!canEdit()) return error("permission_denied", "Enable editing in Local agent access.");
    const options = { expectedRevision: a.expectedRevision as string, signal };
    if (options.expectedRevision !== api.revision)
      return error("revision_conflict", "Scene changed; inspect again before editing.");
    let result: unknown;
    switch (job.name) {
      case "move_object":
      case "rotate_object":
      case "scale_object": {
        const object = api.query({ type: "object.get", id: a.id as string });
        if (!object.ok) return object;
        const pose = object.value.worldTransform;
        let position = pose.positionMM as Vec3;
        let rotation = pose.rotationRadians as Vec3;
        let scale = pose.scale as Vec3;
        if (job.name === "move_object") {
          const factor = unitMM[a.unit as PhysicalUnit];
          position = (a.translation as Vec3).map(
            (v, i) => v * factor + (a.mode === "set" ? 0 : position[i]),
          ) as Vec3;
        } else if (job.name === "rotate_object") {
          const radians = (a.rotationDegrees as Vec3).map((v) => (v * Math.PI) / 180) as Vec3;
          if (a.mode === "set") rotation = radians;
          else {
            const q = new Quaternion().setFromEuler(new Euler(...radians));
            q.multiply(new Quaternion().setFromEuler(new Euler(...rotation)));
            const e = new Euler().setFromQuaternion(q, "XYZ");
            rotation = [e.x, e.y, e.z];
          }
        } else scale = a.scale as Vec3;
        result = await api.batch(
          [
            {
              command: {
                type: "object.transform",
                id: a.id as string,
                unit: "mm",
                transform: { position, rotation, scale },
              },
            },
          ],
          options,
        );
        break;
      }
      case "preview_changes":
      case "apply_changes":
        result = await api.batch(a.steps as ModellingStep[], {
          ...options,
          dryRun: job.name === "preview_changes",
        });
        break;
      case "create_enclosure":
        result = await api.enclosure.create(a.parameters as EnclosureParameters, {
          ...options,
          dryRun: a.dryRun === true,
        });
        break;
      case "create_primitive":
      case "update_primitive":
      case "transform_object": {
        const type = {
          create_primitive: "primitive.create",
          update_primitive: "primitive.update",
          transform_object: "object.transform",
        }[job.name];
        const { expectedRevision: _revision, ...fields } = a;
        result = await api.batch([{ command: { ...fields, type } as ModellingCommand }], options);
        break;
      }
      case "undo":
        result = { ok: true, revision: api.revision, value: { action: layers.undo() } };
        // Undo advances the revision too.
        (result as { revision: string }).revision = api.revision;
        break;
      default:
        return error("unsupported", "Unsupported local agent tool.");
    }
    changed();
    return result;
  };
}
