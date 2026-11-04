# Development Status — Centra Sculpt / vrappPOC

## Phase 6.1 handover — Measurement & Precision Transforms

Updated 2026-11-04. Active repository `/Users/brettjames/development/vrappPOC`. Reviewed this status, Phase 6.0 Cut/thumbnail handover, controller-guide profiles, Studio Skybox and `docs/TESTING.md` before changes. Initial HEAD was `5a067e6` with existing uncommitted Skybox work; that work became commit `126312a` during this task and was preserved. Implementation and validation were initially left uncommitted. The user subsequently authorized committing and pushing Phase 6.1 on 2026-11-04. No merge or reset was performed. Quest 3 calibrated controller-guide profiles/offsets and Studio Skybox implementation are untouched.

### 1. What changed

Added **World Settings → Measure & Precision**, alongside Guides on the existing readable VR menu, plus a compact desktop disclosure. Cut remains the tenth radial Tool Wheel entry; no wheel sector or footer was repurposed. Tool-trigger surface taps place two-point distances or three-point angles (point 2 is the vertex). Desktop clicks use the same picker. Lines, endpoint markers and camera-facing unit labels are display-only. Pick visible sculpt meshes, the visible Boolean result, or placed STL references, including locked references; image panels do not intercept measurement. Review/remove annotations, choose another annotation in VR, or reposition an individual endpoint. Stop measuring or choose another tool to return trigger ownership to sculpting. Desktop Escape stops measuring.

Numeric controls edit selected layers/groups: model-space XYZ position in the selected physical units, Euler XYZ rotation in degrees, uniform scale, or proportional target width/height/depth. Desktop fields support Enter, Tab/change and Escape; VR uses an in-menu numeric keypad with backspace, Apply and Cancel. Selected dimensions are model-axis-aligned rendered bounds, including descendants for groups. Optional position grid steps are Off (default), 0.1, 1 and 5 mm; angle increments accept 0–180 degrees, with zero Off. Numeric entries remain exact and are not rounded to the movement grid.

STL retains the existing default 100 mm target-longest-dimension workflow. An explicit **Use project physical scale for this export scope** checkbox opts into calibration-based sizing for current-layer, visible-layers or Boolean exports. Target entry is disabled while opted in. A selected-layer shortcut copies its physical longest dimension into the traditional target box. The print report states calibrated scope size, sizing mode, applied ratio and final physical dimensions. Exported geometry/report validation and print warnings remain in force.

### 2. Architectural decisions

`physical-units.ts` defines calibration as millimetres per model coordinate unit, separate from tracking, workspace, viewing and turntable matrices. New projects and legacy projects without precision metadata use **100 mm/model unit**, millimetre display and free movement. This assigns an explicit physical interpretation without rescaling any legacy geometry, transforms, references, lattice data or STL defaults. Changing calibration changes interpretation only. Centimetres and inches use factors 10 and 25.4 mm. Annotations store up to 64 bounded, finite two/three-point records with unique IDs in model coordinates.

`PrecisionTools` owns measurement state and resources. Picking occurs only on an endpoint tap, not every frame. It removes the complete model-root world matrix from hit coordinates, including workspace navigation and turntable pose. STL reference picking deliberately invokes standard Mesh raycasting on the existing normalized/placed mesh without enabling its editing picker. Annotation graphics are siblings of the source root so Boolean preview cannot hide them; their local pose follows that root. They are excluded from source surfaces, Boolean composition, thumbnails, STL and GLB. Unchanged frame sync performs identity/parent checks and pose copies, without raycasts, bounds scans, geometry/texture rebuilds or SDF work. Editing annotations rebuilds and disposes their display resources.

Numeric edits use existing `setActiveTransform` transactions and hierarchy world-to-parent conversion. Group parenting, inherited locks, positive uniform scale validation, cancellation and sculpt Undo/Redo stay authoritative. Gizmo world/local controls retain their movement semantics; physical grid quantization applies to saved model-axis coordinates, without including workspace translations/scales. Desktop translation and rotation snapping leave the other component unchanged. XR grip transforms can snap both components. Calibration/unit/snap settings and annotation edits use display metadata and never add SDF history entries. Annotation removal itself does not enter sculpt Undo/Redo.

Optional `display.precision` goes through strict display validation, native save/load, immutable snapshots and the actual recovery worker. No native-version bump or geometry migration. Invalid units, nonfinite/range-invalid numbers, duplicate IDs, malformed points and excessive annotation counts reject. Older readers may drop unknown precision metadata on resave. STL input bounds are measured from the chosen source scope and saved source transforms, never renderer navigation matrices; the existing STL encoder still sizes to an explicit target.

### 3. Build and test results

Baseline `npm run check` passed formatting, Biome lint (546 warnings / 95 infos, zero errors), strict TypeScript, production build and **1,354/1,354 tests**, test wall time **32.31 s**. Final `npm run check` passed: Biome format/lint (**547 warnings / 95 infos**, zero errors), strict TypeScript, production build (**1.77 s**) and **1,372/1,372 tests across 84 files**, zero failures/skips/cancellations. Full test-command wall time **33.94 s**. The existing Vite bundle-size advisory remains (main bundle about 1.386 MB, 391 kB gzip). `git diff --check` passed. Final log: `work/phase-6-1/check.log`; baseline log: `work/phase-6-1/baseline.log`. Focused measurement/transform validation passed **38/38** before the final full run.

Added 17 measurement/precision tests plus one desktop-snapping regression. They cover numerical conversions, finite validation, distance/angle math, hidden surfaces, full navigation removal, disabled STL-reference raycasts, annotation edits without geometry/history changes, nested groups, exact numeric placement/rotation, dimensions, locking, metadata Undo/Redo, snap calculations, worker recovery/native/legacy persistence, calibrated and override STL sizing, both logical hands and both actual controller bridge layouts, trigger ownership/rearming, aiming-ray visibility, bounded/disjoint keypad targets and Boolean-preview annotation visibility/resource reuse. The existing turntable test now checks runtime-angle exclusion specifically in turntable metadata; precision legitimately persists an angle increment.

Desktop browser inspection verified 50 mm and 100 mm proportional sizing via keyboard, a visible 42.897 mm annotation on a 100 mm sphere, retained model/grid/Cut controls, and no warning/error console logs. Calibrated STL export reported **100.000 × 100.000 × 100.000 mm**, **1.000000×** project scale, 31,536 triangles, one connected surface and zero open/non-manifold/winding/degenerate/inward counts on that fixture. Existing unsupported print checks remain explicit. Screenshot: `work/phase-6-1/desktop-measurement.jpg`. Browser checks used isolated localhost port 5189; existing recovery was neither restored nor discarded. Physical Quest acceptance is pending.

### 4. Benchmarks and regressions

Reproducible host command: `node scripts/benchmark-precision.mjs`; results: `outputs/phase-6-1/benchmark.json`. Single Mac Node v26.8.1 run, 50 event-triggered picks/bounds scans per sphere, 32 accumulating annotation-pair placements and 10,000 unchanged sync calls:

| Host fixture | Raycast median / p95 | Bounds median / p95 | Annotation pair median / p95 |
| --- | --- | --- | --- |
| 64³ | 0.249 / 1.009 ms | 0.642 / 1.158 ms | 0.553 / 1.272 ms |
| 128³ | 0.128 / 0.236 ms | 2.691 / 3.737 ms | 0.406 / 0.731 ms |

