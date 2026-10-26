import test from 'node:test';
import assert from 'node:assert/strict';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {IncrementalMesher,extractMesh} from '../work/test-build/mesh.mjs';
import {prepareDenseGrowth} from '../work/test-build/dense-growth.mjs';
import {ChunkSurface} from '../work/test-build/surface.mjs';
import {MeshBasicMaterial} from 'three';
const vertices=m=>m.snapshotUpdates().flatMap(u=>Array.from(u.geometry.attributes.position.array));
test('zero-time batches make progress, drain exactly, reject bad budgets and release retained references',()=>{
 const v=new SDFVolume(33),m=new IncrementalMesher(v),reference=new IncrementalMesher(v);reference.rebuildChunks();
 let count=0;while(m.pendingChunks){const batch=m.rebuildChunks(Infinity,0);assert.equal(batch.updates.length,1);count++;}assert.equal(count,m.allocatedChunks);assert.deepEqual(vertices(m),vertices(reference));
 for(const args of [[0],[-1],[1,-1],[NaN],[1,NaN]])assert.throws(()=>m.rebuildChunks(...args),/budget/);
 let disposed=0;for(const u of m.snapshotUpdates())u.geometry.addEventListener('dispose',()=>disposed++);const allocated=m.allocatedChunks;m.dispose();m.dispose();assert.equal(disposed,allocated);assert.equal(m.snapshotUpdates().length,0);assert.equal(m.ownedGeometryBytes,0);assert.equal(m.allocatedChunks,0);assert.throws(()=>m.rebuildChunks(),/disposed/);reference.dispose();
});
test('empty extraction scans samples once and direct writes cannot leave a stale occupancy summary',()=>{
 const v=new SDFVolume(33,1.6,false);v.values.fill(6.4);let reads=0;const index=v.index.bind(v);v.index=(...a)=>{reads++;return index(...a);};
 const g=extractMesh(v);assert.equal(g.attributes.position.count,0);assert.equal(reads,33**3);g.dispose();
 v.values[index(16,16,16)]=-.1;const occupied=extractMesh(v);assert(occupied.attributes.position.count>0);occupied.dispose();
});
test('meshing failure retains dirty chunk and old geometry for retry',()=>{
 const v=new SDFVolume(33),m=new IncrementalMesher(v);m.rebuildChunks();const before=m.snapshotUpdates(),bytes=m.ownedGeometryBytes;
 m.invalidate();const normal=v.normalAt;v.normalAt=()=>{throw Error('injected gradient failure');};assert.throws(()=>m.rebuildChunks(1),/injected/);
 assert.equal(m.ownedGeometryBytes,bytes);assert.deepEqual(m.snapshotUpdates(),before);v.normalAt=normal;while(m.pendingChunks)m.rebuildChunks(1,0);assert.deepEqual(vertices(m),before.flatMap(u=>Array.from(u.geometry.attributes.position.array)));m.dispose();
});
test('negative-axis growth, disconnected islands and erasure retain local exact chunk geometry',()=>{
 const source=new SDFVolume(33),v=prepareDenseGrowth(source,{min:[-3,-3,-3],max:[1,1,1]}).volume,m=new IncrementalMesher(v);m.rebuildChunks();
 for(const p of [{x:-2.6,y:0,z:0},{x:0,y:-2.6,z:0},{x:0,y:0,z:-2.6}]){m.invalidate(v.brush(p,.25,'add',.1,undefined,.5,true));m.rebuildChunks();}
 assert(m.snapshotUpdates().some(u=>m.chunkKey(u.id).startsWith('-')));
 const full=extractMesh(v),actual=vertices(m),sort=a=>{const r=[];for(let i=0;i<a.length;i+=3)r.push(a.slice(i,i+3).join(','));return r.sort();};assert.deepEqual(sort(actual),sort(Array.from(full.attributes.position.array)));full.dispose();
 const material=new MeshBasicMaterial(),surface=new ChunkSurface(material);surface.update(m.snapshotUpdates());assert(surface.group.children.length);surface.clear();assert.equal(surface.group.children.length,0);assert.equal(surface.spatial.chunks,0);surface.update(m.snapshotUpdates());assert(surface.group.children.length);surface.clear();material.dispose();m.dispose();
});
test('aborted fork disposal keeps borrowed geometry owned by source',()=>{
 const v=new SDFVolume(33),m=new IncrementalMesher(v);m.rebuildChunks();const before=m.snapshotUpdates(),next=new SDFVolume(33);next.values.set(v.values);
 let disposals=0;for(const u of before)u.geometry.addEventListener('dispose',()=>disposals++);
 const fork=m.forkEdit(next,{min:[15,15,15],max:[17,17,17]});fork.dispose();assert.equal(disposals,0);assert.deepEqual(m.snapshotUpdates(),before);assert(m.ownedGeometryBytes>0);m.dispose();assert.equal(disposals,before.length);
});
test('disposed Boolean cache releases dense and surface references',async()=>{
 const {IndependentLayers}=await import('../work/test-build/independent-layers.mjs');const {createBaseProject}=await import('../work/test-build/layers.mjs');
 const settings={mode:'add',radius:.22,strength:.35,hardness:.5,camera:{position:[2,2,3],target:[0,0,0]}};
 const c=new IndependentLayers(createBaseProject(new SDFVolume(33),settings));await c.composite.flush();const surface=c.composite.surface;assert(surface.group.children.length);c.dispose();assert.equal(surface.group.children.length,0);assert.equal(c.composite.volume,null);assert.equal(c.composite.mesher,null);assert.equal(c.composite.surface,null);
});
