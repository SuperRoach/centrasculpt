# Phase 3.4 — Long-session stability, autosave and recovery

Implemented 2026-10-27. Software checks and desktop browser recovery verification passed; **physical Quest 3 extended-session, sleep/wake and frame-time acceptance remain pending**. Incoming tree was clean at `0cbd5e8`. No reset/stash, commit, push or merge performed.

## Recovery architecture and consistency

The authoritative SDF and existing native `.form` codec remain the only project model. Recovery copies committed voxel samples cooperatively (16,384-float blocks, approximately 2 ms yielding target), checks project/revision/idle state between blocks, then transfers the independent copies to a dedicated worker. The worker uses existing native serialization/validation and computes a CRC32. Live source buffers are never transferred. Geometry, previews, undo maps and pending reconstruction are excluded.

Snapshots include independent layer metadata, signed expanded lattice origins/dimensions, transforms, Boolean operations, display preferences, camera/brush settings and newly persisted symmetry/path/Move/stamp preferences. Native versions 1–4 remain readable; optional tool preferences extend metadata without changing the binary version. Old projects get default tool preferences. Recovered and manually loaded projects start with fresh Undo/Redo, matching existing native loading behavior.

A single job is allowed. Scheduling observes committed changes, waits for a 5-second idle pause and at least 30 seconds since the previous successful checkpoint, with an opportunistic 120-second dirty-age trigger **only when interactions are idle**. A 500 ms observer runs while visible. Hidden-page termination does not attempt synchronous emergency serialization. Resume can request an urgent idle checkpoint. Failed jobs retain the previous checkpoint and back off 60 seconds. A killed browser can lose edits since the last successful checkpoint.

IndexedDB `centra-sculpt-recovery` stores small records separately from native payloads. Record, payload and pruning share one atomic read/write transaction; strict durability is requested where supported. Keep at most **three snapshots and 96 MiB total** across projects. Monotonic transaction order tolerates wall-clock rollback. Quota, transaction abort, denied storage, missing payload and unsupported formats produce warnings. CRC detects accidental corruption, not malicious changes. Database initialization has an eight-second timeout. Recovery requires Web Workers; manual files remain available if unavailable.

Startup lists recovery without replacing the open project. Restore/Discard require an inline confirmation. Users can select an older checkpoint if the newest is corrupted. Restore validates checksum, native project identity and format before publishing a candidate; a source/key guard rejects a stale restore if current work changed. VR entry waits for the startup decision while autosave is enabled; disabling autosave keeps recovery records and permits entry. Recovery never overwrites a manually saved file, and stays local to the browser/origin. Changing HTTP/HTTPS, port or browser changes the storage origin; browser eviction/private-mode policies still apply. Multiple-tab simultaneous sculpting is not coordinated; use one editing tab.

## Lifecycle and memory audit

- Page hidden/freeze/blur/pagehide, application error and unhandled rejection cancel transient desktop/XR strokes, transforms, Move previews/reconstruction, export and Bake. Previous committed geometry remains available. Existing session-end, disconnect, handedness, tracking loss and neutral-input rearming paths are retained. Cancellation is synchronous; no asynchronous result is allowed to publish through the existing generation/source guards.
- User edit/heavy-job admission cancels background recovery first. Snapshot plus worker/native buffers receive a conservative `16 * voxelCount + 64 KiB` temporary reservation, included with existing source/composite tracking against the existing 256 MiB admission estimate. This is not a browser process/GPU cap. Oversized recovery is skipped with a warning and previous checkpoints retained. No new whole-sculpture vertex ceiling or source resampling.
- **Fixed actual leak:** controller GLTF assets arriving after a timeout were still retained by the provider. Late assets now dispose unique geometry/material/texture once. Model profile cache is bounded to four; active/shared asset objects are preserved during eviction. Existing model/session ownership remains intact.
- **Fixed retained metadata:** repeated native project replacement reused a display-preference Map. Candidates now receive isolated display state, replacing global state only after successful validation; old project resources are disposed after publication.
- Worker clients terminate on success, failure and abort. HMR removes the recovery interval and lifecycle listeners. Existing history limits, retained Bake-runtime ownership, preview cleanup, lazy chunk extraction and dense authoritative storage remain unchanged.
- Diagnostics expose allocated/mesh chunks, vertices/triangles, grids, history, Boolean estimates, pending jobs, checkpoint bytes/duration/copy time, browser heap where available and renderer resource counts. A bounded 32-sample allocation-delta ring tracks recent changes. Resource pressure uses the existing 256 MiB estimate at 85%; reported totals exclude untracked JS/GPU overhead. XR performance display includes history/recovery status.

