# Centra Sculpt roadmap

## Phase 8.9c — Boolean rendering performance

The dense Boolean preview uses conservative cutter culling and regional
updates for eligible moves. Native projects continue to use v24. See
[Phase 8.9c results](PHASE_8_9C_BOOLEAN_RENDERING.md) for timing, memory and
device coverage before moving on to Phase 9.

## Phase 8.9a — Canonical native projects

Every native save writes v24. The 20-source electronics enclosure fits with
63³ source grids under the existing project caps. The v1–v23 migration
reader remains available for old files, Library entries and recovery
checkpoints. Retain the importer through further cross-platform and archive
validation. Confirm full editor staging on Quest before retiring it.
See [Native project format](NATIVE_PROJECT_FORMAT.md).

## Phase 8.8f — Native save admission and export scheduling

- The native triangle count now gates parametric changes and assembly batches.
  Keep the 1,000,000-triangle archive limit and previous .form compatibility.
- The four bounded-fixture STL parts download in Chromium and match the
  previous native artifacts byte-for-byte.
- Design a versioned analytic-source format and load-time cache budgets if
  all 20 sources must fit in one file from default resolution. Keep recovery
  compatibility and verify exact reconstruction before changing serialization.
- Measure physical fit using the five retained 1:1 coupons.

## Phase 8.8e — Electronics enclosure MCP and physical fit

- Use the local MCP browser review flow for measured connector openings, posts
  and associated button refits. Inspect stale and deleted-reference links.
- Run the isolated integration harness and generate actual-size wall, plunger
  and retainer coupons from the tested native fixture.
- Print and assemble the coupons to verify cable reach, shaft clearance,
  actuator travel and adhesive retention.
- Reconcile modelling admission with the native triangle limit at the default
  source resolution. Verify browser export and evaluated diagnostic timing
  for the full electronics workload.

## Phase 8.8d — Connector presets, associated openings and captured buttons

- Pi 4 and ESP32 V4 openings prefill verified nominal dimensions from board
  drawings. Complete the measurements the drawings leave unspecified.
- Review and confirm an updated opening when a reference moves. The update
  keeps its cutter identity and also refits associated button parts.
- Print a captured plunger and socketed retainer as separate parts. Physical
  fit and bond durability still require a print trial.
- Follow-up for lids includes lid-owned attachment sources, base/lid-specific
  Boolean ordering, validated rim clearances, native persistence and Undo/Redo.

## Phase 8.8c — Connector cutouts and printable button plungers

- Desktop base-wall previews and measured openings for Pi 4, ESP32, generic
  ports and tactile switches.
- Optional independent round plunger with measured travel, shaft fit and an
  exterior cap stop.
- Pending physical-print acceptance for cable access, shaft fit and travel.
  Lid openings, retention features and immersive feature editing remain open.

## Phase 8.8b — Interactive 3D component placement

- Desktop reference picking, Move and Rotate handles, axis constraints and
  drag cancellation.
- Enclosure-relative floor and lid snapping with configurable clearance,
  positioning along the mounting plane and fit warnings.
- Preview and confirm associative posts for Pi 4, Pi Zero 2 W and Generic PCB.
  Native saves retain display-only component references.
- Immersive editing
  and physical Quest testing remain deferred.

## Phase 8.8 — 3D electronics component references (2026-11-23)

- Five built-in dimensioned presets, separate project reference quota, and
  desktop placement with desktop and VR rendering.
- Enclosure base and lid attachment, surface snapping and confirmed Pi 4
  mounting posts through the existing enclosure feature recipe.
- Deferred work includes connector and actuator cutouts, printable plungers,
  headset placement controls and physical Quest acceptance.

## Phase 8.6e — MCP enclosure performance follow-up (2026-11-23)

- Combined create p50 improved from 18.74 s to
  11.28 s with 27 → 17
  MCP calls. Shorter mesh scheduling waits require fewer status requests.
- Dedicated stdio-to-Chromium measurements cover basic, electronics and
  associative edit fixtures, with native project round trips and Undo/Redo.
  See the [benchmark and handover](PHASE_8_6_ENCLOSURE_MCP.md).
- Retain existing proposal approval and source admission boundaries. Phase 9
  sparse SDF remains deferred.

## Phase 8.6c — Discoverability & UX Polish (2026-11-18)

- Desktop follow-up adds direct project menu actions for browser saves and
  portable files, contextual Layers shortcuts, and focus retention on redraw.
- Delivered selection-driven desktop Text editing and enclosure feature settings,
  clearer Key/Fill/Rim and Inspection Light labels, announced Scale guidance,
  and accessible Export preset help. Save/Open Project controls identify native
  `.form` files.
- Focused tests, build and disposable Chromium text/lighting/export and
  enclosure/face-resize flows passed. The full `npm run check` result and
  remaining narrow-width acceptance are in the dated [development handover](DEVELOPMENT_STATUS.md).
- Phase 8.6d element-level authentic screenshots are deferred until the user is
  at their PC; the handover includes selectors and a crop list. Physical Quest
  shadow performance remains unverified. Phase 8.7 I/O performance, Phase 9
  sparse SDF and the two MCP smoke/benchmark follow-ups remain separate.

## Phase 8.6a/8.6b — Enclosure MCP performance and common flows (2026-11-18)

- Delivered actual local stdio MCP profiling and an atomic enclosure + cutout +
  mounting-post proposal, plus async preview/apply status and compact polling.
- The complete three-trial comparison measured 38.23 s / 77 tool calls for the
  sequential flow versus 24.48 s / 50 calls for the combined flow (36% shorter,
  35% fewer calls), with approvals and Undo entries each reduced from five to
  one. A later compact-polling rerun completed all three combined trials, but
  its sequential refresh stopped on an editor heartbeat failure; see the
  [Phase 8.6 handover](PHASE_8_6_ENCLOSURE_MCP.md) and raw benchmark artifact.
- Preview source-cache validation skips display-mesh preparation on its isolated
  dry-run clone. Apply still builds the full mesh and uses the normal consent,
  revision, lock, cancellation, rollback and resource guards. Save/load/export
  optimisation and Phase 9 sparse SDF remain deferred.
