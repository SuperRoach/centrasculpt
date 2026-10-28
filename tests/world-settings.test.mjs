import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene,PerspectiveCamera,Color,Matrix4,Vector3,Quaternion,Raycaster} from 'three';
import {STUDIO_BACKGROUNDS,defaultWorldSettings,validateWorldSettings} from '../work/test-build/world-settings.mjs';
import {XRSceneRig} from '../work/test-build/xr-scene.mjs';
import {XRSessionController} from '../work/test-build/xr-session.mjs';
import {XRMenuModel,MENU_SIZE} from '../work/test-build/xr-menu-model.mjs';
import {XRMenuView} from '../work/test-build/xr-menu-view.mjs';
import {VR_UI_SCALES} from '../work/test-build/xr-ui-style.mjs';
import {canvasContext} from '../scripts/fixtures/canvas-context.mjs';
import {EditorToolState,EDITOR_TOOLS} from '../work/test-build/editor-tool-state.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {ShapePreviewModel} from '../work/test-build/shape-preview.mjs';
import {LayerDisplayPreferences,validateProjectDisplay} from '../work/test-build/display-preferences.mjs';
import {saveSculptProject,openSculptProject} from '../work/test-build/project.mjs';
import {encodeRecovery} from '../work/test-build/recovery-client.mjs';
import {RecoveryBrowserWorker} from '../scripts/fixtures/node-recovery-worker.mjs';
import {encodeExport} from '../work/test-build/glb-export.mjs';
import {installFileReader,readGlb} from '../scripts/fixtures/export-node.mjs';
const settings={mode:'add',radius:.22,strength:.35,hardness:0,camera:{position:[2,2,3],target:[0,0,0]}};
function fixture(port){const layers=new IndependentLayers(createBaseProject(new SDFVolume(17),settings)),shape=new ShapePreviewModel(layers.project.activeLayerId);let state={...settings},mode='sculpt',busy=false;const tools=new EditorToolState({layers:()=>layers,shape,settings:()=>state,setSettings:v=>state=v,mode:()=>mode,selectTool:t=>{mode=t==='transform'?'translate':'sculpt';},selectTransform:m=>mode=m,busy:()=>busy,changed(){}}),model=new XRMenuModel(tools,port);model.setRequest('tool-wheel');model.activate('world');return {layers,tools,model,setBusy:v=>busy=v,dispose:()=>layers.dispose()};}
const centre=b=>[b.rect.x+b.rect.width/2,b.rect.y+b.rect.height/2];
function canvas(){const previous=globalThis.document;globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>canvasContext()})};return ()=>globalThis.document=previous;}
class Session extends EventTarget{environmentBlendMode='alpha-blend';async end(){this.dispatchEvent(new Event('end'));}}
function sessionHarness(ar=true){let requests=[];const scene=new Scene(),rig=new XRSceneRig(scene,new PerspectiveCamera()),controller=new XRSessionController({async setSession(){}},{prepare:()=>rig.enter([],controller.activeEnvironment),restore:()=>rig.exit(),changed(){}});return {scene,rig,controller,requests,xr:{async isSessionSupported(mode){return mode==='immersive-vr'||ar;},requestSession(mode){requests.push(mode);return Promise.resolve(new Session());}}};}

