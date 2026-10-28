# Phase 4.4 — Mirror Grid and Turntable / Lathe

Implemented 2026-10-29. Physical Quest 3 / Touch Plus acceptance **PENDING**. No staging, commit, push or merge. Incoming Git status was clean. Baseline strict production build and all 923 tests passed.

## Controls and mirror design

Hold Support stick Up → World Settings. Guides and Constraints retains shared symmetry enable, normal, offset and angle snap. **Mirror guide appearance** opens Grid / Outline / Hidden, source-unit spacing (0.05 / 0.1 / 0.2 / 0.5 / 1) and opacity (10 / 22 / 35 / 50 / 80%). Default: Grid, spacing 0.2, opacity 22%. Hidden hides the entire guide and its handles, while leaving symmetry enabled. Choose Grid or Outline to drag the offset again.

The mirror face, subtle grid, stronger centre axes, red border and existing volumetric red centre handle share the original layer-local mirror transform. X/Y/Z normals and offset are unchanged. Grid intervals are converted into normalized guide coordinates so the chosen interval remains in source units. The face uses a very low-opacity fill; grid/axes use translucent non-tone-mapped lines with no depth writes. The handle retains its foreground visibility and edge-on grabbing. Studio and transparent AR use the same geometry and materials. Physical contrast against real rooms still needs acceptance.

Grid geometry is cached by guide size/spacing; only settings or extent changes rebuild it, disposing the previous geometry. Axes are static. All guide geometries/materials dispose with their owner. Helpers stay outside source/export roots; line raycasts are disabled and original border/handle interactions remain. No symmetry kernel changed.

## Turntable architecture

Hierarchy: `workspaceRoot → turntable.group → sculptureRoot → existing source/composite roots`. Navigation, reset view and two-hand scale still operate on workspaceRoot. The dedicated child applies `T(pivot) × RY(angle) × T(-pivot)`. It never rewrites voxels, layer metadata, history or export transforms. The static Studio ground reference remains a workspace sibling of the rotating group. Ordinary presentation updates neither invalidate chunks nor allocate source geometry.

World Settings → **Turntable** provides Enable, direction, 0–12 RPM in 0.5 RPM steps (default 2), Pause/Resume, Reset angle and Pivot. Clockwise is viewed from above the positive Y axis. Default pivot is the entry sculpture bounds centre. Pivot → Sculpture centre recalculates current visible source bounds; XYZ ± controls reposition it by 0.05 source units. The Y axis belongs to the workspace, so it follows workspace reorientation.

Enabled/paused/current angle are transient. New session entry, exit and project replacement disable/reset rotation. Disabling presents the sculpture at angle zero; enabling can resume the current session angle. Reset angle changes only presentation. Speed, direction and chosen pivot persist as optional display preferences.

**Ownership policy:** freeze rotation during workspace/layer/Stamp-attachment grips, menus, mirror-handle dragging and active Move/Tube/Edit Spline gestures. Existing grip/menu takeover cancels and rearms an unfinished sculpt stroke; finish/release the stroke before opening settings. Rotation resumes from the held angle after manipulation. Manual workspace/layer edits still invalidate an existing source transaction; turntable motion alone does not. Tracking/visibility loss freezes the clock and rearms input through existing controller routing. Gaps above 250 ms are dropped, with no suspended-time replay.

## Sampling and latency

XR presentation advances after menu/navigation arbitration and before the sculpt adapter. Each Clay/Smooth/continuous-brush frame reads the actual current source world matrix, converts the current working point to local coordinates and supplies time-stamped samples. A stable guard removes only the presentation ancestor from transaction comparison, preserving detection of workspace and layer edits.

`RotatingStrokeSampler` interpolates the world working point and target quaternion between frame times, then inverts the interpolated target transform at each sample. With an off-centre pivot it follows the pivot arc, rather than interpolating target translation along a chord. Admission uses controller distance plus rotation arc length and at most 0.2 brush-radius spacing, with a maximum of 64 samples per update. Over-budget motion cancels safely with a reduce-RPM/increase-radius message; it does not build an unbounded replay queue. Existing CPU-gap accounting and two-chunk / 3 ms XR mesh admission remain.

