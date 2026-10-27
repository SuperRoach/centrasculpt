// Run npm test first to compile core modules. Host CPU, not Quest frame times.
import {writeFileSync} from 'node:fs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {ClayStrokeSession} from '../work/test-build/clay-stroke-session.mjs';
import {ClayPathControls} from '../work/test-build/clay-path.mjs';
import assert from 'node:assert/strict';
const settings={mode:'add',radius:.22,strength:.35,hardness:.6,camera:{position:[2,2,3],target:[0,0,0]}};
const results=[];
for(const resolution of [64,128]){let reference;for(const chunks of [0,1,2]){const staged=chunks>0;
 const layers=new IndependentLayers(createBaseProject(new SDFVolume(resolution),settings)),session=new ClayStrokeSession(()=>layers,()=>{},staged),timings=[];
 const originalRebuild=layers.active.rebuild.bind(layers.active);if(staged)layers.active.rebuild=(limit=Infinity,ms=Infinity)=>originalRebuild(Math.min(chunks,limit),ms);
 const measure=fn=>{const start=performance.now();fn();timings.push(performance.now()-start);};
 try{session.begin(settings,new ClayPathControls(),0,true);
 for(let i=0;i<60;i++)measure(()=>{session.sample({x:.65,y:.35*Math.sin(i*.12),z:.35*Math.cos(i*.12)},(i+1)*16);if(staged)layers.active.rebuild(chunks,3);else if(i%2===0)layers.active.rebuild();});
 measure(()=>session.end());let drainUpdates=0;while(session.active&&drainUpdates<4096){measure(()=>session.pump());drainUpdates++;}
 assert(!session.active);assert.equal(layers.active.mesher.pendingChunks,0);assert.equal(layers.undoCount,1);
 if(!staged)reference=layers.active.volume.values.slice();else assert.deepEqual(layers.active.volume.values,reference);
 const sorted=[...timings].sort((a,b)=>a-b);results.push({resolution,staged,chunks,updates:timings.length,drainUpdates,p95Ms:sorted[Math.ceil(sorted.length*.95)-1],maxMs:sorted.at(-1),totalCpuMs:timings.reduce((a,b)=>a+b,0),triangles:layers.active.triangles});
 }finally{session.cancel();layers.dispose();}
}}
const result={environment:'Host Node CPU; synthetic 60-sample Clay path, no renderer; not Quest measurements',results};
writeFileSync('outputs/phase-3-7/clay-two-chunk-benchmark.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
