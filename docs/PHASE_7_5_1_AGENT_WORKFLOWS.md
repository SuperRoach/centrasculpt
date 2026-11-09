# Phase 7.5.1 — Agent workflow and tool discoverability

## Start with live discovery

1. Call `scene_summary` and retain its exact `revision`. If unavailable, open the
   printed `127.0.0.1` editor, run `npm run dev:agent`, reconnect/restart the MCP
   process and approve the current session. Restarting rotates the session. After
   a code/schema update, refresh the client's MCP tools or restart its connection.
2. Read `get_capabilities`; compare its adapter `version`, `buildVersion` and
   non-secret `sessionId` with the MCP server info. Compare its `tools` list with
   the actual `tools/list`. A changed build/session or missing tool means the
   client is stale or attached to a different server; refresh/reconnect before
   drawing conclusions. Credentials are never part of this report.
3. Query only what the task needs: `list_objects`, `get_object`, `get_booleans`,
   `get_array`, `get_bounds`, or `get_geometry_diagnostics`. These reads do not
   edit. Bounds can be conservative source bounds; diagnostics only evaluates the
   documented sampled/export representations.
4. For direct multi-object edits, use `preview_changes` then `apply_changes` with
   the same revision and commands. Both require browser editing permission under
   the current API. A successful `apply_changes` is one atomic Undo entry.
5. For a user-reviewed plan, submit the whole supported command batch to
   `propose_changes`. It previews source caches and stages without changing the
   scene or history. Wait for the person to inspect and approve that exact plan in
   the active browser. Only then call `apply_approved_proposal`; it cannot approve
   its own proposal. Application is one Undo entry. Standalone enclosure recipes
   use `propose_enclosure` and cannot be mixed into a command batch with connector
   commands. Do not automatically resubmit or retry an uncertain write: call
   `scene_summary` and inspect IDs/history first.
6. After commit, inspect stable output IDs, transforms and Boolean/array graphs;
   query bounds/diagnostics as appropriate, then capture scoped `front` and
   `isometric` views at the same revision. `capture_scene_preview` is read-only.
   Set exactly one `objectId` or `partId` for independently evaluated scope.
   Captures report evaluated visible bounds but do not certify topology or fit.

## Holder example: proposal batch

This plan creates five source layers (body, base, three cutters), then adds one
Union and three Difference modifiers. All dimensions and translations are mm.
The body has source dimensions 90 × 20 × 40, centred at `[0,13,0]`. The base is
110 × 16 × 50 centred at `[0,4,0]` and overlaps the body by 9 mm. Three 8 × 22 × 14
cutters at X = −24, 0 and +24 pass through the body. The expected evaluated
composite bounds are 110 × 27 × 50 mm (X/Y/Z). This is a precise editable test
fixture; it is not a print-fit claim.

```json
{
  "expectedRevision": "LATEST_REVISION",
  "title": "90 mm three-slot holder with 110 mm base",
  "description": "Create a 90 × 20 × 40 mm body, three 8 × 22 × 14 mm slot cutters at X −24/0/+24 mm, and a 110 × 16 × 50 mm base at Y 4 mm. Union the base, subtract the cutters, then inspect bounds and front/isometric captures.",
  "steps": [
    {"as":"body","command":{"type":"primitive.create","unit":"mm","source":{"kind":"box","width":90,"height":20,"depth":40}}},
    {"command":{"type":"object.transform","id":"$body","unit":"mm","transform":{"position":[0,13,0],"rotation":[0,0,0],"scale":[1,1,1]}}},
    {"as":"base","command":{"type":"primitive.create","unit":"mm","source":{"kind":"box","width":110,"height":16,"depth":50}}},
    {"command":{"type":"object.transform","id":"$base","unit":"mm","transform":{"position":[0,4,0],"rotation":[0,0,0],"scale":[1,1,1]}}},
    {"as":"slot1","command":{"type":"primitive.create","unit":"mm","source":{"kind":"box","width":8,"height":22,"depth":14}}},
    {"command":{"type":"object.transform","id":"$slot1","unit":"mm","transform":{"position":[-24,13,0],"rotation":[0,0,0],"scale":[1,1,1]}}},
    {"as":"slot2","command":{"type":"primitive.create","unit":"mm","source":{"kind":"box","width":8,"height":22,"depth":14}}},
    {"command":{"type":"object.transform","id":"$slot2","unit":"mm","transform":{"position":[0,13,0],"rotation":[0,0,0],"scale":[1,1,1]}}},
    {"as":"slot3","command":{"type":"primitive.create","unit":"mm","source":{"kind":"box","width":8,"height":22,"depth":14}}},
    {"command":{"type":"object.transform","id":"$slot3","unit":"mm","transform":{"position":[24,13,0],"rotation":[0,0,0],"scale":[1,1,1]}}},
    {"command":{"type":"boolean.create","id":"$body","sourceId":"$base","operation":"union"}},
    {"command":{"type":"boolean.create","id":"$body","sourceId":"$slot1","operation":"difference"}},
    {"command":{"type":"boolean.create","id":"$body","sourceId":"$slot2","operation":"difference"}},
    {"command":{"type":"boolean.create","id":"$body","sourceId":"$slot3","operation":"difference"}}
  ]
}
```

