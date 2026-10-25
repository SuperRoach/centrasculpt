# Development Status — Centra Sculpt / vrappPOC

Last updated: 2026-10-25. **Current phase: 1.12c, workspace grabbing and controller visualisation implemented; new physical verification pending.** The user reports successful physical Phase 1.12a and 1.12b tests. Next phases: **1.12d, independent layer grip manipulation**, then **1.13, explicitly scoped VR tool input**. Keep the six-part completion report structure at the end of this document for every subsequent phase.






## Phase 1.12c — Workspace Grabbing and Controller Visualisation (current)

Support-grip workspace navigation, optional profile-matched controller models, display modes and contextual help now work within the existing XR renderer/loop. The user confirms physical 1.12a/1.12b success. **Codex has not physically verified 1.12c on Quest 3**; its new hardware checklist is in [VR_WORKSPACE.md](VR_WORKSPACE.md). All prior desktop/sculpting/layer/Boolean/Bake/stamp/native/export paths remain operational and covered by the suite.

### Architecture and transform policy

New `WorkspaceGrab` provides active Idle/Workspace Grab states, reserving future interaction names without enabling them. Only a Support grip press with a valid tracked grip begins a grab. It captures the initial rigid world grip and initial world workspace matrix. Held frames compute `G(t) × inverse(G(0)) × W(0)`, convert through inverse workspace-parent world matrix, and decompose into Workspace Root position/quaternion/scale. Rigid grip pose normalizes quaternion and strips tracking scale; no Euler accumulation, incremental drift or smoothing is introduced. Rotation pivots about the initial grip; repeated identical poses reproduce the same result.

The root matrix is updated without a second descendant traversal; normal rendering updates children. Tracking Origin/head/controllers and debug/hint geometry stay outside Workspace Root. Sculpture Root still contains independent layer render groups and the derived Boolean result, so the entire visible sculpture moves together. Source SDFs, layer metadata, native bytes, ordinary undo and both export coordinate sets remain untouched. No meshing or geometry allocation runs per navigation movement. Source sculpting remains disabled in XR.

Release leaves the workspace where it was within the current XR session. Tracking loss, disconnect, role change or session blur/end ends the grab at the last valid pose and requires a deliberate release/repress after cancellation. Exit restores desktop state and workspace presentation; each next entry fits/places afresh. This is navigation, not a saved sculpting edit. Tool grip alone does nothing; both grips continue the same single Support-hand interaction. Debug ray actions are blocked while grabbing to prevent competing commands; mirror role changes safely cancel the grab.

### Controller assets, display and contextual hints

- `FactoryControllerModelProvider` uses the installed Three `XRControllerModelFactory`, with isolated lifecycle proxy groups instead of repeated factory listeners on native grips. Returned animated objects attach to native getControllerGrip groups. The factory polls supported Gamepad response nodes for trigger/button/stick animation; target rays stay in getController space. Ordered profiles and physical handedness select assets independently.
- Default asynchronous repository is `https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles`. It preferred and successfully loaded **meta-quest-touch-plus** for both hands in the emulator. Other runtimes may select older/generic profiles; selected profile and asset URL remain exposed, and no exact Quest appearance is claimed for fallback assets. No assets are downloaded by the frame loop, and no offline bundle is added.
- `ControllerModels` caches promises/assets per profile list and physical hand, rebinds cached model input sources on reconnect, generation-guards late results, and detaches models on stop. Tracking and input never await assets. Failed requests use generic indicators; requests have a 10-second timeout and retry on reconnect or explicit Realistic reselection. The adapter intercepts the stock factory's throwing GLB error callback, cleans pending work on disposal, and disposes cached/late resources safely. Native grip groups never receive duplicate model-factory listeners.
- Default **Realistic** mode shows loaded models plus rays, falling back to simple grip/ray indicators while loading/failing. **Simple** shows both indicators/pointers. **Minimal** keeps Tool pointing feedback and contextual Support/hover indicators. Representation and asset availability do not gate tracking/input/grab state.
- `xr-actions.ts` defines reusable action descriptions with working/reserved flags. `XRHints` uses a separate cached canvas plane beside/below the debug card; Support grip is working, Tool grip/trigger/stick and Support stick are explicitly reserved. **Hidden / On demand / Always** modes are available. On-demand help responds to card hover, thumbstick contact or active grabbing; these are help cues, not thumbstick tool actions.
- Existing debug card footer cycles model/hint modes in-headset, including with details hidden. Mirrored selects are also usable during XR. Help/card remain fixed in tracking space rather than following the grabbed sculpture. Text textures redraw at most 10 Hz; no new geometry is created for movement. Settings last in application memory, not native sculpture files.

### Files and protection

New: `src/workspace-grab.ts`, `src/controller-models.ts`, `src/controller-model-provider.ts`, `src/xr-actions.ts`, `src/xr-hints.ts`, `tests/workspace-grab.test.mjs`, `scripts/benchmark-workspace.mjs`, `docs/VR_WORKSPACE.md`.

Updated: `src/xr-controllers.ts`, `src/xr-diagnostics.ts`, `src/xr-experience.ts`, `src/main.ts` (allow visual/help settings during XR), `scripts/compile-core.mjs`, `README.md`, `docs/VR_CONTROLLERS.md`, this status. No dependencies or native/SDF/history/export schema changes. Existing neutral-grey implementation remains. Git is unavailable; verified before-change checkpoint is `outputs/before-phase-1-12c.tar.gz` plus SHA-256. No original files deleted.

### Validation and performance

- `npm run build`: **PASS**, TypeScript + Vite. Main JS **837.21 kB / 224.44 kB gzip**, versus 737.53 / 196.58 kB in 1.12b (+99.68 / +27.86 kB, primarily factory/motion-controller/GLTF loading support). Existing Vite >500 kB advisory remains. Dev emulator stays excluded from production.
- `npm test`: **232 passed, 0 failed, 0 skipped** (216 existing + 16 new). Tests cover Support selection/edges, translation, quaternion rotation/pivot, nonidentity parent conversion, nonaccumulating repeated poses, persistence, tracking/disconnect/role/session/invalid-pose cancellation, Tool/both-grip non-actions, representation independence, hand/profile caches, late asset guards, missing assets and actual factory timeout/disposal/error handling, hints, native byte/history/geometry equality, separate/Boolean export coordinates and next-entry reset. A test verifies grabs leave descendant traversal to the renderer. All previous desktop and VR regressions pass.
- Browser emulator: both matching Touch Plus models loaded, grey stereo rendered, Realistic/Simple/Minimal and Hidden/Always controls exercised, contextual help visible. Captured model-ready profile diagnostics; prior 1.12b physical success is user-reported, while this phase's physical movement/comfort/animation remains unverified. Pure/bridge tests exercise grab mathematics through the same controller path. Emulator warm intervals ~120 FPS / 8.33 ms are not Quest performance. Initial model/texture work can spike CPU/frame time; no hardware performance claim.
- `node scripts/benchmark-workspace.mjs outputs/phase-1-12c-workspace-benchmark.json`: median **0.00014 ms/frame**, empty-workspace Node anchored pose/matrix microbenchmark. Excludes descendants, model animation, canvas/hit testing, rendering/GPU and hardware. `benchmark-xr-input.mjs`: two-source polling **0.00021 ms**, visual bridge **0.00043 ms** (no workspace/models/canvas); source benchmark limits unchanged.
- `node scripts/benchmark.mjs outputs/phase-1-12c-source-benchmarks.json`: local meshes **15.1 / 11.4 / 11.8 ms**, brush **0.14 / 0.47 / 1.24 ms** at 64³/128³/192³. Prior: 15.0 / 11.5 / 12.3 ms, changes +0.1 / −0.1 / −0.5 ms in uncontrolled runs. No extraction changes or grab-triggered remesh. Inactive sources/geometry stay unchanged; metadata transforms still perform no remesh. Full JSONs and logs are saved in outputs.

### Known limitations and next phases

First realistic load requires internet/CDN access (HTTPS); fallback preserves operation offline, but no offline asset pack is provided. Generic profiles may not match physical appearance. Loading warnings can be logged while the indicator fallback stays active. Stock animated models, their draw calls, first texture uploads and dense stereo/GLOSSY rendering need actual Quest GPU/thermal profiling. Card/hints have fixed placement and no repositioning gizmo. Visual preferences/navigation are not saved; navigation intentionally resets on next session. No haptics, independent VR layer grab, two-hand scaling/rotation, sculpting/stamping, stick sizing, tool trays, locomotion or deformation tools.

**Physical checklist:** see the eleven steps in [VR_WORKSPACE.md](VR_WORKSPACE.md): enter/grey, verify realistic pose/animations/profile and fallback, switch Simple/Minimal, show/hide hints, grip Support, move/rotate around the anchor, confirm whole separate/Boolean scene follows, release/persistence, verify unchanged layer metadata/data and interruptions, then exit/re-enter without duplicates. Native saves and GLBs remain project-space. New hardware acceptance is pending.

**Phase 1.12d:** add Tool-grip selected-unlocked-layer manipulation after physical validation; use explicit tracking/workspace/project conversions, anchors, release/cancel semantics, one metadata history transaction per completed layer gesture, debug-hit consumption and clear arbitration. Workspace changes must stay navigation-only. Specify both-hand ownership before implementing any dual-hand gesture.

**Phase 1.13:** use a shared role/action intent router for the explicitly authorized VR tool scope. Preserve inverse layer-space conversion, existing sparse stroke history/chunk invalidation and source independence. Measure actual headset frame budgets before continuous sculpt/stamp; keep expensive SDF work separate from XR rendering and model availability independent from input.

### Six-part completion report

1. **Changed:** Support-grip rigid workspace navigation, profile-based animated controller models/fallback, three display modes and optional contextual help.
2. **Decisions:** frozen world-pose anchors, workspace-only TRS, per-session navigation reset, input-independent async cached models, explicit working/reserved action descriptions.
3. **Validation:** build passed; 232/232 tests; matching models and mode/help controls in emulator; new physical Quest verification pending.
4. **Performance:** empty-root rigid-update microbenchmark ~0.00014 ms/frame; local meshes 15.1/11.4/11.8 ms; bundle growth and headset/model costs documented.
5. **Limitations:** initial network asset dependency with fallback, fixed debug/help placement and unverified hardware comfort/GPU cost; no other VR editing/manipulation scope.
6. **Next:** physical checklist, then Tool-grip layer metadata manipulation and shared intent/gesture ownership before further VR tools.

