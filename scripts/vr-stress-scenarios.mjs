// Shared deterministic workload; npm test compiles the TypeScript before loading this.
import assert from 'node:assert/strict';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {ClayStrokeSession} from '../work/test-build/clay-stroke-session.mjs';
import {ClayPathControls} from '../work/test-build/clay-path.mjs';
import {defineShape} from '../work/test-build/shapes.mjs';
import {saveSculptProject,openSculptProject} from '../work/test-build/project.mjs';
const settings={mode:'add',radius:.12,strength:.4,hardness:.5,camera:{position:[2,2,3],target:[0,0,0]}};
const summary=a=>{a=[...a].sort((x,y)=>x-y);const q=p=>a[Math.ceil(a.length*p)-1]??0;return {samples:a.length,medianMs:q(.5),p95Ms:a.length>=20?q(.95):null,p99Ms:a.length>=100?q(.99):null,maxMs:q(1)};};
export async function runVRStress(resolution,{frames=900,cycles=20}={}){
 const volume=new SDFVolume(resolution,1.6,false);volume.values.fill(6.4);const l=new IndependentLayers(createBaseProject(volume,settings)),frameCpu=[],brush=[],remesh=[],stamps=[],replay=[],start=performance.now();l.metrics.setEnabled(true);
 try{
 // Long fast motion: repeated spatial loops are continuous, with sparse-frame interpolation.
 l.beginStroke();for(let i=0;i<frames;i++){const t=i/90,p={x:.7*Math.cos(t*6),y:.7*Math.sin(t*6),z:.18*Math.sin(t*3)},begin=performance.now();l.applyStrokeLocal(p,.12,'add',.4,1/90,.5,true);brush.push(l.active.brushMs);if(i%9===0){const m=performance.now();l.active.rebuild();remesh.push(performance.now()-m);}frameCpu.push(performance.now()-begin);}l.finishStroke();assert.equal(l.undoCount,1);const drawn=volume.values.slice();l.undo();l.undo(true);assert.deepEqual(volume.values,drawn);
 // Large radius (existing UI maximum), Add/Subtract/Smooth all use the existing kernel.
 for(const mode of ['add','subtract','smooth']){l.beginStroke();for(let i=0;i<8;i++)l.applyStrokeLocal({x:0,y:0,z:.45},.5,mode,.4,1/90,.5,true);l.finishStroke();}
 // Paths of varying length, maximum Steady and Straight Line use the real buffered session.
 for(const length of [.2,1.6])for(const steady of [0,50,100]){const controls=new ClayPathControls();controls.steady=steady;controls.straightLine=steady===0;const s=new ClayStrokeSession(()=>l);s.begin({...settings,mode:'subtract'},controls,0,true);for(let i=1;i<=30;i++)s.sample({x:-length/2+length*i/30,y:.65,z:.1*Math.sin(i)},i*11);s.end();let guard=0;while(s.active){const t=performance.now();s.pump(4);replay.push(performance.now()-t);assert(++guard<10000);}assert.equal(s.replayRemaining,0);}
 // Repeated rotated stamps; no-op Add does not create a second history action.
 const definition=defineShape({kind:'box',targetLayerId:l.project.activeLayerId,operation:'add',dimensions:[.3,.3,.3],transform:{position:[0,-.3,0],rotation:[.2,.4,.1],scale:[1,1,1]}});
 for(let i=0;i<4;i++){l.stampShape({...definition,operation:i%2?'subtract':'add'});stamps.push({...l.lastStampStats});}
 // Extended sequence of exact rollback and Undo/Redo round trips without accumulating edits.
 const stable=volume.values.slice();for(let i=0;i<cycles;i++){l.beginStroke();l.applyStrokeLocal({x:.7,y:0,z:0},.16,'subtract',.4,1/90,.5,true);l.cancelStroke();assert.deepEqual(volume.values,stable);if(l.undoCount){l.undo();l.undo(true);assert.deepEqual(volume.values,stable);}}
 const id=l.project.activeLayerId;l.setFlag(id,'locked',true);assert.throws(()=>l.beginStroke());l.setFlag(id,'locked',false);l.setFlag(id,'visible',false);assert.throws(()=>l.beginStroke());l.setFlag(id,'visible',true);
 // Metadata transform leaves voxels intact; native reload and both export geometries work.
 l.setActiveTransform({position:[.2,-.1,.3],rotation:[.2,.3,.1],scale:[1.2,1.2,1.2]});assert.deepEqual(volume.values,stable);const reopened=openSculptProject(saveSculptProject(l.project));assert.deepEqual(reopened.layerStack.active.volume.getDenseView(),stable);
 const group=l.exportGroup();assert(group.children.length);group.traverse(o=>o.geometry?.dispose());
 if(resolution===64){const other=l.duplicate(id);l.select(other.id);l.setActiveTransform({position:[.4,0,0],rotation:[0,.2,0],scale:[1,1,1]});l.setOperation(other.id,'difference');l.composite.setQuality(64);await l.composite.flush();const derived=l.composite.exportGroup();assert(derived.children.length);derived.traverse(o=>o.geometry?.dispose());assert.deepEqual(volume.values,stable);}
 return {resolution,simulatedSeconds:frames/90,frames,extendedCycles:cycles,totalWallMs:performance.now()-start,frameProcessingCPU:summary(frameCpu),brush:summary(brush),remesh:summary(remesh),replayPump:summary(replay),stamps,pendingChunks:l.pendingChunks,sourceAndScratchMiB:resolution**3*8/1048576,trackedLowerBoundMiB:l.trackedBytes/1048576,triangles:l.active.triangles,historyMiB:l.active.history.memoryBytes/1048576};
 }finally{l.dispose();}
}
