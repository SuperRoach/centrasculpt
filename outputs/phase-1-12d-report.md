# Phase 1.12d — completion report

## 1. What changed

Subtle Support-grab/release halo and tracking-loss/recovery feedback; contextual idle rays while keeping Realistic preferred; Reset Workspace View in headset and mirror; optional VR performance panel; cached diagnostic/help textures. The physically validated direct wrist solver is unchanged, with no smoothing. Desktop sculpting, source layers, grey background, native data and exports are preserved.

## 2. Technical decisions

Reset restores the first tracked entry matrix, cancels/rearms active grips, and never follows later head movement or writes sculpture data. Performance is off by default, repaints at 2 Hz, reads post-render submission counters and caches sculpture census at entry. Adaptive callback spike statistics assume no refresh rate. `captureNavigationHandoff` is a validated world-matrix/participant snapshot only; two-hand manipulation and independent VR layer grabbing remain unimplemented.

## 3. Verification

`npm run build`: passed. `npm test`: **244 passed, 0 failed, 0 skipped** (232 existing + 12 new). Reset/native/history/GLB invariance, feedback/reconnect, variable-rate spikes, optional UI, static texture caching, button availability changes and zero-jump handoff preparation covered. Existing grab/controller/desktop tests pass. Emulator checks show matched Touch Plus models, realistic idle-ray suppression, performance/readouts and reset. Prior physical rendering/models/grip/wrist success is user-reported; **new Phase 1.12d physical verification by Codex is pending**.

## 4. Performance measurements

Synthetic stationary 10 s/900 frames: **1 debug paint, 1 hint update, 0 disabled performance paints, 20 enabled paints**. Counts are update requests, not GPU timings. Warm Node anchored update ~0.000139 ms/frame; polling/visual bridge ~0.000206/0.000423 ms under documented exclusions. Source local meshes **15.1 / 11.3 / 11.7 ms** (64³/128³/192³), prior 15.1 / 11.4 / 11.8 ms; uncontrolled variability. Example Mac emulator sample ~120 FPS, 94 calls/80,964 submitted triangles, active 64³, 32 source/0 composite meshes. No headset/GPU latency claim. Production JS **845.79 kB / 227.16 kB gzip**, +8.58/+2.72 kB; existing bundle advisory remains.

## 5. Known issues

Fixed side-card readability/halo subtlety and new reset/performance behavior need Quest acceptance. CDN model/first-upload and dense stereo/model/Glossy cost remain; no offline model bundle, GPU timer or quality/LOD rewrite. Performance source census is entry-cached because XR editing is disabled. Render submissions are not unique sculpture triangles, callback FPS is not guaranteed display/reprojection FPS, and JS timing excludes GPU completion. No two-handed coordinator, scaling/twist logic, VR layer/SDF tools or navigation serialization exists.

## 6. Next phase — actual code constraints

Phase **1.13a should implement coordinated two-hand workspace interaction**, superseding the old handover's layer-grab suggestion. Add explicit ownership around the unchanged single solver, snapshot the current root and both tracked grips on join, reanchor the remaining hand on leave, and define separation/scale/twist/cancellation policies. Do not run both solvers on the root. Distinguish handoff from `input.suspend()` cancellation. Preserve user-confirmed single-hand wrist feel and presentation-only data isolation.

`presentationScale` is currently entry-fit metadata, so live scaling must expose effective scale. Main's XR branch bypasses desktop mesher/compositor ticks; no VR sculpting pipeline currently runs. Independent layers are dense cubic VolumeStores with 16-cell CPU chunks; native files remain v3 and GLBs exclude XR presentation. A detailed, **verbatim snapshot of the most recent current development-status findings** follows, so the next prompt can target the actual APIs and limitations.

## Checkpoint, launch and files

No Git repository is available; verified checkpoint `before-phase-1-12d.tar.gz` / `.sha256`. No original files deleted or new dependencies installed. Launch unchanged: `npm run dev` and the established Quest secure origin (authorized USB: `adb reverse tcp:5173 tcp:5173`, Quest Browser `http://localhost:5173/`; configured trusted HTTPS: `npm run dev:https`). New physical checklist and measurement definitions: `VR_POLISH.md`.

New: `src/xr-feedback.ts`, `src/xr-performance.ts`, `src/navigation-handoff.ts`, `tests/vr-polish.test.mjs`, `scripts/benchmark-vr-polish.mjs`, `docs/VR_POLISH.md`.

