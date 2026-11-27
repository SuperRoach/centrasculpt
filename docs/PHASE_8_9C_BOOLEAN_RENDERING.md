# Phase 8.9c — Boolean rendering performance

The renderer prepares one colour evaluator per build pass. Each chunk uses
the same source pose, graph and base colours as the sampled field. Geometry-only
builds skip the colour pass. Empty chunks allocate no colour buffers, and
unpainted operands with one common base colour skip per-vertex ownership.
Painted and differently coloured faces retain the existing winning-operand and
tie rules. During interaction, a transient cutter now supplies face colour at
its preview pose. The previous version sampled colour at the committed pose.

Field sampling can skip a plain box, rounded box or straight cylindrical leaf
used as a difference operand. If its conservatively rounded local slab distance
already loses to the accumulated field, evaluation returns that field value
verbatim. Nested operands, arrays and other primitive types use their original
samplers. Consecutive identical min/max folds sample once. The preview's
admission limit still uses the original worst-case work count and grid choice.

A settled move of an eligible first difference cutter on a box dirties the old
and new pose bounds, each padded past the maximum depth at which the cutter can
win. Regions accumulate across moves before the next rebuild. A changed lattice,
shared or nested cutter, or unsupported operand stack falls back to the full
path. Interior sculpt edits retain regional updates. Boundary edits and arrays
take the full path because clamped exterior samples or other instances can
change. A source change cancels an interactive build. Pose churn may finish
the already prepared draft while leaving the next revision pending.

The mesher reuses tetrahedron classification scratch and computes winding
without temporary per-triangle vectors. Extraction order, interpolation,
gradient sampling and the degeneracy threshold are preserved. The memory
budget now counts attached chunk colours, including when a draft and refinement
coexist. Exports can read those already evaluated colours from current chunks.

## Desktop measurements

Baseline `71a25f6` and local Phase 8.9c were run on the Apple M5 Pro host
with Node v26.8.1. Each fixture used one warm-up
and three measured repeats per stage. The timer starts after fixture setup and
excludes the editor's 120 ms debounce. Draft time is cumulative from the start
of the build. The test uses the normal yielding compositor, including its
memory and work caps, without GPU upload or frame drawing.

| Workload | Grid | Baseline / colour / culling / regional / final, ms | Baseline → final observed range, ms | Draft baseline → final, ms |
| --- | ---: | ---: | ---: | ---: |
| Simple box cut | 85³ | 386 / 438 / 352 / 379 / 354 | 382–391 → 351–355 | — |
| 20-source electronics enclosure | 128³ | 8,274 / 7,512 / 6,144 / 6,379 / 6,371 | 8,196–8,291 → 6,219–6,393 | 558 → 481 |
| 12 distinct cylindrical cutters | 128³ | 4,704 → 2,615¹ | 4,701–4,747 → 2,601–2,646 | 413 → 310 |
| 20 repeated references to one cutter | 85³ | 1,544 / 1,520 / 629 / 676 / 648 | 1,534–1,546 → 640–670 | 313 → 234 |
| Dense 128³ sculpt field with Boolean cut | 128³ | 1,120 / 1,087 / 996 / 1,101 / 1,098 | 1,111–1,139 → 1,079–1,108 | — |
| Moving cutter, first changed draft | 64³ | 234 / 214 / 205 / 225 / 222 | 234–240 → 220–225 | Same as wall |
| End of cutter interaction | 85³ | 384 / 380 / 349 / 370 / 345 | 379–398 → 344–351 | — |
| Two settled cutter moves | 85³ | 391–398 / 381–384 / 341–356 / 264–270 / 244–253 | 388–414 → 240–254 | — |
| Thin slot preview | 192³ | 4,491 / 4,278 / 3,507 / 3,835 / 3,693 | 4,408–4,523 → 3,687–3,736 | 252 → 236 |

¹ The 12-distinct-cutter follow-up measured the baseline and final version.

The settled moves reduced field work from 614,125 samples to 255,142–268,339
and rebuilt 150 of 216 chunks. Interactive movement retains the existing
lower-resolution draft path. The dense workload's final wall-time change was
small. Revision checks and complete colour accounting added some wall time
after the culling-only stage. Three trials show the size of the effect
on this host and leave small differences sensitive to load.

