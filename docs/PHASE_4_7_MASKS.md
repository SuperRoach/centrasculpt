# Phase 4.7 — Sculpting Masks

Implemented 2026-10-30. Physical Meta Quest 3 acceptance **PENDING**.

## Usage and ownership

Use **Mask** below the VR Tool Wheel (the nine radial sectors and Move submenu are retained), or desktop **Mask Paint / Mask Erase**. The shortcut uses a half-shaded protection shield. Invert mask, Clear mask and Mask all are the first three wide option buttons, with Paint/Erase and overlay on the first page; placement, radius, strength, falloff hardness, Steady, straight line and mirror symmetry follow. Clear resets protection only. Tool trigger owns a continuous stroke; Tool thumbstick changes radius, including during an active stroke. Surface follow is available through the shared placement option. Release commits one action; tracking/session/menu interruptions cancel through the existing stroke transaction. Support-trigger alternate brushes do not override Mask.

The purple translucent tint indicates protection, including fractional weights. Hiding it does not change protection. Normal/Matte/Glossy use the same viewport shader hook. Studio and simulated transparent Passthrough were inspected on the host. References and light equipment use their own materials and remain outside this hook. The overlay is shown on source surfaces in **Separate Layers**; Boolean Preview remains a derived geometry view without mask tint.

Hidden/locked layers cannot be painted. A procedural tube must be **explicitly Baked to a Sculpt Layer** before painting; selecting Mask never bakes or regenerates it. Mask settings explain that requirement. Each sculpt layer has independent mask storage. Duplication copies mask values without shared writable pages. Uniform layer transforms preserve mask alignment; explicit resolution resampling samples the mask in the unchanged local domain. Existing nonuniform sculpting restrictions still apply.

## Architecture and history

`sculpt-mask.ts` owns layer-volume-local protection through a WeakMap, separate from SDF arrays. A uniform default plus lazy 256-sample Float32 pages avoids dense allocation for untouched, filled or cleared masks. Snapshots share immutable pages; first write to a snapshotted page copies only that page. Cleared uniform pages are reclaimed at snapshot boundaries. Invert toggles a polarity flag in constant time. Public values/serialization use canonical Float32 protection.

Mask strokes and global actions enter the existing cross-layer timeline as mask snapshot entries; normal sculpt payloads remain in SculptHistory. Redo invalidation, target routing and cancellation therefore share the existing command boundary. Mask history has a 100-action / 32 MiB conservative soft estimate; retain the newest action when it alone exceeds the estimate, matching the existing history convention. Active rollback snapshots and retained mask pages enter memory admission. The maximum supported volume bounds storage; no unbounded per-dab dense snapshots are retained.

SDF kernels blend the Float32 candidate with the old value using `1 - protection`. Protection 1 returns the original sample exactly. Clay Add/Subtract, free-space construction, Smooth, Flatten, Inflate, Pinch, Crease, Scrape and staged Shape Stamp use this rule. Reset Sphere remains an explicit whole-source reset command, rather than a masked brush. Painting itself never writes SDF samples, dirties the compositor or requests remeshing.

Mask dabs yield after 128 candidate voxels and use the existing cooperative ClayStrokeSession queue. Steady replay and cancellation use the same session. Mirror applicators use their union, so an overlap does not double paint strength.

Overlay changes update one scalar vertex attribute on existing intersecting source chunks. Dirty bounds include interpolation halo; round-robin completion prevents later chunks being starved by continuous painting. Main-frame work defaults to a 2 ms CPU budget, checked every 256 vertices. Uniform unmasked meshes need no overlay attribute. Material shader blending adds no mesh, raycast target or export object. A global inversion or initially loaded mask can take several frames to finish tinting a large surface; protection is authoritative immediately.

Move preview samples current protection before binding its shader. Non-Elastic/Elastic translation and Rotate/Twist damp vertex displacement by protection. Preview normals retain the existing field-normal approximation and do not include the mask gradient. Authoritative reconstruction also damps transformed triangle positions, then enforces protection at each destination SDF voxel. Both cooperative and actual-worker reconstruction receive masks. Source mask revision is part of the publication guard; a newer mask edit invalidates stale work. Cancellation and Move undo affect SDF state while preserving independent mask state. Growth copies/remaps mask samples and history restores snapshots into the current lattice, including negative coordinates. Newly expanded capacity inherits the mask's uniform default (Mask All / inverted unpainted space therefore remains protected).

Boolean operations derive geometry from SDF only. **Bake creates an unmasked output layer**, preserving original source masks; hidden source layers keep their masks and Undo restores visibility/selection. This avoids merging incompatible protection fields or embedding masks in geometry. Explicit procedural Bake similarly produces unmasked editable SDF.

## Persistence and export

Native **v6** is used when any layer has protection. It stores per-layer validated default, encoding, count and sequential byte offsets in bounded JSON metadata, followed by ordered sparse `(uint32 index, float32 protection)` records after SDF samples and before reference bytes. Uniform masks need no sample payload. Projects without masks retain existing v3/v4/v5 encodings. Versions 1–5 load entirely unmasked. Earlier application builds cannot open masked v6 projects.

The decoder rejects invalid encoding, defaults, counts, offsets, duplicate/unordered/out-of-range indices, nonfinite/out-of-range/noncanonical samples and truncated/trailing payloads. Native maximum byte admission accounts for the bounded mask payload. Recovery snapshots include immutable mask state and the real recovery worker uses the same codec. Existing recovery storage limits may reject very large checkpoints safely; manual save remains available. Existing user recovery checkpoints were left untouched.

