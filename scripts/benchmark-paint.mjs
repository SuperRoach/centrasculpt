import './compile-core.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {sculptPaint} from '../work/test-build/sculpt-paint.mjs';
import {saveSculptProject} from '../work/test-build/project.mjs';
const results=[];
for(const resolution of [64,128,192]){const layers=new IndependentLayers(createBaseProject(new SDFVolume(resolution),{mode:'paint',radius:.3,strength:.6,hardness:.4,camera:{position:[2,2,3],target:[0,0,0]}})),before=saveSculptProject(layers.project).byteLength,revision=layers.active.surface.revision;let maxBatchMs=0,cpuMs=0,batches=0;layers.beginStroke('paint');for(let i=0;i<20;i++){const work=layers.applyResamplingSteps('paint',{x:.1*Math.sin(i/10),y:0,z:.85},.3,.6,.016,.4);for(;;){const start=performance.now(),step=work.next(),ms=performance.now()-start;cpuMs+=ms;maxBatchMs=Math.max(maxBatchMs,ms);batches++;if(step.done)break;}}layers.finishStroke();const start=performance.now();layers.updateMaskOverlays(Infinity);const attributesMs=performance.now()-start,saveStart=performance.now(),bytes=saveSculptProject(layers.project).byteLength;results.push({resolution,dabs:20,cpuMs,maxBatchMs,batches,attributesMs,paintBytes:sculptPaint(layers.active.volume).memoryBytes,nativeExtraBytes:bytes-before,saveMs:performance.now()-saveStart,remeshRevisions:layers.active.surface.revision-revision,trackedBytes:layers.trackedBytes});layers.dispose();}
mkdirSync('outputs/phase-4-9',{recursive:true});writeFileSync('outputs/phase-4-9/paint-benchmark.json',JSON.stringify({scope:'Host CPU only; no Quest/GPU/thermal measurements',node:process.version,results},null,2));console.log(JSON.stringify(results,null,2));