- Discoverability improvements are recorded for later documentation capture;
  authentic cropped desktop and Quest screenshots remain deferred until PC use.

## Three-point lighting shadows (2026-11-16)

- Delivered an optional shadow toggle inside Key Light settings on desktop and
  immersive World Settings. Uses a bounded orthographic frustum and a fixed
  1024 × 1024 PCF soft map. Visible sculpt and Boolean result chunks cast and
  receive self-shadows; Fill and Rim do not cast. Inspection Light always casts
  while active. Legacy Key shadow preference defaults off.
- No quality selector pending physical Quest 3 performance measurement. Shadow
  rendering adds a scene pass, so headset frame time remains an acceptance item.

## Phase 8.5b — Editable Text Primitives (2026-11-16)

- Desktop creates and edits short single-line text sources using the bundled
  Helvetiker Regular font. Cached vector contours preserve counters and feed the
  existing analytic source, Boolean, history, native `.form` v23, recovery,
  Project Library, STL and GLB paths.
- VR can place default text through the existing controller workflow. Detailed
  source editing in VR, path/conforming text, uploaded fonts and complex shaping
  are deferred. Quest, print and slicer acceptance remain open.
- Phase 9 sparse-SDF production integration and separate save/load/export
  optimisation work remain deferred.

## Phase 8.5a — Box Face Resize (2026-11-15)

## Phase 8.5a — Box Face Resize (2026-11-15)

- Desktop Scale exposes the original boundary and six face markers for a selected
  rectangular box without child layers. Drag along a face normal to move just
  that side. Boolean cutters are picked from their source guides, even through
  the result. The centre gizmo retains symmetric scaling.
- Dimension and pose publish in one Undo entry. The existing Boolean draft can
  update during the drag, then refines at the chosen quality.
- Next: immersive pointer ownership and physical Quest validation, plus resize
  semantics for boxes parenting other sources and for shapes with curved faces.

## Phase 9 — Deferred sparse SDF performance and integration

**Phase 9.1** adds an opt-in sparse backend for newly created empty sculpts.
Dense remains the default. Compact and admitted metre traces match exact
dense geometry. Compact CPU latency, physical Quest measurements, and
the 1 mm metre-scale trial remain gating work.
[Implementation, measurements and reproduction](PHASE_9_1_SPARSE_SDF.md)

**Phase 9.2** adds live sparse diagnostics, age-ordered release service and pagewise halo gathering.
[Interactive measurements and remaining acceptance gates](PHASE_9_2_SPARSE_PERFORMANCE.md)

**Phase 9.3** verifies exact local brush, mask, paint and local mirror parity
and hardens sparse dab publication and cancellation. Personal Shape source
capture copies resident pages. Sparse stamp targets and Move-family
reconstruction remain pending. Dense remains the default pending paired
Quest parity, measured peak memory with Undo and 1 mm metre-scale support.
[Tool matrix and compact bust measurements](PHASE_9_3_SPARSE_TOOLS.md)

**Phase 9.4** integrates sparse Boolean operands, sparse Bake/Merge and
analytic or Personal Shape stamps into admitted sparse targets.
[Tool support and measured results](PHASE_9_4_SPARSE_BOOLEAN_STAMPS.md)

**Phase 9.5** preserves the sparse backend through v25 native open, Library
and recovery. Clay can grow an implicit exterior in either signed direction
at fixed spacing. The 1 mm tube reaches 1,000 mm. The 1,000 mm diagonal
branch and islands reach the current chunk-directory limit.
[Native persistence, growth and replay results](PHASE_9_5_SPARSE_PERSISTENCE_GROWTH.md)

**Phase 9.6** adds bounded sparse Move-family reconstruction, fixed-spacing
Move growth on an admissible exterior, active-layer Plane Cut and idle
reclamation of exact implicit pages after their history and reader pins
release. Mirror during sparse Move and multi-layer sparse Cut All are gated.
[Implementation, verification and handover](PHASE_9_6_SPARSE_MOVE_CUT_RECLAMATION.md)

**Phase 9.7 · Production readiness.** Keep sparse opt-in through readiness.
The remaining gates are the full
1 mm metre-scale fixtures, paired physical Quest timing and isolated peak
process/renderer/GPU memory. OPFS prefetch and clean-page eviction are a
separate storage experiment with stable records, explicit residency and
transactional checkpoint manifests. Indexed live geometry is separate
mesh work.

Only outstanding 8.3c work moved here on 2026-11-15. Completed 8.3a/b research
and the implemented Undo cache stay in Phase 8. An adaptive brush candidate
needs to preserve frame pacing before integration. Measure peak memory with
the live Undo cache on larger scenes and repeat immersive measurements before
expanding the current trial.

The 8.3b.1 feasibility results gate any production trial. Once the exact-storage and
transaction gates pass in isolation, use the compact Quest 3 replay and the
8.3b.1 halo prototype as starting points for tests under Centra's normal
frame scheduling. The earlier device replay measured 198.9 ms sparse
versus 45.8 ms dense for median synchronous Smooth remeshing.

1. **Speed up dirty remeshing.** Profile brick lookup, sample gathering,
   gradient stencils and extraction separately. Prototype gathering a dirty
   chunk and its halo into reusable contiguous Float32 scratch once per
   rebuild. Reuse those reads for crossings and normals, skip chunks proven
   to contain no crossings, and compare each change with the dense mesher
   on identical fields and dirty regions.
2. **Keep meshes current during continuous strokes.** Compare both backends
   with the same in-app mesh budget. Coalesce repeated invalidations, prioritize
   chunks under the brush, and bound queued work and scratch. Check Undo,
   Redo and cancellation while rebuilds are pending. Measure stroke-to-visible
   mesh latency and time to clear the queue after release.
