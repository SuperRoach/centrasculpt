import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Matrix4,Vector3} from 'three';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {EditorToolState} from '../work/test-build/editor-tool-state.mjs';
import {ShapePreviewModel} from '../work/test-build/shape-preview.mjs';
import {ClayPathControls,snapClayPoint,clayReplay} from '../work/test-build/clay-path.mjs';
import {ClayStrokeSession} from '../work/test-build/clay-stroke-session.mjs';
import {XRAlternateTool} from '../work/test-build/xr-alternate-tool.mjs';
import {XRBrushSizing} from '../work/test-build/xr-brush-sizing.mjs';
import {XRClayStroke} from '../work/test-build/xr-clay-stroke.mjs';
import {XRMoveTool} from '../work/test-build/xr-move-tool.mjs';
import {XRShapeStamp} from '../work/test-build/xr-shape-stamp.mjs';
import {XRMirrorPlane} from '../work/test-build/xr-mirror-plane.mjs';
import {XRMenuModel} from '../work/test-build/xr-menu-model.mjs';
import {defaultToolPreferences,validateToolPreferences} from '../work/test-build/tool-preferences.mjs';
import {saveSculptProject,openSculptProject} from '../work/test-build/project.mjs';
const initial={mode:'add',radius:.22,strength:.35,hardness:.6,camera:{position:[2,2,3],target:[0,0,0]}};
function fixture(n=33){const layers=new IndependentLayers(createBaseProject(new SDFVolume(n),initial)),shape=new ShapePreviewModel(layers.project.activeLayerId),root=new Group();root.add(layers.group);let settings={...initial},mode='sculpt';const tools=new EditorToolState({layers:()=>layers,shape,settings:()=>settings,setSettings:v=>settings=v,mode:()=>mode,selectTool:t=>{mode=t==='transform'?'translate':'sculpt';shape.setEnabled(t==='stamp',layers.project.layerStack);settings={...settings,mode:t==='smooth'?'smooth':'add'};},selectTransform:m=>mode=m,busy:()=>false,changed(){}});return {layers,tools,root,dispose:()=>layers.dispose()};}
const state=(role='tool')=>({role,connected:true,tracked:true,gripTracked:true,connectionId:role==='tool'?1:2,stick:{available:true,x:0,y:0},buttons:{trigger:{pressed:false,rawValue:0,justPressed:false},grip:{pressed:false,rawValue:0}}});
const press=s=>Object.assign(s.buttons.trigger,{pressed:true,rawValue:1,justPressed:true});
const release=s=>Object.assign(s.buttons.trigger,{pressed:false,rawValue:0,justPressed:false});
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const settle=async f=>{const end=performance.now()+10000;while(f()){assert(performance.now()<end,'job settles');await new Promise(r=>setTimeout(r,1));}};

test('fresh Clay alternate reverses Add/Subtract and restores exact settings; legacy explicit Smooth remains',()=>{
 const f=fixture(),a=new XRAlternateTool(f.tools),support=state('support'),tool=state();try{assert.equal(defaultToolPreferences().alternateTool,'opposite');
 for(const mode of ['add','subtract']){f.tools.port.setSettings({...initial,mode});a.update(support,tool,true,false);press(support);a.update(support,tool,true,false);assert(a.active);assert.match(a.feedback,new RegExp(mode==='add'?'Clay SUBTRACT':'Clay ADD'));assert.equal(f.tools.active,'clay');assert.equal(f.tools.port.settings().mode,mode==='add'?'subtract':'add');release(support);a.update(support,tool,true,false);assert.deepEqual(f.tools.port.settings(),{...initial,mode});}
 const legacy=defaultToolPreferences();legacy.alternateTool='smooth';delete legacy.path.snap;f.tools.restorePreferences(legacy);assert.equal(f.tools.alternateTool,'smooth');assert.equal(f.tools.path.snap,0);assert.equal(f.layers.undoCount,0);
 }finally{a.cancel();f.dispose();}
});

