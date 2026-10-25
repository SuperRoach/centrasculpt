# Phase 1.13d — VR tools, layers and contextual options

Current follow-up: [Clay Steady](CLAY_STEADY.md) adds the Clay Steady slider, Straight Line priority and surface-ray VR Clay strokes. It supersedes the Clay-application deferral below; VR Smooth and stamp application remain deferred.

Target: Quest 3 / Touch Plus / Quest Browser / WebXR. Implementation and automated checks are complete; the user confirmed **controller-driven interactive menus worked well on real Quest 3 hardware** on 2026-10-25. Previous 1.13a–c workspace/layer controls and shortcuts remain user-verified on real Quest 3 hardware.

Current control refinement: [Phase 1.13f brush sizing](VR_BRUSH_SIZING.md) adds Tool-stick sizing and a matching brush-volume preview for Clay/Smooth.

## Using the menus

- Hold logical **Support Stick Up** to open the Tool Wheel. Point with the **Tool Hand** ray; tap its trigger to select Clay, Smooth, Shape Stamp or Transform Layer. The active tool has a green border; the hovered target highlights. Move Tool is visible but disabled until Phase 2.
- Selecting a tool shows its contextual Options in the same panel. The wheel's centre **Options** button opens the current tool's options without switching tools. **‹ Tools** returns to the wheel. Release the Support stick to close; reopen Up for the wheel again.
- Hold **Support Stick Down** for Layers. Tap a name to select, **Visible/Hidden** to toggle visibility, or **Locked/Unlocked** to toggle locking. Resolution and the selected row are shown. All eight supported layers fit without scrolling. No merge, resample or new-layer operation is added.
- Left/Right still Undo/Redo once per deliberate flick. Centre to rearm after any excursion. No action repeats while a trigger or stick is held.

The menu is a temporary .72 m square panel about 1.05 m ahead and .12 m below eye height. Each opening anchors relative to the latest tracked head pose, then stays still while pointing. It disappears on stick release. Realistic controllers, optional hints, diagnostics and the neutral gray environment remain intact. Only the Tool ray interacts with the menu; Support remains the holding hand. Roles follow the existing handedness setting and in-headset Swap Tool / Support control.

## Shared tool state and options

`EditorToolState` reads the existing desktop brush settings, `InputOwnership.mode` and `ShapePreviewModel`. It keeps no second active-tool or settings store. Tool selection routes through the existing application tool commands, with an explicit XR-authorized path through the desktop busy guard; loading, modal and active-edit guards remain enforced. Values changed here are the values seen by desktop controls after VR exit.

| Tool | Implemented settings | VR application |
| --- | --- | --- |
| Clay | Add/Subtract, radius .12–.5, strength .01–1, hardness 0–1 | Strokes deferred to 1.13e |
| Smooth | Same brush radius and smoothing strength | Strokes deferred to 1.13e |
| Shape Stamp | Existing shape library; Add/Subtract; XYZ dimensions; local XYZ rotation; uniform scale | No VR stamp application |
| Transform Layer | Move/Rotate/Scale option groups; numeric XYZ position, XYZ rotation, uniform scale; Separate/Boolean view selector | Tool grip moves + wrist-rotates the selected editable layer in Separate Layers |
| Move Tool | Disabled, labelled Phase 2 | No deformation |

Option rows are declarations with getters/setters, limits, steps and availability. **−/+** buttons step values; choice rows cycle previous/next. Transform option groups select the same desktop Move/Rotate/Scale mode. Grip manipulation retains the existing combined move/wrist-rotate behavior in all Transform groups; uniform scaling uses the numeric option, not controller scaling or thumbstick sizing. Numerical layer edits are metadata-only and one existing undo action per successful tap. Nonuniform legacy layer scale remains protected; use desktop controls to make it uniform before VR grabbing/scaling.

Shape dimensions honor the existing rules: sphere diameter links XYZ; pyramid width links depth. Linked dependent axes are disabled. Shape rotation uses layer-local degrees; dimensions/scale stay in existing validated native ranges. Seven option rows fit per page; Stamp has two pages with large previous/next targets. Automatic stroke spacing and deferred VR application are clearly disabled. There are no sliders, text entry, continuous press repeats or stamp/sculpt trigger handlers in this phase.