Both GLB export paths build neutral geometry from position/normal data only. Mask pages, attributes, shader hooks and presentation state are excluded. Byte-identical GLB before/after painting is tested.

## Validation and host performance

See the six-part entry at the top of `DEVELOPMENT_STATUS.md` for final counts, build sizes and measurements. Baseline: clean Git checkout, strict TypeScript/Vite build and **1,029/1,029** tests passed. New mask regressions cover all eight brushes at 64³/128³/192³, fractional blending, stamp protection, stroke interpolation/falloff/symmetry, layer transforms/locks, negative expanded lattices, history/cancel, all four Move modes, worker reconstruction, stale revision rejection, native/recovery/legacy, multi-layer masks with lighting and reference assets, GLB byte invariance, menu routing, actual Tool trigger sessions, lazy attributes, bounded batches and cleanup. Existing lighting/reference/controller suites remain in the full run.

Reproduce with:

```sh
npm run build
npm test
npm test -- --worker sculpt-masks
node scripts/benchmark-masks.mjs
```

The benchmark records host CPU only at `outputs/phase-4-7/mask-benchmark.json`: 20 radius-0.3 dabs per resolution, generator-batch timings, mask bytes, affected-chunk overlay update cost, 1,000 polarity inversions, native payload growth and save CPU. An unlimited overlay update in that benchmark measures total affected-chunk work; production spreads it across budgeted frames. These are **not headset frame-time, GPU or thermal measurements**.

Browser fixture: `scripts/fixtures/sculpt-masks.html`; evidence `outputs/phase-4-7/masks-browser.jpg`. The fixture uses real source meshes, mask kernels, overlay material and XR menu view. Normal/Matte/Glossy, transparent background, masking/sculpting and Move preview shader were checked without shader errors. The actual application was also checked for Mask Paint/Erase and contextual desktop options. Browser automation did not restore, discard or overwrite existing recovery checkpoints.

## Quest 3 physical acceptance — all pending

1. Select Mask Paint from the Tool Wheel shortcut.
2. Paint protection directly on an SDF sculpture using a held Tool trigger.
3. Inspect the translucent purple overlay and partial weights.
4. Adjust strength, falloff hardness and radius; check live thumbstick sizing.
5. Use Clay across the mask boundary.
6. Confirm fully protected geometry stays fixed.
7. Use Smooth and Scrape along the same boundary.
8. Test Non-Elastic and Elastic Move.
9. Test Rotate and Twist, including release reconstruction.
10. Erase part of the mask and sculpt again.
11. Invert the mask and check its new protection.
12. Hide the overlay and confirm protection remains active.
13. Test mirror symmetry, including overlapping applicators.
14. Undo/redo strokes and global mask actions alongside sculpt edits; interrupt/cancel a stroke.
15. Save/reopen a native project and test autosave recovery.
16. Transform layers; verify independent alignment and growth into negative coordinates.
17. Inspect Normal/Matte/Glossy in Studio and real bright/dark Passthrough.
18. Confirm light handles, inspection lighting and reference images retain their interactions.
19. Export a GLB and verify there is no mask tint, attribute or metadata.
20. Check tracking responsiveness, settling overlay latency, memory pressure and long-session thermals at 128³/192³.

## Remaining limits and roadmap

No physical Quest result, stereo readability/reach acceptance, GPU cost or thermal result is claimed. Sparse partial masks cost more than uniform masks; manual native serialization is synchronous, and large saves can pause. An initial/global overlay update settles over multiple frames. Source-mask overlay is not composed into Boolean Preview. Mask preview normals are approximate at changing protection boundaries. Existing uniform-transform and procedural editing constraints remain.

Next: **Phase 4.8 — Advanced Layer Workflows**, then **Phase 4.9 — Colour and Material Painting**. Obtain physical acceptance first; use measured headset work to tune budgets. Future colour painting should reuse independent volume-local storage and keep export choices explicit. No commit, push or merge is authorized by this implementation request.

## Files changed

- `docs/DEVELOPMENT_STATUS.md`
- `docs/PHASE_4_7_MASKS.md`
- `outputs/phase-4-7/mask-benchmark.json`
- `outputs/phase-4-7/masks-browser.jpg`
- `scripts/benchmark-masks.mjs`
- `scripts/compile-core.mjs`
- `scripts/fixtures/sculpt-masks.html`
- `src/clay-stroke-session.ts`
- `src/deformation-reconstruction.ts`
- `src/dense-growth.ts`
- `src/editor-tool-state.ts`
- `src/independent-layers.ts`
- `src/main.ts`
- `src/mask-overlay.ts`
- `src/move-mesh-preview.ts`
- `src/move-reconstruction-worker.ts`
- `src/move-worker-client.ts`
- `src/project-snapshot.ts`
- `src/project.ts`
- `src/recovery-worker.ts`
- `src/resolution.ts`
- `src/sculpt-mask.ts`
- `src/sdf.ts`
- `src/shape-stamp.ts`
- `src/stroke.ts`
- `src/ui.ts`
- `src/xr-brush-sizing.ts`
- `src/xr-clay-stroke.ts`
- `src/xr-menu-model.ts`
- `tests/move-submenu.test.mjs`
- `tests/sculpt-masks.test.mjs`
- `tests/xr-ui-design.test.mjs`

Generated evidence: `phase-4-7/mask-benchmark.json` and `phase-4-7/masks-browser.jpg`. Build/test logs: `/tmp/mask-baseline-{build,tests}.log`, `/tmp/mask-{build,tests,worker,benchmark}.log`.
