# Phase 7.5.3 — Export performance, quality and UX — 2026-11-09

## Correctness gate

Active local checkout: `/Users/brettjames/development/vrappPOC`. Initial Git status
was clean. Read current roadmap, status, source and Phase 7.5.2 handover before
editing. Fresh prerequisite run: **35/35 passed** (`export-sizing`,
`export-resolution`, `staged-boolean-export`, `export-quality`, `planar-patches`).
Actual STL coordinates / independent GLB reload retain 443 mm at 1:1 and deliberate
200/100 mm targets. Evaluated organic clay/holder holes, ordered CSG, staged 192³,
256³, budgets, native bytes/history and winding were exercised. The user's original
holder/shading complaint remains unverified without its native comparison fixture.

## Workflow

Desktop **Export…** opens a native accessible dialog with existing STL/GLB, sizing,
quality, resolution and memory controls. The UI tidy follow-up groups format/size,
uses a primary quality slider with a live preset name and short description, and
puts resolution/memory/the alternative preset selector in Advanced settings.
Target-size controls appear only in target mode. Empty reports and download
controls stay hidden until needed; scope actions use a compact two-column grid. Scope actions cover current, all, unified
and marked printable parts. Existing automatic assembly routing for scenes with
marked parts remains; deliberate target sizing refuses individual parts. Native
schema, viewport/Bake, calibration and evaluator semantics are unchanged.

Escape closes an idle dialog and restores opener focus. During preparation, Escape,
Cancel or Close request cancellation and retain the dialog for the outcome. Native
dialog focus containment and inert background prevent accidental editor actions.
The dialog uses a clamped responsive width and scrolls; header stays visible.
Desktop width/overflow was checked visually; narrow-viewport automated acceptance is pending. The existing XR
menu now opens this dialog after session exit and selects the requested format; no Quest hardware acceptance is implied.

Ordinary export prepares one URL and requires an explicit download click. Changing
format/sizing/quality/resolution/memory invalidates prepared downloads. A final
revision check refuses stale mesh downloads. Downloads use the browser's ordinary
file handling; no filesystem overwrite is performed by this code. Marked-part
exports prepared through this dialog show separate STL/report links and checked
counts/dimensions/warnings, with a 32 MiB/available-memory retained-file limit.
Cancel is wired to the existing assembly job cancellation. Direct Assembly / Fit
and Quest export behaviour outside this dialog stays compatible. Multi-part modal
interaction and physical Quest handoff still need broader browser/user acceptance.

## Quality and estimates

The three-step slider mirrors the existing Fast/Standard/High selector. Estimates
use layer triangle metadata only; no export source snapshot, colour-buffer scan,
sampling, worker request or remeshing runs on slider movement. Consequently there
are no asynchronous estimation requests to debounce or become stale. Admission is
still checked by actual preparation. Fast is exact for the committed all-layers
input; selected scopes may be smaller. Cleaned qualities display a conservative
0–source-count interval with up to 100% uncertainty. Evaluated counts remain
explicitly unknown until preparation, with intermediate/final limits labelled.
This is deliberately broad, not a trained or statistically calibrated prediction.
Narrow predictive estimates and measured cache reuse remain future work.

Measured generated triangles, format, scale and dimensions appear after preparation.
STL reports retain topology/winding/components, sampling spacing and applicable
physical planar-roundoff bounds. GLB has its existing mesh checks and is not a
substitute for the STL print report. Performance/resource details distinguish
compute times, wall durations, memory admission and actual output bytes.

No new decimator ships. Fast retains prepared triangles; staged STL's existing
chunk compaction still applies. Standard cleans/welds; High additionally uses the
existing conservative flat-region reconstruction. Unsupported curved, painted,
crease and seam cases retain existing fallbacks/refusals. No new physical tolerance,
smoothing, scale change, geometry bake, cavity change or admission relaxation was
introduced. QEM/curved decimation remains off: measured curved High cost yields no
triangle reduction, and this pass provides no proof of safe edge collapse for
thin walls, small slots or mating clearances. Existing calibrated-mm planar tests
and hole/crease/roundoff tests remain authoritative for those specific passes;
they are not a general surface-error or printer-fit guarantee.

## Reproducible measurements

Run `node scripts/benchmark-export-pipeline.mjs`. Four disposable fixtures run in
separate Node processes; each uses production preparation and actual binary STL
encoding, independent Three STLLoader parsing, original ordered-field probes and
unchanged native bytes/Undo assertions. Fixture setup is outside export timing.
One observation per case on this Mac, Node v26.8.1; not medians or Quest timings.
The holder has a 443 mm wider base, 400 mm body and three 18 mm cutters. The array
case widens cutters to 45 mm and repeats one three times; the narrower array
variant correctly refused the existing live quality cap in exploratory runs.
Curved-192 is a stored asymmetric SDF sampled at 192³; clay is a lower-resolution
stored SDF. These synthetic dimensions do not reconstruct the user's original file.

All durations below are **milliseconds**. Sampling/meshing are compositor compute
times. Source extraction/precompaction, optimisation, topology/coordinate stabilisation, encoding and
local file writes are elapsed durations including cooperative waits. Preparation
also includes allocation, source extraction, scheduling and presentation costs;
compute columns do not sum to preparation wall time. STL transformation/scaling
and other glue costs are included in encoder wall time, outside named substages.

