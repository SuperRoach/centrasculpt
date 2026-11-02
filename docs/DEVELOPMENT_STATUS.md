# Development Status — Centra Sculpt / vrappPOC

Updated 2026-11-01. **Phase 5.4 host implementation complete; release acceptance blocked on physical Quest 3 validation.**

## 1. What changed

Added collapsed-by-default What's New immediately below Print Report in the desktop left sidebar. Click, Enter and Space use native disclosure behavior; complete history scrolls within 20rem. WHATS_NEW.md is the single build-time source, newest first. DEVELOPMENT.md requires handover/changelog updates and strict TypeScript/build/full tests for future completed phases and significant changes.

Read Phase 5.2/5.3 handovers and verified actual STL code/tests before edits. Baseline working tree was clean at b1fb915; no existing changes overwritten. Previous export fixes are committed in that baseline. No commit, push or merge performed for Phase 5.4.

## 2. Architectural decisions

Vite raw import feeds a small DOM helper using textContent; Markdown headings and bullets render as safe DOM elements with no arbitrary HTML interpretation or parser dependency. Native details/summary supplies accessible expanded state and keyboard activation. A labelled focusable history region supports scrolling. Panel key events stop before global sculpt shortcuts. No sculpt scheduler, engine, worker, persistence or colour pipeline changes.

VR command surfaces have no equivalent scrolling document reader; history remains available in the sidebar after XR exit, with no added Tool Wheel command. Phase 5.2 staged paint refresh and two-chunk / 3 ms scheduler remain intact.

## 3. Build and test results

Baseline strict TypeScript, production build and **1,276/1,276 tests passed**. Final strict TypeScript/build and **1,280/1,280 tests passed**, no failures/skips/cancellations. Four new history tests cover placement/import/order, disclosure structure and default state, keyboard isolation, arbitrary text, long content, accessibility and existing export controls. Additional real-worker run: **89/89 passed**. Build retains existing bundle-size advisory.

Host browser startup passed (64³ / 31,536 triangles), actual disclosure click/Enter collapse and Markdown loading verified. XR/Passthrough unavailable on host. Existing recovery was left untouched. Logs: outputs/phase-5-4/. Full audit scope and physical checklist: [Phase 5.4 acceptance](PHASE_5_4_RELEASE_ACCEPTANCE.md).

## 4. Benchmarks and regressions

Existing 320-cycle host stress fixture completed successfully, including repeated native reloads and twelve asynchronous Moves; evidence in outputs/phase-5-4/stress.json and stress.log. This is an accelerated component fixture, not long-session headset validation or GPU leak proof. No new performance improvement claimed and no Phase 5.2 timing benchmark rerun. Full-suite coverage includes all major tools, both controller mappings, projects/recovery, references, export geometry/colour and print diagnostics. No reproducible high-priority engine failure found in host audit.

## 5. Known limitations and blockers

**Not release-ready.** All physical Quest 3 acceptance, real Studio/Passthrough transitions, optical/controller response, sustained resource trends and actual slicer checks remain pending. Host tests cannot establish absence of GPU leaks. Print validation still excludes self-intersections, wall thickness, vertex-only manifold contacts and shell nesting; no automatic repair or print-success guarantee. STL excludes colour. Reference setup/native hydration retain synchronous bounded work. See [Phase 5.3](PHASE_5_3_PRINTING.md) and [Phase 5.2](PHASE_5_2_PERFORMANCE.md) for quotas and measured host limitations.

## 6. Next recommendations

Execute the actionable [Quest acceptance checklist](PHASE_5_4_RELEASE_ACCEPTANCE.md#physical-quest-3-acceptance--all-pending) for both tool hands in both environments. Record evidence and fix reproducible failures before release approval. Retain Phase 5.2 captures for 30–60 minute sessions and verify downloaded STL dimensions in a slicer.

Every future phase/significant change must update this six-part status, add a dated user-facing WHATS_NEW.md entry newest first and pass strict TypeScript, build and full tests; see [development workflow](../DEVELOPMENT.md). No current permission to commit, push or merge.

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