test('six exact presets, neutral defaults and strict versioned display extension',()=>{
 assert.deepEqual(STUDIO_BACKGROUNDS.map(p=>p.colour),['#808080','#292D35','#536D8C','#B7A08A','#101114','#87998A']);
 const d=new LayerDisplayPreferences();assert.deepEqual(d.world,defaultWorldSettings());assert(!('world' in d.snapshot('p',[])));
 for(const world of [null,[],{}, {...defaultWorldSettings(),version:2},{...defaultWorldSettings(),studioBackground:'custom'},{...defaultWorldSettings(),groundGrid:1}])assert.throws(()=>validateWorldSettings(world));
 assert.throws(()=>validateProjectDisplay({mode:'clay',colours:{},world:{version:2}},[]));
});
test('legacy projects restore Neutral Grey and hidden grid after another project had custom preferences',()=>{
 const f=fixture();try{const legacy=openSculptProject(saveSculptProject(f.layers.project));const d=new LayerDisplayPreferences();d.world={version:1,studioBackground:'black',groundGrid:true};d.restore(legacy.id,legacy.layerStack.layers,legacy.displayPreferences);assert.deepEqual(d.world,defaultWorldSettings());}finally{f.dispose();}
});
test('every swatch and grid survive native and actual recovery encoding with no sculpt/history mutation',async()=>{
 const f=fixture(),oldWorker=globalThis.Worker;globalThis.Worker=RecoveryBrowserWorker;try{const values=f.layers.active.volume.values.slice(),source=saveSculptProject(f.layers.project),mesher=f.layers.active.mesher,transform=structuredClone(f.layers.active.layer.transform);f.model.activate('world:background');
 for(const p of STUDIO_BACKGROUNDS){f.model.activate(`background:${p.id}`);if(!f.layers.display.world.groundGrid)f.model.activate('ground-grid');const display=f.layers.display.snapshot(f.layers.project.id,f.layers.project.layerStack.layers),saved=saveSculptProject(f.layers.project,display),opened=openSculptProject(saved),restored=new LayerDisplayPreferences();restored.restore(opened.id,opened.layerStack.layers,opened.displayPreferences);assert.deepEqual(restored.world,f.layers.display.world);const recovery=await encodeRecovery(f.layers,settings,display,undefined,new AbortController().signal,()=>true);assert.deepEqual(recovery.data,saved);assert(!('environment' in display.world));}
 assert.deepEqual(saveSculptProject(f.layers.project),source);assert.deepEqual(f.layers.active.volume.values,values);assert.deepEqual(f.layers.active.layer.transform,transform);assert.equal(f.layers.active.mesher,mesher);assert.equal(f.layers.undoCount,0);assert.equal(f.layers.redoCount,0);
 }finally{globalThis.Worker=oldWorker;f.dispose();}
});
test('Studio updates immediately, passthrough always stays transparent and desktop background restores exactly',()=>{
 const scene=new Scene(),desktop=new Color('#abcdef');scene.background=desktop;const rig=new XRSceneRig(scene,new PerspectiveCamera());try{rig.enter();for(const p of STUDIO_BACKGROUNDS){rig.applyWorldSettings({version:1,studioBackground:p.id,groundGrid:true});assert.equal(scene.background.getHexString(),p.colour.slice(1).toLowerCase());assert(rig.groundGrid.visible);}rig.exit();assert.equal(scene.background,desktop);assert(!rig.groundGrid.visible);rig.enter([],'passthrough');for(const p of STUDIO_BACKGROUNDS){rig.applyWorldSettings({version:1,studioBackground:p.id,groundGrid:true});assert.equal(scene.background,null);assert(!rig.groundGrid.visible);}rig.exit();rig.enter();assert.equal(scene.background.getHexString(),'87998a');}finally{rig.exit();rig.dispose();}
});
test('grid belongs to workspace, follows navigation, ignores rays and never affects framing or export sources',()=>{
 const f=fixture(),scene=new Scene(),rig=new XRSceneRig(scene,new PerspectiveCamera());try{rig.sculptureRoot.add(f.layers.group);const bounds=rig.visibleBounds().clone(),sources=f.layers.exportSources();rig.applyWorldSettings({...defaultWorldSettings(),groundGrid:true});rig.enter();rig.placeFirstView({x:0,y:1.6,z:0},{x:0,y:0,z:0,w:1});assert.equal(rig.groundGrid.parent,rig.workspaceRoot);assert(!rig.sculptureRoot.children.includes(rig.groundGrid));assert(rig.visibleBounds().min.distanceTo(bounds.min)<1e-12);assert(rig.visibleBounds().max.distanceTo(bounds.max)<1e-12);assert(sources.every(source=>source.current()));assert.deepEqual(f.layers.exportSources().map(({current,...source})=>source),sources.map(({current,...source})=>source));const before=rig.groundGrid.getWorldPosition(new Vector3());rig.workspaceRoot.position.x+=1;rig.workspaceRoot.updateMatrixWorld(true);assert(Math.abs(rig.groundGrid.getWorldPosition(new Vector3()).x-before.x-1)<1e-8);assert.deepEqual(new Raycaster().intersectObject(rig.groundGrid),[]);assert(rig.groundGrid.material.transparent);assert.equal(rig.groundGrid.material.depthWrite,false);rig.applyWorldSettings(defaultWorldSettings());assert(!rig.groundGrid.visible);}finally{rig.exit();rig.dispose();f.dispose();}
});
test('GLB geometry and mesh inventory stay identical after world changes and visible guide',async()=>{
 installFileReader();const f=fixture(),rig=new XRSceneRig(new Scene(),new PerspectiveCamera());try{rig.sculptureRoot.add(f.layers.group);const before=await encodeExport(f.layers.exportSources(),'fast',256*1024**2);rig.applyWorldSettings({version:1,studioBackground:'warm-studio',groundGrid:true});rig.enter();f.model.activate('world:background');f.model.activate('background:black');f.model.activate('ground-grid');const after=await encodeExport(f.layers.exportSources(),'fast',256*1024**2);assert.deepEqual(after.data,before.data);const loaded=await readGlb(after.data);loaded.scene.traverse(o=>{assert(!o.isLineSegments);assert(!o.name.includes('ground'));if(o.isMesh)o.geometry.dispose();});}finally{rig.exit();rig.dispose();f.dispose();}
});
test('world sections and all hit targets have bounded, disjoint large controls for every active tool',()=>{
 const f=fixture();try{for(const tool of EDITOR_TOOLS){f.tools.select(tool.id);for(const section of ['home','environment','background','guides','preferences']){f.model.page='world';f.model.world.section=section;const content=f.model.content(),rects=content.buttons.filter(b=>b.rect);for(const b of rects){const r=b.rect;assert(r.width>=140&&r.height>=74);assert(r.x>=0&&r.y>=0&&r.x+r.width<=MENU_SIZE&&r.y+r.height<1040);assert.equal(f.model.hit(...centre(b)),b.id);for(const other of rects){if(b===other)continue;const s=other.rect;assert(r.x+r.width<=s.x||s.x+s.width<=r.x||r.y+r.height<=s.y||s.y+s.height<=r.y,`${b.id}/${other.id}`);}}assert.equal(content.buttons.filter(b=>b.swatch).length,section==='background'?6:0);}}}finally{f.dispose();}
});
test('world uses shared scaled ray placement, neutral-trigger arming and closes with existing menu request',()=>{
 const restore=canvas(),f=fixture(),view=new XRMenuView(f.model);try{view.place({x:0,y:1.6,z:0},{x:0,y:0,z:0,w:1});const tool={connectionId:4,role:'tool',connected:true,tracked:true,gripTracked:true,buttons:{trigger:{pressed:true,rawValue:1,justPressed:true}}};for(const [size,factor] of Object.entries(VR_UI_SCALES)){f.layers.display.vrUiScale=size;view.close();view.update('tool-wheel',tool,undefined,0,true);f.model.activate('world');f.model.activate('world:background');view.update('tool-wheel',tool,undefined,200,true);const b=f.model.content().buttons.find(b=>b.id==='background:soft-blue'),[x,y]=centre(b);view.mesh.updateMatrixWorld(true);const q=view.mesh.getWorldQuaternion(new Quaternion()),p=new Vector3((x/MENU_SIZE-.5)*.72,(.5-y/MENU_SIZE)*.72,0).applyMatrix4(view.mesh.matrixWorld).addScaledVector(new Vector3(0,0,1).applyQuaternion(q),.7),pose=new Matrix4().compose(p,q,new Vector3(1,1,1));f.layers.display.world.studioBackground='neutral-grey';view.update('tool-wheel',tool,pose,400,true);assert.equal(f.layers.display.world.studioBackground,'neutral-grey');tool.buttons.trigger={pressed:false,rawValue:0,justPressed:false};view.update('tool-wheel',tool,pose,416,true);assert.equal(f.model.hover,b.id);assert(view.cursor.visible);tool.buttons.trigger={pressed:true,rawValue:1,justPressed:true};view.update('tool-wheel',tool,pose,432,true);assert.equal(f.layers.display.world.studioBackground,'soft-blue');assert.equal(view.mesh.scale.x,factor);assert(Math.abs(view.mesh.position.z+1.05)<1e-8);}view.update(null,tool,undefined,500,true);assert(!view.active);assert(!view.mesh.visible);assert.equal(f.layers.undoCount,0);}finally{view.dispose();f.dispose();restore();}
});
test('mirror and snap share existing state across tools; busy controls reject changes',()=>{
 const f=fixture();try{f.model.activate('world:guides');f.model.activate('world-mirror');assert(f.layers.symmetry.enabled);f.model.activate('world-axis');assert.equal(f.layers.symmetry.axis,'y');f.model.activate('world-offset-plus');assert.equal(f.layers.symmetry.offset,.05);f.model.activate('snap-toggle');assert.equal(f.tools.path.snap,15);const before=structuredClone(f.layers.symmetry);f.setBusy(true);for(const id of ['world-mirror','world-axis','world-offset-minus','snap-toggle'])f.model.activate(id);assert.deepEqual(f.layers.symmetry,before);assert.equal(f.tools.path.snap,15);assert.equal(f.layers.undoCount,0);}finally{f.dispose();}
});
test('environment menu uses existing exit path and requires fresh Enter; selected background survives AR round trip',async()=>{
 const h=sessionHarness(),f=fixture({session:()=>h.controller,diagnostics:()=>true,toggleDiagnostics(){},performance:()=>false,togglePerformance(){}});try{await h.controller.check(true,h.xr);h.rig.applyWorldSettings({version:1,studioBackground:'soft-blue',groundGrid:true});await h.controller.enter();f.model.activate('world:environment');assert(f.model.content().buttons.find(b=>b.id==='environment:studio').selected);f.model.activate('environment:passthrough');await new Promise(resolve=>setImmediate(resolve));assert.equal(h.controller.state,'ready');assert.deepEqual(h.requests,['immersive-vr']);await h.controller.enter();assert.equal(h.scene.background,null);h.rig.applyWorldSettings({version:1,studioBackground:'soft-blue',groundGrid:true});assert.equal(h.scene.background,null);await h.controller.select('studio');assert.deepEqual(h.requests,['immersive-vr','immersive-ar']);await h.controller.enter();assert.equal(h.scene.background.getHexString(),'536d8c');assert(h.rig.groundGrid.visible);}finally{await h.controller.dispose();h.rig.dispose();f.dispose();}
});
test('unsupported passthrough is disabled with reason and cannot exit Studio or request AR',async()=>{
 const h=sessionHarness(false),f=fixture({session:()=>h.controller,diagnostics:()=>false,toggleDiagnostics(){},performance:()=>false,togglePerformance(){}});try{await h.controller.check(true,h.xr);await h.controller.enter();f.model.activate('world:environment');const b=f.model.content().buttons.find(b=>b.id==='environment:passthrough');assert(b.disabled);assert(b.detail.includes('unavailable'));f.model.activate(b.id);assert.equal(h.controller.state,'presenting');assert.deepEqual(h.requests,['immersive-vr']);}finally{await h.controller.dispose();h.rig.dispose();f.dispose();}
});
test('preferences wire existing diagnostics, performance and UI scale without history',()=>{
 let diagnostics=true,performance=false;const h=sessionHarness(),f=fixture({session:()=>h.controller,diagnostics:()=>diagnostics,toggleDiagnostics:()=>diagnostics=!diagnostics,performance:()=>performance,togglePerformance:()=>performance=!performance});try{f.model.activate('world:preferences');f.model.activate('world-diagnostics');f.model.activate('world-performance');f.model.activate('world-ui-scale');assert(!diagnostics);assert(performance);assert.equal(f.layers.display.vrUiScale,'large');assert.equal(f.layers.undoCount,0);f.model.activate('tools');assert.equal(f.model.page,'tool-wheel');}finally{f.dispose();h.rig.dispose();}
});