test('Tool stick resizes drawing Clay, respects menu/grip gates, and frozen replay retains each recorded radius',()=>{
 for(const steady of [0,100]){const f=fixture(),stroke=new XRClayStroke(()=>f.layers,f.tools,f.root),sizing=new XRBrushSizing(f.tools),tool=state(),pose=new Matrix4().makeTranslation(.5,0,.8);try{
 f.tools.path.steady=steady;stroke.update(tool,pose,0,true);sizing.update(tool,[tool],0,true,false);press(tool);stroke.update(tool,pose,16,true);assert.equal(stroke.liveSizing,'clay-radius');tool.stick.y=-1;
 assert(sizing.update(tool,[tool],66,true,true,false,stroke.liveSizing));const grown=f.tools.brushRadius;assert(grown>.22);tool.buttons.trigger.justPressed=false;stroke.update(tool,pose,66,true);near(stroke.session.localRadius,grown);near(stroke.session.raw[0].radius,.22);near(stroke.session.raw.at(-1).radius,grown);
 assert(!sizing.update(tool,[tool],82,false,true,false,stroke.liveSizing));near(f.tools.brushRadius,grown);tool.buttons.grip.pressed=true;assert(!sizing.update(tool,[tool],98,true,true,false,stroke.liveSizing));tool.buttons.grip.pressed=false;
 release(tool);stroke.update(tool,pose,114,true);assert.equal(stroke.liveSizing,null);for(let t=130;stroke.active;t+=16){assert(t<10000);stroke.update(tool,pose,t,true);}assert.equal(f.layers.undoCount,1);const after=f.layers.active.volume.values.slice();f.layers.undo();f.layers.undo(true);assert.deepEqual(f.layers.active.volume.values,after);
 }finally{stroke.dispose();f.dispose();}}
});

test('buffered variable-radius replay exactly matches the displayed path radii under layer scaling',()=>{
 const f=fixture(),reference=fixture(),controls=new ClayPathControls();try{controls.steady=100;controls.straightLine=true;f.layers.setActiveTransform({position:[0,0,0],rotation:[0,0,0],scale:[2,2,2]});reference.layers.setActiveTransform({position:[0,0,0],rotation:[0,0,0],scale:[2,2,2]});const session=new ClayStrokeSession(()=>f.layers);session.begin(initial,controls,0,true);
 for(const [i,r] of [.22,.4,.25].entries()){session.setRadius(r);session.sample({x:-.3+i*.3,y:0,z:.9},(i+1)*50);}session.end();assert(session.preview.some(p=>Math.abs(p.radius-.2)<1e-8));reference.layers.beginStroke();let time=0;for(const p of clayReplay(session.preview)){reference.layers.applyStrokeLocal(p,p.radius,'add',.35,p.t-time,.6,true);time=p.t;}reference.layers.finishStroke();while(session.active)session.pump();assert.deepEqual(f.layers.active.volume.values,reference.layers.active.volume.values);
 }finally{f.dispose();reference.dispose();}
});

test('shared snap quantizes line azimuth/elevation, leaves freehand untouched and persists with legacy defaults',()=>{
 const f=fixture(),start={x:.1,y:.2,z:.3},end={x:.7,y:.41,z:.53};try{f.tools.adjust('global-snap',1);assert.equal(f.tools.path.snap,15);const p=snapClayPoint(start,end,15),d=new Vector3(p.x-start.x,p.y-start.y,p.z-start.z);near(d.length(),Math.hypot(end.x-start.x,end.y-start.y,end.z-start.z));for(const a of [Math.atan2(d.z,d.x),Math.atan2(d.y,Math.hypot(d.x,d.z))])near(a/(Math.PI/12),Math.round(a/(Math.PI/12)));
 const s=new ClayStrokeSession(()=>f.layers);s.begin(initial,f.tools.path,0,true);s.sample(start,16);assert.deepEqual(s.projectPoint(end),end);s.cancel();f.tools.path.straightLine=true;s.begin(initial,f.tools.path,32,true);s.sample(start,48);assert.deepEqual(s.projectPoint(end),p);s.cancel();f.layers.project.toolPreferences=f.tools.snapshotPreferences();assert.equal(openSculptProject(saveSculptProject(f.layers.project)).toolPreferences.path.snap,15);const legacy=defaultToolPreferences();delete legacy.path.snap;assert.equal(validateToolPreferences(legacy).path.snap,0);
 }finally{f.dispose();}
});

