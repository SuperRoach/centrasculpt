# Phase 7.5.2 — Export scale and geometry correctness

## Sizing

The desktop export panel now starts at **Keep actual project dimensions (1:1)**.
Choose **Scale longest side to target** for casual sculpting; its initial target is
**200 mm**, with explicit 100 mm or any 0.1–10,000 mm target available. These are
explicit session controls, not geometry-derived intent or new native metadata.
Existing native projects open unchanged and start with visible 1:1 selection.
Precision/MCP designs need no heuristic classification. A project switch retains
the visible session choice; check it before exporting a different design.

Confirmed cause of the 443→100 mm discrepancy: STL previously started with a
100 mm target and an unchecked physical-scale checkbox. The encoder deliberately
scaled the complete chosen scope to that target. This was a sizing default, not
loss of physical calibration or a metre/millimetre encoding error.

After disposable scope evaluation and before encoding, a concise summary shows
scope, actual measured XYZ dimensions, exported XYZ dimensions, relative scale
and quality. STL coordinates are millimetres. GLB coordinates are metres and now
honour the same explicit target override. Calibration includes object/group
transforms and excludes workspace navigation. STL retains its existing centring;
GLB retains its calibrated scene origin. Units/dimensions agree, not origins.
Printable-part STL remains calibrated per part; target mode explicitly refuses
that route and directs the user to Unified Boolean to scale the assembly together.
This avoids independently rescaling mating parts and changing their clearances.

## Geometry investigation

Trace: live primitives use analytic distances; sculpt layers use trilinearly
sampled committed fields. Brushing parametric sources requires Bake first.
Ordered Union uses min(a,b), Difference max(a,-b), Intersection max(a,b).
Arrays and hierarchy transforms enter that same evaluator. Viewport and disposable
staged export use the shared evaluator; export samples up to 192³, then meshes
one continuous scalar grid. STL compaction removes only planar redundancy;
quality optimisation and final STL/GLB packing consume that evaluated mesh.

No raw-primitive substitution regression has been confirmed. Hard CSG does not
create clay blending. Sampling can facet curves or lose sub-voxel detail, and STL
stores face normals while GLB stores vertex normals. Those are distinct from a
wrong surface. No automatic smoothing, dimension adjustment or clearance change
was introduced. The specific user's holder appearance remains unconfirmed without
its source file and comparison export. No original project/recovery data was opened
or overwritten; disposable synthetic fixtures are used instead.

STL reference imports deliberately centre and normalise to a display size.
Their file units are unspecified, and their displayed bounds are not their original
file dimensions. The references panel now states this explicitly. Original bytes
remain preserved; reference normalisation is not a modelling/export calibration.

## Verification and limits

`tests/export-sizing.test.mjs` independently reads actual STL coordinates and
reloads GLB through GLTFLoader: 443 mm 1:1, 200 mm default target, explicit 100 mm,
consistent units, valid winding and unchanged source buffers. Existing staged
regressions compare scalar fields and mesh buffers, ordered subtract/intersect,
192³ stage coverage, memory refusal, cancellation, stale edits, native bytes and
Undo history. Mixed organic and slotted-holder checks compare evaluated surfaces, unit vertex
normals, the organic component after GLB reload and actual STL holes. Existing array/hierarchy suites cover their shared evaluator and actual encoded
array STL/GLB geometry, including radial cutters with real holes.

`scripts/export-browser-smoke.mjs` uses a fresh browser profile and its own Vite
server. It exercises real controls/workers and inspects downloaded STL bounds at
1:1 and 200/100 mm, then independently reloads GLB to check metre bounds. Evidence is under ignored `work/phase-7-5-2/`.
Node GLB reload checks provide independent metre-dimension validation.

192³ staging, the 600,000 triangle STL ceiling, memory budgets and cancellation
remain unchanged. Feature-preserving decimation, triangle estimates, performance
work and the larger export modal remain deferred. Physical print / Quest and
external CAD shading acceptance remain separate.

