import './compile-core.mjs';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {IncrementalMesher} from '../work/test-build/mesh.mjs';
import {prepareDenseGrowth,planDenseGrowth,denseGrowthDiagnostics} from '../work/test-build/dense-growth.mjs';
const percentile=(a,p)=>{const sorted=[...a].sort((a,b)=>a-b);return sorted[Math.ceil(sorted.length*p)-1]??0;};
const summary=a=>({samples:a.length,medianMs:percentile(a,.5),p95Ms:a.length>=20?percentile(a,.95):null,p99Ms:a.length>=100?percentile(a,.99):null,maxMs:percentile(a,1)});
const footprint=(x,r=.2)=>({min:[x-r,-r,-r],max:[x+r,r,r]});
const results=[];
for(const resolution of [64,128,192]){
 let volume=new SDFVolume(resolution),mesher=new IncrementalMesher(volume);mesher.rebuildChunks();const rows=[];
 try{for(const target of [1.8,-1.8,2.5]){
  const r=prepareDenseGrowth(volume,footprint(target)),oldSamples=volume.values.length,source=volume;
  if(!r.plan){rows.push({target,noGrowth:true});continue;}
  const bind=mesher.rebindVolume(r.volume);volume=r.volume;
  const brush=[],remesh=[];
  for(let i=0;i<30;i++){
   const point={x:target,y:.15*Math.sin(i*.2),z:0},t=performance.now(),dirty=volume.brush(point,.2,'add',.02,undefined,.5,true);brush.push(performance.now()-t);mesher.invalidate(dirty);
   if(i%3===0){const t=performance.now();mesher.rebuildChunks();remesh.push(performance.now()-t);}
  }
  mesher.rebuildChunks();assert.equal(source.values.length,oldSamples);
  rows.push({target,oldSamples,newSamples:volume.values.length,dimensions:volume.dimensions,latticeMin:volume.latticeMin,step:volume.step,allocationAndCopy:r.stats,storageMiB:r.plan.storageBytes/1048576,transientStorageMiB:r.plan.transientStorageBytes/1048576,rebind:bind,brush:summary(brush),remesh:summary(remesh),pendingChunks:mesher.pendingChunks});
 }
 let hardLimit='';try{planDenseGrowth(volume,footprint(100));}catch(e){hardLimit=e.message;}
 assert(hardLimit);results.push({resolution,rows,final:denseGrowthDiagnostics(volume),hardLimit});
 }finally{mesher.dispose();}
}
const report={scope:'Phase 1.15 storage/mesher microbenchmark. Node CPU, synchronous typed-array allocation/copy, exact-source validation, empty-chunk scan and standalone kernels at original 64/128/192 voxel spacing. Three successive +/-X attempts, 30 brush calls per actual growth, remesh every third. This workload excludes app coordinator/history/v4 save and VR automatic expansion timing; no browser or physical Quest frame timings. Storage budget estimates exclude histories, JS/geometry/GPU and transient GC overlap from older generations; cold calls and uncontrolled host load. No percentile claim below 20/100 samples.',host:{platform:process.platform,arch:process.arch,node:process.version},results};
writeFileSync('outputs/phase-1-15-growth-benchmark.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
