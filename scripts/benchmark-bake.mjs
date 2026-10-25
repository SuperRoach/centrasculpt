import './compile-core.mjs';
import {writeFileSync} from 'node:fs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
const settings={mode:'add',radius:.22,strength:.35,hardness:.5,camera:{position:[2.4,1.7,3.3],target:[0,0,0]}};
const rows=[],round=n=>+n.toFixed(2);
for(const resolution of [64,128,192]){
 const c=new IndependentLayers(createBaseProject(new SDFVolume(64),settings)),base=c.active.layer,cutter=c.create(128);
 c.setActiveTransform({position:[.55,0,.4],rotation:[.2,.3,.1],scale:[.7,.7,.7]});c.setOperation(cutter.id,'difference');c.viewMode='boolean';
 const sources=c.project.layerStack.layers.map(l=>({layer:l,volume:l.volume,data:l.volume.values.slice()})),plan=c.bakePlan(resolution),history=c.undoCount;
 const output=await c.bake({name:`Baked ${resolution}`,resolution,hideSources:true}),stats=c.lastBakeStats;
 const unchanged=sources.every(s=>s.layer.volume===s.volume&&s.layer.volume.values.every((v,i)=>v===s.data[i]));if(!unchanged)throw new Error('Source voxel data changed during bake.');
 const data=output.volume.values,geometries=c.active.surface.group.children.map(m=>m.geometry),undoStart=performance.now();c.undo();const undoMs=performance.now()-undoStart,redoStart=performance.now();c.undo(true);const redoMs=performance.now()-redoStart;
 const reused=c.active.layer.volume.values===data&&c.active.surface.group.children.every((m,i)=>m.geometry===geometries[i]);if(!reused||c.undoCount!==history+1)throw new Error('Bake replay copied geometry/voxel data or changed action count.');
 rows.push({outputResolution:resolution,baseResolution:64,cutterResolution:128,samplingMs:round(stats.samplingMs),meshingMs:round(stats.meshingMs),totalMs:round(stats.totalMs),triangles:stats.triangles,worldVoxelSize:+stats.worldStep.toFixed(5),newGridAndScratchMiB:round(stats.gridBytes/1048576),projectGridsAndScratchMiB:round(plan.projectGridBytes/1048576),undoMs:round(undoMs),redoMs:round(redoMs),sourceUnchanged:unchanged,reusedVoxelAndGeometryOnRedo:reused});c.dispose();
}
const report={description:'Explicit SDF Bake of ordered 64³ Union Base and rotated/translated/uniformly scaled 128³ Difference cutter. Outputs exactly 64³/128³/192³ with padded bounds. Sampling and meshing CPU timings exclude cooperative yields; total includes yields/validation/commit, excludes initial source mesh preparation and preview regeneration. No GPU/render/UI/picking included. Undo/redo retains original destination arrays and chunk geometry, with one transaction.',runtime:process.version,platform:process.platform,rows};
writeFileSync('outputs/phase-1-9-benchmarks.json',JSON.stringify(report,null,2)+'\n');console.table(rows);