test('red mirror plane handle drags only its offset; release persists, cancellation restores and helpers never enter native data',()=>{
 const f=fixture(),plane=new XRMirrorPlane(f.tools,f.root),tool=state(),aim=z=>new Matrix4().makeTranslation(0,0,z);try{f.layers.symmetry.enabled=true;f.layers.symmetry.axis='z';const before=new Uint8Array(saveSculptProject(f.layers.project));assert(plane.update(tool,aim(2),true,true));assert(plane.group.visible);press(tool);plane.update(tool,aim(2),true,true);assert(plane.active);tool.buttons.trigger.justPressed=false;plane.update(tool,aim(2.3),true,true);near(f.layers.symmetry.offset,.3);release(tool);plane.update(tool,aim(2.3),true,true);assert(!plane.active);near(f.layers.symmetry.offset,.3);assert.equal(f.layers.undoCount,0);assert.deepEqual(new Uint8Array(saveSculptProject(f.layers.project)),before);
 press(tool);plane.update(tool,aim(2.3),true,true);plane.update(tool,aim(2.5),true,true);near(f.layers.symmetry.offset,.5);plane.cancel();near(f.layers.symmetry.offset,.3);assert(!plane.active);
 }finally{plane.dispose();f.dispose();}
});

test('Elastic captured grab changes only edge softness; CPU/GPU falloff agree and cancellation leaves exact SDF',()=>{
 const f=fixture(),move=new XRMoveTool(()=>f.layers,f.tools,f.root),tool=state(),sizing=new XRBrushSizing(f.tools),pose=new Matrix4().makeTranslation(0,0,1.5);try{f.tools.select('move');f.tools.move.mode='elastic';const before=f.layers.active.volume.values.slice();move.update(tool,pose,0,true);sizing.update(tool,[tool],0,true,false);press(tool);move.update(tool,pose,16,true);assert(move.active,move.feedback);assert.equal(move.liveSizing,'move-falloff');const captured=move.capture,radius=move.preview.field.radius;tool.buttons.trigger.justPressed=false;tool.stick.y=-1;assert(sizing.update(tool,[tool],66,true,true,false,move.liveSizing));move.update(tool,new Matrix4().makeTranslation(.03,0,1.5),66,true);assert(f.tools.move.falloff<captured.falloff);near(move.preview.field.falloff,f.tools.move.falloff);near(move.preview.uniforms.moveExponent.value,f.tools.move.falloff+1);near(move.preview.field.radius,radius);assert.equal(move.capture,captured);assert.deepEqual(f.layers.active.volume.values,before);move.cancel();assert.equal(f.layers.undoCount,0);assert.deepEqual(f.layers.active.volume.values,before);
 }finally{move.dispose();f.dispose();}
});

test('pair merge unions exactly two chosen layers regardless of their Boolean flags and preserves third/source data and history',async()=>{
 const f=fixture();try{const a=f.layers.active.layer,b=f.layers.create(64);f.layers.setActiveTransform({position:[.65,0,0],rotation:[0,.2,0],scale:[1,1,1]});f.layers.setOperation(b.id,'difference');f.layers.setFlag(b.id,'visible',false);const third=f.layers.create(64);f.layers.setActiveTransform({position:[0,2,0],rotation:[0,0,0],scale:[1,1,1]});f.layers.select(a.id);const before=f.layers.project.layerStack.layers.map(l=>({meta:l.metadata(),data:l.volume.values.slice()})),undo=f.layers.undoCount;
 f.layers.viewMode='boolean';const merged=await f.layers.bake({name:'Pair',resolution:64,hideSources:true,sourceIds:[a.id,b.id]});assert.equal(f.layers.undoCount,undo+1);assert.equal(f.layers.viewMode,'separate');assert.equal(third.visible,true);assert.equal(a.visible,false);assert.equal(b.visible,false);assert.equal(merged.operation,'union');const t=merged.transform,local=p=>({x:(p.x-t.position[0])/t.scale[0],y:(p.y-t.position[1])/t.scale[1],z:(p.z-t.position[2])/t.scale[2]});assert(merged.volume.sampleLocal(local({x:.65,y:0,z:0}))<0);assert(merged.volume.sampleLocal(local({x:0,y:2,z:0}))>0);for(let i=0;i<3;i++)assert.deepEqual(f.layers.project.layerStack.layers[i].volume.values,before[i].data);
 f.layers.undo();assert.equal(f.layers.viewMode,'boolean');for(let i=0;i<3;i++)assert.deepEqual(f.layers.project.layerStack.layers[i].metadata(),before[i].meta);f.layers.undo(true);assert.equal(f.layers.project.activeLayerId,merged.id);assert.equal(openSculptProject(saveSculptProject(f.layers.project)).layerStack.layers.length,4);
 }finally{f.dispose();}
});

