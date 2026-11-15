# Phase 8.3b — Ordered brush batching

2026-11-12 (Australia/Melbourne). Follow-up to the
[Quest brush response comparison](SPARSE_SDF_BRUSH_COMPARISON_RESULTS.md).

The same deterministic 268-edit, 1 m branch at 1 mm spacing runs at
45 and 90 offered edits per second on the Quest 3 Browser panel.
FIFO publishes each admitted edit and services the queue after up to
three edits per frame. It already coalesces keys that are pending.
The alternatives stage up to four or eight already-due edits in a
single batch, with a soft 4 ms preparation cutoff. Each staged edit
reads earlier edits through a sparse overlay. An admissible prefix
publishes its patches in their original order and inserts each dirty
chunk key once. Queue capacity, exact slice limits and the output
checksums are shared across all policies.

A batch that cannot admit its next edit discards that staged edit and
retries it on a later frame. FIFO retains its prepared blocked edit.
This extra staging work is part of the measured implementation cost.
Each policy runs three times per cadence in rotating order. Times
measure CPU draw submission, including wait from the offered input.
The two end-of-stroke metrics start at the last offered edit and the
last committed edit respectively. Neither includes immersive
compositor or physical input timing.

## Results

All 18 Quest panel runs produced the same final exact field and
ordered mesh checksums, with 461,818 triangles. Values are medians
of three trial metrics. Timing columns are in ms.

| Offered edits/s | Policy | Input-to-commit p95 | Local draw p95 | Exact draw p95 | Final offered input to exact | Final commit to exact | Frame CPU p95 | Chunks serviced |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 45 | FIFO | 616 | 1,389 | 1,600 | 1,653 | 929 | 12.8 | 1,539 |
| 45 | Batch 4 | 1,184 | 2,053 | 2,288 | 2,376 | 926 | 15.5 | 1,542 |
| 45 | Batch 8 | 1,310 | 2,214 | 2,416 | 2,487 | 940 | 15.6 | 1,548 |
| 90 | FIFO | 3,240 | 3,957 | 4,099 | 4,349 | 918 | 13.0 | 1,513 |
| 90 | Batch 4 | 4,007 | 4,912 | 5,091 | 5,320 | 951 | 15.4 | 1,512 |
| 90 | Batch 8 | 4,090 | 4,966 | 5,140 | 5,353 | 899 | 15.7 | 1,510 |

Every run hit the 192-chunk queue cap. The median actual batch size
was one at both rates. At 90 offered edits/s, p95 batch size was two.
No batch exceeded three edits. Serviced chunks stayed within 1% of
FIFO across the groups. Final commit to exact was similar across
policies, while the final offered input took about a second longer
to reach the exact surface with batching at 90 edits/s. The prototype
combines overlay bookkeeping, different per-frame admission limits,
and staging retries. The comparison does not isolate their individual
costs.

**NO-GO for this batch implementation.** Keep FIFO as the research
baseline. Next, profile exact chunk rebuild and draw submission
separately on the device. Use an extraction-only replay as the control
to see how much service rate is lost to drawing the growing scene.
Immersive validation and production 8.3c remain gated.

Focused tests passed 13/13, including exact mixed-mode edit order,
reverse history replay, and queue refusal. The sandboxed full check
passed 1,755/1,760 tests. All 30 tests in the affected loopback files
passed with localhost binding enabled.

## Reproduce

```sh
node scripts/benchmark-paced-renderer.mjs work/paced-renderer/brush-batch.html work/narrow-band-perf/cost-aware/growth-exact-3-narrow-cap8-1-1.json --batch
npm test -- brush-batch guarded-preview dirty-chunk-queue changed-chunks narrow-band
npm run check
```

The automated Quest runner and report are in
`work/paced-renderer/brush-batch.qwdbGq/`.
