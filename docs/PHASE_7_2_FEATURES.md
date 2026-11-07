# Phase 7.2 — associative enclosure features

2026-11-07. A bounded first implementation of named face constraints, editable wall
ports and user-specified floor mounting posts. Existing absolute Boolean cutters
are **not** inferred to be associative. No board/connector specification is supplied.

## Desktop and Quest workflow

Open **Enclosure**, select an existing Base/Lid and **Edit selected enclosure**.
Expand **Cutouts & mounting**. Choose New feature or an existing named
attachment. Set Wall cutout or Floor mounting posts; every length is in **mm**.
Choose **Preview attachment**, review unpickable orange cutters/green solids, then
**Apply attachment**. Existing entries can be edited, or **Preview removal** followed
by Apply attachment. Cancel discards staging. Choose one to four posts and enter each X/Z mounting centre in the numbered rows.
These are user dimensions, not confirmed hardware data.

After a normal enclosure dimension preview/apply, attachments recompute in the
same atomic transaction. A failed attachment reflow refuses the whole resize. Moving
or rotating the Base moves its feature sources through ordinary hierarchy transforms;
independent Lid movement is retained. Base and Lid remain independently printable.

Quest: **World Settings → Measure & Precision → Primitives → Enclosure** retains
its numeric keypad and preview/apply/cancel workflow. Saved attachments reflow there,
and ordinary Base transforms move them. The enclosure menu identifies desktop
attachment authoring. Adding/editing individual attachments in VR is deferred; no
controller, wheel, Cut, handedness or Support-guide routing is replaced. Physical
Quest acceptance and performance testing remain pending.

## Frames and names

Anchors are stable semantic IDs scoped by the chosen Base/Lid IDs:

| Anchor | Local outward normal N | Local horizontal U |
| --- | --- | --- |
| `enclosure.base.wall.front` | +Z | +X |
| `enclosure.base.wall.right` | +X | −Z |
| `enclosure.base.wall.back` | −Z | −X |
| `enclosure.base.wall.left` | −X | +Z |
| `enclosure.base.floor` | +Y (into cavity) | +X |
| `enclosure.lid.top` | +Y | +X |

Wall origins are horizontally centred on the **outer** wall, at the inside-floor
height. V is +Y, U×V=N. `uMm` is signed distance from horizontal wall centre;
`vMm` is height above the inside floor. Values remain constant across enclosure
width/depth/height/wall/floor changes. They are centre offsets, not edge offsets or
percentages. Floor origin is the inside-floor centre; mounting centres are local
X/Z coordinates, centred rather than edge-constrained. Lid top is relative to its
own plate-centred root. No source or board anchor exists without its definition;
this version supplies no board reference system or general constraint solver.

Rectangle width follows U, height follows V; square corners only. Round openings
require equal width/height (diameter); their cylinder +Y axis follows N. Rectangle
cutter +Z follows N. The cutter centre is half a wall inward from the outer wall,
plus `insetMm` inward. Cutter depth is wall + twice `max(0.1 mm, wall/10)` + twice
inset. Thus its outer end extends beyond the outer wall by the margin and its inner
end beyond the inside wall by margin + twice inset, including after wall edits.
Inset is extra inward traversal, not a blind-pocket depth. Depth is recomputed,
never left at an obsolete absolute thickness.

Openings must be wholly inside the straight wall span and strictly above the floor
and below the rim. Inner corner-radius zones are conservatively excluded; tangent
contacts, corner wraps, floor/rim overlaps, rounded ports, blind pockets, floor/lid
cutouts and edge-based constraints are deferred. Native source/aspect/budget limits
can further refuse otherwise geometrically valid inputs. Overlapping independent
cutouts are ordinary ordered CSG; there is no port collision/clearance certification.

## Mounting patterns

One to four explicit centres generate independent editable cylinder posts with
nested live bore subtraction, unioned into the Base after its existing operations.
Each post consumes two layers, one solid and one bore; each cutout consumes one.
Four posts + one cutout + a five-source enclosure + the starter layer use **15** of
16 layers. A second cutout reaches 16; another source refuses atomically. No layer
cap, voxel memory limit, 192³ resolution or 600,000 STL triangle limit is relaxed.
No unbounded implicit duplication or cross-part sources are generated.

Outside diameter must exceed bore diameter. Posts stay inside conservative straight
cavity bounds, may not overlap each other, and must stop below the reserved lid-lip
region. Floor offset currently must be **zero**; floating, underside or board-relative
standoffs are deferred. A post extends `min(floor/2,0.5 mm)` into the floor for positive
union overlap. Its bore extends 0.1 mm beyond each post end; it is a bore in the post,
**not a through-floor screw hole**. Height is measured from the inside-floor surface.
Resizing moves the floor-relative Y and root pose, retaining explicit X/Z centres.
It does not scale centres to pretend to follow an unspecified board edge.

## Local typed API