Brush values follow the existing native settings save/load path. Layer transforms, selection and flags follow existing project metadata. Shape preview parameters, tool/gizmo mode and menu visibility remain session state under the existing format contract. Visibility/locking and layer selection preserve the desktop commands' existing non-undoable behavior; they do not create a separate VR history. Undoable transforms/strokes/stamps/operations continue through the shared timeline. No schema, SDF, export, resampling or compositor algorithm changed.

## Input ownership

Raw profile/button/axis parsing remains in `XRControllerInput`. The existing four-direction recogniser retains its thresholds, dead zone, hysteresis, diagonal rejection and neutral latch. The shortcut router permits Tool trigger input **only while a real interactive menu owns the excursion**; a preheld trigger cannot open or select a menu. Support trigger cancels the request. The menu captures trigger presses, requires a release before its first activation and after reconnect, and dispatches at most one current hovered action per press. Releasing the stick on a trigger-press frame dismisses without selecting or leaking into diagnostics.

| Input/state | Result |
| --- | --- |
| Tool-only grip in Clay/Smooth/Stamp | No layer edit; shortcuts are suppressed while grip is held |
| Tool-only grip in Transform Layer | Existing layer solver/transaction, visible + unlocked + uniform target in Separate Layers |
| Support-only grip | Existing workspace move/wrist rotation |
| Both grips in any tool mode | Existing two-hand workspace move/rotate/scale/zoom |
| Either release from both | Support continues workspace; Tool resumes layer only in Transform, from a fresh anchor |
| Grip during a menu | Dismiss menu and give grip ownership to the existing solver; no simultaneous trigger action |
| Tool trigger while menu held | Menu selection only; no diagnostics, sculpt, stamp or grab |
| Mode changes during held grip/edit | Cancel unfinished layer edit, cancel navigation ownership and require physical release before rearming |
| Blur, disconnect, role swap, reset, session end | Close menu, clear hover/trigger capture; existing grip cancellation and neutral rearming apply |

The existing navigation solvers are unchanged. Workspace movements and menu navigation never become project-history actions. Desktop input stays suspended during immersive sessions.

## Architecture and validation

- `src/editor-tool-state.ts`: tool capability registry, shared application port, contextual option declarations and existing layer commands.
- `src/xr-menu-model.ts`: menu pages, radial/row hit targets, selected/disabled state and semantic action dispatch; no rendering or hardware parsing.
- `src/xr-menu-view.ts`: one reusable canvas/texture/mesh, tracked placement, ray-to-UV conversion, hover, trigger capture and cached painting. No DOM/event listeners are registered by menus.
- `XRControllers`: supplies logical roles/poses to the menu interface, reserves input and consults declared layer-grab capability. `XRExperience` attaches/removes the menu per session and retains the Undo/Redo toast without duplicate placeholder cards.
- Desktop mirror, shape controls and source census refresh after menu commands. The existing idle Boolean scheduler updates flag/transform changes; existing synchronous source undo and recomposition costs remain.

Build/test logs: `outputs/phase-1-13d-build.log`, `outputs/phase-1-13d-tests.log`. Full suite: **297 passed, 0 failed, 0 skipped**. Seventeen new tests cover tool/option selection, state sharing, disabled choices, shape rules, eight-layer layout, flags, history/native persistence, ray coordinates under transformed parents, trigger capture, hover/cache behavior, both handedness settings, grip capability/precedence, stale-held input and lifecycle cleanup. Existing 1.13b/c bridge tests explicitly select Transform for their layer-grab expectations under the new mode contract.

Visual QA used the production drawing code with the bundled `@napi-rs/canvas` runtime, inspecting the wheel, layers and Clay/Stamp/Transform options. PNGs: `outputs/phase-1-13d-{wheel,layers,clay-options,stamp-options,stamp-options-2,transform-options}.png`. `scripts/render-vr-menus.mjs` accepts `CANVAS_PACKAGE` for the canvas package location; it is an optional QA dependency, not an application dependency. A missing minus glyph found during QA was replaced with a portable ASCII hyphen.

