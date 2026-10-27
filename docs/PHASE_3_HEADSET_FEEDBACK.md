# Phase 3.7 — Quest feedback and polish

**Wrap-up — 2026-10-28:** Phase 3.7 implementation/polish closed for this pass at the user's request. Latest build and 791 tests pass. Latest two-chunk Clay scheduling/CPU-gap fix still needs physical retest; measured performance acceptance remains open. User cannot test further now; no further headset work requested or scheduled. See DEVELOPMENT_STATUS.md for final handover and known limits.


2026-10-27. User tested the acceptance build on the headset and reported approximately **one hour in Passthrough**. This is user-reported functional acceptance of that build, not an instrumented FPS/memory/thermal run. The changes below are implemented and host-tested; their physical retest is **PENDING**.

## Two-chunk follow-up: 2026-10-28

User tested the budgeted version on Quest at 128-based resolution: faster controller, mesh lag and occasional fast-Clay cancellation. Recent screenshot window is 90 FPS with 12 ms maximum; expanded volume 128×161×225 still shows prior 151.7 ms remesh and 168.4 ms growth. Now up to **two chunks within a 3 ms admission budget**, plus full-update CPU accounting in the pose-gap guard. Build/791 tests pass; host 128³ drain 37→13 updates (higher per-update CPU). These latest changes remain **PENDING headset retest**. Full metrics and caveats in DEVELOPMENT_STATUS.md.

## XR Clay performance follow-up: 2026-10-28

After the supplied 128³ Quest capture showed remesh latest/p95 63.8/113 ms, XR Clay/Smooth now remesh one chunk per update and finish remaining chunks across updates after release. Geometry/resolution and one Undo are retained. Wait for “applying the preview” to finish before starting another stroke; menu/tracking interruption still cancels the pending stroke. Surface can trail the brush. Build and 790 tests pass; host benchmark/evidence and limitations are in DEVELOPMENT_STATUS.md. Quest performance improvement remains **PENDING**; no new headset test requested during this implementation.

## Latest physical confirmation: 2026-10-28

User confirms the Layer Colours default is fine and the controller rendering fix worked. These two focused checks are **user-reported PASS**. Measured Quest frame times, resource/memory trends and long-run performance acceptance remain **PENDING**.

## Follow-up: 2026-10-28

User reports “works better” and alternate Clay works great, but cannot grab the mirror offset. Implemented a round red centre handle and tolerant border ray hit, including the edge-on default X plane. Hold **Tool trigger** on the sphere, move the controller along the mirror normal, release to set. Tool menu now renders above other panels, and Clay feedback explicitly says **SUBTRACT (alternate)** while active. Production build and **781 tests pass**; evidence in `followup-build.log` / `followup-tests.log` under `outputs/phase-3-7/`. These three changes need headset retest (**PENDING**); no new Quest performance claim.

## Physical results actually reported

| Original checklist group | User report / status |
|---|---|
| 1. Entry/environments | “Works fine.” User-reported PASS for the exercised flow; individual denied/unsupported cases not itemized. |
| 2. Clay | Free-space drawing good. **OPEN regression:** circle partly embedded in starter sphere makes neighboring original surface blocky. Straight Line worked; Steady 100 felt too weak. Requested 15° snap, live sizing and default alternate Subtract. |
| 3. Precision/mirror | Requested visible red plane and dragging its offset. Individual geometric/constraint cases not itemized. |
| 4. Stamp | Grip translation/rotation and preserved offset user-reported PASS. **OPEN responsiveness:** brief Continuous freeze. Lightweight initial preview suggested. |
| 5. Move | Elastic grab exercised; requested stick to adjust edge softness after capture (explicitly clarified, rather than influence radius). Individual four-mode cases not itemized. |
| 6. Layers | “All worked good, except merging” — user-reported PASS for exercised layers workflows, with missing easy two-layer merge. |
| 7. Controls/lifecycle | “Works great.” User-reported group PASS; no individual interruption/handedness trace supplied. |
| 8. Save/recovery/export | “Works Great.” User-reported group PASS; file-version/preset subcases not separately enumerated. |
| 9. Quality/endurance | “Worked well”, approximately one hour in Passthrough. User-reported extended smoke PASS; no telemetry or quantitative quality measurements supplied. |

Do not turn unspecified subcases into physical passes. The baseline acceptance guide's all-PENDING wording describes the earlier audit; this report supersedes it for the exercised groups. Remaining detailed cases and every new behavior below still need retesting.

## Implemented changes and controls

