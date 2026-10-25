import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Matrix4} from 'three';
import {XRLayerGrab} from '../work/test-build/xr-layer-grab.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {saveSculptProject,openSculptProject} from '../work/test-build/project.mjs';
const settings={mode:'add',radius:.3,strength:.5,hardness:.6,camera:{position:[2,2,3],target:[0,0,0]}};
const pose=x=>new Matrix4().makeTranslation(x,0,0);
function setup(){const layers=new IndependentLayers(createBaseProject(new SDFVolume(17),settings)),parent=new Group();parent.add(layers.group);const grab=new XRLayerGrab(()=>layers),tool={role:'tool',connected:true,gripTracked:true,connectionId:5,buttons:{grip:{pressed:true,justPressed:true}},stick:{available:true,y:0}};return {layers,parent,grab,tool};}
test('VR grip transaction moves/rotates metadata once, preserves voxels/geometry, undo/save/export',()=>{
 const {layers,parent,grab,tool}=setup(),volume=layers.active.volume,bytes=volume.getDenseView().slice(),geometry=layers.active.surface.group.children.map(m=>m.geometry);
 parent.scale.setScalar(.5);grab.step(tool,pose(0),0);tool.buttons.grip.justPressed=false;
 grab.step(tool,pose(.5).multiply(new Matrix4().makeRotationZ(.4)),16);assert(Math.abs(layers.active.layer.transform.position[0]-1)<1e-8);assert(Math.abs(layers.active.layer.transform.rotation[2]-.4)<1e-8);
 tool.stick.y=-1;for(let t=32;t<1032;t+=16)grab.step(tool,pose(.5),t);assert.equal(layers.active.layer.transform.scale[0],1);assert.equal(layers.undoCount,0);
 tool.buttons.grip.pressed=false;grab.step(tool,pose(.5),1040);assert.equal(layers.undoCount,1);
 const saved=JSON.parse(JSON.stringify(layers.active.layer.transform)),opened=openSculptProject(saveSculptProject(layers.project));assert.deepEqual(opened.layerStack.layers[0].transform,saved);
 const exported=layers.exportGroup();assert.deepEqual(exported.children[0].position.toArray(),saved.position);assert.deepEqual(exported.children[0].scale.toArray(),saved.scale);exported.traverse(o=>o.geometry?.dispose());
 assert.deepEqual(volume.getDenseView(),bytes);assert.deepEqual(layers.active.surface.group.children.map(m=>m.geometry),geometry);assert.equal(layers.active.mesher.rebuildChunks(),null);
 layers.undo();assert.deepEqual(layers.active.layer.transform.position,[0,0,0]);layers.undo(true);assert.deepEqual(JSON.parse(JSON.stringify(layers.active.layer.transform)),saved);layers.dispose();
});
test('simultaneous workspace movement is removed from layer-local poses',()=>{
 const {layers,parent,grab,tool}=setup();grab.step(tool,pose(1),0);parent.position.x=3;parent.scale.setScalar(2);grab.step(tool,pose(5),16);assert(Math.abs(layers.active.layer.transform.position[0])<1e-8);grab.cancel();assert.equal(layers.undoCount,0);layers.dispose();
});
test('loss, identity replacement, invalid pose, mode/session cancellation roll back without history',()=>{
 for(const reason of ['tracking','identity','invalid','disabled']){const {layers,grab,tool}=setup();grab.step(tool,pose(0),0);grab.step(tool,pose(1),16);if(reason==='tracking')tool.gripTracked=false;if(reason==='identity')tool.connectionId++;const p=pose(2);if(reason==='invalid')p.elements[0]=NaN;assert(grab.step(tool,p,32,reason!=='disabled'));assert.equal(grab.active,false);assert.deepEqual(layers.active.layer.transform.position,[0,0,0]);assert.equal(layers.undoCount,0);layers.dispose();}
});
test('locked, hidden, Boolean and support input cannot start layer transactions',()=>{
 for(const reason of ['locked','hidden','boolean','support']){const {layers,grab,tool}=setup();if(reason==='locked')layers.active.layer.locked=true;if(reason==='hidden')layers.active.layer.visible=false;if(reason==='boolean')layers.viewMode='boolean';if(reason==='support')tool.role='support';grab.step(tool,pose(0),0);assert.equal(grab.active,false);assert.equal(layers.transforming,false);layers.dispose();}
});
test('layer scale stays unchanged regardless of stick input',()=>{
 const {layers,grab,tool}=setup();layers.setActiveTransform({position:[0,0,0],rotation:[0,0,0],scale:[999,999,999]});grab.step(tool,pose(0),0);tool.stick.y=-1;grab.step(tool,pose(0),50);assert.deepEqual(layers.active.layer.transform.scale,[999,999,999]);tool.stick.available=false;tool.stick.y=1;grab.step(tool,pose(0),100);assert.deepEqual(layers.active.layer.transform.scale,[999,999,999]);grab.cancel();layers.dispose();
});
test('rotated nested workspace and sculpture parents preserve rigid local controller deltas',()=>{
 const {layers,parent,grab,tool}=setup(),world=new Group();world.add(parent);world.position.set(2,-1,3);world.rotation.set(.3,.5,-.2);world.scale.setScalar(.4);parent.position.set(-.2,.4,.1);parent.rotation.set(-.4,.2,.1);layers.group.position.set(.2,.1,-.3);layers.group.rotation.set(.1,-.3,.2);layers.group.updateWorldMatrix(true,false);
 layers.setActiveTransform({position:[.3,.2,-.1],rotation:[.2,.4,.1],scale:[2,2,2]});const before=layers.active.surface.group.matrix.clone();layers.active.surface.group.updateMatrix();before.copy(layers.active.surface.group.matrix);
 const start=new Matrix4().makeTranslation(.1,.2,.3),delta=new Matrix4().makeRotationY(.4);delta.setPosition(.2,-.1,.3);
 grab.step(tool,layers.group.matrixWorld.clone().multiply(start),0);tool.buttons.grip.justPressed=false;grab.step(tool,layers.group.matrixWorld.clone().multiply(delta).multiply(start),16);
 const expected=delta.clone().multiply(before);layers.active.surface.group.updateMatrix();assert(layers.active.surface.group.matrix.elements.every((v,i)=>Math.abs(v-expected.elements[i])<1e-8));tool.buttons.grip.pressed=false;grab.step(tool,pose(0),32);assert.equal(layers.undoCount,2);layers.dispose();
});
test('stationary layer grab is a history no-op and does not consume redo',()=>{
 const {layers,grab,tool}=setup();layers.setActiveTransform({position:[.2,0,0],rotation:[0,0,0],scale:[1,1,1]});layers.undo();grab.step(tool,pose(0),0);tool.buttons.grip.justPressed=false;grab.step(tool,pose(0),16);tool.buttons.grip.pressed=false;grab.step(tool,pose(0),32);assert.equal(layers.undoCount,0);assert.equal(layers.redoCount,1);layers.dispose();
});

test('missing active selection rejects Tool grab without throwing',()=>{const {layers,grab,tool}=setup();layers.project.layerStack.selected='missing';assert.doesNotThrow(()=>grab.step(tool,pose(0),0));assert.equal(grab.active,false);assert.equal(layers.undoCount,0);layers.dispose();});