---


## Historical Phase 1.12b — VR Controller Tracking and Input Foundation

Implemented Quest 3 Touch Plus tracking, live input diagnostics and configurable Tool/Support roles using the existing renderer, tracking origin and animation loop. The existing configurable #808080 XR background and exact desktop-background restoration are preserved. No controller editing, grabbing, layer movement, two-hand scaling, locomotion or tool trays are implemented. The user's successful physical Phase 1.12a test is recorded; **the new Phase 1.12b controller features have not been physically verified by the agent**.

### Architecture and input decisions

- New `src/xr-input.ts` isolates polling/state from rendering and sculpting. Two reused frame records expose stable per-connection IDs, source-derived physical handedness, logical roles, connection transitions, target/grip tracking, availability, analog/raw/touch/pressed values, one-frame press/release edges and stick axes. Consumers copy retained frame values. Connect slots never determine handedness.
- Verified offline Touch Plus mapping: trigger button 0, grip 1, stick click 3, face primary/secondary 4/5, stick axes 2/3. Placeholder touchpad indices are preserved. Unknown xr-standard devices expose core standard inputs only; unknown layouts use semantic select/squeeze fallback without guessed face/axis indices. Missing/invalid data is neutral. Additional profile maps can be supplied through input options. No profile/network/model fetch is required. The exact mapping and primary sources are documented in [controller guide](VR_CONTROLLERS.md).
- Default radial stick dead zone is 0.15; analog values <=0.03 become zero, retaining other values without rescaling. Browser pressed or 0.55 analog threshold asserts; 0.45 release hysteresis avoids chatter. Invalid thresholds reject. Continuous holds never repeatedly emit justPressed; quick semantic taps can report both press/release in one frame. Disconnect, lost pose, blurred/hidden session and role swaps cancel holds, clear axes, and require release before rearming.
- `src/xr-controllers.ts` bridges existing manager getController/getControllerGrip groups under XR Tracking Origin → Controller Tracking. Three owns native reference-space matrices. Lightweight shared box/sphere/line geometry displays grip bodies and target rays; cyan left/amber right remains physical identity, brightness represents role, trigger highlights rays and grip highlights indicators. No workspace, layer or SDF matrices/data are written.
- Session listeners bind once and unbind on end; temporary visual children and the card detach on stop. Static manager connection listeners exist once per bridge lifetime and are removed by dispose. Repeated starts for the same session are idempotent; cached resources reuse across sessions. Missing/unsupported hand/gaze poses are not displayed as Touch controllers.
- New `src/xr-diagnostics.ts` draws a cached 1024×640 canvas texture on a small plane, fixed once beside the sculpture after the first viewer pose. Detailed text updates at most 10 Hz; input/poses and two simple debug hit regions run at XR frame rate. Each physical hand reports role, connection/tracking, trigger/grip, stick/click and face presses. Either controller can ray-tap Swap Tool/Support and Hide/Show diagnostics. Hidden details retain a compact restore/swap header. These are debug-only actions, with no path to sculpting/transform commands.
- `XRControllerRoles.bindingsFor(physicalHand)` resolves planned actions through current roles. Reserved future meanings: Tool trigger apply; Tool grip selected-layer grab; Support grip workspace grab; both grips two-hand manipulation; Tool stick sizing; Support stick history/selection; face buttons tools/menus. No action implementations exist. Hand role and debug expansion are application-memory preferences, not native sculpture data or undo transactions.
- XRExperience owns the bridge/card and reports input/debug CPU timing. The mirrored role selector and details checkbox remain available while XR editing controls stay disabled. Entry/exit still restores camera, desktop lighting/background and editing; source meshing/compositor work is not scheduled by controller updates.

### Files and protection

New: `src/xr-input.ts`, `src/xr-controllers.ts`, `src/xr-diagnostics.ts`, `tests/xr-controllers.test.mjs`, `scripts/benchmark-xr-input.mjs`, `docs/VR_CONTROLLERS.md`.

Updated: `src/xr-experience.ts`, `src/xr-controller-roles.ts`, `src/main.ts` (allow only debug controls while editing is suspended), `scripts/compile-core.mjs`, `README.md`, `docs/QUEST_WEBXR.md`, this status. No dependencies added and no SDF/history/native/export format modifications. Existing grey/background implementation and tests remain unchanged. No Git repository is available; complete source checkpoint `outputs/before-phase-1-12b.tar.gz` plus verified SHA-256 was created before editing. No original files were deleted.

### Build, tests and performance

- `npm run build`: **PASS**, TypeScript + Vite. JS **737.53 kB / 196.58 kB gzip**, versus prior 723.95 / 192.10 kB (+13.58 / +4.48 kB). Existing >500 kB advisory remains; emulator dependencies still absent from production output.
- `npm test`: **216 passed, 0 failed, 0 skipped** (200 existing + 16 new). New tests cover reverse slot handedness, role/binding swaps, all required buttons/analogs, radial dead zones/hysteresis, held/quick-tap transitions, missing/nonstandard/custom maps, reconnect IDs, lost tracking/blur/role cancellation, four-session listener cleanup, neutral data/history/geometry, actual ray activation of both debug controls and frame/geometry reuse. Existing grey, lifecycle, native migration/save, undo, CSG, Bake, stamping and GLB regressions all pass.
- Emulator/browser: both tracked controller representations and rays appear in stereo against grey; in-world card and mirror diagnostics report both hands; live handedness swap and details toggle exercised. Desktop restoration is checked on exit; synthetic tests verify all input values and debug ray actions. This is not physical Quest controller acceptance.
- `node scripts/benchmark-xr-input.mjs outputs/phase-1-12b-input-benchmark.json`: two-source warm median batch means **0.00021 ms** polling and **0.00043 ms** bridge/visual update per frame. Node microbenchmark excludes browser canvas painting, panel ray hit testing, rendering, GPU and hardware. Browser input/debug timing measures the full CPU path, including scheduled canvas paints; small values can round to zero with coarse timers. No per-frame input state/vector/geometry arrays are allocated; ray hits reuse an output array (intersection results themselves are produced by Three). Strings/texture redraws are throttled; no whole SDF work.
- `node scripts/benchmark.mjs outputs/phase-1-12b-source-benchmarks.json`: local meshes **15.0 / 11.5 / 12.3 ms**, brush medians **0.13 / 0.49 / 1.34 ms** at 64³/128³/192³. Prior PCVR follow-up: 15.2 / 11.4 / 11.7 ms; changes −0.2 / +0.1 / +0.6 ms in uncontrolled runs. No meshing implementation changed; inactive layer geometry/data stayed unchanged and metadata transforms performed no remesh. These CPU measurements do not prove Quest frame stability.

### Hardware acceptance, limits and Phase 1.12c

Exact launch/verification steps are in [VR_CONTROLLERS.md](VR_CONTROLLERS.md). Use the previously working Quest trusted origin, or `npm run dev` + authorized `adb reverse tcp:5173 tcp:5173`, then Quest Browser `http://localhost:5173/`. Check physical pose/orientation, all analog/face inputs, stick signs/drift, in-headset debug readability, ray tapping/hold suppression, live role changes, reconnect/lost poses, system-menu cancellation and repeated exit/reentry. Confirm no entry/input-only native/history changes, then test ordinary desktop tools. **New hardware verification remains pending** even though the prior foundation worked on the user's Quest.

Limits: lightweight indicators instead of detailed models; no haptics/hand tracking/system menu capture; unknown profile face buttons intentionally unavailable; debug header stays available when details are hidden; no user repositioning of the debug card yet; roles/details do not persist across reloads. Canvas/extra draw calls add unmeasured headset GPU cost; dense high-resolution stereo and glossy reflections remain bottlenecks. No physical frame/GPU/thermal claims. Dev emulator mouse capture may require keyboard activation on mirror controls.

Phase 1.12c should validate the input contract on physical hardware first, then add explicit per-role grip ownership and cancellation. Freeze anchors on press, compute tracking → workspace → project/layer conversions, cancel on blur/disconnect/role change and require rearming. Support grip moves Workspace Root only; Tool grip can target an unlocked selected layer with metadata-only transform transactions and one history action per completed gesture. Specify both-grip arbitration before two-hand manipulation. Debug hits must consume intent before future tool commands to prevent click-through. No SDF resampling or automatic merging for workspace/layer transforms; sculpting/stamping remains separate scope.

### Six-part completion report

1. **Changed:** tracked grip/ray indicators, separate input state, live handedness and in-headset/mirror diagnostics with show/hide.
2. **Decisions:** reuse manager/reference space and existing loop; physical identity independent of logical role; explicit profile maps; edge/cancellation semantics; debug-only actions and reusable resources.
3. **Validation:** build passed; 216/216 tests; stereo/emulator role and visibility checks; physical new controller acceptance pending.
4. **Performance:** warm two-source core/bridge ~0.00021/0.00043 ms (Node limits above); source local mesh 15.0/11.5/12.3 ms; production size advisory remains.
5. **Limitations:** no physical controller verification yet, simple models, debug placement/reading and actual headset frame cost require checking; no tool/manipulation actions.
6. **Next:** physical acceptance, then isolated grip ownership and object-centric metadata manipulation with transaction/cancellation tests.

---


## Historical Phase 1.12a follow-up — PCVR Rendering Foundation

The latest replacement brief explicitly targets PCVR Phase 1.12a, with controller tracking deferred to 1.12b. The existing general WebXR renderer/session implementation already supports this architecture; it has been preserved rather than rebuilt. No controller-input or controller-visual modules are included in this follow-up. The user reports successful physical Quest 3 testing of the previous Phase 1.12a foundation. This supersedes the earlier historical “Quest validation pending” status below; it does not establish physical PCVR testing.

