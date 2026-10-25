# Phase 1.12a — PCVR Rendering Foundation follow-up

## 1. What changed

Followed the replacement PCVR Phase 1.12a brief. Preserved the existing XR renderer, animation loop, source meshes and independent layers. Added device-neutral capability guidance and explicit session/secure-context/API/blend diagnostics. VR now uses a configurable #808080 solid background and restores the exact prior desktop background on exit. Added detailed PCVR setup and hardware acceptance instructions. Controller tracking/input is deferred to Phase 1.12b as requested in the replacement brief.

## 2. Architectural decisions

Continue using the existing Tracking Origin and separate Workspace Root → Sculpture Root → layer-local hierarchy. Temporary VR presentation fits the visible sculpture to 0.65 m, 0.9 m ahead; tracked head movement does not move or resample the sculpture. Existing XR loop renders the real separate/Boolean result using existing chunks, with desktop editing and expensive meshing jobs paused. Lighting/environment, native schema and neutral exports remain unchanged.

## 3. Verification

- `npm run build`: passed, including TypeScript.
- `npm test`: **200 passed, 0 failed, 0 skipped**.
- Added two tests for background restoration/configuration (Color/Texture/null), environment/lighting isolation and renderer-binding failure cleanup/retry without native/history changes. Existing XR and full desktop regression suite passed.
- Browser emulator: grey stereo view under opaque blending, explicit presenting/ready diagnostics, 31,536 unchanged triangles, 0 history and enabled desktop Save after exit verified.
- Prior physical Quest 3 success is user-reported. No physical PCVR headset/runtime combination was tested by the agent.
- No Git repository: source checkpoint and verified SHA-256 saved as `before-phase-1-12a-pcvr.tar.gz` / `.sha256`. No original source files deleted; no new dependencies installed.

## 4. Benchmarks

CPU local remesh medians 64³ / 128³ / 192³: **15.2 / 11.4 / 11.7 ms**, versus previous 16.7 / 11.9 / 12.0 ms. Uncontrolled run variability applies; no regression measured in this run. Inactive source/geometry identities unchanged; transforms still trigger no remesh. Emulator ~120 FPS / 8.33 ms and ~0.20–0.30 ms CPU submission samples are not headset/GPU performance. Production JS **723.95 kB / 192.10 kB gzip**; existing Vite bundle-size advisory remains.

## 5. Known limitations

PCVR support depends on the chosen browser, OS, runtime, connection path and headset. Same-PC localhost is suitable without TLS; Mac-hosted HTTP LAN URLs are not secure XR origins. Trusted HTTPS or authorized loopback forwarding are documented. No runtime/trust/firewall/SSH service settings or public exposure were changed. Physical PCVR stereo, tracking, comfort, exit and performance require hardware validation. VR remains viewing-only; dense stereo draw calls and Glossy reflections may bottleneck headset performance.

## 6. Next phase

Implement controller connection/disconnection, stable handedness/Tool/Support roles, lightweight grip/ray indicators and a separate profile-aware input abstraction with analog dead zones, press/release edges and cancellation on visibility loss/disconnection/session end. Verify poses/mappings physically before routing tool commands. Keep workspace movement isolated from layer metadata and SDF data.

## Launch and changed files

`npm run dev`; on the VR PC running that server, open `http://localhost:5173/`. For the existing Mac server, use trusted HTTPS or the authorized SSH forwarding instructions in `PCVR_WEBXR.md`. Use the normal URL for real hardware; `?xrEmulate=quest3` is the development-only desktop fallback.

Changed: `src/xr-scene.ts`, `src/xr-experience.ts`, `src/xr-session.ts`, `tests/webxr.test.mjs`, `README.md`, `docs/QUEST_WEBXR.md`, `docs/DEVELOPMENT_STATUS.md`. New: `docs/PCVR_WEBXR.md`.

Evidence: `phase-1-12a-pcvr-build.log`, `phase-1-12a-pcvr-tests.log`, `phase-1-12a-pcvr-benchmarks.json`, `pcvr-foundation-grey-stereo.png`. Full handover: `phase-1-12a-pcvr-development-status.md`.
