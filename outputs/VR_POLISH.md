# Phase 1.12d — VR polish, reset and performance

The physically successful Phase 1.12c wrist grab is preserved: no solver redesign, smoothing, layer grab or two-hand action was added. The user reports that immersive rendering, realistic models, Support grip movement and wrist rotation already work on Quest 3. **These new Phase 1.12d refinements have not been physically verified by Codex.**

## Controls and feedback

Launch with the existing secure Quest workflow (`npm run dev`, then authorized USB `adb reverse tcp:5173 tcp:5173` → Quest Browser `http://localhost:5173/`, or your configured trusted `npm run dev:https` origin). See [workspace guide](VR_WORKSPACE.md).

- **Support grip:** unchanged direct translation/rotation. A thin muted green grip halo and indicator mark grab entry/hold; release leaves a brief fading-independent transition indication, then clears. No haptic or motion filter was added.
- **Tracking loss:** stale controller poses stay hidden. A short fixed-card message reports loss/disconnection, and the existing detailed hand row reports pose state. Recovery clears stale feedback; a still-held grip must be released/repressed. Models never remain floating as a false tracked pose.
- **Rays:** Realistic remains default; idle lasers are now hidden. Trigger/hover feedback appears contextually, and hovered controls truncate the ray at the card. Simple retains pointers; Minimal stays contextual. Rays/hit tests are suppressed while grabbing. Realistic model assets, animations and fallback behavior are unchanged.
- **Reset Workspace View:** use the mirror button or the third footer button on the VR debug card. It cancels/rearms any grab and restores the **first tracked entry placement and scale**, not a new position following your current head. It never changes layer transforms/SDF/history/export coordinates. Before a first tracked viewer pose, no reset anchor exists and it safely returns false. Release the grip before operating debug ray buttons; the mirror can reset during a grab.
- **Performance:** use the mirror checkbox or fourth VR footer button. It is off by default. The separate fixed panel appears to the left of the initial view; the existing controls/card remain to the right. Toggle it off for an uncluttered workspace. The mirror also shows the last render sample.
- Footer order is now **Models | Hints | Reset | Performance**. Role swap and Show/Hide diagnostic header buttons still work. Help remains Hidden/On demand/Always and describes working versus reserved inputs.

Release persists navigation during the session. Exit restores desktop camera/background/navigation, and next entry fits anew. Reset restores this session's original view even if you physically moved your head since entry. No automatic head-following, walking or teleportation.

## What the performance panel measures

- FPS estimated from XR callback intervals, average/latest/p95/max frame interval over the last **120 valid samples**.
- Session spike count: after six baseline intervals, an interval exceeds both **2 × prior rolling average** and **prior average + 8 ms**. It does not assume a 72/90/120 Hz headset. Paused/invalid intervals (nonpositive or >=1 s) are excluded; session start resets statistics.
- CPU time for the existing XR update/render-submission path, plus the separate input/debug CPU sample. It is **not GPU duration, compositor/reprojection FPS or motion-to-photon latency**. The optional performance card's own repaint happens after the render sample; its next texture upload occurs on a later render.
- `renderer.info.render` draw calls and submitted triangles sampled after the app's render. Stereo, models, UI and runtime rendering paths affect these counters; they are not unique sculpture triangles.
- Active layer resolution, independent layer resolution summary, and visible source/composite mesh counts. Because editing/visibility/project operations are paused during XR, this sculpture census is captured **once at entry**, not traversed every frame. Realistic assets may load during the session; render counters reflect that change, while source census remains static.

Text updates at most **2 Hz**. When disabled, the card does not repaint or render. It uses one cached plane/texture. The ordinary diagnostic values are sampled at up to 10 Hz but upload only on content change; unchanged hints also reuse their texture. Small browser CPU values can round to zero.

## Profiling findings and safe changes

Inspection found unconditional static help/diagnostic uploads, persistent idle rays and unnecessary idle Support grip matrix updates. Changes are limited to content caching, a fixed typed timing ring, context-only ray feedback, skipped hit tests while grabbing/hidden, and updating grip world matrices only when a grab needs them. Source mesh extraction and the rigid grab solver are unchanged. No new geometry is generated per controller movement.

Synthetic ten-second / 900-frame UI scheduler with no-op canvas: **1 debug paint, 1 hint update**, versus the old code's repeated up-to-10-Hz updates; **0** disabled and **20** enabled performance paints. This counts paint/texture-update requests, not physical GPU upload costs.

Warm Node CPU benchmarks: empty-workspace anchored update ~**0.00014 ms/frame**; two-source polling ~**0.00021 ms**, visual bridge ~**0.00042 ms**. They exclude model animation, descendants, canvas/hit testing, render/GPU and hardware. Source mesh medians **15.1 / 11.3 / 11.7 ms** at 64³/128³/192³, versus previous 15.1 / 11.4 / 11.8 ms; uncontrolled variance applies. No SDF rebuild is caused by grab/reset.

Detailed models, first asset/texture uploads, stereo draw calls, many 16-cell chunks and Glossy reflections remain possible Quest bottlenecks. No GPU timer, adaptive quality controller, mesh simplifier, draw-call batching, sparse storage or worker/GPU SDF rewrite was introduced. Main bundle warning remains.

