# Phase 8.3b — Adaptive exact meshing on Quest 3

2026-11-12 (Australia/Melbourne). Follow-up to the
[fixed cutoff sweep](SPARSE_SDF_BRUSH_BUDGET_RESULTS.md).

Quest 3 Browser panel, same 268 ordered edits on a 1 m branch at 1 mm
spacing, drawing enabled in every trial. Three trials per policy at
45 and 90 offered edits/s use rotating policy order. Fixed 2 and 4 ms
FIFO cutoffs are the controls. The adaptive policy clamps active
meshing to 2–4 ms after reserving drawing time, elapsed callback work,
and a 0.7 ms margin against an 11.11 ms CPU target. Drawing time is an
exponential moving average with weight 0.15 and a 7.8 ms initial value
from the preceding device run. From the last offered edit onward it
uses a 6 ms cutoff, including any edits waiting for admission.

All policies use the same 192 pending chunk cap and eight-chunk
service cap. The time cutoffs are soft and individual chunks run to
completion. The active window ends at the final offered input.
Frame CPU above 11.11 ms describes a CPU threshold, while callback
intervals describe Browser scheduling. The fixture records WebGL draw
submission and does not measure GPU completion or immersive frames.

## Reproduce

```sh
node scripts/benchmark-paced-renderer.mjs work/paced-renderer/brush-adaptive.html work/narrow-band-perf/cost-aware/growth-exact-3-narrow-cap8-1-1.json --adaptive
npm test -- brush-batch guarded-preview dirty-chunk-queue changed-chunks narrow-band
npm run check
```

The automated Quest runner, raw JSON and summary script are in
`work/paced-renderer/brush-adaptive.LC8N1T/`.

## Results

All 18 trials matched exact field and ordered mesh checksums with
461,818 triangles. Values are medians of three trial metrics.
Timing columns use ms.

| Offered edits/s | Policy | Local draw p95 | Last offered edit to exact | Last commit to exact | Active CPU p95 | Active CPU above 11.11 ms | Full replay callback interval p95 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 45 | Fixed 2 ms | 1,492 | 1,809 | 905 | 11.8 | 7.5% | 11.2 |
| 45 | Fixed 4 ms | 220 | 323 | 301 | 15.3 | 38.6% | 22.2 |
| 45 | Adaptive | 394 | 402 | 376 | 13.3 | 33.8% | 22.2 |
| 90 | Fixed 2 ms | 4,214 | 4,574 | 950 | 9.3 | 1.1% | 11.2 |
| 90 | Fixed 4 ms | 1,279 | 1,464 | 571 | 13.5 | 30.2% | 22.2 |
| 90 | Adaptive | 1,258 | 1,386 | 462 | 12.8 | 26.8% | 22.2 |

At 45 edits/s, fixed 4 ms and adaptive both eliminated admission
blocking. The adaptive policy spent 2.0 ms less at active CPU p95
than fixed 4 ms, and took 79 ms longer to settle. At 90 edits/s all
policies hit the pending cap. Adaptive cut 78 ms from the fixed
4 ms last-offered-to-exact median and reduced active CPU p95 by
0.7 ms. The fixed 4 ms full replay CPU p95 was 14.4 ms, and adaptive
was 16.8 ms, consistent with shifting more work after release.
The adaptive median active cutoff was 4 ms at both rates. The
full replay callback interval p95 remained 22.2 ms.

**Keep the adaptive policy research-only.** The release boost
cleared work sooner at the high offered rate. The active scheduler
still overran the CPU target on 26.8% of callbacks in that group.
Try predicting the next chunk cost before dispatch, including a
separate accounting of unavoidable first-chunk overruns. Validate
tracked immersive timing before an app trial.

Focused tests passed 13/13. The sandboxed full check passed
1,755/1,760. All 30 tests in the affected loopback files passed
with localhost binding enabled.

## Tracked Quest gate

2026-11-12 (Australia/Melbourne). The `--tracked` fixture pairs the
2 ms FIFO baseline and adaptive policy at both offered edit rates.
It requests an immersive `local` reference space and requires a
tracked viewer position before accepting measurements. The test uses
a deterministic stroke trace and needs no physical controller input.

The remote Quest 3 attempt opened the test tab and delivered the
immersive button click. During eight polls about three seconds apart,
the page stayed at `requesting immersive session`. The focused
window was still Browser at the final check. There was no session
grant, viewer pose, or timing report. The host reloaded the test tab
to cancel the pending request and removed its temporary USB mappings.
This attempt did not isolate the cause of the pending request.

```sh
node scripts/benchmark-paced-renderer.mjs work/paced-renderer/brush-tracked.html work/narrow-band-perf/cost-aware/growth-exact-3-narrow-cap8-1-1.json --tracked
node scripts/research/serve-paced-renderer.mjs work/paced-renderer/brush-tracked.html
```

With the headset tracking normally, open the USB loopback page and
select **Enter VR and run**. Wait for 12 completed trials and save the
report. The remote attempt log and runner are in
`work/paced-renderer/brush-tracked.MSW8yb/`.

**Tracked brush validation remains open.** The proposed app trial has
two independently enabled, default-off options. The adaptive scheduler
requires a passing tracked comparison first. The latest bulk Undo cache
has a separate integration path with the 40 MiB ceiling and ordinary
remeshing on cache refusal. This run changed only the research fixture
and documentation.

### Tracked Quest results

The first attempt received an immersive session, then the research
fixture consumed a browser callback without an XR frame. The retry
used the XR animation loop directly and ignored callbacks without a
frame. Quest 3 reported a 90 Hz session. All 12 trials completed on
one session with a non-emulated viewer pose, matching exact field
and ordered mesh checksums and 461,818 triangles.

Values are medians of three trial metrics. Timing columns are in ms.

| Offered edits/s | Policy | Brush-local draw p95 | Last offered edit to full exact submission | Active CPU p95 | Callback interval p95 |
| --- | --- | ---: | ---: | ---: | ---: |
| 45 | Fixed 2 ms | 4,559 | 5,374 | 11.9 | 24.5 |
| 45 | Adaptive | 1,565 | 1,788 | 13.8 | 27.7 |
| 90 | Fixed 2 ms | 7,433 | 8,424 | 10.2 | 25.1 |
| 90 | Adaptive | 2,205 | 2,559 | 12.1 | 27.8 |

At 90 offered edits/s, blocked callbacks fell from 548 to 188,
and the active CPU time exceeded 11.11 ms on 15.5% of adaptive
callbacks versus 2.0% for fixed FIFO. All groups still hit the
192-chunk queue cap. The fixture recorded WebGL submission and
callback intervals. Display latency and compositor drops were
outside the measurements.

**Tracked catch-up improved. Frame pacing worsened.** Keep adaptive
research-only pending a policy that preserves callback cadence on
this stress case. The trial uses the standalone brush fixture and
does not validate live editor Undo, Redo, cancellation, or memory.

Raw report and summary are in
`work/paced-renderer/adaptive-quest.YKGElD/`.
