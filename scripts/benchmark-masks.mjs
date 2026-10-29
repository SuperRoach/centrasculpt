import './compile-core.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {sculptMask} from '../work/test-build/sculpt-mask.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {saveSculptProject} from '../work/test-build/project.mjs';
const settings={mode:'add',radius:.3,strength:1,hardness:.3,camera:{position:[2,2,3],target:[0,0,0]}},results=[];
for(const resolution of [64,128,192]){
 const v=new SDFVolume(resolution),l=new IndependentLayers(createBaseProject(v,settings)),m=sculptMask(v),samples=[],batches=[];let totalYields=0;
 l.updateMaskOverlays(Infinity);
 const before=saveSculptProject(l.project).byteLength,start=performance.now();
 for(let i=0;i<20;i++){const begin=performance.now(),work=v.brushSteps({x:(i-10)*.008,y:0,z:.8},.3,i%5===0?'mask-erase':'mask',.08,undefined,.4);let next;do{const beginBatch=performance.now();next=work.next();batches.push(performance.now()-beginBatch);if(!next.done)totalYields++;}while(!next.done);samples.push(performance.now()-begin);}
 const paintCPU=performance.now()-start,oldGeometry=l.active.surface.revision,overlayStart=performance.now();l.updateMaskOverlays(Infinity);const overlayCPU=performance.now()-overlayStart;let attributeBytes=0;for(const mesh of l.active.surface.group.children)attributeBytes+=mesh.geometry.getAttribute('sculptMaskWeight')?.array.byteLength??0;
 const invertStart=performance.now();for(let i=0;i<1000;i++)m.invert();const invertCPU=performance.now()-invertStart,saveStart=performance.now(),after=saveSculptProject(l.project).byteLength,saveCPU=performance.now()-saveStart;
 samples.sort((a,b)=>a-b);batches.sort((a,b)=>a-b);results.push({resolution,paintDabs:20,paintCPUms:paintCPU,dabP50ms:samples[10],dabMaxMs:samples.at(-1),batchP99ms:batches[Math.floor(batches.length*.99)],batchMaxMs:batches.at(-1),yieldCount:totalYields,maskBytes:m.memoryBytes,overlayFullCPUms:overlayCPU,overlayAttributeBytes:attributeBytes,meshRevisionUnchanged:oldGeometry===l.active.surface.revision,invert1000CPUms:invertCPU,nativeMaskBytes:after-before,nativeSaveCPUms:saveCPU});l.dispose();
}
const report={environment:'Node host CPU only; sequential warm-process measurements. No XR render/GPU, frame time, thermals, or physical Quest claim.',results};mkdirSync('outputs/phase-4-7',{recursive:true});writeFileSync('outputs/phase-4-7/mask-benchmark.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
