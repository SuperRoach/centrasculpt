import { Euler, Quaternion } from "three";
import type { EnclosureParameters } from "./enclosure-recipe";
import type { IndependentLayers } from "./independent-layers";
import {
  ModellingAPI,
  type ModellingCommand,
  type ModellingQuery,
  type ModellingStep,
} from "./modelling-api";
import { ARRAY_MAX_INSTANCES } from "./object-array";
import { type PhysicalUnit, unitMM } from "./physical-units";
import { MAX_PROJECT_LAYERS } from "./project";
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
    const queries: Record<string, ModellingQuery["type"]> = {
      get_hierarchy: "scene.hierarchy",
      list_booleans: "boolean.list",
      get_booleans: "boolean.get",
      list_arrays: "array.list",
      get_array: "array.get",
      list_parts: "part.list",
      get_part: "part.get",
      get_bounds: "geometry.bounds",
      get_source_diagnostics: "geometry.diagnostics",
      inspect_enclosure: "enclosure.inspect",
      sample_enclosure: "enclosure.samples",
    };
    if (queries[job.name]) return api.query({ ...a, type: queries[job.name] } as ModellingQuery);
    if (job.name === "get_geometry_diagnostics")
      return api.diagnostics(a as { id: string; otherId?: string; clearanceMM?: number }, signal);
    if (job.name === "inspect_parts") {
      if (a.expectedRevision !== api.revision) return error("revision_conflict", "Scene changed.");
      const first = api.query({ type: "part.get", partId: a.partA as string });
      if (!first.ok) return first;
      const second = api.query({ type: "part.get", partId: a.partB as string });
      if (!second.ok) return second;
      return api.diagnostics(
        {
          id: a.partA as string,
          otherId: a.partB as string,
          clearanceMM: Math.max(first.value.clearanceMM, second.value.clearanceMM),
        },
        signal,
      );
    }
    if (job.name === "get_capabilities")
      return {
        ok: true,
        revision: api.revision,
        value: {
          limits: {
            layers: MAX_PROJECT_LAYERS,
            arrayInstances: ARRAY_MAX_INSTANCES,
            batchCommands: 64,
            requestBytes: 65536,
            trackedMemoryBytes: 256 * 1024 ** 2,
            dryRunSourceBytes: 128 * 1024 ** 2,
            maxResolution: 192,
            maxSamples: 64000000,
          },
          units: {
            lengths: "explicit mm/cm/in; outputs mm",
            rotations: "XYZ radians; rotate_object degrees",
            scale: "dimensionless",
            arrays:
              "spacingModelUnits and pivot in explicit unit; radial radius set by source offset from pivot; no separate gap parameter",
            hierarchy: "raw transforms in model units; scene calibration applies",
          },
          standaloneOnly: [
            "connector.create",
            "part.inspect",
            "enclosure.create",
            "enclosure.update",
            "geometry.diagnostics",
          ],
          limitations: [
            "No group duplication or implicit Bake.",
            "Dry-runs validate source caches only.",
            "STL topology requires a printable part and describes the sampled mesh; clearance is approximate, physical fit unknown.",
            "Resource estimates exclude some JS/GPU/process peaks; 16 layers do not guarantee admission.",
            "No Phase 7.2 face-relative constraints, remote access or project saves.",
          ],
        },
      };
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
      case "dry_run_changes":
      case "preview_changes":
      case "apply_changes":
        result = await api.batch(a.steps as ModellingStep[], {
          ...options,
          dryRun: job.name !== "apply_changes",
        });
        break;
      case "update_enclosure":
        result = await api.enclosure.update(
          a.baseId as string,
          a.lidId as string,
          a.parameters as EnclosureParameters,
          { ...options, dryRun: a.dryRun === true },
        );
        break;
      case "create_connector":
        result = await api.execute(
          { type: "connector.create", options: a.options } as ModellingCommand,
          options,
        );
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
      default: {
        const type = job.name.replace("_", ".");
        const supported = [
          "group.create",
          "object.parent",
          "object.flag",
          "object.duplicate",
          "object.delete",
          "object.rename",
          "boolean.create",
          "boolean.update",
          "boolean.remove",
          "array.create",
          "array.update",
          "array.remove",
          "part.define",
          "part.remove",
          "part.assign",
          "part.clearance",
          "part.mate",
          "primitive.bake",
          "boolean.bake",
          "array.bake",
          "primitive.create",
          "primitive.update",
          "object.transform",
        ];
        if (!supported.includes(type)) return error("unsupported", "Unsupported local agent tool.");
        const { expectedRevision: _revision, ...fields } = a;
        result = await api.batch([{ command: { ...fields, type } as ModellingCommand }], options);
      }
    }
    changed();
    return result;
  };
}
