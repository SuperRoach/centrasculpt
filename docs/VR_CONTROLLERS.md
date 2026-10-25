# Current phase: 1.12c

Phase 1.12c adds **Support-grip workspace navigation**, optional realistic models and contextual hints. See [VR_WORKSPACE.md](VR_WORKSPACE.md) for current behavior and hardware verification. The Phase 1.12b input contract below remains valid; its statements about grip being diagnostic-only describe the historical baseline.

# Phase 1.12b — Quest controller foundation

This phase tracks Quest 3 Touch Plus controllers, polls input, and displays diagnostics. Triggers only activate the two debug-panel buttons. No controller action sculpts, stamps, changes layers, grabs, scales, walks or teleports. The existing grey VR background, desktop editor and secure-origin workflow remain intact.

## Launch and physical verification

1. Start the existing server (`npm run dev`), keeping port 5173. Use the previously working Quest secure origin. For an authorized USB development connection:

   ```sh
   adb devices -l
   adb reverse tcp:5173 tcp:5173
   ```

   Open `http://localhost:5173/` **in Quest Browser**. For wireless, use your genuinely trusted HTTPS setup (`npm run dev:https`, port 5174); Mac-only certificate trust is insufficient. See [Quest setup](QUEST_WEBXR.md) for full connection/troubleshooting instructions.
2. Load a sculpture with different-resolution layers. Note transforms, visibility, history and triangle counts; save a reference project. On the desktop page, expand **VR / WEBXR DIAGNOSTICS**. Tool hand defaults to right. **Show in-headset diagnostics** controls expanded debug details. These preferences stay in memory and do not enter sculpture files.
3. Click **Enter VR**. Confirm a neutral #808080 background in both eyes. Wake both Touch Plus controllers. **Left is cyan; right is amber**, independently of Tool/Support selection. Each should have a small grip-space body and a forward target-ray-space line. Compare position/orientation with the physical controllers, including rotations and when looking down. Tool rays are brighter than Support rays.
4. Turn slightly right to see the debug card. It is placed once about 1.1 m ahead and 0.74 m right of the initial head pose, separate from the sculpture/workspace. Each hand reports connection/pose state, role, trigger/grip values, stick X/Y/click and primary/secondary buttons. A lost pose hides its stale visuals. Physical readability and placement still need your headset check.
5. Pull each trigger gradually: values should vary 0→1; the ray turns white while pressed. Squeeze each grip: the indicator turns green while pressed. Deflect sticks in all directions, click each stick, and press **X/Y on left, A/B on right**. Expect no drift inside the stick dead zone. Up/forward on the physical stick normally reports negative Y; the abstraction does not invert it.
6. Point either ray at **Swap Tool / Support** on the debug card and tap its trigger. Roles and planned bindings swap immediately without restarting. Hold the trigger: it must not repeat. Physical hand colours/identities must stay the same. The mirror's **Dominant Tool Hand** selector also works during VR. Holds are cancelled on a role swap and must be released before rearming.
7. Tap **Hide diagnostics**. Detailed values disappear; the small header with **Show diagnostics** and **Swap Tool / Support** remains available. This compact strip is intentional so you can restore details inside VR. The mirror checkbox offers the same toggle. Tapping empty card space does nothing.
8. Test one controller sleeping/disconnecting and reconnecting; the other hand must keep updating. Confirm no stale body/ray after lost tracking. Open/close the headset system UI: inputs should cancel while the session is blurred/hidden. A still-held button must not become a fresh action on return; release, then press again.
9. Exit through the Quest system/session controls or mirror Exit VR. Confirm controller bodies/rays/card disappear, the desktop background/camera return, and Save, brushes, shape stamps, undo/redo and exports still work. Entry, debug controls and controller motions must not add sculpt history, alter layer transforms or change voxel data. Repeat entry/exit several times; each trigger tap must still execute a debug action only once.
10. Record Quest OS/Browser versions, actual `XRInputSource.profiles` if troubleshooting, both-hand input observations, reconnect/blur results, card readability and XR frame timing. Prior Phase 1.12a hardware success does not establish this phase's controller mapping/pose acceptance.

## Input contract and mappings

`src/xr-input.ts` is independent of Three rendering and sculpting. `XRControllerInput.states` has two reused frame records, stable monotonic per-connection IDs, physical handedness, logical role, connected/tracked/gripTracked state, one-frame connection flags, button availability/value/rawValue/pressed/touched/justPressed/justReleased, and dead-zoned stick axes. Consumers retaining a frame must copy values; browser Gamepad objects and these records are live/reused. Quick semantic taps between polls may expose both press and release in one frame.

