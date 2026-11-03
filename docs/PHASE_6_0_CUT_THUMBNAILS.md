# Phase 6.0 — Plane Cut and project thumbnails

Updated 2026-11-03. Host implementation and automated validation complete. Physical Quest 3 acceptance remains pending.

## 1. What changed

- Added Cut as the tenth radial tool in the main VR Tool Wheel, with a split-plane icon. All existing tools remain available; radial cards retain their 156×118 logical-pixel size, Options uses its full 280×144 centre card, and Mask, Paint and Project footer controls retain their targets. VR offers axis, tilt and offset controls, an active-layer/all-editable scope, and a review screen.
- Added a matching desktop Cut action. Both interfaces show the cutting plane and its placement before applying. Confirmed cuts operate on authoritative SDF samples and create separate negative and positive half-space intersections. The positive piece is a new independently editable layer beside its source, with the same local transform, parent, Boolean operation and nearby surface paint/mask values. Newly exposed faces use nearby inherited paint; there is no separate cap-colour picker.
- “All editable” means every visible, effectively unlocked, dense SDF layer in the project. It includes descendants whose parent is visible and unlocked. A project with a selected group must first select a layer. Unsupported Intersect targets reject the batch and roll earlier staged cuts back. The batch is one Undo/Redo action.
- Save and Save As request a clean 256×256 offscreen sculpture preview. It uses visible committed layer meshes, bounds-based orthographic framing and neutral lights/background. Compressed WebP/JPEG metadata is capped at 32 KiB and uses smaller dimensions/quality as fallback. Save failure during preview keeps the save moving; an existing thumbnail is retained for ordinary Save. Preview data is stored in browser-local project metadata, not the portable `.form` file. Desktop and VR library rows and the desktop selected-project view show previews or placeholders.

## 2. Architectural decisions

The plane is transformed into each source layer’s local coordinates; the source grid dimensions, expanded lattice origin and SDF resolution are retained. Each output field is computed as the maximum of the source field and one signed plane half-space. This keeps the negative-inside convention and creates the cap from the implicit field before incremental remeshing. Layer masks and paint pages are clipped to each piece, with a two-voxel surface margin for cap inheritance. Preparation is staged, cancellable and revision-checked; publication replaces source runtimes only after both meshes fit project voxel, triangle and memory budgets. Failed batches replay their staged history backwards. Deleting a cut source/result invalidates the associated cut history to avoid stale references.

Thumbnail capture clones only the visible layer presentation into a disposable scene and render target. It saves and restores renderer target, clear state and XR enablement before awaiting asynchronous GPU readback. The library continues to list metadata without decoding project voxel payloads; existing atomic IndexedDB payload/metadata transactions and revision conflict checks remain in use.

## 3. Build and test results

Baseline strict TypeScript, production build and full suite passed at **1,298/1,298**. Final `npx tsc --noEmit --strict`, `npm run build`, and full suite passed at **1,311/1,311**, with no failures, skips or cancellations. The existing Vite advisory for the 1.32 MB main bundle remains.

New automated coverage includes centre/offset/rotated and expanded sparse-lattice SDF half-space cuts and cap signs, grouped/local transforms, paint and masks, individual STL boundary/nonmanifold/inconsistent-edge print diagnostics, one-action undo/redo, active and all-editable layer counts, cancelled preparation, multi-layer rollback, thumbnail compression and 32 KiB metadata, renderer restoration/XR async readback, save fallback, project list metadata-only access, direct wheel ownership and preserved radial/footer hit targets.

## 4. Benchmarks and regressions

One host integration cut (including preparation and remeshing) completed in **139.7 ms at 64³** and **937.7 ms at 128³**. Resulting independent layer counts were two in both cases; measured retained runtime/history memory was **11,812,992 bytes** and **72,860,160 bytes**, respectively. These are single-run host fixture measurements, not headset frame-time or sustained-session results. Artifact: `outputs/phase-6-0/benchmark.json`.

## 5. Known limitations and blockers

The review stage previews plane placement, not the final two cut meshes; final cap and mesh appearance is shown only after apply. Freehand and wand cuts are deferred. The operation applies one explicit plane and does not mirror itself across the active symmetry plane. It splits connected/disconnected implicit fields into two half-space results rather than extracting each disconnected component as its own layer. Per-piece STL diagnostics are covered on test fixtures, but there is no automatic print repair or universal printability guarantee; inspect the actual exported pieces and their print report in the intended slicer. Source-limit, cancellation and batch-error rollback are guarded, but a forced allocator/GPU failure was not injected in automated tests.

Thumbnail capture failure leaves Save available and uses the existing/placeholder preview. Devices without asynchronous render-target readback use the renderer’s synchronous fallback, which can briefly occupy the host render thread. The thumbnail is a preview, not a portable asset. Actual desktop and headset visual quality has not been accepted by a person. Quest 3 Tool Wheel reachability, both-hand hit targets, Studio/Passthrough, lighting/turntable interaction and sustained GPU/resource behavior remain physically unverified.

## 6. Next recommendations

On Quest 3, verify direct Cut reachability and target ownership in both hands; set and adjust the plane, cancel, apply, edit both pieces, and Undo/Redo once. Repeat for a nested child and for all-editable scope, including a hidden/locked group ancestor. Save and Save As during an XR session, confirm previews appear in desktop and VR libraries, and check renderer responsiveness on devices with and without async readback. Export each cut piece as STL, review its print report and inspect it in the target slicer. Record physical results before release approval.

No commit, push or merge was performed for Phase 6.0.
