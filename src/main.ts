import {LightRig} from './light-rig';
import {lightingUI} from './lighting-ui';
import {ReferenceTransformTool} from './reference-transform';
import {ReferenceView} from './reference-view';
import {referenceUI} from './reference-ui';
import {saveState,SAVE_LABELS} from './save-status';
import {RecoveryController} from './recovery';
import {IndexedRecoveryStore,type RecoveryRecord} from './recovery-store';
import {encodeRecovery} from './recovery-client';
import {checksum} from './project-snapshot';
import {AppLifecycle} from './app-lifecycle';
import {StabilityMetrics} from './stability-metrics';
import {uniformScale} from './transform';
import {ClayStrokeSession} from './clay-stroke-session';
import {XRBrushPreview} from './xr-brush-preview';
import {reflectPoint} from './sdf';
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
import {exportGlbAsync} from './export-client';
import {EXPORT_MEMORY_LIMIT,exportAdmission} from './export-mesh';
import type {ExportQuality,ExportSource} from './export-mesh';
import type { LayerOperation } from './layers';
import { createBaseProject } from './layers';
import { SDFVolume } from './sdf';
import { createUI } from './ui';
import {XRMirrorPlane} from './xr-mirror-plane';
import type { BakePlan } from './bake';
import { DEFAULT_RESOLUTION } from './resolution';
import {DesktopLayerPalette} from './layer-palette';
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
const ui=createUI();let display=new LayerDisplayPreferences();
let layers=new IndependentLayers(createBaseProject(new SDFVolume(DEFAULT_RESOLUTION),{mode:'add',radius:0.22,strength:0.35,hardness:0,camera:{position:[2.4,1.7,3.3],target:[0,0,0]}}),display);
let manualSaveKey='',restoredSaveKey='',manualSaveError='',manualSaving=false;
let loadingProject=false;let recovery:RecoveryController|undefined;const stabilityMetrics=new StabilityMetrics();let stabilityText='';
let xrExperience:XRExperience|undefined;
const xrBlocked=()=>xrExperience?.blocking??false;
const input=new InputOwnership();
const stampClick=new StampClickGesture();
let transformTools:LayerTransformTools|undefined;
let ghostRotation:ShapeRotationTool|undefined;
let referenceEditor:ReferenceTransformTool|undefined;
let viewportTools:ReturnType<typeof createViewportTools>|undefined;
const scene=new THREE.Scene();scene.background=new THREE.Color('#e9e9e3');scene.add(layers.group,layers.composite.group);
const shapeGhost=new ShapeGhost(()=>layers.project.layerStack);scene.add(shapeGhost.group);
const shapeLibraryUI=createShapeLibraryUI(document.getElementById('shape-library-slot')!,shapeGhost,()=>layers.project.layerStack,()=>loadingProject||ui.modalOpen||xrBlocked(),stop,()=>{transformTools?.sync();cursor.visible=false;ui.status(shapeGhost.model.moveMode?'Move preview · drag arrows or planes · Apply stamp when ready':shapeGhost.model.rotationMode?'Rotate stamp · drag a ring · T to finish':shapeGhost.model.enabled?(shapeGhost.model.followPointer?'Shape Stamp — place on a visible surface':'Preview held · G to move · T to rotate · Apply to stamp'):'Ghost hidden — sculpting available');},()=>applyShapeStamp(),()=>toggleGhostRotation(),()=>toggleGhostRotation('translate'));
let booleanPreview=false,lastCompositePoll=0;
function syncView(){booleanPreview=layers.viewMode==='boolean';ui.surfaceView(layers.viewMode);if(!booleanPreview)ui.compositeInfo('Separate Layers · source volumes unchanged.');layers.group.visible=!booleanPreview;layers.composite.group.visible=booleanPreview&&!layers.composite.failed;}
syncView();
const camera=new THREE.PerspectiveCamera(38,1,0.01,100);camera.position.set(2.4,1.7,3.3);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;ui.viewport.append(renderer.domElement);renderer.domElement.tabIndex=0;
function createCameraControls() {
  const orbit=new OrbitControls(camera,renderer.domElement);orbit.enableDamping=true;orbit.minDistance=1.2;orbit.maxDistance=9;
  orbit.mouseButtons={LEFT:null as unknown as THREE.MOUSE,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE};return orbit;
}
let controls=createCameraControls();
const ambient=new THREE.HemisphereLight(0xffffff,0x687267,2.7);scene.add(ambient);
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
function syncTransformUI(){syncViewportTools();ui.transformState(layers.transformNode.transform,layers.transformNode.editable,input.mode,input.space,loadingProject||xrBlocked());syncStats();}
function refresh() {
  exportEstimate();
  syncView();
  ui.layerRows(layers.project.layerStack.layers,layers.project.activeLayerId,layer=>display.colour(layers.project.id,layer.id,layer.order));
  desktopLayers?.render();
  ui.resolution(layers.active.layer.volume.resolution);syncRenderStyle();ui.viewportMode(display.mode);syncTransformUI();transformTools?.sync();
}
var desktopLayers:DesktopLayerPalette|undefined;
const desktopStroke=new ClayStrokeSession(()=>layers,()=>refresh());
function stopSculpt(commit=false) {
  const captured=activePointer;activePointer=null;input.end('sculpt');controls.enabled=input.cameraEnabled;if(desktopStroke.active){if(desktopStroke.phase==='drawing'&&(commit||!desktopStroke.buffered))desktopStroke.end();else if(!commit)desktopStroke.cancel();}else layers.finishStroke();syncStats();lastRebuild=performance.now();
  if(captured!==null&&renderer.domElement.hasPointerCapture(captured))renderer.domElement.releasePointerCapture(captured);
}
function stop(){referenceEditor?.setMode(null);stampClick.cancel();ghostRotation?.finish();transformTools?.finish();stopSculpt();}
function updatePointer(e:PointerEvent) {const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);pointerInside=true;}
transformTools=new LayerTransformTools(camera,renderer.domElement,scene,()=>layers,input,{
  beforeDrag:stopSculpt,camera:enabled=>{controls.enabled=enabled;},changed:syncTransformUI,error:text=>ui.projectMessage(text,true),busy:()=>loadingProject||ui.modalOpen||xrBlocked()||shapeGhost.model.enabled||input.referenceEditing,
});
ghostRotation=new ShapeRotationTool(camera,renderer.domElement,scene,shapeGhost.model,()=>layers.project.layerStack,input,{
 beforeDrag:()=>{stampClick.cancel();transformTools?.finish();stopSculpt();},camera:enabled=>{controls.enabled=enabled;},changed:()=>{shapeGhost.sync();shapeLibraryUI.refresh();},error:text=>ui.projectMessage(text,true),busy:()=>loadingProject||ui.modalOpen||xrBlocked()||input.referenceEditing,
});
function toggleGhostRotation(mode:'rotate'|'translate'='rotate'):void {
 if(loadingProject||ui.modalOpen||xrBlocked())return;stop();
 try{ghostRotation!.toggle(mode);ui.status(shapeGhost.model.moveMode?'Move preview · drag arrows or planes · Apply stamp when ready':shapeGhost.model.rotationMode?'Rotate stamp · drag a ring · T to finish':'Preview held · G to move · T to rotate · Apply stamp');shapeLibraryUI.refresh();}
 catch(error){ui.status(message(error));}
}
function applyShapeStamp(definition?:ShapeDefinition):void {
  if(input.referenceEditing||loadingProject||ui.modalOpen||xrBlocked()||!shapeGhost.model.canApply(layers.project.layerStack,loadingProject||ui.modalOpen||xrBlocked())||!input.cameraEnabled)return;
  stop();try {
    const changed=layers.stampShape(definition??shapeGhost.model.futureStampIntent(layers.project.layerStack).definition),s=layers.lastStampStats!;
    ui.projectMessage(`Stamp ${changed?'applied':'unchanged'} · ${s.changedVoxels.toLocaleString()} voxels · evaluate ${s.evaluationMs.toFixed(1)} ms · mesh ${s.meshingMs.toFixed(1)} ms · total ${s.totalMs.toFixed(1)} ms · ${s.chunks}/${s.totalChunks} chunks`);
    ui.status(changed?'Shape stamped · one undo action':'No voxel changes · history kept');refresh();
  }catch(error){ui.projectMessage(`Stamp failed: ${message(error)}`,true);}
}
function placePointerShape():boolean {
  if(input.referenceEditing||!shapeGhost.model.enabled||shapeGhost.model.manipulating||loadingProject||ui.modalOpen||xrBlocked()||!input.cameraEnabled||shapeGhost.model.availability(layers.project.layerStack))return false;
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
let editorTools:EditorToolState|undefined;
function chooseWorkspace(tool:WorkspaceTool,fromXR=false):void {
  if(loadingProject||ui.modalOpen||xrBlocked()&&!fromXR)return;editorTools?.clearMoveSelection();stop();
  shapeLibraryUI.setOpen(tool==='boolean',fromXR);if(tool!=='boolean')ui.selectBrushTool(tool);transformTools!.setMode('sculpt');
  syncTransformUI();cursor.visible=false;ui.status(tool==='boolean'?'Boolean shapes · position and click once to stamp':`${tool==='smooth'?'Smooth':'Brush'} tool · ${layers.active.layer.name}`);
}
function chooseLayerMode(mode:EditorMode,fromXR=false):void {
  if(loadingProject||ui.modalOpen||xrBlocked()&&!fromXR)return;editorTools?.clearMoveSelection();stop();shapeLibraryUI.setOpen(false,fromXR);transformTools!.setMode(mode);syncTransformUI();cursor.visible=false;ui.status(`${mode} · ${layers.transformNode.name}`);
}
viewportTools=createViewportTools(ui.viewport,chooseWorkspace,chooseLayerMode);
syncViewportTools();
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());renderer.domElement.addEventListener('pointermove',updatePointer);
renderer.domElement.addEventListener('pointerleave',()=>{pointerInside=false;cursor.visible=false;});
renderer.domElement.addEventListener('pointerdown',e=>{
  if(input.referenceEditing)return;
  if(shapeGhost.model.enabled){
    if(shapeGhost.model.manipulating){stampClick.cancel();return;}
    if(e.button!==0){stampClick.cancel();return;}
    updatePointer(e);try{if(placePointerShape()&&stampClick.begin(e.pointerId,e.button,e.clientX,e.clientY,shapeGhost.model.definition,e.buttons,e.isPrimary))renderer.domElement.setPointerCapture(e.pointerId);}catch(error){ui.status(message(error));}return;
  }
  if(e.button!==0||desktopStroke.active||activePointer!==null||!input.canSculpt(layers.active.layer.editable,loadingProject||ui.modalOpen||xrBlocked()||shapeGhost.model.enabled))return;
  if(editorTools?.active==='tube'||editorTools?.active==='edit-spline')return;
  try {desktopStroke.begin(ui.settings,editorTools!.path,performance.now());if(!input.beginSculpt(layers.active.layer.editable,loadingProject)){desktopStroke.cancel();return;}updatePointer(e);activePointer=e.pointerId;controls.enabled=input.cameraEnabled;renderer.domElement.setPointerCapture(e.pointerId);}
  catch(error){desktopStroke.cancel();input.end('sculpt');controls.enabled=input.cameraEnabled;ui.status(message(error));}
});
renderer.domElement.addEventListener('pointerup',event=>{
  if(input.referenceEditing){stampClick.cancel();return;}
  const rect=renderer.domElement.getBoundingClientRect();if(event.buttons!==0||event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)stampClick.cancel();
  const definition=stampClick.complete(event.pointerId,event.button,event.clientX,event.clientY,layers.project.activeLayerId);
  if(definition)applyShapeStamp(definition);if(activePointer!==null)stopSculpt(true);else if(!desktopStroke.active)stop();
});
renderer.domElement.addEventListener('pointercancel',stop);renderer.domElement.addEventListener('lostpointercapture',()=>{if(activePointer!==null)stop();});
// AppLifecycle resolves suspension/blur without committing partial gestures.
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
  if(input.referenceEditing&&!event.metaKey&&!event.ctrlKey&&!event.altKey){const mode=({w:'translate',e:'rotate',r:'scale'} as const)[event.key.toLowerCase() as 'w'|'e'|'r'];if(event.key==='Escape'||mode){event.preventDefault();referenceEditor?.setMode(event.key==='Escape'?null:mode);return;}}
  if(!event.metaKey&&!event.ctrlKey&&!event.altKey&&event.key.toLowerCase()==='i'&&!event.repeat){event.preventDefault();cycleRenderStyle();return;}
  if(!event.metaKey&&!event.ctrlKey&&!event.altKey&&event.key.toLowerCase()==='g'&&!event.repeat){event.preventDefault();toggleGhostRotation('translate');return;}
  if(!event.metaKey&&!event.ctrlKey&&!event.altKey&&event.key.toLowerCase()==='t'&&!event.repeat){event.preventDefault();toggleGhostRotation();return;}
  if(!event.metaKey&&!event.ctrlKey&&!event.altKey&&event.key.toLowerCase()==='b'&&!loadingProject){
    event.preventDefault();chooseWorkspace('brush');return;
  }
  if(!event.metaKey&&!event.ctrlKey&&!event.altKey&&!input.transforming) {
    const mode=({w:'translate',e:'rotate',r:'scale'} as Record<string,EditorMode>)[event.key.toLowerCase()];
    if(mode&&shapeGhost.model.enabled){event.preventDefault();ui.status('Hide the shape ghost to use layer gizmos. Ghost pose fields are in Shape Library.');return;}
    if(mode){event.preventDefault();stop();transformTools!.setMode(mode);syncTransformUI();ui.status(`${mode} · ${layers.transformNode.name}`);return;}
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
      const next=copyTransform(layers.transformNode.transform),axis='xyz'.indexOf(action.field[1]);
      if(action.field==='scale')next.scale=[action.value,action.value,action.value];
      else if(action.field[0]==='p')next.position[axis]=action.value;
      else next.rotation[axis]=action.value*Math.PI/180;
      layers.setActiveTransform(next);
    }
    cursor.visible=false;ui.status(`${layers.transformNode.name} · ${input.mode} · transforms use metadata only`);
  }catch(error){ui.projectMessage(message(error),true);}
  syncTransformUI();transformTools!.sync();
});
ui.onLayerAction(async(action,id,value)=>{
  if(loadingProject||xrBlocked())return;stop();
  try {
    if(action==='new'||action==='new-empty')return await heavy('Creating independent layer…',()=>{layers.create(Number(value),action==='new-empty');ui.projectMessage('Independent layer created. Overlapping volumes remain separate.');});
    if(action==='duplicate'){await layers.duplicateAsync(id,undefined,text=>ui.projectMessage(text));refresh();return;}
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
  const configured=ui.requestBake((resolution,ids)=>layers.bakePlan(resolution,ids),showBakeBounds,layers.project.layerStack.layers,layers.project.activeLayerId);transformTools?.sync();
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
document.getElementById('save-project')!.addEventListener('click',()=>void(async()=>{
  if(loadingProject||xrBlocked()||ui.modalOpen)return;stop();loadingProject=true;manualSaving=true;manualSaveError='';ui.projectBusy(true);updateSaveIndicator();recovery?.cancelJob();
  try{await recovery?.settle();await paint();layers.project.toolPreferences=editorTools?.snapshotPreferences();layers.project.settings={...ui.settings,camera:{position:camera.position.toArray(),target:controls.target.toArray()}};download(new Blob([saveSculptProject(layers.project,display.snapshot(layers.project.id,layers.project.layerStack.layers))],{type:'application/octet-stream'}),'sculpture.form');manualSaveKey=recoveryKey();ui.projectMessage('All independent layers, display and tool preferences saved. Recovery data stays separate.');}
  catch(error){manualSaveError=message(error);ui.projectMessage(`Save failed: ${manualSaveError}`,true);}
  finally{manualSaving=false;loadingProject=false;ui.projectBusy(false);refresh();updateSaveIndicator();}
})());
document.getElementById('header-save')!.addEventListener('click',()=>document.getElementById('save-project')!.click());
const projectFile=document.querySelector<HTMLInputElement>('#project-file')!;
document.getElementById('open-project')!.addEventListener('click',()=>{if(loadingProject||xrBlocked())return;stop();projectFile.value='';projectFile.click();});
async function openProjectFile(file:File,buffer?:ArrayBuffer,expectedProjectId?:string):Promise<boolean>{
  if(loadingProject||xrBlocked())return false;
  recovery?.cancelJob();xrExperience?.controllers.suspend();editorTools?.clearMoveSelection();
  stop();loadingProject=true;ui.projectBusy(true);syncTransformUI();transformTools?.sync();ui.projectMessage('Validating all layer data…');
  try {
    await recovery?.settle();
    if(file.size>MAX_PROJECT_BYTES)throw new Error('Project file exceeds the supported size limit.');
    const project=openSculptProject(buffer??await file.arrayBuffer());if(expectedProjectId&&project.id!==expectedProjectId)throw new Error('Recovery project identity does not match its record.');await paint();const candidate=new IndependentLayers(project,new LayerDisplayPreferences());
    candidate.viewMode=layers.viewMode;xrExperience!.rig.sculptureRoot.remove(layers.group,layers.composite.group);layers.dispose();layers=candidate;display=candidate.display;layers.interruptBackground=()=>recovery?.cancelJob();shapeGhost.reset();layers.composite.setQuality(Number(document.querySelector<HTMLSelectElement>('#composite-quality')!.value));xrExperience!.rig.sculptureRoot.add(layers.group,layers.composite.group);syncView();ui.setSettings(project.settings);editorTools?.restorePreferences(project.toolPreferences);
    controls.dispose();camera.position.fromArray(project.settings.camera.position);controls=createCameraControls();controls.target.fromArray(project.settings.camera.target);controls.update();
    cursor.visible=false;pointerInside=false;lastRebuild=performance.now();ui.projectMessage(`Opened ${file.name}: ${project.layerStack.layers.length} independent layers. History starts fresh.`);ui.status('Project opened');recovery?.replaceProject();manualSaveError='';manualSaveKey=expectedProjectId?'':recoveryKey();restoredSaveKey=expectedProjectId?recoveryKey():'';return true;
  }catch(error){ui.projectMessage(`Open failed: ${message(error)} Current project kept.`,true);return false;}
  finally{loadingProject=false;refresh();ui.projectBusy(false);projectFile.value='';}
}
projectFile.addEventListener('change',()=>{const file=projectFile.files?.[0];if(file)void openProjectFile(file);});
let exportAbort:AbortController|null=null;
const cancelExport=document.querySelector<HTMLButtonElement>('#cancel-export')!;
cancelExport.addEventListener('click',()=>exportAbort?.abort());
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&exportAbort){event.preventDefault();exportAbort.abort();}});
function exportEstimate():void {const count=layers.project.layerStack.layers.reduce((n,l)=>n+(l.visible?layers.runtime(l.id).triangles:0),0);let note='Final count reported after export.';try{const q=document.querySelector<HTMLSelectElement>('#export-quality')!.value as ExportQuality;exportAdmission(layers.exportSources(),q,Math.max(1,EXPORT_MEMORY_LIMIT-layers.trackedBytes));}catch(error){note=message(error);}document.getElementById('export-estimate')!.textContent=`Visible source: ${count.toLocaleString()} triangles before optimisation. ${note}`;}
document.getElementById('export-quality')!.addEventListener('change',exportEstimate);

