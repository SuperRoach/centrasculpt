# Running tests efficiently

`npm test` remains the full regression suite. Core TypeScript is transpiled to ignored `work/test-build/` modules; a content cache now rebuilds only changed modules. Cache keys include compiler version/options/source and verify output hashes, so missing or corrupted output is rebuilt. Transpilation does not replace type checking: use `npm run build` for TypeScript and production bundle validation.

For short feedback loops:

```sh
npm test -- move-worker
npm test -- persistent-move rotation-move
npm test -- move-worker --test-name-pattern=abort
npm run test:worker
npm run test:changed
```

File arguments match test file paths by substring. Multiple arguments select their union. A typo that matches no file fails rather than silently running zero tests. Node test options use `--test-*=value` syntax; for example `--test-concurrency=4` limits simultaneous test processes if memory pressure is a problem. No default concurrency change was made.

`test:worker` runs the Move persistence/rotation/worker suites using the real reconstruction worker through a Node worker_threads adapter. This complements the default cooperative Node path. Browser rendering and Quest controller acceptance still require their separate checks.

`test:changed` considers staged, unstaged and untracked changes against HEAD and follows static and literal dynamic relative imports, including test helpers and transitive source imports. Changes to scripts/configuration or a source file without a known test dependency conservatively run the full suite. Documentation/output-only changes select no tests. This is a development aid; use **full `npm test` and `npm run build` before handover**. With an accumulating uncommitted change set, affected selection naturally stays broad. Runtime-computed module imports, external data-file reads and browser-only behavior are not modeled by the import graph; use full validation for these changes.

Benchmarks stay separate from correctness tests. Run the relevant benchmark when performance-sensitive code changes; don't rerun all benchmarks for documentation or runner-only changes.

## Measured on this Mac, 2026-10-26

- Original full suite: 12.27 s shell wall time, 629 tests. Updated full suite: 11.87 s runner wall time, same 629 tests. Single observations, not a reliable full-suite speedup claim.
- Cold compilation preparation: 232 ms; warm preparation: 5 ms (67 cached modules). Includes runner preparation, excludes interpreter/module startup before the timer.
- Focused worker file: 4 tests, 0.22 s runner wall time.
- Worker integration command: 61 tests, 5.03 s runner wall time.

New runner/cache regression tests increase the full-suite count. The meaningful improvement is avoiding unrelated tests during iteration and redundant compilation, while keeping full regression coverage available by default.