## Physical acceptance checklist

1. Enter VR on the normal hardware URL; confirm grey, preferred realistic controllers and the original comfortable fit. Verify no idle permanent rays.
2. Grip Support, translate and rotate by wrist. Confirm no press jump, responsiveness unchanged, a subtle active halo, and no release jump. Repeat at several poses.
3. Lose/recover tracking or disconnect one controller while held. Confirm last valid workspace freezes, stale model disappears, a loss/recovery indication is visible and re-press is required.
4. Move the sculpture away, release, then choose Reset Workspace View from the card. Confirm original entry position/scale, unchanged layer metadata/voxels/history and no camera/desktop-gizmo interference. Repeat with the mirror reset during a grab.
5. Turn performance on/off. Check FPS/intervals/spikes, renderer counts, active 64³/128³/192³ information and source/composite counts against the chosen sculpture view. Turn your head slightly left to read the fixed card; confirm it does not obstruct the sculpture.
6. Switch Simple/Minimal/Realistic and hint modes. Verify feedback/controls still work; press Tool grip/both grips and confirm no new gesture or layer manipulation.
7. Exit/re-enter repeatedly. Verify preferred models remain correct without duplicates, metrics reset, desktop background/camera and editing return, and native/GLB project coordinates are unchanged.
8. Record OS/Browser/runtime, layers/triangles/render mode, actual callback timings and any comfort/GPU issues. Prior physical success does not certify new feedback/reset/performance changes.

## Actual architecture for Phase 1.13a

Use the current code, not older next-phase suggestions:

- `main.ts`: one renderer/animation loop; XR branch bypasses desktop tool and meshing ticks. It provides a one-time source census to XRExperience and locks editor controls, except XR presentation/debug controls.
- `XRSceneRig`: separate tracking and workspace roots, metre-based initial fit, first-view home anchor/reset and exact desktop restoration.
- `XRControllerInput` / `XRControllerRoles`: reused per-frame states, physical identity independent of slots/roles, profile maps, press/release edges, cancellation/rearming. Existing both-grip input is available but has no dual-hand gesture owner.
- `XRControllers`: session lifecycle, models/feedback, debug ray consumption and the single `WorkspaceGrab`; it still orchestrates directly. **There is no general multi-gesture coordinator or two-hand implementation.**
- `WorkspaceGrab.step`: unchanged `currentRigidGrip × inverse(initialGrip) × initialWorkspaceWorld`, converted to the parent. Only Idle/Workspace Grab operate; the union's layer/two-hand/sculpting names are placeholders.
- `captureNavigationHandoff`: a new explicit snapshot of current world workspace and unique participant connection IDs/world grip matrices. It copies/validates data without changing active ownership or enabling two hands. Capturing both poses and the current workspace on the transition frame gives the next owner a zero-delta starting anchor. Scale clamps, midpoint/direction math, twist handling and gesture arbitration remain to implement.
- Models remain async `XRControllerModelFactory` assets cached by profile/hand, with timeout/fallback. Visuals never gate input. Diagnostics/hints/performance are tracking-space UI and excluded from exports.
- Sculpture architecture remains independent **dense cubic VolumeStore/SDF layers**, standard 64³/128³/192³ options and **16-cell chunked CPU extraction**. Ordered Boolean preview is derived data; only explicit Bake creates a sampled layer. Native format remains **v3 with legacy migration**; viewport colours/style preferences are supported, VR navigation/preferences are not serialized. Both neutral GLB export paths exclude XR workspace presentation. No sparse octree or GPU compute exists.

For 1.13a, add an explicit ownership coordinator around the existing grab solver. On the second grip edge, snapshot **current** workspace and both current tracked poses; do not reuse the old single-hand press anchor as the dual-hand anchor. On release back to one grip, reanchor that remaining hand to the current workspace rather than restoring an old pose. Define zero-distance rejection, participant identity changes, tracking loss/blur/role/reset cancellation, uniform scale limits and debug-hit priority. Preserve one-hand wrist behavior. The snapshot helper is preparation only; two-hand scaling/rotation is deliberately not implemented here. Independent layer grabbing is also still out of scope. In the actual frame path, `XRControllers.update` invokes the single solver every frame: the new owner must arbitrate that call. `presentationScale` is an entry-fit field, so later live scaling needs effective-scale diagnostics. The main XR branch bypasses desktop remesh ticks; VR sculpting is not secretly enabled by this handoff helper.

## Validation

TypeScript/Vite build passes; **244 tests pass, 0 failures, 0 skips**. Existing tests preserve rigid grabbing, release, tracking recovery, native bytes, geometry identity and both exports. New tests cover reset/home/re-entry/data isolation, feedback and reconnect clearing, variable-rate stats/spikes, optional/throttled performance UI, visible census, texture caching, reset/performance hit regions and handoff continuity. The ray fixture now explicitly marks its fake card visible, matching the runtime's hidden-panel hit guard.

The completion report includes these actual architecture findings and the latest development-status section. Physical Phase 1.12d verification by Codex remains pending.