Initial live-browser startup was blocked by this session's `listen EPERM` restriction. After the user started the server, live browser checks on 2026-10-25 passed: desktop startup, numeric transform/one-action history, Undo/Redo, Smooth selection and layer-lock protection. The opt-in Quest 3 emulator also entered, exited and re-entered XR with desktop controls restored and stereo gray-background rendering. No application console errors were observed; the development emulator emitted duplicate-Three/profile-model warnings. Evidence: `outputs/phase-1-13d-browser-check.json` and `outputs/phase-1-13d-browser-stereo.jpg`. These checks did not exercise the controller-driven menus in the emulator and are separate from the user-reported physical Quest 3 acceptance recorded below.

`node scripts/benchmark-vr-menus.mjs` measures warm Node layout/raycast/content-cache bookkeeping with stub drawing and one source layer. Ten 20,000-update batches measured medians about **0.000007 ms closed**, **0.00154 ms wheel**, **0.00142 ms layers**. Raw result: `outputs/phase-1-13d-menu-benchmark.json`. These exclude canvas rasterization/uploads, real rendering, GPU, source edits and physical input. One 1152² canvas texture (~5.1 MiB RGBA before renderer overhead), one plane and no extra menu listeners are retained and reused. Content snapshots refresh at most every 100 ms; painting occurs on content/hover changes. No physical frame-rate or comfort claim.

## Physical Quest 3 acceptance — user-verified

On 2026-10-25 the user confirmed the controller-driven menus were already tested and worked well on real Quest 3 hardware: “Done the controllers already, it worked good.” Individual checklist edge cases, browser/OS versions, handedness coverage and performance measurements were not separately reported. Keep the following checklist for regression testing.

Record Quest OS/browser version, profiles, dominant hand and scene size. Run on both handedness settings.

1. Enter VR with sticks centred. Hold Support Up: wheel appears near the current head position with only the Tool selection ray. Confirm readable text, adequate target size, active and hover feedback.
2. Point and tap Tool trigger for Clay, Smooth, Stamp and Transform. Confirm the selected tool opens its Options, **‹ Tools** goes back, and Move Tool is disabled. Hold the trigger: no repeated selection/change.
3. Release Support stick: menu closes. Reopen: wheel returns. Walk/turn, reopen: panel anchors to the new view and remains stable while pointing. A trigger already held before opening must not select anything.
4. Hold Support Down: select different layers; toggle visibility/lock and read resolutions. Confirm selected row, sculpture changes and no automatic merge. Repeat with eight layers/long names.
5. In Options change Clay Add/Subtract, radius, strength and hardness; choose Smooth and check shared radius/strength. Disabled stroke/spacing rows must not execute anything. No Tool trigger outside menus should sculpt.
6. In Stamp options change shape, operation, linked dimensions, rotation and scale, including page navigation. No voxel edits or VR stamp application should occur. Exit later and inspect the same values in desktop Shape Library.
7. In Transform choose Move/Rotate/Scale groups; step numeric values and Undo/Redo. Select Separate Layers if needed. Check hidden/locked targets and nonuniform legacy scales reject unsupported edits.
8. Centre, then Support Left/Right: one Undo/Redo per flick; held sticks do not repeat. Check unavailable feedback. Tool trigger during a menu must not operate diagnostics; Support trigger should dismiss safely.
9. Recheck Support-only workspace wrist rotation, both-grip zoom/scale/rotation, both join orders and either release direction in every tool mode. Tool-only grip moves layers only in Transform. Test grip takeover from a menu with no selection or snapping; centre sticks to rearm shortcuts afterward.
10. Switch handedness via diagnostics after dismissing the menu. Recheck wheel, options, layers and grabs using the new roles. Test occlusion/disconnect/reconnect, blur, reset and held-trigger recovery.
11. Exit/re-enter repeatedly: no duplicate panels/listeners, stale hover or held action. Desktop brush, stamp ghost/gizmos, layer transforms, native save/load and separate/Boolean GLB exports retain existing behavior. Menu visibility is never saved/exported.

## Phase 1.13e recommendation

Keep the shared tool/capability boundary and menu trigger ownership. Before continuous Clay/Smooth input, add bounded source-update scheduling, XR-world-to-layer-local stroke conversion and tracking-loss stroke cancellation. Sample actual Quest frame budgets in dense scenes. Do not run a brush while a menu owns the trigger, and keep workspace navigation outside history. VR stamp application, Alternate Tool and deformation remain separate future scopes.
