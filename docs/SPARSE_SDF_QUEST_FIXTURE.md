# Quest 3 exact-queue fixture

2026-11-12 (Australia/Melbourne). Device follow-up to the
[desktop local-quota comparison](SPARSE_SDF_LOCAL_EXACT_RESULTS.md).

## Device attempt

The USB-connected Quest 3 appeared as an authorized ADB device. The
host served the generated fixture on loopback and mapped the port over
USB. Android accepted the Quest Browser launch intent. The headset
woke, but its screenshot showed **Finding position in room**. The
system reported that it could not detect movement. Quest Browser did
not expose a remotely debuggable tab during the attempt. The temporary
headset-worn simulation was ended and the test's ADB tunnels and local
listener were closed. The temporary worn-state probe used
[Meta’s documented proximity simulation](https://developers.meta.com/vr/documentation/native/android/ts-scriptable-testing/).

Immersive WebXR remained unverified. The attempt collected no headset
replay measurements. The headset-capable build passed all 12 runs
in desktop mode with the expected 461,818 final triangles and matching
exact field and mesh checksums. Focused tests passed 10/10 and quick
tests passed 21/21. Full check passed format, lint, types and build,
then 1,748/1,753 tests passed. Five loopback tests failed on sandbox
`listen EPERM`.

## Fixture and resume

The fixture adds a separate **Enter VR and run** button. Immersive
replays service the same 1 mm exact queue inside actual WebXR animation
callbacks. Each replay places the model 1.45 m ahead of the first valid
viewer pose, converting mm to m. The report records the session's
advertised refresh rate, measured callback intervals, CPU draw
submission, and exact field and mesh checksums. It leaves GPU completion
and perceived latency outside the instrumentation.

When the headset has room tracking and Quest Browser is interactive,
start the fixture over the USB loopback route documented by
[Meta Browser remote debugging](https://developers.meta.com/vr/documentation/web/browser-remote-debugging/).

```sh
node scripts/benchmark-paced-renderer.mjs work/paced-renderer/headset.html work/narrow-band-perf/cost-aware/growth-exact-3-narrow-cap8-1-1.json --local
node scripts/research/serve-paced-renderer.mjs
```

In another terminal:

```sh
adb reverse tcp:4182 tcp:4182
adb shell am start -a android.intent.action.VIEW -d http://127.0.0.1:4182/ -p com.oculus.browser
adb forward tcp:9229 localabstract:chrome_devtools_remote
node scripts/research/quest-paced-renderer.mjs status
node scripts/research/quest-paced-renderer.mjs start
```

The start helper sends the click to the generated tab only, and
requires a visible page with an enabled immersive button. Use
`node scripts/research/quest-paced-renderer.mjs status` to check progress.
After PASS, `node scripts/research/quest-paced-renderer.mjs save` saves
the immersive report under `work/paced-renderer`. The runner performs
12 runs and ends its own XR session. Remove the two test tunnels and
stop the loopback listener afterward.

## Bulk Undo memory profile

The generated memory fixture compares exact progressive extraction
with the batched 40 MiB latest-Undo cache. It runs three alternating
pairs at each of 72 and 90 Hz that the XR session advertises and allows
requesting. When neither target is available through the frame-rate
API, it runs three pairs at the session's existing rate. The report
records both requested and observed rates, callback gaps, estimated
missed callback slots, first draw submission and full draw submission.
The estimated missed slots come from callback timestamps. Compositor
drops and GPU completion need device instrumentation.

Page checkpoints record exact page bytes, mesh arrays, halo scratch
and cached bytes. The grown cache shares the live mesh backing arrays.
During erase, exact pages remain reachable through the Undo revision.
The before-growth, grown, erased and restored checkpoints each hold
for 2.5 seconds outside the timed restore to give the USB sampler a
chance to observe each phase. The collector adds a host receipt
timestamp to align these markers with ADB samples.

```sh
node scripts/benchmark-bulk-undo-renderer.mjs work/paced-renderer/quest-memory.html work/narrow-band-perf/cost-aware/growth-exact-3-narrow-cap8-1-1.json --profile
node scripts/research/serve-paced-renderer.mjs work/paced-renderer/quest-memory.html work/paced-renderer/quest-memory-checkpoints.jsonl
```

Start the USB loopback and remote control as in the preceding section.
Before selecting **Enter VR and profile memory**, start a separate
terminal sampler with a fresh output path and a duration long enough
for the paired replays.

```sh
node scripts/research/sample-quest-memory.mjs work/paced-renderer/quest-os-memory.jsonl 300
```

Pass the Quest serial as the optional third argument if multiple devices
are attached. The sampler discovers Quest Browser processes by package
and process name, reads PSS for each, and records machine-readable
`gpumeminfo` output separately. Its timestamps bracket each sequential
scan. A scan can miss brief peaks and PSS and GPU figures can overlap.
Compare both deltas and timestamps against the page markers. An empty
GPU reply means the tool supplied no rows for that PID. A failed PSS
reading is stored as unknown. For the timed comparison, run a second
pass without the ADB sampler if its overhead is material.

The short read-only USB smoke check recorded PSS for the main Browser
process and two subprocesses, with GPU rows from two. The localhost
collector accepted a test checkpoint. The updated shared renderer
completed all nine desktop-control restores with matching exact
geometry. Immersive tracking and on-device cache results remain open.

Focused tests passed 13/13 and quick tests passed 21/21. Full check
passed format, lint, strict types and build, then 1,752/1,757 tests
passed. Five loopback tests hit sandbox `listen EPERM`.

### Room tracking fallback

The bulk memory replay now requests immersive WebXR in a `local`
reference space. It uses generated edits and a viewer-relative initial
placement, so the floor and physical controller poses are unnecessary.
It waits briefly for a viewer pose and records whether the initial
position is emulated. Quest Browser still controls immersive session
availability and can refuse or supply no pose when room tracking is
unavailable. See the
[WebXR tracking behavior](https://immersive-web.github.io/webxr/spatial-tracking-explainer.html).

If Quest Browser becomes interactive in the headset's
**Continue without tracking** mode, try **Enter VR and profile memory**
first. The same page also offers **Profile in Browser panel**. The
panel mode starts a regular WebGL replay, uses the same cache-off and
40 MiB policies and emits the same memory checkpoints. It does not
request WebXR or 72/90 Hz and its report is labeled `panel`.
Use it for on-device process and GPU memory comparison if the
immersive path remains unavailable. The panel timing remains separate
from immersive frame acceptance.

With the local tab open and reachable over DevTools, the remote helper
can start and save panel runs explicitly:

```sh
node scripts/research/quest-paced-renderer.mjs start-panel
node scripts/research/quest-paced-renderer.mjs save-panel work/paced-renderer/quest-panel-report.json
```

Meta's [scriptable testing controls](https://developers.meta.com/vr/documentation/native/android/ts-scriptable-testing/)
can simulate wearing the headset and manage its boundary setting.
They address separate device controls from a tracked browser pose.
The fixture does not change system tracking or boundary settings.

The tracking-independent panel smoke test completed six headless
Chromium restores with matching exact field and mesh checksums.
The localhost collector received all 24 panel checkpoints.

### 2026-11-12 Quest 3 Browser panel

An immersive request reached the headset's room-position prompt.
Reloading the local test tab cleared the pending request, and the
Browser panel completed the replay over USB with no headset interaction.
The fixture held each memory checkpoint for 2.5 seconds.

| Policy | Trials | First draw submission median | Full restore median (range) |
| --- | ---: | ---: | ---: |
| Progressive | 3 | 7.1 ms | 7,967 ms (7,769–8,253 ms) |
| 40 MiB cache, batched | 3 | 9.4 ms | 191.2 ms (184.3–191.3 ms) |

All six restores matched exact field and mesh checksums with 461,818
triangles. Times describe WebGL draw submission in the Browser panel.
Immersive frame timing and GPU completion remain unmeasured.

Each erased checkpoint retained 8,005,632 bytes of exact pages.
Cached trials also retained 33,250,896 bytes (31.71 MiB) of CPU mesh
buffers. Across five complete USB scans per policy within erased
checkpoint windows, summed Browser PSS was 522.8 MiB median
(509.0–531.0) for progressive and 523.0 MiB (511.2–525.9) for cached.
The highest sampled PSS across the replay was 560.4 MiB. The median
sum of reported raw GPU totals at the erased checkpoint was 122,261,504
for both policies. PSS covers the Browser processes, including
co-resident tabs and allocator carryover, and can overlap GPU counters.
The scan cadence can miss peaks. This run establishes the fixture's
buffer cost and does not establish the cache's marginal process cost
or the device's memory headroom.

Local run data is in `work/paced-renderer/quest-remote.1zSkzA/`.
Use `panel-report.json` for timing and parity, `checkpoints.jsonl` for
fixture-owned bytes, and `os-memory.jsonl` for process samples. Align
checkpoint and scan windows using host timestamps. The next panel run
should add co-resident edited layers and repeat the cache-off/cache-on
comparison in separate Browser processes to reduce allocator carryover.
Immersive acceptance still requires a usable WebXR pose.

### 2026-11-12 Remote prompt and resident layer replay

The Quest's room-position dialog exposed **Continue without tracking**
in its Android UI hierarchy. The virtual panel display tap did not
dismiss it. Tapping the same button bounds on the focused Android
display dismissed it and returned focus to Browser. The pending
immersive request stayed at Ready without a frame or checkpoint.
A test-tab reload and fresh immersive request did the same during the
bounded observation. The Browser panel remained the usable test path.

Pass an optional final `2` after `--profile` when generating the bulk
fixture to keep two additional layers resident. They are independent
copies of the same edited branch with distinct exact pages and mesh
buffers, placed separately and drawn in the same scene. Their page and
mesh bytes are recorded separately at each checkpoint. The copy count
is capped at two and defaults to zero.

```sh
node scripts/benchmark-bulk-undo-renderer.mjs work/paced-renderer/quest-loaded.html work/narrow-band-perf/cost-aware/growth-exact-3-narrow-cap8-1-1.json --profile 2
node scripts/research/serve-paced-renderer.mjs work/paced-renderer/quest-loaded.html work/paced-renderer/quest-loaded-checkpoints.jsonl
node scripts/research/quest-paced-renderer.mjs reload
node scripts/research/quest-paced-renderer.mjs start-panel
```

The initial loaded run completed two restores per policy, then hit the
15-second deadline in the third progressive restore. The collector
saved 19 checkpoints before the abort. A bounded retry gave the loaded
panel 30 seconds per restore. The single-layer panel retains its
15-second deadline. Both loaded runs reused the same Browser instance
to avoid interrupting other tabs. Process memory comparisons therefore
include allocator carryover.

A missing deadline variable aborted the first retry before any restore.
After correcting it, the retry completed all six restores with matching
exact field and mesh checksums and 461,818 triangles in the edited
layer. The two other layers stayed resident throughout each restore.

| Policy | Trials | First draw submission median | Full restore median (range) |
| --- | ---: | ---: | ---: |
| Progressive | 3 | 17.5 ms | 13,870.8 ms (13,381.6–14,743.6 ms) |
| 40 MiB cache, batched | 3 | 19.1 ms | 380.2 ms (370.4–420.1 ms) |

The additional layers held 16,011,264 exact-page bytes and
66,501,792 CPU mesh bytes (78.69 MiB combined). The cache retained
another 31.71 MiB during erase. Complete scans in erased checkpoint
windows gave a summed Browser PSS median of 869.5 MiB for progressive
(three scans) and 870.3 MiB for cached (two scans). The sampled peak
across the run was 934.8 MiB. These sparse whole-Browser observations
show that the tested scene ran at this load. They do not establish
marginal cache cost, memory headroom, or an immersive frame budget.
Keep the 40 MiB policy research-only until isolated memory and
immersive validation.

Local data is in `work/paced-renderer/quest-tracking.YA5E2J/`.
The successful run uses `retry-panel-report.json`,
`retry-checkpoints.jsonl`, and `retry-os-memory.jsonl`.
`npm run check` passed format, lint, types and build. The sandboxed
suite passed 1,752 of 1,757 tests. All 30 tests in the three loopback
files passed when rerun with localhost binding enabled.

### 2026-11-12 Dedicated renderers per cache policy

The panel generator accepts a final `progressive` or `cache-batched`
argument after the resident layer count. Each panel replays only its
selected policy. Serve each fixture on a USB loopback port
and open it in a dedicated test tab. The port may be reused after the
previous test tab closes. The DevTools helper accepts the
test tab URL as its third positional argument. Close only the dedicated
test tab between policies. Browser and GPU services are shared across
the tabs, so compare the individual renderer PIDs in the Android
samples and report whole-Browser figures separately.

```sh
node scripts/benchmark-bulk-undo-renderer.mjs work/paced-renderer/progressive.html work/narrow-band-perf/cost-aware/growth-exact-3-narrow-cap8-1-1.json --profile 2 progressive
node scripts/research/serve-paced-renderer.mjs work/paced-renderer/progressive.html work/paced-renderer/progressive-checkpoints.jsonl 4183
node scripts/research/quest-paced-renderer.mjs start-panel unused http://127.0.0.1:4183/
```

Repeat with `cache-batched` after closing the first test tab. The run directory includes a
DevTools tracing helper that emits a timestamp marker from the test
page and reads the renderer PID from that marker. Match that PID
against the Android process snapshots from before and after the tab
opens. Keep the short trace outside timed work for repeat runs.

DevTools verified distinct Android renderer PIDs. The initial
progressive run (11364) hit the 30-second deadline in its first restore.
The first cache launch on port 4184 did not expose a usable test tab.
Both policies completed on port 4182 in fresh renderers (cache 15507,
then progressive 18101). The Browser parent and privileged process
persisted. Existing Browser tabs were left open. The report saver
initially expected six trials because the generator omitted the
single-policy label. The saver was corrected before collecting the
three cached results, and the generator now includes the label.

| Policy | Trials | First draw median | Full restore median (range) | Erased renderer PSS | Peak sampled renderer / Browser PSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Progressive | 3 | 23.0 ms | 16,440.6 ms (15,831.8–16,841.6 ms) | 232.3 MiB | 302.4 / 982.9 MiB |
| 40 MiB cache, batched | 3 | 19.8 ms | 406.8 ms (400.7–551.8 ms) | 239.4 MiB | 272.8 / 942.3 MiB |

All six completed restores had matching exact field and mesh
checksums and 461,818 edited-layer triangles. Each policy had one
complete PSS scan in an erased checkpoint window. The aborted
progressive run had a 219.6 MiB erased renderer reading. These samples
are too sparse to estimate the cache's marginal PSS reliably. The
known retained CPU buffer cost is 31.71 MiB. Peak PSS is a sampled
observation and the two policies ran sequentially with shared Browser
services. Keep the 40 MiB ceiling research-only. Production adoption
still needs tracked immersive validation and repeated process memory
measurements with more than one scan per phase.

Artifacts are in `work/paced-renderer/quest-isolation.E5NEkI/`, with
the successful progressive results under `progressive-repeat/`.
Run `python3 summarize.py repeat` in the artifact directory to
reproduce the successful comparison. Omit `repeat` to show the
original progressive attempt. The sandboxed full check passed
1,752/1,757. All 30 tests across the three affected files passed with
localhost binding enabled.