Both fixtures retained 32 annotations with **zero sculpt-history change**. Unchanged sync median was approximately 0.000042 ms; timer resolution/JIT/load make these micro-timings descriptive only. Annotation timings exclude browser canvas labels/GPU rendering. Smaller 128³ raycast times are an observation, not a scaling/performance claim. Annotation resources are bounded (one line and label per annotation, one shared endpoint point cloud); unchanged frames reuse them. Dense SDF storage, incremental meshing, worker scheduling and remeshing budgets are unchanged. No Quest CPU/GPU/frame-time or sustained-session measurement has been made.

### 5. Known limitations and blockers

Physical Quest 3/Touch Plus/Quest Browser usability, stereo label legibility and frame-time acceptance remain pending. Measurements use displayed triangle surfaces, not sub-voxel analytic SDF intersections. They are fixed model-space annotations, not associative constraints: later sculpt/layer/reference transforms do not move stored endpoints. Reposition explicitly after changing the model. Three-point angles reject coincident arms with visible undefined-angle feedback; there is no automatic edge/face inference.

Dimensions are model-axis-aligned bounds; resizing one dimension changes all axes proportionally. Group bounds include all descendant geometry; export scope continues to determine the actual visible/current/Boolean source set. Calibration starts at an explicit 100 mm/unit convention; it does not infer historical intended print size or an STL reference’s original source-file units (references already normalize on import). Live movement grid snapping uses model axes; face/surface snapping is deferred. The existing 0.1–10,000 mm STL target admission limit still applies to calibration-based exports. No physical acceptance claim or implementation blocker remains.

### 6. Next recommendations

- [ ] On Quest 3 in both handedness settings, open World Settings → Measure & Precision, release the menu, place distance and angle points on sculpt/Boolean/STL-reference surfaces, then reposition/remove annotations. Confirm a visible aiming ray, readable labels and no accidental Clay/Paint/Mask strokes.
- [ ] Enter numeric position/rotation/scale and target dimensions on nested groups/layers; verify inherited locks and Undo/Redo. Compare Off/0.1/1/5 mm and custom angle steps while moving and rotating. Navigate/scale/rotate the workspace and run the turntable; verify physical values remain unchanged.
- [ ] Save, reopen and recover measurements/calibration; repeat in Studio/Passthrough, through tracking loss, hand swaps and session re-entry. Verify calibrated support-guide clearance and existing Cut, Paint, Mask, references, Skybox and Tool Wheel behavior.
- [ ] Export a known-size part with project physical scale and with an explicit target override; compare the printed report and slicer dimensions. Record Quest/browser versions, stereo readability, frame timing and a sustained session before release acceptance.

---


## Studio Skybox and Horizon handover

Updated 2026-11-04. Active repository `/Users/brettjames/development/vrappPOC`, baseline `5a067e6`; working tree was clean before this task. Read the latest handover and world/display persistence, renderer/session compositing, desktop/XR controls, ground grid, lighting, turntable, references and thumbnail paths before implementation. No commit, push or merge authorized or performed. Quest 3 support-guide profile/calibration and its fixtures are untouched.

### 1. What changed

Added **World Settings → Studio Background → Skybox** in XR and a matching desktop disclosure with Skybox and preset controls. Following the user’s default refinement, it defaults On with Neutral Grey, saves with the project and recovers through the existing display snapshot path. On gives Studio a subdued neutral-grey upper sky hemisphere, a readable level horizon with narrow haze, and a lower hemisphere tinted by the selected background preset. The horizon is world-horizontal, not a fixed division of screen pixels: looking down can put it above the viewport. Off fills both desktop and VR Studio with the selected background preset. `WHATS_NEW.md` has a concise dated entry.

### 2. Architectural decisions

`StudioSkybox` owns one clip-space triangle and an unlit procedural shader, attached directly to the scene, outside tracking/workspace/sculpture/turntable roots. Each eye's `onBeforeRender` copies its inverse projection and world matrix into reused uniforms. Only the rotation part maps viewing rays to world directions; elevation uses world Y. Head pitch/roll/yaw change which part of the sky is seen, never its gravity orientation; viewer translations, workspace grabs and turntable rotation do not move the horizon. Clip-space placement, disabled culling/depth tests/depth writes, opaque-first render order and sRGB output conversion keep it behind models, references, grids and menus regardless of near/far distances. No enclosing sphere, finite floor disk, seam around the azimuth, textures, environment lighting or shadow changes.

Preset colours apply immediately to both desktop and VR Studio with Skybox Off. A reusable scene background colour replaces the earlier XR-only update guard, which had left the desktop picker ineffective without the sky shader. The latest preset also returns immediately after XR exit, including changes made during Studio or Passthrough. With it On, the preset supplies the lower colour; a small haze blend near the horizon joins it continuously to the fixed subtle upper gradient. The XR ground-grid toggle remains independent and retains its existing workspace-local placement, spacing, opacity and navigation behavior. Desktop retains its existing grid. Neither grid is replaced by a floor surface. The model and existing guides provide scale; the infinite horizon supplies orientation.

`XRSceneRig` suppresses the mesh on entry to Passthrough and on every settings update during that session, including saved-On projects; background stays null and the existing Three alpha-blend clear path is unchanged. Desktop preview resumes after XR exit. Session entry/exit reuses the same GPU resources; `rig.dispose()` disposes/removes them. Scene/model replacement does not reconstruct the rig. Thumbnail capture still creates its own scene from layer surfaces only. References remain separately imported display assets, with no sky capture/baking. Bounds, raycasts, SDF, Boolean meshing, export sources, lighting, tool preferences and sculpt history receive no sky objects or state.

The optional boolean `world.skybox` extends existing world version 1 display metadata, with absent meaning true. New projects explicitly start On; legacy missing fields normalize to On while retaining any saved background preset. A wholly default On world remains omitted; an explicit Off always serializes world metadata and survives both native save and recovery. Malformed present values are rejected. No native version bump: older native metadata remains readable; older readers that ignore unknown world fields retain the sculpture and existing display fields but can drop the skybox choice on resave.

### 3. Build and test results

`npm run check` passed: Biome formatting/lint (**546 warnings / 95 infos**, zero errors), strict TypeScript, production build and **1,354/1,354 tests across 83 files**, zero failures/skips/cancellations. Full test command wall time **29.92 s**; production Vite build **1.59 s**. Existing bundle-size advisory remains. Focused World Settings tests passed **19/19**, including updated On defaults, neutral-grey colours, first-click toggle behavior with a missing legacy field, explicit Off persistence and legacy fallback. Quick tests previously passed **21/21**; all final tests are included in the full passing check. `git diff --check` passed.

Five new World Settings tests cover desktop and XR toggle behavior/busy state, both default On and explicit Off native/recovery serialization, legacy On reset and unchanged native version, world-ray reconstruction through yaw/pitch/roll and translation, all six presets with grid and skybox On/Off, real installed Three clear-alpha behavior, repeated Studio/Passthrough transitions, resource identity and disposal. Existing persistence/export/session tests were extended with Skybox On, including byte-identical GLB and STL output, unchanged SDF/native source/history and layout hit targets. A sixth new test verifies visible skybox exclusion from thumbnail rendering. A seventh regression covers all six desktop presets with Skybox Off, reused background colour identity, On/Off changes, Studio/AR round trips and preset changes during XR reflected immediately on exit. Focused World Settings plus WebXR suites pass **40/40**. Existing calibrated Quest guide, lighting, turntable, reference and staged remeshing regression suites pass.

