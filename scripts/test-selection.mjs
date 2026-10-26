import {readFileSync,existsSync} from 'node:fs';
import {posix} from 'node:path';
import ts from 'typescript';
/** Conservative import closure: includes test helpers and dynamic relative imports. */
export function affectedTests(files,changed){
 const memo=new Map();
 const dependencies=file=>{
  if(memo.has(file))return memo.get(file);
  const result=new Set([file]);memo.set(file,result);
  if(!existsSync(file))return result;
  const imports=ts.preProcessFile(readFileSync(file,'utf8'),true,true).importedFiles;
  for(const {fileName} of imports){
   if(!fileName.startsWith('.'))continue;
   let path=posix.normalize(posix.join(posix.dirname(file),fileName));
   if(path.startsWith('work/test-build/'))path=`src/${posix.basename(path,'.mjs')}.ts`;
   else if(!posix.extname(path)&&existsSync(`${path}.ts`))path+='.ts';
   // Build the closure separately below to handle cycles without incomplete memoization.
   result.add(path);
  }
  return result;
 };
 const closure=file=>{const visited=new Set(),pending=[file];while(pending.length){const next=pending.pop();if(visited.has(next))continue;visited.add(next);for(const dep of dependencies(next))if(!visited.has(dep))pending.push(dep);}return visited;};
 const relevant=changed.filter(f=>!f.startsWith('docs/')&&!f.startsWith('outputs/')&&!/\.md$/.test(f));
 if(relevant.some(f=>!f.startsWith('src/')&&!f.startsWith('tests/')))return files;
 const closures=new Map(files.map(f=>[f,closure(f)]));
 // Untested entry points/deleted imports/config changes cannot safely narrow the suite.
 if(relevant.some(f=>!files.includes(f)&&![...closures.values()].some(set=>set.has(f))))return files;
 return files.filter(f=>relevant.some(changed=>closures.get(f).has(changed)));
}
