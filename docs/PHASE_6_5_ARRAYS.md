# Phase 6.5 — Radial Repetition and Arrays

Updated 2026-11-05. This note records the delivered host implementation and the remaining physical acceptance work.

## User workflows

On desktop, open Primitives and choose **Array / Repeat** for the selected modelling object. Choose Linear or Radial and enter count, direction, distribution, angle, offset, pivot and orientation as applicable. Linear spacing and pivot coordinates are entered in the current physical unit; the command boundary normalizes physical values to model units. Apply creates the definition or updates the selected object's existing definition. Enable/disable and remove are reversible. **Bake evaluated array** creates an independent sculpt layer in one history transaction; it is explicit and undoable.

In VR, open **World Settings → Measure & Precision → Primitives → Array/Repeat**. Presets expose counts 4, 6, 8, 12 and 16, radial or linear mode, XYZ axis, 90°/180°/270°/360° arcs, 5/10/20/40 mm spacing, rotate/retain orientation, centred linear distribution, and pivot at the selected object's centre. Apply updates or creates; enable, disable, remove and Bake are explicit actions. The menu shares the headless `ModellingAPI` operation path. It remains outside the main Tool Wheel, which preserves Cut.

## Definition and transform semantics

`ArrayDefinition` is a validated discriminated union stored on the source `SdfLayer`, keyed by a stable definition ID:

- **Radial:** `count`, `totalAngleRadians`, `angularOffsetRadians`, model-space `pivot`, normalized local `axis`, and `orientation` (`rotate` or `retain`).
- **Linear:** `count`, positive `spacingModelUnits`, normalized local `axis`, and `centered`.
- Both kinds have an `enabled` flag. Count is from 1 to 16. Radial angle is greater than zero and at most 360°.

For a 360° radial pattern, instances are evenly spaced around the circle without duplicating the endpoint: a count of four has offsets 0°, 90°, 180°, 270° from the configured angular offset. A partial arc includes both ends when count is greater than one; count one uses the angular offset. The source is instance zero. Linear offsets are `i × spacing` along the normalized local axis, or `(i − (count−1)/2) × spacing` when centred. Count one has no offset. Radial position rotates the source origin about the pivot and axis. `rotate` also rotates source orientation; `retain` applies only the positional orbit.

The local array transform composes under the layer's existing parent/group and world transforms. Existing project calibration converts physical millimetres to model units at the API/UI boundary; persisted positions, axes and spacing remain model-space data. Changing a source's parameters or sculpt volume changes every evaluated instance because all instances reference the same source evaluator. Array metadata edits keep the same stable ID. A layer can own one array definition; repeated nesting/chains are rejected as unsupported. An array-bearing layer remains usable as a live Boolean operand, including as a subtraction cutter.

## Evaluation, history and export

The compositor prepares a scalar instance sampler from the existing source SDF, evaluates each instance transform, and composes it through the existing layer/Boolean order. It does not deep-copy voxel buffers or maintain a second modelling engine. The same derived geometry path serves viewport result, GLB/STL export and explicit Bake. Boolean source layers remain governed by the existing visibility/display rules; a repeated cutter contributes to the Boolean result and is not emitted as an extra cutter mesh in result export. Export conversion applies existing project/world transforms and physical calibration. STL retains its established target-size/project-scale choices and print diagnostics.

Create/update/remove/enable and Bake use layer history, so each user action is atomic for Undo/Redo. Bake produces a separate independent evaluated sculpt result; it does not silently replace the editable array source. Display previews are transient and are not stored in SDF geometry or emitted by exporters. Native `.form` version 13 persists definitions. Versions 1–12 remain readable; pre-array projects preserve their previous version path. Older clients should reject v13 rather than silently discard arrays. Library duplicate/Save As remaps array IDs. Recovery uses the same current project snapshot representation.

The public command surface is `array.create`, `array.update`, `array.remove`, `array.list`, `array.get` and `array.bake`. Mutating commands use the existing scene revision guard and structured error kinds. `array.create/update` convert supplied physical spacing/pivot values to model units; query results return physical values. Invalid definitions, duplicate IDs, stale revisions, missing source objects and unsupported direct edits fail with structured errors. No background command engine is introduced.

## Safety and quality limits

- Maximum 16 instances on one object; positive finite linear spacing up to 160 model units.
- A derived compositor work estimate above 64 million sample operations is refused with a clear error. The implementation does not silently lower quality to fit.
- Existing source, meshing, triangle, staging-memory and export limits still apply. Result tessellation is sampled SDF geometry rather than exact CAD; small print features require adequate source resolution.
- Array source definitions remain editable through transforms/grouping and source parameter edits. Direct sculpting of a source with an array is refused; explicitly Bake first.
- Nested arrays, arbitrary per-instance transforms and array-specific paint/mask overrides are unsupported. Source paint/mask data are retained; instances do not have independent paint/mask state.
- Rebuild work uses the existing cooperative scheduler and revision cancellation. It can still take seconds for dense, high-count results; host CPU timings do not establish XR smoothness.

## Verification evidence

Focused automated coverage exercises 4/6/8 radial patterns and full/partial arcs, axis/pivot/orientation, linear counts and mm conversion, source update propagation, grouped transforms, history, invalid/missing/cyclic references and limits, enabled/disabled non-destructive behavior, Boolean subtraction with four repeated cylindrical cutters, evaluated GLB and binary STL dimensions, print diagnostics, Bake undo/redo, v13/native recovery/legacy decoding, command/UI parity and both controller hands. The full current result is recorded in `docs/DEVELOPMENT_STATUS.md` after the final repository check.

Host benchmark: `npm run benchmark:arrays`, raw JSON at `work/phase-6-5/array-benchmark.json`. Node v26.8.1, two warmups and nine measured 40,000-query passes per count, then one cooperative composite build:

| Count | Sampler median / p95 | Composite wall | Max sampling / meshing slice | Tracked bytes | Triangles / resolution |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 4 | 4.323 / 4.916 ms | 1,007.337 ms | 3.012 / 5.895 ms | 23,974,336 | 65,632 / 134 |
| 8 | 9.234 / 11.044 ms | 1,641.001 ms | 3.080 / 6.320 ms | 28,709,056 | 131,392 / 134 |

This is a single host CPU run, not Quest GPU/frame/thermal/RSS measurement. Physical Quest 3 acceptance is **pending**. On device, verify left/right logical hands, count and field usability, pivot placement, grip/stick and menu ownership, tracking interruption, Skybox and Passthrough, preview resource disposal, source editing, save/recovery, Boolean hole subtraction and actual exported STL dimensions/slicer diagnostics.