test('XR merge target selection, resolution/confirmation and cancellation preserve sources and unrelated visibility',async()=>{
 const f=fixture(),m=new XRMenuModel(f.tools);try{const base=f.layers.active.layer,other=f.layers.create(64);f.layers.select(base.id);m.setRequest('layers');m.activate('merge-layers');m.activate(`merge-target:${other.id}`);m.activate('merge-resolution');assert(m.content().buttons.find(b=>b.id==='merge-resolution').label.includes('192'));m.activate('merge-resolution');m.activate('confirm-merge');assert(f.tools.busy);m.setRequest(null);await settle(()=>f.layers.bakingLayer);assert.equal(f.layers.project.layerStack.layers.length,2);assert(base.visible&&other.visible);m.setRequest('layers');m.activate('merge-layers');m.activate(`merge-target:${other.id}`);m.activate('merge-resolution');m.activate('merge-resolution');m.activate('confirm-merge');await settle(()=>f.layers.bakingLayer);assert.equal(f.layers.project.layerStack.layers.length,3);assert(!base.visible&&!other.visible);assert.match(m.feedback,/Merged/);f.layers.undo();assert(base.visible&&other.visible);
 }finally{m.setRequest(null);f.dispose();}
});

test('cooperative stamps match synchronous output, and cancelling during evaluation/history/writes restores exact redo',()=>{
 for(const phase of ['evaluation','writes','meshing']){const f=fixture(),reference=fixture();try{f.tools.select('stamp');const definition={...f.tools.port.shape.definition,kind:'box',operation:'add',dimensions:[.35,.4,.3],transform:{position:[.65,.1,.1],rotation:[.2,.3,.1],scale:[1,1,1]}};
 // Seed a redo action before the unfinished stamp, and prove it survives cancellation.
 f.layers.beginStroke();f.layers.applyStrokeLocal({x:0,y:0,z:.85},.22,'subtract',.5,.016,.6);f.layers.finishStroke();f.layers.undo();const before=f.layers.active.volume.values.slice(),redo=f.layers.redoCount;
 f.layers.beginStroke();const revision=f.layers.active.surface.revision;const work=f.layers.stampShapeSteps(definition,true);let step=work.next(),guard=0,changed=false;
 while(!step.done&&phase!=='evaluation'){changed=f.layers.active.volume.values.some((v,i)=>v!==before[i]);if(phase==='writes'&&changed)break;if(phase==='meshing'&&f.layers.active.surface.revision>revision&&changed)break;assert(++guard<10000);step=work.next();}
 assert(!step.done,`interrupted ${phase}`);work.return(false);f.layers.cancelStroke();assert.deepEqual(f.layers.active.volume.values,before);assert.equal(f.layers.redoCount,redo);
 reference.layers.stampShape({...definition,targetLayerId:reference.layers.project.activeLayerId});f.layers.beginStroke();for(const _ of f.layers.stampShapeSteps(definition,true)){void _;}f.layers.finishStroke();assert.deepEqual(f.layers.active.volume.values,reference.layers.active.volume.values);const after=f.layers.active.volume.values.slice();f.layers.undo();assert.deepEqual(f.layers.active.volume.values,before);f.layers.undo(true);assert.deepEqual(f.layers.active.volume.values,after);
 }finally{f.dispose();reference.dispose();}}
});


