# Phase 1.12c — workspace grabbing and controller visuals

Start with your previously working Quest Browser secure origin. Server commands remain `npm run dev` (5173) or configured `npm run dev:https` (5174). For authorized USB development: `adb reverse tcp:5173 tcp:5173`, then Quest Browser `http://localhost:5173/`. See [Quest connection guide](QUEST_WEBXR.md).

## In-headset controls

The **Support Hand** is left by default. Hold its **grip**, move/rotate that controller, then release to leave the sculpture in place. The controller does not need to touch or point at the sculpture; this is workspace navigation. The Tool grip is reserved and does nothing. Holding both grips continues the single Support-hand grab; no two-hand gesture or scaling occurs.

The debug card stays beside the initial viewing position, outside the moving workspace. Point either ray at its buttons and tap trigger:

- **Swap Tool / Support:** changes logical roles and ends any existing grab safely. Release held buttons before pressing again. The mirror's Dominant Tool Hand selector also works while in VR.
- **Hide / Show diagnostics:** toggles the detailed input display, retaining its small control strips.
- **Models:** cycles **Realistic → Simple → Minimal**. Realistic is the default, showing lightweight indicators while assets load or if loading fails. Simple shows both grip indicators and rays. Minimal keeps Tool pointing feedback, a Support indicator during grabbing, and a ray when hovering a debug control. Inputs/grabbing work identically in every mode.
- **Hints:** cycles **Hidden → On demand → Always**. On demand shows help while pointing at the card, touching a thumbstick, or grabbing. Thumbstick contact only requests help; it does not resize, undo, or navigate. Help identifies the working Support grip and explicitly labels Tool grip/trigger/thumbstick and Support thumbstick actions as reserved.

Debug button actions are ignored during an active grab to prevent conflicting interactions. You can release the grip before selecting them, or use mirrored settings. Settings persist in memory across sessions, not in native sculpture files.

## Navigation policy and mathematics

Only **Idle** and **Workspace Grab** are active states. Initial controller/world workspace matrices are captured at grip press. Each held frame computes:

```text
worldWorkspace = currentRigidGrip × inverse(initialRigidGrip) × initialWorldWorkspace
localWorkspace = inverse(workspaceParentWorld) × worldWorkspace
```

The rigid grip pose uses translation and a normalized quaternion. The workspace's existing scale is preserved; there is no Euler accumulation, incremental drift, smoothing or movement lag. Rotation pivots naturally about the captured grip. Matrix/vector temporaries are reused. Only Workspace Root's matrix is updated; normal renderer traversal updates descendants. No SDF extraction, geometry creation, source-layer transform write, ordinary undo entry, native-file change or export-coordinate change occurs during navigation.

Tracking Origin and controllers are siblings of Workspace Root, not its descendants. Sculpture Root contains source layer render groups and the Boolean result, so both move together. Hints/debug geometry lives under tracking, stays fixed and is excluded from exports. Lost grip tracking, disconnect, role change or session blur/end cancels the grab at the last valid pose. Reacquiring tracking does not resume a still-held grip: release and press again.

**Session policy:** release retains the new navigation pose for the current XR session. Exit restores the original desktop camera/background/workspace transform. Each new entry fits and places the visible sculpture afresh using the Phase 1.12a policy. Navigation is not saved to sculpture files.

## Realistic model loading

