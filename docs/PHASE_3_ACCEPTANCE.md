# Phase 3.7 — Acceptance evidence and Quest 3 runbook

Follow-up: [user-reported headset results, implemented polish and focused retests](PHASE_3_HEADSET_FEEDBACK.md) supersede the baseline physical labels below. These original records remain as historical audit evidence.

2026-10-27. **3.7a host audit complete; 3.7b runbook complete, every physical check PENDING; 3.7c acceptance gate OPEN.** Automated correctness is green. Full Phase 3 / stable Phase 4 acceptance is not established: synchronous Stamp latency and physical Quest validation remain blockers. No lighting editor, control mapping, SDF authority, layer semantics or project format changes.

## Verified prerequisites and scope

Read DEVELOPMENT_STATUS first, then inspected the actual recovery, attachment/continuous stamping, environment/session/scene and diagnostics implementations and their tests. Phase 3.4 recovery, 3.5 attachment/continuous and 3.6 VR/AR switching exist; their physical/performance completion cannot be inferred from implementation. Recovery uses committed snapshots and explicit startup choice; continuous stamps retain one transaction with bounded queue but synchronous individual evaluation; environment transitions exit and require a fresh Enter gesture. AR support is independent; opaque AR rejects, desktop remains usable, background/scene state restore once. Existing precision, worker generation guards, cleanup and native/export semantics are exercised by the full suite.

Incoming checkout had modified status/compile/editor/main/style/UI/XR files and tests, plus untracked environment/save-status files and artifacts. Tracked incoming diff saved to `/private/tmp/vrapp-phase37-incoming.patch`; no reset/stash/staging/commit/push/merge performed by this task. HEAD advanced externally from `0032af9` to `9aa9936` during the run; that commit included incoming changes and some acceptance artifacts. It was preserved. Tests describe the working tree, including those follow-ups.

## Automated evidence

Commands below run serially to avoid worker contention. Logs and raw JSON: [outputs/phase-3-7](../outputs/phase-3-7/).

- `npm run build`: strict TypeScript and production Vite build PASS. Existing >500 kB bundle advisory remains; main JS 1,042.56 kB minified / 287.22 kB gzip.
- `npm test`: **767 passed, 0 failed/skipped/cancelled**; 11.20 s initial / 11.33 s final command wall time; final rerun also **767/767**.
- `npm run test:worker`: **89 passed, 0 failed/skipped/cancelled** with actual Move workers; 4.42 s. These are a second backend run, not 89 additional unique tests.
- Mixed deterministic stress: **321 strokes, 24 stamps, 20 layer cycles, 82 Undo/Redo, 1 Bake, 11 native loads, 12 worker Moves, 14 recovery checkpoints, all three GLB presets**. Exact native/Undo/Redo assertions, checkpoint CRC/retention and worker teardown passed. 29 worker jobs, zero active workers/live threads at completion. Fake IndexedDB models transaction semantics; browser storage durability still requires physical testing.
- Resolution stress: 900 moving samples and 20 rollback/Undo cycles each at 64³/128³/192³, real buffered Line/Steady, large Add/Subtract/Smooth, repeated rotated stamps, transforms/native/export; all assertions pass and pending remesh chunks end at zero.
- Geometry: 36 analytic extraction/growth fixtures (33/64/128/192), plus six current Clay fixtures, one warm-up and three measured extractions/runs. No Quest/GPU claim.

| Workflow | Passing automated coverage in `tests/` | Physical |
|---|---|---|
| Free-space Clay, Add/Subtract, Line, Steady, Smooth | free-space-clay, clay-steady, xr-free-clay, sculpt, vr-stress | PENDING |
| Support-trigger alternate Smooth and input priority | xr-alternate-haptics, xr-support-shortcuts, xr-controllers, vr-polish | PENDING |
| Mirror and precision constraints | sculpt-precision, move-precision-input, move-precision | PENDING |
| Single/Continuous, all shapes, offset/rotation, exact history | xr-shape-stamp, shape-stamp, shape-library, history-project | PENDING |
| Transform Layer, layered Boolean and Bake | xr-layer-grab, layer-transforms, boolean-composite, bake | PENDING |
| Non-Elastic/Elastic Kelvinlet/Rotate/Twist and async publication/cancel | persistent-move, elastic-integration, rotation-integration, move-worker; actual-worker rerun | PENDING |
| Expanded/sparse extraction, bounds and budgets | expandable-editing, chunks-resolution, chunk-spatial-index, dense-growth, scalability, move-large-invariants | PENDING |
| Undo/Redo, versions, autosave/recovery, save indicator | history-project, project-colours, recovery, stability, save-status | PENDING |
| GLB Fast/Standard/High, transforms, neutral material, pending guards | export-quality, render-style; mixed stress actual export workers | PENDING |
| Arbitration, handedness, tracking/lifecycle/cleanup | xr-controllers, xr-menus, xr-layer-selection, workspace-grab, webxr | PENDING |
| VR/AR capability, alpha clear, fresh gesture switch, fallback/integrity | webxr (includes installed Three.js background behavior) | PENDING |

