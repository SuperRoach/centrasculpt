import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {prepareComposite} from '../work/test-build/compositor.mjs';
import {planBake,sampleBake} from '../work/test-build/bake.mjs';
import {saveSculptProject,openSculptProject,saveProject} from '../work/test-build/project.mjs';
import {transformMatrix} from '../work/test-build/transform.mjs';
const settings={mode:'add',radius:.22,strength:.35,hardness:.5,camera:{position:[2.4,1.7,3.3],target:[0,0,0]}};
const create=(n=25)=>new IndependentLayers(createBaseProject(new SDFVolume(n),settings));
const options=(resolution=64,hideSources=true)=>({name:'Baked result',resolution,hideSources});
const pose={position:[.45,.1,.2],rotation:[.3,.4,-.2],scale:[.75,.75,.75]};
function sourceCopy(c){return c.project.layerStack.layers.map(l=>({id:l.id,volume:l.volume,data:l.volume.values.slice(),transform:structuredClone(l.transform),operation:l.operation,visible:l.visible,locked:l.locked}));}
function sourcesPreserved(c,before){for(const item of before){const layer=c.project.layerStack.get(item.id);assert.equal(layer.volume,item.volume);assert.deepEqual(layer.volume.values,item.data);assert.deepEqual(layer.transform,item.transform);assert.equal(layer.operation,item.operation);assert.equal(layer.locked,item.locked);}}
function exactSamples(layer,sample){const v=layer.volume,n=v.resolution,m=transformMatrix(layer.transform),s=layer.transform.scale[0];for(let z=0;z<n;z+=3)for(let y=0;y<n;y+=3)for(let x=0;x<n;x+=3){const p=new Vector3(v.coordinate(x),v.coordinate(y),v.coordinate(z)).applyMatrix4(m),expected=Math.fround(Math.max(-6.4,Math.min(6.4,sample(p.x,p.y,p.z)/s)));assert(Math.abs(v.values[v.index(x,y,z)]-expected)<2e-6);}}
function disposeExport(group){group.traverse(o=>{if(o.isMesh)o.geometry.dispose();});}