Browser inspection on isolated localhost ports verified the desktop toggle, a level side-view horizon, neutral-grey and black lower colours, visible model/grid and no warning/error logs. A fresh preview after the refinement confirmed Skybox checked On, Neutral Grey selected, a grey upper gradient and sky-only background when looking upward. Preview evidence: `work/studio-skybox/desktop-on.png`; full validation log: `work/studio-skybox/check.log`. These are local ignored artifacts, not committed assets.

### 4. Benchmarks and regressions

One additional triangle/draw per rendered eye when On; no sky draw when Off or in Passthrough. No sky textures, texture repaint, frame resource allocation or SDF/remeshing work. Two preallocated matrices are copied per eye; ground colour updates only when the preset changes. Tests exercise 24 preference combinations through 48 Studio/AR entries, confirming the same mesh/geometry/material/uniforms, a single scene attachment and exactly one geometry/material disposal. This is host lifecycle evidence, not physical GPU leak or Quest frame-time measurement. No workload, mesh quality, scheduling or timeout was reduced.

### 5. Known limitations and blockers

Physical Quest acceptance and GPU/frame-time measurements remain pending. The desktop solid-colour follow-up is covered by host regressions; its fresh browser recheck is pending because the local preview server could not bind its port (`EPERM`). Automated tests validate camera-ray math, visibility, clear alpha and lifecycle; browser visual inspection is desktop, not a stereo headset acceptance claim. The horizon is infinitely distant and intentionally provides no parallax or metric floor. Upper-sky colours are fixed; presets tint only the lower hemisphere. The existing XR workspace grid can rotate with workspace navigation; the sky horizon stays gravity-level independently. No implementation blocker remains.

### 6. Next recommendations

- [ ] On Quest 3, compare Skybox Off/On in all six Studio presets; look up/down, pitch, roll and turn fully around. Confirm a comfortable world-level horizon without clipping, stereo mismatch, bright glare or visible azimuth seam.
- [ ] Toggle ground grid independently; sculpt, paint, inspect references/lights and run/rotate the turntable. Grab/rotate/scale/reset the workspace and check stable horizon, model/grid contrast, menus and calibrated Support guide clearance.
- [ ] Save/reopen/recover with Skybox On; switch Studio → Passthrough → Studio, exit/re-enter repeatedly, lose/regain tracking and hide/resume the session. Verify no sky or opaque pixels in Passthrough and the saved choice returns in Studio.
- [ ] Compare representative large-scene frame timing and GPU resource counts Off/On and through repeated session transitions. Record headset/browser versions and captures before claiming hardware acceptance.

---


## Controller guide profiles handover

Updated 2026-11-04. Small presentation-only refactor, based on latest commit `5dfd219`. Inspected Git status, guide/bridge/input code and this handover before editing; the active repository `/Users/brettjames/development/vrappPOC` was clean. No reset or normalization of the accepted calibration. User authorized committing and pushing this refactor on 2026-11-04.

### 1. What changed

Preserved the current Quest 3 support-guide calibration as a strongly typed, deeply frozen `QUEST_3_SUPPORT_GUIDE_PROFILE` in `src/xr-support-guide-profiles.ts`. The named frozen `QUEST_3_SUPPORT_GUIDE_LAYOUT` preserves the static texture measurements. Added deterministic source selection, a compatibility generic fallback, an uncalibrated Steam Frame slot, and a code-level override. No `WHATS_NEW.md` entry: this is a behind-the-scenes change, as requested by the user. There is no new user-facing setting.

### 2. Architectural decisions

Both hands retain **exactly** grip-local `[0.005, -0.0043, -0.0207]` metres and the original X-axis rotation expression `(-(90 + 37.2) * Math.PI) / 180`, with no mirroring, normalization, rounding, billboarding or orientation lag. Plane size remains 0.11 × 0.11 m, texture 512², centre `[256, 256]`, tip/opening/separator 224/100/32 px, glyph centres 92/420 on the original axes. Glyph paths, styles and canvas drawing operations remain unchanged. Shared UI scales remain 1.25/1.35; the profile multiplier is 1. Face clearance remains scaled half-diagonal + 0.18 m, with 0.04 m reappearance margin. Grip anchoring and wrist orientation remain unchanged; there are no other hand-specific offsets or positioning heuristics in this guide.

Auto selection uses only the existing source's exact `meta-quest-touch-plus` profile ID. This identifies the controller profile, not a reliably detected Quest 3 headset. Older Touch IDs, missing sources and unknown controllers use `generic`, which deliberately preserves the previous pose without claiming calibrated fit. Existing gamepad mapping and axes establish input compatibility, not face geometry; no UA, button-count or Steam Frame identity guesses were added. The guide resolves the current logical Support state's source on update, so source replacement and dominance/session changes cannot latch another controller's profile. Existing bridge hide/tracking behavior is retained.

Call `supportGuide.setProfileOverride("quest-3" | "generic" | "steam-frame" | "auto")` from code to test/configure; `activeProfile.id` reports the effective profile. Overrides hide immediately and survive tracking/session re-entry until changed. `steam-frame` currently falls back to generic because `STEAM_FRAME_SUPPORT_GUIDE_PROFILE` is explicitly null. To calibrate later, populate that slot with an independently measured, frozen `SupportGuideProfile`, including separate left/right poses and physical scale; select it explicitly until reliable source identification is established. Do not change the Quest baseline. Mutable `offset`/`orientationOffset` copies remain available for development tuning; profile/hand changes reload those copies from immutable data.

### 3. Build and test results

`npm run check` passed: Biome format, lint (**547 warnings / 95 infos**, zero errors), strict TypeScript, production build, and **1,347/1,347 tests** across 83 files, zero failures/skips/cancellations; test command wall time **28.37 s**. Existing Vite bundle-size advisory remains. Focused guide tests passed **16/16** and quick tests **21/21**. `git diff --check` passed. Registered the new module in the existing test compiler list.

New deterministic tests freeze-check every baseline pose/layout value and assert exact pre-refactor position, quaternion components and scale for both hands, varied wrist rotations and both UI sizes. Clearance/reappearance boundaries, exact source selection, fallback, override/reset, live source change and resource reuse are covered. Actual bridge tests verify selection uses the Support source through both dominance layouts, disconnect/reconnect, visibility loss and repeated XR entry. Existing texture, measured GLB face alignment, noninteractive raycast, input/menu/history and persistence tests pass unchanged in behavior.

### 4. Benchmarks and regressions

No new draw calls, geometry, textures, repaint or frame objects. Indexed source-profile lookup returns existing frozen records; pose updates reuse vectors/quaternions. Resource identity and unchanged texture version are tested. Input mapping, glyphs, menu behavior, controller ownership and workspace transforms were not changed. No new physical GPU/frame-time benchmark was performed; suite duration is not a performance claim.

### 5. Known limitations and blockers

Exact host pose/texture regression checks preserve the accepted Quest calibration; no new physical headset acceptance was performed. Generic is compatibility behavior, not validated placement on other hardware. Steam Frame has no measurements or automatic match. Texture layout is intentionally shared and static; profiles configure pose, physical scale and clearance, not glyph drawing. Existing broader physical acceptance checklist below remains applicable.

