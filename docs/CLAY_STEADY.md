# Clay Steady stroke control

Current follow-up: [Phase 1.13f](VR_BRUSH_SIZING.md) adds Tool-stick brush sizing/preview and enables the existing Smooth engine in VR. Smooth preserves these Clay path settings but does not apply them; the Smooth deferral below describes this earlier baseline.

Implemented 2026-10-25. This follow-up adds the previously absent VR Clay stroke boundary so the Steady control is usable, rather than a settings-only placeholder. It does not claim completion of the broader continuous-stroke performance work planned for Phase 1.13e. Physical Quest 3 verification of this follow-up is pending; earlier menu/control verification remains recorded separately.

Current placement: [VR Free Clay](VR_FREE_CLAY.md) makes Clay free-space by default and retains Surface follow as an option. Steady/Straight Line now use that 3D tip trajectory when Free space is selected.

## Controls and feedback

Select **Clay** using Support Stick Up → Tool Wheel. Its Options now contain a **Steady 0–100% slider**, default **0%**, and a **Straight Line Off/On** choice. Point with Tool Hand, hold its trigger and drag along the slider; −/+ buttons also step by 5%. Straight Line disables the slider/buttons while retaining the previous Steady value. Turning Straight Line off restores that value. Both controls are session tool preferences, retained across menu/session reopening; they are not added to the native project format and return to defaults after an application reload.

Dismiss the menu, then point at the selected visible/unlocked layer in **Separate Layers** and hold the Tool trigger to draw. Add/Subtract, radius, strength and hardness come from the existing application brush settings. Spacing/time integration remains the existing `ClayStroke` implementation. Smooth remains a separate desktop surface operation; this trajectory filter never performs SDF smoothing. VR Smooth and VR stamp application remain deferred.

- **Steady 0%, Straight Line off:** hit samples go directly to the existing Clay engine. There is no path filtering, replay queue or delayed commit. Raw trajectory capture remains constant work per sample; the original desktop stroke path is unchanged. Live mesh refresh uses the existing 30 Hz convention. Releasing commits one history action.
- **Steady >0%:** raw samples are retained while drawing; a mint filtered path previews the stroke. No SDF edits occur while the trigger is held. Release freezes the final preview and applies that exact polyline through the existing Clay engine in bounded batches, as one undoable action. The final release position is included if its ray still hits the target.
- **Straight Line on:** an endpoint-to-endpoint segment replaces trajectory smoothing regardless of Steady. It uses the same preview/release-to-apply policy and preserves the stroke duration. Steady stays unchanged and disabled.

The diagnostics/hints distinguish live freehand, preview/release-to-apply and applying the preview. Menu/diagnostic trigger interaction never also sculpts. Existing Support grip / both-grip workspace navigation and Transform-only layer grip remain in place. A grip takeover cancels an unfinished Clay stroke before navigation starts. Undo/Redo and menu requests are suppressed until the stroke finishes or cancels.

## Trajectory algorithm and coordinate spaces

`clay-path.ts` is device-independent. At zero, `filterClayPath` returns the original path by identity; the live runtime bypasses the filter entirely. At higher values it:

1. Builds cumulative layer-local arc length from raw hit samples.
2. Resamples uniformly at approximately 5% of the local brush radius, independently of controller frame count.
3. Applies nonnegative, bounded-support spatial averaging. Support grows from a small fraction of the brush radius toward .65 radius; blend strength grows with Steady. There is no velocity-dependent time lag or extrapolation.
4. Fades filtering near the ends and pins the exact first and last samples. The local weighted averages stay within their contributing samples' convex hull. The intended broad curve remains a curve; only Straight Line requests a segment.

Raw world-space controller origins/directions/timestamps and the layer-local surface-hit trajectory are retained in RAM for the current stroke. Nothing in these traces is serialized or exported. The controller ray hits only the active layer's source meshes. The full inverse surface-group world matrix removes XR/workspace/sculpture/layer-parent transforms before trajectory capture. Brush radius converts from the existing project/world units through the layer's uniform scale; workspace presentation scale never becomes layer metadata or source voxel data. Preview points use that same layer-local basis, transformed into a tracking-space sibling helper outside all project/export roots.

`ClayStrokeSession` freezes brush/path settings at stroke start. Replay keeps sample timestamps and subdivides time to at most 1/120 second per queued sample, preserving elapsed-strength integration and stationary holds. Linear subdivisions remain on the frozen preview polyline; the commit never smooths the path again. The existing Clay dab spacing, hardness and Add/Subtract formula then apply normally. Camera/workspace navigation does not enter history.

## Cancellation and limits

Tracking/identity loss, ray miss, target visibility/lock loss, changed target/workspace transform, mode/menu ownership change, reset, disconnect, blur or XR session termination cancel the unfinished stroke. Buffered drawing has no SDF edits to undo. Live freehand or partially replayed edits use a new sparse-history **cancel** operation to restore original Float32 values, invalidate/rebuild affected chunks and retain the previous undo/redo timeline. No rollback is implemented as a second Undo action. Fresh neutral trigger input is required after interruptions/reconnect; a trigger held through a menu cannot start painting as the menu closes.

