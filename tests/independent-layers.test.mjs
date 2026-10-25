import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {LayerDisplayPreferences} from '../work/test-build/display-preferences.mjs';
import {saveSculptProject,openSculptProject,saveProject} from '../work/test-build/project.mjs';
import {transformMatrix} from '../work/test-build/transform.mjs';
const settings={mode:'add',radius:0.22,strength:0.35,hardness:0.6,camera:{position:[2.4,1.7,3.3],target:[0,0,0]}};
const center={x:0,y:0,z:0.85};
const create=(n=25)=>new IndependentLayers(createBaseProject(new SDFVolume(n),settings));
function stroke(controller,id,mode='add') {controller.select(id);controller.beginStroke();for(let i=0;i<3;i++)controller.applyStroke(center,0.3,mode,0.5,1/60,0.6);controller.finishStroke();}
const disposeExport=group=>group.traverse(object=>{if(object.isMesh)object.geometry.dispose();});
test('overlapping layers stay independent and every brush changes only its active volume and chunk buffers',()=>{
 const c=create(),a=c.active.layer,aBefore=a.volume.values.slice(),aMeshes=c.active.surface.group.children.map(m=>m.geometry),b=c.create(64),bBefore=b.volume.values.slice();
 assert.deepEqual(a.transform,b.transform);assert.notEqual(a.volume,b.volume);assert.notEqual(c.runtime(a.id).surface,c.runtime(b.id).surface);
 for(const mode of ['add','subtract','smooth']){stroke(c,b.id,mode);assert.deepEqual(a.volume.values,aBefore);assert.deepEqual(c.runtime(a.id).surface.group.children.map(m=>m.geometry),aMeshes);}
 const bAfter=b.volume.values.slice();assert.notDeepEqual(bAfter,bBefore);stroke(c,a.id);assert.deepEqual(b.volume.values,bAfter);
 assert.equal(c.group.children.length,2);c.dispose();
});
test('selection and hidden/locked policies prevent edits without mutating any layer',()=>{
 const c=create(),a=c.active.layer,b=c.create(64);stroke(c,b.id);const edited=b.volume.values.slice();
 c.setFlag(b.id,'locked',true);assert.throws(()=>c.beginStroke(),/locked/);assert.throws(()=>c.undo(),/locked/);assert.deepEqual(b.volume.values,edited);
 c.setFlag(b.id,'locked',false);c.setFlag(b.id,'visible',false);assert.throws(()=>c.beginStroke(),/hidden/);assert.equal(c.runtime(b.id).surface.group.visible,false);
 c.select(a.id);const beforeB=b.volume.values.slice();stroke(c,a.id);assert.deepEqual(b.volume.values,beforeB);c.dispose();
});
test('project-wide history restores the original target despite active selection and clears redo after a new stroke elsewhere',()=>{
 const c=create(),a=c.active.layer,b=c.create(64),aBefore=a.volume.values.slice(),bBefore=b.volume.values.slice();
 stroke(c,a.id);const aAfter=a.volume.values.slice();stroke(c,b.id);const bAfter=b.volume.values.slice();assert.equal(c.undoCount,2);
 c.select(a.id);assert.equal(c.undo(),b.id);assert.equal(c.project.activeLayerId,b.id);assert.deepEqual(b.volume.values,bBefore);assert.deepEqual(a.volume.values,aAfter);
 assert.equal(c.undo(),a.id);assert.deepEqual(a.volume.values,aBefore);assert.equal(c.redoCount,2);
 assert.equal(c.undo(true),a.id);assert.deepEqual(a.volume.values,aAfter);assert.deepEqual(b.volume.values,bBefore);
 stroke(c,a.id,'subtract');assert.equal(c.redoCount,0);assert.equal(c.runtime(b.id).history.canRedo,false);assert.notDeepEqual(bAfter,bBefore);c.dispose();
});
test('independent resolution changes retain other data, geometry and history while invalidating only the target',()=>{
 const c=create(),a=c.active.layer,b=c.create(64);stroke(c,a.id);stroke(c,b.id);
 const aData=a.volume.values.slice(),aRuntime=c.runtime(a.id),aMesh=aRuntime.surface.group.children[0].geometry,bId=b.id,bExtent=b.volume.extent;
 c.resampleActive(128);assert.equal(b.id,bId);assert.equal(b.volume.extent,bExtent);assert.equal(b.volume.resolution,128);assert.equal(a.volume.resolution,25);assert.deepEqual(a.volume.values,aData);assert.equal(c.runtime(a.id),aRuntime);assert.equal(aRuntime.surface.group.children[0].geometry,aMesh);
 assert.equal(c.runtime(b.id).history.undoCount,0);assert.equal(c.undoCount,1);assert.equal(c.undo(),a.id);c.dispose();
});
test('duplication copies exact voxels/bounds/transform metadata into independent storage and fresh history',()=>{
 const c=create(),source=c.active.layer;stroke(c,source.id);source.transform={position:[1,0,0],rotation:[0,0.2,0],scale:[1.2,1.2,1.2]};c.syncPresentation();
 const before=source.volume.values.slice(),copy=c.duplicate(source.id);assert.notEqual(copy.id,source.id);assert.notEqual(copy.volume.values.buffer,source.volume.values.buffer);assert.deepEqual(copy.volume.values,before);assert.deepEqual(copy.transform,source.transform);assert.notEqual(copy.transform,source.transform);assert.equal(copy.volume.resolution,source.volume.resolution);assert.equal(c.runtime(copy.id).history.undoCount,0);
 copy.volume.brush(center,0.3,'subtract',0.01);assert.deepEqual(source.volume.values,before);c.dispose();
});
test('deletion discards only deleted-layer history, resolves active selection, and always retains one layer',()=>{
 const c=create(),a=c.active.layer,b=c.create(64);stroke(c,a.id);stroke(c,b.id);c.undo();assert.equal(c.redoCount,1);
 c.remove(b.id);assert.equal(c.project.activeLayerId,a.id);assert.equal(c.project.layerStack.layers.length,1);assert.equal(c.redoCount,0);assert.equal(c.undoCount,1);assert.equal(c.group.children.length,1);assert(c.undo());assert.throws(()=>c.remove(a.id),/at least one/);assert.equal(c.project.layerStack.layers.length,1);c.dispose();
});
test('rename and reorder retain stable IDs, colours, voxels and history',()=>{
 const c=create(),a=c.active.layer,b=c.create(64);const colour=c.display.colour(c.project.id,b.id,b.order),before=b.volume.values.slice();stroke(c,a.id);
 c.rename(b.id,'Independent detail');c.move(b.id,-1);assert.equal(c.project.layerStack.layers[0].id,b.id);assert.equal(b.name,'Independent detail');assert.equal(c.display.colour(c.project.id,b.id,b.order),colour);assert.deepEqual(b.volume.values,before);assert.equal(c.undoCount,2);c.undo();assert.equal(c.undoCount,1);assert.equal(c.project.layerStack.layers[0].id,a.id);c.undo(true);const copy=c.duplicate(a.id);assert.notEqual(c.display.colour(c.project.id,copy.id,copy.order),c.display.colour(c.project.id,b.id,b.order));c.dispose();
});
test('Clay and Layer Colours affect materials only and never enter native metadata or voxel payloads',()=>{
 const c=create(),a=c.active.layer,b=c.create(64),before=saveSculptProject(c.project),aData=a.volume.values.slice();
 c.display.setColour(c.project.id,a.id,'#ff1122');c.display.setColour(c.project.id,b.id,'#2255ff');c.display.mode='layer-colours';c.syncPresentation();assert.equal(c.runtime(a.id).material.color.getHexString(),'ff1122');assert.equal(c.runtime(b.id).material.color.getHexString(),'2255ff');
 assert.deepEqual(new Uint8Array(saveSculptProject(c.project)),new Uint8Array(before));assert.deepEqual(a.volume.values,aData);
 c.display.mode='clay';c.syncPresentation();assert(c.runtime(a.id).material.color.equals(c.neutral.color));assert(c.runtime(b.id).material.color.equals(c.neutral.color));
 const loaded=new IndependentLayers(openSculptProject(before),c.display);assert.equal(loaded.display.colour(loaded.project.id,a.id,0),'#ff1122');loaded.dispose();c.dispose();
});
test('multi-layer native round trip preserves independent grids, flags, names, poses and active selection',()=>{
 const c=create(64),a=c.active.layer,b=c.create(128);stroke(c,b.id,'subtract');b.name='Fine detail';b.transform={position:[0.4,0,0],rotation:[0,0.3,0],scale:[1.1,1.1,1.1]};c.setFlag(a.id,'locked',true);c.setFlag(a.id,'visible',false);c.move(b.id,-1);
 const loaded=new IndependentLayers(openSculptProject(saveSculptProject(c.project)));assert.equal(loaded.project.activeLayerId,b.id);assert.equal(loaded.project.layerStack.layers.length,2);
 for(const layer of c.project.layerStack.layers){const restored=loaded.project.layerStack.get(layer.id);assert.deepEqual(restored.metadata(),layer.metadata());assert.deepEqual(restored.volume.values,layer.volume.values);assert.equal(restored.volume.resolution,layer.volume.resolution);}
 assert.equal(loaded.runtime(a.id).surface.group.visible,false);assert.equal(loaded.undoCount,0);loaded.dispose();c.dispose();
});
test('legacy single-volume files remain editable Base projects in the independent renderer',()=>{
 const volume=new SDFVolume(17);volume.brush(center,0.3,'add',0.02);const c=new IndependentLayers(openSculptProject(saveProject(volume,settings)));assert.equal(c.project.layerStack.layers.length,1);assert.equal(c.active.layer.name,'Base');assert.deepEqual(c.active.layer.volume.values,volume.values);stroke(c,c.active.layer.id);assert.equal(c.undoCount,1);c.dispose();
});
test('layer transforms remain unbaked in SDF storage and target world-space brushes correctly',()=>{
 const c=create(),a=c.active.layer,b=c.create(64);b.transform={position:[1,2,0],rotation:[0.1,0.2,0.3],scale:[1.5,1.5,1.5]};const before=b.volume.values.slice(),aData=a.volume.values.slice();c.syncPresentation();assert.deepEqual(b.volume.values,before);
 const world=new Vector3(center.x,center.y,center.z).applyMatrix4(transformMatrix(b.transform));c.beginStroke();c.applyStroke(world,0.3,'add',0.5,1/60,0.6);c.finishStroke();assert.notDeepEqual(b.volume.values,before);assert.deepEqual(a.volume.values,aData);
 const exported=c.exportGroup(),node=exported.children.find(node=>node.userData.layerId===b.id);assert.deepEqual(node.position.toArray(),b.transform.position);assert.deepEqual(node.scale.toArray(),b.transform.scale);assert.equal(exported.children.length,2);disposeExport(exported);c.dispose();
});
test('visible layers export as separate GLB meshes/nodes with neutral materials and no colour attributes',async()=>{
 const c=create(),a=c.active.layer,b=c.create(64),hidden=c.duplicate(a.id);c.setFlag(hidden.id,'visible',false);c.display.mode='layer-colours';c.display.setColour(c.project.id,a.id,'#ff0000');c.display.setColour(c.project.id,b.id,'#0000ff');c.syncPresentation();
 const group=c.exportGroup();assert.equal(group.children.length,2);assert.notEqual(group.children[0].geometry,group.children[1].geometry);assert(group.children.every(mesh=>mesh.material.color.equals(c.neutral.color)));assert(group.children.every(mesh=>!mesh.geometry.getAttribute('color')));
 const originalReader=globalThis.FileReader;globalThis.FileReader=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(buffer=>{this.result=buffer;this.onloadend?.();});}};
 try {
  const glb=await new GLTFExporter().parseAsync(group,{binary:true}),view=new DataView(glb),json=JSON.parse(new TextDecoder().decode(new Uint8Array(glb,20,view.getUint32(12,true))));assert.equal(json.meshes.length,2);
  const nodes=json.nodes.filter(node=>node.mesh!==undefined);assert.equal(nodes.length,2);assert.deepEqual(new Set(nodes.map(node=>node.extras.layerId)),new Set([a.id,b.id]));assert(nodes.every(node=>node.extras.layerId!==hidden.id));assert(json.meshes.every(mesh=>mesh.primitives[0].attributes.COLOR_0===undefined));
 }finally{globalThis.FileReader=originalReader;disposeExport(group);c.dispose();}
});
test('capacity failures never resample or alter other layers, and colours validate separately',()=>{
 const c=create(),a=c.active.layer,b=c.create(64),before=a.volume.values.slice();assert.throws(()=>c.create(999));assert.throws(()=>c.resampleActive(999));assert.deepEqual(a.volume.values,before);assert.equal(b.volume.resolution,64);assert.equal(c.project.layerStack.layers.length,2);
 const p=new LayerDisplayPreferences();assert.throws(()=>p.setColour(c.project.id,a.id,'red'));p.setColour(c.project.id,a.id,'#AbCdEf');assert.equal(p.colour(c.project.id,a.id,0),'#abcdef');c.dispose();
});
test('global timeline stays aligned with sparse-history eviction',()=>{
 const c=create(9),id=c.active.layer.id;
 for(let i=0;i<105;i++){c.beginStroke();c.applyStroke({x:0,y:0,z:0.8},0.5,'add',0.35,1/60,0);c.finishStroke();}
 assert.equal(c.undoCount,100);for(let i=0;i<100;i++)assert.equal(c.undo(),id);assert.equal(c.undo(),null);assert.equal(c.redoCount,100);c.dispose();
});
test('model rejects shared volume objects or buffers instead of silently making layers dependent',async()=>{
 const {SdfLayer,LayerStack,SculptProject}=await import('../work/test-build/layers.mjs');
 const volume=new SDFVolume(17),a=new SdfLayer(volume),aliased=new SdfLayer(volume,{order:1});
 assert.throws(()=>new LayerStack([a,aliased]),/independent voxel storage/);
 const bufferAlias=new SdfLayer(new SDFVolume(17),{order:1});bufferAlias.volume.values=new Float32Array(volume.values.buffer);assert.throws(()=>new LayerStack([a,bufferAlias]),/independent voxel storage/);
 const b=new SdfLayer(new SDFVolume(17),{order:1}),stack=new LayerStack([a,b]),project=new SculptProject(stack,settings);b.volume=volume;
 assert.throws(()=>new IndependentLayers(project),/independent voxel storage/);assert.throws(()=>saveSculptProject(project),/independent voxel storage/);
 const c=create();c.active.layer.volume=new SDFVolume(17);assert.throws(()=>c.beginStroke(),/Volume replaced outside/);c.dispose();
});