1. **Clay overlap regression:** the old free-space applicator multiplied signed distances by strength/hardness, including its positive exterior. Because evaluation is bounded to an AABB, that lowered nearby sphere samples outside the applicator and corrupted the surrounding zero-crossing/gradient band. The corrected field keeps unit-slope distances through a two-voxel surface band and the positive exterior; strength/hardness still modulate deeper interior values. Add/Subtract share the fix; Smooth's diffusion kernel is unchanged. The new overlap test fails on the old code and passes on the fix. Old damaged strokes are not silently repaired: Undo and redraw, or use a fresh starter sphere.
2. **Shared angle snap:** **Snap 15°** button in Tool Wheel and Tool Options, also in desktop shared Precision settings. Snaps Straight Line's layer-local azimuth/elevation about its captured start, preserving length; explicit X/Y/Z axis constraint wins. Also enables 15° snapping for Move rotation/Twist. Freehand Clay stays freehand; layer transforms/Stamp rotations are not implicitly snapped. Existing per-Move snap choices remain available when the shared toggle is off. Optional preference defaults off for old files.
3. **Live Clay sizing:** Tool stick Up grows / Down shrinks **while drawing Clay**, including alternate Subtract. Each buffered Line/Steady point records its local radius and replay interpolates those recorded values, so release does not replace the whole stroke with the final radius. One gesture remains one Undo action. Smooth still captures its radius; menus, grips, lost tracking and commit/replay disarm sizing until neutral.
4. **Stronger Steady:** maximum spatial averaging support increases from .65 to 1.10 brush radii, with a progressive curve. Pinned endpoints, rate independence, monotonicity and major path curvature remain tested. It smooths the trajectory, not the sculpture's surface; a new physical feel check is needed.
5. **Clay alternate:** fresh defaults choose **Opposite Clay · Add / Subtract**: hold Support trigger, then Tool trigger to cut instead of add (or add instead of cut); release restores the exact prior settings after the active stroke finishes. Default Move alternate remains Smooth. Explicit saved alternate preferences, including Smooth, are preserved. For an older project, choose **Support trigger alternate → Opposite Clay** once if it restores your former Smooth preference.
6. **Red mirror plane:** display-only rectangle follows the selected layer's local plane/offset and transforms. In VR, point at its red **border or centre handle**, hold Tool trigger and move your hand along the plane normal to change offset; release sets it. The interior passes rays through for sculpting. Tracking/menu/session/target/workspace interruption cancels the drag and restores its initial offset. No SDF/history/export geometry changes. Desktop displays the same guide, with existing numeric offset controls.
7. **Elastic grab softness:** idle Tool stick still sets influence radius. Once an Elastic translation grab is captured, Up softens / Down firms the edge **within the captured radius**. GPU preview and final CPU reconstruction use the same changed falloff. Pivot, radius, stiffness, displacement and transaction ownership stay captured. Release/commit and cancellation retain existing one-action semantics. Non-Elastic/Rotate/Twist sizing behavior is unchanged.
8. **Two-layer merge:** in VR Layers, **Merge with… → choose other layer → choose 64³/128³/192³ → confirm**. Keep the palette held while it runs; release/cancel aborts safely. Desktop **Bake / Merge layers… → Sources → Selected layer + chosen layer (Union)** does the same. Exactly those two transformed sources are unioned, regardless of their previous layer Boolean operations or visibility; unrelated sources are excluded and unchanged. Output is a new independent editable layer; originals remain hidden and recoverable, with one Undo restoring the stack/view/visibility. Pair merge switches to Separate Layers to avoid reapplying unrelated Boolean operations to the newly inserted result. It needs a spare layer slot and the existing voxel/triangle budgets. This retains Bake safety; it does not reduce the stored layer count or delete originals. Output resolution can lose detail; original grids are kept.
9. **Continuous Stamp responsiveness:** exact evaluation, packed-history preparation, writes and per-chunk remeshing now advance cooperatively over controller updates. The existing cached low-detail shape meshes show the hand plus up to **16 pending samples** (and mirrored copies); these are temporary helpers outside project/export geometry, not a low-resolution authoritative SDF. Final source resolution is unchanged. Release drains the queue and commits one action; cancellation returns the entire unfinished stroke and retains redo. Existing Single stamping remains synchronous.

## Evidence and remaining limits