### Changes and architecture

- `src/xr-scene.ts`: configurable `preferences.background` defaults to **#808080** while XR is active. Entry snapshots the exact previous background reference; exit restores Color, Texture or null. Lighting/environment are preserved. The solid scene background works with the existing opaque stereo rendering path without a skybox. The Tracking Origin / Workspace Root / Sculpture Root / independent layer geometry hierarchy is unchanged. Presentation fit remains temporary and never resamples or changes layer data.
- `src/xr-experience.ts`: diagnostics now use the device-neutral **VR / WEBXR DIAGNOSTICS** label and explicitly report session state, secure context, WebXR API availability and active session blend mode. Existing capability reason/errors, FPS, frame intervals and CPU submission statistics remain.
- `src/xr-session.ts`: unavailable/insecure diagnostics explain same-PC localhost and compatible browser/active runtime requirements, while preserving the Quest/ADB route. They no longer direct every unsupported PC to Quest Browser. Existing trusted-click request, cleanup, entry/exit and retry behavior is retained.
- `tests/webxr.test.mjs`: added two regression tests for grey/configurable background, exact Color/Texture/null restoration, unchanged lighting/environment, and recovery/retry after renderer binding failure with unchanged native bytes, history, camera and workspace.
- `docs/PCVR_WEBXR.md` (new): exact local-PC commands, trusted HTTPS from Mac, authorized SSH loopback alternative, browser/OpenXR compatibility diagnostics, headset acceptance checklist, desktop emulator fallback and Phase 1.12b plan.
- `docs/QUEST_WEBXR.md`, `README.md` and this status: linked PCVR instructions and distinguished user-reported Quest success from unperformed PCVR hardware validation. Native schema, viewport preferences, layer operations and exports were not changed.

The existing app renderer and `setAnimationLoop` render the real separate/Boolean scene. XR retains original chunk geometry; expensive SDF meshing and editing are paused, not scheduled per headset frame. Existing independent layer transforms/visibility/rendering styles, source grids, native files, GLB paths, brushes, shape stamps, Bake and desktop camera behavior remain covered by the complete regression suite. The controller input work begun before the replacement brief was removed from the final source scope; no additional dependencies were installed.

### Checkpoint and verification

There is still no Git repository. A fresh before-change source checkpoint is `outputs/before-phase-1-12a-pcvr.tar.gz` plus its verified SHA-256. No original project source was deleted.

- `npm run build`: **PASS**, TypeScript + Vite. Main JS **723.95 kB / 192.10 kB gzip**, up about 0.59 / 0.21 kB from the prior foundation; existing >500 kB advisory remains. Dev emulator code is excluded from production.
- `npm test`: **200 passed, 0 failed, 0 skipped** (198 existing + 2 new). Existing suite covers unsupported capability, session lifecycle/cleanup, head/workspace transform isolation, native byte stability, source chunk identity, input suspension, separate/Boolean GLBs and the full desktop sculpting/layer/history/Bake/stamp/native regression set.
- Browser emulator: stereo grey background visible in both eyes under reported **opaque** blend mode; presenting/ready state transitions, source sculpture count (31,536 triangles), no added history, enabled desktop Save and restored light desktop background verified after Exit. Observed emulator **~120 FPS / 8.33 ms**, one CPU submission sample ~0.20–0.30 ms. This is Mac emulator evidence, not PCVR GPU/latency or headset optics validation.
- `node scripts/benchmark.mjs outputs/phase-1-12a-pcvr-benchmarks.json`: local remeshing medians **15.2 / 11.4 / 11.7 ms** at 64³ / 128³ / 192³; brush medians **0.13 / 0.48 / 1.30 ms**. Prior Phase 1.12a run: 16.7 / 11.9 / 12.0 ms. No measured CPU regression in this run; uncontrolled run variability applies. Inactive-layer data and geometry retained identity and transforms triggered no remesh. XR frame/GPU cost is not measured by this source benchmark.

### Hardware, limitations and next steps

- **Quest:** prior foundation successfully tested on physical hardware according to the user. These grey-background/diagnostic follow-up changes still need headset acceptance. **PCVR:** no physical PCVR headset/runtime/browser combination was tested by the agent; do not conflate emulator or Quest Browser success with desktop OpenXR compatibility.
- PCVR compatibility depends on browser/platform/runtime/driver support. Same-PC localhost needs no TLS; Mac-hosted LAN URLs need trusted HTTPS on the PC or an authorized loopback forward. No trust store, runtime setting, firewall, SSH service or public exposure was changed automatically. Exact commands and checklist are in [PCVR testing guide](PCVR_WEBXR.md); the previous Quest guide remains available.
- Dense stereo draw calls, high-resolution geometry and Glossy reflections can limit headset performance. No headset GPU/thermal/latency benchmark, adaptive quality, simplification or asynchronous meshing rewrite is provided. Desktop Bake/resampling/native import and full remeshing remain potential CPU stalls outside VR.
- No grabbing, controllers, VR menus, walking, thumbstick locomotion, two-hand manipulation or deformation tools are added. Current handedness metadata is a contract only; input remains detached from editing.
- **Phase 1.12b plan:** create a separate controller-input module with stable per-connection identity, handedness from XRInputSource rather than slot index, Tool/Support role selection, explicit verified Touch Plus/profile mappings, safe unknown-input fallback, analog dead zones, press/release edges, and release/cancellation on disconnect/session blur/end. Add lightweight target-ray and grip indicators under Controller Tracking using Three's existing manager poses. Test source reordering, missing inputs, reconnection, role swap, lost tracking and complete cleanup. Validate physical mapping/pose orientation before connecting tool commands. Future grip workspace movement must change Workspace Root only; future layer-local operations must handle transforms explicitly.

### Six-part completion report

1. **Changed:** device-neutral PCVR diagnostics, explicit session/secure/API/blend state, configurable neutral XR background and exact PCVR testing guide.
2. **Decisions:** reuse existing renderer, hierarchy and meshes; preserve native/source/export data and desktop environment; leave controller tracking to the next phase as specified by the replacement brief.
3. **Validation:** build passed, 200/200 tests, grey stereo and desktop return exercised in emulator; user-reported prior Quest success; no agent PCVR hardware claim.
4. **Benchmarks:** local meshes 15.2/11.4/11.7 ms; emulator ~120 FPS is not hardware performance; production JS ~724 kB with existing size advisory.
5. **Limitations:** actual PCVR support/comfort/performance depend on untested hardware/runtime/browser; view-only XR, no controller interaction.
6. **Next:** execute the hardware checklist for the chosen PC setup, then implement isolated tracking/input foundation with disconnect/cancellation tests.

---


## Historical Phase 1.12a — Quest 3 WebXR Foundation (original handover)

The existing Three.js renderer now supports view-only immersive VR with capability diagnostics and an Enter/Exit VR control. All desktop sculpture features remain available outside XR. No controller sculpting/stamping, grip manipulation, thumbstick sizing, walking, teleportation or VR menus are implemented. No physical Quest was connected (`adb devices -l` listed no devices); software implementation is complete, hardware acceptance remains pending.

### Architecture and decisions

```text
Scene (existing lighting/background)
├── XR Tracking Origin
│   ├── Existing Perspective Camera / renderer-managed stereo cameras
│   └── Controller Tracking (target-ray/grip tracking groups only)
└── Workspace Root (temporary presentation TRS)
    └── Sculpture Root
        ├── Existing independent layer render groups / chunk meshes
        └── Existing derived Boolean result group
```

- `XRSceneRig` reparents original objects without cloning geometry. It fits the complete visible bound to a longest dimension of 0.65 m and places it 0.9 m ahead / 0.12 m below the first tracked eye position, respecting initial yaw. Placement runs once; subsequent head motion never moves the workspace. XR world units are metres; fitted model-units-to-metres scale belongs only to the workspace root. Layer/SDF transforms, resolution, voxels, native files and undo are untouched. Empty views use finite fallback framing.
- `XRSessionController` separates secure-origin capability checks, click-initiated session request, renderer binding, failure cleanup and external/browser exit. Scene/camera projection, helpers and desktop controls restore on exit. Pending-request disposal ends late sessions. `local` tracking space is the core requirement, with optional `local-floor` requested without making it mandatory.
- The original `renderer.setAnimationLoop` remains the sole app render loop. XR pauses desktop picking/sculpting, gizmos, orbit input, project/export commands, UI mutation and expensive meshing/compositor ticks; it renders existing meshes. Entry waits for an active Boolean preview to settle. OrbitControls are recreated on exit to clear queued drag/damping state. Native import attaches replacement project groups beneath Sculpture Root.
- Separate-layer export already isolates parent transforms; Boolean export now also explicitly excludes the presentation parent while preserving its own project-space placement, including when the result root is hidden in Separate view. Both exports remain neutral and independent from ghost objects.
- `XRControllerRoles` prepares typed dominant Tool / opposite Support roles and future binding descriptions. Existing manager controller/grip objects track poses only; no editing/input handlers are installed. Dominant hand is a session preference, not sculpture data.
- FPS / average / p95 XR callback intervals use a rolling 120-sample window; CPU submission time is reported separately and is not GPU timing. Framebuffer scale is 0.8 and foveation 1 is requested where supported. Dev-only explicit `?xrEmulate=quest3` injects Meta IWER/DevUI if no supported native XR runtime exists. Production build excludes emulator code. DevUI imports its own Three dependency (development warning); the application still uses its original renderer.
- `dev:https` adds strict-port LAN TLS on 5174 with validated external/ignored certificate files. Normal LAN HTTP remains on 5173. No trust store, firewall or tunnel was changed automatically. USB ADB reverse to headset localhost is the reliable documented secure-origin fallback. See [Quest development instructions](QUEST_WEBXR.md) for exact commands, native Quest testing, conditional LAN trust, optional temporary HTTPS tunnel, emulator and PC caveats.

### Previous Phase 1.9 context

