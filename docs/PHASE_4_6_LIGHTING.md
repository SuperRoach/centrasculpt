# Phase 4.6 — Editable Three-Point Lighting and Light Rigs

2026-10-30. Implemented; **physical Quest 3 acceptance PENDING**. No commit, push or merge.

## 1. What changed

World Settings → Lighting now offers an optional three-point rig, independent Key/Fill/Rim enabled flags, six colour presets, intensity ±0.2 (0–6), position ±0.1 in workspace units, per-light reset and Reset All Lights. Desktop World Settings · Lighting adds arbitrary RGB colour selection and numerical XYZ position and target controls. Existing illumination remains the default until explicitly enabled. Disabling the rig restores original light positions, targets, colours and intensity unless the temporary inspection override is enabled.

Edit Lights reserves Tool trigger for pointing and holding a wireframe light, then moving/rotating the controller to reposition it with its initial grab offset preserved. Key is gold with one top mark, Fill blue with two marks, Rim purple with three. Hover is green, dragging white, selected handle enlarged. A faint line shows its target. Release retains the position; Edit Lights off hides helpers without disabling illumination. The menu explains the marks. Handles can be moved while their individual light is off. Inspection disables handle editing.

Inspection Light temporarily overrides the three-point/original lights with a white directional light moving around the saved Key target. Speed 1–30 degrees/second (default 6), pause/resume, reverse and angle reset are available in XR and desktop. It does not start the Turntable or alter sculpture transforms/geometry.

Files added: `src/lighting.ts`, `src/light-rig.ts`, `src/lighting-ui.ts`, `tests/lighting.test.mjs`, `scripts/fixtures/lighting.html`, this guide. Files extended: `src/display-preferences.ts`, `src/main.ts`, `src/style.css`, `src/xr-world-menu.ts`, `src/xr-controllers.ts`, `src/xr-experience.ts`, `scripts/compile-core.mjs`, `docs/DEVELOPMENT_STATUS.md`.

## 2. Architectural decisions

- Settings are versioned display metadata with an explicit `type: directional`, keeping future point/spot variants possible. Validate booleans, RGB, intensity 0–6, finite three-component positions/targets within ±1000 and a minimum .001 handle/target separation. Legacy display data omits lighting and restores original illumination. No native-format bump or source schema changes.
- **Coordinate spaces:** tracking/controller pose → inverse workspace matrix → saved light position. `workspaceRoot` owns `LightRig.root` and the existing Turntable as siblings. `turntable.group → sculptureRoot → layer TRS → source geometry` remains separate. Workspace grabbing/scaling/rotation therefore moves equipment and sculpture together; Turntable presentation rotation moves sculpture only. Light handles/targets never live under layer/export roots. Saved positions remain workspace-local, excluding XR placement and presentation rotation.
- Initial/reset target is the sculpture's current visible centre converted into workspace space, clamped to ±990 to keep default offsets valid. First preset creation/reset samples bounds once; no bounds traversal on a lighting frame. Defaults place Key above-left/front, Fill opposite, Rim above/behind. User targets stay fixed thereafter, including during Turntable rotation. Geometry/layer edits do not silently retarget lights.
- Direction comes from handle toward target. No distance attenuation is applied. The two original directional objects are reused; one permanent Rim object is added. Three directional slots plus the original hemisphere remain stable, with inactive intensities zero. Custom rig ambient is .65; inspection ambient .25; original 2.7 is restored. Inspection reuses Key and zeroes the other slots instead of adding a fourth directional light.
- **Input priority:** tracking/session/menu/diagnostics and workspace grips precede light editing. In explicit Edit Lights mode the Tool trigger is reserved even on misses, preventing sculpting/stamping/alternate-tool/selection takeover. Tool grip cannot initiate source-layer grabs while editing; Support grip and both-grip navigation remain available. Tool sizing and Support alternate are suspended in this explicit edit context, restored on exit. Existing undo/redo and menu mappings remain. Turntable pauses during an active light grab, as it does for other manipulation; idle Edit Lights does not pause it.
- Both controller handedness configurations use existing roles. Tracking loss, disconnect, grip takeover, menus, handedness swaps, view reset, tool changes (including inside the same menu-update frame), config replacement and session end cancel the drag. A fresh neutral trigger is required to rearm. Interrupted drags retain their last valid display position; they do not create an undo action. Menu dismissal cancels active manipulation, but retains explicit Edit Lights mode so the user can close the menu and grab equipment.
- **Persistence:** optional `displayPreferences.lighting` carries rig enablement and all three lights through existing native save/open and recovery worker encoding. Snapshot copies settings. No geometry/history entry is created. Inspection enablement/angle/speed/pause/direction, hover, selected handle and Edit Lights are transient and excluded from saves/recovery. Inspection stops on XR end/project replacement; temporary speed/pause/direction/angle may remain in the current app instance until reset/reload. It does not resume automatically when opening a project.
- Unchanged Normal/Matte/Glossy material settings, layer colours, Boolean materials, PMREM and neutral GLB paths. Reference images retain their existing unlit, sRGB, `toneMapped:false` materials. No scene background/environment changes are made by lighting; immersive AR stays transparent. Virtual lights affect virtual objects only.

## 3. Build and test results

Incoming checkout was clean. Baseline strict TypeScript/Vite build and **1009/1009** automated tests passed. Final results are recorded in the Phase 4.6 section of `DEVELOPMENT_STATUS.md` and logs under `outputs/phase-4-6/`.

