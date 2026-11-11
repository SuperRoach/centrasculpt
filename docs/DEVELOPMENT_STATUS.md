# Phase 8.4 — VR Sculpting Experience Polish — 2026-11-12

## 1. Scope and preservation

Worked in the active `/Users/brettjames/development/vrappPOC` checkout over
existing local XR and editor work. Reviewed the Medium screenshots and the
Move, ownership, sizing, menu, layer, project and recovery paths. All live
validation used generated clay or a separate loopback browser origin.
Existing projects, Personal Shapes and recovery records were preserved.
Phase 8.3b stays isolated. Production dense storage and voxel-resolution
limits were untouched.

## 2. Move gesture and transactions

Free Move is the default for new settings. It combines pose-relative
translation and wrist rotation around the captured layer-local centre.
The compact field has a full-strength core at one quarter of the influence
radius and a smooth taper. CPU reconstruction and GPU preview evaluate the
same source-space field. Separate Translate, Rotate and Twist gestures
retain their previous deformation and saved preference semantics. Surface
placement targets the selected layer's ray hit. Free places the centre
12 cm ahead of the controller, including inside or outside the clay.

The preview reserves chunks under the existing preparation budget, allowing
up to 25% radius growth within the normal size limits. Held changes update
the CPU and GPU radius together while keeping source positions and voxels
frozen. Release snapshots the final field and uses the existing guarded
reconstruction and one-action publication. Shrinking the influence clear
of the surface yields an empty patch. Elastic Translate retains its held
stick softness binding. Move defaults to controller-tip placement when no placement is saved.

## 3. VR feedback and navigation

The two Move shells use depth testing, lightweight sphere geometry and
transparent materials. The inner shell shows the full-strength Free Move
core. In precise modes it indicates the high-weight region. The green
controller-side ruler uses a logarithmic scale, a smoothed pointer, dark
outlines and a brief fade. It uses the current brush radius or Stamp scale
through the existing sizing ownership.

The Layers, World and References panels and Tool Wheel provide coloured
navigation with hover descriptions. References uses the existing immersive
reference panel and browser import handoff. Personal Library uses the
guarded browser Personal Shapes handoff and disables when unavailable.
Mask, Paint and Project use icon-only Tool Wheel controls. A cylinder mesh
renders the thicker menu ray. A circular hover tip and halo use the same
underlying UV hit and trigger ownership.

## 4. Verification

The targeted Move, XR input, menu, layer, sizing and recovery suite passed
381 tests. Free Move resize matched the fixed-final-radius reconstruction
sample for sample. Tests cover the combined normal Jacobian, compact
support, inside/outside placement, zero-effect shrink, exact Undo/Redo,
controller priorities, and unavailable or busy navigation. Quick checks passed
21/21 and worker-backed Move checks passed 93/93. Full `npm run check` passed
formatting, lint, strict TypeScript and production build. The full suite
passed 1,736/1,741 with no skips. The five failures were loopback server
starts blocked by sandbox `listen EPERM` in the agent bridge, binary preview
and development guide routing tests. With loopback permissions, an isolated
copy of the staged Phase 8.4 changes passed the complete `npm run check`
with 1,736/1,736 tests and no skips.

Disposable Chromium WebGL showed a simultaneous 0.079 model-unit pull
and 22.92° wrist rotation as radius grew from 0.220 to 0.230. The fixture
reported a visible ruler, zero shader errors, exact native round-trip and
one Undo step with Redo. Free placement with tracking loss kept the
original source bytes and empty history. The production menu canvas showed
the icon rows on a bright fixture background. The local Quest emulator
rendered stereo Studio and returned to desktop. Browser tests used virtual
controllers and generated clay.

## 5. Remaining gates

Physical Quest controller ergonomics, Passthrough contrast, thermal
performance and frame timing remain unverified. A preview can refuse a
large influence under the existing preparation budget. Free placement
requires overlap with the active layer's surface to start. The browser
handoff is exposed as such and can be refused while another edit owns
the project.

## 6. Handoff

Use `scripts/move-precision-browser.html` for the disposable WebGL Move
fixture and `scripts/fixtures/vr-menu-design.html` for the production menu
canvas. The public field guide describes the shipped controls.

---

# Phase 8.3a — Dense vs sparse brick research — 2026-11-11

## 1. Scope, authority and preservation

Active local `/Users/brettjames/development/vrappPOC`, HEAD `b80d1be`, initially
clean. The supplied Documents directory is not a repository. Inspected current
handover/roadmap, Personal Stamp results/fixture/baseline harness, SDFVolume and
VolumeStore, dense growth, extraction/chunk cache, brush/stamp, history, native
project codec, Personal Shapes and backup contracts. Existing eleven disposable
masters were read only; their hashes match the prior baseline. No production src,
quality semantics, caps, user project/library/recovery, WHATS_NEW or public model
claims changed. No commit, push, merge or deployment.

## 2. Isolated implementation and correctness

Offline `scripts/research/brick-volume.mjs` implements 8³ sample bricks and 16³
sensitivity via the mesher's read-only subset, not the mutable VolumeStore API.
Explicit signed constant-region entries preserve positive, negative and ±0 values;
varying inside/outside regions retain all original Float32 samples. Unknown regions
throw. Stable floor-divided global keys support negative/grown/cropped origins.
Canonical neighboring sample reads provide interpolation and normal-stencil halos
without duplicated halo arrays. Exact-zero and no-surface semantics stay shared
with the current mesher. No narrow-band behavior is claimed.

## 3. Measurements and limitations

Full matrix: 11 stored masters plus diagonal capsule and Boolean shell × 64/128/192
× 8³/16³ = **78/78**. Zero sample/interpolation/normalized-gradient deviations and
identical position/normal mesh hashes; all welded meshes have zero boundary and
nonmanifold edges. The 1 mm bar still has no surface at 64³. Coarse resolution
feature failures are not repaired by bricks.

All fixture brick payloads are **100% allocated**. With modeled metadata, 8³ uses
112.5% of dense values alone (16³: 101.56%). Apparent savings vs dense values plus
scratch reflect omitted editing scratch, not payload compression. Main-matrix 8³
warm random/local/scan medians are **4.15/4.46/4.54× dense**, repeated transformed
sampling **4.57×**; conversion median 114.1 ms. Four-voxel candidate payload occupancy
medians are 4.05%/2.40% at 128/192 for 8³, before far fields, halos, metadata,
mutable scratch or co-resident exact masters. These are candidate estimates only.
Modeled 192 conversion working peak 84.44 MiB excludes original master/meshes/etc;
observed whole-process high-water RSS 771.95 MiB has a different scope. JS metadata
and conversion scratch are allowances, not measured allocation/peak guarantees.

Fresh-process cold/warm pairs and supplemental source-crop/growth/target-bound
measurements are in the report below. Same-process matrix timings overlapped full
checks; final fresh-process trials ran separately. Repeated stamp timings are
read-only transformed field evaluation, not production transactions or Quest latency.
Changing source bounds changes exterior extension even with overlapping samples
unchanged; cropping is not a semantics-neutral sparse optimization.

## 4. Verification and reproducibility

Focused prototype + baseline fixtures **7/7**, quick **21/21**. Final full check
passed format, lint, strict TS and build; **1,720/1,725 tests passed, five failed
on sandbox `listen EPERM`** in HTTP/MCP/docs-hosting tests, no skips. This is not a
full pass. Final offline-file Biome check passed after supplemental harness and
accounting-label edits; final focused rerun passed. No unrestricted/socket or
browser/physical Quest rerun is claimed.

Raw complete matrix: `work/sparse-bricks/2026-11-10T13-09-54.092Z/metrics.json`;
paired process observations: adjacent `cold-trials.json` (final isolated) and
`cold-trials-loaded.json` (earlier loaded host); bounds: `source-bounds.json`.
An earlier interrupted formula-only run is superseded, not acceptance evidence.
Logs: `/tmp/83a-{benchmark-final,cold-isolated,source-bounds,focused-final,quick,check-final}.log`.
Full method, per-metric definitions, commands and limitations:
[Phase 8.3a research report](SPARSE_SDF_83A_RESULTS.md).

## 5. Integration gaps and recommendation

**No-go for production replacement; conditional go for isolated 8.3b research.**
The current simple Map path fails lookup gates and exact bricks do not reduce
fixture payloads. Candidate surface locality merits a separate 2/3/4-voxel band
experiment only. Future integration needs full mutable APIs, brush/Jacobi scratch,
stencil invalidation, transactional growth, exact history/Undo, masks/paint remap,
worker/export/native/project/recovery roundtrips and lossless Personal master/backup
fidelity. PersonalStamp currently copies all samples even from a generic store.
Sign-only far fields cannot preserve exact Boolean and full Float32 semantics.
The report enumerates concrete call-site dependencies and required changes.

## 6. Next acceptance gates

8.3b remains unstarted. Require median 128/192 working footprint savings ≥50% vs
values+scratch and ≥25% vs values alone, including metadata/halos/mutable scratch
and any co-resident exact master; no case above dense values+scratch. Warm lookup
median ≤2× dense/no case >3×; repeated field sampling ≤1.5×. Preserve surface signs,
band samples and topology; interpolation ≤1e-6 units, normalized gradient component
≤1e-4, no added holes/lost components/silhouette differences, and geometric deviation
≤0.01 voxel if meshes differ. Exact full Float32 master/project/backup/recovery and
Undo roundtrips plus Boolean far-field equivalence or explicit lossless fallback
are mandatory. Existing work/memory/triangle limits remain fixed. Stop if total
footprint fails after including exact-data retention. See report for detailed gates;
8.3c production integration is a later decision, not authorized by this research.

---

# Phase 8.0.1 / 8.0.2 — Personal master stamping and measured limits — 2026-11-11

Implemented from the clean fd14fe4 local checkout after inspecting the completion
audit and version-1 fixture harness. Historical audits below describe their earlier
checkout; the absent-feature statements are superseded by this entry.

Personal Shapes now has **Use as Stamp**. A calibrated exact-value SDF snapshot,
saved pivot and original rectangular/cubic lattice enter the built-in staged stamp
pipeline. Desktop click capture/Apply/G/T and XR single/continuous queues preserve
master identity, orientation, uniform size, scale, symmetry, masks, packed Undo/Redo
and cancellation. The master is never used as a mutable destination. Restore →
stamp tests compare independent `.cshapes` libraries and verify downstream brush
edits cannot alter saved payloads. No source resolution changes or automatic
master downgrades. Source preparation and both ghost budgets are bounded and charged
to edit admission; switching sources releases stale preview/trail references.

[Personal Stamp results](PERSONAL_STAMP_RESULTS.md) contains the complete method,
quality table, limitations, raw local evidence paths and reproduction commands.
The 66-case 11-fixture × 64/128/192 × Add/Subtract matrix admitted 53 first stamps
and safely refused 13. All admitted meshes had closed/manifold welded edges, but
thin-feature gates fail: the 1 mm bar loses its central cross-section at 64/128 and
the 1 mm slot closes at 64. The matrix includes 1,037 completed warm observations,
three source preparations and first/reapply timings where admitted. Three 192 Add
thin-bar traces/reapplications exceed history/staging budgets and restore exact
hashes. Refusals are acceptance results, not reasons to raise limits.

Baseline-before-optimisation horn 64 Add: first/repeated 72.1/66.9 ms; scalar sampler
immediate comparison 37.0/30.3 ms with unchanged measured geometry. Final matrix
41.4/33.4 ms under other host load. Typed preview assembly reduced measured source
preparation from 237–268 ms to 85–106 ms; process heap snapshots and browser
retained/sampled memory are explicitly distinguished from peaks and allocations.
No resampled SDF cache was introduced. Personal fields scan all target samples;
unsafe analytic distance pruning is disabled. Dirty-chunk remeshing remains local.

Validation: final unrestricted full check **1,721/1,721**, focused **97/97**, quick
**21/21**, guide **8/8** and isolated Chromium restored selection/Add/Subtract/Undo/Redo,
unchanged saved assets and independent insert/edit/.form/STL passed. The final full
run includes the added rectangular-master regression. The sandbox attempt failed
five unrelated HTTP/MCP tests on EPERM socket binding; the unrestricted rerun passed.
Logs: `/tmp/personal-{focused-final,full-check-final,browser-memory}.log`;
browser memory and desktop capture are under `work/personal-stamp-*`.

Still open: physical Quest selection/re-entry/controller usability, sustained
large-master browser/GPU/thermal peak memory and print-fit testing. The browser
memory run uses restored starter shapes; it is not the 192³ fixture stress workload.
This work does not claim all thin features survive, universal dense 192 Add admission,
or real-time headset stamping. Sparse SDF, component collections and agent Personal
Shape integration remain outside scope. No resource limits were raised. No commit,
push, merge or deploy was performed.

---

# Phase 8.0.2 — Offline fixture/baseline preparation — 2026-11-10

## 1. Scope and preservation

Continued from the completion audit in the active c94c893 checkout with all existing
uncommitted backup work intact. Added offline scripts, fixture tests and engineering
documentation only. No src engine changes, user database access, commits or publication.
Generated files go into new timestamped ignored work directories, not user storage.

## 2. Delivered preparation

`scripts/fixtures/personal-stamp-baseline.mjs` version 1 defines horn, organic arc,
hollow part, four thin-bar widths and four slot widths in millimetres. The curved
fields are declared implicit approximations. `scripts/benchmark-personal-stamp-baseline.mjs`
generates 11 dense 192³ evaluated `.form` projects in a 100 mm cube with 50 mm/unit
calibration, verifies native sample roundtrips, records SHA-256 sample/native hashes,
source step, occupied samples, calculated array bytes, probe errors and process memory
snapshots. Includes a deterministic 20-pose trace for future actual stamp replay.

## 3. Results and limits

First complete run: `work/personal-stamp-baseline/2026-11-10T12-23-20.143Z/`, about
297 MiB. All 11 fixtures have occupied samples, exact native sample roundtrips and
preserved calibration; probes leave master hashes unchanged. Reference geometry tests
pass 3/3 (boundaries, solid/void probes, holes/slots/bar widths and trace bounds).
These do not establish topology in sampled/stamped volumes. The 64/128/192 rows use
different probe spacings on the same master, not actual destination stamping.
No custom-stamp CPU/chunk/cache/Undo or retained/peak browser measurements are claimed.

## 4. Verification

Fixture tests 3/3 and quick tests 21/21 passed; `git diff --check` passed.
Required `npm run check` passed format, lint, strict types, production build and
**1,715/1,715 tests**, zero failures/skips (88.00 s test wall). This fresh run
also passed the socket-based tests that failed under the earlier audit restrictions.
The existing bundle-size advisory remains. No fresh Chromium acceptance is claimed.
Logs: `/tmp/centra-phase800-audit/baseline-{prep,tests,quick,check}.log`.

## 5. Reproduction and documentation

Run `node scripts/benchmark-personal-stamp-baseline.mjs` from repo root; optionally
pass an output parent. Every run creates a fresh timestamped child. Run
`npm test -- personal-stamp-baseline` and `npm run check` for verification.
See [baseline guide](PERSONAL_STAMP_BASELINE.md) for formula semantics, file sizes,
quality/memory interpretation and pending gates. Roadmap updated. Public docs and
WHATS_NEW need no new entry because no app feature changed.

## 6. Next acceptance

8.0.1 custom stamps are still absent. Next implement/verify actual restored-master
stamping before using these fixtures for Add/Subtract, pivots/transforms/symmetry,
preview/repeat/Undo, CPU/chunks and hardware measurements. Generated `.form` files are
not imported Personal Shape library records. Future dense-vs-sparse comparisons can
reuse exact samples, source formulas, calibration and traces; no sparse work started.

---

# Phase 8.0.0 / 8.0.1 completion audit — 2026-11-10

## 1. Authority, scope and preservation

Audited active `/Users/brettjames/development/vrappPOC` at HEAD `c94c893`.
The supplied Documents folder is not a repository. Local code takes precedence over
GitHub and the referenced research chat. Initial status already contained changes
in WHATS_NEW, this handover, ROADMAP, public content, compile-core, personal-shape-ui,
personal-shapes and project-library, plus untracked shape-backup source/test/browser
script. Those changes are preserved. This audit changes documentation only; no
engine changes, user databases, project/recovery assets, commits, pushes or deployment.
Tests use fresh fake IndexedDB factories; attempted Chromium uses disposable contexts.
Older dated handovers below are historical evidence, not a fresh acceptance claim.

## 2. Phase 8.0.0: implemented, with hardware acceptance outstanding

Source inspected: `src/personal-shapes.ts`, `src/shape-backup.ts`,
`src/personal-shape-ui.ts`, `src/project-library.ts`, and their unit/browser tests.
Separate `centra-personal-shapes-v1` IndexedDB records/payloads store evaluated native
SDF masters, calibration, dimensions, timestamps, Centre/Base pivot and thumbnails.
Ordinary sculpt capture and independent insertion copy original Float32 samples and
grown lattice exactly. Boolean/array capture samples an evaluated composite up to
192³ with a source-step admission check; it refuses unsupported detail. Standalone
analytic primitives require explicit Bake. Gzip and backup payload transport are
lossless; evaluated capture itself must not be confused with original construction.

Portable `.cshapes` v1 carries magic, manifest length, SHA-256 manifest/payload hashes,
metadata and exact native/gzip bytes. Export is a read-only snapshot. UI reviews count/
size before download; import validates before showing a preview and explicit confirm.
Checks include version, lengths, trailing bytes, finite metadata, decoded native master,
checksum, image headers and real browser decode. Limits: 64 MiB file, 4 MiB manifest,
100 entries, 32 MiB decoded master, file + 6× current decoded master <=224 MiB;
UI current tracked/composite geometry <=32 MiB. These can refuse a library that the
ordinary shape store can hold; export is not an unlimited backup guarantee.

Restore rechecks current count/byte budgets inside one strict-durability transaction
covering both stores. Conflicting IDs become independent copies, never overwrite.
Imported fingerprints include decoded master, name, dimensions, calibration, pivot and
thumbnail; repeat imports skip matching imported records. Restoring into the original
source profile can first make conflict copies. This is not universal geometry dedup.
Quota, cancellation and interruption rollback are tested with simulated faults.
Estimates do not reserve disk, guarantee browser peak memory or prove power-loss safety.

## 3. Phase 8.0.1: absent in this checkout; built-in machinery is reusable

`src/shapes.ts` accepts only sphere, box, triangular-prism and pyramid. No Personal
Shape ID/master sampler/cache enters ShapeDefinition, prepareShape or stampShapeSteps.
Personal Shapes UI has insertion, not Use as Stamp. No custom-stamp implementation,
64/128/192 custom quality study or recent personal stamping experiment was found in
tracked/uncommitted source, tests or searched work/outputs artifacts. External/manual
experiments may exist elsewhere; their results cannot be certified here.

Built-in `shape-library.ts` prepares analytic/polyhedron distance kernels directly;
it does not resample saved masters. `shape-stamp.ts` stages exact Float32 min/max CSG
for Add/Subtract with mask blending, layer-local transforms, uniform pose scale and
mirror sampling. Conservative scans can span a dense grid even when remeshing is local.
`independent-layers.ts` handles admission/growth, patch history and chunk invalidation.
Single commands are one action; XR continuous stamps pack repeated patches into one
stroke, queue bounded poses and rollback cancellation/overflow/budget failures.
`xr-shape-stamp.ts` has attachment quaternion/offset, spacing, frozen released queues,
preview ghosts and bounded pending previews. These are built-in capabilities only.

`shape-placement.ts` places a preview at a world hit converted into layer coordinates,
preserving rotation/dimensions; it does not automatically normal-align a custom pivot.
`surface-snapping.ts` separately provides interpolated normals, mm offsets and alignment.
`sdf-surface-hit.ts` provides read-only half-voxel marching/bisection on live fields when
derived meshes miss. Existing surface sampling, transform and Undo tests are useful
regression infrastructure, not proof that Personal Shape stamps work.

## 4. Verification and evidence limits

Fresh audit: `npm test -- personal-shapes shape-backup shape-stamp surface` passed
**119/119**, zero failures/skips. Includes exact master insertion/native/STL, calibrated
independence, Boolean holes, corruption/limits, atomic conflicts/duplicates, simulated
quota/cancel/interruption, built-in Add/Subtract at 64/128/192, transforms, local remesh,
Undo/redo and surface fallback. Full `npm run check`: format, lint, strict TS and
production build passed; **1,707/1,712 tests passed, five failed on socket bind EPERM**
(HTTP/MCP bridge and docs-hosting tests), zero skipped. This run is not a full pass.
Network permission was granted but server attempts were unsuccessful (initial EPERM,
then port 5268 reported occupied). Disposable Chromium backup smoke also failed at
browser launch before test assertions. No fresh cross-profile browser pass is claimed.

Earlier on-disk `/tmp/shape-backup-final-check.log` records 1,712/1,712 passing;
`/tmp/shape-backup-browser.log` records two isolated profiles, exact payloads/metadata,
UI export/import/cancel/repeat, restored insert/edit/.form/STL and master independence.
The browser script performs downstream editing/export through imported engine APIs,
not every step through visible UI. It never stamps a restored master. Earlier personal
browser log covers insert/reload/rename/delete. These logs support 8.0.0 software
completion, not 8.0.1 or physical cross-device/Quest acceptance.

Post-edit quick tests passed 21/21, public guide tests passed 8/8, and
`git diff --check` passed. Public Personal Shapes, backup, FAQ and Stamp guidance
already distinguishes insertion from deferred custom stamping; no public text or
WHATS_NEW change was needed for this audit. Existing uncommitted edits remain.

Audit logs: `/tmp/centra-phase800-audit/{focused,check,dev,browser,quick,docs}.log`
(temporary).
Reproduce focused command above, `npm run check`, and the existing browser scripts
against a permitted dev server at 5268 with installed Chromium and disposable profiles.
No real origin data should be reset to obtain a pass.

## 5. Quality/performance gaps and Phase 8.0.2 handoff

Custom-stamp viability after restore, direct-master vs intermediate sampled cache,
quality degradation at 64/128/192, pivot/scale/orientation/symmetry, preview fidelity,
repeat/Undo and custom-stamp failure paths are all unverified because the feature is
absent. No custom CPU timing, retained/peak memory or changed-chunk numbers exist here.
Built-in historical benchmarks must not be relabelled as custom-shape evidence:
`outputs/phase-1-11-stamp-benchmarks.json` measures analytic single commands at all
three resolutions with evaluation/mesh/Undo/chunks; `outputs/phase-3-7/stamps.json`
and `outputs/phase-5-2/continuous-stamps-phase-3-5-continuous-stamp.json` cover built-in
continuous work. `outputs/headset-tools-feedback/stamp-after.json` explicitly says
simulated Node poses, not Quest. Host/load/date and timing definitions differ.

SDFVolume still owns dense values plus same-sized scratch. For cubic 64/128/192 grids,
these two arrays alone are calculated 2/16/54 MiB; one values array is 1/8/27 MiB.
These are allocation arithmetic, not measured retained or peak browser memory; meshes,
history, decoded masters, compression buffers, staging and GPU memory are additional.
Grown rectangular grids use actual dimensions, not resolution cubed.

Ranked acceptance work and fixed fixture specifications are in the Phase 8.0.2 section
of ROADMAP. Keep the exact dense-master baseline, destination layout, transform/pose
trace and correctness metrics fixed for a future dense-vs-sparse comparison. Record
cold preparation separately from warm execution, sampled/scanned/changed voxels and
rebuilt chunks separately from total allocated voxels. Chunked meshing and packed Undo
do not establish sparse SDF storage. No sparse architecture work is included now.

## 6. Go/no-go and remaining hardware acceptance

8.0.0 is implemented with strong existing desktop software evidence; fresh full/browser
reruns are environment-limited. Quest file pick/download/location, actual transfer to a
second device, real disk exhaustion, memory peaks and headset usability remain pending.
Quest entry is World Settings → Project → Personal Shapes, exiting XR for browser UI;
this is not an immersive custom stamp selector.

**8.0.2 can start as fixture/baseline and acceptance preparation. It cannot honestly
start as polish of a completed 8.0.1.** First deliver/verify 8.0.1 or explicitly include
that missing scope in the next implementation brief. Restore → stamp is a release gate.
Do not mark custom stamps complete or sparse work ready on the strength of built-in
stamp tests. No new user-visible feature was delivered by this documentation audit;
WHATS_NEW retains the existing accurate backup entry without a new release claim.

---

# Phase 8.0.0 — Shape Library Backup & Restore — 2026-11-10

## 1. Scope, inspection and preservation

The supplied working directory was a document folder rather than a Git checkout.
The active repository is `/Users/brettjames/development/vrappPOC`; initial Git status
was clean. Inspected PersonalShapeLibrary, ProjectLibrary, the native project codec,
thumbnail renderer, Personal Shapes UI, existing unit/browser tests and documentation.
No user browser profiles, saved shapes, projects or recovery databases were opened.
All browser acceptance uses disposable profiles. No commit, push, deploy or merge.
Sculpting stamps and modelling algorithms are unchanged.

## 2. Delivered export and confirmed restore

Personal Shapes adds Export Library Backup → count/size review → Download Library
Backup, and Import Library Backup → file selection → validated summary → Confirm
Import Library Backup. New copy names, identifier conflicts and duplicate counts are
shown before confirmation. Cancel Import, Browse and Close / Cancel abort pending
work. Download initiation is reported accurately; verify the file in Downloads.

`src/shape-backup.ts` defines portable `.cshapes` binary version 1: eight-byte magic,
little-endian manifest length, SHA-256 manifest digest, UTF-8 JSON manifest and exact
stored native/gzip payloads. Records preserve names, timestamps, physical dimensions,
calibration, pivot, thumbnail strings and full-fidelity SDF masters. SHA-256 payload
hashes and content fingerprints complement the existing decoded-master checksum.
Hashes detect corruption; they do not authenticate a publisher.

## 3. Validation, transactions and limits

Before preview, checks cover format/version, file/manifest/payload lengths, duplicate
IDs, finite positive dimensions/calibration, timestamps, bounded metadata, integrity,
gzip expansion length/checksum, native SDF parsing and evaluated-only master structure.
Thumbnail headers are bounded before browser image decoding; animated WebP is refused.
Real PNG/JPEG/WebP images must decode and stay within 256×256 pixels.

Limits: 64 MiB backup, 4 MiB manifest, 100 shapes, 32 MiB decoded master and combined
file size plus six times the current decoded master at most 224 MiB on import. UI
import requires current tracked/composite geometry at most 32 MiB. Storage estimates
are checked when available. Actual quota failure still rolls back; estimates cannot
reserve space. Existing 512 MiB library/count limits are checked inside the write
transaction against current records, including changes made since preview. Larger
inputs refuse explicitly without resampling. Keep .form originals for refused sizes.

Export takes a consistent read-only snapshot and never updates saved records. Restore
uses one strict-durability IndexedDB transaction over metadata and payload stores.
Conflicts get fresh IDs and independent payloads; existing records are never overwritten.
Imported content fingerprints skip repeated identical restores. A first restore into
the original source profile can create conflict copies; later repeats skip those copies.
Original errors now survive subsequent abort request events, retaining quota reporting.
ProjectLibrary exposes protected transaction/budget access solely for atomic shape merge.

## 4. Automated verification

`tests/shape-backup.test.mjs` covers exact multi-master/metadata/payload restoration,
conflict preservation, repeated imports, corruption, truncation, trailing bytes,
unsupported versions with valid manifest hashes, invalid lengths/dimensions/thumbnails,
expansion/file limits, 100-shape success and 101-shape refusal, restart persistence,
quota admission, mid-write simulated QuotaExceededError, explicit interruption and
mid-write cancellation. Failed transactions preserve existing metadata and exact payloads.
Node image decoding is stubbed; Chromium verifies actual thumbnail decoding.

Focused shape-backup/project-library: 43/43 passed. Existing personal-shapes coverage
also passed, including calibrated insertion, independent edits, .form and STL.
`npm run test:quick` passed; guide tests 8/8 passed. Final unrestricted `npm run check` passed all 1,712 tests, including the quota
and cancellation regression. Formatting, lint, strict types and production build passed.
The sandboxed attempt could not bind local test servers; the unrestricted suite is
required for HTTP/MCP bridge acceptance. Build reports the existing bundle-size warning.

## 5. Browser evidence, documentation and reproduction

`scripts/shape-backup-browser-smoke.mjs` passes in two isolated Chromium profiles:
save two shapes through the actual UI with genuinely rendered thumbnails and both
pivot settings, export/download, select file, cancel preview, confirm restore and
repeat import without additions. Compares exact stored payload bytes and metadata.
A restored master is inserted, sculpted, round-tripped through .form and exported as
binary STL; the saved master remains identical. No page errors.
Existing `scripts/personal-shapes-browser-smoke.mjs` also passes save/render/insert/
reload/rename/confirmed-delete regression checks in its own disposable profile.

Guide Personal Shapes and FAQ, WHATS_NEW.md and docs/ROADMAP.md are updated.
Reproduce with `npm run dev -- --port 5268`, then
`node scripts/shape-backup-browser-smoke.mjs` and
`node scripts/personal-shapes-browser-smoke.mjs` (Chromium must be available).
Logs: `/tmp/shape-backup-{quick,focused,browser,existing-browser,docs-tests,final-check}.log`.
Run `npm run check` for all formatting, lint, strict types, build and automated tests.

## 6. Quest and remaining acceptance

Quest still uses World Settings → Project → Personal Shapes to exit XR for the browser
workflow. Physical headset file picking, download completion/location, transfer to a
second device, storage estimates, actual disk exhaustion and peak-memory behaviour
remain unverified. Desktop simulated quota/interruption tests are not physical disk or
power-loss tests. Large byte/decoded inputs deliberately refuse; the 100-shape test uses
small full-fidelity masters, not a 64 MiB hardware stress test. No new Quest or physical
print acceptance is claimed. Custom stamps remain deferred to 8.0.1.

# Phase 8.0 — Personal Shape Library — 2026-11-10

## 1. Scope, inspection and preservation

Active checkout `/Users/brettjames/development/vrappPOC`; initial Git status clean.
Inspected AGENTS.md, latest handover and roadmap, built-in stamp definitions/UI,
SDF dense/grown lattices, ordered/live Boolean evaluation and Bake, Project Library,
native .form codec, project thumbnails, insertion/Undo runtime and desktop/XR
Project navigation. The requested working directory is a container directory;
the active repository is the development checkout above. No user saved projects,
recovery stores, native assets or production browser profiles were opened or changed.
No commit, push, deploy or merge. Earlier handovers below remain preserved.

## 2. Delivered Save → Browse → Insert workflow

Left project controls → Personal Shapes… opens a labelled native modal. Save
selected as Shape captures only the selected evaluated sculpt or live Boolean
root with its reachable operands; raw cutters and unrelated layers are excluded.
Preview meshes this captured master and uses the genuine disposable WebGL thumbnail
renderer. Review name, measured world XYZ dimensions in mm and Centre/Base centre
pivot before Save Shape. Dates, thumbnails, insertion, explicit confirmed rename
and deletion, empty/loading/error states and cancellation are included.

Inserted copies are independent editable SDF layers, flattening construction history.
They preserve orientation and physical scale across destination calibration and use
normal transforms, brushes, one-step insertion Undo/redo, native .form persistence
and STL/GLB geometry paths. Masters remain independent of projects and of every
inserted copy. Browser storage is profile/origin-local; users are told to keep
.form backups and that clearing site data removes saved shapes.

## 3. Architecture, quality and bounded failure

`src/personal-shapes.ts` implements version-1 master records over the proven atomic
ProjectLibrary transaction engine in a separate `centra-personal-shapes-v1` database.
A single-layer validated native payload stores full Float32 SDF samples, native
lattice layout and transform; optional gzip is lossless and thumbnails are separate.
Payload checksum, declared uncompressed length, bounded gzip decoding, native codec
validation and explicit metadata-version validation refuse corrupt/unsupported data.
Optimistic revision checks protect rename/delete across tabs. Library quota/count
and native/project layer/voxel/triangle limits remain in force.

Ordinary sculpt capture copies every sample exactly, including grown grids. Native
growth layouts must contain their original lattice, so exact dense copies retain
that layout rather than changing engine/native semantics to crop it. Live Boolean
masters evaluate cropped composite bounds at up to 192³ only when world sampling
step meets the source-detail requirement. Unsupported detail refuses explicitly;
no resolution downgrade or preview substitution is allowed. Standalone analytic
primitives refuse cached-grid substitution and direct users to an explicit Bake to
Sculpt at chosen quality or retaining their .form construction. Groups are not
component collections; choose an individual sculpt or Boolean root.

128 MiB master/staging bounds and conservative 256 MiB editor admission estimates
cover capture/loading/insertion; insertion also stages/meshes before a single Undo
commit. Error/cancellation paths keep existing records/source geometry. These are
admission estimates, not a measured guarantee of total browser/GPU peak memory.

## 4. Automated and browser verification

Focused `npm test -- personal-shapes`: 8/8 passed. The acceptance scenario creates
an evaluated bent organic capsule, saves/reopens its database, creates another
project, inserts twice with calibration conversion, sculpts one via real brush
history, proves the second/master/source samples unchanged, reopens .form with
identical samples/transforms, and encodes validated STL. Additional cases cover
Boolean holes, raw-cutter exclusion, exact compression/checksum corruption,
missing storage/quota, confirmation revisions, cancellation/Undo preservation,
memory refusal and unsupported source-detail refusal.

Chromium fresh disposable context: actual evaluated thumbnail decoded; saved,
created a second empty project, inserted twice, reloaded the page, found the
persistent thumbnail/master, renamed and confirmed deletion; zero page errors.
Script `scripts/personal-shapes-browser-smoke.mjs`, log
`/tmp/personal-shapes-browser.log`. It uses the running dev origin at port 5268;
set PLAYWRIGHT_CHROMIUM_EXECUTABLE if the host requires full installed Chromium.
The automated organic acceptance is engine + IndexedDB/native/export integration;
the browser case uses the starter sculpt, not claimed as a manual organic session.

Quick tests 21/21 and guide build/tests passed (26 routes, 8/8).
Guide Chromium also passed all 26 routes: axe WCAG A/AA, actual Pagefind search,
themes, keyboard and 390/320 px layouts; `/tmp/personal-shapes-docs-browser.log`. Required root check
covers format, lint, strict TypeScript, production app/guide build and full suite;
final result: PASS format/lint, strict TS, production app/guide build and
**1,706/1,706 tests**, zero failures/skips/cancellations (77.25 s test wall). Sandbox HTTP/Chromium EPERM failures
were infrastructure restrictions; authorised unrestricted runs used for acceptance.
An existing source-string handoff test was updated to include the new Shapes action.

## 5. Documentation and reproduction

Public projects guide now has a friendly save/reuse walkthrough, pivot/physical
size, independent copies, history flattening, browser-local storage/backups and
error guidance. Home, tool-choice, Stamp guide and FAQ no longer describe the
personal library as upcoming. Source-contract assertions cover the new guide and
deferred phases. WHATS_NEW and ROADMAP updated without publication.

Run `npm run dev`, open the left Personal Shapes control. Run focused tests above;
`npm run check` for all checks. Guide build/test commands remain in its README.
Logs: `/tmp/personal-shapes-{tests,quick,docs-build,docs,browser,final-check}.log`.

## 6. Quest and remaining boundaries

World Settings → Project → Personal Shapes exits XR using the established safe
project/browser handoff and opens the browser modal. Tool Wheel sectors remain
unchanged. No physical Quest, hardware memory/performance, physical print or
assistive-technology acceptance is claimed. No dedicated immersive personal-shape
browser or headset keyboard was added.

Deferred exactly as requested: 8.0.1 personal sculpting stamps/detail caches; 8.1
editable component collections retaining primitive/Boolean history; 8.2 agent/MCP
integration. User assets were preserved and all changes remain uncommitted locally.

---

# Phase 7.6.1 — Documentation experience & visual polish — 2026-11-10

## Scope and preservation

Worked in active `/Users/brettjames/development/vrappPOC`, starting at `8ff582f`.
Initial Git status was clean. Inspected this status, roadmap, all 23 public guide
articles, site generator/tests and current UI/controller/export source. No user
projects, native files, imported assets or recovery data were opened or changed.
All demo editing used fresh disposable browser contexts. No modelling engine or
export algorithm changed. No commit, push, deploy or merge.

## Delivered pages and interaction

Reviewed every existing public page and corrected current control/path details.
There are now 26 routes. Complete illustrated tutorials: `quick-start.html`
(Your first clay sculpt), `holder.html` (Build a practical holder), and
`enclosure-tutorial.html` (Make a printable enclosure). Each has prerequisites,
numbered tasks, expected outcomes, troubleshooting, desktop/Quest distinctions
and next steps. The canonical schema-tested agent holder batch remains available.
New `choose-tools.html` and `glossary.html` explain modelling choices and terms.
Desktop, brushes, primitives, precision, layers, Booleans/arrays, enclosures,
assemblies, projects and export have authentic captures and descriptive captions.
FAQ/export explain preview/export scopes, physical size, resource refusals and
optional experimental curved STL reduction safeguards without a fit guarantee.

Tool Wheel reference uses the actual nine VR_WHEEL_TOOLS sectors, with purposes,
Options/nested paths and documentation links. It is explicitly a source-accurate
schematic with adapted documentation layout, not a Quest screenshot. Native
buttons support keyboard (Tab, arrows, Home/End, Enter/Space), mouse and touch;
all details remain readable without JavaScript. Native image dialogs preserve
original pixels and support Escape, focus return, mouse/touch and scroll. Plain
image links work without JavaScript. Added captions, responsive image/wheel
layout, theme-aware contrast, reduced-motion rules and proper PNG content types
for standalone preview and the app's same-site Help route.

## Real application verification and corrections

17 original 1600 × 1000 PNG screenshots in `read-the-docs-pls/screenshots/`;
`manifest.json` records original loopback origin, UTC time, captions and pixels.
Coverage: workspace, clay before/after, primitive tools, precision, enclosures,
assemblies, arrays, live Booleans, layers, project library, export controls,
holder body/result/prepared STL, assembled enclosure and lid moved aside.
Captions annotate outside the unchanged screenshot pixels. Captures are not
fabricated/composited UI and do not claim physical print acceptance.

The full installed Chromium rendered 12 committed Add dabs and three Smooth
edits (15 Undo entries). Early headless-shell attempts hit the tracking guard;
those were replaced. Holder walkthrough verified all source dimensions/positions,
one union + three differences, and real prepared Unified Boolean STL:
**110.000 × 27.000 × 50.000 mm**, Standard, actual size 1:1, 143³ evaluation
(max 192³), 84,000 triangles. This is prepared mesh evidence, not a print test.
Enclosure walkthrough created the 24 × 20 × 14 mm inside recipe with 3 mm walls/
floor, radius 4, 0.3 clearance, lip depth 4 and lid thickness 3 mm; base readout
30 × 26 × 17 mm. It evaluated the assembled result and moved the separate lid
45 mm in X for inspection. No sampled or physical fit pass is claimed.

