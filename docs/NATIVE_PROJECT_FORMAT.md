# Native project format

Centra Sculpt reads `.form` versions 1–25. Versions 1–2 store one sculpt
volume. Versions 3–23 add independent layers and successive metadata
features. Version 9 introduced STL reference assets. Version 10 introduced
layer parenting. The Phase 8.8e electronics enclosure uses version 19 for
associative attachments.

## Version 24 native storage

Centra Sculpt writes version 24 when every layer uses dense or analytic
storage. Projects containing an experimental sparse layer use version 25
for manual saves, Library projects and recovery checkpoints.

The header is unchanged. It contains the eight-byte `FORMSDF\0` magic and
little-endian uint32 format version and UTF-8 JSON length. The JSON is at most
65,536 bytes. Binary sections follow as before, in order: packed Float32 LE
voxels, sparse masks, four premultiplied paint channels and references.
Offsets are relative to their binary section. A single archive can mix
analytic and voxel records.

- Voxel records carry the complete field and omit `source`. Their
  `voxelCount` is the lattice sample count.
- Analytic records have `voxelCount: 0` and use the current packed voxel
  offset. `source.encoding` is `primitive-sdf-v1`, `source.dimensions`
  gives physical dimensions in layer-local model units and
  `source.fingerprint` checks the ordered Float32 sample bit patterns.
  The fitted grid, source resolution, lattice origin, active primitive
  parameters and original parameters remain in normal layer metadata.
- IDs, order, local pose, hierarchy, Boolean relationships, visibility,
  lock state, assembly definitions and component associations use the
  existing metadata. World poses derive from the saved hierarchy.
  Mask and paint offsets and indices address the same lattice regardless
  of how its distance field was stored.

### Eligibility and reconstruction

The first encoding admits boxes including rounded prisms, circular cylinders
including tapered ends, spheres with equal axes, capsules and tori. A source
must have a dense centred fitted lattice at an odd resolution from 33³
through 63³, exact spacing and extent, and a sample-for-sample match with
the primitive evaluator including signed zero. The writer records a
32-bit FNV-style fingerprint over the Float32 words in x-fastest order.
The reader uses the same evaluator and checks the fingerprint before it
returns the reconstructed project. The fingerprint is an unkeyed integrity check for reconstruction.

Sculpts, tubes, text, ellipsoids, pyramids and tapered boxes keep voxel
data in this release. The eligible set bounds both samples and per-sample
CPU work. Sources failing the exact check use the v24 voxel payload when
their metadata and field pass existing validation. An inconsistent live
primitive definition and edited field is refused with the existing
cache-mismatch error. Clay edits made to a sculpt or baked field stay
voxel-backed.

A future evaluator change must retain the original reconstruction algorithm
for `primitive-sdf-v1` or introduce a new encoding and keep the old reader.
If a platform rebuilds different Float32 bits, open fails with a compatibility
error and keeps the previous project. Retain a full voxel archive when
interoperability with older builds or an untested platform is required.

### Resource admission and publication

- The existing 182,517,776-byte archive limit, 20-layer limit,
  192 initial-resolution limit and 14,155,776 aggregate sample limit still
  apply. The sample limit covers stored and regenerated fields together.
- Analytic reconstruction is bounded to `20 × 63³ = 5,000,940` samples.
  The native 1,000,000-triangle admission limit still applies to
  voxel-backed surfaces, including hidden operands. Analytic fields use
  validated primitive display meshes and share the existing editor
  geometry and export limits.
- The v24 decoder checks grids, declared sizes and offsets, graph and
  assembly metadata, display assets, and sparse-channel descriptors before
  allocating full lattices. Its 256 MiB admission estimate covers the
  input, dense field and scratch arrays, sparse pages and reference copies.
  The desktop open path also checks current and candidate tracked editor
  memory against 256 MiB while rebuilding viewport meshes. The current
  Boolean display cache can be evicted after validation and regenerated on
  rollback. The current source fields and Undo history remain available.
- Browser import, open and recovery decoding run in a dedicated Worker.
  Open reports completed layers, permits cancellation and publishes after
  candidate preparation. The abort path terminates the Worker or disposes
  the candidate. A recoverable assembly-preview failure is reported and the
  scene can open with its editable source geometry as in older formats.

## Version 25 sparse layers

The header and section order remain the same. Dense and analytic layer
records keep their v24 encodings, including when mixed with sparse layers.
A sparse layer has a `sparse` descriptor with `encoding: "sdf-pages-f32-le-v1"`,
`defaultValue` and `pageCount`. Version 1 of the page encoding requires the
exact positive Float32 value of four times the initial extent. The layer
retains its initial resolution, spacing, signed lattice minimum and current
dimensions in `grid`.

Each 2,060-byte record contains three signed little-endian int32 page
coordinates (X, Y, Z), then 512 little-endian Float32 samples in x-fastest
order. A page coordinate covers absolute sample indices `8p…8p+7`. The
initial layer origin anchors these indices for the life of the layer. Layer
ID and signed page coordinates identify a record. Records are unique and
ordered by signed Z, then Y, then X. `voxelOffset` and `voxelCount` are
32-bit word offsets and lengths inside the first binary section. The sparse
layer's count is `pageCount × 515`. Record ordinal `i` begins at byte
`16 + metadataLength + 4 × voxelOffset + 2060 × i`.

Absent pages and padding outside the declared lattice read the explicit
default. All stored finite Float32 bits, including signed zero and
non-default positive distances, round-trip. The reader rejects misplaced,
duplicate and reordered records, invalid padding or samples, nonpositive
outer faces, invalid lengths and trailing data. The existing aggregate
triangle limit counts candidate cells around negative pages. Dense and
analytic layers retain their aggregate sample budget. Each sparse layer may
address up to 1,153 samples per axis and 32,768 logical 16-cell chunks, with
13,824 resident 8³ pages. All layers share the existing archive size and
256 MiB native memory admission limits. Sparse stored data and page
overhead count toward that memory budget. The logical dense equivalent
does not enter the sparse decode allocation.

Open and recovery workers transfer resident page buffers. Library import
validates before publishing its independent entry. Rename and duplicate
preserve the binary records. Library revision checks and recovery checksum
and IndexedDB transactions apply to both native versions. Current recovery
checkpoints carry the complete archive and restored projects start fresh
Undo history.

### Migrating versions 1–23

Update Centra Sculpt and open the old file normally. The importer validates
its full voxel payload and metadata. A regular save writes v24. Library file
import validates and verifies the conversion before creating an independent
Library entry. Existing legacy Library projects remain readable. The first
save from a legacy record creates a v24 record and retains the original.
Duplicating or downloading a legacy record verifies the conversion first.
Recovery retains the existing transactional checkpoint format and checksum.
Restoring a valid recovery checkpoint preserves its project identity and
starts fresh Undo history.

For a verified, identity-preserving conversion on disk, run from the
repository with dependencies installed.

```sh
node scripts/migrate-project.mjs original.form converted.form
```

The command validates the source, creates and verifies an independent
`original.form.bak`, encodes v24, reopens the result, and compares all editable
state including exact Float32 samples. It publishes the output only after
those checks and a read-back of the staged bytes. Supply a new output path.
The original and any existing destination are preserved. The source and
destination filesystems must support hard links for atomic publication.
Versions 1–2 had no project ID, so the conversion assigns one and retains it
on subsequent saves. A project beyond v24 resource admission remains
available to the legacy reader, and conversion reports the refusal.
