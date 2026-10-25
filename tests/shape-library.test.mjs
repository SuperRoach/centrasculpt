import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Raycaster} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {InputOwnership} from '../work/test-build/interaction.mjs';
import {identityTransform,transformMatrix,copyTransform} from '../work/test-build/transform.mjs';
import {defineShape,validateShapeDefinition,SHAPE_KINDS,SHAPE_METADATA} from '../work/test-build/shapes.mjs';
import {SHAPE_LIBRARY,preparePrimitive,prepareShape,localShapeBounds,shapePolyhedron} from '../work/test-build/shape-library.mjs';
import {ShapeGhost,ShapePreviewModel,shapeDimensionsForKind} from '../work/test-build/shape-preview.mjs';
import {saveSculptProject,openSculptProject} from '../work/test-build/project.mjs';
import {evaluateComposite} from '../work/test-build/compositor.mjs';
const settings={mode:'add',radius:.22,strength:.35,hardness:.5,camera:{position:[2.4,1.7,3.3],target:[0,0,0]}},point=(x,y=0,z=0)=>({x,y,z});
const close=(actual,expected,tolerance=1e-9)=>assert(Math.abs(actual-expected)<tolerance,`${actual} must equal ${expected}`);
const create=(n=25)=>new IndependentLayers(createBaseProject(new SDFVolume(n),settings));
const definition=(id,kind='sphere',dimensions=[1,1,1],transform=identityTransform())=>defineShape({targetLayerId:id,kind,dimensions,transform,operation:'add'});
const kinds=SHAPE_KINDS;
const layerPose={position:[.4,-.3,.2],rotation:[.3,-.4,.2],scale:[2,2,2]},shapePose={position:[.2,.1,-.1],rotation:[-.2,.3,.1],scale:[.6,.6,.6]};
function snapshot(c){return {data:c.project.layerStack.layers.map(l=>({id:l.id,values:l.volume.values.slice(),metadata:l.metadata()})),geometries:c.project.layerStack.layers.map(l=>c.runtime(l.id).surface.group.children.map(m=>m.geometry)),undo:c.undoCount,redo:c.redoCount};}
function unchanged(c,before){for(const [i,entry] of before.data.entries()){const layer=c.project.layerStack.get(entry.id);assert.deepEqual(layer.volume.values,entry.values);assert.deepEqual(layer.metadata(),entry.metadata);assert.deepEqual(c.runtime(layer.id).surface.group.children.map(m=>m.geometry),before.geometries[i]);assert.equal(c.runtime(layer.id).mesher.rebuildChunks(),null);}assert.equal(c.undoCount,before.undo);assert.equal(c.redoCount,before.redo);}
function disposeExport(g){g.traverse(o=>{if(o.isMesh)o.geometry.dispose();});}

