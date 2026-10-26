import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
test('compile cache invalidates changed source, missing output and corrupt output',()=>{
 const root=mkdtempSync(join(tmpdir(),'vr-compile-'));
 try{
  cpSync('src',join(root,'src'),{recursive:true});
  const module=new URL('../scripts/compile-core.mjs',import.meta.url).href;
  const run=()=>{const p=spawnSync(process.execPath,['--input-type=module','-e',`const {compileStats}=await import(${JSON.stringify(module)});console.log(JSON.stringify(compileStats));`],{cwd:root,encoding:'utf8'});assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout);};
  const cold=run();assert(cold.compiled>0);assert.equal(cold.cached,0);
  assert.deepEqual(run(),{compiled:0,cached:cold.compiled});
  const output=join(root,'work/test-build/move-field.mjs'),original=readFileSync(output,'utf8');
  writeFileSync(output,'corrupt');assert.equal(run().compiled,1);assert.equal(readFileSync(output,'utf8'),original);
  rmSync(output);assert.equal(run().compiled,1);
  const source=join(root,'src/move-field.ts');writeFileSync(source,readFileSync(source,'utf8')+'\n// cache invalidation probe\n');
  assert.equal(run().compiled,1);assert.match(readFileSync(output,'utf8'),/cache invalidation probe/);
 }finally{rmSync(root,{recursive:true,force:true});}
});
