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

## Phase 7.5.2 sizing update

Desktop export now starts at explicit **Keep actual project dimensions (1:1)**.
**Scale longest side to target** starts at 200 mm; 100 mm remains deliberate.
Both STL (mm) and GLB (m) honour that selection. Exact evaluated XYZ bounds,
export XYZ dimensions, scale and quality appear before encoding. Historical
100 mm observations above describe the previous selected target, not current default.
See [export correctness](PHASE_7_5_2_EXPORT_CORRECTNESS.md) for geometry findings,
reference normalisation, assembly behaviour and regression coverage.

## Optional 256³ and tighter export bounds — 2026-11-09

The export panel now selects a maximum of192³ (default) or256³ (extra detail).
Staged analytic exports use exact primitive bounds, omit provably empty dense
layers from layout and use analytic primitive feature spacing. Sparse bounds stay
conservative. Preview/Bake/native resolutions remain unchanged.

256³ needs128 MiB for scalar/scratch alone. Existing memory budgets,64M stage/256M
total work and final quality/600k STL limits still apply. Intermediate meshing
remains bounded at1M triangles for both export and preview. Denser scenes
can refuse final admission and are never silently resampled coarser. The historical
house acceptance above used the old padded layout; with tighter bounds its denser
output now hits the unchanged intermediate meshing ceiling. See the [current findings](PHASE_7_5_2_EXPORT_CORRECTNESS.md).

## Phase 7.5.4c

Evaluated STL chunk compaction now uses the verified exact fast path. Dense staged
SDF evaluation and all geometry/admission guards remain. The current grid choices
are up to 192³ or 256³, introduced after this document’s original measurements.
See [production validation and fallback](PHASE_7_5_4C_EXPORT_INTEGRATION.md).

## Interactive preview work budget

The layer-view cache can now lower its display resolution to stay within its
existing 64M source-sample budget, explicitly reporting the actual preview grid
and “Reduced detail”. It accounts for visible roots, enabled modifier references
and array instances. This display-only policy does not change staged export's
selected cap/admission or source/project data. See the latest Development Status
for nine/ten-layer Lens validation.