```ts
const options = { expectedRevision: api.revision, signal };
const anchors = api.enclosure.anchors(baseId, lidId);
const listed = api.enclosure.features(baseId, lidId); // detached definitions/source IDs
const result = await api.enclosure.setFeature(baseId, lidId, {
  kind: "cutout", name: "User port", anchor: "enclosure.base.wall.front",
  shape: "rectangle", uMm: 0, vMm: 5, widthMm: 4, heightMm: 3, insetMm: 0,
}, options);
// attachment ID is sourceIds[0], stable across reflow and Undo/Redo.
// Omit attachmentId to create; supply it to edit the complete definition.
await api.enclosure.setFeature(baseId, lidId, {
  kind: "mounting", name: "User mounting centres", anchor: "enclosure.base.floor",
  centresMm: [[-5,-4],[5,-4],[-5,4],[5,4]],
  outerDiameterMm: 3, boreDiameterMm: 1.5, heightMm: 4, floorOffsetMm: 0,
}, { expectedRevision: api.revision, dryRun: true, signal });
await api.enclosure.removeFeature(baseId, lidId, attachmentId,
  { expectedRevision: api.revision, signal });
```

Results contain ordinary batch aliases and changed IDs, complete features/source
IDs, anchors, enclosure plan/dimensions and `physicalFit: "unknown"`. Listing/getting
features is detached intent inspection; query actual source metadata separately.
A dry-run validates source caches, not evaluated topology. Abort/revision/lock/busy,
source memory, layer capacity and rollback use the Phase 7.0 leased batch boundary.
One successful create/edit/remove or enclosure reflow is one Undo/Redo action. A
pattern is all-or-nothing. There is no adapter-specific geometry or transaction.

Feature type/shape and centre-count conversion require removing/recreating the
feature; IDs otherwise remain stable. Explicit source editing remains available
through Primitives, transforms and live Booleans until a confirmed recipe rebuild,
which restores the feature's declared dimensions/pose (the existing 7.1 rebuild
convention). Feature-only edits do not regenerate unrelated enclosure sources.
Names, source IDs, extra operations/order and enabled flags are retained; disabled
feature Booleans remain disabled. Locked/hidden sources refuse rebuild. Baked,
arrayed, detached, missing or type-changed feature sources or removed/retyped
required Boolean operations refuse; they are not silently repaired. Restore/Undo
such changes before reflow. Delete associated sources via the feature workflow;
ordinary source Delete refuses to leave dangling intent. Removing a feature also
unlinks incoming modifiers through ordinary deletion semantics.

## Native intent and local MCP

Only projects with attachment metadata write `.form` **v19**. Old projects retain
their applicable versions; missing attachment metadata migrates as no attachments.
Old tags with attachment fields reject. Strict bounded definitions reject unknown
fields, nonfinite numbers, unsupported anchors, duplicate source IDs, invalid counts,
foreign/missing sources and invalid required Boolean links. Open validates actual
hierarchy links and geometry bounds before publication. Native Save As, immutable
worker recovery and Project Library duplication retain intent; duplication remaps
source IDs. Single-root recipe duplication retains its existing refusal. General
manual destructive changes outside the recipe can invalidate its structure and
must be restored before reopening/reflow; no auto-association is inferred.

The optional local development MCP adapter adds:

- Read-only `enclosure_anchors`, `list_enclosure_features` with `{baseId,lidId}`;
  `get_enclosure_feature` also takes `attachmentId`.
- `set_enclosure_feature`: `{expectedRevision,baseId,lidId,definition,attachmentId?,dryRun?}`.
- `remove_enclosure_feature`: `{expectedRevision,baseId,lidId,attachmentId,dryRun?}`.
- `propose_enclosure` additionally accepts recipe `{type:"feature-set",baseId,lidId,
  definition,attachmentId?}` or `{type:"feature-remove",baseId,lidId,attachmentId}`.
  Browser approval of the exact retained standalone transaction is still required.

Schemas are strict; read queries do not require write permission. Mutations/dry-run
require editing. These standalone recipes cannot be nested in `apply_changes` or
mixed with unrelated operations; no cross-recipe atomicity is claimed. The retained
Phase 7.4 proposal boundary invokes their authoritative isolated dry-run and apply.
Authentication, 127.0.0.1 origin/bridge, cancellation, browser approval and per-plan
consent remain unchanged. Production has no agent networking, WebMCP, cloud, QR
pairing, Quest synchronisation or board-spec downloads.

## Accuracy and verification

Preview wireframes/source caches are analytical design intent. Final STL samples
ordered live CSG; source cutters are consumed, not exported as extra shells. Native
source preservation does not certify final mesh topology. The existing per-part
export checks actual evaluated Float32 STL connectivity, bounds and winding and can
refuse memory/topology/resolution even when a source preview succeeds. A **0.3 mm**
lid gap may be smaller than sampling spacing; it is never a guaranteed tolerance.
Reports retain unsupported self-intersection/minimum-wall checks. Printer/material,
slicer acceptance, board fit and real clearances remain unknown; inspect in the
intended slicer and print a tolerance coupon. Physical Quest and print tests pending.

Focused tests: `npm test -- enclosure-features enclosure-recipe agent-access`.
Full checks: `npm run check`. Browser smoke: `npm run test:agent:browser` includes
staged UI authoring and a separately approved associated-port edit. See the dated
six-part handover for actual run results and the host Chromium launch limitation.
