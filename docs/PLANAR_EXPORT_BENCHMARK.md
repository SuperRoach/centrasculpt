# Planar export efficiency benchmark — 2026-11-09

## Outcome

Additional whole-mesh planar passes give a modest reduction on the lens-holder
reconstruction: **6.02% beyond current High at 192³, 8.48% at 256³**. The candidate
passes the checked geometry/topology probes but does not justify automatic extra
work in ordinary export. No application simplification or quality defaults changed.

Inspection corrected an earlier incomplete explanation: preparation compacts each
chunk independently, but **current High already exact-welds the whole source and
runs three global planar one-ring passes**. Cross-chunk simplification is therefore
already partly present. Running more of that same conservative algorithm does not
produce the large reduction expected from whole-planar-patch reconstruction.

## Method and results

Replayed eight primitive sources plus an empty layer from the previously queried
holder source dimensions/world poses. Named cutters are assumed ordered Difference;
body and feet are Union. This is a disposable dimension-matched reconstruction,
not a byte-identical clone of the user's native file. It is 450 × 59 × 70 mm.

Each resolution uses production `prepareBooleanExport`, including tighter bounds
and chunk compaction, with a 512 MiB budget. Baselines encode Fast and High.
The candidate concatenates prepared chunks without moving coordinates, then uses
existing `compactPlanarSources` on that one global chunk: up to twelve calls, each
with the existing three planar passes. The admission check accounts for the added
position/normal buffers. Candidate STL is encoded with Fast to avoid another pass.
No curved-surface decimation, target triangle count or near-coordinate welding.

| Grid | Fast triangles | Current High | Candidate | Fewer than High | Candidate global compaction |
| --- | ---: | ---: | ---: | ---: | ---: |
| 192³ | 89,018 | 87,204 | 81,954 | 6.02% | 7.27 s |
| 256³ | 129,168 | 125,816 | 115,152 | 8.48% | 10.66 s |

One sequential macOS Node observation per case; timings are not browser/Quest
measurements, medians or performance guarantees. Candidate times measure its
additional global compaction stage, not complete export or speedup versus High.
No whole-process RSS measurement was taken. The 256³ Fast STL is about 6.2 MiB;
the candidate is about 5.5 MiB (10.85% fewer triangles than Fast).

An independent face-cross-product inspection of the 256³ files found 95,590
axis-aligned triangles in Fast, 92,238 in High and 81,574 in the candidate.
Those faces cover about91.44% of surface area in each file. Non-axis-aligned
triangle count stays33,578. This supports investigating planar-patch reconstruction;
it does not establish a specific achievable triangle target.

## Checked correctness

Actual encoded STL files for all six conditions were retained and independently
read. Candidate checks against Fast at the same grid:

- Identical encoded XYZ dimensions (450.000015 × 58.999998 × 70 mm).
- Zero boundary, non-manifold, inconsistent-winding and degenerate counts; one
  component, no inward component and no blocking print-report issues.
- Every retained candidate coordinate exactly belongs to the prepared input mesh;
  recorded maximum accepted planar deviation is zero on these fixtures.
- Relative encoded surface-area/volume differences below 1e-6; in these runs the
  area difference is below 0.00024 mm² and volume below 0.000001 mm³.
- Five downward rays probe three pocket floors and two intervening top surfaces.
  Heights match within 0.0001 mm. This is a targeted pocket-depth check, not a
  universal Hausdorff bound, wall-thickness proof or physical-fit certification.
- Native project bytes and Undo count match before and after both resolutions.

The first 256³ inspection attempted the reference-import STL parser, whose 6 MiB
reference limit correctly refused the larger export. Benchmark inspection was
changed to an independent binary reader that checks file length and finite
coordinates. Import limits and application code were not changed.

## Evidence and next step

Ignored evidence: `work/planar-efficiency/results.json`, six `holder-*.stl` files
and `benchmark.mjs`. Reproduce after compiling core modules with:
`node work/planar-efficiency/benchmark.mjs`. Logs:
`/tmp/planar-efficiency.log`, `/tmp/planar-efficiency-256.log`.
The first log includes the inspection-tool limit failure after the valid 192³ row;
the corrected second run completed 256³ and combined both rows in results.json.

The worthwhile next research step is whole-planar-patch reconstruction with robust
boundary and hole loops, constrained retriangulation, crease preservation, bounded
memory/cancellation, material/paint handling and independent deviation/topology
checks. Keep current sampling, physical dimensions, clearances and safety admission.
Do not promise a large reduction until that different algorithm is measured.
General feature-preserving curved decimation remains a separate future phase.

Repository verification after the benchmark: `npm run check` passed formatting,
lint, strict TypeScript, build and **1,658/1,658 tests**, zero failures/skips/
cancellations (84.24 s test wall). Log: `/tmp/planar-efficiency-check.log`.
No application source changes, commits, pushes or user-project/recovery writes.

## Follow-up implementation

A separate whole-planar-region algorithm is now implemented in High; the additional
one-ring passes above were not shipped. It gives8.76%/12.24% fewer holder triangles
than previous High at192³/256³ while preserving the checked geometry. See
[the implementation and updated evidence](PLANAR_EXPORT_SIMPLIFICATION.md).
