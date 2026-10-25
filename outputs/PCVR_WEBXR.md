# Phase 1.12a — PCVR testing and diagnostics

This is the PCVR companion to [Quest development setup](QUEST_WEBXR.md). The application uses one renderer and the real existing sculpture. Enter VR presents the currently selected Separate Layers or Boolean Preview view. It does not create another sculpture, change source voxels or record headset motion as layer edits. VR is viewing-only in Phase 1.12a.

## Select a compatible PC setup

Use a headset, connection software, graphics driver, **active OpenXR runtime and desktop WebXR browser that work together**. Start and connect the headset through the vendor/runtime software before opening the browser. Where multiple runtimes are installed, choose the intended active OpenXR runtime in that runtime's configuration tool, then restart the browser. Menu names differ by vendor and release.

A current Windows Chromium browser with a compatible OpenXR runtime is a practical starting point; compatibility is checked by the app, not inferred from the headset brand. Chromium documents its Windows OpenXR backend and the runtime extension it requires in its [platform support notes](https://chromium.googlesource.com/chromium/src/+/main/device/vr/README.md). This is not a promise that every Chrome/Edge version, runtime or headset combination works. Linux/macOS browser/runtime support must be verified separately; running this project's Vite server on a Mac does not provide PCVR runtime support on the Mac.

If using a streaming product such as Virtual Desktop or a vendor PC link, establish the headset's PC connection and choose the runtime supported by that product. A working streamed desktop or SteamVR game does not prove the desktop browser exposes WebXR. The app requires `navigator.xr` and a successful `isSessionSupported('immersive-vr')` check. Do not enable an emulator when testing real headset support.

## Option A — run the project on the VR PC

Copy/check out this existing project on the VR PC, preserving its source and lockfile. In a terminal in that project directory:

```sh
npm ci
npm run build
npm test
npm run dev
```

Open **`http://localhost:5173/` in the browser on that same VR PC**. HTTP localhost is a potentially trustworthy origin, so this path does not require a certificate. `localhost` on another device refers to that other device. If 5173 is occupied, stop the unwanted server or deliberately configure a different port; strict-port mode does not silently choose another URL.

Load your native sculpture through Open Project, or create layers before entering. If switching to Boolean Preview, let its rebuild finish first.

## Option B — keep Vite on the Mac, browse from the VR PC

On the Mac, in this workspace:

```sh
npm run dev
```

The existing `http://bretts-macbook-pro.local:5173/` is fine for ordinary desktop LAN access but is **not a secure WebXR origin on the PC**. Choose one of these secure routes:

### Trusted LAN HTTPS

Follow the certificate setup in `QUEST_WEBXR.md`, then on the Mac run:

```sh
npm run dev:https
```

On the PC, open **`https://bretts-macbook-pro.local:5174/`**. The certificate must match that hostname and its issuing CA must be trusted by the **PC/browser**, not merely by the Mac. If using a LAN IP instead, include it in the certificate SANs and use that exact IP in the URL. No warning bypass is part of the supported workflow. The app defaults to ignored `.certs/centra-cert.pem` / `.certs/centra-key.pem` and validates certificate/key/date before serving. See [mkcert's instructions](https://github.com/FiloSottile/mkcert) for trust installation on each development machine; never share the root CA private key.

### SSH loopback forwarding, where authorized SSH access already exists

If the Mac already allows your authorized SSH login and the PC has an SSH client, keep Mac Vite running on 5173 and run this on the PC, substituting your Mac login name:

```sh
ssh -N -L 127.0.0.1:5173:127.0.0.1:5173 MAC_USERNAME@bretts-macbook-pro.local
```

Then open **`http://localhost:5173/` on the PC**. This is PC loopback forwarded to Mac Vite; it uses the localhost secure-context exception. Keep the SSH terminal open; stop with Ctrl+C. Port 5173 must be free on the PC. This phase does not enable Remote Login, change firewall rules or install trust automatically. If SSH is not already available, use local-PC serving or trusted HTTPS.

The optional temporary public HTTPS tunnel in the Quest guide also works for development, with the same public-exposure warning and exact Vite allowed-host requirement. It was not started during this implementation. A production deployment is not required.

[MDN secure-context rules](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts) explain why LAN HTTP and localhost differ.

## Enter, verify and exit

1. Open **VR / WEBXR DIAGNOSTICS** on the desktop page. Check secure context = yes, WebXR API = available, and session = ready. If unavailable, read the capability reason.
2. Choose the desired surface/rendering modes on the desktop and finish any project load/Bake/Boolean job. Hidden layers stay hidden. Matte/Glossy/Layer Colours remain viewport choices; the Boolean result retains its existing material rules.
3. Click the application's **Enter VR**, accept the intended runtime/browser immersive permission prompt, and put on the connected headset.
4. Confirm the real visible sculpture appears stereoscopically, centred about 0.9 metres ahead and slightly below eye level. Its longest visible bound is initially fitted to 0.65 metres. Tracking/world coordinates are metres; application units are fitted only through the temporary Workspace Root scale.
5. Check the neutral **#808080** background in both eyes. It is an ordinary solid scene background, including with opaque composition. Desktop background and scene lighting/environment remain unchanged outside VR. The default can be configured through `XRSceneRig.preferences.background`; no skybox or preference UI is added.
6. Move your head sideways/up/down and rotate naturally: the sculpture should stay in place, while eye views respond. Try translated/rotated/scaled independent layers, hidden layers, separate view and a settled Boolean view. No controller actions should sculpt, stamp, grab or locomote.
7. Observe FPS/average/p95 frame intervals and JS render time on the desktop mirror diagnostics if useful. They are callback/CPU timings, not a GPU or motion-to-photon measurement.
8. Exit through the headset/runtime's session controls or **Exit VR** on the desktop mirror. Confirm the previous desktop camera/background and editing controls return. Orbit the sculpture, make a stroke, undo it, save/reopen a project and export a GLB. Check that entry/exit alone added no history or changes to native data.
9. Re-enter once to check repeated transitions. Record PC OS, GPU/driver, headset, connection path, browser version, active runtime/version, surface mode and triangle count along with results. Do not infer PCVR validation from Quest Browser validation.

## Desktop fallback

With `npm run dev`, open **`http://localhost:5173/?xrEmulate=quest3`** for the explicit development-only Meta IWER emulator. Use the app's Enter VR. It demonstrates stereo rendering and lifecycle/pose plumbing without claiming PCVR hardware compatibility. If DevUI captures mouse clicks, focus Exit VR and press Enter. The normal URL without the query leaves real XR capability detection intact. Emulator dependencies are excluded from production output.

## Troubleshooting

- **Secure context: no:** use same-PC localhost or genuinely trusted HTTPS. An HTTP Mac LAN address is insufficient.
- **WebXR API absent:** chosen browser/platform does not expose it in this context. Use the runtime vendor's documented supported browser and check policies/permissions.
- **No immersive runtime:** connect/wake the headset, start its runtime and verify the intended active OpenXR runtime. Restart the browser after runtime changes. Streaming and runtime compatibility are separate checks; do not disable browser security/sandboxing to force entry.
- **Entry rejection:** the displayed error preserves the sculpture. Check permission/session restrictions or another app holding the headset, then retry from a user click. See [WebXR startup/shutdown](https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API/Startup_and_shutdown).
- **Entry temporarily disabled:** finish a modal, project operation or pending Boolean rebuild.
- **Stutter:** many chunks/draw calls, dense 192³ geometry, multiple visible layers and Glossy reflections increase stereo GPU cost. Desktop Bake, resampling, native encoding/decoding and full mesh creation remain CPU-heavy; they are blocked during VR. Existing meshes are reused; no SDF extraction runs each XR frame. Framebuffer scale starts at 0.8, with foveation requested where supported.
- **No comfortable stereo / wrong runtime display:** record the actual setup and validate the browser/runtime on a known WebXR sample before attributing it to this app. Do not treat the desktop stereo mirror's aspect ratio as headset optics validation.

## Verification and next phase

The user reports that the previous Quest 3 Phase 1.12a implementation worked on physical hardware. That is recorded as **user-reported Quest validation**, not agent-run PCVR validation. This PCVR follow-up was tested with the desktop emulator and 200 automated tests; no physical PCVR system was tested by the agent.

Phase 1.12b should add controller connection/disconnection, handed Tool/Support roles, target-ray/grip indicators and a separate profile-aware input abstraction with analog dead zones and button edges. First verify mappings and poses on real controllers; keep these inputs disconnected from editing until the next explicitly authorized interaction phase. Preserve tracking origin / workspace / layer-local separation and do not modify voxels for workspace motion.