test('bake Union Difference and Intersect directly samples the ordered field and keeps source voxels',async()=>{
 for(const operation of ['union','difference','intersect']){const c=create(),b=c.create(64);c.setActiveTransform(pose);c.setOperation(b.id,operation);const before=sourceCopy(c),sample=prepareComposite(c.project.layerStack.layers),count=c.undoCount;
 const baked=await c.bake(options());assert.equal(c.project.layerStack.layers.length,3);assert.equal(c.project.activeLayerId,baked.id);assert.equal(c.undoCount,count+1);assert.equal(baked.operation,'union');assert.equal(baked.locked,false);assert.equal(baked.visible,true);exactSamples(baked,sample);sourcesPreserved(c,before);assert(before.every(s=>!c.project.layerStack.get(s.id).visible));assert.notEqual(baked.volume.values.buffer,b.volume.values.buffer);c.dispose();}
});
test('bake respects explicit order and first visible initialization, including hidden and locked sources',async()=>{
 const c=create(),a=c.active.layer,b=c.create(64);c.setActiveTransform(pose);c.setOperation(b.id,'difference');c.move(b.id,-1);c.setFlag(b.id,'locked',true);c.setFlag(a.id,'visible',false);const sample=prepareComposite(c.project.layerStack.layers),before=sourceCopy(c);
 const baked=await c.bake(options());exactSamples(baked,sample);sourcesPreserved(c,before);assert.equal(b.visible,false);assert.equal(a.visible,false);c.undo();assert.equal(b.visible,true);assert.equal(a.visible,false);assert.equal(b.locked,true);c.dispose();
});
test('destination choices are exactly 64/128/192 and are independent from mixed source resolutions',async()=>{
 const c=create(128),b=c.create(64);c.setActiveTransform(pose);c.setOperation(b.id,'difference');const before=sourceCopy(c);
 for(const resolution of [64,128,192]){const plan=c.bakePlan(resolution),baked=await c.bake(options(resolution));assert.equal(baked.volume.resolution,resolution);assert.equal(baked.volume.values.length,resolution**3);assert.equal(c.lastBakeStats.resolution,resolution);assert.equal(plan.gridBytes,resolution**3*8);sourcesPreserved(c,before);c.undo();}
 c.dispose();
});
test('padded destination bounds contain all transformed source bounds without clipping and stay native-compatible',async()=>{
 const c=create(),b=c.create(64);c.setActiveTransform({...pose,position:[2,-.4,1.3],scale:[1.4,1.4,1.4]});const plan=c.bakePlan(64);
 for(const layer of c.project.layerStack.layers){const bounds=layer.volume.worldBounds(layer.transform);for(let i=0;i<3;i++){assert(plan.min[i]<bounds.min[i]);assert(plan.max[i]>bounds.max[i]);}}
 const baked=await c.bake(options());const n=baked.volume.resolution;
 for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(x===0||y===0||z===0||x===n-1||y===n-1||z===n-1)assert(baked.volume.values[baked.volume.index(x,y,z)]>0);
 assert.equal(baked.volume.extent,1.6);assert.deepEqual(baked.transform.position,plan.center);assert.equal(baked.transform.scale[0],plan.scale);assert.doesNotThrow(()=>saveSculptProject(c.project));c.dispose();
});
test('empty and disjoint intersections fail atomically; disjoint subtraction keeps the first source',async()=>{
 const c=create(),b=c.create(64);c.setOperation(b.id,'difference');const before=saveSculptProject(c.project),history=c.undoCount;
 await assert.rejects(c.bake(options()),/empty/);assert.equal(c.undoCount,history);assert.deepEqual(new Uint8Array(saveSculptProject(c.project)),new Uint8Array(before));
 c.setActiveTransform({...pose,position:[3,0,0]});c.setOperation(b.id,'intersect');await assert.rejects(c.bake(options()),/empty/);
 c.setOperation(b.id,'difference');const baked=await c.bake(options());assert(baked.volume.sampleWorld({x:0,y:0,z:0},baked.transform)<0);assert(baked.volume.sampleWorld({x:3,y:0,z:0},baked.transform)>0);c.dispose();
});
test('no visible sources and invalid names/resolutions/bounds/capacity are rejected without mutation',async()=>{
 const c=create(),id=c.active.layer.id;for(const resolution of [0,32,NaN,193])assert.throws(()=>c.bakePlan(resolution));
 await assert.rejects(c.bake({...options(),name:'  '}),/Name/);c.setFlag(id,'visible',false);await assert.rejects(c.bake(options()),/Show/);c.setFlag(id,'visible',true);
 c.setActiveTransform({position:[0,0,0],rotation:[0,0,0],scale:[1000,1000,1000]});await assert.rejects(c.bake(options()),/bounds/);
 c.dispose();const big=create(192);big.create(64);await assert.rejects(big.bake(options(192)),/voxel budget/);assert.equal(big.project.layerStack.layers.length,2);big.dispose();
});
test('one bake undo/redo restores stack ordering flags active selection and preview state without copying voxels',async()=>{
 const c=create(),a=c.active.layer,b=c.create(64);c.setActiveTransform(pose);c.setOperation(b.id,'difference');c.select(a.id);c.viewMode='boolean';const before=c.project.layerStack.layers.map(l=>l.id),history=c.undoCount,baked=await c.bake(options()),runtime=c.active,data=baked.volume.values,geometries=runtime.surface.group.children.map(m=>m.geometry);
 assert.equal(c.undoCount,history+1);assert.equal(c.viewMode,'boolean');c.undo();assert.deepEqual(c.project.layerStack.layers.map(l=>l.id),before);assert.equal(c.project.activeLayerId,a.id);assert(a.visible&&b.visible);assert.equal(c.viewMode,'boolean');
 c.viewMode='separate';c.undo(true);assert.equal(c.active,runtime);assert.equal(c.active.layer.id,baked.id);assert.equal(baked.volume.values,data);assert.deepEqual(c.active.surface.group.children.map(m=>m.geometry),geometries);assert.equal(c.viewMode,'boolean');assert(!a.visible&&!b.visible);assert.equal(runtime.mesher.rebuildChunks(),null);c.dispose();
});
test('keeping sources visible explicitly selects Separate Layers and bake replay restores that decision',async()=>{
 const c=create(),a=c.active.layer;c.viewMode='boolean';const baked=await c.bake(options(64,false));assert(a.visible&&baked.visible);assert.equal(c.viewMode,'separate');c.undo();assert.equal(c.viewMode,'boolean');c.undo(true);assert.equal(c.viewMode,'separate');assert(a.visible);c.dispose();
});
test('continued Add Subtract Smooth strokes target only baked voxels and replay through bake creation',async()=>{
 const c=create(),before=sourceCopy(c),baked=await c.bake(options()),original=baked.volume.values.slice(),point=new Vector3(0,0,.85).applyMatrix4(transformMatrix(baked.transform));
 for(const mode of ['add','subtract','smooth']){c.beginStroke();c.applyStroke(point,.3,mode,.6,.05,.4);c.finishStroke();}
 const after=baked.volume.values.slice();assert.notDeepEqual(after,original);sourcesPreserved(c,before);
 for(let i=0;i<3;i++)c.undo();assert.deepEqual(baked.volume.values,original);c.undo();assert.equal(c.project.layerStack.layers.length,1);c.undo(true);for(let i=0;i<3;i++)c.undo(true);assert.deepEqual(c.active.layer.volume.values,after);sourcesPreserved(c,before);c.dispose();
});
test('new strokes discard undone bake redo and safely release retained geometry',async()=>{
 const c=create(),baked=await c.bake(options()),runtime=c.active;let disposed=0;for(const mesh of runtime.surface.group.children)mesh.geometry.addEventListener('dispose',()=>disposed++);
 c.undo();c.beginStroke();c.applyStroke({x:0,y:0,z:.85},.3,'add',.5,.05,.5);c.finishStroke();assert.equal(c.redoCount,0);assert(disposed>0);assert(!c.project.layerStack.layers.some(l=>l.id===baked.id));c.dispose();
});
test('cancel during sampling or chunk preparation leaves no partial layers, flags, history or runtime',async()=>{
 for(const stage of ['sampling','meshing']){const c=create(),before=saveSculptProject(c.project),history=c.undoCount,abort=new AbortController();await assert.rejects(c.bake(options(128),abort.signal,p=>{if(p.stage===stage)abort.abort();}),/cancelled/);assert.equal(c.project.layerStack.layers.length,1);assert.equal(c.undoCount,history);assert.equal(c.redoCount,0);assert.deepEqual(new Uint8Array(saveSculptProject(c.project)),new Uint8Array(before));c.beginStroke();c.finishStroke();c.dispose();}
});
test('source commands are gated during asynchronous baking and prior redo survives failure',async()=>{
 const c=create();c.setActiveTransform(pose);c.undo();const count=c.redoCount;const abort=new AbortController();let checked=false;
 await assert.rejects(c.bake(options(),abort.signal,()=>{if(!checked){checked=true;assert.throws(()=>c.create(64),/Wait for Bake/);assert.throws(()=>c.beginStroke(),/Wait for Bake/);assert.throws(()=>c.undo(),/Wait for Bake/);abort.abort();}}),/cancelled/);assert.equal(c.redoCount,count);c.undo(true);c.dispose();
});
test('native round trip treats baked output as an ordinary independent layer and excludes viewport preferences',async()=>{
 const c=create(),b=c.create(64);c.setActiveTransform(pose);c.setOperation(b.id,'difference');c.display.mode='layer-colours';const baked=await c.bake(options(128));c.rename(baked.id,'Editable sculpture');const file=saveSculptProject(c.project),loaded=new IndependentLayers(openSculptProject(file));
 for(const layer of c.project.layerStack.layers){const next=loaded.project.layerStack.get(layer.id);assert.deepEqual(next.metadata(),layer.metadata());assert.deepEqual(next.volume.values,layer.volume.values);}
 assert.equal(loaded.active.layer.id,baked.id);loaded.beginStroke();loaded.applyStroke(new Vector3(0,0,.75).applyMatrix4(transformMatrix(baked.transform)),.3,'add',.4,.03,.4);loaded.finishStroke();
 const view=new DataView(file),meta=new TextDecoder().decode(new Uint8Array(file,16,view.getUint32(12,true)));assert(!/colour|color|viewport|bakeHistory/i.test(meta));assert.equal(openSculptProject(saveProject(new SDFVolume(17),settings)).activeLayer.operation,'union');loaded.dispose();c.dispose();
});
test('baked layers retain normal transform rename lock visibility and independent resampling behavior',async()=>{
 const c=create(),before=sourceCopy(c),baked=await c.bake(options());c.setActiveTransform(pose);c.rename(baked.id,'Renamed');c.setFlag(baked.id,'locked',true);assert.throws(()=>c.beginStroke());c.setFlag(baked.id,'locked',false);c.resampleActive(128);const values=c.active.layer.volume.values;
 c.undo();assert.notEqual(baked.name,'Renamed');c.undo();assert.deepEqual(baked.transform.rotation,[0,0,0]);c.undo();assert.equal(c.project.layerStack.layers.length,1);c.undo(true);assert.equal(c.active.layer.volume.values,values);assert.equal(c.active.layer.volume.resolution,128);c.undo(true);c.undo(true);assert.equal(c.active.layer.name,'Renamed');sourcesPreserved(c,before);c.dispose();
});
test('both GLB workflows export the baked layer only while sources are hidden, with neutral materials',async()=>{
 const c=create(),b=c.create(64);c.setActiveTransform(pose);c.setOperation(b.id,'difference');const baked=await c.bake(options()),before=saveSculptProject(c.project);c.composite.setQuality(64);await c.composite.flush();
 const separate=c.exportGroup(),composite=c.composite.exportGroup();assert.equal(separate.children.length,1);assert.equal(separate.children[0].userData.layerId,baked.id);assert.equal(composite.children.length,1);
 const old=globalThis.FileReader;globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(buffer=>{this.result=buffer;this.onloadend?.();});}};
 try{for(const group of [separate,composite]){const file=await new GLTFExporter().parseAsync(group,{binary:true}),view=new DataView(file),json=JSON.parse(new TextDecoder().decode(new Uint8Array(file,20,view.getUint32(12,true))));assert.equal(json.meshes.length,1);assert.equal(json.nodes.filter(n=>n.mesh!==undefined).length,1);assert(json.materials.length===1);}}
 finally{globalThis.FileReader=old;disposeExport(separate);disposeExport(composite);assert.deepEqual(new Uint8Array(saveSculptProject(c.project)),new Uint8Array(before));c.dispose();}
});
test('lower output resolution can lose a tiny feature while high output retains it without source changes',async()=>{
 const source=new SDFVolume(192),project=createBaseProject(source,settings),lowPlan=planBake(project,64),highPlan=planBake(project,192);
 const distance=(p,plan)=>Math.hypot(...p.map(v=>{const h=plan.worldStep,nearest=-plan.extent+Math.round((v+plan.extent)/h)*h;return v-nearest;}));let center;
 for(let x=130;x<155&&!center;x++)for(let y=91;y<106&&!center;y++)for(let z=91;z<106&&!center;z++){const p=[x,y,z].map(i=>source.coordinate(i));if(distance(p,lowPlan)>.043&&distance(p,highPlan)<.008)center=p;}
 assert(center,'fixture must be off the coarse lattice and close to fine lattice');
 for(let z=0;z<192;z++)for(let y=0;y<192;y++)for(let x=0;x<192;x++){const p=[x,y,z].map(i=>source.coordinate(i));source.values[source.index(x,y,z)]=Math.min(Math.hypot(p[0]+.5,p[1],p[2])-.3,Math.hypot(...p.map((v,i)=>v-center[i]))-.032);}
 const before=source.values.slice(),low=await sampleBake(project,lowPlan),high=await sampleBake(project,highPlan),point={x:center[0],y:center[1],z:center[2]},transform=plan=>({position:plan.center,rotation:[0,0,0],scale:[plan.scale,plan.scale,plan.scale]});
 assert(low.volume.sampleWorld(point,transform(lowPlan))>0);assert(high.volume.sampleWorld(point,transform(highPlan))<0);assert.deepEqual(source.values,before);
});
test('reordering visible rows preserves the explicit Boolean sequence in Bake',async()=>{
 const c=create(),b=c.create(64);c.setActiveTransform(pose);c.setOperation(b.id,'difference');const before=prepareComposite(c.project.layerStack.layers);assert(before(.4,0,.2)>0);
 c.move(b.id,-1);const baked=await c.bake(options());assert(baked.volume.sampleWorld({x:.4,y:0,z:.2},baked.transform)>0);c.dispose();
});
test('non-overlapping union bakes both components and source 192³ stays independent',async()=>{
 const c=create(192),b=c.create(64);c.setActiveTransform({...pose,position:[2.3,0,0]});const before=sourceCopy(c),baked=await c.bake(options());
 for(const x of [0,2.3])assert(baked.volume.sampleWorld({x,y:0,z:0},baked.transform)<0);assert(baked.volume.sampleWorld({x:1.2,y:1,z:0},baked.transform)>0);sourcesPreserved(c,before);c.dispose();
});
test('triangle-budget failure and a full stack keep original project and histories intact',async()=>{
 const c=create(),before=saveSculptProject(c.project),triangles=c.active.triangles;c.active.triangles=999999;
 await assert.rejects(c.bake(options()),/triangle budget/);assert.equal(c.undoCount,0);assert.equal(c.project.layerStack.layers.length,1);c.active.triangles=triangles;assert.deepEqual(new Uint8Array(saveSculptProject(c.project)),new Uint8Array(before));
 for(let i=0;i<7;i++)c.create(64);await assert.rejects(c.bake(options()),/8/);assert.equal(c.project.layerStack.layers.length,8);c.dispose();
});
test('redo retains renamed hidden locked baked state and deletion cannot resurrect a deleted output',async()=>{
 const c=create(),baked=await c.bake(options());c.rename(baked.id,'Kept name');c.setFlag(baked.id,'visible',false);c.setFlag(baked.id,'locked',true);c.undo();c.undo(true);assert.equal(c.active.layer.name,'Kept name');assert.equal(c.active.layer.visible,false);assert.equal(c.active.layer.locked,true);c.remove(baked.id);assert.equal(c.undoCount,0);assert.equal(c.redoCount,0);assert.equal(c.project.layerStack.layers.length,1);c.dispose();
});
test('Bake preserves legacy non-contiguous source ordering metadata across commit and undo/redo',async()=>{
 const c=create(),a=c.active.layer,b=c.create(64);a.order=10;b.order=25;const metadata=c.project.layerStack.layers.map(l=>l.metadata());
 const baked=await c.bake(options(64,false));assert.equal(baked.order,26);for(let i=0;i<2;i++)assert.deepEqual(c.project.layerStack.layers[i].metadata(),metadata[i]);
 c.undo();assert.deepEqual(c.project.layerStack.layers.map(l=>l.metadata()),metadata);c.undo(true);assert.equal(c.active.layer.id,baked.id);assert.equal(baked.order,26);for(let i=0;i<2;i++)assert.deepEqual(c.project.layerStack.layers[i].metadata(),metadata[i]);assert.doesNotThrow(()=>openSculptProject(saveSculptProject(c.project)));c.dispose();
});