3. **Verify on Quest 3.** Alternate backend order in repeated compact-bust
   runs with Clay, Smooth and Undo. Repeat at 1 mm spacing across
   100/500/1,000 mm using a connected sculpt, a branch and separated pieces.
   Record p50/p95/p99 stroke-to-visible latency, frame times, missed frames
   and peak memory over sustained sculpting. At the same detail and refresh
   rate, require sparse to match dense p95/p99 stroke-to-visible latency
   and missed-frame rate on the compact workloads, with a bounded mesh queue.
   At sizes beyond dense admission, verify sustained latency, quality and
   safe budget refusal directly on sparse.
4. **Gate a default switch.** Verify the Phase 8.3b savings thresholds with
   measured retained and peak memory, including histories, masks, paint,
   source snapshots, staging, CPU meshes and GPU allocations. Pass the
   existing geometry, sampling, transaction, Boolean, Stamp and exact
   save/recovery/backup gates. Trial sparse as an opt-in backend for new
   sculpts before considering it as the default. Keep the dense open path
   for existing projects until lossless compatibility is demonstrated.

## Phase 8.4 — VR Sculpting Experience Polish (2026-11-12)

- **8.4a Move.** Default Free Move combines translation and wrist rotation in
  one persistent gesture. Existing Translate, Elastic, Rotate and Twist
  settings reopen as saved. Default controller-tip and optional Surface placement share the
  frozen layer frame. Live non-elastic radius growth is capped at 25% over
  the starting size and the existing maximum. Elastic retains live softness.
- **8.4b Feedback.** Two translucent, depth-tested Move shells and a shared
  logarithmic Tool-controller ruler. The ruler reflects brush radius or Stamp
  scale and fades when sizing stops.
- **8.4c Menus.** Coloured icon navigation for Layers, World, References and
  Personal Library. References has immersive placement and browser import.
  Personal Library hands off to browser Personal Shapes. The Tool Wheel has
  icon-only Mask, Paint and Project actions, a mesh ray and a circular hover tip.
