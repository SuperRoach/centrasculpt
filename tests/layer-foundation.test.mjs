import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Vector3} from 'three';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {IncrementalMesher} from '../work/test-build/mesh.mjs';
import {resampleVolume} from '../work/test-build/resolution.mjs';
import {SdfLayer,LayerStack,SculptProject,createBaseProject} from '../work/test-build/layers.mjs';
import {SculptHistory} from '../work/test-build/history.mjs';
import {identityTransform,transformMatrix} from '../work/test-build/transform.mjs';
import {saveSculptProject,openSculptProject,saveProject} from '../work/test-build/project.mjs';
import {defineShape,validateShapeDefinition,shapeStampIntent} from '../work/test-build/shapes.mjs';
const settings={mode:'smooth',radius:0.3,strength:0.45,hardness:0.63,camera:{position:[2.4,1.7,3.3],target:[0,0,0]}};
const center={x:0.12,y:-0.08,z:0.8};
const hash=volume=>createHash('sha256').update(new Uint8Array(volume.values.buffer)).digest('hex');
function changeMetadata(binary,change) {
 const length=new DataView(binary).getUint32(12,true),source=new Uint8Array(binary),metadata=JSON.parse(new TextDecoder().decode(source.subarray(16,16+length)));change(metadata);
 const data=new TextEncoder().encode(JSON.stringify(metadata)),result=new Uint8Array(binary.byteLength-length+data.length);result.set(source.subarray(0,16));new DataView(result.buffer).setUint32(12,data.length,true);result.set(data,16);result.set(source.subarray(16+length),16+data.length);return result.buffer;
}
test('VolumeStore dense adapter is bit-exact with protected Phase 1.4 golden fields and dirty regions',()=>{
 const fixtures=JSON.parse(readFileSync(new URL('./fixtures/phase14-volume-golden.json',import.meta.url),'utf8'));
 for(const {resolution,extent,stages} of fixtures.cases) {
  const volume=new SDFVolume(resolution,extent);assert.equal(hash(volume),stages[0].hash);
  for(const stage of stages.slice(1)) {const bounds=volume.brush(center,0.31,stage.operation,stage.operation==='smooth'?0.4:0.012,undefined,0.65);assert.equal(hash(volume),stage.hash);assert.deepEqual(bounds,stage.bounds);}
  assert.deepEqual(volume.dimensions,[resolution,resolution,resolution]);assert.deepEqual(volume.voxelSize,[volume.step,volume.step,volume.step]);
 }
});
test('local/world sampling, bounds and transformed SDF conventions are explicit',()=>{
 const volume=new SDFVolume(33);
 for(const [x,y,z] of [[16,16,16],[12,15,20],[0,32,1]]) {const p={x:volume.coordinate(x),y:volume.coordinate(y),z:volume.coordinate(z)};assert(Math.abs(volume.sampleLocal(p)-volume.readVoxel(volume.index(x,y,z)))<1e-6);assert.equal(volume.sampleWorld(p),volume.sampleLocal(p));}
 const transform={position:[2,-1,0.3],rotation:[0.3,-0.6,0.2],scale:[2,2,2]},local={x:0.2,y:0.1,z:0.4};
 const world=new Vector3(local.x,local.y,local.z).applyMatrix4(transformMatrix(transform));assert(Math.abs(volume.sampleWorld(world,transform)-volume.sampleLocal(local)*2)<1e-6);
 const bounds=volume.worldBounds(transform);for(const x of [-1.6,1.6])for(const y of [-1.6,1.6])for(const z of [-1.6,1.6]) {const p=new Vector3(x,y,z).applyMatrix4(transformMatrix(transform)).toArray();assert(p.every((v,i)=>v>=bounds.min[i]-1e-8&&v<=bounds.max[i]+1e-8));}
 assert(volume.sampleLocal({x:10,y:0,z:0})>0);assert.throws(()=>volume.sampleLocal({x:NaN,y:0,z:0}),/finite/);
});
test('region reads are isolated, writes are validated atomically and report dirty bounds',()=>{
 const volume=new SDFVolume(17),original=volume.values.slice(),bounds={min:[6,7,8],max:[8,9,10]},region=volume.readRegion(bounds);region.values.fill(-0.2);assert.deepEqual(volume.values,original);
 const records=[];assert.deepEqual(volume.writeRegion(region,(...args)=>records.push(args)),bounds);assert(records.length>0);assert.equal(volume.writeRegion(region),null);
 const edited=volume.values.slice(),bad=volume.readRegion(bounds);bad.values[2]=NaN;assert.throws(()=>volume.writeRegion(bad));assert.deepEqual(volume.values,edited);
 assert.throws(()=>volume.readRegion({min:[-1,0,0],max:[1,1,1]}));
 const boundary=volume.readRegion({min:[0,0,0],max:[0,0,0]});boundary.values[0]=-1;assert.throws(()=>volume.writeRegion(boundary));assert.deepEqual(volume.values,edited);
});
test('meshing, history and resampling work through a VolumeStore without a dense fast path',()=>{
 const dense=new SDFVolume(17),store=new Proxy(dense,{get(target,key){if(key==='getDenseView')return ()=>undefined;const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 const mesher=new IncrementalMesher(store,8);const initial=mesher.rebuildChunks();assert(initial.triangles>0);
 const history=new SculptHistory(store);history.begin();mesher.invalidate(store.brush(center,0.3,'add',0.01,history.record));history.commit();assert(mesher.rebuildChunks().stats.chunks<initial.stats.totalChunks);
 history.undo();assert.deepEqual(resampleVolume(store,25).values,resampleVolume(dense,25).values);mesher.dispose();
});
test('layers have unique stable IDs, editable names and independent resolution/voxel metadata',()=>{
 const a=new SdfLayer(new SDFVolume(17)),b=new SdfLayer(new SDFVolume(33,2),{name:'Detail',order:1});assert.notEqual(a.id,b.id);
 const id=a.id;a.name='Renamed';a.volume=resampleVolume(a.volume,64);assert.equal(a.id,id);assert.equal(a.name,'Renamed');assert.deepEqual(a.dimensions,[64,64,64]);assert.deepEqual(b.dimensions,[33,33,33]);assert.notEqual(a.voxelSize[0],b.voxelSize[0]);
 assert.throws(()=>new SdfLayer(new SDFVolume(3),{name:''}));assert.throws(()=>new SdfLayer(new SDFVolume(3),{id:'invalid id'}));
});
test('active selection routes commands to only the selected layer and reordering preserves identity',()=>{
 const a=new SdfLayer(new SDFVolume(17)),b=new SdfLayer(new SDFVolume(25),{name:'Data-only future layer',order:1}),stack=new LayerStack([a,b]),project=new SculptProject(stack,settings),before=a.volume.values.slice();
 stack.select(b.id);project.editActive(layer=>layer.volume.brush(center,0.3,'add',0.01));assert.deepEqual(a.volume.values,before);assert.equal(project.activeLayerId,b.id);assert.throws(()=>stack.select('missing'));
 stack.move(b.id,0);assert.equal(stack.layers[0].id,b.id);assert.equal(stack.activeLayerId,b.id);assert.equal(b.order,0);assert.equal(a.order,1);
 assert.throws(()=>new LayerStack([a,new SdfLayer(new SDFVolume(3),{id:a.id,order:2})]));
});
test('hidden and locked layers reject edits and history replay without changing voxels',()=>{
 const project=createBaseProject(new SDFVolume(17),settings),layer=project.activeLayer,history=new SculptHistory(layer.volume,1e6,100,layer.id,()=>layer.editable);
 history.begin();project.editActive(l=>l.volume.brush(center,0.3,'add',0.01,history.record));history.commit();const edited=layer.volume.values.slice();
 for(const flag of ['visible','locked']) {
  layer.visible=true;layer.locked=false;layer[flag]=flag==='locked';
  assert.throws(()=>project.editActive(()=>assert.fail('must not execute')));assert.throws(()=>history.begin());assert.throws(()=>history.undo());assert.deepEqual(layer.volume.values,edited);
 }
 layer.visible=true;layer.locked=false;assert(history.undo());
});
test('history transactions retain target layer IDs and kinds independently of active selection',()=>{
 const a=new SdfLayer(new SDFVolume(17)),b=new SdfLayer(new SDFVolume(25),{order:1}),stack=new LayerStack([a,b]),history=new SculptHistory(a.volume,1e6,100,a.id),before=b.volume.values.slice();
 history.begin('reset');a.volume.brush(center,0.3,'subtract',0.01,history.record);assert.throws(()=>history.begin('shape-stamp'));history.commit();assert.equal(history.nextUndo.layerId,a.id);assert.equal(history.nextUndo.kind,'reset');
 stack.select(b.id);history.undo();assert.equal(history.lastApplied.layerId,a.id);assert.deepEqual(b.volume.values,before);history.redo();assert.equal(history.lastApplied.layerId,a.id);assert.equal(history.lastApplied.kind,'reset');
});
test('v1/v2 projects migrate losslessly into one Base layer and retain migrated IDs once saved',()=>{
 const volume=new SDFVolume(25);volume.brush(center,0.3,'subtract',0.02);
 const v2=saveProject(volume,settings);
 for(const version of [1,2]) {
  const binary=changeMetadata(v2,m=>{if(version===1)delete m.settings.hardness;});new DataView(binary).setUint32(8,version,true);
  const migrated=openSculptProject(binary);assert.equal(migrated.layerStack.layers.length,1);assert.equal(migrated.activeLayer.name,'Base');assert.deepEqual(migrated.activeLayer.volume.values,volume.values);assert.equal(migrated.settings.hardness,version===1?0:settings.hardness);
  const loaded=openSculptProject(saveSculptProject(migrated));assert.equal(loaded.id,migrated.id);assert.equal(loaded.activeLayerId,migrated.activeLayerId);assert.deepEqual(loaded.activeLayer.volume.values,volume.values);
 }
});
test('v3 round trips preserve project/layer IDs, transforms, ordering, flags, Boolean metadata, grids and voxels',()=>{
 const a=new SdfLayer(new SDFVolume(17),{name:'Base data',operation:'difference',transform:{position:[1,2,3],rotation:[0.2,0.3,0.4],scale:[1,2,3]},visible:false,locked:true});
 const b=new SdfLayer(new SDFVolume(33,2),{order:1,name:'Future data',operation:'intersect'});b.volume.brush(center,0.4,'smooth',0.5);
 const project=new SculptProject(new LayerStack([a,b],b.id),settings,'Layer data foundation');
 const binary=saveSculptProject(project),loaded=openSculptProject(binary);assert.equal(new DataView(binary).getUint32(8,true),3);assert.equal(loaded.id,project.id);assert.equal(loaded.name,project.name);assert.equal(loaded.activeLayerId,b.id);assert.deepEqual(loaded.settings,settings);
 for(let i=0;i<2;i++){assert.deepEqual(loaded.layerStack.layers[i].metadata(),project.layerStack.layers[i].metadata());assert.deepEqual(loaded.layerStack.layers[i].volume.values,project.layerStack.layers[i].volume.values);assert.deepEqual(loaded.layerStack.layers[i].voxelSize,project.layerStack.layers[i].voxelSize);}
 assert.deepEqual(new Uint8Array(saveSculptProject(loaded)),new Uint8Array(binary));
});
test('v3 import rejects malformed layer metadata, offsets and grids before replacing any project',()=>{
 const project=createBaseProject(new SDFVolume(17),settings),binary=saveSculptProject(project),before=project.activeLayer.volume.values.slice();
 for(const change of [m=>m.activeLayerId='missing',m=>m.layers[0].name='',m=>m.layers[0].visible='false',m=>m.layers[0].operation='xor',m=>m.layers[0].transform.scale=[0,1,1],m=>m.layers[0].grid.voxelSize=[1,1,1],m=>m.layers[0].grid.dimensions=[17,18,17],m=>m.layers[0].voxelOffset=1,m=>m.layers[0].voxelCount=1,m=>m.layers=[]])assert.throws(()=>openSculptProject(changeMetadata(binary,change)));
 assert.deepEqual(project.activeLayer.volume.values,before);
});
test('shape definitions validate all four kinds and normalize independent metadata copies',()=>{
 for(const kind of ['sphere','box','triangular-prism','pyramid']) {
  const input={kind,targetLayerId:'base',operation:'subtract',dimensions:[1,1,1],transform:identityTransform()},definition=defineShape(input);assert(definition.id);assert.equal(definition.kind,kind);assert.deepEqual(validateShapeDefinition(definition),definition);input.transform.scale[0]=2;assert.equal(definition.transform.scale[0],1);
 }
});
test('invalid shape definitions are rejected and future stamp intents never edit a target volume',()=>{
 const project=createBaseProject(new SDFVolume(17),settings),layer=project.activeLayer,definition=defineShape({kind:'box',targetLayerId:layer.id,operation:'add',dimensions:[1,2,3],transform:identityTransform()}),before=layer.volume.values.slice();
 for(const change of [d=>d.kind='torus',d=>d.targetLayerId='',d=>d.operation='intersect',d=>d.dimensions=[0,1,1],d=>d.transform.rotation=[NaN,0,0],d=>d.transform.scale=[-1,1,1],d=>{d.kind='sphere';d.dimensions=[1,2,1];}]){const copy=structuredClone(definition);change(copy);assert.throws(()=>validateShapeDefinition(copy));}
 const intent=shapeStampIntent(definition,project.layerStack);assert.equal(intent.kind,'shape-stamp');assert.equal(intent.targetLayerId,layer.id);assert.deepEqual(layer.volume.values,before);
 layer.locked=true;assert.throws(()=>shapeStampIntent(definition,project.layerStack));assert.throws(()=>shapeStampIntent({...definition,targetLayerId:'missing'},project.layerStack));
});
test('v3 Base projects preserve 64³, 128³ and 192³ data and retain layer IDs across resampling',()=>{
 const project=createBaseProject(new SDFVolume(17),settings),id=project.activeLayerId;
 project.editActive(layer=>layer.volume.brush(center,0.3,'add',0.012));
 for(const n of [64,128,192]) {
  project.activeLayer.volume=resampleVolume(project.activeLayer.volume,n);
  const loaded=openSculptProject(saveSculptProject(project));assert.equal(loaded.activeLayerId,id);assert.equal(loaded.activeLayer.volume.resolution,n);assert.deepEqual(loaded.activeLayer.volume.values,project.activeLayer.volume.values);assert.deepEqual(loaded.settings,settings);
  const history=new SculptHistory(loaded.activeLayer.volume,1e6,100,id);assert.equal(history.undoCount,0);
 }
});
test('future preview/controller input validation is data-only and rejects unsafe analogue values',async()=>{
 const {validateShapeToolInput}=await import('../work/test-build/shapes.mjs');
 assert.deepEqual(validateShapeToolInput({type:'request-preview'}),{type:'request-preview'});
 const event={type:'analogue-scale',axis:'uniform',value:-0.6,deltaSeconds:1/90};assert.deepEqual(validateShapeToolInput(event),event);
 for(const change of [e=>e.value=2,e=>e.deltaSeconds=Infinity,e=>e.axis='invalid',e=>e.axis=['x'],e=>e.value=NaN]){const invalid={...event};change(invalid);assert.throws(()=>validateShapeToolInput(invalid));}
});
