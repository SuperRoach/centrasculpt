import {volumeLabel} from './volume-store';
import {EditorToolState} from './editor-tool-state';
import {countVisibleMeshes} from './xr-performance';
import {XRExperience} from './xr-experience';
import {XRSceneRig} from './xr-scene';
import {RENDER_STYLES,validateRenderStyle,type RenderStyle} from './render-style';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {ShapeRotationTool} from './shape-rotation';
import {createViewportTools,type WorkspaceTool} from './viewport-tools';
import {placeShapeOnSurface,StampClickGesture} from './shape-placement';
import type {ShapeDefinition} from './shapes';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import type { LayerOperation } from './layers';
import { createBaseProject } from './layers';
import { SDFVolume } from './sdf';
import { createUI } from './ui';
import type { BakePlan } from './bake';
import { DEFAULT_RESOLUTION } from './resolution';
import { saveSculptProject, openSculptProject, MAX_PROJECT_BYTES } from './project';
import { IndependentLayers } from './independent-layers';
import { InputOwnership } from './interaction';
import type { EditorMode } from './interaction';
import { LayerTransformTools } from './transform-tools';
import { copyTransform, identityTransform, hasUniformScale } from './transform';
import { ShapeGhost } from './shape-preview';
import { createShapeLibraryUI } from './shape-ui';
import { LayerDisplayPreferences } from './display-preferences';