- **Verification.** Disposable Chromium WebGL and menu fixtures exercised Move,
  native round-trip, Undo/Redo, tracking cancellation and menu presentation.
  Quest controller ergonomics, Passthrough contrast and headset frame timing
  remain physical acceptance gates. See the
  [Phase 8.4 development handover](DEVELOPMENT_STATUS.md#phase-84--vr-sculpting-experience-polish--2026-11-12).

## Phase 8.3b — Narrow-band SDF and large sculpt space (2026-11-12)

Offline 8³ prototype evaluated 2/3/4-voxel bands, explicit signed far fields,
exact fallback, negative/grown lattices and local staged edits. At 1 mm spacing,
the analytic tube and branch allocate approximately in proportion to occupied
length. Five separated clusters use nearly constant storage as the space
between them grows. The existing exact masters plus cache fail the working
memory gates. The 2026-11-12 follow-up grew a connected 1,011.99 mm tube
from empty with retained edits at 1 mm spacing and verified new-page Undo
and Redo at 100/500/1,000 mm. The 3-voxel stroke high-water model reached
35.79 MiB including the CPU mesh and four edit patches. Median CPU stroke
time stayed within 26.69–29.20 ms across the span windows.
[Results and Quest 3 checklist](SPARSE_SDF_83B_RESULTS.md)

**Production integration remains gated.** Require a bounded, lossless
editable representation for arbitrary Float32 projects and measured working
savings of ≥50% vs values+scratch and ≥25% vs values alone. Warm lookup must
remain ≤2× dense median with no case >3×, repeated field evaluation ≤1.5×, and
crossing signs, topology and full native/master fidelity must agree. Keep the
interpolation ≤1e-6 model-unit, normal component ≤1e-4 and mesh ≤0.01-voxel
geometry gates. Production transaction and failure handling, growth and Undo,
masks/paint, Boolean far fields, exact stamp source snapshots, export/workers,
native/recovery/backup roundtrips and physical headset acceptance remain open.

The compact-bust follow-up on Quest 3 matched dense and sparse field and
mesh checksums at 1 mm detail. Sparse lowered the modeled finished footprint
by 57%. Synchronous CPU brush and remesh medians were 3.8–4.4× dense, with
dirty remeshing dominant. Dense remains the everyday default.
[Compact sculpt comparison](SPARSE_SDF_COMPACT_SCULPT_RESULTS.md)

## Phase 8.3b.1 — Sparse CPU performance follow-up (2026-11-12)

The local research harness gathers a dirty chunk and its two-sample halo into
one reusable Float32 tile. On the compact bust, the direct-key 3-voxel path
reduced median Smooth edit and remesh from 52.50 to 13.60 ms. Dense took
11.46 ms. All seven exact field and mesh checkpoints matched across six
trials per variant. The two-level directory provided limited savings, and
the contiguous halo accounted for most of the measured latency improvement.
At the metre checkpoint, the 1 mm branch reached 9.92/12.93 ms p50/p95
with a modeled 48.84 MiB stroke high-water. The five islands stayed near
3.5–3.6 MiB retained from 100 to 1,000 mm. These are offline CPU and working
model results.

**No-go for scoped production 8.3c.** The exact-master working-memory and
transaction gates remain open. The next isolated test should measure a
bounded lossless exact page store with hot and cold reads, brush and CSG
transactions, and measured decode/cache and save peaks. Continue to use the
halo replay as the dirty-mesh comparator.
[Phase 8.3b.1 results and reproduction](SPARSE_SDF_83B_PERF_RESULTS.md)

## Phase 8.3b.2 — Lossless exact-page feasibility (2026-11-12)

A bounded LRU of byte-shuffled deflate blocks preserved exact Float32 data,
the test patch, Undo/Redo and a streamed raw roundtrip across eleven 192³
masters. The best transformed median was 47.44 ms for 640 queries, versus
the 1.5× dense gate. **No-go for this interactive reader.** Prioritize a
new-from-empty exact sparse edit and dirty-mesh transaction prototype
under the same budgets.
[Measured exact-page results](SPARSE_SDF_EXACT_PAGES_RESULTS.md)

## Phase 8.3b.3 — Resident exact pages and dirty scheduling (2026-11-12)

For new-from-empty sculpts, exact pages feed the halo directly. At 1 mm
spacing the metre branch used 40.99 MiB modeled resident and took
8.30/11.03 ms synchronous CPU p50/p95. Exact geometry and normals matched.
Four compact pairs against dense also matched all seven checkpoints.
The bounded FIFO reached 192 pending chunks and 47 ticks of p95 age.
**Production 8.3c remains a no-go.** Narrow dirty invalidation and test
brush-local priority with a starvation bound before repeating the
same burst replay.
[Results and reproduction](SPARSE_SDF_SCHEDULED_RESULTS.md)

## Phase 8.3b.4 — Changed-sample invalidation and brush priority (2026-11-12)

Narrow coverage reduced branch median dirty keys from 64 to 20 and
extra admission slices from 1,878 to 37 by the metre checkpoint. Alternating
brush priority reduced near-brush p95 age from 47 to 16 ticks versus narrow
FIFO and raised all-key p95 age from 47 to 86. **Carry narrow FIFO forward
for offline research. Production 8.3c stays gated.**
[Results and reproduction](SPARSE_SDF_DIRTY_PRIORITY_RESULTS.md)

## Phase 8.3b.5 — Paced dirty meshing (2026-11-12)

At 45 modeled edits/s, narrow FIFO removed branch admission stalls but
still needed 16 logical slots to drain at metre release. At 90 edits/s
it filled the 192-key queue and drained in 45 slots. Occupancy screening
and deadline priority left the metre drain essentially unchanged.
**Keep narrow FIFO for research. Production 8.3c stays gated.**
[Results and reproduction](SPARSE_SDF_PACED_RESULTS.md)

## Phase 8.3b.6 — Service ceilings and coarse mesh preview (2026-11-12)

At 90 modeled edits/s the metre branch drained in 10 logical slots
with eight exact chunks per slice, down from 45 with four. The soft
2 ms cutoff was exceeded more often. A 2 mm local preview took 0.58 ms
p95 to extract, with roughly one quarter of exact triangles in the
whole-branch audit. Thin-feature loss and mixed-resolution seams
require a fallback and transition handling. **Production stays gated.**
[Results and reproduction](SPARSE_SDF_PREVIEW_RESULTS.md)

## Phase 8.3b.7 — Cost-aware exact mesh slices (2026-11-12)

At 90 modeled edits/s, recent cost reduced metre-branch slices over
2 ms from 81% to 17% and increased median release drain from 10 to
14 slots. The tube drain rose from eight to 23 slots. Keep the
eight-chunk throughput baseline and carry recent cost into a renderer
comparison. **Production 8.3c stays gated.**
[Results and reproduction](SPARSE_SDF_COST_CUTOFF_RESULTS.md)

## Phase 8.3b.8 — Paced WebGL draw submission (2026-11-12)

At 90 offered edits/s, desktop Chrome brush-local p95 was 53.57 ms
with FIFO and 56.38 ms with recent cost. Exact catch-up p95 was
78.47 and 83.89 ms. Recent cost cut exact slices over 2 ms from 19%
to 5%. Final exact checksums matched in 12 replays. Test a seam-safe
preview against FIFO next. Production remains gated.
[Results and reproduction](SPARSE_SDF_RENDERER_RESULTS.md)

## Phase 8.3b.9 — Guarded coarse preview (2026-11-12)

The seam and fine-detail guard admitted no coarse candidates in the
metre-branch Chrome fixture. Of 6,345 candidate visits, 6,333 hit a chunk
boundary and 12 were empty. All 12 runs retained exact final parity.
Independent coarse replacement stays out of the connected sculpt path.
[Results and reproduction](SPARSE_SDF_GUARDED_PREVIEW_RESULTS.md)

## Phase 8.3b.10 — Brush-local exact quota (2026-11-12)

At 90 offered edits/s, a two-chunk local quota reduced typical
brush-local draw from 22.71 to 9.12 ms in desktop WebGL. Exact
catch-up p95 rose from 80.01 to 85.49 ms. All 12 final exact
checksums matched. Compare on device before considering integration.
[Results and reproduction](SPARSE_SDF_LOCAL_EXACT_RESULTS.md)

## Phase 8.3b.11 — Resident-page lifecycle (2026-11-12)

Eighteen metre-scale grow/erase cycles restored identical fields and
meshes. Settled tracked buffers fell from 39.62 MiB grown to 0.25 MiB
after eviction. Full-branch Undo took 556 ms median with synchronous
CPU rebuilding. Test bounded bulk Undo and failure handling next.
[Results and reproduction](SPARSE_SDF_LIFECYCLE_RESULTS.md)

## Phase 8.3b.12 — Progressive bulk Undo (2026-11-12)

A fully erased metre branch restored exact CPU geometry in 447 ms
median with a first CPU mesh in 2.31 ms after retry. Interrupting erase
and reusing unchanged buffers reduced full completion to 8.36 ms.
All 36 restores passed the failure and exact-parity probes. Test
paced renderer publication next. Production remains gated.
[Results and reproduction](SPARSE_SDF_BULK_UNDO_RESULTS.md)

## Phase 8.3b.13 — Bulk Undo draw submission (2026-11-12)

Headless WebGL progressive Undo drew its first restored geometry in
2.30 ms median and finished in 5.20 s at the observed callback cadence.
Interrupted erase reuse finished in 99.20 ms. Exact checksums matched.
A byte-capped mesh cache is the next full-restore comparison.
[Results and reproduction](SPARSE_SDF_BULK_RENDERER_RESULTS.md)

## Phase 8.3b.14 — Latest bulk Undo mesh cache (2026-11-12)

The 40 MiB test cap retained 31.71 MiB of branch CPU buffers. Batched
restore drew first at 1.2 ms and finished in 412 ms median, versus
5.13 s for progressive extraction at the headless cadence. The 24 MiB
cap retained zero bytes and fell back exactly. Production stays gated.
[Results and reproduction](SPARSE_SDF_UNDO_CACHE_RESULTS.md)

### Completed sparse research follow-through (formerly tracked under 8.3c)

The [experimental Undo cache switch](SPARSE_SDF_UNDO_CACHE_RESULTS.md#2026-11-12-default-off-editor-trial)
is on by default in the editor and can be turned off in the Layers
panel. It retains one eligible voxel-stroke snapshot up to 40 MiB.
The tracked Quest replay verified exactness and faster submission on
a compact sculpt.

The independent adaptive brush option completed its
[tracked Quest comparison](SPARSE_SDF_BRUSH_ADAPTIVE_RESULTS.md#tracked-quest-results).
It improved exact catch-up and increased callback intervals. Keep it
in research until a candidate preserves frame pacing.

Remaining work moved to [Phase 9](#phase-9--deferred-sparse-sdf-performance-and-integration).

## Phase 8.3a — Dense vs sparse research (2026-11-11)

Standalone 8³/16³ lossless read-only brick prototype and 78-case 64/128/192 matrix
complete; [research report](SPARSE_SDF_83A_RESULTS.md) contains raw evidence,
fresh-process cold/warm timings, source/target bounds study and integration audit.
No production storage or quality/cap change. Exact samples, interpolation, normals
and mesh buffers agree. All fixture payload bricks remain allocated; modeled
metadata increases values-only footprint. Simple Map lookup is about 4× slower.
Four-voxel candidate occupancy suggests further research, not achieved savings.
Full check: 1,720/1,725, five socket `listen EPERM` failures; focused 7/7, quick 21/21.

Implementation and verification are separate gates. Historical results below are
not fresh acceptance runs; consult the corresponding DEVELOPMENT_STATUS.md handover
for counts, evidence and outstanding limitations. No blanket hardware or print
acceptance is implied.

| Phase | Implementation | Automated | Browser | Quest | Physical print |
| --- | --- | --- | --- | --- | --- |
| 8.0.1 / 8.0.2 | Saved/restored Personal SDF stamping; shared desktop/XR single and continuous path; scalar sampler and bounded preview buffers | Actual 66-case fixture matrix: 53 admitted, 13 safely refused; thin-feature failures recorded; see Personal Stamp results | Disposable restored Use as Stamp, Add/Subtract, Undo/Redo and asset independence passed | Physical controller/thermal/memory acceptance pending | Not run |
| 8.0 | Personal Shapes Save → Browse → Insert; separate persistent SDF masters, genuine thumbnails, pivots, calibrated independent editable copies and native/export compatibility | Full check 1,706/1,706; personal 8/8; guide 8/8 | Chromium save/thumbnail/new-project/two insertions/reload/rename/delete passed | Project handoff implemented; physical acceptance pending | Not run |
| 7.6.1 | Documentation polish: 26 pages, three illustrated tutorials, 17 authentic desktop captures with zoom, interactive source-accurate Tool Wheel schematic, glossary and tool-choice guide | Docs 8/8; full root check 1,698/1,698; screenshot dimensions/provenance and links checked | All 26 routes passed axe, Pagefind, keyboard/search, mobile layouts, touch/wheel/lightbox and reduced-motion checks; real holder prepared STL 110 × 27 × 50 mm | Authentic wheel/submenu captures pending; no fresh hardware acceptance | No new print test |
| 7.6 | Public static field guide in read-the-docs-pls; 23 task-based guides, Pagefind, themes, mobile navigation and MCP holder examples | Docs 7/7; root check 1,696/1,696 | In-app browser harness 174 assertions; axe, 23 routes at 1440/390/320 px, actual search and subpath links; screenshots | Not run | Not run |
| 7.5.4c | Exact STL compaction promoted; original fallback; visible STL evaluates ordered cutters; bounded interactive preview; guarded curved STL reduction opt-in | 1,693/1,693 follow-up full; 96 main paired attempts; 16 coarse-enclosure refusals retained | Chromium export/lifecycle passed; 16 in-app worker comparisons byte-identical; native Lens visible High 192/256, Unified parity, 200 mm target and native/history preservation passed on production preview | Not run | Not run |
| 7.5.4b | Off-by-default STL precompaction and offline constrained decimation experiments | 1,679/1,679 full; paired byte hashes, topology, slot and curved-surface checks | Production 1:1 STL ready; four identical High STL comparison outputs; Chromium launcher blocked | Not run | Not run |
| 7.5.4a | Repeatable isolated fixture/native-copy benchmarks and decoded geometry/silhouette diagnostics; timing split only, no algorithm/default/limit change | 1,677/1,677 full; 42/42 focused; 96 main benchmark attempts preserved native/history | Fresh-origin in-app worker/download/cancel checks passed; both scripted Chromium launches blocked | Not run | Not run |
| 7.5.3 | Export dialog, metadata estimates and measured pipeline profiles; existing conservative planar quality retained; curved decimation off | Final 1,670/1,670 full; 61/61 focused passed | In-app worker/download/modal checks passed; separate Chromium launch blocked | Not run | Not run |
| 7.5.2 | Explicit sizing, tighter/256³ export, arbitrary-plane High and lifecycle correction | 1,667/1,667 full handoff checks passed | Final export/physical-report and lifecycle browser checks passed | Not run | Original holder pending |
| 7.5.1 | Capability/workflow/hostname support and HTTP UUID fallback implemented | 1,667/1,667 full; 19/19 focused passed | Hostname stdio/approval/holder/captures/Undo/restart/production smoke passed | Not run | Not run |
| 7.4.2 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 7.2 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 7.4.1 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 7.4 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 7.3.1 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 7.3 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 7.1 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 7.0 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 6.6 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 6.5 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 6.4 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 6.3 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 6.2.1 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 6.2 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 6.1 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 6.0.3 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 6.0.2 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 6.0.1 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 6.0 | Historical implementation recorded in development status | Historical results; see phase handover | Partial or pending; see handover | Partial or pending; see handover | No phase-wide validation |
| 7.5 cleanup | Evaluated object/part isolation implemented; reliability acceptance in progress | 1,652/1,652 full; 27/27 focused passed | Installed Chromium smoke and isolated PNG delivery passed; expanded lifecycle scenarios pending | Not run | Not run |
| Future export work | Safe curved decimation, predictive estimates, compaction reuse and wider hardware acceptance | Pending | Pending | Pending | Pending |

The user's enclosure-and-lid print is **one successful real-world fit test**.
It does not validate other dimensions, clearances, features, printers or materials.

## Phase 7.5 remaining acceptance

- Implemented: disposable evaluated object/part geometry, stable identification,
  auto framing and existing camera presets.
- Implemented: no-reload Vite restart with explicit fresh approval; browser regression added.
- Remaining expanded acceptance: rejection/revocation during active capture and stale-tab takeover.
- Active-tab ownership, stale sessions, editor replacement and cleanup.
- Proposal atomicity, one-step Undo, cancellation, errors and stale revisions.
- PNG delivery and bounded payloads. Preserve consent and permission checks.
- Distinguish missing browser binaries or host restrictions from application defects.

## Phase 7.5.1 remaining acceptance

- Verify official stdio `tools/list` schemas and `get_capabilities` parity, including
  scoped preview arguments, current build/session identity and restart guidance.
- Run the automated holder challenge through the real browser editor and official
  MCP SDK; verify separate approval, unchanged pre-apply scene, exact Boolean graph,
  evaluated bounds/captures and one Undo within the 20-layer limit.
- Codex/Cursor cached tool exposure cannot be established from repository tests;
  confirm via each client's MCP panel after refresh/reconnect. Quest hardware remains
  a separate acceptance gate.

## Remaining export optimisation

Phase 7.5.3 delivers measured profiles, a dedicated dialog and conservative metadata
estimates. Next investigate compaction reuse at the measured bottleneck, narrower
predictive estimates and opt-in curved decimation only with physical-error,
feature/topology and memory evidence. Keep full-triangle preparation and all
correctness/refusal paths available. Hardware/physical fit acceptance remains separate.

## Manual browser acceptance — 2026-11-08

User passed competing-tab refusal, explicit revoke-and-handover with scene
preservation, and reconnect after closing the owning tab without revocation.
Revocation during capture and Quest acceptance remain pending.

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

## Phase 7.5.2 export correctness

Explicit desktop session sizing: 1:1 default, casual target 200 mm, deliberate
100 mm retained; consistent STL millimetres / GLB metres. Pre-encoding evaluated
bounds/scale/quality summary and reference STL display-normalisation explanation.
No confirmed primitive substitution defect; original-holder comparison remains
pending. See [investigation](PHASE_7_5_2_EXPORT_CORRECTNESS.md).
Larger export modal, feature-preserving decimation, triangle estimates and
performance optimisation remain in the future export phase.

### Export detail follow-up

Implemented tighter staged analytic bounds, empty dense-layer exclusion and an
optional256³ export maximum;192³ stays default. Actual evaluated resolution is
reported. Viewport/Bake/native limits and final format safety admission remain.
Dense models can now hit final limits because more grid samples cover their actual
features. The historical detailed-house fixture is an explicit-refusal regression
under the new layout (unchanged intermediate meshing ceiling), not a current successful export claim. Feature-preserving
decimation, performance improvements and modal redesign remain deferred.

### Polygon efficiency benchmark — 2026-11-09

Current High already performs global planar one-ring simplification. More global
passes on the disposable holder reduced High by6.02% at192³ and8.48% at256³,
with7–11 s candidate global compaction in single Node runs. No automatic extra
passes shipped. Next investigate whole-planar-patch boundary/hole reconstruction
and constrained retriangulation with geometry/memory/cancellation proofs, then
benchmark before changing defaults. [Evidence](PLANAR_EXPORT_BENCHMARK.md).

### Implemented: exact planar-region simplification in High

High now reconstructs supported exact axis-aligned patches across prepared chunk
boundaries, with holes and seam vertices retained. Holder reconstruction reductions
versus previous High:8.76% at192³,12.24% at256³. Unsupported/painted/curved regions
are retained and all admission/cancellation guards stay active. See
[implementation and verification](PLANAR_EXPORT_SIMPLIFICATION.md). Arbitrary-plane
and feature-preserving curved decimation, performance profiling, triangle estimates
and export modal redesign remain deferred.

Planar-region final acceptance:1,662/1,662 full checks passed; real browser worker
cube29,292 →18,132 triangles with unchanged bounds/Undo, plus sizing/GLB/failure
checks passed. Physical/Quest acceptance and broader arbitrary-plane cases remain
separate; no hardware performance claim.

### Export lifecycle correction

Confirmed and fixed unrequested blur/hidden export cancellation. Export continues
through focus changes; true lifecycle interruptions retain a cause, and only
Cancel/Escape are user cancellations. Disposable browser lifecycle regression
passed High unified download and Undo preservation. Real freeze/OS-background/
Quest scheduling acceptance remains separate.

### Arbitrary-plane High export

Implemented connected oblique-region simplification with fixed-plane round-off
bounds and strict seam/hole/local/world-bound retention. Curvature beyond that
allowance is rejected. Existing budgets, cancellation and local cleanup tolerances
remain. Rotated-holder benchmark:5.11%/9.14% fewer triangles than an axis-only
reference at192³/256³. Browser rotated cube:45.46% fewer versus Fast, matching
bounds/Undo. [Verification and limits](ARBITRARY_PLANE_EXPORT.md).
General curved-surface decimation, performance work, triangle estimates and modal
redesign remain separate work.

Final2026-11-09 handoff verification supersedes earlier permission-limited runs:
1,667/1,667 full checks and final MCP/export/lifecycle browser checks passed.
See the latest Development Status handoff for scope and remaining hardware gates.

## Phase 7.5.3 — Export performance, quality and UX

Implemented a dedicated native dialog, explicit prepared-file confirmation,
metadata-only quality slider estimates with stated uncertainty, generated counts,
stage timing/resource reports and meshing progress. Fresh prerequisite correctness
tests passed before optimisation work. Existing planar simplification and all
scale/evaluator/safety semantics remain. No new curved decimator or unmeasured
performance gain is claimed. See [metrics, limits and evidence](PHASE_7_5_3_EXPORT_OPTIMISATION.md).
The holder's precompaction dominates; curved High costs more without reducing
triangles. Predictive estimates, QEM proof, whole-process memory control, broader
multi-part/modal/browser and physical hardware acceptance remain future work.


## Optional curved export and controls — 2026-11-10

File type/preset moved to the top; actual-size switch below. Advanced now exposes
an experimental, default-off STL curved-reduction checkbox with sampled tolerance
in mm and ✓ applied / ✕ fallback. Candidates must pass bounded checks or retain
the original. Default geometry, source data, GLB and printable-part precision paths
remain. No global fit guarantee or automatic curved reduction is shipped.
[Evidence, safety limits and limitations](EXPERIMENTAL_CURVED_EXPORT.md).

## Phase 7.5.4c — Validation and production integration

Promoted the byte-preserving evaluated-STL chunk path after paired 192/256 Fast/High
comparisons. The original chunk pipeline remains available by explicit argument;
no export limits, SDF evaluator, source schema, sizing or modal controls change.
Lossy QEM stays offline after organic/topology failures. Source sampling can still
miss sub-grid walls; improving that is separate from exact compaction.
[Measured results, acceptance evidence and rollback](PHASE_7_5_4C_EXPORT_INTEGRATION.md).

## Phase 7.5.4b — Experimental export optimisation

[Timing, memory, geometry, rejection matrix and exact-mode reproduction](PHASE_7_5_4B_EXPORT_EXPERIMENT.md).
The experimental STL compactor preserved tested bytes and accelerated the warm dense curved case.
Gentle decimation met the sampled gates on mechanical fixtures; dense organic clay reverted at every target.
The exact chunk experiment is promoted in 7.5.4c with the original fallback. Keep lossy
decimation outside product controls; heavy native organic evidence, measured mating
surfaces and bounded peak memory remain gates for any lossy mode or changes to limits.

## Phase 7.5.4a — Export benchmark and diagnosis

[Evidence and exact Astra run instructions](PHASE_7_5_4A_EXPORT_BENCHMARK.md).
Four disposable fixtures at 192³ plus the supplied read-only Lens native copy at
192/256³, Fast/High, STL/GLB: one discarded + three measured isolated runs per case.
Lens is a mechanical holder; organic Astra remains unavailable. Lens STL medians:
11.14/11.99 s at 192³ and 19.85/20.74 s at 256³, preserving checked physical bounds,
topology and source/native/history. Synthetic holder extraction is ~1 ms, while
precompaction costs ~8.5–8.7 s; curved High spends ~3 s without triangle reduction.
Format-specific High refusals and RSS above admission budget are recorded, not bypassed.

Phase 7.5.4b warrants Extra High effort investigation into compaction allocations/
reuse first, feature-preserving curved simplification next, adaptive SDF extraction
then optional artist retopology. No production algorithm or limit change authorised
by this research result. Require physical-error, topology, visual, memory/work,
cancellation/stale-source and native-preservation evidence before a 7.5.4c release.
Field residuals and raster masks are not Hausdorff, pocket-depth or print-fit proofs.

## Phase 7.6 — Public Documentation & Learning Experience (2026-11-10)

Delivered locally in `read-the-docs-pls/`, separate from this engineering archive.
See its README for build/preview/static deployment and SOURCE_AUDIT for current
source authorities. All app/export/agent engine and project data remain unchanged.
Publication requires separate authorisation; nothing was committed or deployed.
Historical Phase 7.6 next-step note: Phase 8.0 Personal Shape Library has since
been implemented; custom stamps remain outstanding (see audit below). UX follow-ups are recorded in
[Phase 7.6 UX gaps](PHASE_7_6_UX_GAPS.md). Hardware/physical acceptance remains separate.

### Phase 7.6 same-site Help follow-up — 2026-11-10

The app build includes the guide/search in `dist/read-the-docs/`; development
servers serve the same route. Centra Sculpt logo menu → Help opens a separate tab
with a base-aware local URL. Deploy the complete app dist normally after separate
authorisation. Root npm ci supplies Pagefind; no nested docs install is required
for app build/dev. App modelling/export/agent engines remain unchanged.

## Phase 8.0 — Personal Shapes

Implemented locally: separate versioned IndexedDB library, evaluated selected sculpt/Boolean-root capture, actual thumbnail review, names/dimensions/dates, Centre/Base centre pivots, lossless gzip and integrity validation, explicit limits, confirmed rename/delete, independent editable insertions with Undo/redo and native/export compatibility. Source-history collections remain deferred. Quest Project entry exits XR for browser controls; no physical headset acceptance claimed.

- 8.0.1: Implemented locally: Personal Shape stamping from exact saved-master snapshots, calibrated pivots, shared desktop/XR pipeline and bounded derived previews.
- 8.0.2: Actual fixture quality/performance measured; scalar sampling and preview allocation improvements. Thin-feature failures and dense-memory refusals are documented, not waived. Physical Quest, sustained browser peaks and print acceptance remain open.
- 8.1: Editable component collections retaining construction.
- 8.2: MCP/agent integration.

See [Personal Stamp results](PERSONAL_STAMP_RESULTS.md) and the current development handover for verification and limitations.

## Phase 8.0.0 — Shape Library Backup & Restore (2026-11-10)

Implemented Personal Shapes export/download and import/validate/preview/confirm. Binary version 1 preserves exact stored masters and thumbnail strings with SHA-256 integrity; atomic merge preserves existing records and copies identifier conflicts. Imported fingerprints suppress repeat restores. Explicit memory/count/file/storage admission refuses excess without reducing geometry. Cross-profile Chromium acceptance includes restored insert/edit/.form/STL. Physical Quest file picker, downloads, storage estimates and memory acceptance remain pending. Custom stamps were deferred at this backup/restore milestone and are now implemented in 8.0.1. The backup/restore milestone itself did not change the modelling engine.


## Historical pre-implementation audit — 2026-11-10

Superseded by the Personal Stamp implementation and measurements in [PERSONAL_STAMP_RESULTS.md](PERSONAL_STAMP_RESULTS.md). The audit below records the checkout before that work.

Local HEAD c94c893 plus uncommitted backup/restore work is authoritative. 8.0.0 is
implemented with earlier two-profile restore/insert/edit/native/STL evidence. Fresh
focused tests pass 119/119; full audit check passes format/lint/types/build and
1,707/1,712 tests, with five socket-bind EPERM failures. Fresh Chromium launch fails;
previous 1,712/1,712 and browser passes remain historical evidence. See the latest
six-part DEVELOPMENT_STATUS handover for exact logs and limits.

**8.0.1 is not implemented here.** Built-in Shape Stamp supports four analytic kinds;
Personal Shapes supports independent insertion. Restored-master stamping, custom detail
caches and custom quality/performance have no verified results. Start 8.0.2 fixture and
measurement preparation now; complete 8.0.1 before claiming custom-stamp polish or
acceptance. Hardware release gates remain open. No engine changes in this audit.

### Ranked Phase 8.0.2 — Stamp Quality, Performance & Usability

1. **P0: establish a real custom stamp path and restored-master gate (8.0.1 dependency).**
   Accept when original and cross-profile restored masters stamp identical destination
   samples for Add/Subtract, and repeated uses leave master bytes/metadata unchanged.
   Specify whether sampling uses decoded master directly or an intermediate cache;
   retain source grid/step, disclose cache step and refuse unsupported quality rather
   than silently losing detail. Verify current library limits and conflict copies.
2. **P0: quality matrix and placement contract.** Run all fixtures below at destination
   64/128/192 with fixed physical bounds, Add and Subtract, Centre/Base pivots, two
   calibrations, identity plus translated/rotated/uniform-scaled targets and X symmetry.
   Accept exact Float32 agreement with an independent reference using the declared
   sampling policy; report geometric error against the high-detail master separately.
   Keep holes/slots open when aperture spans >=4 destination voxels; for smaller features
   report loss explicitly. Set numeric surface-error tolerances before optimisation.
   Verify preview and commit agree on pivot, scale, orientation and placement; separately
   test surface misses, normal alignment and transformed/workspace coordinates.
3. **P1: repeat, Undo and bounded failure.** Replay 20 fixed poses, overlap and stationary
   samples in single and continuous modes. Accept one Undo per click/whole stroke,
   exact redo, no cross-layer/master mutation, bounded queues and full rollback for
   cancel, tracking loss, stale target, invalid master, quota and staging admission.
   Test restored shapes through real UI as well as engine API integration.
4. **P1: reproducible CPU/chunk/memory baseline.** Capture first decode/preparation,
   warm sampling/CSG, history, mesh, queue-drain and Undo separately; 3 cold runs and
   >=20 warm observations per fixture/resolution/operation. Record host/browser/build,
   pose trace, p50/p95/max, scanned/evaluated/changed voxels, changed/total mesh chunks,
   actual layout and source/cache/target/history/staging bytes. Measure retained after
   selection/repeat/deselection and observed peak heap/process memory with method and
   limitations stated. Accept bounded cache lifetime and no retained growth across
   repeated select/release cycles; set device budgets from measured baseline before
   claiming speed/memory wins. No invented Quest or custom-stamp timing targets.
5. **P1: desktop and physical Quest usability/portability.** Verify discoverable selection,
   preview/loading/error/cancel states, mm size and pivot controls, XR/browser handoff,
   file picker/download/transfer and restored stamping on a second device. Accept with
   recorded device/browser and user-visible outcomes; simulated XR is separate evidence.

### Fixed baseline fixture specification (to generate, not existing accepted assets)

Use 100 mm source bounding cube, fixed 192³ evaluated master where representable,
Centre and Base metadata variants, plus analytic/reference construction retained in
.form. Save checksums, exact dimensions, source step and generator/version/seed before
runs. Destination bounding cube is 100 mm at 64/128/192; feature widths must also be
reported in source and destination voxels. Keep masters unchanged across target runs.

| Fixture | Concrete geometry | Inspect/accept |
| --- | --- | --- |
| Horn | 60 mm curved tapered horn, 12 mm root diameter, 2 mm rounded tip, 90° bend | Tip length, curvature, root/pivot pose and mirrored silhouette |
| Organic curve | 60 mm bent capsule, 10 mm diameter, 1/2/4 mm surface ridges | Smoothness, ridge survival and error from master, without cumulative resampling |
| Hollow part with hole | 40×30×20 mm shell, 3 mm wall, 8 mm through bore | Connected bore and cavity, wall thickness, Add/Subtract topology |
| Long thin shape | 75×3×3 mm bar plus 1/2/4 mm cross-section variants, rotated 35° | Continuity, endpoint length, orientation bias and refusal/detail warning |
| Mechanically precise slot | 40×25×12 mm block with 20 mm long slots at 1/2/4/8 mm widths | Aperture, straight/parallel faces, depth and measured dimensional error |

These are proposed controlled fixtures, not measured results or print-fit guarantees.
Separate master capture error, cache error and destination discretisation. Preserve
both exact sample comparisons and topology/physical measurements; a low-resolution
stamp cannot recover absent source detail. Reuse this same dense baseline and traces
when investigating sparse storage later, comparing equal output/error, retained/peak
bytes and CPU/chunk work. Sparse storage design/implementation remains out of scope.


### 8.0.2 fixture preparation follow-up — 2026-11-10

The offline [baseline harness](PERSONAL_STAMP_BASELINE.md) now generates 11 evaluated
192³ `.form` fixtures with calibration and exact native sample roundtrip checks,
hashes, reference fields and a fixed 20-pose trace. The first complete run is retained
under `work/personal-stamp-baseline/2026-11-10T12-23-20.143Z/`. Procedural geometry
checks pass 3/3. Read-only interpolation probes and process snapshots are preparation
results, not custom stamp quality/performance or retained/peak-memory acceptance.
Actual destination stamping, restore integration, pivots, Undo/chunks and Quest remain
open; 8.0.1 remains the dependency. No app engine or public feature changed.

Preparation validation: required full check now passes format/lint/types/build and
**1,715/1,715 tests**, zero failures/skips; quick 21/21 and fixture 3/3 also pass.
The earlier audit socket restrictions did not recur in this run. Browser and physical
Quest acceptance remain separate and pending for custom stamping.
