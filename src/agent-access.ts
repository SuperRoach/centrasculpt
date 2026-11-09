import { Euler, Quaternion } from "three";
import {
  type AgentActivity,
  agentObjects,
  agentTransaction,
  describeAgentResult,
} from "./agent-activity";
import type { FeatureDefinition } from "./enclosure-features";
import type { EnclosureParameters } from "./enclosure-recipe";
import type { IndependentLayers } from "./independent-layers";
import { newId } from "./layers";
import {
  type BatchOptions,
  type BatchReport,
  ModellingAPI,
  type ModellingCommand,
  type ModellingQuery,
  type ModellingStep,
  type ObjectMetadata,
} from "./modelling-api";
import { ARRAY_MAX_INSTANCES } from "./object-array";
import { type PhysicalUnit, unitMM } from "./physical-units";
import { MAX_PROJECT_LAYERS } from "./project";
import type { Vec3 } from "./transform";
import { scaledPrimitive } from "./transform-tools";

export type AgentJob = {
  id: string;
  deadline: number;
  name: string;
  args: Record<string, unknown>;
};
export type AgentProposal = {
  id: string;
  state:
    | "preview computing"
    | "awaiting approval"
    | "approved"
    | "applying"
    | "applied"
    | "rejected/error";
  title: string;
  description: string;
  expectedRevision: string;
  expiresAt: number;
  steps: ModellingStep[];
  recipe?:
    | { type: "create"; parameters: EnclosureParameters }
    | { type: "update"; baseId: string; lidId: string; parameters: EnclosureParameters }
    | {
        type: "feature-set";
        baseId: string;
        lidId: string;
        definition: FeatureDefinition;
        attachmentId?: string;
      }
    | { type: "feature-remove"; baseId: string; lidId: string; attachmentId: string };
  before: ObjectMetadata[];
  preview?: { ok: boolean; value?: BatchReport; [key: string]: unknown };
  result?: unknown;
};
function executeProposal(api: ModellingAPI, proposal: AgentProposal, options: BatchOptions) {
  const recipe = proposal.recipe;
  if (recipe?.type === "create") return api.enclosure.create(recipe.parameters, options);
  if (recipe?.type === "update")
    return api.enclosure.update(recipe.baseId, recipe.lidId, recipe.parameters, options);
  if (recipe?.type === "feature-set")
    return api.enclosure.setFeature(
      recipe.baseId,
      recipe.lidId,
      recipe.definition,
      options,
      recipe.attachmentId,
    );
  if (recipe?.type === "feature-remove")
    return api.enclosure.removeFeature(recipe.baseId, recipe.lidId, recipe.attachmentId, options);
  return api.batch(proposal.steps, options);
}
/** Memory-only, browser-owned consent. Never exposed as an MCP approval tool. */
export class AgentProposals {
  current?: AgentProposal;
  owner?: IndependentLayers;
  controller?: AbortController;
  constructor(readonly notify: () => void = () => {}) {}
  invalidate() {
    this.controller?.abort();
    if (this.current && this.current.state !== "applied") this.current.state = "rejected/error";
    this.notify();
  }
  approve(editor: IndependentLayers, revision: string) {
    const p = this.current;
    if (
      !p ||
      p.state !== "awaiting approval" ||
      this.owner !== editor ||
      p.expectedRevision !== revision ||
      Date.now() >= p.expiresAt ||
      editor.modellingBusy
    )
      return false;
    p.state = "approved";
    this.notify();
    return true;
  }
}
/** Transport adapter only: all generation, admission, revision checks and history remain authoritative. */
export function agentExecutor(
  editor: IndependentLayers | (() => IndependentLayers),
  canEdit: () => boolean,
  blocked: () => boolean,
  changed: () => void,
  proposals = new AgentProposals(),
  feedback?: (entry: AgentActivity, editor: IndependentLayers) => void,
) {
  const notifyChanged = () => {
    try {
      changed();
    } catch {
      /* UI refresh cannot undo or invalidate a committed transaction. */
    }
  };
  const execute = async (job: AgentJob, signal: AbortSignal): Promise<unknown> => {
    const layers = typeof editor === "function" ? editor() : editor;
    const api = new ModellingAPI(layers, canEdit);
    const error = (code: string, message: string) => ({
      ok: false,
      revision: api.revision,
      error: { code, message },
    });
    if (signal.aborted || Date.now() >= job.deadline)
      return error("cancelled", "Request expired or connection revoked.");
    if (
      !["get_proposal", "cancel_proposal"].includes(job.name) &&
      (blocked() || layers.modellingBusy || !layers.recoveryReady)
    )
      return error("busy", "Finish the current editor operation first.");
    const a = job.args;
    if (
      [
        "propose_changes",
        "propose_enclosure",
        "get_proposal",
        "cancel_proposal",
        "apply_approved_proposal",
      ].includes(job.name)
    ) {
      const p = proposals.current;
      if (job.name === "propose_changes" || job.name === "propose_enclosure") {
        if (!canEdit())
          return error("permission_denied", "Enable editing before staging a proposal.");
        if (
          p &&
          ["preview computing", "awaiting approval", "approved", "applying"].includes(p.state)
        )
          return error("busy", "Cancel the existing proposal first.");
        const proposal: AgentProposal = {
          id: newId(),
          state: "preview computing",
          title: a.title as string,
          description: a.description as string,
          expectedRevision: a.expectedRevision as string,
          expiresAt: Date.now() + 120000,
          steps: structuredClone((a.steps ?? []) as ModellingStep[]),
          ...(job.name === "propose_enclosure"
            ? { recipe: structuredClone(a.recipe as AgentProposal["recipe"]) }
            : {}),
          before: layers.project.layerStack.layers
            .map((l) => api.objectMetadata(l.id))
            .concat(
              layers.project.layerStack.hierarchy.groups.map((g) => api.objectMetadata(g.id)),
            ),
        };
        proposals.current = proposal;
        proposals.owner = layers;
        const controller = new AbortController();
        proposals.controller = controller;
        proposals.notify();
        const preview = await executeProposal(api, proposal, {
          expectedRevision: proposal.expectedRevision,
          dryRun: true,
          signal: AbortSignal.any([signal, controller.signal]),
        });
        proposal.preview = preview;
        const currentEditor = typeof editor === "function" ? editor() : editor;
        proposal.state =
          preview.ok &&
          !controller.signal.aborted &&
          !signal.aborted &&
          currentEditor === layers &&
          api.revision === proposal.expectedRevision
            ? "awaiting approval"
            : "rejected/error";
        proposals.notify();
        return preview.ok && proposal.state === "awaiting approval"
          ? { ok: true, revision: api.revision, value: structuredClone(proposal) }
          : preview.ok
            ? error("cancelled", "Proposal invalidated during staging.")
            : preview;
      }
      if (!p || p.id !== a.proposalId) return error("not_found", "Unknown proposal.");
      if (job.name === "cancel_proposal") {
        proposals.invalidate();
        return { ok: true, revision: api.revision, value: structuredClone(p) };
      }
      if (job.name === "get_proposal" && p.state === "applied" && proposals.owner === layers)
        return { ok: true, revision: api.revision, value: structuredClone(p) };
      if (
        proposals.owner !== layers ||
        p.expectedRevision !== api.revision ||
        Date.now() >= p.expiresAt
      ) {
        proposals.invalidate();
        return error(
          "revision_conflict",
          "Proposal expired or editor changed; submit a new proposal.",
        );
      }
      if (job.name === "get_proposal")
        return { ok: true, revision: api.revision, value: structuredClone(p) };
      if (!canEdit()) return error("permission_denied", "Editing permission was revoked.");
      if (p.state !== "approved")
        return error("permission_denied", "Explicit browser proposal approval required.");
      p.state = "applying";
      proposals.notify();
      const controller = new AbortController();
      proposals.controller = controller;
      const result = await executeProposal(api, p, {
        expectedRevision: p.expectedRevision,
        preserveSelection: true,
        signal: AbortSignal.any([
          signal,
          controller.signal,
          AbortSignal.timeout(Math.max(1, p.expiresAt - Date.now())),
        ]),
      });
      if (result.ok)
        Object.assign(result.value, {
          inspection: [
            ...new Set([...result.value.changes.created, ...result.value.changes.modified]),
          ].map((id) => api.query({ type: "geometry.diagnostics", id })),
        });
      p.result = result;
      p.state = result.ok ? "applied" : "rejected/error";
      proposals.notify();
      if (result.ok) notifyChanged();
      return result;
    }
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
          primitives: {
            kinds: ["box", "sphere", "cylinder", "capsule", "torus", "pyramid"],
            cone: "cylinder with bottomDiameter > 0 and topDiameter 0; optional positive tip for blunt end",
            torus:
              "majorRadius is ring centreline radius; tubeDiameter is full tube diameter; tyre is dimensionless 0–100 (round to firm shoulders); Y axis",
            capsule: "overall Y height >= diameter",
            pyramid: "width X, depth Z, base at -height/2, apex at +height/2",
          },
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
            scale:
              "dimensionless; world-scale edits require equal XYZ. scale_primitive supports independent box/pyramid/ellipsoid axes and cylinder/capsule axial/radial sizing; torus requires equal XYZ or explicit parameter updates.",
            arrays:
              "spacingModelUnits and pivot in explicit unit; radial radius set by source offset from pivot; no separate gap parameter",
            hierarchy: "raw transforms in model units; scene calibration applies",
          },
          standaloneOnly: [
            "connector.create",
            "part.inspect",
            "enclosure.create",
            "enclosure.update",
            "enclosure.feature.set",
            "enclosure.feature.remove",
            "geometry.diagnostics",
          ],
          limitations: [
            "No group duplication or implicit Bake.",
            "Dry-runs validate source caches only.",
            "STL topology requires a printable part and describes the sampled mesh; clearance is approximate, physical fit unknown.",
            "Resource estimates exclude some JS/GPU/process peaks; 16 layers do not guarantee admission.",
            "Attachments are standalone recipe transactions; no remote access or project saves.",
          ],
        },
      };
    if (
      ["enclosure_anchors", "list_enclosure_features", "get_enclosure_feature"].includes(job.name)
    ) {
      try {
        const inspected = api.enclosure.inspect(a.baseId as string, a.lidId as string);
        const value =
          job.name === "enclosure_anchors"
            ? inspected.anchors
            : job.name === "get_enclosure_feature"
              ? inspected.features.find((f) => f.sourceIds[0] === a.attachmentId)
              : inspected.features;
        return value === undefined
          ? error("not_found", "Unknown attachment ID.")
          : { ok: true, revision: api.revision, value };
      } catch (e) {
        return error("invalid_input", e instanceof Error ? e.message : "Invalid enclosure.");
      }
    }
    if (!canEdit()) return error("permission_denied", "Enable editing in Local agent access.");
    const options = { expectedRevision: a.expectedRevision as string, signal };
    if (options.expectedRevision !== api.revision)
      return error("revision_conflict", "Scene changed; inspect again before editing.");
    let result: unknown;
    switch (job.name) {
      case "scale_primitive": {
        const object = api.query({ type: "object.get", id: a.id as string });
        if (!object.ok) return object;
        const source = object.value.primitive;
        if (!source) return error("unsupported", "Select an editable primitive.");
        const [x, y, z] = a.factors as Vec3;
        if ((source.kind === "cylinder" || source.kind === "capsule") && Math.abs(x - z) > 1e-10)
          return error(
            "unsupported",
            "Cylinder/Capsule X/Z factors must match; elliptical ends are unsupported.",
          );
        if (source.kind === "torus" && (Math.abs(x - y) > 1e-10 || Math.abs(x - z) > 1e-10))
          return error(
            "unsupported",
            "Torus scaling requires equal XYZ; update majorRadius and tubeDiameter explicitly.",
          );
        const local = layers.runtime(a.id as string).layer.primitive!;
        let next: typeof local;
        try {
          const scaled = scaledPrimitive(local, [x, y, z], "XYZ"),
            mm = layers.display.precision.millimetresPerUnit;
          next = Object.fromEntries(
            Object.entries(scaled).map(([k, v]) => [
              k,
              typeof v === "number" && k !== "tyre" ? Number((v * mm).toPrecision(15)) : v,
            ]),
          ) as typeof scaled;
        } catch (e) {
          return error("invalid_input", e instanceof Error ? e.message : "Invalid dimensions.");
        }
        result = await api.batch(
          [{ command: { type: "primitive.update", id: a.id as string, unit: "mm", source: next } }],
          { ...options, preserveSelection: true },
        );
        break;
      }
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
      case "set_enclosure_feature":
        result = await api.enclosure.setFeature(
          a.baseId as string,
          a.lidId as string,
          a.definition as FeatureDefinition,
          { ...options, dryRun: a.dryRun === true },
          a.attachmentId as string | undefined,
        );
        break;
      case "remove_enclosure_feature":
        result = await api.enclosure.removeFeature(
          a.baseId as string,
          a.lidId as string,
          a.attachmentId as string,
          { ...options, dryRun: a.dryRun === true },
        );
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
    if (
      (result as { ok?: boolean })?.ok &&
      job.name !== "dry_run_changes" &&
      job.name !== "preview_changes" &&
      a.dryRun !== true
    )
      notifyChanged();
    return result;
  };
  return async (job: AgentJob, signal: AbortSignal): Promise<unknown> => {
    const owner = typeof editor === "function" ? editor() : editor;
    if (!feedback || !agentTransaction(job.name, job.args)) return execute(job, signal);
    const revision = new ModellingAPI(owner).revision;
    let before: ReturnType<typeof agentObjects> = [],
      captured = false;
    try {
      before = agentObjects(owner);
      captured = true;
    } catch {
      /* Busy editor metadata may be unavailable. */
    }
    const title = job.name === "apply_approved_proposal" ? proposals.current?.title : undefined;
    let result: unknown;
    try {
      result = await execute(job, signal);
    } catch (e) {
      result = {
        ok: false,
        error: { code: "operation_failed", message: e instanceof Error ? e.message : String(e) },
      };
    }
    // Presentation failures must never change a committed modelling result.
    try {
      if ((typeof editor === "function" ? editor() : editor) === owner) {
        const nextRevision = new ModellingAPI(owner).revision;
        if (!(result as { ok?: boolean })?.ok || nextRevision !== revision) {
          const entry = describeAgentResult(
            job.name,
            title,
            before,
            captured && (result as { ok?: boolean })?.ok ? agentObjects(owner) : before,
            nextRevision,
            result,
          );
          if (!captured) entry.objects = [];
          else if (entry.outcome === "failed") {
            const request = JSON.stringify(job.args);
            entry.objects = before
              .filter((object) => request.includes(JSON.stringify(object.id)))
              .slice(0, 128)
              .map((object) => ({
                id: object.id.slice(0, 128),
                name: object.name.slice(0, 128),
                status: "unchanged",
              }));
          }
          feedback(entry, owner);
        }
      }
    } catch {
      /* Detached feedback is best-effort; authoritative result remains intact. */
    }
    return result;
  };
}
