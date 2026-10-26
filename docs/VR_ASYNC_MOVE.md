# Phase 2.4 — asynchronous Move reconstruction

2026-10-26. Software implementation and Node validation delivered; physical Quest 3 acceptance remains pending. Phase 2.3 software prerequisites were present and tests passed; its hardware acceptance remains open. Incoming Git checkout was clean; no user modifications were overwritten. No commit, push or merge.

## Audit and design

Non-Elastic and regularized Kelvinlet translation, local rotate and progressive twist share `RadialMoveField`, original-position GPU preview and candidate SDF reconstruction. XR captures the final release pose and holds that preview during reconstruction. Expanded signed-origin dense bounds retain spacing. Existing source/session/revision/transform guards protect staging and synchronous publication. History is prepared privately and published with the SDF/mesh/timeline as one action. Existing transform, Boolean invalidation and neutral GLB paths remain intact.

Previously triangle deformation, BVH creation and all distance queries ran cooperatively on the render thread. Copying, allocations, history remapping, chunk extraction, staged spatial index construction and final publication are also synchronous units; a 3 ms target cannot bound one allocation, chunk, or GC pause.

A module worker now receives transferred **copies** of original local triangle positions, candidate samples, layout and scalar field settings. The live geometry/volume buffers are never detached. Worker builds its own field/index and returns only transferable patch buffers. Every message carries a generation ID; wrong IDs are ignored. Main-thread source/session guards run on messages, every 16 ms while waiting, and before publication. Abort terminates the worker; termination also runs on failure/success. Progress is throttled to 32 ms plus stage boundaries. Cold worker per operation deliberately avoids retained large worker heaps and cross-job result reuse.

There is no work queue: one project Move lock, conflicting requests rejected. Other-layer edits, active-layer switches, deletion, transforms, Undo/Redo and Boolean-view changes remain blocked while pending. Cancel first, then issue another command. Tool/tracking/session changes cancel through XR ownership; project disposal invalidates the guard. Support grip cancels. Errors retain original source/history; release/rearm and grab again retries. Existing HUD holds progress/error feedback; controller updates continue through the normal animation loop.

Native save and both GLB paths read committed authoritative sources, excluding the held shader deformation and private candidate. They do not implicitly await/commit Move. Main UI may gate commands while busy. No schema changes.

## Memory and scheduling policy

Worker snapshots include one extra candidate values array, worker scratch and copied source positions. Their conservative reservation is subtracted from reconstruction's existing memory allowance. If snapshot plus minimum index reservation cannot fit, use the existing cooperative reconstruction **before allocating snapshots**. This preserves default-budget million-vertex support. Worker startup/runtime errors fail safely rather than triggering an unexpected main-thread retry. Typed-array allocations, chunk extraction and history work still run on the main thread; memory pressure and long frame tails remain possible. Peak estimates are accounting estimates; tracked memory and process checkpoint counters do not measure total worker/GPU/GC peak.

`lastMoveStats` adds actual backend, worker wait wall time and completed main-thread work-slice p50/p95/p99. Main-thread CPU estimate excludes worker wait; worker CPU is not measured. A single serialized operation has no queue residence; wait includes cold startup, message transit and worker execution, not separately attributed startup/compute timings. Existing XR panel reports frame median/p95/p99 and preview/remesh CPU; **no new physical XR measurements were obtained**.

## Reproduction and actual measurements

- Baseline: `node scripts/benchmark-persistent-move.mjs`; saved separately as `outputs/phase-2-4-baseline.json`, original historical report restored. Eight Non-Elastic cases, 94,608–1,088,784 vertices, radii .2/.4. Preview and XR timing evidence remains the Phase 2.3 handover evidence, not remeasured headset data.
- Worker/fallback: `node scripts/benchmark-async-move.mjs`; `outputs/phase-2-4-worker-benchmark.json`. Actual worker module through a Node worker_threads browser adapter. Twelve single-operation cases; radius .2. Cold startup included. No claim of operation latency percentiles or speedup from these small, noncontrolled samples.
- Integration: `node scripts/compile-core.mjs` then `node --test --import ./scripts/fixtures/enable-node-move-worker.mjs tests/persistent-move.test.mjs tests/rotation-move.test.mjs`: 57 passed. Covers transformed sources, preview ownership, abort at stages, interrupted publication/history/meshing failure, growth, native round-trip, neutral exports, exact Undo/Redo, repeated edits and large volumes. Some large-volume cases intentionally use cooperative fallback.
- Dedicated real-worker tests compare all four field variants and test abort, guard invalidation, retry, injected errors, immutable source buffers and wrong/duplicate generations. Full test/build results recorded in DEVELOPMENT_STATUS.

