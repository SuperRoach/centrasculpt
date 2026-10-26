import './compile-core.mjs';
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
const baselineRef=process.argv.includes('--baseline')?'b8469b3f07d2944167695484ff7b08acff4f633b':null;
if(baselineRef){
 const source=execFileSync('git',['show',`${baselineRef}:src/mesh.ts`],{encoding:'utf8'}).replace(/from '(\.\/[^']+)'/g,"from '$1.mjs'");
 writeFileSync('work/test-build/mesh-quality-baseline.mjs',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
}
const {IncrementalMesher}=await import(baselineRef?'../work/test-build/mesh-quality-baseline.mjs':'../work/test-build/mesh.mjs');
const {prepareDenseGrowth}=await import('../work/test-build/dense-growth.mjs');
const {qualityVolume,qualityMetrics}=await import('./fixtures/mesh-quality.mjs');
const rows=[];
for(const n of [33,64,128,192])for(const kind of ['sphere','box','triangular-prism','pyramid','aligned-box','thin-stroke','narrow-groove']){
 const {volume,field}=qualityVolume(n,kind);const meshSamplesMs=[];let mesher,result;
 for(let repeat=0;repeat<4;repeat++){
  mesher=new IncrementalMesher(volume,16);const t=performance.now();result=mesher.rebuildChunks();if(repeat)meshSamplesMs.push(performance.now()-t);if(repeat<3)mesher.dispose();
 }
 const meshMs=[...meshSamplesMs].sort((a,b)=>a-b)[1];
 const metrics=qualityMetrics(result.updates.map(u=>u.geometry),field,volume.step,kind==='sphere');
 rows.push({n,kind,step:volume.step,dimensions:volume.dimensions,meshMs,meshSamplesMs,...metrics});
 if(kind==='sphere'){
  const grown=prepareDenseGrowth(volume,{min:[-2.1,-1,-1],max:[2.1,1,1]});const t=performance.now();mesher.rebindVolume(grown.volume);const update=mesher.rebuildChunks();rows.push({n,kind:'empty-capacity-growth',dimensions:grown.volume.dimensions,step:grown.volume.step,growthMs:grown.stats.totalMs,rebindMeshMs:performance.now()-t,remeshed:update?.updates.length??0,...qualityMetrics(mesher.snapshotUpdates().map(u=>u.geometry),field,volume.step,true)});
  // Occupied growth case: same spacing, elongated capsule spanning new capacity.
  const longField=p=>Math.hypot(Math.max(Math.abs(p.x)-1.3,0),p.y,p.z)-.4;
  const v=grown.volume,[nx,ny,nz]=v.dimensions;
  for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)v.values[v.index(x,y,z)]=longField({x:v.coordinate(x,0),y:v.coordinate(y,1),z:v.coordinate(z,2)});
  const samples=[];for(let i=0;i<4;i++){mesher.invalidate();const t=performance.now();mesher.rebuildChunks();if(i)samples.push(performance.now()-t);}
  rows.push({n,kind:'occupied-growth',dimensions:v.dimensions,step:v.step,meshMs:[...samples].sort((a,b)=>a-b)[1],meshSamplesMs:samples,...qualityMetrics(mesher.snapshotUpdates().map(u=>u.geometry),longField,v.step)});
 }mesher.dispose();
}
writeFileSync(process.argv[2]??'outputs/phase-3-quality.json',JSON.stringify({baselineRef,scope:'Mac Node CPU, one warm-up then three extractions per fixture, meshMs is median;  analytic SDF at vertices and triangle centroids, not Hausdorff. Normal angle only sphere; shared-position normal metric includes same-chunk duplicates. No headset/GPU measurements.',host:{node:process.version,platform:process.platform,arch:process.arch},rows},null,2)+'\n');
