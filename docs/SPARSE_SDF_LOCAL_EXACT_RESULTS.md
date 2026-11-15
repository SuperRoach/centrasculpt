# Phase 8.3b.10 — Brush-local exact service in WebGL

2026-11-12 (Australia/Melbourne). Follow-up to the
[guarded coarse-preview study](SPARSE_SDF_GUARDED_PREVIEW_RESULTS.md).

## Fixture

Desktop Chrome runs three paired trials at each of 45 and 90 offered
edits/s, alternating FIFO and brush-local exact service. Each run starts
from empty and replays the same 268 edits on the 1 mm metre branch.
Both use changed-sample dirty coverage, 192 queue slots, up to eight
exact chunks per animation callback, and a soft 2 ms CPU cutoff.

The quota policy can select up to two chunks per slice whose centers
are within 12 mm of the latest brush endpoint. It chooses the nearest
eligible key. When the oldest pending entry reaches eight animation
ticks, FIFO takes precedence until the overdue backlog clears.
Remaining capacity goes to FIFO. Coalescing preserves first-enqueue
age. Release clears brush focus for the subsequent drain. The age
threshold changes service order and gives overdue keys precedence.
Throughput still bounds how quickly an overdue key can be served.

Brush-local and exact completion metrics use the
[same draw-submission proxies](SPARSE_SDF_RENDERER_RESULTS.md). Local
latency includes only drawn revisions, which can supersede intermediate
edits. Queue age counts first enqueue to service in animation ticks.
Release drain starts at the final commit. The run measures desktop
CPU and draw submission. It leaves pixel visibility, GPU completion
and Quest acceptance open.

## Results

All 12 desktop Chrome 156 runs submitted an exact brush-local draw for
each of 268 edits. All ended with 461,818 triangles and identical
exact field and ordered mesh checksums. No run blocked on admission.

Values are medians of three per-run metrics. The local and exact columns
measure from the edit's due time.

| Offered edits/s | Policy | Local p50 (ms) | Local p95 (ms) | Exact catch-up p95 (ms) | Release drain (ms) | Frame CPU p95 (ms) | Pending age p95 (ticks) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 45 | FIFO | 8.62 | 12.77 | 34.12 | 11.90 | 4.20 | 2 |
| 45 | Local quota | 7.14 | 11.66 | 35.09 | 20.20 | 4.30 | 2 |
| 90 | FIFO | 22.71 | 53.70 | 80.01 | 51.90 | 4.20 | 8 |
| 90 | Local quota | 9.12 | 48.84 | 85.49 | 52.30 | 4.30 | 9 |

At 90 edits/s, the median brush-local draw improved in every pair.
The three paired changes to local p95 were +1.74, −3.53 and −7.43 ms.
Release drain ranged from 43.5 to 59.1 ms with the quota versus
51.4 to 52.3 ms with FIFO. At 45 edits/s the release medians differed
by 8.3 ms, with a 10.7–26.0 ms range for the quota. Each trial has one
release observation.

The quota used 1,423 brush-local selections out of 8,266 successful
services at 90 edits/s. Oldest-first override ran 4,080 times. The
oldest pending key observed at service was 11 ticks in both policies.
At 45 edits/s the quota made 4,054 local selections out of 14,769
services and the override did not trigger. A focused test verifies
the two-key limit and overdue precedence.

## Decision

**Carry the local quota as a candidate for device comparison. Keep
FIFO as the exact baseline and production 8.3c gated.** The quota offers
a consistent improvement in typical brush-local draw on the desktop
high-rate trace. Tail improvement varies, full catch-up is later, and
release is less consistent. The next useful gate is the same isolated
comparison at headset cadence, with end-to-end frame and mesh publication
measurements before any editor integration.

Focused tests passed 13/13 and quick tests passed 21/21. Full check
passed format, lint, strict types and build, then 1,748/1,753 tests
passed. Five loopback tests failed on sandbox `listen EPERM`.

The [Quest fixture and device attempt](SPARSE_SDF_QUEST_FIXTURE.md)
record the current room-tracking blocker and resume commands.

## Reproduce

```sh
node scripts/benchmark-paced-renderer.mjs work/paced-renderer/local.html work/narrow-band-perf/cost-aware/growth-exact-3-narrow-cap8-1-1.json --local
npm test -- dirty-chunk-queue guarded-preview coarse-preview changed-chunks narrow-band
npm run test:quick
npm run check
```

Open the generated HTML in foreground desktop Chrome, select **Run
paced comparison** and download the JSON after PASS. Raw evidence is
`work/paced-renderer/local-report.json`.