Explicit Bake remains the only operation that creates a new sampled layer from the ordered world-space Boolean stack. It keeps source voxels intact, optionally hides sources, records the whole operation as one undoable transaction and stages work with cancellation/performance reporting. Layer transforms/resolutions remain independent; native v3 files retain baked layers as ordinary SDF data. XR does not invoke Bake or change its transaction semantics. Existing Phase 1.10/1.11 shape preview/stamping and later colour/style/preferences remain preserved.

### Changed files

New: `src/xr-scene.ts`, `src/xr-session.ts`, `src/xr-experience.ts`, `src/xr-controller-roles.ts`, `src/xr-emulator.ts`, `src/vite-env.d.ts`, `scripts/dev-https.mjs`, `scripts/tls-config.mjs`, `tests/webxr.test.mjs`, `tests/xr-tls.test.mjs`, `docs/QUEST_WEBXR.md`.

Updated: `src/main.ts`, `src/interaction.ts`, `src/compositor.ts`, `src/ui.ts`, `src/style.css`, `scripts/compile-core.mjs`, `vite.config.ts`, `.gitignore`, `package.json`, `package-lock.json`, `README.md`, this handover. Added Meta IWER and DevUI as development dependencies. Existing source files were modified in place. No Git repository exists, so the pre-change checkpoint is `outputs/before-phase-1-12a.tar.gz` plus SHA-256 rather than a Git commit.

### Validation and performance

- `npm install -D iwer @iwer/devui --cache work/npm-cache`: completed, zero audit vulnerabilities. No global npm cache ownership changes.
- `npm run build`: **PASS**, TypeScript + Vite. Main JS **723.36 kB / 191.89 kB gzip**, 39 modules; existing >500 kB advisory remains. Emulator chunks are absent from the production build.
- `npm test`: **198 passed, 0 failed, 0 skipped** (182 previous tests plus 16 new tests). New coverage: secure capability distinctions; rejection/setup/exit/cancellation paths; exact camera and helper restoration; hierarchy, head/workspace isolation, existing chunk identity, unchanged native bytes/voxels/history; separate and Boolean exports under workspace transforms; input suspension; handedness foundation; interval/CPU stats; matching/missing/malformed/mismatched/expired TLS material. Existing regression suite covers layers, CSG, Bake, stamps, native migration, history and GLB.
- Browser emulator: stereo Enter/Exit exercised with a sphere and a 64³ + 128³ sculpture (159,840 source triangles), and desktop edit buttons restored with unchanged counts. Emulator interval display about **120 FPS / 8.33 ms**, with a later CPU submission sample **0.20 ms**. These are desktop/emulator measurements, not Quest or GPU results. DevUI mouse capture required keyboard Enter on focused Exit VR during this automation. Physical head movement remains unverified; synthetic pose/workspace isolation is automated.
- Real TLS listener tested using a pinned test certificate with normal certificate validation: app `/` **200**, private-key path **403**. Temporary test server stopped afterward. No user/headset trust configuration performed.
- `node scripts/benchmark.mjs outputs/phase-1-12a-source-benchmarks.json`: warm CPU local remesh medians **16.7 / 11.9 / 12.0 ms** at 64³ / 128³ / 192³; brush medians **0.13 / 0.46 / 1.32 ms**. Prior Phase 1.11 run was 14.4 / 10.8 / 11.2 ms: measured increases **2.3 / 1.1 / 0.8 ms** in this uncontrolled run. This is not enough to attribute a stable regression to XR; extraction code is unchanged, but the increases are reported rather than hidden. Inactive-layer data/geometry stayed unchanged; metadata transforms performed no remesh. Full results are in the JSON; no hardware performance target is claimed.

### Known limitations / Phase 1.12b handover

1. **Physical Quest acceptance is pending.** Verify native browser stereo, six-degree head tracking, comfortable placement/size, near/far clipping, system-exit restoration and re-entry. Test USB localhost and the chosen trusted wireless origin on the actual OS/browser. Mac-only mkcert trust is insufficient for Quest.
2. Many dense chunks and high-resolution stereo meshes can bottleneck draw calls, GPU and memory; Glossy studio reflections add cost. No dynamic quality controller, GPU profiling, mesh simplification or headset thermal benchmark exists yet. XR callback intervals are not reprojection/physical latency measurements.
3. VR is viewing-only. Desktop DOM panels are not immersive UI. Controller groups have no models, hit testing, haptics, trigger/grip handlers or movement. Session hand preference is not persisted.
4. Each entry fits presentation afresh. Future workspace-grip/two-hand transforms must operate on Workspace Root, not layer metadata or SDF samples. Future layer manipulation must deliberately convert tracking/world/workspace/layer coordinates and guard against double scaling. Exports/native files must continue excluding presentation TRS.
5. Before enabling controller edits, verify Quest Touch Plus profiles/handedness, add session-scoped event ownership and cleanup, release/cancel semantics, and tests for no cross-hand/tool/camera conflicts. Keep expensive SDF transactions separate from headset frame rendering; budget/threading work before live VR strokes. No walking/teleportation navigation is implied.
6. Dev-only IWER is not hardware validation; the external extension repository is archived. Production >500 kB bundle advisory remains. No sparse/GPU architecture rewrite was introduced.

### Six-part completion report

1. **Changed:** view-only WebXR, secure/capability diagnostics, isolated tracking/workspace hierarchy, handedness foundation, HTTPS launcher, emulator and Quest guide.
2. **Decisions:** reuse the app renderer and meshes; temporary metre-scale presentation; preserve source/native/export coordinates; pause desktop editing during XR.
3. **Validation:** build passed; 198/198 tests; emulator stereo and return; TLS 200/403; physical Quest pending.
4. **Benchmarks:** local meshes 16.7/11.9/12.0 ms; emulator ~120 FPS is not headset performance.
5. **Limitations:** hardware/trust acceptance pending, view-only controllers, dense stereo draw cost and existing bundle warning.
6. **Next:** hardware acceptance first, then controller ownership/tracking and workspace interaction with explicit coordinate conversion; preserve independent layers and no automatic resampling.

---


## Current Phase 1.11 — Interactive Shape Stamping

Phase 1.10 historical notes below describe the preview-only baseline; this section supersedes those restrictions. All four procedural shapes now support explicit Add/Subtract stamps into the active independent SDF layer. Select a shape, adjust dimensions/rotation/uniform scale, hover a visible sculpture surface and left-click once. One completed click is one sparse undo action. A drag never applies or repeats stamps. Disable **Follow pointer on visible surfaces** for numerical placement, then click **Stamp once at preview** (or the viewport) to apply the current pose. Editing numerical position disables pointer following automatically. Orientation, size and operation remain between stamps. Ghost state still clears on native import and never enters files, Bake, CSG or exports. Hide the ghost/Escape to resume brushes and layer gizmos; right/middle/wheel camera controls remain available.

### Technical decisions and architecture

- New `src/shape-stamp.ts` prepares a frozen validated sparse patch without modifying the source. The explicitly selected target must match the definition, remain visible/unlocked, and have positive uniform scale. Parameters, target identity and all staged distance/boundary limits validate before any writes. Invalid/oversized/clipped commands preserve voxels and redo.
- Definitions map shape-local into target-layer-local space. A prepared kernel/inverse evaluates in local SDF distance units; parent transforms therefore do not resample voxels or multiply parent scale twice. Add uses exact Float32 `min(old, shapeDistance)`; Subtract uses `max(old, -shapeDistance)`. No brush smoothing, layer CSG operation changes, triangle merging or automatic resolution changes occur.
- **Far-field correctness:** a primitive's geometric AABB alone is insufficient for exact min/max. The candidate AABB expands by the maximum supported stored distance (4 × volume extent), so scans can cover the whole dense grid. Per-voxel distance-to-AABB lower bounds skip samples proven unable to change; expensive primitive evaluation runs only on remaining candidates. Only changed values are staged/written/recorded, including legitimate positive/negative far-field changes beyond the solid bounds. This deliberately favors exact stored field semantics over a truncated narrow band.
- The sparse patch grows typed buffers geometrically; it is not a full snapshot. `IndependentLayers.stampShape` records one existing `shape-stamp` history transaction and one global layer-aware timeline entry. No-op stamps retain redo. Layer-level operations/order/transforms are unchanged. New stamps invalidate redo consistently with strokes. Other layers and their chunk geometry retain identity.
- `IncrementalMesher.invalidateSample` uses the existing two-sample gradient/cell halo. A changed sample schedules chunks that already have surface geometry, or any affected chunk if its sign changes (including empty chunks gaining surface). Positive-to-positive/negative-to-negative updates that cannot reach an existing surface skip extraction. Full-reference tests compare positions AND normals across every chunk. Sparse undo/redo now use the same per-sample invalidation callback; source brushes retain their prior update path.
- `src/shape-placement.ts` separates world→layer-local surface placement and click intent handling. Down freezes the definition/target; primary up within five pixels commits once. Secondary buttons, pointer cancel/lost capture, focus loss, changed target, excessive movement and competing command actions cancel. Pointer placement raycasts visible source meshes or the derived Boolean mesh, never the ghost. It positions the shape **centre** on the hit surface and keeps its chosen orientation; no automatic normal alignment.
- Existing compositor dirty notification receives the exact changed bounds. Its next normal tick or export flush refreshes the derived Boolean result. Layers remain independent; explicit Bake remains the only creation/combination workflow.
- Native v3 needs no new sculpture schema: stamped Float32 samples are ordinary target data. The colour-save follow-up remains supported: optional display colours/mode persist; temporary shapes do not. Separate and Boolean GLBs remain neutral and exclude ghost objects.

### Changed files

New: `src/shape-stamp.ts`, `src/shape-placement.ts`, `tests/shape-stamp.test.mjs`, `scripts/benchmark-stamps.mjs`.

Modified: `src/independent-layers.ts` (stamp command/stats and sparse undo invalidation); `src/mesh.ts` (surface-aware per-sample invalidation); `src/history.ts` (optional replay change callback); `src/shape-preview.ts` (session pointer-follow state); `src/shape-ui.ts` (placement toggle, apply button, guidance); `src/main.ts` (surface picking, single-click routing, timings/input guards); `src/ui.ts` (phase label); `src/shapes.ts` (contract comment); `scripts/compile-core.mjs`; `package.json` (`benchmark:stamps`); README; this handover.