| Fixture / quality | Grid | Sampling | Meshing | Precompaction | Optimiser | STL validation | STL encoding | Local write | Triangles |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| clay / fast | 69³ | 10.7 | 27.4 | 196.5 | 5.5 | 68.6 | 5.8 | 0.75 | 34,036 blocked |
| clay / high | 69³ | 10.7 | 27.4 | 196.5 | 294.0 | 66.4 | 5.4 | 0.53 | 34,028 |
| curved-192 / fast | 192³ | 175.2 | 326.0 | 1324.7 | 23.4 | 460.7 | 20.2 | 3.87 | 293,776 |
| curved-192 / high | 192³ | 175.2 | 326.0 | 1324.7 | 3019.2 | 579.2 | 8.0 | 3.76 | 293,776 |
| holder-443 / fast | 192³ | 850.4 | 304.2 | 8595.6 | 10.7 | 174.8 | 14.0 | 1.42 | 103,128 |
| holder-443 / high | 192³ | 850.4 | 304.2 | 8595.6 | 859.8 | 131.7 | 2.9 | 0.85 | 81,708 |
| boolean-array / fast | 104³ | 198.5 | 76.9 | 3362.5 | 6.4 | 85.3 | 6.4 | 0.98 | 48,288 |
| boolean-array / high | 104³ | 198.5 | 76.9 | 3362.5 | 440.0 | 75.8 | 0.9 | 0.98 | 43,940 |

Before/after: the geometry algorithms and their presets are unchanged from 7.5.2.
These are instrumented **current baselines and Fast/High comparisons**, not a
claimed optimisation speedup. Metadata-only slider work replaces the previous
potential full painted-colour validation scan; no timed UI speedup is claimed.

The 443 mm holder has identical checked 443 × 98 × 150 mm bounds and one component
at both qualities, with no checked open/non-manifold/winding defects. High reduces
103,128 → 81,708 (20.77%). Array output reduces 48,288 → 43,940 (9.00%) with matching
bounds/components and checked topology. Curved output stays 293,776; High spends
about 3.02 s on optimisation for no reduction. Holder precompaction (~8.60 s of
11.13 s preparation) is the clearest performance target. Do not add costly global
passes without evidence; consider safe compaction caching/reuse in future work.

Field residual probes at every encoded vertex and triangle centroid: clay
0.0901 mm; curved-192 0.0322 mm; holder 0.9723 mm; array 1.6537 mm. Fast/High maxima
match within each fixture. These include sampling/interpolation and coordinate
rounding: **not Hausdorff bounds, wall-thickness checks or clearance guarantees**.
The clay Fast report explicitly blocks 8 degenerate triangles / 10 non-manifold
edges (also 2 open edges); High's existing cleanup removes the degeneracies and
passes checked topology. Blocked experimental files stay under ignored work and
are never represented as printable successes. No safety guard was bypassed.

Tracked derived preparation bytes: clay 4.84 MiB, curved 74.17 MiB, holder 78.59 MiB,
array 15.97 MiB. Process peak RSS was 213 / 776.38 / 387.73 / 315.14 MiB respectively.
RSS includes fixture creation, original native snapshot, both quality runs, parser,
probe arrays and runtime overhead. The selected 512 MiB export budget is an
allocation/admission estimate, **not a hard whole-process RSS cap**; curved RSS
exceeds it. No total-process memory guarantee or mobile acceptance is claimed.
Existing 600k STL, 1M intermediate, staged work and allocation guards remain.

Browser measurements: final fresh in-app tab confirmed `backend: worker`, Standard
STL 31,536 triangles at 169.848 mm, optimiser 128.9 ms, validation 134.9 ms, encoding
1.7 ms, snapshot 0.5 ms, worker round trip 305.1 ms; Blob/URL preparation 0.5 ms.
An earlier actual download of this fixture independently parsed as 31,536 finite
triangles / 1,576,884 bytes. Browser disk-write completion timing is unavailable;
local Node file-write numbers above do not stand in for it. GLB 200 mm target and
High unified preparation, explicit cancellation, estimate slider synchronisation,
quality-change URL invalidation, absent-part refusal and idle Escape/focus restore
were exercised. History remained 0 Undo / 0 Redo. No recovery was restored,
discarded or overwritten; the in-app browser's pre-existing recovery stayed paused.

## Verification and remaining gates

Initial full `npm run check`: **1,669/1,669 passed**, no skips/cancellations,
86.07 s test wall; includes Biome format/lint, strict TS and Vite production build.
Final verification after part-link/layout and shortcut/Quest-handoff refinements:
**1,670/1,670 passed**, no failures/skips/cancellations (82.07 s test wall);
quick21/21 and focused estimate/outcome/project-workflow/Quest-menu61/61 passed. Existing lint warnings and bundle-size advisory remain.
One subsequent check stopped at a benchmark-file formatting error; it was fixed
before the final run. No failed run is represented as passing.

The separate Playwright smoke's installed Chromium launch failed with SIGABRT /
EPERM in this host sandbox, including after local-network permission was granted.
It did not execute its assertions. Updated reproducible scripts cover confirmation,
modal Escape/focus, slider and responsive width in addition to existing worker,
axis/oblique/sizing/failure/lifecycle checks; their full rerun remains pending in
an environment that can launch Chromium. The in-app browser fallback above is
actual browser/worker evidence, not a claim that those scripts passed.

Evidence: ignored `work/phase-7-5-3/profile.json`, STL fixtures,
`browser-standard.stl`, `browser-evidence.json`, `export-dialog.png`;
`/tmp/phase753-profile-final.log`, `/tmp/phase753-browser.log`,
`/tmp/phase753-check.log`, `/tmp/phase753-final-check.log`.
Local STLLoader/product-parser checks support file interoperability; an actual
slicer import/repair assessment, physical printer, Quest, OS freeze, mobile memory,
full multi-part dialog and narrow predictive estimate acceptance remain pending.
