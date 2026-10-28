# Phase 4.2 — VR Menu and Tool Wheel Redesign

Implemented 2026-10-28. **Host validation passed; physical Quest 3 acceptance remains OPEN.** No commit, push or merge performed. Incoming Phase4.0/4.1 work preserved; tracked checkpoint `/private/tmp/vrapp-phase-4-2-incoming.patch`.

User headset feedback (2026-10-28): **“Menu looks better.”** Appearance improvement acknowledged; all other physical validation items remain unconfirmed. Subsequent Pinch/Crease Surface-follow report and fix are recorded in `DEVELOPMENT_STATUS.md`; this does not constitute full menu/brush acceptance.

Later interaction follow-up (2026-10-29): released Continuous Stamp queues no longer depend on controller tracking/poses while draining captured work. Drawing-time and explicit lifecycle cancellation remain; see `DEVELOPMENT_STATUS.md`. This does not change the menu design or constitute physical sign-off.

## What changed

- The twelve-tool wheel has floating vector icons and short readable labels, individual dark translucent plaques, selected outlines and hover highlights. The canvas between tools is transparent. The large opaque backing and radial wedges are gone; title/footer plaques retain contrast. Studio and bright/dark simulated backgrounds were visually checked. No postprocessing, blur, shadow maps, external icons or font downloads were added.
- Layers, Tool Options, Stamp, advanced brush, Tube/Edit Spline and mirror/snapping settings share rounded panels, spacing and typography. Options now show **five rows per page**, with separate label/value space and page numbers. Long descriptions wrap within fixed boxes; long single-line layer names/headings use ellipsis, never horizontal text compression. All eight layer rows remain available without paging.
- Buttons distinguish normal, hover, selected and disabled states through both fill and outline weight; numeric arrows are larger. Sliders have a rounded track enclosure, padded track endpoints, a larger thumb and captured/active state. Back/page actions retain large targets. The pointer distinguishes disabled targets and stays hidden over noninteractive transparent gaps; invisible radial sectors remain interactive.
- Diagnostics, controller hints, shortcut feedback and optional performance panels use the same restrained palette and rounded panels. Hints have more vertical space for wrapped instructions. Diagnostics controls highlight on hover. Side panels move farther out when UI scale grows, preserving separation from the central menu.
- **VR UI size: Small / Normal / Large** is available on menus and in desktop VR diagnostics. Normal is the default. The preference saves in native project display metadata and recovery, without a history action. Geometry, workspace and layer transforms remain independent.

## Architecture

`src/xr-ui-style.ts` provides shared colour/type/spacing tokens, rounded paths, bounded word wrapping/ellipsis, control states, validated scale presets and physical scale factors. Main menus still use **one existing 1152×1152 CanvasTexture plane**. Icons are canvas paths, not extra scene meshes. Existing content/hover caching avoids repainting unchanged menus.

Fonts in canvas pixels: heading46, label32, value36, detail/footer28, radial30, numeric/navigation38. Compared with the old options labels26/detail24, larger default physical scale and removal of squeezed radial text improve presentation. Readability on Quest is an acceptance item, not an asserted result.

The options layout starts at y244 with150px row spacing. Each action has a136px target; numeric controls92px; sliders54px tall. Labels and values have explicit boxes; sliders do not cover label text. Eight layer rows retain82px targets and94px spacing. Shared panel radius is24px; outer panels32px. Layout/interaction operate in original canvas coordinates. Footer text has its own region; option page counts appear in the subtitle rather than overlapping Snap.

The **radial angular boundaries, inner185/outer430 selection annulus, centre Options action and opening gesture are unchanged**. Labels move to radius328 to separate floating cards; invisible sectors extend beyond the small visible plaques. Tool registry/order remains the source for all twelve entries, including advanced brushes, Tube and Edit Spline. Selecting a tool still opens its options. Support stick release still dismisses; no close gesture was remapped.

UI scale factors: Small1.0, Normal1.15, Large1.35. The central .72m plane becomes .72/.828/.972m wide at the existing1.05m anchor distance. Local geometry/UV coordinates stay unchanged, so raycasting, cursor placement and slider conversion continue through the actual UI world matrix. Only UI roots scale. Diagnostics/performance placement uses the same factor for lateral offset; sculpture/workspace roots are never scaled by this preference. Hints and shortcut feedback follow UI scale too.

`ProjectDisplayPreferences.vrUiScale` is optional and validated. Normal is omitted from snapshots to preserve legacy/default metadata; absent data restores Normal. Existing native/recovery adapters carry it without a schema version change. `LayerDisplayPreferences` owns the preference. Both the menu action and desktop selector change display state only. Existing recovery/save keys already include display snapshots.

