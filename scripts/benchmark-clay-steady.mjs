import './compile-core.mjs';
import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import {filterClayPath,ClayPathControls} from '../work/test-build/clay-path.mjs';
import {ClayStrokeSession} from '../work/test-build/clay-stroke-session.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
const settings={mode:'subtract',radius:.22,strength:.35,hardness:.4,camera:{position:[2,2,3],target:[0,0,0]}};
const path=(seconds,hz)=>Array.from({length:seconds*hz+1},(_,i)=>{const t=i/hz;return {x:-.7+.7*t,y:.24*Math.sin(Math.PI*t/2)+.018*Math.sin(2*Math.PI*9*t),z:.75,t};});
const measure=(raw,steady)=>{for(let i=0;i<10;i++)filterClayPath(raw,steady,.22);const times=[];for(let i=0;i<30;i++){const t=performance.now();filterClayPath(raw,steady,.22);times.push(performance.now()-t);}times.sort((a,b)=>a-b);return {medianMs:times[15],maxMs:times.at(-1),inputSamples:raw.length,outputSamples:filterClayPath(raw,steady,.22).length};};
const raw=path(2,90);writeFileSync('outputs/clay-steady-paths.json',JSON.stringify({raw,steady35:filterClayPath(raw,35,.22),steady100:filterClayPath(raw,100,.22)}));const long=path(90,90),filters={zero:measure(raw,0),high:measure(raw,100),highLong:measure(long,100)};
const intended=p=>.24*Math.sin(Math.PI*(p.x+.7)/1.4),rms=points=>Math.sqrt(points.reduce((s,p)=>s+(p.y-intended(p))**2,0)/points.length),jitter={rawRms:rms(raw),steady35Rms:rms(filterClayPath(raw,35,.22)),steady100Rms:rms(filterClayPath(raw,100,.22))};
const layers=new IndependentLayers(createBaseProject(new SDFVolume(64),settings)),session=new ClayStrokeSession(()=>layers),controls=new ClayPathControls();controls.steady=100;
try{session.begin(settings,controls,0);for(const p of raw)session.sample(p,p.t*1000);const prepare=performance.now();session.end();const releasePreparationMs=performance.now()-prepare,pumpTimes=[];while(session.active){const t=performance.now();session.pump(4);pumpTimes.push(performance.now()-t);}const result={scope:'Synthetic Node trajectory filter and 64-cubed source replay. Excludes XR input, GPU, rendering/canvas uploads and headset latency. Pump wall time includes the final synchronous mesh rebuild.',filters,jitter,replay64:{releasePreparationMs,pumpFrames:pumpTimes.length,totalPumpMs:pumpTimes.reduce((a,b)=>a+b,0),maxPumpMs:Math.max(...pumpTimes),nominalPostReleaseFramesAt90HzMs:(pumpTimes.length+1)*1000/90,undoCount:layers.undoCount},policy:{previewIntervalMs:33,buffered:'Steady >0 or Straight Line: whole path retained until release',pumpBudgetMs:4,maxDabsPerPump:64,nonPreemptible:'A brush dab and final mesh rebuild can exceed the cooperative budget.',maxRawSamples:8192,maxSpatialSamples:16383}};writeFileSync('outputs/clay-steady-benchmark.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));}finally{layers.dispose();}
