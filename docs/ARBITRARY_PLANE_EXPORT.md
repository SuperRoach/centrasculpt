# Arbitrary-plane simplification in High export

2026-11-09. High export now reconstructs eligible planar regions at arbitrary
orientations, including composed world-space geometry. Fast/Standard, project
calibration, 192³/256³ selection, native geometry and Undo are unchanged.
This extends [the axis-aligned pass](PLANAR_EXPORT_SIMPLIFICATION.md), not curved
surface decimation or smoothing.

## Candidate detection and acceptance

Exact axis-aligned planes retain their exact path. Oblique triangles with compatible
vertex normals are grouped by edge connectivity and a coarse normal bucket. The
bucket only identifies candidates: it never certifies coplanarity or merges nearby
unconnected surfaces. Crease/normal-transition bands and painted sources remain
protected.

For each entire connected candidate, the pass computes one area-weighted normal
and centroid-relative plane. Every original vertex must lie within the same fixed
plane allowance. This avoids accepting a shallow curve through a chain of locally
similar faces. Non-positive projected faces, unsupported geometry, oversized
regions and failed validations retain their original triangles.

Float32 rotation/resampling can make an intended plane slightly non-coplanar.
The allowance is the smaller of **two Float32 ULPs at the source coordinate scale**
and **0.0001 of the source voxel spacing**. This is a round-off-scale allowance,
not a user-independent physical-size or feature-intent heuristic. No vertex moves,
snaps, averages or near-coordinate welds are introduced.

Boundary loops, hole orientation, intersection checks, seam-vertex restoration,
internal/external edge validation and projected-area preservation remain active.
Projection uses the dominant normal axis and an anchored coordinate origin. Every
accepted patch must retain exactly the same local and transformed XYZ bounds,
not merely approximately equal dimensions. Retained coordinates must come from
the original mesh. Positive scales and ordinary object transforms remain supported.

## Deviation reporting

With matching projected footprints and positive projected faces, both surfaces are
height graphs over that footprint. The whole-region phase reports the conservative
source-coordinate bound `2 × maximum plane residual / abs(dominant normal)` as
`planarPatchDeviationBound` in per-source export stats. This is separate from the
existing local one-ring `maxPlanarDeviation`, whose prior tolerance is unchanged.

The STL report additionally exposes `planarPatchDeviationMM`, converted using the
source's maximum transform scale and the selected export unit/size factor. The
print report labels this whole-region-pass bound separately: it **excludes SDF
sampling error and subsequent local cleanup**. It is not overall CAD accuracy,
Hausdorff certification for the entire pipeline or a physical-fit guarantee.

## Work limits

Existing High input/working-memory admission, final STL limits, source revision
checks and worker/cooperative cancellation remain unchanged. Typed component
weights/reference indices add bounded workspace under the existing admission.
Each patch remains limited to 8,192 original boundary vertices and 64 loops.
Axis-aligned patches keep the 512 non-collinear boundary limit; oblique patches
allow at most 2,048 to retain Float32-jittered boundary vertices literally. The
intersection stages yield cooperatively; triangulation is a bounded call and can
be interrupted by worker termination. No unlimited main-thread fallback is added.

## Regression verification

Three unrelated Float32 Euler rotations of a dense concave two-slot fixture test:

- Material polygon reduction with every retained coordinate belonging to input.
- Exactly matching actual STL dimensions and reloaded GLB world bounds, including
  additional node rotation, translation and nonuniform positive scale.
- Actual holes, closed/manifold/consistent winding, area and volume preservation
  within floating-point evaluation tolerances.
- Ray intersections across 64 positions per rotation, checked against the recorded
  patch bound plus the existing local-pass allowance.
- Input buffer preservation, shallow-curvature rejection (no plane drift), and
  cancellation during fixed-plane validation without modifying any input arrays.

Existing paint, crease, malformed topology, axis-aligned, worker, analytic sphere/
prism/pyramid and export geometry regressions remain. No prior local tolerance
assertion was relaxed.

A disposable browser creates a rotated cube and runs actual Fast/High unified
worker exports: **169,480 → 92,440 triangles** (45.46% fewer), matching bounds,
unchanged Undo, zero checked winding/boundary errors and a recorded physical
round-off bound. Existing axis-aligned, sizing/GLB and error-reporting checks also
passed before the physical-MM field was added; focused encoding tests cover that
conversion. A post-field browser rerun was not claimed after elevated verification
was declined.

## Rotated holder reconstruction

The dimension-matched holder replay was rotated by Euler (0.31, 0.47, -0.23)
radians and written to Float32 before optimisation, retaining original gradient
normals. This is a disposable reconstruction, not the user's native project.
The reference comparison is the same current kernel with oblique candidates
disabled in an ignored copy, not an asserted byte-identical previous release.

| Grid | Fast | Axis-only High reference | Arbitrary High | Extra reduction |
| --- | ---: | ---: | ---: | ---: |
| 192³ | 89,018 | 88,396 | 83,882 | 5.11% |
| 256³ | 129,168 | 127,976 | 116,276 | 9.14% |

Both actual new STLs retain their Fast bounds, one component and zero checked
boundary, non-manifold, inconsistent-winding, degenerate or inward counts. Actual
rotated XYZ dimensions differ from the unrotated model, as expected; dimensions
are compared within the same rotation/grid. Relative area/volume differences stay
below 1e-6. Retained vertices, native bytes and Undo are unchanged.

Whole-region source-coordinate bounds converted at 100 mm/model unit measured
0.0000261/0.0000295 mm; five pocket/top probes differed from Fast by at most
0.00000198/0.00000307 mm. Those round-off comparisons do not imply comparable SDF
sampling or printing accuracy. Complete optimiser stage: 0.89/1.13 s in single
sequential Node observations, not browser/Quest guarantees or complete export time.

Ignored evidence: `work/oblique-export/results.json`, `holder-*.stl`,
`benchmark.mjs` and an axis-only compiled reference copy. Logs:
`/tmp/oblique-benchmark.log`, `/tmp/oblique-tests.log`, `/tmp/oblique-browser.log`.
Full sandbox verification and permission limitations are recorded in Development
Status. Existing uncommitted work, original projects and recovery data are preserved.
No commit or push.

Final sandbox verification: format/lint, strict TypeScript and build passed;
**1,662/1,666 tests passed**, with four local-server connector cases failing only
at `listen EPERM 127.0.0.1` (79.31 s wall). Three are in agent-access and one in
agent-preview. All geometry tests passed. Elevated full verification was declined
and was not retried. Focused final encoding/quality/patch tests27/27 passed.
Logs: `/tmp/oblique-sandbox-check.log`, `/tmp/oblique-final-focused.log`.
Final format and whitespace checks passed. Existing lint/bundle advisories remain.

## Final handoff verification — 2026-11-09

The earlier permission-limited status above is superseded: final elevated full
verification passed format/lint, strict TypeScript, build and **1,667/1,667 tests**
(81.22 s test wall). Final export browser checks include the physical-MM report
field and passed, as did hostname MCP and export lifecycle browser suites.
Logs: `/tmp/centra-handoff-final-check.log`,
`/tmp/centra-handoff-export-browser.log`, `/tmp/centra-handoff-agent-browser.log`,
`/tmp/centra-handoff-lifecycle-browser.log`. User authorised commit/push for handoff.