Protection: no Git repository is available. Before edits, the complete source was archived in `outputs/phase-1-10-before-1-11.tar.gz`; its SHA-256 file was verified. No existing project file was deleted. No new dependencies or network packages were required.

### Build, tests and performance

`npm run build` passed strict TypeScript and Vite. `npm test` passed **167/167, 0 failures** (145 prior + 22 new). Coverage: all four primitives × Add/Subtract against every exact reference voxel; local bounds/far field; rotated/scaled definitions; transformed independent targets; 64³/128³/192³; full mesh/normal reference equality after local updates and replay; hidden/locked/stale target/invalid transform/bounds protection; disconnected solids/empty volumes; one-action history, redo invalidation and no-op preservation; pointer gestures; source immutability; native data/colour round trips; compositor refresh; neutral binary GLBs; subsequent brush edits. Existing 145 tests, including Bake and project regressions, remain passing.

`node scripts/benchmark-stamps.mjs` / `npm run benchmark:stamps`: Node v26.8.1, one sample per shape/operation/resolution after source initialization, dimension .5, local position [.25,.15,.75], rotation [.2,.35,.1], scale 1. CPU only; total includes history capture, commit, writes and meshing; excludes UI/render/GPU and derived CSG refresh. Uncontrolled timings, not frame guarantees:

| Resolution | Evaluation range | Mesh range | Total stamp range | Chunks rebuilt |
| --- | --- | --- | --- | --- |
| 64³ | 5.6–18.4 ms | 12.3–31.8 ms | 27.4–42.2 ms | 9–12 / 64 |
| 128³ | 35.0–100.5 ms | 22.8–47.1 ms | 75.1–168.2 ms | 13–24 / 512 |
| 192³ | 118.2–339.5 ms | 37.1–85.4 ms | 177.0–581.7 ms | 21–43 / 1,728 |

Source-brush benchmark (`node scripts/benchmark.mjs outputs/phase-1-11-source-benchmarks.json`): local meshing medians **14.4 / 10.8 / 11.2 ms**, versus Phase 1.10 **14.9 / 10.8 / 11.6 ms**. No detected source-brush CPU regression within run variability. Stamp mesh work affects more chunks and is not directly equivalent to the previous 12–15 ms brush baseline. Production JS ~686.7 kB minified / 181.1 kB gzip; existing >500 kB advisory remains. Full evidence: `outputs/phase-1-11-*-benchmarks.json`, build/test logs and completion report.

Browser validation: a rotated box pointer click carved the 64³ sphere, reported **4,583 changed voxels, 12/64 chunks, 48.5 ms total**; Cmd+Z restored 31,536 triangles and Cmd+Shift+Z restored the stamped 32,264-triangle geometry. A subsequent left drag retained **1 undo / 0 redo**, proving no automatic repetition. A second browser check stamped an independent 128³ layer: **41,569 changed voxels, 27/512 chunks, 111.1 ms total**. Before/after native files confirmed zero changed voxels in the hidden 64³ Base and unchanged metadata for both layers. Both real GLBs contained one neutral opaque node and 131,596 triangles, with no ghost. Reopening and saving the stamped native file again produced byte-identical data. The numeric-pose stamp button changed 18,234 voxels in one action; Undo restored the prior geometry, and locking the target disabled the stamp button. Further evidence is recorded in the completion report.

### Known limitations / technical debt

- Dense candidate scans may cover the full layer even for small stamps; exact far-field updates can produce large sparse histories. Existing 32 MiB/action soft budget retains the latest large action; voxel staging and history Map capture add transient memory. Large Add and convex stamps can briefly block the main thread (up to ~0.58 s in this sample). There is no worker or progress/cancel UI for stamp execution.
- Add conservatively rejects any transformed shape AABB extending within one voxel of the fixed volume boundary. It never silently clips, grows bounds or resamples. Subtract can overlap/extend beyond bounds, provided resulting values stay finite, within supported distance limits and positive on boundaries. Very large cutters may be rejected. The UI displays a clear error; a different layer or manual reposition/resize is required.
- Only positive uniform shape/layer scale. Pointer placement is centre-on-surface, keeps orientation, and can use another visible layer as a placement reference while still editing only the active layer. If that hit lies outside the target volume, Add fails clearly. No placement-plane/depth drag or ghost transform gizmo.
- Grid spacing limits sharpness/tiny detail. Marching tetrahedra and gradient normals approximate the sampled sharp boundary. Sphere ghost tessellation remains a display approximation.
- Preview settings are session-only and not undo actions; stamped data is undoable. Native reload intentionally clears all history and preview. Colour preferences continue saving normally. Current aggregate import triangle/voxel limits and camera framing limits still apply.
- Allocation exhaustion and low-level renderer failures are not recoverable transactional jobs. Validation errors occur before writes; normal successful commits have exact sparse undo. Worker/off-thread staged meshing would improve failure isolation.
- No continuous drag stamping, VR input, thumbstick scaling, implicit layer merges or deformation tools were added.

### Recommended Phase 1.12 approach

Prioritize usability and latency: a separate ghost TransformControls proxy with exclusive input ownership, optional surface-normal alignment/depth offset and explicit target-volume bounds feedback; preserve numeric/local/world placement. Keep one-click/one-action semantics and layer-local math shared by all input methods. Move large stamp planning into a worker with a frozen layer ID/volume revision and cancellation; stage sparse buffers off-thread, validate/recheck before commit and schedule chunk work in cooperative batches. Consider per-block SDF range caches for exact candidate pruning before adopting a documented narrow-band field representation. Optimize bulk sparse history capture to accept validated typed patches without Map duplication. Preserve exact undo, colour metadata, native compatibility, hidden/locked rules and neutral separate/Boolean export tests. Continuous stamping or VR should be separate explicit scope, reusing commands instead of bypassing ownership.

## Completed phases

| Phase | Delivered |
| --- | --- |
| 1 baseline | Vite + strict TypeScript + Three.js; sculptable dense SDF sphere; Add/Subtract; orbit/pan/zoom; radius, reset and GLB |
| 1.2 | Gradual clay displacement, Smooth diffusion, strength, stroke spacing and gradient normals |
| 1.3 | Sparse stroke-level undo/redo; keyboard shortcuts; validated native projects |
| 1.4 | Chunk-local extraction/rendering, watertight boundaries, hardness, 64³/128³/192³ resolution, timings |
| 1.5 | VolumeStore, SculptProject/SdfLayer/LayerStack, layer-aware native v3, shape intent definitions |
| 1.6 | Independent sculpting layers, flags/order/duplication, per-layer resolutions, session-only colours, separate GLB nodes |
| 1.7 | Independent metadata/matrix transforms, uniform-scale gizmos/numeric fields, transformed sculpting, transform history |
| 1.8 | Non-destructive ordered Boolean preview, operation/reorder history, derived-grid caching and Boolean GLB |
| 1.9 | Explicit confirmed SDF Bake into a new independent editable layer, source retention, cancellation and one-action replay |
| 1.10 | **Procedural Sphere, Cube/Box, Triangular Prism and Square Pyramid kernels; Shape Library UI and cached non-destructive ghost preview** |
| **1.11** | **Explicit one-click Add/Subtract shape stamps, pointer/numeric placement, exact sparse undo and surface-aware local remeshing** |

## Phase 1.9 summary

Bake / Merge samples the visible ordered Boolean field directly into a fresh 64³/128³/192³ dense grid, never concatenating meshes or modifying source voxels. A confirmation dialog selects name/resolution, previews padded bounds and memory, and defaults to hiding sources. Kept-visible sources select Separate Layers to avoid immediately recombining originals with the approximation. Preparation is cooperative and cancellable, with atomic commit after validation/meshing.

Baked grids use normalized local bounds ±1.6 and TRS metadata restoring world size, maintaining native v3 and brush compatibility. Before/after stack metadata, visibility, active selection and view mode form one creation transaction. Undo detaches the new runtime; redo reinstalls its original voxel arrays and chunk geometry. Retained redo storage counts toward capacity. Ordinary sparse sculpting history and independent resampling continue to work. Source data/metadata were verified intact except requested visibility, and native Save/Open/Save was byte-identical. The previous phase passed 121 tests. Its explicit bake benchmark was approximately 115 / 487 / 1,391 ms total at 64³/128³/192³. Detailed historical evidence remains in `outputs/phase-1-9-*`.

## Historical Phase 1.10 architecture and ownership

- `SculptProject` owns `LayerStack`; each `SdfLayer` owns independent `VolumeStore`/dense `SDFVolume`, local bounds/resolution, stable ID and metadata. No implicit merging or source resampling is permitted.
- `IndependentLayers` owns a runtime per layer: `IncrementalMesher`, `ChunkSurface`, material, sparse `SculptHistory`, timings and global chronological history. TRS changes update matrices only; voxel edits rebuild affected chunks plus the gradient halo.
- `BooleanComposite` reads visible independent volumes via inverse transforms into a disposable bounded world grid. It is rendering/export data, excluded from native serialization. Stack order is top to bottom; the first visible layer initializes the field. Union=min, Difference=max(a,-b), Intersect=max.
- Bake is an explicit new-layer creation command. Its sampling and deferred/batched runtime preparation are separate from commit/history. Sources remain stored.
- `src/shapes.ts` owns stable IDs, immutable human-readable metadata, dimension rules, validated ShapeDefinition and future input/intent ports.
- `src/shape-library.ts` owns side-effect-free primitive preparation, signed distances, local/world bounds and composed transform sampling. It does not write VolumeStore data or depend on UI/controller logic.
- `src/shape-preview.ts` owns session-only `ShapePreviewModel` and `ShapeGhost`. The model associates the preview with the active layer. The ghost is a scene sibling, never a child of project/export groups. It holds at most four small canonical geometry pairs; dimensions/poses update object matrices/scales only.
- `src/shape-ui.ts` owns the generated selector/icons, parameter fields, validation feedback and local/world pose conversion. Existing UI scaffolding only mounts its slot. No Apply/Stamp button or commit executor is registered.
- Preview input pauses sculpting and layer gizmos. Camera orbit/pan/zoom remain available. Hiding the ghost or Escape resumes existing tools. An explicit layer numeric transform still edits that layer through its existing command path.

