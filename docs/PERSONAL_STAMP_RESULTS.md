# Personal Shape stamps — implementation and measured limits

2026-11-10–11. Phase 8.0.1 is implemented locally. Phase 8.0.2 has measured software
quality/performance evidence and explicit failures; it is not blanket headset or
print acceptance. No sparse SDF migration, resource-limit increase or deployment.

## Implementation

Personal Shapes → **Use as Stamp** loads a saved or restored evaluated SDF master.
The session owns an independent exact Float32 value snapshot, original lattice,
calibrated transform and saved Centre/Base centre pivot. A master-mesh preview is
derived once without becoming a CSG input. The ordinary ShapeDefinition carries an
opaque validated capability; it cannot be reconstructed from a library ID or JSON.
Changing a saved asset requires selecting it again; reload resets stamp selection.

Desktop click capture, numeric placement, G/T manipulation and Apply stamp share
`IndependentLayers.stampShapeSteps` with XR single/continuous strokes. Add/Subtract,
mask blend, mirrored sampling, staged history, meshing, growth admission and
Undo/Redo remain shared. Mutable pose/settings are frozen across XR queues while
the immutable master capability is retained. Continuous spacing uses the smallest
actual master bounding dimension, rather than the uniform-size control's carrier
cube. Queue/pose/brush/triangle/history limits are unchanged.

There is no resampled detail cache. One selected master snapshot and at most one
Personal preview per desktop/XR ghost are retained; built-ins retain their four
existing cached previews. Switching the source releases derived geometry and
pending-trail references. Weakly keyed source capabilities have no global retained
entry list or stale ID lookup. The selected source and a conservative allowance
for both ghosts enter tracked memory admission, including other edits while a
stamp stays selected. Preparation admits the actual preview size before growing
its retained buffers. A new selection also accounts for the previous selection
while preparing the replacement. No cache can modify a library record.

Personal implicit fields are not distance-certified. They scan the full destination
and do not use the analytic AABB distance rejection shortcut. Meshing still updates
only affected chunks. This is a correctness choice, not sparse storage.

## Workload and evidence

Host: Apple M5 Pro, Node v26.8.1. Version-1 fixture formulas and the unchanged eleven
192³, 50 mm/unit `.form` masters from
`work/personal-stamp-baseline/2026-11-10T12-23-20.143Z` were used. Each master was
encoded into a disposable library, exported/restored through `.cshapes`, and checked
for exact original/restored Float32 hashes. Destinations are fixed [-50,50] mm cubes
at 64/128/192, with Add into empty material or Subtract from a bounded box. No auto
growth is needed in this matrix. Existing transform, symmetry, pivot and growth
regressions cover those separate interaction cases.

The matrix records first stamp, two Undo/reapply observations where admitted,
three independent source preparations, and a fixed 20-pose packed continuous trace.
53/66 first stamps completed; 13 were safely refused. There were 1,037 completed
warm observations. Three 192³ thin-bar Add traces and subsequent reapplications
hit history/staging budgets: rollback or redo restored the exact first-stamp hash.
These are measured refusals, not 20 successful warm stamps for those cases. All
saved masters and original fixture files remained unchanged.

Raw matrix: `work/personal-stamps-matrix/2026-11-10T12-46-10.474Z/results.json`.
Cross-section reproduction: adjacent `detail.json`. Initial baseline evidence:
`work/personal-stamps-before/2026-11-10T12-40-39.841Z/results.json` and
`work/personal-stamps-baseline/2026-11-10T12-41-11.914Z/results.json`. Preliminary runs stopped when an expected
memory refusal was initially treated as a harness exception; the final matrix
records refusals and continues. Ignored `work/` evidence is local, not a release asset.

## Physical geometric deviation

The metric samples about 600 master-mesh vertices against the nearest destination
triangle, and separately samples destination vertices against master triangles,
using a spatial index. It is physical mm geometric distance, not field magnitude
renamed as geometric error. It is a finite sample, not a Hausdorff certificate or
print-fit tolerance. The source reference is the sampled master mesh, so it does
not erase master-vs-procedural error in the curved implicit reference fixtures.

Maximum sampled source → destination distance in mm follows; at 192³ the cell
shows Add / Subtract if different. Rounded 0.000 values are below 0.000002 mm at
sampled points on matching lattices, not certified zero geometric error.

| Fixture | 64³ | 128³ | 192³ Add / Subtract |
| --- | ---: | ---: | ---: |
| horn | 1.770 | 0.131 | refused / 0.000 |
| organic-curve | 0.445 | 0.205 | refused / 0.000 |
| hollow-part | 0.997 | 0.312 | refused |
| long-thin-1mm | no surface | 0.707 | 0.000 |
| long-thin-2mm | 0.969 | 0.420 | 0.000 |
| long-thin-3mm | 0.702 | 0.286 | 0.000 |
| long-thin-4mm | 0.849 | 0.391 | refused / 0.000 |
| slot-1mm | 5.821 | 0.244 | refused |
| slot-2mm | 0.647 | 0.244 | refused |
| slot-4mm | 0.427 | 0.244 | refused |
| slot-8mm | 0.810 | 0.253 | refused |

Destination voxel steps are **1.5873 / 0.7874 / 0.5236 mm**. The 1 mm bar has no
64³ surface. Its 128³ mesh exists but its centre cross-section is absent: existence
of triangles alone is not detail preservation. The 1 mm slot closes at 64³
(aperture probes fail, maximum sampled deviation 5.821 mm). At 128³ its central
opening measures 1.000 mm. Thin-feature failures must remain visible in acceptance;
no optimisation may substitute a lower-resolution master to hide them.

