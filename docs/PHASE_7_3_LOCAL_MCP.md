# Phase 7.3 — optional local MCP access

Development proof of concept, 2026-11-06. Uses the official `@modelcontextprotocol/sdk`
stdio server and Zod schemas. Phase 7.0 `ModellingAPI` and Phase 7.1 enclosure recipes
remain the only modelling implementation. Phase 7.2 now supplies bounded associative wall cutouts, explicit floor mounting
patterns and named frames; see [feature tools and limits](PHASE_7_2_FEATURES.md).

## Start and connect

1. Run `npm install` in the repository (Node 22+ recommended).
2. Normal editing: `npm run dev`. No bridge or MCP process starts.
3. Agent editing: `npm run dev:agent`. This starts Vite on **127.0.0.1:5173** and a
   second loopback-only bridge on an OS-assigned port. If 5173 is already occupied,
   stop that server yourself or use `npm run dev:agent -- --port 5197`. The exact
   matching browser origin is printed. `localhost`, HTTPS and LAN addresses do not match.
4. Configure the MCP client once with the adapter script path below. The server discovers
   the current session automatically through ignored `work/agent-session.json`.
   Credentials still rotate on every startup; no session path needs copying.
5. Configure your MCP client below and let that client launch the stdio server.
   `npm run mcp:agent` is the equivalent manual
   server entry point, but is intended to be launched by a client, not interactively.
6. Open the printed browser origin. Choose **Approve connection** in **Local agent
   access (development)**. This approves the current editor tab and shares scene
   metadata with local MCP clients holding this session credential. Default is read-only.
7. Check **Allow editing (includes Undo)** to allow writes. Uncheck it to revoke
   write permission; choose **Revoke access** to revoke all access. Revocation aborts
   in-flight cooperative operations. A disconnected/restarted client may require
   browser approval again. These controls are development tools, not project data.

Only one browser tab owns the bridge at a time. Revoke the original tab before
approving another. Multiple MCP clients share the one approved session; this POC
does not offer separate identities or grants per client. Only one request is admitted
at a time. This is local developer access, not an internet or multi-user security boundary.

## Codex

Add this to your user `~/.codex/config.toml`, replacing the repository path:

```toml
[mcp_servers.centra_sculpt]
command = "node"
args = ["/ABS/REPO/scripts/agent-mcp.mjs"]
tool_timeout_sec = 20
```

Alternatively: `codex mcp add centra_sculpt -- node /ABS/REPO/scripts/agent-mcp.mjs`.
Use an absolute Node executable if the app cannot find `node` on PATH. Refresh or
restart the client's MCP connection after changing its configuration. No Codex
configuration or permissions are modified automatically by this repository.