Reproduce the isolated browser check with `node scripts/export-browser-smoke.mjs`.
Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` when using a separately installed Chromium.
It binds its own strict port 5199, creates a disposable profile and closes only its
own browser/server. It never approves MCP access or loads user recovery data.

Final verification: `npm run check` passed formatting/lint, strict TypeScript,
production build and **1,654/1,654 tests**, zero failures/skips/cancellations
(152.49 s test wall). Existing lint warnings and bundle-size advisory remain.
Evidence: `/tmp/phase752-final-check.log`; isolated real-browser selected/unified
export pass: `/tmp/phase752-browser.log`. Visually inspected the summary screenshot.
The initial restricted baseline passed format/lint/types/build but had four
local-listen EPERM failures; no failed baseline is represented as a pass.

## 256³ feasibility follow-up — 2026-11-09

Read-only MCP inspection of the open holder supplied nine objects and their source
poses/dimensions. A disposable reconstruction used eight boxes and an empty Base;
legacy operation metadata is omitted by this query, so named slot cutters were
explicitly assumed Difference. This is not a byte-identical native copy. Its bounds
are 450 × 59 × 70 mm; do not equate it with the earlier approximate 443 mm report.
The live project revision stayed unchanged throughout.

Experimental copied modules under ignored `work/export-256-investigation/` allowed
256³ without changing application source or native limits. One sequential Node run
per case at 512 MiB admission, including sampling, meshing, planar compaction and
Fast STL encoding:

| Layout / cap | Actual grid | Spacing mm | STL triangles | Tracked derived MiB | Seconds |
| --- | --- | --- | --- | --- | --- |
| Existing / 192 | 192³ | 3.373 | 57,912 | 61.10 | 10.18 |
| Existing / 256 | 256³ | 2.513 | 86,866 | 140.78 | 20.45 |
| Experimental tighter bounds / 192 | 192³ | 2.406 | 89,018 | 67.82 | 9.93 |
| Experimental tighter bounds / 256 | 212³ | 2.174 | 104,712 | 90.34 | 12.12 |

All four actual STL encodings retained matching dimensions, one component and zero
boundary, non-manifold, inconsistent-winding, degenerate or inverted counts.
Tracked bytes are derived grids and mesher geometry, not whole-process RSS.
These are neither browser/Quest acceptance nor performance guarantees.

Confirmed layout inefficiency: without live modifiers, visible empty dense layers
and primitive cache bounds enlarge the sampling domain. The experimental layout
omits empty dense layers and uses analytic primitive bounds. It needs dedicated
sparse-volume, ordered CSG, array, hierarchy and cancellation coverage before adoption.
The cap is a maximum, so desired source spacing stopped the last case at 212³.

256³ is feasible as an opt-in export-only maximum with existing admission guards.
It uses 2.37× cubic samples and 128 MiB scalar/scratch storage versus 54 MiB at192³.
Current compositor guards and the scalar allocation ceiling reject it; a selector
alone is insufficient. Keep viewport/Bake/native resolutions unchanged, retain
64M stage/256M total work, 600k STL/quality triangle limits, memory and cancellation.
Sixteen counted sources at full256³ exceed the existing total-work allowance.

Source boxes have no explicit corner radius. Higher resolution reduces sampling
artefacts; it does not introduce intentional fillets or clay blending. Tighter bounds
should be evaluated alongside a 256 option before paying for a larger grid.
Evidence: ignored experiment README, JSON reports and four STL files; logs
`/tmp/export-256-investigation.log` and `/tmp/export-256-tight.log`.

## Implemented: tighter bounds and optional 256³ maximum

The export panel now offers **Default · up to 192³** and **Extra detail · up to
256³**. This applies to disposable evaluated Boolean exports in STL/GLB and
printable-part STL, not ordinary committed-surface exports, viewport quality, Bake
or native project resolution. The summary reports actual grid resolution and the
selected maximum. This is a session choice; native project schema is unchanged.

Staged analytic export layout now uses exact primitive bounds even for legacy
ordered layers without live modifiers, excludes provably empty dense layers and
chooses primitive feature spacing independently of the padded primitive cache.
Sparse/unknown occupancy remains conservative. The ordered evaluator, transformed
arrays/groups, source fields and intended sharp edges are unchanged. Export does
not add fillets or smoothing. The cap remains a maximum, not a promise to reconstruct
missing sculpt detail or always allocate that many samples.

A dimension-matched holder replay through production modules measured 2.406 mm
spacing at 192³ and 1.793 mm at 256³, versus the old 3.373 mm at 192³. Both outputs
retain 450 × 59 × 70 mm, one component and zero checked topology/winding errors.
The 192³ STL contains 89,018 triangles; 256³ contains 129,168. Single-run tracked derived
storage 67.82/152.96 MiB, time 9.77/17.37 s; these are not browser RSS or Quest claims.
Evidence: `work/export-256-investigation/results-production.json` and actual STLs.

The default dense allocation limit remains 2×192³ samples. Only an independent,
unexpanded, non-initialised derived export grid can opt into 256³. Sampling keeps
64M stage and 256M total work limits; memory budgets are unchanged. The 1,000,000-triangle intermediate meshing ceiling is unchanged for both export
and preview. Final format/quality admission is unchanged, including
600,000-triangle STL validation. There is no automatic resolution downgrade.

Known trade-off: tighter bounds increase tessellation density. The historical
fine-window house fixture exceeds the unchanged intermediate meshing ceiling.
An experimental 2M allowance still exceeded final STL admission after compaction,
so that allowance was removed. Its regression verifies an explicit refusal with unchanged native
bytes/Undo; it no longer claims that fixture passes STL export at the tighter grid.
Feature-preserving decimation and performance work remain deferred.

New `tests/export-resolution.test.mjs` verifies empty/cache-bound exclusion,
conservative sparse bounds, unchanged preview restrictions, 192/256 full-grid STL
encoding and valid topology, 256 GLB metre bounds, native-byte/Undo preservation,
work quota refusal, cancellation and low-memory refusal. Existing ordered CSG,
array/group and organic/hole regressions remain. Isolated browser smoke verifies
the 192³ default, selection of 256³ for Unified Boolean, actual sizing/worker downloads
and resolution summary. Full verification results are recorded in Development Status.

Final implementation verification: `npm run check` passed formatting/lint, strict
TypeScript, production build and **1,656/1,656 tests**, with zero failures, skips
or cancellations (87.79 s test wall). Existing lint warnings/bundle advisory remain.
Browser smoke passed; screenshot inspected. Logs: `/tmp/export256-final-check.log`,
`/tmp/export256-browser.log`, `/tmp/export256-resolution-final.log`.
No commit/push. Existing uncommitted work and user project/recovery data preserved.

## Failure reporting follow-up

The export status now prefixes failures with `Export failed during <stage>`, retains
the underlying exception and confirms the source is kept. Errors use the existing
error styling and an alert role. Only an aborted signal plus a matching cancellation
exception is presented as `Export cancelled by request`; real errors are not hidden
by a simultaneous cancellation. The last preparation/worker progress stage is retained.

The earlier successful live Fast export does not identify the cause of the user's
separate planar-optimisation failure. That earlier cause remains unconfirmed; this
change makes subsequent failures directly diagnosable. No geometry, admission,
project or history behaviour changes. Unit tests cover errors, cancellation races
and source changes; a disposable browser worker fault checks actual UI messaging.

## Polygon-efficiency benchmark

Current High already exact-welds across chunks and runs three global planar passes.
Additional global passes yielded only6.02% /8.48% fewer triangles than High at
192³ /256³ on the holder reconstruction, taking7–11 s for that candidate stage.
Checked dimensions, topology and pocket depths were retained. No extra passes
were added to production; whole-planar-patch reconstruction is a separate next
investigation. See [method and actual STL evidence](PLANAR_EXPORT_BENCHMARK.md).

## Whole planar-region simplification in High

High now includes conservative exact planar-region reconstruction across prepared
chunks, preserving directed hole/perimeter edges and all seam vertices. Fast and
Standard remain unchanged. It does not move vertices, smooth edges or relax memory/
triangle limits. Supported planes, bounds and actual holder/browser verification
are documented in [the planar export guide](PLANAR_EXPORT_SIMPLIFICATION.md).

## Confirmed unintended cancellation and lifecycle fix — 2026-11-09

Reproduced the user's symptom in a disposable real browser: a window `blur` event
alone aborted an active High unified export and displayed `Export cancelled by
request`. Root cause: `AppLifecycle` sends blur/page-hidden events to the shared
interrupt handler, which unconditionally aborted export; the outcome formatter
incorrectly inferred user intent from any aborted signal.

Exports now continue through blur/page-hidden events. Interactive strokes/transforms,
Bake, library work and recovery retain their existing interruption handling. Page
navigation/closure, browser freeze, application errors and editor disposal still
abort export but record an explicit cause. Only Cancel button/Escape attach the
`user` abort reason; missing/automatic reasons are shown as interruptions. A real
exception still takes precedence over a simultaneous Cancel signal. Source/stale
revision, memory, geometry and cancellation guards remain unchanged.

`tests/export-outcome.test.mjs` covers lifecycle policy, cause-specific outcome,
missing provenance and real-error/cancel races. `scripts/export-lifecycle-smoke.mjs`
uses its own server on5201 and disposable browser, verifies a High unified STL
finishes after blur and simulated hidden-state lifecycle events, then verifies
Cancel/Escape and an injected application-error interruption, retaining Undo.
The visibility test simulates the DOM lifecycle event; it is not a browser-freeze,
OS-background-scheduling or Quest hardware guarantee. It does not attach to the
connected editor or write user projects/recovery.

Evidence: `/tmp/export-lifecycle-baseline.log` (pre-fix reproduction),
`/tmp/export-lifecycle-browser.log` (passing fixed behaviour). The script's
`--baseline` flag is only for reproduction against the old implementation.
The exact event preceding the user's earlier cancellation was not recorded; the
unrequested focus-cancellation mechanism is independently confirmed and fixed.

Final lifecycle-fix verification: formatting/lint, strict TypeScript, production
build and **1,663/1,663 tests** passed; zero failures/skips/cancellations (89.06 s).
Focused outcome/recovery17/17 passed and disposable browser lifecycle regression
passed. Full log `/tmp/export-lifecycle-check.log`. No commit/push or user-project
write/reload. Existing lint warnings/bundle advisory remain.

## Arbitrary-plane High export

High's whole-region pass now supports oblique connected regions with fixed-plane
validation and a bounded Float32 allowance. Every retained coordinate and directed
boundary is preserved, local/transformed bounds must match exactly, and curved,
painted or incompatible regions remain protected. Patch-only deviation is reported
in source coordinates and STL millimetres separately from SDF/local cleanup error.
See [arbitrary-plane guide](ARBITRARY_PLANE_EXPORT.md) for actual STL/GLB, rotated
holder and browser evidence plus verification permission limits.
