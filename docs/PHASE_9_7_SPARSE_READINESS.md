# Phase 9.7 — Sparse sculpting production readiness

29 November 2026, Australia/Melbourne. Baseline
`8ca67cef5ae73c70a6fb2e2132b0f5aa0cb62d94`. **Keep sparse experimental and
opt-in.** The metre-scale directory bottleneck is resolved. Mirrored sparse
Move and mixed Cut All are available within the limits below, and a physical
Quest 3 completed the compact paired replay. Exact-master working memory and
compact release latency still fail production acceptance. Dense remains the
default. Existing dense layers reopen as dense.

## Implementation and supported operations

| Path | Behaviour and limits |
| --- | --- |
| Lattice and chunk directory | Sparse stores dirty and surfaced chunks by packed signed global block coordinates. A rebuilt empty chunk drops out of the directory. Growth rebinds allocated chunks and preserves cell ownership, gradient halos and spacing. Sparse ordered snapshots and export traverse signed Z/Y/X. |
| Clay and growth | The 1,153-sample axis, 13,824 resident-page and existing transient memory limits still apply. Moving faces must retain the implicit value, including samples reachable by history. As before, an admitted Clay expansion can retain implicit capacity if a later dab refuses or the stroke is cancelled. |
| Hit tests, export, masks and paint | The spatial index walks published mesh bounds. Separate-layer export uses the ordered mesh buffers. Composite export retains its sampling and triangle guards. Masks and paint retain independent channels and existing page/gradient seams. |
| Move, Elastic, Rotate, Twist and Free Move | Sparse accepts offset local mirroring when both influence and travel regions clear the plane. The reflected side evaluates the same field under reflection, including Twist handedness. Each side retains its own sculpt mask. Paint uses the same mapping. The worker merges disjoint scan rows in lattice order and returns one patch and one Undo action. |
| Mirror refusal | Place the Move centre on the plane, or pull toward it until the conservative travel box plus four samples touches the plane. Preview or commit refuses with the separation message. This keeps influence and destination semantics deterministic. The visible guide stays at the tracked hand's primary influence. |
| Cut All | Dense, sparse and mixed eligible sources stage complete splits before publication. Each split keeps its parent and sits beside the original in composition order. A miss, cancellation, active Boolean dependency, Intersect source or resource refusal aborts the batch. Hidden, locked, procedural and unbaked primitive layers are excluded from all-editable. |
| Boolean and Stamp | Existing exact operations preserve positive far-field values. Sparse requests still have exact scan, page and transient budgets. In particular, a Personal Shape stamp can require the full target lattice and fail the scan limit. |
| Native, Library and recovery | v25 keeps independent signed Float32 page records and exact implicit values. v1–24 readers and v24 dense and analytic output are retained. Mixed v25 projects keep each backend. Older v25 builds may refuse files above their former directory ceiling. Undo starts fresh on reopen. |
| Reclamation and future paging | Implicit-valued pages are reclaimed after history and reader pins release, while explicit positive distances survive. Independent records and the page residency interface remain available for future OPFS paging. |

## 1 mm editor growth

The editor transaction engine replayed the Phase 8.3 1 mm brush traces
with the live Undo mesh cache. Compact started at 129³, and other fixtures
started at 65³ and grew in signed coordinates. Every row completed. A native
v25 save/reopen preserved resident Float32 pages and the ordered mesh hash.
The last edit replayed through Undo and Redo. The desktop Chromium editor
also completed all ten 1 mm workloads with identical final triangle counts
and Undo/Redo. The metre branch and islands
exceed dense admission at 1 mm. Equal-detail paired metre controls therefore
use the same geometry at the admitted 5.65 mm spacing.

| Fixture | Nominal span mm | Strokes | Resident pages / allocated mesh chunks | Tracked peak MiB | Edit plus CPU drain p50/p95/p99 ms |
| --- | ---: | ---: | ---: | ---: | --- |
| Compact bust | 128 | 132 | 502 / 74 | 21.95 | 12.99 / 21.65 / 35.87 |
| Tube | 100 | 15 | 225 / 26 | 7.10 | 8.93 / 17.81 / 17.81 |
| Tube | 500 | 72 | 1,125 / 108 | 34.29 | 9.36 / 13.69 / 20.74 |
| Tube | 1,000 | 143 | 2,155 / 205 | 63.37 | 9.33 / 15.62 / 20.91 |
| Diagonal branch | 100 | 27 | 409 / 43 | 9.76 | 8.35 / 12.45 / 15.42 |
| Diagonal branch | 500 | 134 | 1,917 / 211 | 43.80 | 8.62 / 14.61 / 17.60 |
| Diagonal branch | 1,000 | 268 | 3,921 / 422 | 81.75 | 9.50 / 18.99 / 23.86 |
| Islands | 100 | 5 | 200 / 44 | 3.24 | 11.13 / 16.65 / 16.65 |
| Islands | 500 | 5 | 204 / 31 | 3.24 | 8.08 / 8.53 / 8.53 |
| Islands | 1,000 | 5 | 192 / 33 | 3.22 | 9.17 / 14.18 / 14.18 |

