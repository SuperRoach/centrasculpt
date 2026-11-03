# Running tests efficiently

`npm run test:full` (also `npm test`) runs every test file. Core TypeScript is transpiled to ignored `work/test-build/` modules; a content cache now rebuilds only changed modules. Cache keys include compiler version/options/source and verify output hashes, so missing or corrupted output is rebuilt. Transpilation does not replace type checking: use `npm run check` for format, lint, strict TypeScript, production build and the complete suite.

For short feedback loops:

```sh
npm test -- move-worker
npm test -- persistent-move rotation-move
npm test -- move-worker --test-name-pattern=abort
npm run test:worker
npm run test:changed
npm run test:quick
TEST_CONCURRENCY=2 npm run test:full
npm test -- rotation-integration turntable vr-stress bake advanced-brush --test-concurrency=5
npm run --silent test:tap > coverage/test-results.tap
npm run --silent test:junit > coverage/test-results.xml
```

File arguments match test file paths by substring. Multiple arguments select their union. A typo that matches no file fails rather than silently running zero tests. Node test options use `--test-*=value` syntax. Full runs default to `--test-concurrency=4`; set `TEST_CONCURRENCY` or pass `--test-concurrency=N` to adjust the cap. Four limits simultaneous heavy test processes while retaining useful parallelism on this machine.

`test:worker` runs the Move persistence/rotation/worker suites using the real reconstruction worker through a Node worker_threads adapter. This complements the default cooperative Node path. Browser rendering and Quest controller acceptance still require their separate checks.

`test:changed` considers staged, unstaged and untracked changes against HEAD and follows static and literal dynamic relative imports, including test helpers and transitive source imports. Changes to scripts/configuration or a source file without a known test dependency conservatively run the full suite. Documentation/output-only changes select no tests. This is a development aid; use **full `npm run check` before handover**. With an accumulating uncommitted change set, affected selection naturally stays broad. Runtime-computed module imports, external data-file reads and browser-only behavior are not modeled by the import graph; use full validation for these changes.

Benchmarks stay separate from correctness tests. Run the relevant benchmark when performance-sensitive code changes; don't rerun all benchmarks for documentation or runner-only changes.

## Runner choice

The project keeps Node's built-in `node:test` runner. It already fits the suite's native ESM test files, TypeScript transpilation/cache layer, actual `worker_threads` fixture and WebXR mocks. Node reporters provide TAP and JSON output without another dependency, while the repository wrapper adds filename/pattern selection and conservative impacted-test selection. Bounded concurrency addresses the known Move-worker contention behavior.

| Runner | Startup and dependencies | TypeScript, ESM and worker fit | Coverage, watch and agent workflow |
| --- | --- | --- | --- |
| Node `node:test` (selected) | No extra runner dependency; current compile cache is already fast | Native ESM and actual worker adapter are already used; browser/WebXR fixtures stay unchanged | TAP and JUnit reporting; focused/changed/full commands; Node coverage flags available; no custom watch command yet |
| Vitest | Adds a runner and Vite-powered transform/config layer | ESM and TypeScript are convenient, but worker_threads and browser/WebXR mocks would need compatibility validation | Good watch and coverage tooling; migration is justified only by measured faster feedback or missing capabilities |
| Jest | Adds runner, transform and ESM configuration overhead | Requires adapting native ESM and TypeScript, with extra care around workers and WebXR mocks | Mature watch/coverage ecosystem, but those benefits do not offset migration work for this suite today |

No evidence currently shows Vitest or Jest would improve this suite's end-to-end time. Revisit if browser-level component testing, richer coverage gates or interactive watch workflows become project needs.

## Measured on this Mac, 2026-10-26

- Original full suite: 12.27 s shell wall time, 629 tests. Updated full suite: 11.87 s runner wall time, same 629 tests. Single observations, not a reliable full-suite speedup claim.
- Cold compilation preparation: 232 ms; warm preparation: 5 ms (67 cached modules). Includes runner preparation, excludes interpreter/module startup before the timer.
- Focused worker file: 4 tests, 0.22 s runner wall time.
- Worker integration command: 61 tests, 5.03 s runner wall time.

New runner/cache regression tests increase the full-suite count. The meaningful improvement is avoiding unrelated tests during iteration and redundant compilation, while keeping full regression coverage available by default.

## Top-five heavy suites, 2026-11-03

The focused batch `rotation-integration turntable vr-stress bake advanced-brush` ran 88 cases. On this host it took 17.98 s at concurrency 4, 26.53 s at 2, and 15.09 s / 14.27 s in two runs at 5; all runs passed. Use concurrency 5 for this focused batch when useful. Keep the full-suite default at 4 because the full test suite has had Move-worker timeouts under higher contention. Timing is machine- and load-dependent; do not treat this as a full-suite speedup claim.
