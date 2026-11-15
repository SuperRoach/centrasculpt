# Phase 8.3b — Exact meshing budget with drawing enabled

2026-11-12 (Australia/Melbourne). Follow-up to
[exact extraction and draw submission](SPARSE_SDF_BRUSH_EXTRACTION_RESULTS.md).

The Quest 3 Browser panel replays the same 268 ordered edits on a
1 m branch at 1 mm spacing. All policies draw every animation callback,
use FIFO, and share the 192-chunk pending cap and eight-chunk service
cap per callback. The only policy variable is the soft exact-meshing
cutoff of 2, 4, or 6 ms. A chunk can finish after the cutoff because
the scheduler checks time between chunks. Each policy runs three times
at 45 and 90 offered edits per second, rotating order within each rate.

The fixture measures CPU timestamps around WebGL submission. The
11.11 ms threshold is the CPU time corresponding to a 90 Hz frame
period. The percentage above that threshold is not a count of dropped
frames. Neither the headset compositor nor GPU completion is measured.

## Reproduce

```sh
node scripts/benchmark-paced-renderer.mjs work/paced-renderer/brush-budget.html work/narrow-band-perf/cost-aware/growth-exact-3-narrow-cap8-1-1.json --budget
npm test -- brush-batch guarded-preview dirty-chunk-queue changed-chunks narrow-band
npm run check
```

The Quest runner, raw JSON and summary script are in
`work/paced-renderer/brush-budget.xv3h8N/`.

## Results

All 18 trials completed with identical exact field and ordered mesh
checksums and 461,818 triangles. Values are medians of three trial
metrics. Timing columns use ms.

| Edits/s | Soft cutoff | Local draw p95 | Last offered edit to exact | Chunks/callback | Frame CPU p95 | Callback interval p95 | CPU above 11.11 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 45 | 2 | 1,889 | 2,199 | 2.10 | 12.0 | 11.2 | 9.4% |
| 45 | 4 | 232 | 366 | 3.74 | 15.0 | 22.2 | 42.2% |
| 45 | 6 | 180 | 240 | 5.22 | 17.6 | 22.3 | 62.3% |
| 90 | 2 | 4,477 | 4,956 | 2.13 | 12.1 | 11.2 | 9.9% |
| 90 | 4 | 1,438 | 1,633 | 3.97 | 14.5 | 22.2 | 42.8% |
| 90 | 6 | 896 | 1,024 | 5.47 | 17.8 | 22.3 | 72.5% |

At 45 edits/s, both higher cutoffs eliminated admission blocking in
all trials. Median peak pending work fell from 192 chunks to 112
at 4 ms and 102 at 6 ms. At 90 edits/s all three policies hit the
192-chunk cap. Median blocked callbacks fell from 549 to 236 and 108.
Median exact-slice p95 at 90 edits/s was 4.1, 6.1, and 8.1 ms.
The measured slices overran their soft cutoff because chunks run
to completion.

**GO for scheduling research. NO-GO for a fixed higher default.**
The 4 ms cutoff captured most of the catch-up gain at 90 edits/s,
with a clear cost in callback cadence. Compare a scheduler that
reserves measured drawing time during the stroke and uses extra
service after release. Keep the 2 ms control and record latency
from the last offered input. The next acceptance gate is an
improvement in catch-up with an explicit callback-time constraint
and tracked immersive verification.

Focused tests passed 13/13. The sandboxed full check passed
1,755/1,760 tests. All 30 tests in the affected loopback files
passed with localhost binding enabled.
