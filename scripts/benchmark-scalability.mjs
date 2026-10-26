import './compile-core.mjs';
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import {SDFVolume} from '../work/test-build/sdf.mjs';
const baselineRef='4a5bbf3386ba701826d695d5b77e065b3e550c36';
if(process.argv.includes('--baseline')){const source=execFileSync('git',['show',`${baselineRef}:src/mesh.ts`],{encoding:'utf8'}).replace(/from '(\.\/[^']+)'/g,"from '$1.mjs'");writeFileSync('work/test-build/phase31-baseline-mesh.mjs',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);}
const {IncrementalMesher}=await import(process.argv.includes('--baseline')?'../work/test-build/phase31-baseline-mesh.mjs':'../work/test-build/mesh.mjs');
import {prepareDenseGrowth} from '../work/test-build/dense-growth.mjs';
const rows=[];
for(const kind of ['empty-extended','islands','large-sphere','many-layers','repeated-growth']){
 const samples=[];let metrics;
 for(let repeat=0;repeat<4;repeat++){
  const n=kind==='large-sphere'?128:64,volumes=[];let growthMs=0;
  for(let layer=0;layer<(kind==='many-layers'?8:1);layer++){
   let v=new SDFVolume(n,1.6,kind!=='empty-extended');if(kind==='empty-extended')v.values.fill(v.extent*4);
   if(kind==='empty-extended'||kind==='islands'){v=prepareDenseGrowth(v,{min:[-5,-1,-1],max:[5,1,1]}).volume;}
   if(kind==='islands')for(let z=0;z<v.dimensions[2];z++)for(let y=0;y<v.dimensions[1];y++)for(let x=0;x<v.dimensions[0];x++)v.values[v.index(x,y,z)]=Math.min(...[-3,0,3].map(c=>Math.hypot(v.coordinate(x)-c,v.coordinate(y,1),v.coordinate(z,2))-.4));
   if(kind==='repeated-growth')for(const size of [2,3,4]){const t=performance.now();v=prepareDenseGrowth(v,{min:[-size,-1,-1],max:[size,1,1]}).volume;growthMs+=performance.now()-t;}
   volumes.push(v);
  }
  const meshers=volumes.map(v=>new IncrementalMesher(v));const t=performance.now();for(const m of meshers)m.rebuildChunks();const fullMs=performance.now()-t;
  const localStart=performance.now();for(let i=0;i<meshers.length;i++){const b=volumes[i].brush({x:.8,y:0,z:0},.12,'subtract',.01);meshers[i].invalidate(b);meshers[i].rebuildChunks();}const localMs=performance.now()-localStart;
  metrics={samples:volumes.reduce((s,v)=>s+v.values.length,0),denseBytes:volumes.reduce((s,v)=>s+v.values.byteLength*2,0),geometryBytes:meshers.reduce((s,m)=>s+m.ownedGeometryBytes,0),vertices:meshers.reduce((s,m)=>s+m.triangles*3,0),chunks:meshers.reduce((s,m)=>s+m.allocatedChunks,0)};
  if(repeat)samples.push({fullMs,localMs,growthMs});for(const m of meshers)m.dispose();
 }
 const median=key=>samples.map(s=>s[key]).sort((a,b)=>a-b)[1];rows.push({kind,...metrics,fullMs:median('fullMs'),localMs:median('localMs'),growthMs:median('growthMs'),timings:samples});
}
writeFileSync(process.argv[2]??'outputs/phase-3-1-scalability.json',JSON.stringify({baselineRef:process.argv.includes('--baseline')?baselineRef:null,scope:'Mac Node CPU; one warmup, three timed runs; medians. Dense/geometry bytes are buffer accounting, not process peak or GPU memory. Local includes brush and remesh. No Quest tests.',node:process.version,rows},null,2)+'\n');
