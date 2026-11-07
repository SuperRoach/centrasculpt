# Phase 7.4 — local agent proposals

2026-11-06. Optional desktop development workflow on the existing Codex/Cursor
stdio MCP connection. Start and approve the connection as described in
[Phase 7.3](PHASE_7_3_LOCAL_MCP.md). Normal `npm run dev` remains agent-free.

## Propose, review, approve, apply

1. Read `scene_summary` and retain its opaque revision. Enable browser **Allow
   editing** before staging: the authoritative source-cache dry-run requires this
   permission even though it does not edit the scene.
2. Call `propose_changes` with `expectedRevision`, a human-readable `title`
   (1–120 characters), `description` (1–2000 characters), and `steps` (1–64 existing
   supported batch commands, with optional named aliases). Strict Zod schemas and
   the existing 64 KiB transport limit apply. Unsupported/forward/duplicate aliases
   and backend admission failures return structured errors.
3. Review the desktop **Agent proposal** panel. It shows operation descriptions,
   additions, edits, deletions, affected names/IDs/source dimensions, and expandable
   exact commands, before-object metadata, source-cache report, limits and errors.
   IDs allocated by preview are provisional. Actual commit returns new IDs/aliases.
4. **The person using the editor approves**, using **Approve this exact plan**.
   Connection approval and the editing switch do not approve a proposal. MCP has
   no approval tool or `approved` input. Approval alone does not apply changes.
5. Call `apply_approved_proposal` with the returned `proposalId`. The adapter executes
   its retained immutable commands, never agent-supplied replacement commands. The
   authoritative batch supplies rollback and one Undo entry. The result includes
   actual IDs, aliases, revision, change report, object inspection and read-only
   source diagnostics for surviving created/modified objects.
6. `get_proposal({proposalId})` reads state, preview and retained result.
   `cancel_proposal({proposalId})` or browser **Reject proposal** invalidates consent.
   To **edit**, reject/cancel and submit the complete revised plan against a freshly
   inspected revision. Every revision stages again and needs a new approval. There
   is deliberately no mutable patch to an approved plan.

Example (replace `LATEST_REVISION`):

```json
{
  "expectedRevision": "LATEST_REVISION",
  "title": "Box with a cylindrical opening",
  "description": "Create a 30 mm box and subtract an 8 mm through-cutter; keep both sources editable.",
  "steps": [
    {"as":"body","command":{"type":"primitive.create","unit":"mm","source":{"kind":"box","width":30,"height":20,"depth":30}}},
    {"as":"hole","command":{"type":"primitive.create","unit":"mm","source":{"kind":"cylinder","diameter":8,"height":30}}},
    {"command":{"type":"boolean.create","id":"$body","sourceId":"$hole","operation":"difference"}}
  ]
}
```

## Lifetime and failures

One proposal is retained per approved browser session. An unresolved proposal must
be cancelled before replacement. Plans expire **two minutes after receipt**, bound
both to the exact `IndependentLayers` editor instance and expected revision. Scene
changes, Undo/Redo, project replacement, expiry, bridge loss, permission changes,
revocation and page exit invalidate outstanding consent. Apply rechecks permission,
identity, revision, expiry and engine admission. There is no retry or rebase. A
second apply cannot commit again. Read/cancel controls remain usable when the
editor is busy; apply and staging refuse strokes/modals/leases/recovery operations.

Browser cancellation aborts cooperative staging/apply. The bridge admits one request
at a time; an MCP cancellation tool cannot overtake an already executing request.
Use browser Reject, request cancellation, or revoke access for in-flight work.
Existing 10/12/15 second request deadlines remain; long previews can time out.
Failure after partial backend work rolls back through the existing batch checkpoint.
Transport loss after commit can lose the response: inspect the scene before doing
anything else. Do not infer failure means the transaction never committed.

Selection is retained if its object/group survives; deleting the selected object
uses the engine's ordinary fallback. Existing flags remain subject to effective
locks/visibility; changing them requires explicit plan commands. The proposal batch
preserves selection before closing its history transaction. Unapproved staging does
not invoke the editor change callback, autosave, export or native persistence.
After commit ordinary local recovery/autosave applies. Proposals/auth/consent never
persist in `.form` or recovery metadata.

## Geometry and scope