let renderEmulatorFrame:((time:number)=>void)|null=null;
if(import.meta.env.DEV&&window.isSecureContext&&new URLSearchParams(location.search).get('xrEmulate')==='quest3'){
 try{const {installQuestEmulator}=await import('./xr-emulator');renderEmulatorFrame=await installQuestEmulator();}catch(error){console.error('Quest emulator setup failed; desktop editor retained.',error);}
}
const ui=createUI(),display=new LayerDisplayPreferences();
let layers=new IndependentLayers(createBaseProject(new SDFVolume(DEFAULT_RESOLUTION),{mode:'add',radius:0.22,strength:0.35,hardness:0,camera:{position:[2.4,1.7,3.3],target:[0,0,0]}}),display);
let loadingProject=false;
let xrExperience:XRExperience|undefined;
const xrBlocked=()=>xrExperience?.blocking??false;
const input=new InputOwnership();
const stampClick=new StampClickGesture();
let transformTools:LayerTransformTools|undefined;
let ghostRotation:ShapeRotationTool|undefined;
let viewportTools:ReturnType<typeof createViewportTools>|undefined;
const scene=new THREE.Scene();scene.background=new THREE.Color('#e9e9e3');scene.add(layers.group,layers.composite.group);
const shapeGhost=new ShapeGhost(()=>layers.project.layerStack);scene.add(shapeGhost.group);
const shapeLibraryUI=createShapeLibraryUI(document.getElementById('shape-library-slot')!,shapeGhost,()=>layers.project.layerStack,()=>loadingProject||ui.modalOpen||xrBlocked(),stop,()=>{transformTools?.sync();cursor.visible=false;ui.status(shapeGhost.model.moveMode?'Move preview · drag arrows or planes · Apply stamp when ready':shapeGhost.model.rotationMode?'Rotate stamp · drag a ring · T to finish':shapeGhost.model.enabled?(shapeGhost.model.followPointer?'Shape Stamp — place on a visible surface':'Preview held · G to move · T to rotate · Apply to stamp'):'Ghost hidden — sculpting available');},()=>applyShapeStamp(),()=>toggleGhostRotation(),()=>toggleGhostRotation('translate'));
let booleanPreview=false,lastCompositePoll=0;
function syncView(){booleanPreview=layers.viewMode==='boolean';ui.surfaceView(layers.viewMode);if(!booleanPreview)ui.compositeInfo('Separate Layers · source volumes unchanged.');layers.group.visible=!booleanPreview;layers.composite.group.visible=booleanPreview&&!layers.composite.failed;}
syncView();
const camera=new THREE.PerspectiveCamera(38,1,0.01,100);camera.position.set(2.4,1.7,3.3);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;ui.viewport.append(renderer.domElement);renderer.domElement.tabIndex=0;
function createCameraControls() {
  const orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.minDistance=1.2;orbit.maxDistance=9;
  orbit.mouseButtons={LEFT:null as unknown as THREE.MOUSE,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE};return orbit;
}
let controls=createCameraControls();
scene.add(new THREE.HemisphereLight(0xffffff,0x687267,2.7));
const light=new THREE.DirectionalLight(0xfff4df,3.4);light.position.set(-3,5,4);scene.add(light);
const fill=new THREE.DirectionalLight(0xd6eaff,1.4);fill.position.set(4,1,-2);scene.add(fill);
const grid=new THREE.GridHelper(8,40,0xc9cdc2,0xdaddd3);grid.position.y=-1.12;scene.add(grid);
const cursor=new THREE.Mesh(new THREE.RingGeometry(0.97,1,64),new THREE.MeshBasicMaterial({color:0x435d2c,side:THREE.DoubleSide,depthTest:false,transparent:true,opacity:0.85}));cursor.renderOrder=10;cursor.visible=false;scene.add(cursor);
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),normal=new THREE.Vector3(),normalMatrix=new THREE.Matrix3();
let pointerInside=false,activePointer:number|null=null,lastRebuild=performance.now();
const message=(error:unknown)=>error instanceof Error?error.message:'Unknown error.';
function syncStats() {
  const runtime=layers.active;
  const triangles=layers.project.layerStack.layers.reduce((sum,layer)=>sum+(layer.visible?layers.runtime(layer.id).triangles:0),0);
  if(booleanPreview){
    const s=layers.composite.stats;ui.meshInfo(s?.triangles??0,s?.resolution??0,true);
    ui.performance(s?`COMPOSITE SAMPLE ${s.samplingMs.toFixed(1)} ms · MESH ${s.meshingMs.toFixed(1)} ms · ${s.chunks}/${s.totalChunks} CHUNKS`:'COMPOSITE PENDING');
  }else{
    ui.meshInfo(triangles,volumeLabel(runtime.layer.volume));
    ui.performance(`BRUSH ${runtime.brushMs.toFixed(1)} ms (AVG ${(runtime.brushTotal/Math.max(1,runtime.brushFrames)).toFixed(1)}) · MESH ${runtime.lastMeshMs.toFixed(1)} ms · ${runtime.lastChanged}/${runtime.totalChunks} CHUNKS`);
  }
  ui.history(layers.undoCount,layers.redoCount,loadingProject||xrBlocked());
}
function syncTransformUI(){syncViewportTools();ui.transformState(layers.active.layer.transform,layers.active.layer.editable,input.mode,input.space,loadingProject||xrBlocked());syncStats();}
function refresh() {
  syncView();
  ui.layerRows(layers.project.layerStack.layers,layers.project.activeLayerId,layer=>display.colour(layers.project.id,layer.id,layer.order));
  ui.resolution(layers.active.layer.volume.resolution);syncRenderStyle();ui.viewportMode(display.mode);syncTransformUI();transformTools?.sync();
}
function stopSculpt() {
  const captured=activePointer;activePointer=null;input.end('sculpt');controls.enabled=input.cameraEnabled;layers.finishStroke();syncStats();lastRebuild=performance.now();
  if(captured!==null&&renderer.domElement.hasPointerCapture(captured))renderer.domElement.releasePointerCapture(captured);
}
function stop(){stampClick.cancel();ghostRotation?.finish();transformTools?.finish();stopSculpt();}
function updatePointer(e:PointerEvent) {const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);pointerInside=true;}
transformTools=new LayerTransformTools(camera,renderer.domElement,scene,()=>layers,input,{
  beforeDrag:stopSculpt,camera:enabled=>{controls.enabled=enabled;},changed:syncTransformUI,error:text=>ui.projectMessage(text,true),busy:()=>loadingProject||ui.modalOpen||xrBlocked()||shapeGhost.model.enabled,
});
ghostRotation=new ShapeRotationTool(camera,renderer.domElement,scene,shapeGhost.model,()=>layers.project.layerStack,input,{
 beforeDrag:()=>{stampClick.cancel();transformTools?.finish();stopSculpt();},camera:enabled=>{controls.enabled=enabled;},changed:()=>{shapeGhost.sync();shapeLibraryUI.refresh();},error:text=>ui.projectMessage(text,true),busy:()=>loadingProject||ui.modalOpen||xrBlocked(),
});
function toggleGhostRotation(mode:'rotate'|'translate'='rotate'):void {
 if(loadingProject||ui.modalOpen||xrBlocked())return;stop();
 try{ghostRotation!.toggle(mode);ui.status(shapeGhost.model.moveMode?'Move preview · drag arrows or planes · Apply stamp when ready':shapeGhost.model.rotationMode?'Rotate stamp · drag a ring · T to finish':'Preview held · G to move · T to rotate · Apply stamp');shapeLibraryUI.refresh();}
 catch(error){ui.status(message(error));}
}
function applyShapeStamp(definition?:ShapeDefinition):void {
  if(loadingProject||ui.modalOpen||xrBlocked()||!shapeGhost.model.canApply(layers.project.layerStack,loadingProject||ui.modalOpen||xrBlocked())||!input.cameraEnabled)return;
  stop();try {
    const changed=layers.stampShape(definition??shapeGhost.model.futureStampIntent(layers.project.layerStack).definition),s=layers.lastStampStats!;
    ui.projectMessage(`Stamp ${changed?'applied':'unchanged'} · ${s.changedVoxels.toLocaleString()} voxels · evaluate ${s.evaluationMs.toFixed(1)} ms · mesh ${s.meshingMs.toFixed(1)} ms · total ${s.totalMs.toFixed(1)} ms · ${s.chunks}/${s.totalChunks} chunks`);
    ui.status(changed?'Shape stamped · one undo action':'No voxel changes · history kept');refresh();
  }catch(error){ui.projectMessage(`Stamp failed: ${message(error)}`,true);}
}
function placePointerShape():boolean {
  if(!shapeGhost.model.enabled||shapeGhost.model.manipulating||loadingProject||ui.modalOpen||xrBlocked()||!input.cameraEnabled||shapeGhost.model.availability(layers.project.layerStack))return false;
  if(!shapeGhost.model.followPointer)return true;
  raycaster.setFromCamera(pointer,camera);
  const meshes:THREE.Object3D[]=[];(booleanPreview?layers.composite.group:layers.group).traverseVisible(object=>{if(object instanceof THREE.Mesh)meshes.push(object);});
  const hit=raycaster.intersectObjects(meshes,false)[0];if(!hit)return false;
  placeShapeOnSurface(shapeGhost.model,layers.project.layerStack,hit.point);shapeGhost.sync();shapeLibraryUI.refresh();return true;
}
renderer.domElement.addEventListener('pointermove',event=>{
  stampClick.move(event.pointerId,event.clientX,event.clientY,event.buttons);
  if(event.buttons===0){updatePointer(event);try{placePointerShape();}catch(error){ui.status(message(error));}}
});
function syncViewportTools():void {
  viewportTools?.sync(shapeGhost.model.enabled?'boolean':ui.mode==='smooth'?'smooth':'brush',input.mode,layers.active.layer.editable,loadingProject||ui.modalOpen||xrBlocked());
}
function chooseWorkspace(tool:WorkspaceTool,fromXR=false):void {
  if(loadingProject||ui.modalOpen||xrBlocked()&&!fromXR)return;stop();
  shapeLibraryUI.setOpen(tool==='boolean',fromXR);if(tool!=='boolean')ui.selectBrushTool(tool);transformTools!.setMode('sculpt');
  syncTransformUI();cursor.visible=false;ui.status(tool==='boolean'?'Boolean shapes · position and click once to stamp':`${tool==='smooth'?'Smooth':'Brush'} tool · ${layers.active.layer.name}`);
}
function chooseLayerMode(mode:EditorMode,fromXR=false):void {
  if(loadingProject||ui.modalOpen||xrBlocked()&&!fromXR)return;stop();shapeLibraryUI.setOpen(false,fromXR);transformTools!.setMode(mode);syncTransformUI();cursor.visible=false;ui.status(`${mode} · ${layers.active.layer.name}`);
}
viewportTools=createViewportTools(ui.viewport,chooseWorkspace,chooseLayerMode);
syncViewportTools();
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());renderer.domElement.addEventListener('pointermove',updatePointer);
renderer.domElement.addEventListener('pointerleave',()=>{pointerInside=false;cursor.visible=false;});
renderer.domElement.addEventListener('pointerdown',e=>{
  if(shapeGhost.model.enabled){
    if(shapeGhost.model.manipulating){stampClick.cancel();return;}
    if(e.button!==0){stampClick.cancel();return;}
    updatePointer(e);try{if(placePointerShape()&&stampClick.begin(e.pointerId,e.button,e.clientX,e.clientY,shapeGhost.model.definition,e.buttons,e.isPrimary))renderer.domElement.setPointerCapture(e.pointerId);}catch(error){ui.status(message(error));}return;
  }
  if(e.button!==0||activePointer!==null||!input.canSculpt(layers.active.layer.editable,loadingProject||ui.modalOpen||xrBlocked()||shapeGhost.model.enabled))return;
  try {layers.beginStroke();if(!input.beginSculpt(layers.active.layer.editable,loadingProject)){layers.finishStroke();return;}updatePointer(e);activePointer=e.pointerId;controls.enabled=input.cameraEnabled;renderer.domElement.setPointerCapture(e.pointerId);}
  catch(error){input.end('sculpt');controls.enabled=input.cameraEnabled;ui.status(message(error));}
});
renderer.domElement.addEventListener('pointerup',event=>{
  const rect=renderer.domElement.getBoundingClientRect();if(event.buttons!==0||event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)stampClick.cancel();
  const definition=stampClick.complete(event.pointerId,event.button,event.clientX,event.clientY,layers.project.activeLayerId);
  if(definition)applyShapeStamp(definition);stop();
});
for(const event of ['pointercancel','lostpointercapture'])renderer.domElement.addEventListener(event,stop);
window.addEventListener('blur',stop);
function changeHistory(redo:boolean) {
  if(loadingProject||ui.modalOpen||xrBlocked())return;
  stop();try {const id=layers.undo(redo);if(id){cursor.visible=false;ui.status(`${redo?'Redone':'Undone'} on ${layers.active.layer.name}`);}refresh();}
  catch(error){ui.projectMessage(message(error),true);}
}
document.getElementById('undo')!.addEventListener('click',()=>changeHistory(false));document.getElementById('redo')!.addEventListener('click',()=>changeHistory(true));
window.addEventListener('keydown',event=>{
  if(ui.modalOpen||xrBlocked())return;
  if(event.key==='Escape'&&shapeGhost.model.enabled&&!loadingProject){stop();shapeGhost.clear();shapeLibraryUI.refresh();transformTools?.sync();ui.status('Ghost hidden — sculpting available');return;}
  if(event.target instanceof Element&&event.target.closest('input:not([type="range"]),textarea,select,[contenteditable="true"]'))return;
  if(!event.metaKey&&!event.ctrlKey&&!event.altKey&&event.key.toLowerCase()==='i'&&!event.repeat){event.preventDefault();cycleRenderStyle();return;}
  if(!event.metaKey&&!event.ctrlKey&&!event.altKey&&event.key.toLowerCase()==='g'&&!event.repeat){event.preventDefault();toggleGhostRotation('translate');return;}
  if(!event.metaKey&&!event.ctrlKey&&!event.altKey&&event.key.toLowerCase()==='t'&&!event.repeat){event.preventDefault();toggleGhostRotation();return;}
  if(!event.metaKey&&!event.ctrlKey&&!event.altKey&&event.key.toLowerCase()==='b'&&!loadingProject){
    event.preventDefault();chooseWorkspace('brush');return;
  }
  if(!event.metaKey&&!event.ctrlKey&&!event.altKey&&!input.transforming) {
    const mode=({w:'translate',e:'rotate',r:'scale'} as Record<string,EditorMode>)[event.key.toLowerCase()];
    if(mode&&shapeGhost.model.enabled){event.preventDefault();ui.status('Hide the shape ghost to use layer gizmos. Ghost pose fields are in Shape Library.');return;}
    if(mode){event.preventDefault();stop();transformTools!.setMode(mode);syncTransformUI();ui.status(`${mode} · ${layers.active.layer.name}`);return;}
  }
  if((event.metaKey||event.ctrlKey)&&!event.altKey&&event.key.toLowerCase()==='z'){event.preventDefault();if(!event.repeat)changeHistory(event.shiftKey);}
});
let studioEnvironment:THREE.WebGLRenderTarget|null=null;
function syncRenderStyle():void {
 const style=display.renderStyle;
 if(style!=='normal'&&!studioEnvironment){
  const room=new RoomEnvironment(),generator=new THREE.PMREMGenerator(renderer);
  try{studioEnvironment=generator.fromScene(room,.04);}finally{room.dispose();generator.dispose();}
 }
 scene.environment=style!=='normal'?studioEnvironment!.texture:null;
 renderer.toneMapping=style!=='normal'?THREE.ACESFilmicToneMapping:THREE.NoToneMapping;renderer.toneMappingExposure=style!=='normal'?.9:1;
 ui.renderStyle(style);
}
function setRenderStyle(style:RenderStyle):void {
 if(loadingProject||ui.modalOpen||xrBlocked())return;stop();display.renderStyle=style;layers.syncPresentation();syncRenderStyle();ui.status(`${style==='normal'?'Normal clay':style==='matte'?'Matte soft reflections':'Glossy surface inspection'} · viewport only`);
}
document.getElementById('render-style')!.addEventListener('change',event=>setRenderStyle(validateRenderStyle((event.target as HTMLSelectElement).value)));
function cycleRenderStyle():void {setRenderStyle(RENDER_STYLES[(RENDER_STYLES.indexOf(display.renderStyle)+1)%RENDER_STYLES.length]);}
document.getElementById('cycle-render-style')!.addEventListener('click',cycleRenderStyle);
const paint=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
async function heavy(text:string,work:()=>void) {
  if(loadingProject||xrBlocked())return;stop();loadingProject=true;ui.projectBusy(true);syncTransformUI();transformTools?.sync();ui.projectMessage(text);
  await paint();
  try {work();cursor.visible=false;pointerInside=false;lastRebuild=performance.now();}
  catch(error){ui.projectMessage(message(error),true);}
  finally{loadingProject=false;refresh();ui.projectBusy(false);}
}
ui.onTransformAction(action=>{
  if(loadingProject||ui.modalOpen||xrBlocked())return;stop();
  try {
    if(action.type==='mode'){if(action.mode==='sculpt')chooseWorkspace('brush');else chooseLayerMode(action.mode);}
    else if(action.type==='space')transformTools!.setSpace(action.space);
    else if(action.type==='reset')layers.setActiveTransform(identityTransform());
    else {
      if(!Number.isFinite(action.value))throw new Error('Enter a finite transform value.');
      const next=copyTransform(layers.active.layer.transform),axis='xyz'.indexOf(action.field[1]);
      if(action.field==='scale')next.scale=[action.value,action.value,action.value];
      else if(action.field[0]==='p')next.position[axis]=action.value;
      else next.rotation[axis]=action.value*Math.PI/180;
      layers.setActiveTransform(next);
    }
    cursor.visible=false;ui.status(`${layers.active.layer.name} · ${input.mode} · transforms use metadata only`);
  }catch(error){ui.projectMessage(message(error),true);}
  syncTransformUI();transformTools!.sync();
});
ui.onLayerAction(async(action,id,value)=>{
  if(loadingProject||xrBlocked())return;stop();
  try {
    if(action==='new'||action==='new-empty')return await heavy('Creating independent layer…',()=>{layers.create(Number(value),action==='new-empty');ui.projectMessage('Independent layer created. Overlapping volumes remain separate.');});
    if(action==='duplicate')return await heavy('Copying independent voxel data…',()=>{layers.duplicate(id);ui.projectMessage('Layer duplicated with independent voxel storage and fresh history.');});
    if(action==='delete') {
      const layer=layers.project.layerStack.get(id);
      if(await ui.confirmDelete(layer.name)){layers.remove(id);ui.projectMessage(`Deleted ${layer.name}. Only its history was removed.`);}
    } else if(action==='select')layers.select(id);
    else if(action==='rename'){layers.rename(id,value!);ui.layerName(layers.project.layerStack.get(id));return;}
    else if(action==='visible')layers.setFlag(id,'visible',!layers.project.layerStack.get(id).visible);
    else if(action==='lock')layers.setFlag(id,'locked',!layers.project.layerStack.get(id).locked);
    else if(action==='operation')layers.setOperation(id,value as LayerOperation);
    else if(action==='up')layers.move(id,-1);
    else if(action==='down')layers.move(id,1);
    else if(action==='colour'){display.setColour(layers.project.id,id,value!);layers.syncPresentation();return;}
    else if(action==='mode'){display.mode=value==='layer-colours'?'layer-colours':'clay';layers.syncPresentation();return;}
    cursor.visible=false;refresh();
  }catch(error){ui.projectMessage(message(error),true);refresh();}
});
document.getElementById('composition-mode')!.addEventListener('change',event=>{
  if(xrBlocked())return;
  stop();layers.viewMode=(event.target as HTMLSelectElement).value==='boolean'?'boolean':'separate';syncView();syncStats();cursor.visible=false;
  layers.composite.syncMetadata();
  const s=layers.composite.stats;
  ui.compositeInfo(booleanPreview?(s&&!layers.composite.pending?`${s.resolution}³ cached Boolean preview · ${s.triangles.toLocaleString()} triangles${s.capped?' · Quality capped; fine detail may be lost.':''}`:'Preparing Boolean preview…'):'Separate Layers · source volumes unchanged.');
});
document.getElementById('composite-quality')!.addEventListener('change',event=>{
  if(xrBlocked())return;
  layers.composite.setQuality(Number((event.target as HTMLSelectElement).value));
});
let bakeAbort:AbortController|null=null;
let bakeBounds:THREE.Box3Helper|null=null;
function showBakeBounds(plan:BakePlan|null):void {
  if(bakeBounds){bakeBounds.removeFromParent();bakeBounds.geometry.dispose();const materials=Array.isArray(bakeBounds.material)?bakeBounds.material:[bakeBounds.material];materials.forEach(m=>m.dispose());bakeBounds=null;}
  if(plan){bakeBounds=new THREE.Box3Helper(new THREE.Box3(new THREE.Vector3(...plan.min),new THREE.Vector3(...plan.max)),0xa04b36);scene.add(bakeBounds);}
}
document.getElementById('cancel-bake')!.addEventListener('click',()=>bakeAbort?.abort());
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&bakeAbort){event.preventDefault();bakeAbort.abort();}});
document.getElementById('bake-layers')!.addEventListener('click',async()=>{
  if(loadingProject||ui.modalOpen||xrBlocked())return;stop();cursor.visible=false;
  const configured=ui.requestBake(resolution=>layers.bakePlan(resolution),showBakeBounds);transformTools?.sync();
  const options=await configured;if(!options){transformTools?.sync();return;}
  loadingProject=true;bakeAbort=new AbortController();ui.projectBusy(true);ui.bakeBusy(true);syncTransformUI();transformTools?.sync();ui.projectMessage('Baking a new independent SDF layer…');
  await paint();
  try{
    const layer=await layers.bake(options,bakeAbort.signal,ui.bakeProgress),s=layers.lastBakeStats!;
    cursor.visible=false;pointerInside=false;
    ui.projectMessage(`Baked “${layer.name}” at ${s.resolution}³ · sample ${s.samplingMs.toFixed(0)} ms · mesh ${s.meshingMs.toFixed(0)} ms · total ${s.totalMs.toFixed(0)} ms. Original sources kept${options.hideSources?' hidden':'; Separate Layers selected'}. Undo restores the previous stack.`);
    ui.status(`Baked ${layer.name} · ready to sculpt`);
  }catch(error){ui.projectMessage(message(error),!bakeAbort.signal.aborted);}
  finally{bakeAbort=null;loadingProject=false;ui.bakeBusy(false);refresh();ui.projectBusy(false);}
});
document.getElementById('reset')!.addEventListener('click',()=>{
  if(loadingProject||xrBlocked())return;stop();try{layers.resetActive();ui.status(`Reset ${layers.active.layer.name} — undo available`);syncStats();}catch(error){ui.projectMessage(message(error),true);}
});
document.getElementById('apply-resolution')!.addEventListener('click',()=>{
  const requested=Number(document.querySelector<HTMLSelectElement>('#resolution')!.value);
  if(requested===layers.active.layer.volume.resolution)return;
  void heavy('Resampling only the active layer…',()=>{const name=layers.active.layer.name,start=performance.now();layers.resampleActive(requested);ui.projectMessage(`${name}: ${requested}³ in ${(performance.now()-start).toFixed(0)} ms. Only this layer’s voxel history cleared; transforms retained. Other volumes unchanged.`);});
});
function download(data:Blob,name:string){const url=URL.createObjectURL(data),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
document.getElementById('save-project')!.addEventListener('click',()=>{
  if(loadingProject||xrBlocked())return;stop();try {
    layers.project.settings={...ui.settings,camera:{position:camera.position.toArray(),target:controls.target.toArray()}};
    download(new Blob([saveSculptProject(layers.project,display.snapshot(layers.project.id,layers.project.layerStack.layers))],{type:'application/octet-stream'}),'sculpture.form');ui.projectMessage('All independent layers, layer colours and display mode saved.');
  }catch(error){ui.projectMessage(`Save failed: ${message(error)}`,true);}
});
const projectFile=document.querySelector<HTMLInputElement>('#project-file')!;
document.getElementById('open-project')!.addEventListener('click',()=>{if(loadingProject||xrBlocked())return;stop();projectFile.value='';projectFile.click();});
projectFile.addEventListener('change',async()=>{
  const file=projectFile.files?.[0];if(!file||loadingProject||xrBlocked())return;
  stop();loadingProject=true;ui.projectBusy(true);syncTransformUI();transformTools?.sync();ui.projectMessage('Validating all layer data…');
  try {
    if(file.size>MAX_PROJECT_BYTES)throw new Error('Project file exceeds the supported size limit.');
    const project=openSculptProject(await file.arrayBuffer());await paint();const candidate=new IndependentLayers(project,display);
    candidate.viewMode=layers.viewMode;xrExperience!.rig.sculptureRoot.remove(layers.group,layers.composite.group);layers.dispose();layers=candidate;shapeGhost.reset();layers.composite.setQuality(Number(document.querySelector<HTMLSelectElement>('#composite-quality')!.value));xrExperience!.rig.sculptureRoot.add(layers.group,layers.composite.group);syncView();ui.setSettings(project.settings);
    controls.dispose();camera.position.fromArray(project.settings.camera.position);controls=createCameraControls();controls.target.fromArray(project.settings.camera.target);controls.update();
    cursor.visible=false;pointerInside=false;lastRebuild=performance.now();ui.projectMessage(`Opened ${file.name}: ${project.layerStack.layers.length} independent layers. History starts fresh.`);ui.status('Project opened');
  }catch(error){ui.projectMessage(`Open failed: ${message(error)} Current project kept.`,true);}
  finally{loadingProject=false;refresh();ui.projectBusy(false);projectFile.value='';}
});
async function exportGlb(composite:boolean) {
  if(loadingProject||xrBlocked())return;stop();loadingProject=true;ui.projectBusy(true);syncTransformUI();transformTools?.sync();
  let exported:THREE.Group|undefined;
  try {
    await paint();
    if(composite){ui.projectMessage('Evaluating Boolean result…');await layers.composite.flush();exported=layers.composite.exportGroup();}
    else exported=layers.exportGroup();
    const data=await new GLTFExporter().parseAsync(exported,{binary:true});
    if(!(data instanceof ArrayBuffer))throw new Error('Expected binary GLB.');
    download(new Blob([data],{type:'model/gltf-binary'}),composite?'centra-boolean-result.glb':'centra-sculpt.glb');
    ui.projectMessage(composite?'Boolean result exported as one neutral mesh. Independent sources kept.':`GLB exported: ${exported.children.length} separate layers · neutral materials`);
  }catch(error){ui.projectMessage(`Export failed: ${message(error)}`,true);}
  finally{exported?.traverse(object=>{if(object instanceof THREE.Mesh)object.geometry.dispose();});loadingProject=false;syncView();refresh();ui.projectBusy(false);}
}
document.getElementById('export')!.addEventListener('click',()=>void exportGlb(false));
document.getElementById('export-boolean')!.addEventListener('click',()=>void exportGlb(true));
const editorTools=new EditorToolState({layers:()=>layers,shape:shapeGhost.model,settings:()=>ui.settings,setSettings:value=>ui.setSettings(value),mode:()=>input.mode,
 selectTool:tool=>{if(tool==='transform')chooseLayerMode('translate',true);else chooseWorkspace(tool==='stamp'?'boolean':tool==='smooth'?'smooth':'brush',true);},
 selectTransform:mode=>chooseLayerMode(mode,true),busy:()=>loadingProject||ui.modalOpen,changed:()=>{shapeLibraryUI.refresh();cursor.visible=false;refresh();xrExperience?.refreshSculptureInfo();},
});
const xrRig=new XRSceneRig(scene,camera);xrRig.sculptureRoot.add(layers.group,layers.composite.group);
let desktopLocked=false,savedTarget=controls.target.clone();
const disabledBeforeXR=new Map<HTMLInputElement|HTMLButtonElement|HTMLSelectElement,boolean>();
xrExperience=new XRExperience(renderer,xrRig,{
 tools:editorTools,layers:()=>layers,historyChanged:()=>{cursor.visible=false;refresh();},
 sculptureInfo:()=>({activeResolution:volumeLabel(layers.active.layer.volume),resolutions:layers.project.layerStack.layers.map(layer=>`${volumeLabel(layer.volume)}`).join(' / '),layerMeshes:countVisibleMeshes(layers.group),compositeMeshes:countVisibleMeshes(layers.composite.group)}),
 canEnter:()=>!loadingProject&&!ui.modalOpen&&(!booleanPreview||!layers.composite.pending),hidden:[shapeGhost.group,cursor,grid],
 lockDesktop:blocked=>{
  if(blocked===desktopLocked)return;desktopLocked=blocked;
  if(blocked){stop();savedTarget=controls.target.clone();input.suspended=true;controls.enabled=false;pointerInside=false;viewportTools?.close();
   for(const element of document.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement>('#app button,#app input,#app select')){if(element.id==='enter-vr'||element.id==='xr-tool-hand'||element.id==='xr-show-diagnostics'||element.id==='xr-controller-display'||element.id==='xr-hints'||element.id==='xr-show-performance'||element.id==='xr-reset-workspace')continue;disabledBeforeXR.set(element,element.disabled);element.disabled=true;}
   transformTools?.sync();ghostRotation?.sync();
  }else{input.suspended=false;controls.enabled=input.cameraEnabled;for(const [element,disabled]of disabledBeforeXR)element.disabled=disabled;disabledBeforeXR.clear();pointerInside=false;refresh();resizeDesktop();}
  document.body.classList.toggle('xr-blocked',blocked);
 },
 restored:()=>{controls.dispose();controls=createCameraControls();controls.target.copy(savedTarget);controls.enabled=false;pointerInside=false;previous=performance.now();},
},!!renderEmulatorFrame);
void xrExperience.check();
function resizeDesktop(){if(renderer.xr.isPresenting||xrBlocked())return;const w=ui.viewport.clientWidth,h=ui.viewport.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}
new ResizeObserver(resizeDesktop).observe(ui.viewport);
refresh();let previous=performance.now();
function pollComposite(now:number):void{
  if(booleanPreview&&!loadingProject&&!ui.modalOpen&&now-lastCompositePoll>100){
    lastCompositePoll=now;
    const job=layers.composite.tick();
    if(job)ui.compositeInfo('Preview pending · updates after a short pause. Brushes still target the selected source layer.');
    if(job)void job.then(changed=>{
      const s=layers.composite.stats;if(changed){syncView();syncStats();}if(changed&&s)ui.compositeInfo(`${s.resolution}³ · voxel ${s.step.toFixed(4)} world · SAMPLE ${s.samplingMs.toFixed(1)} ms · MESH ${s.meshingMs.toFixed(1)} ms · ${s.chunks}/${s.totalChunks} chunks${s.capped?' · Quality capped; fine detail may be lost.':''}`);
    }).catch(error=>{ui.compositeInfo(`Preview unavailable: ${message(error)} Sources kept; use Separate Layers.`);ui.projectMessage(message(error),true);});
  }
}
renderer.setAnimationLoop((now,frame)=>{
  renderEmulatorFrame?.(now);
  if(xrBlocked()){
    const cpuStart=performance.now();if(frame&&renderer.xr.isPresenting)xrExperience!.frame(now,frame);
    if(!xrExperience!.controllers.grab?.active&&!xrExperience!.controllers.layerGrab?.active)pollComposite(now);
    renderer.render(scene,camera);xrExperience!.finishFrame(performance.now()-cpuStart);return;
  }
  xrExperience?.refreshButton();
  const dt=Math.min((now-previous)/1000,0.05);previous=now;if(input.cameraEnabled)controls.update();
  const runtime=layers.active;
  if(pointerInside&&input.canSculpt(runtime.layer.editable,loadingProject||ui.modalOpen||xrBlocked()||shapeGhost.model.enabled)&&hasUniformScale(runtime.layer.transform)) {
    raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObject(booleanPreview?layers.composite.group:runtime.surface.group,true)[0];cursor.visible=!!hit;
    if(hit&&hit.face) {
      normal.copy(hit.normal??hit.face.normal).applyNormalMatrix(normalMatrix.getNormalMatrix(hit.object.matrixWorld));cursor.position.copy(hit.point).addScaledVector(normal,0.006);
      cursor.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);cursor.scale.setScalar(ui.radius);
      cursor.material.color.set(ui.mode==='add'?'#435d2c':ui.mode==='subtract'?'#a04b36':'#426ca0');cursor.material.opacity=0.4+ui.strength*0.6;
      if(layers.drawing) {
        try{layers.applyStroke(hit.point,ui.radius,ui.mode,ui.strength,dt,ui.hardness);ui.status(`${ui.mode} · ${runtime.layer.name} · ${Math.round(ui.strength*100)}%`);}
        catch(error){layers.cancelStroke();stop();ui.status(message(error));}
      }
    }else layers.breakStrokePath();
    if(layers.drawing&&now-lastRebuild>=1000/30){runtime.rebuild();syncStats();lastRebuild=performance.now();}
  }else{cursor.visible=false;layers.breakStrokePath();}
  pollComposite(now);
  if(ghostRotation){ghostRotation.space=document.querySelector<HTMLSelectElement>('#shape-space')!.value==='world'?'world':'local';ghostRotation.sync();}
  shapeGhost.sync(loadingProject||ui.modalOpen||xrBlocked());shapeLibraryUI.refresh();syncViewportTools();
  renderer.render(scene,camera);
});
