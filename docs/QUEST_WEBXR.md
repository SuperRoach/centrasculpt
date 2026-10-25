# Current controller phase

Phase 1.12b adds tracking, input and in-headset debug controls. See [VR_CONTROLLERS.md](VR_CONTROLLERS.md) for current features and physical verification; the connection instructions below remain valid.

# Centra Sculpt — Quest 3 development and verification

For PC-connected headsets, see [PCVR testing instructions](PCVR_WEBXR.md). The user has since reported successful physical Quest 3 testing of the original foundation; the historical agent verification below describes the earlier run.

Phase 1.12a adds immersive **viewing**, with no controller editing, grabbing, walking or VR menus. Existing source chunk meshes and the selected separate/Boolean view are reused. The desktop editor is paused while requesting/presenting XR and restored on exit. The diagnostics panel is on the desktop/mirrored webpage, not an in-headset menu.

## Start on the Mac

From the project directory:

```sh
npm install
npm run build
npm test
npm run dev
```

If this Mac's npm cache has permissions problems, use `npm install --cache work/npm-cache`. The normal server listens on `0.0.0.0:5173`, with a strict port and `bretts-macbook-pro.local` allowed. Keep an existing server instead of starting a second one on that port.

Desktop LAN URL: `http://bretts-macbook-pro.local:5173/`. This HTTP LAN origin does **not** qualify for WebXR. Opening it on a phone can test desktop/touch rendering, but does not make immersive VR available.

## Reliable Quest development route: USB localhost

This avoids installing development certificate authorities on the headset and does not require production deployment.

1. Enable Quest Developer Mode using Meta's current developer setup; install Android platform-tools on the Mac (`brew install android-platform-tools`, if using Homebrew).
2. Connect Quest 3 by USB and accept the USB debugging authorization **in the headset**.
3. With `npm run dev` running on the Mac, run:

```sh
adb devices -l
adb reverse tcp:5173 tcp:5173
adb reverse --list
```

4. In **Meta Quest Browser**, enter **`http://localhost:5173/`**. Localhost is the secure-context exception; this is the headset's forwarded loopback address, not the Mac's LAN hostname.
5. Open a native project or prepare layers before entering. Choose Separate Layers or Boolean Preview; wait for Boolean rebuilding to settle. Click **Enter VR** and accept the headset's immersive session prompt if shown.
6. The complete visible sculpture should appear about 0.9 m ahead, centred slightly below the eyes, with its longest bound fitted to 0.65 m. WebXR world coordinates are metres. This temporary display fit does not alter layer/SDF scales or saved data.
7. Lean left/right/up/down and turn your head: eye views must respond while the sculpture stays fixed. Test with two different-resolution layers and with a Boolean result. Confirm binocular stereo, comfortable apparent size and no clipping on actual hardware.
8. Exit through Quest's system browser/session controls. On a desktop mirror, **Exit VR** also ends the session. Desktop camera, helper visibility and editing controls must return; sculpt, undo and save as usual.
9. Remove forwarding when finished: `adb reverse --remove tcp:5173`.