Corrections from actual UI: modelling panels are on the left; New Project uses
the library form's name/Start with/Create Project; layer rename requires Enter;
Enclosure uses New enclosure → Preview changes → Create enclosure (or Apply
changes); Wall cutout and Mounting posts now have desktop controls. Cutter entry
must reduce height/depth before the 8 mm width to avoid an intermediate extreme
aspect-ratio refusal; the tutorial now checks created dimensions before proceeding.
No engine workaround or limit change was introduced.

## Verification

- Docs build: 26 generated/indexed pages, Pagefind en-au index.
- Docs tests: **8/8** passed, covering routes, internal href/src/fragments, IDs,
  landmarks, Pagefind assets, current source/schema facts and screenshot PNG
  signatures/dimensions/provenance/alt text.
- Browser: **26/26** routes with zero axe WCAG A/AA violations; 1440 px desktop
  and 390/320 px responsive checks, actual Pagefind search and nested-prefix
  results, Ctrl/Meta+K, Escape/focus return, themes, mobile navigation, clicked
  previous/next links, every article screenshot decoded at 1600 px, native
  image modal, full-resolution images, Tool Wheel keys and actual touch taps,
  reduced-motion computed style. Browser script and evidence remain local.
- Quick: **21/21** passed. Final full `npm run check`: format/lint, strict TS,
  production build and **1,698/1,698 tests**, no failures/skips/cancellations;
  82.14 s test wall. PNG MIME/copy assertions added to the existing hosting test.
- The initial sandbox full run failed only because its HTTP-server test could
  not bind loopback (EPERM). The authorised unrestricted reruns passed.

Logs: `/tmp/centra-761-{final-build,final-doc-tests,final-browser,quick,final-check,
tutorial-capture,enclosure-capture}.log`. Browser evidence in ignored `work/docs-7-6/`.
`SOURCE_AUDIT.md`, the guide README, roadmap and WHATS_NEW are updated. Run the
README build/preview commands to review locally. The root build includes the
public guide and screenshot assets at `dist/read-the-docs/`.

## Remaining acceptance

Authentic Quest captures remain pending: Tool Wheel, Options/Move variants,
Paint/Mask, Layers/Boolean order, World Settings/precision, project library,
enclosure and assembly controls. Pending labels remain visible. No fresh Quest
hardware test, physical print, or complete assistive-technology user testing is
claimed. Publication requires separate explicit authorisation.

---

# Phase 7.6 follow-up — Same-site Help — 2026-11-10

## 1. Request and preservation

User requested the guide on the deployed app site under `read-the-docs/` and a
Help item inside the Centra Sculpt logo menu. Preserved the uncommitted Phase 7.6
site and handover. No reset, commit, push, deployment or saved-project changes.

## 2. Delivered behaviour

Centra Sculpt → Help ↗ is an accessible native link opening a separate tab with
noopener, so the editor remains open. Its URL uses Vite BASE_URL. Root `npm run
build` generates the guide/search and copies only public files to
`dist/read-the-docs/`. Deploy the complete root dist normally; no second host or
nested npm install is needed. Standalone guide build/preview remains available.

## 3. Implementation and boundaries

Pinned Pagefind 1.6.0 in root development dependencies/lock. Added
`scripts/docs-vite.mjs`: build and indexed output copy for production, restricted
static-file middleware for dev (also HTTPS/agent Vite configurations). Directory
redirects preserve query strings; assets have proper types, missing files are
404, escaping paths are refused, GET/HEAD only. Generated guide output is ignored
by the app watcher. Only menu UI/style, Vite setup and docs tooling changed; sculpt,
export and agent engines remain unchanged. Guide QA endpoints never enter dist.

## 4. Automated checks

Quick **21/21** passed. New deployment/middleware tests **2/2** passed, checking
all 23 built guide routes/search assets, no QA output, base-aware Help URL, new-tab
semantics, directory redirect, assets/HEAD, 404/traversal/method handling and editor
fallthrough. `npm run check` passed formatting/lint, strict TS, production build
and **1,698/1,698** full tests with no failures/skips/cancellations (87.53 s).
Final docs build/tests passed **7/7** after the access-instructions update.
Evidence `/tmp/centra-help-{quick,build,hosting,check,final-build,docs-tests}.log`.
Dev HTTP smoke at port 5198 passed redirect, guide HTML and Pagefind JS responses;
`/tmp/centra-help-dev.log`. Both temporary preview/dev servers were stopped.

## 5. Real browser evidence

Fresh production preview origin port 4198: opened logo menu, inspected Help,
clicked the real link and observed the new guide tab at `/read-the-docs/` while
the editor stayed open. Pagefind query `calibration` returned eight results;
first result `/read-the-docs/precision.html`, retaining the same-site prefix.
Screenshots `work/docs-7-6/help-menu.jpg` and `help-shared-site-search.jpg`.
No user modelling operation or current project was used. This is desktop browser
acceptance; Quest/hardware acceptance is not claimed.

## 6. Reproduction and deployment

`npm ci && npm run dev`, then Centra Sculpt → Help. Or `npm run build && npm run
preview` to review the complete production site. Upload the root dist only after
explicit deployment authorisation. The site README explains combined versus
standalone builds; guide content/release notes/roadmap reflect menu access.

---

# Phase 7.6 — Public Documentation & Learning Experience — 2026-11-10

## 1. Scope and starting state

Used the active `/Users/brettjames/development/vrappPOC` checkout. Initial
`git status --short` was empty; no existing public documentation site was present.
Read the latest local status, roadmap, WHATS_NEW, current UI/menu/controller,
export, native/library, modelling and MCP source before authoring. The referenced
research chat confirms documentation before the Personal Shape Library/custom
stamps. No app/engine code, saved projects, imported assets or recovery data was
changed. No commit, push, deploy or merge.

## 2. Delivered user experience

`read-the-docs-pls/` contains an independent static HTML/CSS/JS generator with 23
complete guides, a persistent task sidebar, complete full text index, breadcrumbs,
section links, previous/next links, Pagefind full-text search and Cmd/Ctrl+K modal,
light/dark preference, mobile navigation, skip link and semantic landmarks. The
existing favicon and original CSS forms provide the identity; accessible flow
diagrams explain source/evaluation and holder operations. No invented app
screenshots, external runtime API/account/CDN/font dependency or app UI additions.

## 3. Content accuracy and boundaries

Guides cover desktop/Quest setup and tool/support controls; all nine wheel sectors
including Cut, nested Move brushes, Paint/Mask and World/Layer/Precision paths;
brushes, Tube, Stamp, editable primitives including Cone/Capsule/Torus tyre/Pyramid;
physical calibration/transforms, layers/groups, Bake, Boolean/arrays, snapping,
enclosures/features, assemblies/fit, project/library/.form/recovery, references,
painting/masks, current export controls/scopes/units/limits and local MCP workflows.
The canonical holder payload and tool argument examples validate against the real
MCP schemas. Source audit caught separate 16-layer/32-group limits, stamp versus
primitive shapes, capture `viewpoint`, proposalId-only apply, STL/GLB scope differences
and the newest default-off curved STL mode. Deferred library/custom stamps and
sampled-fit/hardware limits are explicit. `SOURCE_AUDIT.md` lists authorities;
`PHASE_7_6_UX_GAPS.md` records follow-ups without expanding product scope.

## 4. Automated verification

- `npm --prefix read-the-docs-pls run build`: PASS, 23 HTML pages, Pagefind 1.6.0,
  en-au index, 23 indexed pages / 1,418 indexed unique words.
- `npm --prefix read-the-docs-pls test`: PASS **7/7**, no skips/failures. Covers
  stable route contract, all internal href/src/fragment targets, unique IDs,
  landmarks/current navigation, generated Pagefind fragments/assets, key topics
  and shortcuts, holder/current tool schemas and binding/source guard facts.
- `npm run check`: PASS formatting, lint, strict TypeScript, production app build,
  full **1,696/1,696** tests, zero failed/skipped/cancelled; 88.78 s test wall.
  Evidence `/tmp/centra-docs-76-check.log`; docs logs
  `/tmp/centra-docs-76-{build,tests}.log`.

## 5. Real browser evidence and corrections

Shell Playwright Chromium launch aborted with host sandbox SIGABRT/EPERM; that
script is delivered but is not claimed to have passed here. Used the app's real
in-app browser with the repository-owned preview-only `/__qa.html` harness instead.
Final **174 assertions passed**: all 23 guides at 1440/390/320 px without horizontal
overflow, one H1, axe WCAG A/AA on all desktop pages, alternate-theme/home and search
modal checks, mobile menu state, theme persistence, Ctrl/Meta+K events, focus return,
real Pagefind tyre → primitives result and nested deployment-prefix search links.
Direct interactions also verified Ctrl+K, typing tyre, real results, Escape and
focus returning to the opener; Tab → skip link → Enter focused main, Meta+K opened
search and Shift+Tab reached Close. Mobile menu and desktop layouts were inspected.
This is automated browser evidence, not complete screen-reader usability acceptance.

Initial browser QA found a relative Pagefind bundle path error and 320 px header /
text overflow. Corrected with document-derived bundle paths, a narrow header layout
and wrapping; final harness passed. An initial synchronous focus assertion was
corrected to wait for the native dialog close event. No app fixes were made.
Evidence: ignored `work/docs-7-6/browser-qa-report.txt`, `search.jpg`,
`desktop-first.jpg` (light), `desktop-alternate.jpg` (dark), `mobile-390.jpg`,
`mobile-navigation.jpg`. These are documentation-site screenshots, not app UI.

## 6. Reproduction, deployment and remaining acceptance

From repo root: `npm ci --prefix read-the-docs-pls`, then docs build/test above,
then `npm --prefix read-the-docs-pls run preview` at loopback port 4176. The root
node_modules are also needed for schema/Playwright tests. Run `test:browser` where
Chromium launch is allowed, or click Run checks at `/__qa.html`. Preview QA assets
and nested-prefix alias are never included in deploy output. README explains
GitHub Pages/static upload of this site's dist only, with publication requiring
separate authorisation. Generated output and dependencies are ignored.

No Quest hardware, new physical print, fresh Codex/Cursor tool-cache acceptance or
full assistive-technology user testing is claimed. Existing app acceptance gaps
remain separate. The site is delivered locally and buildable; publication and
product work on Personal Shape Library/custom stamps remain future steps.

---

# Export controls and guarded curved reduction — 2026-11-10

## Delivered

File type (STL/GLB with unit/format tooltips) and Quality preset share the top row.
Actual size (1:1) is an on-by-default switch below; off reveals explicit target
sizing. The duplicate preset slider is removed. Advanced offers an off-by-default
**Curved reduction · Experimental · STL** checkbox and a 0.01/0.025/0.05/0.1 mm
Surface tolerance slider. The result shows **✓ applied** or **✕ fallback**, retaining
the fallback reason. The visible description explicitly says sampled checks are not
a fit guarantee. Printable-part export does not apply this lossy mode; GLB clears
and disables it. Export choices are session controls, not a project-schema change.

[Implementation, limits, matrix, rollback and reproduction](EXPERIMENTAL_CURVED_EXPORT.md).

## Reliability and measurements

The optional worker stage uses pinned meshoptimizer 0.22.0 after physical STL sizing,
keeps original vertex positions, locks borders/creases/extrema, and requires final
closed topology, dimensions/Euler, two-direction sampled distance, silhouette and
cavity/gap-section checks. A separate input/work/workspace allowance is enforced in
addition to existing admission. Cancellation and stale-source failures propagate.
Unchecking returns the original exporter; rejected candidates keep its exact bytes.
No SDF, geometry, work, memory, polygon or size limit is raised, and no new primitive
mesh replaces evaluated SDF output. Default/off mode keeps its existing geometry.

Coarse curved High: 34,028 → 33,686 faces at 0.05 mm, sampled maximum 0.029127 mm,
maximum section change 0.049672 mm. The more aggressive 0.1 mm candidate fell back
on silhouette checks. Eleven serialized-baseline comparisons applied only coarse
clay and the mechanical array; dense curved, holders, Lens and enclosures retained
the original on geometry/workspace/verification-work failures. These optional-check
timings are not export speedups or printer-fit claims. No Astra file/result.

## Acceptance

Quick 21/21, focused curved/export/staged 27/27, and full formatting/lint/strict
TypeScript/production build + **1,693/1,693 tests** passed, no failures/skips/
cancellations (final 115.05 s test wall). Unit checks include independent distance/
section probes, actual worker parity/cancellation, stale revisions, open/invalid
surfaces, memory admission and native/history preservation. ES worker output permits
lazy reduction/WASM chunks; the test compiler now handles relative dynamic imports.

Final production Chromium controls run `work/export-controls/run-vNFTIY` passed
actual and target sizing, real STL/GLB worker downloads, off-by-default/GLB-disabled
controls, prepared-link invalidation, ✓ applied vs ✕ byte-exact fallback, independent
STL topology/counts, unchanged input/history, and desktop/390 px mobile no-overflow
screenshots. Full baseline production smoke passed 1:1/100/200 mm STL, metre GLB,
planar cube 29,292→18,132 and oblique cube 169,480→92,440 with matching bounds/Undo,
plus injected worker-failure stage/cause/no-download. Production lifecycle smoke
passed hidden/blur continuation, Cancel/Escape and actual interruption/Undo handling.

Earlier runs exposed IIFE worker splitting, a Node dynamic-import rewrite gap and
outdated hidden sizing-select test locators; all were corrected before acceptance.
A dev full-smoke download timed out; its immutable-production rerun passed and is
the baseline acceptance result. The initial experiment reports remain historical;
“offline only” is superseded only by this explicit opt-in guarded STL mode.

Raw matrix: `work/curved-export/matrix.json`. Logs `/tmp/curved-{quick,focused,tests,
final-quick,final-check,matrix,browser,controls-final-browser,baseline-browser,
baseline-production,lifecycle-browser,lifecycle-production}.log`. Other pre-existing
local changes were preserved. No commit, push or merge.

---

# Bounded Boolean preview and concise status — 2026-11-09

The original nine-layer Lens native copy admits 192³ at 63,700,992 estimated source
samples. The active Chrome scene showed “Recovery restored” plus a visible Layer 10;
ten sources at 192³ require 70,778,880 samples and reproduced the user's 64M refusal.
No layer was removed or edited. A read-only copy of the available ten-layer Lens
native project reproduces the same guard.

Interactive layer preview now opts into bounded resolution: keep the selected cap
when it fits, otherwise choose the highest lattice fitting the unchanged 64M work
budget. Ten sources use 185³ / 63,316,250 calls; 186³ would exceed the budget. Work
accounting follows actual visible roots and enabled modifier calls, counts shared
hidden operands per reference, and includes every array instance. Unreferenced hidden
roots are excluded only when the evaluator also excludes them. Cycles/missing refs,
memory and intermediate mesh guards remain. Only IndependentLayers' display cache
opts in; strict compositor/Bake and staged export admission remain unchanged.

The evaluator, source fields, transforms, calibration, native data, Undo/Redo,
export resolution and project schemas are unchanged. Preview detail can be lower;
this is a display approximation, not a new fitting tolerance or automatic export
downgrade. The status is deliberately short: “Boolean preview · 185³ · Reduced
detail”, including when returning to a cached preview. Timings, voxel size, chunks
and work-budget prose were removed from that normal status line.

Verification: quick 21/21; targeted new policy/field tests 2/2; full format/lint,
strict TypeScript, production build and **1,683/1,683 tests** passed, no failures/
skips/cancellations (143.29 s test wall). After the shorter wording/release note,
quick 21/21 and final strict/build passed again. The earlier focused run's new
fixture had an invalid brush-radius preference; it was corrected before acceptance.
Both native fixtures passed 4,096 sampled Float32 field equality probes at their
actual preview lattices and native serialization/history preservation. Nine-layer
preview remains 192³ / 103,336 triangles; ten-layer now renders 185³ / 97,128
triangles. Those are preview counts, not printable topology acceptance.

Evidence: `work/lens-preview-repro/native-preview.json`, read-only ten-layer copy
`input/lens-ten.form` (SHA-256 `2b53c109de6e815f39abc73aeec8659f28bc4088432234253aebb40b78522414`),
plus the unchanged original nine-layer SHA-256 `ff59de49…c855`. Logs in
`/tmp/preview-budget-{quick,focused,targeted,native,check,final-quick,final-build,browser}.log`.
No commit, push or merge.

Production Chromium verified the concise ready/cached status at 185³, a deliberate
128³ preview choice, unchanged selected 256³ export detail, unchanged 0 Undo/0 Redo,
and unchanged native input bytes. Evidence: `work/lens-preview-repro/browser-preview.json`
and `preview-short.png`. The user also observed the successful 185³ preview in the
active app before requesting the shorter wording.

---

# Export stage progress colours — 2026-11-09

The export progress line now groups stage labels into seven colours: preparation
(grey), SDF evaluation (blue), meshing (teal), optimisation (purple), physical
sizing/transforms (amber), topology/precision validation (rose), and file encoding/
packing (green). New exports reset to preparation; unknown future steps also use
that neutral fallback. Stage text, accessible labels, elapsed time, per-stage
percentages, cancellation and reduced-motion behaviour remain.

Uses the existing local feedback control with Chromium/WebKit and Firefox progress
fill selectors. A disposable Chromium preview verified all seven distinct inherited
colours, stage labels and values and was visually inspected. Screenshot:
`work/export-progress-colours/preview.png`. Quick 21/21; full formatting/lint,
strict TypeScript, production build and **1,681/1,681 tests** passed, no failures/
skips/cancellations (128.62 s test wall). Logs `/tmp/export-colours-{quick,check,browser}.log`.
Firefox-specific rendering was not separately tested. No commit/push/merge.

---

# Lens High visible-STL correction — 2026-11-09

Reproduced the supplied Lens native copy at every preset: All visible layers borrowed
96 committed shell triangles, including three subtraction cutters, and final STL
validation blocked exactly 12 non-manifold edges. The 256 detail setting was unused
on that route. The preceding native benchmark matrices tested Unified Boolean,
which passed; they did not validate this visible-layer route.

Visible STL now evaluates visible ordered difference/intersection layers through
the existing bounded SDF pipeline, applying the selected cap, sizing and unchanged
continuity checks. Selected-layer, additive separate-layer, visible GLB and assembly
semantics remain. Estimates and the prepared summary identify evaluation. The
original and input-copy native SHA-256 remain unchanged; no commit/push/merge.

Quick 21/21, focused export-resolution/estimate 5/5, full format/lint/strict types/
production build/tests **1,681/1,681** passed. Actual native-file browser downloads
at High/192 and High/256/default 256 MiB both have one outward component, zero
checked defects and approximately 450 × 59 × 70 mm bounds. Counts 79,566 / 110,420;
SHA-256 matches the earlier Unified Boolean benchmarks at each cap. The production-preview browser regression passed all four downloads, same-session
Unified parity, the 200 mm target, identical before/after native bytes and unchanged
Undo/Redo. Passing artifacts: `work/lens-visible-repro/browser-A93lWU`. Two earlier
dev-browser attempts were incomplete/interrupted and are documented separately.

