# Phase 1.13g — VR Shape Stamping

Implemented 2026-10-26. Automated implementation and browser smoke complete; **physical Quest 3 acceptance pending**. Full build and **374 tests pass** (340 previous + 34 new). No commit or push.

## Using the tool

Select **Shape Stamp** from the Support stick Up Tool Wheel. Options provides Sphere, Cube / Box, Triangular Prism and Square Pyramid, Add/Subtract, dimensions, wrist rotation offsets and uniform scale. Keep the active layer visible/unlocked and use Separate Layers. Create an Empty clay volume on desktop to start in empty space.

The ghost follows a virtual applicator **12 cm along the tracked grip's forward axis**, matching Clay's physical offset. It follows wrist rotation. Teal is Add, rust is Subtract, amber is a bounds warning. No surface ray or existing triangles are required. Move the controller to position the shape, then **tap Tool trigger once**. Holding—even while moving—never repeats. Release before the next stamp. A changed stamp adds one undo action; identical/no-op stamps leave history and redo intact.

Tool stick Up/Down increases/decreases the shared shape uniform scale proportionally with elapsed time. Neutral stops. Rate is .9 per second in logarithmic space, with existing dead-zone/diagonal guards and 50 ms delta cap. VR scale controls clamp to **0.02–10×** and preserve dimensions/proportions. Desktop dimensions and stamp scale remain shared with Options; the native format is unchanged. Small features remain limited by voxel spacing. Scale is intrinsic layer-local shape size; workspace zoom changes presentation, never these stored values. Resizing pauses during held triggers/grips, menus, grabs or other busy work and requires neutral after interruptions.

The three VR rotation rows now mean **Wrist offset XYZ**: local Euler offsets compose after the controller wrist orientation. They start at zero and are session tool preferences. The resulting layer-local pose is shared back to the desktop ghost; desktop numeric rotation and existing rotation/move tools still work when VR exits. VR does not change the desktop Follow Pointer/Move/Rotate preferences.

Support mappings are preserved: Left Undo, Right Redo, Up Tools, Down Layers; Support grip moves workspace and both grips rotate/scale it. Tool grip alone remains inactive in Stamp. Menus, grabs, tracking/role/layer/tool changes, diagnostics, visibility loss and XR exit cancel/rearm the input latch. A trigger held through recovery cannot apply a new stamp. Completed stamps remain committed and undoable after interruption.

## Coordinates and bounds

`XRShapeStamp` receives the actual Tool grip matrix from the existing controller bridge. It offsets the tip in physical XR/world metres, converts position and orientation through the inverse **actual layer surface world matrix**, then composes the wrist offset. It preserves the definition's intrinsic uniform scale, rather than retaining the inverse workspace scale from decomposition. Tracking origin, workspace, sculpture root and independent layer transforms therefore participate in position/orientation conversion without entering native project metadata.

The VR ghost reuses the production `ShapeGhost` procedural geometry cache and the existing `ShapePreviewModel`; it is a separate presentation object under controller tracking, outside source/composite/export roots. Its parent correction reconstructs the same surface-world × shape-local transform used for stamping. Four shapes are built lazily once, with material/pose changes thereafter; moving the controller does not regenerate geometry. Existing desktop ghost behavior is unchanged.

Bounds use the same conservative rotated local AABB and one-voxel positive-boundary margin as the desktop command:

- **Add:** amber warning, “move or shrink”; the entire stamp is rejected atomically until it fits. An invalid press is consumed; moving inside while held cannot stamp. No silent clipping.
- **Subtract:** amber warning when outside/partially overlapping, with explicit notice that only material inside the layer is affected. Empty/disjoint subtraction is a no-op. Existing distance/positive-boundary validation can reject an excessively large cutter without edits.

Layer bounds remain fixed, normally [-1.6, +1.6] per local axis. Use the initial empty-layer/scale workflow in [VR_FREE_CLAY.md](VR_FREE_CLAY.md). Scaling a populated layer changes its physical voxel spacing explicitly; no automatic growth, resampling or merging occurs here.