The batch uses 14 commands and five of the app's 16 layer slots. Proposal
staging and browser approval are separate calls. The three cutters remain
independent editable source layers; their IDs and aliases are returned after
apply. Query `get_booleans` on the body to verify the ordered modifier graph.
One `undo` at the returned revision removes the entire applied proposal.

For a non-staged direct edit, send the same `steps` to `preview_changes`, inspect
the source-cache dry-run, then pass the same steps/revision to `apply_changes`.
Preview IDs are provisional. Do not stage a proposal and expect to put it inside
`apply_changes`: proposal and batch APIs are separate, and standalone recipe APIs
cannot be nested in command batches.

## Failure recovery

- `permission_denied`: browser connection approval and editing permission are
  separate; `propose_changes` also needs editing permission to stage.
- `revision_conflict`: reacquire `scene_summary`, repeat reads and rebuild the
  complete plan against its current revision.
- `busy`: finish the active editor operation; do not submit a second mutation.
- `agent_access`/disconnected: restart `dev:agent` if needed, refresh/reconnect
  MCP, then approve the current browser session.
- Timeout or lost response during a write: its commit state can be uncertain.
  Inspect `scene_summary`, `list_objects`, proposal state and Undo history before
  deciding what action to take. No automatic write retry is safe.
- Layer/resource refusal: the editor supports 16 source/group layers, but the
  existing voxel, triangle, memory, Boolean and export limits still apply.

Codex and Cursor load tool definitions through their own MCP connection/cache.
This repository verifies the official stdio MCP server's published schemas; it
cannot prove a separate client's current cache or tool-selection policy. After
refreshing, verify `tools/list`/tool details in that client's MCP panel.

## Final hostname acceptance — 2026-11-09

The full browser workflow passed over the printed machine `.local` HTTP address,
including read-only approval, explicit editing, official stdio tools, staged holder
proposal, source dimensions, ordered Booleans, scoped front/isometric captures,
evaluated bounds, one Undo, restart/shutdown cleanup and production isolation.
Agent client/proposal/activity IDs use the existing cryptographic `newId` fallback
on HTTP origins where `crypto.randomUUID` is unavailable; server credentials and
approval rules are unchanged. A focused regression covers the missing UUID API.

The canonical holder uses a 110 × 16 × 50 mm base at Y 4 to respect the existing 8:1 source
aspect limit while retaining the expected overall bounds. Metadata assertions
allow 1e-9 mm numeric noise; evaluated Float32 bounds allow 0.0001 mm. Session
activity is append-only: proposal apply and Undo each add one committed record.
Native Undo still removes all five created holder layers in one action.

Final full checks 1,667/1,667 and focused agent 19/19 passed. Evidence:
`/tmp/centra-handoff-final-check.log`, `/tmp/centra-handoff-lan-focused.log`,
`/tmp/centra-handoff-agent-browser.log`. Client-specific cached tools and Quest
acceptance remain separate. No original user project/recovery data was used.
