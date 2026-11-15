# Phase 8.3b — Brush response on a metre-scale branch

2026-11-12 (Australia/Melbourne). Direct comparison of the
[guarded coarse preview](SPARSE_SDF_GUARDED_PREVIEW_RESULTS.md) and
[brush-local exact quota](SPARSE_SDF_LOCAL_EXACT_RESULTS.md).

The renderer replays 268 deterministic edits on the same 1 m branch
at 1 mm spacing. It compares exact FIFO, exact FIFO plus guarded 2 mm
preview, and exact FIFO with a two-chunk brush-local service quota and
an oldest-first deadline. The three policies share the exact edit
field and meshing budget. Each policy runs three times at 45 and
90 offered edits per second, rotating policy order so each policy
occupies each position once per cadence.

The first brush-local draw may be coarse or exact. Exact catch-up
requires the affected revisions to be drawn at full resolution.
Release drain starts when the final edit is committed. The fixture
checks exact final field and mesh checksums. It measures CPU timestamps
around WebGL draw submission in the Quest 3 Browser panel. Display
presentation and immersive WebXR frame timing remain outside these
measurements. A headless SwiftShader run stopped advancing during the
second trial and was stopped before producing a report.

## Quest 3 Browser panel results

All 18 trials completed. Every edit reached a brush-local draw and all
trials ended with 461,818 triangles and identical field and ordered mesh
checksums. Values are medians of three trial metrics. Timings are in ms.

| Offered edits/s | Policy | First local draw p50 | First local draw p95 | Exact catch-up p95 | Release drain | Input-to-commit p95 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 45 | FIFO | 665 | 1,422 | 1,622 | 931 | 706 |
| 45 | Guarded 2 mm preview | 699 | 1,517 | 1,743 | 978 | 790 |
| 45 | Brush-local exact | 681 | 1,430 | 1,640 | 965 | 642 |
| 90 | FIFO | 2,020 | 4,333 | 4,496 | 966 | 3,496 |
| 90 | Guarded 2 mm preview | 2,056 | 4,318 | 4,467 | 921 | 3,566 |
| 90 | Brush-local exact | 1,966 | 4,041 | 4,233 | 935 | 3,308 |

The guard rejected all 5,596 candidate visits at chunk boundaries.
No coarse preview was drawn. The comparison measures the guard's
overhead on this trace and leaves coarse-rendering benefit unmeasured.
At 90 edits/s the local quota reduced median trial p95 by 292 ms
(6.7%). The local policy's per-trial p95 ranged from 3,988 to
4,139 ms, versus 3,935 to 4,339 ms for FIFO. At 45 edits/s the median
trial p95 differed by 8 ms in the other direction.

Every trial reached the 192-chunk pending cap. Median blocked frames
for FIFO and the local quota were 274 and 276 at 45 edits/s, then 529
and 506 at 90 edits/s. Input-to-commit p95 at 90 edits/s reached
3.31–3.57 seconds across the policies. Frame CPU p95 was 12.5–12.8 ms
across all groups, with exact-slice p95 of 4.0–4.1 ms. The release
column starts at the final admitted edit, so it excludes the wait
between the final offered edit and its commit.

**NO-GO for this preview on connected strokes. Keep the local quota
as a research candidate.** The next comparison should measure whether
coalescing offered inputs before admission reduces the queue backlog,
while preserving the exact edit order and stroke path. Use FIFO as
the baseline and report latency from the final offered input as well
as from final commit. Immersive validation and production 8.3c remain
gated.

Focused tests passed 13/13. The sandboxed full check passed
1,753/1,758, and all 30 tests in the three affected loopback files
passed with localhost binding enabled.

## Reproduce

```sh
node scripts/benchmark-paced-renderer.mjs work/paced-renderer/brush-response.html work/narrow-band-perf/cost-aware/growth-exact-3-narrow-cap8-1-1.json --compare
npm test -- guarded-preview coarse-preview dirty-chunk-queue changed-chunks narrow-band
npm run check
```

Open the generated HTML in Chrome, select **Run paced comparison**,
and save the JSON when the fixture reports PASS. The automated run
and raw report are in `work/paced-renderer/brush-comparison.YdSJrF/`.
The Quest USB runner is `quest.sh` in that directory. It serves
`comparison.html` over the temporary USB loopback and writes
`quest-report.json` after all trials pass.
