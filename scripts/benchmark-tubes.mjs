import './compile-core.mjs';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const {PreparedTube,evaluateTube,tubePoint}=await import('../work/test-build/procedural-tube.mjs');
const {IncrementalMesher}=await import('../work/test-build/mesh.mjs');
const source={kind:'tube',interpolation:'centripetal',closed:false,points:[tubePoint([-.8,-.4,0],.12),tubePoint([-.3,.4,.15],.22),tubePoint([.3,-.3,-.1],.08),tubePoint([.8,.4,0],.14)]};
const percentile=(v,p)=>[...v].sort((a,b)=>a-b)[Math.min(v.length-1,Math.floor(v.length*p))];
const results=[];
for(const resolution of [64,128,192]){
 const work=evaluateTube(source,resolution),start=performance.now(),samplingSlices=[];let result;
 do{const t=performance.now();result=work.next();samplingSlices.push(performance.now()-t);}while(!result.done);
 const volume=result.value,samplingMs=performance.now()-start,mesher=new IncrementalMesher(volume),meshStart=performance.now(),meshSlices=[];
 while(mesher.pendingChunks){const t=performance.now(),batch=mesher.rebuildChunks(2,3);assert(batch.stats.chunks<=2);meshSlices.push(performance.now()-t);}
 const meshingMs=performance.now()-meshStart,prepared=new PreparedTube(source,volume.step*.5);let maxResidual=0,vertices=0;
 for(const {geometry} of mesher.snapshotUpdates()){const p=geometry.getAttribute('position');for(let i=0;i<p.count;i++){maxResidual=Math.max(maxResidual,Math.abs(prepared.distance(p.getX(i),p.getY(i),p.getZ(i))));vertices++;}}
 assert(vertices>0);assert(maxResidual<volume.step*.8,`residual ${maxResidual} step ${volume.step}`);
 results.push({resolution,dimensions:volume.dimensions,step:volume.step,segments:prepared.samples.length-1,triangles:mesher.triangles,maxSurfaceResidual:maxResidual,residualInVoxels:maxResidual/volume.step,samplingMs,samplingSlices:samplingSlices.length,samplingP95:percentile(samplingSlices,.95),samplingMax:Math.max(...samplingSlices),meshingMs,meshUpdates:meshSlices.length,meshP95:percentile(meshSlices,.95),meshMax:Math.max(...meshSlices),sourceGridBytes:volume.values.byteLength*2,geometryBytes:mesher.ownedGeometryBytes});mesher.dispose();
}
const report={description:'Single host run, no renderer/XR/Quest timing. Generator yields every 128 samples; mesh batches admit at most two chunks / 3 ms. Slice maximum includes allocation/preparation and indivisible work. Quality residual measured against independently queried prepared field, not continuous-curve Hausdorff error.',results};writeFileSync('outputs/phase-4-1/tube-benchmark.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
