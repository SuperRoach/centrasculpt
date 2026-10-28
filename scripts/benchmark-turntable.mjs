import './compile-core.mjs';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {Group,Matrix4} from 'three';
import {Turntable,defaultTurntable} from '../work/test-build/turntable.mjs';
import {XRClayStroke} from '../work/test-build/xr-clay-stroke.mjs';
import {XRMirrorPlane} from '../work/test-build/xr-mirror-plane.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {EditorToolState} from '../work/test-build/editor-tool-state.mjs';
import {ShapePreviewModel} from '../work/test-build/shape-preview.mjs';
const settings={mode:'add',radius:.12,strength:1,hardness:.5,camera:{position:[2,2,3],target:[0,0,0]}};
const stats=v=>{v.sort((a,b)=>a-b);return {totalMs:+v.reduce((a,b)=>a+b,0).toFixed(3),p95Ms:+v[Math.floor(v.length*.95)].toFixed(3),maxMs:+v.at(-1).toFixed(3)};};
const rows=[];
for(const resolution of [64,128,192]){
 const volume=new SDFVolume(resolution,1.6,false);volume.values.fill(1);const layers=new IndependentLayers(createBaseProject(volume,settings)),table=new Turntable(),root=new Group();table.group.add(layers.group);table.enabled=true;layers.symmetry.enabled=true;
 const tools=new EditorToolState({layers:()=>layers,shape:new ShapePreviewModel(layers.project.activeLayerId),settings:()=>settings,setSettings(){},mode:()=> 'sculpt',selectTool(){},selectTransform(){},busy:()=>false,changed(){}}),stroke=new XRClayStroke(()=>layers,tools,root),mirror=new XRMirrorPlane(tools,root),pref=defaultTurntable();
 const geometry=layers.active.surface.group.children.map(c=>c.geometry),guideTimes=[];for(let i=0;i<900;i++){const start=performance.now();table.step(i*1000/90,pref);mirror.sync();guideTimes.push(performance.now()-start);}assert.equal(layers.active.mesher.pendingChunks,0);assert.deepEqual(layers.active.surface.group.children.map(c=>c.geometry),geometry);assert(volume.values.every(v=>v===1));
 table.reset();pref.rpm=12;const tool={role:'tool',connectionId:1,connected:true,tracked:true,gripTracked:true,buttons:{trigger:{pressed:false,justPressed:false,rawValue:0}}},pose=new Matrix4().makeTranslation(.55,.2,.12),times=[];let time=10000;table.step(time,pref);stroke.update(tool,pose,time,true);Object.assign(tool.buttons.trigger,{pressed:true,justPressed:true});stroke.update(tool,pose,time+=16,true);tool.buttons.trigger.justPressed=false;
 for(let i=0;i<150;i++){time+=1000/30;const start=performance.now();table.step(time,pref);stroke.update(tool,pose,time,true);times.push(performance.now()-start);assert(stroke.active,stroke.feedback);}
 const samples=stroke.session.raw.length;tool.buttons.trigger.pressed=false;stroke.update(tool,pose,time+=16,true);let drain=0;while(stroke.active){stroke.update(tool,pose,time+=16,true);assert(++drain<10000);}assert.equal(layers.undoCount,1);
 rows.push({resolution,presentation900:stats(guideTimes),presentationRemesh:0,lathe150:stats(times),samples,drainFrames:drain,pendingChunks:layers.active.mesher.pendingChunks});mirror.dispose();stroke.dispose();layers.dispose();
}
const report={description:'Host CPU only; cached mirror guide plus presentation-only rotation, then 12 RPM mirrored free-space Clay ring, radius .12, 150 poses at 30 Hz. Includes existing two-chunk XR rebuild admission and history; excludes rendering/GPU/Quest. Single run, no hard frame deadline.',rows};writeFileSync('outputs/phase-4-4/turntable-benchmarks.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