Configuration syntax follows [official OpenAI MCP documentation](https://learn.chatgpt.com/docs/extend/mcp).

## Cursor

Add to your local `.cursor/mcp.json` or user `~/.cursor/mcp.json` (use a local configuration):

```json
{
  "mcpServers": {
    "centra_sculpt": {
      "command": "node",
      "args": ["/ABS/REPO/scripts/agent-mcp.mjs"]
    }
  }
}
```

Enable/restart the server in Cursor's MCP settings, then approve the browser connection.
See [Cursor MCP configuration](https://prod.cursor.com/docs/mcp).

## Tool contracts

The exact strict executable schemas are in [`scripts/agent-schemas.mjs`](../scripts/agent-schemas.mjs)
and are published by MCP `tools/list`. Unknown fields, nonfinite numbers, missing
units and unsupported commands are rejected before bridge admission. All mutations
require `expectedRevision` from the most recent scene/object result. All object
results use stable IDs and mm dimensions. Results are returned as both MCP text JSON
and `structuredContent`: `{ok:true, revision, value}` or
`{ok:false, revision?, error:{code,message}}`. Errors set MCP `isError`.

| Tool | Arguments in addition to `expectedRevision` for writes |
| --- | --- |
| `scene_summary` | `{}`; project ID, object count, calibration, busy state and revision |
| `list_objects` | `{}`; detached object metadata |
| `get_object` | `{id}`; primitive, hierarchy, flags, world/local pose, physical dimensions |
| `create_primitive` | `{unit, source}` |
| `update_primitive` | `{id, unit, source}`; primitive type must stay the same |
| `transform_object` | `{id, unit, transform:{position:[x,y,z], rotation:[x,y,z], scale:[x,y,z]}}` |
| `move_object` | `{id, unit, translation:[x,y,z], mode?:"by" or "set"}`; default adds a world-axis offset |
| `rotate_object` | `{id, rotationDegrees:[x,y,z], mode?:"by" or "set"}`; default composes world XYZ rotation about object origin |
| `scale_object` | `{id, scale:[x,y,z]}`; absolute world scale, preserving position/orientation |
| `create_enclosure` | `{parameters, dryRun?:boolean}`; existing Phase 7.1 recipe |
| `preview_changes` | `{steps:[{command, as?:alias}]}`; isolated Phase 7.0 dry-run |
| `apply_changes` | `{steps:[{command, as?:alias}]}`; one logical Undo transaction |
| `undo` | no additional fields; undoes the editor's last action, including user actions |

`unit` is `mm`, `cm` or `in`. `source` is a strict union:

```json
{"kind":"box","width":20,"height":30,"depth":40}
{"kind":"sphere","diameter":20}
{"kind":"cylinder","diameter":20,"height":30}
```

Source dimensions must be positive, finite and at most 10,000 (in the specified
unit); the engine applies its tighter physical/aspect/resource limits. The adapter
exposes these three basic primitive schemas; rounded boxes remain available through
the existing enclosure API/UI. Translations are world coordinates in the explicit
unit, rotations XYZ radians, scale dimensionless. These do not move the VR workspace.

`steps` contains 1–64 safe Phase 7.0 commands (see the Phase 7.3.1 expansion below
and `get_capabilities`). Each adds a `type` field matching its command name. Optional
unique `as` identifiers match `[a-zA-Z][a-zA-Z0-9_]{0,63}`. An `id` may refer to an
earlier result as `$alias`. Preview IDs are provisional; apply the original commands,
not the preview IDs. Preview currently also requires editing permission because
the authoritative API gates dry-run. It validates source caches, not final evaluated
Boolean topology or physical printability. For separately approved modelling plans, use the [Phase 7.4 proposal workflow](PHASE_7_4_AGENT_PROPOSALS.md).

Example `apply_changes` arguments (replace the revision):

```json
{
  "expectedRevision": "LATEST_REVISION",
  "steps": [
    {"as":"box","command":{"type":"primitive.create","unit":"mm","source":{"kind":"box","width":20,"height":30,"depth":40}}},
    {"command":{"type":"object.transform","id":"$box","unit":"mm","transform":{"position":[150,0,0],"rotation":[0,0,0],"scale":[1,1,1]}}}
  ]
}
```

Enclosure parameters (all lengths in mm; recipe validation also checks geometric relationships):

```json
{
  "units":"mm", "name":"Enclosure",
  "innerWidthMm":24, "innerDepthMm":20, "innerHeightMm":14,
  "wallThicknessMm":3, "floorThicknessMm":3, "cornerRadiusMm":4,
  "lid":{"type":"friction-fit","clearanceMm":0.3,"lipDepthMm":4,"thicknessMm":3}
}
```

Names are 1–90 characters; lengths are finite and positive (corner radius may be
zero). Phase 7.1 requires 0.05–1000 mm and validates walls, rim, lip and clearance.
No save, load, export, arbitrary code, filesystem or network tools are exposed.
Agent changes participate in normal local recovery/autosave like manual edits;
the adapter cannot silently overwrite a manually saved `.form` project.

Scene capacity is now **16 independent layers**, shared by editor, recipes, connectors,
VR controls and native save/load. Existing voxel, triangle and memory budgets still
apply; 16 large/high-resolution sources may exceed those budgets. Projects containing
more than eight layers will be refused by older app versions with the eight-layer cap.

The convenience move/rotate/scale tools preserve unspecified pose components and use
the same revision-checked transaction. Rotate `by` composes a quaternion in world axes;
`set` replaces XYZ Euler orientation. It does not orbit the object around the world origin.
For a multi-step single Undo transaction, use `apply_changes` with full `object.transform`
commands.

## Boundaries and errors

- The HTTP bridge binds **only 127.0.0.1** and verifies exact Host and configured
  browser Origin. It requires distinct random 256-bit browser and MCP bearer tokens.
  The browser token is delivered by a dev-only virtual module; MCP credentials are
  written only to a private temporary directory with a mode-0600 session file.
- Browser approval and write grants live in memory. No credentials, permissions or
  agent-specific data go into native projects, recovery metadata or production assets.
- 64 KiB request bodies; 64-command batches; one in-flight request; 10-second browser
  operation deadline, 12-second bridge timeout, 15-second MCP HTTP timeout. Editor
  heartbeat expires after 2.5 seconds; 250 ms polling (subject to browser scheduling).
  Background-tab throttling may disconnect. Keep the approved editor visible.
- Revocation, expired heartbeat, client request disconnect or timeout drops queued
  work and revokes access. The browser aborts running work on transport failure or
  local revocation. Cooperative engine cancellation rolls transactions back. A result
  can be lost after a transaction commits; inspect scene/revision before retrying.
- `permission_denied` / read-only: approve the tab and enable editing. `busy`: finish
  an existing stroke, modal, transform, project operation or transaction. `revision_conflict`:
  inspect again and rebuild the request. HTTP 401: old/wrong credential; restart agent mode and reload the editor. HTTP 403: wrong origin/host, expired or unapproved access. HTTP 409:
  another tab/request or an expired result. HTTP 400: malformed/schema-invalid request.
  HTTP 413: oversized request. `cancelled`: timed out or revoked; query before retrying.
- MCP shutdown revokes bridge permission while leaving Vite/editor running. Stopping
  Vite closes the bridge, settles pending work and deletes the temporary directory.
  Forced OS termination can leave an inert credential file; it has no running listener
  and can be deleted manually. SIGKILL of an idle MCP process cannot send revocation;
  use the browser's Revoke access control to clear the shared session grant.

## Verify

```bash
npm run check
npm run test:agent
npx playwright install chromium
npm run test:agent:browser
```

Browser smoke uses a fresh browser profile and port 5197, creates/inspects/transforms/
updates a real box through stdio MCP, checks editor rows, Undo and ordinary Redo after
disconnect, then verifies normal startup and scans the production assets from `npm run
build`. It never restores/discards existing browser recovery. Optional overrides:
`AGENT_SMOKE_PORT`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE` (absolute Chromium executable).
Evidence/screenshots are written under ignored `work/phase-7-3/`.

## Disable or remove

Use **Revoke access**, stop the MCP client server, stop agent Vite, then use `npm run
dev`. Remove/disable the MCP client configuration. No application preference or
project conversion is needed.

Complete removal: delete `scripts/agent-*.mjs`, `src/agent-access.ts`,
`src/agent-browser.ts`, `src/agent-access.css`, `tests/agent-access.test.mjs` and this guide; remove the
`__AGENT_ENABLED__` dynamic-import block in `src/main.ts`, declarations in
`src/vite-env.d.ts`, conditional agent plugin/define in `vite.config.ts`, agent
scripts from `package.json`, and the `agent-access` entry in `scripts/compile-core.mjs`.
Run `npm uninstall --save-dev @modelcontextprotocol/sdk zod @playwright/test` to
update dependencies/lockfile, then `npm run check`. No sculpting engine, command API,
native codec or project schema needs modification.

WebMCP, Quest synchronisation, pairing indicators and cloud relay remain deferred.
[Phase 7.4 proposals](PHASE_7_4_AGENT_PROPOSALS.md) add separate desktop consent for supported batches.

Automatic discovery reads credentials afresh for every call, so an MCP process can
remain running while Vite restarts. Browser approval still starts read-only each
session. An explicit session-file argument remains available for isolated tests.
`CENTRA_AGENT_DISCOVERY_FILE` overrides the pointer location for isolated test servers.
Only the latest agent-enabled server in a checkout is discovered; use explicit paths
for simultaneous sessions. Cleanup from an older server cannot delete a newer pointer.

## Phase 7.3.1 expanded modelling tools — 2026-11-06

The strict schemas published by `tools/list` are authoritative. Added:

- `get_capabilities`: implemented tool names, batch command types, availability,
  units, limits and limitations. Read-only, but requires browser connection approval.
- `boolean_create`, `boolean_update`, `boolean_remove`, `get_booleans`,
  `list_booleans`. Update supplies the complete ordered modifier stack; change
  `enabled` to disable/enable and reorder the array to reorder evaluation.
- `array_create`, `array_update`, `array_remove`, `get_array`, `list_arrays`.
  Definitions are the engine's linear/radial definitions, including `scalePerItem`.
  Create may omit definition ID; update requires the returned ID. `unit` is required.
  `spacingModelUnits` is a legacy field name interpreted in that explicit unit;
  radial `pivot` uses the same unit. Radius is the source offset from that pivot.
  Axis is a nonzero vector; angles are radians; count is 1–16. There is no separate
  gap parameter in the authoritative array API. Linear spacing and radial angle/
  pivot provide its supported spacing controls.
- `group_create`, `object_parent`, `object_flag`, `object_duplicate`,
  `object_delete`, `object_rename`, `get_hierarchy`. Null parent detaches while
  preserving world pose. Group duplication is unsupported. Hierarchy snapshot
  transforms use model units; object metadata has explicit mm transforms.
- `part_define`, `part_assign`, `part_remove`, `part_clearance`, `part_mate`,
  `get_part`, `list_parts`, `inspect_parts`, `create_connector`. Physical assembly
  fields end in `MM`; normals and axes use model-world coordinates. Connector
  options include optional independent `socketPositionMM`.
- `inspect_enclosure`, `sample_enclosure`, `update_enclosure`; update takes
  `baseId`, `lidId`, complete `parameters` and optional `dryRun`. Existing recipe
  validation and generated-source preservation/refusals apply unchanged.
- `get_bounds`, `get_source_diagnostics`, `get_geometry_diagnostics`. Source
  diagnostics explicitly return `not_evaluated`. Evaluated diagnostics accept
  `id`, optional `otherId` and `clearanceMM`; STL topology requires a marked part.
  Topology describes the sampled exported mesh; clearance is approximate.
- Explicit `primitive_bake`, `boolean_bake`, `array_bake` tools; no implicit Bake.

Command tools use the command name with its dot replaced by underscore and accept
its documented fields plus `expectedRevision`. Existing friendly primitive and
transform tools remain compatible. `dry_run_changes` aliases `preview_changes`.
Both and `apply_changes` now accept every safe command type in `commandFields` in
`agent-schemas.mjs`, including grouping, flags, Booleans, arrays and assembly edits.
Named references work in nested reference fields through the authoritative API.
Results retain `changes.created/modified/deleted`, aliases and source-cache labels.
Connector generation, part inspection, selection and enclosure recipes are excluded
from batch schemas; connector and enclosure calls retain their own atomic engine
transactions. No adapter transaction implementation was introduced.

For example, append this to a batch after creating aliases `body` and `cutter`:

```json
{"command":{"type":"boolean.create","id":"$body","sourceId":"$cutter","operation":"difference"}}
```

Standalone equivalent (use actual IDs and the latest revision):

```json
{"expectedRevision":"LATEST_REVISION","id":"BODY_ID","sourceId":"CUTTER_ID","operation":"difference"}
```

Geometry queries and sampled inspection are read-only. `inspect_parts` additionally
requires an exact revision; it uses the same bounded diagnostics path and can return
primary-part topology too. Dry-runs still require editing permission. All mutations
retain backend effective visibility/lock checks and explicit show/unlock recovery
semantics. The bridge's existing authentication, origin checks, deadlines, size,
cancellation and editor-lifetime controls are unchanged. Capability limits are
admission ceilings, not guaranteed simultaneous capacity. No actual printer fit
or physical Quest acceptance is claimed.


## Phase 7.4 plan tools — 2026-11-06

See [proposal usage and exact limitations](PHASE_7_4_AGENT_PROPOSALS.md).
`propose_changes` accepts `{expectedRevision,title,description,steps}` and returns
an isolated preview plus proposal ID. `get_proposal`, `cancel_proposal`, and
`apply_approved_proposal` accept only `{proposalId}`. Only the browser user can
approve; no MCP tool can approve or edit retained commands. Editing means cancel
and submit a revised plan, with a new preview and consent. Approval expires after
two minutes and never overrides stale revision/editor identity or write permission.
Recipes are supported through separately approved standalone `propose_enclosure`; connectors remain excluded from proposals. Ordinary immediate write tools
retain their existing contracts.


Desktop access now starts behind a small sparkle button in the lower-left corner.
Click it to approve the connection or review a plan; the green dot indicates an
approved connection. Incoming proposals never open the panel automatically. Enabling
editing collapses it. Per-plan approval remains separate from the general write grant.


## Tapered cylinders and source scaling — 2026-11-06

Primitive create/update and command/proposal batches accept cylinders with independent
end diameters, for example `{ "kind":"cylinder", "topDiameter":10,
"bottomDiameter":20, "height":30 }` in the request's explicit unit. Top means local
+Y, bottom local −Y. Legacy `{kind:"cylinder",diameter,height}` still creates a straight
cylinder. If `diameter` is supplied with one end override, the other end uses that
legacy diameter. Inspection includes the resolved legacy fallback and explicit ends.
All diameters remain positive and retain the engine's dimension/aspect/resource limits;
zero-radius cone tips and elliptical ends are excluded. Use tapered sources as editable
Boolean cutters for flared/countersunk openings.

`scale_primitive({expectedRevision,id,factors:[x,y,z]})` multiplies local source
dimensions in one Undo transaction and preserves pose. Boxes allow independent XYZ;
cylinders allow independent axial Y and radial X/Z with X=Z, preserving both end
radii proportionally; spheres/ellipsoids allow independent XYZ dimensions. This differs from `scale_object`,
which sets world scale and retains the engine's uniform-transform edit restrictions.
For an approved proposal, supply the desired dimensions through `primitive.update`;
`scale_primitive` is a convenience immediate tool, not a new batch command type.

Tapered source/original metadata writes native `.form` v17. Existing projects without
those fields retain their earlier versions. Older apps refuse v17 rather than showing
a straight cylinder with the wrong geometry. Current native open, recovery, Undo/Redo
and source geometry use the same validated source contract.


## Stretched spheres / ellipsoids — 2026-11-06

The sphere source now supports independent local dimensions, including through strict
primitive command schemas and approved proposal batches:

```json
{"kind":"sphere","width":40,"height":20,"depth":10}
```

The request still supplies explicit `unit`. Legacy `{kind:"sphere",diameter:20}`
remains a round sphere with byte-compatible source sampling. Optional `diameter`
is a fallback for unspecified dimensions; if it is absent, all three dimensions
must be present. Returned validated metadata resolves the fallback diameter too.
`scale_primitive({expectedRevision,id,factors:[1.5,1,2]})` stretches each local sphere
axis independently while preserving pose and stable ID, with one Undo entry.
Use `primitive.update` with explicit dimensions inside an approved plan. World
`scale_object` edits still require uniform XYZ; source dimensional stretching is the
supported path. This does not change arbitrary sculpt-layer/group affine scaling.

Desktop Primitives and VR numeric fields show Width, Height and Depth for spheres;
source Scale handles edit the individual local axis. Unequal dimensions are evaluated
as an ellipsoid by a bounded 56-iteration closest-point distance solve, including
centre/medial-axis cases. Geometry, directional support, conservative staging,
STL/GLB exports and source-cache validation share the resulting source dimensions.
The existing positive-dimension and 8:1 aspect/resource admission limits remain.
Native `.form` v18 is used when source/original sphere axis overrides are present;
older tags with those fields are refused. Ordinary spheres keep earlier versions.
No new metadata is used for MCP access, consent or scaling history.


## Phase 7.4.1 — recent changes and remembered editing choice

Open the sparkle panel for Recent changes and Show me navigation after agent commits.
The last 20 attempts are session-only, clearing on revocation/lost connection/editor
replacement. Successful visible changes receive a two-second presentation outline;
previews and failures do not. No additional MCP read or write tool is introduced.

Remember editing choice on this browser is an optional desired-mode preference.
Choose it beneath Allow editing, then set editing as desired. New connections still
require Approve connection; that explicit click can restore the saved edit/read
choice. The preference stores only `edit`/`read` locally for this browser origin,
never actual access or proposal consent. Unchecking removes it; blocked storage
falls back to read-only defaults. This preference is an exception to earlier
statements that no agent UI preference is stored; native/recovery data are unchanged.
Full guide: [Phase 7.4.1 feedback](PHASE_7_4_1_AGENT_FEEDBACK.md).

## Phase 7.2 attachment tools — 2026-11-07

Read-only `enclosure_anchors`, `list_enclosure_features`, `get_enclosure_feature`
and standalone `set_enclosure_feature` / `remove_enclosure_feature` use the shared
typed recipe. `propose_enclosure` accepts `feature-set` / `feature-remove` recipes
with separate browser consent. Strict schemas, grants and loopback policy remain.
Recipes stay outside mixed command batches. [Exact contracts](PHASE_7_2_FEATURES.md).

## Phase 7.4.2 visual inspection — 2026-11-07

Read-only `capture_scene_preview({expectedRevision?,viewpoint?,width?,height?})`
returns a model-only PNG **MCP image block** and structured provenance. Six preset
angles, default 384², 64–512 pixels per edge, 512 KiB PNG maximum. Whole visible
model only; neutral untextured material, no references, guides or UI. Uses current
browser geometry and a separate camera; Boolean/array captures require a ready
Boolean display. Pending/stale/busy/XR/context loss refuse without stale imagery.
The 64 KiB JSON request limit is unchanged: one exact-owner/job authenticated binary
PNG upload carries the image separately; capture HTTP responses cap at 768 KiB.
No write grant, source evaluation, view switch or additional background polling.
Use with `get_geometry_diagnostics` and source accuracy labels. Screenshots cannot
establish watertightness, exact dimensions or physical fit. Full contracts, resource
limits, errors and repeatable smoke: [visual inspection guide](PHASE_7_4_2_VISUAL_INSPECTION.md).