### 6. Next recommendations

Keep the Quest baseline intact. When Steam Frame hardware is available, measure both support-hand layouts in grip space, fill the independent profile slot and test with the explicit override before adding any verified automatic source ID. Confirm physical fit/readability and lifecycle on hardware, then record measurements and captures separately.

---


## Phase 6.0.3 handover — Support Controller Shortcut Guide

Updated 2026-11-04. Host implementation complete; user accepted the final controller-guide positioning and appearance after headset iteration. Remaining Quest lifecycle/performance acceptance is pending. Active repository: `/Users/brettjames/development/vrappPOC`, baseline `d28c399`. Working tree was clean before this milestone. Read current handovers and latest Git changes, including Biome/test infrastructure and the newer desktop/tube work. User explicitly authorized committing and pushing this milestone on 2026-11-04.

### 1. What changed

Added an always-on, noninteractive guide on the logical Support controller. Following the supplied Medium reference, the final design has four compact arrow tabs separated by narrow transparent diagonal cuts around a circular transparent opening centred over the controller face, with glyphs drawn directly on the arrows: left Undo, right Redo, up Tool Wheel, down Layers. There are no words, header, centre indicator or backing panel. Directions match `SUPPORT_STICK_BINDINGS`, the WebXR negative-Y-up recognizer, and the existing controller bridge. Glyphs are selected from those bindings. Menus remain hold-to-open; sculpting and grabs still suppress shortcut execution even though the guide remains visible. World Settings → Preferences has a Support shortcut guide toggle, saved as optional project display metadata. Absent metadata defaults to On. VR UI Size applies immediately. `WHATS_NEW.md` has the dated user-facing entry.

### 2. Architectural decisions

`XRSupportGuide` owns one 0.11 × 0.11 m plane, one unlit material and one static 512² sRGB canvas texture. Arrows and shortcut glyphs use canvas paths, with no font dependency. Arrow tabs use faint neutral grey at 38% opacity, with charcoal glyphs at 85% opacity and no outlines or accent colour. The arrow backing is drawn once with an even-odd circular cutout, leaving a true transparent round centre without overlapping alpha seams. Two 32 px diagonal destination-out strokes create four transparent gaps between adjacent tabs before glyphs are painted; normal compositing is restored immediately. These are visual divisions only, not new buttons or hit targets. Following the latest headset capture, the glyph ring radius increases from 126 to 164 canvas pixels (+30%) so icon edges clear the controller. Arrow tip radius decreases from 240 to 224 pixels (−6.7% overall visible span); the tip beyond each glyph shrinks from 114 to 60 pixels (−47%). The circular inner opening has radius 100 px, tightened from 112 px (about 3.2 mm smaller at Default UI Size) so the backing extends beneath the black rim instead of leaving the crescent gap visible in the latest top-view capture. Glyph strokes retain their backing. The physical plane stays 0.11 m; angle and glyph size are unchanged. The circular centre and space outside the arrow tips remain transparent so the controller is visible. Depth testing and no depth writes allow nearer scene geometry and existing menus to occlude the guide. Raycast is a no-op; no hit targets or event handlers are added.

`XRControllers` receives the guide from `XRExperience` and polls it after existing tracking/role updates. The grip matrix and viewer pose share the controller tracking root; workspace navigation never transforms the guide. Quest Touch Plus grip-local offset is X +0.005 m, Y −0.0043 m, Z −0.0207 m for either hand. The guide is tilted **−127.2° around local X** (the plane-to-grip −90° plus the actual face tilt of −37.2°). Its normal is approximately (0, 0.79653, −0.60460). User headset captures showed that a translation-only correction still intersected the sloped face. The exact left/right GLBs from the app's configured WebXR profile CDN were inspected: primary-button neutral/pressed travel gives the face normal, and the dominant body top-face vertex cluster gives its centre and rim. The guide sits approximately 9 mm inward along that normal, parallel to the face, rather than through it. The accumulated alignment is 9 mm inward along the face normal and 5 mm to controller-local right (+X), applied consistently to both support-hand layouts. The final refinement widens transparent separators from 18 to 32 logical pixels, as requested; the latest placement adjustment adds another 2 mm down along the face normal and 2 mm right, totalling 9 mm inset and 5 mm right. Measurement samples, derivation and source hashes are retained in `tests/fixtures/quest-touch-plus-face.json`; downloaded GLBs remain outside the repository. Both hands agree on the tilt and calibrated inset centre plus rightward adjustment within 0.2 mm. Public `offset` and `orientationOffset` allow tuning without changing controller transforms. Position and orientation follow the tracked grip exactly, including wrist roll; no viewer billboarding or orientation lag is added. Existing Default/Large UI scales (1.25/1.35) affect the plane, not its anchor.

Tracking/source loss, missing stick mapping, missing viewer pose, hidden XR session, hand swapping and XR exit hide immediately; re-entry reuses the same resources. A conservative face-clearance sphere uses the scaled guide half-diagonal plus 18 cm, with an extra 4 cm reappearance margin to prevent flicker. This is presentational only: input polling, rays, commands, history and grip/workspace ownership are unchanged. The project toggle uses the existing display snapshot/validation/save path and does not add sculpt history.

### 3. Build and test results

Baseline `npm run check` passed formatting, lint, strict TypeScript, production build and **1,331/1,331 tests** across 82 files (43.20 s test command wall time). This measured count supersedes the older 1,322 count in Phase 6.0.2. Baseline Biome: 547 warnings and 95 infos, zero errors.

Final lower/right placement revision `npm run check` passed formatting, lint (unchanged **547 warnings / 95 infos**, zero errors), strict TypeScript, production build and **1,342/1,342 tests** across 83 files, with zero failures/skips/cancellations (43.70 s test command wall time). Focused guide tests passed **11/11**; quick tests passed **21/21**. Existing Vite bundle-size advisory remains. `git diff --check` passed. Both-hand assertions verify the 9 mm face inset plus total 5 mm controller-local right offset. Texture checks verify exact 32 px transparent separators, circular cutout and restored glyph compositing. Existing coverage retains tracking/session lifecycle, dominance, scaling, menu/grab isolation, native persistence, unchanged SDF/history and resource disposal. Updated real canvas preview inspected at `outputs/phase-6-0-3/support-guide.png`; user accepted the final placement and appearance on 2026-11-04; broader physical checks remain pending.

### 4. Benchmarks and regressions

One extra draw call and two triangles when visible. The texture plus mip chain is approximately **1.333 MiB RGBA**, versus approximately 21.33 MiB for each recent 2048² menu texture. No additional menu canvas is spawned. Guide frame updates reuse vectors, the mesh quaternion, geometry, material and texture; no frame repaint or new resource allocation. Host tests verify resource identity and texture version across 500 updates/repeated hide/show, and exactly one disposal per resource. These are resource lifecycle checks, not physical GPU leak or Quest frame-time measurements. Existing shortcut/interaction suites continue to verify actual axis signs, grip precedence and history behavior; no workload or timeout was reduced.

### 5. Known limitations and blockers

