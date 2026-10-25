import test from 'node:test';
import assert from 'node:assert/strict';
import { SDFVolume } from '../work/test-build/sdf.mjs';
import { ClayStroke } from '../work/test-build/stroke.mjs';
import { SculptHistory } from '../work/test-build/history.mjs';
import { saveProject, openProject, MAX_PROJECT_BYTES } from '../work/test-build/project.mjs';
const settings={mode:'smooth',radius:0.32,strength:0.63,hardness:0.42,camera:{position:[2.4,1.7,3.3],target:[0.1,0,0]}};
const center={x:0,y:0,z:0.8};
function brushAction(volume,history,mode='add') {
 history.begin();
 for(let i=0;i<10;i++)volume.brush(center,0.3,mode,mode==='smooth'?0.4:0.004,history.record);
 history.commit();
}
test('a continuous clay drag is one sparse history action with exact undo/redo',()=>{
 const v=new SDFVolume(25),h=new SculptHistory(v),stroke=new ClayStroke(),before=v.values.slice();
 h.begin();
 for(let i=0;i<60;i++)stroke.apply(v,{x:i/300,y:0,z:0.8},0.3,'add',0.6,1/60,h.record);
 assert.equal(h.undoCount,0);assert(h.active);assert(h.commit());assert.equal(h.undoCount,1);
 const after=v.values.slice();assert.notDeepEqual(after,before);
 const changed=after.reduce((count,value,i)=>count+(value!==before[i]?1:0),0);
 assert.equal(h.memoryBytes,changed*12);assert(h.memoryBytes<before.byteLength);
 assert(h.undo());assert.deepEqual(v.values,before);assert(!h.canUndo);assert(h.canRedo);
 assert(h.redo());assert.deepEqual(v.values,after);assert.equal(h.undoCount,1);assert(!h.canRedo);
});
test('multi-action undo/redo works exactly for Add, Subtract and Smooth',()=>{
 const v=new SDFVolume(25),h=new SculptHistory(v),states=[v.values.slice()];
 for(const mode of ['add','subtract','smooth']) {brushAction(v,h,mode);states.push(v.values.slice());}
 for(let i=2;i>=0;i--) {h.undo();assert.deepEqual(v.values,states[i]);}
 assert.equal(h.undo(),null);
 for(let i=1;i<4;i++) {h.redo();assert.deepEqual(v.values,states[i]);}
 assert.equal(h.redo(),null);
});
test('a new nonempty stroke invalidates redo, while empty or net-zero actions preserve it',()=>{
 const v=new SDFVolume(17),h=new SculptHistory(v);brushAction(v,h);h.undo();
 h.begin();assert(!h.commit());assert(h.canRedo);
 h.begin();const index=v.index(8,8,8),before=v.values[index];
 h.record(index,before,before+0.1);h.record(index,before+0.1,before);assert(!h.commit());assert(h.canRedo);
 brushAction(v,h,'subtract');assert(!h.canRedo);assert.equal(h.redoCount,0);assert.equal(h.redo(),null);
});
test('undoable reset and history eviction retain consistent voxel states',()=>{
 const v=new SDFVolume(17),baseline=v.values.slice(),h=new SculptHistory(v,Infinity,2);
 brushAction(v,h);const edited=v.values.slice();
 h.begin();v.reset(h.record);h.commit();assert.deepEqual(v.values,baseline);
 h.undo();assert.deepEqual(v.values,edited);h.redo();assert.deepEqual(v.values,baseline);
 brushAction(v,h,'subtract');assert.equal(h.undoCount,2);
 h.undo();assert.deepEqual(v.values,baseline);h.undo();assert.deepEqual(v.values,edited);assert(!h.canUndo);
});
test('history refuses undo during an uncommitted stroke and enforces the memory budget',()=>{
 const v=new SDFVolume(17),h=new SculptHistory(v,1);
 h.begin();assert.throws(()=>h.begin(),/active/);assert.throws(()=>h.undo(),/Finish/);h.commit();
 brushAction(v,h);brushAction(v,h,'subtract');assert.equal(h.undoCount,1);assert(h.memoryBytes>0);
 h.undo();assert.equal(h.redoCount,1);h.redo();assert.equal(h.undoCount,1);
});
test('native project round trip preserves exact voxels, alternate grid, extent and settings',()=>{
 for(const [resolution,extent] of [[17,1.6],[33,2.1],[57,1.6]]) {
  const v=new SDFVolume(resolution,extent);v.brush(center,0.4,'subtract',0.02);v.brush(center,0.3,'smooth',0.5);
  const original=v.values.slice(),binary=saveProject(v,settings),opened=openProject(binary);
  assert.equal(opened.volume.resolution,resolution);assert.equal(opened.volume.extent,extent);assert.equal(opened.volume.step,v.step);
  assert.deepEqual(opened.volume.values,original);assert.deepEqual(opened.settings,settings);
  assert.deepEqual(new Uint8Array(saveProject(opened.volume,opened.settings)),new Uint8Array(binary));
  opened.volume.brush(center,0.3,'add',0.01);assert.deepEqual(v.values,original);
 }
});
function alterMetadata(buffer,change) {
 const view=new DataView(buffer),length=view.getUint32(12,true),bytes=new Uint8Array(buffer);
 const metadata=JSON.parse(new TextDecoder().decode(bytes.subarray(16,16+length)));change(metadata);
 const updated=new TextEncoder().encode(JSON.stringify(metadata)),next=new ArrayBuffer(buffer.byteLength-length+updated.length),result=new Uint8Array(next);
 result.set(bytes.subarray(0,16));new DataView(next).setUint32(12,updated.length,true);result.set(updated,16);result.set(bytes.subarray(16+length),16+updated.length);return next;
}
test('malformed, truncated, oversized and future-version project files are rejected',()=>{
 const valid=saveProject(new SDFVolume(17),settings);
 assert.throws(()=>openProject(new ArrayBuffer(0)),/size/);
 assert.throws(()=>openProject(new ArrayBuffer(MAX_PROJECT_BYTES+1)),/size/);
 const wrong=valid.slice(0);new Uint8Array(wrong)[0]=0;assert.throws(()=>openProject(wrong),/not a Centra Sculpt/);
 const future=valid.slice(0);new DataView(future).setUint32(8,99,true);assert.throws(()=>openProject(future),/version/);
 const length=valid.slice(0);new DataView(length).setUint32(12,0xffffffff,true);assert.throws(()=>openProject(length),/length/);
 const json=valid.slice(0);new Uint8Array(json)[16]=0;assert.throws(()=>openProject(json),/metadata/);
 assert.throws(()=>openProject(valid.slice(0,-1)),/length/);
 const trailing=new Uint8Array(valid.byteLength+1);trailing.set(new Uint8Array(valid));assert.throws(()=>openProject(trailing.buffer),/length/);
});
test('invalid dimensions, extents, encodings and sculpting/camera settings are rejected',()=>{
 const valid=saveProject(new SDFVolume(17),settings);
 for(const change of [m=>m.grid.dimensions=[17,18,17],m=>m.grid.dimensions=[10000,10000,10000],m=>m.grid.extent=0,m=>m.grid.extent=11,m=>m.voxelEncoding='float64',m=>m.settings.mode='invalid',m=>m.settings.radius=5,m=>m.settings.strength=-1,m=>m.settings.camera.position=[0,0,0],m=>m.settings.camera.target=[5000,0,0],m=>m.settings=null]) {
  assert.throws(()=>openProject(alterMetadata(valid,change)));
 }
});
test('non-finite, out-of-range and nonpositive boundary voxel values are rejected',()=>{
 const valid=saveProject(new SDFVolume(17),settings),offset=16+new DataView(valid).getUint32(12,true);
 for(const value of [NaN,Infinity,-Infinity,100,-0.01,0]) {
  const broken=valid.slice(0);new DataView(broken).setFloat32(offset,value,true);assert.throws(()=>openProject(broken));
 }
 const internal=valid.slice(0);new DataView(internal).setFloat32(offset+(8+17*(8+17*8))*4,NaN,true);assert.throws(()=>openProject(internal),/Voxel/);
});
test('saturated Float32 SDF values remain saveable without rounding rejection',()=>{
 const v=new SDFVolume(17);v.values[v.index(8,8,8)]=Math.fround(v.extent*4);
 assert.deepEqual(openProject(saveProject(v,settings)).volume.values,v.values);
});
test('invalid import leaves existing sculpture and its history untouched',()=>{
 const v=new SDFVolume(17),h=new SculptHistory(v);brushAction(v,h);const before=v.values.slice();
 assert.throws(()=>openProject(new ArrayBuffer(20)));assert.deepEqual(v.values,before);assert(h.canUndo);
 const loaded=openProject(saveProject(v,settings));const newHistory=new SculptHistory(loaded.volume);assert(!newHistory.canUndo);assert(!newHistory.canRedo);
 h.undo();assert.notDeepEqual(v.values,before);assert.deepEqual(loaded.volume.values,before);
});
test('pathological surface complexity is rejected before mesh extraction',()=>{
 const n=65,v=new SDFVolume(n);
 for(let z=1;z<n-1;z++)for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++)v.values[v.index(x,y,z)]=(x+y+z)%2?0.1:-0.1;
 assert.throws(()=>saveProject(v,settings),/triangle import limit/);
});