This is component/integration coverage, not an automated physical end-to-end controller or compositor test. Source grids remain dense; sparse/lazy extraction and spatial indexing do not imply sparse voxel storage. Final build and whitespace checks also pass. No new external Khronos Validator run or Blender/CAD acceptance is claimed; existing export tests independently reload GLBs.

## Measured host results

Mac arm64 Node CPU; raw reports include scope. Timings vary with host load; benchmark workloads ran serially. No Quest FPS, GPU, thermal or memory figures have been measured.

| Resolution | Simulated edit CPU median / p95 / p99 ms | Remesh median / p95 / p99 ms (100 samples) | Recovery save+commit / copy ms |
|---|---:|---:|---:|
| 64³ | .060 / 7.615 / 10.774 | 7.205 / 11.053 / 12.759 | 71.01 / .44 |
| 128³ | .147 / 14.706 / 19.521 | 14.152 / 20.179 / 21.897 | 119.84 / 1.36 |
| 192³ | .351 / 28.577 / 33.091 | 27.855 / 33.088 / 34.238 | 243.72 / 6.70 |

Simulated edit CPU is processing one sample, with remesh every ninth sample: **not XR frame intervals or sustained FPS**. Recovery isolated 2 ms timer-probe maximum gaps: 4.16 / 4.92 / 5.05 ms; byte-exact native output at every size. Mixed 64+128 recovery: 128.22 ms, copy 1.80 ms. One observation each, not percentile distributions of saves.

Mixed stress wall 16.81 s; maximum timer gap **2,129.92 ms**, including synchronous native loading/meshing/GC. RSS peak **666.77 MiB**, not a heap or GPU cap. Post-GC heap across repeated 40–320 stroke stages stayed approximately 8.88–9.53 MiB while RSS rose 201.88→272.17 MiB; allocator/native buffers and retained history matter. After the 192³ checkpoint heap was 13.89 MiB and RSS 666.77 MiB. Ten native reloads ended at 11.50 MiB heap / 423.91 MiB RSS versus 11.28 / 416.55 after initial reload: a trend requiring longer comparable-fixture measurement, not proof of leak freedom. All sampled stage boundaries had zero pending Move jobs; these checkpoints do not measure peak in-flight jobs. Twelve actual worker Moves took 108.36–121.68 ms wall including reconstruction/meshing/publication.

Mixed-stress selected GLBs Fast/Standard/High: 1,237,648 / 413,128 / 310,096 bytes; 32.24 / 68.25 / 124.85 ms, each 17,172 triangles. These figures apply to that fixture only; existing large-export admission limits remain.

**Open high-priority responsiveness issue:** 16 continuous stamp cases (all four shapes × Add/Subtract × 64/128) each emitted 11 samples and one Undo action, but per-case maximum individual stamps ranged **21.84–450.52 ms**. Independent 192³ stress initial Add stamp took **1,039.58 ms**. Two-sample/update and between-stamp budget checks cannot interrupt one synchronous stamp. Correct cancellable staged/worker evaluation, growth/history and mesh publication need dedicated work and regression tests; a risky rewrite or cosmetic queue throttle is not a Phase 3.7 fix. No new high-priority correctness regression was found by this audit; no runtime fixes are claimed. Dense load/remesh stalls, export admission limits and bundle advisory remain open.

## 64³ / 128³ / 192³ geometry versus shading