The user supplied physical Quest captures showing the original anchor was too high/forward and the translation-only correction still intersected the face. The current tilt/centre are calibrated against both actual Quest Touch Plus assets. The user accepted the final guide placement and appearance after these iterations. Both-layout/environment coverage, readability/comfort across viewing conditions, wider interaction clearance and GPU/frame cost still need verification. The guide uses scene depth to respect nearer virtual surfaces; it can be partially hidden by the sculpture, intentionally. There is no scene traversal or automatic avoidance for distant sculpture, controller rays or menus: compact controller-centred placement, existing menu overlay order and depth testing limit overlap, but practical clearance needs the checklist below. No claim of hardware acceptance or complete GPU leak freedom. Offset/orientation tuning is code-level; only visibility and UI size are user settings. The toggle persists per project, not globally across unrelated projects. Geometry calibration targets the Quest Touch Plus model; other controller profiles retain the guide but their face fit is unverified.

### 6. Next recommendations — physical Quest acceptance checklist (remaining checks)

- [ ] Test Right Tool / Left Support and Left Tool / Right Support in **both Studio and Passthrough**. Confirm only the logical Support controller has a guide, including live dominance changes, and Minimal/Simple/Realistic controller modes and hidden diagnostics/hints do not suppress it.
- [ ] At natural arm distance, verify the tighter circular opening reaches just beneath the black rim with no crescent gap, and all four transparent separators remain clear without new borders; check all four glyphs around the rim, the shorter tips stay unobtrusive, and the guide remains parallel to and just below the controller top through wrist tilt and side views, with legible glyphs on all four faint borderless arrows, open controller centre and no words or card with Default and Large UI Size. Check bright-room Passthrough and neutral-grey Studio contrast, wrist roll/turning, controller-locked alignment and controller-model clearance.
- [ ] Verify left Undo / right Redo once per centred excursion; hold Up Tool Wheel / Down Layers and release to dismiss. Check existing sculpt, alternate-tool, layer grab and two-hand workspace ownership/history remain unchanged while the guide stays visible.
- [ ] Inspect offset clearance against support/tool rays, controller geometry, sculpture, grabbed/rotated/scaled workspace, Tool Wheel, Layers and World menus. Confirm menu selection rays pass through the guide and nearer virtual objects occlude it without depth artifacts. Tune offset if required.
- [ ] Bring the controller guide near the face, then away: verify hide/reappear margin without flicker or stale placement. Lose tracking, disconnect/reconnect support, hide/resume XR, exit/re-enter several times and change Studio/Passthrough; check prompt hide and correct reattachment without duplicates.
- [ ] Toggle World Settings → Preferences → Support shortcut guide Off/On; save/reopen and recover the project. Confirm old/new projects default On, UI size remains correct and sculpt Undo/Redo is unaffected.
- [ ] Compare frame timing and renderer texture/geometry counts with guide On/Off in a representative large scene, then across repeated session entries/exits and environment changes. Verify counts plateau, no repaint churn and no perceptible overhead. Record headset/browser versions and captures before release acceptance.

---


## Phase 6.0.2 handover

Updated 2026-11-03. Desktop layer rotation now supports direct surface dragging with temporary axis constraints. The change uses the existing layer transform/history path; WebXR behavior is unchanged.

### 1. What changed

With Rotate active (E), clicking and dragging a visible layer surface starts free rotation without selecting a gizmo handle. Clicking another visible layer selects it and begins the drag on that layer. Hold R/F/V during the drag to constrain rotation to X/Y/Z; releasing returns to the free rotation or selected gizmo axis. Existing gizmo handles and World/Local space remain available. The sidebar help and Rotate tooltip show the shortcuts. `WHATS_NEW.md` has the dated user-facing entry.

### 2. Architectural decisions

Surface hits resolve to the layer ID already attached to each layer surface; Boolean view falls back to the current transform target. Rotation starts and finishes through `TransformControls` and the existing transactional `beginTransform` / `updateTransform` / `finishTransform` path, so SDF data remains untouched and one drag creates at most one metadata history action. R/F/V are hold-to-constrain keys; key release, focus loss and mode changes clear their temporary state. Axis shortcuts are active only in layer Rotate mode, so R continues to select Scale elsewhere.

### 3. Build and test results

Final `npm run check` passed after the change: formatting, lint, strict TypeScript, production build and **1,322/1,322 tests** (82 files; no failures, skips or cancellations). The focused `layer-transforms` suite passed **18/18**, including shortcut mapping, dynamic constraint return, direct handle-free rotation, layer selection, and one-action history. Biome warnings and the existing bundle-size advisory are unchanged.

### 4. Benchmarks and regressions

This is a pointer interaction and metadata-only transform change; it adds no surface sampling, remeshing, or asset work. Existing transform tests continue to verify exact history and unchanged SDF buffers. No rotation workload or timeout was shortened.

### 5. Known limitations and blockers

Desktop/browser pointer interaction has automated host coverage, but no new manual browser review was performed. Physical Quest interaction remains outside this desktop change. In Boolean view, a surface hit resolves to the current transform target because the unified surface does not identify one source layer.

### 6. Next recommendations

Try Rotate (E) on several overlapping layers in Separate Layers and Boolean views; confirm surface selection, the free drag feel, and held R/F/V constraints. Use the existing handles when precise handle-axis manipulation is preferred. This follow-up has not been committed or pushed.

---

## Phase 6.0.1 handover

Updated 2026-11-03. Code cleanliness and agent test workflow are complete. Phase 6.0 host implementation is complete; physical Quest 3 acceptance remains pending.

### 1. What changed

Pinned Biome 2.6.4 and added scoped formatting/linting. Formatted handwritten TS/JS/JSON in `src/`, `scripts/`, `tests/` and root tooling config; generated builds, assets, vendor code, `outputs/`, recovery data and snapshots are excluded. Import ordering was applied in a separate pass. Added quick, focused, changed-file, worker and full test commands, bounded default concurrency, TAP/JUnit output, a combined `npm run check`, and [AGENTS.md](../AGENTS.md). A Git pre-commit hook now runs Biome checks; `npm install`/`npm ci` enables it for the repository. `WHATS_NEW.md` has the dated entry.

### 2. Architectural decisions

Kept Node's built-in `node:test` runner and existing TypeScript content-cache pipeline. Native ESM, worker_threads fixtures, WebXR mocks, changed-file selection and TAP/JUnit already fit. Vitest adds another transform layer; Jest needs more ESM/TS adaptation. Neither has measured evidence of faster end-to-end runs here. Details are in [testing guide](TESTING.md).

### 3. Build and test results

Final `npm run check` passed: format check, lint, strict TypeScript, production build and **1,320/1,320 tests**, zero failures/skips/cancellations across 82 files. Check wall time was **48.24 s**; suite wall time was **42.16 s**. Build retains the existing Vite large-bundle advisory. Biome checked 286 scoped files. Lint exits successfully with **542 warnings and 94 informational findings**; remaining findings are recorded in §5.

Baseline strict TypeScript passed in **1.62 s**, build in **3.79 s**, and full suite passed **1,316/1,316** in **33.36 s** wall time, with Node's runner default concurrency. After changes, the full run at the explicit concurrency cap of four took **42.16 s** and passed **1,320/1,320**. These timings are not directly comparable: the concurrency setting and test count changed. The small `test:quick` set ran 21 checks in about **0.65 s**.

### 4. Benchmarks and regressions

