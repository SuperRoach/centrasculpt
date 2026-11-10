# Personal stamp baseline preparation — 2026-11-10

This is the unchanged offline fixture and sampling harness used to prepare Phase 8.0.1/8.0.2. Actual restored-master stamping, destination detail, geometry, topology, CPU, allocations and chunk measurements are now in [PERSONAL_STAMP_RESULTS.md](PERSONAL_STAMP_RESULTS.md). The scope descriptions below apply to this preparation harness only.
It does not implement Personal Shape stamping. It never opens IndexedDB, connects to
an editor, or reads user projects. Generated files are ordinary evaluated `.form`
projects, not entries added to the user's shape library or `.cshapes` backups.

Run from the repository root:

```sh
node scripts/benchmark-personal-stamp-baseline.mjs
npm test -- personal-stamp-baseline
```

An optional first argument selects an output parent. Every run creates a new ISO UTC
timestamp subdirectory; existing files are not overwritten. Default output is ignored
`work/personal-stamp-baseline/`. The complete fixture set is about 297 MiB on this host;
retain the desired run for later comparison. Generated `.form` files use 50 mm/model
unit, a 100 mm bounding cube and 192³ dense samples. Each file is reopened immediately
and checked for exact sample hash and calibration agreement. Source samples are hashed
again after all read-only probes. Native file hashes can vary with project IDs;
Float32 sample hashes are the reproducible geometry comparison.

## Fixtures and reference definitions

`scripts/fixtures/personal-stamp-baseline.mjs` is the
versioned reference construction. Version 1 contains 11 fixtures:

- Horn: 60 mm centreline quarter arc, diameter tapers from 12 to 2 mm.
- Organic curve: 60 mm centreline quarter arc, 10 mm base diameter, radial ridge
  amplitudes of 1/2/4 mm at fixed positions. These are amplitudes, not ridge widths.
- Hollow part: 40×30×20 mm closed shell, 3 mm walls, an 8 mm Z through bore into its cavity.
- Long thin bar: 75 mm length, square widths 1/2/3/4 mm, 35° Z rotation.
- Mechanical slot: 40×25×12 mm block with a 20 mm long Z through slot, widths 1/2/4/8 mm.

Curved fields use closest-angle centreline formulas with radius modulation. They are
explicit implicit-field approximations, not certified exact Euclidean SDFs. Box/CSG
fields also have seam behavior. Preserve these formulas when comparing future engines;
report field error separately from geometric surface error. No primitive/Boolean edit
history is embedded in the evaluated `.form`; its reference is the versioned generator.

## What baseline.json means

The manifest records runtime/CPU/platform, fixture version and descriptions, sample and
native hashes, occupied master voxels, source step, calculated values/scratch bytes,
generation/native-roundtrip elapsed time and whole-process memory snapshots. The fixed
20-pose trace is supplied for future replay; this harness does not apply those poses.

The `targets` rows describe 64/128/192 destination step sizes and corresponding feature
widths in voxels. They probe the unchanged 192³ master through `sampleLocal` on interior
positions spaced by each destination step. Probes near the reference surface compare
interpolated master field values to the procedural field: mean/max field error and
sign disagreement counts. **These are not resampled destination volumes or stamped
results.** Different rows use different probe populations/bands; their raw counts
cannot establish that one destination resolution is better than another.

The millimetre field error is not a Hausdorff distance or fit tolerance. A nonzero sign
disagreement count near a zero crossing is not alone proof of a closed hole or lost
bar. Probe timing includes reference evaluation and loop overhead, and is not stamp
CPU time. Process memory snapshots include runtime, native serialization and objects
awaiting GC; they are neither isolated retained memory nor measured peaks. Values plus
scratch byte counts are allocation arithmetic, excluding meshes/history/staging/GPU.

## Evidence from the first complete run

`work/personal-stamp-baseline/2026-11-10T12-23-20.143Z/baseline.json` and its 11 `.form`
files were generated successfully. All 11 masters contain occupied samples, reopen
with identical Float32 sample hashes and preserve 50 mm/unit calibration. Reference
geometry tests pass 3/3: finite positive cube-boundary probes, specified interior/void
probes, through-hole/slot centerline and width checks, thin-bar width and pose bounds.
These tests check procedural reference geometry; they do not certify sampled topology.

## Original next gates (now tracked in Personal Stamp results)

1. Add actual restored Personal Shape → stamp integration when 8.0.1 is implemented.
   Use a disposable library and compare original/restored stamp results and master hashes.
2. Add fixed destination volumes, independent CSG reference, Add/Subtract, transforms,
   symmetry and both pivots. Sample actual surfaces and connected apertures; define
   resolution-aware geometric tolerances before optimisation. No current quality pass.
3. Replay the fixed poses through real single/continuous stroke and Undo machinery.
   Record scan/evaluation/changed voxels, rebuilt chunks, exact Undo/redo and rollback.
4. Measure 3 cold and >=20 warm actual stamp observations, cache lifetime and browser
   retained/peak memory. Keep Node snapshots separate. Desktop/Quest UI acceptance is open.

For dense-vs-sparse work, preserve these exact masters, sample hashes, calibration,
destination layouts and replay trace. Compare equal output/error and distinguish dense
allocation from changed voxels and remeshed chunks. Sparse storage is not implemented.
