# Phase 8.6e — MCP enclosure performance follow-up (2026-11-23)

## Before and after

Measurements used disposable Chromium contexts and the actual MCP stdio client,
HTTP bridge and editor. Each row has one warmup and five completed measured
trials per configuration. All variants use a 500 ms proposal polling interval. The sequential and combined workflows end at the
same geometry. The full-status variant and A–C use the same fixture on both runs, with the
diagnostics-only reference option restoring the previous per-batch mesh yield cadence. The
original checkout and repaired harness supplied the first two before rows.

| Workflow | Wall time p50 / p95 (s) | MCP calls p50 / p95 | Source processing p50 (s) | Peak JS heap p50 / p95 (MB) | Approvals / Undo entries |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sequential recipes | 34.72 / 38.32 → 23.91 / 24.29 | 51 / 56 → 37 / 37 | — → 1.82 | 59.7 / 69.3 → 62.5 / 73.8 | 5 / 5 |
| Combined create · compact | 18.74 / 18.81 → 11.28 / 11.35 | 27 / 27 → 17 / 17 | — → 0.89 | 69.8 / 71.6 → 62.8 / 66.9 | 1 / 1 |
| Combined create · full | 17.29 / 17.32 → 11.25 / 12.01 | 25 / 25 → 17 / 18 | 0.90 → 0.90 | 65.1 / 66.2 → 63.1 / 64.6 | 1 / 1 |
| A · Basic | 8.99 / 9.03 → 7.57 / 9.04 | 14 / 14 → 12 / 14 | 0.52 → 0.52 | 69.1 / 70.1 → 60.1 / 72.7 | 1 / 1 |
| B · Electronics | 22.46 / 22.97 → 17.19 / 17.82 | 32 / 33 → 25 / 26 | 1.28 → 1.27 | 64.9 / 66.6 → 66.5 / 70.5 | 2 / 2 |
| C · Editing | 32.72 / 33.48 → 22.64 / 25.97 | 46 / 47 → 33 / 37 | 1.88 → 1.85 | 68.6 / 69.8 → 61.1 / 69.0 | 3 / 3 |

Arrows show before → after. Source processing is renderer elapsed time across
source-cache and source-mesh spans after subtracting measured scheduling
yields. It approximates active processing. The initial comparison lacked mesh
yield timings and OS CPU time was unavailable. Heap is sampled every 500 ms and
covers Chromium JavaScript heap. Native allocations, GPU allocations and peaks
between samples are outside that metric. With five samples, nearest-rank p95 is
the largest sample. The full-status variant fetches the complete proposal in
place of the compact status at the same interval.

A creates a base and removable friction-fit lid with standard walls and floor.
B uses rounded corners, front and rear openings and four bored mounting posts.
Its two approvals keep every expanded batch inside the 64-command limit.
C creates an enclosure with mounts and a cutout, increases its depth, then
moves and resizes the cutout. C compares attachment source IDs across both
edits. Each warmup for A–C undoes and redoes the plan, downloads a native
`.form`, imports and opens it from the disposable Library, then re-inspects
parameters and feature links using the new project IDs.

## Timing attribution

For the electronics fixture, median total source display-mesh elapsed time
fell from **14.22 s** to **8.79 s**.
Measured waits within that span fell from **13.25 s**
to **7.84 s**. Timer turns went from
**486** to **232**
per workflow. The source mesher continues checking cancellation, geometry and
memory after every bounded rebuild. It groups cheap rebuilds into roughly
3 ms time slices for approved enclosure recipes and yields at the end of each
source.

| Stage | Optimised B measurement |
| --- | ---: |
| Bridge queue, p50 per call | 163.78 ms |
| Bridge dispatch through browser result, p50 per call | 80.82 ms |
| MCP response parse, p50 per call | 0.12 ms |
| MCP text serialisation, p50 per call | 0.01 ms |
| Scene summary + inspection, p50 summed browser time | 1.4 ms |
| Proposal staging / batch validation / dry-run clone, p50 summed | 5.4 / 0.7 / 578.8 ms |
| Recipe expansion, p50 summed | 1.7 ms |
| SDF caches, p50 summed elapsed / yielded | 3.30 / 2.98 s |
| Commit / UI refresh, p50 summed | 0.0 / 10.1 ms |
| Background Boolean rebuild spans, p50 summed | 5552.8 ms |
| Compact proposal retrieval, p50 summed browser time | 2.8 ms |

Client wall times include stdio and the local HTTP bridge. Bridge queue time
ends when the bridge dispatches the job in response to the next editor poll. The browser
measures tool execution and result upload separately. Poll requests and the
500 ms client sleeps overlap source computation, so adding these spans would
double-count time. The result payload and display progress remain compatible
with existing clients. In the combined workflow, the median number of status
calls fell from 23 to 13, and the reconstructed MCP response payload fell
from 68.5 KB to 62.1 KB per workflow. Full-status polling after optimisation
returned 557 KB at the same median call count and nearly the same wall time.
Compact polling saves response bytes in this comparison.

Keep using one combined proposal when the recipe fits the command, geometry
and memory limits. Reuse the returned revision and the compact applied
result's part and attachment IDs for dependent requests. Event-driven
completion could trim the final poll interval and queue wait. The current evidence supports retaining the existing bridge protocol. Measure
a lower-overhead cooperative yield against the remaining mesh waits before
adding transport infrastructure.

## Reproduce and verify

```sh
AGENT_BENCHMARK_REPORT=/tmp/enclosure-after.json npm run benchmark:agent:enclosure
AGENT_BENCHMARK_REPORT=/tmp/enclosure-reference-workflows.json npm run benchmark:agent:enclosure -- --reference-mesh-scheduling
AGENT_BENCHMARK_REPORT=/tmp/enclosure-full-status.json npm run benchmark:agent:enclosure -- --full-status
AGENT_BENCHMARK_REPORT=/tmp/enclosure-scenarios.json npm run benchmark:agent:enclosure -- --scenarios
AGENT_BENCHMARK_REPORT=/tmp/enclosure-reference.json npm run benchmark:agent:enclosure -- --scenarios --reference-mesh-scheduling
AGENT_BENCHMARK_REPORT=/tmp/enclosure-full-reference.json npm run benchmark:agent:enclosure -- --full-status --reference-mesh-scheduling
```

The harness records per-trial client durations and payload bytes, bridge queue
and dispatch, and opt-in browser stage timings. It uses fresh project storage
and requires explicit connection and plan approval clicks. Five successful
trials per workflow are required. Failed flows are listed separately from
wall-time distributions. Use `AGENT_BENCHMARK_PORT` to choose an unused port
if the default 5198 is occupied. The heartbeat and operation deadlines retain their
existing limits. The earlier “Parametric box” hidden-option selector is absent
from the current smoke.

- Focused MCP/enclosure suite passed **58/58**. Coverage includes
  cancellation, duplicate apply, stale revisions, expiry, rollback, geometry
  admission and recovery.
- `npm run check` passed format, lint, strict TypeScript, production build and
  **1794/1794** tests.
- The full MCP-to-browser smoke passed on an isolated retry with the installed Chromium executable. The first run reached evaluated diagnostics and was cancelled at its deadline.
- The enclosure transport safety smoke verified interrupted apply rollback, explicit approval, cancellation, duplicate apply, stale revision rejection, sampled dimensions and atomic Undo.
- Desktop Chromium results cover geometry definitions, native project round
  trips and transaction behaviour. Physical Quest and print validation remain
  outside this measurement.

---

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