## Automated and browser verification

Baseline: TypeScript/build and **715/715 tests**. Final: **735/735 tests**, TypeScript and production build; actual-worker Move contract suite also run (see development status). Existing Vite large-bundle advisory remains. Twenty added tests cover scheduler/cadence, selection/discard, corruption/versioning, exact native bytes/preferences, atomic aborted writes, synchronous quota failure, storage denial, stale encoders, memory admission, pending edits/Move, cancellation/retry, lifecycle listener removal, repeated project disposal and controller cache/late assets.

Real desktop browser QA used **only** the disposable `centra-sculpt-recovery-test` database (`npm run dev`, `/scripts/fixtures/recovery-lab.html`, then `/?recoveryFixture=lab`). The test switch is DEV-only. Verified an aborted real IndexedDB transaction left only the prior checkpoint; a corrupted checksum did not replace the open 64³ sphere; selecting the older valid checkpoint restored a 33³ transformed layer and saved tool preferences. A real desktop stroke created one Undo action, autosaved through the actual browser worker, survived reload and restored with fresh history. Repeated restored fixture diagnostics returned to **9 renderer geometries / 0 textures**, 8 mesh chunks and 8,088 triangles. A stale warning discovered after successful older-checkpoint restore was fixed and reverified. [UI evidence](../outputs/phase-3-4-recovery-ui.png).

Development Vite websocket reconnect can reload a suspended dev tab. For sustained sculpting use a built deployment, or `npm run build` followed by `npm run preview` (configure the established HTTPS workflow for physical WebXR). Preview avoids development hot reload; do not infer production lifecycle behavior from dev-client reconnects.

## Recovery benchmark

Reproduce `npm run benchmark:recovery`. [Raw observations](../outputs/phase-3-4-recovery.json). Mac Node v26.8.1, isolated process per fixture, actual worker threads and fake-indexeddb transaction cloning. One observation each. Native setup/meshing and byte-exact validation are outside timed save. These are **event-loop probes, not XR frames or Quest timings**.

| Fixture | Native MiB | Copy ms | Worker encode + CRC ms | Save + commit ms | Temporary estimate MiB | Sampled process peak RSS MiB | Max timer gap idle → saving ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 64³ | 1.001 | .40 | 15.96 | 68.79 | 4.06 | 131.4 | 2.54 → 3.56 |
| 128³ | 8.001 | 1.30 | 65.12 | 119.96 | 32.06 | 187.5 | 2.47 → 4.33 |
| 192³ | 27.001 | 5.56 | 182.22 | 243.79 | 108.06 | 311.6 | 2.47 → 5.67 |
| 64³ + 128³ | 9.001 | 1.82 | 67.82 | 124.40 | 36.06 | 195.7 | 2.46 → 5.40 |

Temporary values are admission estimates, not measured peak allocations. RSS includes the whole process and workers; sampled peaks can miss short peaks. OS maxRSS (raw report) also includes validation/setup. No API exposes complete browser/GPU memory. Large ArrayBuffer allocation and IndexedDB cloning may still stall a browser despite cooperative copying; physical frame traces are required.

## Reproducible stress run

`npm run stress:session` compiles and runs an isolated `--expose-gc` child with actual worker adapters, fake-indexeddb and disposal instrumentation. [Raw report](../outputs/phase-3-4-stress.json). It exercises **321 Clay strokes**, expanded negative bounds, high Steady and long Line paths, large brushes, 24 stamps, 20 layer create/delete cycles, mixed 64/128 layers, Boolean/Bake, 82 Undo/Redo operations, 11 native loads, 12 sequential asynchronous Non-Elastic/Elastic/rotate/twist Moves, 14 recovery saves, a 192³ checkpoint and all export qualities. Logical autosave scheduling is accelerated; it is not an hours-long test.

Measured wall time **17.91 s**, **29 worker jobs**, **zero active clients and zero live threads** at completion. Expanded voxel storage stayed **4.0 MiB** through 320 strokes. History after 40/80/120/320 strokes was **1.4/1.9/1.5/1.1 MiB**, bounded at 100 actions; stamps legitimately increased retained history to **20.4 MiB**. Layer churn retained the same live grid/history. Mixed layers/Bake retained 22.0 MiB grids; native reload reset history to zero. Main heap after forced GC was approximately 8.9–9.7 MiB through strokes/churn, 11.5 MiB after ten repeated loads and 13.9 MiB at 192³. Geometry-dispose instrumentation verifies obsolete resources are released without disposing live base resources.