**Future Phase 3.1 — Expandable SDF bounds and/or sparse voxel storage.** The application must eventually support sculpting and stamping outside the original small layer bounds without losing existing detail or requiring manual resampling. That storage-system change is deliberately deferred.

## Architecture, exact history and performance

`XRToolInteraction` presents one controller interaction to the existing arbitration bridge, routing between the unchanged Clay/Smooth transaction adapter and the discrete Stamp adapter. It cancels the inactive input latch. Tool Options and analogue control use the existing authoritative preview state; there is no second SDF engine or controller mapping system.

`IndependentLayers.stampShape` remains the single desktop/VR command, using `prepareStamp`'s read-only exact CSG patch and existing per-sample chunk invalidation/composite refresh. Exact min/max fields can change far-field samples, particularly in an empty positive grid, so preparation/writes may span much of the dense volume. Restricting writes to the shape interior would change those existing field semantics. Geometry rebuilds still affect only dirty chunks.

A measured bottleneck was copying the already-staged patch through a second history Map. `SculptHistory.commitPatch` now snapshots the unique typed-array patch directly, before source writes. Caller mutations cannot corrupt snapshots. Empty-source stamps skip normal-only invalidation for same-sign far-field samples, because there is no existing surface there; sign changes still invalidate neighboring chunks. Populated-layer normal/sign handling is unchanged. Existing stroke history/cancellation remains on its prior path. The newest action is still retained even if it alone exceeds the existing soft history budget.

Benchmark `node scripts/benchmark-vr-stamps.mjs`, result `outputs/phase-1-13g-stamp-benchmark.json`. One empty-field Add followed by identical Subtract, rotated 0.5-unit shapes; Node CPU only, uncontrolled load, excludes browser/XR/GPU and async Boolean refresh:

| Grid / shape | Add eval / mesh / total | Subtract eval / mesh / total |
| --- | --- | --- |
| 64³ Sphere | 22.8 / 10.3 / 36.0 ms | 14.1 / 1.9 / 16.2 ms |
| 64³ Box | 19.3 / 11.7 / 33.1 ms | 8.9 / 14.9 / 23.9 ms |
| 64³ Prism | 68.1 / 7.1 / 76.6 ms | 8.1 / 2.2 / 10.5 ms |
| 64³ Pyramid | 51.7 / 4.8 / 57.4 ms | 5.8 / 2.1 / 8.0 ms |
| 128³ Sphere | 107.7 / 13.7 / 130.4 ms | 34.1 / 2.3 / 36.9 ms |

These stamps rebuilt **8/64 or 8/512 chunks**, not every chunk. Exact history after these pairs used about **3 MiB / 24 MiB**; transient patch buffers and grid/mesh memory are additional. The 192³ path remains covered by existing engine tests, but this benchmark did not measure its VR cost.

After 100 warmup updates, 1000 moving ghost updates measured median **0.005 ms**, p95 **0.012 ms**, one cached sphere geometry and zero history actions. Cached geometry supports cheap live preview. The stamp command is still **synchronous**: a discrete Add can visibly pause rendering, especially at higher resolution or on Quest. No headset frame-rate claim is made. There is no asynchronous in-flight job to cancel midway; gating occurs before the atomic command and later interruptions suppress subsequent presses. Use 64³ first. Cooperative/worker-based preparation, writes and meshing with atomic cancellation is recommended Phase 1.13h work; sparse storage stays Phase 3.1.

## Validation and files

TypeScript/Vite build PASS; full suite **374 passed, 0 failed/skipped**; `git diff --check` PASS. Logs: `outputs/phase-1-13g-{build,tests}.log`. Existing Vite bundle-size advisory remains (~899 kB before gzip).

