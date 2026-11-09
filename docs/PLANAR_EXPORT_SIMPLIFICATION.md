# Whole planar-region export simplification

2026-11-09. **High** export quality now reconstructs supported planar regions
before the existing local planar passes. Fast and Standard keep their previous
geometry policies. This is export-only; no source Bake, smoothing, native-format
change or new UI control is required.

## What is supported

The first implementation joins edge-connected triangles on the **same exact
axis-aligned plane**, with consistent winding and matching normal direction. It
keeps the normal-transition band around creases. Independent source objects remain
independent, painted sources are excluded, and curved, oblique or ambiguous regions
retain their previous path. Object transforms still apply after source preparation;
an object-space box can be transformed normally. Arbitrarily rotated faces in an
already composed world-space SDF are not approximately flattened.

Each supported patch traces one outer boundary and any holes. Only strictly
collinear boundary chains are temporarily compressed for bounded triangulation.
After triangulation, every original boundary vertex is restored by splitting the
corresponding boundary triangle. This preserves seams against neighbouring faces
and prevents T-junctions. All output coordinates refer to existing vertices; none
are moved, averaged, snapped, quantised or generated.

Patch acceptance checks include boundary degree, directed loops, non-adjacent
segment intersections, consistently oriented nonzero replacement triangles,
matching directed perimeter edges, paired internal edges, no diagonal conflicting
with another region, positive area and preserved total projected area (relative
summation tolerance 1e-10). Failed or unsupported patches keep their original faces.
This is not general mesh repair or a proof that arbitrary original geometry has no
self-intersections.

## Bounds and cancellation

High's existing memory admission and 300,000 input-triangle ceiling remain, along
with final STL's 600,000 triangle ceiling and all staging/source guards. The pass
runs after exact welding/orientation, before the existing three one-ring passes.
Chunk-local precompaction does not run whole-region reconstruction; final High
works across the prepared chunks for each source.

Per patch, boundaries are limited to 8,192 original vertices, 512 non-collinear
vertices and 64 loops. Larger/ambiguous patches stay unchanged. Sampling, tracing,
validation and publication yield cooperatively and check cancellation/current
source state. The bounded triangulation call checks immediately before and after
through the surrounding cooperative stages; worker termination can cancel the
worker job. The memory budget is still a conservative work estimate, not process
RSS. This does not rescue a scene rejected before High preparation or relax limits.

## Measured holder results

A disposable dimension-matched holder reconstruction used the same source poses
and assumed named cutouts subtract, as in the earlier benchmark. It is not a
native-byte-identical user project. Actual STL results:

| Grid | Fast | Previous High | New High | Fewer than previous High |
| --- | ---: | ---: | ---: | ---: |
| 192³ | 89,018 | 87,204 | 79,566 | 8.76% |
| 256³ | 129,168 | 125,816 | 110,420 | 12.24% |

Both new High files retain 450.000015 × 58.999998 × 70 mm, one component, zero
boundary/non-manifold/inconsistent-winding/degenerate counts and no inward
component. Retained vertex coordinates belong exactly to the prepared source.
Five pocket/top-height probes match Fast within 0.0001 mm. Relative encoded area
and volume differences are below 1e-6, and recorded planar deviation is zero.
Native bytes and Undo count remain unchanged by the benchmark's exports.

The complete optimiser stage measured 0.78/1.04 seconds in single sequential Node
observations, excluding SDF preparation and final STL encoding. These are not
browser/Quest performance guarantees or directly comparable whole-export timings.
The improvement is deliberately conservative; nonplanar sampling bands remain.

## Verification

`tests/planar-patches.test.mjs` uses a dense concave closed surface with two through
slots crossing chunk boundaries. It checks a material reduction, exact retained
vertices, equal area/volume within floating-point summation error, actual holes,
zero checked topology errors, source-buffer preservation, actual High STL/GLB
bounds/holes, painted geometry preservation, unsupported planes, normal-transition
protection, malformed non-manifold patch refusal, cancellation and stale work.
Existing quality, curved geometry, source/history, worker and staged tests remain.

The real-browser smoke creates a 300 mm cube in its own disposable profile and
compares actual Fast/High worker STL files, bounds and Undo. Sampled SDF edge bands
are retained. Existing sizing/GLB/failure-reporting browser checks still run.
The test explicitly commits each numeric dimension before Create; an initial run
missed a field update. Its reduction threshold requires at least 25% versus Fast;
an initial 50% expectation was inappropriate for the retained sampled edge bands.

Ignored evidence: `work/planar-efficiency/results-patches.json`,
`holder-patches-{192,256}-high.stl`, `benchmark-patches.mjs`, and the browser files
under `work/phase-7-5-2/`. Logs: `/tmp/planar-patches-benchmark.log`,
`/tmp/planar-patches-regression.log`, `/tmp/planar-patches-browser.log`.
Final `npm run check` passed formatting/lint, strict TypeScript, production build
and **1,662/1,662 tests**, zero failures/skips/cancellations (81.98 s test wall).
Real browser cube: Fast29,292 →High18,132 triangles, unchanged300 mm bounds and
Undo; sizing/GLB/error-status checks passed too. Log:
`/tmp/planar-patches-final-check.log`. Whitespace check passed. No commit/push or
user project/recovery writes.

Arbitrary-plane reconstruction, feature-preserving curved decimation, broader
performance work, triangle estimates and the modal redesign remain separate work.

## Arbitrary-plane follow-up

High now also accepts connected oblique regions within a tightly bounded Float32
round-off allowance, with a fixed plane, strict bounds and protected boundaries.
The axis-only description above records the first implementation. See
[arbitrary-plane behaviour and verification](ARBITRARY_PLANE_EXPORT.md) for the
current policy, deviation units, rotated fixtures and work limits.