Updated: `src/xr-controllers.ts`, `src/xr-scene.ts`, `src/xr-session.ts`, `src/xr-diagnostics.ts`, `src/xr-hints.ts`, `src/xr-experience.ts`, `src/main.ts`, `scripts/compile-core.mjs`, `tests/xr-controllers.test.mjs`, `README.md`, `docs/VR_WORKSPACE.md`, `docs/DEVELOPMENT_STATUS.md`.

Evidence: build/test logs, UI/workspace/input/source benchmark JSONs, emulator observation JSON and `phase-1-12d-performance.png`. The complete historical handover is `phase-1-12d-development-status.md`.

---

# Latest DEVELOPMENT_STATUS.md current-phase findings (embedded snapshot)

## Phase 1.12d — VR Interaction Polish and Performance (current)

The user confirms prior physical Quest 3 immersive rendering, preferred realistic controllers, single Support-grip navigation and natural wrist rotation. This phase preserves those behaviors. The actual `WorkspaceGrab.step` solver is unchanged from the checkpoint: direct normalized-quaternion rigid pose delta, no lag or smoothing. New physical Phase 1.12d feedback/reset/diagnostic acceptance is pending; no Codex hardware claim.

### What changed and technical decisions

- New `ControllerFeedback` supplies reused transition state for grab start/hold/release, tracking loss/recovery and reconnect clearing. A thin muted green grip halo and indicator mark the active Support hand, including realistic models; a short release cue clears automatically. Stale untracked model poses remain hidden. Loss/recovery messages appear briefly on the fixed debug card and detailed tracking rows remain available. Model materials/animation and physical-hand identity are untouched.
- Realistic remains the default. Idle permanent lasers are suppressed in Realistic/Minimal; trigger or debug-control hover provides contextual rays, truncated at the card hit. Simple retains pointers. While grabbing, debug hit tests and rays are skipped, preventing competing intent and unnecessary work. Existing desktop input suspension/gizmo isolation remains.
- `XRSceneRig.resetWorkspaceView()` restores a saved local matrix from the first tracked viewer entry placement. It does not recompute from the moving head, scan/resample SDFs or modify layer metadata. Before a tracked home exists it safely returns false. `XRControllers.resetWorkspaceView()` cancels/rearms grips first; release/reset keeps the existing initial physical scale. Reset is reachable from the mirror button and the third debug-card footer button. Current-session release persistence and next-session fresh fit remain.
- New `XRPerformancePanel` is off by default and fixed to the left of the initial view. A cached plane/texture refreshes at most 2 Hz; off means no paints/renders. It shows estimated callback FPS, rolling average/latest/p95/max interval, cumulative adaptive spike count, CPU submission/input timings, render draw calls/triangles, active resolution and visible source/composite mesh counts. Mirror output records the last render sample. Counters are sampled after `renderer.render`; scene census is cached once at entry because editing/visibility changes are blocked during XR.
- `XRFrameStats` now uses a fixed 120-entry Float64 ring with running sum instead of array shifting; p95 sorting occurs only at report intervals. Spikes use the prior rolling average after six baseline intervals, exceeding both 2× average and average+8 ms. No headset refresh rate is assumed; invalid/nonpositive/>=1 s pause gaps are ignored. These are callback/JS statistics, not GPU, reprojection or motion-to-photon measurements.
- Inspection found unconditional repeated diagnostic/hint texture updates. Both now cache displayed content: static text requests no repeated upload. Input detail sampling stays bounded at 10 Hz; optional performance paints at 2 Hz. Idle Support grip world-matrix updates are skipped; the normal renderer remains responsible for descendant matrices. Geometry resources are reused. Stock factory animation allocations and model draw cost were not rewritten.
- Footer is now **Models | Hints | Reset | Performance**; role/detail header controls stay intact. `captureNavigationHandoff()` prepares a validated copy of current workspace-world matrix and unique tracked participant IDs/world grip poses. It does not switch states or implement two-hand motion. Only Idle/Workspace Grab still operate. Reserved enum names are not a general gesture router.

### Actual architecture findings to base Phase 1.13a on

These findings supersede historical next-phase recommendations below. **This phase did not implement layer grabbing; Phase 1.13a is two-hand workspace preparation/implementation, not an assumed existing layer tool.**

```text
Existing app renderer / setAnimationLoop
  main.ts XR branch: XRExperience.frame → renderer.render → finishFrame
Scene
├── XR Tracking Origin
│   ├── tracked camera
│   └── Controller Tracking: native ray/grip groups + debug/help/performance UI
└── Workspace Root: navigation-only TRS + first-entry reset anchor
    └── Sculpture Root
        ├── independent source layer render groups → 16-cell chunks
        └── derived ordered Boolean preview
```