test('Default is midway between former Normal and Large; retired Small files migrate and never re-save Small',()=>{
 assert.deepEqual(VR_UI_SCALES,{normal:1.25,large:1.35});
 const f=fixture();try{for(const size of ['small','normal','large']){
  const legacy=saveSculptProject(f.layers.project,{mode:'clay',colours:{},vrUiScale:size==='small'?'large':size});
  if(size==='small'){const bytes=new Uint8Array(legacy),needle=new TextEncoder().encode('\"vrUiScale\":\"large\"'),offset=Buffer.from(bytes).indexOf(needle);assert(offset>=0);bytes.set(new TextEncoder().encode('\"vrUiScale\":\"small\"'),offset);}
  const opened=openSculptProject(legacy),restored=new LayerDisplayPreferences();
  restored.restore(opened.id,opened.layerStack.layers,opened.displayPreferences);
  assert.equal(restored.vrUiScale,size==='large'?'large':'normal');
  const saved=restored.snapshot(opened.id,opened.layerStack.layers);assert.equal(saved.vrUiScale,size==='large'?'large':undefined);
 }}finally{f.dispose();}
});
test('World Large UI toggle is selected only when on, toggles back to Default, and respects busy guards',()=>{
 const f=fixture();try{f.model.activate('world:preferences');
 const button=()=>f.model.content().buttons.find(b=>b.id==='world-ui-scale');
 assert.equal(button().label,'Large UI · Off');assert(!button().selected);
 f.model.activate('world-ui-scale');assert.equal(button().label,'Large UI · On');assert(button().selected);assert.equal(f.layers.display.vrUiScale,'large');
 f.setBusy(true);f.model.activate('world-ui-scale');assert.equal(f.layers.display.vrUiScale,'large');f.setBusy(false);
 f.model.activate('world-ui-scale');assert.equal(f.layers.display.vrUiScale,'normal');assert(!button().selected);assert.equal(f.layers.undoCount,0);
 }finally{f.dispose();}
});