async function exportGlb(scope:'visible'|'selected'|'composite') {
  if(loadingProject||xrBlocked())return;stop();
  if(layers.deforming||layers.previewing){ui.projectMessage('Finish or cancel Move before exporting.',true);return;}
  recovery?.cancelJob();
  loadingProject=true;exportAbort=new AbortController();const signal=exportAbort.signal;ui.projectBusy(true);syncTransformUI();transformTools?.sync();cancelExport.hidden=false;
  try {
    await recovery?.settle();if(signal.aborted)throw new Error('Export cancelled.');await paint();let sources:ExportSource[];
    if(scope==='composite'){
      ui.projectMessage('Evaluating Boolean result at the existing quality cap…');
      // Abort the export wait; the shared preview scheduler may finish its own cache.
      let release=()=>{};try{await Promise.race([layers.composite.flush(),new Promise<never>((_,reject)=>{const abort=()=>reject(new Error('Export cancelled.'));signal.addEventListener('abort',abort,{once:true});release=()=>signal.removeEventListener('abort',abort);if(signal.aborted)abort();})]);}finally{release();}
      sources=layers.composite.exportSources();
    }else sources=layers.exportSources(scope);
    const quality=document.querySelector<HTMLSelectElement>('#export-quality')!.value as ExportQuality;
    const result=await exportGlbAsync(sources,quality,{signal,maxBytes:Math.max(1,EXPORT_MEMORY_LIMIT-layers.trackedBytes),progress:p=>{ui.projectMessage(`${p.stage} · ${Math.round(100*p.completed/Math.max(1,p.total))}% · Cancel available`);}});
    if(signal.aborted)throw new Error('Export cancelled.');
    download(new Blob([result.data],{type:'model/gltf-binary'}),scope==='composite'?'centra-boolean-result.glb':scope==='selected'?'centra-selected-layer.glb':'centra-sculpt.glb');
    const triangles=result.stats.reduce((n,s)=>n+s.triangles,0),issues=result.stats.reduce((n,s)=>n+s.boundaryEdges+s.nonManifoldEdges+s.inconsistentEdges,0);
    ui.projectMessage(`${quality[0].toUpperCase()+quality.slice(1)} GLB: ${triangles.toLocaleString()} triangles · ${(result.data.byteLength/1048576).toFixed(2)} MiB · ${result.stats.length} ${result.stats.length===1?'mesh':'meshes'}${issues?` · ${issues} open/non-manifold/winding edges; inspect before printing`:''}. Source sculpture kept.`);
  }catch(error){ui.projectMessage(`${message(error)} Source sculpture kept.`,!signal.aborted);}
  finally{exportAbort=null;cancelExport.hidden=true;loadingProject=false;syncView();refresh();ui.projectBusy(false);exportEstimate();}
}
document.getElementById('export')!.addEventListener('click',()=>void exportGlb('visible'));
document.getElementById('export-selected')!.addEventListener('click',()=>void exportGlb('selected'));
document.getElementById('export-boolean')!.addEventListener('click',()=>void exportGlb('composite'));
editorTools=new EditorToolState({layers:()=>layers,shape:shapeGhost.model,settings:()=>ui.settings,setSettings:value=>ui.setSettings(value),mode:()=>input.mode,
 selectTool:tool=>{if(tool==='flatten'||tool==='inflate'||tool==='scrape'||tool==='pinch'||tool==='crease'){chooseWorkspace('brush',true);return;}if(tool==='transform')chooseLayerMode('translate',true);else chooseWorkspace(tool==='stamp'?'boolean':tool==='smooth'?'smooth':'brush',true);},
 selectTransform:mode=>chooseLayerMode(mode,true),busy:()=>loadingProject||ui.modalOpen,changed:()=>{shapeLibraryUI.refresh();cursor.visible=false;refresh();xrExperience?.refreshSculptureInfo();},
});
desktopLayers=new DesktopLayerPalette(()=>layers,document.getElementById('layer-list')!,()=>{stop();chooseLayerMode('translate');refresh();},()=>refresh(),text=>ui.projectMessage(text,true),()=>loadingProject||ui.modalOpen||xrBlocked(),()=>stop());desktopLayers.render();
const precisionPanel=document.createElement('details');precisionPanel.className='precision-settings';const precisionTitle=document.createElement('summary');precisionTitle.textContent='PRECISION · SHARED TOOL SETTINGS';const precisionOptions=document.createElement('div');precisionPanel.append(precisionTitle,precisionOptions);document.querySelector('#radius')!.closest('section')!.append(precisionPanel);
let precisionKey='';
const tubeToolButtons=document.createElement('div');for(const [tool,label] of [['tube','Tube (VR drawing)'],['edit-spline','Edit Spline']] as const){const button=document.createElement('button');button.textContent=label;button.onclick=()=>{try{editorTools!.select(tool);}catch(error){ui.status(message(error));}};tubeToolButtons.append(button);}precisionPanel.before(tubeToolButtons);
function syncPrecisionOptions(){const options=editorTools!.options(),key=JSON.stringify(options);if(key===precisionKey)return;precisionKey=key;precisionOptions.replaceChildren();for(const o of options){const row=document.createElement('p'),label=document.createElement('span');label.textContent=`${o.label}: ${o.value} `;row.append(label);if(o.increase||o.decrease)for(const direction of [-1,1] as const){const button=document.createElement('button');button.type='button';button.textContent=direction===1?'＋':'−';button.setAttribute('aria-label',`${direction===1?'Increase':'Decrease'} ${o.label}`);button.disabled=o.disabled||!(direction===1?o.increase:o.decrease);button.onclick=()=>{try{editorTools!.adjust(o.id,direction);syncPrecisionOptions();}catch(error){ui.status(message(error));}};row.append(button);}if(o.action&&(o.action.startsWith('tube-')||o.action.startsWith('mask-'))){const button=document.createElement('button');button.textContent=o.label;button.disabled=o.disabled;button.onclick=()=>{try{if(o.action!.startsWith('mask-'))editorTools!.maskAction(o.action!);else void editorTools!.splineAction(o.action!).catch(error=>ui.status(message(error)));}catch(error){ui.status(message(error));}};row.append(button);}precisionOptions.append(row);}}
ui.onBrushSelection(mode=>{try{editorTools!.select(mode==='add'||mode==='subtract'?'clay':mode==='mask-erase'?'mask':mode);ui.setSettings({...ui.settings,mode});}catch(error){ui.status(message(error));}});
const desktopPreviewRoot=new THREE.Group();scene.add(desktopPreviewRoot);const desktopFieldCursor=new XRBrushPreview(desktopPreviewRoot);const desktopMirrorCursor=new XRBrushPreview(desktopPreviewRoot);const desktopMirrorPlane=new XRMirrorPlane(editorTools!,desktopPreviewRoot);
const desktopPathGeometry=new THREE.BufferGeometry(),desktopPathMaterial=new THREE.LineBasicMaterial({color:'#267c78',depthTest:false});const desktopPath=new THREE.Line(desktopPathGeometry,desktopPathMaterial),desktopMirrorPath=new THREE.Line(desktopPathGeometry,desktopPathMaterial),desktopPaths=new THREE.Group();desktopPaths.matrixAutoUpdate=false;desktopPaths.add(desktopPath,desktopMirrorPath);scene.add(desktopPaths);
const xrRig=new XRSceneRig(scene,camera);xrRig.sculptureRoot.add(layers.group,layers.composite.group);
const lighting=new LightRig(()=>display.lighting,xrRig.workspaceRoot,light,fill,ambient,()=>{xrRig.sculptureRoot.updateMatrix();xrRig.turntable.group.updateMatrix();return xrRig.visibleBounds().getCenter(new THREE.Vector3()).applyMatrix4(xrRig.sculptureRoot.matrix).applyMatrix4(xrRig.turntable.group.matrix);});
const lightUI=lightingUI(()=>display,lighting,precisionPanel.parentElement!,()=>loadingProject||ui.modalOpen||xrBlocked());
const references=new ReferenceView(()=>display.references,xrRig.workspaceRoot,xrRig.turntable.group);
window.addEventListener('pagehide',()=>references.clear());
referenceEditor=new ReferenceTransformTool(camera,renderer.domElement,scene,references,input,{beforeDrag:()=>{stampClick.cancel();ghostRotation?.finish();transformTools?.finish();stopSculpt();},camera:enabled=>controls.enabled=enabled,changed:()=>{cursor.visible=false;transformTools?.sync();ghostRotation?.sync();},busy:()=>loadingProject||ui.modalOpen||xrBlocked(),error:text=>ui.projectMessage(text,true)});
const referencesUI=referenceUI(()=>display,references,precisionPanel.parentElement!,()=>loadingProject||ui.modalOpen||xrBlocked(),referenceEditor);
let desktopLocked=false,savedTarget=controls.target.clone();
const disabledBeforeXR=new Map<HTMLInputElement|HTMLButtonElement|HTMLSelectElement,boolean>();
xrExperience=new XRExperience(renderer,xrRig,{
 lighting,references,importReferences:referencesUI.import,tools:editorTools,layers:()=>layers,stability:()=>stabilityText,historyChanged:()=>{cursor.visible=false;refresh();},
 sculptureInfo:()=>({activeResolution:volumeLabel(layers.active.layer.volume),resolutions:layers.project.layerStack.layers.map(layer=>`${volumeLabel(layer.volume)}`).join(' / '),layerMeshes:countVisibleMeshes(layers.group),compositeMeshes:countVisibleMeshes(layers.composite.group)}),
 blockedReason:()=>!recovery?.initialized?'Checking local recovery storage…':recovery.blocked&&recovery.enabled?'Review saved recovery before entering.':ui.modalOpen?'Close the open dialog before entering.':loadingProject?'Wait for the current project operation to finish.':'Wait for Boolean Preview to finish, or select Separate Layers.',
 entryResolvable:()=>!!recovery?.initialized&&recovery.enabled&&recovery.blocked&&!loadingProject&&!ui.modalOpen&&layers.recoveryReady,
 resolveEntry:()=>showEntryRecovery(),
 canEnter:()=>!!recovery?.initialized&&(!recovery.blocked||!recovery.enabled)&&!loadingProject&&!ui.modalOpen&&(!booleanPreview||!layers.composite.pending),hidden:[shapeGhost.group,cursor,grid],
 lockDesktop:blocked=>{
  if(blocked===desktopLocked)return;desktopLocked=blocked;
  if(blocked){recovery?.cancelJob();layers.project.settings={...ui.settings,camera:{position:camera.position.toArray(),target:controls.target.toArray()}};stop();savedTarget=controls.target.clone();input.suspended=true;controls.enabled=false;pointerInside=false;viewportTools?.close();
   for(const element of document.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement>('#app button,#app input,#app select')){if(element.id==='xr-environment'||element.id==='enter-vr'||element.id==='xr-tool-hand'||element.id==='xr-show-diagnostics'||element.id==='xr-controller-display'||element.id==='xr-hints'||element.id==='xr-ui-scale'||element.id==='xr-show-performance'||element.id==='xr-reset-workspace')continue;disabledBeforeXR.set(element,element.disabled);element.disabled=true;}
   transformTools?.sync();ghostRotation?.sync();
  }else{input.suspended=false;controls.enabled=input.cameraEnabled;for(const [element,disabled]of disabledBeforeXR)element.disabled=disabled;disabledBeforeXR.clear();pointerInside=false;refresh();resizeDesktop();}
  document.body.classList.toggle('xr-blocked',blocked);
 },
 restored:()=>{queueMicrotask(()=>void recovery?.tick(Date.now(),true));controls.dispose();controls=createCameraControls();controls.target.copy(savedTarget);controls.enabled=false;pointerInside=false;previous=performance.now();},
},!!renderEmulatorFrame);
void xrExperience.check();
const recoveryPanel=document.getElementById('recovery-slot')!;
recoveryPanel.innerHTML='<section class="recovery-panel"><label><input id="autosave-enabled" type="checkbox" checked> LOCAL AUTOSAVE</label><p id="recovery-status" role="status">Checking local recovery…</p><details id="recovery-available" hidden><summary>RECOVERY CHECKPOINTS</summary><label for="recovery-selection">RECOVERY CHECKPOINT</label><select id="recovery-selection" title="Restore replaces the current open project. Save current work first. Manual files are never overwritten. Undo history starts fresh." aria-description="Restore replaces the current open project. Save current work first. Manual files are never overwritten. Undo history starts fresh."></select><button id="restore-recovery">Restore recovery…</button><button id="discard-recovery">Discard all recovery…</button><div id="recovery-confirm" hidden><p id="recovery-confirm-text"></p><div class="recovery-confirm-actions"><button id="confirm-recovery">Confirm</button><button id="cancel-recovery-action">Cancel</button></div></div></details><details><summary>SESSION RESOURCE ESTIMATES</summary><output id="stability-status"></output></details></section>';
const recoveryStatus=document.getElementById('recovery-status')!,recoveryAvailable=document.getElementById('recovery-available')!,recoverySelect=document.querySelector<HTMLSelectElement>('#recovery-selection')!,autosaveEnabled=document.querySelector<HTMLInputElement>('#autosave-enabled')!,recoveryConfirm=document.getElementById('recovery-confirm')!;
let recoveryAction:'restore'|'discard'|null=null,recoveryListKey='',recoveryChoice='',recoveryWasBlocked=false,restoringRecovery=false;
const recoveryReady=()=>!input.transforming&&!recoveryAction&&!restoringRecovery&&layers.recoveryReady&&!loadingProject&&!ui.modalOpen&&document.visibilityState==='visible'&&!layers.composite.busy&&!xrExperience?.controllers.grab?.active&&!xrExperience?.controllers.layerGrab?.active&&!xrExperience?.alternate?.active&&!xrExperience?.menus?.active&&!xrExperience?.interaction?.active;
const recoveryKey=()=>JSON.stringify([layers.recoveryKey(),ui.settings,display.snapshot(layers.project.id,layers.project.layerStack.layers),editorTools?.snapshotPreferences()],(key,value)=>key==='bytes'&&value instanceof Uint8Array?value.byteLength:value);
function updateSaveIndicator():void{
 const button=document.querySelector<HTMLButtonElement>('#header-save')!;
 const key=recoveryKey(),record=recovery?.records.find(r=>r.projectId===layers.project.id&&r.revision===key);
 const state=saveState({key,manualKey:manualSaveKey,autosaveKey:record?.revision??restoredSaveKey,saving:manualSaving||!!recovery?.active,editing:!layers.recoveryReady,error:!!manualSaveError||!!recovery?.warning,recoveryPending:!!recovery?.blocked});
 button.disabled=loadingProject||xrBlocked()||ui.modalOpen||!layers.recoveryReady;
 const label=SAVE_LABELS[state],title=`${label}${manualSaveError?' · '+manualSaveError:recovery?.warning?' · '+recovery.warning:''} · Click to save project`;
 if(button.dataset.state!==state){button.dataset.state=state;document.getElementById('header-save-status')!.textContent=label;}
 if(button.title!==title){button.title=title;button.setAttribute('aria-label',`Save project — ${label}`);}
}
function updateRecoveryUI():void{if(!recovery)return;updateSaveIndicator();recoveryStatus.textContent=recovery.status();autosaveEnabled.checked=recovery.enabled;autosaveEnabled.disabled=!recovery.initialized||xrBlocked();const key=JSON.stringify(recovery.records.map(r=>[r.id,r.createdAt]));if(key!==recoveryListKey){const selected=recoverySelect.value;recoveryListKey=key;recoverySelect.replaceChildren(...recovery.records.map(r=>new Option(`${r.projectName} · ${new Date(r.createdAt).toLocaleString()} · ${(r.bytes/1048576).toFixed(1)} MiB`,r.id)));if(recovery.records.some(r=>r.id===selected))recoverySelect.value=selected;}recoveryAvailable.hidden=!recovery.records.length;if(recoveryWasBlocked!==recovery.blocked){(recoveryAvailable as HTMLDetailsElement).open=recovery.blocked;recoveryWasBlocked=recovery.blocked;}for(const id of ['restore-recovery','discard-recovery','confirm-recovery'])document.querySelector<HTMLButtonElement>(`#${id}`)!.disabled=loadingProject||xrBlocked()||!layers.recoveryReady;}
recovery=new RecoveryController(new IndexedRecoveryStore(undefined,import.meta.env.DEV&&new URLSearchParams(location.search).get('recoveryFixture')==='lab'?'centra-sculpt-recovery-test':'centra-sculpt-recovery'),{key:recoveryKey,ready:recoveryReady,project:()=>layers.project,changed:updateRecoveryUI,reserve:bytes=>{layers.backgroundBytes=bytes;},encode:signal=>{const source=layers,key=recoveryKey();return encodeRecovery(source,{...ui.settings,camera:{position:(xrBlocked()?layers.project.settings.camera.position:camera.position.toArray()),target:(xrBlocked()?layers.project.settings.camera.target:controls.target.toArray())}},display.snapshot(source.project.id,source.project.layerStack.layers),editorTools?.snapshotPreferences(),signal,()=>layers===source&&recoveryKey()===key&&recoveryReady());}});
layers.interruptBackground=()=>recovery?.cancelJob();void recovery.init();
autosaveEnabled.addEventListener('change',()=>void recovery!.setEnabled(autosaveEnabled.checked));
for(const action of ['restore','discard'] as const)document.getElementById(`${action}-recovery`)!.addEventListener('click',()=>{recovery?.cancelJob();recoveryAction=action;recoveryChoice=recoverySelect.value;recoveryConfirm.hidden=false;document.getElementById('recovery-confirm-text')!.textContent=action==='restore'?'Replace the currently open project with this checkpoint?':'Permanently discard all local recovery checkpoints? Manual files are kept.';});
document.getElementById('cancel-recovery-action')!.addEventListener('click',()=>{recoveryAction=null;recoveryConfirm.hidden=true;});
document.getElementById('confirm-recovery')!.addEventListener('click',()=>void(async()=>{if(loadingProject||xrBlocked()||!layers.recoveryReady)return;const action=recoveryAction;recoveryAction=null;recoveryConfirm.hidden=true;if(action==='discard'){await recovery!.discard();return;}if(action!=='restore')return;const source=layers,key=layers.recoveryKey();restoringRecovery=true;try{const {record,data}=await recovery!.store.read(recoveryChoice);if(layers!==source||layers.recoveryKey()!==key||loadingProject||xrBlocked()||!layers.recoveryReady)throw new Error('Recovery restore cancelled: current project changed. Current work kept.');if(checksum(data)!==record.checksum)throw new Error('Recovery checksum failed; checkpoint kept for inspection/discard.');if(await openProjectFile(new File([],`Recovery ${record.projectName}.form`),data,record.projectId)){recovery!.restored(record);ui.projectMessage('Recovery restored. Geometry, layers and tool preferences kept; Undo starts fresh. Save a manual project when ready.');}}catch(error){recovery!.warning=message(error);}finally{restoringRecovery=false;updateRecoveryUI();}})());
// Recovery choices run before XR entry; a later Enter click supplies a fresh browser gesture.
const entryRecoveryDialog=document.createElement('dialog');
entryRecoveryDialog.id='entry-recovery-dialog';entryRecoveryDialog.setAttribute('aria-labelledby','entry-recovery-title');
entryRecoveryDialog.innerHTML='<form method="dialog"><h2 id="entry-recovery-title">Saved sculpture found</h2><p>Choose what to do with local recovery before entering your environment.</p><label for="entry-recovery-choice">RECOVERY CHECKPOINT</label><select id="entry-recovery-choice"></select><p>Restore replaces the open project with this checkpoint; Undo starts fresh. Save current work first if needed.</p><p>Discard permanently removes all local recovery checkpoints. Your open project and manual files are kept.</p><p>After choosing, tap Enter Studio or Enter Passthrough again.</p><div class="dialog-actions"><button value="cancel" autofocus>Cancel</button><button value="discard">Discard saved recovery</button><button value="restore">Restore selected</button></div></form>';
document.body.append(entryRecoveryDialog);
function showEntryRecovery():void{
 if(!recovery?.blocked||!recovery.enabled||loadingProject||ui.modalOpen||!layers.recoveryReady)return;
 recovery.cancelJob();const select=entryRecoveryDialog.querySelector<HTMLSelectElement>('select')!;
 select.replaceChildren(...recovery.records.map(r=>new Option(`${r.projectName} · ${new Date(r.createdAt).toLocaleString()}`,r.id)));
 select.value=recoverySelect.value;entryRecoveryDialog.returnValue='cancel';entryRecoveryDialog.showModal();
}
entryRecoveryDialog.addEventListener('close',()=>{
 const action=entryRecoveryDialog.returnValue;if(action!=='restore'&&action!=='discard')return;
 if(!recovery?.blocked||loadingProject||xrBlocked()||!layers.recoveryReady)return;
 recoveryAction=action;recoveryChoice=entryRecoveryDialog.querySelector<HTMLSelectElement>('select')!.value;
 document.getElementById('confirm-recovery')!.click();
});
function interruptSession(_reason:string):void{recovery?.cancelJob();exportAbort?.abort();bakeAbort?.abort();xrExperience?.controllers.suspend();desktopStroke.cancel();layers.cancelStroke();layers.cancelTransform();stop();cursor.visible=false;desktopPaths.visible=false;desktopMirrorCursor.hide();pointerInside=false;previous=performance.now();}
const lifecycle=new AppLifecycle(document,window,interruptSession,()=>{previous=performance.now();pointerInside=false;void recovery?.tick(Date.now(),true);});
const recoveryTimer=setInterval(()=>{if(document.visibilityState==='visible'){const stats=stabilityMetrics.sample(layers,Date.now()),heap=(performance as Performance&{memory?:{usedJSHeapSize?:number}}).memory?.usedJSHeapSize;stabilityText=`History ${(stats.historyBytes/1048576).toFixed(1)} MiB · recovery ${!recovery?.enabled?'off':recovery?.blocked?'choice needed':recovery?.warning?'warning':recovery?.active?'working':recovery?.lastSuccess?'saved':'waiting'} ${(recovery?.lastMs??0).toFixed(0)} ms`;document.getElementById('stability-status')!.textContent=`${stats.chunks} allocated / ${stats.meshChunks} mesh chunks · ${stats.vertices.toLocaleString()} vertices / ${stats.triangles.toLocaleString()} triangles. Grid ${(stats.voxelBytes/1048576).toFixed(1)} MiB · history ${(stats.historyBytes/1048576).toFixed(1)} MiB · derived Boolean ${(stats.compositeBytes/1048576).toFixed(1)} MiB. Pending Move ${stats.pendingMoveJobs} / Bake ${stats.pendingBakeJobs} / export ${Number(!!exportAbort)} / recovery ${Number(!!recovery?.active)}. Checkpoint ${((recovery?.lastBytes??0)/1048576).toFixed(1)} MiB / ${(recovery?.lastMs??0).toFixed(0)} ms, snapshot copy ${(recovery?.lastCopyMs??0).toFixed(1)} ms. Tracked ${(stats.trackedBytes/1048576).toFixed(1)} MiB (excludes JS/GPU overhead) · JS heap ${heap===undefined?'unavailable':(heap/1048576).toFixed(1)+' MiB'} · renderer ${renderer.info.memory.geometries} geometries / ${renderer.info.memory.textures} textures.${stats.pressure?' Resource pressure: save manually before further large edits.':''}`;void recovery?.tick();updateRecoveryUI();}},500);
import.meta.hot?.dispose(()=>{clearInterval(recoveryTimer);lighting.dispose();referenceEditor?.dispose();references.dispose();lifecycle.dispose();recovery?.dispose();exportAbort?.abort();bakeAbort?.abort();xrExperience?.controllers.suspend();});
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
  lighting.sync(now,document.visibilityState!=='hidden');lightUI.sync();
  referenceEditor?.sync();referencesUI.sync();
  renderEmulatorFrame?.(now);
  if(xrBlocked()){
    desktopMirrorPlane.group.visible=false;desktopFieldCursor.hide();desktopMirrorCursor.hide();desktopPaths.visible=false;if(desktopStroke.active)desktopStroke.cancel();
    const cpuStart=performance.now();if(frame&&renderer.xr.isPresenting)xrExperience!.frame(now,frame);
    if(!xrExperience!.controllers.grab?.active&&!xrExperience!.controllers.layerGrab?.active)pollComposite(now);
    layers.updateMaskOverlays();renderer.render(scene,camera);xrExperience!.finishFrame(performance.now()-cpuStart);return;
  }
  xrExperience?.refreshButton();
  const dt=Math.min((now-previous)/1000,0.05);previous=now;if(input.cameraEnabled)controls.update();
  const runtime=layers.active;
  if(desktopStroke.phase==='committing')try{desktopStroke.pump();}catch(error){desktopStroke.cancel();ui.status(message(error));}
  if(pointerInside&&input.canSculpt(runtime.layer.editable,loadingProject||ui.modalOpen||xrBlocked()||shapeGhost.model.enabled)&&hasUniformScale(runtime.layer.transform)) {
    raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObject(booleanPreview?layers.composite.group:runtime.surface.group,true)[0];cursor.visible=!!hit;
    if(hit&&hit.face) {
      normal.copy(hit.normal??hit.face.normal).applyNormalMatrix(normalMatrix.getNormalMatrix(hit.object.matrixWorld));cursor.position.copy(hit.point).addScaledVector(normal,0.006);
      cursor.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);cursor.scale.setScalar(ui.radius);
      cursor.material.color.set(ui.mode==='add'?'#435d2c':ui.mode==='subtract'?'#a04b36':'#426ca0');cursor.material.opacity=0.4+ui.strength*0.6;
      if(desktopStroke.phase==='drawing') {
        try{runtime.surface.group.updateWorldMatrix(true,false);const local=hit.point.clone().applyMatrix4(runtime.surface.group.matrixWorld.clone().invert());desktopStroke.sample(local,now);ui.status(`${ui.mode} · ${runtime.layer.name} · ${Math.round(ui.strength*100)}%`);}
        catch(error){desktopStroke.cancel();stop();ui.status(message(error));}
      }
    }else layers.breakStrokePath();
    if(layers.drawing&&now-lastRebuild>=1000/30){runtime.rebuild();syncStats();lastRebuild=performance.now();}
  }else{cursor.visible=false;layers.breakStrokePath();}
  syncPrecisionOptions();
  desktopFieldCursor.hide();desktopMirrorPlane.sync();desktopMirrorCursor.hide();if(cursor.visible&&layers.symmetry.enabled){runtime.surface.group.updateWorldMatrix(true,false);const p=cursor.position.clone().applyMatrix4(runtime.surface.group.matrixWorld.clone().invert());desktopMirrorCursor.show(runtime.surface.group,reflectPoint(p,layers.symmetry),ui.radius/uniformScale(runtime.layer.transform),ui.mode==='smooth');desktopMirrorCursor.showField(runtime.volume,reflectPoint(p,layers.symmetry),ui.mode);}
  if(cursor.visible&&['flatten','inflate','scrape','pinch','crease'].includes(ui.mode)){const p=cursor.position.clone().applyMatrix4(runtime.surface.group.matrixWorld.clone().invert());desktopFieldCursor.show(runtime.surface.group,p,ui.radius/uniformScale(runtime.layer.transform));desktopFieldCursor.showField(runtime.volume,p,ui.mode);cursor.visible=false;}
  desktopPaths.visible=desktopStroke.active&&desktopStroke.preview.length>0;if(desktopPaths.visible){desktopPathGeometry.setFromPoints(desktopStroke.preview.map(p=>new THREE.Vector3(p.x,p.y,p.z)));desktopPaths.matrix.copy(runtime.surface.group.matrixWorld);const m=layers.symmetry;desktopMirrorPath.visible=m.enabled;desktopMirrorPath.scale.set(1,1,1);desktopMirrorPath.position.set(0,0,0);if(m.enabled){desktopMirrorPath.scale[m.axis]=-1;desktopMirrorPath.position[m.axis]=2*m.offset;}}
  pollComposite(now);
  if(ghostRotation){ghostRotation.space=document.querySelector<HTMLSelectElement>('#shape-space')!.value==='world'?'world':'local';ghostRotation.sync();}
  shapeGhost.mirror=layers.symmetry;
  shapeGhost.sync(loadingProject||ui.modalOpen||xrBlocked());shapeLibraryUI.refresh();syncViewportTools();
  layers.updateMaskOverlays();renderer.render(scene,camera);
});

// Explicit development-only native fixtures bypass platform file-picker issues
// during headset acceptance. Uses the same validated project-open path. Never
// fetches arbitrary URLs and is removed from production builds by Vite.
if(import.meta.env.DEV){
 const fixture=new URLSearchParams(location.search).get('moveXRFixture');
 if(fixture&&['300k','600k','1m'].includes(fixture))void(async()=>{
  try{const name=`move-xr-${fixture}.form`,response=await fetch(`/work/quest-move-fixtures/${name}`);
   if(!response.ok)throw new Error('Prepare Move XR fixtures first: node scripts/prepare-move-xr-fixtures.mjs');
   await openProjectFile(new File([await response.arrayBuffer()],name,{type:'application/octet-stream'}));
  }catch(error){ui.projectMessage(`Test fixture failed: ${message(error)}`,true);}
 })();
}