Default free-space Clay Add/Subtract uses existing constructive swept kernels; Smooth and compatible continuous brushes retain their existing kernels/time integration. Stationary Tool input therefore draws a ring; vertical Tool movement draws a helix. One source transaction remains one Undo action. Long unbuffered ordinary lathe strokes compact only their display trails at 8,192 stored points; all source applications and one history owner are retained. Controller telemetry is also bounded. Steady/Line and staged Pinch/Crease keep their existing 8,192-sample safety limit; their path/replay behavior remains intact. Buffered paths still apply on release.

Continuous Stamp converts each current controller pose through the live inverse source frame into its captured stroke frame. Spacing includes relative positional and rotational motion, so a stationary hand emits stamps while the source rotates. Queued poses retain their original local placement while presentation continues. Admission is at most 64 new stamps/update, 256 queued stamps and the existing 4,096 total stroke limit. The existing cooperative generator and two-chunk rebuild pump drain captured work, including after an observed release followed by tracking loss. Single remains one stamp per press. No procedural spline source points change from idle rotation; active spline/Move gestures freeze presentation.

## Persistence and export

The optional `display.world` version-1 extension gains strictly validated `mirrorGuide: {mode, spacing, opacity}` and `turntable: {rpm, direction, pivot}` records. Legacy defaults and the native project envelope remain unchanged. Snapshot deep-copies nested preferences; native and actual recovery worker round trips preserve them. Enabled, paused and angle are excluded. Default world metadata remains omitted. Recovery/save/export still use source geometry and saved layer transforms, independently of the scene hierarchy. Binary GLB identity during rotation is tested.

## Files

- New `src/turntable.ts`, `tests/turntable.test.mjs`, `scripts/benchmark-turntable.mjs`, `scripts/fixtures/turntable.html`, this handover.
- Extended `src/world-settings.ts`, `src/display-preferences.ts`, `src/xr-scene.ts`, `src/xr-world-menu.ts`, `src/xr-experience.ts`, `src/xr-controllers.ts`, `src/xr-mirror-plane.ts`, `src/xr-clay-stroke.ts`, `src/clay-stroke-session.ts`, `src/xr-shape-stamp.ts`, `scripts/compile-core.mjs`.
- Updated the explicit hierarchy assertion in `tests/webxr.test.mjs` for the new presentation ancestor, and `docs/DEVELOPMENT_STATUS.md`.

## Validation and performance

Final results and exact measurements are recorded in `outputs/phase-4-4/`. Commands: `npm run build` (strict TypeScript + Vite), `npm test -- --test-concurrency=4`, `npm run benchmark -- outputs/phase-4-4/source-benchmarks.json`, `node scripts/benchmark-turntable.mjs`, `git diff --check`.

**Final strict TypeScript/Vite build and 954/954 full tests PASS**, zero failures, skips or cancellations. One unconstrained run alongside the build hit the existing Move preparation wall-clock guard (50 ms); no Move budget or implementation was changed. The final sequential build and complete suite with four test processes pass. An earlier hierarchy assertion was updated for the intentional presentation ancestor; its large Three object diff initially obscured that failure.

Automated coverage adds 31 deterministic tests: plane/axes/handle alignment on all three normals, visibility/spacing/opacity, unchanged reflection, clock signs/speed/pivot, pause/reverse/suspension, 15/30/60/90 Hz analytic helical coordinates, bounded sample admission, real mirrored Add/Subtract rings at 64³/128³/192³, exact Undo/Redo, real helix and Smooth, workspace cancellation and tracking-loss redo retention, Single/Continuous Stamp, menu hit rectangles/actions, strict native/recovery preferences, identical binary exports/no remeshing at all three resolutions, expanded negative lattices with transformed layers, both physical handedness routes and two-hand scale/pause, long slow holds, and off-centre sub-frame pivot arcs. Prior brush, advanced deformation, source/history, recovery, controller, spline and mesh tests remain in the full suite.

Host-only single-run probe (no renderer/GPU or Quest):

| Resolution | 900 presentation + cached guide updates, total CPU | Lathe update p95 / max | Lathe drain updates |
| --- | ---: | ---: | ---: |
| 64³ | 3.424 ms | 4.042 / 8.610 ms | 7 |
| 128³ | 0.981 ms | 4.471 / 6.892 ms | 14 |
| 192³ | 0.642 ms | 6.663 / 8.199 ms | 16 |

