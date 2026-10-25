import './compile-core.mjs';
import {writeFileSync} from 'node:fs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {ShapeGhost,shapeDimensionsForKind} from '../work/test-build/shape-preview.mjs';
import {prepareShape} from '../work/test-build/shape-library.mjs';
import {SHAPE_KINDS} from '../work/test-build/shapes.mjs';
const settings={mode:'add',radius:.22,strength:.35,hardness:.5,camera:{position:[2.4,1.7,3.3],target:[0,0,0]}};
const c=new IndependentLayers(createBaseProject(new SDFVolume(64),settings)),second=c.create(128),ghost=new ShapeGhost(()=>c.project.layerStack);
c.setActiveTransform({position:[.3,0,0],rotation:[.1,.2,.3],scale:[1.2,1.2,1.2]});
const data=c.project.layerStack.layers.map(l=>({id:l.id,bytes:l.volume.values.slice(),geometries:c.runtime(l.id).surface.group.children.map(m=>m.geometry)})),undo=c.undoCount,rows=[];
ghost.model.enabled=true;
for(const kind of SHAPE_KINDS){
 let d=ghost.model.definition;ghost.model.set({...d,kind,dimensions:shapeDimensionsForKind(kind,[.8,1.1,.7])},c.project.layerStack);const coldStart=performance.now();ghost.sync();const coldGeometryAndPoseMs=performance.now()-coldStart;
 const mesh=ghost.group.children[0].children.find(o=>o.isMesh),geometry=mesh.geometry,loops=2000,start=performance.now();
 for(let i=0;i<loops;i++){d=ghost.model.definition;ghost.model.set({...d,dimensions:shapeDimensionsForKind(kind,[.8+(i%20)/100,1.1,.7]),operation:i%2?'add':'subtract',transform:{position:[1+i/10000,.2,0],rotation:[0,i/10000,.1],scale:[1.1,1.1,1.1]}},c.project.layerStack);ghost.sync();if(mesh.geometry!==geometry)throw new Error('Preview geometry was rebuilt during pose/dimension changes.');}
 const warmPreviewMeanMs=(performance.now()-start)/loops,prepareStart=performance.now(),prepared=prepareShape(ghost.model.definition,c.active.layer),prepareMs=performance.now()-prepareStart,sampleStart=performance.now();let checksum=0;const p={x:0,y:0,z:0};
 for(let i=0;i<20000;i++){p.x=(i%31)/10-1.5;p.y=(i%23)/10-1.1;p.z=(i%17)/10-.8;checksum+=prepared.sampleWorld(p);}
 const worldDistanceMeanMicroseconds=(performance.now()-sampleStart)*1000/20000;
 rows.push({kind,coldGeometryAndPoseMs:+coldGeometryAndPoseMs.toFixed(4),warmPreviewMeanMs:+warmPreviewMeanMs.toFixed(4),kernelPrepareMs:+prepareMs.toFixed(4),worldDistanceMeanMicroseconds:+worldDistanceMeanMicroseconds.toFixed(3),geometryReused:true,sampleChecksum:+checksum.toFixed(2)});
}
let noops=0;const idleStart=performance.now();for(let i=0;i<10000;i++)if(!ghost.sync())noops++;const idleMeanMs=(performance.now()-idleStart)/10000;
for(const entry of data){const layer=c.project.layerStack.get(entry.id),runtime=c.runtime(entry.id);if(!layer.volume.values.every((v,i)=>v===entry.bytes[i])||runtime.mesher.rebuildChunks()!==null||!runtime.surface.group.children.every((m,i)=>m.geometry===entry.geometries[i]))throw new Error('Shape preview modified or remeshed a source.');}
if(c.undoCount!==undo)throw new Error('Preview changed project history.');
const report={description:'CPU only on this machine. Active 128³ layer plus independent 64³ Base. Four cold analytic preview geometry builds, then 2000 validated dimension/operation/pose updates per primitive with unchanged geometry identity. Prepared world-distance kernels sampled 20000 times each; idle synchronization 10000 times. Includes model validation/clone/matrix updates; excludes DOM, rendering, GPU, picking and frame guarantees.',runtime:process.version,platform:process.platform,rows,idleMeanMs:+idleMeanMs.toFixed(4),idleNoops:noops,cachedShapes:ghost.cachedShapes,geometryBuilds:ghost.stats.geometryBuilds,sourceDataAndGeometryUnchanged:true,projectHistoryUnchanged:true};
writeFileSync('outputs/phase-1-10-shape-benchmarks.json',JSON.stringify(report,null,2)+'\n');console.table(rows);console.log(JSON.stringify({idleMeanMs:report.idleMeanMs,cachedShapes:report.cachedShapes,sourceDataAndGeometryUnchanged:true}));ghost.dispose();c.dispose();
