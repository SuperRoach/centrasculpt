# Phase 4.9 — Colour painting

Implemented 2026-10-30; refresh scheduling hardened 2026-10-31. Physical Quest 3 acceptance remains **PENDING**.

## Use

The floating shortcut card has no persistent tool/alternate-brush hint. Temporary feedback sits lower-left of the initial view and is hidden throughout active strokes, keeping the sculpture unobstructed.

Select **Paint** beside Mask below the nine-sector VR tool wheel. The first options page has ten swatches, the current hex colour, Paint/Erase, Reset to layer base colour, radius and opacity. Hardness, Steady, straight line and symmetry are on subsequent pages. Tool trigger paints the selected editable source using surface picking. Moving off the surface pauses deposition; returning while held resumes without painting across the gap, and release commits one undo action. Tracking loss and invalid ownership still cancel. The Paint cursor stays hidden while aiming and painting; a coloured tangent ring appears only while Tool-stick sizing is actively changing the radius; the menu shortcut uses a brush icon. Studio and Passthrough share painting and sculpt lighting; Passthrough uses the camera background and hides the Studio ground grid. Tool thumbstick changes radius, including during a held stroke. Support trigger's default Opposite setting temporarily swaps Paint/Erase; Smooth remains an alternate choice. Menu ownership, grip navigation, handedness and lifecycle cancellation use the existing controller routes.

Desktop **Paint Colour** / **Erase Colour** automatically opens the shared settings, including a native custom colour picker. Preset cycling remains available. Clicking colour controls does not start a stroke. Paint brush opacity is a continuous deposition strength: repeated passes/held trigger build coverage. Erase reduces coverage toward the current layer default. Reset clears all paint in one undo action (a deliberate whole-layer operation, independent of local masks).

Selected-layer bounds appear only in the Layers menu. While it is open, point away from the menu panel at a visible object and press Tool trigger to select its source layer; menu-panel hits retain priority. This does not start a stroke or add an Undo entry.

Paint requires Separate Layers and a visible, unlocked, selected SDF source. Procedural tubes require **explicit Bake**; painting never destroys the spline source or merges sources. Groups contain no paint field themselves. Inherited visibility/locking applies.

## Authoritative representation and colour space

`sculpt-paint.ts` owns a volume-associated field with four lazy 256-sample Float32 page maps: premultiplied linear RGB and coverage. Pages reuse the established `SculptMask` storage primitive, but are separate objects and never modify protection or SDF distances. A volume belongs to one source layer. Maps/pages are copy-on-write at history snapshots; unpainted regions allocate no dense colour volume. The API uses `VolumeStore` reads/coordinates and works with expanded/negative lattices and non-dense adapters. No new sparse SDF backend was introduced.

Preset/custom hex colours are sRGB; Three.js converts them to linear RGB before storage/blending. Vertex colour and GLB COLOR_0 values are linear. Coverage interpolation is premultiplied, avoiding black fringes at unpainted boundaries. Unpainted samples inherit the current Layer Colours default, or neutral clay in Clay display mode. Display style changes retain the field. Normal/Matte/Glossy continue to determine global roughness, metalness, reflections and lighting. **Per-region roughness/metalness and per-layer material overrides are deferred**, so there is no material-channel precedence conflict or per-swatch material proliferation. Exports use the established neutral roughness/metalness with white base colour for painted vertex colours.

A dab affects samples within two voxel spacings of the SDF zero set and inside the brush sphere. It applies mask protection and a smooth hardness-controlled falloff. Symmetric applicators form a union: overlap is not painted twice. Brush movement uses the existing bounded, time/distance-resampled stroke generator and 128-candidate cooperative yields. This is a volume brush: nearby front/back surfaces within the radius can both receive paint; there is no screen-space visibility flood fill. Reduce radius for thin/closely folded geometry.

## Geometry changes and transfer rules

| Operation | Paint rule |
| --- | --- |
| Chunk remesh | Sample the same global layer-local field at regenerated vertex positions; no chunk-local paint boundary |
| Layer/group transform, reparent | Source-local coordinates stay unchanged; hierarchy transform moves geometry and paint together |
| Duplicate | Independent COW field; later edits cannot change the source |
| Clay Add/Subtract, Smooth, Flatten, Inflate, Pinch, Crease, Scrape, Shape Stamp | Keep the spatial field. Surfaces still within its painted band inherit interpolated paint; newly exposed/created surfaces outside it inherit the base colour |
| Non-Elastic Move, Elastic Move, Rotate, Twist | Transport painted lattice samples through the same mask-blended deformation field, then normalized trilinear forward deposits into the replacement volume |
| Resolution resample | Trilinearly resample colour/coverage into the new lattice; existing resolution/history policy remains |
| Boolean Preview/export | Winning min/max CSG operand supplies colour; a difference cutter supplies its cut-face colour; ties retain the earlier operand |
| Explicit Bake/Merge | Sample the winning source colour near the new zero set into an independent output field; source fields remain intact |
| Procedural tube Bake | Produces an unpainted editable source; spline remains unchanged |
| Reset Sphere | Existing spatial paint remains; use Reset to layer base colour to remove it |