1. `main.ts` bypasses desktop brush/stamp/compositor/mesher ticks during XR, suspends camera/tool ownership, and permits only XR presentation/debug controls. Its entry hook caches active and independent resolution metadata plus visible source/composite mesh counts. `finishFrame` samples renderer counters; it does not call extraction.
2. `XRSceneRig` owns entry fit/placement, separate roots, `resetWorkspaceView()` and exact desktop restore. Reset uses the first-entry anchor, not current head position. Workspace presentation is deliberately absent from native saves and both GLB paths.
3. `XRControllerInput` holds two reused live frame states, profile maps, source-derived handedness/connection IDs, logical roles and edges. Visibility/pose/disconnect/role changes cancel and require rearming. Controller slots never define left/right. `XRControllerRoles` resolves planned role bindings; those descriptions do not execute tools.
4. `XRControllers` still directly orchestrates polling, feedback, models, debug hits and the one `WorkspaceGrab`. There is **no general interaction coordinator, dual-hand owner, two-hand scaling/twist solution, VR layer manipulation, or controller SDF editing**. The pure `captureNavigationHandoff` helper is a boundary snapshot only. Next code must add ownership/arbitration explicitly around the existing solver.
5. `WorkspaceGrab.step` remains `G(t) × inverse(G0) × W0`, converted through the workspace parent's inverse. Release retains navigation; interruption cancels safely; next entry fits afresh. Hand-off preparation captures **current** workspace and current participants, so a future gesture can start with identity delta without jumping. It must not reuse the old single-grip anchor when a second grip joins or a hand leaves.
6. Controller models still use async `XRControllerModelFactory` profile/hand caches, proxy lifecycle listeners, timeout/fallback and source rebinding. They are grip children; target rays are separate. First assets depend on the HTTPS CDN unless a future local path is provided. Availability never gates input/grabbing.
7. SDF architecture is still independent **uniform cubic dense VolumeStore/SDF layers**, normal 64³/128³/192³ options, **16-cell CPU chunk extraction** and dirty-region invalidation. There is no sparse octree, GPU compute or automatic layer merge. Ordered Boolean preview is derived data; explicit Bake alone creates a newly sampled layer. Native format remains **v3** with legacy migration, colour/style preferences, and no VR navigation/preferences serialization. Separate-layer and Boolean GLBs remain neutral and exclude presentation TRS.
8. Remaining likely headset costs are dense stereo chunk/model draw calls, stock model animation, initial asset/texture uploads and Glossy reflections. No physical GPU/thermal profile, adaptive quality, batching/LOD, worker meshing or offline model bundle is implemented. A warm Node microbenchmark is not a headset FPS budget.

Additional concrete integration constraints: `XRControllers.update()` still calls `grab.step()` for the Support input every XR frame; a future dual-hand owner must arbitrate/bypass that call while dual-owned, rather than run two solvers against the same root. Existing role/reset/interruption paths use `input.suspend()` to rearm buttons; a normal single↔dual handoff must distinguish ownership transfer from cancellation. `XRSceneRig.presentationScale` records the **entry fit**, not dynamically measured live workspace scale; future uniform two-hand scale needs effective scale reporting. `main.ts` returns from the XR render branch before desktop remeshing/compositor ticks, so later VR sculpting will require explicit bounded geometry scheduling; no such path is currently active. Content caching includes connection/hand/button availability so a zero-valued profile change cannot leave stale diagnostics.

### Files, checkpoint and validation

New: `src/xr-feedback.ts`, `src/xr-performance.ts`, `src/navigation-handoff.ts`, `tests/vr-polish.test.mjs`, `scripts/benchmark-vr-polish.mjs`, `docs/VR_POLISH.md`.

Updated: `src/xr-controllers.ts`, `src/xr-scene.ts`, `src/xr-session.ts`, `src/xr-diagnostics.ts`, `src/xr-hints.ts`, `src/xr-experience.ts`, `src/main.ts`, `scripts/compile-core.mjs`, `tests/xr-controllers.test.mjs` (fake card explicitly visible for ray-hit fixture), `README.md`, `docs/VR_WORKSPACE.md`, this status. No dependency/SDF/schema/ordinary history/export implementation changes. No Git repository; verified pre-edit archive `outputs/before-phase-1-12d.tar.gz` plus SHA-256. No original files deleted.

