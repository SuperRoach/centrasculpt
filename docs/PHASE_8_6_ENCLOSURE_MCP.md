# Phase 8.6a/8.6b — Enclosure MCP performance and common flows

Date: 2026-11-18

## Outcome

Measured actual local MCP stdio calls through the temporary HTTP bridge into a
disposable Chromium editor. Added one atomic enclosure + cutout + mounting
proposal, faster dry-run source validation, optional asynchronous preview/apply
status and compact proposal polling. The existing explicit browser approval
remains the point of consent. No screenshots were captured; authentic cropped
desktop and Quest images remain deferred until PC use.

## Measurement

The complete three-trial comparison used actual MCP transport and ended at the
same enclosure, cutout and mounting definitions and dimensions. The sequential
path created and inspected the enclosure, added a cutout and posts, resized the
enclosure, then updated the cutout. The combined path created the enclosure,
cutout and posts in one proposal at the same final dimensions, then inspected
it.

| Flow | Wall time p50 | Tool calls p50 | Approvals | Undo entries |
| --- | ---: | ---: | ---: | ---: |
| Sequential recipes | 38.23 s | 77 | 5 | 5 |
| Combined create proposal | 24.48 s | 50 | 1 | 1 |

The combined flow was 36% shorter with 35% fewer calls; approvals and Undo
entries each fell by 80%. A later compact-polling rerun completed all three
combined trials at 25.50 s p50 and 36 calls. Its sequential refresh stopped in
trial one when the editor heartbeat expired. Those partial sequential timings
are not treated as a comparison. The raw [benchmark JSON](../outputs/phase-8-6/enclosure-mcp-benchmark.json)
records the incomplete refresh and completed combined trials. The earlier full
comparison used identical flows and geometry work; only polling cadence and
response size changed afterward.

In the complete comparison, proposal preview p50 was 677 ms sequentially across
15 previews and 327 ms for the combined preview. Apply p50 was 182 ms across 15
sequential applies and 234 ms combined. Inspection p50 was about 247 ms
sequentially and 240 ms combined. Wall times include MCP stdio, the local
bridge, editor queue and response serialization.

## Bottleneck and implementation

Recipe planning measured around 0.2 ms p50 and UI refresh around 4 ms p50.
Primitive SDF cache evaluation measured roughly 137–179 ms p50. Display-mesh
preparation was usually near zero but reached 1.9–2.1 s p95 per source cache;
batch totals reached roughly 20–22 s p95 in repeated source-heavy proposals.
Repeated display-mesh preparation on isolated preview clones was the justified
target. Dry-run validation now evaluates and validates generated source caches
without preparing derived display chunks. Apply still generates the complete
display mesh. Resource limits, source identity, revision checks, transaction
guards and rollback remain in force.

Enclosure creation accepts up to ten optional feature definitions and builds
the enclosure, lid, cutout/posts and metadata through one validated transaction
and Undo entry. MCP callers can optionally return immediately from preview or
apply, poll status, and request compact status responses. Defaults retain the
previous synchronous and full-response behavior. Apply keeps explicit browser
consent, proposal expiry, revision checks, cancellation and rollback.

## Verification and limits

- Three completed combined trials had matching requested enclosure parameters
  and feature definitions. The benchmark refused apply before approval, then
  applied and undid the atomic change.
- Tests cover combined feature creation, preview non-mutation, unique source
  aliases, feature/schema limits, one-entry Undo/native restore, async status
  and cancellation rollback. Existing coverage includes stale revisions,
  duplicate apply, expiry, tracking and refusal.
- `npm run check` passed formatting, lint, strict TypeScript, production build
  and **1,793/1,793 tests**.
- The repository's existing browser smoke failed before reaching enclosure
  workflows at the hidden “Parametric box” option selector in
  `scripts/agent-smoke.mjs:267`. The dedicated harness used actual MCP stdio
  with a disposable browser/editor. No physical Quest, print-fit or headset
  performance result is claimed.
- Chromium heap estimates were around 39.6 MB in the earlier comparison and
  42.1 MB in the later combined trials. They do not represent source-cache,
  process or GPU memory. The MCP protocol does not expose separate queue,
  validation, transaction and UI timings. Preview validates source caches; it
  does not establish final Boolean topology or physical fit.

## Handoff

1. Repeat the sequential and combined comparison with stable editor heartbeat
   using compact polling, retaining per-trial results.
2. Profile larger safe definitions for admission limits, expiry, bridge timeout
   and cancellation responsiveness.
3. Capture genuine tightly cropped desktop and Quest screenshots at the PC and
   update discoverability documentation. No screenshot work was done here.
4. Keep save/load/export optimisation and Phase 9 sparse-SDF integration
   deferred.