These transfers are **not mathematically lossless**. Paint resolution follows SDF resolution, so 64³ boundaries are visibly coarser than 128³/192³. Large sculpting/topology changes can reveal base colour. Deleted-surface samples remain in the editable field and can reappear if geometry is later recreated there. Pinch/Crease preserve spatial paint; they do not advect it like Move. Move splatting can blur/dilute details during stretching and mix colours where material folds or compresses. It does not leave a second copy at the old source position, but thin painted features stretched beyond lattice coverage can fade. Strong deformations may need repainting. Move preview carries existing vertex colours; release reconstructs the approximate authoritative field.

## Rendering, history and asynchronous safety

`paint-surface.ts` updates existing mesh colour attributes without SDF invalidation or geometry extraction. Dirty sample bounds include an interpolation halo. New/replaced chunks are sampled independently of triangle identity. Updates share the existing two-millisecond overlay scheduling deadline and round-robin chunk work; mask shading stays separate. Initial colour attributes and global resets can settle over several frames. Enabling vertex colours incurs one material-program variant per source, not per swatch. CPU colour buffers are owned by the existing geometries and disposed with them.

`IndependentLayers` records one paint snapshot pair per complete stroke, plus erase/reset actions. Cancellation restores the snapshot; actual changes invalidate redo. Paint history has a conservative 32 MiB / 100-action soft limit, retaining the latest action. Geometry and paint share the same cross-layer timeline. Move timeline records contain before/after paint snapshots; geometry undo/redo restores matching paint. COW pages avoid full-volume or full-project copies for each stroke. Resource diagnostics include live paint storage; tracked memory also includes retained paint history. Estimates are conservative and exclude engine/GPU overhead.

Move captures paint revision as well as mask, source and surface revisions; newer edits reject stale publication. Paint transfer is cooperatively staged before atomic source publication, on either the worker-backed or cooperative geometry path. Transfer accumulation has an explicit memory guard. Native/recovery capture waits for complete edits and includes immutable paint snapshots. Export guards reject paint revisions even if geometry revision did not change. Live export-size estimation deliberately omits colour-buffer generation.

## Persistence and exports

Paint-bearing native projects use **v8**, adding four validated sparse little-endian index/Float32 payload descriptors per layer after masks and before reference assets. Versions 1–7 still load. Unpainted projects retain the existing lowest applicable format selection. The latest-version constant is 8. Import rejects bad channel count/encoding/offset/count, duplicate or unsorted indices, invalid sample IDs, nonfinite/out-of-range values, non-premultiplied RGB, truncation and trailing data. Saving also checks the existing total native file cap, rather than generating a file the reader cannot reopen. Manual save remains synchronous.

Recovery workers reconstruct the same native format. Existing recovery checkpoints were not modified during host validation.

Fast exports copy colours. Standard/High weld only equal positions **and equal colours**. High skips planar simplification on painted sources to preserve colour boundaries. Separate-source and Boolean GLBs both contain COLOR_0 and white base materials; actual binary payloads are tested. Unpainted exports retain neutral clay. Hidden sources are excluded, including the explicit selected-layer path (a deliberate change from the previous hidden-selected override). Group world transforms are preserved; workspace navigation and editor helpers are excluded. Legacy `exportGroup()` paths also retain colours. Boolean cut/intersection attribution is approximate at the composite quality cap. Export colour preparation is synchronous before the existing cooperative/worker packing pipeline; large exports can pause initially.

## Host validation and measurements

Baseline: strict TypeScript/Vite build and 1,149/1,149 tests passed. Final strict build and **1,199/1,199** full tests passed; **44/44** paint tests passed with the actual Move worker runner before the headset-feedback changes. Four additional regressions cover pointer misses with and without Steady, disconnected replay and the ring cursor. New deterministic tests are in `tests/sculpt-paint.test.mjs`, covering the three target resolutions, locality/falloff/linear blending, symmetry, protection, COW independence, undo/redo/cancel/interleaved geometry, all eight brushes, stamps, growth/sparse adapter, seams, all four Move variants, stale work, group transforms/reparent/copy, native/legacy/malformed/recovery, material styles, GLB binary attributes in both paths/all qualities, VR trigger/Steady/radius/alternate/menu ownership, preview-material refresh and bounded history. Existing registry-count assertions now include Paint; the hidden-selected export test now checks the requested exclusion policy.

