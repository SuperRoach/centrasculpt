# Optional curved STL reduction — 2026-11-10

## Delivered controls

Export has File type and Quality preset in the top row. Type choices are STL/GLB;
the tooltip explains units and format use. Actual size (1:1) is a switch below,
on by default. Switching it off reveals the existing explicit target-size control.
The shared sizing/preset state and Quest handlers remain; the duplicate preset
slider was removed. The layout fits a 390 px viewport without horizontal overflow.

Advanced settings contains **Curved reduction · Experimental · STL**, off by
default. Its Surface tolerance slider offers 0.01 / 0.025 / 0.05 / 0.1 mm, default
0.05 mm. Smaller values permit less sampled surface change; larger values permit
more. The solver requests 1% reduction through 0.05 mm and 10% at 0.1 mm, with a
stricter internal solver error. These are targets, not guaranteed reductions.
Increasing tolerance can still produce a fallback, so output count is not promised
to decrease monotonically with the slider.

The option is not available for GLB or calibrated printable-part exports. GLB
clears/disables the checkbox. Part export asks the user to turn reduction off;
Unified Boolean can deliberately create an experimental combined mesh instead.
No new project setting or Undo operation is stored. Changing the option/tolerance
invalidates the prepared download just like changing sizing or quality.

The summary and companion print report distinguish:

- **✓ Curved reduction applied** — candidate passed the implemented checks.
- **Curved reduction: ✕** — includes the rejection or
  resource reason. This is not an export failure when the baseline itself is valid.

“Original” means the ordinary export for the selected preset, resolution and
physical size, including its existing planar cleanup/precision stabilisation.
Unchecking reduction returns that pipeline. It does not change the selected preset
or silently lower SDF resolution. Baseline topology errors still block publication.

## Geometry and limits

The optional step runs after physical sizing and Float32 STL stabilisation, in
millimetres. It never substitutes raw primitives, resamples the source, smooths a
sculpt or edits source fields. meshoptimizer 0.22.0 is pinned as a runtime dependency;
its experimental constrained simplifier operates on exact welded coordinates with
border locks, global-extrema locks and the reviewed 15° incident-normal crease
heuristic. Vertices stay in the original physical vertex set.

A candidate must pass all of the following:

- One closed outward component, no degenerate/boundary/non-manifold/inconsistent
  edges, equal Euler characteristic and exactly equal Float32 XYZ dimensions.
- Two directional nearest-triangle probes, up to 4,096 vertex/centroid samples per
  direction, each within the selected physical tolerance.
- Identical three-view 300² silhouette masks in one coordinate frame.
- Equal crossing counts on three 96² ray grids, with matched crossing depths and
  consecutive intervals within tolerance. These sample cavities, thicknesses and gaps.

**These finite checks do not certify Hausdorff distance, every thin wall/clearance,
self-intersection freedom or print fit.** The UI labels the mode experimental and
explicitly says it is not a fit guarantee. The accepted print report carries the
same qualification. Baseline SDF sampling error remains; tolerance is relative to
the normal exported mesh, not the original analytic design.

Existing SDF, encoder, final topology and 256/384/512 MiB choices are unchanged.
This mode adds a 300k input-face ceiling, an estimated workspace reservation of
1,024 bytes/face + 16 MiB **in addition to** the ordinary encoder estimate, a 64M
geometry-test work allowance and 1M stored ray hits per checked surface. It never
uses anticipated reduction to bypass original admission. A valid original is
retained when these allowances or geometry gates fail.

Cancellation and stale revisions propagate rather than producing fallback success.
The UI's export worker can be terminated during the synchronous bounded WASM step;
geometry probes also yield/check cooperatively. Fatal worker failure remains the
existing source-preserving failure. Actual process OOM was not induced; admission
is an estimate, not a hard process RSS cap. Larger meshes and unsupported candidates
may gain nothing and spend extra validation time. No Quest or printer acceptance
is claimed.

Optional code/WASM imports are lazy. Vite now emits ES worker chunks because the
existing clients already construct module workers. Normal off-mode STL bytes remain
unchanged; GLB geometry/colour handling is unchanged.

## Validation

The unit/worker regression recreates the reviewed coarse curved SDF: High baseline
34,028 faces, 0.05 mm mode **33,686** faces, sampled maximum 0.029127 mm and maximum
section change 0.049672 mm. Independent diagnostic helpers recheck both directional
surface distances and sections. A 0.1 mm candidate is rejected and its final STL is
byte-identical to the baseline. Tests cover open surfaces, invalid topology, small
workspace, invalid tolerance/GLB options, cancellation (including before an early
fallback), stale revisions during checks, worker parity, transferred source buffers,
native serialization and Undo/Redo preservation. No test weakens topology guards.

The serial diagnostic matrix below uses already encoded phase-7.5.4c STL inputs,
not new SDF exports. It reserves workspace using each previous attempt's available
encoder bytes and prepared input count. Input files are independently reloaded and
hashed; accepted outputs are independently surface-probed again. Times below are
only the optional reduction/check step, excluding original export, reload and
independent post-checks. This is not an end-to-end speedup comparison. Process
high-water RSS across the serial matrix reached 371.3 MiB and includes diagnostic
activities; it is not browser/worker peak or an allocation guarantee.

