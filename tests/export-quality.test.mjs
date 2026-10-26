import {RadialMoveField} from '../work/test-build/move-field.mjs';
import test from 'node:test';import assert from 'node:assert/strict';
import {Box3,Vector3,Group} from 'three';
import {optimiseExportMesh,ExportWork,exportAdmission} from '../work/test-build/export-mesh.mjs';
import {encodeExport} from '../work/test-build/glb-export.mjs';
import {exportGlbAsync} from '../work/test-build/export-client.mjs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {IncrementalMesher} from '../work/test-build/mesh.mjs';
import {ClayStrokeSession} from '../work/test-build/clay-stroke-session.mjs';
import {ClayPathControls} from '../work/test-build/clay-path.mjs';
import {identityTransform,transformMatrix} from '../work/test-build/transform.mjs';
import {saveSculptProject,openSculptProject} from '../work/test-build/project.mjs';
import {qualityVolume} from '../scripts/fixtures/mesh-quality.mjs';
import {installFileReader,readGlb} from '../scripts/fixtures/export-node.mjs';
import {ExportBrowserWorker} from '../scripts/fixtures/node-export-worker.mjs';
installFileReader();
const settings={mode:'add',radius:.14,strength:.35,hardness:.6,camera:{position:[2,2,3],target:[0,0,0]}};
const source=(p,n)=>({name:'fixture',transform:identityTransform(),step:.05,chunks:[{positions:new Float32Array(p),normals:new Float32Array(n)}]});
function fromVolume(v){const m=new IncrementalMesher(v);m.rebuildChunks();return {m,s:{name:'SDF',transform:identityTransform(),step:v.step,chunks:m.snapshotUpdates().map(u=>({positions:u.geometry.getAttribute('position').array,normals:u.geometry.getAttribute('normal').array}))}};}
const meshes=scene=>{const list=[];scene.traverse(o=>{if(o.isMesh)list.push(o);});return list;};
function componentCount(g){const ids=g.index,parent=Int32Array.from({length:g.getAttribute('position').count},(_,i)=>i),root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};for(let i=0;i<ids.count;i+=3){const a=ids.getX(i),b=ids.getX(i+1),c=ids.getX(i+2);parent[root(b)]=root(a);parent[root(c)]=root(a);}return new Set(Array.from(parent,(_,i)=>root(i))).size;}
const triangle=[0,0,0,1,0,0,0,1,0],up=[0,0,1,0,0,1,0,0,1];
const area=r=>{let sum=0;const t=r.indices??Uint32Array.from({length:r.positions.length/3},(_,i)=>i),p=r.positions;for(let i=0;i<t.length;i+=3){const a=new Vector3().fromArray(p,t[i]*3),b=new Vector3().fromArray(p,t[i+1]*3),c=new Vector3().fromArray(p,t[i+2]*3);sum+=b.sub(a).cross(c.sub(a)).length()/2;}return sum;};
test('Standard welds exact chunk positions, removes duplicate/degenerate faces and repairs reversed winding',async()=>{
 const s=source([...triangle,...triangle,0,0,0,0,0,0,1,0,0, 0,0,0,0,-1,0,1,0,0],[...up,...up,...up,...up]);
 // Reverse last triangle: SDF normals point +Z.
 s.chunks[0].positions.set([0,0,0,1,0,0,0,-1,0],27);
 const before=s.chunks[0].positions.slice(),r=await optimiseExportMesh(s,'standard');assert.equal(r.stats.removedDuplicate,1);assert.equal(r.stats.removedDegenerate,1);assert.equal(r.stats.flipped,1);assert.equal(r.stats.vertices,4);assert.equal(r.stats.triangles,2);assert.equal(r.stats.inconsistentEdges,0);assert.deepEqual(s.chunks[0].positions,before);for(let i=2;i<r.normals.length;i+=3)assert.equal(r.normals[i],1);
});
test('welding crosses chunks but never quantises close disconnected thin surfaces',async()=>{
 const s=source(triangle,up);s.chunks.push({positions:new Float32Array(triangle.map((v,i)=>i%3===2?v+1e-7:v)),normals:new Float32Array(up)});const r=await optimiseExportMesh(s,'standard');assert.equal(r.stats.vertices,6);assert.equal(r.stats.triangles,2);assert.equal(r.stats.boundaryEdges,6);
});
for(const kind of ['sphere','box','triangular-prism','pyramid'])test(`${kind}: all presets preserve dimensions, winding and closed topology; High planar error bounded`,async()=>{
 const {volume,field}=qualityVolume(64,kind),{m,s}=fromVolume(volume),bytes=volume.values.slice();try{let baseArea,baseBounds;for(const q of ['fast','standard','high']){const r=await optimiseExportMesh(s,q),box=new Box3().setFromArray(r.positions);for(let a=0;a<3;a++){assert(Number.isFinite(box.min.getComponent(a)));assert(box.max.getComponent(a)-box.min.getComponent(a)>1);}
 const ar=area(r);if(q==='fast'){baseArea=ar;baseBounds=box.clone();}else{assert.deepEqual(box.min.toArray(),baseBounds.min.toArray());assert.deepEqual(box.max.toArray(),baseBounds.max.toArray());assert(Math.abs(ar-baseArea)/baseArea<1e-6);assert.equal(r.stats.boundaryEdges,0);assert.equal(r.stats.nonManifoldEdges,0);assert.equal(r.stats.inconsistentEdges,0);assert(r.stats.maxPlanarDeviation<=volume.step*1e-6);}
 for(let i=0;i<r.positions.length;i+=3)assert(Math.abs(field({x:r.positions[i],y:r.positions[i+1],z:r.positions[i+2]}))<volume.step*.5);
 if(kind==='box'&&q==='high')assert(r.stats.planarRemoved>100);
 }assert.deepEqual(volume.values,bytes);}finally{m.dispose();}
});
test('GLBs reload through independent GLTFLoader with indexed meshes, native layer transforms and meter scale',async()=>{
 const {volume}=qualityVolume(33,'sphere'),c=new IndependentLayers(createBaseProject(volume,settings));try{c.setActiveTransform({position:[2,-.3,1],rotation:[.4,.2,-.3],scale:[1.7,1.7,1.7]});const before=saveSculptProject(c.project),sources=c.exportSources();
 for(const q of ['fast','standard','high']){const r=await encodeExport(sources,q,256*1024**2),loaded=await readGlb(r.data),mesh=meshes(loaded.scene)[0];assert.equal(mesh.name,c.active.layer.name);loaded.scene.updateMatrixWorld(true);assert(mesh.matrix.elements.every((v,i)=>Math.abs(v-transformMatrix(c.active.layer.transform).elements[i])<1e-6));const box=new Box3().setFromObject(loaded.scene,true);assert(box.min.x>0);assert.equal(!!mesh.geometry.index,q!=='fast');assert(new DataView(r.data).getUint32(0,true)===0x46546c67);mesh.geometry.dispose();}
 assert.deepEqual(saveSculptProject(c.project),before);assert.deepEqual(openSculptProject(before).activeLayer.volume.values,volume.values);
 }finally{c.dispose();}
});
test('mirrored free Clay / constrained Straight Line preserve disconnected components, extents and exact history',async()=>{
 const v=new SDFVolume(65,1.6,false);v.values.fill(6.4);const c=new IndependentLayers(createBaseProject(v,settings));try{c.symmetry.enabled=true;const controls=new ClayPathControls();controls.straightLine=true;controls.axis='y';const s=new ClayStrokeSession(()=>c);s.begin(settings,controls,0,true);s.sample({x:2,y:0,z:0},16);s.sample({x:2.1,y:.3,z:.2},64);s.end();while(s.active)s.pump();assert(c.active.volume.latticeMin[0]<0);const before=saveSculptProject(c.project),sources=c.exportSources();const result=await encodeExport(sources,'high',256*1024**2),loaded=await readGlb(result.data),box=new Box3().setFromObject(loaded.scene);assert(box.min.x<-2);assert(box.max.x>2);assert.equal(result.stats[0].boundaryEdges,0);assert.equal(componentCount(meshes(loaded.scene)[0].geometry),2);assert.equal(c.undoCount,1);assert.deepEqual(saveSculptProject(c.project),before);meshes(loaded.scene).forEach(o=>o.geometry.dispose());}finally{c.dispose();}
});
test('selected hidden layer exports explicitly; visible sources stay separate and workspace transforms are excluded',async()=>{
 const c=new IndependentLayers(createBaseProject(new SDFVolume(17),settings)),workspace=new Group();workspace.scale.setScalar(.3);workspace.position.set(4,2,3);workspace.add(c.group);try{c.create(64);const id=c.active.layer.id;c.setFlag(id,'visible',false);assert.equal(c.exportSources().length,1);assert.equal(c.exportSources('selected')[0].layerId,id);c.setFlag(id,'visible',true);const r=await encodeExport(c.exportSources(),'standard',256*1024**2),g=await readGlb(r.data);assert.equal(meshes(g.scene).length,2);assert(new Box3().setFromObject(g.scene).max.x<1);meshes(g.scene).forEach(o=>o.geometry.dispose());}finally{c.dispose();}
});
test('Boolean output preserves its own explicit cap and native center independently of display navigation',async()=>{
 const c=new IndependentLayers(createBaseProject(new SDFVolume(33),settings));try{c.create(64);c.setActiveTransform({...identityTransform(),position:[.6,0,0]});c.setOperation(c.active.layer.id,'difference');c.composite.setQuality(64);await c.composite.flush();const sources=c.composite.exportSources(),before=c.project.layerStack.layers.map(l=>l.volume.values.slice());for(const q of ['fast','standard','high']){const r=await encodeExport(sources,q,256*1024**2),g=await readGlb(r.data);assert.equal(meshes(g.scene).length,1);assert.equal(r.stats[0].nonManifoldEdges,0);assert.equal(c.composite.stats.resolution,64);meshes(g.scene).forEach(o=>o.geometry.dispose());}c.project.layerStack.layers.forEach((l,i)=>assert.deepEqual(l.volume.values,before[i]));}finally{c.dispose();}
});
test('source guard rejects active/pending Move and source mutation; memory/triangle limits reject before snapshot',async()=>{
 const c=new IndependentLayers(createBaseProject(new SDFVolume(17),settings));try{c.beginStroke();assert.throws(()=>c.exportSources(),/Finish/);c.cancelStroke();const owner={};c.beginPreview(owner);assert.throws(()=>c.exportSources(),/Finish/);c.endPreview(owner);const sources=c.exportSources();assert.throws(()=>exportAdmission(sources,'high',1),/safety limits/);assert.throws(()=>exportAdmission(sources,'fake'),/Invalid/);c.setActiveTransform({...identityTransform(),position:[.1,0,0]});await assert.rejects(exportGlbAsync(sources,'standard'),/source changed/);}finally{c.dispose();}
});
test('cancel during cooperative cleaning keeps buffers unchanged and invalid normals fail clearly',async()=>{
 const {volume}=qualityVolume(64,'sphere'),{m,s}=fromVolume(volume),abort=new AbortController(),before=s.chunks.map(c=>c.positions.slice());try{await assert.rejects(optimiseExportMesh(s,'high',new ExportWork(abort.signal,()=>true,()=>abort.abort())),/cancelled/);s.chunks.forEach((c,i)=>assert.deepEqual(c.positions,before[i]));const invalid=source(triangle,[0,0,0,0,0,0,0,0,0]);await assert.rejects(optimiseExportMesh(invalid,'standard'),/undefined surface normal/);}finally{m.dispose();}
});
test('real worker: independent GLB roundtrip, cancellation, unchanged transferred source buffers and retry',async()=>{
 const old=globalThis.Worker;globalThis.Worker=ExportBrowserWorker;const {volume}=qualityVolume(64,'box'),{m,s}=fromVolume(volume);try{const before=s.chunks.map(c=>c.positions.slice()),abort=new AbortController();const pending=exportGlbAsync([s],'high',{signal:abort.signal,progress:p=>{if(p.stage!=='Snapshotting committed surface')abort.abort();}});await assert.rejects(pending,/cancelled/);assert(ExportBrowserWorker.terminated>0);s.chunks.forEach((c,i)=>assert.deepEqual(c.positions,before[i]));const r=await exportGlbAsync([s],'high');assert.equal(r.backend,'worker');assert(r.stats[0].planarRemoved>100);const loaded=await readGlb(r.data);assert.equal(meshes(loaded.scene).length,1);meshes(loaded.scene).forEach(o=>o.geometry.dispose());}finally{globalThis.Worker=old;m.dispose();}
});