A sample gap above 150 ms, malformed values, more than 8,192 raw samples, excessive spatial samples (16,383) or more than 200,000 replay samples cancels rather than silently simplifying or bridging an invalid path. At 90 Hz the raw limit is roughly 91 seconds. Project commands remain unavailable during drawing/replay; callers must respect this shared transaction boundary.

## Intentional latency and performance

The preview refreshes at most about every 33 ms. For **any nonzero Steady**, the SDF waits for release; long strokes therefore intentionally remain preview-only until the user finishes. The tail and other provisional preview samples can refine while more input arrives. After release, the exact final preview is frozen until application finishes. Prefer short strokes when evaluating responsiveness.

Replay cooperatively budgets **4 ms / up to 64 queued samples per XR update**. This is not a hard frame-time guarantee: one brush call and the final synchronous mesh rebuild cannot be preempted. The final mesh may appear only after replay and rebuild finish. Dense/large-radius/high-resolution scenes and long strokes can take substantially longer than the small-scene benchmark. Grip/session cancellation may also require a rebuild to restore the last committed surface.

Synthetic Node benchmark (`node scripts/benchmark-clay-steady.mjs`, raw results `outputs/clay-steady-benchmark.json`):

- Two-second 181-sample path, 100% filter: median about **0.039 ms**.
- 90-second 8,101-sample path, 100% filter: median about **1.53 ms**, maximum observed about **3.29 ms** across the measured calls.
- Synthetic curved path RMS deviation: raw **0.01269**, Steady 35% **0.00967**, Steady 100% **0.00263**, approximately **79% reduction** at 100%, with pinned endpoints and retained curvature.
- One 64³ buffered stroke: release preparation about **0.134 ms**; **6 replay updates**, **34.3 ms total Node pump work**; slowest update about **22.1 ms**, including final meshing. Scheduling six replay updates after release would occupy roughly **78 ms at 90 Hz**, before accounting for actual rendering/scheduling delays. This is a calculation, not measured Quest latency.

These measurements exclude real XR sampling, rendering, GPU/canvas uploads and headset behavior. Zero-mode pure-function timings include validation, but the live zero-mode runtime bypasses that function. Preview geometry uses one preallocated position buffer, reused rather than allocating GPU buffers as the stroke grows. No extra application dependencies were installed.

## Verification

TypeScript/Vite build passed. Full suite: **311 passed, 0 failed, 0 skipped** (297 prior + 14 new). Logs: `outputs/clay-steady-build.log`, `outputs/clay-steady-tests.log`. Existing desktop sculpt/history/export regressions remain covered. New tests cover zero identity and exact old-engine results for Add/Subtract, jitter reduction, retained curvature/convex bounds/monotonic paths, endpoints, stationary samples, time warping and 30–120 Hz recordings, matching preview/replay fields, cancellation/redo retention, transformed workspace/layer parents, menu/grip/trigger ownership and XR session termination, real slider dragging/reconnect capture, Straight Line priority and value restoration. The synthetic 30 vs 120 Hz final 25³ SDF field difference was below 0.0005 (observed maximum about 0.000189).

The production menu canvas was rendered/inspected with the bundled canvas runtime: `outputs/clay-steady-clay-options.png` and `outputs/clay-steady-clay-straight-line-options.png` show the slider enabled and disabled at an illustrative retained 75%. Those images are not a claim of headset testing. Synthetic path samples are in `outputs/clay-steady-paths.json`.

## Quest 3 acceptance checklist — pending

1. Select Clay and confirm Steady starts at 0%, Straight Line off. Draw Add and Subtract strokes; confirm live freehand response and one Undo/Redo action per stroke.
2. Drag Steady to 35%, then 75–100%. Draw the same broad curve with small hand tremor. Confirm the mint preview reduces deviations while preserving the curve and both endpoints. Release and compare the resulting SDF stroke to that exact preview.
3. Vary controller speed; compare short and longer strokes. Observe preview lag and post-release application time, especially at 128³/192³ or large radius. Record Quest/browser versions and frame spikes rather than assuming a refresh rate.
4. Enable Straight Line: the preview becomes the start/end segment, Steady is disabled but retains its number. Disable it: the previous Steady value is usable again.
5. Repeat under workspace rotation/zoom and translated/rotated/uniformly scaled layers. Verify unrelated layers/metadata remain unchanged and hidden/locked/Boolean targets cannot start Clay.
6. During preview and during replay, test grip takeover, controller occlusion, disconnect/reconnect, ray miss, reset, role change and VR exit. Confirm no unfinished source edits/history action survive; prior edits and redo remain intact.
7. Test menu trigger selection and dismissal with a held trigger. Neither menus nor diagnostics should paint. Release/repress before starting a new stroke after an interruption.
8. Exit VR: verify desktop freehand/Smooth/stamp/gizmos, native save/load, separate and Boolean GLB, and undo/redo. Steady preferences are session-only; source edits use the normal native project data.
