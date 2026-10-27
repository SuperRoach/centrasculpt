# Phase 3.6 — Studio and Passthrough

Implemented 2026-10-27; physical Meta Quest 3 acceptance pending.

## Entry and switching

The header Environment selector defaults to Studio. Studio requests `immersive-vr`; Passthrough requests `immersive-ar`. Both capabilities are checked independently with `isSessionSupported`. The disabled Passthrough option and WebXR diagnostics explain missing APIs, insecure origins, unsupported runtimes and capability errors. AR-only runtimes can select Passthrough even if Studio is unavailable.

Exit with headset system controls (or the browser Exit control), choose the other environment, then click Enter Studio / Enter Passthrough. Selecting another supported environment during presentation also ends the current session; it **never automatically requests the replacement**. `requestSession` runs synchronously in the separate Enter click path, before awaiting permission or preparing the scene. Failed requests retain the selected environment for an explicit retry. An opaque AR session is rejected with an explanation rather than claiming it shows the room.

## Rendering and architecture

One renderer, scene, sculpture root and controller-role mapping serve both modes. The WebGL context now enables alpha at construction. Studio retains the existing `#808080` scene background. Passthrough sets `scene.background=null`. Installed Three.js r180 creates alpha-enabled XR layers and clears alpha-blend sessions to transparent black (verified against its actual WebGLBackground implementation in tests). Lighting, materials and reflection environment stay unchanged. The exact desktop background/camera/workspace state returns on exit or setup failure. No raw camera access, video background, new dependency or second scene is introduced.

The existing floating menus already paint a solid dark backing with light text, disable depth testing/writing and appear only when invoked. Existing bright rays, tool indicators and controller models are reused. Physical readability across real room brightness still needs acceptance.

## State and lifecycle

`XRSessionController` owns selected and active environments, independent capability results and the existing session lifecycle. The experience passes the active environment to `XRSceneRig.enter`. Both environments use the existing local reference-space policy and first tracked head pose to fit a roughly 65 cm sculpture about 90 cm forward. Navigation placement intentionally refits at each entry: coordinates from different sessions are not treated as physical anchors. Reset Workspace View restores that session's initial fit; support/controller reset remains available in-headset.

No layer metadata, SDF samples, tool settings, stamp attachment preferences or history entries are changed by selecting an environment. Existing lifecycle cancellation handles unfinished Clay/Stamp, temporary Smooth, Move reconstruction, menu selection and workspace/layer grips. Completed edits/history stay intact. Pending Move reconstruction uses the existing cancellation/generation guard policy on session loss, rather than publishing partial work. Autosave remains the existing committed-state mechanism; native and recovery schemas are unchanged.

Controllers and menus are constructed once and reused. End cleanup unbinds session listeners, resets controller input/haptics/shortcuts, cancels temporary interactions, disconnects controller models and stops menus/overlays. The scene restore is guarded to run once even when both `end` and explicit exit completion arrive. Stale end callbacks cannot finish a replacement session.

## Files

- `src/xr-session.ts`: environment types/mapping, independent capability checks, explicit selection/exit/re-entry and opaque AR guard.
- `src/xr-scene.ts`: active environment background; existing fit/restore policy retained.
- `src/xr-experience.ts`: Environment selector, availability/help, mode-specific entry labels, active mode passed to rig.
- `src/main.ts`: alpha-enabled renderer and selector exemption from desktop input lock.
- `src/style.css`: compact responsive selector styling.
- `tests/webxr.test.mjs`: AR detection/failure, separate gesture switching cycles, real renderer clear behavior, project/history/transform and workspace retention.
- This guide and `docs/DEVELOPMENT_STATUS.md`.

## Validation and performance

Baseline: `npm run build` (strict TypeScript + Vite) passed; `npm test` **757/757**.

Final results are recorded in DEVELOPMENT_STATUS. The complete suite includes controller role/input/cleanup, all sculpt tools, Move workers, native save/recovery and exports. New tests exercise both environments and repeated transitions. Tests use simulated session APIs and scene objects; they do not establish Quest Browser permission UX, compositor operation, real controller tracking or headset performance.

No per-frame sculpting, meshing, GPU preview or controller-routing work was added. Capability checks run on initialization; UI/session changes run on transitions. No new performance benchmark was warranted for this control flow; Quest FPS, memory, thermal behavior and passthrough readability are unmeasured. Phase 3.5 synchronous large Stamp latency remains unresolved. Existing production bundle-size advisory remains.

## Platform limits

Passthrough availability depends on browser, permissions, secure origin and WebXR runtime. The support probe is advisory; an actual request can still fail. WebXR compositing does not provide raw camera pixels. No real-world depth occlusion, room mesh, physical anchors or persistent room alignment are implemented: virtual sculptures may appear in front of real furniture. Switching may require exiting and re-entering with a fresh click. Exact physical workspace placement across sessions is not preserved; project/layer placement is preserved.

## Physical Quest 3 checklist — pending user verification

Use Quest 3, Touch Plus controllers and Quest Browser with a trusted HTTPS origin or the documented ADB reverse setup.

1. Launch the app in Quest Browser.
2. Select Studio and click Enter Studio.
3. Verify the neutral grey environment.
4. Verify Clay and both controller roles/interactions.
5. Exit Studio and select Passthrough.
6. Click Enter Passthrough; accept browser permissions.
7. Verify the real room appears behind the virtual sculpture.
8. Verify floating menus, text, rays and controller models against bright and complex backgrounds.
9. Draw free-space Clay in mid-air; test Straight Line, Steady and tool-stick sizing.
10. Use Smooth, temporary alternate Smooth, and Single/Continuous Shape Stamp.
11. Adjust the Tool Hand stamp attachment with grip; verify the offset persists after switching.
12. Grab the workspace, use two-handed scaling, direct layer selection and Reset Workspace View. Confirm saved layer transforms do not change from navigation.
13. Test Non-Elastic/Elastic Move, Rotate and Twist; exit during a pending reconstruction and verify safe cancellation and retained committed data.
14. Use Undo/Redo, Tool Wheel, Layers Palette, Tool Options and all four Support shortcuts; repeat with opposite Tool Hand.
15. Exit Passthrough, select Studio and click Enter Studio.
16. Confirm all layers, tool/settings, stamp offset, completed geometry and Undo/Redo remain intact. Save/reopen and verify recovery/export regressions.
17. Repeat transitions, system exits, tracking loss and rejected permission/re-entry. Check for stuck buttons, duplicate models/menus/listeners, memory growth or degraded performance.

## Next

Phase 3.7 — Full Phase 3 acceptance testing, including this checklist, long-session recovery and unresolved Stamp performance. Preserve Phase 4.0 — Advanced Brush Library and Phase 4.1 — Procedural Spline Tubes.
