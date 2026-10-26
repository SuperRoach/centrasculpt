import './compile-core.mjs';
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {Matrix4,Vector3} from 'three';
import {fixture,pose,release,start} from './fixtures/move-precision-fixture.mjs';
import {BrowserWorker} from './fixtures/node-browser-worker.mjs';
globalThis.Worker=BrowserWorker;
const rows=[],quantile=(values,q)=>{const a=[...values].sort((a,b)=>a-b);return a[Math.min(a.length-1,Math.ceil(q*a.length)-1)]??null;};
for(const resolution of [64,114,192])for(const mode of ['non-elastic','elastic','rotate','twist'])for(const precision of [false,true]){
 const f=fixture(resolution),held=[],point=new Vector3(),out=new Vector3(),previewPoints=[];
 try{
  f.tools.move.mode=mode==='elastic'?'elastic':'non-elastic';f.tools.move.interaction=mode==='rotate'||mode==='twist'?mode:'translate';f.tools.move.precision=precision;f.tools.move.radius=.2;f.tools.move.axis='y';
  const vertices=f.l.active.triangles*3,before=process.memoryUsage();start(f);const preparationMs=f.move.preview.preparationMs;
  for(let i=0;i<240;i++){const hand=pose(.12*i/239,.01,1.58).multiply(new Matrix4().makeRotationY(.8*i/239));const t=performance.now();f.move.update(f.s,pose(),32+i*16,true,hand);held.push(performance.now()-t);}
  const field=f.move.preview.field;for(const mesh of f.l.active.surface.group.children){const positions=mesh.geometry.getAttribute('position');for(let i=0;i<positions.count&&previewPoints.length<128;i+=17){point.fromBufferAttribute(positions,i);if(field.weight(point)>.05)previewPoints.push(field.position(point,out).clone());}}
  const aim=pose(),hand=pose(.12,.01,1.58).multiply(new Matrix4().makeRotationY(.8));release(f.s);const t=performance.now();f.move.update(f.s,aim,4000,true,hand);const heldAtRelease=f.move.preview.active;while(f.l.deforming)await new Promise(r=>setTimeout(r,1));
  assert.equal(f.l.undoCount,1);assert(heldAtRelease);const errorVoxels=previewPoints.map(p=>Math.abs(f.l.active.volume.sampleLocal(p))/f.l.active.volume.step);
  rows.push({resolution,vertices,mode,precision,preparationMs,preview:{samples:held.length,p50Ms:quantile(held,.5),p95Ms:quantile(held,.95),p99Ms:quantile(held,.99),maxMs:Math.max(...held)},releaseWallMs:performance.now()-t,stats:f.l.lastMoveStats,heldAtRelease,previewSurfaceErrorVoxels:{samples:errorVoxels.length,p50:quantile(errorVoxels,.5),p95:quantile(errorVoxels,.95),max:Math.max(...errorVoxels)},memoryBefore:before,memoryAfter:process.memoryUsage()});console.log(resolution,mode,precision,rows.at(-1).releaseWallMs.toFixed(1));
 }finally{f.dispose();}
}
writeFileSync('outputs/phase-2-5-precision-benchmark.json',JSON.stringify({scope:'Actual XRMoveTool on Mac Node with synthetic grip poses and worker_threads browser-worker adapter. 240 held updates per case; no renderer, headset or GPU timing. One commit per case, no release percentiles. .2 model influence radius, .12/.01/.08 hand translation or .8-radian Y wrist turn. Preview error samples original mesh vertices warped by the captured field, then absolute committed trilinear SDF sample divided by lattice step; this is not a Hausdorff/volume error bound. Process memory counters are checkpoints, not peaks.',host:{node:process.version,platform:process.platform,arch:process.arch},rows},null,2)+'\n');