| Workload | Field sampling, ms | Colour wall including yields, ms | Chunk meshing, ms |
| --- | ---: | ---: | ---: |
| Simple box cut | 96 → 77 | 28 → 28 | 103 → 81 |
| 20-source electronics enclosure | 2,383 → 1,451 | 3,433 → 2,945 | 570 → 512 |
| 12 distinct cutters | 1,604 → 477 | 1,333 → 1,004 | 353 → 293 |
| Repeated cutter | 642 → 67 | 157 → 130 | 72 → 59 |
| Dense sculpt | 317 → 245 | 161 → 174 | 255 → 259 |
| Moving cutter, first changed draft | 46 → 41 | 52 → 48 | 76 → 62 |
| First settled cutter move | 106 → 41 | 30 → 27 | 100 → 65 |
| 192³ thin slot | 1,197 → 714 | 535 → 536 | 734 → 639 |

The 192³ pass still evaluates 7,077,888 samples and extracts 670,192
triangles. Its median maximum sampling and mesh/colour slices were about
3 ms and 6 ms. These maxima measure individual CPU slices and exclude GPU
or frame timing.

## Allocation and memory

The benchmark records colour-buffer counts and byte totals, final mesh
attribute bytes, tracked source/derived bytes, and sampled Node RSS, heap
and ArrayBuffer high-water marks. The observer polls at 8 ms when the event
loop permits. The baseline budget counter omitted some attached colour buffers.
RSS includes previous fixtures and allocator retention. The separate V8
allocation-sampling run includes objects collected by GC and estimates
cumulative churn. Its timings are excluded from the comparison.

| Workload | Colour buffers per final pass | Published geometry, MiB | Peak tracked, MiB | Sampled peak RSS, MiB |
| --- | ---: | ---: | ---: | ---: |
| 20-source electronics enclosure | 512 → 174 | 57.6 → 57.6 | 176.7 → 197.8 | 509.0 → 516.4 |
| Dense sculpt | 512 → 145 | 21.4 → 21.4 | 61.5 → 68.7 | 569.2 → 564.1 |
| 192³ thin slot | 1,728 → 328 | 69.0 → 69.0 | 108.0 → 133.2 | 593.8 → 625.8 |

Final colour payloads stayed at 19.2 MiB for the enclosure and 23.0 MiB
for the 192³ slot. The before/after tracked figures use different colour
accounting. They also include retained drafts when present. Both final
workloads stayed within the existing 256 MiB preview admission budget.
Sampled Node RSS did not show a consistent reduction.

V8's separate sampled allocation profile estimated enclosure colour churn
at 8.0 → 4.9 GiB and mesh churn at 2.2 → 1.6 GiB over its draft and final
passes. The 192³ slot showed 1.6 → 1.0 GiB for colour and 2.5 → 1.9 GiB for
meshing. These are sampled cumulative allocations across short-lived JS
objects and backing storage. They describe churn rather than live memory.

## Quest 3

The physical USB-connected Quest 3 ran the original and final engines in
Quest Browser 157 in a foreground flat browser tab. Each case alternated
order across paired runs, with a warm-up on both versions.

| Workload | Final median before → after | Observed final range before → after | Draft median before → after |
| --- | ---: | ---: | ---: |
| Simple box cut, 85³ | 1.62 → 1.01 s | 1.40–1.63 → 0.98–1.01 s | — |
| Thin slot, 192³ | 21.73 → 16.29 s | 21.71–21.86 → 15.87–16.96 s | 1.09 → 0.90 s |
| 20-source electronics enclosure, 128³ | 50.14 → 33.94 s | 50.07–50.21 → 33.42–34.45 s | 3.59 → 2.47 s |

The enclosure row uses the two awake pairs after the initial measured pair
was affected by headset sleep. The sleep-affected pair is retained in the
raw device report. Final tracked memory after corrected accounting was
124.6 MiB for the 192³ slot and 191.3 MiB for the enclosure. These readings
were taken after publication.

The 192³ build was still a multi-second task on the headset. The measured
median maximum mesh/colour slice went from 12.9 to 10.3 ms for this workload.
The device comparison covered CPU field evaluation and chunk construction.
Immersive frame cadence, GPU upload, rendering and OS memory remain
unmeasured.

