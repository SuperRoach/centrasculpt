# Phase 7.4.1 — Show Me What Changed

2026-11-07. Desktop, optional development-only local MCP access.

## Recent changes and Show me

Click the lower-left sparkle icon. **Recent changes** shows the most recent 20
agent transaction attempts: description, local time, Applied/Failed outcome, and
expandable object names, IDs and created/modified/deleted status. Failed requests
identify known targets as unchanged. A complete batch or enclosure proposal creates
one row, regardless of its internal command count. Read queries, previews and proposal
staging do not create successful transaction rows. Rejected/expired applies are
Failed, never Applied. No-op writes without a revision change produce no success row.

After a successful commit, visible created/modified objects receive a subtle source
bounds outline for about two seconds. Multiple objects can be highlighted together.
The helpers are independent, unpickable presentation objects, excluded from source
geometry, exports, history and autosave. Reduced motion uses a static outline for
the same duration. A changed source revision removes stale outlines. Outlines hide
while sculpt/transform/XR or other reserved interactions are active. No camera moves
automatically, and no object materials, colours, masks or fields are changed.

**Show me** frames the row's surviving visible affected objects in the desktop
camera. It uses conservative source bounds and the existing OrbitControls path,
keeps viewing direction, and clears old navigation damping. It does not select,
transform or otherwise edit the objects. For multiple surviving objects it frames
their combined bounds. Hidden/deleted/empty/unavailable bounds produce a small
inline message; objects are never shown/unlocked/restored automatically. Active
strokes, transforms, modelling work, modal/precision tools and XR block framing.
The camera's near/far and orbit distance range may expand to frame a tiny/large
object; this is a navigation change, not a modelling transaction.

History is not an Undo stack and makes no unverified Undo-availability claim.
Ordinary manual Undo may remove an activity's target; its older Show me action then
reports unavailable. Revocation, connection loss or editor replacement clears the
activity history and active outlines. Page exit disposes the helpers/animation.
The list is session-only: no project, browser-storage or recovery history is written.
No `get_recent_changes` tool was added; this phase prioritises browser feedback.

## Optional remembered editing choice

Under **Allow editing**, enable **Remember editing choice on this browser**, then
choose the desired editing state. On the next explicit **Approve connection**, the
chosen mode is restored, so editing need not be enabled again separately. This
option is off by default. A new connection is never approved automatically, and
proposal consent remains explicit and independent.

This user-requested preference is the sole new persisted item: the localStorage key
`centra.agent.editing-choice` contains only `edit` or `read`. There are no tokens,
session IDs, activity entries, object data, actual grants or proposal approvals.
Uncheck the option to remove it. Storage errors fall back to an unremembered,
read-only connection. Storage is local to that browser/profile and editor origin;
`127.0.0.1:5173` and another port have separate preferences. Revoking access clears
actual grants/activity but preserves an opted-in desired editing choice.

## Implementation and verification

`agent-activity.ts` holds detached bounded session rows. The optional executor
observer snapshots before/after metadata and reports only confirmed authoritative
results, outside engine transactions. Feedback/refresh errors cannot turn a committed
result into a modelling failure. `agent-feedback.ts` reuses assembly-style Box3Helper
outlines and read-only source bounds; `agent-browser.ts` owns the panel and lifecycle.
Main passes existing scene/navigation handles only inside the dev-only import gate.
No SDF engine or project persistence changes were made.

Host tests cover commit/create/transform/delete, one row/Undo per approved batch,
preview/rejection/stale/busy failures, detached bounded history, session clearing,
reduced motion, multiple helpers, lifetime expiry, unpickability, geometry/history/
selection preservation, exact framing projection and hidden/deleted/blocked targets.
Preference tests cover opt-in/defaults, clearing, invalid values and blocked storage.

The standalone Playwright Chromium launch was sandbox-blocked (SIGABRT/EPERM).
The updated smoke script includes activity/framing, persisted desired mode after
reload, disconnect clearing and production-marker checks, but that complete script
was not successfully executed here. Actual supported in-app browser plus official
stdio MCP instead verified: a four-step/two-object batch produced one row and one
Undo; Show me visibly framed both objects with revision unchanged; dry-run added no
success row; stale/expired applies were Failed; a separately approved two-step plan
produced one new Applied row/Undo; a hidden target reported unavailable; disconnect
cleared history and proposal state; and an opted-in editing choice survived a new
page while requiring explicit new connection approval. Screenshots/AX states were
inspected. Reduced-motion and editor-replacement variants are host-tested rather
than claimed as complete physical browser/XR acceptance.

Evidence: ignored `work/phase-7-4-1/`, especially `check.log`, `focused.log`,
`browser.log`, `browser-transcript.log`, `approved-browser.log`. The user authorised
commit/push on 2026-11-07; publication is separate from browser connection consent.
