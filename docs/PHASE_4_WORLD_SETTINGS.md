# Phase 4.3 — World Settings and Studio Background Presets

Implemented 2026-10-29. Host validation complete; physical Quest 3 acceptance pending. No staging, commit, push or merge. All incoming changes retained; tracked checkpoint `/private/tmp/vrapp-phase-4-3-incoming.patch`.

## Opening and navigation

Hold Support stick Up for the existing Tool Wheel, point at **World Settings** in its upper-right area, and tap Tool trigger. Continue holding the stick while choosing a section. Release closes the menu; centre/reopen uses the existing shortcut recognizer. Tool Wheel and Layers shortcuts, Undo/Redo, grips, alternate tools and tool sizing retain their bindings.

World Settings has four functioning sections:

- **Environment:** Studio / Passthrough, availability reasons and selected state. Changing mode exits XR; the desktop Enter button starts the selected environment with a fresh user gesture.
- **Studio Background:** six labelled colour swatches, a checkmark and selected border; ground-grid toggle.
- **Guides and Constraints:** existing layer-local mirror enable, plane normal and offset; existing global 15° Line / Move rotation snap. Tool Options retain their existing entry points and share the same runtime state.
- **Preferences:** Default UI (1.25×, midway between the former Normal and Large) and a Large UI toggle (1.35×), diagnostics toggle and performance panel toggle. The top-right scale control remains available throughout.

`XRWorldMenu` separates World section content/actions from `XRMenuModel`; future References, Turntable or Lighting sections can extend this navigation without touching tool declarations. No placeholder controls for those features are present.

## Scene and rendering

`world-settings.ts` defines the exact presets: Neutral Grey `#808080` (default), Dark Studio `#292D35`, Soft Blue `#536D8C`, Warm Studio `#B7A08A`, Black `#101114`, Soft Sage `#87998A`.

`XRExperience` reads the current project's display preferences through its existing presentation refresh/frame path. `XRSceneRig.applyWorldSettings` updates the active Studio `Scene.background` with a Three.js `Color`; unchanged settings retain the same Color. No textures, environment maps, expensive shaders, SDF sampling or remeshing are involved. Desktop background snapshot/restore remains exact. Preferences apply on entry and live while presenting.

Studio still uses `immersive-vr`; Passthrough still uses `immersive-ar`. The existing `XRSessionController` remains unchanged, including opaque-AR rejection and immediate user-gesture `requestSession` ordering. World selection uses its existing `select` method, which exits before requiring another Enter click. In AR the scene background is always `null`, regardless of chosen Studio colour. Colours/grid remain remembered, with the Studio grid hidden in AR.

The ground guide is one static `GridHelper`: 4 source units square, 20 divisions (0.2 unit spacing), opacity 0.16, transparent material, no depth writes, and a no-op raycast. It is a **workspaceRoot sibling of sculptureRoot**, centred below entry-time visible sculpture bounds, with a small clearance. It follows workspace navigation/reset and stays outside bounds fitting, source geometry, mesh picking and GLB export paths. Hidden outside Studio. This is a ground reference, not Phase 4.4's mirror-plane grid. Geometry/material are reused; `XRSceneRig.dispose` releases them when the owner is disposed.

## Persistence and data boundaries

The existing optional display-preference metadata gains `world: {version: 1, studioBackground: presetId, groundGrid: boolean}`. Defaults omit the field. Missing metadata restores Neutral Grey/grid off; strict validation rejects unknown extension versions, unknown presets and non-boolean grid flags. Restore resets preferences between projects. Snapshot copies the world record.

Native project envelope/version, serializer and recovery worker are unchanged. Their existing display metadata path carries the extension. Environment selection, XR availability and live sessions are transient and never saved. No World setting is a sculpt history action. Mirror/snap reuse existing state semantics. GLB exporters still receive only committed sculpture sources.

## Files changed in this milestone

- Added `src/world-settings.ts`, `src/xr-world-menu.ts`, `tests/world-settings.test.mjs`, `scripts/fixtures/world-settings.html`.
- Extended `src/display-preferences.ts`, `src/xr-scene.ts`, `src/xr-menu-model.ts`, `src/xr-menu-view.ts`, `src/xr-support-shortcuts.ts`, `src/xr-experience.ts`, `scripts/compile-core.mjs`.
- Updated this handover and `docs/DEVELOPMENT_STATUS.md`; evidence in `outputs/phase-4-3/`.

Source/controller/SDF/meshing/history/native/export implementations and recent released Stamp queue tracking-loss behavior are unchanged from the incoming checkpoint. Exact protected tracked-diff comparison is recorded in `outputs/phase-4-3/protected-code.txt`.

## Validation and observations

Baseline strict TypeScript + production build and 909/909 tests passed. Final strict TypeScript + production build and **921/921 full tests pass**, zero failures/skips/cancellations. Twelve new tests cover preset/default/extension validation; legacy restore; every preset through native and actual recovery worker; Studio/AR separation and exact desktop restoration; grid frame/rays/framing; identical binary GLB output; all World layouts with every active tool; scaled real menu UV rays and neutral-trigger arming; shared mirror/snap and busy guards; real session controller exit/re-enter; unsupported AR; diagnostics/performance/UI-scale actions. Existing 909 regressions include brushes, Clay ownership, released Stamp queue, spline, Move, remeshing, controllers, native/export/recovery.