The metre branch had 1,057 × 705 × 769 logical samples and 422 resident
mesh chunks. The metre islands had 1,073 × 689 × 769 samples and 33 chunks.
At a 0.001 mm weld the tube and branch each had one component and the islands
had five. All rows had zero boundary and nonmanifold edges. The metre tube
and branch had 284 and 322 triangles collapse at this weld tolerance. These
are topology observations of the exact extracted field. Independent
continuous-reference thin-feature deviation at metre scale remains open.

## Desktop comparisons

The browser replay uses the application animation loop, live Undo mesh
cache and recovery controller. Compact uses 1 mm spacing. Paired metre rows
use 192³ at 5.65 mm. Each row used a fresh headless Chromium instance.
OS process RSS was sampled about every 350 ms using Chromium's process IDs.
Total RSS can count shared mappings more than once. GPU-process RSS measures
the process, and dedicated GPU allocation requires a different instrument.
Latency ends at renderer submission after a chunk update or an empty queue.
The island pair has seven actions per backend. The logged desktop matrix
contains the first complete pair for each fixture. Vite reloaded during a
follow-up after a documentation edit. The harness now disables hot reload. The render-loop captures predate the focused lookup cache adjustment.
The recorded harness also sampled queue age through the editor's broader
diagnostics path. The current harness reads the queue timestamp directly.

| Fixture | Backend | First submission p50/p95/p99 ms | Release to drained submission p50/p95/p99 ms | Tracked peak MiB | Browser sum / renderer / GPU process sampled peak MiB |
| --- | --- | --- | --- | ---: | --- |
| Compact bust | Dense | 14.7 / 28.0 / 32.0 | 14.7 / 28.0 / 32.0 | 59.60 | 874 / 509 / 215 |
| Compact bust | Sparse | 9.9 / 13.5 / 21.2 | 207.6 / 328.3 / 375.5 | 22.12 | 792 / 423 / 213 |
| Metre tube | Dense | 2.8 / 3.8 / 5.1 | 2.8 / 3.8 / 5.1 | 163.17 | 705 / 345 / 202 |
| Metre tube | Sparse | 3.3 / 5.1 / 5.9 | 3.3 / 5.1 / 5.9 | 2.22 | 684 / 325 / 202 |
| Metre branch | Dense | 2.2 / 3.2 / 3.9 | 2.2 / 3.2 / 3.9 | 163.41 | 710 / 350 / 202 |
| Metre branch | Sparse | 2.7 / 3.9 / 4.8 | 2.7 / 3.9 / 4.8 | 3.92 | 691 / 331 / 202 |
| Metre islands | Dense | 2.9 / 7.0 / 7.0 | 2.9 / 7.0 / 7.0 | 162.17 | 755 / 398 / 202 |
| Metre islands | Sparse | 3.6 / 7.9 / 7.9 | 3.6 / 7.9 / 7.9 | 0.71 | 660 / 301 / 202 |

The CPU brush pairs matched field bits and ordered position and normal
buffers at every paired checkpoint, including Undo and Redo. Compact sparse
queued up to 20 chunks in the CPU replay. The timed compact browser queue
reached 347 ms. Two worker-backed Move pairs matched exact fields and meshes.
Observed wall ranges in dense/sparse order were Move 430–436/433–476 ms,
Rotate 455–487/471–479 ms, Twist 384–400/385–391 ms, and Free Move growth
688–712/706–719 ms. The latter reached 81.63/28.34 MiB estimated peak working
memory, including worker and staging allowances. Browser RSS above covers
Clay and recovery, with Move worker allocations reported separately.

## Boolean, Stamp and Plane Cut pairs

Boolean and Stamp use three alternating measured iterations per combination
after an untimed warm-up. Plane Cut uses five fresh compact fields per
backend at 1 mm spacing. The table reports nearest-rank p50/p95/p99 in ms.
At these sample counts p95 and p99 equal the slowest measured trial.