Reproduce: `npm run build`, `npm test`, `npm test -- sculpt-paint --worker`, `node scripts/benchmark-paint.mjs`.

Host CPU-only benchmark, Node v26.8.1, 20 interpolated dabs, radius .3, strength .6, hardness .4. No physical headset/GPU/frame/thermal results:

| Resolution | Brush CPU total | Max generator batch | Full initial attribute completion | Paint storage | Native payload increase | Native save |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 64³ | 6.70 ms | .193 ms | 30.52 ms | 87,040 B | 16,912 B | 8.04 ms |
| 128³ | 20.95 ms | .132 ms | 114.90 ms | 339,456 B | 68,118 B | 38.16 ms |
| 192³ | 33.54 ms | .146 ms | 272.18 ms | 887,808 B | 154,839 B | 169.77 ms |

Every colour-only run produced **zero remesh revisions**. The attribute column drains the work with an unlimited test budget; production spreads this sampling over frames. Dirty input during a partial pass queues another pass instead of restarting the cursor, so held strokes cannot starve tail vertices. A deterministic tight-budget test verifies progress and exact convergence after release. First attribute allocation/base initialization and scanning still occur synchronously and can exceed the sampling budget. This is an explicit performance limitation to measure on Quest. No controlled source-meshing performance regression benchmark was taken; passing tests is not a headset frame-rate claim.

Host browser fixture `scripts/fixtures/sculpt-paint.html` renders actual source materials and XR menu canvases. It verified two surface regions, readable swatches and no shader errors in Studio and a transparent-background AR simulation. This fixture is not real Passthrough. The actual application verified Paint selection opening the desktop controls, custom colour input and unchanged geometry/history during palette selection. Evidence is under `outputs/phase-4-9/`.

## Quest 3 acceptance checklist — all PENDING

Run in Quest Browser with Touch Plus controllers, in both handedness configurations. Record observations; do not mark passed from host automation.

1. Select Paint using the below-wheel shortcut; confirm Move variant recall still works.
2. Choose a preset colour; confirm the cursor colour and no accidental stroke on menu dismissal.
3. Paint onto a sculpted sphere with Tool trigger; release yields one Undo action.
4. Change colours and paint another region; inspect blending and chunk boundaries.
5. Adjust radius with Tool stick while idle/painting; adjust opacity and hardness in Options.
6. Enable mirror painting; inspect overlap at the mirror plane.
7. Paint/erase across full and partial masks; confirm protection.
8. Add/subtract Clay over paint; inspect the documented surface-band inheritance.
9. Smooth the painted area; inspect newly exposed base colour.
10. Apply Pinch, Crease and Scrape nearby; verify spatial paint behavior and responsiveness.
11. Apply Elastic and Non-Elastic Move to painted details, with short and long pulls.
12. Apply Rotate/Twist; compare preview to release, inspect blur/fading and undo restoration.
13. Duplicate the painted layer; repaint only the copy.
14. Move/rotate/scale its parent group and reparent it; inspect alignment and inherited locks.
15. Undo/redo complete paint/erase/reset and mixed geometry strokes; cancel via tracking/menu/session interruptions.
16. Save and reopen the native project, including a non-default rendering style.
17. Create a new autosave and recover it without discarding unrelated checkpoints.
18. Export Fast/Standard/High separate and Boolean GLBs; inspect colours externally and hidden-source exclusion.
19. Repeat painting in actual Passthrough; inspect palette/cursor contrast.
20. Change Normal/Matte/Glossy and Phase 4.6 lighting; inspect colour and reflections.
21. Repeat at 64³, 128³ and 192³; measure first-paint upload, long-session memory, release and sustained frame time.
22. Verify Support Undo/Redo/wheel/layers, Support and both-grip navigation, Tool grip, temporary alternate, disconnection and XR exit remain responsive and never leave a stroke active.

Next: physical acceptance and profiling; optimize first colour-attribute allocation and export preparation if measured costs warrant it. Later work can add surface-aware paint propagation/transport, a larger VR custom picker/eyedropper and roughness/metalness channels. No commit, push or merge was authorized or performed.