All timings below are **Mac Node**, not browser/WebXR frames. Timer gaps sample a 5 ms timer during each operation; low sample counts (especially 64³) do not establish reliable tails. Chunk meshing is aggregate CPU time, not a per-chunk tail distribution. Process counters are before/after checkpoints.

| Vertices | Mode | Backend | Release wall ms | Meshing CPU ms | Timer gap p50 / p95 / p99 ms |
|---:|---|---|---:|---:|---:|
| 94,608 | non-elastic | worker | 113.5 | 21.1 | 5.61 / 6.23 / 8.07 |
| 94,608 | elastic | worker | 206.2 | 14.9 | 5.65 / 5.92 / 7.45 |
| 94,608 | rotate | worker | 90.0 | 14.7 | 5.49 / 8.68 / 8.68 |
| 94,608 | twist | worker | 90.8 | 15.0 | 5.66 / 8.65 / 8.65 |
| 305,640 | non-elastic | worker | 236.2 | 32.7 | 5.65 / 6.48 / 9.13 |
| 305,640 | elastic | worker | 823.2 | 37.1 | 5.65 / 5.85 / 7.85 |
| 305,640 | rotate | worker | 191.0 | 36.1 | 5.65 / 7.55 / 8.03 |
| 305,640 | twist | worker | 188.6 | 37.2 | 5.65 / 6.16 / 10.90 |
| 1,088,784 | non-elastic | cooperative | 1020.3 | 60.7 | 5.46 / 7.34 / 7.51 |
| 1,088,784 | elastic | cooperative | 4438.0 | 61.3 | 5.45 / 7.21 / 7.38 |
| 1,088,784 | rotate | cooperative | 625.0 | 55.3 | 5.43 / 7.38 / 7.76 |
| 1,088,784 | twist | cooperative | 602.7 | 55.1 | 5.45 / 7.48 / 10.45 |

After network access was granted, the existing local Vite server served the actual browser worker. Desktop WebGL synthetic Non-Elastic long growth pull: preview visibly held during reconstruction; worker backend, release 327.2 ms, worker wait 294.1 ms, main CPU estimate 31.2 ms, meshing 26.0 ms, max measured slice 6.2 ms. Grid grew from 64×64×64 to 64×64×97, one history action; native round-trip, Undo and Redo passed, zero shader errors. Screenshot: `outputs/phase-2-4-browser.png`. Undo retains expanded empty capacity as before, so whole native bytes differ despite restored lattice samples. This single browser observation does not validate every mode or headset responsiveness. Build emits a separate worker asset successfully.

## Quest 3 acceptance checklist (not completed)

1. Verify worker asset loads in Quest Browser HTTPS and immersive WebXR; record first-use shader/worker startup separately.
2. At 64³, >300k and ~1.09m vertices, run translation Non-Elastic/Elastic, rotate and twist, radii .2/.4 and long growth pulls; record actual backend and release latency.
3. Capture >=100 immersive frame samples for idle, held preview, pending reconstruction and publication; report p50/p95/p99, missed-frame spikes, controller tracking and compositor behavior. Repeat enough operations to characterize release tails independently.
4. Confirm final preview remains continuously visible while worker runs and swaps once with no old mesh flash, seam discontinuity or transform jump. Check stretched/rotated layers and workspace transforms.
5. Cancel at copying/indexing/reconstruction/meshing, session exit/tracking loss, switch tools, reload project. Verify no late commit; retry commits exactly once.
6. Try deletion, other-layer gestures, Undo/Redo and second Move while pending: commands blocked until cancellation/completion. Confirm controller/menu responsiveness and useful feedback.
7. Successful commit has one Undo action, exact undo/redo; cancelled/failed jobs have none and preserve redo. Continue Clay/Smooth and repeated Move after growth.
8. Save and both GLB exports before/during/after pending work: pending exports contain committed source; post-commit native reload and Boolean compositions agree.
9. Exercise worker failure, constrained memory/fallback and large-angle reconstruction rejection. Measure available heap/process counters with scope; inspect thermal/repeated-job behavior without claiming GPU peaks from JS heap.

## Phase 2.5 recommendation

Reduce snapshot/index memory to keep million-vertex reconstruction in workers, then move chunk extraction/history preparation behind transferable staging contracts or make their inner loops resumable. Add browser automation and headset capture for preview continuity, per-chunk tails, cold startup, repeated-operation latency and memory. Do this before adding more deformation modes. Phase 2.4 does not establish a hard Quest frame budget or complete physical acceptance.
