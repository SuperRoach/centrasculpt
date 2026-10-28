import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {ClayStrokeSession} from '../work/test-build/clay-stroke-session.mjs';
import {ClayPathControls} from '../work/test-build/clay-path.mjs';
const mode=process.argv[2]??'pinch';if(!['pinch','crease'].includes(mode))throw new Error('Expected pinch or crease.');
const cases=[];
for(const resolution of [64,128,192])for(const radius of [.25,.5]){
 const settings={mode,radius,strength:.7,hardness:.4,camera:{position:[2,2,3],target:[0,0,0]}};
 const a=new IndependentLayers(createBaseProject(new SDFVolume(resolution),settings)),b=new IndependentLayers(createBaseProject(new SDFVolume(resolution),settings));
 try{
 const s=new ClayStrokeSession(()=>a,()=>{},true),times=[],sync=[],path=Array.from({length:12},(_,i)=>({x:-.13+i*.02,y:0,z:.83}));
 s.begin(settings,new ClayPathControls(),0,true);b.beginStroke();
 for(let i=0;i<path.length;i++){let t=performance.now();s.sample(path[i],i*16);if(s.phase==='drawing')a.active.rebuild(2,3);times.push(performance.now()-t);t=performance.now();b.applyStrokeLocal(path[i],radius,mode,.7,i===0?0:.016,.4,false);sync.push(performance.now()-t);}
 s.end();let updates=0;while(s.phase==='committing'&&updates++<50000){const t=performance.now();s.pump();times.push(performance.now()-t);}assert.equal(s.phase,'idle');b.finishStroke();assert.deepEqual(a.active.volume.values,b.active.volume.values);assert.equal(a.undoCount,1);
 const sorted=[...times].sort((x,y)=>x-y);cases.push({resolution,radius,samples:12,drainUpdates:updates,stagedTotalCPUms:times.reduce((a,b)=>a+b,0),stagedP95ms:sorted[Math.ceil(sorted.length*.95)-1],stagedMaxMs:sorted.at(-1),syncBrushMaxMs:Math.max(...sync),identicalVoxels:true});
 }finally{a.dispose();b.dispose();}
}
const result={scope:'Single host run. Staged sample+meshing/drain CPU vs synchronous brush-only call; different work scopes, not a speedup ratio or Quest timing. Simulated 16 ms timestamps.',node:process.version,cases};writeFileSync(`outputs/phase-4-0/${mode}-benchmark.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