```mermaid
flowchart LR
  UI[Existing UI] --> Commands[IndependentLayers]
  Commands --> Layers[SdfLayers / independent volumes]
  Layers --> Mesher[ChunkSurface / GLB]
  Layers --> Composite[BooleanComposite cache]
  Composite --> Bake[Explicit Bake / new volume]
  ShapeUI[Shape Library UI] --> State[Session preview model]
  State --> Ghost[Ghost scene sibling]
  State --> Definition[Validated ShapeDefinition]
  Definition --> Kernel[Prepared primitive / world sampler]
  Definition -. Phase 1.11 intent only .-> Commands
```

## Shape contracts and mathematics

Stable type IDs are `sphere`, `box`, `triangular-prism`, `pyramid`. ShapeDefinition.id identifies the current preview/intent; targetLayerId identifies its target. Dimension values are **full unscaled extents XYZ**, not half extents. Local origin is the bounding-box centre. The isosceles prism triangle lies in XY, bottom Y negative/apex Y positive, extruded along Z. Pyramid has a square XZ base at negative Y and centred apex at positive Y.

Sphere dimensions must be equal diameters. Box and prism dimensions are independent. Pyramid width/depth must match; the UI links those axes. Pose scaling is positive uniform only. Dimension and pose values use existing validation limits (dimensions/scales 0.001–1000; finite position/rotation components within ±1000, rotations internally radians). Sample queries reject nonfinite/unreasonably large coordinates (±1e12). The earlier placeholder allowance for anisotropic shape scale/rectangular pyramid was tightened to this phase's requirements; shape definitions were never stored in native projects, so existing sculpture files are unaffected.

Sphere and box use analytic Euclidean SDFs. Prism and pyramid use cached outward-oriented triangular faces, closest-point distance to the entire convex boundary, and half-space interior classification. These are genuine 3D signed distances, including Euclidean edge/corner distances, rather than a max-plane estimate or 2D silhouette. Negative means inside; positive outside. Local bounds are exact axis-aligned boxes; transformed bounds conservatively transform those boxes.

**ShapeDefinition.transform maps shape-local into target-layer-local space.** World matrix = layer matrix × shape pose matrix. `prepareShape(definition, layer)` validates/copies parameters, caches inverse matrices and kernel data, then multiplies local distance by combined uniform scale. Prepare once per batch, not once per voxel. World-space UI edits inverse-transform the requested pose back into the layer. Compound world positions/scales can exceed one local metadata range; validation applies to the converted local pose, with only out-of-bound floating-point endpoint noise snapped back to valid limits. The math helper can read any validated layer metadata; applying an edit must separately enforce active/visible/unlocked rules.

## Phase 1.10 implementation and changed files

| File | Change |
| --- | --- |
| `src/shapes.ts` | Stable metadata/catalog, dimension constraints and positive uniform shape-pose validation; existing intent/controller ports retained |
| `src/shape-library.ts` (new) | Primitive kernels, cached convex-boundary preparation, full 3D local/world sampling and bounds |
| `src/shape-preview.ts` (new) | Session preview state, active-target/edit guards, pose conversion, four-pair geometry cache and ghost renderer |
| `src/shape-ui.ts` (new) | Shape selector, SVG icons, Add/Subtract, dimensions, local/world position/rotation/scale, reset, error/target/performance feedback |
| `src/main.ts` | Ghost scene integration, busy/selection/load synchronization, sculpt/gizmo gating and Escape |
| `src/ui.ts` | Shape Library mount slot and Phase 1.10 header |
| `src/style.css` | Shape controls and scoped narrow-screen sticky viewport while library is open |
| `tests/shape-library.test.mjs` (new) | 20 primitive, transform, preview and regression tests |
| `scripts/compile-core.mjs` | Compile math/preview modules for tests and benchmarks |
| `scripts/benchmark-shapes.mjs` (new) | Cold/warm preview, geometry reuse, idle, prepared SDF and immutability measurements |
| `package.json` | `benchmark:shapes` command; no new dependencies |
| `README.md` | Current phase, controls, math, limits and validation |
| `docs/DEVELOPMENT_STATUS.md` (new) | This development handover |

No changes were needed to SDF brush storage/math, source meshing, IndependentLayers, Boolean composition, Bake, native codec or GLB export implementations.

## Implemented behavior

Open Shape Library and select a primitive. A translucent teal Add / rust Subtract ghost appears; outlines remain visible through the sculpture. Fields control full dimensions, Euler XYZ rotation in degrees, position and positive uniform scale. Pose space can be layer-local or world. Sphere diameter and pyramid square-base axes stay linked. No source volume, dirty chunks or history are changed by these controls.

The ghost follows active-layer selection and metadata transforms; hidden/locked/invalid nonuniform targets hide it and disable edits with a clear reason. Preview state is session-only, cleared on successful Open Project and never saved, composited, baked or exported. The renderer ignores ghost raycasts. Closing the panel, hiding the ghost or Escape restores sculpt/gizmo interaction. On narrow screens the viewport stays visible while the open panel scrolls. Existing camera controls remain available.

No shape stamping, continuous stamping, controller input, automatic layer merge or deformation Move tool is implemented. Future stamp/input types remain data-only interfaces.

## Validation and performance

`npm run build` passed strict TypeScript and Vite production build. `npm test` passed **141 tests, 0 failed**: all previous 121 plus 20 new tests. No old test was removed or relaxed. New coverage includes exact primitive distances/signs, 3D caps/edges/apex/corners, bounds and winding, extreme aspect ratios/Lipschitz stability, invalid parameters, parent/shape transforms, immutable prepared snapshots, preview voxel/history/buffer preservation, geometry reuse/idle skip, analytic/preview-surface agreement, active selection/flags/legacy nonuniform handling, world/local pose conversion, raycast/input exclusion and preview reset/future intent. Integrated regressions cover Boolean evaluation, Bake, native round trips and both binary GLB workflows without ghost data.

Browser checks exercised all four primitives, dimensions, rotation, world pose/scale, linked pyramid base axes, Add/Subtract colours, held viewport click/W shortcut exclusion, active hidden/locked target guards, Escape and native-import clearing. Native files before/after preview editing were byte-identical; all three saved Phase 1.9 layers retained their exact data/metadata. Both actual downloaded GLBs contained one sculpture node, 121,172 triangles and no ghost. Source history remained 0 undo / 0 redo and the browser reached four cached shape pairs. Detailed verification and screenshots are recorded in `outputs/phase-1-10-report.md` and `outputs/phase-1-10-file-verification.json`.

`npm run benchmark:shapes`, Node v26.8.1 on this machine. Active 128³ layer plus independent 64³ Base; 2,000 warm validated state updates per shape, 20,000 prepared world samples, 10,000 idle synchronizations. CPU only:

| Shape | Cold geometry + pose | Warm update mean | Prepared world query mean |
| --- | --- | --- | --- |
| sphere | 1.0676 ms | 0.0046 ms | 0.103 µs |
| box | 0.5043 ms | 0.0027 ms | 0.115 µs |
| triangular-prism | 0.1237 ms | 0.0024 ms | 0.340 µs |
| pyramid | 0.1356 ms | 0.0024 ms | 0.238 µs |

Idle sync averaged **0.0008 ms**. Exactly four geometry pairs were built; all dimensions/pose changes reused them. Source voxels, chunk geometry and project history stayed unchanged. These timings exclude DOM, rendering/GPU and picking; they are not end-to-end frame-rate guarantees.

The isolated source benchmark (`node scripts/benchmark.mjs outputs/phase-1-10-source-benchmarks.json`) measured local meshing medians **14.9 / 10.8 / 11.6 ms** at 64³/128³/192³. The latest comparable Phase 1.8 source run was 15.2 / 11.7 / 12.1 ms; differences −0.3 / −0.9 / −0.5 ms show no detected CPU source-meshing regression, within uncontrolled run variability. The source benchmark excludes the browser/ghost rendering loop. New preview overlays add two draw objects; GPU/frame regressions have not been profiled. Production bundle is approximately **678 kB minified / 178 kB gzip**, up from Phase 1.9's 659 / 172 kB; the existing Vite 500 kB advisory remains.

## Known issues, limitations and technical debt

- Numeric pose controls only for the ghost; no shape gizmo, click placement or stamp executor yet. W/E/R layer gizmos and brushing intentionally pause while a ghost is enabled.
- Sphere render preview is tessellated (32×20); its SDF is analytic. Polyhedron surfaces are exact low-poly boundaries. X-ray outlines and transparent surfaces can overlap visually; they do not affect sculpt geometry or picking.
- Only positive uniform parent/shape scale is supported for preview distance correctness. Hidden/locked/nonuniform targets are explicitly unavailable. Extreme scales/poses can exceed existing camera/navigation framing and rendering precision; there is no auto framing.
- Dimensions are shape-local even when pose fields use world coordinates. The ghost is free to extend outside a target volume; Phase 1.11 must choose explicit clipping/rejection rules before modifying voxels.
- Preview state and history are not native sculpture metadata; the subsequent colour-save follow-up persists display colours/mode. Successful import clears the preview. Shape-selection parameters are not independently undoable because they do not edit the sculpture.
- Dense grids remain 64³/128³/192³ with existing aggregate voxel, eight-layer and native triangle limits. CPU source/composite extraction and Bake remain cooperative/synchronous main-thread work. Initial full composition/resampling can pause; no sparse/GPU/worker backend was introduced.
- Prepared convex kernels reuse scratch vectors and are synchronous; prepare separate instances per independent job. Full-volume per-voxel preparation is prohibitively wasteful. The generic convex distance method only applies to convex solids; torus/etc. need their own kernels.
- Full native import still blocks while source meshes are prepared; one browser run showed roughly 0.93–0.95 seconds for the active 128³ source mesh. There is no controlled browser baseline for that sample; profile cold import separately from the unchanged isolated local-mesh benchmark. Preview parameter changes left that source-mesh timing unchanged.
- Existing main/UI files are still compact and monolithic around command orchestration. Shape UI was isolated; broader UI refactoring is deferred. UI/GPU performance and long-session memory pressure need profiling.
- Vite source/document reloads can reset unsaved in-memory sculptures during development. Save before source edits; generated work/tests/scripts/outputs are ignored. Git is unavailable here; verified source archives provide phase checkpoints.