JUnit per-test durations summed by file show the slowest aggregate execution: `rotation-integration` 14.02 s, `turntable` 10.24 s, `vr-stress` 9.83 s, `bake` 9.02 s, `advanced-brush` 8.43 s and `sculpt-masks` 7.05 s. These per-test sums overlap across concurrent processes and are not file wall times. Full-run wall time rose versus the baseline, so no full-suite speedup is claimed. Focused and quick runs provide faster edit feedback. The historical Move preparation timeout under high concurrency is noted in the Phase 6.0/Phase 5.4 entries; the final concurrency-4 suite had no timeout.

Top-five runtime follow-up: the focused command `npm run --silent test:junit -- rotation-integration turntable vr-stress bake advanced-brush` ran 88 cases at concurrency 4 in 17.73 s before and 17.98 s after the experiment. Post-run JUnit duration sums were 13.62 s, 10.24 s, 8.93 s, 9.13 s and 8.79 s respectively; per-file sums overlap and are load-sensitive. Changing only the focused batch cap measured 26.53 s at concurrency 2, 17.98 s at 4, then 15.09 s and 14.27 s across two runs at 5; all 88 cases passed in each run. For this focused subset, `npm test -- rotation-integration turntable vr-stress bake advanced-brush --test-concurrency=5` is a measured faster command on this host. This does not justify raising the full-suite default, where historical Move-worker timeouts under contention motivate the existing cap of four. A one-file bake run measured 8.52 s before and 8.36 s after precomputing bake coordinates, but the batch showed no corresponding gain, so that production-code change was reverted. Reusing vectors in the rotation integration scan also produced no measurable runtime improvement and was reverted. The expensive cases are the intended 192³ workloads: rotation/twist scan dense surfaces and verify seam normals/history/reload; VR stress exercises repeated brush, stamp, cancellation and persistence paths; turntable verifies 192³ edits/exports; bake samples the full field; advanced-brush checks large-grid exactness. No assertions, resolutions, iteration counts, or timeouts were reduced. Runtime gains came from focused selection and this local cap-5 experiment, not a weakening or rewrite of coverage.

### 5. Known limitations and blockers

Lint has 542 warnings and 94 infos. **489 are `noNonNullAssertion` warnings**; others include 19 unused parameters, 17 unused variables and 9 optional-chain suggestions. Informational findings are mostly 88 template-string suggestions. No lint errors remain, and these rules remain enabled. Scoped exceptions are documented in `biome.json`: inline fake-clock increments in the specific tests/benchmarks; intentional cache assignment and control-character filename regexes have local reasoned suppressions. A test worker fixture has one local constructor-return suppression. One duplicate benchmark property was removed. No broad blanket rule disables are in place.

Node watch mode is available upstream but is not wrapped because the project runner must compile TypeScript imports before launching tests. Physical Quest validation is unchanged and still pending for Phase 6.0 app work.

### 6. Next recommendations

Use `npm run test:quick` during edits, focused/changed selection where safe, and `npm run check` for handoff. Lower concurrency with `TEST_CONCURRENCY=2` on memory-constrained hosts. Tackle non-null assertions incrementally by module, keeping the recommended rule enabled; consider a runner watch command only with a compilation-aware implementation. Do not commit, push or merge without explicit authorization.

---

## Previous phase handover: Phase 6.0

Updated 2026-11-03. **Phase 6.0 host implementation complete; physical Quest 3 acceptance remains pending.**

## 1. What changed

Phase 6.0 adds direct main-wheel and desktop Plane Cut controls, separate SDF pieces with a single-action undo, active/all-editable layer scope, and automatic browser-library thumbnails on Save/Save As. `WHATS_NEW.md` has the dated end-user entry. Details and limitations are recorded in [Phase 6.0 handover](PHASE_6_0_CUT_THUMBNAILS.md).

Read the current Development Status, Phase 5.1 browser, Phase 5.3 STL, Phase 5.4 release handover and recent changes before editing. Baseline working tree was clean at b1fb915; no user edits were overwritten. Baseline strict TypeScript/build and full suite passed (**1,298/1,298**). No commit, push or merge performed for Phase 6.0.

## 2. Architectural decisions

Plane Cut computes negative-inside half-space intersections in each source layer’s local SDF lattice, retaining expanded dimensions and lattice origin. Both pieces are prepared and remeshed before publication. Paint and masks are clipped to the piece and nearby cap samples inherit surface colour. Effective visible/unlocked layers can be cut in one staged, rollback-safe history action; intersect targets reject the whole batch. Cut-history references are invalidated safely when a related layer is deleted.

Thumbnail capture uses an isolated offscreen render target and visible committed surfaces, restores renderer/XR state before async readback, and stores capped compressed data through existing atomic local-library metadata. Project listing remains metadata-only. Portable `.form` payloads are unchanged.

## 3. Build and test results

Final `npx tsc --noEmit --strict`, production build and complete suite passed: **1,316/1,316**, no failures/skips/cancellations. New tests cover SDF caps/signs, rotated/offset/sparse-lattice planes, groups/transforms, paint/mask, individual STL diagnostics, cancellation, batch rollback/Undo/Redo, stale-history cleanup, thumbnail cap/fallback/async XR readback and direct wheel hit-target ownership. Build retains the existing main-bundle size advisory.

One host integration run measured a 64³ cut at **139.7 ms**, 76,688 triangles and 11,812,992 tracked bytes; a 128³ cut at **937.7 ms**, 312,896 triangles and 72,860,160 tracked bytes. Each created two layers. These are single-run host measurements, not headset frame timings. Evidence: [benchmark](../outputs/phase-6-0/benchmark.json). XR/Passthrough and physical controllers are not available for host acceptance.

## 4. Benchmarks and regressions

The cut timings include preparation and incremental remeshing, but are not repeated statistical benchmarks and do not establish Quest performance. Existing Phase 5.2 staging and remesh budget controls remain in place. Thumbnail GPU readback is asynchronous where supported, with a synchronous compatibility fallback.

## 5. Known limitations and blockers

**Not release-ready.** Cut review currently shows plane placement, not the generated pair of preview meshes. Freehand/wand and symmetry-duplicated cuts are deferred; a cut is one explicit plane. The field remains a two-half-space split, not a separate layer for each connected component. Arbitrary exported results must be checked in the target slicer; automated fixture print diagnostics are not universal printability proof. Allocator/GPU failure injection was not tested. Thumbnail failure does not block Save; sync readback fallback may briefly occupy a frame. Human visual acceptance and physical Quest 3 Studio/Passthrough/controller/GPU/resource validation remain pending. See [Phase 6.0](PHASE_6_0_CUT_THUMBNAILS.md), [Phase 5.3](PHASE_5_3_PRINTING.md) and [Phase 5.2](PHASE_5_2_PERFORMANCE.md).

## 6. Next recommendations

