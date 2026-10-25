import test from 'node:test';
import assert from 'node:assert/strict';
import {PerspectiveCamera,Scene,Quaternion,Euler} from 'three';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {ShapePreviewModel} from '../work/test-build/shape-preview.mjs';
import {ShapeRotationTool} from '../work/test-build/shape-rotation.mjs';
import {InputOwnership} from '../work/test-build/interaction.mjs';
import {saveSculptProject} from '../work/test-build/project.mjs';
const settings={mode:'add',radius:.22,strength:.35,hardness:.5,camera:{position:[2.4,1.7,3.3],target:[0,0,0]}};
class Canvas extends EventTarget{style={};getBoundingClientRect(){return {left:0,top:0,width:800,height:600};}setPointerCapture(){}releasePointerCapture(){}}
function setup(){const c=new IndependentLayers(createBaseProject(new SDFVolume(25),settings)),model=new ShapePreviewModel(c.project.activeLayerId),input=new InputOwnership(),scene=new Scene(),camera=new PerspectiveCamera(38,1,.01,100),cameraEvents=[];camera.position.set(3,2,4);let busy=false;const tool=new ShapeRotationTool(camera,new Canvas(),scene,model,()=>c.project.layerStack,input,{beforeDrag:()=>{},camera:enabled=>cameraEvents.push(enabled),changed:()=>{},error:text=>assert.fail(text),busy:()=>busy});return {c,model,input,tool,cameraEvents,setBusy:value=>{busy=value;},dispose:()=>{tool.dispose();c.dispose();}};}
function drag(s){s.tool.controls.dragging=true;s.tool.controls.dispatchEvent({type:'mouseDown',mode:'rotate'});}
test('rotation mode freezes pointer placement and requires an enabled editable ghost',()=>{const s=setup();try{assert.throws(()=>s.tool.toggle(),/Enable/);s.model.enabled=true;s.tool.toggle();assert(s.model.rotationMode);assert.equal(s.model.followPointer,false);assert.equal(s.tool.controls.mode,'rotate');assert.equal(s.tool.controls.object,s.tool.proxy);assert.notEqual(s.tool.proxy,s.c.active.surface.group);s.tool.toggle();assert.equal(s.model.rotationMode,false);assert.equal(s.tool.controls.object,s.tool.proxy);assert.equal(s.tool.controls.mode,'translate');assert(s.model.canApply(s.c.project.layerStack));assert.equal(s.model.followPointer,false);}finally{s.dispose();}});
test('ghost ring rotation on transformed layers changes only preview pose and never voxels, history, chunks or saves',()=>{
 const s=setup();try{s.c.setActiveTransform({position:[.4,-.2,.3],rotation:[.3,-.5,.2],scale:[1.6,1.6,1.6]});s.model.enabled=true;s.model.set({...s.model.definition,kind:'box',dimensions:[.4,.7,.6]},s.c.project.layerStack);const native=saveSculptProject(s.c.project),metadata=s.c.active.layer.metadata(),bytes=s.c.active.volume.values.slice(),geometry=s.c.active.surface.group.children.map(m=>m.geometry),history=s.c.undoCount;
 s.tool.toggle();const position=s.model.definition.transform.position.slice(),scale=s.model.definition.transform.scale.slice();drag(s);assert.equal(s.input.cameraEnabled,false);assert.equal(s.input.canSculpt(true),false);assert.equal(s.input.beginTransform(true),false);
 for(let i=1;i<=4;i++){s.tool.proxy.rotation.y+=.12;s.tool.controls.dispatchEvent({type:'objectChange'});s.tool.sync();}
 const actual=s.model.worldTransform(s.c.project.layerStack),q=new Quaternion().setFromEuler(new Euler(...actual.rotation,'XYZ'));assert(q.angleTo(s.tool.proxy.quaternion)<1e-7);assert(s.model.definition.transform.position.every((v,i)=>Math.abs(v-position[i])<1e-10));assert(s.model.definition.transform.scale.every((v,i)=>Math.abs(v-scale[i])<1e-10));assert.deepEqual(s.c.active.layer.metadata(),metadata);assert.deepEqual(s.c.active.volume.values,bytes);assert.deepEqual(s.c.active.surface.group.children.map(m=>m.geometry),geometry);assert.equal(s.c.active.mesher.rebuildChunks(),null);assert.equal(s.c.undoCount,history);assert.deepEqual(new Uint8Array(saveSculptProject(s.c.project)),new Uint8Array(native));
 s.tool.finish();assert.equal(s.input.cameraEnabled,true);assert(s.cameraEvents.includes(false));assert(s.model.rotationMode);s.tool.toggle();assert.equal(s.model.rotationMode,false);
 const before=s.c.active.volume.values.slice(),d=s.model.definition;d.transform.position=[0,0,.72];d.operation='subtract';assert(s.c.stampShape(d));assert.equal(s.c.undoCount,history+1);s.c.undo();assert.deepEqual(s.c.active.volume.values,before);
 }finally{s.dispose();}
});
test('hidden locked and busy targets detach ghost controls and release camera during a gesture',()=>{
 const s=setup();try{s.model.enabled=true;s.tool.toggle();drag(s);s.c.setFlag(s.c.project.activeLayerId,'locked',true);s.tool.sync();assert.equal(s.input.cameraEnabled,true);assert.equal(s.tool.controls.enabled,false);assert.equal(s.model.rotationMode,false);assert.throws(()=>s.tool.toggle(),/Unlock/);s.c.setFlag(s.c.project.activeLayerId,'locked',false);s.tool.toggle();s.setBusy(true);s.tool.sync();assert.equal(s.tool.controls.enabled,false);s.setBusy(false);s.tool.sync();assert.equal(s.tool.controls.enabled,true);s.c.setFlag(s.c.project.activeLayerId,'visible',false);s.tool.sync();assert.equal(s.model.rotationMode,false);assert.equal(s.tool.controls.object,undefined);}finally{s.dispose();}
});
test('selection change ends preview drag without redirecting its rotation to another independent layer',()=>{
 const s=setup();try{const a=s.c.active.layer,b=s.c.create(64);s.c.select(a.id);s.model.enabled=true;s.tool.toggle();drag(s);s.tool.proxy.rotation.x+=.2;s.tool.controls.dispatchEvent({type:'objectChange'});const bytes=b.volume.values.slice(),metadata=b.metadata(),count=s.c.undoCount;s.c.select(b.id);s.tool.sync();assert.equal(s.input.cameraEnabled,true);assert.equal(s.c.undoCount,count);assert.deepEqual(b.metadata(),metadata);assert.deepEqual(b.volume.values,bytes);assert.equal(s.model.definition.targetLayerId,b.id);assert.equal(s.tool.controls.object,s.tool.proxy);}finally{s.dispose();}
});
test('hiding/resetting ghost clears rotation and local/world axes can change without remeshing',()=>{
 const s=setup();try{s.model.enabled=true;s.tool.toggle();s.tool.space='world';s.tool.sync();assert.equal(s.tool.controls.space,'world');s.tool.space='local';s.tool.sync();assert.equal(s.tool.controls.space,'local');drag(s);s.model.enabled=false;s.tool.sync();assert.equal(s.model.rotationMode,false);assert.equal(s.input.cameraEnabled,true);s.model.reset(s.c.project.activeLayerId);assert.equal(s.model.rotationMode,false);assert.equal(s.model.followPointer,true);}finally{s.dispose();}
});
