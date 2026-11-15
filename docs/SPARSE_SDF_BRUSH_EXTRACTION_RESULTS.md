# Phase 8.3b — Exact extraction and draw submission

2026-11-12 (Australia/Melbourne). Follow-up to
[ordered brush batching](SPARSE_SDF_BRUSH_BATCH_RESULTS.md).

The Quest 3 Browser panel replays the same 268 ordered edits on a
1 m branch at 1 mm spacing. The paired control uses the same FIFO
queue, requestAnimationFrame callbacks, dirty-chunk extraction, mesh
objects and scene updates, and skips the WebGL render call. The draw
policy also waits for the relevant mesh to reach the render callback.
The control records build readiness from exact revisions, so its
results have no draw time or display latency. Both policies use the
same admission capacity and soft slice cutoff. Each runs three times
at 45 and 90 offered edits per second, alternating order between trials.

Frame profiling records input staging and admission, exact extraction
including halo reads, mesh-object updates, WebGL submission, and
revision tracking. Each phase has its own distribution. The phase p95
values cannot be added to estimate a frame p95. The control also
removes GPU work and any pacing or CPU contention induced by drawing,
so the end-to-end difference measures the effect of the render path
as a whole. No immersive or GPU-completion timing was collected.

## Reproduce

```sh
node scripts/benchmark-paced-renderer.mjs work/paced-renderer/brush-extraction.html work/narrow-band-perf/cost-aware/growth-exact-3-narrow-cap8-1-1.json --extract
npm test -- brush-batch guarded-preview dirty-chunk-queue changed-chunks narrow-band
npm run check
```

The automated Quest runner and raw report are in
`work/paced-renderer/brush-extraction.LUmkfw/`.

## Results

All 12 Quest panel trials completed with identical exact field and
ordered mesh checksums and 461,818 triangles. Values are medians
of three trial metrics in ms. Readiness is draw submission for FIFO
and completed CPU mesh construction for the build-only control.

| Edits/s | Policy | Commit p95 | Local ready p95 | Exact ready p95 | Last offered edit to exact | Last commit to exact | Frame CPU p95 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 45 | Draw | 1,183 | 1,945 | 2,146 | 2,216 | 981 | 12.4 |
| 45 | Build only | 1,790 | 2,649 | 2,892 | 3,012 | 1,121 | 7.5 |
| 90 | Draw | 4,089 | 4,893 | 5,037 | 5,256 | 982 | 12.5 |
| 90 | Build only | 4,312 | 5,205 | 5,405 | 5,702 | 1,098 | 7.7 |

| Edits/s | Policy | Input p95 | Extraction p95 | Scene update p95 | Draw CPU p95 | Revision tracking p95 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 45 | Draw | 4.3 | 4.0 | 0.2 | 7.7 | 0.3 |
| 45 | Build only | 4.4 | 3.9 | 0.2 | — | 0.3 |
| 90 | Draw | 4.4 | 4.0 | 0.2 | 7.8 | 0.3 |
| 90 | Build only | 4.5 | 4.0 | 0.2 | — | 0.3 |

Removing drawing saved 4.8–4.9 ms of frame CPU p95. Every trial
still reached the 192-chunk cap. At 90 edits/s the median draw run
serviced 1,513 chunks over 737 callbacks. The control serviced 1,514
over 781 callbacks. Animation callback interval p95 was 11.2 ms in
all groups. Simply removing drawing under the existing service budget
did not clear the backlog. The reason the control serviced fewer
chunks per callback remains unmeasured.

**Keep FIFO as the research baseline.** Sweep the exact service
budget with drawing enabled and record chunks per callback alongside
frame CPU. A separate draw-off sweep can estimate how much capacity
becomes available if rendering gets cheaper. Immersive acceptance
and production 8.3c remain gated.

Focused tests passed 13/13. The sandboxed full check passed
1,755/1,760 tests. All 30 tests in the affected loopback files
passed with localhost binding enabled.