Meta documents the same reverse-port/localhost workflow in its [browser remote debugging guide](https://developers.meta.com/vr/documentation/web/browser-remote-debugging/). Localhost and trusted HTTPS rules are explained by [MDN Secure Contexts](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Secure_Contexts).

## Wireless LAN HTTPS (requires trust on the Quest)

The app includes an HTTPS launcher, but no certificate or trust-store changes are performed automatically. With mkcert installed on the Mac:

```sh
brew install mkcert
mkcert -install
mkdir -p .certs
mkcert -cert-file .certs/centra-cert.pem -key-file .certs/centra-key.pem bretts-macbook-pro.local localhost 127.0.0.1
npm run dev:https
```

Open **`https://bretts-macbook-pro.local:5174/`** in Quest Browser on the same LAN. If mDNS fails, generate a new certificate including the Mac's current LAN IP as an additional SAN and use `https://THAT_IP:5174/`. Allow Node through the Mac firewall if needed; avoid guest Wi-Fi/client isolation. The HTTPS server runs separately on strict port 5174.

**Mac trust does not install trust on Android/Quest.** Quest Browser must genuinely trust the issuer and the hostname must match the certificate. Installing custom CA trust may be unavailable or insufficient on particular Quest Browser/OS builds. A warning bypass is not a reliable secure-origin workflow. If trust cannot be established, use USB localhost above or the temporary public HTTPS alternative below. `mkcert -install` changes the Mac's trusted CA store; run it only when you choose that setup. Never copy/share mkcert's private root CA key. See the [mkcert documentation](https://github.com/FiloSottile/mkcert).

Certificate/key defaults are `.certs/centra-cert.pem` and `.certs/centra-key.pem`; override with `CENTRA_TLS_CERT` / `CENTRA_TLS_KEY`. The launcher checks parsing, matching keypair and validity dates, and fails clearly rather than silently serving HTTP. `.certs` is ignored and denied through Vite, as are PEM/key paths. Do not store keys in `public/` or commit them.

### Optional wireless alternative: temporary trusted HTTPS tunnel

If USB is inconvenient and headset CA trust cannot be configured, a publicly trusted temporary HTTPS URL can reach the local server. This is **public exposure of a development server**, not LAN-only: anyone who knows the URL can access it while it runs. It is optional and was not started during implementation.

With `cloudflared` installed, keep `npm run dev` running and run in another terminal:

```sh
cloudflared tunnel --url http://localhost:5173
```

Copy the exact generated `https://...trycloudflare.com` hostname. If Vite blocks it, restart only Vite with that **exact hostname**, without scheme/path, using the installed Vite additional-host mechanism:

```sh
__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS=EXACT_GENERATED_HOST.trycloudflare.com npm run dev
```

Open the generated HTTPS URL in Quest Browser. Do not set `allowedHosts: true`. Stop cloudflared with Ctrl+C when finished. No production deployment is involved. See [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

## Desktop emulator

The development build has explicit opt-in Meta IWER + DevUI support:

```sh
npm run dev
```

Open **`http://localhost:5173/?xrEmulate=quest3`** in a desktop Chromium browser. The secure localhost exception applies. Click the application's **Enter VR**. This enables stereo Quest 3 emulation and development pose controls; it does not connect a headset. A genuinely supported native XR runtime takes priority. The opt-in code/dependencies are excluded from production builds.

Use Meta DevUI's head pose controls / documented keyboard controls to simulate head movement. If its immersive mouse capture intercepts clicks, focus the application's Exit VR button and press Enter to return. DevUI can show its own Enter XR offer control; use the application's Enter VR control for this test. No simulated controller action is routed to sculpting.

For the separate **Meta Immersive Web Emulator extension**, install it from its official browser marketplace link in [Meta's repository](https://github.com/meta-quest/immersive-web-emulator), enable it for the local site, open DevTools → its WebXR/emulator panel, select a Quest 3 profile, and reload the page before entering VR. Leave off the app's `xrEmulate` query when testing extension injection. The repository was archived in October 2026; availability/extension UI varies by browser version. The built-in IWER route avoids depending on extension installation. See [Meta's IWER guide](https://meta-quest.github.io/immersive-web-emulation-runtime/getting-started.html).

Emulator stereo screenshots, interval statistics and mocked pose tests do not establish physical Quest latency, optics, controller tracking or thermal performance.

## Optional PC / Virtual Desktop / SteamVR

On a compatible Windows PC, configure the headset/runtime/browser according to those products' current support. Virtual Desktop streaming or a working SteamVR/OpenXR game alone does not prove the chosen browser exposes WebXR `immersive-vr`. Use the app's capability check and a trusted/localhost origin. The Mac workflow above uses native Quest Browser and does not depend on SteamVR. No PC streaming workflow was tested in this phase.

## Diagnostics and troubleshooting

- **VR unavailable / insecure origin:** HTTP `.local` and LAN IPs are desktop-only. Use forwarded localhost or genuinely trusted HTTPS; no browser security bypass.
- **No WebXR / no immersive runtime:** use Quest Browser, connect/authorize hardware, or explicitly opt into the desktop emulator. Ordinary mobile Safari/phone browsing is not this Quest test.
- **Denied request:** read the displayed failure; retry from a user click after granting the intended permission. The sculpture stays loaded. Browser/runtime support is checked with [`isSessionSupported`](https://developer.mozilla.org/en-US/docs/Web/API/XRSystem/isSessionSupported).
- **Enter VR disabled:** finish loading, Bake, a modal, or the Boolean preview rebuild. Pending geometry is completed on the desktop before entering.
- **USB device absent/unauthorized:** check Developer Mode, data cable and the headset's USB prompt, then `adb devices -l` and recreate forwarding after reconnect/reboot.
- **Inspect Quest logs:** connect USB, use desktop Chrome's `chrome://inspect/#devices`, and inspect the Quest Browser page; Meta's remote debugging guide covers this.
- **Performance:** expand VR / WebXR Diagnostics on the mirrored page. FPS derives from up to 120 XR callback intervals; p95 measures callback interval, and JS render time is CPU submission time, not GPU time. Headset refresh rate/reprojection can differ. Dense high-resolution scenes, many chunks, Glossy reflections and stereo draw calls remain bottlenecks. Framebuffer scale is 0.8 and foveation is requested at 1 where supported.

## Verification status — 2026-10-25

TypeScript/Vite build passed; **198 automated tests passed**. Emulator Enter/Exit and stereo rendering were exercised with a single sphere and two independent 64³/128³ layers; desktop buttons returned to enabled, geometry counts were unchanged, and the original native/history regression suite passes. Pose/workspace isolation, projection restoration, save bytes and exports are covered by automated CPU tests. Test TLS served `/` with 200 and a private-key path with 403, with certificate verification pinned to the test CA.

**No physical Quest 3 verification:** no device was listed by ADB. Hardware stereo, head tracking comfort, trust/USB setup, exit behavior and actual FPS must still be checked using the steps above. Emulator observed about 120 FPS / 8.33 ms intervals on this Mac; these are not Quest benchmarks.
