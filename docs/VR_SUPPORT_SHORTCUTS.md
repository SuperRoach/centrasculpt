# Phase 1.13c — Four-direction Support Hand shortcuts

Current implementation: [Phase 1.13d menus](VR_MENUS.md) replaces the placeholders with interactive menus and permits Tool trigger selection while held. The recogniser and four-direction mapping below remain unchanged.

Target: Meta Quest 3 / Touch Plus / Quest Browser / WebXR. Phase 1.13b grip controls and Phase 1.13c menu shortcuts / Undo/Redo are user-verified on real hardware.

| Support stick | Action | Lifetime |
| --- | --- | --- |
| Left | Existing project Undo | Once per excursion |
| Right | Existing project Redo | Once per excursion |
| Up | Tool Wheel request / temporary card | Hold open; centre to close |
| Down | Layers Palette request / temporary card | Hold open; centre to close |

Support means the opposite of the selected dominant Tool Hand. Controller slot order is irrelevant. Select handedness in the existing diagnostics/mirror controls. No stick click is required. The Tool stick remains reserved.

## Input contract

`XRControllerInput` parses physical profiles and axes; `FourDirectionStick` recognises directions; `XRSupportShortcuts` dispatches semantic bindings; `projectHistoryShortcuts` adapts the existing timeline. The controller polling bridge contains no undo/redo implementation.