New tests exercise all four Add/Subtract shapes, immediate empty-space/disconnected creation, exactly one stamp per press, held-trigger motion, release/rearm, no-op history, exact undo/redo, rotation/offsets and full transformed parent chains, cached ghost geometry/colors, bounds/rejected presses, hidden/locked/unrelated layers, input ownership and fresh presses during interruptions, handedness and reversed controller slots, support undo/redo/menus/workspace/both grips, session termination, shared Clay/Steady/Straight routing, native save/load, and separate/Boolean binary neutral GLBs. History snapshots are tested against caller buffer mutation. Existing desktop and VR suites pass.

Live existing-server browser smoke selected Box using the desktop tool, entered the Quest emulator, rendered the grip-relative amber bounds ghost with realistic controllers/gray background, and exited with desktop controls restored. No application console errors. Screenshot `outputs/phase-1-13g-browser-stereo.jpg`. This smoke did **not** exercise controller-trigger stamping in the browser; bridge automation covers that logic. It is not physical hardware verification.

Added: `src/xr-shape-stamp.ts`, `tests/xr-shape-stamp.test.mjs`, `scripts/benchmark-vr-stamps.mjs`, this guide and benchmark/browser evidence. Updated: `src/xr-experience.ts`, `src/editor-tool-state.ts`, `src/xr-brush-sizing.ts`, `src/shape-preview.ts`, `src/xr-actions.ts`, `src/xr-session.ts`, `src/history.ts`, `src/independent-layers.ts`, `scripts/compile-core.mjs`, prior sizing regression expectations and development status. No dependencies, native schema, SDF shape kernels or volume bounds changed.

Incoming dirty `main` was checkpointed in `work/checkpoints/before-1-13g.tar.gz`, SHA-256 `205d58d6e276c6936f4f7e5e049860100251f83b6506b58163b42439f47b06e7`. Existing changes retained; no commit or push.

## Quest 3 physical checklist (pending)

1. Enter VR and select Shape Stamp from the Support Up Tool Wheel. Start with a 64³ layer and confirm that the options open.
2. Select Sphere and confirm a translucent Add ghost with a clear outline.
3. Move the controller: ghost center stays at the applicator and does not snap to existing surfaces.
4. Select Box and rotate your wrist through yaw/pitch/roll. Check orientation and optional wrist offsets.
5. Resize Up/Down with Tool stick, then center; check proportions and uniform scale values in Options.
6. Tap Tool trigger once inside bounds; confirm a single stamp at the ghost pose.
7. Hold trigger and move; confirm no repeated stamps or size changes.
8. Release and press again at another position; confirm a second independent history action.
9. Repeat Sphere, Cube/rectangular Box, Prism and Pyramid, including unequal allowed dimensions.
10. Select Subtract and carve existing material. Try empty space: no added material or empty history step.
11. Create/select an empty layer and stamp floating pieces entirely away from other geometry; hide other layers for clarity.
12. Support Left/Right Undo/Redo each stamp, verifying exact shape recovery and unchanged other layers.
13. Move/rotate the workspace with Support grip and scale/rotate with both grips. Repeat a stamp on a translated/rotated/scaled layer; preview and result must agree.
14. Open Tool Wheel/Layers/Options and tap controls: no accidental stamp. Confirm sizing pauses until neutral after menu exit.
15. Try hidden/locked layers; approach all bounds faces. Add crossing the safe margin must warn/reject. Partial Subtract must warn. Move inside while holding an invalid press: no stamp until release/repress.
16. Check left/right dominant hand changes, tracking loss, workspace reset, visibility loss and session exit/re-entry with trigger held. Completed stamps remain, held inputs do not create new stamps.
17. Save/reload; inspect Boolean Preview and both GLBs for floating components, unchanged transforms and absent ghosts.
18. Record pauses and frame diagnostics for all shapes at 64³ before trying 128³. Compare preview responsiveness between commands against the known discrete stamp pause. Do not interpret desktop benchmark timings as Quest measurements.

Recommended Phase 1.13h: measure headset command pauses/memory; cooperatively schedule the shared exact CSG/commit/remesh pipeline with explicit progress and atomic rollback; improve visible volume-bound guidance and calibrate applicator offsets on Touch Plus. Keep the working input mapping and exact history behavior intact.
