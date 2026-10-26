import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {affectedTests} from './test-selection.mjs';
const started=performance.now(),args=process.argv.slice(2);
if(args.includes('--help')){
 console.log(`Usage: npm test -- [file names or substrings] [Node --test-*=value flags]
  npm test                              Full suite
  npm test -- move-worker               One matching test file
  npm test -- persistent-move rotation  Multiple matching files
  npm test -- move --test-name-pattern=abort
  npm run test:changed                  Affected tests for changes vs HEAD
  npm run test:worker                   Move contracts using actual worker module
Use --test-concurrency=4 to limit concurrent test processes. Benchmarks remain separate.`);
 process.exit(0);
}
const flags=args.filter(a=>a.startsWith('--')&&a!=='--changed'&&a!=='--worker');
if(flags.some(a=>!/^--test-[\w-]+(?:=.*)?$/.test(a))){console.error('Unsupported option. Use --help; Node options require --test-*=value.');process.exit(2);}
const filters=args.filter(a=>!a.startsWith('--'));
const all=readdirSync('tests').filter(f=>f.endsWith('.test.mjs')).sort().map(f=>`tests/${f}`);
for(const filter of filters)if(!all.some(f=>f.includes(filter))){console.error(`No test file matches: ${filter}`);process.exit(2);}
let files=all.filter(f=>!filters.length||filters.some(filter=>f.includes(filter)));
if(args.includes('--changed')){
 const diff=spawnSync('git',['diff','HEAD','--name-only','-z'],{encoding:'utf8'}),untracked=spawnSync('git',['ls-files','--others','--exclude-standard','-z'],{encoding:'utf8'});
 if(diff.status!==0||untracked.status!==0){console.error('Cannot determine changed files; run npm test for the full suite.');process.exit(2);}
 files=affectedTests(files,[...new Set((diff.stdout+untracked.stdout).split('\0').filter(Boolean))]);
}
if(!files.length){console.log('No affected test files. Full validation: npm test');process.exit(0);}
const {compileStats}=await import('./compile-core.mjs');
console.log(`Tests: ${files.length}/${all.length} files · compiled ${compileStats.compiled}, cached ${compileStats.cached} · preparation ${(performance.now()-started).toFixed(0)} ms`);
const worker=args.includes('--worker')?['--import','./scripts/fixtures/enable-node-move-worker.mjs']:[];
const result=spawnSync(process.execPath,[...worker,'--test',...flags,...files],{stdio:'inherit'});
if(result.error)console.error(result.error.message);
console.log(`Test command wall time: ${((performance.now()-started)/1000).toFixed(2)} s`);
process.exit(result.status??1);
