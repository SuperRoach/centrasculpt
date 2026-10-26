import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {affectedTests} from '../scripts/test-selection.mjs';
test('affected tests include transitive, dynamic and helper imports, including cycles',()=>{
 const previous=process.cwd(),root=mkdtempSync(join(tmpdir(),'vr-tests-'));
 try{
  process.chdir(root);for(const d of ['src','tests'])mkdirSync(d);
  const files={
   'tests/a.test.mjs':"import '../work/test-build/a.mjs';",
   'tests/b.test.mjs':"import './helper.mjs';",
   'tests/c.test.mjs':"import '../work/test-build/c.mjs';",
   'tests/helper.mjs':"await import('../work/test-build/b.mjs');",
   'src/a.ts':"import './b';",'src/b.ts':"import './a';",'src/c.ts':''
  };
  for(const [file,text] of Object.entries(files))writeFileSync(file,text);
  const tests=['tests/a.test.mjs','tests/b.test.mjs','tests/c.test.mjs'];
  assert.deepEqual(affectedTests(tests,['src/b.ts']),tests.slice(0,2));
  assert.deepEqual(affectedTests(tests,['tests/helper.mjs']),[tests[1]]);
  assert.deepEqual(affectedTests(tests,['tests/c.test.mjs']),[tests[2]]);
  assert.deepEqual(affectedTests(tests,['docs/status.md']),[]);
  assert.deepEqual(affectedTests(tests,[]),[]);
  assert.deepEqual(affectedTests(tests,['src/main.ts']),tests);
  assert.deepEqual(affectedTests(tests,['package.json']),tests);
  assert.deepEqual(affectedTests(tests,['scripts/test.mjs']),tests);
 }finally{process.chdir(previous);rmSync(root,{recursive:true,force:true});}
});