The locally bundled mapping for `meta-quest-touch-plus` and its verified Touch fallbacks (`oculus-touch-v3`, `oculus-touch`) follows the [Immersive Web profile registry](https://raw.githubusercontent.com/immersive-web/webxr-input-profiles/main/packages/registry/profiles/meta/meta-quest-touch-plus.json):

| Logical input | Quest Gamepad location |
|---|---|
| Trigger | button 0 |
| Grip/squeeze | button 1 |
| Stick click | button 3 |
| Primary face | button 4: left X / right A |
| Secondary face | button 5: left Y / right B |
| Stick X/Y | axes 2/3 |

Index 2 and axes 0/1 are reserved touchpad placeholders; they are not mistaken for stick controls. Menu/system buttons, thumbrests and haptics are not part of this foundation. Some system controls are browser/OS-reserved and cannot be captured.

Unknown `xr-standard` profiles expose standardized trigger/squeeze/stick indices only; face buttons are unavailable rather than guessed. Unknown nonstandard mappings expose semantic `selectstart/end` and `squeezestart/end` fallback inputs, with no guessed axes/face indices. Missing Gamepads/buttons/axes and invalid analog values remain neutral. Custom profile maps can be supplied via `XRInputOptions.profiles`; no network asset/profile fetch is required. See the [WebXR Gamepads module](https://www.w3.org/TR/webxr-gamepads-module-1/) for the standardized mapping contract.

Defaults: radial stick dead zone **0.15**, remapped smoothly to unit magnitude; analog values at/below **0.03** become zero and otherwise retain the reported value. Raw finite analog readings are exposed separately. Press uses browser `pressed` or analog threshold **0.55**, retaining a press until below **0.45**; a browser `pressed=true` can assert earlier. Thresholds are configurable and validated. `justPressed`/`justReleased` pulse once rather than every held frame. Visibility/pose loss, disconnect and role changes cancel holds and require release before rearming. Reconnect receives a new connection ID; physical handedness is never inferred from the renderer slot index.

## Architecture and lifecycle

- `XRSceneRig` still owns tracking/presentation isolation and grey/background restoration. It reuses the original sculpture's chunk geometry; no native format or SDF changes.
- `XRControllers` uses the existing renderer's `getController` target-ray group and `getControllerGrip` group under Controller Tracking. Three updates native reference-space matrices before the existing animation callback. The bridge never writes those poses, workspace transforms or layer transforms.
- Grip bodies, small input indicators and pointing lines share three small geometries. Blue/amber means physical hand; ray brightness means logical role. Unsupported hand-tracking/gaze sources are not rendered as Touch controllers.
- Session-scoped semantic/visibility/end handlers are bound once and removed on stop. Two static manager connection handlers remain for the lifetime of the bridge and are removed by `dispose`. Repeated starts for the same session are idempotent. On exit, temporary visual children and the card detach, all input state neutralizes, and root visibility is disabled. Resources are retained for reuse until explicit disposal rather than reallocated every session.
- `XRDiagnostics` uses a cached 1024×640 canvas texture on one small plane. Text repaints at most **10 Hz**, while poses/input polling and ray/control hit testing run at headset frame rate. It is a debug interface, not a tool tray. Its two trigger actions are limited to debug visibility and logical handedness. The card remains fixed after initial placement; it is not attached to the moving head or sculpture.
- Physical role selection and expanded-details preference persist only for this application lifetime. They are neither undo actions nor sculpture-file metadata. Future user preferences can persist them separately.

## Future reserved actions — not executed

| Role/input | Reserved future action |
|---|---|
| Tool trigger | Sculpt / stamp / apply |
| Tool grip | Grab selected layer |
| Support grip | Grab workspace |
| Both grips | Two-hand manipulation |
| Tool stick | Brush/shape size |
| Support stick | Undo/redo or tool selection |
| Face buttons | Tools/menus |

`XRControllerRoles.bindingsFor(physicalHand)` resolves the planned table through current roles. Future code must consume role-based bindings and input edges, not hardcode right-hand renderer index 1.

## Tests and performance

`npm run build` and `npm test` pass: **216 tests, 0 failed, 0 skipped**. New controller tests cover hand/role swapping, analogs, dead zones/hysteresis, edge transitions/quick taps, missing and alternate mappings, reconnect IDs, lost poses/blur/role cancellation, session event cleanup over four sessions, unchanged native bytes/history/geometry, reused frame/geometry identities and actual ray-trigger activation of both card controls. Existing grey-background and complete desktop/native/export regression tests remain.

Run the focused CPU benchmark with:

```sh
node scripts/benchmark-xr-input.mjs outputs/phase-1-12b-input-benchmark.json
```

On this Mac, two-source warm polling averaged about **0.00021 ms/frame** at the median batch; the controller bridge without canvas/hit tests/GPU averaged **0.00043 ms/frame**. These are Node microbenchmarks, not headset performance. The browser's **input/debug** timing includes polling, visual-state changes, panel hit testing and any scheduled canvas paint; coarse browser timers may round small values to zero. Initial paint is more expensive than warmed ordinary frames.

Source local remesh medians were **15.0 / 11.5 / 12.3 ms** for 64³/128³/192³, versus previous **15.2 / 11.4 / 11.7 ms**: changes −0.2 / +0.1 / +0.6 ms in uncontrolled runs. No extraction code changed. Inactive-layer data and geometry remained unchanged; metadata transforms still performed no remesh. XR remains free of SDF rebuild jobs. Stereo draw cost/thermal behavior and diagnostic texture cost on Quest require hardware measurements.

## Verification status / Phase 1.12c

Emulator checks exercised both tracked controller visuals, grey stereo rendering, readable debug geometry in the scene, live mirror role switching/detail toggling, and desktop restoration. Synthetic tests cover all mapped inputs and ray debug actions. **The agent has not physically tested Phase 1.12b on Quest 3.** Prior foundation success was reported by the user; new controller poses, analog mappings, panel readability and real headset performance remain acceptance tasks above.

Phase 1.12c should first validate this input contract on hardware, then implement explicit grip ownership/cancellation for object-centric manipulation. One support grip can move Workspace Root; Tool grip can target a selected unlocked layer through workspace-to-project coordinate conversion. Define arbitration for both grips before adding two-hand gestures. Freeze anchors on press, commit at release, cancel on blur/disconnect/role change, and require intentional release/repress when roles change. Workspace presentation changes must never enter SDF/native transforms; layer manipulations should be metadata transactions with one undo record per completed drag. Route debug-card hits before any future tool intent so debug clicks cannot grab/sculpt through the card. Sculpting/stamping should remain separately authorized scope.