Lathe probe: mirrored free-space Clay ring, radius 0.12, strength 1, 12 RPM, 150 controller poses at 30 Hz, 301 source samples. Every run ends with one history action and zero dirty chunks. Presentation-only portion produces zero remeshing and unchanged source arrays/mesh identities. Warm-up/order affects host timings; these are observations, not headset frame-rate claims or hard CPU deadlines.

Representative existing source benchmark at 64/128/192: brush medians 0.33/0.93/1.66 ms; Smooth medians 0.33/0.66/1.55 ms; local mesh medians 12.2/7.9/6.7 ms. Inactive sources remain unchanged and metadata transforms cause no remeshing. See JSON for full conditions.

Browser fixture uses actual menu canvas, Three scene rig and mirror guide. Studio and simulated transparent AR grid/Hidden states were checked; Hidden retained Symmetry On and zero history. Turntable enabled through the rendered menu and the displayed angle advanced. Browser evidence is a desktop simulation, not physical passthrough. Initial fixture imported two Three instances; its import was unified with app modules. No production dependency added. Existing Vite >500 kB bundle advisory remains.

## Limits

Physical Quest tracking, contrast, smoothness, FPS, thermal behavior and latency remain unverified. The repository has expanded dense VolumeStore storage with sparse history/chunking; there is no separate sparse-volume backend to exercise. Fast rotation with a small brush can require substantially more SDF work than ordinary hand movement. Source allocation, a brush kernel batch, a mesh chunk and final history work are still indivisible; the admission budgets are cooperative, not hard deadlines. Excess motion/queue admission cancels safely rather than dropping sculpture samples. Buffered/advanced stroke safety limits remain as above. The default centre is an entry-time anchor; use Pivot → Sculpture centre after large geometry changes. There is no arbitrary rotation-axis control or draggable pivot gizmo; numeric XYZ ray buttons provide repositioning. Menu/grip takeover keeps existing stroke cancellation semantics. The mirror guide retains the original bounded extent, so very large expanded sculptures may extend beyond it.

## Quest 3 physical acceptance — all PENDING

1. [ ] Enter Studio; enable Mirror through Tool Options or World Settings → Guides.
2. [ ] Confirm subtle grid and stronger central axes align with symmetry, including X/Y/Z normals.
3. [ ] Drag the red centre handle (also edge-on); verify offset and mirrored sculpt location follow it.
4. [ ] Change spacing and opacity through Mirror guide appearance; check both UI sizes.
5. [ ] Select Hidden; sculpt and verify symmetry still applies. Restore Grid.
6. [ ] Open World Settings → Turntable using Support stick and Tool ray.
7. [ ] Enable at 2 RPM; verify sculpture rotates about its centre.
8. [ ] Confirm smooth tracking and guide alignment while rotating.
9. [ ] Reverse direction; verify the object reverses.
10. [ ] Pause/resume and Reset angle; test XYZ pivot offsets and Sculpture centre.
11. [ ] Close menus; free-space Clay Add, stationary Tool hand, hold through a revolution.
12. [ ] Release/settle; inspect a continuous circular ring without gaps.
13. [ ] Repeat while slowly moving Tool hand vertically.
14. [ ] Release/settle; inspect a continuous spiral. Repeat with Smooth over a suitable ridge.
15. [ ] Test Subtract and exact one-action Undo/Redo. Test Single and Continuous Stamp, including released-queue tracking loss.
16. [ ] Grab with Support hand, then both grips to scale/rotate: rotation freezes, unfinished stroke safely cancels/rearms, workspace releases without a jump, rotation resumes.
17. [ ] Repeat Studio/Passthrough contrast checks. Check tracking loss, menus, Move, advanced brushes and Tube/Edit Spline do not corrupt source data.
18. [ ] Save/reload and recovery: guide/speed/direction/pivot return; Turntable starts disabled and source geometry/export has no baked rotation.

## Next phases

**4.5 — VR Reference Images**; **4.6 — Editable Three-Point Lighting / Light Rigs**. Later: Sculpting Masks, Advanced Layers, Colour Painting. Keep presentation helpers separate from source/export roots and retain existing ownership and cooperative work scheduling.
