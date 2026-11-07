# Staged full-resolution unified export

2026-11-06. Use the existing **Export unified boolean** button. Larger scenes now
sample in bounded spatial stages without reducing the existing export resolution
(up to 192³). No new setting, source Bake or project conversion is required.

## What changes

The old 64 million estimated source-sample guard multiplied grid samples by source
layers/array instances and refused before sampling. Twelve ordinary sources at
192³ estimate 84,934,656 operations, even without arrays. That is a CPU work estimate,
not the allocation of 85 million stored voxels. The error's “Array evaluation” label
was misleading.

Export now opts into consecutive Z slabs, each within that 64 million estimated
work allowance. Twelve sources at 192³ use two stages. Existing cooperative slices
continue to yield about every 3 ms, and explicit stage boundaries yield too.
Progress shows stage number and completion within that stage. Cancellation and
source revision checks remain active during sampling and subsequent processing.

Every stage writes to the same independent scalar grid using the same prepared
ordered SDF evaluator. No source meshes or intermediate groups are unioned, baked,
resampled or reordered; subtract/intersect semantics are retained. Meshing starts
only after sampling finishes and uses the original continuous grid, so stage
boundaries introduce no separate mesh seams. STL/GLB preparation and existing final
quality/topology/size admission still run.

## Limits

Staging admits at most 256 million estimated source-sample operations overall to
bound exceptionally expensive requests. Estimates count top-level sources/array
instances; actual CPU cost varies with nested CSG, source type, colours and sampling.
Ellipsoid distance solves cost more than simple spheres. This change permits more
total work; it does not make that work free or stream an unlimited model.

The existing 256 MiB export memory budget, grid cap and triangle limits remain. One
full scalar grid and its derived mesh are retained. This change does not implement
out-of-core meshing, more than 192³ resolution, independent per-part remeshing or
printer-fit certification. Existing grid/detail capping remains reported normally.
Preview and Bake still use their existing 64 million work admission. Their quality
settings do not change the export grid.

No native source bytes, selection, history or saved project metadata change during
export. Cancellation, stale source edits or failures return no successful prepared
export; independent derived allocations are disposed. An ordinary user source edit
during export is retained and makes that export stale.

## Verification

`tests/staged-boolean-export.test.mjs` covers stage coverage/work ceilings, unchanged
192³ layout for twelve sources, identical ordered subtract/intersect scalar fields
and mesh buffers against the ordinary path, actual two-stage STL preparation and
encoding, native-byte/history preservation, cancellation, stale source edits and
memory refusal. Existing array quota refusal remains tested for preview. Evidence:
`work/staged-export/check.log`; focused development logs in `/tmp/staged-focused*.log`.


## Turtle validation follow-up

The saved `turtle.form` completed staged 192³ sampling, then reached a different
STL admission guard: 365,994 post-compaction triangles exceeded the older 300,000
validation ceiling. The old validator retained large string-keyed coordinate and
edge maps. It now cooperatively sorts typed vertex/edge indices, welds only exact
Float32-equal coordinates, and computes adjacency/components with typed buffers.
The shared main/worker validation cap is **600,000 triangles**, still bounded by
available memory and the selected quality's admission. The validation pipeline uses
a conservative 128-byte-per-corner estimate rather than the old 320; precision
stabilisation candidates receive an explicit bounded workspace. No decimation,
nearby-vertex welding, winding flipping or omitted topology checks was introduced.

The original Turtle native file was read without modification and successfully
exported to `work/staged-export/Turtle-192-staged.stl`, at the browser's selected
100 mm longest dimension. It contains 365,994 triangles and has zero boundary,
non-manifold, inconsistent-winding and degenerate counts. The report retains two
surfaces and one inward-oriented component; these can represent separate/cavity
shells and require slicer inspection. The staged browser test reached the old
validation refusal; the final saved-file test uses the same updated preparation
and STL encoder and completed successfully. No claim that the final browser worker
retry was observed. Regression coverage includes >300k exact topology and sorting
cancellation, plus refusal at 600,001 triangles.
