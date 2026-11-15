# Phase 8.3b.9 — Guarded coarse preview in WebGL

2026-11-12 (Australia/Melbourne). Follow-up to the
[exact renderer comparison](SPARSE_SDF_RENDERER_RESULTS.md).

## Fixture

The desktop WebGL fixture replays the same 268-edit metre branch at 1 mm
with 45 and 90 offered edits/s. Three paired trials per cadence alternate
FIFO and FIFO plus a guarded 2 mm mesh preview. Both use the same
eight-chunk exact queue and soft 2 ms cutoff. After the exact slice, the
preview policy can check up to four still-pending brush-local chunks
from the current edits under a separate soft 1 ms cutoff.

A chunk must have exterior sign on every fine-grid boundary sample.
Its 2 mm lattice is a subset of that boundary. At each interior 1 mm
sample, the guard compares the exact sign with the sign interpolated
by the 2 mm tetrahedral lattice. Midpoints use the production face
and body diagonals and zero tolerance. A mismatch keeps the exact
path. The guard also refuses preview when a stale adjacent exact mesh
still touches the shared face. This conservative test covers sampled
sign fidelity and independent chunk seams. It leaves geometric error
and sub-lattice topology outside the guarantee.

An admitted preview replaces only the local displayed chunk and is
retired on a new invalidation or exact rebuild. The 1 mm edit field,
history and exact queue remain authoritative. First local draw counts
either a preview or an exact submitted revision. Exact catch-up counts
the completed exact revisions. Measurements use end-of-render CPU
timestamps and leave pixel presentation, GPU timing and Quest outside
the fixture.

## Results

All 12 desktop Chrome 156 runs completed with 461,818 final triangles
and identical field and ordered mesh checksums. Every stroke reached
an exact brush-local draw. The guard checked **6,345** candidate visits
across the six preview runs. It rejected **6,333** at the boundary and
classified **12** as empty. No branch candidate reached the detail or
stale-neighbor checks, and no coarse preview reached a draw. The
standalone fixture admits a contained sphere, generates a closed coarse
mesh, and rejects a sphere whose fine-grid inside sample disappears on
the coarse lattice. It also tests boundary and empty classifications.

| Offered edits/s | Policy | Local draw p95 (ms) | Exact catch-up p95 (ms) | Release drain (ms) | Frame CPU p95 (ms) |
| --- | --- | ---: | ---: | ---: | ---: |
| 45 | FIFO | 12.81 | 34.09 | 11.90 | 4.20 |
| 45 | Guarded | 12.17 | 32.86 | 19.30 | 4.30 |
| 90 | FIFO | 52.93 | 78.80 | 51.90 | 4.20 |
| 90 | Guarded | 53.87 | 78.13 | 51.90 | 4.20 |

The table uses medians of three trial metrics. The guard's per-frame CPU
p95 was at most 0.1 ms at browser timer resolution. Since every displayed
mesh was exact, the small differences in draw times do not measure a
coarse-preview effect. There is no observed preview-to-exact replacement
time on this workload.

## Decision

**No-go for this independent-chunk preview on connected sculpting.
Production 8.3c remains gated.** The boundary guard excludes the
brush-local branch geometry it was intended to accelerate. A further
coarse experiment would need explicit transitions across mixed-resolution
faces or a seam-safe regional replacement. For the next low-cost test,
use the current renderer fixture to compare a small brush-local exact
service quota with FIFO, while protecting older work. Measure local
draw, full catch-up and release together.

Focused tests passed 12/12 and quick tests passed 21/21. Full check
passed format, lint, strict types and build, then 1,747/1,752 tests
passed. Five loopback tests failed on sandbox `listen EPERM`.

## Reproduce

```sh
node scripts/benchmark-paced-renderer.mjs work/paced-renderer/guarded.html work/narrow-band-perf/cost-aware/growth-exact-3-narrow-cap8-1-1.json --preview
npm test -- guarded-preview coarse-preview dirty-chunk-queue changed-chunks narrow-band
npm run test:quick
npm run check
```

Open the generated HTML in foreground Chrome, select **Run paced
comparison** and download the JSON after PASS. Raw evidence is
`work/paced-renderer/guarded-report.json`.