The preview is inspectable source data and a diff, not a rendered final mesh. Source
sizes/poses and conservative bounds do not include evaluated Boolean/array geometry.
Dry-run validates source caches only. Post-commit source diagnostics explicitly say
`not_evaluated`; use `get_geometry_diagnostics` separately for existing bounded sampled
clearance and exported-mesh topology checks. Their reported sampling spacing/accuracy
and physical-fit limitations still apply. No global wall-thickness or printability
certification, preview screenshot service, or interactive/Quest overlay is added.

Supported proposals are either a command batch or **one standalone enclosure recipe**.
`propose_enclosure` accepts `{expectedRevision,title,description,recipe}` where
`recipe` is `{type:"create",parameters}` or `{type:"update",baseId,lidId,parameters}`.
It uses the same review/approval/apply lifecycle and the recipe's authoritative
isolated dry-run and single transaction. Recipes cannot nest in command batches.
Connectors remain standalone immediate Phase 7.3 tools, excluded from proposals.
Separate operations require separate review; no cross-operation atomicity is claimed. Phase 7.2 associative face-relative
cutouts, mounting patterns and constraints are still absent. Explicit Boolean cuts
are supported; they do not follow resized faces automatically.

Existing immediate write tools remain compatible and still require the write grant;
the proposal tools provide additional per-plan consent. This is not an AI provider
integration or a sandbox for arbitrary agent programs. No file/code/export tool,
cloud, WebMCP, LAN, pairing, Quest synchronisation, or persistent agent metadata.
Transport remains dev-only authenticated `127.0.0.1` plus stdio, one browser owner,
ephemeral credentials, read-only connection defaults and production import isolation.

## Verification evidence

Host regression tests are in `tests/agent-access.test.mjs`; `npm run check` runs
Biome, strict TypeScript, production Vite and the full suite. `npm run test:agent`
includes official stdio SDK subprocess tests. `npm run test:agent:browser` now
exercises propose/refuse/reject/resubmit/approve/apply/duplicate apply, post-commit
inspection and one Undo in the existing browser smoke.

This session's standalone Chromium smoke could not launch under the host sandbox
(`SIGABRT`/`EPERM`), despite successful permitted loopback tests. A supported in-app
browser plus a real official stdio MCP client instead verified a four-step
box/cylinder/Boolean subtract/linear array plan, unchanged scene revision/object
count and zero Undo during preview, denial before approval, browser approval,
actual commit/IDs/three objects/one Undo, duplicate refusal and one ordinary browser
Undo restoring the original Base. Screenshots and accessible UI were inspected in
that test. This is narrower than the full Playwright script: project-open/recovery,
tab-close/restart, slow-cache cancellation and partial failures were not all repeated
end-to-end in the browser. Host/transport regression tests cover corresponding
cancellation, editor replacement, deadline, rollback and shutdown primitives; no
claim of completing the entire browser failure matrix is made.

Logs: ignored `work/phase-7-4/` (`baseline.log`, `focused4.log`, `quick.log`,
`browser.log`, `final-check.log`). No commit, push or merge authorized.


Desktop presentation follow-up: access starts collapsed behind a small sparkle icon
in the lower-left corner. A green dot indicates the approved connection. Hover for
connection/proposal status; a subtle border/background change indicates a plan needs
review. Click to see operations/diff and approval controls. Incoming work never opens
the panel or takes focus. Enabling editing collapses it again. No persistent consent
or automatic proposal approval was added. The quiet presentation was checked in the
real in-app browser; existing recovery records were left untouched.

Final host verification: Biome/strict TypeScript/Vite and 1,589/1,589 tests passed
(`sparkle-check.log`); focused MCP tests 15/15 passed (`quiet-focused.log`). Expanded
controls cap at 310 px, or 280 px on narrow viewports, with viewport edge clearance.


## Phase 7.4.1 — visible commit feedback (2026-11-07)

Successful commits now briefly outline visible affected objects. The sparkle panel
keeps 20 session-only transaction attempts, with a Show me action to frame surviving
visible objects. Preview/staging does not indicate success; rejected/stale/failed
applies cannot highlight. One approved batch yields one activity row. No automatic
camera movement or Undo-availability claim. Revocation/disconnect/editor replacement
clears transient history and outlines. See [feedback and preference guide](PHASE_7_4_1_AGENT_FEEDBACK.md).

The optional Remember editing choice on this browser stores desired edit/read mode
only. It restores that choice after the next explicit connection approval; it never
stores credentials, actual grants, activity or plan consent. Default remains off.
