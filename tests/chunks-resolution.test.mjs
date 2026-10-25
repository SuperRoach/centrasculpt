import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshStandardMaterial } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { SDFVolume } from '../work/test-build/sdf.mjs';
import { IncrementalMesher, extractMesh } from '../work/test-build/mesh.mjs';
import { ChunkSurface, buildExportMesh } from '../work/test-build/surface.mjs';
import { resampleVolume } from '../work/test-build/resolution.mjs';
import { SculptHistory } from '../work/test-build/history.mjs';
import { openProject, saveProject } from '../work/test-build/project.mjs';
const settings={mode:'add',radius:0.22,strength:0.35,hardness:0.7,camera:{position:[2.4,1.7,3.3],target:[0,0,0]}};
function setup(n=33,size=8) {const volume=new SDFVolume(n),mesher=new IncrementalMesher(volume,size),surface=new ChunkSurface(new MeshStandardMaterial()),result=mesher.rebuildChunks();surface.update(result.updates);return {volume,mesher,surface,result};}
function sortedVertices(geometry) {
 const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),out=[];
 for(let i=0;i<p.count;i++)out.push([p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i)].map(v=>v.toFixed(5)).join(','));return out.sort();
}
function checkClosed(surface) {
 const edges=new Map(),normals=new Map();let crossChunkShared=0;
 for(const mesh of surface.group.children) {
  const p=mesh.geometry.getAttribute('position'),n=mesh.geometry.getAttribute('normal');
  for(let i=0;i<p.count;i+=3) {
   const keys=[];
   for(let j=0;j<3;j++) {
    const index=i+j,key=[p.getX(index),p.getY(index),p.getZ(index)].map(v=>v.toFixed(6)).join(',');keys.push(key);
    const value=[n.getX(index),n.getY(index),n.getZ(index)],old=normals.get(key);
    if(old) {assert(value.every((v,k)=>Math.abs(v-old.value[k])<1e-5));if(old.mesh!==mesh)crossChunkShared++;}
    else normals.set(key,{value,mesh});
   }
   if(new Set(keys).size<3)continue;
   for(let j=0;j<3;j++) {const edge=[keys[j],keys[(j+1)%3]].sort().join('|');edges.set(edge,(edges.get(edge)||0)+1);}
  }
 }
 assert(crossChunkShared>0,'must test actual shared chunk vertices');
 for(const count of edges.values())assert.equal(count,2,'every welded surface edge must have exactly two incident triangles');
}
test('chunk boundaries are watertight with continuous normals before and after a seam edit',()=>{
 const {volume,mesher,surface}=setup(34,8);checkClosed(surface);
 mesher.invalidate(volume.brush({x:volume.coordinate(16),y:0,z:0.82},0.28,'subtract',0.02,undefined,0.8));
 surface.update(mesher.rebuildChunks().updates);checkClosed(surface);mesher.dispose();
});
test('local edits preserve untouched geometry and dirty both sides of shared sample boundaries',()=>{
 const {volume,mesher,surface}=setup(34,8),previous=new Map(surface.group.children.map(mesh=>[mesh.name,mesh.geometry]));
 const index=16,coordinate=volume.coordinate(index);
 mesher.invalidate(volume.brush({x:coordinate,y:0,z:0.82},0.14,'add',0.01));
 const result=mesher.rebuildChunks();assert(result.stats.chunks<result.stats.totalChunks);
 assert(result.updates.some(c=>c.bounds.max[0]===index));assert(result.updates.some(c=>c.bounds.min[0]===index));
 surface.update(result.updates);
 assert(surface.group.children.some(mesh=>previous.get(mesh.name)===mesh.geometry),'untouched GPU buffers must retain their identity');
 const merged=buildExportMesh(surface.group,surface.group.children[0].material),full=extractMesh(volume);
 assert.deepEqual(sortedVertices(merged.geometry),sortedVertices(full));merged.geometry.dispose();full.dispose();assert.equal(mesher.rebuildChunks(),null);mesher.dispose();
});
test('dirty sets do not fill the space between unrelated edit regions',()=>{
 const {volume,mesher}=setup(64,8);
 mesher.invalidate(volume.brush({x:-0.8,y:0,z:0},0.12,'add',0.01));
 mesher.invalidate(volume.brush({x:0.8,y:0,z:0},0.12,'subtract',0.01));
 const result=mesher.rebuildChunks();assert(result.updates.every(c=>!(c.bounds.min[0]>=24&&c.bounds.max[0]<=40)));mesher.dispose();
});
test('chunk rendering remains exact after history undo/redo and native save/load',()=>{
 const {volume,mesher,surface}=setup(),history=new SculptHistory(volume),before=volume.values.slice();
 history.begin();mesher.invalidate(volume.brush({x:0,y:0,z:0.8},0.3,'subtract',0.02,history.record,0.7));history.commit();surface.update(mesher.rebuildChunks().updates);
 const after=volume.values.slice();
 mesher.invalidate(history.undo());surface.update(mesher.rebuildChunks().updates);assert.deepEqual(volume.values,before);
 mesher.invalidate(history.redo());surface.update(mesher.rebuildChunks().updates);assert.deepEqual(volume.values,after);checkClosed(surface);
 const opened=openProject(saveProject(volume,settings));assert.deepEqual(opened.volume.values,after);assert.equal(opened.settings.hardness,0.7);
 const loaded=new IncrementalMesher(opened.volume,8),next=new ChunkSurface(surface.group.children[0].material);next.update(loaded.rebuildChunks().updates);
 const a=buildExportMesh(surface.group,surface.group.children[0].material),b=buildExportMesh(next.group,surface.group.children[0].material);
 assert.deepEqual(sortedVertices(a.geometry),sortedVertices(b.geometry));a.geometry.dispose();b.geometry.dispose();mesher.dispose();loaded.dispose();
});
test('hardness sharpens the brush shoulder while preserving center strength and Smooth behavior',()=>{
 const soft=new SDFVolume(33),hard=new SDFVolume(33),base=soft.values.slice(),center={x:0,y:0,z:0.8};
 soft.brush(center,0.4,'add',0.01,undefined,0);hard.brush(center,0.4,'add',0.01,undefined,1);
 const middle=soft.index(16,16,24),shoulder=soft.index(18,16,24);
 assert.equal(soft.values[middle],hard.values[middle]);assert(hard.values[shoulder]<soft.values[shoulder]);
 assert(soft.values.every((v,i)=>v<=base[i]));
 soft.reset();hard.reset();soft.brush(center,0.4,'smooth',0.5,undefined,0);hard.brush(center,0.4,'smooth',0.5,undefined,1);assert.deepEqual(soft.values,hard.values);
});
test('resampling preserves world bounds, affine fields and positive boundaries; a new grid starts fresh history',()=>{
 const source=new SDFVolume(17);for(let z=0;z<17;z++)for(let y=0;y<17;y++)for(let x=0;x<17;x++)source.values[source.index(x,y,z)]=3+source.coordinate(x)*0.1+source.coordinate(y)*0.2+source.coordinate(z)*0.3;
 const original=source.values.slice();
 for(const size of [9,32,64]) {
  const next=resampleVolume(source,size);assert.equal(next.extent,source.extent);
  for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++)assert(Math.abs(next.values[next.index(x,y,z)]-(3+next.coordinate(x)*0.1+next.coordinate(y)*0.2+next.coordinate(z)*0.3))<1e-6);
  const history=new SculptHistory(next);assert.equal(history.undoCount,0);assert(next.values.every(v=>v>0));
 }
 assert.deepEqual(source.values,original);for(const size of [0,193,NaN,2.5])assert.throws(()=>resampleVolume(source,size));
});
test('v1 projects migrate to zero hardness and v2 validates hardness',()=>{
 const data=saveProject(new SDFVolume(17),settings),view=new DataView(data),length=view.getUint32(12,true);
 const metadata=JSON.parse(new TextDecoder().decode(new Uint8Array(data,16,length)));delete metadata.settings.hardness;
 const json=new TextEncoder().encode(JSON.stringify(metadata)),v1=new ArrayBuffer(16+json.length+17**3*4),bytes=new Uint8Array(v1);bytes.set(new Uint8Array(data,0,16));new DataView(v1).setUint32(8,1,true);new DataView(v1).setUint32(12,json.length,true);bytes.set(json,16);bytes.set(new Uint8Array(data,16+length),16+json.length);
 assert.equal(openProject(v1).settings.hardness,0);new DataView(v1).setUint32(8,2,true);assert.throws(()=>openProject(v1),/hardness/);
});
test('GLB export flattens every visible chunk and preserves normal/accessor counts',async()=>{
 const {surface,mesher,result}=setup(25,6),material=new MeshStandardMaterial();
 const all=buildExportMesh(surface.group,material);assert.equal(all.geometry.getAttribute('position').count,result.triangles*3);
 const hidden=surface.group.children[0];hidden.visible=false;
 surface.group.position.x=2;
 const merged=buildExportMesh(surface.group,material);assert.equal(merged.geometry.getAttribute('position').count,all.geometry.getAttribute('position').count-hidden.geometry.getAttribute('position').count);
 assert(merged.geometry.getAttribute('position').getX(0)>1);
 // Node has Blob; the exporter also expects the browser FileReader API.
 const originalReader=globalThis.FileReader;
 globalThis.FileReader=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(buffer=>{this.result=buffer;this.onloadend?.();});}};
 try {
  const glb=await new GLTFExporter().parseAsync(merged,{binary:true}),view=new DataView(glb);
  assert.equal(view.getUint32(0,true),0x46546c67);assert.equal(view.getUint32(8,true),glb.byteLength);
  const json=JSON.parse(new TextDecoder().decode(new Uint8Array(glb,20,view.getUint32(12,true))));
  assert.equal(json.meshes.length,1);const attributes=json.meshes[0].primitives[0].attributes;
  assert.equal(json.accessors[attributes.POSITION].count,merged.geometry.getAttribute('position').count);assert.equal(json.accessors[attributes.NORMAL].count,json.accessors[attributes.POSITION].count);
 } finally {globalThis.FileReader=originalReader;all.geometry.dispose();merged.geometry.dispose();mesher.dispose();}
});
test('128³ and 192³ dense projects round-trip with hardness and resampled boundary data',()=>{
 const source=new SDFVolume(17);source.brush({x:0,y:0,z:0.8},0.35,'subtract',0.025,undefined,0.8);
 for(const size of [128,192]) {
  const volume=resampleVolume(source,size),loaded=openProject(saveProject(volume,settings));
  assert.equal(loaded.volume.resolution,size);assert.deepEqual(loaded.volume.values,volume.values);assert.equal(loaded.settings.hardness,settings.hardness);
  for(let z=0;z<size;z++)for(let y=0;y<size;y++){assert(loaded.volume.values[loaded.volume.index(0,y,z)]>0);assert(loaded.volume.values[loaded.volume.index(size-1,y,z)]>0);}
 }
});