test('pending Stamp previews are bounded, display-only, and hide on cancellation with source/redo retained',()=>{
 const f=fixture(),stamp=new XRShapeStamp(()=>f.layers,f.tools,f.root),tool=state(),pose=x=>new Matrix4().makeTranslation(x,0,.12);try{f.tools.select('stamp');f.tools.stampAttachment.mode='continuous';f.tools.stampAttachment.spacing=.05;f.layers.symmetry.enabled=true;
 const before=f.layers.active.volume.values.slice();stamp.update(tool,pose(0),0,true);press(tool);stamp.update(tool,pose(0),16,true);assert(stamp.pendingPreview.visible);assert.deepEqual(f.layers.active.volume.values,before,'initial preview does not touch source');tool.buttons.trigger.justPressed=false;stamp.update(tool,pose(.8),32,true);assert(stamp.pendingPreview.children.length<=32);assert(!f.layers.group.children.includes(stamp.pendingPreview));stamp.cancel();assert(!stamp.pendingPreview.visible);assert.deepEqual(f.layers.active.volume.values,before);assert.equal(f.layers.undoCount,0);
 }finally{stamp.dispose();f.dispose();}
});
test('invalid pair selection rejects before any source visibility, history or voxel mutation',async()=>{
 const f=fixture();try{const id=f.layers.project.activeLayerId,before=new Uint8Array(saveSculptProject(f.layers.project));for(const sourceIds of [[id,id],[id,'missing'],[id],[]])await assert.rejects(f.layers.bake({name:'Invalid',resolution:64,hideSources:true,sourceIds}));assert.deepEqual(new Uint8Array(saveSculptProject(f.layers.project)),before);assert.equal(f.layers.undoCount,0);assert(!f.layers.bakingLayer);}finally{f.dispose();}
});

 test('mirror centre is grabbable edge-on on the default X plane without capturing the interior',()=>{
 const f=fixture(),plane=new XRMirrorPlane(f.tools,f.root),tool=state();try{
 f.layers.symmetry.enabled=true;f.layers.symmetry.axis='x';
 const aim=new Matrix4().makeTranslation(0,0,2);
 assert(plane.update(tool,aim,true,true));press(tool);plane.update(tool,aim,true,true);assert(plane.active);
 tool.buttons.trigger.justPressed=false;plane.update(tool,new Matrix4().makeTranslation(.25,0,2),true,true);near(f.layers.symmetry.offset,.25);
 release(tool);plane.update(tool,new Matrix4().makeTranslation(.25,0,2),true,true);assert(!plane.active);
 plane.cancel();f.layers.symmetry.axis='z';f.layers.symmetry.offset=0;
 assert.equal(plane.update(tool,new Matrix4().makeTranslation(.25,.25,2),true,true),false);
 }finally{plane.dispose();f.dispose();}
 });

test('alternate Subtract colours the Clay and mirrored previews identically to manual Subtract and restores Add',()=>{
 const f=fixture(),a=new XRAlternateTool(f.tools),stroke=new XRClayStroke(()=>f.layers,f.tools,f.root),tool=state(),support=state('support'),pose=new Matrix4().makeTranslation(0,0,.2);
 try{
 f.layers.symmetry.enabled=true;f.tools.path.straightLine=true;
 stroke.update(tool,pose,0,true);const add=stroke.cursor.mesh.material.color.getHex();
 a.update(support,tool,true,false);press(support);a.update(support,tool,true,false);stroke.update(tool,pose,16,true);
 const subtract=stroke.cursor.mesh.material.color.getHex();assert.equal(subtract,0xa04b36);assert.notEqual(subtract,add);assert.equal(stroke.mirrorCursor.mesh.material.color.getHex(),subtract);
 press(tool);stroke.update(tool,pose,32,true);assert.equal(stroke.preview.children[0].material.color.getHex(),subtract);stroke.cancel();release(tool);
 release(support);a.update(support,tool,true,false);stroke.update(tool,pose,48,true);assert.equal(stroke.cursor.mesh.material.color.getHex(),add);
 f.tools.port.setSettings({...initial,mode:'subtract'});stroke.update(tool,pose,64,true);assert.equal(stroke.cursor.mesh.material.color.getHex(),subtract);
 }finally{stroke.dispose();a.cancel();f.dispose();}
});

test('alternate choices omit redundant Clay and migrate saved Clay to opposite',()=>{
 const f=fixture();try{assert.equal(f.tools.alternateTool,'opposite');for(const expected of ['smooth','off','opposite']){f.tools.adjust('alternate-tool',1);assert.equal(f.tools.alternateTool,expected);}const legacy=defaultToolPreferences();legacy.alternateTool='clay';f.tools.restorePreferences(legacy);assert.equal(f.tools.alternateTool,'opposite');assert.equal(f.tools.snapshotPreferences().alternateTool,'opposite');}finally{f.dispose();}
});