Execute the [Phase 6.0 physical checklist](PHASE_6_0_CUT_THUMBNAILS.md#6-next-recommendations) and the [Quest release checklist](PHASE_5_4_RELEASE_ACCEPTANCE.md#physical-quest-3-acceptance--all-pending), record evidence and fix reproducible failures before release approval. Verify each exported cut piece in the intended slicer and exercise Save/Save As thumbnail capture in XR.

Every future phase/significant change must update this six-part status, add a dated user-facing `WHATS_NEW.md` entry newest first and pass strict TypeScript, build and full tests; see [development workflow](../DEVELOPMENT.md). This Phase 6.0 request explicitly prohibits commit, push or merge.

Sidebar refinement: recovery pause status moved to a focusable info tooltip on Recovery Checkpoints; resource estimates moved to sidebar bottom, diagnostics use monospace, brush buttons have tooltips, Surface View uses an accessible Boolean icon toggle, and redundant export/transform/layer hints were removed. What’s New now formats headings and bullets without interpreting HTML.

Removed the YOUR TOOLKIT and INDEPENDENT VOLUMES sidebar labels as requested.

Tightened both sidebar top insets to 20px and removed first-heading top margins after removing eyebrow labels.

Surface View now uses compact Layers / Boolean buttons with synchronized pressed states, replacing the oversized icon.

Moved Composite Quality Cap into a collapsed Preview settings disclosure directly below Gizmo Space; existing quality values and behavior preserved.

Removed the separate-layer status hint; Boolean tooltip includes current cached triangle count when available (omitted while pending).

Layer parenting follow-up: sculpt layers can directly parent other layers, with indented children and collapse controls. Desktop uses drag handles, an Outside drop target and a collapsed Attach / detach fallback. VR uses trigger-held handles, release onto rows/Outside, hover paging arrows and an Attach to layer fallback. Existing folder groups remain readable; new grouping does not create folders. Reparent preserves world pose, rejects cycles/invalid depth/non-uniform parent scale and records one Undo action. Parent transforms/visibility/locks propagate; deletion keeps children in place at the parent's level. Boolean evaluation order is unchanged. Duplication still copies the selected layer only. Native version 10 is written when a layer is a parent; earlier projects remain readable. Older app versions cannot open these new files. Physical VR dragging acceptance remains pending.

Layer-parenting validation: strict TypeScript and production build PASS; full suite **1,284/1,284 PASS** (four new behavioral tests). Logs retained in outputs/phase-5-4/layer-parenting-*.log. Browser verified drag-to-attach indentation and fallback detach. Physical Quest drag/drop, tracking interruption and hover paging remain pending; no headset acceptance claim. No commit or push performed.

Layer row polish: colour swatches remain visible in compact rows, collapsed parents show descendant counts, and Gizmo Space / Preview settings now sit below the desktop layer list. Colour changes invalidate the row cache.

Removed desktop Save name and option-panel Hide/Show buttons. Enter commits layer names; each row now has a right-aligned accessible eye toggle, including unselected rows. Parent locking still disables visibility changes.

Condensed desktop Boolean step text and earlier/later controls into one numbered Boolean order row with accessible arrow buttons; behavior is unchanged.

Attach / detach parent selection now shows a live colour swatch before the dropdown; Outside uses an empty swatch.

Added an Attach / detach tooltip explaining inherited parent behaviour, Outside and preserved position.

Replaced desktop Lock/Unlock option button with a right-aligned padlock beside the row eye toggle, retaining inherited locking and accessible pressed state.

Desktop layer options now stack Duplicate beneath Transform, followed by a compact Layer order arrow row with accessible labels and tooltips.

Moved layer-order arrows to the right of stacked Transform / Duplicate buttons and removed the visible Layer order label; accessible group label retained.

Empty desktop layers now delete without confirmation. Emptiness checks authoritative positive SDF samples rather than rendered triangle counts, so pending meshes and solid volumes are not mistaken for empty. Procedural layers retain confirmation.

Boolean transform feedback: presentation temporarily shows separate layers during active transform transactions, retaining the selected Boolean mode. On completion/cancel it waits for current Boolean geometry before restoring; failed rebuilds leave live layers visible. Composite polling pauses during transforms. Shared desktop/XR render path handles restoration and project replacement resets transient state.

Transform-preview validation: production build (including TypeScript) and **1,288/1,288 tests PASS**. New tests exercise live transform visibility, waiting for fresh Boolean geometry, cancellation, explicit view changes, project replacement and VR grip transforms in Boolean mode. Physical Quest validation remains pending.

Publication follow-up: user explicitly authorized commit and push after polishing the user-facing What’s New entry. This authorization supersedes earlier no-commit statements for the completed changes in this chat. Physical release acceptance remains pending.

Moved VR / WebXR Diagnostics to the bottom of the desktop left sidebar, below Session Resource Estimates.

2026-11-03: Reduced Tool Wheel bottom backing strip from 96 to 64 canvas pixels and lowered its top edge so Mask/Paint/Project protrude by 20 pixels. Button sizes and hit targets unchanged.

2026-11-03 VR text: menu raster increased from 1152² to 2048² while retaining 1152 logical coordinates and physical/hit layout. Small text uses medium weight; explicit linear magnification, trilinear mipmaps and 4× anisotropy retain smooth distance/angle filtering. Approximate RGBA texture plus mip chain grows from 6.75 MiB to 21.33 MiB; repaint caching retained. Actual Quest sharpness/performance comparison pending.

VR text validation: production build PASS; real canvas render inspected at 2048². Initial full suite had 1 Move-preparation timing-limit failure under concurrent host load (1,288/1,289 passed); complete rerun with --test-concurrency=4 passed **1,289/1,289**, no failures/skips. Texture resolution/caching/logical layout regression added. Hardware readability and GPU cost remain pending.

2026-11-03 VR drag clarity: source-colour enlarged cursor with white ring, outlined destination row/Outside target, explicit release-to-attach/detach and invalid destination messages. Row controls now resolve to their containing layer during a drag. Shared destination validation drives both preview and release, blocking self/descendant, locked/hidden, busy and hierarchy-limit drops. Physical Quest feedback validation pending.

VR drop-feedback validation: production build PASS; complete suite **1,291/1,291 PASS** with --test-concurrency=4. New tests cover source-colour cursor/ring, tracking-loss cancellation, attach/detach messages, whole-row destination resolution and self/descendant rejection. After final cursor-colour refinement, menu tests also passed 38/38. Physical Quest validation remains pending.

2026-11-03 VR layer controls: eye/padlock glyphs replace text labels. Outside button is no longer drawn; empty in-panel list space becomes a detach destination only during dragging, with panel outline and detach feedback. Off-panel release still cancels, avoiding accidental detach on a missed ray or tracking loss.

VR icons/empty-space detach validation: production build PASS; full suite **1,292/1,292 PASS** (--test-concurrency=4). New ray-driven test verifies empty list space detaches on release and off-panel release cancels. Final hidden-target cursor refinement passed all 39 menu tests. Physical Quest usability remains pending.

2026-11-03: Added World Settings → Preferences → Test vibration. Requests a 75% / 250ms pulse on both tracked controllers and reports accepted/rejected/unavailable/failed/unconfirmed separately. Shared haptic gate suppresses overlapping pulses; timeout bounds UI wait. Accepted means API acknowledgement, not verified physical vibration.

Vibration test validation: production build PASS and **1,293/1,293 automated tests PASS** (--test-concurrency=4). Added deterministic acknowledgement/rejection/failure/unavailable/tracking/cooldown checks. Physical vibration not yet confirmed; use World Settings → Preferences → Test vibration on Quest.

2026-11-03: User confirmed the diagnostic test physically vibrated both Quest controllers. Removed the test button and its menu wiring. Normal event haptics still need separate perceptibility validation. Added VR layer Upres/Downres stepping 64³/128³/192³ using existing resampleActive admission, transforms and history behavior; confirmation explains history clearing and possible detail loss. Hidden/locked/procedural/group layers and resolution boundaries are disabled.

VR resolution validation: production build PASS; complete suite **1,294/1,294 PASS** (--test-concurrency=4). Added confirmation/cancel, up/down stepping, minimum boundary and other-layer preservation regression. Actual production-canvas layer-options render: outputs/vr-layer-options-layer-options.png. Upres/Downres physical headset acceptance remains pending.

2026-11-03 VR layer-options layout pass: prominent transform card at top left, Increase Res and Decrease Res stacked beside it with current/target sizes. Remaining actions use consistent paired rows, current resolution appears beside the layer name, and resolution confirmation wording is updated.

Layer-options polish validation: full suite **1,294/1,294 PASS**; final transform-card drawing passed build and 47 menu/layout tests. Production canvas render inspected at outputs/vr-layer-options-polished-layer-options.png. Render script now dynamically imports compiled modules after compilation to prevent stale previews.

2026-11-03 VR layer glyph pass: closed padlock shackle for effective locking (including inherited locks), open shackle when unlocked; dedicated three-line drag grip with hold instruction in the hover footer. Drag targets and ownership are unchanged.

2026-11-03 VR row redesign: Menu size shows current/next size with hover explanation; centred layer names retain colour strips, with compact top-right resolution/Boolean/type/child indicators. Removed repeated Active, Hidden, Locked and Nested text; selection border, eye/padlock and indentation convey those states. Hover explains Boolean indicators.

2026-11-03: VR layer row height reduced 136→112, pitch 164→140; child indentation doubled to 48px per level (up to 3 levels). Tool-hand vertical stick pages the layer list with deadzone/direction guards and 500ms initial / 300ms repeat delay, including while dragging. Support stick still opens/holds menus. Navigation resets on close, tracking/source changes and other pages. Physical interaction validation pending.

Compact layer/stick validation: build PASS, full suite **1,295/1,295 PASS** (--test-concurrency=4) after updating the legacy row-label assertion to check structured indicators. New stick navigation test covers paging, reversal, bounded repeat and horizontal rejection. Render with nested-layer example: outputs/vr-layer-compact-layers.png.

2026-11-03: Replaced visible layer paging with continuous tool-stick scrolling using time-scaled speed and deadzone. Layer rows and hit tests clip to the list viewport; fixed controls remain outside it. A translucent bottom chevron appears only when undisplayed layers remain below. No overflow means no scrolling indicator. Internal palette pagination is adapted into a continuous rendered list; action routing uses the displayed targets.

Smooth-scroll validation: production build PASS; full suite **1,296/1,296 PASS** (--test-concurrency=4), plus 41/41 menu tests after the final hint adjustment. Tests cover continuous bounded offsets, horizontal rejection, overflow range, clipped hit targets and selection of scrolled rows. Physical Quest smoothness remains pending.

2026-11-03 publication: user authorized commit/push of the latest VR layer refinements with a new end-user What’s New entry covering smooth scrolling, clearer rows and resolution controls.

2026-11-03 recovery-entry fix: acknowledged recovery replacement bypasses generic unsaved-work browser confirmation. Shared restore helper retains checksum, source-currentness and atomic project-open validation. VR-entry form remains open during restore/discard and displays progress/error; successful restore prepares Boolean output if needed and presents Enter VR for a fresh trusted click. Cancel remains available on failure; ordinary project-open confirmation behavior is unchanged.

Recovery-entry validation: production build PASS; complete suite **1,297/1,297 PASS** (--test-concurrency=4), including a regression contract for single-dialog ownership, explicit replacement authorization, in-dialog errors and trusted-click XR entry. Actual desktop-to-Quest restore/entry interaction still needs browser/headset confirmation.

2026-11-03 desktop tool controls: canvas workspace icon/caption follows Paint (including erase) and Smooth. Expanded Paint controls provide native colour input plus radius/strength; Smooth provides live radius/strength, synchronized with sidebar settings. Tools button returns to the tool chooser; range keyboard handling is preserved. Existing Smooth field sampling remains unchanged; interaction improvement is direct controls and visible settings rather than an unverified engine fix.

Desktop controls validation: full automated suite **1,297/1,297 PASS** (--test-concurrency=4), production build PASS. Browser using isolated recovery fixture verified Paint icon/caption, popover colour change (#e34b45→#4a78d0), keyboard radius update (.22→.23) synchronized to sidebar, Smooth popover with no colour field, and keyboard strength update (35→36%) synchronized to sidebar. Existing recovery records were not restored or discarded. Final chooser-close correction preserves same-tool selection behavior; build rechecked.

2026-11-03 desktop surface-miss fix: ray misses and leaving the viewport pause the ClayStrokeSession timer and pump queued paint, preserving applied colour instead of triggering tracking-gap rollback on return. Resumed samples break the path, preventing a painted bridge across the missed region. Immediate non-paint strokes also break their layer path when paused. Explicit cancel/lifecycle rollback behavior is unchanged.

Desktop paint surface-miss validation: production build PASS; 52/52 paint tests and complete suite **1,298/1,298 PASS** (--test-concurrency=4). Regression covers a multi-second surface miss, retained paint, gap-free resume, unchanged geometry and one Undo/Redo transaction. Actual desktop feel still needs user confirmation.

2026-11-03 publication: user authorized committing and pushing desktop Paint/Smooth controls, single-dialog recovery and off-surface paint preservation, with the polished Easier desktop painting What’s New entry.

2026-11-03: Hid the routine Autosave off · manual saves are separate status line. Recovery warnings/errors remain visible.

2026-11-03 desktop Shape Library compact pass: removed Show ghost preview and duplicate sidebar Stamp once at preview controls; opening/closing library still manages preview, and canvas Apply stamp remains available. Move/Rotate share one compact row; lengthy stamping instructions moved into a tooltip with a short keyboard hint.

2026-11-03: Desktop Shape Library heading now uses an SVG matching the VR stamp icon geometry.

2026-11-03: Hid the routine autosave waiting-for-idle message; warnings remain visible.

2026-11-03 Phase 6.0 radial Cut follow-up: moved Cut from the centre to its own tenth radial sector with a split-plane icon. Existing nine tools retain their full card dimensions; centre Options returns to 280×144. Shared drawing and hit tests use ten sectors. Production canvas reviewed at outputs/phase-6-0-radial-cut-wheel.png. Physical Quest acceptance remains pending.

2026-11-03 Snap feedback: the shared 15° button dims to 55% opacity when angle snap does not apply to the current tool/settings, while remaining clickable. Applicability follows actual engine behavior: free-axis Straight Line strokes except Smooth, plus Move rotate/twist. A reusable presentation-only line extends the snapped stroke from its captured origin; Move rotation uses a snapped pivot spoke. Guides hide during commit, cancel, misses, tool changes and tracking/menu interruption and dispose with their tools. New both-hand host tests verify directions, transformed origin, unchanged source fields, cleanup and preference availability. Physical Quest guide visibility/usability remains pending.

Snap feedback validation: strict TypeScript, production build and complete suite **1,316/1,316 PASS** (--test-concurrency=4); diff whitespace check passed. New guide cases cover left/right hands, origin transforms, snapped line/rotation angles, cancellation/release, unchanged source data and dimmed-but-clickable preference state. Existing Vite bundle-size advisory remains. No commit or push performed.

2026-11-03 publication: user explicitly authorized committing and pushing Phase 6.0, radial Cut placement and Snap feedback, including a polished dated What’s New entry. This supersedes the earlier no-commit restriction for these changes. Physical Quest acceptance remains pending.
