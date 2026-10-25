import './compile-core.mjs';
import { writeFileSync } from 'node:fs';
const {SDFVolume}=await import('../work/test-build/sdf.mjs');
const {createBaseProject}=await import('../work/test-build/layers.mjs');
const {IndependentLayers}=await import('../work/test-build/independent-layers.mjs');
const {resampleVolume}=await import('../work/test-build/resolution.mjs');
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const rows=[];
for(const resolution of [64,128,192]) {
 const volume=new SDFVolume(resolution),project=createBaseProject(volume,{mode:'add',radius:0.22,strength:0.35,hardness:0.5,camera:{position:[2.4,1.7,3.3],target:[0,0,0]}}),layers=new IndependentLayers(project);
 const activeId=project.activeLayerId,runtime=layers.active,fullMeshMs=runtime.lastMeshMs,triangles=runtime.triangles;
 const inactive=layers.create(64),inactiveRuntime=layers.runtime(inactive.id),inactiveData=inactive.volume.getDenseView().slice(),inactiveGeometry=inactiveRuntime.surface.group.children.map(mesh=>mesh.geometry);
 layers.select(activeId);
 const brushTimes=[],meshTimes=[],smoothTimes=[];layers.beginStroke();
 for(let i=0;i<7;i++) {
  const start=performance.now();layers.applyStroke({x:0,y:0,z:0.85},0.22,'add',0.35,1/60,0.5);brushTimes.push(performance.now()-start);
  runtime.rebuild();meshTimes.push(runtime.lastMeshMs);
 }
 layers.finishStroke();layers.beginStroke();
 for(let i=0;i<5;i++) {
  const start=performance.now();layers.applyStroke({x:0,y:0,z:0.85},0.22,'smooth',0.35,1/60,0.5);smoothTimes.push(performance.now()-start);runtime.rebuild();
 }
 layers.finishStroke();
 const inactiveUnchanged=inactive.volume.getDenseView().every((v,i)=>v===inactiveData[i])&&inactiveRuntime.surface.group.children.every((mesh,i)=>mesh.geometry===inactiveGeometry[i]);
 if(!inactiveUnchanged)throw new Error('Inactive layer was modified by benchmark stroke.');
 const transformData=volume.getDenseView().slice(),transformGeometry=runtime.surface.group.children.map(mesh=>mesh.geometry);
 layers.beginTransform();const transformStart=performance.now();
 for(let i=0;i<1000;i++)layers.updateTransform({position:[i/1000,0.2,0],rotation:[0,i/2000,0],scale:[1.2,1.2,1.2]});
 const transformMeanMs=(performance.now()-transformStart)/1000;layers.finishTransform();
 const transformNoRemesh=runtime.mesher.rebuildChunks()===null&&runtime.surface.group.children.every((mesh,i)=>mesh.geometry===transformGeometry[i])&&volume.getDenseView().every((value,i)=>value===transformData[i]);
 if(!transformNoRemesh)throw new Error('Metadata transform modified voxel or geometry data.');layers.undo();
 const from64=new SDFVolume(64),start=performance.now();resampleVolume(from64,resolution);const resample=performance.now()-start;
 rows.push({resolution,triangles,fullMeshMs:+fullMeshMs.toFixed(1),localMeshMedianMs:+median(meshTimes).toFixed(1),brushMedianMs:+median(brushTimes).toFixed(2),smoothMedianMs:+median(smoothTimes).toFixed(2),changedChunks:runtime.lastChanged,totalChunks:runtime.totalChunks,resampleFrom64Ms:+resample.toFixed(1),denseSdfAndScratchMiB:+(resolution**3*8/1048576).toFixed(1),inactive64Unchanged:inactiveUnchanged,transformMeanMs:+transformMeanMs.toFixed(4),transformNoRemesh});
 layers.dispose();
}
console.table(rows);
const report={description:'CPU only; two independent layers: active tested resolution plus untouched inactive 64³. 16³-cell chunks; radius .22, strength .35, hardness .5, stationary pole, dt 1/60. Includes active-layer routing, local conversion, sparse history and dirty marking; excludes rendering/GPU, UI and picking. Initial active mesh is first-run; brush/mesh times are warm medians. Transform mean covers 1000 metadata/scene updates only, verifies no changed voxels or mesh allocations and no remesh.',runtime:process.version,platform:process.platform,rows};
writeFileSync(process.argv[2]??'outputs/phase-1-8-source-benchmarks.json',JSON.stringify(report,null,2)+'\n');