Controller arbitration remains in `XRControllers`/`XRMenuView`: neutral trigger arming, connection identity checks, menu/grip/tracking/lifecycle cancellation, handedness and haptics are preserved. The menu still renders after scene previews; the existing once-per-eye depth clear and depth-tested controller models remain intact. Menu rays/hit cursors keep their foreground orders and restore on dismissal. Diagnostic hover is visual state only, cleared on lifecycle changes.

## Preserved behavior and scope

Support stick left/right Undo/Redo, up/down Tools/Layers, Support trigger alternate brush, Support grip workspace grab, both grips workspace scaling/rotation, Tool trigger action/selection, Tool stick sizing and Tool grip Stamp attachment/layer transform are unchanged. Native project management, autosave/recovery and Studio/Passthrough switching remain in their existing flows. The desktop environment selector is retained; this phase does not add a new in-headset world-settings system.

**No SDF, brush, meshing, history, procedural evaluator or spline input changes in this phase.** Tracked diff sections were compared with the incoming checkpoint for `sdf`, `mesh`, `history`, `stroke`, `clay-stroke-session`, `independent-layers`, `xr-clay-stroke` and `xr-shape-stamp`. The untracked Phase4.1 tube sources were not edited. Evidence: `outputs/phase-4-2/protected-source-check.json`. Phase3.7 two-chunk scheduling and CPU-gap accounting remain unchanged; physical retest is still pending from prior handovers.

## Validation and actual observations

Commands:

- Baseline `npm run build`: PASS, including strict TypeScript.
- Baseline `npm test -- --test-concurrency=4`: **878/878 PASS**, no failures/skips.
- Final `npm run build`: PASS; existing Vite bundle-size advisory remains. Main JS approximately1101.77kB minified /304.45kB gzip. No new dependency.
- Final `npm test -- --test-concurrency=4`: **886/886 PASS**, zero failures/cancellations/skips;22.05s command wall time in this run.
- `git diff --check`: clean.

Eight new design tests cover fixed-size wrapping/ellipsis and larger fonts; all twelve invisible sectors and disjoint card footprints; transparent wheel/no full backing; bounds and disjoint controls across every tool/options page and all eight layers; native and actual-worker recovery scale persistence without voxel/mesh/history changes; ray/cursor alignment for every scale; disabled/selected/hover/active visual states; and side-panel scale/lifecycle placement. Existing tests continue to cover left/right dominance, pointer visibility, self-occlusion depth handling, lifecycle cleanup, Studio/Passthrough scene behavior, accidental sculpt prevention, menu navigation and all prior tools. Existing pagination/slider fixtures were updated for five rows/page and padded slider endpoints; source edit assertions remain intact.

A real browser fixture uses the actual `XRMenuModel`/`XRMenuView` renderer and a real procedural source. Inspected all12 labels, Stamp options, the eight-layer palette, and both spline option pages including Close/Bake. Canvas gap alpha was **0** against grey/bright/dark simulated backgrounds. UI size switches left fixture history at the same1 Undo action created by fixture tube construction. The fixture displays canvas pixels at a fixed 2D reference size; scale selection changes actual Three UI transforms, not a simulation of angular headset readability.

Measured host-browser cache probe: **360 unchanged polls,3.70ms total CPU, p95/max0.100/0.100ms, zero repaints**. This is one host run with browser clock quantisation, no WebGL draw/texture-upload/XR timing; it is not a Quest FPS or latency claim. Raw `canvas-polling.txt`; repeat with **Measure cached polling** in the fixture. Main menus keep one texture/plane and no per-frame texture upload when unchanged. Hints canvas increases1024×512→1024×768: approximately1MiB additional base RGBA backing storage, excluding mipmaps, browser/GPU copies and overhead. Physical/GPU cost is unmeasured.

Evidence in `outputs/phase-4-2/`: baseline/final logs, protected-source check, cache probe and screenshots. Real render fixture: `scripts/fixtures/vr-menu-design.html` (serve through Vite; no production route or public deployment).

Screenshots:

- [Studio wheel, options and eight-layer palette](../outputs/phase-4-2/studio-menus.png)
- [Bright simulated background / Stamp](../outputs/phase-4-2/bright-stamp-menus.png)
- [Floating wheel close view](../outputs/phase-4-2/floating-wheel.png)
- [Dark simulated background / spline / Large preset](../outputs/phase-4-2/dark-spline-large.png)
- [Spline Close/Bake action page](../outputs/phase-4-2/dark-spline-actions.png)