[Root cause, verification and reproduction](PHASE_7_5_4C_EXPORT_INTEGRATION.md#lens-visible-stl-routing-correction).

---

# Phase 7.5.4c handover — Validation and production integration — 2026-11-09

## Delivered

Promoted the exact evaluated-STL chunk compactor: scalar expansion copies, omitted unused local edge reports/colour copies and early exit after an unchanged inner planar pass. Public optimiser reports and final physical STL topology validation remain. Original-path fallback is an explicit argument; source rollback changes both defaults to false. No lossy QEM, adaptive extraction, raw primitive substitution, smoothing, limit increase, UI/schema or Undo change.

[Complete measurements, geometry checks, limitations and rollback](PHASE_7_5_4C_EXPORT_INTEGRATION.md).

## Measurements and preservation

The four-fixture, mounting-opening enclosure and read-only native Lens matrices completed 96 serial paired attempts at requested 192/256 caps, Fast/High, cold/same-process warm. Original/promoted bytes or refusals match in every case; native serialization, Undo/Redo and Lens input bytes remain unchanged. Warm dense curved 192 Fast: 3.771 → 2.987 s; High: 6.801 → 5.969 s. Warm Lens 256 Fast: 19.626 → 18.681 s; High: 20.968 → 19.641 s. Peak RSS can increase and exceeds the admission budget; no lower memory ceiling is claimed.

## Acceptance and limits

Quick 21/21, focused 38/38, and full `npm run check` 1,680/1,680 passed (format/lint/strict types/build; no skips). Both Chromium export/lifecycle tests passed with the required execution permission. Six High silhouette pairs match; curved/Lens/enclosure PNGs were inspected. Sixteen in-app actual-worker comparisons passed clean topology, hash equality and native/history preservation. Initial restricted local-server/Chromium permission failures are documented separately. Fast synthetic clay retains its pre-existing blocking topology report. Dense curved at cap 256 evaluates 196³ and High refuses 306,312 input faces at the unchanged 300k ceiling. A plain 5 mm enclosure wall can disappear under the existing coarse source-feature sampling heuristic; the original/promoted enclosure failure is retained, with a separate finer-sampled mounting-opening fixture. This phase adds no geometry deviation relative to the original exporter and does not certify absolute print fit or fix the source sampler. No identifiable Astra native file was found in the workspaces/Downloads or metadata scan; no Astra measurements are claimed.

No commit, push or merge. The earlier 7.5.4a/b changes were already uncommitted and remain part of this working tree.

---

# Phase 7.5.4b handover — Experimental export optimisation — 2026-11-09

## 1. Delivered

An off-by-default experimental chunk flag for evaluated STL, a paired cold/warm Node harness, an isolated browser comparison and an offline meshoptimizer simplification experiment. The original 7.5.4a work is retained below. [Full experimental results, raw-evidence locations and reproduction](PHASE_7_5_4B_EXPORT_EXPERIMENT.md).

## 2. Correctness and preservation

Compared encoded STL SHA-256, physical dimensions, final topology, field residuals, native bytes and Undo/Redo on disposable editors. The read-only Lens copy and the Downloads original retained their recorded hash. Production dialog, sizing, GLB metres, STL millimetres, ordered SDF and all admission guards retain the existing defaults. Exact mode bypasses decimation. Experimental diagnostics select the source on a failed candidate and refuse a defective source.

## 3. Measurements

On the dense curved fixture, warm Fast STL fell from 4.023 to 3.188 s with the same 293,776 triangles. The synthetic holder at requested 256³ fell from 23.913 to 21.189 s; observed warm process peak rose from 468 to 505 MiB. In the separate High STL simplification experiment the 50% face target yielded no acceptable candidate. The 90% target passed on four mechanical cases, with matching sampled holder and array slot widths. Dense organic clay failed even the 99% target. Coarse clay saved 342 faces at that target.

## 4. Verification

Quick suite 21/21. Strict TypeScript, Biome format/lint, Vite build and full suite passed (1,679/1,679). Targeted tests cover exact chunk parity, budgets, cancellation, stale source, occluded intersections and calibrated distance. A fresh in-app product export produced a ready 1:1 STL. Four additional browser High STL comparisons yielded the same SHA-256. Scripted headless Chromium terminated during startup. Test logs and run identifiers are in the experiment report.

## 5. Known failures and limits

Fast synthetic clay retains its pre-existing blocking print report. QEM can introduce non-manifold edges or change hidden intervals despite negligible solver error. Sampled surface distances, sections and raster masks cannot certify global fit. Peak RSS is process-wide and occasionally increases. Tests do not establish a hardware, printer, slicer, heavy Astra or experimental browser-worker result. No adaptive extractor, GLB retopology or increased budget shipped.

## 6. Next phase

7.5.4c should validate the exact chunk path on target workers with repeated matched runs, aborts and memory pressure. Keep lossy simplification offline pending a stricter organic result, named fit tolerances, oblique clearance gauges and a native Astra copy. Profile indexed/slab extraction and a bounded global STL edge ledger before changing guards. No commit, push or merge.

---

# Phase 7.5.4a handover — Export benchmark and diagnosis — 2026-11-09

## 1. Delivered

Repeatable `scripts/benchmark-export-diagnose.mjs`: serial isolated processes per
fixture/cap/quality/format, one discarded + three measured runs, fresh output
subdirectories, exact refusal evidence, independent STL/GLB reload/bounds checks,
field residuals, resource snapshots and peak RSS. Disposable clay/curved/holder/
array fixtures remain available; read-only native copies use persisted calibration.
A separate `scripts/diagnose-export-files.mjs` creates full-triangle orthographic
PNG masks, decoded topology and optional native-field GLB probes. Only production
change is additive extraction/precompaction timing counters; no algorithm/UX change.

## 2. Correctness and preservation

Initial active checkout clean at `4062735` in `/Users/brettjames/development/vrappPOC`;
conversation cwd is not a repository. Read latest status/roadmap, 7.5.2/7.5.3 evidence
and export/worker/sampling/mesher/compactor/topology/encoder code before edits.
96 main benchmark attempts (24 discarded / 72 measured) retained native bytes and
Undo/Redo. User supplied Downloads `lensbenchmark.form` (9,056,816 bytes): tested a
write-disabled ignored copy, original/copy SHA-256 unchanged
`ff59de49002bde1f97771e8b1c52de7b401d3e7f4faf50bf31325803c0b8c855`.
It is a nine-layer mechanical holder, not a demonstrated organic Astra file.
No connected user editor, project library or recovery record was edited/restored/
discarded. All limits, source semantics, winding rules, defaults and units retained.
No commit, push or merge. What’s New unchanged because this is research tooling.

## 3. Measured findings

[Full report, exact diagnostics and Astra invocation](PHASE_7_5_4A_EXPORT_BENCHMARK.md).
Lens 192³ Fast/High STL median 11.136/11.987 s, 89,018/79,566 triangles;
256³ 19.848/20.737 s, 129,168/110,420 triangles. Approximately 450 × 59 × 70 mm
bounds, one component and zero checked defects in all emitted Lens files, including
metre-unit GLB reloads. Native-field residual maxima 1.158783/0.891753 mm at 192/256;
Fast/High agree. These are sampled field values, not Hausdorff/clearance/fit bounds.

Synthetic holder extraction ~1 ms versus precompaction ~8.5–8.7 s of ~11.3–11.4 s
preparation: the historical combined bottleneck is specifically compaction. Lens
precompaction ~7.2/10.4–10.5 s; sampling ~1.7/4.1 s at 192/256. Curved High costs
~3 s optimiser time with zero triangle reduction. High GLB refuses Lens 256 at
363,540 input triangles (300k High limit); synthetic holder also refuses and curved
High GLB exceeds available workspace. No limit was raised. Lens RSS reaches 563 MiB
with 512 MiB admission: accounting remains distinct from whole-process RSS.
Nine available Fast/High quality pairs have identical three-view 300² raster masks;
visual checks conceal pocket interiors and cannot establish print fit. Synthetic
clay Fast correctly retains blocked STL topology; High cleanup passes checks.

## 4. Verification

`npm run check` passed Biome formatting/lint, strict TypeScript, production Vite
build and **1,677/1,677 tests**, no failures/skips/cancellations (initial 102.21 s; final
98.30 s test wall after empty-blocking-list summary regression correction).
Quick **21/21**, focused benchmark/export correctness **42/42** passed. Seven new
tests cover isolated repeats, native input bytes/calibration/history, actual STL
counts, summary warmup/refusals, raster coverage, CLI bounds and encoder stale/
cancel/memory refusal reasons. Existing lint warnings/bundle advisory remain.

Both scripted export/lifecycle Chromium checks failed at launch with SIGABRT;
assertions did not run. Fresh-origin in-app fallback passed actual worker STL
preparation/download (31,536 triangles / 1,576,884 bytes / 169.848068 mm), unified
High profile/clean print report, GLB High preparation, link invalidation, explicit
Cancel, idle Escape/focus restore and 0 Undo / 0 Redo. It does not replace the full
scripted lifecycle/responsive/holder acceptance gate. No elevated launch bypass.

## 5. Limitations and next engineering gate

Astra absent; heavy organic generalisation remains pending. Node cooperative costs
are not browser/Quest/download-completion timings. Discarded isolated runs warm OS
caches, not subsequent JITs. Per-stage tracked storage/snapshots and process high-water
RSS do not isolate every transient allocation. Raster silhouettes and field probes
do not prove Hausdorff distance, slot depth, walls, clearance, slicer or print fit.
No simplifier, adaptive mesher, retopology, memory/work/triangle-limit relaxation,
export default or UX change is implemented. Prioritise compaction copying/allocations/
reuse, then feature-preserving curved simplification, then adaptive extraction;
optional artist retopology last. Repeated bottleneck/zero-reduction and admission
findings warrant an Extra High effort **7.5.4b investigation**, with matched baselines,
physical-error/topology/memory/cancellation proofs before any shipping decision.

## 6. Evidence and resumption

Use the report's fixture/native-copy/Astra commands, `npm run check` and focused
`npm test -- export-benchmark export-sizing export-resolution staged-boolean-export export-quality planar-patches`.
Main evidence: ignored `work/phase-7-5-4a/benchmark.json`,
`work/phase-7-5-4a/lens/run-yAG1Ju/benchmark.json`, matching decoded diagnostics and
STL/GLB/PNG files; browser text/screenshots and independently parsed `browser-base.stl`.
Input copy stays at `work/phase-7-5-4a/input/lensbenchmark.form`.
Logs `/tmp/phase754a-{benchmark,lens,lens-diagnostics,fixture-diagnostics,focused,quick,check,final-check,browser,lifecycle,harness-validation,harness-final}.log`.
Browser's disposable downloaded `Base (3).stl` remains in Downloads; original Lens
file is untouched. Fresh benchmark commands always create a new run subdirectory.

# Export dialog UI tidy — 2026-11-09

Grouped format and physical size, kept a single primary quality slider with a live
preset label/short description, moved memory/resolution/alternate preset selection
into Advanced settings, and arranged scope actions in a compact grid. Target
controls appear only in target mode. Empty reports/download controls stay hidden.
Original handlers, calibration, preparation and safety semantics are retained;
all earlier uncommitted Phase 7.5.3 work remains in the checkout.

Browser checked default layout, advanced-control visibility, slider→Standard,
actual worker STL preparation at explicit200 mm, selected-size URL invalidation,
idle Escape/focus restore and unchanged0 Undo/0 Redo. Final screenshot:
`work/phase-7-5-3/export-dialog-clean.png`. No recovery restore/discard or scene edit.
Quick21/21 passed. Final `npm run check` passed format/lint, strict TS, Vite build
and **1,670/1,670 tests**, zero failures/skips/cancellations (97.96 s test wall).
Existing lint/bundle advisories remain. Evidence: `/tmp/export-ui-final-check.log`,
`/tmp/export-ui-quick.log`; whitespace/format checks passed. No commit/push.

# Phase 7.5.3 handover — Export performance, quality and UX — 2026-11-09

## 1. Delivered

Dedicated native desktop Export dialog with existing formats/sizing/resolution/
memory and current/all/unified/marked-part scopes; quality slider with metadata-only
estimates and explicit uncertainty; generated triangle counts; measured stage and
resource details; evaluated meshing progress; explicit prepared-download confirmation.
Idle Escape restores opener focus; active Escape/Cancel requests cancellation.
Sizing/quality/memory changes invalidate URLs and final source revision checks
refuse stale mesh downloads. Modal printable-part STL/report links retain a bounded
32 MiB/available-memory file allowance; existing direct Assembly/Quest actions stay
compatible. Quest print/export handoff now opens the dialog after XR exit. The
selected physical-size shortcut works within the modal and invalidates old output.

## 2. Correctness and preservation

Initial active Git checkout was clean at `/Users/brettjames/development/vrappPOC`;
conversation cwd was not a repository. Fresh 7.5.2 prerequisite audit **35/35 passed**
before export UX/metadata work: actual 443/200/100 mm STL/GLB files, metre/mm units,
evaluated ordered SDF/clay holes, 192/256³, topology, fallbacks/refusals, cancellation,
source/native bytes and history. No algorithm, physical calibration, native schema,
Bake/viewport, work quota, 600k STL/intermediate ceiling or MCP security changed.
No user native/recovery record was restored/discarded/overwritten. Browser testing
used fresh tabs with the default sphere; pre-existing recovery remained paused and
history stayed 0 Undo/0 Redo. No commit, push or merge authorised or performed.

## 3. Measured findings

Production instrumented baselines, four disposable fixtures, actual STL files and
independent local parser/field probes: [complete metrics and limits](PHASE_7_5_3_EXPORT_OPTIMISATION.md).
Holder 443 mm: sampling 850.4 ms, meshing 304.2 ms, extraction/precompaction
8,595.6 ms of 11,130.2 ms preparation. Fast/High 103,128/81,708 triangles (20.77%
reduction using the existing High algorithm); checked bounds/topology match.
Curved192 remains 293,776 at either quality; High spends 3,019.2 ms optimising.
Array104: 48,288→43,940, checked bounds/topology match. No new decimation or
before/after speedup is claimed. Conservative QEM/curved decimation stays off.

Field-residual probe maxima (vertices/centroids, not Hausdorff or wall/fit proofs):
clay 0.0901 mm; curved 0.0322 mm; holder 0.9723 mm; array 1.6537 mm; Fast/High
maxima agree. Synthetic clay Fast is correctly BLOCKED for 8 degenerate triangles /
10 non-manifold edges (also 2 open edges); existing High cleanup passes checks.
Tracked derived storage 4.84/74.17/78.59/15.97 MiB; peak process RSS
213/776.38/387.73/315.14 MiB includes fixture/snapshot/parser/both-quality/runtime
costs. The export budget is admission accounting, not a whole-process RSS ceiling.

## 4. Verification

Initial full `npm run check`: **1,669/1,669 passed** (86.07 s test wall).
Subsequent full pass after modal part-link/layout changes: **1,669/1,669** (85.72 s).
Latest quick **21/21** and focused estimate/outcome/project-workflow/Quest menu
**61/61** passed. Final full run after shortcut/handoff regression fix:
**1,670/1,670 passed**, zero failures/skips/cancellations (82.07 s test wall). All full passes include Biome formatting/lint, strict TypeScript
and Vite production build. Existing lint warnings/bundle-size advisory remain.
An intermediate check stopped on benchmark formatting; corrected before rerun.

Actual in-app browser fallback: Standard STL worker preparation + actual download
(independently parsed 31,536 finite triangles, 1,576,884 bytes); final fresh tab
confirmed worker backend, calibrated 169.848 mm dimensions and zero checked defects.
Also exercised 200 mm GLB preparation, High unified preparation, slider synchronisation,
quality-change URL invalidation, explicit Escape cancellation, idle focus restoration,
absent-part refusal and visually reviewed final 680 px dialog/report layout.
Final worker sample: optimiser128.9 ms, validation134.9 ms, encoding1.7 ms,
snapshot0.5 ms, round-trip305.1 ms, Blob/URL0.5 ms. Browser disk write is unmeasured.
Separate scripted Chromium launch failed SIGABRT/EPERM; its assertions did not run,
even after local network permission. Do not call that script a pass.

## 5. Limitations and remaining acceptance

Count intervals for cleaned qualities are deliberately broad (0–input, up to100%
uncertainty); evaluated count remains unknown until preparation. No asynchronous
estimation work exists to debounce/abort. Fast is prepared triangles; pre-existing
staged STL compaction still applies. No new tolerance-controlled curved decimator,
clearance/wall guarantee, automatic smoothing or print-fit claim. Investigate
compaction reuse before adding expensive passes. RSS accounting needs further work.
Full multi-part confirmation/cancellation, narrow responsive viewport, separate
scripted lifecycle/sizing smoke rerun, external slicer acceptance, OS freeze,
physical printer and Quest acceptance remain pending. Original user holder
appearance remains unconfirmed without native/source-export comparison.

## 6. Evidence and resumption

Run `node scripts/benchmark-export-pipeline.mjs` for four isolated-process fixtures;
`npm run check`, `npm run test:quick`, focused tests above; and
`scripts/export-browser-smoke.mjs` / `scripts/export-lifecycle-smoke.mjs` on a host
that permits Chromium launch. Updated scripts require explicit download confirmation
and exercise modal Escape/focus, slider and responsive width. Never attach them to
an existing user's project or approve agent access as part of these checks.

Evidence: ignored `work/phase-7-5-3/profile.json`, fixture STLs,
`browser-standard.stl`, `browser-evidence.json`, `export-dialog.png`;
`/tmp/phase753-profile-final.log`, `/tmp/phase753-browser.log`,
`/tmp/phase753-check.log`, `/tmp/phase753-final-check.log`,
`/tmp/phase753-quick.log`, `/tmp/phase753-focused.log`.

# Handoff — export correctness/detail and agent workflows — 2026-11-09

**Ready for software handoff.** User authorised commit/push for the complete current
checkout, including the preserved Phase 7.5.1 MCP workflow/hostname work alongside
Phase 7.5.2 export changes. Earlier in-progress or restricted-run entries below
are historical and superseded by this verification.

Delivered: explicit 1:1 / 200 mm target sizing for STL/GLB, evaluated dimensions/scale
summary, tighter export bounds, 192³ default / 256³ optional staged export, whole
planar-region High simplification including bounded oblique planes, physical
patch-deviation reporting, clear failure/interruption causes and exports surviving
focus changes. Source/native bytes, Undo, output units and admission guards remain.

Final `npm run check` passed format/lint, strict TypeScript, production build and
**1,667/1,667 tests**, no failures/skips/cancellations (81.22 s test wall). Agent
focused tests 19/19 passed. Final browser checks all passed with installed Chromium:
- Export worker STL/GLB sizing, axis/oblique cube reduction, physical deviation
  report, checked topology, unchanged Undo and injected failure status.
- High export survives blur/simulated hidden state; Cancel/Escape and application
  interruptions remain distinct.
- HTTP machine-hostname MCP approval/read-only/editing, official stdio tool discovery,
  proposals, exact holder Boolean graph, scoped front/isometric captures and bounds,
  one-Undo scene restoration, restart/shutdown and production isolation. Visually
  inspected the fresh holder isometric PNG.

Handoff review exposed a real HTTP-LAN UUID compatibility issue: browser
`crypto.randomUUID` is secure-context-only, while three agent ID callsites lacked
the existing `newId` fallback. They now use cryptographic `getRandomValues` through
that shared helper; server authentication/approval rules are unchanged. The browser
holder fixture now respects the 8:1 aspect limit (110 × 16 × 50 base at Y 4), allows only
numeric float noise in mm bounds, and correctly expects apply/Undo to append to
session activity. No product limits were relaxed to make the fixture pass.

Evidence: `/tmp/centra-handoff-final-check.log`,
`/tmp/centra-handoff-lan-focused.log`, `/tmp/centra-handoff-agent-browser.log`,
`/tmp/centra-handoff-export-browser.log`, `/tmp/centra-handoff-lifecycle-browser.log`.
Existing lint warnings/bundle advisory remain. Generated work/meshes, user projects
and recovery data are ignored and excluded from Git. Connected editor was not
reloaded or edited during handoff checks. Remote was fetched; main matched origin
before the handoff commit. No force push or merge is needed.

Remaining acceptance: Quest/OS-freeze and memory/RSS profiling, broader physical
fit/print checks and client-cached tool-list acceptance. A denser detailed-house
fixture can hit the unchanged intermediate triangle guard; no silent resolution
downgrade. Curved feature-preserving decimation, performance improvements,
triangle estimates and modal redesign remain separate future work.

# Arbitrary-plane High export — 2026-11-09

Implemented connected oblique-region reconstruction with a single fixed-plane
validation, bounded Float32 round-off allowance, strict local/transformed bounds,
unchanged retained coordinates and existing hole/seam/topology protections.
Existing axis-aligned/local-pass tolerances, quality/admission, source and lifecycle
guards stay active. Whole-region deviation stats and physical STL report bound are
separate from SDF sampling/local cleanup. See
[implementation and evidence](ARBITRARY_PLANE_EXPORT.md).

Rotated holder reconstruction: axis-only reference88,396/127,976 → arbitrary
83,882/116,276 triangles at192³/256³, unchanged checked bounds/topology, vertex
coordinates, pocket probes and native bytes/Undo. Browser rotated cube169,480 →
92,440, matching bounds/Undo and valid checked report. Focused encoding/quality/
patch tests27/27 passed, including physical-MM reporting. Browser algorithm pass
preceded the last report-field addition; no later browser result is implied.

The elevated full-check request was declined. Full sandbox `npm run check` passed
formatting/lint, strict TypeScript and production build; **1,662/1,666 tests passed**
(79.31 s wall), with four connector tests blocked by `listen EPERM 127.0.0.1`.
Failures are three `agent-access` local-bridge cases and one `agent-preview` binary
route server case. No geometry tests failed; no failures are silently skipped.
Evidence: `/tmp/oblique-sandbox-check.log`, `/tmp/oblique-final-focused.log`.
Final format/whitespace checks passed. No elevated retry was attempted.
No approval retry/bypass, commit/push, connected-editor change or recovery write.

# Confirmed unintended export cancellation fixed — 2026-11-09

Disposable browser reproduced focus-loss cancellation without Cancel. Shared
lifecycle handler aborted export for blur/hidden events; outcome formatter labelled
any aborted signal as user-requested. Export now continues through those events,
while interactive edit/Bake/library/recovery handling is unchanged. Navigation,
freeze, application errors and disposal still abort with explicit cause; only
Cancel/Escape carry the user reason. Actual failures win cancellation races.

Fixed real-browser High unified export survives blur and simulated hidden-state
events, retains Undo and downloads; explicit Cancel/Escape and application-error
classification pass. Source guards, native format, dimensions and limits unchanged.
Connected user project was inspected read-only; no reload or edits performed.
Logs: `/tmp/export-lifecycle-baseline.log`, `/tmp/export-lifecycle-browser.log`.
Final `npm run check` passed formatting/lint, strict TypeScript, production build
and **1,663/1,663 tests**, zero failures/skips/cancellations (89.06 s test wall).
Focused outcome/recovery tests17/17 passed. Evidence: `/tmp/export-lifecycle-check.log`,
`/tmp/export-lifecycle-focused.log`. Whitespace check passed.
No commit or push; prior work preserved.

# Whole planar-region High export — 2026-11-09

Implemented conservative exact axis-aligned patch reconstruction in High, with
hole loops, boundary restoration and edge/area validation. Crease normal bands,
paint, unsupported regions, independent sources and all admission limits remain.
No vertex displacement, source Bake, native-format change or additional export UI.
See [implementation and evidence](PLANAR_EXPORT_SIMPLIFICATION.md).

Holder reconstruction: previous High87,204/125,816 triangles at192³/256³ becomes
79,566/110,420 (8.76%/12.24% reduction). Checked encoded dimensions, pocket depths,
topology, original vertices, native bytes and Undo preserved. Complete optimiser
stage0.78/1.04 s in single Node runs, not full-export/browser/Quest guarantees.

Focused quality/staged/resolution/patch regressions31/31 passed; the new patch
fixtures cover concavity, holes, seams, paint, cancellation, malformed inputs and
real STL/GLB geometry. Final `npm run check` passed formatting/lint, strict
TypeScript, production build and **1,662/1,662 tests**, zero failures/skips/
cancellations (81.98 s test wall). Real browser worker cube exports retained
300 mm bounds and Undo, Fast29,292 →High18,132 triangles (38.10% reduction).
Existing sizing/GLB/error-status browser checks passed. Logs:
`/tmp/planar-patches-final-check.log`, `/tmp/planar-patches-browser.log`.
Whitespace check passed. Existing
uncommitted work and user project/recovery data preserved. No commit or push.

# Planar efficiency benchmark — 2026-11-09

Benchmarked current Fast/High and additional global planar passes on a disposable
holder reconstruction. At 192³:89,018 /87,204 /81,954 triangles; at 256³:129,168
/125,816 /115,152. Candidate reduces High by6.02% /8.48%, with7.27 /10.66 s global
compaction in single Node observations. Encoded dimensions, checked topology,
original vertex coordinates, pocket-depth rays and native bytes/Undo are preserved.

Current High already runs three global planar one-ring passes after exact welding;
chunk-only preparation was not the complete explanation. Extra passes give modest
benefit, so no application optimisation change was made. Whole-planar-patch boundary/
hole reconstruction needs a separate measured implementation. See
[benchmark evidence](PLANAR_EXPORT_BENCHMARK.md). Full `npm run check` passed
formatting/lint, strict TypeScript, build and **1,658/1,658 tests**, zero failures,
skips or cancellations (84.24 s test wall); log `/tmp/planar-efficiency-check.log`.
Whitespace check passed. No application changes, commits, pushes or user-project writes.

# Clear export failure status — 2026-11-09

Export failures now say `Export failed during <stage>: <underlying reason>` with
error styling and an alert role. Requested cancellation is separate, and an actual
error wins over a simultaneous Cancel signal. Last progress stage is retained;
source-change messages remain explicit. Earlier successful Fast retry did not prove
the cause of the user's separate planar-optimisation failure; that cause is unconfirmed.
Geometry, limits, native bytes and Undo behaviour are unchanged.

Final `npm run check` passed formatting/lint, strict TypeScript, build and
**1,658/1,658 tests**, zero failures/skips/cancellations (84.62 s test wall).
Disposable browser worker fault passed actual stage/cause/alert UI assertions and
existing STL/GLB sizing checks. The first browser attempt missed Vite's worker query
string; the corrected matcher passed. Evidence: `/tmp/export-failure-check.log`,
`/tmp/export-failure-browser.log`, `work/phase-7-5-2/browser-failure.png`.
No commit/push or user project/recovery write. Shortened export sizing labels also
passed the preceding 1,656-test full check (`/tmp/export-sizing-wording-check.log`).

# Tighter export bounds and optional 256³ — 2026-11-09

Implemented export-only exact primitive bounds and empty dense-layer exclusion,
with conservative sparse occupancy. Analytic primitive feature spacing no longer
inherits padded cache resolution. Export panel offers 192³ default / 256³ optional
maximum for evaluated Boolean STL/GLB and printable-part STL, with actual evaluated
resolution in the summary. Viewport/Bake/native schema and editable resolutions
remain unchanged. No user project or recovery write, commit or push.

Production-module holder reconstruction: old 192³ spacing 3.373 mm; new 192³ 2.406 mm;
new 256³ 1.793 mm. New STLs retain 450 × 59 × 70 mm and zero checked topology errors;
89,018/129,168 triangles. This replay uses queried source dimensions/poses and
assumes named slot cutters subtract; it is not native-byte-identical user data.

All existing admission limits are retained: 64M/stage, 256M total sample work,
1M intermediate triangles, selected memory budget, quality ceilings and 600k STL
validation. A trial larger intermediate allowance was removed because the detailed
house still exceeded final admission. With tighter sampling that fixture now
explicitly refuses at the original intermediate guard, preserving native bytes/Undo;
it is not represented as a successful export. This is a documented density trade-off.

Focused full 256³ tests pass STL topology/dimensions, GLB metre reload, unchanged
native bytes/Undo, memory/work refusal and cancellation. Browser default 192³ and
selected 256³ Unified Boolean path, summary and actual STL/GLB downloads passed;
fresh screenshot inspected. Final `npm run check` passed formatting, lint, strict
TypeScript, production build and **1,656/1,656 tests**, zero failures/skips/cancellations
(87.79 s test wall). Evidence: `/tmp/export256-final-check.log`,
`/tmp/export256-browser.log`, `/tmp/export256-resolution-final.log` and ignored
`work/phase-7-5-2/browser-summary.png`. Whitespace check passed.
See PHASE_7_5_2_EXPORT_CORRECTNESS.md for implementation/evidence and limits.

# Export 256³ feasibility investigation — 2026-11-09

Read-only holder dimensions replayed in disposable experimental modules. Valid
192³/256³ STLs retained dimensions/topology; spacing improved 3.373→2.513 mm,
tracked derived storage 61.10→140.78 MiB, single-run time 10.18→20.45 s.
Confirmed wasted layout space from empty dense layers and primitive cache bounds;
experimental tighter bounds reached 2.406 mm at192³ and 2.174 mm at212³.
256 export-only cap is feasible with allocation/guard changes and unchanged safety
admission; not implemented in application. Explicit rounding remains separate.
Native project revision unchanged. Dimension replay assumes named cutters subtract,
not a native-byte clone. See PHASE_7_5_2_EXPORT_CORRECTNESS.md for evidence and limits.
Only ignored experimental code and documentation changed in this follow-up; no
application check rerun is claimed beyond the preceding 1,654-test implementation run.

# Phase 7.5.2 — Export scale and geometry correctness — 2026-11-09

Confirmed sizing root cause: unchecked physical-scale control plus 100 mm STL
target silently overrode calibrated dimensions. Explicit session sizing now starts
at 1:1, target mode starts at 200 mm, and both STL/GLB honour the selected scale.
Measured evaluated scope/export bounds, scale and quality appear before encoding.
Native schema, geometry and Undo are untouched by export. Printable-part STL stays
1:1; target mode explicitly directs whole-assembly scaling to Unified Boolean.

No confirmed raw-primitive export regression: shared SDF evaluator uses analytic
live primitives and committed sculpt fields, ordered hard CSG and transformed arrays.
Sharp CSG is not implicit clay blending; sampling and shading can facet surfaces.
Specific original-holder appearance remains unresolved without its source file.
See [investigation and verification](PHASE_7_5_2_EXPORT_CORRECTNESS.md).

Initial baseline formatting/lint/types/build passed; four local-listen tests failed
with sandbox EPERM. Final unrestricted `npm run check` passed formatting, lint, strict TypeScript,
production build and **1,654/1,654 tests**, zero failures/skips/cancellations
(152.49 s test wall). Mixed organic/three-slot holder passes evaluated-field,
actual STL hole, GLB reload/normal and unchanged native-byte/Undo assertions.
Real browser controls/workers passed selected and Unified Boolean 1:1, 200/100 mm
STL coordinate checks and independent GLB metre bounds. Screenshot inspected.
Evidence: `/tmp/phase752-final-check.log`, `/tmp/phase752-browser.log`,
`work/phase-7-5-2/browser-summary.png` and downloaded mesh files. Existing uncommitted Phase 7.5.1 work preserved.
No commit, push, project/recovery write or modal redesign.

# Phase 7.5.1 — Agent Workflow & Tool Discoverability — 2026-11-08

### 1. What changed

Initial audit found the requested editing, batch/proposal, Boolean, array and
preview tools in the official stdio schema inventory. It also found that the MCP
adapter's hard-coded `get_capabilities.featureAvailability.scenePreview` incorrectly
said whole-scene only, while `capture_scene_preview` published `objectId` and
`partId`. Replaced the duplicate availability map with a shared registry and added
build/session identity plus explicit refresh/reconnect guidance. Task-oriented tool
descriptions and a canonical holder guide document separate browser approval,
aliases, exact mm transforms, one-Undo batches and post-edit inspection.

### 2. Architectural decisions

`tools/list` schemas remain generated from the existing strict Zod registry; no
duplicate modelling tools were added. `get_capabilities` exposes names from that
same live registry and a random session ID/build version, never credentials. MCP
stdio operation errors keep structured codes and advise inspection before retrying
uncertain writes. The browser bridge, proposal approval, revision checks, permissions,
transaction handling and production isolation are unchanged. Browser approval is
simulated only by a separate explicit browser click in the controlled E2E harness.

### 3. Build and test results

Verification in progress.

### 4. Benchmarks and regressions

Verification in progress.

### 5. Known limitations and blockers

Repository-side tests can inspect official stdio `tools/list`; they cannot inspect a
separate Codex or Cursor client's cached/filtered tool inventory. Refresh/reconnect
guidance and build/session identity now make that distinction diagnosable. Quest
hardware acceptance remains separate.

### 6. Handover

Run official stdio schema/capability parity tests, then the installed-Chromium real
browser holder challenge and full `npm run check`. Record captures under ignored
`work/phase-7-3/`; do not commit/push. Export UI and geometry engine are out of scope.

# Outline against studio background — 2026-11-08

Confirmed and fixed missing silhouette edges over grey: the display-only studio
skybox mesh entered OutlinePass's depth occluder render under an override material.
It is now explicitly excluded only during the outline depth/mask pass and restored
in finally. The normal scene still renders the background. Visually verified a
continuous green top edge against grey as well as edges against the grid.
Browser regression checks actual green pixels on the upper grey-backed silhouette.
Browser integration passed; full checks **1,652/1,652 passed**, no failures/skips/
cancellations (100.46 s), formatting/lint/types/build passed. Evidence:
`/tmp/outline-background-check.log`, `/tmp/outline-background-regression.log`.
No commit/push; existing scene and prior work preserved.

# Wider silhouette border — 2026-11-08

User requested thickness 12. OutlinePass now uses thickness 12, matching 12-tap
blur sampling to avoid separated bands and increased edge strength to compensate
for the wider filter. Visually inspected the fresh browser capture: wider smooth
green silhouette border. Browser integration passed; final full check passed
**1,652/1,652**, zero failures/skips/cancellations (109.78 s). Formatting, lint,
strict TypeScript and production build passed. Evidence:
`/tmp/agent-outline-12-final-check.log`, `/tmp/agent-outline-12-final-browser.log`.
No commit/push; scene changes remain separate from presentation settings.

# Compact agent history with arrival fade — 2026-11-08

Activity title/outcome and timestamp share a flex row; long titles wrap while time
remains visible. New stable activity IDs receive a 240 ms opacity fade. Existing
IDs do not replay the fade when the list refreshes; clearing history resets this
bounded presentation tracking. Reduced-motion disables animation. Project data,
selection, permission and Undo behavior are unchanged. Visual layout checked at
normal/wrapped title lengths. Browser CSS checks confirm only arriving rows animate
and reduced-motion disables it. Full verification recorded below. Nothing committed
or pushed; earlier changes preserved.

# User browser ownership acceptance — 2026-11-08

User verified in Chrome:
- A connected editor prevents a second tab from connecting: “another editor is connected; revoke it first”.
- Revoking A permits B to connect; A stays disconnected and its scene stays unchanged.
- Closing owning tab B without explicit revocation permits A to reconnect, with its scene unchanged.

These are user-reported manual browser passes, separate from automated checks.
Revocation during in-flight capture, rejected proposals and Quest acceptance remain
separate gates; no additional result is inferred from these checks.

# Agent silhouette feedback — 2026-11-08

Replaced Box3Helper activity boxes with a temporary screen-space OutlinePass over
actual selected visible surface groups, using a green border with thickness 12 and compensated strength without
glow or hidden edges. Hierarchy selections deduplicate their surface groups.
Boolean view highlights the evaluated composed display instead of raw cutter
shells. It is a composed-result highlight, not isolated per-operand geometry.
The effect is desktop-only; ordinary rendering resumes when inactive or blocked.
Six-second timing, reduced motion, blocked deferral and Show me replay remain.

The renderer borrows authoritative surfaces and never changes source materials,
geometry, selection or Undo. Temporary composer targets/passes dispose on clear,
expiry, scene replacement and page cleanup. Pixel ratio is capped at 1.5 during
feedback. Source bounding calculations remain only for explicit Show me framing.
Focused feedback tests **6/6 passed**. Full `npm run check` passed formatting/lint, strict TypeScript, production build
and **1,652/1,652 tests**, zero failures/skips/cancellations (98.03 s test wall).
Browser integration passed after making the approval-panel wait deterministic;
visually inspected the fresh browser screenshot showing a green silhouette edge
and no bounding cage. Evidence: `/tmp/silhouette-check.log`,
`/tmp/silhouette-browser2.log`, `work/phase-7-3/browser-created.png`.
Whitespace check passed.
Existing user tab must load updated code through a saved-project reload before
this presentation change appears. No commit or push; prior work preserved.

# Visible agent highlights — 2026-11-08

Fixed feedback suppression after desktop blur: visual feedback no longer inherits
the camera-input suspension guard. Capture permissions and capture busy guards
remain unchanged. XR, active strokes/transforms, hidden documents and modelling
operations still suppress feedback. Blocked highlights wait instead of being
silently dropped. Brighter green bounds last six seconds, and Show me now frames
and replays the highlight. Presentation remains separate from selection/history.

Focused feedback regressions **6/6 passed**, including Show me replay and blocked
feedback retention. Browser integration passed with a dispatched window blur before
an agent rotation; visually inspected `work/phase-7-3/browser-created.png` showing
the green box in the real viewport. Evidence: `/tmp/highlight-browser.log`,
`/tmp/highlight-final-focused.log`. Final full results below.

The existing user tab retains old code until a saved-project reload; a live rename
to Agent highlight demo was executed, but no successful fixed-version demonstration
in that tab is claimed. No reload or scene replacement was performed. No commit/push.

# Restarted agent discovery — 2026-11-08

Corrected the missing half of restart handling: after an approved connection drops,
the existing tab checks the same-origin session endpoint with exponential backoff (1, 2, 4, 8, then at most 15 seconds). A new
server token automatically opens Local agent access with **Agent server is back ·
approve connection to reconnect**. The user no longer has to discover that manual
retry is available. Fresh consent remains required; no background approval request
is sent. Explicit revocation stops discovery, and page cleanup stops the loop.
Existing scene, selection and Undo remain in the same editor. Discovery uses the
existing endpoint origin/Host/header restrictions. The browser restart regression
now requires this prompt to appear automatically before it clicks approval and
compares scene/revision and the original page marker.

Retry cadence now backs off exponentially to a 15-second cap and resets after
successful connection. Browser restart/discovery regression passed with backoff;
full backoff checks passed **1,652/1,652** (97.14 s). Evidence:
`/tmp/reconnect-backoff-check.log`, `/tmp/reconnect-backoff-browser.log`.
Approval UI removes the remembered-editing explanation, uses a bright green
connected dot and a hollow disconnected ring. Full UI checks passed **1,652/1,652**, zero failures/skips/cancellations
(93.67 s), with formatting/lint/types/build passing. Final hollow-ring CSS
passed the applicable lint/whitespace checks. Evidence: `/tmp/agent-reconnect-ui-check.log`.
No commit or push; all prior work preserved.

# Agent restart without scene reload — 2026-11-08

Agent development mode disables Vite HMR and serves a style-only Vite client
(with app configuration initialization) so server restart cannot trigger a reload
of an unsaved sculpture. Normal dev mode retains HMR. Approve connection discovers
the current browser-only bridge credentials from a no-store, same-origin local
endpoint, then explicitly approves the new session. No automatic reapproval or
reuse of proposal consent. Existing disconnect reset cancels pending work and
clears stale proposals; source scene/history remain owned by the same editor.

Discovery requires the exact loopback Host, a custom request header, and rejects
foreign Origin / cross-site Fetch Metadata; no CORS headers are supplied. This is
agent-dev-only and does not expose the MCP bearer credential. Browser validates
the discovered loopback address and token shape. Failed retries retain the scene
and explain how to retry without reloading.

Full `npm run check`: **1,652/1,652 passed**, no failures/skips/cancellations,
91.89 s test wall on the final full rerun, formatting/lint/types/build passed. Browser regression records
a window marker and object/revision snapshot across a real Vite stop/start, checks
no access before renewed approval, and compares the scene after reconnect. It also
checks discovery refuses missing headers and foreign origins. **Browser regression passed** with installed Chromium, including the real restart,
unchanged scene/revision, preserved page marker, explicit renewed approval and
forbidden discovery requests.
Evidence: `/tmp/reconnect-final-check.log`, `/tmp/reconnect-browser-final.log`.

Already-loaded pre-fix tabs require a one-time native save, updated-server reload
and reopen to install this behavior. Agent-mode source edits now require deliberate
reloads after saving. Nothing committed or pushed. Earlier cleanup/export work is
preserved.

# Phase 7.5 evaluated isolation follow-up — 2026-11-08

Object and printable-part captures now evaluate disposable scoped geometry through
`layerSources` / `partSources` and the existing independent Boolean/export pipeline.
This preserves hierarchy transforms, private cutters and arrays, uses existing
memory admission and does not evict desktop caches. The temporary composite,
geometry and render targets are disposed on success and errors. All camera presets,
auto framing, root ID/name, input IDs, mesh counts and bounds are retained.
Mutually exclusive scope inputs, missing/hidden roots and invalid part membership
refuse explicitly. No scene crop is presented as an isolated result.

Focused preview tests: **9/9 passed**, including ray assertions for an empty Boolean
through-hole and a real second array copy in both object and printable-part captures;
native bytes and Undo count are unchanged. Existing cancellation, replacement,
PNG size and renderer-state regressions remain passing.

Browser reliability: installed Chromium fallback passed the complete smoke test.
The previous approval timeout was a test toggle defect: the test closed an already
open access panel. It now checks panel visibility and waits for awaiting-approval
state before clicking. No consent or authentication relaxation. Default Playwright
Chromium remains absent; use the installed executable override. Fresh scoped PNG
browser smoke passed using installed Chromium 1234; visually inspected the isolated
isometric PNG. Final full `npm run check` passed formatting/lint, strict TypeScript,
production build and **1,652/1,652 tests**, no failures/skips/cancellations (95.71 s).
Final focused MCP tests **27/27 passed** after the last assertion update. Evidence:
`/tmp/phase75-final-evaluated.log`, `/tmp/phase75-final-focused.log`,
`/tmp/phase75-scoped-browser.log`; images `work/phase-7-3/model-*.png`.
Whitespace check passed.

Reliability review: browser smoke verifies connection approval/read-only refusal,
fresh approval after reload, editing preference persistence without implicit consent,
proposal review/apply, stale revisions, one-step Undo, MCP disconnect, Vite shutdown
and credential cleanup, normal startup and production isolation. Protocol tests
verify conflicting-editor ownership, revocation, cancellation, editor replacement,
stale/expired proposals, failed transaction rollback and PNG payload/session limits.
Repeated Vite restart with an already-open tab, stale-tab takeover and rejection/
revocation during a live browser capture still need dedicated browser acceptance;
these are not claimed verified by the protocol suite. No application security defect
was demonstrated in the passing tests.

Earlier in-progress entries below are historical and superseded by this follow-up.
No commit or push performed; recent export improvements remain intact. Export
redesign remains deferred. Physical Quest and additional print acceptance pending.

# Phase 7.5 cleanup in progress — 2026-11-08

Initial Git status was clean at ef5ccca. Recent export reliability/memory changes
(4697bda) are preserved. No export redesign, commit or push performed.

Ordinary visible source objects support isolated capture via objectId, automatic
framing/presets and ID/name/geometry metadata. Unsupported evaluated Boolean/array
isolation and printable-part requests explicitly refuse; no scene crop substitutes
for isolation. Whole-scene evaluated capture retains existing guards and permissions.
The renderer, desktop camera, selection, native format and history paths are unchanged.
A regression checks isolation metadata and explicit unsupported-scope failures.

ROADMAP.md separates implementation from automated, browser, Quest and physical
print acceptance, records one successful user enclosure/lid fit test, and defers
sampling/meshing profiling, feature-preserving decimation, triangle estimates and
modal export workflow with dimension/feature preservation.

Verification: initial restricted runs failed local listen EPERM. Retried with
permission. Browser default failed because Playwright headless Chromium 1254 is
missing. Installed Chromium 1234 fallback ran but timed out at agent-smoke.mjs:377
waiting for the exact-plan approval button. This is unresolved, not classified as
a confirmed application defect or a passing lifecycle test. Visual smoke had no
approved disposable session and failed its prerequisite. Do not weaken consent.
Final `npm run check` passed formatting, lint, strict TypeScript, production build
and **1,652/1,652 tests**, zero failures/skips/cancellations (126.39 s test wall).
Evidence: `/tmp/phase75-verified.log`. Isolation regression passed. Whitespace
check passed. Browser evidence: `/tmp/phase75-approved-browser.log` and
`/tmp/phase75-fallback-browser.log`.

Remaining: evaluated object and printable-part geometry isolation; investigate the
browser proposal approval timeout; complete reload/restart, reconnect/revoke,
active-tab/stale-session and editor-replacement browser acceptance. Existing tests
cover protocol guards but do not replace these browser checks. Quest and new print
acceptance were not performed. Next milestone: complete Phase 7.5 visual isolation
and browser lifecycle acceptance before starting deferred export optimisation.

# Development Status — Centra Sculpt / vrappPOC

## Primitive control cleanup — 2026-11-07

### 1. What changed

Tyre slider has whole-number steps, a separate readout and **0 = Torus / 100 = Tyre**
endpoints. Shorter tip/base/ring labels reduce clutter; centreline semantics remain
in the ring-radius tooltip. Existing uncommitted work is retained.

### 2. Architectural decisions

Presentation and UI rounding only; native/API tyre precision remains supported.
Selected slider commits still use the existing source edit and one Undo boundary.

### 3. Build and test results

Final `npm run check` passed Biome, strict TS, production build and **1,651/1,651
tests**, zero failures/skips/cancellations (86.23 s). Initial loopback-blocked run
was repeated after permission. Evidence: `work/primitive-expansion/ui-cleanup-final-check.log`.
Whitespace check passed.

### 4. Benchmarks and regressions

Existing primitive/tyre/native/history/agent suites pass; no geometry or performance
change. No new tests added for this small presentation change.

### 5. Known limitations

Live browser and physical Quest visual acceptance were not performed in this cleanup.
Existing sampling/export limitations remain unchanged.

### 6. Next recommendations

Try the shorter fields and whole-number tyre dial. Nothing committed or pushed.


## Tyre profile and lighter primitive previews — 2026-11-07

### 1. What changed

Added Torus **Tyre shape · 0–100%** on desktop and Quest: round tube at zero,
flatter tread/firmer shoulders at 100. Cone numeric tip entries clamp at zero.
Sphere, cylinder, cone, capsule and torus placement wireframes use fewer segments;
applied meshes retain full detail. All earlier uncommitted work is retained.

### 2. Architectural decisions

Optional dimensionless `tyre` changes the section from a circle to a rounded square,
keeping outer diameter, hole and thickness fixed. At 100 the shoulder round-over
radius is 15% of the tube radius. Analytic rounded-section distance, lathed source
mesh and directional support agree. Physical-unit conversion and source scaling
preserve the percentage. Ordinary API/batches/proposals, validation and history
remain authoritative. Explicit tyre metadata requires native v21; old tags reject
it, while absent metadata keeps the legacy round torus and v20 compatibility.

### 3. Build and test results

Final `npm run check` passed formatting, Biome lint, strict TypeScript, production
build and **1,651/1,651 tests**, no failures/skips/cancellations (84.11 s command wall).
Loopback permission enabled the MCP tests blocked in the preceding preview-only
turn. Focused primitive tests **19/19**; primitive/agent subset **73/73**; quick
**21/21**. Whitespace check passed. Evidence: `work/primitive-expansion/tyre-*.log`.

### 4. Benchmarks and regressions

Added profile 0/25/50/100 tests for exact round compatibility, retained dimensions,
SDF/mesh agreement, outward normals and closed one-component topology. Regression
covers percentage across cm/in/mm boundaries, source scaling, one Undo, native v21
roundtrip/old-tag refusal, strict agent schema, reduced preview triangle counts and
negative cone numeric input. No new hardware performance benchmark was run.

### 5. Known limitations

This is a solid tyre-like ring profile, without tread grooves or a hollow cavity.
The final setting retains rounded shoulders. Sampled Booleans and exports still
obey existing resolution, memory and topology admission; small round-overs can be
below sample/printer resolution. Live browser slider feel and physical Quest
acceptance were not tested in this follow-up. No new printability claim.

### 6. Next recommendations

Try **Primitives → Torus → Tyre shape**, with 50% for softer shoulders and 100% for
firmer edges. Quest uses the matching percentage keypad field. See
[parameter/native/export conventions](PRIMITIVE_EXPANSION.md). Nothing committed,
pushed or implicitly Baked.


## Primitive expansion — four more starting points — 2026-11-07

### 1. What changed

Added editable Cone, Capsule, Torus and Pyramid to desktop and Quest Primitives.
Cone reuses the capped tapered cylinder, including a true zero-radius tip or a
positive blunt end. The other three have typed source parameters, physical fields,
source meshes, analytical distances and bounds. Initial checkout contained five
uncommitted preview-fix files; preserved them. No commit, push or merge performed.

### 2. Architectural decisions

One canonical source/mesh pipeline serves display, previews and source exports;
Booleans/arrays retain the existing analytic sampler and transaction admission.
Capsule height is overall height; torus major radius is centreline radius, with
an explicitly positive hole. Pyramid has a centred XZ footprint at −height/2 and
apex at +height/2; width/depth can differ. Rotated asymmetric source bounds use
independent directional supports. Capsule collapsed pole triangles are omitted.
Native v20 is selected for new kinds or zero cylinder ends, including original
parameters; older-tag new definitions reject. v1–19 remain readable. Existing
ModellingAPI, batch dry-runs, strict MCP schemas/capabilities and approved proposals
share stable IDs, revision/permission/consent guards and one transaction Undo.
Tool Wheel, Cut, handedness, calibrated guides and dev/production gates are unchanged.

### 3. Build and test results

Baseline Biome/types/build passed; 1,628/1,632 tests passed, with four sandbox
loopback EPERM failures. After loopback permission, full `npm run check` passed:
**1,648/1,648 tests across 99 files**, zero failures/skips/cancellations, 107.29 s
command wall. Formatting/lint, strict TypeScript and production build (1.80 s)
passed; Biome reported 620 non-blocking warnings / 96 infos. Expansion regressions
**16/16**, focused primitives/agents **70/70**, `test:agent` **18/18**, quick **21/21**.
Final reviewed `npm run check` also passed **1,648/1,648**, 96.97 s command wall,
including the tighter all-zero cylinder MCP schema and agent scaling/Undo for every
new source. Final log: `final-reviewed-check.log`.
Production JS scan found no agent-browser/centra-agent/preview-image endpoint markers.
Whitespace check passed. Logs: `work/primitive-expansion/`.

### 4. Benchmarks and regressions

Tests cover signed distances/tips/hemispheres/hole/face normals, invalid dimensions,
affine bounds, source topology and calibrated STL/GLB, v20/old tags, source edits,
Undo/Redo, duplicates, actual recovery worker/Library remapping, transformed arrays,
ordered Booleans, read-only consent/stale writes and disjoint Quest menu targets.
Single Node v26.8.1 observations during full tests: 63³ analytic cache sampling
Cone 15.88 ms, Capsule 10.49 ms, Torus 10.90 ms, Pyramid 44.83 ms; 1,953 generator
yields each. These are CPU observations, not frame-time/peak-memory acceptance.
Actual sampled two-copy arrays passed two closed components each, zero boundary,
non-manifold/inconsistent edges, degenerates or inverted components: Cone 22,076
triangles / 64³, Capsule 24,376 / 59³, Torus 27,984 / 68³, Pyramid 27,232 / 64³.
STL encoding passed; evidence: `evaluated-report.json`.

Actual in-app browser imported native v20 with four separate editable meshes;
front/isometric/top `capture_scene_preview` PNGs passed official stdio MCP, unchanged
revision/objects and read-only access. Visually inspected all angles, including the
open torus hole. Desktop UI verified Cone creation, Pyramid/Capsule/Torus fields,
torus tube editing and one-step Undo. Evidence: `four-*.png`, `visual-report.json`,
`visual-smoke.log`. Standalone Playwright failed: expected browser revision missing;
installed Chromium fallback aborted with SIGABRT/EPERM. It is not claimed passed.

### 5. Known limitations

Existing 16 layers, 192³, source/memory/sample and 600k STL triangle limits remain.
Capsule aspect above 8:1 refuses; torus outer/tube aspect is bounded at 128:1.
Thin tubes/holes request finer sampling and may hit existing quality refusal.
33–63³ disposable source caches, sampled CSG/Bake and tessellated/Float32 export
cannot promise preservation of mathematical tips or sub-resolution blunt ends.
Export diagnostics and slicer checks remain necessary; no physical fit, minimum
wall thickness or general printability guarantee. Physical Quest, printer and
sustained GPU/peak-memory acceptance were not run. Root `read-the-docs-pls/` does
not exist, so no public documentation site was created or edited.

### 6. Next recommendations

Try the four choices in Primitives; Quest uses **New primitive…** before placement.
Use calibrated project-scale STL when exact mm sizes matter, then inspect the report
and intended slicer. Run physical Quest acceptance for both hands and a printed
thin-feature/tolerance coupon. See [primitive/API/native/export conventions](PRIMITIVE_EXPANSION.md).
Nothing is implicitly Baked; publication still requires explicit authorization.


## Desktop scene-preview pending fix — 2026-11-07

### 1. What changed

Fixed desktop focus interruption suspending the live Boolean compositor indefinitely,
leaving the display at zero triangles / pending and `capture_scene_preview` returning
`render_pending`. Existing uncommitted work was absent at task start; no commit or
push performed for this fix.

### 2. Architectural decisions

XR controller suspension pauses Boolean evaluation only with an actual XR session.
Releasing suspension works even when the last live operation was removed. Capture
still refuses unfinished or unavailable display; no stale-image fallback, forced
evaluation, SDF changes or persistence changes were introduced.

### 3. Build and test results

`npm run check` passed Biome, strict TypeScript, production Vite build and
**1,629/1,629 tests** (88.28 s test wall time). Focused XR/controller, capture and
live Boolean tests **46/46**; quick **21/21**. The added regression failed before
the fix with tracking-unavailable evaluation, then passed. It checks native bytes,
Undo count, repeated desktop interruption, real XR suspension and operation removal.
Baseline formatting/types/build passed; baseline loopback tests were permission
blocked. Final checks ran with loopback permission. Logs: `work/preview-pending-fix/`.

### 4. Known limitations

The existing open editor was inspected and its pending capture reproduced, but was
not reloaded because its model has unsaved changes. No successful post-fix live
browser capture is claimed. Actual evaluation delays/failures still correctly return
`render_pending`; screenshots do not certify printability.

### 5. Next steps

Save the open project before refreshing to load the fix, reconnect the local agent
if needed, allow Boolean evaluation to finish and retry the capture.

### 6. Handover

Changed `src/xr-controllers.ts` and its regression suite, plus these documentation
notes. The open model, recovery data and editor history were not changed by the fix.
Commit/push require explicit authorisation for this work.

## Phase 7.4.2 — agent visual inspection — 2026-11-07

Publication authorisation: the user explicitly authorised committing and pushing
Phase 7.4.2. This supersedes the implementation-time no-commit note below.

### 1. What changed

Added read-only `capture_scene_preview` to the optional local stdio MCP. It returns
an actual browser-rendered model-only PNG image block with structured revision,
project, measured bounds, camera, sampling and byte/pixel provenance. Six preset
angles and bounded size; references, editor UI and agent overlays excluded. Clean
active checkout was `/Users/brettjames/development/vrappPOC`; supplied workspace
folder itself is empty. No commit, push or merge authorised or performed.

### 2. Architectural decisions

Reuses committed desktop Three.js geometry and the existing WebGLRenderer in a
single disposable offscreen render with a separate orthographic camera and neutral
untextured material/lights. Ready live Boolean/array display is captured rather
than analytic source boxes; pending/stale/failed display refuses. No Node SDF
renderer, view switching, forced evaluation, source-cache changes or new polling.
Whole visible model only: monolithic evaluated display cannot isolate arbitrary
source/part IDs truthfully. Binary PNG upload is a separate exact-owner/job,
browser-token/origin authenticated route capped at 512 KiB. Existing JSON requests
retain 64 KiB, one flight and 10/12/15 second deadlines. MCP response reads cap at
768 KiB; image base64 is excluded from text/structuredContent. Capture needs browser
connection approval, never an editing grant. Native/history/selection/materials,
OrbitControls and consent remain unchanged; temporary resources/state restore in
finally. Normal dev and production retain their agent-free gates.

### 3. Build and test results

Baseline Biome/types/build passed; 1,617 tests passed with three existing loopback
tests sandbox EPERM-blocked. After loopback permission, final `npm run check` passed
Biome (non-fatal existing/style warnings), strict TypeScript, Vite production build
and **1,628/1,628 tests across 98 files**, zero failures/skips/cancellations
(85.65 s test-command wall). New preview suite **8/8**; existing agent suite **18/18**;
quick **21/21**. Production JS scan found no capture/preview-image/agent-browser/
centra-agent markers. Diff whitespace check passed. Logs: `work/phase-7-4-2/`.

Standalone full Playwright smoke remains blocked by host Chromium SIGABRT/EPERM;
do not call it passed. Actual in-app browser plus official stdio SDK captured
front/isometric/top PNG image blocks of a constructed through-hole/array fixture,
verified MIME/header dimensions/bytes, unchanged scene revision/object snapshots
and retained numeric diagnostics. Visually inspected model-only output confirms
both copies and the actual through-hole without cutter shells/grid/UI. A fresh
server is used for final verification because the older Vite process cached an
earlier module. Initial final-smoke attempts after chat resumption lost the prior
turn-scoped loopback grant; permission was renewed. The final disposable fixture
uses ordinary native import and read-only MCP approval; no editing grant is needed.
Fresh-server final smoke on isolated port 5287 passed all three 512 × 384 angles
with orthographic camera provenance and successful numeric diagnostics. Its imported
fixture displayed 73,064 triangles at 99³; no write grant was enabled. Evidence:
`visual-smoke-final.log`, `smoke-report.json`, `smoke-{front,isometric,top}.png`.

### 4. Benchmarks and regressions

The initial actual display fixture had 269,948 triangles / 124 meshes at 186³;
384² PNGs were 4,983 bytes front and 16,151 bytes isometric. This is observed output,
not a general GPU latency/peak-memory benchmark. Host tests exercise actual
compositor hole/array raycasts, framing at six directions and portrait/landscape
aspects over tiny/large bounds, native/history/selection and renderer-state
preservation, empty/hidden/large scenes, encoding cancellation/deadline/project
replacement/oversize, context loss/XR/busy/stale and driver failure. Binary admission
tests cover >64 KiB images, 512 KiB refusal, wrong credentials/origin/owner/job,
repeat upload, malformed PNG, read-only permission, revocation and ordinary JSON
limits. Existing disconnect/timeout/shutdown tests remain passing.

### 5. Known limitations and blockers

Whole-scene scope only; no object/part isolation, private references, guides or
paint fidelity. Existing sampled display may omit fine features; capture never
certifies watertightness, exact dimensions, enclosure intent reflow or physical fit.
Declared Phase 7.2 intent remains distinct from manually edited live sources.
Assembly previews, pending meshes, active XR and reserved editor interactions
refuse. Synchronous bounded GPU render/read cannot be pre-empted; late results are
discarded after return. Background browser throttling can expire the existing
heartbeat. Full standalone browser failure matrix and physical Quest/printing,
sustained GPU/resource acceptance remain pending. No new physical-fit claim.

### 6. Next recommendations

Use two angles with the same revision beside `get_geometry_diagnostics` and per-part
export reports; inspect in the intended slicer and print a tolerance coupon. Run
full Playwright smoke on a host that can launch Chromium and physical Quest
acceptance separately. See [visual inspection workflow/contracts](PHASE_7_4_2_VISUAL_INSPECTION.md)
and [local MCP setup](PHASE_7_3_LOCAL_MCP.md). No cloud/WebMCP/LAN/Quest sync.


2026-11-07 publication: user explicitly authorized committing and pushing Phase 7.2 associative enclosure features and the cutout/mounting editor cleanup. This supersedes the earlier no-commit notes for this work. Final cleanup check passed 1,620/1,620 tests; browser, hardware and physical-fit limits remain recorded below.

## Cutout / mounting editor cleanup — 2026-11-07

### 1. What changed

Reorganised the desktop section as **Cutouts & mounting** with labelled feature/type
pickers, short wall names, grouped placement/position/opening fields and shared mm
headings. Round ports show one diameter. Mounting centres now use a one-to-four post
count and numbered X/Z inputs. Advanced cutter reach is collapsed. Preview/Apply are
primary; removal/cancellation are quiet contextual actions. Existing uncommitted
Phase 7.2 work preserved; no commit/push/merge.

### 2. Architectural decisions

UI presentation stays over the existing staged feature definitions and transaction
boundary. Numbered rows generate the same explicit centre tuples. A round diameter
supplies equal width/height. Existing feature type is hidden while editing because
shape/count conversions retain their existing backend refusal. The main enclosure
Apply button is disabled during a feature preview, leaving one relevant Apply.

### 3. Build and test results

Final `npm run check` passed Biome, strict TS, production build and **1,620/1,620
tests** (89.90 s test-command wall), including the final grid alignment refinement.
Quick suite passed 21/21; diff whitespace passed. Evidence:
`work/phase-7-2/ui-cleanup-final2.log`, `ui-cleanup-quick.log` and
`cleaned-feature-editor.png`.

### 4. Benchmarks and regressions

No geometry or resource-limit change and no new performance benchmark. Actual in-app
browser on a fresh normal-development port verified the new controls, short wall
labels, round height removal, mounting count reducing visible coordinate rows,
successful two-post staged preview, cancellation and unchanged Undo during staging.

### 5. Known limitations and blockers

Physical Quest/slicer acceptance remains pending as before. This is desktop authoring;
the shared VR enclosure controls are unchanged. Compact sidebar content still scrolls.
The older running dev tab can retain old UI code; open/reload the current build after
saving work. No new physical-fit or source-preview topology claim.

### 6. Next recommendations

Use the numbered mounting rows and review Preview before Apply. Save before reloading
an older editor tab. See [Phase 7.2 API/limits](PHASE_7_2_FEATURES.md) for coordinate
semantics and unsupported geometry.


## Phase 7.2 — associative wall cutouts and floor mounting features — 2026-11-07

### 1. What changed

Added named enclosure frames, rectangular/round wall openings and one-to-four explicit
floor post/bore centres. Features retain mm intent and editable live Boolean sources,
follow transformed Base roots, and reflow with confirmed enclosure width/depth/height,
wall/floor updates. Base/Lid remain independent. Desktop Enclosure now exposes staged
Cutouts / Mounting Features creation, complete-definition editing and removal with
source outlines. Existing Quest enclosure resize/apply recomputes saved attachments;
its subtitle identifies desktop authoring. Added optional local-only inspection,
feature tools and separately approved standalone feature recipes. Initial active
checkout `/Users/brettjames/development/vrappPOC` was clean; the supplied workspace
folder itself is not a Git checkout. No commit, push or merge performed.

### 2. Architectural decisions

Intent lives in validated Base enclosure metadata, with source IDs and bounded typed
definitions, not a parallel MCP graph. Attachment identity is its first source ID.
Frames are named per part and introspectable in local mm and world pose/directions.
Wall U is signed from horizontal centre, V above the inside floor; guaranteed
through-wall cutters include explicit outward/inward margin and recompute depth.
Posts use positive floor overlap and nested bore subtraction. Existing ordered
modifiers, names, flags, hierarchy and primary recipe semantics are retained.
Confirmed rebuild restores declared generated dimensions/poses; manual source edits
remain editable until that rebuild. Unsupported/detached/baked feature structures
refuse rather than silently losing association. Ordinary deletion of an associated
source refuses; the feature removal transaction clears its intent and deletes all
sources coherently. All preparation/publication uses the authoritative revision-
guarded, abortable leased batch and rollback, with one logical Undo. Array-valued
`sourceIds` now resolve aliases through that same boundary. No recipe nesting or
mixed-operation atomicity is claimed. Native v19 only for attachment fields; missing
fields in older formats mean no attachments. Recovery and Library duplicate share
the codec; duplication explicitly remaps attachment source IDs. Strict native open
rejects foreign/missing source membership and malformed anchors/definitions.

### 3. Build and test results

Baseline `npm run check`: Biome/types/build passed, **1,604 tests passed**, three
existing 127.0.0.1 tests blocked by sandbox EPERM. After network permission, final
`npm run check` passed Biome (existing non-fatal warnings retained), strict TS, Vite
production build and **1,620/1,620 tests across 97 files**, zero failures/skips/
cancellations (79.87 s test-command wall). Focused geometry **12/12** passed;
focused enclosure/MCP run before added export cases **43/43** passed. Final full
suite includes all added geometry, native/recovery and approved-proposal tests.
Diff whitespace passed. Production JS scan found no `agent-browser`, `centra-agent`
or `agent-access-status` markers; historical “Local agent access” release-note text
is present and does not add networking.

Standalone Playwright smoke could not launch host Chromium (SIGABRT/EPERM), even
with permitted loopback. Supported in-app browser on isolated port 5202 verified
ordinary enclosure staging/one Undo, discoverable feature fields/association,
port preview with unchanged Undo, applied live cutter, and a depth resize retaining
the front association. Actual read-only MCP inspection confirmed the resized cutter
centre at Z=13.5 mm for the 30 mm outer depth and 3 mm wall. Official stdio SDK then
verified a separately browser-approved feature edit, stable source ID, returned
changed IDs and one Undo restoring U=0 from U=2. A first browser attempt correctly
refused its 128 MiB dry-run source budget after accumulated display/history work;
a delayed consent attempt expired without applying. A fresh fixture/consent completed.
Final small UI styling/selection-retention and world-frame additions passed final
host checks; the entire updated standalone browser script was not completed.
Evidence: ignored `work/phase-7-2/` logs and `browser-association.png`.

### 4. Benchmarks and regressions

Deterministic SDF tests cover both opening shapes on all four walls, translated/
rotated Base reflow, larger/smaller dimensions, wall/floor edits and through-wall
samples. Tests retain identities, native bytes, order/disabled state, names and
editable sources, one Undo/Redo, strict old tags/foreign anchors, actual recovery
worker and remapped Library copies, cancellation/stale/locks/capacity refusals and
four-post bores. Existing controller/handedness/Support/Cut regressions pass.
No standalone frame-time/peak-RSS or physical Quest benchmark was run.

Actual evaluated per-part **Fast STL** fixture (one wall cutout + two bored posts)
passed: Base **200,518 triangles**, bounds **30 × 17 × 26 mm**, sampling **0.2 mm**;
Lid **77,368 triangles**, bounds **30 × 7 × 26 mm**, sampling **0.5 mm**. Each has one
component, zero boundary/non-manifold/inconsistent edges, zero degenerates/inverted
components, unchanged native sources and no cutter shells. High-quality optimisation
of this fixture hit the existing memory guard and refused; no limits were relaxed.
The lid report correctly warns that 0.3 mm clearance is below its 0.5 mm spacing.

### 5. Known limitations and blockers

This is a narrow named-frame constraint implementation, not a general CAD solver.
Centre offsets only; corner/floor/rim overlaps, rounded port corners, blind pockets,
lid/floor ports, board-reference/edge constraints, automatic board data, underside/
floating posts and feature type/count conversion are deferred. Mounting coordinates
are supplied user data, never a confirmed board layout. Posts require zero floor
offset, stop below the lip and have post bores rather than through-floor screw holes.
Four posts use eight layers; a default enclosure plus starter and one cutout uses
15 total. Sixteen layers, source/time/memory, 192³ and 600k STL triangle limits remain.
Preview/history caches can prevent later dry-runs even below the layer cap. Native
open refuses structurally invalid feature links; restore/Undo unsupported manual
structural changes before saving/reflow. Ordinary source editing does not implicitly
change the declared constraint. Source-cache/wire preview is not evaluated STL or
physical-fit validation. Real slicer, printed clearances, material/shrinkage, board
fit and Quest sustained interaction/performance remain unvalidated.

### 6. Next recommendations

Use the staged desktop workflow and save v19 projects with this app version. Inspect
actual per-part STL reports, then slicer geometry and a printed tolerance coupon;
0.3 mm intent may be below sampling resolution. Run the full updated Playwright
smoke on a host that can launch Chromium and physical Quest acceptance for both
hands/menu ownership/controller interruption. Extend VR attachment authoring and
edge/board constraints only with explicit definitions and bounded geometry admission.
Detailed API, frames, traversal/bore semantics and deferrals:
[Phase 7.2 guide](PHASE_7_2_FEATURES.md). Optional adapter retains 127.0.0.1-only
approval/write grants and per-plan consent; production remains free of agent
networking. No cloud, WebMCP, Quest sync, QR pairing or commit/push authorization.


## Phase 7.4.1 — Show Me What Changed — 2026-11-07

### 1. What changed

Added commit-only two-second source bounds outlines, a quiet 20-entry recent agent
transaction list in the sparkle panel, and explicit Show me framing. Rows include
time, descriptions, names/IDs/status and Applied/Failed outcomes; one batch is one
row. Dry-run/staging cannot signal success. Added the user-requested opt-in Remember
editing choice on this browser preference. Initial checkout was clean. User now
explicitly authorises committing and pushing this phase and preference.

### 2. Architectural decisions

An optional adapter observer compares detached object metadata around authoritative
results. New activity/feedback/preference modules are reached only through the
existing development import gate. Box3Helper bounds outlines are independent,
unpickable, disposable scene helpers; reduced motion keeps them static. Show me
uses read-only bounds and the existing desktop OrbitControls camera, without changing
selection, source transforms or history. Busy/stroke/XR guards prevent interference.
No SDF engine, persistence format or modelling transaction changes. Feedback/refresh
errors do not alter committed results. History is bounded to 20 rows/128 object
summaries per row and clears with access/editor lifetime; no Undo claim is exposed.
No new MCP recent-changes tool was needed. The explicit preference stores desired
edit/read mode only, never credentials, actual grants or proposal consent. Fresh
connection approval and separate proposal approval remain required.

### 3. Build and test results

Baseline check passed Biome/types/build and 1,598 tests; three existing localhost
bridge tests were sandbox EPERM-blocked. After loopback permission, final full
`npm run check` passed Biome, strict TypeScript, Vite production build and
**1,607/1,607 tests across 96 files**, zero failures/skips/cancellations (86.39 s test
command wall). Focused activity/agent run passed 22/22 before the additional preference
test, which is included in the full suite. Quick suite passed 21/21. Production JS
scan passed: no activity-outline, preference-key, activity-panel or agent-panel
markers. Diff whitespace check passed. Evidence: `work/phase-7-4-1/`.

Standalone Playwright Chromium could not launch under the sandbox (SIGABRT/EPERM).
Actual in-app browser plus official stdio MCP verified batch grouping/one Undo,
Show me framing with unchanged revision, no dry-run success row, stale/expired Failed
rows, one Applied row for a separately browser-approved proposal, unavailable hidden
targets, disconnect clearing and remembered editing across a fresh page with explicit
approval still required. Full updated Playwright smoke was not completed; screenshots
and accessible states were inspected in the supported browser alternative.

### 4. Benchmarks and regressions

No new headset/performance benchmark. Feedback is active for about two seconds and
uses the existing bounds helper idiom. Host tests verify native bytes/history/selection
unchanged by feedback/framing, multiple outlines, no picking, reduced-motion static
opacity, lifetime expiry/owner replacement, hidden/deleted/blocked framing, detached
20-row history and fail-safe observers. Read-only staging no longer invokes the UI
change callback; failed writes do not trigger it. Production build retains the
existing bundle-size advisory. Normal dev still uses its unchanged agent-free gate.

### 5. Known limitations and blockers

Bounds are conservative source previews, not evaluated CSG silhouettes. Empty or
budget-refused bounds report unavailable. Large/complex targets can be hard to see
behind other objects; Show me never hides unrelated objects. Activity is not an Undo
stack and is deliberately not persisted or exposed through a new MCP tool. The saved
desired editing mode is origin/profile specific, defaults off and gracefully fails
when storage is blocked. Actual reduced-motion/XR/editor-replacement interruption
variants were host-tested rather than exhaustively repeated in a physical browser
or headset. The standalone Playwright launch blocker remains explicit.

### 6. Next recommendations

Use the sparkle icon to inspect Recent changes; click Show me for a deliberate
camera move. Enable Remember editing choice if desired; revoke access independently
of that preference. Run the updated complete Playwright smoke in an environment
that can launch Chromium and perform physical Quest acceptance separately. Usage:
[Phase 7.4.1](PHASE_7_4_1_AGENT_FEEDBACK.md). No new cloud/WebMCP/Quest synchronisation.


2026-11-07 publication: user explicitly authorized committing and pushing Phase 7.4 proposals, quiet desktop agent controls, tapered cylinders, ellipsoids, staged full-resolution export and bounded STL validation with the 600,000-triangle ceiling. This supersedes earlier no-commit statements for these changes. Final verification passed 1,601/1,601 tests; browser failure-matrix, Quest and physical printing limitations recorded below remain.

## Bounded STL topology and 600k ceiling — 2026-11-06

### 1. What changed

Raised the shared STL client/encoder/topology ceiling to **600,000 triangles** as
requested, retaining available-memory and quality checks. Replaced retained
coordinate/edge string maps with cooperative typed-index sorting and typed
connectivity buffers so larger full-resolution exports can actually fit. Saved
Turtle successfully exports at 192³ with 365,994 triangles. Existing source changes
preserved; no commit/push/merge.

### 2. Architectural decisions

Exact Float32 coordinate welding, undirected edge counts/directions, face-component
unions, signed volume and diagnostics retain their existing semantics. Sorting
and topology loops cooperate with cancellation/revision checks. Peak-pipeline
admission estimates 128 bytes per corner rather than 320, independently of the
quality preset; precision seam candidate storage is explicitly bounded. This is
not simply removal of a memory guard. No resolution reduction, near-coordinate
weld, hidden repair or winding changes. The new shared constant prevents client
and worker limits diverging; non-STL/mesher limits remain separate.

### 3. Build and test results

Focused STL suite passed **24/24**, including >300k triangles with exact closed-box
connectivity, components/winding and cancellation during sorting, plus immediate
refusal at 600,001 triangles. Earlier topology/export/staged focused run passed
43/43. Final `npm run check` passed Biome, strict TypeScript, Vite build and
**1,601/1,601 tests across 95 files**, no failures/skips/cancellations (80.79 s
test command wall). Evidence: `work/staged-export/final-600k-check.log`.

Actual Chrome Turtle export completed staged evaluation but initially encountered
the old STL validation guard. A read-only copy of the user's downloaded saved
`/Users/brettjames/Downloads/turtle.form` then completed the updated full-resolution
preparation and STL encoder successfully. Evidence: `turtle-export.log` and
`Turtle-192-staged-report.json` in ignored `work/staged-export/`. Output is
`Turtle-192-staged.stl`, longest dimension 100 mm matching the UI. Native source file
was not modified. The final updated browser-worker retry has not been observed.

### 4. Benchmarks and regressions

Turtle retains 365,994 triangles after 47,234 exact planar-compaction removals,
with the original 192³ grid. Validation reports zero boundary, non-manifold,
inconsistent-winding and degenerate counts. No new general performance/peak RSS
benchmark; the allowance remains an estimate, not a total process/GPU memory claim.
Large typed-topology regression (300,012 triangles) and cancellation completed in
about half a second in the focused host run. Existing full printing/export quality
and geometry regressions remain required in the final all-check run.

### 5. Known limitations and blockers

Turtle's report identifies two surfaces and one inward-oriented component; cavity
versus unintended shells is not classified. Inspect in the intended slicer; no
physical-fit/printability guarantee. Available memory may refuse exports below
600k, especially higher quality presets or large source scenes. The updated
browser must load the new code before its earlier 300k guard changes. Turtle is
confirmed saved/open; the earlier recovery-location question is resolved. No
unrelated recovery checkpoint was restored or discarded.

### 6. Next recommendations

Use the generated Turtle STL/report for inspection, or load the updated editor
(after saving) and retry the ordinary unified export. Keep full-resolution source
sampling and final Float32 diagnostics together. See
[staged export usage](STAGED_BOOLEAN_EXPORT.md).


## Staged full-resolution unified Boolean export — 2026-11-06

### 1. What changed

Unified export now admits larger evaluation jobs in bounded Z stages on the same
original grid, retaining up to 192³ resolution without lowering quality. Added
stage sampling progress and corrected the misleading array-only error label.
A twelve-source scene at 192³ now runs in two stages instead of refusing its
84,934,656 estimated source samples. Sources, selection, native bytes and history
are unchanged by export. Existing uncommitted work retained; no commit/push/merge.

### 2. Architectural decisions

The old limit is an estimated CPU source-evaluation quota, not a voxel allocation
limit. Export alone opts into stages of at most 64 million estimated source-sample
operations, with a 256 million overall ceiling. All stages use the same prepared
ordered evaluator and scalar lattice; the ordinary mesher runs once afterwards.
No separately meshed partitions, source batching/reordering, implicit Bake, changed
spacing or intermediate Boolean approximations. Cooperative sampling/meshing yields
and explicit stage boundaries keep revision/cancel checks active. Original 256 MiB
memory and triangle admission remain. Preview/Bake retain their existing quota.

### 3. Build and test results

`npm run check` passed Biome, strict TypeScript, production Vite and **1,599/1,599
tests across 95 files**, no failures/skips/cancellations (76.89 s test command wall).
Evidence: `work/staged-export/check.log`. New focused suite **3/3** passed (5.19 s)
including actual twelve-source 192³ two-stage STL preparation/encoding, exact scalar
and mesh comparison for ordered subtraction/intersection, native/history preservation,
cancellation, stale source edits and memory refusal. Quick suite passed 21/21.
Stage coverage/work ceilings and retained total-work refusal are tested. Diff
whitespace check passed.

The user's active Chrome scene was inspected read-only through its already-approved
5173 session after automatic discovery pointed at a different 5174 server. It had
12 visible layers and no arrays. No native source or history mutation was requested.
During the later browser check a dev reload warning was present; Cancel was clicked,
but the observed page then showed the starter scene. Existing recovery was neither
restored nor discarded. The user was asked for the saved .form/Project Library model
so the intended scene can be restored. Do not claim that model's actual browser
export was verified; the full-resolution export result is verified on the independent
regression fixture. Saved files were not modified by this work.

### 4. Benchmarks and regressions

No production benchmark or new maximum-resolution claim. The twelve-source fixture
completed its focused export/cancellation/stale/memory cases in about five seconds
on the host, not a promise for complex scenes. More total CPU work is now admitted;
ellipsoid solves and nested CSG can be significantly slower. Sampling progress is
per stage and the engine still yields within each stage. Existing mesh cleanup,
physical-size conversion, native persistence and source cancellation regressions pass.

### 5. Known limitations and blockers

This is staged work admission on one memory-bounded grid, not out-of-core meshing.
The 192³ cap, memory, triangles and existing source-detail capping still apply.
No automatic reduction in resolution. More than 256 million estimated source-sample
operations still refuse. The estimate counts sources/array instances and is not an
exact nested-operation CPU cost. Interactive preview/Bake may still refuse a scene
that unified export can process. The later Turtle follow-up resolves the saved project location and completes a
full-resolution saved-file export; unrelated recovery data remains untouched.

### 6. Next recommendations

Save/open the intended project, load the updated development code, then use the
ordinary Export unified boolean button; sampling should show numbered stages.
Cancellation remains available and source edits make the export stale. Guide:
[staged Boolean export](STAGED_BOOLEAN_EXPORT.md). Test physical/slicer acceptance
separately; this change does not certify printability.


## Stretched spheres / ellipsoid primitives — 2026-11-06

### 1. What changed

Added independent sphere Width, Height and Depth in desktop/VR numeric fields and
source-local Scale handles. Spheres become ellipsoids when their axis lengths differ.
Local agents can create/update ellipsoids through ordinary commands or approved
proposal batches and stretch them with `scale_primitive`. Existing uncommitted work
was preserved. No commit, push or merge performed.

### 2. Architectural decisions

Kept kind `sphere` and legacy `diameter` as the fallback for unspecified dimensions;
all three explicit axes may omit that fallback in typed/MCP input. Validated sources
retain a resolved fallback diameter. Round-sphere distance sampling remains byte
compatible. Ellipsoid signed distance uses a bounded 56-iteration closest-point
multiplier solve, with a stable shifted interior parameter, geometric bracketing
near singular poles, and the medial-axis branch for zero coordinates. This measures
Euclidean distance numerically rather than approximating a sphere's radial distance.
Source presentation/export geometry and exact directional support use all three axes.
Source scaling preserves IDs/pose, keeps the affine transform uniform and uses the
existing source regeneration/transaction path. Native format v18 is written only
when source/original sphere axis overrides exist; invalid older tags reject.

### 3. Build and test results

Final `npm run check` passed Biome, strict TypeScript, Vite build and **1,596/1,596
tests across 94 files**, zero failures/skips/cancellations (92.46 s test command wall).
Evidence: `work/ellipsoids/check.log`. Focused geometry/transform run passed 68/68
before adding the two ellipsoid export/analytic cases; all are included in the final
suite. Focused MCP passed **17/17** (`work/ellipsoids/agent.log`); quick suite 21/21.

Actual in-app browser verified Width/Height/Depth fields and a 100 × 50 × 50 mm
ellipsoid wireframe. Official stdio MCP against that browser passed schema discovery,
40 × 20 × 10 mm creation, independent source scaling to 60 × 20 × 20 mm, mm object
inspection, two individual Undo operations and restoration of the original object
count. Evidence: `work/ellipsoids/browser-mcp.log`. The UI showed zero Undo/two Redo
and Base restored. Native v18/old-tag refusal, source geometry/STL/GLB topology and
Undo/Redo are covered by host tests. Diff whitespace check passed.

### 4. Benchmarks and regressions

No headset or standalone performance benchmark. The numeric solve has bounded work
but costs more per sample than round spheres. Existing admission, cancellation and
sampling limits remain. Tests cover surface normals and signed offsets, axes/centre,
medial-axis points and near-zero coordinates, symmetry, round-sphere compatibility,
rendered axis extents, source cache/native round trips and exports. Updated old tests
that expected a Y sphere handle to enlarge every axis: the desired behavior now
stretches Y only. The live Boolean cutter test verifies its changed evaluated outcome
and retained source fields during preview. Production isolation remains covered.

### 5. Known limitations and blockers

Positive local dimensions and existing 8:1 aspect/resource limits apply. This does
not enable arbitrary non-uniform affine edits to sculpt layers or groups, nor
elliptical cylinder ends. `scale_object` continues to require equal XYZ for world
scale changes; agents use `scale_primitive` or `primitive.update` for ellipsoid axes.
Earlier status entries describing unsupported ellipsoids are superseded by this
entry. Physical printer fit and Quest acceptance remain unverified. There is no new
provider, export service, networking surface or persistent agent metadata.

### 6. Next recommendations

Try Sphere with Width 40, Height 20 and Depth 10 mm, or ask an agent to create that
source. Use local axis Scale handles or `scale_primitive` factors to stretch it.
Inspect any manufacturing output in the intended slicer. Usage/examples are in the
[local MCP guide](PHASE_7_3_LOCAL_MCP.md). The separately requested new-project agent
operation remains outstanding; it was not implemented as part of primitive support.


## Tapered cylinders and agent dimension scaling — 2026-11-06

### 1. What changed

Cylinders now expose independent positive top/bottom diameters and height in desktop
and VR primitive fields, editable source geometry, draft previews, Booleans and local
MCP primitive create/update/proposal batches. Added `scale_primitive` for source-local
XYZ dimensional multiplication: independent box axes, independent cylinder axial and
radial sizing. Existing working changes were retained. No commit/push/merge.

### 2. Architectural decisions

Legacy `diameter` remains the fallback for either unspecified cylinder end. Inputs
with both explicit ends may omit it; validated sources resolve a fallback diameter.
Top is local +Y, bottom −Y. The capped-frustum source uses exact Euclidean distance
to the side segment and cap disks. Straight-cylinder sampling remains byte compatible.
Visible/source export geometry uses matching top/bottom radii; directional support
and rotated source dimensions account for unequal ends. Native files write v17 only
when source/original end overrides are present; lower-version tagged new metadata
rejects. Existing projects keep their previous versions. No sculpt lattice or affine
transform contract changed. PrimitiveInput supports explicit ends in the typed API.

### 3. Build and test results

`npm run check` passed Biome, strict TypeScript, Vite production build and
**1,591/1,591 tests across 94 files**, zero failures/skips/cancellations (90.45 s test
command wall). Evidence: `work/primitive-taper/final-check.log`. Focused primitive
suite **35/35** and MCP suite **16/16** passed; quick suite passed. Initial sandbox
check had three loopback EPERM failures; rerun with loopback permission passed.
The first focused run exposed unnecessary geometry recreation for box sizing;
retained geometry reuse for untapered sizing and retested successfully.

Actual in-app browser verified separate end fields and a 25/50 mm tapered draft.
Official stdio MCP against that browser passed tool schema discovery, end-diameter
creation without legacy diameter, tapered dimensional scaling, mm inspection and
two individual Undo transactions restoring the original scene. Evidence:
`work/primitive-taper/browser-mcp.log`; actual UI inspected. Existing recovery data
in other test origins was left untouched. Diff whitespace check passed.

### 4. Benchmarks and regressions

No new performance/headset benchmark. Added source SDF/cap/side/reversed-taper,
rendered radii, invalid input, native v17/old-tag refusal, Undo/Redo and agent sizing
regressions. Full suite retains assembly, CSG, printing, export/recovery and primitive
preview reuse coverage. Existing resource/aspect limits and bundle-size advisory
remain. No printer-fit or physical Quest acceptance claim.

### 5. Known limitations and blockers

All end diameters remain positive; zero-tip cones and elliptical cylinder ends are
not added. Source axis ratios retain 8:1 admission. `scale_primitive` requires equal
X/Z for cylinders and equal XYZ for spheres. Boxes support independent dimensions.
A stretched sphere is an ellipsoid and remains unsupported; this is a pre-existing
source/transform limitation, verified against HEAD, not introduced by taper work.
Existing world transform scale edits still require equal XYZ; unchanged legacy
non-uniform transforms can be retained. MCP descriptions/capabilities now state this
restriction explicitly. Agents should use `primitive.update` dimensions in proposals.
General affine deformation, ellipsoids and a new-project MCP operation are not part
of this implemented change; the earlier requested new-project capability remains
outstanding. Quest and physical printer acceptance remain pending.

### 6. Next recommendations

Try a cylinder with topDiameter 10, bottomDiameter 20, height 30 mm as an editable
Boolean cutter for a flared opening. Review final exported geometry in the intended
slicer. Implement ellipsoid/source deformation support separately before advertising
stretched spheres; do not relax the engine guard without matching CSG/export/cache
support. Agent usage is in [local MCP guide](PHASE_7_3_LOCAL_MCP.md).


## Phase 7.4 — Agent Plan, Preview & Apply — 2026-11-06

### 1. What changed

Added immutable, memory-only multi-command proposals and separately staged enclosure
create/update proposals on the existing optional local MCP connection. Desktop review
shows operations, additions/edits/deletes, affected IDs/names/source dimensions, exact
commands and source-cache reports. A person explicitly approves each plan in the
browser; MCP cannot approve. Apply executes the retained plan once with one Undo and
post-commit object/source diagnostics. A small lower-left sparkle icon and green
connection dot keep access unobtrusive; incoming proposals never open a panel or take
focus. Click the icon for review or connection controls. Editing permission collapses
the panel. Existing changes were preserved; no commit/push/merge.

### 2. Architectural decisions

Strict Zod schemas expose `propose_changes`, `propose_enclosure`, `get_proposal`,
`cancel_proposal` and `apply_approved_proposal`. Batches and standalone recipes delegate
to authoritative ModellingAPI transactions, staging, rollback and admission. Recipes
and connectors cannot nest in batches; connectors are outside proposals. Consent is
bound to the exact editor instance, opaque revision and memory-only browser session,
with a two-minute lifetime. Changed revision/editor, expiry, revocation or lost access
invalidates outstanding consent; no silent retry/rebase. Editing a proposal means
cancel/resubmit/revalidate/reapprove. Added an opt-in batch selection-preservation
option so surviving selections are restored before the one history entry closes.
Normal dev and production import boundaries, ephemeral localhost/stdin auth, browser
ownership and default read-only permission remain. No provider, persistent agent
metadata, arbitrary file/code/export tools, cloud, WebMCP, LAN or Quest synchronisation.

### 3. Build and test results

Initial baseline passed Biome, strict TypeScript/build and 1,582 tests, with three
loopback tests blocked by sandbox EPERM. After loopback permission, full checks passed
1,588/1,588 tests across 94 files before the final standalone-recipe and UI refinements.
Focused proposal/transport suite then passed 15/15, including standalone enclosure
create/update with one Undo per transaction. Quick suite passed. Final verification for the sparkle presentation passed Biome, strict TypeScript,
Vite build and **1,589/1,589 tests across 94 files**, no failures/skips/cancellations
(83.76 s test command wall), recorded in `work/phase-7-4/sparkle-check.log`.
The final responsive adjustment is CSS-only: panel maximum 310 px, 280 px on narrow
viewports, independent of editor sidebar minimum widths.

Actual supported in-app browser plus official stdio MCP verified a four-step
box/cylinder/subtract/array proposal: unchanged scene revision/count and zero Undo
while previewing, denial before consent, explicit test browser approval, actual IDs,
three committed objects, duplicate refusal and one ordinary Undo back to Base.
The quiet collapsed controls and automatic collapse after enabling editing were
visually checked separately. The standalone Playwright Chromium launch was blocked
by SIGABRT/EPERM; its updated script was not successfully completed in this sandbox.
Logs are under ignored `work/phase-7-4/`; see the usage guide for the exact limits.

### 4. Benchmarks and regressions

No new geometry or headset performance benchmark. Existing limits, source-cache
sampling and transaction cancellation remain authoritative. New host cases exercise
byte/history preservation, immutable commands, explicit consent, duplicate apply,
expiry, revision changes, editor replacement, permission/busy refusals, hidden/locked
objects, cancellation and partial backend staging failure. Existing bridge tests
cover authenticated loopback admission, ownership, deadlines and shutdown. No new
success state is displayed before backend commit. Production remains agent-free.

### 5. Known limitations and blockers

Source previews/diagnostics do not establish final CSG topology, global wall thickness
or physical printer fit. Geometry inspection retains its reported sampling limits.
Preview IDs are provisional; committed IDs are returned separately. A lost response
after commit requires inspection before any new operation. One in-flight bridge call
means MCP cancel cannot overtake it; browser Reject/revoke and request cancellation
abort cooperative work. Existing 10/12/15-second operation/bridge/client deadlines
remain. No persistent proposal log or mutable approved-plan patch. Existing immediate
write tools remain compatible and require the general editing grant.

The complete requested browser failure matrix (tab close/restart/project recovery,
slow generation and partial failures) was not repeated end-to-end in a browser;
host/transport regressions cover the underlying primitives. Quest acceptance,
physical printing and Phase 7.2 associative cutouts/mounting constraints remain deferred.

### 6. Next recommendations

Review a small plan via the sparkle icon, approve it deliberately, apply and exercise
Undo. Run the updated full Playwright MCP smoke outside the Chromium launch sandbox,
then complete the broader browser interruption matrix before treating this local
POC as release acceptance. Usage: [Phase 7.4 guide](PHASE_7_4_AGENT_PROPOSALS.md).


## Phase 7.3.1 — expanded local MCP modelling — 2026-11-06

### 1. What changed

Expanded optional local MCP access to live Boolean stacks, linear/radial progressive
arrays, hierarchy, flags, duplication/deletion, printable assembly metadata, mating,
connectors, enclosure updates and source/evaluated geometry inspection. Added
read-only capability discovery and `dry_run_changes`; safe Phase 7.0 command types
now work in named-reference batches. Existing session discovery, approval controls,
16-layer capacity and move/rotate/scale contracts remain intact. Working tree was
clean at start. No commit, push or merge authorized or performed.

### 2. Architectural decisions

Strict Zod schemas map onto the existing ModellingAPI query, batch, execute,
diagnostics and enclosure interfaces. The adapter owns no geometry, transaction,
rollback or history implementation. All edits retain revision checks and engine
admission. Explicit Bake commands are available; no implicit Bake. Connectors and
recipes retain standalone atomic engine transactions. Part inspection uses the
read-only bounded diagnostics interface, including optional evaluated primary-part
STL topology. Tool names and supported command types in MCP capability results
come from the registered schema catalog; shared layer/array constants supply those
limits. Existing transport and production import boundaries were retained.

### 3. Build and test results

Initial baseline verification completed format/lint, strict TypeScript, build and
all engine tests; localhost MCP tests were sandbox-blocked (EPERM). Unrestricted
verification then passed all 1,584 existing tests. Expanded focused tests passed
11/11, with the connector assertion also passing in the full suite. Actual Chromium plus official
stdio MCP passed named-reference dry-run/commit, live Boolean subtraction, part
assignment, evaluated STL diagnostics, single Undo, ordinary Redo after disconnect,
approval/read-only/stale revision controls and normal/production isolation. Final `npm run check` passed Biome format/lint (348 files, 608 existing warnings,
96 infos, no errors), strict TypeScript, production build and **1,585/1,585 tests
across 94 files**, no failures/skips/cancellations. Diff whitespace check passed. Evidence logs:
`work/phase-7-3-1/centra-baseline.log`, `centra-check.log`, `centra-focused.log`,
`centra-browser.log`, `centra-final3-check.log`; browser screenshots remain
under ignored `work/phase-7-3/`.

### 4. Benchmarks and regressions

No new performance benchmark or headset measurement. Inspection invokes existing
bounded geometry/export work and can hit bridge deadlines or engine resource
ceilings. Source-cache dry-runs remain distinct from evaluated sampled STL checks.
The 16-layer limit does not increase memory or geometry budgets. Existing automated
coverage retains cancellation rollback, editor replacement, source locks/visibility,
stale revisions, authenticated loopback admission and capacity enforcement.

### 5. Known limitations and blockers

Physical printer fit and Quest acceptance remain unverified. No general wall
thickness, self-intersection or material certification. Evaluated topology requires
a printable part; bounds are conservative and fit uses a bounded SDF sampler.
Radial radius is controlled through source offset/pivot; no separate array gap
parameter exists. Group duplication, selection-only batch commands, connectors in
batches and nested enclosure recipes remain unsupported. No Phase 7.2 constraints,
WebMCP, remote networking, cloud services or automatic project-save tool.

### 6. Next recommendations

Review the published `tools/list` schemas and capability result in Codex/Cursor,
exercise representative multi-part models and validate exported results in the
intended slicer. Print clearance coupons before claiming fit. Run physical Quest
acceptance separately. Keep this integration optional and development-only.


2026-11-06 publication: user explicitly authorized committing and pushing Phase 7.3 local MCP access, approval-panel refinements, automatic session discovery, 16-layer capacity and Move/Rotate/Scale tools. This supersedes earlier no-commit statements for this publication. Physical Quest and printed-fit acceptance remain pending.

## Agent discovery, 16 layers and transform tools — 2026-11-06

### 1. What changed

MCP now discovers the current development session automatically when launched with just the adapter script; no temporary path needs copying into client configuration. Temporary credentials still rotate, connection approval defaults to read-only and editing remains explicit. Added dedicated `move_object`, `rotate_object` and `scale_object` tools. Raised the shared independent-layer cap from 8 to 16 across native save/load, admission, connectors, Bake, desktop and VR menus and API limit reports. Existing uncommitted Phase 7.3 work retained; no commit/push/merge.

### 2. Architectural decisions

`agent-session.mjs` publishes an atomic mode-0600 pointer under ignored `work/agent-session.json`; it contains only the temporary session path. MCP rereads discovery/credentials on each call, so the same process can follow a Vite restart; explicit session arguments remain supported. Cleanup checks pointer ownership. Isolated browser tests override discovery so they do not replace the user's live-session pointer. Multiple agent Vite instances in one checkout discover the most recently started; explicit paths support isolation. No persisted approval or static authentication token. Normal editing remains independent.

Move accepts world translation in mm/cm/in and `by` (default) or `set`. Rotate accepts XYZ degrees and `by` (default, quaternion composition in world axes about the object's origin) or `set`. Scale sets absolute world scale. Each preserves other pose components and delegates to the existing revision-checked modelling batch, preserving admission/locks/Undo. Multi-operation single Undo still uses full transform commands in `apply_changes`. Layer count increases without increasing memory, voxel or triangle budgets or changing the native schema.

### 3. Build and test results

Final `npm run check` passed Biome format/lint (348 files; 608 warnings / 96 infos / zero errors), strict TypeScript, production build (1.75 s), and **1,584/1,584 tests across 94 files**, no failures/skips/cancellations, 79.92 s command wall. Evidence: `work/phase-7-3/expansion-final-check.log`. Focused MCP **10/10** passed; enclosure/headless capacity suites **40/40** passed (14.53 s); quick smoke **21/21** passed. Actual browser smoke passed with no temporary-file argument, testing auto-discovery, Move and 30-degree Rotate, physical/source dimensions, stable IDs, Undo to the original scene, dismissal/reopen, disconnect/ordinary Redo, shutdown and normal/production isolation. Evidence: `expansion-focused.log`, `expansion-capacity.log`, `expansion-quick.log`, `expansion-browser.log`. Diff whitespace check passed.

Initial full run exposed two older fixtures expecting eight-layer capacity; updated those to the 16-layer boundary. Recipe fixture now creates three complete enclosures (16 total layers with the original Base), round-trips natively, rejects a fourth recipe without changing bytes, and restores all three through Undo/Redo. Browser fixture now checks primitive dimensions separately from rotated world-axis bounds. Discovery regression verifies rotating credentials, pointer permissions and older-session cleanup preserving a newer pointer. Native 16-layer regression rejects layer 17 without history changes.

### 4. Benchmarks and regressions

No headset frame/performance claim. Existing 256 MiB admission and project voxel/triangle budgets remain; 16 large grids may still refuse. Complete tool, geometry, export, recovery, persistence and VR regressions pass. Vite retains the existing bundle-size advisory. Production has no adapter listener or credentials.

### 5. Known limitations and blockers

Restart agent Vite once to load the discovery publisher and expanded bridge schemas, then refresh the MCP client once for the new tools/configuration. Later Vite sessions need browser approval but no configuration path change. Old app versions with an eight-layer cap refuse projects above eight layers; use the newer app to open them. Single recipe-root duplication remains unsupported; multiple independently created recipes now fit. Physical Quest and printed-fit acceptance remain pending. Explicitly configured old session paths do not auto-discover; omit the session argument.

### 6. Next recommendations

Try Move/Rotate against a deliberate local scene, retaining browser approval/write controls. Configure Codex/Cursor once using the script-only examples in the updated MCP guide. Keep WebMCP, Quest synchronisation, pairing indicators, cloud relay, Phase 7.2 associative features and Phase 7.4 agent planning as future work.

## Local agent approval polish — 2026-11-06

### 1. What changed

Restyled approval in the editor's warm neutral/green palette. Removed the introductory paragraph and connected-status row; a header check-circle carries connection status with hover text. Close collapses the panel to a compact launcher without revoking access; reopening retains permission state. Editing uses a compact switch and revocation remains explicit. Errors explain wrong origin, ownership or unavailable bridge.

### 2. Architectural decisions

Presentation stays in the optional browser adapter and dev-only `agent-access.css`. Existing approval, read-only/write grants, cancellation and modelling execution are unchanged. Status remains available to assistive technology; dismissal is separate from revocation.

### 3. Build and test results

`npm run check` passed formatting/lint (608 warnings / 96 infos / zero errors), strict TypeScript, build and 1,581/1,581 tests across 94 files, 81.47 s test command wall. Final icon CSS also passed a subsequent production build (2.40 s). Quick suite passed 21/21. Real-browser MCP smoke passed, including dismiss/reopen, permission changes, editing, Undo, disconnect and production isolation. Actual panel screenshot visually inspected. Evidence: `work/phase-7-3/approval-final-check.log`, `approval-build.log`, `approval-browser.log`, `approval-quick.log`, `browser-created.png`. Diff whitespace check passed.

### 4. Benchmarks and regressions

No geometry or performance claim. All existing modelling and persistence regressions pass; production excludes the optional panel and CSS.

### 5. Known limitations and blockers

Dismissal lasts for the current page lifetime. Development-only POC restrictions remain. Prior uncommitted Phase 7.3 work is retained. No commit, push or merge.

### 6. Next recommendations

Try the compact controls locally; hover the indicator for connection details and reopen via the lower-left launcher. WebMCP, Quest synchronisation, pairing indicators and cloud relay remain future possibilities.

## Phase 7.3 handover — Local Agent Access (MCP), 2026-11-06

### 1. What changed

Implemented an optional development-only stdio MCP server using the official SDK and strict Zod tool schemas. Codex/Cursor can inspect the approved active browser scene, list/get stable objects and mm dimensions, create/update basic primitives, transform objects, create Phase 7.1 enclosures, dry-run supported batches, apply one-action transactions and Undo. `npm run dev` starts ordinary Vite without agent access; `npm run dev:agent` starts Vite and a temporary authenticated browser bridge reachable by the machine's `.local` hostname. The MCP client starts the separate stdio process using the printed session-file path. A browser panel requires connection approval, defaults to read-only, and offers explicit editing permission and revocation. Full setup/tool contracts/errors/removal: [local MCP guide](PHASE_7_3_LOCAL_MCP.md).

Reviewed the current Phase 7.0 command/query/transaction implementation, Phase 7.1 recipes, package scripts, Vite configuration and this status before editing. Phase 7.2 face-relative cutouts/mounting/named constraints remain unimplemented. Active checkout `/Users/brettjames/development/vrappPOC`, starting HEAD `b7a7b5b`; initial Git status was clean. The Documents workspace is empty. No commit, push or merge performed.

### 2. Architectural decisions

Transport and permissions live in removable `scripts/agent-*.mjs`, `src/agent-access.ts` and `src/agent-browser.ts`; the modelling engine, commands, history and codecs are unchanged. Browser writes call existing `ModellingAPI.batch` / `api.enclosure.create`; Undo calls the authoritative editor history. The adapter resolves the current editor on every request, including after native project replacement. Existing revisions, leases, admission, cooperative cancellation, locks/visibility, calibration and history remain authoritative. Supported batches are deliberately limited to primitive create/update and object transform. Dry-run is source-cache staging with provisional IDs and currently requires the existing API's editing grant. There is no new agent planner or final mesh certification.

The bridge listens on all interfaces for LAN access but validates a current machine hostname or private LAN IP and the matching browser Origin, and uses distinct random 256-bit browser/MCP bearer credentials. MCP credentials are in a private temporary directory / mode-0600 session file; the browser credential comes from a dev-only virtual module. Approval/write grants are memory-only. One approved browser tab, one in-flight operation, 64 KiB bodies, 64-command batches, 10-second browser deadline, 12-second bridge timeout and 15-second MCP HTTP timeout. Heartbeat expires after 2.5 seconds. Revocation/disconnect/timeout drops queued work and aborts cooperative operations; expired results cannot execute new work. Production replaces the agent enable constant with false, eliminating the browser module. SDK/Zod/Playwright are development dependencies. No agent metadata or credentials are stored in native `.form` files, no manual-save tool is exposed, and normal recovery/autosave follows ordinary editor changes.

### 3. Build and test results

Baseline `npm run check` passed formatting/lint, strict TypeScript, production build (**1.77 s**) and **1,574/1,574 tests across 93 files** (81.05 s command wall, 80.98 s test duration). Evidence: `work/phase-7-3/baseline-check.log`. First full integration run passed 1,579/1,580; its new lock test incorrectly assumed layer flag controls produced a history entry. Corrected the fixture to restore flags through their existing controls. Log retained as `integration-v1-check.log`.

Final `npm run check` passed Biome format/lint (**347 files; 603 existing warnings / 96 infos / zero errors**), strict TypeScript, production build (**2.01 s**) and **1,581/1,581 tests across 94 files**, no failures/skips/cancellations; **82.53 s** command wall. Evidence: `work/phase-7-3/final-check.log`. Focused `npm run test:agent` passed **7/7** (0.81 s wall), including actual official stdio SDK client/server subprocess interaction. Negative coverage includes disabled/unapproved access, invalid credentials/origin/schema/oversize, read-only writes, competing editor/request, stale revision, busy editor/lease, aborted/expired work, cancelled-generation byte-exact rollback, locked/hidden sources, late results, disconnect/shutdown and credential/listener cleanup. It also verifies one Undo for a multi-command batch, preserved IDs/mm dimensions and current-editor replacement. `git diff --check` passed.

Real-browser `npm run test:agent:browser` passed with installed Chromium (revision 1234 via explicit executable override), Playwright 1.65.0 and isolated profile on port 5197. It starts actual agent Vite and stdio MCP; verifies approval/read-only, live scene identity, box creation, visible transform, editor row, 20 × 30 × 40 mm inspection, update to 24 mm width, stale rejection, Undo back to the original scene, MCP disconnect and ordinary UI Redo. It then verifies Vite shutdown closes the bridge/removes credentials, normal Vite does not load agent modules, and production JS contains neither credentials nor adapter/SDK markers. Earlier smoke fixture failures (icon-prefixed Redo locator and release-note text matching an overly broad production marker) were corrected; final evidence: `work/phase-7-3/browser-smoke.log`, `browser-created.png`, `browser-disconnected-redo.png`. Existing user recovery records were not restored/discarded. Localhost test binding and browser launch required running outside the filesystem/network sandbox; the initial sandbox-only focused run reported EPERM and the authorized rerun passed.

### 4. Benchmarks and regressions

No geometry or headset performance claim. Source sampling, compositor, physical units, native persistence, exports, tools/controllers, skybox and passthrough are unchanged and retain full regression coverage. The bridge adds polling only in explicitly enabled development mode. Normal startup and production isolation were exercised, not inferred. Vite retains its existing bundle-size advisory. The agent-created box was visually inspected in the real editor screenshot beside the original sphere.

### 5. Known limitations and blockers

Local development POC only: no LAN/public/cloud endpoint, per-client identity/grants, multi-tab collaboration, native file writes, remote geometry engine or physical Quest acceptance. All local MCP clients holding the session credential share the browser-approved grant. MCP session paths change on each Vite startup and must be refreshed in client configuration. Background-tab throttling can revoke the heartbeat. Heavy operations can exceed the deliberately short deadline. A transport failure after commit may lose its response; inspect the current scene/revision before retrying. SIGKILL of an idle MCP process cannot send revocation; explicitly revoke the shared browser grant. Forced Vite termination may leave an inert private credential file, with no running listener. Recipe and API resource/printability limitations remain. Actual Codex/Cursor configuration examples were checked against official documentation; automated interoperability uses the official SDK stdio client, not a manually configured Codex/Cursor session.

### 6. Next recommendations

Try the documented Codex/Cursor configuration against an intentionally enabled local session and review writes in the browser. Revoke access before switching tasks, and keep manual project saves explicit. Preserve Phase 7.2 associative cutouts/mounting/named constraints and Phase 7.4 agent plan-preview-apply. WebMCP, Quest synchronisation, pairing indicators and cloud relay are future possibilities, not implemented features. Physical Quest/slicer/printed-fit acceptance remains separate. No authorization to commit, push or merge is implied.

2026-11-06 publication: user authorized committing and pushing the completed enclosure work, panel polish and existing validated project-library/export/menu refinements. This supersedes earlier no-commit statements for this publication. Physical Quest and printed-fit acceptance remain pending.

## Enclosure panel polish — 2026-11-06

### 1. What changed

Added a descriptive heading tooltip and small info indicator. Grouped desktop fields into Inside size, Walls & base and Lid, each with shared mm units and three compact columns. Added outside base dimensions (width × depth × height), segmented new/edit controls and primary styling that follows Preview changes → Apply changes. Cancel appears during preview/work. Full accessible field labels and keyboard focus styles remain available.

### 2. Architectural decisions

Presentation changes are scoped to `enclosure-ui.ts` and `.enclosure-*` CSS. Existing parameters, draft hydration, revision guards, source previews, transactions and exports are reused unchanged. No new geometry or persistent schema.

### 3. Build and test results

`npm run check` passed Biome format/lint (603 warnings / 96 infos / zero errors, 339 files), strict TypeScript, production build (1.60 s) and **1,574/1,574 tests across 93 files**, no failures/skips/cancellations; test wall 78.14 s. Log: `work/phase-7-1/polish-check.log`. Browser visual inspection verified the grouped fields, heading help, mode states and a depth draft 20 → 28 mm updating the outside summary to 30 × 34 × 17 mm. Existing recovery checkpoints were left untouched. `git diff --check` passed.

### 4. Benchmarks and regressions

No engine/sampling/controller changes or new performance claim. Existing enclosure and full regression suites retain geometry, persistence and interaction coverage.

### 5. Known limitations and blockers

Heading tooltip uses the existing native title pattern. Physical Quest and printed-fit acceptance remain pending. Existing uncommitted changes are preserved; no commit/push/merge.

### 6. Next recommendations

Retain 7.2 face-relative cutouts/mounting/named constraints, 7.3 secure local MCP and 7.4 agent plan-preview-apply. Continue physical acceptance separately.


## Enclosure editing follow-up — 2026-11-06

### 1. What changed

Simplified desktop/VR copy to Enclosure, Name, Preview changes, Apply changes and Edit selected enclosure; removed the repetitive physical-fit message from these controls. Loaded enclosures bind to their existing pair when the panel opens or a project is replaced. Update previews now draw the new source outlines in the parts' saved transforms, so an inside-depth edit is visible before applying it. Final application still prepares the independent evaluated assembly view.

### 2. Architectural decisions

Retained draft/preview/confirmation and the existing one-action transaction. Inspection now permits additional root Boolean operations after the original base cavity/lid lip operation, and additional part members. Rebuild modifies only the five generated sources and root intent; added cutter parameters, transforms, IDs, parents and modifier ordering stay intact. The original cavity/lip structure must remain first and enabled. This supports manually positioned USB-style openings without introducing the Phase 7.2 associative face constraints.

### 3. Build and test results

Focused enclosure suite passed 17/17, including added visible-update-outline and USB-style subtraction/persistence/resize/Undo cases. Final `npm run check` passed Biome formatting/lint (603 warnings / 96 infos / zero errors, 339 files), strict TypeScript, production build (1.58 s) and **1,574/1,574 tests across 93 files**, no failures/skips/cancellations; test wall 79.98 s. Log: `work/phase-7-1/followup-check.log`. Connected-browser smoke on isolated port 5193 imported/opened the native example, automatically selected update mode, changed inside depth 20 → 24 mm, displayed the 30 × 17 × 30 mm preview, applied one Undo action, rebuilt the view and completed autosave. `git diff --check` passed.

### 4. Benchmarks and regressions

No source field, sampling algorithm, calibration, export scale, controller guide, Tool Wheel or skybox changes. Added preview geometry is presentation-only and excluded from part export. Existing finite/resource/admission limits remain. No new performance claim; see the Phase 7.1 host benchmark below.

### 5. Known limitations and blockers

Pre-apply lines show source solids/cutters; Apply changes displays the actual Boolean result. Port cutters retain their placement when the enclosure changes size, so check their position after moving a wall. Physical Quest/slicer/printed-fit acceptance remains pending. All prior uncommitted work is retained; no commit or push.

### 6. Next recommendations

Verify the simpler flow on Quest in both handedness settings and check port placement in the target slicer. Preserve 7.2 face-relative cutouts, mounting patterns and named constraints; 7.3 secure local MCP; 7.4 agent plan-preview-apply.


## Phase 7.1 handover — Parametric Enclosure & Removable-Lid Recipes

Updated 2026-11-06. Active Git checkout `/Users/brettjames/development/vrappPOC`, HEAD `bb86df6`; Documents workspace remains empty. Reviewed current status and Phase 7.0 transactions/commands, Phase 6.6 assembly/fit, 6.3 live Booleans, 6.2 primitives, 6.1 precision and 5.3 STL semantics against implementation. Initial Git status had 14 modified tracked files plus `src/export-feedback.ts` and `src/project-library-ui.ts`; all retained, including ongoing library/export/menu refinements. No commit, push or merge performed.

### 1. What changed

Added reusable typed `api.enclosure.create/update`, pure dimension planning/outer-to-inner conversion, structured `enclosure.inspect` and actual-SDF `enclosure.samples` queries. A friction-fit recipe generates an open-top hollow base and separate removable lid, with an overlapping hollow lip ring and positive configurable per-side clearance. Five editable rounded-prism sources and three ordered live CSG operations retain the complete parameter intent. Default base is 30 × 17 × 26 mm; lid is 30 × 7 × 26 mm. No board-specific dimensions, screw fastening or universal physical-fit claims.

Desktop **Enclosure recipe** and Quest **World Settings → Measure & Precision → Primitives → Enclosure recipe** use the same staged controls and command API. Stage validates isolated source caches, provides a dimension review and unpickable wire sources for new recipes; confirmation applies one transaction and builds independent assembly preview. Existing root transforms permit independent base/lid manipulation. Explicit rebuild preserves root orientation/scale and placement offsets while recomputing sizes/mating height. Invalid/stale/cancelled work cannot publish partial source changes; controller changes/tracking loss cancel VR staging. Native saves, real worker recovery and Project Library/Save As copies retain editable intent. Added runnable `example:enclosure` and `benchmark:enclosure` scripts. See [complete semantics/API](PHASE_7_1_ENCLOSURES.md).

### 2. Architectural decisions

Recipes expand into Phase 7.0 primitive/transform/Boolean/parenting/part metadata commands under its backend lease and compound rollback/history. Intent is validated optional printable-part metadata on each root; there is no second geometry graph or cross-part recipe ID list. Existing hierarchy/Boolean references therefore remap on Library duplication. Native v16 is required only for recipe or rounded-prism current/original parameters; legacy codec paths remain intact. Single-root duplication of a recipe part rejects and directs users to Library project duplication, avoiding references into the original private part. Full five-source recipe copies in one scene would exceed the existing eight-layer limit.

Box sources optionally support an analytic rounded XZ rectangle extruded along Y, including zero-radius square corners and thin plates up to 128:1 aspect. Legacy box SDF evaluation/cache values and ordinary 8:1 primitives remain unchanged. The existing compositor evaluates actual source distances, nested difference and union. New rounded-prism sampling distinguishes curvature from thickness, targets six samples across source/planar subtraction thickness, and deterministically staggers its padded grid to avoid symmetric Float32 zero-vertex seam collapse. No source transform/physical-size mutation occurs. Existing sample/memory/triangle caps, revision guards and cooperative scheduling remain. Admitted rounded meshes can skip redundant preliminary chunk compaction while retaining final quality optimisation and actual STL topology validation. Parent-transform history now stores exact local poses, including no-op/cancel restoration, fixing byte-level Undo/rollback drift exposed by recipe updates.

### 3. Build and test results

Baseline `npm run check` passed Biome format/lint (**599 warnings / 96 infos / zero errors**, 333 files), strict TypeScript, production build (**1.95 s**) and **1,557/1,557 tests across 92 files**, zero failures/skips/cancellations; test wall **85.78 s**. Log: `work/phase-7-1/baseline-check.log`. Intermediate full integration passed **1,569/1,569** (88.17 s), before the final export/inspection/controller cases. Final `npm run check` passed Biome formatting/lint (**601 warnings / 96 infos / zero errors**, 339 files), strict TypeScript, production build (**2.48 s**) and **1,572/1,572 tests across 93 files**, zero failures/skips/cancellations; test wall **92.18 s**. Log: `work/phase-7-1/final-v3-check.log`. Final quick smoke **21/21** passed; `git diff --check` passed.

New deterministic tests cover finite/radius/rim/lip validation and malformed cycles, negative-inside rounded SDF, open cavity/floor/walls, nested lip union and positive overlap, clearance changes, coherent updates and outer-size conversion, stable part identity/independent transforms, isolated dry-run, rollback/retained redo/one Undo/Redo, cancellation during source generation, explicit source edits without Bake, locks/rewired structure, native v16/legacy rejection, actual recovery worker and Library duplication, structured queries/sparse thickness sections, bounded VR keypad targets and controller reassignment/tracking loss for both tool hands. Actual final binary STL bounds/topology tests cover rounded and tall square-corner examples, unequal longest dimensions at common 200 mm/unit calibration and excluded presentation geometry.

Desktop connected-browser smoke test on isolated localhost port 5191 verified Stage → Confirm create, separate Base/Lid sources, one Undo action, saved recipe edit from 0.3 to 0.6 mm clearance, second one-action confirmation and completed autosave. Browser automation backend was unavailable, so the connected in-app browser was used. Existing recovery checkpoints were not restored/discarded. Physical Quest testing remains pending.

### 4. Benchmarks and regressions

Host Node **v26.8.1**, **Apple M5 Pro**, two warmups plus five observations: create median/p95 **104.118 / 125.213 ms**, isolated dry-run **112.239 / 118.214 ms**, update **119.083 / 124.776 ms**. Five-sample p95 is the maximum observed. Maximum tracked source/history runtime memory in this fixture: **9,590,770 bytes**; excludes JS/process/GPU peaks. Single High STL observations: base **1,969.65 ms / 114,468 triangles**, lid **1,055.00 ms / 63,762 triangles**. Both report one component, zero boundary/non-manifold/winding/degenerate/inverted counts, expected mm dimensions within Float32 tolerance and **0.5 mm** sampling spacing. A 0.3 mm nominal clearance is explicitly flagged below that spacing.

Evidence: `work/phase-7-1/benchmark.json`, `benchmark-final.log`, `example-final.log`, focused/full check logs. `npm run example:enclosure` also writes the normal editable `example/enclosure.form`, `base-mm.stl`, `lid-mm.stl` and companion print reports under that directory. Host timings are not headset frame/thermal measurements. Source fields, calibrated support-guide profiles, Studio Skybox/Passthrough and main Tool Wheel Cut implementation were not changed by this phase. Existing regression suites cover these paths. Vite retains its existing bundle-size advisory.

### 5. Known limitations and blockers

Friction-fit lip only; screw-on lids, snap undercuts, seals, board mounting and face-relative cutouts are deferred. Dry-run validates source caches, not final Boolean mesh topology or physical printability. Export validates the actual final Float32 STL and refuses an enclosure unless it has one closed, consistently wound manifold shell. This still does not establish self-intersection freedom, global minimum walls, target-slicer success or printer/material fit. Thickness queries probe only four central sections (512 midpoint samples each) and can miss local defects. Changing calibration follows existing project-wide reinterpretation; saved recipe mm intent does not silently change with it.

Large/thin enclosures can exceed existing grids, 300,000 STL triangles or 256 MiB admission. A source recipe can be valid while a particular export quality refuses. New preview shows wire sources, not a certified evaluated mesh; update staging provides a dimension/source-cache review. Confirmation and subsequent display evaluation are distinct: a failed/cancelled derived preview retains the committed recipe and Undo. Existing GLB scopes remain available; new per-part GLB packaging is not implemented. Library project duplication is supported; a single scene cannot contain two complete five-source recipes under the eight-layer limit. No MCP server/transport/authentication/remote execution is installed. Physical Quest 3, slicer and printed-fit validation remain pending.

### 6. Next recommendations

Complete Quest acceptance in both handedness settings: menu/keypad ownership, cancel/tracking/session interruption, source/part editing, save/recovery/Library duplication, downloads, guide clearance, Cut, Studio/Passthrough and sustained resource/frame behavior. Inspect both mm STLs in the intended slicer and print a clearance coupon before choosing a real printer/material tolerance. Preserve **7.2 face-relative cutouts / board mounting patterns / named constraints**, **7.3 secure local MCP**, and **7.4 agent plan-preview-apply**; secure connector work must build on the existing revision/transaction boundary. No authorization to commit, push or merge is implied.



## Phase 7.0 handover — Headless Editing, Transactions & Inspection

Updated 2026-11-06. Active Git checkout `/Users/brettjames/development/vrappPOC`; Documents workspace remains empty. Read the existing status, Phase 6.2.1 API contract, workflow and current primitives/live Booleans/arrays/hierarchy/assembly/export/history implementation before editing. Phase 6.6 has working parts, fit sampling, mating, connectors, independent preview/export and persistence regression tests; physical Quest, target-slicer and printed-fit acceptance are still pending. Initial Git status contained 14 modified tracked files and two new files for export/library/UI work; all retained. No commit, push or merge performed.

### 1. What changed

Extended the existing `ModellingAPI` with ordered `batch` transactions, named prior-result references, isolated dry-run, group creation, parent/flag editing and supported layer duplication. Existing primitive/transform, live Boolean, array, printable-part, deletion and explicit Bake operations remain the modelling engine. Added detached hierarchy/assembly/bounds/diagnostic metadata and an explicit asynchronous geometry diagnostic method reusing sampled fit and actual part STL topology validation. Array inputs can specify physical units while retaining earlier fixed-mm compatibility. Batch reports identify created/modified/deleted IDs, source dimensions and validation limitations. The runnable Node enclosure example saves a native `.form` project with editable box/cylindrical subtraction and reports geometry diagnostics.

### 2. Architectural decisions

A backend lease blocks ordinary human/API mutations, inspection and autosave readiness during real batches, including cooperative yields. Existing compound history retains child deltas/runtimes as one Undo/Redo action; rollback replays retained backend entries under that lease, restores selection/view and keeps older metadata/voxel redo. Fixed compound selection restoration and retained-runtime cleanup ordering. No full-project rollback copy or separate agent scene model is introduced. Editor-scoped revision tokens still observe human metadata/history/calibration changes; stale batches fail before mutation. A closed editor discards its disposed runtimes; in-flight work returns structured failure without publishing into a replacement editor.

Dry-run constructs isolated metadata/hierarchy/display/runtimes and borrows existing fields read-only. A deliberate command allow-list excludes future field-writing commands and nested connector/read/selection actions. Temporary state is disposed on success, failure or cancellation; concurrent authoritative edits invalidate the preview. This evaluates source caches/resource checks, not final Boolean topology. The existing native codec/library/recovery metadata remains authoritative, with no new project version or transport. Future connector schemas should map onto the exported API types and retain revisions, host policy and cancellation.

### 3. Build and test results

Baseline `npm run check` passed Biome format/lint (598 warnings / 96 infos / zero errors), strict TypeScript, production build (1.89 s) and **1,534/1,534 tests across 91 files**, no failures/skips/cancellations; test-command wall **84.26 s**. Log: `work/phase-7-0/baseline-check.log`. Focused headless tests pass **23/23**; strict TypeScript passes; quick checks **21/21**. Final `npm run check` passed Biome formatting/lint (**599 warnings / 96 infos / zero errors**, 333 files), strict TypeScript, production build (**1.82 s**) and **1,557/1,557 tests across 92 files**, no failures/skips/cancellations; test-command wall **84.27 s**. Log: `work/phase-7-0/final-v3-check.log`. The example startup directory-creation change additionally passed its scoped Biome check and a real clean-directory Node save/diagnostic run (`example-check.log`, `example-clean-directory.log`). `git diff --check` passed.

New deterministic cases cover JSON/detached queries, explicit mm/cm units, primitive edits, Boolean edits, array update/removal, grouping/parenting/duplication, assembly/native persistence, batch success/failure and native-byte rollback, inherited locks/visibility, source and Boolean/array Bake, cancellation before/during preparation, stale requests/previews, cross-adapter lease contention, autosave readiness, retained deleted-runtime Undo/Redo, source views/selection, calibration changes during asynchronous work, earlier metadata/voxel redo and nonempty mask/paint invariance. Geometry tests use actual STL topology and sampled fit. Existing full regression suites retain library/recovery, export and human interaction coverage.

### 4. Benchmarks and regressions

Host Node **v26.8.1**, **Apple M5 Pro**, two warmups plus nine observations of the six-step editable enclosure fixture: batch median **30.327 ms / p95 35.497 ms**, dry-run **31.672 ms / p95 36.709 ms**; 1,000 scene-list queries plus JSON serialization per observation averaged **0.02056 ms/query median**. Nine-sample p95 is the maximum observed sample. Live tracked source/runtime memory after the fixture: **2,550,296 bytes**. Raw final benchmark: `work/phase-7-0/benchmark-final.json`; script `npm run benchmark:headless`. These are host CPU/source-runtime estimates, excluding process/JS/GPU peak memory, headset frame rate/thermals and printing.

The standalone Node example also completed native save and actual sampled STL topology validation: one connected component, no boundary/non-manifold edges or degenerate triangles. Its clean-directory single-run elapsed time was **1,934.88 ms**, including dry-run, batch, save and diagnostics; this is not a statistical export benchmark. Evidence: `work/phase-7-0/example-clean-directory.log`. Existing Vite bundle-size advisory remains (main **1,561.01 kB / 442.41 kB gzip**). No rendering, sculpt SDF algorithm, controller calibration or export sampling semantics were intentionally changed.

### 5. Known limitations and blockers

No external connector, MCP server, network listener, remote execution, provider credentials or browser bridge is installed. Local policy callbacks/lease methods are trusted host internals, not authentication. Nested connector generation is explicitly excluded from batches; run its existing standalone command. Group duplication/type conversion/parameter patches/progress subscriptions and persisted revisions remain deferred. All fields must be edited through the backend, not by mutating raw project objects.

Dry-run geometry is source-cache validation; live CSG/array dimensions remain source-only or conservative and STL evaluation can later refuse a mesh. It does not guarantee geometric validity, physical printability, minimum walls or board-specific fit. Topology reports are exact only on the sampled exported mesh; general self-intersection/material/wall/physical-fit checks remain unsupported. Bounds require a layer root; group metadata can report descendant dimensions. Existing eight-layer/16-instance-array/sample/aspect/resolution/triangle/256 MiB limits remain; dry-run additionally refuses editors already tracking more than 128 MiB. Resource tracking excludes JS/GPU/process peaks. Browser Project Library, autosave workers, thumbnails and download UI still require the browser. The Node example is an editable hole fixture, not a verified Raspberry Pi enclosure. Physical Quest/slicer/printed-fit acceptance remains pending.

### 6. Next recommendations

Use [the documented local API](MODELLING_COMMANDS.md#phase-70--transactions-dry-runs-and-inspection) as the integration boundary for later secure local tools. Add authentication/authorization, consent and audit only in a separately scoped connector milestone; preserve exact revisions, structured errors and AbortSignals and never expose raw editor/lease methods. For real enclosures, obtain board dimensions and print constraints, model body/lid as separate marked parts, evaluate/export each, check target slicer dimensions and print clearance coupons. Complete the existing Quest and Phase 6.6 physical checklists before claiming hardware release readiness.

## Progressive array scaling follow-up — 2026-11-06

Added recurring Scale per item (%) to desktop linear/radial arrays and XR presets, preserving the setting through other array edits. Copy i uses factor^i around its own centre before placement; 90% produces 100/90/81/72.9%. Source geometry/pose stay unchanged. SDF distance scaling, bounds, minimum feature sampling and radial gap support account for each copy's size. Native v15 is used only for non-default progressive arrays; legacy arrays default to 100% and lower-version tagged scaled files are rejected. See [semantics and limits](PHASE_6_5_ARRAYS.md#progressive-scale-2026-11-06).

Browser verified the 90% field survives Tab and creates four visibly diminishing radial boxes. Focused arrays passed 14/14, including actual sampler sizes for linear/both radial orientations and 90/100/110%, native/recovery/library/history, validation, scaled gap, binary STL proportions/topology and Bake geometry. Full `npm run check` passed formatting, lint, strict TypeScript, production build and **1,529/1,529 tests across 91 files** (82.78 s test command); quick 21/21. Logs: `work/phase-6-5/array-scale-final-check.log`, `array-scale-tests.log`; screenshot `array-progressive-scale.jpg`. Existing quality/memory/Bake limits remain. Physical Quest acceptance is pending. No commit or push for this follow-up.

## Array state controls follow-up — 2026-11-06

Desktop toggle now displays Array enabled/Array disabled, exposes aria-pressed, highlights enabled state and offers the opposite action in its tooltip. Corrected the toggle handler to invert the persisted enabled flag. Remove array is a compact × with tooltip/accessible name. Browser verified disable/re-enable, remove and Undo. Final `npm run check` passed format/lint, strict TypeScript, build and **1,525/1,525 tests** (84.12 s test command); quick 21/21. Evidence: `work/phase-6-5/array-state-final-check.log` and `array-state-controls.jpg`. No commit or push for this follow-up.

## Radial array gap and draft editing follow-up — 2026-11-06

Desktop radial arrays now expose Gap between copies (mm), using directional source bounds to adjust the existing pivot while retaining source pose, mm calibration and inherited uniform scale. Linear-only fields are hidden for radial mode. Draft array fields survive routine refresh and Tab/blur; metadata/selection changes hydrate committed values. The action is Create array or Update array according to the selected source. See [gap semantics and limits](PHASE_6_5_ARRAYS.md#desktop-spacing-follow-up-2026-11-06).

Browser QA created four boxes at 5 mm gap, edited to 15 mm, tabbed away, updated and verified changed pivot/geometry plus one Undo entry. Final `npm run check` passed formatting, lint, strict TypeScript, build and **1,525/1,525 tests across 91 files** (82.63 s test command); focused arrays 10/10, quick 21/21. Logs: `work/phase-6-5/radial-spacing-final-check.log` and `radial-spacing-tests.log`; screenshot `radial-gap-update.jpg`. Physical Quest acceptance remains pending; these new gap controls are desktop-only. No commit or push for this follow-up.

## One-tap assembly export follow-up — 2026-11-06

Desktop current/all part export now reserves the export operation and shows progress before awaiting recovery or geometry. Duplicate taps cannot start overlapping jobs. Requests arriving while assembly preview/connector preparation is pending await that action instead of silently returning; cancellation, disposal and project replacement discard queued work. Tests exercise both export scopes during an unfinished preview and cancellation before completion. Browser verified one click starts each scope with evaluated assembly view active. Final `npm run check` passed format/lint, strict TypeScript, build and **1,523/1,523 tests across 91 files** (85.28 s test command). Quick suite 21/21; focused queue/cancellation cases 3/3. Logs and screenshot: `work/phase-6-6/one-tap-final-check.log`, `one-tap-regressions.log`, `one-tap-export.jpg`.

## Assembly recovery and export follow-up — 2026-11-06

Saved assembly-view intent now rebuilds after native open/recovery; the desktop top-level preview toggle supports older files. Selection no longer invalidates derived assembly caches. Boolean STL/GLB export uses an independent compositor under a nested display-cache eviction lease, with sequential part export and preview restoration. Analytical feature sampling, bounded chunk planar compaction and exact Float32 seam retriangulation let the stock connector fixture pass unchanged final topology validation at High quality. Reports include effective Boolean spacing. Source fields, physical calibration and Undo history remain authoritative; existing quality/memory limits still apply. See [implementation and measured fixture](PHASE_6_6_ASSEMBLY.md#preview-recovery-and-export-reliability-2026-11-06).

Validation: final `npm run check` passed formatting, lint, strict TypeScript, production build and **1,520/1,520 tests across 91 files**, zero failures/skips/cancellations (test command 91.12 s). Quick suite passed 21/21. Browser QA restored an actual recovery checkpoint into a fresh page with evaluated socket geometry, completed High batch export, restored preview after export, retained preview across layer selection, and downloaded each STL individually. The browser accepted the first batch file but blocked subsequent automatic downloads; individual export verified both files. Screenshots: `work/phase-6-6/recovered-assembly-export.jpg` and `recovered-preview-controls.jpg`. Logs: `reliable-boolean-final-check.log`, `reliable-boolean-quick.log`, `export-stock-high.log` under the same directory. Physical Quest and slicer/printed-fit acceptance remain pending.

## Phase 6.6 handover — Print-Fit & Assembly Tools

Updated 2026-11-05. Active checkout `/Users/brettjames/development/vrappPOC`; the Documents workspace is empty/non-Git. Read current status/guidance and reviewed the Phase 6.5 array changes, precision/parent transforms, surface snapping, live Boolean graph, command boundary and STL validation before editing. Initial checkout had uncommitted Phase 6.5 work in 17 tracked files plus its four new files; all retained. Controller guide calibration files were not edited. No commit, push or merge performed.

### 1. What changed

Added named printable parts using existing layer roots and hierarchy membership. Assign/detach existing objects while retaining world pose; select/rename/position/show/lock through existing layer controls. Desktop **Assembly / Fit** and VR **World Settings → Measure & Precision → Primitives → Assembly / Fit** share commands, numeric fields/keypads, A/B selection, fit inspection, mates, editable peg/socket generation and part exports. Cut remains on the main wheel. Explicit assembly preview evaluates each part independently, showing its live Boolean result without unioning different components.

Fit reports approximate separation, sampled interference, nominal clearance, inspection resolution and bounded candidate collision points in mm, with explicit below-resolution and physical-fit warnings. Added centre/bounding-face/axis mates with offsets and optional normal matching. Connectors use existing parametric cylinders and live union/difference, remain editable, and support existing source duplication/arrays. Generation is one compound history action with rollback. Part STL export preserves project calibration, offers existing Fast/Standard/High quality, validates binary topology and supplies companion print reports. Standard desktop current/all STL buttons route marked-part projects to this path; deliberately unified export remains explicit. See [complete semantics and physical checklist](PHASE_6_6_ASSEMBLY.md).

### 2. Architectural decisions

Native v14 adds a validated root marker/nominal clearance to layer metadata. Part membership is the existing hierarchy, not a second graph; IDs and links therefore use existing portable/library/recovery remapping. Legacy formats remain readable. Validation rejects nested parts, malformed markers, hierarchy/Boolean cycles and cross-part Boolean edges; unassigned shared operands remain explicit shared dependencies. Parent-aware setters and existing source fields remain authoritative.

Inspection uses a fixed 32³ lattice plus nearby gradient-projected SDF surface probes, cooperative work checks and at most 32 candidate points. Results are explicit/cache-only and marked stale by revision; no per-frame fit remesh occurs. Independent preview/export caches reuse the existing compositor, resolution/sample quotas and memory accounting. A source-currentness callback cancels stale cache builds at cooperative checks. Compound history traverses retained child entries for resource disposal, capacity and runtime replacement. Existing sculpting, array, Boolean, snap and render paths are reused.

### 3. Build and test results

Baseline `npm run check` passed Biome format/lint, strict TypeScript, production build and **1,462/1,462 tests across 89 files**, test-command wall **37.88 s**. Final documentation-inclusive `npm run check` passed format (323 files), lint (**576 warnings / 95 infos / 0 errors**), strict TypeScript, production build (**2.19 s**) and **1,483/1,483 tests across 90 files**, zero failures/cancellations/skips; test-command wall **51.31 s**. Fast workflow passed **21/21**. `git diff --check` passed. Existing >500 kB Vite advisory remains (main bundle **1,497.80 kB / 422.44 kB gzip**). Logs: `work/phase-6-6/baseline-check.log`, `assembly-tests.log` and `final-check.log`.

Twenty-one new assembly cases cover membership and independent fields, parent transforms/locks/visibility, physical units and gaps/overlap/thresholds, explicit normals and mating history, peg/socket CSG, source arrays/duplication, atomic generation (including full metadata-history retention) and failure rollback, native v14/legacy/portable duplication, actual recovery worker roundtrip, malformed persisted nesting/cycles, actual STL dimensions/topology/quality, command revisions/permissions, VR control bounds for both hand configurations, cache cleanup and in-flight abort/stale exports. The browser verified desktop disclosure, numeric controls, defining a part, updated selection and Undo. Physical XR was unavailable; logical both-hand coverage is not hardware acceptance.

### 4. Benchmarks and regressions

Added `npm run benchmark:assembly`; raw output `work/phase-6-6/assembly-benchmark.json`. Host Node **v26.8.1**, two warmups plus nine 32³ inspections: **24.325 ms median / 31.394 ms p95**. A nominal **0.5 mm** box gap measured **0.4995 mm**, effective inspection resolution **1.5323 mm** (the clearance warning applies). One independent 20 mm cube STL export took **171.177 ms**, emitted **36,960 triangles** and reported **20 × 20 × 20 mm**. This is a host CPU probe; export is a single sample, not a statistical benchmark. It does not measure Quest GPU, frame time, RSS, thermal behavior or sustained hardware performance.

Existing baseline tests, including handedness/Support shortcuts, controller guides, Studio/Passthrough/reference plumbing, arrays, history and sculpting, passed the full suite. New resource tests verify rejected stale/cancelled work retains source fields and disposed preview caches stop contributing tracked memory. No physical printer or slicer acceptance is inferred from fixture topology reports.

### 5. Known limitations and blockers

**Physical Quest 3 acceptance is pending.** Fit is approximate, can miss thin collisions and cannot guarantee physical fit. Bounding-face mates use conservative world-aligned bounds for curved/sculpt/array/trimmed CSG shapes; API normal matching supports supplied surface normals, while the UI matches local axes and the existing interactive snapping workflow remains available. No general CAD face solver or contact constraint system is introduced.

Existing eight-layer, aspect-ratio, 192³, 64M sample and STL 300,000-triangle/256 MiB limits can refuse fine connectors on large bodies. No silent quality reduction occurs. Connector sources are independently editable rather than automatically linked parameter pairs; apply matching arrays to both. Geometry must actually intersect its intended body, and reports may identify disconnected shells. Separate STLs are independently recentered and retain calibrated dimensions, not assembly placement. Batch downloads may partially complete before a later refusal; verify browser multiple-file delivery. Part preview is transient and exits on edits/view changes. Older applications cannot read v14.

### 6. Next recommendations

Complete the [Phase 6.6 physical Quest 3 checklist](PHASE_6_6_ASSEMBLY.md#physical-quest-3-checklist--all-pending): both hands, Support shortcuts and guide offsets; Studio/Passthrough/lighting/references; fit warnings/markers and interruption/cancellation; nested transforms/mating/snapping; source arrays/history and budget refusals; Project Library/Save As/portable recovery; actual browser STL/report downloads, target slicer dimensions and printed clearance coupons; sustained headset GPU/frame/thermal/resource testing. These checks remain pending and no release approval is implied. Further fit accuracy or automatic connector-pair parameter links should preserve the existing bounded evaluator and independent part boundaries.

### Desktop Delete shortcut follow-up — 2026-11-05

Delete or Mac Backspace now removes the selected desktop layer through `deleteObject`, retaining its runtime, geometry and hierarchy history for Cmd/Ctrl+Z and Redo. Child layers remain in place. This shortcut requires an unmodified initial key press; typing in form/contenteditable fields, repeated keydown, reference editing, immersive XR, modal dialogs and busy project operations do not trigger deletion. Existing last-layer, locking and Boolean operand protections remain. Added the shortcut to Controls & Shortcuts and a dated What's New entry. A 2.5-second viewport toast now says “Only one layer — nothing to delete” or “Layer deleted”; subsequent messages reset its timer, and page exit clears it. Other deletion refusals also appear briefly. Existing button/VR deletion behavior is unchanged. No commit or push performed.

Validation: three new shortcut tests cover actual geometry/hierarchy Undo/Redo for Delete and Backspace, input/modifier/repeat/busy guards and protected deletion refusals. Focused **3/3** and quick **21/21** passed. Final `npm run check` passed Biome format/lint (576 warnings / 95 infos / 0 errors), strict TypeScript, production build (2.29 s) and **1,486/1,486 tests across 91 files**, zero failures/cancellations/skips, 54.49 s test-command wall. `git diff --check` passed. Log: `work/phase-6-6/desktop-delete-check.log`. Toast follow-up validation: `npm run check` passed format/lint (577 warnings / 95 infos / 0 errors), strict TypeScript, production build (2.25 s) and **1,486/1,486 tests**, zero failures/cancellations/skips, 53.22 s test-command wall; quick checks **21/21** and `git diff --check` passed. Log: `work/phase-6-6/desktop-delete-toast-check.log`. Physical keyboard interaction in Quest is outside this desktop-only change.

### Project Library contrast follow-up — 2026-11-05

Scoped dark button colours to the desktop Project Library, including Close, project rows and action buttons. Hover/keyboard focus now retain light text on a dark green fill; pressed and disabled states use explicit readable colour pairs. Disabled controls keep muted text without the global 40% opacity. The library no longer inherits the pale workspace hover fill. Existing keyboard focus outline and library actions are retained; the open Save As form/draft is preserved during the CSS update. No commit or push performed. Browser verification confirmed the open Save As draft is intact and highlighted buttons retain light labels. Calculated text contrast: default **11.20:1**, hover/focus **7.86:1**, pressed **5.36:1**, disabled **6.47:1**. Quick checks **21/21** passed. Final `npm run check` passed Biome format/lint (577 warnings / 95 infos / 0 errors), strict TypeScript, production build (2.35 s) and **1,486/1,486 tests across 91 files**, zero failures/cancellations/skips; test-command wall **73.71 s** with the live demo running. `git diff --check` passed. Log: `work/phase-6-6/project-library-contrast-check.log`; screenshot: `work/project-library-contrast.jpg`.

### Interactive Assembly / Check fit follow-up — 2026-11-05

Replaced the crowded desktop A/B workflow with **Assembly → Check fit → tap first layer → tap second layer**. Fit checks ordinary layers read-only without defining printable parts. A compact canvas card displays the prompt/result and Cancel/Dismiss; desired gap and accuracy information are in a disclosure, with immediate below-resolution warnings. Peg/socket, alignment and parts/export have separate collapsed sections, and connector/alignment pairs use the same two-tap picker. Intentional connector/alignment operations can establish missing part roots within their Undo transaction. The main VR page is similarly reduced to Check fit and subpage entries; existing precision/Cut/Support controls remain.

Input is captured before desktop edits. Desktop scene and layer-list selection share validation, while VR Tool-trigger selection works for both hands with release-to-arm, held-press ownership, menu suspension and tracking/controller-change cancellation. Existing part children/unique consumed operands resolve to their result; ordinary layers can include descendants and CSG dependencies. Hidden, duplicate and parent/child pair picks are refused; inspection may read locked layers. Picking and checking do not modify source fields or model history. Hover bounds are transient and throttled to 20 Hz. Cancellation/project replacement/revision checks prevent stale publication, and preview/marker resources are disposed. No new project schema or MCP server was added. No commit, push or merge performed. Focused assembly tests passed **28/28** (seven new interaction cases), quick checks **21/21**, and final `npm run check` passed Biome format/lint (**580 warnings / 95 infos / 0 errors**), strict TypeScript, production build (**2.41 s**) and **1,493/1,493 tests across 91 files**, zero failures/cancellations/skips; test-command wall **64.33 s**. Existing Vite bundle advisory remains (main **1,510.61 kB / 425.97 kB gzip**). `git diff --check` passed. Browser verification checked real scene taps, actual Layers-list name clicks, Escape cancellation, automatic canvas results and unchanged 24 source triangles / zero Undo entries. The visible list uses a sibling palette rather than the legacy hidden list, so capture is attached to the containing layers panel. Screenshot: `work/phase-6-6/interactive-fit.jpg`; logs: `interactive-check.log` and `interactive-tests.log` in that directory. Physical Quest 3 usability and readability remain pending.

### Surface connector placement follow-up — 2026-11-06

Continued the interactive simplification with **Peg & socket → Place peg & socket → tap peg layer → tap socket layer → tap joint face**. Basic controls are diameter, total cylinder length and radial clearance. Socket sizing is derived automatically unless the user deliberately overrides Advanced sizes; numeric centres/rotations remain in Advanced. A reusable wire preview follows evaluated SDF surfaces, matches a facing socket surface even on separated components and converts placement into explicit model-mm centres/orientation. The socket body is temporarily an outline while placing, without changing saved visibility. Model fields/history remain unchanged until the final tap. Creation uses the existing one-action generator transaction, now with an optional independent socket centre. Interactive creation prepares an evaluated assembly preview; failure of that later cache does not misreport source creation as rolled back.

The new bounded helper caches prepared SDFs, uses finite bounds and at most 96 advancement steps per surface plus gradient queries, and follows the existing 20 Hz hover cap. It respects ray reach, workspace/parent transforms and physical units. Misses, Boolean-removed material, non-facing/overlapping surfaces and hidden/locked targets are refused. Tracking/controller changes before confirmation, Escape, cancellation and project replacement clear uncommitted placement/preview state; stale job tokens cannot publish into another project. Native schema and legacy command defaults remain unchanged. No commit, push or merge performed.

Focused assembly tests pass **36/36**, including eight new placement cases for gap/contact/mm calibration, transformed groups/workspace normals, source misses/locks/live CSG, no-edit hover and cancellation, independent anchors/native persistence/actual socket STL, automatic and manual sizing, third-trigger ownership for both hands, and cancellation rollback. A host-only Node v26.8.1 cached-field probe over two 20 mm boxes separated by 10 mm measured **0.0193 ms median / 0.0415 ms p95 / 0.2762 ms max**, 1,000 queries after ten warmups. This is a simple fixture, not worst-case or physical Quest/GPU performance. Raw data: `work/phase-6-6/connector-placement-benchmark.json`. Final `npm run check` passed format/lint (581 warnings / 96 infos / 0 errors), strict TypeScript, production build (3.64 s) and **1,501/1,501 tests across 91 files**, zero failures/cancellations/skips, 100.18 s test-command wall. Quick tests passed **21/21** and `git diff --check` passed. Browser QA completed the actual three-tap workflow on two separated blocks, confirmed one Undo entry and the creation message, then restored the joint from recovery and verified evaluated socket geometry. Layer names now truncate with full-name tooltips, with CSG status on its own row to avoid vertical text in the narrow sidebar. Proof: `work/phase-6-6/surface-connector.jpg` and `work/phase-6-6/surface-connector-layout.jpg`. Logs: `work/phase-6-6/surface-connector-check.log` and `work/phase-6-6/surface-connector-tests.log`. Physical Quest acceptance and printed clearance validation remain pending.

### Interactive desktop primitive creation preview — 2026-11-06

Expanding Primitives in Create new mode now shows an unsaved wire preview at model origin with the existing UniformTransformControls size handles and shared `scaledPrimitive` rules. Box axes edit width/height/depth; cylinder X/Z edit diameter and Y edits height; sphere axes edit diameter. Dragging updates dimension fields without source regeneration; draft numeric input updates the ghost live. Create publishes through the existing primitive transaction, produces one Undo entry and switches to Edit selected with existing scale handles. Source editing now exposes its temporary dimensions to the same numeric panel during a drag. If the selected object is not a primitive, opening the panel enters Create new mode. Assembly’s top-level disclosure now inherits the same 16 px regular typography as Primitives.

The draft lives outside layer/compositor/export sources, follows presentation transforms and reuses its geometry while sizing. Escape, pointer cancellation, modal/XR suspension, lifecycle interruption, collapse and project replacement roll back a pending drag. Project replacement closes the panel. The preview owns desktop sizing input so sculpt/Tube/source gizmos cannot also edit the model; XR placement retains its existing workflow. Invalid sizes retain the last valid ghost. Disposal removes the controls, listeners, mesh and material. No schema changes or commit/push/merge.

Six new headless cases cover all three source shapes, unchanged native snapshots/history/export sources during sizing, cancellation and suspension, workspace transforms/geometry reuse, one-step Create Undo/Redo and replacement during a drag. Focused primitive tests: **34/34**. Browser QA dragged a box from 50 mm to 95.51 mm width with height/depth unchanged, typed cylinder dimensions of 60 × 80 mm, dragged only its height to 123.67 mm, then created it with one Undo entry and the existing editing handles. Proof: `work/phase-6-6/primitive-draft-preview.jpg`. The completed primitive-preview check passed formatting/lint, strict TypeScript, production build and **1,507/1,507 tests across 91 files** (94.58 s test-command wall). Quick checks passed **21/21**. Combined final verification also includes the default connector preview regression below. This is desktop-only; physical Quest acceptance is unchanged.

### Stock connector assembly preview fix — 2026-11-06

Reproduced the user’s two default 50 mm boxes with stock 4 mm diameter / 6 mm length / 0.3 mm clearance connector. Source generation succeeded, but the assembly preview rejected `stats.capped`; the fine source lattice on the small connector forced the derived grid to its maximum. Trying to display that pair at 192³ also exceeded the existing one-million-triangle budget. Assembly display now uses bounded 128³ caches per independent part and treats resolution capping as a display approximation, returning effective millimetres per voxel in its successful status. Existing sample, triangle, memory, cancellation and revision checks remain enforced. Source geometry, connector sizes, native data, history and strict export quality checks are unchanged. This fixes the display workflow; it does not guarantee printable tolerance or remove export quality refusals for fine features over large bounds.

The new regression exercises the former capped refusal, checks that both independent results install, raycasts the actual socket cavity, verifies no preview history and checks Undo cleanup. Focused assembly tests: **37/37**. Browser QA used two 50 mm boxes at 63³ with no preassigned parts, stock connector settings and the three-tap flow; it completed with **“Peg and socket created — Undo is available. Preview detail: 0.43 mm.”** and one Undo entry. Screenshot: `work/phase-6-6/default-peg-preview-fixed.jpg`; fixture: `work/phase-6-6/demo/default-box-fit.form`. Final combined `npm run check` passed format/lint (585 warnings / 96 infos / 0 errors), strict TypeScript, production build (3.85 s) and **1,508/1,508 tests across 91 files**, zero failures/cancellations/skips, 106.10 s test-command wall. Quick checks **21/21**, final docs formatting and `git diff --check` passed. Logs: `work/phase-6-6/default-peg-check.log` and `work/phase-6-6/default-peg-tests.log`. No commit, push or merge performed.

### Compact desktop Bake dialog — 2026-11-06

Reduced the Bake visible Boolean result dialog from 530 px to 430 px maximum width and removed world-bound coordinates, visible-source/grid-memory estimates, the intro and the source-recovery paragraph. The default view contains name, output resolution, hide-sources choice and actions. Two-layer Union remains available through a collapsed “Merge two layers instead” option; expanding it chooses the existing pair scope, while collapsing returns to the visible result. A short detail note appears only for undersampling, and a short overlap note only when sources stay visible. Existing plan/capacity checks, bounds preview, bake transaction and error blocking remain. No new tests were added for this reversible presentation change. Browser QA verified the compact default, pair mode, empty-name blocking and returning to the visible-result mode. Screenshot: `work/phase-6-6/compact-bake-dialog.jpg`. Validation: quick **21/21**; final `npm run check` passed format/lint (583 warnings / 96 infos / 0 errors), strict TypeScript, production build (2.47 s) and **1,508/1,508 tests across 91 files**, no failures/cancellations/skips (87.77 s test-command wall). `git diff --check` passed. Log: `work/phase-6-6/compact-bake-check.log`. No commit, push or merge performed.

### Undoable live CSG source deletion and compact panel — 2026-11-06

Referenced source layers can now be deleted using the desktop Delete/Backspace shortcut, Delete layer or the new Delete source action in a Live Boolean Shapes row. Incoming enabled and disabled Boolean uses are detached automatically. The existing retained-runtime hierarchy entry now carries the affected modifier stacks and byte accounting; Undo inserts the original source before restoring references, while Redo detaches references before removing it. A single history action restores source fields, hierarchy/world placement, selection and all original incoming operations. Other modifiers and the paired connector half remain untouched. Source/consumer visibility and inherited locking checks run before mutation. Failure restores metadata, hierarchy, selection and the existing redo branch. This does not change the protected low-level irreversible remove or Cut paths.

The layer Delete button now uses the undoable backend rather than deleting layer history; the obsolete permanent-delete confirmation dialog was removed. The former Remove action is labelled Remove from result to distinguish unlinking from deleting. Removed both the Target/modifier-order heading and the explanatory source/viewport/export/Bake paragraph from Live Boolean Shapes at the user’s request. No native schema changes or commit/push/merge.

Three new regression cases cover deletion of each generated connector half and actual SDF effect, shared/disabled references with preservation of unrelated operations/native reload, and locked-target/injected-removal failure with retained redo. Updated the existing shortcut and irreversible-removal tests for the new intended behavior. Focused **61/61** tests passed. Browser QA verified Delete source on a peg, Delete layer on the restored peg, Mac Backspace on the socket cutter and one-step Undo restoring each operation. A fresh-page check confirmed both helper paragraphs are absent. Screenshot: `work/phase-6-6/live-csg-delete-clean.jpg`; fixture: `work/phase-6-6/demo/delete-connector-demo.form`. Final `npm run check` passed format/lint (581 warnings / 96 infos / 0 errors), strict TypeScript, production build (2.40 s) and **1,511/1,511 tests across 91 files**, no failures/cancellations/skips, 69.69 s test-command wall. Quick **21/21**, final docs formatting and `git diff --check` passed. An earlier loaded-browser run exhausted the unchanged XR stamp test’s bounded drain loop; it passed after temporary test tabs closed. A lower-concurrency rerun passed that test but tripped the runner test that assumes the default four; the final successful check used normal settings. Logs: `work/phase-6-6/csg-delete-check.log` and `work/phase-6-6/csg-delete-tests.log`.

## Phase 6.5 handover — Radial Repetition and Arrays

Updated 2026-11-05. Active checkout `/Users/brettjames/development/vrappPOC`. Read the current status plus Phase 6.4, 6.3, 6.2 and 6.2.1 handovers and reviewed the working tree/source before editing. Initial status was clean on `main` at `a5f7ce5`. This handover supersedes the earlier Phase 6.4 next-phase recommendation. No commit, push or merge performed.

### 1. What changed

Added editable linear and radial repeat definitions to modelling objects, available from desktop Primitives/Array and VR **World Settings → Measure & Precision → Primitives → Array/Repeat**. Set count (1–16), linear spacing in millimetres, axis/direction, optional centred distribution, radial total angle (up to 360°), angular offset, pivot and rotate/retain orientation. The VR panel offers count presets (4/6/8/12/16), spacing/arc presets and pivot-to-selected-object-centre; desktop exposes numeric fields. Existing Tool Wheel Cut is unchanged. Enable/disable, source visibility, edit, remove and explicit **Bake** are available. Changes to a source evaluate through its linked instances; setup/edit/remove and Bake participate in Undo/Redo.

Implemented the reusable command surface `array.create/update/remove/list/get` plus `array.bake`, with scene revision checks and structured refusals. Unit-bearing command values use millimetres; stored transforms use model units. Native `.form` version 13 stores array metadata; prior versions remain readable, and library duplication remaps array IDs. Derived GLB/STL exports include evaluated arrays; live Boolean subtraction can use an array as an operand so repeated cutters produce holes without separately exporting visible cutters. See [Phase 6.5 semantics and acceptance checklist](PHASE_6_5_ARRAYS.md).

### 2. Architectural decisions

The definition is attached to its authoritative `SdfLayer` object (which may already be a primitive, tube or sculpt layer); instance transforms are evaluated by the existing compositor sampler. No per-instance voxel buffer or second modelling engine is created. Radial full-circle positions omit the duplicate endpoint; partial arcs include endpoints. The pivot is expressed in model space, and the normalized axis is in the source object’s local frame. Orientation either rotates with the radial transform or retains the source orientation. Linear offsets use the source local axis; centred mode distributes offsets symmetrically about zero. Parent/group matrices remain applied by existing scene hierarchy transforms.

The same evaluated derived result is used for preview, Boolean operands, export and explicit independent Bake. Array definitions retain stable IDs through edits and use existing history transactions. One array definition is supported per object; nested array chains are explicitly unsupported. An array-bearing object may be used as an existing live Boolean operand. Invalid/missing references, invalid vectors, duplicate IDs, out-of-range count/spacing/angles and stale revisions return structured errors. Per-object count is capped at 16 and estimated compositor sample work at 64M; an over-budget derivation is refused instead of reducing quality. Cooperative scheduler and stale-result checks are reused.

Array sampling transforms coordinates against the source sampler, so changing the source updates all instances without cloning its volume. Display handles/ghost state are transient and remain outside the source geometry and exports. SDF meshing remains bounded by existing resolution/triangle policies; it is print-oriented sampled geometry, not exact CAD. Nested arrays and arbitrary transform matrices are not supported; radial axes accept a normalized XYZ vector.

### 3. Build and test results

Baseline `npm run check` passed Biome format/lint (**555 warnings / 94 infos / 0 errors**), strict TypeScript, production build and **1,454/1,454 tests across 88 files**, test-command wall **36.74 s**. Final `npm run check` passed format (317 files), Biome lint (**570 warnings / 94 infos / 0 errors**), strict TypeScript, production build (**1.65 s**) and **1,462/1,462 tests across 89 files**, zero failures/cancellations/skips; test-command wall **37.96 s**. `git diff --check` passed. The existing Vite >500 kB advisory remains (main bundle 1,468.85 kB / 414.18 kB gzip). New array regression tests add eight cases.

Focused array tests cover 4/6/8 radial counts, full/partial arcs, axis/pivot/orientation, linear counts and physical units, source propagation, API revision/history, native/recovery/legacy, duplicate IDs, evaluated GLB/STL dimensions, explicit Bake Undo/Redo and four repeated Boolean subtraction holes with binary STL print diagnostics. See the final check report and benchmark below for exact results.

### 4. Benchmarks and regressions

Added `npm run benchmark:arrays`; raw results: `work/phase-6-5/array-benchmark.json`. Host-only Node v26.8.1 run: nine measured passes of 40,000 prepared source-SDF queries after two warmups, plus one cooperative mesh build per count. Count 4 sampler median/p95 **4.323/4.916 ms**, composite wall **1,007.337 ms**, max sampling/meshing slice **3.012/5.895 ms**, tracked **23,974,336 bytes**, 65,632 triangles at resolution 134. Count 8 sampler median/p95 **9.234/11.044 ms**, composite wall **1,641.001 ms**, max sampling/meshing slice **3.080/6.320 ms**, tracked **28,709,056 bytes**, 131,392 triangles at resolution 134. The probe is CPU-only and does not measure Quest GPU, frame time, peak process RSS or thermal behavior. This build is heavier for more instances; large repeated results can take seconds to regenerate, though cooperative scheduling bounds normal slices.

### 5. Known limitations and blockers

**Physical Quest 3 acceptance is pending.** Host tests do not establish controller comfort, readability, GPU frame rate, thermal behavior or long-session stability. Verify both hands, grip/stick mapping, calibrated controller guide, Studio Skybox and Passthrough, UI ray ownership, preview disposal, save/recovery and print output on device. Array preview/export are sampled SDF results with existing quality caps. Per-layer maximum is 16 and the derived work quota can refuse large source bounds/counts. Nested arrays, arbitrary radial transform matrices, arbitrary per-instance overrides and direct sculpting of an array source are not supported; explicitly Bake to sculpt the evaluated result. Paint/mask fields remain on the source and are not instance-specific. Existing Cut and surface snapping behavior are retained by using the shared layer/compositor paths.

### 6. Next phase — 6.6 Print-Fit & Assembly Tools

Build print-fit and assembly helpers on the evaluated object/Boolean/export paths: fit clearances and tolerances, mating alignment, hole/fastener sizing, assembly annotations and dimension-aware diagnostics. Keep all generated geometry editable until the user explicitly bakes it, preserve physical mm calibration and add actual STL geometry/slicer-oriented validation. First complete the pending physical Quest 3 checklist above.

## Phase 6.4 handover — Surface Snapping and Alignment

Updated 2026-11-05. Active checkout `/Users/brettjames/development/vrappPOC`; baseline `git status` was clean on `main` at `a5f7ce5`. Read this status, `PHASE_6_3_LIVE_BOOLEANS.md`, `MODELLING_COMMANDS.md`, current transform/reference/controller source and the referenced VR sculpting research handover before editing. Existing user work was therefore preserved. No commit, push or merge performed.

### 1. What changed

Added opt-in **Surface snap** controls to Transform options with freehand default, position-only or position-plus-orientation, local X/Y/Z axis, signed millimetre offset, normal flip and rotation about normal. Desktop pointer movement and the idle VR Tool ray preview candidates before a transform; active desktop gizmo drags and Tool-grip layer moves update the candidate point and normal with a mint arrow. Choose surface hits, scene axes/centre, or bounding-box faces/centre with a physical-millimetre target radius. Visible sculpt layers, eligible evaluated Boolean display meshes and visible STL reference meshes can be targets. Image references cannot. Existing Tool Wheel Cut remains first-class.

Snap settings use backward-compatible tool preferences and native/recovery snapshots; old saves default to Off. Transform release uses existing metadata history as one undo action. Geometry, dimensions, masks, paint, Boolean definitions and reference bytes/pose stay unchanged. Cancellation clears the transient candidate and uses normal transform rollback. See [Phase 6.4 semantics and physical checklist](PHASE_6_4_SURFACE_SNAPPING.md).

### 2. Architectural decisions

The reusable headless helper in `src/surface-snapping.ts` raycasts existing render meshes; it creates no SDF evaluator or second modelling engine. It interpolates vertex normals by triangle barycentrics, maps normals with inverse-transpose matrices and corrects mirrored triangle winding. Minimal-twist local-axis alignment handles near-parallel/antiparallel normals and explicit normal-axis rotation. Parent-space conversion uses the selected object’s actual scene parent matrix, so group transforms and presentation anchors are removed from saved coordinates. Position changes preserve the existing scale and primitive dimensions.

Self and selected-group descendants are excluded. Hidden, locked and inherited-ineligible sculpt layers are skipped; visible STL references remain explicit read-only targets even when locked. An evaluated Boolean mesh is offered only when the selected layer is not one of its operands. Desktop hover updates on pointer motion; the idle VR ray updates at up to 20 Hz. Scene targets are position-only; bounding-box targets use transformed world-aligned mesh bounds. Existing STL aggregate limits bound source triangle counts.

### 3. Build and test results

Final `npm run check` passed Biome formatting/lint, strict TypeScript, production build and **1,454/1,454 tests across 88 files**; Biome reported **555 warnings / 94 infos / 0 errors**. The production build took **1.82 s** and retained the existing >500 kB Vite advisory. Focused snap geometry and XR transform suites passed **19/19**.

New deterministic coverage checks indexed/non-indexed transformed and mirrored triangle hits with barycentric normals, mm offset conversion/contact-point placement, axis alignment at antiparallel cases, self/hidden filtering, target hysteresis, backwards-compatible preferences, unchanged SDF/remesh state and atomic transform Undo/Redo, plus XR Tool-ray preview and one-action release. Existing tests cover STL anchors, controller ownership/handedness, tracking cancellation, sessions and live Boolean history. Physical Quest acceptance remains pending.

Final `npm run check` passed Biome formatting, Biome lint (**555 warnings / 94 infos / 0 errors**), strict TypeScript, production build (**1.82 s**) and **1,454/1,454 tests across 88 files**, zero failures/skips/cancellations; test-command wall **36.60 s**. The existing Vite >500 kB bundle advisory remains. `git diff --check` passed. The benchmark JSON is in `work/phase-6-4/`.

### 4. Benchmarks and regressions

Added `npm run benchmark:surface-snap`, a deterministic CPU probe over one **100,352-triangle** static STL-like mesh with eight warmups and 100 raycasts. Node **v26.8.1** measured **2.387 ms median / 2.747 ms p95 / 3.161 ms max** in the final host run. Raw output is `work/phase-6-4/surface-snap-benchmark.json`; it does not measure headset/GPU time.

The integration adds no SDF or GPU resource per snap. The marker is one reusable ArrowHelper and is cleared on pointer exit, desktop completion/cancel and XR grip completion/cancel. `git diff --check` and final lint/type/build/full-suite outcomes passed as recorded above.

### 5. Known limitations and blockers

Physical Quest 3 use remains unverified. Bounding-box targets use transformed world-aligned bounds. The mesh ray query uses Three.js triangle raycasting without an added BVH; this host's p95 was 2.747 ms for 100,352 triangles and can scale with target triangle count. It is not a sustained 72/90 Hz Quest guarantee. Offset and target radius use the current project millimetres-per-model-unit calibration. Existing reference scale/anchor behavior is retained.

### 6. Next recommendations — Phase 6.5

Roadmap next: **Phase 6.5 — Radial Repetition & Arrays**, reusing the Phase 6.2.1 modelling command boundary and existing hierarchy/history transaction rules. Complete the Phase 6.4 physical checklist first: both controller hands, Studio/Passthrough, locked STL references in workspace/sculpture anchors, Boolean source/display eligibility, nested transforms, offset feel, grip/menu/tracking loss, save/recovery, and a sustained headset performance pass. No release approval is implied by host results.

## Phase 6.3 handover — Live Boolean Shapes & Cutting

Publication authorization (2026-11-05): user explicitly requested commit and push of the completed working tree, including the preserved Move test-budget fixes. This supersedes the earlier no-commit restriction for this work. Physical Quest acceptance remains pending.

Updated 2026-11-05. Active checkout `/Users/brettjames/development/vrappPOC`; Documents workspace is not Git-backed. Inspected current Phase 6.2/6.2.1 handovers, source, workflow and Git status before implementation. The initial working tree was clean; existing calibrated Quest controller-guide profiles, Studio Skybox, Cut wheel, thumbnails and quality tooling were retained. Concurrent Move-related edits appeared later in the shared checkout and were preserved, not reverted or reformatted. No commit, push or merge performed.

### 1. What changed

Added persistent editable target modifier stacks for Add/Union, Subtract/Difference and Intersect, with stable operation/source IDs, ordered semantics, enable/disable, operation changes, reordering, source selection and removal. Move/rotate/resize referenced primitive or compatible sculpt operands without rewriting source fields. Desktop **Live Boolean Shapes** and VR **Layers → target actions → Boolean order… → Live Boolean Shapes…** use the same backend; primitive placement/keypads and existing transforms remain authoritative. Layer rows identify live results and CSG sources. Explicit Bake creates independent sculpt geometry; Medium-inspired plane Cut remains a separate splitting tool.

Added revision-guarded headless `boolean.create/update/remove/bake/get/list` commands and detached graph/consumer metadata, native v12 persistence, recovery/library duplication reference remapping, derived-result thumbnails and current-result export routing. See [complete semantics and pending checklist](PHASE_6_3_LIVE_BOOLEANS.md) and [command contract](MODELLING_COMMANDS.md).

Desktop discoverability follow-up (2026-11-05): moved **Live Boolean Shapes** from the left sidebar into the selected layer’s Layers card, directly below its name. The disclosure retains its open state as selection changes and uses the same existing controls/backend. Group cards do not show primitive Boolean controls; desktop and VR modelling semantics are unchanged. Validation: `npm run check` passed Biome formatting/lint (554 warnings / 94 infos, zero errors), strict TypeScript, production build (1.49 s) and 1,433/1,433 tests across 87 files (31.03 s test-command wall). Log: `work/phase-6-3/layers-ui-check.log`. `git diff --check` passed.

Interactive transform follow-up (2026-11-05): source shapes now remain visible while moving/resizing live CSG and while the result refines, replacing the blank pending viewport. Desktop **Scale (R)** edits local primitive dimensions: Box X/Y/Z = width/height/depth; Cylinder Y = height and X/Z = diameter; Sphere any axis = diameter; centre = all dimensions. Sculpt layers/groups keep uniform transform scaling. Dragging uses only a borrowed display-mesh scale preview; release calls the same authoritative primitive regeneration once for one Undo action, with source fields/parameters/pose/history unchanged during preview. Escape, pointer cancel, lifecycle interruption and disposal cancel preparation. Numeric uniform-scale fields remain transform edits. Exact parented poses are preserved by closing the unchanged transaction without a world-to-parent rollback rewrite.

Follow-up validation: `npm run check` passed Biome formatting/lint (**555 warnings / 94 infos, zero errors**), strict TS, production build (**1.76 s**) and **1,444/1,444 tests across 87 files**, zero failures/skips/cancellations; test-command wall **39.28 s**. Log: `work/phase-6-3/resize-check.log`. Focused transform/CSG suites passed 51/51 before the final integration case; the completed transform/presentation subset passed 34/34. New tests cover all axis/type mappings, centre scaling, inherited rotated/scaled parents, unchanged fields/poses during preview, release-only parameter history, Undo/Redo, cancellation/invalid sizes, and live cutter outcome. A strict pose assertion exposed avoidable round-trip drift from cancelling an unchanged transform, fixed by closing it unchanged. The first new outcome fixture incorrectly included the starter sphere; it now hides that unrelated root and the complete suite passes. Browser real-pointer drag changed Box width **50 → 86.48 mm** with height/depth **50 mm**, retained uniform transform, one new Undo entry and no console warnings/errors. Screenshot: `work/phase-6-3/primitive-width-drag.png`. `git diff --check` passed. Physical Quest acceptance remains pending; dimension-handle changes are desktop-only.

### 2. Architectural decisions

`SdfLayer.booleanModifiers` is a persistent validated graph, distinct from old flattened layer preview order. The target's own field starts the left fold; each explicit source is sampled in its inherited world transform, including its own modifiers. Existing analytical primitive/sculpt evaluators and min/max compositor remain authoritative. Validation includes disabled edges, missing refs, stable-ID uniqueness, cycles, depth eight, 32-entry stacks, expanded traversal of 256 visits and supported uniform inherited scale. Existing eight-layer/resource constraints remain.

Enabled references consume independent source output, regardless of source eye state; hiding a result does not expose its cutters. Disabling/removing the last reference releases a source according to its eye. Boolean view shows a current completed mesh; Layers view deliberately inspects sources. Live-scene exports always use result geometry and reject selected-source requests, stale/pending, capped or overbudget output. Primitive feature size informs bounded sampling; analytical/world bounds include hidden dependencies and exclude empty dense fields. Conservative bounds can reject widely separated constructions.

Sampling/colour work cooperatively yields near 3 ms every 128 samples/vertices; extraction uses two chunks/3 ms. Preview debounces rather than rebuilding every drag frame. Metadata revisions, cancelled transforms, tracking loss/suspension, disposal and project replacement invalidate jobs. Pending result meshes hide until current, with source shapes shown during editing/refinement. Failed overbudget evaluation releases its cache. Per-command history is atomic; batches remain deferred. Source masks/paint stay intact, generated faces use the winning operand (including cutter walls), and new Bake masks start clear. Local visibility restoration fixes inherited-hidden Bake history. Native versions 1–11 remain readable; older apps reject v12 instead of losing the graph.

### 3. Build and test results

Baseline `npm run check`: actual Biome format/lint (**548 warnings / 94 infos, zero errors**), strict TS, production build (**1.80 s**) and **1,413/1,413 tests**, test-command wall **32.05 s**. Final `npm run check` passed actual Biome format/lint (**555 warnings / 94 infos, zero errors**), strict TS, production build (**1.67 s**) and **1,433/1,433 tests across 87 files**, zero failures/skips/cancellations; test-command wall **34.43 s**. Quick checks passed **21/21**, **0.59 s**. Logs: `work/phase-6-3/final-check.log`, `quick.log`. Existing Vite >500 kB bundle advisory remains. `git diff --check` passed. Intermediate failures (new test compiler registration, callback/import lint, test use of the existing `undo(true)` redo API, validation rollback identity and controller content-refresh timing) were corrected and rerun; no failing checks are omitted.

New host coverage includes sign/geometry, ordered stacks, cutter movement/resize, unchanged fields, rotated/scaled parent operands, empty intersection, invalid references/cycles/locks/non-uniform scale, atomic Undo/Redo, native malformed data, actual recovery worker, library/source duplication, headless parity/revisions, masks/paint provenance, quality/memory refusal, tracking suspension, stale export and disposal races. Actual encoded GLB and STL contain the bore; STL diagnostics confirm closed single-component geometry and calibrated 40 × 30 × 10 mm dimensions. Both logical controller hands exercise actual ray/trigger menu targets for create/toggle/remove/source selection and tracking cancellation. The existing complete suite retains Cut/layers/paint/masks/precision/controller/Skybox regressions.

Browser inspection on isolated port 5193 created the 40 × 30 × 10 mm box, defined subtraction, selected/edited the retained cylinder to 3 mm, rotated it 90° and showed the resulting hole. No console warnings/errors; original recovery records were not restored/discarded. Evidence: `work/phase-6-3/desktop-hole.png`. No physical Quest testing performed.

### 4. Benchmarks and regressions

`node scripts/benchmark-live-boolean.mjs` records three cutter relocations at caps 64/128/192 with a 64³ empty base; raw `work/phase-6-3/benchmark.json` and log. On Node v26.8.1, the 40 × 30 × 10 mm / 3 mm bore fixture used 112³ and 216,040 triangles at caps 128/192: **645.12–678.35 ms wall**, maximum sampling slice **3.05 ms**, extraction/colour slice **5.80 ms**, maximum combined tracked allocation **37,288,816 bytes / 35.6 MiB**. Cap 64 was detail-limited and correctly refused for live export. These are nine host observations, not statistically established p95, process RSS/GPU peaks or headset frame times. Single chunks and scheduling can exceed the soft 3 ms deadline. Source generation, physical units, parent transforms, explicit Bake, Cut and export validation keep existing engine paths.

### 5. Known limitations and blockers

**Physical release acceptance remains pending.** Completed-result preview refines after a pause and temporarily shows source shapes during pending work; fluid per-frame CSG mesh deformation is not claimed. Results are bounded sampled SDF geometry, not exact polygonal CAD; fine features need sufficient cap and conservative bounds may overestimate space. Selected-source export is intentionally unavailable for live scenes; choose visible/unified result. Headless target Bake uses 128³; insufficient detail rejects. Paint/base-colour provenance and unmasked new Bake results follow the documented rules. Referenced sources must be released before deletion/Cut. Locked sources must be unlocked before Bake hides them. No multi-command batches, worker CSG implementation or external agent transport added. Physical Quest timing/readability/thermal/GPU/long-session acceptance and intended-slicer inspection are still outstanding.

### 6. Next recommendations — 6.4 then 6.5

Complete the [Phase 6.3 physical Quest checklist](PHASE_6_3_LIVE_BOOLEANS.md#physical-quest-3-acceptance--all-pending), including both hands, Studio/Passthrough, source resizing/repositioning, group/visibility/locks, tracking interruption, saved/recovered results, paint/masks/Bake/Cut and actual slicer dimensions/bore. Recheck calibrated support-guide clearance and unchanged Cut wheel. Measure sustained headset frame/resource behavior before release approval.

Roadmap order: **Phase 6.4 — Surface Snapping / Alignment**, then **Phase 6.5 — Radial Repetition**. Retain the shared command/backend boundary and explicit non-destructive source ownership in both phases.

---


## Phase 6.2.1 handover — Agent-Ready Modelling Commands

Updated 2026-11-04. Active Git repository `/Users/brettjames/development/vrappPOC`; Documents workspace is not a Git checkout. Read current status/latest Phase 6.2 handover, agent workflow, testing infrastructure and authoritative primitive/transform/hierarchy/Bake operations. Baseline already contained uncommitted Phase 6.2 source, tests, docs and outputs; preserved them. Calibrated Quest 3 controller-guide profiles/offsets and Studio Skybox settings/code were not edited. No commits, pushes or merges performed.

### 1. What changed

Added a typed local `ModellingAPI` for `primitive.create`, `primitive.update`, `object.transform`, `primitive.bake`, `object.delete` and `object.rename`, plus `scene.summary`, `object.list`, `object.get`. Commands run without DOM events, pointer simulation or XR. Results contain stable authoritative IDs/names, an opaque scene revision and structured success/errors. All physical inputs require mm/cm/in; metadata uses mm with explicit radian rotation and dimensionless scale. Queries copy hierarchy, transforms, flags, primitive parameters and compact geometry/runtime metadata, never voxel/mask/paint buffers or mutable editor objects.

### 2. Architectural decisions

`src/modelling-api.ts` adapts existing `IndependentLayers` operations; it owns no modelling engine, SDF evaluator, persistence or transport. Source generation/Bake retain staged atomic publication, async cancellation and normal Undo/Redo. Transforms reuse existing transaction rollback. `deleteObject` adds retained-runtime leaf deletion using the existing hierarchy transaction/replay machinery and restores hierarchy on preparation failure; legacy destructive `remove` remains unchanged. Groups keep children/world poses when deleted. Existing precision dimension reading was extracted to UI-independent `object-dimensions.ts` and reused by both callers. UI tools remain intact; parity tests exercise their shared backend.

Mandatory revision guards use a compact editor-scoped token backed by the existing recovery identity plus physical calibration. Multiple adapters on one editor share it; a reopened editor gets a fresh scope. UI metadata/history/selection and calibration changes invalidate stale requests. Admission checks host policy, inherited visibility/locks and editor readiness; asynchronous work is serialized by the existing backend. No MCP server, browser listener, AI provider, external permission surface or global browser API was added. API contract/examples and Phase 7 extension points: `docs/MODELLING_COMMANDS.md`.

### 3. Build and test results

Baseline `npm run check` passed actual Biome formatting/lint (**548 warnings / 94 infos, zero errors**), strict TS, production build (**1.74 s**) and **1,400/1,400 tests**, test-command wall time **33.07 s**. Baseline log: `work/phase-6-2-1/baseline.log`. Quick tests passed **21/21**, **0.64 s**. Focused command suite passed **13/13**, **0.60 s**. Final `npm run check` passed formatting, Biome lint (**548 warnings / 94 infos, zero errors**), strict TS, production build (**1.75 s**) and **1,413/1,413 tests across 86 files**, zero failures/skips/cancellations; test-command wall time **34.04 s**. Final log: `work/phase-6-2-1/final-check.log`. `git diff --check` passed. Existing Vite >500 kB bundle advisory remains.

New deterministic tests cover detached JSON round trips and query read-only behavior, all three shape dimensions/units/calibration, rotated/nested local/world transforms, rename/edit/delete and stable IDs, Bake/source retention, inherited hidden/locked state and policy denial, Undo/Redo, failed transform/delete rollback with retained redo, stale/UI/calibration/editor-lifetime revisions, busy requests, cancelled creation/update/Bake, editor disposal during async preparation and UI/backend equivalence. Existing full tests continue to cover masks/paint, native saves/recovery, STL/GLB/exporter, primitives/SDF, calibrated controller guides and Skybox. An intermediate lint failure in a new test callback was fixed; a shape-switch test identified the existing same-type source requirement, now rejected explicitly as unsupported. No failing checks are hidden.

### 4. Benchmarks and regressions

Single host Node **v26.8.1** observation, empty 17³ base and 33³ fitted Box cache: create **44.28 ms**, update **28.06 ms**, Bake **32.63 ms**; 1,000 primitive `object.get` plus JSON serializations averaged **0.00935 ms**, result **635 bytes**. Each modelling operation had one sample, so no p95/scaling claim is made. JSON: `work/phase-6-2-1/benchmark.json`. Timings include cooperative CPU work, exclude browser/GPU rendering; no process/GPU peak-memory or Quest timing was measured. Primitive bounds are analytical; sculpt/tube/group queries scan committed mesh vertices and should not be polled per frame. Physical scale/STL overrides, native codecs, sculpt fields, input guides and rendering paths retain the Phase 6.2 semantics.

### 5. Known limitations and blockers

Atomicity is per command, not a multi-command batch. Primitive update supplies a complete same-type definition; patches/type conversion and custom creation names are deferred (rename is separate). Revision tokens are editor-lifetime optimistic guards, not saved project versions. Successful commands select their target; selection ownership changes also invalidate tokens. The optional policy callback is local admission logic, not authentication. Geometry bounds are null for nonprimitive objects while busy, zero for empty meshes; runtime status is editor-wide. Source limits/resource failures remain existing backend limits, reported as structured `operation_failed`. No progress stream, agent UI, network protocol or external integration is claimed. Phase 6.2 physical Quest acceptance remains pending; host correctness/perf does not establish headset release readiness.

### 6. Next recommendations — Phase 7 integration

- Bind adapter lifetime to the active editor; map future tool schemas to exported command/query types and carry exact revisions and AbortSignals through the host.
- Design external authentication, authorization, consent and audit logging only when adding an actual transport; keep that separate from the modelling backend.
- Add progress subscriptions, dry-run/planning and genuinely atomic batches only with their own transaction design/tests. Do not emulate batch rollback by repeated Undo.
- Migrate UI callers incrementally if useful, retaining command/UI parity. Do not bypass locked/hidden/admission checks or introduce a second engine.
- Complete the existing Phase 6.2 Quest 3 acceptance checklist before claiming hardware readiness.

---


## Phase 6.2 handover — Editable Parametric Primitives

Updated 2026-11-04. Repository `/Users/brettjames/development/vrappPOC`; the supplied Documents workspace was empty. Working tree was clean before editing. Read the complete existing status and verified Phase 6.1 physical-unit conversion, measurement picking, precision transactions, native/recovery persistence and STL override; reviewed tube regeneration/Bake, independent volumes, hierarchy, compositor, exports, thumbnail capture and XR trigger ownership. Quest 3 calibrated controller-guide profiles/offsets and Studio Skybox code are untouched. No commit, push or merge authorized or performed.

### 1. What changed

Added editable Box (width/height/depth), Cylinder (diameter/height) and Sphere (diameter). Desktop **Primitives** provides type selection, new/selected dimensions, origin creation, position, XYZ rotation, uniform scale, initial-dimension restoration and explicit Bake. Fields apply on change/Tab/Enter and cancel typing with Escape; invalid input reports an error. Existing precision controls select mm/cm/in. Dimension fields are layer-local; resulting analytic physical bounds include the saved inherited transform. Workspace zoom/navigation never enter these calculations.

UI refinement (2026-11-04): the desktop panel now starts in Create new with three SVG shape cards, a primary Create button, compact dimension fields and unit switch. Edit selected shows the layer name, physical bounds, a collapsed grouped transform disclosure, secondary Restore and explicit Bake. Source-only controls stay out of creation; pending edits disable controls and show updating feedback, while errors remain visible. Styling follows the existing sage studio palette and keyboard focus treatment. Browser verified creating a 35 × 50 mm cylinder, automatic transition to Edit selected, changing height to 60 mm and the resulting 35 × 60 × 35 mm bounds; no console warnings/errors. Existing recovery checkpoints were left untouched. Screenshot: `outputs/phase-6-2/primitives-ui-polished.png`. Engine/persistence/XR behavior is unchanged by this UI refinement.

VR: **Tool Wheel → World Settings → Measure & Precision → Primitives**. Choose a type, enter initial dimensions if desired, choose Place preview, release the Support menu, position the wireframe 25 cm along the Tool ray, adjust proportional size with the Tool stick and release/tap Tool trigger to confirm. Reopen the Support menu and choose Cancel placement to cancel. The preview hides and disarms during menu ownership, grip interactions, tracking/connection loss and pending work. Trigger release rearms it; the bridge chooses the configured logical Tool hand for either handedness. Exact dimensions use a numeric keypad; Edit selected primitive returns to the selected source, and Exact position / rotation / scale opens the Phase 6.1 keypad. Cut's ten-sector wheel layout/button/hit targets are unchanged.

Layers retain stable IDs, names, local transforms, inherited visibility/locks, ordering, grouping/parenting and independent duplication. Source dimensions and a separate immutable copy of initial dimensions persist. Restore initial dimensions is another undoable parameter edit even after the bounded edit history has discarded early caches. Selecting, transforming, grouping or exporting never implicitly bakes.

**Bake to Sculpt Layer** creates a separate authoritative sculpt volume at the source cache resolution, preserves model/world pose including parent transforms, hides the source, selects the new layer and records one Undo action. Undo removes the result and restores source visibility/selection; Redo reinstates it. Source parameters remain available. Clay, Smooth, Flatten, Inflate, Scrape, Pinch, Crease, Move deformation, stamping, Cut, Mask and Paint require this explicit conversion. Transform and layer metadata operations remain available directly. Small baked grids also support Reset sphere without writing a sphere outside their boundary.

### 2. Architectural decisions

`parametric-primitive.ts` validates bounded discriminated source definitions, evaluates exact Euclidean SDFs and computes analytic affine bounds. Primitive identity is the owning layer ID. `SdfLayer.primitive` is separate from the existing tube source; a layer cannot own both. The existing compositor prepares an analytical primitive sampler with the saved inverse model transform and distance scale. This integrates operands into the existing ordered preview only: it does **not** implement Phase 6.3 live parametric Boolean editing.

`LayerRuntime` renders/exports mathematical tessellation (12 Box, 384 Cylinder, 12,096 Sphere triangles), with exact cardinal extents up to Float32 precision. Pole/seam coordinates near zero are canonicalized to avoid open edges in exact-coordinate print checks. Material ownership, transform/raycast IDs, surface spatial indexing, thumbnail cloning and ordinary source exports reuse existing paths. Display-only placement geometry is a sibling of the source root so Boolean source hiding cannot hide it; it is excluded from source exports, Boolean sampling and project thumbnails. Disposed/replaced runtimes release analytical geometry as well as mesher/material resources.

The existing chunk mesher, native codec and explicit Bake require lattice storage. Consequently each primitive retains a **disposable fitted SDF cache**, not a resampled project-sized authoritative sculpt volume: odd cubic resolutions 33–63 (capped independently of a 128³/192³ project), extent 0.6 × longest local dimension. Odd grids include the shape centre and cardinal sample lines. Regeneration samples analytically in batches of 128, yields after about 3 ms and uses the existing two-chunk/3 ms cooperative remeshing path. Publication is atomic after validation/meshing/admission; cancellation, selection/metadata revisions and disposal reject stale candidates. Eight parameter-cache history entries are retained; initial dimensions remain stored separately. Existing project/triangle/256 MiB staging limits still apply; memory estimates include source geometry and retained caches. Dense reconstruction is confined to this per-object cache; transforms only update metadata/pose.

Native **version 11** is written for primitives or small fitted sculpt grids; versions 1–10 remain readable and unchanged legacy projects keep their prior output version. Earlier app versions reject v11 rather than silently discard editable definitions. Validated current/initial parameters flow through native bytes, browser library, Save As, ID-remapped duplication, portable native import/export, immutable snapshots and the actual recovery worker. Import/save validate that a primitive cache's layout and every sample match its source. Unsupported types/parameters, invalid originals, nonfinite/negative/out-of-range dimensions and source/cache mismatches reject. Existing annotations, references, paint/masks and display metadata continue through the same codecs.

Physical parameters use Phase 6.1 model calibration (default 100 mm/model unit); units only convert entry/display. GLB's metre convention now receives a single calibration factor on source translation and scale for every exported scope, including Boolean, so mixed parts stay aligned. This intentionally changes the previous uncalibrated GLB sizing. STL retains its 100 mm default longest-size override; only **Use project physical scale** opts into calibrated size. A target override never modifies project calibration or primitive parameters. Existing export optimization and final STL printability validation remain active.

### 3. Build and test results

Baseline `npm run check` passed Biome formatting/lint, strict TypeScript, production build and **1,372/1,372 tests**, test-command wall time **32.26 s**. Final `npm run check` passed formatting, Biome lint (**548 warnings / 94 infos, zero errors**), strict TypeScript, production build (**1.93 s**) and **1,400/1,400 tests across 85 files**, zero failures/skips/cancellations; test-command wall time **35.28 s**. Quick checks passed **21/21**. `git diff --check` passed; the existing Vite bundle-size advisory remains (main bundle about 1.404 MB / 396 kB gzip). Logs: `work/phase-6-2/baseline.log` and `work/phase-6-2/check.log`.

UI refinement validation: `npm run check` passed Biome, strict TypeScript, production build (**1.82 s**) and **1,400/1,400 tests**, full test-command wall time **34.98 s**. `git diff --check` passed. Log: `work/phase-6-2/ui-check.log`.

Added **28 deterministic primitive tests** covering the three analytical SDFs, physical/affine bounds and units, numeric rejection, source editing/history, independent duplication, initial parameters beyond history trimming, names/order/parenting/groups/inherited locks/visibility, explicit Bake and source preservation, absence of implicit Bake, native v11/legacy/Save As/project duplication and real worker recovery, malformed cache rejection, GLB calibration and encoding, STL encoding and closed one-component/nondegenerate fixtures, logical hands and actual Touch Plus controller bridges, trigger release ownership, Boolean-visible placement, cancellation/stale revisions and disposal. Existing suites continue to exercise tubes, Cut, mirror/turntable, references, painting/masks, Skybox, measurements, thumbnails, portable projects and controller calibration.

Desktop browser inspection on isolated localhost port 5192 verified a 60 × 50 × 50 mm Box, editing width to 80 mm and X position to 100 mm, retained parametric selection and three undoable creation/transform/dimension actions. Test-origin autosave completed; no pre-existing recovery record was restored or discarded. Screenshot: `outputs/phase-6-2/desktop-primitives.png`. Physical hardware acceptance is pending.

### 4. Benchmarks and regressions

Reproduce with `node scripts/benchmark-primitives.mjs`; JSON: `outputs/phase-6-2/benchmark.json`. Single Mac Node v26.8.1 run, an empty independent base at each resolution, nine parameter updates per shape plus one creation and one Bake. All caches were 63³. CPU wall times include cooperative yielding/meshing and exclude browser/GPU rendering:

| Host base | Shape | Create ms | Edit median / p95 ms | Bake ms |
| --- | --- | --- | --- | --- |
| 64³ | Box | 148.46 | 120.03 / 123.97 | 131.31 |
| 64³ | Cylinder | 118.01 | 126.85 / 135.32 | 139.10 |
| 64³ | Sphere | 115.24 | 118.22 / 124.43 | 125.74 |
| 128³ | Box | 113.88 | 110.26 / 124.92 | 130.80 |
| 128³ | Cylinder | 111.87 | 122.65 / 126.26 | 133.15 |
| 128³ | Sphere | 112.92 | 112.00 / 117.90 | 126.32 |

Tracked memory after the edits and Bake was about 34.1–51.1 MB including retained history/base/result; this is an application estimate, not measured process/GPU peak memory. p95 with nine samples is descriptive. No comparison establishes scaling or headset performance; no Quest CPU/GPU/frame-time or sustained-session benchmark has been made. The project's existing remeshing scheduler and calibrated controller-guide/Skybox paths remain intact.

### 5. Known limitations and blockers

Physical Quest 3/Touch Plus/Quest Browser acceptance is **pending**, so hardware release readiness is unverified. Rounded Box, Cone and Torus are deferred. Current source dimensions admit 0.001–16 model units and at most 8:1 aspect ratio, with existing eight-layer/triangle/memory limits; the aspect limit prevents sub-voxel Bake parts. Cylinder/Sphere use diameter rather than a separate radius field. No bevels or parametric constraints/Boolean tree editor. Existing Boolean preview quality caps still apply; separate source exports preserve the mathematical tessellations.

Rendered/exported curved surfaces are polygonal approximations with exact cardinal sizes, not CAD B-reps. Rotated triangle bounds can differ slightly from analytic curve bounds. Bake is a sampled SDF approximation at the fitted cache spacing; it retains intended units/pose and cardinal sizing, but corners/curvature retain normal voxel discretization error. Sources remain available for later parameter edits/rebaking. Parent linkage is not copied to the baked root layer; its inherited world pose is preserved. Restoring initial dimensions does not reset transforms. Parameter Undo retains eight cache edits, separately from persistent initial dimensions.

Desktop creates at model origin before exact/gizmo placement; VR previews currently place axis-aligned in model space, then existing transforms rotate/scale them after placement. Preview cancellation is available from its Support menu; no new face-button cancellation binding is claimed. Changes to calibration reinterpret the whole project just as in Phase 6.1. GLB now uses metres from calibration; STL still requires the project-scale checkbox to bypass its target override. Print checks do not prove wall thickness, self-intersection freedom or universal slicer suitability.

### 6. Next recommendations — physical Quest 3 acceptance, all pending

- [ ] **Pending:** Record Quest OS, Quest Browser and app revision. In Studio and Passthrough, use both dominance settings to open Tool Wheel → World Settings → Measure & Precision → Primitives. Confirm discoverability, readable keypad/units and the unchanged full-size Cut sector.
- [ ] **Pending:** Create a 50 × 30 × 20 mm Box, a 30 mm diameter × 60 mm Cylinder and a 25.4 mm Sphere. Position naturally, size with Tool stick, confirm after trigger release and cancel with the Support menu. Verify no Clay/Paint/Mask stroke; test tracking loss, reconnect, menus, grips, session re-entry and cancellation during generation.
- [ ] **Pending:** Select sources in Layers, edit exact mm/cm/in dimensions/positions/rotations/scales, rename, duplicate, reorder, parent/group, hide/show and lock/unlock (including inherited locks). Confirm initial-dimension restoration and Undo/Redo without implicit Bake. Navigate/zoom/rotate workspace and run turntable; intended physical size must stay unchanged.
- [ ] **Pending:** Bake a nested transformed primitive, compare size/placement, confirm hidden editable source and one-step Undo/Redo. Exercise Clay, Smooth, Move, Cut, Mask, Paint, mirror and turntable on the baked layer without changes to unrelated layers/tubes. Save and reopen.
- [ ] **Pending:** Save/Save As, duplicate in Project Browser, portable export/import, autosave and recovery with source parameters, initial dimensions, groups, annotations, references and thumbnails. Confirm preserved controller-guide clearance and Studio Skybox in repeated Studio/Passthrough sessions.
- [ ] **Pending:** Export known-size parts as calibrated GLB and project-scale STL; compare slicer dimensions and print reports, then repeat STL with explicit target override. Verify absence of wireframes/handles/annotations and check intended printer limitations.
- [ ] **Pending:** Record frame timing, input responsiveness, memory/GPU/resource behavior during repeated edits/Bakes/deletes and a sustained session. Host wall times above are not headset acceptance evidence.

---


## Phase 6.1 handover — Measurement & Precision Transforms

Updated 2026-11-04. Active repository `/Users/brettjames/development/vrappPOC`. Reviewed this status, Phase 6.0 Cut/thumbnail handover, controller-guide profiles, Studio Skybox and `docs/TESTING.md` before changes. Initial HEAD was `5a067e6` with existing uncommitted Skybox work; that work became commit `126312a` during this task and was preserved. Implementation and validation were initially left uncommitted. The user subsequently authorized committing and pushing Phase 6.1 on 2026-11-04. No merge or reset was performed. Quest 3 calibrated controller-guide profiles/offsets and Studio Skybox implementation are untouched.

### 1. What changed

Added **World Settings → Measure & Precision**, alongside Guides on the existing readable VR menu, plus a compact desktop disclosure. Cut remains the tenth radial Tool Wheel entry; no wheel sector or footer was repurposed. Tool-trigger surface taps place two-point distances or three-point angles (point 2 is the vertex). Desktop clicks use the same picker. Lines, endpoint markers and camera-facing unit labels are display-only. Pick visible sculpt meshes, the visible Boolean result, or placed STL references, including locked references; image panels do not intercept measurement. Review/remove annotations, choose another annotation in VR, or reposition an individual endpoint. Stop measuring or choose another tool to return trigger ownership to sculpting. Desktop Escape stops measuring.

Numeric controls edit selected layers/groups: model-space XYZ position in the selected physical units, Euler XYZ rotation in degrees, uniform scale, or proportional target width/height/depth. Desktop fields support Enter, Tab/change and Escape; VR uses an in-menu numeric keypad with backspace, Apply and Cancel. Selected dimensions are model-axis-aligned rendered bounds, including descendants for groups. Optional position grid steps are Off (default), 0.1, 1 and 5 mm; angle increments accept 0–180 degrees, with zero Off. Numeric entries remain exact and are not rounded to the movement grid.

STL retains the existing default 100 mm target-longest-dimension workflow. An explicit **Use project physical scale for this export scope** checkbox opts into calibration-based sizing for current-layer, visible-layers or Boolean exports. Target entry is disabled while opted in. A selected-layer shortcut copies its physical longest dimension into the traditional target box. The print report states calibrated scope size, sizing mode, applied ratio and final physical dimensions. Exported geometry/report validation and print warnings remain in force.

### 2. Architectural decisions

`physical-units.ts` defines calibration as millimetres per model coordinate unit, separate from tracking, workspace, viewing and turntable matrices. New projects and legacy projects without precision metadata use **100 mm/model unit**, millimetre display and free movement. This assigns an explicit physical interpretation without rescaling any legacy geometry, transforms, references, lattice data or STL defaults. Changing calibration changes interpretation only. Centimetres and inches use factors 10 and 25.4 mm. Annotations store up to 64 bounded, finite two/three-point records with unique IDs in model coordinates.

`PrecisionTools` owns measurement state and resources. Picking occurs only on an endpoint tap, not every frame. It removes the complete model-root world matrix from hit coordinates, including workspace navigation and turntable pose. STL reference picking deliberately invokes standard Mesh raycasting on the existing normalized/placed mesh without enabling its editing picker. Annotation graphics are siblings of the source root so Boolean preview cannot hide them; their local pose follows that root. They are excluded from source surfaces, Boolean composition, thumbnails, STL and GLB. Unchanged frame sync performs identity/parent checks and pose copies, without raycasts, bounds scans, geometry/texture rebuilds or SDF work. Editing annotations rebuilds and disposes their display resources.

Numeric edits use existing `setActiveTransform` transactions and hierarchy world-to-parent conversion. Group parenting, inherited locks, positive uniform scale validation, cancellation and sculpt Undo/Redo stay authoritative. Gizmo world/local controls retain their movement semantics; physical grid quantization applies to saved model-axis coordinates, without including workspace translations/scales. Desktop translation and rotation snapping leave the other component unchanged. XR grip transforms can snap both components. Calibration/unit/snap settings and annotation edits use display metadata and never add SDF history entries. Annotation removal itself does not enter sculpt Undo/Redo.

Optional `display.precision` goes through strict display validation, native save/load, immutable snapshots and the actual recovery worker. No native-version bump or geometry migration. Invalid units, nonfinite/range-invalid numbers, duplicate IDs, malformed points and excessive annotation counts reject. Older readers may drop unknown precision metadata on resave. STL input bounds are measured from the chosen source scope and saved source transforms, never renderer navigation matrices; the existing STL encoder still sizes to an explicit target.

### 3. Build and test results

Baseline `npm run check` passed formatting, Biome lint (546 warnings / 95 infos, zero errors), strict TypeScript, production build and **1,354/1,354 tests**, test wall time **32.31 s**. Final `npm run check` passed: Biome format/lint (**547 warnings / 95 infos**, zero errors), strict TypeScript, production build (**1.77 s**) and **1,372/1,372 tests across 84 files**, zero failures/skips/cancellations. Full test-command wall time **33.94 s**. The existing Vite bundle-size advisory remains (main bundle about 1.386 MB, 391 kB gzip). `git diff --check` passed. Final log: `work/phase-6-1/check.log`; baseline log: `work/phase-6-1/baseline.log`. Focused measurement/transform validation passed **38/38** before the final full run.

Added 17 measurement/precision tests plus one desktop-snapping regression. They cover numerical conversions, finite validation, distance/angle math, hidden surfaces, full navigation removal, disabled STL-reference raycasts, annotation edits without geometry/history changes, nested groups, exact numeric placement/rotation, dimensions, locking, metadata Undo/Redo, snap calculations, worker recovery/native/legacy persistence, calibrated and override STL sizing, both logical hands and both actual controller bridge layouts, trigger ownership/rearming, aiming-ray visibility, bounded/disjoint keypad targets and Boolean-preview annotation visibility/resource reuse. The existing turntable test now checks runtime-angle exclusion specifically in turntable metadata; precision legitimately persists an angle increment.

Desktop browser inspection verified 50 mm and 100 mm proportional sizing via keyboard, a visible 42.897 mm annotation on a 100 mm sphere, retained model/grid/Cut controls, and no warning/error console logs. Calibrated STL export reported **100.000 × 100.000 × 100.000 mm**, **1.000000×** project scale, 31,536 triangles, one connected surface and zero open/non-manifold/winding/degenerate/inward counts on that fixture. Existing unsupported print checks remain explicit. Screenshot: `work/phase-6-1/desktop-measurement.jpg`. Browser checks used isolated localhost port 5189; existing recovery was neither restored nor discarded. Physical Quest acceptance is pending.

### 4. Benchmarks and regressions

Reproducible host command: `node scripts/benchmark-precision.mjs`; results: `outputs/phase-6-1/benchmark.json`. Single Mac Node v26.8.1 run, 50 event-triggered picks/bounds scans per sphere, 32 accumulating annotation-pair placements and 10,000 unchanged sync calls:

| Host fixture | Raycast median / p95 | Bounds median / p95 | Annotation pair median / p95 |
| --- | --- | --- | --- |
| 64³ | 0.249 / 1.009 ms | 0.642 / 1.158 ms | 0.553 / 1.272 ms |
| 128³ | 0.128 / 0.236 ms | 2.691 / 3.737 ms | 0.406 / 0.731 ms |

Both fixtures retained 32 annotations with **zero sculpt-history change**. Unchanged sync median was approximately 0.000042 ms; timer resolution/JIT/load make these micro-timings descriptive only. Annotation timings exclude browser canvas labels/GPU rendering. Smaller 128³ raycast times are an observation, not a scaling/performance claim. Annotation resources are bounded (one line and label per annotation, one shared endpoint point cloud); unchanged frames reuse them. Dense SDF storage, incremental meshing, worker scheduling and remeshing budgets are unchanged. No Quest CPU/GPU/frame-time or sustained-session measurement has been made.

### 5. Known limitations and blockers

Physical Quest 3/Touch Plus/Quest Browser usability, stereo label legibility and frame-time acceptance remain pending. Measurements use displayed triangle surfaces, not sub-voxel analytic SDF intersections. They are fixed model-space annotations, not associative constraints: later sculpt/layer/reference transforms do not move stored endpoints. Reposition explicitly after changing the model. Three-point angles reject coincident arms with visible undefined-angle feedback; there is no automatic edge/face inference.

Dimensions are model-axis-aligned bounds; resizing one dimension changes all axes proportionally. Group bounds include all descendant geometry; export scope continues to determine the actual visible/current/Boolean source set. Calibration starts at an explicit 100 mm/unit convention; it does not infer historical intended print size or an STL reference’s original source-file units (references already normalize on import). Live movement grid snapping uses model axes; face/surface snapping is deferred. The existing 0.1–10,000 mm STL target admission limit still applies to calibration-based exports. No physical acceptance claim or implementation blocker remains.

### 6. Next recommendations

- [ ] On Quest 3 in both handedness settings, open World Settings → Measure & Precision, release the menu, place distance and angle points on sculpt/Boolean/STL-reference surfaces, then reposition/remove annotations. Confirm a visible aiming ray, readable labels and no accidental Clay/Paint/Mask strokes.
- [ ] Enter numeric position/rotation/scale and target dimensions on nested groups/layers; verify inherited locks and Undo/Redo. Compare Off/0.1/1/5 mm and custom angle steps while moving and rotating. Navigate/scale/rotate the workspace and run the turntable; verify physical values remain unchanged.
- [ ] Save, reopen and recover measurements/calibration; repeat in Studio/Passthrough, through tracking loss, hand swaps and session re-entry. Verify calibrated support-guide clearance and existing Cut, Paint, Mask, references, Skybox and Tool Wheel behavior.
- [ ] Export a known-size part with project physical scale and with an explicit target override; compare the printed report and slicer dimensions. Record Quest/browser versions, stereo readability, frame timing and a sustained session before release acceptance.

---


## Studio Skybox and Horizon handover

Updated 2026-11-04. Active repository `/Users/brettjames/development/vrappPOC`, baseline `5a067e6`; working tree was clean before this task. Read the latest handover and world/display persistence, renderer/session compositing, desktop/XR controls, ground grid, lighting, turntable, references and thumbnail paths before implementation. No commit, push or merge authorized or performed. Quest 3 support-guide profile/calibration and its fixtures are untouched.

### 1. What changed

Added **World Settings → Studio Background → Skybox** in XR and a matching desktop disclosure with Skybox and preset controls. Following the user’s default refinement, it defaults On with Neutral Grey, saves with the project and recovers through the existing display snapshot path. On gives Studio a subdued neutral-grey upper sky hemisphere, a readable level horizon with narrow haze, and a lower hemisphere tinted by the selected background preset. The horizon is world-horizontal, not a fixed division of screen pixels: looking down can put it above the viewport. Off fills both desktop and VR Studio with the selected background preset. `WHATS_NEW.md` has a concise dated entry.

### 2. Architectural decisions

`StudioSkybox` owns one clip-space triangle and an unlit procedural shader, attached directly to the scene, outside tracking/workspace/sculpture/turntable roots. Each eye's `onBeforeRender` copies its inverse projection and world matrix into reused uniforms. Only the rotation part maps viewing rays to world directions; elevation uses world Y. Head pitch/roll/yaw change which part of the sky is seen, never its gravity orientation; viewer translations, workspace grabs and turntable rotation do not move the horizon. Clip-space placement, disabled culling/depth tests/depth writes, opaque-first render order and sRGB output conversion keep it behind models, references, grids and menus regardless of near/far distances. No enclosing sphere, finite floor disk, seam around the azimuth, textures, environment lighting or shadow changes.

Preset colours apply immediately to both desktop and VR Studio with Skybox Off. A reusable scene background colour replaces the earlier XR-only update guard, which had left the desktop picker ineffective without the sky shader. The latest preset also returns immediately after XR exit, including changes made during Studio or Passthrough. With it On, the preset supplies the lower colour; a small haze blend near the horizon joins it continuously to the fixed subtle upper gradient. The XR ground-grid toggle remains independent and retains its existing workspace-local placement, spacing, opacity and navigation behavior. Desktop retains its existing grid. Neither grid is replaced by a floor surface. The model and existing guides provide scale; the infinite horizon supplies orientation.

`XRSceneRig` suppresses the mesh on entry to Passthrough and on every settings update during that session, including saved-On projects; background stays null and the existing Three alpha-blend clear path is unchanged. Desktop preview resumes after XR exit. Session entry/exit reuses the same GPU resources; `rig.dispose()` disposes/removes them. Scene/model replacement does not reconstruct the rig. Thumbnail capture still creates its own scene from layer surfaces only. References remain separately imported display assets, with no sky capture/baking. Bounds, raycasts, SDF, Boolean meshing, export sources, lighting, tool preferences and sculpt history receive no sky objects or state.

The optional boolean `world.skybox` extends existing world version 1 display metadata, with absent meaning true. New projects explicitly start On; legacy missing fields normalize to On while retaining any saved background preset. A wholly default On world remains omitted; an explicit Off always serializes world metadata and survives both native save and recovery. Malformed present values are rejected. No native version bump: older native metadata remains readable; older readers that ignore unknown world fields retain the sculpture and existing display fields but can drop the skybox choice on resave.

### 3. Build and test results

`npm run check` passed: Biome formatting/lint (**546 warnings / 95 infos**, zero errors), strict TypeScript, production build and **1,354/1,354 tests across 83 files**, zero failures/skips/cancellations. Full test command wall time **29.92 s**; production Vite build **1.59 s**. Existing bundle-size advisory remains. Focused World Settings tests passed **19/19**, including updated On defaults, neutral-grey colours, first-click toggle behavior with a missing legacy field, explicit Off persistence and legacy fallback. Quick tests previously passed **21/21**; all final tests are included in the full passing check. `git diff --check` passed.

Five new World Settings tests cover desktop and XR toggle behavior/busy state, both default On and explicit Off native/recovery serialization, legacy On reset and unchanged native version, world-ray reconstruction through yaw/pitch/roll and translation, all six presets with grid and skybox On/Off, real installed Three clear-alpha behavior, repeated Studio/Passthrough transitions, resource identity and disposal. Existing persistence/export/session tests were extended with Skybox On, including byte-identical GLB and STL output, unchanged SDF/native source/history and layout hit targets. A sixth new test verifies visible skybox exclusion from thumbnail rendering. A seventh regression covers all six desktop presets with Skybox Off, reused background colour identity, On/Off changes, Studio/AR round trips and preset changes during XR reflected immediately on exit. Focused World Settings plus WebXR suites pass **40/40**. Existing calibrated Quest guide, lighting, turntable, reference and staged remeshing regression suites pass.

Browser inspection on isolated localhost ports verified the desktop toggle, a level side-view horizon, neutral-grey and black lower colours, visible model/grid and no warning/error logs. A fresh preview after the refinement confirmed Skybox checked On, Neutral Grey selected, a grey upper gradient and sky-only background when looking upward. Preview evidence: `work/studio-skybox/desktop-on.png`; full validation log: `work/studio-skybox/check.log`. These are local ignored artifacts, not committed assets.

### 4. Benchmarks and regressions

One additional triangle/draw per rendered eye when On; no sky draw when Off or in Passthrough. No sky textures, texture repaint, frame resource allocation or SDF/remeshing work. Two preallocated matrices are copied per eye; ground colour updates only when the preset changes. Tests exercise 24 preference combinations through 48 Studio/AR entries, confirming the same mesh/geometry/material/uniforms, a single scene attachment and exactly one geometry/material disposal. This is host lifecycle evidence, not physical GPU leak or Quest frame-time measurement. No workload, mesh quality, scheduling or timeout was reduced.

### 5. Known limitations and blockers

Physical Quest acceptance and GPU/frame-time measurements remain pending. The desktop solid-colour follow-up is covered by host regressions; its fresh browser recheck is pending because the local preview server could not bind its port (`EPERM`). Automated tests validate camera-ray math, visibility, clear alpha and lifecycle; browser visual inspection is desktop, not a stereo headset acceptance claim. The horizon is infinitely distant and intentionally provides no parallax or metric floor. Upper-sky colours are fixed; presets tint only the lower hemisphere. The existing XR workspace grid can rotate with workspace navigation; the sky horizon stays gravity-level independently. No implementation blocker remains.

### 6. Next recommendations

- [ ] On Quest 3, compare Skybox Off/On in all six Studio presets; look up/down, pitch, roll and turn fully around. Confirm a comfortable world-level horizon without clipping, stereo mismatch, bright glare or visible azimuth seam.
- [ ] Toggle ground grid independently; sculpt, paint, inspect references/lights and run/rotate the turntable. Grab/rotate/scale/reset the workspace and check stable horizon, model/grid contrast, menus and calibrated Support guide clearance.
- [ ] Save/reopen/recover with Skybox On; switch Studio → Passthrough → Studio, exit/re-enter repeatedly, lose/regain tracking and hide/resume the session. Verify no sky or opaque pixels in Passthrough and the saved choice returns in Studio.
- [ ] Compare representative large-scene frame timing and GPU resource counts Off/On and through repeated session transitions. Record headset/browser versions and captures before claiming hardware acceptance.

---


## Controller guide profiles handover

Updated 2026-11-04. Small presentation-only refactor, based on latest commit `5dfd219`. Inspected Git status, guide/bridge/input code and this handover before editing; the active repository `/Users/brettjames/development/vrappPOC` was clean. No reset or normalization of the accepted calibration. User authorized committing and pushing this refactor on 2026-11-04.

### 1. What changed

Preserved the current Quest 3 support-guide calibration as a strongly typed, deeply frozen `QUEST_3_SUPPORT_GUIDE_PROFILE` in `src/xr-support-guide-profiles.ts`. The named frozen `QUEST_3_SUPPORT_GUIDE_LAYOUT` preserves the static texture measurements. Added deterministic source selection, a compatibility generic fallback, an uncalibrated Steam Frame slot, and a code-level override. No `WHATS_NEW.md` entry: this is a behind-the-scenes change, as requested by the user. There is no new user-facing setting.

### 2. Architectural decisions

Both hands retain **exactly** grip-local `[0.005, -0.0043, -0.0207]` metres and the original X-axis rotation expression `(-(90 + 37.2) * Math.PI) / 180`, with no mirroring, normalization, rounding, billboarding or orientation lag. Plane size remains 0.11 × 0.11 m, texture 512², centre `[256, 256]`, tip/opening/separator 224/100/32 px, glyph centres 92/420 on the original axes. Glyph paths, styles and canvas drawing operations remain unchanged. Shared UI scales remain 1.25/1.35; the profile multiplier is 1. Face clearance remains scaled half-diagonal + 0.18 m, with 0.04 m reappearance margin. Grip anchoring and wrist orientation remain unchanged; there are no other hand-specific offsets or positioning heuristics in this guide.

Auto selection uses only the existing source's exact `meta-quest-touch-plus` profile ID. This identifies the controller profile, not a reliably detected Quest 3 headset. Older Touch IDs, missing sources and unknown controllers use `generic`, which deliberately preserves the previous pose without claiming calibrated fit. Existing gamepad mapping and axes establish input compatibility, not face geometry; no UA, button-count or Steam Frame identity guesses were added. The guide resolves the current logical Support state's source on update, so source replacement and dominance/session changes cannot latch another controller's profile. Existing bridge hide/tracking behavior is retained.

Call `supportGuide.setProfileOverride("quest-3" | "generic" | "steam-frame" | "auto")` from code to test/configure; `activeProfile.id` reports the effective profile. Overrides hide immediately and survive tracking/session re-entry until changed. `steam-frame` currently falls back to generic because `STEAM_FRAME_SUPPORT_GUIDE_PROFILE` is explicitly null. To calibrate later, populate that slot with an independently measured, frozen `SupportGuideProfile`, including separate left/right poses and physical scale; select it explicitly until reliable source identification is established. Do not change the Quest baseline. Mutable `offset`/`orientationOffset` copies remain available for development tuning; profile/hand changes reload those copies from immutable data.

### 3. Build and test results

`npm run check` passed: Biome format, lint (**547 warnings / 95 infos**, zero errors), strict TypeScript, production build, and **1,347/1,347 tests** across 83 files, zero failures/skips/cancellations; test command wall time **28.37 s**. Existing Vite bundle-size advisory remains. Focused guide tests passed **16/16** and quick tests **21/21**. `git diff --check` passed. Registered the new module in the existing test compiler list.

New deterministic tests freeze-check every baseline pose/layout value and assert exact pre-refactor position, quaternion components and scale for both hands, varied wrist rotations and both UI sizes. Clearance/reappearance boundaries, exact source selection, fallback, override/reset, live source change and resource reuse are covered. Actual bridge tests verify selection uses the Support source through both dominance layouts, disconnect/reconnect, visibility loss and repeated XR entry. Existing texture, measured GLB face alignment, noninteractive raycast, input/menu/history and persistence tests pass unchanged in behavior.

### 4. Benchmarks and regressions

No new draw calls, geometry, textures, repaint or frame objects. Indexed source-profile lookup returns existing frozen records; pose updates reuse vectors/quaternions. Resource identity and unchanged texture version are tested. Input mapping, glyphs, menu behavior, controller ownership and workspace transforms were not changed. No new physical GPU/frame-time benchmark was performed; suite duration is not a performance claim.

### 5. Known limitations and blockers

Exact host pose/texture regression checks preserve the accepted Quest calibration; no new physical headset acceptance was performed. Generic is compatibility behavior, not validated placement on other hardware. Steam Frame has no measurements or automatic match. Texture layout is intentionally shared and static; profiles configure pose, physical scale and clearance, not glyph drawing. Existing broader physical acceptance checklist below remains applicable.

### 6. Next recommendations

Keep the Quest baseline intact. When Steam Frame hardware is available, measure both support-hand layouts in grip space, fill the independent profile slot and test with the explicit override before adding any verified automatic source ID. Confirm physical fit/readability and lifecycle on hardware, then record measurements and captures separately.

---


## Phase 6.0.3 handover — Support Controller Shortcut Guide

Updated 2026-11-04. Host implementation complete; user accepted the final controller-guide positioning and appearance after headset iteration. Remaining Quest lifecycle/performance acceptance is pending. Active repository: `/Users/brettjames/development/vrappPOC`, baseline `d28c399`. Working tree was clean before this milestone. Read current handovers and latest Git changes, including Biome/test infrastructure and the newer desktop/tube work. User explicitly authorized committing and pushing this milestone on 2026-11-04.

### 1. What changed

Added an always-on, noninteractive guide on the logical Support controller. Following the supplied Medium reference, the final design has four compact arrow tabs separated by narrow transparent diagonal cuts around a circular transparent opening centred over the controller face, with glyphs drawn directly on the arrows: left Undo, right Redo, up Tool Wheel, down Layers. There are no words, header, centre indicator or backing panel. Directions match `SUPPORT_STICK_BINDINGS`, the WebXR negative-Y-up recognizer, and the existing controller bridge. Glyphs are selected from those bindings. Menus remain hold-to-open; sculpting and grabs still suppress shortcut execution even though the guide remains visible. World Settings → Preferences has a Support shortcut guide toggle, saved as optional project display metadata. Absent metadata defaults to On. VR UI Size applies immediately. `WHATS_NEW.md` has the dated user-facing entry.

### 2. Architectural decisions

`XRSupportGuide` owns one 0.11 × 0.11 m plane, one unlit material and one static 512² sRGB canvas texture. Arrows and shortcut glyphs use canvas paths, with no font dependency. Arrow tabs use faint neutral grey at 38% opacity, with charcoal glyphs at 85% opacity and no outlines or accent colour. The arrow backing is drawn once with an even-odd circular cutout, leaving a true transparent round centre without overlapping alpha seams. Two 32 px diagonal destination-out strokes create four transparent gaps between adjacent tabs before glyphs are painted; normal compositing is restored immediately. These are visual divisions only, not new buttons or hit targets. Following the latest headset capture, the glyph ring radius increases from 126 to 164 canvas pixels (+30%) so icon edges clear the controller. Arrow tip radius decreases from 240 to 224 pixels (−6.7% overall visible span); the tip beyond each glyph shrinks from 114 to 60 pixels (−47%). The circular inner opening has radius 100 px, tightened from 112 px (about 3.2 mm smaller at Default UI Size) so the backing extends beneath the black rim instead of leaving the crescent gap visible in the latest top-view capture. Glyph strokes retain their backing. The physical plane stays 0.11 m; angle and glyph size are unchanged. The circular centre and space outside the arrow tips remain transparent so the controller is visible. Depth testing and no depth writes allow nearer scene geometry and existing menus to occlude the guide. Raycast is a no-op; no hit targets or event handlers are added.

`XRControllers` receives the guide from `XRExperience` and polls it after existing tracking/role updates. The grip matrix and viewer pose share the controller tracking root; workspace navigation never transforms the guide. Quest Touch Plus grip-local offset is X +0.005 m, Y −0.0043 m, Z −0.0207 m for either hand. The guide is tilted **−127.2° around local X** (the plane-to-grip −90° plus the actual face tilt of −37.2°). Its normal is approximately (0, 0.79653, −0.60460). User headset captures showed that a translation-only correction still intersected the sloped face. The exact left/right GLBs from the app's configured WebXR profile CDN were inspected: primary-button neutral/pressed travel gives the face normal, and the dominant body top-face vertex cluster gives its centre and rim. The guide sits approximately 9 mm inward along that normal, parallel to the face, rather than through it. The accumulated alignment is 9 mm inward along the face normal and 5 mm to controller-local right (+X), applied consistently to both support-hand layouts. The final refinement widens transparent separators from 18 to 32 logical pixels, as requested; the latest placement adjustment adds another 2 mm down along the face normal and 2 mm right, totalling 9 mm inset and 5 mm right. Measurement samples, derivation and source hashes are retained in `tests/fixtures/quest-touch-plus-face.json`; downloaded GLBs remain outside the repository. Both hands agree on the tilt and calibrated inset centre plus rightward adjustment within 0.2 mm. Public `offset` and `orientationOffset` allow tuning without changing controller transforms. Position and orientation follow the tracked grip exactly, including wrist roll; no viewer billboarding or orientation lag is added. Existing Default/Large UI scales (1.25/1.35) affect the plane, not its anchor.

Tracking/source loss, missing stick mapping, missing viewer pose, hidden XR session, hand swapping and XR exit hide immediately; re-entry reuses the same resources. A conservative face-clearance sphere uses the scaled guide half-diagonal plus 18 cm, with an extra 4 cm reappearance margin to prevent flicker. This is presentational only: input polling, rays, commands, history and grip/workspace ownership are unchanged. The project toggle uses the existing display snapshot/validation/save path and does not add sculpt history.

### 3. Build and test results

Baseline `npm run check` passed formatting, lint, strict TypeScript, production build and **1,331/1,331 tests** across 82 files (43.20 s test command wall time). This measured count supersedes the older 1,322 count in Phase 6.0.2. Baseline Biome: 547 warnings and 95 infos, zero errors.

Final lower/right placement revision `npm run check` passed formatting, lint (unchanged **547 warnings / 95 infos**, zero errors), strict TypeScript, production build and **1,342/1,342 tests** across 83 files, with zero failures/skips/cancellations (43.70 s test command wall time). Focused guide tests passed **11/11**; quick tests passed **21/21**. Existing Vite bundle-size advisory remains. `git diff --check` passed. Both-hand assertions verify the 9 mm face inset plus total 5 mm controller-local right offset. Texture checks verify exact 32 px transparent separators, circular cutout and restored glyph compositing. Existing coverage retains tracking/session lifecycle, dominance, scaling, menu/grab isolation, native persistence, unchanged SDF/history and resource disposal. Updated real canvas preview inspected at `outputs/phase-6-0-3/support-guide.png`; user accepted the final placement and appearance on 2026-11-04; broader physical checks remain pending.

### 4. Benchmarks and regressions

One extra draw call and two triangles when visible. The texture plus mip chain is approximately **1.333 MiB RGBA**, versus approximately 21.33 MiB for each recent 2048² menu texture. No additional menu canvas is spawned. Guide frame updates reuse vectors, the mesh quaternion, geometry, material and texture; no frame repaint or new resource allocation. Host tests verify resource identity and texture version across 500 updates/repeated hide/show, and exactly one disposal per resource. These are resource lifecycle checks, not physical GPU leak or Quest frame-time measurements. Existing shortcut/interaction suites continue to verify actual axis signs, grip precedence and history behavior; no workload or timeout was reduced.

### 5. Known limitations and blockers

The user supplied physical Quest captures showing the original anchor was too high/forward and the translation-only correction still intersected the face. The current tilt/centre are calibrated against both actual Quest Touch Plus assets. The user accepted the final guide placement and appearance after these iterations. Both-layout/environment coverage, readability/comfort across viewing conditions, wider interaction clearance and GPU/frame cost still need verification. The guide uses scene depth to respect nearer virtual surfaces; it can be partially hidden by the sculpture, intentionally. There is no scene traversal or automatic avoidance for distant sculpture, controller rays or menus: compact controller-centred placement, existing menu overlay order and depth testing limit overlap, but practical clearance needs the checklist below. No claim of hardware acceptance or complete GPU leak freedom. Offset/orientation tuning is code-level; only visibility and UI size are user settings. The toggle persists per project, not globally across unrelated projects. Geometry calibration targets the Quest Touch Plus model; other controller profiles retain the guide but their face fit is unverified.

### 6. Next recommendations — physical Quest acceptance checklist (remaining checks)

- [ ] Test Right Tool / Left Support and Left Tool / Right Support in **both Studio and Passthrough**. Confirm only the logical Support controller has a guide, including live dominance changes, and Minimal/Simple/Realistic controller modes and hidden diagnostics/hints do not suppress it.
- [ ] At natural arm distance, verify the tighter circular opening reaches just beneath the black rim with no crescent gap, and all four transparent separators remain clear without new borders; check all four glyphs around the rim, the shorter tips stay unobtrusive, and the guide remains parallel to and just below the controller top through wrist tilt and side views, with legible glyphs on all four faint borderless arrows, open controller centre and no words or card with Default and Large UI Size. Check bright-room Passthrough and neutral-grey Studio contrast, wrist roll/turning, controller-locked alignment and controller-model clearance.
- [ ] Verify left Undo / right Redo once per centred excursion; hold Up Tool Wheel / Down Layers and release to dismiss. Check existing sculpt, alternate-tool, layer grab and two-hand workspace ownership/history remain unchanged while the guide stays visible.
- [ ] Inspect offset clearance against support/tool rays, controller geometry, sculpture, grabbed/rotated/scaled workspace, Tool Wheel, Layers and World menus. Confirm menu selection rays pass through the guide and nearer virtual objects occlude it without depth artifacts. Tune offset if required.
- [ ] Bring the controller guide near the face, then away: verify hide/reappear margin without flicker or stale placement. Lose tracking, disconnect/reconnect support, hide/resume XR, exit/re-enter several times and change Studio/Passthrough; check prompt hide and correct reattachment without duplicates.
- [ ] Toggle World Settings → Preferences → Support shortcut guide Off/On; save/reopen and recover the project. Confirm old/new projects default On, UI size remains correct and sculpt Undo/Redo is unaffected.
- [ ] Compare frame timing and renderer texture/geometry counts with guide On/Off in a representative large scene, then across repeated session entries/exits and environment changes. Verify counts plateau, no repaint churn and no perceptible overhead. Record headset/browser versions and captures before release acceptance.

---


## Phase 6.0.2 handover

Updated 2026-11-03. Desktop layer rotation now supports direct surface dragging with temporary axis constraints. The change uses the existing layer transform/history path; WebXR behavior is unchanged.

### 1. What changed

With Rotate active (E), clicking and dragging a visible layer surface starts free rotation without selecting a gizmo handle. Clicking another visible layer selects it and begins the drag on that layer. Hold R/F/V during the drag to constrain rotation to X/Y/Z; releasing returns to the free rotation or selected gizmo axis. Existing gizmo handles and World/Local space remain available. The sidebar help and Rotate tooltip show the shortcuts. `WHATS_NEW.md` has the dated user-facing entry.

### 2. Architectural decisions

Surface hits resolve to the layer ID already attached to each layer surface; Boolean view falls back to the current transform target. Rotation starts and finishes through `TransformControls` and the existing transactional `beginTransform` / `updateTransform` / `finishTransform` path, so SDF data remains untouched and one drag creates at most one metadata history action. R/F/V are hold-to-constrain keys; key release, focus loss and mode changes clear their temporary state. Axis shortcuts are active only in layer Rotate mode, so R continues to select Scale elsewhere.

### 3. Build and test results

Final `npm run check` passed after the change: formatting, lint, strict TypeScript, production build and **1,322/1,322 tests** (82 files; no failures, skips or cancellations). The focused `layer-transforms` suite passed **18/18**, including shortcut mapping, dynamic constraint return, direct handle-free rotation, layer selection, and one-action history. Biome warnings and the existing bundle-size advisory are unchanged.

### 4. Benchmarks and regressions

This is a pointer interaction and metadata-only transform change; it adds no surface sampling, remeshing, or asset work. Existing transform tests continue to verify exact history and unchanged SDF buffers. No rotation workload or timeout was shortened.

### 5. Known limitations and blockers

Desktop/browser pointer interaction has automated host coverage, but no new manual browser review was performed. Physical Quest interaction remains outside this desktop change. In Boolean view, a surface hit resolves to the current transform target because the unified surface does not identify one source layer.

### 6. Next recommendations

Try Rotate (E) on several overlapping layers in Separate Layers and Boolean views; confirm surface selection, the free drag feel, and held R/F/V constraints. Use the existing handles when precise handle-axis manipulation is preferred. This follow-up has not been committed or pushed.

---

## Phase 6.0.1 handover

Updated 2026-11-03. Code cleanliness and agent test workflow are complete. Phase 6.0 host implementation is complete; physical Quest 3 acceptance remains pending.

### 1. What changed

Pinned Biome 2.6.4 and added scoped formatting/linting. Formatted handwritten TS/JS/JSON in `src/`, `scripts/`, `tests/` and root tooling config; generated builds, assets, vendor code, `outputs/`, recovery data and snapshots are excluded. Import ordering was applied in a separate pass. Added quick, focused, changed-file, worker and full test commands, bounded default concurrency, TAP/JUnit output, a combined `npm run check`, and [AGENTS.md](../AGENTS.md). A Git pre-commit hook now runs Biome checks; `npm install`/`npm ci` enables it for the repository. `WHATS_NEW.md` has the dated entry.

### 2. Architectural decisions

Kept Node's built-in `node:test` runner and existing TypeScript content-cache pipeline. Native ESM, worker_threads fixtures, WebXR mocks, changed-file selection and TAP/JUnit already fit. Vitest adds another transform layer; Jest needs more ESM/TS adaptation. Neither has measured evidence of faster end-to-end runs here. Details are in [testing guide](TESTING.md).

### 3. Build and test results

Final `npm run check` passed: format check, lint, strict TypeScript, production build and **1,320/1,320 tests**, zero failures/skips/cancellations across 82 files. Check wall time was **48.24 s**; suite wall time was **42.16 s**. Build retains the existing Vite large-bundle advisory. Biome checked 286 scoped files. Lint exits successfully with **542 warnings and 94 informational findings**; remaining findings are recorded in §5.

Baseline strict TypeScript passed in **1.62 s**, build in **3.79 s**, and full suite passed **1,316/1,316** in **33.36 s** wall time, with Node's runner default concurrency. After changes, the full run at the explicit concurrency cap of four took **42.16 s** and passed **1,320/1,320**. These timings are not directly comparable: the concurrency setting and test count changed. The small `test:quick` set ran 21 checks in about **0.65 s**.

### 4. Benchmarks and regressions

JUnit per-test durations summed by file show the slowest aggregate execution: `rotation-integration` 14.02 s, `turntable` 10.24 s, `vr-stress` 9.83 s, `bake` 9.02 s, `advanced-brush` 8.43 s and `sculpt-masks` 7.05 s. These per-test sums overlap across concurrent processes and are not file wall times. Full-run wall time rose versus the baseline, so no full-suite speedup is claimed. Focused and quick runs provide faster edit feedback. The historical Move preparation timeout under high concurrency is noted in the Phase 6.0/Phase 5.4 entries; the final concurrency-4 suite had no timeout.

Top-five runtime follow-up: the focused command `npm run --silent test:junit -- rotation-integration turntable vr-stress bake advanced-brush` ran 88 cases at concurrency 4 in 17.73 s before and 17.98 s after the experiment. Post-run JUnit duration sums were 13.62 s, 10.24 s, 8.93 s, 9.13 s and 8.79 s respectively; per-file sums overlap and are load-sensitive. Changing only the focused batch cap measured 26.53 s at concurrency 2, 17.98 s at 4, then 15.09 s and 14.27 s across two runs at 5; all 88 cases passed in each run. For this focused subset, `npm test -- rotation-integration turntable vr-stress bake advanced-brush --test-concurrency=5` is a measured faster command on this host. This does not justify raising the full-suite default, where historical Move-worker timeouts under contention motivate the existing cap of four. A one-file bake run measured 8.52 s before and 8.36 s after precomputing bake coordinates, but the batch showed no corresponding gain, so that production-code change was reverted. Reusing vectors in the rotation integration scan also produced no measurable runtime improvement and was reverted. The expensive cases are the intended 192³ workloads: rotation/twist scan dense surfaces and verify seam normals/history/reload; VR stress exercises repeated brush, stamp, cancellation and persistence paths; turntable verifies 192³ edits/exports; bake samples the full field; advanced-brush checks large-grid exactness. No assertions, resolutions, iteration counts, or timeouts were reduced. Runtime gains came from focused selection and this local cap-5 experiment, not a weakening or rewrite of coverage.

### 5. Known limitations and blockers

Lint has 542 warnings and 94 infos. **489 are `noNonNullAssertion` warnings**; others include 19 unused parameters, 17 unused variables and 9 optional-chain suggestions. Informational findings are mostly 88 template-string suggestions. No lint errors remain, and these rules remain enabled. Scoped exceptions are documented in `biome.json`: inline fake-clock increments in the specific tests/benchmarks; intentional cache assignment and control-character filename regexes have local reasoned suppressions. A test worker fixture has one local constructor-return suppression. One duplicate benchmark property was removed. No broad blanket rule disables are in place.

Node watch mode is available upstream but is not wrapped because the project runner must compile TypeScript imports before launching tests. Physical Quest validation is unchanged and still pending for Phase 6.0 app work.

### 6. Next recommendations

Use `npm run test:quick` during edits, focused/changed selection where safe, and `npm run check` for handoff. Lower concurrency with `TEST_CONCURRENCY=2` on memory-constrained hosts. Tackle non-null assertions incrementally by module, keeping the recommended rule enabled; consider a runner watch command only with a compilation-aware implementation. Do not commit, push or merge without explicit authorization.

---

## Previous phase handover: Phase 6.0

Updated 2026-11-03. **Phase 6.0 host implementation complete; physical Quest 3 acceptance remains pending.**

## 1. What changed

Phase 6.0 adds direct main-wheel and desktop Plane Cut controls, separate SDF pieces with a single-action undo, active/all-editable layer scope, and automatic browser-library thumbnails on Save/Save As. `WHATS_NEW.md` has the dated end-user entry. Details and limitations are recorded in [Phase 6.0 handover](PHASE_6_0_CUT_THUMBNAILS.md).

Read the current Development Status, Phase 5.1 browser, Phase 5.3 STL, Phase 5.4 release handover and recent changes before editing. Baseline working tree was clean at b1fb915; no user edits were overwritten. Baseline strict TypeScript/build and full suite passed (**1,298/1,298**). No commit, push or merge performed for Phase 6.0.

## 2. Architectural decisions

Plane Cut computes negative-inside half-space intersections in each source layer’s local SDF lattice, retaining expanded dimensions and lattice origin. Both pieces are prepared and remeshed before publication. Paint and masks are clipped to the piece and nearby cap samples inherit surface colour. Effective visible/unlocked layers can be cut in one staged, rollback-safe history action; intersect targets reject the whole batch. Cut-history references are invalidated safely when a related layer is deleted.

Thumbnail capture uses an isolated offscreen render target and visible committed surfaces, restores renderer/XR state before async readback, and stores capped compressed data through existing atomic local-library metadata. Project listing remains metadata-only. Portable `.form` payloads are unchanged.

## 3. Build and test results

Final `npx tsc --noEmit --strict`, production build and complete suite passed: **1,316/1,316**, no failures/skips/cancellations. New tests cover SDF caps/signs, rotated/offset/sparse-lattice planes, groups/transforms, paint/mask, individual STL diagnostics, cancellation, batch rollback/Undo/Redo, stale-history cleanup, thumbnail cap/fallback/async XR readback and direct wheel hit-target ownership. Build retains the existing main-bundle size advisory.

One host integration run measured a 64³ cut at **139.7 ms**, 76,688 triangles and 11,812,992 tracked bytes; a 128³ cut at **937.7 ms**, 312,896 triangles and 72,860,160 tracked bytes. Each created two layers. These are single-run host measurements, not headset frame timings. Evidence: [benchmark](../outputs/phase-6-0/benchmark.json). XR/Passthrough and physical controllers are not available for host acceptance.

## 4. Benchmarks and regressions

The cut timings include preparation and incremental remeshing, but are not repeated statistical benchmarks and do not establish Quest performance. Existing Phase 5.2 staging and remesh budget controls remain in place. Thumbnail GPU readback is asynchronous where supported, with a synchronous compatibility fallback.

## 5. Known limitations and blockers

**Not release-ready.** Cut review currently shows plane placement, not the generated pair of preview meshes. Freehand/wand and symmetry-duplicated cuts are deferred; a cut is one explicit plane. The field remains a two-half-space split, not a separate layer for each connected component. Arbitrary exported results must be checked in the target slicer; automated fixture print diagnostics are not universal printability proof. Allocator/GPU failure injection was not tested. Thumbnail failure does not block Save; sync readback fallback may briefly occupy a frame. Human visual acceptance and physical Quest 3 Studio/Passthrough/controller/GPU/resource validation remain pending. See [Phase 6.0](PHASE_6_0_CUT_THUMBNAILS.md), [Phase 5.3](PHASE_5_3_PRINTING.md) and [Phase 5.2](PHASE_5_2_PERFORMANCE.md).

## 6. Next recommendations

Execute the [Phase 6.0 physical checklist](PHASE_6_0_CUT_THUMBNAILS.md#6-next-recommendations) and the [Quest release checklist](PHASE_5_4_RELEASE_ACCEPTANCE.md#physical-quest-3-acceptance--all-pending), record evidence and fix reproducible failures before release approval. Verify each exported cut piece in the intended slicer and exercise Save/Save As thumbnail capture in XR.

Every future phase/significant change must update this six-part status, add a dated user-facing `WHATS_NEW.md` entry newest first and pass strict TypeScript, build and full tests; see [development workflow](../DEVELOPMENT.md). This Phase 6.0 request explicitly prohibits commit, push or merge.

Sidebar refinement: recovery pause status moved to a focusable info tooltip on Recovery Checkpoints; resource estimates moved to sidebar bottom, diagnostics use monospace, brush buttons have tooltips, Surface View uses an accessible Boolean icon toggle, and redundant export/transform/layer hints were removed. What’s New now formats headings and bullets without interpreting HTML.

Removed the YOUR TOOLKIT and INDEPENDENT VOLUMES sidebar labels as requested.

Tightened both sidebar top insets to 20px and removed first-heading top margins after removing eyebrow labels.

Surface View now uses compact Layers / Boolean buttons with synchronized pressed states, replacing the oversized icon.

Moved Composite Quality Cap into a collapsed Preview settings disclosure directly below Gizmo Space; existing quality values and behavior preserved.

Removed the separate-layer status hint; Boolean tooltip includes current cached triangle count when available (omitted while pending).

Layer parenting follow-up: sculpt layers can directly parent other layers, with indented children and collapse controls. Desktop uses drag handles, an Outside drop target and a collapsed Attach / detach fallback. VR uses trigger-held handles, release onto rows/Outside, hover paging arrows and an Attach to layer fallback. Existing folder groups remain readable; new grouping does not create folders. Reparent preserves world pose, rejects cycles/invalid depth/non-uniform parent scale and records one Undo action. Parent transforms/visibility/locks propagate; deletion keeps children in place at the parent's level. Boolean evaluation order is unchanged. Duplication still copies the selected layer only. Native version 10 is written when a layer is a parent; earlier projects remain readable. Older app versions cannot open these new files. Physical VR dragging acceptance remains pending.

Layer-parenting validation: strict TypeScript and production build PASS; full suite **1,284/1,284 PASS** (four new behavioral tests). Logs retained in outputs/phase-5-4/layer-parenting-*.log. Browser verified drag-to-attach indentation and fallback detach. Physical Quest drag/drop, tracking interruption and hover paging remain pending; no headset acceptance claim. No commit or push performed.

Layer row polish: colour swatches remain visible in compact rows, collapsed parents show descendant counts, and Gizmo Space / Preview settings now sit below the desktop layer list. Colour changes invalidate the row cache.

Removed desktop Save name and option-panel Hide/Show buttons. Enter commits layer names; each row now has a right-aligned accessible eye toggle, including unselected rows. Parent locking still disables visibility changes.

Condensed desktop Boolean step text and earlier/later controls into one numbered Boolean order row with accessible arrow buttons; behavior is unchanged.

Attach / detach parent selection now shows a live colour swatch before the dropdown; Outside uses an empty swatch.

Added an Attach / detach tooltip explaining inherited parent behaviour, Outside and preserved position.

Replaced desktop Lock/Unlock option button with a right-aligned padlock beside the row eye toggle, retaining inherited locking and accessible pressed state.

Desktop layer options now stack Duplicate beneath Transform, followed by a compact Layer order arrow row with accessible labels and tooltips.

Moved layer-order arrows to the right of stacked Transform / Duplicate buttons and removed the visible Layer order label; accessible group label retained.

Empty desktop layers now delete without confirmation. Emptiness checks authoritative positive SDF samples rather than rendered triangle counts, so pending meshes and solid volumes are not mistaken for empty. Procedural layers retain confirmation.

Boolean transform feedback: presentation temporarily shows separate layers during active transform transactions, retaining the selected Boolean mode. On completion/cancel it waits for current Boolean geometry before restoring; failed rebuilds leave live layers visible. Composite polling pauses during transforms. Shared desktop/XR render path handles restoration and project replacement resets transient state.

Transform-preview validation: production build (including TypeScript) and **1,288/1,288 tests PASS**. New tests exercise live transform visibility, waiting for fresh Boolean geometry, cancellation, explicit view changes, project replacement and VR grip transforms in Boolean mode. Physical Quest validation remains pending.

Publication follow-up: user explicitly authorized commit and push after polishing the user-facing What’s New entry. This authorization supersedes earlier no-commit statements for the completed changes in this chat. Physical release acceptance remains pending.

Moved VR / WebXR Diagnostics to the bottom of the desktop left sidebar, below Session Resource Estimates.

2026-11-03: Reduced Tool Wheel bottom backing strip from 96 to 64 canvas pixels and lowered its top edge so Mask/Paint/Project protrude by 20 pixels. Button sizes and hit targets unchanged.

2026-11-03 VR text: menu raster increased from 1152² to 2048² while retaining 1152 logical coordinates and physical/hit layout. Small text uses medium weight; explicit linear magnification, trilinear mipmaps and 4× anisotropy retain smooth distance/angle filtering. Approximate RGBA texture plus mip chain grows from 6.75 MiB to 21.33 MiB; repaint caching retained. Actual Quest sharpness/performance comparison pending.

VR text validation: production build PASS; real canvas render inspected at 2048². Initial full suite had 1 Move-preparation timing-limit failure under concurrent host load (1,288/1,289 passed); complete rerun with --test-concurrency=4 passed **1,289/1,289**, no failures/skips. Texture resolution/caching/logical layout regression added. Hardware readability and GPU cost remain pending.

2026-11-03 VR drag clarity: source-colour enlarged cursor with white ring, outlined destination row/Outside target, explicit release-to-attach/detach and invalid destination messages. Row controls now resolve to their containing layer during a drag. Shared destination validation drives both preview and release, blocking self/descendant, locked/hidden, busy and hierarchy-limit drops. Physical Quest feedback validation pending.

VR drop-feedback validation: production build PASS; complete suite **1,291/1,291 PASS** with --test-concurrency=4. New tests cover source-colour cursor/ring, tracking-loss cancellation, attach/detach messages, whole-row destination resolution and self/descendant rejection. After final cursor-colour refinement, menu tests also passed 38/38. Physical Quest validation remains pending.

2026-11-03 VR layer controls: eye/padlock glyphs replace text labels. Outside button is no longer drawn; empty in-panel list space becomes a detach destination only during dragging, with panel outline and detach feedback. Off-panel release still cancels, avoiding accidental detach on a missed ray or tracking loss.

VR icons/empty-space detach validation: production build PASS; full suite **1,292/1,292 PASS** (--test-concurrency=4). New ray-driven test verifies empty list space detaches on release and off-panel release cancels. Final hidden-target cursor refinement passed all 39 menu tests. Physical Quest usability remains pending.

2026-11-03: Added World Settings → Preferences → Test vibration. Requests a 75% / 250ms pulse on both tracked controllers and reports accepted/rejected/unavailable/failed/unconfirmed separately. Shared haptic gate suppresses overlapping pulses; timeout bounds UI wait. Accepted means API acknowledgement, not verified physical vibration.

Vibration test validation: production build PASS and **1,293/1,293 automated tests PASS** (--test-concurrency=4). Added deterministic acknowledgement/rejection/failure/unavailable/tracking/cooldown checks. Physical vibration not yet confirmed; use World Settings → Preferences → Test vibration on Quest.

2026-11-03: User confirmed the diagnostic test physically vibrated both Quest controllers. Removed the test button and its menu wiring. Normal event haptics still need separate perceptibility validation. Added VR layer Upres/Downres stepping 64³/128³/192³ using existing resampleActive admission, transforms and history behavior; confirmation explains history clearing and possible detail loss. Hidden/locked/procedural/group layers and resolution boundaries are disabled.

VR resolution validation: production build PASS; complete suite **1,294/1,294 PASS** (--test-concurrency=4). Added confirmation/cancel, up/down stepping, minimum boundary and other-layer preservation regression. Actual production-canvas layer-options render: outputs/vr-layer-options-layer-options.png. Upres/Downres physical headset acceptance remains pending.

2026-11-03 VR layer-options layout pass: prominent transform card at top left, Increase Res and Decrease Res stacked beside it with current/target sizes. Remaining actions use consistent paired rows, current resolution appears beside the layer name, and resolution confirmation wording is updated.

Layer-options polish validation: full suite **1,294/1,294 PASS**; final transform-card drawing passed build and 47 menu/layout tests. Production canvas render inspected at outputs/vr-layer-options-polished-layer-options.png. Render script now dynamically imports compiled modules after compilation to prevent stale previews.

2026-11-03 VR layer glyph pass: closed padlock shackle for effective locking (including inherited locks), open shackle when unlocked; dedicated three-line drag grip with hold instruction in the hover footer. Drag targets and ownership are unchanged.

2026-11-03 VR row redesign: Menu size shows current/next size with hover explanation; centred layer names retain colour strips, with compact top-right resolution/Boolean/type/child indicators. Removed repeated Active, Hidden, Locked and Nested text; selection border, eye/padlock and indentation convey those states. Hover explains Boolean indicators.

2026-11-03: VR layer row height reduced 136→112, pitch 164→140; child indentation doubled to 48px per level (up to 3 levels). Tool-hand vertical stick pages the layer list with deadzone/direction guards and 500ms initial / 300ms repeat delay, including while dragging. Support stick still opens/holds menus. Navigation resets on close, tracking/source changes and other pages. Physical interaction validation pending.

Compact layer/stick validation: build PASS, full suite **1,295/1,295 PASS** (--test-concurrency=4) after updating the legacy row-label assertion to check structured indicators. New stick navigation test covers paging, reversal, bounded repeat and horizontal rejection. Render with nested-layer example: outputs/vr-layer-compact-layers.png.

2026-11-03: Replaced visible layer paging with continuous tool-stick scrolling using time-scaled speed and deadzone. Layer rows and hit tests clip to the list viewport; fixed controls remain outside it. A translucent bottom chevron appears only when undisplayed layers remain below. No overflow means no scrolling indicator. Internal palette pagination is adapted into a continuous rendered list; action routing uses the displayed targets.

Smooth-scroll validation: production build PASS; full suite **1,296/1,296 PASS** (--test-concurrency=4), plus 41/41 menu tests after the final hint adjustment. Tests cover continuous bounded offsets, horizontal rejection, overflow range, clipped hit targets and selection of scrolled rows. Physical Quest smoothness remains pending.

2026-11-03 publication: user authorized commit/push of the latest VR layer refinements with a new end-user What’s New entry covering smooth scrolling, clearer rows and resolution controls.

2026-11-03 recovery-entry fix: acknowledged recovery replacement bypasses generic unsaved-work browser confirmation. Shared restore helper retains checksum, source-currentness and atomic project-open validation. VR-entry form remains open during restore/discard and displays progress/error; successful restore prepares Boolean output if needed and presents Enter VR for a fresh trusted click. Cancel remains available on failure; ordinary project-open confirmation behavior is unchanged.

Recovery-entry validation: production build PASS; complete suite **1,297/1,297 PASS** (--test-concurrency=4), including a regression contract for single-dialog ownership, explicit replacement authorization, in-dialog errors and trusted-click XR entry. Actual desktop-to-Quest restore/entry interaction still needs browser/headset confirmation.

2026-11-03 desktop tool controls: canvas workspace icon/caption follows Paint (including erase) and Smooth. Expanded Paint controls provide native colour input plus radius/strength; Smooth provides live radius/strength, synchronized with sidebar settings. Tools button returns to the tool chooser; range keyboard handling is preserved. Existing Smooth field sampling remains unchanged; interaction improvement is direct controls and visible settings rather than an unverified engine fix.

Desktop controls validation: full automated suite **1,297/1,297 PASS** (--test-concurrency=4), production build PASS. Browser using isolated recovery fixture verified Paint icon/caption, popover colour change (#e34b45→#4a78d0), keyboard radius update (.22→.23) synchronized to sidebar, Smooth popover with no colour field, and keyboard strength update (35→36%) synchronized to sidebar. Existing recovery records were not restored or discarded. Final chooser-close correction preserves same-tool selection behavior; build rechecked.

2026-11-03 desktop surface-miss fix: ray misses and leaving the viewport pause the ClayStrokeSession timer and pump queued paint, preserving applied colour instead of triggering tracking-gap rollback on return. Resumed samples break the path, preventing a painted bridge across the missed region. Immediate non-paint strokes also break their layer path when paused. Explicit cancel/lifecycle rollback behavior is unchanged.

Desktop paint surface-miss validation: production build PASS; 52/52 paint tests and complete suite **1,298/1,298 PASS** (--test-concurrency=4). Regression covers a multi-second surface miss, retained paint, gap-free resume, unchanged geometry and one Undo/Redo transaction. Actual desktop feel still needs user confirmation.

2026-11-03 publication: user authorized committing and pushing desktop Paint/Smooth controls, single-dialog recovery and off-surface paint preservation, with the polished Easier desktop painting What’s New entry.

2026-11-03: Hid the routine Autosave off · manual saves are separate status line. Recovery warnings/errors remain visible.

2026-11-03 desktop Shape Library compact pass: removed Show ghost preview and duplicate sidebar Stamp once at preview controls; opening/closing library still manages preview, and canvas Apply stamp remains available. Move/Rotate share one compact row; lengthy stamping instructions moved into a tooltip with a short keyboard hint.

2026-11-03: Desktop Shape Library heading now uses an SVG matching the VR stamp icon geometry.

2026-11-03: Hid the routine autosave waiting-for-idle message; warnings remain visible.

2026-11-03 Phase 6.0 radial Cut follow-up: moved Cut from the centre to its own tenth radial sector with a split-plane icon. Existing nine tools retain their full card dimensions; centre Options returns to 280×144. Shared drawing and hit tests use ten sectors. Production canvas reviewed at outputs/phase-6-0-radial-cut-wheel.png. Physical Quest acceptance remains pending.

2026-11-03 Snap feedback: the shared 15° button dims to 55% opacity when angle snap does not apply to the current tool/settings, while remaining clickable. Applicability follows actual engine behavior: free-axis Straight Line strokes except Smooth, plus Move rotate/twist. A reusable presentation-only line extends the snapped stroke from its captured origin; Move rotation uses a snapped pivot spoke. Guides hide during commit, cancel, misses, tool changes and tracking/menu interruption and dispose with their tools. New both-hand host tests verify directions, transformed origin, unchanged source fields, cleanup and preference availability. Physical Quest guide visibility/usability remains pending.

Snap feedback validation: strict TypeScript, production build and complete suite **1,316/1,316 PASS** (--test-concurrency=4); diff whitespace check passed. New guide cases cover left/right hands, origin transforms, snapped line/rotation angles, cancellation/release, unchanged source data and dimmed-but-clickable preference state. Existing Vite bundle-size advisory remains. No commit or push performed.

2026-11-03 publication: user explicitly authorized committing and pushing Phase 6.0, radial Cut placement and Snap feedback, including a polished dated What’s New entry. This supersedes the earlier no-commit restriction for these changes. Physical Quest acceptance remains pending.

Revocation follow-up: after the user revoked access, both `scene_summary` and a
`create_primitive` attempt returned `agent_access: Approve connection in the active
editor first.` No modelling command was admitted. This verifies disconnected read/
write refusal, not revocation of an already-running capture.

Read-only manual acceptance (2026-11-08): first attempt was invalid because the
user had left Allow editing on; the admitted 10 mm test box was immediately undone.
After the user corrected the switch, scene_summary succeeded, create_primitive
returned `agent_access: Read-only connection. Enable editing in the browser.`,
and the follow-up summary retained revision `72330570-7955-4dfd-bbf7-de1b05deea04:13`
and four objects. Read-only read/write separation passed; no permission defect
was demonstrated.

Proposal rejection manual acceptance (2026-11-08): user rejected the staged
rename proposal. get_proposal returned `rejected/error`; attempted application
returned `permission_denied: Explicit browser proposal approval required.`
The scene remained at revision `72330570-7955-4dfd-bbf7-de1b05deea04:13`, four
objects, with Outline demo box 1 retaining its original name. Rejection passed.