The adapter uses the installed [Three.js XRControllerModelFactory](https://threejs.org/docs/pages/XRControllerModelFactory.html). Models attach to the native **getControllerGrip()** groups; pointing rays use getController() target-ray space. The factory selects from the source's ordered profiles and physical handedness, binds animation responses, and updates supported triggers/buttons/sticks from its Gamepad.

The initial profile/GLB requests use the factory-compatible HTTPS repository:

`https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles`

A matching profile is preferred, including `meta-quest-touch-plus`. If only an older/generic profile matches, that is the reported asset, not a claim of exact Quest 3 appearance. Mirrored diagnostics report loading/ready/fallback plus the selected profile. Profile metadata and asset URL remain available on the model entry for troubleshooting. [Immersive Web assets](https://github.com/immersive-web/webxr-input-profiles/blob/main/packages/assets/README.md) use the MIT licence.

First use needs network access; input and navigation never await loading. Profile/hand results are cached in memory across sessions. Failed requests fall back to indicators with a 10-second profile/model timeout; reconnecting or explicitly reselecting Realistic retries failures. Loader failures are intercepted to avoid the stock factory's asynchronous asset-error throw. Generation guards prevent late results from attaching to disconnected controllers. Stop detaches models; cached resources remain until application disposal. The provider's path is configurable for future self-hosted/offline assets. No offline asset bundle was added.

## Physical Quest 3 acceptance checklist

The user reports successful physical Phase 1.12a and 1.12b tests. **Codex has not physically tested these new Phase 1.12c features.** Perform this checklist on your Quest 3:

1. Enter VR using the normal hardware URL, without the emulator query.
2. Confirm the #808080 background in both eyes and the same visible layers/Boolean view as the desktop.
3. Verify left/right realistic model appearance, pose, orientation and supported button/stick animations. Check the reported profile; disconnect networking to verify fallback without lost input.
4. Switch Models to Simple, then Minimal, then Realistic. Check there are no duplicated models/rays and grabbing still works.
5. Exercise Hidden, On demand and Always hints. Confirm working vs reserved labels and readability beside the sculpture. Hide detailed diagnostics and restore them.
6. Squeeze the Support grip. The debug state should become Workspace Grab. Tool grip alone must do nothing.
7. Move and rotate the Support Hand, including rotation while keeping its grip position steady. The entire sculpture should follow immediately, pivoting about the initial grip, without orbiting the camera or changing scale.
8. Check multiple transformed/different-resolution layers and Boolean Preview. They must move together; controllers, head tracking and the debug card must stay outside that motion.
9. Release grip. The workspace should stay put; a subsequent press should capture a fresh anchor without snapping.
10. Verify individual layer transforms/voxels/history are unchanged. Test temporary lost tracking, disconnect/reconnect, role swap and the Quest system menu. There must be no stuck or automatically resumed grab. Native save and GLB exports should retain their project coordinates.
11. Exit and re-enter several times: desktop background/camera return, editing/save/export work, no duplicate input handlers or models, and XR starts from the documented fresh fit. Record browser/OS versions, model/profile, input and frame timing observations.

## Automated validation and performance

`npm run build` and `npm test` pass, **232 tests / 0 failures / 0 skips**. New coverage includes Support edges, translation, quaternion rotation about the anchor, nonidentity parents, stable repeated poses, persistence after release, all interruptions, all display modes, Tool/both-grip non-actions, profile/hand caching, stale/model failures and actual factory missing-asset/timeout/disposal paths. Native byte, history, source geometry and both export coordinates are compared before/after navigation. Existing desktop/grey/XR tests remain.

CPU benchmarks are in `outputs/phase-1-12c-*-benchmark*.json`: anchored workspace update about **0.00014 ms/frame** in an empty-workspace Node microbenchmark; two-source polling ~0.00021 ms and visual bridge ~0.00043 ms. These exclude scene descendant traversal, model animation, hint/canvas/GPU work and hardware. Source local meshes: **15.1 / 11.4 / 11.8 ms** at 64³/128³/192³, versus prior 15.0 / 11.5 / 12.3 ms; uncontrolled run variability applies. No remesh is scheduled by grabs. Existing XR/input CPU diagnostics remain available; they are not physical motion-to-photon measurements.

Known limits: network-dependent first model load; generic/older assets may differ from actual hardware; no offline asset bundle, haptics, independent layer grab, two-hand scaling, controller sculpt/stamp, resizing, tool tray, locomotion or deformation. Stock factory animation, detailed model draw calls, texture first upload and dense stereo scenes need Quest GPU/thermal profiling. Hints/card placement remains fixed and has no user repositioning tool.

## Next phases

**1.12d:** physically validate navigation first, then implement Tool-grip selected-unlocked-layer manipulation with explicit tracking→workspace→project/layer conversion, press anchors, cancellation and one metadata undo transaction per completed layer drag. Debug hits must consume intent first. Specify arbitration before introducing two-hand gestures; keep workspace motion separate from native data.

**1.13:** introduce a shared role/action intent router for whichever VR editing feature is authorized next. Use inverse layer/world transforms for local SDF operations, existing stroke history and chunk invalidation, and profile headset frame budgets before enabling continuous sculpt/stamp. Do not couple model availability to tool input or automatically merge/resample layers.