| Operation | Dense p50/p95/p99 | Sparse p50/p95/p99 |
| --- | --- | --- |
| Boolean cut Bake | 255.61 / 268.68 / 268.68 | 406.56 / 409.03 / 409.03 |
| Repeated Boolean stack Bake | 255.68 / 258.68 / 258.68 | 399.85 / 405.31 / 405.31 |
| Enclosure Bake | 1,457.39 / 1,469.21 / 1,469.21 | 1,518.13 / 1,526.28 / 1,526.28 |
| Analytic sphere Stamp Add | 220.56 / 222.61 / 222.61 | 296.98 / 299.90 / 299.90 |
| Personal Stamp Add | 383.72 / 390.48 / 390.48 | 642.99 / 714.65 / 714.65 |
| Personal Stamp Subtract | 382.06 / 384.14 / 384.14 | 652.75 / 720.94 / 720.94 |
| Analytic prism Stamp Subtract | 96.82 / 96.88 / 96.88 | 119.62 / 120.87 / 120.87 |
| Plane Cut | 932.47 / 967.39 / 967.39 | 210.50 / 214.09 / 214.09 |
| Plane Cut Undo | 0.11 / 0.66 / 0.66 | 0.05 / 0.11 / 0.11 |
| Plane Cut Redo | 0.09 / 0.30 / 0.30 | 0.03 / 0.12 / 0.12 |

The Boolean pairs include dense and sparse sources crossed with both target
backends. Exact field and ordered mesh hashes matched every combination.
The four organic Stamp operations likewise matched, while the 128³ target
retained 8 MiB of Float32 values on either backend. Personal Stamp Add and
Subtract remained substantially slower on sparse. Plane Cut's paired fields
and ordered meshes matched for both pieces. Its peak tracked allocation was
64.04 MiB dense and 18.24 MiB sparse.

## Physical Quest 3

Native Quest Browser over USB loopback. Four compact 129³, 1 mm runs
completed in dense, sparse, sparse, dense order, at the same advertised
90 Hz and foveation setting. All finished with 109,432 triangles. Pose
tracking was active, and each trial performed 132 scripted brush edits
plus Undo/Redo with the live Undo cache and normal recovery scheduling.
Input injection is layer-local. Timing stops at draw submission.
Missed slots below estimate gaps from immersive animation timestamps.

| Run | Callback interval p50/p95/p99 ms | First submission p50/p95/p99 ms | Release drain p50/p95/p99 ms | Estimated missed slots | Max queue / age ms | Tracked peak MiB |
| --- | --- | --- | --- | ---: | --- | ---: |
| Dense 1 | 72.8 / 141.6 / 179.7 | 67.7 / 134.9 / 170.8 | 67.7 / 134.9 / 170.8 | 914 | 0 / 0 | 59.60 |
| Sparse 1 | 18.2 / 36.0 / 47.0 | 29.9 / 43.9 / 57.4 | 150 / 225 / 266 | 847 | 19 / 243.5 | 22.12 |
| Sparse 2 | 17.9 / 36.3 / 48.1 | 29.9 / 46.0 / 54.2 | 144 / 230 / 247.7 | 819 | 19 / 236.1 | 22.12 |
| Dense 2 | 106.9 / 201.4 / 235.1 | 100 / 196.4 / 230.1 | 100 / 196.4 / 230.1 | 1,370 | 0 / 0 | 37.27 |

Estimated missed-slot share was 87.3% and 91.2% dense versus 43.9% and
43.2% sparse. Both backends had long frames. Sparse worker recovery
reservations reached 4.17 MiB. The first dense run reached 32.82 MiB and
the second had no sampled active reservation. Physical controller-to-photon
latency, compositor-dropped frames and 1 mm metre headset traces remain open.

ADB recorded Browser PSS, GPU process allocation rows and thermal/CPU/GPU
snapshots. One active sample showed normal thermal status, SoC 48.2 °C,
and 14% GPU busy. The browser totals include other Quest tabs. ADB overlapped eight first
dense samples and one second dense sample, with no samples inside either
sparse timing window. Observed dense peaks were 1,934/1,908 MiB Browser PSS
and 576/572 MiB from the available GPU allocation rows, respectively. Full
paired isolated PSS and GPU peaks remain open. The instrumented
host and hardware records distinguish process residency from tracked bytes.

## Acceptance against Phase 8.3

