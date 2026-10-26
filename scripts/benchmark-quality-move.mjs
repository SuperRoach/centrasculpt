import './compile-core.mjs';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
const {IndependentLayers}=await import('../work/test-build/independent-layers.mjs');
const {createBaseProject}=await import('../work/test-build/layers.mjs');
const {RadialMoveField}=await import('../work/test-build/move-field.mjs');
const {qualityVolume,qualityMetrics}=await import('./fixtures/mesh-quality.mjs');
const settings={mode:'add',radius:.22,strength:.35,hardness:.5,camera:{position:[2,2,3],target:[0,0,0]}},rows=[];
for(const n of [33,64,128,192])for(const kind of ['sphere','narrow-groove'])for(const mode of ['non-elastic','elastic','rotate','twist']){
 const {volume}=qualityVolume(n,kind),l=new IndependentLayers(createBaseProject(volume,settings));let tip=kind==='sphere'?.85:.7;
 try{for(let pass=0;pass<3;pass++){
  const f=new RadialMoveField();f.configure(mode==='elastic'?'elastic':'non-elastic');f.capture(new Vector3(0,0,tip),.3,2,1);
  if(mode==='rotate'||mode==='twist'){f.interaction=mode;f.setRotation(new Vector3(0,1,0),.15);}else f.setDisplacement(new Vector3(.02,0,.08));
  const points=[],p=new Vector3(),out=new Vector3();for(const mesh of l.active.surface.group.children){const a=mesh.geometry.attributes.position;for(let i=0;i<a.count;i+=7){p.fromBufferAttribute(a,i);if(f.weight(p)>.05&&points.length<512)points.push(f.position(p,out).clone());}}
  const owner={};l.beginPreview(owner);const t=performance.now();try{assert(await l.commitMove(owner,f,new AbortController().signal,()=>{}));}finally{l.endPreview(owner);}
  const commitWallMs=performance.now()-t;
  const v=l.active.volume,errors=points.map(p=>Math.abs(v.sampleLocal(p))/v.step);assert(errors.length);assert(errors.every(Number.isFinite));assert.equal(l.undoCount,pass+1);
  const q=qualityMetrics(l.active.surface.group.children.map(m=>m.geometry),()=>0,v.step);rows.push({n,kind,mode,pass:pass+1,wallMs:commitWallMs,dimensions:v.dimensions,step:v.step,previewProbeCount:errors.length,previewMaxErrorVoxels:Math.max(...errors),previewRmsErrorVoxels:Math.sqrt(errors.reduce((s,e)=>s+e*e,0)/errors.length),degenerate:q.degenerate,maxSeamNormalDelta:q.maxSeamNormalDelta,stats:l.lastMoveStats});if(mode==='non-elastic'||mode==='elastic')tip+=.08;
 }console.log(`quality Move ${n} ${kind} ${mode}: three commits complete`);}finally{l.dispose();}
}
writeFileSync('outputs/phase-3-quality-move.json',JSON.stringify({scope:'Mac Node cooperative actual persistent commits; three consecutive edits per fixture. Preview points: every seventh mesh vertex, first 512 with weight > .05, transformed by field. Error: abs committed trilinear SDF / step, not Hausdorff or cumulative ground truth. Small translations .02/0/.08, rotations .15 rad. No headset/frame results.',rows},null,2)+'\n');