The first new grid test used exact floating-point bounds and compared fresh export-source closures by identity. Those assertions were corrected to a 1e-12 bounds tolerance and payload comparison plus validity guards. The corrected focused suite and complete suite pass; application behavior did not need changing for either assertion.

Actual browser fixture renders the application menu canvas and a Three.js sculpture/scene, with desktop poses. Warm Studio + grid selected successfully; AR simulation shows the CSS checker behind a transparent scene and hides the grid; returning to Studio restores Warm Studio/grid. Guides/Preferences navigation and the selected UI size were inspected. Main application startup rendered the starter sphere and all existing controls; no warning/error console messages observed. Existing local recovery was left untouched.

Host browser sample: 360 unchanged settings/menu updates **1.90 ms total CPU**, p95 **0.000 ms**, maximum **0.300 ms**, **zero menu repaints**, same Color and grid geometry retained. Browser-clock quantisation affects these figures; one sample, excluding renderer and all Quest/GPU costs. Ground guide adds one line draw call when visible. Existing production >500 kB bundle advisory remains; no dependency added.

Evidence:

- [Warm Studio and grid](../outputs/phase-4-3/studio-warm-grid.png)
- [Simulated AR transparency (not camera passthrough)](../outputs/phase-4-3/simulated-ar-transparent.png)
- [Guides with Large selected](../outputs/phase-4-3/guides-large.png)
- [Host browser probe](../outputs/phase-4-3/browser-probe.txt)
- Build, baseline, focused/full test logs and protected-code check in the same directory.
- Reproduce fixture with Vite at `/scripts/fixtures/world-settings.html`.

## Limitations

No physical Quest test or real AR camera compositing measurement has been performed. Desktop fixture UI scale selection does not simulate angular size; automated menu tests verify plane scaling and ray alignment. World settings are project-scoped and available in the VR menu; desktop retains its existing environment/diagnostics controls. Grid extent/spacing/opacity are fixed, anchored to entry bounds (does not continually move as you sculpt); custom colours are not implemented. Mode changes intentionally require leaving XR and clicking Enter again. Browser canvas appearance does not establish stereo legibility, ray comfort or headset performance. Existing sculpt latency and pending prior-phase acceptance limitations remain.

## Quest 3 acceptance — every step PENDING

1. [ ] Enter Studio mode on Quest 3 / Touch Plus controllers.
2. [ ] Hold Support stick Up, select World Settings, visit all four sections.
3. [ ] Select every background preset; confirm immediate scene change.
4. [ ] Return to Neutral Grey and verify the existing default is available.
5. [ ] Check labels, checkmarks, hover states and rays against dark/light backgrounds at both UI sizes.
6. [ ] Toggle ground grid; grab/rotate/scale/reset workspace and confirm guide follows; confirm rays still reach sculpting targets.
7. [ ] Change mirror enable/normal/offset and angle snap; verify the same values in existing Tool Options.
8. [ ] Select Passthrough, exit XR and click Enter Passthrough with a fresh gesture (or verify unsupported message).
9. [ ] Confirm real room remains visible with no opaque Studio backdrop or ground grid.
10. [ ] Return to Studio through exit/fresh Enter; selected background/grid return and sculpture state remains.
11. [ ] Save and reopen the project through the existing native project workflow.
12. [ ] Verify chosen background/grid/UI scale persist; check recovery and a legacy file's Neutral Grey default.
13. [ ] Verify Clay, Single/Continuous Stamp (including released queue tracking loss), Move and Tube/Edit Spline still work; confirm Undo/Redo and export.
14. [ ] Operate every World control with trigger held/released around entry/exit; confirm no accidental sculpt/transform/history action and unchanged grip/stick shortcuts.

## Roadmap retained

Phase 4.4 — Mirror Grid and Turntable/Lathe. Phase 4.5 — VR Reference Images. Phase 4.6 — Three-Point Lighting and Editable Light Rigs. Later — Sculpting Masks, Advanced Layers and Colour Painting. None started automatically.

## UI-size follow-up (2026-10-29)

Small is retired. The default retains the native `normal` key but now scales all UI roots by 1.25 (previously 1.15); Large remains 1.35. World Settings → Preferences has a selected **Large UI · On/Off** toggle; Off uses Default. The existing header shortcut toggles the same two states. Desktop diagnostics and browser previews expose only Default/Large. Old `small` metadata migrates to `normal` on load; old `large` stays Large. Defaults remain omitted from saves. No history actions or workspace/sculpture scaling changes.

Strict TypeScript/Vite build and **923/923 tests pass**, including binary legacy-Small migration and toggle/busy/selected-state regressions. Existing persistence/recovery and scaled-ray tests now exercise both sizes. Browser canvas toggle verified; physical size/comfort retest pending. Evidence `outputs/ui-size-toggle/`. No commit/push/merge.