## Recommended Phase 1.11 implementation

1. Add a deliberate **Apply shape once** command; keep continuous stamping and VR input deferred unless explicitly requested. The ghost remains separate until that action.
2. Freeze `futureStampIntent`/definition and target layer ID at command start; revalidate target existence, active/visible/unlocked state and positive uniform transforms before mutation. Do not let an asynchronous selection change redirect a stamp.
3. Use `prepareShape` or a prepared local kernel once per operation. Target voxels store **layer-local distance**: either inverse-transform layer-local points into shape-local space and multiply by shape scale, or evaluate world distance and divide by layer uniform scale. Do not multiply parent scale twice.
4. Apply Add as `min(old, shapeDistance)` and Subtract as `max(old, -shapeDistance)` to the target volume only. Do not use a triangle merge, Boolean compositor cache or source-layer merge as the stamping path.
5. Compute conservative target-local voxel bounds and gradient halo. Decide/document narrow-band versus full far-field distance updates: exact min/max can change values outside the shape's geometric AABB. Preserve the zero surface, positive outer boundary, finite/stability limits and Smooth behavior. Explicitly reject or explain shapes clipped by finite volume bounds.
6. Record one sparse `SculptHistory.begin('shape-stamp')` transaction with target ID; reuse first-write recording/commit and chunk/composite invalidation. Validate capacity/params before mutation and handle cancellation/error rollback atomically. Do not record one history action per voxel or snapshot every pointer move.
7. Keep preview and device state out of native v3; retain the subsequently added optional colour metadata. Ordinary stamped voxels can use the existing native format. Persisting procedural edit stacks would be a separate format/design decision.
8. If adding a ghost gizmo, use a preview proxy/model and exclusive input ownership. Do not reuse `LayerTransformTools` in a way that changes a SdfLayer or records layer-transform history. Keep world/local conversion and layer selection clear.
9. For future controller scaling, route analogue events into the same model validation. Uniform pose scale remains isotropic; axis-specific changes belong to permitted dimension rules (sphere all equal, pyramid width/depth linked).
10. Add tests for exact stamp locality/signs/transformed layers, source independence, flags/boundaries, one-action undo/redo, redo invalidation, interrupted operations, native/export regression and measured local rebuild cost. Extend primitives by registering stable metadata + kernel + canonical preview geometry/icon and focused tests; never silently fall back to another shape.

## Required completion report format for future phases

End each development phase with six concise items: **(1) What changed; (2) architectural decisions; (3) build/test results; (4) benchmarks/regressions; (5) known limitations; (6) next-phase considerations.** Update this handover with actual files, commands, pass/fail counts and measured results, and link detailed evidence.

## Protection and launch

No existing project files were removed. A verified Phase 1.9 source checkpoint is `outputs/phase-1-9-before-1-10.tar.gz` with SHA-256. Dependencies were already installed; no new packages were added. Start with `npm run dev` and open http://localhost:5173. Validate with `npm run build`, `npm test` and `npm run benchmark:shapes`.


## Phase 1.10 follow-up — save layer colours (2026-10-25)

The user changed the earlier session-only colour requirement: Save/Open Project now preserves per-layer viewport RGB colours and Clay/Layer Colours mode. Colours remain display data, separate from SDF voxel storage and neutral GLB materials. Shape ghosts remain session-only and excluded from saves/exports.

- Native v3 gains an optional `displayPreferences` object, validated before import. Stable layer IDs map to normalized `#rrggbb` strings. Unknown layer targets, invalid colours and invalid display modes are rejected. No format bump or voxel resampling is needed; old v1/v2/v3 files still load.
- `LayerDisplayPreferences.snapshot` explicitly captures current layers only (excluding stale/deleted IDs); `restore` applies stored preferences. The project codec preserves this optional metadata through further round trips. The application Save handler supplies the snapshot, and layer runtime creation restores saved preferences before presenting materials.
- Changed: `src/display-preferences.ts`, `src/layers.ts`, `src/project.ts`, `src/independent-layers.ts`, `src/main.ts`, `src/ui.ts`, `tests/project-colours.test.mjs`, README and this handover. Existing source files were checkpointed under `work/colour-save-checkpoint/` before editing; Git is unavailable in this workspace.
- Validation: `npm run build` passed; `npm test` passed **145/145**, including four new tests for fresh-session colour/mode restoration, Clay-mode colour retention, legacy compatibility and malformed metadata. Separate GLB remains neutral and respects hidden layers. No dependency changes. Existing Vite bundle-size advisory remains.
- Performance: no sculpting or meshing path changes; only a small JSON metadata object added at save/load. No new benchmark was warranted for this persistence update.
- Limitations: older files cannot recover colours they never stored. Colour edits are display preferences, not undoable voxel actions. Boolean Preview and both GLB exports remain neutral; Layer Colours applies to Separate Layers.
- Phase 1.11 must retain optional display metadata while keeping shape preview state excluded from native files.


## LAN access and brush shortcut follow-up (2026-10-25)

- `vite.config.ts` explicitly binds `0.0.0.0:5173` and allows `bretts-macbook-pro.local`; watcher exclusions remain intact. Confirmed this Mac's LocalHostName is `Bretts-MacBook-Pro`. Open `http://bretts-macbook-pro.local:5173/` from a phone on the same LAN, with Node incoming firewall access if prompted. IP fallback works when local mDNS resolution is unavailable. No router/public hosting changes were made.
- `src/main.ts` adds B to return to the selected Add/Subtract/Smooth brush, stopping existing gestures, hiding the ghost and exiting layer transform mode. Text/numeric editing, modifiers and busy/modal states are respected. Selecting Sculpt also hides the ghost. `src/ui.ts` exposes Sculpt (B) and shortcut help; README documents LAN launch/testing.
- LAN HTTP exposed a secure-context restriction: `crypto.randomUUID` was unavailable and prevented startup. `src/layers.ts` now falls back to RFC 4122 v4 IDs using `crypto.getRandomValues` on such origins, retaining secure random IDs and unchanged file compatibility.
- Validation: build passed; **168 tests passed, zero failures**, including `tests/lan-ids.test.mjs` with randomUUID disabled. Real browser checks verified complete startup and the B shortcut from transform and shape modes at the hostname URL. No physical phone was available for end-to-end device testing. No meshing/storage path changes or new benchmark needed. Existing bundle-size advisory remains.


## Centra Sculpt branding and circular viewport tools follow-up (2026-10-25)

The product is now **Centra Sculpt**. The browser title, header/mark, footer, invalid-file wording and GLB download names use the new name. Existing `.form` extensions and binary magic are intentionally retained so all native files remain compatible. The source workspace/folder is unchanged.

The viewport has two circular overlay controls. **Sculpt tools** opens Brush / Boolean; per user clarification, Boolean means the procedural Add/Subtract shape stamping library, not the separate layer Boolean Preview display. Selecting Boolean opens/enables the shape ghost; Brush/B hides it and returns to sculpt mode. **Layer transforms** opens Move / Rotate / Scale and uses existing layer command/gizmo routing, stopping gestures and hiding/collapsing shape tools first. Locked/hidden layers disable that wheel; modal/busy states disable both. W/E/R and sidebar controls remain supported and synchronize the wheel state. Opening a wheel does not edit any voxel, layer transform or history.

`src/viewport-tools.ts` is a scene-independent DOM overlay with inline SVG icons, explicit aria-expanded/pressed states, focus return, arrow/Home/End navigation, Enter/Space activation, Escape and outside-click dismissal. Only one menu opens at once. Pointer events stay off the WebGL canvas. Existing `shape-ui.ts` gains an explicit setOpen API; main command handlers retain ownership. Per-frame wheel synchronization skips unchanged state. No native schema, SDF, mesher or history model changed.

The shell now has a compact header, clearer studio panels and contrasting green/ink circular menus. Desktop sidebars scroll internally; the header/footer remain visible. Phone layouts reserve enough viewport height for a complete menu; shape-library mode retains the sticky viewport. Browser testing at 390×844 confirmed a 224px menu entirely within the viewport and no horizontal overflow (page width=390). Original viewport sizing was restored afterward.

Changed: `index.html`, `src/ui.ts`, `src/style.css`, `src/main.ts`, `src/shape-ui.ts`, `src/project.ts`, new `src/viewport-tools.ts`, README and this handover. `tests/history-project.test.mjs` updates the precise invalid-file error assertion for the renamed app; validation coverage is unchanged. A source archive checkpoint is `outputs/before-centra-ui.tar.gz`.

Validation: strict TypeScript/Vite build passed; **168/168 tests passed**. Browser checks exercised Boolean opening the stamping panel, layer Rotate/Scale/Move selection, Brush/B restoration, keyboard radial selection and locked-layer disabling. Repeated menu actions retained 0 undo/0 redo and 31,536 triangles on the unedited test sphere. No sculpting benchmark rerun was needed for DOM/style/name changes; production bundle is ~692 kB JS minified with the existing bundle-size advisory. No new dependencies.

Known limits: radial tools select modes; drag manipulation continues through the existing gizmos. No ghost gizmo or new touch-camera gesture system was added. Phone verification used a browser viewport override, not physical hardware. Native files still use `.form`. Next phase should reuse the command/preview ownership boundary for future tool wheels and controller UI rather than manipulating SDF data from controls.


## Sculpt wheel Smooth follow-up (2026-10-25)

Added Smooth as a third circular Sculpt tools option beside Brush and Boolean, with a wave icon and synchronized sidebar selection. Smooth activates the existing smoothing brush, hides shape ghosts and exits layer transforms. Brush/B restores the most recent Add/Subtract choice from this session. Sidebar Smooth selection and saved Smooth settings also update the wheel caption/icon. No SDF smoothing algorithm changed. Files: `src/viewport-tools.ts`, `src/ui.ts`, `src/main.ts`. Build passed; all **168 tests passed**. Browser checks verified Smooth activation, hidden ghost, zero history changes on selection, and B restoring Subtract.