for(const buffered of [false,true])test(`staged Clay drains at most two chunks per pump with identical final voxels/mesh and one undo (buffered=${buffered})`,()=>{
 const f=fixture(64),r=fixture(64),a=new ClayStrokeSession(()=>f.layers,()=>{},true),b=new ClayStrokeSession(()=>r.layers),controls=new ClayPathControls();controls.straightLine=buffered;
 try{const before=f.layers.active.volume.values.slice();for(const session of [a,b]){session.begin(initial,controls,0,true);for(let i=0;i<15;i++)session.sample({x:.65,y:-.3+i*.04,z:0},16+i*16);session.end();}
 assert(a.active);assert(f.layers.drawing);assert.equal(f.layers.undoCount,0);
 for(let i=0;a.active&&i<4096;i++){const runtime=f.layers.active,old=runtime.rebuild.bind(runtime);runtime.rebuild=(chunks=Infinity,ms=Infinity)=>{const pending=runtime.mesher.pendingChunks,result=old(chunks,ms);assert(pending-runtime.mesher.pendingChunks<=2,'two chunk maximum including final commit');return result;};a.pump();runtime.rebuild=old;}
 for(let i=0;b.active&&i<4096;i++)b.pump();assert(!a.active);assert(!b.active);assert.equal(f.layers.active.mesher.pendingChunks,0);assert.equal(f.layers.undoCount,1);assert.deepEqual(f.layers.active.volume.values,r.layers.active.volume.values);
 const mesh=l=>l.active.mesher.snapshotUpdates().map(u=>[u.id,Array.from(u.geometry.getAttribute('position').array),Array.from(u.geometry.getAttribute('normal').array)]);assert.deepEqual(mesh(f.layers),mesh(r.layers));const after=f.layers.active.volume.values.slice();f.layers.undo();assert.deepEqual(f.layers.active.volume.values,before);f.layers.undo(true);assert.deepEqual(f.layers.active.volume.values,after);
 }finally{a.cancel();b.cancel();f.dispose();r.dispose();}
});
test('cancelling Clay after release during mesh drain restores source and existing redo',()=>{
 const f=fixture(64),s=new ClayStrokeSession(()=>f.layers,()=>{},true),controls=new ClayPathControls();try{
 f.layers.setActiveTransform({position:[.1,0,0],rotation:[0,0,0],scale:[1,1,1]});f.layers.undo();const before=f.layers.active.volume.values.slice();
 s.begin(initial,controls,0,true);s.sample({x:.65,y:0,z:0},16);s.end();s.pump();assert(s.active);s.cancel();assert(!s.active);assert.equal(f.layers.active.mesher.pendingChunks,0);assert.equal(f.layers.undoCount,0);assert.equal(f.layers.redoCount,1);assert.deepEqual(f.layers.active.volume.values,before);
 }finally{s.cancel();f.dispose();}
});

test('XR Clay accounts for remesh CPU pauses without accepting unexplained tracking gaps',()=>{
 const f=fixture(64),stroke=new XRClayStroke(()=>f.layers,f.tools,f.root),tool=state(),pose=new Matrix4().makeTranslation(.65,0,.12),original=globalThis.performance;let cpu=0;
 const runtime=f.layers.active,rebuild=runtime.rebuild.bind(runtime);try{
 globalThis.performance={now:()=>cpu};runtime.rebuild=(...args)=>{const result=rebuild(...args);cpu+=220;return result;};
 stroke.update(tool,pose,0,true);press(tool);stroke.update(tool,pose,16,true);assert(stroke.active);
 tool.buttons.trigger.justPressed=false;stroke.update(tool,pose,256,true);assert(stroke.active,'own 220 ms remesh pause is not tracking loss');assert.equal(stroke.session.raw.length,2);
 stroke.update(tool,pose,1256,true);assert(!stroke.active,'unexplained one-second gap still cancels');assert.match(stroke.feedback,/tracking\/sample/);assert.equal(f.layers.undoCount,0);
 }finally{globalThis.performance=original;runtime.rebuild=rebuild;stroke.dispose();f.dispose();}
});