test('shape registry has stable IDs, human names, bounds, dimensions and uniform-input metadata',()=>{
 assert.deepEqual(kinds,['sphere','box','triangular-prism','pyramid']);
 for(const kind of kinds){const item=SHAPE_LIBRARY[kind];assert.equal(item.id,kind);assert.equal(item.kind,kind);assert.equal(item.name,SHAPE_METADATA[kind].name);assert.equal(item.inputScale,'uniform');assert(item.description.length>10);assert(item.sampleLocal(point(0),[1,1,1])<0);assert.deepEqual(item.localBounds([2,2,2]),{min:[-1,-1,-1],max:[1,1,1]});}
});
test('sphere is an exact 3D distance field using full equal diameters',()=>{
 const s=preparePrimitive('sphere',[2,2,2]);close(s.sampleLocal(point(0)),-1);close(s.sampleLocal(point(1)),0);close(s.sampleLocal(point(0,0,2)),1);close(s.sampleLocal(point(1,1,1)),Math.sqrt(3)-1);assert(s.sampleLocal(point(.2,.2,.2))<0);
});
test('rectangular box distances remain exact on flat faces, sharp edges and corners',()=>{
 const s=preparePrimitive('box',[2,4,6]);close(s.sampleLocal(point(0)),-1);close(s.sampleLocal(point(1,2,3)),0);close(s.sampleLocal(point(2,3,4)),Math.sqrt(3));close(s.sampleLocal(point(2)),1);close(s.sampleLocal(point(.9)),-.1);assert(s.sampleLocal(point(0,0,4))>0);
});
test('triangular prism is an exact extruded 3D triangle, including cap and corner distances',()=>{
 const s=preparePrimitive('triangular-prism',[2,2,4]);close(s.sampleLocal(point(0)),-1/Math.sqrt(5));close(s.sampleLocal(point(0,1)),0);close(s.sampleLocal(point(.5,0,0)),0);close(s.sampleLocal(point(0,0,3)),1);close(s.sampleLocal(point(2,-2,3)),Math.sqrt(3));close(s.sampleLocal(point(1)),1/Math.sqrt(5));assert(s.sampleLocal(point(0,0,1.8))<0);
});
test('square pyramid has exact face, apex, base, edge and corner distances',()=>{
 const s=preparePrimitive('pyramid',[2,2,2]);close(s.sampleLocal(point(0)),-1/Math.sqrt(5));close(s.sampleLocal(point(0,1)),0);close(s.sampleLocal(point(0,-1)),0);close(s.sampleLocal(point(.5)),0);close(s.sampleLocal(point(0,2)),1);close(s.sampleLocal(point(2,-2,2)),Math.sqrt(3));close(s.sampleLocal(point(1,1,1)),Math.sqrt(4/3));assert(s.sampleLocal(point(.6,.5,0))>0);
});
test('local bounds contain exact primitive surfaces and all polyhedron faces have outward winding',()=>{
 for(const kind of kinds){const d=kind==='sphere'?[2,2,2]:kind==='pyramid'?[2,3,2]:[2,3,4],s=preparePrimitive(kind,d),bounds=localShapeBounds(kind,d);assert.deepEqual(s.bounds,bounds);
 if(kind==='sphere')continue;const poly=shapePolyhedron(kind,d);for(const v of poly.vertices){assert(v.every((value,i)=>value>=bounds.min[i]&&value<=bounds.max[i]));close(s.sampleLocal(point(...v)),0);}
 for(const face of poly.faces){const [a,b,c]=face.map(i=>new Vector3(...poly.vertices[i])),center=a.clone().add(b).add(c).divideScalar(3),normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize(),outside=center.clone().addScaledVector(normal,.01);close(s.sampleLocal(center),0);assert(s.sampleLocal(outside)>0);}
 }
});
test('shape definitions reject invalid IDs, operations, degenerate dimensions, nonuniform scale and non-square pyramids',()=>{
 const base=definition('base','box');for(const patch of [{kind:'torus'},{targetLayerId:''},{operation:'intersect'},{dimensions:[0,1,1]},{dimensions:[NaN,1,1]},{dimensions:[1001,1,1]},{transform:{...identityTransform(),scale:[1,2,1]}},{transform:{...identityTransform(),scale:[0,0,0]}},{transform:{...identityTransform(),rotation:[NaN,0,0]}},{kind:'sphere',dimensions:[1,2,1]},{kind:'pyramid',dimensions:[1,2,3]}])assert.throws(()=>validateShapeDefinition({...base,...patch}));
 for(const kind of kinds){assert.throws(()=>preparePrimitive(kind,[0,0,0]));assert.throws(()=>preparePrimitive(kind,[1,1,1]).sampleLocal(point(Infinity)));assert.throws(()=>preparePrimitive(kind,[1,1,1]).sampleLocal(point(NaN)));}
});
test('convex primitive SDFs are finite and 1-Lipschitz with extreme supported aspect ratios',()=>{
 let seed=123;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/2**32);
 for(const kind of ['triangular-prism','pyramid','box']){const d=kind==='pyramid'?[.001,1000,.001]:[.001,1000,10],s=preparePrimitive(kind,d);for(let i=0;i<100;i++){const a=point((random()-.5)*4,(random()-.5)*1001,(random()-.5)*11),b=point(a.x+.002,a.y+.003,a.z-.004),da=s.sampleLocal(a),db=s.sampleLocal(b);assert(Number.isFinite(da)&&Number.isFinite(db));assert(Math.abs(da-db)<=Math.hypot(.002,.003,.004)+1e-8);}}
});
test('translated rotated uniformly scaled shape and parent layer preserve world distance and coordinate round trips',()=>{
 const c=create();c.setActiveTransform(layerPose);
 for(const kind of kinds){const d=kind==='sphere'?[1,1,1]:kind==='pyramid'?[1,1.2,1]:[1,1.2,.8],prepared=prepareShape(definition(c.active.layer.id,kind,d,shapePose),c.active.layer);
 for(const local of [point(0),point(.2,.1,-.3),point(1,.5,.2)]){const world=new Vector3(local.x,local.y,local.z).applyMatrix4(prepared.matrix);close(prepared.sampleWorld(world),prepared.sampleLocal(local)*1.2,1e-8);}
 const corners=prepared.localBounds;for(const x of [corners.min[0],corners.max[0]])for(const y of [corners.min[1],corners.max[1]])for(const z of [corners.min[2],corners.max[2]]){const w=new Vector3(x,y,z).applyMatrix4(prepared.matrix).toArray();assert(w.every((v,i)=>v>=prepared.worldBounds.min[i]-1e-9&&v<=prepared.worldBounds.max[i]+1e-9));}
 }
 c.dispose();
});
test('prepared shapes own validated parameter snapshots rather than mutable input references',()=>{
 const input=definition('base','box',[1,2,3],shapePose),prepared=prepareShape(input),old=prepared.sampleLocal(point(0));input.dimensions[0]=10;input.transform.position[0]=10;assert.equal(prepared.sampleLocal(point(0)),old);assert.notEqual(prepared.definition.dimensions[0],10);assert.throws(()=>prepareShape(input,{id:'other'}),/target/);
});
test('preview updates, operation switches and dimensions never touch voxels, chunk geometry or project history',()=>{
 const c=create(),b=c.create(64),before=snapshot(c),ghost=new ShapeGhost(()=>c.project.layerStack);ghost.model.enabled=true;
 for(let i=0;i<120;i++){const kind=kinds[i%4],d=ghost.model.definition;ghost.model.set({...d,kind,dimensions:shapeDimensionsForKind(kind,[.8+i/100,1.1,.6]),operation:i%2?'subtract':'add',transform:{...copyTransform(shapePose),position:[i/100,.2,0]}},c.project.layerStack);ghost.sync();}
 unchanged(c,before);assert.equal(ghost.cachedShapes,4);assert.equal(ghost.stats.geometryBuilds,4);assert.equal(c.project.layerStack.get(b.id).id,b.id);ghost.dispose();c.dispose();
});
test('dimension and pose updates reuse all preview geometry; idle synchronization skips work',()=>{
 const c=create(),ghost=new ShapeGhost(()=>c.project.layerStack);ghost.preview(definition(c.active.layer.id,'box'));const solid=ghost.group.children[0].children.find(o=>o.isMesh),geometry=solid.geometry;
 for(let i=0;i<50;i++){const d=ghost.model.definition;ghost.model.set({...d,dimensions:[1+i/100,2,3],transform:{...identityTransform(),position:[i/100,0,0]}},c.project.layerStack);ghost.sync();assert.equal(solid.geometry,geometry);}assert.equal(ghost.stats.geometryBuilds,1);assert.equal(ghost.sync(),false);ghost.clear();assert.equal(ghost.group.visible,false);ghost.dispose();c.dispose();
});
test('ghost polygon and sphere surface vertices agree with the corresponding procedural zero field',()=>{
 const c=create();c.setActiveTransform(layerPose);const ghost=new ShapeGhost(()=>c.project.layerStack);
 for(const kind of kinds){const dims=kind==='sphere'?[1.2,1.2,1.2]:kind==='pyramid'?[1.2,.8,1.2]:[1.2,.8,.6],d=definition(c.active.layer.id,kind,dims,shapePose);ghost.preview(d);const prepared=prepareShape(d,c.active.layer),mesh=ghost.group.children[0].children.find(o=>o.isMesh),positions=mesh.geometry.getAttribute('position');
 for(let i=0;i<positions.count;i++){const p=new Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);close(prepared.sampleWorld(p),0,2e-6);}}
 ghost.dispose();c.dispose();
});
test('preview automatically follows active layer IDs and matrices while hidden locked targets remain unavailable',()=>{
 const c=create(),a=c.active.layer,b=c.create(64),ghost=new ShapeGhost(()=>c.project.layerStack);ghost.model.enabled=true;ghost.sync();assert.equal(ghost.model.definition.targetLayerId,b.id);c.select(a.id);c.setActiveTransform(layerPose);ghost.sync();assert.equal(ghost.model.definition.targetLayerId,a.id);assert(ghost.group.matrix.equals(transformMatrix(a.transform)));
 for(const flag of ['locked','visible']){c.setFlag(a.id,'locked',false);c.setFlag(a.id,'visible',true);c.setFlag(a.id,flag,flag==='locked');ghost.sync();assert.equal(ghost.group.visible,false);assert.throws(()=>ghost.model.set(ghost.model.definition,c.project.layerStack));assert.throws(()=>ghost.model.futureStampIntent(c.project.layerStack));}
 c.setFlag(a.id,'visible',true);c.setFlag(a.id,'locked',false);ghost.sync();assert.equal(ghost.group.visible,true);assert.throws(()=>ghost.model.set({...ghost.model.definition,targetLayerId:b.id},c.project.layerStack),/active/);ghost.dispose();c.dispose();
});
test('world-space preview pose edits convert to layer-local metadata without editing a layer',()=>{
 const c=create();c.setActiveTransform(layerPose);const before=snapshot(c),model=new ShapePreviewModel(c.active.layer.id),world={position:[1,.2,-.4],rotation:[-.2,.5,.1],scale:[1.4,1.4,1.4]};model.setWorldTransform(world,c.project.layerStack);const actual=transformMatrix(model.worldTransform(c.project.layerStack)),expected=transformMatrix(world);assert(actual.elements.every((v,i)=>Math.abs(v-expected.elements[i])<1e-9));unchanged(c,before);c.dispose();
});
test('nonuniform or invalid legacy parent transforms clearly disable preview and distance evaluation',()=>{
 const c=create(),ghost=new ShapeGhost(()=>c.project.layerStack);ghost.model.enabled=true;
 for(const scale of [[1,2,1],[-1,-1,-1]]){c.active.layer.transform.scale=scale;ghost.sync();assert.equal(ghost.group.visible,false);assert(ghost.model.availability(c.project.layerStack));assert.throws(()=>prepareShape(ghost.model.definition,c.active.layer));}
 ghost.dispose();c.dispose();
});
test('ghost never intercepts raycasts and preview ownership pauses sculpt/layer-transform gestures',()=>{
 const c=create(),ghost=new ShapeGhost(()=>c.project.layerStack),input=new InputOwnership();ghost.preview(definition(c.active.layer.id));assert.equal(new Raycaster(new Vector3(0,0,3),new Vector3(0,0,-1)).intersectObject(ghost.group,true).length,0);assert.equal(input.beginSculpt(true,ghost.model.enabled),false);input.mode='translate';assert.equal(input.beginTransform(true,ghost.model.enabled),false);ghost.clear();input.mode='sculpt';assert(input.beginSculpt(true,ghost.model.enabled));input.end('sculpt');ghost.dispose();c.dispose();
});
test('preview reset and future stamp intent are data-only and never implement a commit',()=>{
 const c=create(),ghost=new ShapeGhost(()=>c.project.layerStack),before=snapshot(c);ghost.preview(definition(c.active.layer.id,'pyramid',[1,2,1]));const intent=ghost.model.futureStampIntent(c.project.layerStack);assert.equal(intent.kind,'shape-stamp');assert.equal(intent.targetLayerId,c.active.layer.id);assert.equal(intent.definition.kind,'pyramid');ghost.reset();assert.equal(ghost.model.enabled,false);assert.equal(ghost.model.definition.kind,'sphere');unchanged(c,before);ghost.dispose();c.dispose();
});
test('Boolean preview, Bake, native project round trips and both GLB exports exclude shape ghost data',async()=>{
 const c=create(),a=c.active.layer,b=c.create(64);c.setActiveTransform({...identityTransform(),position:[.5,0,0]});c.setOperation(b.id,'difference');const ghost=new ShapeGhost(()=>c.project.layerStack);ghost.preview(definition(b.id,'box',[1.2,.8,.6],{...identityTransform(),position:[2,0,0]}));const before=saveSculptProject(c.project),sources=[a.volume.values.slice(),b.volume.values.slice()];
 assert(evaluateComposite(c.project.layerStack.layers,point(3))>0);assert.deepEqual(new Uint8Array(saveSculptProject(c.project)),new Uint8Array(before));c.composite.setQuality(64);await c.composite.flush();assert.deepEqual(a.volume.values,sources[0]);assert.deepEqual(b.volume.values,sources[1]);
 const baked=await c.bake({name:'Baked with ghost visible',resolution:64,hideSources:true});ghost.sync();assert.equal(ghost.model.definition.targetLayerId,baked.id);assert.equal(c.project.layerStack.layers.length,3);const bytes=saveSculptProject(c.project),loaded=openSculptProject(bytes);assert.deepEqual(loaded.activeLayer.volume.values,baked.volume.values);assert.equal(loaded.layerStack.layers.length,3);const metadataLength=new DataView(bytes).getUint32(12,true),metadata=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,16,metadataLength)));assert.equal(metadata.shapePreview,undefined);assert(metadata.layers.every(l=>l.shapePreview===undefined&&l.previewOnly===undefined));
 await c.composite.flush();const exports=[c.exportGroup(),c.composite.exportGroup()],old=globalThis.FileReader;globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(buffer=>{this.result=buffer;this.onloadend?.();});}};
 try{for(const group of exports){const file=await new GLTFExporter().parseAsync(group,{binary:true}),view=new DataView(file),json=JSON.parse(new TextDecoder().decode(new Uint8Array(file,20,view.getUint32(12,true))));assert.equal(json.meshes.length,1);assert.equal(json.nodes.filter(n=>n.mesh!==undefined).length,1);assert(!JSON.stringify(json).includes('Shape Ghost'));}}
 finally{globalThis.FileReader=old;exports.forEach(disposeExport);ghost.dispose();c.dispose();}
});
test('world pose conversion supports compound scales/positions outside local metadata limits and their tiny endpoints',()=>{
 const c=create(),model=new ShapePreviewModel(c.active.layer.id);
 for(const size of [2,.001]){
  c.setActiveTransform({position:[.3,-.2,.1],rotation:[.2,.4,-.1],scale:[size,size,size]});
  const local={position:[900,0,0],rotation:[.1,.2,.3],scale:size===2?[1000,1000,1000]:[.001,.001,.001]};
  model.set({...model.definition,transform:local},c.project.layerStack);const before=snapshot(c),world=model.worldTransform(c.project.layerStack),expected=transformMatrix(world);model.setWorldTransform(world,c.project.layerStack);
  const actual=transformMatrix(model.worldTransform(c.project.layerStack));assert(actual.elements.every((v,i)=>Math.abs(v-expected.elements[i])<1e-8));unchanged(c,before);
 }
 assert.throws(()=>model.setWorldTransform({...identityTransform(),scale:[1,2,1]},c.project.layerStack),/uniform/);assert.throws(()=>model.setWorldTransform({...identityTransform(),scale:[1e-6,1.001e-6,1e-6]},c.project.layerStack),/uniform/);const b=c.create(64);model.setWorldTransform(identityTransform(),c.project.layerStack);assert.equal(model.definition.targetLayerId,b.id);c.dispose();
});