| Original requirement | Result |
| --- | --- |
| At least 50% working savings against dense values plus scratch and 25% against dense values alone at 128³/192³, including comparable co-resident resources. No case above dense values plus scratch. | **Fail.** Exact masters with varying far-field distances fill nearly all their pages. Savings for sparsely occupied Clay and Move do not establish the master target. |
| Measured conversion/edit peaks within existing limits with previews, workers, meshes, history and saves | **Partial.** Tracked staging and atomic refusals passed covered cases. Browser RSS and Quest PSS/GPU observations leave full isolated peak coverage open. |
| Warm random/local/scan median ≤2× dense, no case >3×, repeated transformed ≤1.5× at all three target bounds | **Pass at case medians.** The worst transformed case median was 1.446×. Individual half-size and 1× trial ratios exceeded 1.5×. |
| Bit-exact band samples, zero sign drift, interpolation ≤1e-6 model units, normalized normal component deviation ≤1e-4 and identical topology. Approximate geometry requires bidirectional deviation ≤0.01 voxel and thin-feature probes. | **Pass in the paired exact editor traces.** Exact mesh bytes establish the compared topology. Focused sampling verifies signed seams, poses and exterior distances. Independent metre-scale continuous-reference coverage remains open. |
| Exact native/master/backup, recovery and Undo | **Pass for exercised paths.** Mixed v25, growing signed pages, cancellation, corruption and quota behaviour have focused or browser coverage. |
| Comparable Quest p95/p99 stroke-to-visible and missed frames, bounded queue and release | **Partial / release fail.** Native 90 Hz compact improves first submission and estimated missed slots. Release tails exceed dense. Controller and compositor timing remain open. |

The original definitions are in the [Phase 8.3a report](SPARSE_SDF_83A_RESULTS.md)
and [Phase 8.3b report](SPARSE_SDF_83B_PERF_RESULTS.md). Keep indexed live
geometry, extended background meshing, WASM/WebGPU, hardware-aware rendering
and actual OPFS paging in Phase 10.

## Cold, warm and transformed sampling

Eleven exact masters at 128³ and 192³ with three independent process pairs
per case. The first timed scan follows file decode and exact field setup,
with the OS cache intact. Each warm observation is the median of the last
three invocations. The table pools per-pair sparse/dense ratios. Case
medians pool the three independent pairs per master and grid size.
Transformed workloads reuse the original 20 poses at three bounds ratios.
They exercise exact source interpolation and clamped exterior extension.

| Workload | First invocation ratio p50/p95/p99 | Warm ratio p50/p95/p99 | Worst warm case median |
| --- | --- | --- | ---: |
| Random | 1.579 / 6.567 / 7.955 | 1.355 / 1.514 / 1.560 | 1.451 |
| Local | 1.298 / 1.769 / 1.834 | 1.183 / 1.268 / 1.324 | 1.261 |
| Scan tile | 1.316 / 1.858 / 1.921 | 1.198 / 1.316 / 1.391 | 1.251 |
| Transformed, 0.5× | 1.263 / 1.391 / 1.428 | 1.337 / 1.529 / 1.561 | 1.446 |
| Transformed, 1× | 1.324 / 1.521 / 1.636 | 1.333 / 1.503 / 1.549 | 1.393 |
| Transformed, 2× | 1.272 / 1.415 / 1.637 | 1.276 / 1.384 / 1.467 | 1.307 |

Caching the last resident page or implicit miss improved locality. The
cache is cleared when residency changes. Before this adjustment, the warm
transformed 1× pooled median was 1.525×. It is 1.333× in the final
matrix. The paired sampling checksums matched. Case medians pass all warm
targets. Cold random first-use timing is noisy and still has outliers.
End-to-end Personal Stamp remains slower because the complete operation
also includes destination field staging, history and mesh work.

| Grid | Sparse / dense working with source and scratch | Sparse / dense values-only target with same source | Isolated process maxRSS p50/p95/p99 MiB, dense | Isolated process maxRSS p50/p95/p99 MiB, sparse |
| --- | ---: | ---: | --- | --- |
| 128³ | 0.891× | 1.006× | 236.6 / 238.1 / 238.3 | 240.6 / 249.1 / 249.2 |
| 192³ | 0.762× | 1.016× | 258.9 / 259.9 / 260.2 | 265.8 / 268.3 / 268.5 |

The exact masters filled all 4,096 or 13,824 pages. The comparison charges
the same decoded original source values and scratch on both sides, plus
the timed backend's target payload and directory allowance. The lookup
loops have no live mesher or edit scratch. Whole-process RSS also includes
archive decode, trace objects and the runtime. It is a separate measurement
from the modeled footprint. Master memory misses both savings thresholds.

## Verification and production decision

