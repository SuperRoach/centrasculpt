# Phase 6.2.1 — Agent-ready modelling commands

Implemented 2026-11-04. This is a local TypeScript adapter, not a transport or an agent service. Import `ModellingAPI` from `src/modelling-api.ts` and construct it with the current `IndependentLayers`. Create a replacement adapter when the editor is replaced. No XR session, DOM, event simulation, network listener, provider or MCP server is required or installed.

```ts
const api = new ModellingAPI(layers, () => editingAllowed);
const scene = api.query({ type: "scene.summary" });
const result = await api.execute(
  { type: "primitive.create", unit: "mm",
    source: { kind: "box", width: 50, height: 30, depth: 20 } },
  { expectedRevision: scene.revision, signal: abortController.signal },
);
if (result.ok) {
  const object = api.query({ type: "object.get", id: result.value.id });
}
```

## Contract

- Commands: `primitive.create`, `primitive.update`, `object.transform`, `primitive.bake`, `object.delete`, and `object.rename`. Update supplies a complete definition of the existing shape type; changing type requires creating a new source. IDs are the authoritative layer/group IDs, retained across parameter edits and history replay. Creation uses the backend's unique default name; rename is a separate transaction.
- Queries: `scene.summary`, `object.list`, `object.get`. Exported command, query, metadata, summary, result and error types support typed consumers. Query results are detached JSON data, with parent/child IDs, names, source type, local/effective flags, local/world transforms, physical world AABB dimensions, primitive parameters in mm, runtime readiness and geometry counts. No voxel/mask/paint buffers, mesh arrays or editor objects escape.
- Input `unit` is required (`mm`, `cm`, `in`). Primitive dimensions are local; transform translation is in sculpture-world coordinates, Euler XYZ rotations in radians, and scale dimensionless. Output translation/dimensions are always mm. Parent transforms are included, workspace navigation is excluded. Existing finite numeric, transform and primitive limits apply: positive 0.001–16 model-unit dimensions, maximum 8:1 aspect, bounded vectors and supported uniform-scale changes. Numeric strings are rejected. Existing physical calibration and STL target/project-scale semantics are unchanged.
- `expectedRevision` is mandatory. Treat it as an opaque editor-lifetime token. It includes committed history, hierarchy/metadata, selection ownership and physical calibration changes, including UI operations. Tokens are scoped to an editor instance, shared by its adapters, and never persisted as project identity. Refresh after any stale result; do not automatically retry a destructive command.
- Success returns `{ok:true, revision, value}`; errors return `{ok:false, revision, error:{code,message}}`. Codes: `invalid_input`, `not_found`, `permission_denied`, `busy`, `unsupported`, `revision_conflict`, `cancelled`, `operation_failed`. Capacity and backend failures retain the backend message under `operation_failed`.
- Every execute is one atomic backend edit. Primitive generation and Bake stage and validate before publication. Transforms use the existing cancelable transaction. Failed preparation/cancellation preserves source and redo, and restores command-owned selection. Deletion retains the runtime through existing hierarchy Undo/Redo rather than using legacy destructive `remove`. Group deletion keeps children and their world poses. At least one sculpt layer must remain. No implicit Bake occurs.
- All mutations require the optional host edit policy and effective visible/unlocked objects (including ancestors). Default policy allows local editing. The policy is a host callback checked at admission, not a security boundary. Active strokes, placement previews, remeshing, transforms, Bake and generation return `busy`; the backend serializes UI edits while asynchronous candidates are staged. `AbortSignal` cancels creation, parameter generation and Bake; already-aborted requests reject before changes. Synchronous commands complete before another JS task can cancel them.
- Queries never select, remesh, bake, edit voxels, or create history. Primitive bounds are analytic; group/sculpt/tube bounds reuse the existing committed mesh dimension reader. These mesh bounds cost O(vertices), include descendant geometry, and return `null` while the editor is busy; empty geometry has zero bounds. Query status is editor-wide. Results are compact, but callers should avoid polling large mesh bounds every frame.

## UI and history boundary

The UI still owns its controls, selection and notifications. This adapter calls the same `regeneratePrimitive`, `setActiveTransform`, `renameNode`, `bake` and hierarchy history backend. It does not instantiate UI tools or duplicate SDF evaluation. Successful commands select the affected object, as existing modelling controls do. No global browser API is exposed. UI callers can later migrate to this adapter without altering modelling or persistence semantics. Legacy `remove` remains unchanged; `deleteObject` supplies the retained-runtime transaction needed for command Undo/Redo.

`tests/modelling-api.test.mjs` runs without a browser and compares UI primitive creation/Bake volumes and direct UI transform transactions with commands. Existing full regression suites cover saved/recovered primitives, STL/GLB, masks/paint, controller profiles and Skybox.

## Phase 7 extension points and deferred work

A future Phase 7 host can own adapter lifetime, map tool schemas to the typed discriminated commands, supply admission policy and cancellation, and serialize structured results. It must independently implement transport authentication/authorization, user approval policy and audit logging if external access is introduced. None exists in this milestone.

Deferred: multi-command atomic batches, dry-run/planning, progress subscriptions, persistent revisions, external schemas/transports, agent-driven selection/visibility/lock/grouping commands, partial parameter patches and source type conversion. Rename and transform are distinct transactions. Primitive cache/history bounds, polygonal curves, sampled Bake accuracy, eight-layer/resource limits and pending physical Quest acceptance remain Phase 6.2 limitations. No new rendering/input feature requires headset acceptance in this adapter milestone.
