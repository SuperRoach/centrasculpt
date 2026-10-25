import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,PerspectiveCamera,Scene,Vector3,Matrix4,Quaternion} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {ClayStroke} from '../work/test-build/stroke.mjs';
import {identityTransform,copyTransform,transformMatrix,toLocal,uniformScale,validateTransformEdit} from '../work/test-build/transform.mjs';
import {saveSculptProject,openSculptProject} from '../work/test-build/project.mjs';
import {InputOwnership} from '../work/test-build/interaction.mjs';
import {UniformTransformControls,LayerTransformTools} from '../work/test-build/transform-tools.mjs';
const settings={mode:'add',radius:0.3,strength:0.5,hardness:0.6,camera:{position:[2.4,1.7,3.3],target:[0,0,0]}};
const pose={position:[1,-0.4,0.3],rotation:[0.3,-0.7,0.4],scale:[2,2,2]};
const create=(n=25)=>new IndependentLayers(createBaseProject(new SDFVolume(n),settings));
const snapshot=c=>({bytes:c.active.layer.volume.getDenseView().slice(),store:c.active.layer.volume,runtime:c.active,geometries:c.active.surface.group.children.map(mesh=>mesh.geometry)});
function assertUnremeshed(c,before){assert.equal(c.active.layer.volume,before.store);assert.equal(c.active,before.runtime);assert.deepEqual(c.active.layer.volume.getDenseView(),before.bytes);assert.deepEqual(c.active.surface.group.children.map(mesh=>mesh.geometry),before.geometries);assert.equal(c.active.mesher.rebuildChunks(),null);}
function stroke(c,id){c.select(id);c.beginStroke();const world=new Vector3(0,0,0.85).applyMatrix4(transformMatrix(c.active.layer.transform));c.applyStroke(world,0.3,'add',0.5,1/60,0.6);c.finishStroke();}
function disposeExport(group){group.traverse(object=>{if(object.isMesh)object.geometry.dispose();});}