The final full check in `work/phase-9.7/check-release.log` passed formatting, lint, strict TypeScript, the
production build and **1,860/1,860 tests**. The focused matrix passed
**157/157** with native/Library/recovery, mirrored Move, Cut All and
signed-lattice coverage. Production Chromium passed Library import, v25
download, browser save and recovery after reload. The sparse CSG smoke
passed analytic and Personal Stamp, sparse Bake and Undo/Redo. The WebGL
Move fixture passed ordinary and mirrored XR pose input and browser-worker
reconstruction. The production mixed Cut All smoke reopened a v25 Library
project and verified the four-piece download. The opt-in local stdio MCP
smoke passed browser-approved sparse Boolean Bake and Undo.

Keep sparse opt-in. The next acceptance captures should include a sustained
1 mm sparse metre run, matched device memory across both orders, and
compositor timing with real tracked controller input. Use the current
compact replay to reproduce and reduce the release drain. A different
representation for highly occupied exact masters is needed to meet the
working-memory thresholds with comparable resources.

## Reproduce and locate raw evidence

The runs used the Apple silicon development host, Node v26.8.1 and
Playwright Chromium. From the repository root:

```sh
mkdir -p work/phase-9.7
TRACE=work/narrow-band-perf/cost-aware/growth-exact-3-narrow-cap8-1-1.json
MASTERS=work/personal-stamp-baseline/2026-11-10T12-23-20.143Z
node scripts/benchmark-sparse-persistence.mjs "$TRACE" work/phase-9.7/growth-topology.json
node scripts/benchmark-sparse-integration.mjs "$TRACE" work/phase-9.7/brush.json
node scripts/benchmark-sparse-move.mjs work/phase-9.7/move.json
node scripts/benchmark-sparse-csg.mjs work/phase-9.7/csg-final.json
node scripts/benchmark-sparse-readiness-cut.mjs work/phase-9.7/cut.json
node scripts/benchmark-sparse-readiness-lookup.mjs "$MASTERS" work/phase-9.7/lookup-final.json
node scripts/profile-sparse-readiness.mjs desktop "$TRACE" work/phase-9.7/desktop.json
PHASE97_GROWTH=1 node scripts/profile-sparse-readiness.mjs desktop "$TRACE" work/phase-9.7/browser-growth-final.json
npm test -- sparse-sdf sparse-move-cut plane-cut move-preview project-library recovery analytic-project
npm run check
node scripts/sparse-persistence-browser-smoke.mjs
node scripts/sparse-csg-browser-smoke.mjs
node scripts/sparse-move-browser-smoke.mjs
AGENT_SMOKE_HOST=127.0.0.1 AGENT_SMOKE_REPORT=work/phase-9.7/mcp npm run test:agent:browser -- --sparse-bake
```

The trace is the existing Phase 8.3 cost-aware trial. Rebuild it with
`node scripts/benchmark-narrow-band-perf.mjs work/narrow-band-perf/cost-aware cost`
in a fresh output directory if the manifest references a different build.
Use the generated original Phase 8.3 masters for lookup. If needed, run
`node scripts/benchmark-personal-stamp-baseline.mjs` and point the lookup
runner at its output directory. The enclosure
benchmark uses the Phase 8.9a compact reference, or a matching archive set
through `BOOLEAN_BENCH_ENCLOSURE`.

For a paired hardware replay, start the loopback server on a dedicated port.
Start the OS sampler before entering Studio, keep it running across all
four trials and retain the timestamps for aligning memory with the browser
resource samples.

```sh
node scripts/profile-sparse-readiness.mjs serve "" work/phase-9.7/quest-auto.json
```

From another terminal, with the Quest USB debugging connection authorized:

```sh
adb reverse tcp:5387 tcp:5387
adb shell 'am start -a android.intent.action.VIEW -d "http://127.0.0.1:5387/?phase97Replay=1&phase97Auto=1" -p com.oculus.browser'
node scripts/research/sample-quest-memory.mjs work/phase-9.7/quest-memory-repeat.jsonl 300
```

Wear the headset, confirm room tracking, and select **Enter Studio** on the
dedicated benchmark page. Keep the session visible. The replay alternates
dense/sparse order, writes each completed row to the host, and exits Studio
when finished. Verify a common refresh rate before comparing runs. Keep
controller traces and compositor captures separately labeled. Remove only the
test tunnel with `adb reverse --remove tcp:5387`. To use the sparse 1 mm
large-space suite on-device, add `PHASE97_GROWTH=1` and supply the trace path
in the serve command. The actual run's raw files
include `quest-auto.json`, `quest-enabled-memory.jsonl`,
`quest-immersive-memory.jsonl`, `quest-thermal-active.txt`,
`quest-cpu-active.txt` and `quest-gpu-busy-active.txt` under `work/phase-9.7`.