## Stamp ghost rotation / T follow-up (2026-10-25)

Implemented a separate Three.js rotation gizmo for shape previews. **T** toggles it, with visible buttons in the Shape Library and a new viewport quick toolbar. Rotation enables only for an editable visible ghost target and freezes pointer following. Applying a stamp is disabled during rotation mode. T finishes, leaving the preview pose fixed; the user can explicitly apply once or re-enable Follow pointer. Numeric angles and local/world pose controls remain available; local rings align with the ghost orientation, while numeric local coordinates remain relative to the layer. B/tool changes hide the ghost and detach the gizmo. Text-entry/modifier/repeat/busy guards protect shortcuts.

New `src/shape-rotation.ts` owns a scene-sibling world-space Group proxy and rotation-only TransformControls. It never attaches to layer geometry. World proxy edits inverse-convert through `ShapePreviewModel.setWorldTransform`, preserving target-local position/scale and independent layer data. InputOwnership adds a preview owner to block camera/sculpt/layer drags while a ring drag runs. Selection/visibility/lock/busy changes or cancellation release ownership and finish/detach controls safely. Proxy/helpers remain outside project/export roots. Rotation is session state, not source history; explicit later stamps use existing one-action history.

Changed: new `src/shape-rotation.ts`, `src/interaction.ts`, `src/shape-preview.ts`, `src/shape-ui.ts`, `src/main.ts`, `src/ui.ts`, `src/style.css`, `scripts/compile-core.mjs`, new `tests/ghost-rotation.test.mjs`, README and this handover. A pre-change source checkpoint is `outputs/before-ghost-rotation.tar.gz`. No new dependencies or file-format changes.

Validation: build passed; **173 tests passed, 0 failed** (168 previous + 5 new). Tests cover transformed parent/world-local conversion, unchanged native bytes/metadata/voxel arrays/chunk geometry/history, preview ownership/camera exclusion, locked/hidden/busy targets, target switching, local/world axes, reset/hide and subsequent one-action stamping/undo. Browser checks: T toggled rings; a real ring drag changed X to 4.912241° while keeping 31,536 triangles and 0/0 history; finishing and applying the rotated cutter changed 6,908 voxels in one action, and Undo restored the sculpture. The viewport shows ROTATING / STAMPING PAUSED and disabled Apply during rotation.

Performance: no SDF/meshing path changes or rebuilds during preview rotation. Proxy and gizmo allocated once; orientation uses matrices/metadata. Source benchmark was not rerun for this UI interaction change. Bundle is ~698 kB JS minified; existing Vite size advisory remains. Known limits: no ghost move/scale gizmo, VR or snapping controls. Rotation is not itself undoable source history; dimensions and numeric pose fields remain the precise controls. Physical touch-device gesture testing remains deferred. Next phase can reuse this proxy/ownership boundary for preview translation/uniform scaling rather than attaching controls to layer meshes.


## Held-preview movement / G follow-up (2026-10-25)

Resolved the unintuitive numeric-only placement when surface following is off. Added **Move preview (G)** in the Shape Library and **Move G** in the viewport quick toolbar. Drag standard Three.js translation arrows/plane handles, then G to finish and enable Apply. T switches to ghost rotation; G switches back to movement. Surface following stays off so the held position does not jump. Numeric XYZ fields remain precise placement controls. Toolbar/status feedback explicitly says Preview held / G to move. The mobile toolbar wraps for the extra button.

The existing preview proxy now supports translation and rotation, mutually exclusively, while retaining the `ShapeRotationTool` name/file for compatibility. `ShapePreviewModel.moveMode` and `manipulating` keep canvas stamping, Apply buttons, camera ownership and pointer-follow guards consistent across both modes. Translation inverse-converts world proxy poses to target-local coordinates, preserving orientation/uniform scale and independent layer data. Hidden/locked/busy targets and hiding/import/reset clear/release movement safely. No source geometry, voxel data, layer transform or history changes until explicit Apply. Existing Add bounds constraints remain; no automatic resampling/clipping.

Files: `src/shape-preview.ts`, `src/shape-rotation.ts`, `src/main.ts`, `src/shape-ui.ts`, `src/ui.ts`, `src/style.css`, new `tests/ghost-move.test.mjs`, README and this handover. Build passed; **177/177 tests passed** (173 prior + 4 new). Tests cover mode switching/follow freeze, transformed layer world/local movement without changing rotation/scale/native bytes/history/chunk identities, locks/hiding/reset and a moved+rotated stamp remaining one undo action. Browser: with Follow Pointer off, an arrow drag moved X from 1.05 to 0.689773 with 31,536 triangles and 0/0 history unchanged; G finished and re-enabled Apply. No new dependencies or source meshing changes; no benchmark rerun needed. Preview translation is not a sculpting deformation tool or a layer transform.


## Default Move for manual stamp placement follow-up (2026-10-25)

Follow Pointer off now automatically activates preview Move handles; enabling a previously held ghost does the same. Finishing T rotation returns to Move. Numeric position edits also enter manual Move, while preserving an explicitly active rotation tool. G can still optionally hide/show handles; Apply no longer requires leaving idle Move mode. Camera/sculpt/stamp exclusion remains active during a drag, and canvas clicks with Move active never create stamps. Apply is an explicit UI action and is enabled for idle Move, disabled during actual dragging, rotation, busy operations or hidden/locked/invalid targets.

`ShapePreviewModel.setEnabled`, `setSurfaceFollow` and `canApply` centralize this policy. Preview drag state updates Apply buttons immediately. Re-enabling Follow clears gizmo modes. `ShapeRotationTool` still edits only its preview proxy; no source layer transform, voxel/resampling or history behavior changed. Files: `src/shape-preview.ts`, `src/shape-rotation.ts`, `src/shape-ui.ts`, `src/main.ts`, two preview test files, README and this handover. Existing tests were updated to assert the intentionally changed return-to-Move behavior; no coverage was removed. Build passed and **178/178 tests passed**, including a new manual-placement/Apply gating test. No meshing benchmark was needed for this interaction policy change.


## Rendering styles follow-up (2026-10-25)

Added Normal, Glossy and Wireframe rendering styles, independent of Clay/Layer Colours. A lower-right viewport button cycles them; the Layers panel also offers a named selector. Normal preserves the previous clay material/light setup. Glossy uses low roughness (.14), slight metalness (.12), a lazily generated/cached RoomEnvironment PMREM studio reflection texture and ACES tone mapping/exposure .9 to avoid blown highlights. Normal/Wireframe restore the original tone mapping and clear the scene environment. Wireframe darkens display colours for contrast without modifying stored layer colours.

New `src/render-style.ts` defines validated styles and applies material properties. `IndependentLayers` retains its neutral export material and now owns a separate composite display material. `BooleanComposite` accepts an optional export material so Boolean rendering can be glossy/wireframe while GLB remains neutral and solid. Existing separate-layer exports already use the unchanged neutral material. Source voxel buffers, mesh geometries/normals, chunk rebuild state and undo are untouched by style changes. The ghost/helper objects remain separate from exports.

Optional `displayPreferences.renderStyle` persists non-default styles in native v3. Absent values restore Normal; invalid enums reject import/save. Normal snapshots omit the field, preserving prior normal project metadata. Colour and style preferences remain display data, not SDF content.

Changed: new `src/render-style.ts`, `src/display-preferences.ts`, `src/independent-layers.ts`, `src/compositor.ts`, `src/main.ts`, `src/ui.ts`, `src/style.css`, `scripts/compile-core.mjs`, new `tests/render-style.test.mjs`, README and this handover. No dependency changes.

Validation: TypeScript/Vite build passed; **181/181 tests passed**, including 3 new tests for no voxel/geometry/history/remesh changes, preservation of display colours, styled Boolean cache reuse without recomposition, neutral solid separate/Boolean export materials, optional style save/load/defaults and invalid values. Browser cycling verified all three styles on the LAN hostname; source triangles and history remained unchanged. Screenshots are under `outputs/centra-normal.png`, `centra-glossy.png`, `centra-wireframe.png`.

Performance/limits: style changes update existing materials; no source-meshing benchmark was warranted. First Glossy use can briefly pause for PMREM generation/shader compilation; its environment is reused thereafter. GPU FPS/thermal behavior and physical-phone performance were not measured. Wireframe can be visually dense at high resolutions. Production JS is approximately 711 kB; existing Vite bundle advisory remains. Future useful inspection modes could include matcap or curvature/cavity shading; these were not implemented in this update.


## Normal / Matte / Glossy and I shortcut follow-up (2026-10-25)

Retired Wireframe from the UI/cycle. The three modes are now **Normal → Matte → Glossy**. Normal and Glossy material/light/tone settings are unchanged. Matte uses roughness .4, metalness .06 and environment intensity .45 for softer/broader studio reflections between the endpoints; it shares the cached environment and ACES exposure .9 with Glossy. All materials remain solid. The I shortcut uses the same cycle handler as the viewport button and respects field/modifier/repeat/busy/modal guards. The button displays an I hint and the Layers selector lists only current modes.

Legacy native display metadata containing `wireframe` is mapped to `normal` during validation; voxel data, layer colours and the rest of the project remain intact. Other invalid style values still reject. Exports remain neutral solid clay. No meshing/storage/history changes.

Files: `src/render-style.ts`, `src/display-preferences.ts`, `src/independent-layers.ts`, `src/main.ts`, `src/ui.ts`, `tests/render-style.test.mjs`, README and this handover. Build passed; **182/182 tests passed**. Style tests now cover Matte's material values, colour preservation, no geometry/voxel/history change, Boolean cache reuse/export materials, Matte save/load, plus a real legacy-file Wireframe metadata migration. Browser I presses verified Matte → Glossy → Normal and back to Matte with 0 undo/redo and source triangle count unchanged. No new benchmark needed for the preset/shortcut change; physical-device GPU costs remain unmeasured.