test('transform matrices round-trip local/world coordinates with translation rotation and uniform scale',()=>{
 const local={x:0.2,y:-0.1,z:0.7},world=new Vector3(local.x,local.y,local.z).applyMatrix4(transformMatrix(pose)),roundTrip=toLocal(world,pose);
 assert(new Vector3(roundTrip.x,roundTrip.y,roundTrip.z).distanceTo(new Vector3(local.x,local.y,local.z))<1e-12);
 assert.equal(uniformScale(pose),2);assert.deepEqual(validateTransformEdit(pose,identityTransform()),pose);
 assert.throws(()=>validateTransformEdit({...pose,scale:[1,2,3]},identityTransform()),/Non-uniform/);
});
test('pure metadata transforms and their undo/redo never modify SDF buffers, allocate geometry or remesh',()=>{
 const c=create(),before=snapshot(c);assert(c.setActiveTransform(pose));assertUnremeshed(c,before);assert.equal(c.undoCount,1);
 c.undo();assert.deepEqual(c.active.layer.transform,identityTransform());assertUnremeshed(c,before);
 c.undo(true);assert.deepEqual(c.active.layer.transform,pose);assertUnremeshed(c,before);c.dispose();
});
test('one continuous transform drag records one action even with many intermediate updates',()=>{
 const c=create(),before=snapshot(c);c.beginTransform();
 for(let i=1;i<=40;i++)c.updateTransform({...copyTransform(pose),position:[i/40,0,0]});
 assert.equal(c.undoCount,0);assert(c.transforming);assert(c.finishTransform());assert.equal(c.undoCount,1);assertUnremeshed(c,before);
 c.undo();assert.deepEqual(c.active.layer.transform,identityTransform());c.dispose();
});
test('numeric-style edits and Reset Transform are separate undoable metadata actions',()=>{
 const c=create();c.setActiveTransform({...identityTransform(),position:[1,0,0]});c.setActiveTransform({...copyTransform(c.active.layer.transform),rotation:[0,Math.PI/2,0]});c.setActiveTransform({...copyTransform(c.active.layer.transform),scale:[1.5,1.5,1.5]});c.setActiveTransform(identityTransform());
 assert.equal(c.undoCount,4);c.undo();assert.deepEqual(c.active.layer.transform.scale,[1.5,1.5,1.5]);c.undo();assert.deepEqual(c.active.layer.transform.scale,[1,1,1]);c.undo();assert.deepEqual(c.active.layer.transform.rotation,[0,0,0]);c.undo();assert.deepEqual(c.active.layer.transform,identityTransform());c.dispose();
});
test('invalid/no-op/cancelled transform edits preserve values, geometry and redo',()=>{
 const c=create(),before=snapshot(c);c.setActiveTransform(pose);c.undo();assert.equal(c.redoCount,1);
 assert.equal(c.setActiveTransform(identityTransform()),false);assert.equal(c.redoCount,1);
 for(const invalid of [{...pose,scale:[0,0,0]},{...pose,position:[NaN,0,0]},{...pose,scale:[1,2,1]}]){assert.throws(()=>c.setActiveTransform(invalid));assert.deepEqual(c.active.layer.transform,identityTransform());}
 c.beginTransform();c.updateTransform(pose);c.cancelTransform();assert.equal(c.redoCount,1);assertUnremeshed(c,before);c.dispose();
});
test('mixed voxel and transform history replays chronologically on the original layers',()=>{
 const c=create(),a=c.active.layer,b=c.create(64),aBefore=a.volume.values.slice(),bBefore=b.volume.values.slice();
 stroke(c,a.id);const aAfter=a.volume.values.slice();c.setActiveTransform(pose);stroke(c,b.id);const bAfter=b.volume.values.slice();c.setActiveTransform({...copyTransform(pose),position:[-1,0,0]});
 assert.equal(c.undoCount,4);c.select(a.id);assert.equal(c.undo(),b.id);assert.deepEqual(b.transform,identityTransform());assert.equal(c.undo(),b.id);assert.deepEqual(b.volume.values,bBefore);assert.equal(c.undo(),a.id);assert.deepEqual(a.transform,identityTransform());assert.equal(c.undo(),a.id);assert.deepEqual(a.volume.values,aBefore);
 for(let i=0;i<4;i++)c.undo(true);assert.deepEqual(a.volume.values,aAfter);assert.deepEqual(b.volume.values,bAfter);assert.deepEqual(a.transform,pose);assert.deepEqual(b.transform.position,[-1,0,0]);c.dispose();
});
test('a new metadata edit invalidates voxel redo, and a new stroke invalidates transform redo',()=>{
 const c=create(),id=c.active.layer.id;stroke(c,id);c.undo();c.setActiveTransform(pose);assert.equal(c.redoCount,0);assert.equal(c.active.history.canRedo,false);
 c.undo();stroke(c,id);assert.equal(c.redoCount,0);assert.equal(c.undo(true),null);c.dispose();
});
test('translated/rotated/scaled sculpting matches local SDF edits using world radius divided by scale',()=>{
 const c=create(33),expected=new SDFVolume(33),reference=new ClayStroke(),other=c.create(64),otherBefore=other.volume.values.slice(),id=c.project.layerStack.layers[0].id;
 c.select(id);c.setActiveTransform(pose);const point={x:0,y:0,z:0.85},world=new Vector3(point.x,point.y,point.z).applyMatrix4(transformMatrix(pose));c.beginStroke();
 for(let i=0;i<3;i++){c.applyStroke(world,0.3,'add',0.5,1/60,0.6);reference.apply(expected,point,0.3/2,'add',0.5,1/60,undefined,0.6);}
 c.finishStroke();assert(c.active.layer.volume.values.every((v,i)=>Math.abs(v-expected.values[i])<1e-7));assert.deepEqual(other.volume.values,otherBefore);c.dispose();
});
test('hidden/locked layers reject transforms and transform replay without modifying any layer',()=>{
 const c=create(),id=c.active.layer.id;c.setActiveTransform(pose);const before=snapshot(c);
 for(const flag of ['locked','visible']){c.setFlag(id,'locked',false);c.setFlag(id,'visible',true);c.setFlag(id,flag,flag==='locked');assert.throws(()=>c.beginTransform());assert.throws(()=>c.setActiveTransform(identityTransform()));assert.throws(()=>c.undo());assert.deepEqual(c.active.layer.transform,pose);assertUnremeshed(c,before);}
 c.setFlag(id,'visible',true);c.setFlag(id,'locked',false);c.undo();c.dispose();
});
test('transform history remains valid across target resampling and is removed safely with a deleted layer',()=>{
 const c=create(),a=c.active.layer,b=c.create(64);c.setActiveTransform(pose);stroke(c,b.id);c.resampleActive(128);assert.equal(c.undoCount,1);const store=b.volume;c.undo();assert.deepEqual(b.transform,identityTransform());assert.equal(b.volume,store);assert.equal(b.volume.resolution,128);
 c.undo(true);c.remove(b.id);assert.equal(c.undoCount,0);assert.equal(c.project.activeLayerId,a.id);c.dispose();
});
test('legacy nonuniform metadata stays intact until an explicit uniform edit and can be restored by undo',()=>{
 const c=create(),legacy={...copyTransform(pose),scale:[1,2,3]};c.active.layer.transform=legacy;c.syncPresentation();assert.throws(()=>c.beginStroke(),/Non-uniform/);
 c.setActiveTransform({...copyTransform(legacy),position:[3,0,0]});assert.deepEqual(c.active.layer.transform.scale,[1,2,3]);c.setActiveTransform({...copyTransform(c.active.layer.transform),scale:[2,2,2]});c.beginStroke();c.finishStroke();c.undo();assert.deepEqual(c.active.layer.transform.scale,[1,2,3]);c.dispose();
});
test('native transform save/load preserves each independent grid and voxel payload exactly',()=>{
 const c=create(),a=c.active.layer,b=c.create(64);c.setActiveTransform(pose);c.select(a.id);c.setActiveTransform({...copyTransform(pose),position:[-2,0,1]});
 const loaded=new IndependentLayers(openSculptProject(saveSculptProject(c.project)));
 for(const layer of c.project.layerStack.layers){const other=loaded.project.layerStack.get(layer.id);assert.deepEqual(other.transform,layer.transform);assert.deepEqual(other.volume.values,layer.volume.values);assert.equal(other.volume.resolution,layer.volume.resolution);}assert.equal(loaded.project.activeLayerId,a.id);loaded.dispose();c.dispose();
});
test('GLB retains separate nodes and transform matrices while geometry stays layer-local',async()=>{
 const c=create(),a=c.active.layer,b=c.create(64);c.setActiveTransform(pose);c.select(a.id);c.setActiveTransform({...copyTransform(pose),position:[-2,0,0]});const group=c.exportGroup();assert.equal(group.children.length,2);
 for(const mesh of group.children){assert(Math.abs(mesh.geometry.getAttribute('position').getX(0))<1);assert.deepEqual(mesh.scale.toArray(),[2,2,2]);}
 const old=globalThis.FileReader;globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(buffer=>{this.result=buffer;this.onloadend?.();});}};
 try{const glb=await new GLTFExporter().parseAsync(group,{binary:true}),view=new DataView(glb),json=JSON.parse(new TextDecoder().decode(new Uint8Array(glb,20,view.getUint32(12,true))));assert.equal(json.meshes.length,2);
 for(const node of json.nodes.filter(n=>n.mesh!==undefined)){const layer=c.project.layerStack.get(node.extras.layerId),matrix=node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(new Vector3(...(node.translation??[0,0,0])),new Quaternion(...(node.rotation??[0,0,0,1])),new Vector3(...(node.scale??[1,1,1])));assert(matrix.elements.every((v,i)=>Math.abs(v-transformMatrix(layer.transform).elements[i])<1e-6));}}
 finally{globalThis.FileReader=old;disposeExport(group);c.dispose();}
});
test('input ownership gates orbit and sculpting throughout transform gestures and busy/locked states',()=>{
 const input=new InputOwnership();assert(input.beginSculpt(true));assert.equal(input.cameraEnabled,false);assert.equal(input.beginTransform(true),false);input.end('sculpt');input.mode='translate';assert.equal(input.canSculpt(true),false);assert(input.beginTransform(true));assert.equal(input.cameraEnabled,false);assert.equal(input.beginSculpt(true),false);input.end('transform');assert(input.cameraEnabled);assert.equal(input.beginTransform(false),false);assert.equal(input.beginTransform(true,true),false);input.mode='sculpt';assert(input.canSculpt(true));
});
class FakeCanvas extends EventTarget {style={};getBoundingClientRect(){return {left:0,top:0,width:800,height:600};}setPointerCapture(){}releasePointerCapture(){}}
test('TransformControls enforces isotropic XYZ scaling for every scale handle',()=>{
 const camera=new PerspectiveCamera(38,1,0.01,100);camera.position.set(3,2,4);camera.lookAt(0,0,0);camera.updateMatrixWorld();const scene=new Scene(),object=new Group();scene.add(object);const controls=new UniformTransformControls(camera,new FakeCanvas());scene.add(controls.getHelper());controls.attach(object);controls.setMode('scale');controls.axis='X';scene.updateMatrixWorld(true);controls.pointerDown(null);assert.equal(controls.axis,'XYZ');controls.pointerUp(null);controls.dispose();
});
test('gizmo event wiring commits one action, freezes camera input and never sculpts/remeshes',()=>{
 const c=create(),scene=new Scene();scene.add(c.group);const input=new InputOwnership(),camera=new PerspectiveCamera(38,1,0.01,100),cameraEvents=[];camera.position.set(3,2,4);const before=snapshot(c);
 const tools=new LayerTransformTools(camera,new FakeCanvas(),scene,()=>c,input,{beforeDrag:()=>input.end('sculpt'),camera:enabled=>cameraEvents.push(enabled),changed:()=>{},error:text=>assert.fail(text),busy:()=>false});tools.setMode('translate');tools.controls.dragging=true;tools.controls.dispatchEvent({type:'mouseDown',mode:'translate'});assert.equal(input.cameraEnabled,false);
 for(let i=1;i<=5;i++){tools.controls.object.position.x=i/10;tools.controls.dispatchEvent({type:'objectChange'});}assert.equal(c.undoCount,0);tools.controls.dragging=false;assert.equal(c.undoCount,1);assert.equal(input.cameraEnabled,true);assert(cameraEvents.includes(false));assertUnremeshed(c,before);tools.dispose();c.dispose();
});
