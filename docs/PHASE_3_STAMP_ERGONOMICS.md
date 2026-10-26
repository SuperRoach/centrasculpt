# Phase 3.5 — Stamp ergonomics and continuous stamping

2026-10-27. Functional implementation delivered. Automated validation complete; **Quest 3 acceptance and continuous-stamp frame responsiveness remain open**. No commit, push or merge. Incoming Git tree was clean; existing files were preserved.

## Interaction and transforms

Tool grip in Stamp captures the current stamp world pose. While held, the shape stays anchored and the controller can move/rotate relative to it. Attachment is recomputed as `inverse(controller × working-point translation) × captured stamp pose`, with the legacy numeric wrist rotation removed before storing the quaternion. Releasing grip preserves the attachment; there is no reference-transform reset or geometry edit. Move the controller's working point to the pyramid tip/base/edge to make that feature the contact point. Reset Stamp Offset clears attachment translation, quaternion and numeric wrist rotation.

Preview and commits share `definitionAt`: controller world pose × physical 12 cm working-point translation × attachment position/quaternion × numeric wrist rotation, inverse-converted through the active surface's complete world matrix. Shape dimensions and uniform scale remain source-layer units, as before. Workspace navigation, layer transforms and handedness are independent of stored attachment preferences. Ghost geometry remains cached and excluded from project/export geometry.

Single remains the default: release arms; a deliberate press stamps once; holding cannot repeat. Continuous captures the initial stamp, then samples controller segments with linear position and shortest-arc quaternion interpolation. The distance metric includes controller translation plus an angular arc term based on shape size, attachment reach and working-point reach. Spacing defaults to .35 of the smallest effective dimension, selectable .05–3. Pure wrist rotation can emit samples; an unchanged pose cannot. Residual distance carries across frames and is normalized at floating-point boundaries. The release frame contributes its final segment.

Queued controller poses are processed at most two per update, with a 4 ms admission deadline checked between whole stamps. Release drains queued poses before publishing one history action. A re-press during drain cannot merge another hold into the previous action. The 4,096-sample stroke cap rejects/cancels rather than silently dropping path sections; start a shorter stroke after release. Sampling cannot recover an unobserved curved path between XR frames; it interpolates the tracked endpoints.

## Source and history

The same `prepareStamp` exact SDF kernels, symmetry, dirty-chunk invalidation and remeshing are used for Single, Continuous and desktop. Continuous calls `stampShape(value, true)` inside a layer-bound stroke transaction. Packed sorted typed-array deltas merge earliest-before/latest-after values, avoiding the brush recorder's per-voxel Map overhead. Growth remaps both the in-flight packed history and existing history. Release commits once; cancellation rolls back all samples, retaining harmless expanded capacity according to existing growth semantics. Other layers remain independent. No native format version change: optional validated `stampAttachment` tool preferences preserve position, normalized quaternion, mode and spacing in manual files and Phase 3.4 recovery. Older preferences default to Single/.35/identity attachment.

Tool grip adjusts only Stamp; Transform Layer retains exclusive layer-grab behavior. Support grip and both-grip navigation take priority. Menus, diagnostic-panel ownership, workspace grabs, tracking loss, tool/role/project/layer changes and session termination block/cancel stamping and require trigger release before retry. Tool-stick sizing and Support-trigger alternate routing remain shared with existing tools. Reset, mode, spacing, dimensions, shape and operation use contextual shared Tool Options, with pagination.

## Changed files

- `src/xr-shape-stamp.ts`: grip anchor, shared attachment conversion, bounded pose sampling/draining, Single latch and cancellation.
- `src/editor-tool-state.ts`, `src/tool-preferences.ts`, `src/xr-menu-model.ts`: shared attachment preferences, validation/defaults, mode/spacing, reset and instructions.
- `src/history.ts`, `src/independent-layers.ts`: packed stamp transactions, growth remapping, exact rollback and one-action commit.
- `src/xr-controllers.ts`, `src/xr-actions.ts`, `src/xr-experience.ts`: Stamp grip arbitration and updated controller instructions.
- `tests/xr-shape-stamp.test.mjs`, `tests/xr-menus.test.mjs`, `tests/recovery.test.mjs`: new behavior, pagination, real controller bridge and recovery contracts.
- `scripts/benchmark-continuous-stamps.mjs`, `outputs/phase-3-5-continuous-stamp.json`: reproducible CPU measurements.
- This guide and `docs/DEVELOPMENT_STATUS.md`: handover and acceptance status.

## Validation and measured limits

Commands: `npm run build` (strict TypeScript + Vite), `npm test`, `npm run test:worker`, `git diff --check`, `node scripts/benchmark-continuous-stamps.mjs`.