- `npm run build`: **PASS**, TypeScript + Vite. JS **845.79 kB / 227.16 kB gzip**, versus 837.21 / 224.44 kB (+8.58 / +2.72 kB). Existing Vite >500 kB advisory remains. Development emulator is absent from production assets.
- `npm test`: **244 passed, 0 failed, 0 skipped** (232 existing + 12 new). New coverage: reset/home/head isolation/re-entry, native/voxel/history/GLB invariance, grab/release/loss/recovery feedback and reconnect clearing, variable 72/90/120-Hz synthetic interval inputs/spikes, optional/throttled performance UI, visible census, static texture version reuse, reset/performance hit regions, immutable handoff snapshots and identity-delta continuity. Existing grab mathematics, models, desktop features and VR lifecycle tests remain.
- Browser emulator: matching realistic Touch Plus assets, no permanent idle rays, opt-in performance display, reset action and mirror counters verified. Warm sample ~120 FPS / 8.33 ms; **94 calls / 80,964 submitted triangles**, active 64³, **32 visible source meshes / 0 composite** for the test sphere. These include stereo/model/UI contributions and are not unique sculpture triangle counts. Full observation JSON preserves the exact sample. Physical Phase 1.12d testing is pending.

### Performance measurements and limits

`benchmark-vr-polish.mjs` synthetic 10 s / 900-frame schedule with no-op canvas: **1 stationary debug paint, 1 hint texture update, 0 disabled performance paints, 20 enabled paints**. Earlier code repainted static help/diagnostics up to 10 Hz; this measures scheduler/update requests, not real GPU uploads or a hardware speedup.

`benchmark-workspace.mjs`: empty-workspace rigid update **0.000139 ms/frame**. `benchmark-xr-input.mjs`: core **0.000206 ms**, bridge **0.000423 ms** warm median batch means. Both exclude model animation, descendants, canvas/hit tests/render/GPU/headset; no physical latency claims.

Source benchmark: local meshes **15.1 / 11.3 / 11.7 ms**, brush **0.13 / 0.46 / 1.28 ms** at 64³/128³/192³, versus previous meshes 15.1 / 11.4 / 11.8 ms (0.0 / −0.1 / −0.1 ms; uncontrolled variability). Inactive layer data/geometry remained unchanged; no grab/reset-triggered extraction. Existing 64/128/192 dense memory/CPU characteristics are unchanged.

The optional performance card has its own small render/texture cost. Source census is entry-cached by design; future VR editing/visibility must explicitly invalidate that cache. Displayed render counters vary with stereo/runtime/loaded model/UI. Rolling max is a 120-sample peak; spike count is session cumulative, and long pause gaps are excluded. Detailed diagnostics remain opt-in user-controlled; fixed side-panel readability/halo subtlety need Quest checking.

### Physical status and Phase 1.13a recommendations

User-reported prior hardware success covers rendering, models, Support movement and wrist rotation, superseding the prior handover's physical-pending baseline. **Codex has not tested these new D changes on a physical Quest.** Follow [VR_POLISH.md](VR_POLISH.md): preserve direct grip feel/press/release, inspect halo and loss/recovery, reset from moved pose, toggle performance/other modes, verify metadata/native/export invariance and repeat exit/re-entry. Capture actual OS/browser, scene complexity and callback/GPU observations before tuning.

For 1.13a, introduce explicit ownership transitions Idle ↔ Single Workspace Grab ↔ Two-Hand Workspace Grab. On join, snapshot current workspace + both current tracked poses via `captureNavigationHandoff`; on return to one hand, reanchor the remaining hand to the current workspace. Define minimum hand separation, uniform scale clamps, midpoint/direction/twist policy, invalid pose/identity/role/reset/blur cancellation, deterministic release and debug-hit priority. Keep the physically validated one-hand solver unchanged; do not enable independent VR layer/SDF tools implicitly. Add zero-jump join/leave, no drift, uniform-only scale, data/export invariance and repeated-session tests. Preserve presentation-only TRS and update source census caching only if editing later becomes possible.

### Six-part completion report

1. **Changed:** subtle grab/loss feedback, context rays, entry-view reset, optional performance panel and cached diagnostics.
2. **Decisions:** preserve the solver byte-for-byte; navigation-only entry anchor; post-render counters/entry census; prepared snapshots without active two-hand behavior.
3. **Validation:** build passed; 244/244 tests; emulator counters/reset/models checked; new physical acceptance pending.
4. **Performance:** static text updates collapse to one in the synthetic stationary run; optional card 2 Hz/off zero paints; local meshing unchanged within noise; GPU/headset costs remain unmeasured.
5. **Known issues:** CDN/model and dense stereo costs, fixed side-card comfort, bundle advisory, no global gesture coordinator or two-hand implementation.
6. **Next:** Phase 1.13a ownership + zero-jump two-hand anchors, using the actual module/API findings above. Historical suggestions of Phase 1.12d layer grabbing are superseded.

