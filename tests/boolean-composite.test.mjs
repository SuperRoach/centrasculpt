import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,MeshStandardMaterial} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {SdfLayer,createBaseProject} from '../work/test-build/layers.mjs';
import {identityTransform,transformMatrix,copyTransform} from '../work/test-build/transform.mjs';
import {combineSdf,prepareLayerSampler,prepareComposite,evaluateComposite,compositeLayout,BooleanComposite} from '../work/test-build/compositor.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {openSculptProject,saveSculptProject,saveProject} from '../work/test-build/project.mjs';
const settings={mode:'add',radius:.22,strength:.35,hardness:.5,camera:{position:[2.4,1.7,3.3],target:[0,0,0]}};
const create=(n=25)=>new IndependentLayers(createBaseProject(new SDFVolume(n),settings));
const p=(x,y=0,z=0)=>({x,y,z});
const pose=(x=0,scale=1)=>({...identityTransform(),position:[x,0,0],scale:[scale,scale,scale]});
function meshVertices(group){const vertices=[];group.traverse(o=>{if(o.isMesh){const a=o.geometry.getAttribute('position');for(let i=0;i<a.count;i++)vertices.push([a.getX(i),a.getY(i),a.getZ(i)].map(v=>v.toFixed(6)).join(','));}});return vertices.sort();}
function disposeExport(group){group.traverse(o=>{if(o.isMesh)o.geometry.dispose();});}
function closed(group){
 const edges=new Map(),normals=new Map();let shared=0,triangles=0;
 group.traverse(mesh=>{if(!mesh.isMesh)return;const p=mesh.geometry.getAttribute('position'),n=mesh.geometry.getAttribute('normal');
  for(let i=0;i<p.count;i+=3){const keys=[];for(let j=0;j<3;j++){const k=i+j,key=[p.getX(k),p.getY(k),p.getZ(k)].map(v=>v.toFixed(6)).join(',');keys.push(key);const value=[n.getX(k),n.getY(k),n.getZ(k)],old=normals.get(key);if(old){assert(value.every((v,a)=>Math.abs(v-old.value[a])<1e-5));if(old.mesh!==mesh)shared++;}else normals.set(key,{value,mesh});}
   if(new Set(keys).size<3)continue;triangles++;for(let j=0;j<3;j++){const edge=[keys[j],keys[(j+1)%3]].sort().join('|');edges.set(edge,(edges.get(edge)||0)+1);}
  }});
 assert(triangles>0);assert(shared>0,'exercise actual shared chunk boundaries');for(const count of edges.values())assert.equal(count,2,'closed welded edge incidence');
}
test('Boolean mathematics use min, max(a,-b), max(a,b) with correct signs',()=>{
 for(const a of [-2,-.1,0,.5,3])for(const b of [-3,-.2,0,.4,2]){assert.equal(combineSdf(a,b,'union'),Math.min(a,b));assert.equal(combineSdf(a,b,'difference'),Math.max(a,-b));assert.equal(combineSdf(a,b,'intersect'),Math.max(a,b));}
});
test('first visible layer initializes even when its operation is Subtract or Intersect',()=>{
 const a=new SdfLayer(new SDFVolume(25)),b=new SdfLayer(new SDFVolume(25));a.visible=false;
 for(const op of ['difference','intersect']){b.operation=op;assert(evaluateComposite([a,b],p(0))<0);}
 b.visible=false;assert(evaluateComposite([a,b],p(0))>0);
});
test('explicit stack array order changes subtraction and intersection results',()=>{
 const a=new SdfLayer(new SDFVolume(25)),b=new SdfLayer(new SDFVolume(25),{transform:pose(.7),operation:'difference'});
 assert(evaluateComposite([a,b],p(-.5))<0);assert(evaluateComposite([a,b],p(.5))>0);
 assert(evaluateComposite([b,a],p(.5))<0);b.operation='intersect';assert(evaluateComposite([a,b],p(.5))<0);assert(evaluateComposite([a,b],p(-.5))>0);
});
test('different 64/128/192 resolutions sample independently at world points without source writes',()=>{
 const layers=[64,128,192].map((n,i)=>new SdfLayer(new SDFVolume(n),{transform:pose(i*.25)}));
 const copies=layers.map(l=>l.volume.values.slice());const sample=prepareComposite(layers);
 assert(sample(.1,0,0)<0);assert(sample(3,0,0)>0);
 for(let i=0;i<layers.length;i++)assert.deepEqual(layers[i].volume.values,copies[i]);
 const layout=compositeLayout(layers);assert.equal(layout.resolution,192);assert(layout.capped);assert.equal(layout.desiredStep,layers[2].volume.step);
});
test('translated rotated uniformly scaled sampling round trips and distances scale correctly',()=>{
 const transform={position:[1,-.5,.7],rotation:[.3,-.7,.6],scale:[1.7,1.7,1.7]},layer=new SdfLayer(new SDFVolume(33),{transform}),sample=prepareLayerSampler(layer);
 for(const local of [p(.2,.1,.3),p(.7,.2,-.1),p(1.5,.2,.1)]){const world=new Vector3(local.x,local.y,local.z).applyMatrix4(transformMatrix(transform));assert(Math.abs(sample(world.x,world.y,world.z)-layer.volume.sampleLocal(local)*1.7)<1e-10);}
 const small=new SdfLayer(new SDFVolume(17),{transform:pose(0,.01)});assert(Math.abs(compositeLayout([small]).extent-compositeLayout([new SdfLayer(new SDFVolume(17))]).extent*.01)<1e-12);
});
test('exterior sampling remains positive, grows outside bounds and is continuous at positive boundary',()=>{
 const layer=new SdfLayer(new SDFVolume(33)),sample=prepareLayerSampler(layer),e=layer.volume.extent;
 assert(sample(e+.5,0,0)>sample(e+.1,0,0));assert(sample(e+.1,e+.1,0)>0);
 assert(Math.abs(sample(e+1e-8,0,0)-sample(e-1e-8,0,0))<1e-6);
 // An empty positive field must not gain material outside its grid.
 layer.volume.values.fill(.1);assert(prepareLayerSampler(layer)(e+2,0,0)>2);
});
test('non-overlapping union retains both objects; difference retains the first; intersection is empty',async()=>{
 const c=create(),a=c.active.layer,b=c.create(64);c.setActiveTransform(pose(3));
 const composite=new BooleanComposite(c.project,c.neutral,48);
 b.operation='union';assert(evaluateComposite([a,b],p(0))<0);assert(evaluateComposite([a,b],p(3))<0);
 b.operation='difference';assert(evaluateComposite([a,b],p(0))<0);assert(evaluateComposite([a,b],p(3))>0);
 b.operation='intersect';await composite.flush();assert.equal(composite.stats.triangles,0);assert.throws(()=>composite.exportGroup(),/empty/);composite.dispose();c.dispose();
});
test('empty positive layers participate correctly; hidden excluded and locked still contribute',()=>{
 const a=new SdfLayer(new SDFVolume(25)),b=new SdfLayer(new SDFVolume(25),{operation:'difference',locked:true});
 assert(evaluateComposite([a,b],p(0))>0);b.visible=false;assert(evaluateComposite([a,b],p(0))<0);
 b.visible=true;b.volume.values.fill(1);assert(evaluateComposite([a,b],p(0))<0);b.operation='intersect';assert(evaluateComposite([a,b],p(0))>0);
 const c=create();c.active.layer.locked=true;assert.throws(()=>c.beginStroke());assert.throws(()=>c.setOperation(c.active.layer.id,'difference'));c.dispose();
});
test('operation changes and reorder undo/redo retain independent voxels and update evaluation',()=>{
 const c=create(),a=c.active.layer,b=c.create(64),aBefore=a.volume.values.slice(),bBefore=b.volume.values.slice();c.setActiveTransform(pose(.7));
 c.setOperation(b.id,'difference');assert(evaluateComposite(c.project.layerStack.layers,p(.5))>0);c.undo();assert.equal(b.operation,'union');c.undo(true);assert.equal(b.operation,'difference');
 c.move(b.id,-1);assert.equal(c.project.layerStack.layers[0].id,b.id);assert(evaluateComposite(c.project.layerStack.layers,p(.5))<0);c.undo();assert.equal(c.project.layerStack.layers[0].id,a.id);assert(evaluateComposite(c.project.layerStack.layers,p(.5))>0);c.undo(true);
 assert.deepEqual(a.volume.values,aBefore);assert.deepEqual(b.volume.values,bBefore);c.dispose();
});
test('metadata no-ops preserve redo, new operations clear it, deletion and resampling retain valid entries',()=>{
 const c=create(),a=c.active.layer,b=c.create(64);c.setOperation(b.id,'difference');c.undo();c.setOperation(b.id,'union');assert.equal(c.redoCount,1);c.setOperation(b.id,'intersect');assert.equal(c.redoCount,0);
 c.resampleActive(128);assert.equal(c.undoCount,1);c.undo();assert.equal(b.operation,'union');assert.equal(b.volume.resolution,128);c.undo(true);c.move(b.id,-1);c.remove(a.id);c.undo();assert.equal(c.project.layerStack.layers.length,1);assert.equal(c.active.layer.id,b.id);c.dispose();
});
test('native v3 round trip preserves Boolean metadata order transforms and exact separate source payloads',()=>{
 const c=create(),a=c.active.layer,b=c.create(64);c.setActiveTransform(pose(.5,1.2));c.setOperation(b.id,'difference');c.move(b.id,-1);c.display.setColour(c.project.id,a.id,'#ff0000');
 const file=saveSculptProject(c.project),loaded=openSculptProject(file);assert.deepEqual(loaded.layerStack.layers.map(l=>l.id),[b.id,a.id]);
 for(const layer of c.project.layerStack.layers){const next=loaded.layerStack.get(layer.id);assert.deepEqual(next.metadata(),layer.metadata());assert.deepEqual(next.volume.values,layer.volume.values);}
 const view=new DataView(file),meta=JSON.parse(new TextDecoder().decode(new Uint8Array(file,16,view.getUint32(12,true))));assert(!/colour|color|viewport/i.test(JSON.stringify(meta)));
 meta.layers[0].operation='bad';const json=new TextEncoder().encode(JSON.stringify(meta)),invalid=new Uint8Array(16+json.length+file.byteLength-16-view.getUint32(12,true));invalid.set(new Uint8Array(file,0,16));new DataView(invalid.buffer).setUint32(12,json.length,true);invalid.set(json,16);invalid.set(new Uint8Array(file,16+view.getUint32(12,true)),16+json.length);assert.throws(()=>openSculptProject(invalid.buffer),/operation/);c.dispose();
});
test('legacy single-volume files migrate to an initial union source without changing voxels',()=>{
 const source=new SDFVolume(17),loaded=openSculptProject(saveProject(source,settings));assert.equal(loaded.layerStack.layers.length,1);assert.equal(loaded.activeLayer.operation,'union');assert.deepEqual(loaded.activeLayer.volume.values,source.values);assert(evaluateComposite(loaded.layerStack.layers,p(0))<0);
});
test('composite chunk seams are watertight and normals continuous for union subtract and intersect',async()=>{
 const c=create(34),b=c.create(64);c.setActiveTransform(pose(.56));const preview=new BooleanComposite(c.project,c.neutral,64);
 for(const operation of ['union','difference','intersect']){c.setOperation(b.id,operation);await preview.flush();closed(preview.group);}
 preview.dispose();c.dispose();
});
test('local brush rebuild caches untouched chunks and equals a fresh full composite',async()=>{
 const c=create(64),b=c.create(64);c.setActiveTransform(pose(.5));c.setOperation(b.id,'difference');const preview=c.composite;preview.setQuality(64);await preview.flush();
 const source=c.project.layerStack.layers[0],before=new Map();preview.group.traverse(o=>{if(o.isMesh)before.set(o.uuid,o.geometry);});const other=b.volume.values.slice();c.select(source.id);c.beginStroke();c.applyStroke(p(-.5,.1,.5),.22,'add',.4,1/30,.5);c.finishStroke();await preview.flush();
 assert.equal(preview.stats.full,false);assert(preview.stats.chunks<preview.stats.totalChunks);let retained=0;preview.group.traverse(o=>{if(o.isMesh&&before.get(o.uuid)===o.geometry)retained++;});assert(retained>0);closed(preview.group);
 const incremental=meshVertices(preview.group);preview.invalidate();await preview.flush();assert.deepEqual(meshVertices(preview.group),incremental);assert.deepEqual(b.volume.values,other);c.dispose();
});
test('voxel undo/redo and transform changes invalidate preview without modifying other source layers',async()=>{
 const c=create(33),a=c.active.layer,b=c.create(64),before=a.volume.values.slice();c.composite.setQuality(64);await c.composite.flush();const initial=meshVertices(c.composite.group);
 c.setOperation(b.id,'difference');await c.composite.flush();assert.equal(c.composite.stats.triangles,0);c.undo();await c.composite.flush();assert.deepEqual(meshVertices(c.composite.group),initial);
 c.setActiveTransform(pose(.6));await c.composite.flush();assert.notDeepEqual(meshVertices(c.composite.group),initial);assert.deepEqual(a.volume.values,before);c.undo();await c.composite.flush();assert.deepEqual(meshVertices(c.composite.group),initial);c.dispose();
});
test('mode visibility and preview evaluation preserve source data and history, and idle rebuilds skip',async()=>{
 const c=create(),b=c.create(64);c.setOperation(b.id,'difference');const data=saveSculptProject(c.project),history=c.undoCount;
 c.group.visible=false;await c.composite.flush();assert.equal(await c.composite.rebuild(),false);assert.equal(c.composite.tick(),null);c.group.visible=true;
 assert.equal(c.undoCount,history);assert.deepEqual(new Uint8Array(saveSculptProject(c.project)),new Uint8Array(data));c.dispose();
});
test('separate and Boolean GLB workflows preserve source nodes versus one evaluated sculpture',async()=>{
 const c=create(),b=c.create(64);c.setActiveTransform(pose(.5));c.setOperation(b.id,'difference');c.composite.setQuality(64);await c.composite.flush();const bytes=saveSculptProject(c.project);c.group.visible=false;
 c.composite.group.visible=false;const separate=c.exportGroup(),result=c.composite.exportGroup();assert.equal(separate.children.length,2);assert.equal(result.children.length,1);
 const old=globalThis.FileReader;globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(buffer=>{this.result=buffer;this.onloadend?.();});}};
 try{for(const [group,count] of [[separate,2],[result,1]]){const file=await new GLTFExporter().parseAsync(group,{binary:true}),view=new DataView(file),json=JSON.parse(new TextDecoder().decode(new Uint8Array(file,20,view.getUint32(12,true))));assert.equal(json.meshes.length,count);assert.equal(json.nodes.filter(n=>n.mesh!==undefined).length,count);assert(json.meshes.every(m=>m.primitives.every(p=>!p.attributes.COLOR_0)));}}
 finally{globalThis.FileReader=old;disposeExport(separate);disposeExport(result);assert.deepEqual(new Uint8Array(saveSculptProject(c.project)),new Uint8Array(bytes));c.dispose();}
});
test('in-flight invalidation cancels stale work and flush converges to current transforms',async()=>{
 const c=create(33);c.composite.setQuality(64);const job=c.composite.rebuild();c.setActiveTransform(pose(.7));c.composite.syncMetadata();await job;await c.composite.flush();const sample=c.composite.exportGroup();assert(sample.children[0].geometry.getAttribute('position').getX(0)>-.3);disposeExport(sample);c.dispose();
});
test('sphere with a transformed box-like independent cutter creates an unbaked closed cutout',async()=>{
 const c=create(34),a=c.active.layer,b=c.create(64),n=b.volume.resolution;
 // Test fixture only: no shape stamping or shape UI is introduced.
 for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
  const q=[x,y,z].map(i=>Math.abs(b.volume.coordinate(i))-.48);
  b.volume.values[b.volume.index(x,y,z)]=Math.hypot(...q.map(v=>Math.max(0,v)))+Math.min(Math.max(...q),0);
 }
 c.setActiveTransform({position:[.45,0,.4],rotation:[0,.2,.15],scale:[.9,.9,.9]});c.setOperation(b.id,'difference');
 const aData=a.volume.values.slice(),bData=b.volume.values.slice();c.composite.setQuality(64);await c.composite.flush();closed(c.composite.group);
 assert(evaluateComposite(c.project.layerStack.layers,p(.4,0,.4))>0);assert(evaluateComposite(c.project.layerStack.layers,p(-.5))<0);
 assert.deepEqual(a.volume.values,aData);assert.deepEqual(b.volume.values,bData);c.dispose();
});
test('local voxel undo and redo rebuild the matching composite surface exactly',async()=>{
 const c=create(34),b=c.create(64);c.setActiveTransform(pose(.4,.7));c.setOperation(b.id,'difference');c.select(c.project.layerStack.layers[0].id);c.composite.setQuality(64);
 await c.composite.flush();const before=meshVertices(c.composite.group),other=b.volume.values.slice();
 c.beginStroke();c.applyStroke(p(-.6,0,.55),.3,'subtract',.7,.05,.5);c.finishStroke();await c.composite.flush();const after=meshVertices(c.composite.group);assert.notDeepEqual(after,before);
 c.undo();await c.composite.flush();assert.deepEqual(meshVertices(c.composite.group),before);c.undo(true);await c.composite.flush();assert.deepEqual(meshVertices(c.composite.group),after);assert.deepEqual(b.volume.values,other);c.dispose();
});
test('visibility invalidates preview while locking keeps cached contributing geometry unchanged',async()=>{
 const c=create(25),b=c.create(64);c.setOperation(b.id,'difference');c.composite.setQuality(64);await c.composite.flush();assert.equal(c.composite.stats.triangles,0);
 c.setFlag(b.id,'locked',true);assert.equal(await c.composite.rebuild(),false);assert.equal(c.composite.stats.triangles,0);assert.throws(()=>c.beginStroke());
 c.setFlag(b.id,'visible',false);await c.composite.flush();assert(c.composite.stats.triangles>0);c.setFlag(b.id,'visible',true);await c.composite.flush();assert.equal(c.composite.stats.triangles,0);c.dispose();
});

test('small uniform scales retain relative composite detail and quality controls reject invalid caps',async()=>{
 const c=create(33);c.setActiveTransform(pose(0,.01));c.composite.setQuality(64);await c.composite.flush();assert(c.composite.stats.triangles>0);assert(c.composite.stats.step<.002);
 for(const value of [0,32,193,NaN])assert.throws(()=>c.composite.setQuality(value));
 const source=c.active.layer.volume.values.slice();c.active.layer.transform.scale=[1,2,1];await assert.rejects(c.composite.rebuild(),/Non-uniform/);assert(c.composite.failed);assert.deepEqual(c.active.layer.volume.values,source);c.dispose();
});
