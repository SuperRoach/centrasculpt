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


## Phase 6.3 — live Boolean commands

All commands require the existing `expectedRevision` and use `IndependentLayers.setBooleanModifiers` / explicit Bake. IDs in commands identify the target layer; modifier IDs are returned by `boolean.get` / `boolean.list` and retained by updates. No multi-command transaction is added.

```ts
await api.execute({ type: "boolean.create", id: boxId, sourceId: cylinderId, operation: "difference" }, { expectedRevision: api.revision });
const stack = api.query({ type: "boolean.get", id: boxId });
// Query value is a detached BooleanModifier[]: { id, sourceId, operation, enabled }.
if (stack.ok) {
  await api.execute({ type: "boolean.update", id: boxId, modifiers: stack.value.map(m => ({ ...m, enabled: false })) }, { expectedRevision: stack.revision });
  // Reordering this complete array changes ordered left-to-right evaluation atomically.
}
await api.execute({ type: "boolean.remove", id: boxId, modifierId }, { expectedRevision: api.revision });
await api.execute({ type: "boolean.bake", id: boxId }, { expectedRevision: api.revision, signal });
const all = api.query({ type: "boolean.list" }); // { id: targetId, modifiers }[]
```

Operations are `union`, `difference`, `intersect`. Each source keeps its own world/parent transform; primitive dimensions and `object.transform` retain explicit physical units. `object.get` includes detached `booleanModifiers` and `consumedBy` target IDs; its dimensions still describe the source object, not a mesh-derived CSG bounding box. The target's own field is the initial operand, followed by the array in order. Referenced sources can contain stacks; validation rejects cycles, missing refs, invalid stacks and unsupported non-uniform inherited scale. Errors use the existing structured result; backend graph/resource failures are `operation_failed` with a reason. Graph queries never evaluate a mesh.

A hidden source can remain an explicitly referenced operand; its eye controls independent output. Source/ancestor locks prevent stack mutation. Successful commands select their target. Target Bake uses a separate 128³ sculpt layer, hides its retained source subgraph, checks resolution/memory/locks and is cancelable. Entire visible-result Bake remains available in the UI/backend. Disabled stacks still retain their references for validation and native persistence. See [Phase 6.3 semantics, exports and limitations](PHASE_6_3_LIVE_BOOLEANS.md).

## Phase 6.6 — printable assembly parts

All mutations retain `execute(command, { expectedRevision, signal? })` and the existing structured result/errors. No MCP server is added. Part IDs are existing marked layer IDs; members are hierarchy descendants. Query values are detached.

- `part.define { objectId, clearanceMM }`, `part.remove { partId }`, `part.clearance { partId, clearanceMM }`.
- `part.assign { objectId, partId: string | null }`: preserve world pose; reject nested part/cycle/cross-part Boolean relationships.
- `part.select { partId }`: selects the root for editing/export. Existing `object.rename`, `object.transform` and layer flag controls apply to part roots.
- Queries `part.list` and `part.get { partId }` return `{ id, name, members, clearanceMM, visible, locked }`. `object.get/list` also include `partId`.
- `part.inspect { partA, partB }` returns `{ id: partA, fit }` in the success value. `fit` includes `units: "mm"`, `approximate: true`, `minimumSeparationMM: number | null`, `sampledOverlap`, `nominalClearanceMM`, `effectiveResolutionMM`, `belowResolution`, `clearanceViolation: boolean | null`, bounded `collisionRegionsMM`, `samples` and `warnings`. Inspection is asynchronous, read-only and revision/cancellation guarded.
- `part.mate { options: { moving, target, mode: "centres" | "faces" | "axes", axis: "x" | "y" | "z", offsetMM, matchNormal?, movingNormal?, targetNormal? } }`. Optional normals must both be finite nonzero model-world vectors; when provided with axis/normal matching they replace the inferred local normals. `matchNormal` opposes the target normal. Offsets use the specified model-world axis. One undo action.
- `connector.create { options: { pegPart, socketPart, pegDiameterMM, pegLengthMM, socketDiameterMM, socketDepthMM, radialClearanceMM, positionMM: [x,y,z], rotationRadians: [x,y,z] } }`. Success ID is the generated peg source. The socket source is discoverable through the target Boolean stack. Parameters obey the existing primitive engine limits. Generation is an atomic history batch, rolled back on failure/cancellation. Use `primitive.update`, `object.transform`, `array.create/update` and explicit Boolean commands to edit the generated sources.

Host adapters can use `inspectAssembly`, `previewAssembly` and `exportPartSTL(layers, partId, signal?, quality?)` from `assembly-tools.ts`; exports validate actual binary STL topology and use calibrated physical mm. These helpers snapshot revisions and reject changed/disposed sources. See [semantics, resolution limits and pending hardware checks](PHASE_6_6_ASSEMBLY.md).

Interactive follow-up (2026-11-05): `inspectLayers(layers, firstId, secondId, desiredGapMM, signal?)` is a read-only host helper for ordinary layers or existing part roots, with no part-definition/history side effects. `connector.create` also accepts two unmarked layer IDs; missing part markers are established inside the connector’s existing atomic Undo/Redo transaction. The UI’s two-tap picker resolves part children and unique consumed sources before calling these operations. The existing typed `part.inspect` command and saved per-part-clearance semantics are unchanged.

Surface placement follow-up (2026-11-06): `ConnectorOptions` accepts optional `socketPositionMM: [x,y,z]`, defaulting to the peg position for existing clients. Both cylinders share the explicit model-world `rotationRadians`. Independent centres permit matching connectors on separated parts; their local transforms persist through ordinary hierarchy/native codecs. `ConnectorPlacer.place(raycaster, firstId, secondId)` returns model-mm peg/socket face points, model-world outward normal, XYZ rotation and face gap without editing the model. `placedConnector(options, placement)` adapts those centres to the existing typed generator. It removes workspace presentation transforms, respects ray reach, uses cached evaluated SDFs (including live modifiers/arrays) and refuses misses, overlapping/non-facing or locked targets. `validateConnectorSizes` is shared by early UI validation and generation. No new command transport or project schema is introduced.

### Undoable deletion of live Boolean sources (2026-11-06)

`object.delete` and `IndependentLayers.deleteObject` now remove incoming Boolean references (including disabled modifiers) along with the selected source layer. The retained-runtime hierarchy history stores the affected modifier stacks, so a single Undo restores geometry, hierarchy/placement, selection and incoming references; Redo unlinks before removing the source. Other modifiers and source fields are retained. Every consuming target must be editable; source/target locks, the final-layer guard and existing busy-state checks still apply. Failed removal restores modifier stacks, hierarchy and selection without discarding the redo branch. The low-level irreversible `remove` method and Cut retain their referenced-source refusal. Desktop Delete/Backspace, Delete layer and the Live Boolean Shapes Delete source button use the same undoable deletion path. “Remove from result” still only unlinks the modifier.
