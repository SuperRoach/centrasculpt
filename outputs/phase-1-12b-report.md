# Phase 1.12b — completion report

## 1. What changed

Both Touch Plus controllers now have lightweight grip-space bodies, target-space pointing rays and input highlights. Added a separate reusable input abstraction for trigger/grip analogs, stick axes/click, face buttons, connection/tracking and one-frame press/release transitions. Tool/Support roles swap live. A VR-visible debug card beside the sculpture displays both hands and offers ray-trigger Swap Tool/Support and Hide/Show controls; the mirror offers the same options. Existing #808080 VR background and desktop restoration are preserved.

## 2. Technical decisions

Reuse the existing renderer, XR animation loop and tracking origin. Three owns tracking matrices; no controller update writes workspace/layer transforms or SDF data. Physical left/right identity and colour stay distinct from logical roles. Verified offline Touch Plus mappings, conservative standard/unknown fallbacks, configurable dead zones and cancellation/rearming prevent repeated held-button actions. Session listeners clean up; geometry/frame records/resources reuse. Diagnostic canvas repaints at most 10 Hz; only two debug actions consume triggers. All future tool/grab/locomotion bindings remain descriptions only.

## 3. Build and tests

`npm run build` passed. `npm test`: **216 passed, 0 failed, 0 skipped** (16 new controller tests). Includes actual ray activation/hold suppression of both debug controls, missing/alternate inputs, handedness, reconnect IDs, visibility/pose cancellation, four-session cleanup, stable state/geometry identities and native/history preservation. Existing sculpting/layers/grey background/native migration/CSG/Bake/shape/history/GLB regressions pass.

Emulator verification: both controller bodies/rays, stereo grey/card, live handedness swap, diagnostic toggle and desktop exit restoration. No browser console errors; same 31,536 sculpture triangles and zero history after exit, Save enabled. Prior foundation hardware success is user-reported; **Phase 1.12b was not physically tested by the agent on Quest**.

No Git repository exists; verified source checkpoint: `before-phase-1-12b.tar.gz` / `.sha256`. No original project files deleted; no dependencies added.

## 4. Performance

Warm Node two-source microbenchmark: median batch means **0.00021 ms/frame** for core polling and **0.00043 ms/frame** for bridge/visual state. Excludes browser canvas drawing, debug hit testing, rendering/GPU and hardware. Browser input/debug CPU timing includes these CPU paths; coarse timers can display zero. Emulator observed ~120 FPS / 8.33 ms, not a Quest benchmark.

Source local meshes 64³/128³/192³: **15.0 / 11.5 / 12.3 ms**, versus prior 15.2 / 11.4 / 11.7 ms (−0.2 / +0.1 / +0.6 ms, uncontrolled run variability). Inactive SDF/geometry unchanged; transforms still do not remesh. Production JS **737.53 kB / 196.58 kB gzip**, +13.58 / +4.48 kB; existing Vite size advisory remains. Emulator excluded from production.

## 5. Limitations

Physical pose orientation, analog/profile accuracy, panel readability and headset frame/thermal performance require Quest verification. Simple indicators, no haptics/hand tracking/system-button capture. Unknown face layouts report unavailable. Hidden details keep a compact header for restoration. No debug-card repositioning yet. Role/debug preferences last for the application lifetime and are not saved in sculpture files. No editing, grabbing, layer movement, two-hand manipulation, sizing actions, walking/teleportation or VR tool trays.

## 6. Next phase

Use the physical checklist in `VR_CONTROLLERS.md` first. For Phase 1.12c, add explicit per-role grip ownership, freeze anchors on press, cancel on blur/disconnect/role swap, and define both-grip arbitration. Workspace movement belongs only to Workspace Root; selected unlocked layer movement should be metadata-only with one undo transaction per gesture. Coordinate conversions must distinguish tracking/workspace/project/layer. Debug hits consume intent before any future tool command.

## Changed files and launch

New: `src/xr-input.ts`, `src/xr-controllers.ts`, `src/xr-diagnostics.ts`, `tests/xr-controllers.test.mjs`, `scripts/benchmark-xr-input.mjs`, `docs/VR_CONTROLLERS.md`.

Updated: `src/xr-experience.ts`, `src/xr-controller-roles.ts`, `src/main.ts`, `scripts/compile-core.mjs`, `README.md`, `docs/QUEST_WEBXR.md`, `docs/DEVELOPMENT_STATUS.md`.

Launch unchanged: `npm run dev`; use your established Quest secure origin. Authorized USB route: `adb reverse tcp:5173 tcp:5173`, then Quest Browser `http://localhost:5173/`. Trusted wireless route: `npm run dev:https`, port 5174. In VR, point a controller ray at the debug card buttons and tap the trigger; role swap cancels holds, so release before pressing again.

Evidence: `phase-1-12b-build.log`, `phase-1-12b-tests.log`, `phase-1-12b-input-benchmark.json`, `phase-1-12b-source-benchmarks.json`, `phase-1-12b-stereo-controllers.png`. Complete status: `phase-1-12b-development-status.md`.
