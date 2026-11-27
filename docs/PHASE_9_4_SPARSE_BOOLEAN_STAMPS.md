# Phase 9.4 · Experimental sparse Boolean and Stamp integration

2026-11-28 (Australia/Melbourne). Based on `9b6cdc5`. Dense remains the default.

## Supported workflows

| Workflow | Behaviour |
| --- | --- |
| Live Boolean preview and export | Union, Difference and Intersect accept mixed dense and sparse operands, including transformed sculpt fields. The existing derived preview and export grids retain their storage and admission rules. |
| Bake / Merge | Choose **Use experimental sparse storage** for a new editable sparse layer at 64³, 128³ or 192³. The option covers the visible Boolean result and two-layer Union. The existing layer, detail, work, triangle and voxel limits apply. |
| Live modifier graph Bake through MCP | `boolean_bake` accepts optional `storage: "sparse"`. In a batch use `{ "type": "boolean.bake", "id": "...", "storage": "sparse" }`. Sources and the modifier graph are preserved and Bake creates one Undo action. |
| Analytic Shape Stamp and Personal Shape Stamp | Add and Subtract support sparse sculpt targets on desktop and in XR, with the existing offset mirror and mask blend. Personal Shapes sample the immutable full-detail master. XR supports single and continuous placement. Sparse Add requires the stamp to fit inside the fixed lattice’s safe bounds. |

Bake samples the same ordered world-space field for both destination backends.
It preserves the existing inverse transform, trilinear arithmetic, uniform
distance scaling, positive exterior extension and v24 Float32 range. Phase
8.9c’s conservatively rounded leaf-cutter culling and consecutive identical
fold elimination are shared. Sparse trilinear reads reuse a page lookup
when successive corners occupy the same page. A positive-only sparse operand
uses the same layout rules as a dense one, while its exact values still
participate in the Boolean fold.

Stamp writes the same Float32 patch on both backends. Analytic rejection uses
conservatively rounded AABB distance bounds and preserves ties. Personal
sampling evaluates the whole destination because its stored distances
cannot be bounded by the master’s visible geometry. Positive values can
change anywhere in the supported lattice, including at the boundary. The
editor stores those changes and dirties visible geometry and gradient
stencils where required. A mixed-sign chunk can be dirty even when its
previous geometry was empty because its triangles had collapsed.

## Transactions and limits

Sparse Bake samples into an unpublished paged volume and publishes a new layer
after sampling and meshing succeed. Cancel Bake or press Escape while it is
running. Sparse Stamp stages exact deltas, missing pages and packed history
before publishing each dab. Escape cancels a staged desktop stamp. The XR
stroke cancellation path restores any earlier dabs in the unfinished action.
Undo and Redo restore Float32 values and use the existing bounded sparse mesh
queue. Pages remain resident after replay and erasure, allowing history replay
without new voxel pages. Failed page or history admission preserves the field
and redo. Stamp publication and history replay of a completed patch still
apply its voxel deltas in one CPU slice.

Sparse Bake allocates changed voxel pages directly, saving the dense
brush scratch allocation. Sparse add stamps and Boolean results can touch every
page at the requested resolution. Project admission retains the dense grid
and scratch reserve. v24 save, reopen and recovery preserve exact samples
using the existing native codec and staging. Reopen uses dense storage.
Sparse diagnostics still report resident pages, tracked memory and pending
chunks.

Sparse lattice growth, Move-family reconstruction, Plane Cut and page
reclamation remain outside the trial. The paired physical Quest frame and
release measurements, isolated peak process/GPU memory, and the 1 mm
metre-scale gate remain open.

## Benchmarks

macOS arm64, Node v26.8.1. Each workload used one warm-up and three measured
repeats per backend pairing, with order reversed between repeats. Field
signatures include every Float32 sample. Mesh signatures include chunk IDs
and ordered position and normal bytes. All 54 measured signatures matched
the corresponding dense reference, including the four organic edits.

| 128³ Boolean workload | Dense → dense CPU, ms | Sparse → dense CPU, ms | Dense → sparse CPU, ms | Sparse → sparse CPU, ms | Triangles |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sampled box with a transformed cylinder cut | 250.0 | 363.6 | 327.5 | 438.4 | 87,804 |
| Twenty consecutive references to the same cutter | 250.0 | 358.6 | 338.8 | 442.9 | 87,804 |
| Phase 8.9c electronics enclosure, 20 analytic sources | 2,260.9 | — | 2,179.5 | — | 558,916 |

The enclosure row compares dense and sparse destinations for analytic
sources. The archived project occupies all 20 available layer slots, so
the benchmark runs the production sampler and mesher independently at a
fixed 128³ lattice. The other two rows use
the normal editor Bake transaction. CPU includes sampling and chunk extraction.
The simple cut’s median wall time, including cooperative yields, was 394.9 ms
dense → dense and 659.0 ms sparse → sparse. The repeated-reference work
remained close to the single cut because the fold evaluator coalesces the
identical consecutive cutters.

| 128³ organic sculpt edit | Dense CPU, ms | Sparse CPU, ms | Identical triangles |
| --- | ---: | ---: | ---: |
| Mirrored sphere Add | 371.9 | 449.7 | 75,088 |
| Transformed Personal Shape Add | 559.1 | 760.7 | 77,172 |
| Transformed Personal Shape Subtract | 555.5 | 742.9 | 80,296 |
| Mirrored triangular-prism Subtract | 139.1 | 171.5 | 79,924 |

Times are medians and include evaluation, history, publication and complete
CPU remeshing. The reduced analytic scan evaluated 57,176 of 2,097,152
samples for the prism cut. The Personal Shape edits evaluated all samples.
At each measured checkpoint the result stored 8 MiB of Float32 values in
either backend. Sparse avoids the additional 8 MiB dense brush scratch
array on those 128³ outputs. The largest recorded stamp patch growth peak
was 36 MiB in each backend and retained history finished at 14.24 MiB.
The patch figure covers the old and new staging buffers during growth.
Detached pages, history copies, renderer allocations and JS overhead are
outside that figure. The benchmark measures CPU and tracked buffers without
frame timing or isolated process peak measurements.

## Validation

The isolated loopback-enabled `npm run check` passed formatting, lint,
strict TypeScript, the production build and all 1,845 tests. A prior run
overlapped the smoke tests and hit a timer-sensitive planar-export
cancellation assertion. The planar suite and the isolated full rerun passed.

Production Chromium exercised sparse layer creation, analytic Stamp,
sparse Bake, Undo/Redo, the sparse diagnostics, and saving and applying
a Personal Shape to a sparse target. The browser and stdio MCP smoke
also exercised sparse `boolean_bake`, surfaced the sparse layer in
Separate Layers view, and restored the live graph through Undo. The
existing approval, scene editing and production isolation checks passed.

## Reproduce

```sh
node --expose-gc scripts/benchmark-sparse-csg.mjs work/phase-9.4-benchmark.json
npm test -- sparse-sdf xr-shape-stamp bake boolean-composite personal-stamp
npm run check
node scripts/sparse-csg-browser-smoke.mjs
AGENT_SMOKE_HOST=127.0.0.1 npm run test:agent:browser
```

The benchmark defaults to the archive at
`work/phase-8-9a/electronics-default-20-compact.form`. Set
`BOOLEAN_BENCH_ENCLOSURE` to supply the fixture or
`SPARSE_CSG_FIXTURES=cut,repeated,organic` to omit it. The browser scripts
accept `PLAYWRIGHT_CHROMIUM_EXECUTABLE` for a system Chromium.
