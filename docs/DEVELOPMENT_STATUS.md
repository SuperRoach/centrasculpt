# Development Status — Centra Sculpt / vrappPOC

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