Final full suite: **757/757**. Actual-worker Move contracts: **89/89** on isolated rerun. Build/TypeScript and whitespace pass; existing Vite bundle-size advisory remains. An earlier worker run concurrent with the full suite had one Move-preparation timeout (88/89); the isolated rerun passed. New tests cover translation/quaternion adjustment, no-jump transitions, pyramid tip/base, reset, native/recovery settings, all shapes and both operations, fast versus subdivided paths, stationary behavior, orientation interpolation, spacing, exact undo/redo, rotated/scaled parents, negative growth, controller bridge with either hand, menu/grip/tracking cancellation, stroke cap, 128³ packed history and memory rejection rollback. Existing Clay/Smooth/Move, Boolean/Bake, desktop and GLB regressions pass. No physical headset test claimed.

Benchmark: Mac Node CPU, single observation per case, .9-unit fast path, .25/.3 dimensions, .35 spacing, dense 64³ and 128³. All 16 cases emitted 11 stamps and one history action. Summed evaluation/remesh milliseconds:

| Resolution | Shape | Add eval / mesh | Subtract eval / mesh |
|---|---|---:|---:|
| 64³ | Sphere | 137.9 / 29.1 | 72.6 / 134.7 |
| 64³ | Box | 138.7 / 19.7 | 49.4 / 131.1 |
| 64³ | Prism | 371.2 / 20.2 | 55.1 / 136.8 |
| 64³ | Pyramid | 328.8 / 20.8 | 53.3 / 121.6 |
| 128³ | Sphere | 906.1 / 57.4 | 383.9 / 56.8 |
| 128³ | Box | 854.4 / 74.0 | 375.5 / 66.3 |
| 128³ | Prism | 2958.6 / 74.3 | 425.4 / 67.5 |
| 128³ | Pyramid | 3089.3 / 88.4 | 831.0 / 242.4 |

Per-stamp maxima across cases were **21.96–621.14 ms**. These are synchronous CPU measurements, not XR frame times, peak memory or Quest performance. Scheduling bounds stamp count and queued memory, **not the duration of one SDF evaluation, packed-history merge, growth allocation or remesh**. Exact CSG can change far-field samples and scan much more than the visible shape AABB. Large/high-detail continuous strokes can pause tracking and trail behind the hand. The performance requirement is therefore only partially satisfied; a worker/cooperative staged Stamp pipeline and scheduled mesh publication are still needed before claiming Quest frame responsiveness. Resource rejection cancels the unfinished stroke safely. No new persistent sparse-storage implementation was added; existing dense/volume adapters are retained.

## Physical Quest 3 checklist — pending user verification

1. Open the app in Quest Browser/WebXR with Touch Plus controllers; select Stamp and Pyramid.
2. Hold Tool grip; verify the shape stays anchored while moving/rotating the controller.
3. Move the controller working point to the pyramid tip.
4. Release grip; move the controller and verify the adjusted attachment remains without a release jump.
5. Trigger-stamp at several wrist orientations; confirm preview/contact matches the committed shape.
6. Repeat grip adjustment to align the flat base (then an edge).
7. Use Reset Stamp Offset; verify default attachment and numeric wrist rotation return.
8. In Single, hold trigger stationary and while moving: exactly one stamp; release/re-press adds one more.
9. Enable Continuous; hold trigger and draw a path using each shape, Add and Subtract.
10. Draw a quick straight path; allow pending samples to finish after release and check spacing has no gaps caused by speed.
11. Increase/decrease spacing; compare separated and overlapping patterns. Hold still: no new stamps.
12. Turn the wrist while drawing, including with an adjusted attachment; check interpolated orientation. Repeat after workspace scaling/layer rotation and with the other dominant hand.
13. Undo/Redo once per completed continuous stroke. Check another layer, hidden/locked targets, save/load and a recovery checkpoint.
14. Confirm Support-trigger alternate, Support-grip workspace grab, both-grip scale/rotation, menus and Tool-stick resize. Confirm Tool grip moves a layer only in Transform Layer. Exercise tracking interruption/session exit; retry requires release. Recheck Clay/Smooth/Move and GLB export.

Record headset frame timings, queue lag, thermal behavior and user results; functional Mac tests do not establish these outcomes.

## Next work and roadmap

First resolve the continuous-stamp synchronous work limitation with cancellable worker/cooperative staging, bounded history merge/publication and measured Quest traces. Preserve exact field values and rollback semantics. Then **Phase 3.6 — Studio/Passthrough switching**, **Phase 3.7 — Phase 3 acceptance testing**, **Phase 4.0 — Advanced Brushes**, **Phase 4.1 — Procedural Spline Tubes**. Physical acceptance remains pending, including Phase 3.4 long-session checks.