[Actual desktop WebGL comparison](../outputs/phase-3-7/quality-comparison.png); reproducible page: `scripts/fixtures/phase-3-7-quality.html`. Same current Clay stroke, model-space radius .065, camera, neutral material and fixed lights at every resolution. Bottom row replaces only the material with unlit solid colour, exposing geometric silhouettes independently of normals/highlights. No smoothing, resampling or subdivision. Visual inspection shows coarse endpoints/contours at 64³; progressively finer silhouettes and more stable lit surfaces at 128³/192³. Small screenshots can hide facets: inspect the live page enlarged on desktop and repeat physically. Lighting can change perceived faceting but cannot add missing silhouette geometry.

| Resolution | Radius in voxels | Max analytic surface-probe error, model units / voxels | Max normal angle |
|---|---:|---:|---:|
| 64³ | 1.28 | .014270 / .28095 | 15.14° |
| 128³ | 2.58 | .003174 / .12598 | 6.85° |
| 192³ | 3.88 | .001504 / .08975 | 4.46° |

Vertex and centroid probes are not Hausdorff/silhouette distance. All six Clay fixtures had zero degenerate triangles. At radius .14 the errors are .13827/.06760/.04459 voxels and max normal angles 6.13°/3.10°/2.09°. Higher new-layer resolution improves geometric detail at increased memory/CPU cost; old stored Clay is not silently repaired. Editable lighting rigs remain **Phase 4.6**.

## Reproduction

From the Git-backed vrappPOC workspace, after installed dependencies:

```sh
mkdir -p outputs/phase-3-7
npm run build > outputs/phase-3-7/build.log 2>&1
npm test > outputs/phase-3-7/tests.log 2>&1
npm run test:worker > outputs/phase-3-7/worker.log 2>&1
node scripts/stress-session.mjs outputs/phase-3-7/stress.json 320
node scripts/benchmark-recovery.mjs outputs/phase-3-7/recovery.json
node scripts/benchmark-mesh-quality.mjs outputs/phase-3-7/quality.json
node scripts/benchmark-continuous-stamps.mjs outputs/phase-3-7/stamps.json
node scripts/benchmark-vr-validation.mjs outputs/phase-3-7/vr-stress.json
node scripts/benchmark-clay-precision.mjs outputs/phase-3-7/clay-quality.json
npm run dev -- --host 127.0.0.1
```

Open `/scripts/fixtures/phase-3-7-quality.html` for comparison; stop the server afterward. Benchmark output-path arguments were added to two existing scripts so reruns preserve historical reports. Defaults remain unchanged. CPU stress uses accelerated logical recovery time, not hours of headset use.

## Quest 3 physical acceptance — ALL PENDING

Record Quest OS/Browser versions, Touch Plus firmware, tool hand, build/commit plus local diff, trusted origin, selected environment, requested/observed refresh rate, battery and room conditions. Use a disposable test project; keep a manual `.form` copy before interruption/storage tests. Use the existing trusted HTTPS/ADB reverse workflow in README; ordinary LAN HTTP cannot enter XR.

| Check (run Studio, then Passthrough where available) | Expected acceptance evidence | Status |
|---|---|---|
| Capability, entry, denied request, exit/re-entry and unsupported AR | Explicit reason and usable desktop on failure; transparent room only in supported AR; fresh Enter gesture | PENDING |
| Free-space Clay Add/Subtract/Smooth; Line and Steady 0/50/100 | Continuous intended paths, empty-space no-op for cutters/Smooth, one-action Undo/Redo | PENDING |
| Support trigger alternate Smooth; interrupt with menu/grip | Prior tool/settings restore, release/repress prevents stray strokes | PENDING |
| X/Y/Z mirror + offset; Line axis; Move axis and 15/45/90° snap | Symmetric result/preview, no double influence at plane; constraints layer-local | PENDING |
| Each shape Single/Continuous Add/Subtract; fast wrist rotation, grip offset/reset | No grip-transition jump, expected spacing, one Undo; queued drain/cancel exact | PENDING |
| Transform Layer; locked/hidden/overlap/empty selection; Add New Layer | Tool grip layer move/rotate; support workspace; both workspace scale; saved layer coordinates correct | PENDING |
| Layer union/difference/intersect and Bake, then Undo/Redo | Sources retained as intended, result/export matches preview and history | PENDING |
| All four persistent Move modes + Preview only; exit during reconstruction | Responsive preview, one atomic commit or safe cancel, no late publication | PENDING |
| Expanded negative coordinates, widely separated islands, 64/128/192 | No clipping/seams/cross-layer damage; budget rejection retains work | PENDING |
| Lit/unlit comparison, then app Normal/Matte/Glossy under same view | Separate silhouette limits from highlight/normal artifacts; no geometry change on style switch | PENDING |
| Recovery idle checkpoint, reload, explicit Restore/Discard/Cancel, interrupted write | Correct checkpoint choice, committed state only, fresh restored history, old checkpoint retained after failed write | PENDING |
| Native versions available in fixtures, current save/load and all GLB presets | Layers/transforms/preferences survive; external viewer scale/count/visibility correct; download outcome checked | PENDING |
| Opposite Tool Hand; controller disconnect/reconnect and tracking loss; headset sleep/wake | Same role mappings; no stuck input, duplicate models/listeners or stale gestures | PENDING |
| Repeated VR→AR→VR, bright/dim room menu readability and permission rejection | Safe restore, retained completed geometry/history/offsets, visible opaque menus and controllers | PENDING |
| 30–60 minute mixed session, repeated load/edit/recovery/export and 10 switch cycles | Record comparable memory/frame traces; no crash, corrupt file or progressive degradation | PENDING |