- Strict TypeScript/production build PASS; **779/779 complete tests** and **89/89 actual-worker Move checks** PASS, zero failures/skips; whitespace clean. New tests cover the overlap, operation defaults/legacy preferences, variable-radius replay, snap persistence, plane drag/cancel/native isolation, Elastic CPU/GPU falloff, exactly-two-source merge/cancel/Undo/native, and staged-stamp rollback during evaluation/writes/meshing plus bounded pending previews.
- [Before/after WebGL image](../outputs/phase-3-7/feedback-clay-overlap.png): same lights/material/camera, partly embedded 48-segment ring, 64³/128³. [Raw field/mesh report](../outputs/phase-3-7/feedback-overlap.json): neighboring sphere band samples incorrectly overwritten **140→0 at 64³, 336→0 at 128³**. Analytic union surface-probe max error .50877→.48504 and .60287→.43056 voxels respectively; vertex/centroid probes are not Hausdorff distance. Coarse geometric silhouettes and genuine union creases remain resolution-limited. Standalone Clay quality remains unchanged within numeric precision across 64³/128³/192³.
- [Final continuous benchmark](../outputs/phase-3-7/feedback-stamps.json): all 16 shape/operation/64–128 cases complete **11 stamps / one Undo**. Synchronous controller-update maxima **4.56–12.18 ms**, per-case update p95 **4.31–7.21 ms** on this Mac, including pending preview maintenance. Earlier synchronous individual calls had reached **450.52 ms** in the baseline fixtures. These are different units (one update versus one whole stamp), intentionally measuring work distribution; total exact work is not eliminated. Maximum drain was **1,007 update calls** for an artificial one-frame .9-unit jump. Queue lag can be substantial; the hand/pending preview remains provisional until it drains. No Quest frame-time promise.
- Cooperative admission targets 4 ms between slices, not a hard deadline. Typed-array allocation/growth, a single meshed chunk, cancellation rollback, final transaction commit, Single stamps and manual native loading can still pause. Resource budgets/cancellation remain; physical responsiveness and long-session telemetry remain OPEN.
- Final mixed stress (real worker Moves/recovery/export, fake IndexedDB): **18.02 s**, 321 strokes, 24 direct synchronous stamps, 20 layer cycles, 82 Undo/Redo, 1 Bake, 11 loads, 12 Moves, 14 checkpoints, all GLB presets. 29 jobs, **zero active workers/live threads**, RSS peak **671.80 MiB**, maximum harness timer gap **2,276.20 ms** (includes synchronous native loading/meshing/GC). This stress uses the model API rather than XR frame pumping and does not establish hours-long leak freedom or Quest performance.
- Real desktop browser pair merge completed at 128³ with both originals hidden; Undo restored both visible layers, source selection and 0 undo / 1 redo. [Screenshot](../outputs/phase-3-7/feedback-merge-browser.png). No physical testing of these changes claimed.

## Focused headset retest — PENDING

1. Fresh starter sphere: draw a partly embedded circle, inspect the neighboring sphere surface, Undo/Redo. Repeat at 64³ and 128³. Existing saved damage requires undo/redraw to compare.
2. While holding Clay trigger, resize Up/Down, then repeat with Steady and Line. Check taper/radius history and one Undo. Hold Support for alternate Subtract and release to restore Add.
3. Try Steady 100 again. Toggle Snap 15° in the wheel; draw lines in XY/XZ/YZ directions and test Move rotation, then turn it off.
4. Enable Mirror, point at the red border/centre, trigger-drag along its normal and release. Check the plane and mirrored stroke agree. Open a menu or lose tracking mid-drag: offset should revert.
5. Capture Elastic, move the stick: softness should change while radius/pivot remain fixed. Release and compare the committed result to preview; Undo/Redo.
6. Select layer A, Layers → Merge with… → B → resolution → confirm. Check the new layer, originals hidden, unrelated layers unchanged, one Undo. Cancel a second attempt while running.
7. Continuous Stamp: fast translation and wrist turn with each shape, both operations. Check hand tracking/pending ghosts, drain after release, one-action Undo, and cancellation via menu/grip/session exit. Repeat 128³ and a short 192³ case; record any freeze or long queue.
8. Save/reload and recovery once with snap, mirror offset and alternate preference set. Repeat principal controls in the opposite Tool Hand. Capture diagnostics for stalls using the original profiling runbook.

## Changed implementation

Clay field/path/session and shared tool preferences; XR sizing/alternate/controller routing and Elastic preview falloff; new `src/xr-mirror-plane.ts`; shared staged Stamp kernel/history plus bounded XR pending previews; pair-source Bake and desktop/VR menus. `tests/headset-feedback.test.mjs` adds eleven focused integration contracts, and the overlap regression extends `free-space-clay.test.mjs`. Existing tests were updated for the explicitly changed controls; previous Smooth behavior remains exercised through its configurable option. Recovery admission also waits for transient XR plane/stroke interactions before snapshotting preferences.

## Reproduction and handover

```sh
npm run build
npm test
npm run test:worker
node scripts/prepare-clay-overlap.mjs
node scripts/benchmark-continuous-stamps.mjs outputs/phase-3-7/feedback-stamps.json
node scripts/benchmark-clay-precision.mjs outputs/phase-3-7/feedback-clay-quality.json
node scripts/stress-session.mjs outputs/phase-3-7/feedback-stress.json 320
npm run dev -- --host 127.0.0.1
```

Visit `/scripts/fixtures/clay-overlap-quality.html` after the preparation script. It pins old field code to `9aa9936` for reproducibility. No dependencies or lighting editor added. User changes and prior audit artifacts retained; incoming tracked diff checkpoint `/private/tmp/vrapp-headset-feedback-incoming.patch`. No commit/push/merge by this task.

Next: focused physical retest and instrumented responsiveness/stability gate, then **Phase 4.0 Advanced Brushes**, **4.1 procedural editable spline tubes**, **4.6 lighting rigs**. Broad baseline smoke acceptance is now reported; full post-polish Phase 3 sign-off remains open.