RSS still grew/retained high water, reaching **674.2 MiB** including the final large checkpoint. This does not prove a leak or leak freedom: V8/worker allocation, retained allocator pages and project data differ from reachable heap/GPU ownership. Further browser heap snapshots and headset traces are warranted. Maximum full-harness timer gap **2,278 ms** includes synchronous manual codec/loading, meshing and forced GC; it is not autosave-only time and cannot substantiate smooth XR rendering.

The post-Move export fixture retained 17,172 triangles: Fast **37.8 ms / 1,237,648 bytes**, Standard **78.1 ms / 413,128 bytes**, High **152.3 ms / 310,096 bytes**. This confirms compatibility on that fixture; Phase 3.3's broader quality/format/error validation remains in [its handover](PHASE_3_EXPORT.md). Manual save/load and chunk meshing still have synchronous work. Browser shutdown mid-write is simulated with atomic abort, not an OS crash injection.

## File manifest

New runtime: `tool-preferences.ts`, `project-snapshot.ts`, `recovery-worker.ts`, `recovery-client.ts`, `recovery-store.ts`, `recovery.ts`, `app-lifecycle.ts`, `stability-metrics.ts`.

Integration: `main.ts`, `ui.ts`, `style.css`, `layers.ts`, `project.ts`, `editor-tool-state.ts`, `independent-layers.ts`, `compositor.ts`, `controller-model-provider.ts`, `controller-models.ts`, `xr-controllers.ts`, `xr-experience.ts`, `xr-performance.ts` (all under `src/`). Test-only `fake-indexeddb` in package/lock, compile-core module list, `tests/recovery.test.mjs`, `tests/stability.test.mjs`, benchmark/stress scripts and `scripts/fixtures/{node-recovery-worker.mjs,recovery-lab.html}`; raw reports/UI evidence and this/status documentation.

## Physical Quest 3 verification — not yet performed

1. Launch on the established secure WebXR origin; verify autosave status and make an explicit startup recovery choice. Sculpt for an extended session, noting duration.
2. Add/subtract across expanded positive and negative bounds; verify the Phase 3.2 Clay fix remains visible at 64³.
3. Exercise Smooth, long Line, high Steady and repeated Stamp, mirror plane and precision constraints.
4. Repeatedly translate with Elastic/Non-Elastic Move, rotate and twist. Interrupt a pending reconstruction; confirm previous SDF and exactly one history action per successful edit.
5. Record frame diagnostics, chunk/history estimates, checkpoint times and browser heap availability periodically; watch thermal/frame degradation.
6. Pause until a new successful checkpoint timestamp appears; ensure it contains completed edits and no preview geometry.
7. Reload/close/reopen the browser; confirm recovery offered without automatic replacement.
8. Restore a checkpoint (and test older selection); verify fresh history and save a manual copy.
9. Inspect independent layers, negative/expanded bounds, Boolean state, transforms, small details and tool preferences.
10. Enter/exit VR repeatedly; disconnect/reconnect controllers and switch handedness, checking neutral rearming and no duplicate controllers/menus.
11. Suspend/resume the headset during a stroke, pending Move and autosave. Confirm safe cancellation/previous checkpoint retention, then edit and checkpoint again.
12. Save/open manually and export Fast/Standard/High GLB; inspect dimensions externally. Test low-storage failure while retaining a prior valid checkpoint.
13. Confirm no accumulating controller objects, orphaned menus or obvious frame degradation. Record hardware/browser versions and results before marking physical acceptance complete.

## Next phases

**3.5:** Stamp Tool grip-adjustable position/orientation offset and Single/Continuous modes. Build on persisted stamp rotation and existing gesture arbitration; retain one history action and interrupted-gesture rollback. Resolve physical 3.4 findings first where necessary.

**3.6:** Quest 3 Studio/Passthrough environment switching using WebXR immersive VR/AR.

**3.7:** Full Phase 3 acceptance testing, including measured sustained headset sessions, storage pressure and source/export round trips.

**4.0:** Advanced sculpting brushes.

**4.1:** Non-destructive procedural spline tubes with editable control points and explicit SDF baking.