## Verification and reproduction

Across 48 desktop comparisons, the complete final Float32 field and
ordered chunk positions and normals produced identical SHA-256 hashes.
Settled colour hashes matched. Transient cutter colours follow the
rendered pose. Native v24 bytes matched before and after each build.

`tests/boolean-composite.test.mjs` compares the optimized scalar evaluator to
the full fold around transformed leaf cutters, faces and ties. It compares
a multi-edit regional build with a forced full rebuild, including colour and
tracked geometry bytes, and exercises interactive pose churn and cancellation.
The live and staged export suites cover thin walls, Boolean order and signs,
paint ownership, watertightness, history and v24 round trips.

Quick tests passed 21/21. The focused Boolean, staged export, transform
preview and agent preview tests passed 67/67. `npm run check` passed
formatting, lint, strict types, production build and all 1,816 tests with
loopback networking enabled.

The isolated Chromium and stdio MCP smoke passed after the test suite
finished. It exercised approved Boolean edits, evaluated geometry, holder
front/isometric PNGs, Undo and bridge restart. Earlier concurrent attempts
hit an agent-history UI race and a proposal deadline.

Run the same [benchmark script](../scripts/benchmark-boolean-rendering.mjs)
on both revisions. It defaults to the local 20-source archive from Phase
8.9a. Set `BOOLEAN_BENCH_ENCLOSURE` to use another path to that fixture.

```sh
node --expose-gc scripts/benchmark-boolean-rendering.mjs work/phase-8-9c/after.json work/phase-8-9c/baseline-full.json
BOOLEAN_BENCH_ALLOCATIONS=1 BOOLEAN_BENCH_FIXTURES=enclosure,192 BOOLEAN_BENCH_REPEATS=1 \
  node --expose-gc scripts/benchmark-boolean-rendering.mjs work/phase-8-9c/after-allocations.json
```

The first positional argument is the report path. The optional second argument
is the baseline JSON for the exact-output assertions. Use
`BOOLEAN_BENCH_FIXTURES` to select individual cases.

## Meshing scheduling follow-up

The bounded editor preview now groups empty mesh batches within the existing
3 ms budget, with a maximum of 32 chunks between yields. Each batch still
publishes removals, reports progress and checks admission. Batches that
produce surface geometry and the final progress notification still yield.
Staged exports retain their existing yield cadence.

The baseline was the local Phase 8.9c working tree. Desktop results use
one warm-up and three measured repeats on the same M5 Pro host.

| Workload | Median final before → after | Median draft before → after |
| --- | ---: | ---: |
| Simple box cut | 441 → 273 ms | — |
| 192³ thin slot | 3,394 → 2,513 ms | 235 → 220 ms |
| 20-source enclosure | 6,097 → 5,941 ms | 468 → 462 ms |
| Final after moving cutter | 329 → 249 ms | — |

Across 36 comparisons, field, positions, normals and colour hashes matched,
including interactive builds. v24 bytes matched before and after each
build. The cancellation regression covers invalidation from the last
progress notification of an empty preview.

On the physical Quest 3, three awake paired 192³ runs reduced median
final time from 16.83 to 14.70 s and median draft time from 0.91 to
0.86 s. Final times ranged from 16.72–16.89 s before and 14.55–14.87 s
after. The flat browser tab's 95th- and 99th-percentile animation callback
gaps remained at 11.2 ms. The longest measured gap in these six runs was
11.3 ms in both versions.

The 20-source enclosure showed no consistent Quest speedup. One awake pair
went from 34.40 to 36.27 s and the other from 34.95 to 32.87 s.
Quest standby interrupted a third pair, which was excluded. The awake runs
had 11.2 ms p95 and p99 callback gaps, with isolated gaps of roughly 3.4–3.6 s
observed in both versions. The enclosure results do not establish parity
for rare long gaps.

Quick tests passed 21/21 and focused tests passed 68/68. The full
`npm run check` passed all 1,817 tests, and the isolated Chromium and stdio
MCP smoke passed.

These measurements cover CPU evaluation and chunk publication alongside
flat-page animation callbacks. GPU upload, drawing and immersive frames
remain unmeasured.