The axis convention was checked against the [WebXR Gamepads mapping](https://www.w3.org/TR/webxr-gamepads-module-1/#xr-standard-gamepad-mapping) (thumbstick X/Y at axes 2/3) and [Gamepad axis convention](https://www.w3.org/TR/gamepad/#remapping) (negative X left, positive X right; negative Y up, positive Y down). These are documentation checks, not a claim of headset testing. Existing diagnostics show the actual axes for physical confirmation.

The existing input abstraction first applies a .15 radial dead zone. On its normalized output the recogniser defaults to neutral radius .18, press .65, hold release .40 and major/minor axis ratio >=1.5 (roughly 34° cardinal cones). Options are configurable in the reusable recogniser API. A press must exceed the major-axis threshold. Significant diagonal excursions are consumed without dispatch; sliding from that diagonal into a cardinal direction cannot trigger until neutral. Held directions never repeat. Below .40 the active menu closes; reactivation still needs the .18 neutral radius. A new controller/role/session or interrupted gesture starts disarmed until neutral is observed. Invalid/nonfinite axes are unavailable, rather than falsely rearming input.

Bindings are declarative (`SUPPORT_STICK_BINDINGS`), with a replaceable command registry and `requestMenu(menu|null)` lifecycle callback. Only one menu request can exist. The current `tool-wheel` and `layers` requests render a temporary noninteractive card; `tool-options` and custom command bindings provide extension points without implementing those tools. Returning to centre, interruption, disconnect, reset, blur, role swap or session stop closes the request. Switching directly between deflected directions cannot open a second menu or issue undo.

## Priority

| State | Owner / shortcut behavior |
| --- | --- |
| Idle | Support stick may issue one action or request a menu |
| Support-only workspace grab | Existing workspace solver; shortcuts disarmed |
| Tool-only layer grab | Existing layer transaction; shortcuts disarmed |
| Both grips | Existing two-hand workspace rotate/scale/zoom; shortcuts disarmed |
| XR menu request | One placeholder owns its excursion; no other direction/diagnostic trigger action |
| Grip/trigger during a request | Closes/disarms request; grips take over normally. The closing trigger cannot also activate diagnostics |
| Future external menu owner | Router's `menuBusy` argument suppresses these shortcuts |

Any held grip or trigger reserves input, including a rejected layer grab or button awaiting release after suspension. A stick held through a grab cannot fire as the grip is released. Centre it before the next shortcut. Tracking/identity loss and XR session cleanup close menus and clear feedback.

## History, presentation and performance

Undo/Redo call `IndependentLayers.undo(redo)` and use its existing timeline for clay strokes, stamps, layer transforms, operation/order changes, bakes and other supported actions. Availability and existing lock/busy errors produce a brief message, not an extra action. Active strokes/transforms are never implicitly committed by the history adapter. Workspace navigation and menu requests never add history or serialized data.

The existing Boolean composite polling function is now shared by desktop and idle XR frames, so undoing a transform/stroke can refresh Boolean Preview instead of leaving stale geometry. Existing composite debounce/work scheduling is unchanged; polling pauses during grips. History changes refresh desktop mirror state and the source census used by the performance panel. Native persistence and GLB exports use existing paths.

A small .52 × .13 m tracking-space card, placed below the initial view, displays menu requests and ~1.1-second action/unavailable feedback. It is independent of diagnostic visibility and optional hints. The texture redraws only when content changes; the card is hidden at idle and removed at session exit. Realistic controller models and neutral gray background remain unchanged. Feedback is visual; no haptics are required or added.

The pure router benchmark is `node scripts/benchmark-support-shortcuts.mjs`. Its Node timings exclude real history/meshing, canvas updates, polling, rendering and headset/GPU costs. Undo may synchronously rebuild source chunks through the existing history implementation; dense scenes and Boolean recomposition can still cause noticeable frame spikes. No continuous sculpting scheduler or performance guarantee was introduced.

## Quest 3 physical acceptance — user-verified

On 2026-10-25 the user confirmed testing on real Quest 3 hardware: “control wheel options worked, undo and redo worked great.” This records acceptance of the implemented menu shortcuts/placeholders and Undo/Redo. Individual edge-case checklist results, browser/OS versions and performance measurements were not separately reported. Keep the following checklist for regression testing.

Record Quest OS, Quest Browser version, active controller profile, dominant hand and scene size.

1. Enter VR with the Support stick centred; confirm logical Support Hand and both tracked controllers in diagnostics.
2. Create several edits on desktop first (stroke, stamp, layer transform). Flick Support stick left: exactly one Undo and brief feedback.
3. Hold left: no repeats. Centre, then flick left again: one more Undo. Repeat with noisy/off-axis motion and diagonal pushes: no accidental commands.
4. Centre and flick right: one Redo. Exhaust both stacks: “Nothing to undo/redo” appears without changing history.
5. Hold Up: Tool Wheel preview appears. Relax slightly to test hold hysteresis; centre: closes. Hold Down: Layers Palette preview; centre: closes.
6. Without centring, roll Up to Down/Left/Right: no second menu or history action. Trigger during a menu: closes safely without selecting a diagnostics control.
7. Test Support-only workspace grab, Tool-only selected-layer grab, both-grip rotate/scale/zoom, both join orders and either release direction. Flick/hold the stick during each: shortcuts remain suppressed, with no grip jump. Centre after release to rearm.
8. Try Tool grip against locked/hidden/no target: no layer edit and no competing Support-stick shortcut while grip is held.
9. Switch dominant handedness: shortcuts move to the other physical controller, with fresh neutral required. Repeat controls and reverse connection order.
10. Test occlusion, disconnect/reconnect, blur, reset workspace and exit/re-enter while holding a stick: no stale action/menu; centre to recover.
11. Hide diagnostics and hints: action feedback and menu placeholders remain visible. Check realistic models and neutral gray background.
12. Exit VR: check desktop tools, undo/redo counts, native save/load and GLB exports. Check Boolean Preview after VR undo/redo and note any dense-scene stalls.

## Phase 1.13d handover

Replace the `XRMenuRequest` view consumer with full menus while keeping recogniser rearming and request ownership. Use `tool-options` for the contextual palette and registered commands for a future temporary Alternate Tool. Route layer selection and tools through existing application commands; retain grip takeover and external-menu exclusion. Full interactive menus, sculpting/stamping, brush resizing, deformation and locomotion remain out of scope here.
