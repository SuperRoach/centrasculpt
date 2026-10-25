import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
for (const name of ['sdf','mesh']) {
 const source=readFileSync(`src/${name}.ts`,'utf8').replace("'./sdf'", "'./sdf.mjs'");
 writeFileSync(`work/${name}.mjs`,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
}
const {SDFVolume}=await import('./sdf.mjs');
const {extractMesh}=await import('./mesh.mjs');
const v=new SDFVolume();
const geometry=extractMesh(v);
const positions=geometry.getAttribute('position');
assert(positions.count>1000);
let outward=0;
for(let i=0;i<positions.count;i++) {
 assert(Number.isFinite(positions.getX(i)));
 const normals=geometry.getAttribute('normal');
 outward+=positions.getX(i)*normals.getX(i)+positions.getY(i)*normals.getY(i)+positions.getZ(i)*normals.getZ(i);
}
assert(outward/positions.count>0.8,'Sphere triangles should face outward');
const baseline=v.values.slice();
v.brush({x:0,y:0,z:0.85},0.3,'add',0.1);
assert(v.values.some((value,i)=>value<baseline[i]),'Add should lower the field');
assert(v.values.every((value,i)=>value<=baseline[i]),'Add must only add volume');
v.reset(); assert.deepEqual(v.values,baseline);
v.brush({x:0,y:0,z:0.85},0.3,'subtract',0.1);
assert(v.values.some((value,i)=>value>baseline[i]),'Subtract should raise the field');
assert(v.values.every((value,i)=>value>=baseline[i]),'Subtract must only remove volume');
const carved=extractMesh(v); assert(carved.getAttribute('position').count>0);
for(let z=0;z<v.resolution;z++)for(let y=0;y<v.resolution;y++)assert(v.values[v.index(0,y,z)]>0);
console.log(`PASS: sphere extraction (${positions.count/3} triangles), outward normals, Add/Subtract, reset, boundary, carved extraction.`);