for(const interaction of ['non-elastic','elastic','twist'])test(`${interaction}: only completed authoritative Move is exported, then reloads in all presets`,async()=>{
 const c=new IndependentLayers(createBaseProject(new SDFVolume(33),settings)),owner={},field=new RadialMoveField();
 try{field.configure(interaction==='elastic'?'elastic':'non-elastic');field.capture(new Vector3(0,0,.85),.25,2,1);if(interaction==='twist'){field.interaction='twist';field.setRotation(new Vector3(0,1,0),.4);}else field.setDisplacement(new Vector3(.08,0,.08));
 c.beginPreview(owner);const commit=c.commitMove(owner,field,new AbortController().signal,()=>{});assert.throws(()=>c.exportSources(),/Finish/);assert(await commit);c.endPreview(owner);const before=saveSculptProject(c.project);
 for(const q of ['fast','standard','high']){const r=await encodeExport(c.exportSources(),q,256*1024**2),loaded=await readGlb(r.data);assert.equal(meshes(loaded.scene).length,1);assert.equal(r.stats[0].inputTriangles,c.active.triangles);assert.equal(r.stats[0].inconsistentEdges,0);meshes(loaded.scene).forEach(o=>o.geometry.dispose());}assert.deepEqual(saveSculptProject(c.project),before);assert.equal(c.undoCount,1);
 }finally{c.endPreview(owner);c.dispose();}
});

test('closed non-manifold edge input rejects cleaned export instead of silently producing invalid topology',async()=>{
 const s=source([...triangle,0,0,0,1,0,0,0,-1,0,0,0,0,1,0,0,0,0,1],[...up,...up,...up]);await assert.rejects(optimiseExportMesh(s,'standard'),/non-manifold/);
});
test('large actual worker export preserves count and source buffers; cancellation during packing prevents delivery',async()=>{
 const old=globalThis.Worker;globalThis.Worker=ExportBrowserWorker;const {volume}=qualityVolume(128,'sphere'),{m,s}=fromVolume(volume);try{const abort=new AbortController();await assert.rejects(exportGlbAsync([s],'standard',{signal:abort.signal,progress:p=>{if(p.stage==='Packing GLB')abort.abort();}}),/cancelled/);const r=await exportGlbAsync([s],'standard');assert.equal(r.stats[0].triangles,m.triangles);assert(r.stats[0].vertices<r.stats[0].triangles);assert.equal(r.stats[0].boundaryEdges,0);assert.equal(s.chunks.reduce((n,c)=>n+c.positions.length/9,0),m.triangles);}finally{globalThis.Worker=old;m.dispose();}
});
