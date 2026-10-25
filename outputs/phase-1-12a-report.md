# Phase 1.12a completion report — Centra Sculpt

1. **What changed:** Existing renderer supports immersive viewing, Enter/Exit VR, secure-context capability/error diagnostics, isolated workspace fit, FPS/interval/CPU statistics and future Tool/Support hand roles. Added optional dev-only Quest 3 emulation, validated LAN HTTPS launcher and exact connection/testing instructions. Desktop tools pause during XR and return on exit.
2. **Architecture:** Original layer/chunk and Boolean meshes are reparented beneath Sculpture Root → Workspace Root. Camera/controllers belong to a separate Tracking Origin. Workspace fit uses metres without changing SDF values, native project metadata or layer transforms. Both exports exclude presentation transforms. No controller commands or new sculpting engine.
3. **Build/tests:** `npm run build` passed; `npm test` passed **198/198**, no skips. Dependencies installed with zero reported vulnerabilities. Emulator stereo/lifecycle exercised with 64³ and 128³ layers; desktop restored. TLS verified normally against a pinned test CA: app 200, private key 403. No physical Quest connected. Source checkpoint archive and SHA-256 created because this directory has no Git repository.
4. **Benchmarks:** CPU local remesh medians **16.7 / 11.9 / 12.0 ms** at 64³ / 128³ / 192³ (prior run 14.4 / 10.8 / 11.2 ms; increases 2.3 / 1.1 / 0.8 ms, uncontrolled runs). Inactive data/geometry unchanged. Emulator ~120 FPS / 8.33 ms is not headset performance. Main production JS 723.36 kB / 191.89 kB gzip; existing Vite bundle advisory remains. Emulator code excluded from production.
5. **Limitations:** Native Quest stereo/head tracking/comfort, exit and certificate/USB setup require actual headset verification. Dense stereo rendering cost is unprofiled on Quest. Controllers track only; no sculpting, grabbing, menus or locomotion. DevUI can capture mouse input; keyboard activation of focused Exit VR was verified. The temporary test HTTPS server was stopped; user-trusted development certificates have not been installed.
6. **Next phase:** Complete the physical acceptance checklist, then controller profile/hand ownership and object-centric workspace interaction. Keep tracking, workspace and layer coordinate conversion explicit; never bake workspace motion into layer/SDF data.

## Launch

```sh
npm run dev
```

For reliable Quest secure-origin testing with an authorized USB connection:

```sh
adb reverse tcp:5173 tcp:5173
```

Open `http://localhost:5173/` **in Quest Browser** and choose Enter VR. For wireless LAN, follow `QUEST_WEBXR.md` to configure genuinely trusted HTTPS (`npm run dev:https`, port 5174), or the optional temporary public tunnel. Mac trust alone does not imply Quest trust.

Desktop emulator: `http://localhost:5173/?xrEmulate=quest3` (development only).

## Changed files

New: `src/xr-scene.ts`, `src/xr-session.ts`, `src/xr-experience.ts`, `src/xr-controller-roles.ts`, `src/xr-emulator.ts`, `src/vite-env.d.ts`, `scripts/dev-https.mjs`, `scripts/tls-config.mjs`, `tests/webxr.test.mjs`, `tests/xr-tls.test.mjs`, `docs/QUEST_WEBXR.md`.

Updated: `src/main.ts`, `src/interaction.ts`, `src/compositor.ts`, `src/ui.ts`, `src/style.css`, `scripts/compile-core.mjs`, `vite.config.ts`, `.gitignore`, `package.json`, `package-lock.json`, `README.md`, `docs/DEVELOPMENT_STATUS.md`.

Evidence: `phase-1-12a-build.log`, `phase-1-12a-tests.log`, `phase-1-12a-source-benchmarks.json`, `webxr-emulator-stereo.png`, `webxr-emulator-two-layers.png`. Full handover: `phase-1-12a-development-status.md`. Before-change source: `before-phase-1-12a.tar.gz` with matching SHA-256 file.