| Model / cap / preset | Tolerance mm | Baseline → selected faces | Result | Extra ms |
| --- | --- | --- | --- | --- |
| clay / 192 / high | 0.05 | 34,028 → 33,686 | ✓ Applied | 725.9 |
| clay / 192 / high | 0.1 | 34,028 → 34,028 | ✕ Candidate changed a checked silhouette. | 562.9 |
| curved-192 / 192 / fast | 0.05 | 293,776 → 293,776 | ✕ Candidate changed a checked cavity or gap. | 4279.6 |
| curved-192 / 192 / high | 0.05 | 293,776 → 293,776 | ✕ Not enough workspace in the selected memory budget. | 0.1 |
| holder-443 / 192 / high | 0.1 | 81,708 → 81,708 | ✕ Geometry-check work limit reached. | 3056.0 |
| holder-443 / 256 / high | 0.1 | 111,312 → 111,312 | ✕ Geometry-check work limit reached. | 3171.8 |
| boolean-array / 192 / high | 0.1 | 43,940 → 39,546 | ✓ Applied | 2132.9 |
| Lens / 192 / high | 0.1 | 79,566 → 79,566 | ✕ Geometry-check work limit reached. | 3101.3 |
| Lens / 256 / high | 0.1 | 110,420 → 110,420 | ✕ Geometry-check work limit reached. | 3251.7 |
| enclosure / 192 / high | 0.1 | 84,848 → 84,848 | ✕ Candidate failed topology or exact dimension checks. | 297.5 |
| enclosure / 256 / high | 0.1 | 72,424 → 72,424 | ✕ Geometry-check work limit reached. | 3053.5 |

Dense curved, Lens and enclosure candidates deliberately keep the original where
checks, work or workspace do not establish acceptance. The earlier offline Lens
successes did not include this new combined bounded verification-work allowance;
they are not substituted for current acceptance. Astra remains unavailable.

Production Chromium checked the actual controls on desktop and 390 px mobile:
format/preset placement, tooltips, actual/target toggle, disabled GLB option, slider
value, prepared-link invalidation, ✓ applied and ✕ fallback, real worker output,
clean final topology and unchanged history/native input. The starter target-size
fallback was compared byte-for-byte with reduction off; the synthetic curved
Unified Boolean downloaded 33,686 faces with ✓ applied.

Final full acceptance: formatting/lint, strict TypeScript, production build and
**1,693/1,693 tests** passed with no skips/failures/cancellations (115.05 s test wall).
The final production controls run is `work/export-controls/run-vNFTIY`; it repeated
the actual ✓/✕ worker downloads, sizing and mobile checks. Production baseline
and lifecycle browser scripts also passed, including metre GLB/100/200 mm STL,
planar/oblique dimensions, injected worker failure, Cancel/Escape and source history.
Early dev attempts used obsolete hidden-select locators and one timed out awaiting
a download; the selectors/manual-download wait were corrected and the immutable
production run is the acceptance result. See DEVELOPMENT_STATUS.md for full context.
The first build exposed Vite's IIFE worker code-splitting restriction; switching
already-module workers to ES output resolved it. An early Node harness import
failure was resolved by teaching the existing compiler-cache harness to rewrite
relative dynamic imports, with a cache regression assertion.

## Reproduction and evidence

```sh
npm run test:quick
npm test -- curved-decimation export-quality staged-boolean-export test-compile-cache
npm run check
node scripts/export-controls-browser-smoke.mjs
EXPORT_SMOKE_PRODUCTION=1 node scripts/export-browser-smoke.mjs
EXPORT_SMOKE_PRODUCTION=1 node scripts/export-lifecycle-smoke.mjs
```

Local matrix inputs/hashed rows: `work/curved-export/matrix.json`; its script is
`work/curved-export/matrix.mjs`. Earlier baseline files are retained under
`work/phase-7-5-4c`. Production control proof, fallback/exact/reduced STL and GLB,
desktop/mobile/result PNGs and `verification.json` are in
`work/export-controls/run-m8oCs8`. Logs: `/tmp/curved-{quick,focused,tests,check,
final-quick,final-check,browser,matrix,baseline-browser,baseline-production,
lifecycle-browser}.log`.

No commit, push or merge. Other pre-existing local desktop/recovery/preview changes
were preserved. This follow-up supersedes the earlier blanket “offline only”
decimation status solely for this explicit opt-in, guarded STL mode; it remains
disabled by default and is not a general curved-quality guarantee.

### Starter sphere follow-up — 2026-11-10

Replayed the production-browser starter sphere STL at 200 mm (31,536 triangles)
through all four tolerances. All retained the original mesh: 0.01 mm exceeded
the sampled surface tolerance (0.018610 mm); 0.025 and 0.05 mm exceeded the
section-depth/interval tolerance (0.094737 mm); 0.1 mm exceeded that check
(0.885052 mm). These are candidate rejection measurements, not delivered mesh
errors. Raw diagnostics: `work/curved-export/starter-sphere-review.json`.

This confirms limited practical usefulness even on the default sphere. The
solver's error estimate does not bound the independent section checks; rays
near tangency can be sensitive to small surface changes. A larger slider value
also requests a more aggressive candidate, so it does not guarantee acceptance.
Future review should investigate candidate selection and the interpretation of
tangent section probes before promoting this feature. No checks or resource
limits were relaxed to obtain a successful result. The summary now uses
`Curved reduction: ✕` plus the reason, omitting “original mesh kept”.