## Files modified

New: `src/xr-ui-style.ts`, `tests/xr-ui-design.test.mjs`, `scripts/fixtures/canvas-context.mjs`, `scripts/fixtures/vr-menu-design.html`, this handover, `outputs/phase-4-2/`.

Extended: `src/xr-menu-model.ts`, `src/xr-menu-view.ts`, `src/display-preferences.ts`, `src/xr-experience.ts`, `src/xr-controllers.ts` (diagnostic hover only), `src/xr-diagnostics.ts`, `src/xr-hints.ts`, `src/xr-shortcut-view.ts`, `src/xr-performance.ts`, `src/main.ts` (allow display scale selector during XR), `scripts/compile-core.mjs`, `docs/DEVELOPMENT_STATUS.md`.

Updated existing test canvas mocks/layout expectations: `tests/xr-menus.test.mjs`, `clay-steady.test.mjs`, `xr-controllers.test.mjs`, `xr-support-shortcuts.test.mjs`, `xr-brush-sizing.test.mjs`, `vr-polish.test.mjs`, `phase-1-14-metrics.test.mjs`. Canvas mock provides approximate text metrics and path methods; browser screenshots supply the visual check rather than treating mock metrics as pixel-accurate proof.

## Remaining limitations

- **No physical Quest confirmation yet**, including optical legibility, bright/dark real Passthrough, controller self-occlusion in actual stereo rendering and large-panel comfort/reach. Screenshots are a flat host preview over simulated surroundings.
- Long layer names/headings use ellipsis; explanatory option values wrap to at most two lines. The eight-layer palette is denser than five-row options. No inertial scrolling, search or expanding layer-name inspector was added.
- Scale is a project display preference, not a global user profile setting. Loading an older project restores Normal. Default Normal remains a proposed Quest comfort setting until user acceptance.
- Optional performance diagnostics remain information-dense at28px data text. No interactive performance-page redesign or new telemetry collection was introduced.
- Existing limits remain: controller updates can still encounter unrelated indivisible chunk/allocation/history stalls; tube regeneration can take seconds. This visual phase neither changes nor claims to fix those behaviors.

## Physical Quest 3 validation — all pending

Use Quest Browser, Touch Plus and both handedness configurations. Only the user can confirm these passes.

1. Hold Support stick Up to open Tool Wheel; release closes, centre rearms.
2. Read all12 labels, including advanced brushes, Tube, Edit Spline, Stamp, Move and Transform.
3. Ray-select each tool through its existing invisible sector and centre Options action; verify no accidental edits.
4. Inspect floating icons and transparency in grey Studio; selected/hover states remain distinguishable.
5. Hold Support stick Down to open Layers Palette; test all8 rows and flags.
6. Read larger layer labels, selected outlines, visibility/lock states and long-name ellipsis.
7. Navigate all Tool Options pages; drag Steady, test toggles, numeric +/- and disabled controls.
8. Test Stamp dimensions, mode/spacing, reset attachment offset and existing Tool-grip attachment behavior.
9. Draw/edit a procedural tube, change point thickness, insert/delete, close/open and find Bake across pages.
10. Switch to Passthrough through the existing environment control; verify menus remain legible.
11. Repeat in bright and dark real surroundings; inspect texture contrast and transparent gaps.
12. Cycle Small/Normal/Large on a menu and through desktop diagnostics; verify UI-only scaling, no Undo entry, native/recovery persistence and side-panel separation.
13. Swap Tool Hand left/right; repeat menu/ray/slider selection and Support shortcuts.
14. Check realistic/simple/minimal controllers, menu ray/hit cursor, body/button self-occlusion and restoration after dismissal. Test tracking loss, reconnect and session exit cleanup.
15. Confirm menus never start sculpt/Stamp/Move/spline/layer-transform operations accidentally; verify Support alternate, grips, Undo/Redo and Tool sizing after neutral rearming. Re-test Phase3.7 staged remeshing behavior separately.

## Next-phase considerations

Preserve roadmap: **4.3 World Settings and Studio Background Presets;4.4 Mirror Grid and Turntable/Lathe;4.5 VR Reference Images;4.6 Editable Three-Point Lighting.** Later: **Sculpting Masks, Advanced Layers and Colour Painting**. Reuse shared tokens/text boxes and current input ownership for new panels. Obtain physical acceptance before claiming readability or performance success. No Phase4.3 implementation started automatically.
