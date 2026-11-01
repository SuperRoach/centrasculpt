# Phase 5.4 — Release readiness review

2026-11-01. **Not release-ready: physical Quest 3 acceptance remains pending.**

## Evidence and audit boundary

Baseline: strict TypeScript and production build passed; 1,276/1,276 tests passed. Final: strict TypeScript and production build passed; 1,280/1,280 tests passed, zero failures/skips/cancellations. Four new deterministic tests cover disclosure structure/default state, keyboard event isolation, safe arbitrary text, complete long content, focusability, raw import, phase ordering, location and existing export controls. Native browser behavior is checked separately; the unit fixture does not simulate native disclosure activation or layout.

Host browser: app starts with a 64³ sphere / 31,536 triangles; What's New appears immediately after Print Report, collapsed. Click expands the actual Markdown history and Enter collapses it. Existing recovery available notice was preserved; no Restore/Discard action taken. XR entry is disabled and Passthrough unavailable in this browser, so neither was physically exercised.

Full-suite regression audit (passing host coverage, **not physical acceptance**):

| Workflow | Evidence exercised by full suite | Remaining validation |
| --- | --- | --- |
| Startup / XR entry / Studio / Passthrough | webxr, world-settings, vr-polish, xr-tls | Actual session entry, permission and composition |
| Both tool hands / input ownership | xr-controllers, xr-support-shortcuts, xr-alternate-haptics, workspace-grab | Optical/controller timing and neutral-trigger rearm |
| Clay / Smooth / advanced brushes | sculpt, advanced-brush, crease-brush, pinch-brush, clay-steady | Visible response across resolutions |
| Move / Elastic / Rotate/Twist | move-worker, elastic-integration, rotation-integration, rotation-move | Release reconstruction and cancellation on device |
| Stamp / Tube | shape-stamp, xr-shape-stamp, procedural-tube | Controller placement and spline editing |
| Masks / colour | sculpt-masks, sculpt-paint, project-colours | Optical fallback and exported appearance |
| Groups / transforms / duplication | advanced-layers, layer-transforms, independent-layers | Nested assembly manipulation |
| Images / STL references | reference-images, reference-desktop, stl | Actual bitmap decoding and headset import stalls |
| Lighting / Turntable | lighting, turntable, render-style | Real Passthrough and anchor behavior |
| Projects / save / load / recovery | project-library, project-workflow, recovery, save-status | Browser storage quotas, sleep/resume |
| GLB / STL / print reports | export-quality, export-filename, stl | Device downloads and actual slicer import |

Code review checked export snapshot currentness/cancellation and worker termination, Move worker cleanup, reference geometry/material/texture release and dead-load guards, and XR-to-browser ready/busy handoff. Existing tests cover stale jobs, source preservation, transformed geometry/colour, references excluded from exports and native/recovery round trips. No reproducible high-priority engine failure was found in these host checks. This does not establish absence of GPU leaks or hardware-specific failures.

What's New uses native details/summary semantics and textContent, retaining the complete newest-first source in a focusable region with a 20rem scroll limit. Keyboard events within the panel do not reach global sculpt shortcuts. It has no render-loop work, parser, dependencies or animations. VR currently provides command surfaces rather than an appropriate scrolling document reader; no new Tool Wheel item or XR reader was added. History is available in the desktop sidebar after leaving XR.

## Physical Quest 3 acceptance — all PENDING

Use a disposable project and portable backup. Record commit/build, Quest OS/browser, refresh rate, tool hand, environment, resolution, layers/reference counts, power state and test date. For every row record PASS/FAIL, reproduction steps and capture path. Repeat controller cases for **left and right tool hands in Studio and Passthrough**.

- [ ] Enter/exit XR, deny/retry permissions, lose/regain tracking and sleep/resume. No unintended strokes; triggers must rearm neutrally.
- [ ] Clay, Subtract, Smooth, Flatten, Inflate, Scrape, Pinch and Crease: short/continuous strokes, strength/radius/hardness, Undo/Redo and support-trigger alternates.
- [ ] Move, Elastic Move and Rotate/Twist: preview, release, cancel, menu/tracking interruption and project switching while pending. No stale result publication.
- [ ] Stamp placement/rotation/repetition and procedural Tube point/radius edits. Cancel without residual strokes.
- [ ] Paint/Erase and Mask/Erase; first-paint fallback, Move during refresh, Undo/Redo and saved colour/mask restoration.
- [ ] Nested layer groups: reparent, lock/hide, duplicate, translate/rotate/scale, Boolean and bake. Verify original layers survive cancellation.
- [ ] Image and ASCII/binary STL references: import, selection, lock/hide, opacity/wireframe, transform and both anchors during Turntable. References must never sculpt or export.
- [ ] Lighting and Turntable: change modes and Studio/Passthrough repeatedly, including during active edits. No ownership or session errors.
- [ ] Project Browser: create/save/open/duplicate/import/export, quota/error paths, recovery restore, interrupted save and sleep/resume. Compare geometry, colours, groups and reference bytes/placement after reopen.
- [ ] GLB and STL: current layer, visible layers and Boolean at each quality; busy/stale/over-budget/capped rejection, cancel and retry; browser download and XR re-entry. Confirm format, dimensions, winding, colours for GLB and reference exclusion.
- [ ] Print report fixtures: open surface, multiple shells, reversed shell, non-manifold, degenerate, thin walls and intentional cavities. Blocking diagnostics must prevent download; warnings remain visible. Import downloaded STL into an actual slicer in mm and verify size and unsupported checks.
- [ ] 30–60 minute session: repeat project switches, reference replacement, sculpt/paint and exports. Use Phase 5.2 capture procedure at 64³/128³/192³, recording p50/p95/p99/max intervals/CPU/input, queue drain and settled geometries/textures/memory every 20 minutes. Compare the same settled scene; investigate increasing plateaus, thermal slowdown or persistent jobs.
- [ ] Desktop history: click, Enter and Space disclosure; Tab to history and scroll; confirm other sidebar controls still work after collapse.

## Release blockers and limits

Physical checks above, long-session rendered performance/resource trends and slicer acceptance are outstanding release gates. No physical FPS, memory plateau or print success is claimed. Existing print limits remain: no self-intersection, minimum wall thickness, vertex-only manifold or shell-nesting detection; no automatic repair. STL has no colours. Reference setup/native hydration can still stall synchronously. Existing bundle-size advisory persists.

Maintain WHATS_NEW.md and the six-part handover for every completed phase/significant change; follow DEVELOPMENT.md. No commit, push or merge is authorized for this phase.

Follow-up host check: Space expands What's New; Tab focuses its history region and End is accepted there. Export current layer remains actionable with the panel expanded and produces a download link. This follow-up did not inspect downloaded bytes or establish print-report correctness; retain the existing STL deterministic evidence and physical download/slicer gates above.

Layer parenting follow-up: host browser drag attached Base copy under Base and displayed child indentation; accessible Attach / detach fallback returned it to root. Automated tests cover world-pose retention, inherited transforms/locks/visibility, nested collapse, cycle rejection, unchanged Boolean sequence, Undo/Redo, native v10 and recovery, parent deletion retaining children, and VR model attach/detach/cancel. Verify physical trigger drag/release, tracking loss cancellation and hover paging on both tool hands. Parent duplication currently duplicates its own sculpt layer, not the subtree. Existing folder groups are retained for compatibility.