Twenty new lighting tests cover defaults/validation, restoration, independent settings, directional distance invariance, grab offset/arming/release/misses, tracking/ownership/reconnection, transformed workspace coordinates, Turntable separation, inspection pause/reverse/reset, native and actual recovery worker round trips, legacy restore, identical binary GLB, unchanged voxel arrays/layer transforms/history, material/reference independence, stable resources/disposal, target-centre initialization, bounded menu hit areas and real controller routing for both hands, including same-frame menu tool changes. Existing source/deformation/remeshing, reference image and export tests are retained.

Real browser checks: main app starts, three-point toggle and numeric Key intensity commit after blur (1.2 retained), 31,536 triangles and 0 undo/redo retained. Actual XR canvas fixture enables rig/edit handles, displays colour palette and inspection controls, pauses inspection and switches to transparent simulated AR. Screenshot `outputs/phase-4-6/inspection-ar.png`. No browser errors observed. The initial fixture's duplicate Three.js import warning was corrected by using the same bare import as the application. Existing user recovery checkpoints were not restored/discarded.

## 4. Performance measurements and regressions

Host browser probe: **10,000 rig updates = 11.30 ms total CPU**, WebGL geometry count **12 → 12** with rig/handles enabled. This is a single host-only sample excluding rendering/GPU/Quest; it is not an XR frame-time guarantee. Six helper line draws when editing, zero helper draws when hidden; no shadows. Matrices, vectors, ray, sphere, light targets, lights, materials and helper geometry are reused. Aim buffers update only when positions/targets change. Inspection uses a capped .1-second delta and no per-frame geometry/material creation. Tests run 10,000 updates and verify resource identity/disposal.

No SDF, meshing or Phase 3.7 scheduling algorithms changed; no source benchmark rerun was warranted. An additional zero-intensity directional slot exists even with the rig off to avoid toggling shader light counts; its Quest GPU cost is unmeasured. Production bundle delta and final build sizes appear in the main handover. Existing Vite >500 kB advisory remains. No dependencies added.

## 5. Known limitations and risks

Physical stereo handle visibility, one/two/three-mark identification, reach comfort, tracking responsiveness, real bright/dark Passthrough contrast, GPU/thermal/frame-time costs and actual save/export headset flow remain **PENDING**. Fixed source-unit handles can become small/large at extreme workspace scaling; numeric position controls provide a fallback. No shadows, point/spot emitters, free-form XR RGB picker or physical-room illumination. Desktop manipulation is numerical; draggable wireframe handles are the XR interaction. Inspection deliberately overrides the rig for consistent inspection rather than adding illumination. High custom intensities can still overexpose highlights. Existing material environment reflections remain, including in inspection. No new source editing undo behavior.

### Quest 3 physical acceptance checklist — ALL PENDING

1. **PENDING:** Enter Studio.
2. **PENDING:** Open World Settings → Lighting.
3. **PENDING:** Enable Three-Point Lighting; confirm original illumination restores when disabled.
4. **PENDING:** Inspect the sculpture under Key, Fill and Rim lights.
5. **PENDING:** Toggle each light independently.
6. **PENDING:** Change each light's colours.
7. **PENDING:** Change light intensities and inspect highlights.
8. **PENDING:** Enable Edit Lights; identify Key/Fill/Rim and hover/selection states.
9. **PENDING:** Point at Key, hold Tool trigger, move the hand, release.
10. **PENDING:** Repeat for Fill and Rim, with both handedness configurations.
11. **PENDING:** Verify immediate illumination response; moving along the same target direction should not attenuate brightness.
12. **PENDING:** Hide handles while retaining lights; verify normal sculpting resumes only after releasing the trigger.
13. **PENDING:** Reset individual lights and the complete rig.
14. **PENDING:** Enable Inspection Light.
15. **PENDING:** Watch illumination rotate; confirm sculpture and Turntable stay stationary unless explicitly enabled.
16. **PENDING:** Adjust speed, pause/resume, reverse and reset angle.
17. **PENDING:** Enable Turntable and confirm stationary equipment; test Support grip and both-grip workspace scaling/rotation, then a light grab.
18. **PENDING:** Exit and enter Passthrough using the existing session controls.
19. **PENDING:** Test menu/handle visibility against bright and dark physical backgrounds; room stays visible.
20. **PENDING:** Load a reference image; verify original colours under all lighting modes.
21. **PENDING:** Save and reopen the project; separately recover an autosave checkpoint.
22. **PENDING:** Confirm rig properties persist; inspection/edit modes do not automatically resume. Check a legacy project retains original lighting.
23. **PENDING:** Export GLB; inspect neutral geometry with no handles, guide lines or lights.
24. **PENDING:** Check controller responsiveness and frame-time diagnostics. Interrupt tracking, change tools, dismiss menus, swap handedness and end XR during manipulation; ensure no accidental sculpt/stamp/layer changes.

## 6. Next-phase recommendations

Obtain physical Quest sign-off and GPU/frame-time measurements before adding shadows or extra light types. Tune handle scale/contrast and preset exposure based on headset feedback. Preserve the roadmap: **Phase 4.7 — Sculpting Masks; Phase 4.8 — Advanced Layer Workflows; Phase 4.9 — Colour and Material Painting**. Continue keeping display metadata outside SDF history and export transforms.