Preserve existing mappings: Tool trigger edits/selects; Tool grip adjusts Stamp or transforms selected layer by mode; Support trigger alternate Smooth; Support grip workspace; both grips workspace rotate/scale; Support stick Left Undo / Right Redo / hold Up Tool Wheel / hold Down Layers; Tool stick Up/Down idle sizing. Menu/grab priorities and centre/release rearming remain unchanged.

## Diagnostics and profiling — physical capture PENDING

1. Enable **VR / WEBXR DIAGNOSTICS → Show VR performance** before entry. Record idle for 30 s, then 60 s per workload (Clay, Smooth, continuous Stamp, each Move mode, Boolean/Bake, recovery) at each resolution. Repeat in both modes and hands. Save screenshots/video and a timestamped result row per workload.
2. Record observed refresh rate, sample count, interval median/p95/p99/max and spikes, JS render/input CPU, draw calls/triangles, brush/remesh/path/replay timings and dirty chunks. The frame window is **120 intervals**, p99 appears only after **100 samples**; it is not a whole-session percentile. For whole-run percentiles use a remote browser performance recording; report sampling method and duration. Interval times include compositor scheduling and are not GPU timing. Compare with `1000 / observed Hz`, without claiming a fixed Quest target from host CPU.
3. Record Stability status before/after each identical workload and after idle: grid/history/Boolean/tracked bytes, heap if exposed, renderer geometries/textures, pending Move/Bake/export/recovery and checkpoint copy/commit time. Tracked bytes exclude JS/GPU overhead. Heap unavailable means unavailable, not zero. Pending Move must return to zero after completed/cancelled reconstruction. Use 10 comparable cycles with stable scene/history; do not confuse intended Undo/checkpoint retention or growth capacity with a leak.
4. Connect desktop Chromium remote inspection to Quest Browser using the existing USB debugging setup. Select this app tab, record Performance around the reproducible stall, and compare Memory snapshots at identical settled checkpoints where supported. Record disconnect/permission failures. Collect console errors, selected tool/radius/resolution, layer bounds/counts, step-by-step repro and native fixture. Avoid destructive storage clearing on a real project; quota failure is already simulated automatically, physical pressure needs a disposable origin/project.
5. Keep instrumented and uninstrumented runs separate to expose profiling overhead. No recording exists yet for Quest; every row above remains PENDING until the user supplies results. On corruption/crash, retain the last native file/checkpoint and stop that case; attach logs and exact reproduction before continuing.

## Gate and roadmap

Phase 3.4: implemented, host regression green, long physical stability PENDING. Phase 3.5: functionality implemented, synchronous Stamp performance OPEN, physical ergonomics PENDING. Phase 3.6: implementation/automated lifecycle green, physical transparency/readability/transition acceptance PENDING. Phase 3.7a completed host audit; 3.7b checklist delivered with physical execution PENDING; 3.7c no new correctness regression requiring a safe targeted patch, but performance/physical acceptance and stable Phase 4 sign-off remain OPEN. This is a reproducible provisional baseline, not full Quest acceptance.

Next: resolve budgeted cancellable Stamp work and run this physical gate; then **Phase 4.0 Advanced Brushes**, **Phase 4.1 procedural editable spline tubes** (editable points, explicit SDF Bake), **Phase 4.6 lighting rigs**. No editable lighting work in Phase 3.7.