Physical cross-section measurements use 0.05 mm bracketing and 24 bisections on the
actual destination trilinear field. At the fixed bar centre, source widths
1/2/3/4 mm become **absent / 1.287 / 2.995 / 3.998 mm** at 64³ and
**absent / 1.949 / 3.000 / 4.000 mm** at 128³. Admitted 192³ bars retain their
1/2/3 mm central widths; the 4 mm Add is refused. At the hollow wall probe,
3 mm walls and the 14 mm internal gap remain 3/14/3 mm at 64³ and 128³; its
Z bore stays connected. These are selected sections, not global minimum widths.

All 53 admitted extracted stamp/cavity surfaces have zero boundary and nonmanifold
edges under 1e-6 model-unit welding. Component counts, Euler characteristic and
quantization-collapsed triangles are recorded. Quantization can collapse tiny valid
triangles at 192³; the Euler count excludes those collapsed faces. Neither closed
edges nor a valid Euler count proves that the intended slot/bar survived. The
Subtract host outer shell is excluded from stamp-surface deviation/topology, and
whole-destination topology is recorded separately.

## CPU, allocations and remeshing

Initial allocation-heavy horn 64³: first Add **72.1 ms**, repeated mean **66.9 ms**.
Scalar direct-master interpolation: first Add **37.0 ms**, repeated mean **30.3 ms**
in the immediate comparison; final matrix **41.4 / 33.4 ms** under a different load.
Geometry/deviation/topology stayed the same. No destination sample cache was added.

| Final horn workload | First ms | Repeated mean ms | Chunks first / allocated |
| --- | ---: | ---: | ---: |
| 64³ Add | 41.4 | 33.4 | 10 / 64 |
| 64³ Subtract | 94.9 | 50.0 | 41 / 64 |
| 128³ Add | 202.4 | 221.7 | 24 / 512 |
| 128³ Subtract | 169.2 | 204.9 | 24 / 512 |
| 192³ Subtract | 515.3 | 577.3 | 44 / 1728 |

First source preparation is separate from first stamp CPU; these are host timings,
not headset frame latency or guaranteed real-time rates. Warm traces change pose,
include no-op samples when applicable, and report changed voxels/chunks individually.
The 64³ horn Add scans/evaluates all 262,144 samples and changes all far-field values,
while remeshing only ten chunks. Dense allocation is not proportional to dirty chunks.

Each patch reports actual typed staging buffer allocations, cumulative allocated
bytes, retained capacity and simultaneous old/new staging peak. For that horn Add:
27 allocations, 6,279,168 cumulative bytes, 4,718,592 peak staging bytes and 3,145,728
retained capacity bytes. These exclude history copies, meshes, GPU and allocator
metadata. Full destination values+scratch are 2/16/54 MiB; master values alone are
27 MiB. Tracked/history/source estimates and whole-process memory snapshots are
reported separately. No claim of isolated Node retained or continuous peak memory.

After the initial baseline exposed temporary arrays and a growable JS-number
preview, scalar sampling removed per-voxel coordinate arrays. Typed chunk preview
assembly and a direct dense snapshot copy then reduced horn preparation observations
from **237–268 ms** to **85–106 ms**. Whole-process heap deltas across the three
observations fell from **27.7–60.8 MiB** to **9.8–21.6 MiB**; these are snapshots,
not measured allocation totals or peaks. Evidence:
`work/personal-stamps-preview-after/2026-11-10T12-48-22.036Z/results.json`.

Disposable Chromium measured a restored starter-shape workload, not a 192³ stress
case. `work/personal-stamp-browser-memory.json` records post-GC retained snapshots
and 50 ms Runtime.getHeapUsage samples. Post-GC backing storage was **14.94 MiB** before selection,
**22.14 MiB** after stamps/Undo/Redo with the master selected,
and **18.06 MiB** after choosing a built-in stamp. Observed sampled
peaks were **36.73 MiB JS heap** and
**28.32 MiB backing storage**. Node and Chromium metrics
have different scopes. Observed samples miss shorter spikes and exclude GPU allocations. Physical Quest,
sustained large-master browser/thermal peaks and printed fit remain open.

## Reproduce and verification

```sh
npm test -- personal-stamp xr-shape-stamp shape-stamp
node --expose-gc scripts/benchmark-personal-stamps.mjs
node scripts/measure-personal-stamp-detail.mjs <matrix-run-directory>
# Against the local app at 5268; isolated profiles only:
node scripts/personal-stamp-browser-smoke.mjs
npm --prefix read-the-docs-pls test
npm run check
```

Master fixture preparation is described in [PERSONAL_STAMP_BASELINE.md](PERSONAL_STAMP_BASELINE.md).
The measurement scripts never open the user's library. Exact restore/CSG, both
pivots, calibration, orientation, symmetry, value-snapshot independence, brush edits
on destinations, single/packed continuous history, cancellation and cache replacement
are covered by focused tests. Browser acceptance exercises visible restored selection,
Add/Subtract and Undo/Redo, checks unchanged saved payloads, then verifies independent
insertion/edit/.form/STL through engine APIs. It is not physical Quest acceptance.

Final full check: **1,721/1,721**, focused **97/97**, quick **21/21**, guide **8/8**, and disposable Chromium acceptance passed. The full run includes the expanded-master regression. The initial sandbox full run failed five socket-bind tests with EPERM; the unrestricted run passed those tests. No commits, pushes, merges or deployments were performed.
