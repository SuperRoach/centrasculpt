import './compile-core.mjs';
import {writeFileSync} from 'node:fs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
const settings={mode:'add',radius:.22,strength:.35,hardness:.5,camera:{position:[2.4,1.7,3.3],target:[0,0,0]}};
const round=n=>+n.toFixed(2),median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const rows=[];
for(const resolution of [64,128,192]){
 const c=new IndependentLayers(createBaseProject(new SDFVolume(resolution),settings)),a=c.active.layer,b=c.create(64);
 c.setActiveTransform({position:[.55,0,.3],rotation:[.2,.35,.1],scale:[.65,.65,.65]});c.setOperation(b.id,'difference');c.select(a.id);
 const aBefore=a.volume.values.slice(),bBefore=b.volume.values.slice();
 await c.composite.flush();const initial={...c.composite.stats};
 const sourcePreserved=a.volume.values.every((v,i)=>v===aBefore[i])&&b.volume.values.every((v,i)=>v===bBefore[i]);
 const times=[],samples=[],chunks=[];c.beginStroke();
 for(let i=0;i<5;i++){
  c.applyStroke({x:-.4,y:0,z:.75},.22,'add',.35,1/60,.5);c.active.rebuild();await c.composite.flush();const s=c.composite.stats;
  times.push(s.samplingMs+s.meshingMs);samples.push(s.samples);chunks.push(s.chunks);
 }
 c.finishStroke();
 const local={...c.composite.stats},start=performance.now();await c.composite.rebuild();const idleMs=performance.now()-start;
 const unchangedOther=b.volume.values.every((v,i)=>v===bBefore[i]);if(!sourcePreserved||!unchangedOther)throw new Error('Source layer preservation failed.');
 rows.push({sourceResolution:resolution,cutterResolution:64,compositeResolution:initial.resolution,worldVoxelSize:+initial.step.toFixed(5),qualityCapped:initial.capped,fullSamples:initial.samples,fullSamplingMs:round(initial.samplingMs),fullMeshingMs:round(initial.meshingMs),fullElapsedMs:round(initial.elapsedMs),fullTriangles:initial.triangles,localCpuMedianMs:round(median(times)),localSamplingMs:round(local.samplingMs),localMeshingMs:round(local.meshingMs),localElapsedMs:round(local.elapsedMs),localSamples:median(samples),localChunks:median(chunks),totalChunks:local.totalChunks,idleMs:round(idleMs),sourcePreserved,inactiveUnchanged:unchangedOther});c.dispose();
}
const report={description:'Two independent sources: tested base resolution plus rotated, translated, uniformly scaled 64³ Difference cutter. Adaptive world-space composite capped at 192³. Full initial preview and five warm local Add edits at (-.4,0,.75), radius .22, strength .35, hardness .5, dt 1/60. CPU includes sampling/chunk extraction, excludes source rebuilds, UI/GPU/rendering/picking. Elapsed time includes cooperative event-loop yields. Original sources verified unchanged by composition; inactive cutter unchanged by active strokes.',runtime:process.version,platform:process.platform,rows};
writeFileSync('outputs/phase-1-8-composite-benchmarks.json',JSON.stringify(report,null,2)+'\n');console.table(rows);
