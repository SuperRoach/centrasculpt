# Phase 1.13i — Alternate brush, feedback and recovery

Support trigger holds a temporary brush: **Smooth** by default when the primary is Clay. In Tool Options, **Support trigger alternate** cycles Off / Smooth / Clay. The override currently supports the two continuous brushes; Stamp and Transform remain explicit primary modes. Configuration is session state, with no native schema change.

Press/release Support trigger while Tool trigger is up to switch immediately. During a live stroke or Steady/Straight Line preview/replay, switching/restoration waits until that transaction finishes and Tool trigger is released. Releasing Support does not cancel, split, or prematurely commit the Tool stroke. Releasing it before a queued override begins withdraws the request. Restoration recovers the prior Add/Subtract/Smooth mode, radius, strength, hardness and placement/Steady/Line settings. Edits to temporary settings are discarded on restoration.

Menus, diagnostic pointer ownership and grips reserve input ahead of alternate use. A blocked Support hold requires release/repress. Menus restore the primary before dispatching an explicit tool selection, so closing a palette cannot overwrite the selected tool. Grip navigation retains normal precedence and cancellation. Role changes, visibility loss, disconnect, Support tracking loss and session exit cancel unfinished work and restore the override; held buttons cannot restart editing through recovery. Existing Tool tracking/target/bounds cancellation and neutral stick rearming remain in place.

Support stick still has four directions: Left Undo, Right Redo, Up Tools, Down Layers. Tool stick sizes brushes/stamps while idle, including while Support trigger holds the alternate brush. Centre the Tool stick after switching tools to rearm sizing. Tool trigger, strokes/replay, menus, diagnostics and all grips still block sizing. The temporary radius readout appears in the HUD; releasing Support restores the original primary radius. Tool grip manipulates a layer only in Transform; Support grip and both grips navigate/scale the workspace. Realistic models, independent layer data, transformed placement and save/export paths are unchanged.

The small headset card now shows the active tool plus contextual stroke/alternate/selection/size feedback independently of expanded diagnostics. Controller hint cards describe the Support trigger. The desktop VR diagnostics help explains precedence and queued restoration.

## Optional haptics

**Subtle controller haptics** in desktop VR diagnostics can be disabled. Best-effort impulses cover tool changes, successful stamp commits, stroke start/end, successful Undo/Redo, changed selection and entering a workspace/layer grab. There are no per-dab or per-voxel impulses. The implementation checks the XR source gamepad's `hapticActuators[0].pulse` capability. Missing hardware, false results, throws and rejected promises do not affect editing. Pulses use intensity .10–.25 and duration 12–28 ms; one pending request and an 80 ms shared cooldown per physical source suppress bursts. A suppressed event is dropped, never queued. Closely spaced events may intentionally share one perceived cue.

API references: [WebXR Gamepads Module](https://www.w3.org/TR/webxr-gamepads-module-1/), [W3C haptics extension discussion](https://www.w3.org/2023/07/breakout_haptics_TPAC/haptics.pdf). Actual Quest Browser actuator support/feel must be verified on hardware. No vibration-effect fallback is required for unsupported devices; editing works silently.

## Verification and limits

433 automated tests pass, including new exact restoration/native-byte isolation, buffered and live stroke transitions, fresh-press guards, configurable alternates, physical-role bridge tests with reversed slots, interruption recovery and haptic failure/throttling checks. Existing source isolation, Boolean/Bake, transformed brushes/stamps/layers, exports, four-way shortcuts and dual-grip tests pass. Build and diff whitespace check pass. No physical-headset or new browser visual acceptance claim.

`benchmark-alternate-haptics.mjs` measures only warm Node semantic routing plus suppressed haptic requests with a stub settings port: median 0.000033 ms/frame, maximum batch mean 0.000036 ms/frame, 100,000 frames/batch. It does not measure UI tool-selection side effects, SDF, remesh, GPU, WebXR frame timing or actuator latency. See `outputs/phase-1-13i-input-benchmark.json`. Existing synchronous stamp/remesh stalls and Vite bundle-size advisory remain. Dense fixed layer bounds remain; **Future Phase 3.1 expandable SDF bounds/sparse storage** is explicitly deferred for future scheduling, with no resampling or detail reduction introduced here.

## Physical Quest 3 checklist (pending)

1. Enter secure WebXR with Touch Plus controllers. Verify realistic models, gray background, active tool card, optional hints and correct physical Tool/Support roles in both handedness settings.
2. Select Clay Add, then Subtract; set distinct radius/strength/hardness, Steady/Line and placement. Hold Support trigger: Smooth appears. Release: exact prior settings and Clay operation return.
3. Hold Tool trigger for Clay; press Support during the stroke. Verify the stroke continues without a gap/reset; release Tool and verify queued Smooth. Undo/Redo must replay one completed action.
4. Start Smooth under the override. Release Support while Tool stays down; verify smoothing continues. Release Tool; verify restoration after completion, with no extra action.
5. Repeat queued press/release with Steady and Straight Line, including the applying-preview phase. Withdraw a queued alternate before release and confirm Clay remains primary.
6. Configure Off, then Clay with primary Smooth. Check Off produces no alternate/queued status; configured Clay restores Smooth on release. Stamp and Transform do not become temporary brush overrides.
7. Open Tools/Layers palettes; hold Support trigger, close and keep holding. Confirm no brush starts until release/repress. Select a primary tool while a temporary override was active; it must remain selected after closing.
8. Point Tool at diagnostics and test trigger ownership. Repeat with Tool grip, Support grip and both grips; no sculpt/stamp edits may leak through a grab. Verify dual-grip scaling and layer transform commit/Undo remain correct.
9. Verify all four Support-stick shortcuts. While holding alternate Smooth, centre the Tool stick, then push Up/Down to grow/shrink its radius. Confirm the radius readout appears, Tool trigger/strokes/menus/grabs block sizing, and releasing Support restores the original primary radius. Repeat with either Tool hand; a stick held off-centre across tool changes must wait for neutral.
10. Hide/lock/select other layers; verify edits target only the active visible unlocked independent source. Test scaled/rotated/translated layers and workspace zoom.
11. During alternate strokes, open the system menu, blur/re-enter, swap roles and disconnect/reconnect either controller. Also obscure tracking for each hand. Unfinished work rolls back; primary/settings restore; held triggers cannot restart.
12. Exit/re-enter VR while holding the alternate. Verify desktop settings and models recover, no residual ghost/preview/helper or stale hold. Completed actions remain undoable.
13. With haptics enabled, feel tool selection, stamp commit, stroke boundaries, successful Undo/Redo, selection and grabs. Hold strokes and move continuously: no continuous vibration/per-voxel spam. Rapid actions may intentionally omit a cue.
14. Disable haptics and repeat; all editing must work silently. Repeat on a runtime with unavailable haptics if possible.
15. Save/reload a multilayer project, compare source transforms/voxels and undo behavior, then export separate and Boolean GLB. No HUD/controller/selection helper may appear in exports.
16. Check frame intervals and memory during long strokes, Steady/Line replay, large stamps and high-detail layer selection. Record Quest Browser/version and headset timings; Node timings do not establish headset acceptance. Test amber fixed-bound warnings; defer expansion rather than silently clipping a whole stamp or resampling sources.
