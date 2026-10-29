import type {ReferenceView} from './reference-view';
import {XRHaptics} from './xr-haptics';
import type {XRAlternateTool} from './xr-alternate-tool';
import {BoxGeometry,BufferGeometry,Float32BufferAttribute,Group,Line,LineBasicMaterial,Mesh,MeshBasicMaterial,Raycaster,RingGeometry,DoubleSide,SphereGeometry,Vector3} from 'three';
import type {WebXRManager,Intersection,Object3D,Material} from 'three';
import type {XRLayerSelection} from './xr-layer-selection';
import type {XRAnalogToolControl} from './xr-brush-sizing';
import type {XRStrokeInteraction} from './xr-clay-stroke';
import {toolAllowsLayerGrab} from './editor-tool-state';
import type {EditorTool} from './editor-tool-state';
import type {XRMenuInteraction} from './xr-menu-view';
import {XRControllerInput} from './xr-input';
import {XRControllerRoles} from './xr-controller-roles';
import {ControllerFeedback} from './xr-feedback';
import {XRSupportShortcuts} from './xr-support-shortcuts';
import type {XRShortcutOptions} from './xr-support-shortcuts';
import {XRLayerGrab} from './xr-layer-grab';
import type {IndependentLayers} from './independent-layers';
import {WorkspaceNavigation} from './workspace-navigation';
import {CONTROLLER_DISPLAY_MODES,validateControllerDisplay} from './controller-models';
import type {ControllerModels,ControllerDisplayMode} from './controller-models';
import {validateHintMode} from './xr-actions';
import {diagnosticAction} from './xr-diagnostics';
import type {XRDiagnostics} from './xr-diagnostics';
type RayGroup=ReturnType<WebXRManager['getController']>;
type GripGroup=ReturnType<WebXRManager['getControllerGrip']>;
type Slot={feedback:ControllerFeedback;halo:Mesh<RingGeometry,MeshBasicMaterial>;ray:RayGroup;grip:GripGroup;rayVisual:Group;gripVisual:Group;line:Line<BufferGeometry,LineBasicMaterial>;body:Mesh<BoxGeometry,MeshBasicMaterial>;indicator:Mesh<SphereGeometry,MeshBasicMaterial>;hand:XRHandedness|null;connected:(event:{data:XRInputSource})=>void;disconnected:()=>void};
/** Three owns tracking matrices. This bridge only polls input and displays debug visuals in tracking space. */
export class XRControllers {
 readonly haptics=new XRHaptics();
 reportToolIssue(event:'cancel'|'error'):void{if(this.session?.visibilityState==='visible')this.haptics.report(this.input.byHand(this.roles.dominant),event);}
 readonly input:XRControllerInput;
 readonly shortcuts:XRSupportShortcuts;
 readonly grab?:WorkspaceNavigation;
 readonly layerGrab?:XRLayerGrab;
 private lastTool:EditorTool='clay';
 private lastHapticGesture='idle';
 private menuGripBlocked=false;
 private gesture:'idle'|'layer'|'workspace'='idle';
 displayMode:ControllerDisplayMode='realistic';
 readonly slots:readonly Slot[];
 private session:XRSession|null=null;
 private readonly resources:{dispose:()=>void}[]=[];
 private readonly menuModels=new Map<Mesh,{material:Material|Material[];order:number}>();
 private restoreMenuModels():void{for(const [mesh,saved] of this.menuModels){const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];materials.forEach(m=>m.dispose());mesh.material=saved.material;mesh.renderOrder=saved.order;}this.menuModels.clear();}
 private overlayMenuModel(root:Object3D):void{root.traverse(o=>{const mesh=o as Mesh;if(!mesh.isMesh||this.menuModels.has(mesh))return;this.menuModels.set(mesh,{material:mesh.material,order:mesh.renderOrder});const clone=(m:Material)=>{const c=m.clone();c.transparent=true;c.depthTest=m.depthTest;c.depthWrite=m.depthWrite;return c;};mesh.material=Array.isArray(mesh.material)?mesh.material.map(clone):clone(mesh.material);mesh.renderOrder=1003;});}

 private readonly raycaster=new Raycaster();private readonly direction=new Vector3();private readonly hits:Intersection<Object3D>[]=[];
 private readonly event=(event:XRInputSourceEvent)=>{if(this.session?.visibilityState==='visible')this.input.semantic(event.inputSource,event.type.startsWith('select')?'trigger':'grip',event.type.endsWith('start'));};
 private readonly visibility=()=>{if(this.session?.visibilityState!=='visible')this.suspend();};
 suspend():void{this.restoreMenuModels();this.shortcuts.reset();this.options.menus?.close();this.options.stroke?.cancel();this.options.alternate?.cancel();this.options.sizing?.reset();this.options.selection?.cancel();this.input.suspend();this.grab?.cancel();this.layerGrab?.cancel();this.haptics.clearIssues();this.root.visible=false;}
 private readonly ended=()=>this.stop();
 inputMs=0;private resetNoticeUntil=0;
 constructor(manager:Pick<WebXRManager,'getController'|'getControllerGrip'>,private readonly root:Group,readonly roles:XRControllerRoles,private readonly panel?:XRDiagnostics,private readonly changed:()=>void=()=>{},private readonly options:{references?:ReferenceView;alternate?:XRAlternateTool;selection?:XRLayerSelection;sizing?:XRAnalogToolControl;stroke?:XRStrokeInteraction;toolMode?:()=>EditorTool;menus?:XRMenuInteraction;shortcuts?:XRShortcutOptions;presentationStep?:(time:number,blocked:boolean,visible:boolean)=>void;workspace?:Object3D;layers?:()=>IndependentLayers;models?:ControllerModels;resetView?:()=>boolean;setPerformance?:(enabled:boolean)=>void}={}){
  this.input=new XRControllerInput(roles);this.shortcuts=new XRSupportShortcuts(options.shortcuts);if(options.layers)this.layerGrab=new XRLayerGrab(options.layers,event=>this.reportToolIssue(event));if(options.workspace)this.grab=new WorkspaceNavigation(options.workspace);root.visible=false;
  const bodyGeometry=new BoxGeometry(.035,.075,.045),indicatorGeometry=new SphereGeometry(.008,8,6),ringGeometry=new RingGeometry(.03,.032,24),lineGeometry=new BufferGeometry();lineGeometry.setAttribute('position',new Float32BufferAttribute([0,0,0,0,0,-1.5],3));this.resources.push(bodyGeometry,indicatorGeometry,ringGeometry,lineGeometry);
  const slots:Slot[]=[];
  for(let index=0;index<2;index++){
   const ray=manager.getController(index),grip=manager.getControllerGrip(index),rayVisual=new Group(),gripVisual=new Group();ray.name=`XR target ray ${index}`;grip.name=`XR grip ${index}`;
   const material=new MeshBasicMaterial({color:'#79cde5',toneMapped:false}),indicatorMaterial=new MeshBasicMaterial({color:'#ffffff',toneMapped:false}),lineMaterial=new LineBasicMaterial({color:'#79cde5',toneMapped:false,transparent:true,opacity:.8});const haloMaterial=new MeshBasicMaterial({color:'#9bc6ba',transparent:true,opacity:.5,side:DoubleSide,toneMapped:false});this.resources.push(material,indicatorMaterial,lineMaterial,haloMaterial);
   const body=new Mesh(bodyGeometry,material),indicator=new Mesh(indicatorGeometry,indicatorMaterial),line=new Line(lineGeometry,lineMaterial);body.position.y=-.025;indicator.position.set(0,.02,-.02);const halo=new Mesh(ringGeometry,haloMaterial);halo.rotation.x=-Math.PI/2;halo.position.y=-.02;halo.visible=false;gripVisual.add(body,indicator,halo);rayVisual.add(line);root.add(ray,grip);rayVisual.visible=gripVisual.visible=false;
   const connected=(event:{data:XRInputSource})=>{this.input.connect(index,event.data);if(this.session)this.options.models?.connect(index,event.data,grip);},disconnected=()=>{this.restoreMenuModels();this.shortcuts.reset();this.options.menus?.close();this.options.stroke?.cancel();this.options.alternate?.cancel();this.options.sizing?.reset();this.options.selection?.cancel();if(this.layerGrab?.owns(this.input.states[index].connectionId)){this.layerGrab.cancel();this.input.suspend();}if(this.grab?.active&&this.grab.owns(this.input.states[index].connectionId))this.grab.cancel();this.options.models?.disconnect(index);this.input.disconnect(index);rayVisual.visible=gripVisual.visible=false;this.panel?.invalidate();};
   ray.addEventListener('connected',connected);ray.addEventListener('disconnected',disconnected);slots.push({feedback:new ControllerFeedback(),halo,ray,grip,rayVisual,gripVisual,line,body,indicator,hand:null,connected,disconnected});
  }this.slots=slots;
 }
 start(session:XRSession):void{
  if(this.session===session)return;this.shortcuts.reset();this.options.menus?.close();this.options.stroke?.cancel();this.options.alternate?.cancel();this.options.sizing?.reset();this.options.selection?.cancel();this.unbind();this.session=session;
  for(const type of ['selectstart','selectend','squeezestart','squeezeend'] as const)session.addEventListener(type,this.event);session.addEventListener('visibilitychange',this.visibility);session.addEventListener('end',this.ended);
  for(const slot of this.slots){slot.ray.add(slot.rayVisual);slot.grip.add(slot.gripVisual);const source=this.input.states[this.slots.indexOf(slot)].source;if(source)this.options.models?.connect(this.slots.indexOf(slot),source,slot.grip);}if(this.panel){this.root.add(this.panel.group);this.panel.start();}this.root.visible=session.visibilityState==='visible';
 }
 private unbind():void{const session=this.session;if(!session)return;for(const type of ['selectstart','selectend','squeezestart','squeezeend'] as const)session.removeEventListener(type,this.event);session.removeEventListener('visibilitychange',this.visibility);session.removeEventListener('end',this.ended);this.session=null;}
 setDominant(hand:unknown):void{this.roles.setDominant(hand);this.shortcuts.reset();this.options.menus?.close();this.options.stroke?.cancel();this.options.alternate?.cancel();this.options.sizing?.reset();this.options.selection?.cancel();this.grab?.cancel();this.layerGrab?.cancel();this.input.suspend();this.panel?.invalidate();this.changed();}
 setDiagnostics(visible:boolean):void{if(this.panel){this.panel.expanded=visible;this.panel.invalidate();}this.changed();}
 setDisplay(value:unknown):void{this.displayMode=validateControllerDisplay(value);this.options.models?.setMode(this.displayMode);if(this.panel){this.panel.displayMode=this.displayMode;this.panel.invalidate();}this.changed();}
 setHints(value:unknown):void{const mode=validateHintMode(value);if(this.panel){this.panel.hints.mode=mode;this.panel.invalidate();}this.changed();}
 resetWorkspaceView(time=performance.now()):boolean{this.shortcuts.reset();this.options.menus?.close();this.options.stroke?.cancel();this.options.alternate?.cancel();this.options.sizing?.reset();this.options.selection?.cancel();this.grab?.cancel();this.layerGrab?.cancel();this.input.suspend();const reset=this.options.resetView?.()??false;if(reset){this.resetNoticeUntil=time+1500;this.panel?.invalidate();}return reset;}
 setPerformance(enabled:boolean):void{if(this.panel){this.panel.performanceEnabled=enabled;this.panel.invalidate();}this.options.setPerformance?.(enabled);this.changed();}
 placePanel(position:{x:number;y:number;z:number},rotation:{x:number;y:number;z:number;w:number}):void{this.panel?.place(position,rotation);}
 update(time:number):void{
  const start=performance.now(),active=this.session?.visibilityState==='visible';
  for(const state of this.input.states){const slot=this.slots[state.slot];this.input.setTracking(state.slot,!!active&&state.connected&&state.source?.targetRayMode==='tracked-pointer'&&!state.source.hand&&slot.ray.visible,!!active&&state.connected&&state.source?.targetRayMode==='tracked-pointer'&&!state.source.hand&&slot.grip.visible);}
  this.input.update(!!active);this.root.visible=!!active;
  const hapticTool=this.input.byHand(this.roles.dominant);if(hapticTool&&(hapticTool.buttons.trigger.justPressed||hapticTool.buttons.grip.justPressed))this.haptics.beginGesture(hapticTool);
  if(this.input.states.some(s=>(s.role==='support'||this.options.toolMode?.()!=='stamp')&&(s.buttons.grip.pressed||s.buttons.grip.rawValue>=.45)))this.options.stroke?.cancel();
  const supportState=this.input.byHand(this.roles.support);
  if(this.options.alternate?.active&&(!supportState?.tracked||!supportState.gripTracked)){this.options.stroke?.cancel();this.options.alternate.cancel();this.input.suspend();}
  const selectedBefore=this.options.layers?.().project.activeLayerId;
  const mode=this.options.toolMode?.()??'clay',menuOwnsInput=!!this.shortcuts.menu||!!this.options.menus?.active;
  const anyGrip=this.input.states.some(s=>s.buttons.grip.pressed||s.buttons.grip.rawValue>=.45);
  if(menuOwnsInput&&anyGrip)this.menuGripBlocked=true;else if(!anyGrip)this.menuGripBlocked=false;
  if(mode!==this.lastTool&&(this.grab?.active||this.layerGrab?.active||this.options.stroke?.active||this.input.states.some(s=>s.buttons.grip.pressed))){this.layerGrab?.cancel();this.grab?.cancel();this.input.suspend();this.shortcuts.reset();this.options.menus?.close();this.options.stroke?.cancel();this.options.alternate?.cancel();this.options.sizing?.reset();this.options.selection?.cancel();this.gesture='idle';}
  if(mode!==this.lastTool)this.haptics.pulse(this.input.byHand(this.roles.dominant),'tool',time);
  this.lastTool=mode;
  if(this.grab){const support=this.input.byHand(this.roles.support),tool=this.input.byHand(this.roles.dominant);
   for(const state of [support,tool])if(state&&(this.grab.active||state.buttons.grip.pressed))this.slots[state.slot].grip.updateWorldMatrix(true,false);
   const allowGrab=!menuOwnsInput&&!this.menuGripBlocked,supportHeld=allowGrab&&!!support?.buttons.grip.pressed,toolHeld=allowGrab&&!!tool?.buttons.grip.pressed;
   const next=supportHeld||!this.layerGrab&&toolHeld?'workspace':toolHeld&&toolAllowsLayerGrab(mode)?'layer':'idle';
   if(this.layerGrab?.active&&(!active||!tool?.connected||!tool.gripTracked)){this.layerGrab.cancel();this.input.suspend();this.gesture='idle';this.shortcuts.reset();this.options.menus?.close();this.options.stroke?.cancel();this.options.alternate?.cancel();this.options.sizing?.reset();this.options.selection?.cancel();return;}
   const transition=next!==this.gesture;
   // Complete the layer transaction before workspace takeover. A held Tool after
   // workspace release starts a fresh anchor at the current pose, without a delta.
   if(transition){this.layerGrab?.finish();this.grab.cancel();}
   const toolPose=tool?this.slots[tool.slot].grip.matrixWorld:undefined;
   const supportPose=support?this.slots[support.slot].grip.matrixWorld:undefined;
   const continued=<T extends typeof tool>(state:T):T=>state&&transition?{...state,buttons:{...state.buttons,grip:{...state.buttons.grip,justPressed:true}}}:state;
   let interrupted=false;
   if(next==='workspace')interrupted=this.grab.step(continued(support),supportPose,tool,toolPose,!!active);
   else if(next==='layer')interrupted=this.layerGrab?.step(continued(tool),toolPose,time,!!active)??false;
   this.gesture=next;
   if(interrupted){this.layerGrab?.cancel();this.grab.cancel();this.input.suspend();this.gesture='idle';}
  }
  const menuWasOpen=!!this.shortcuts.menu;
  this.shortcuts.step(this.input.byHand(this.roles.support),this.input.states,this.options.stroke?.active?'sculpting':this.layerGrab?.active?'layer-grab':this.grab?.state??'idle',time,!!active);
  const menuTool=this.input.byHand(this.roles.dominant);
  if(menuTool&&this.shortcuts.menu)this.slots[menuTool.slot].ray.updateWorldMatrix(true,false);
  if(this.shortcuts.menu){this.options.stroke?.cancel();this.options.alternate?.cancel();}
  const menuDistance=this.options.menus?.update(this.shortcuts.menu,menuTool,menuTool?this.slots[menuTool.slot].ray.matrixWorld:undefined,time,!!active)??null;
  if(!this.shortcuts.menu)this.restoreMenuModels();
  let diagnosticOwned=false;if(this.panel)this.panel.hover=null;
  let demand=!!this.grab?.active||!!this.layerGrab?.active||!!this.options.stroke?.active,feedbackMessage='',feedbackUntil=0;
  for(const state of this.input.states){const slot=this.slots[state.slot],tracked=active&&state.connected&&state.source?.targetRayMode==='tracked-pointer'&&!state.source.hand;
   slot.feedback.update(state,!!this.grab?.owns(state.connectionId)||!!this.layerGrab?.owns(state.connectionId),time);if(slot.feedback.message&&slot.feedback.until>time&&slot.feedback.until>feedbackUntil){feedbackMessage=slot.feedback.message;feedbackUntil=slot.feedback.until;}slot.halo.visible=slot.feedback.halo;slot.halo.material.opacity=this.grab?.active ? .55 : .3;
   slot.rayVisual.visible=!!tracked&&state.tracked&&this.displayMode==='simple'&&!this.grab?.active&&!this.layerGrab?.active;slot.gripVisual.visible=!!tracked&&state.gripTracked&&(this.displayMode!=='minimal'||slot.feedback.halo);slot.body.visible=this.displayMode==='simple'||this.displayMode==='realistic'&&!this.options.models?.ready(state.slot);slot.indicator.visible=this.displayMode!=='realistic'||!this.options.models?.ready(state.slot)||slot.feedback.halo;demand ||= state.buttons.thumbstick.touched;
   const model=this.options.models?.entries[state.slot].asset?.object;if(model)model.visible=!!tracked&&state.gripTracked&&this.displayMode==='realistic';
   if(this.shortcuts.menu){this.overlayMenuModel(slot.gripVisual);if(model)this.overlayMenuModel(model);}
   if(slot.hand!==state.handedness){slot.hand=state.handedness;slot.body.material.color.set(state.handedness==='left'?'#63c8ee':state.handedness==='right'?'#efb665':'#bbbbbb');}
   slot.line.material.color.copy(state.buttons.trigger.pressed?slot.indicator.material.color.set('#ffffff'):slot.body.material.color);slot.line.material.opacity=state.role==='tool'?1:.55;slot.indicator.scale.setScalar(1+state.buttons.trigger.value);slot.indicator.material.color.set(slot.feedback.halo?'#9bc6ba':state.buttons.grip.pressed?'#c2d5c9':'#ffffff');if(state.buttons.trigger.pressed&&!this.grab?.active&&!this.layerGrab?.active)slot.rayVisual.visible=!!tracked&&state.tracked;slot.line.scale.z=1;
   slot.line.renderOrder=this.shortcuts.menu?1001:0;slot.line.material.depthTest=!this.shortcuts.menu;slot.line.material.depthWrite=!this.shortcuts.menu;
   if(this.shortcuts.menu){slot.rayVisual.visible=state.role==='tool'&&!!tracked&&state.tracked;slot.line.scale.z=(menuDistance??1.5)/1.5;slot.line.material.color.set(menuDistance!==null?'#b1e6cd':'#79cde5');}
   // An active tool transaction owns its trigger through release/draining;
   // merely crossing a diagnostics panel must not cancel or redirect it.
   if(tracked&&state.tracked&&this.panel?.group.visible&&!this.options.stroke?.active&&!menuWasOpen&&!this.shortcuts.menu&&!this.grab?.active&&!this.layerGrab?.active){
    slot.ray.updateWorldMatrix(true,false);this.raycaster.ray.origin.setFromMatrixPosition(slot.ray.matrixWorld);this.direction.set(0,0,-1).transformDirection(slot.ray.matrixWorld);this.raycaster.ray.direction.copy(this.direction);this.raycaster.far=2;this.hits.length=0;this.raycaster.intersectObject(this.panel.mesh,false,this.hits);
    const hit=this.hits[0],action=hit?.uv?diagnosticAction(hit.uv,this.panel.expanded):null;
    if(this.panel&&state.role==='tool')this.panel.hover=action;demand ||= !!hit;if(hit&&state.role==='tool')diagnosticOwned=true;
    if(action){slot.rayVisual.visible=!!tracked&&state.tracked;slot.line.scale.z=hit.distance/1.5;slot.line.material.color.set('#9bc6ba');if(state.buttons.trigger.justPressed&&!this.grab?.active&&!this.layerGrab?.active){if(action==='swap')this.setDominant(this.roles.support);else if(action==='toggle')this.setDiagnostics(!this.panel.expanded);else if(action==='display')this.setDisplay(CONTROLLER_DISPLAY_MODES[(CONTROLLER_DISPLAY_MODES.indexOf(this.displayMode)+1)%3]);else if(action==='reset')this.resetWorkspaceView(time);else if(action==='performance')this.setPerformance(!this.panel.performanceEnabled);else{const modes=['hidden','on-demand','always'] as const;this.setHints(modes[(modes.indexOf(this.panel.hints.mode)+1)%3]);}}}
   }
  }
  const strokeTool=this.input.byHand(this.roles.dominant);if(strokeTool){this.slots[strokeTool.slot].ray.updateWorldMatrix(true,false);this.slots[strokeTool.slot].grip.updateWorldMatrix(true,false);}
  const referenceOwned=this.options.references?.step(strokeTool,strokeTool?this.slots[strokeTool.slot].ray.matrixWorld:undefined,!!active&&!menuWasOpen&&!this.shortcuts.menu&&!diagnosticOwned&&!anyGrip&&!this.options.stroke?.active&&!this.grab?.active&&!this.layerGrab?.active)??false;
  const priorMode=this.options.toolMode?.()??'clay',wasDrawing=!!this.options.stroke?.active;
  this.options.alternate?.update(this.input.byHand(this.roles.support),strokeTool,!!active&&!referenceOwned&&!menuWasOpen&&!this.shortcuts.menu&&!diagnosticOwned&&!anyGrip&&!this.menuGripBlocked,wasDrawing);
  this.lastTool=this.options.toolMode?.()??'clay';
  if(priorMode!==this.lastTool)this.haptics.pulse(strokeTool,'tool',time);
  this.options.sizing?.update(strokeTool,this.input.states,time,!!active&&!referenceOwned&&!menuWasOpen&&!this.shortcuts.menu&&!diagnosticOwned&&!this.grab?.active&&!this.layerGrab?.active,!!this.options.stroke?.active,!!this.options.alternate?.active,this.options.stroke?.liveSizing);
  this.options.presentationStep?.(time,referenceOwned||anyGrip||!!this.grab?.active||!!this.layerGrab?.active||!!this.shortcuts.menu,!!active&&!!strokeTool?.tracked&&!!strokeTool.gripTracked);
  this.options.stroke?.update(strokeTool,strokeTool?this.slots[strokeTool.slot].ray.matrixWorld:undefined,time,!!active&&!referenceOwned&&!menuWasOpen&&!this.shortcuts.menu&&!diagnosticOwned&&!this.grab?.active&&!this.layerGrab?.active&&!this.menuGripBlocked&&!this.input.states.some(s=>(s.role==='support'||this.options.toolMode?.()!=='stamp')&&(s.buttons.grip.pressed||s.buttons.grip.rawValue>=.45)),strokeTool?this.slots[strokeTool.slot].grip.matrixWorld:undefined);
  const issueOwned=this.haptics.flush(strokeTool,time);
  if(!issueOwned&&wasDrawing!==!!this.options.stroke?.active&&(this.options.toolMode?.()==='clay'||this.options.toolMode?.()==='smooth'))this.haptics.pulse(strokeTool,this.options.stroke?.active?'stroke-start':'stroke-end',time);
  if(!issueOwned&&this.gesture!=='idle'&&this.gesture!==this.lastHapticGesture)this.haptics.pulse(this.input.byHand(this.gesture==='workspace'?this.roles.support:this.roles.dominant),'grab',time);
  this.lastHapticGesture=this.gesture;
  const selectionDistance=this.options.selection?.update(strokeTool,strokeTool?this.slots[strokeTool.slot].ray.matrixWorld:undefined,time,!!active&&!referenceOwned&&!menuWasOpen&&!this.shortcuts.menu&&!diagnosticOwned&&!this.grab?.active&&!this.layerGrab?.active&&!anyGrip&&!this.menuGripBlocked,!!active)??null;
  if(selectedBefore!==this.options.layers?.().project.activeLayerId)this.haptics.pulse(strokeTool,'selection',time);
  if(mode==='transform'&&strokeTool&&!menuWasOpen&&!this.shortcuts.menu&&!diagnosticOwned&&!this.grab?.active&&!this.layerGrab?.active&&!anyGrip&&strokeTool.tracked){const slot=this.slots[strokeTool.slot];slot.rayVisual.visible=true;slot.line.scale.z=(selectionDistance??1.5)/1.5;slot.line.material.color.set(selectionDistance!==null?'#b4d1ef':'#79cde5');}
  if(this.panel){this.panel.feedback=this.resetNoticeUntil>time?'Workspace view reset':this.options.sizing?.feedback||this.options.alternate?.feedback||this.options.selection?.feedback||this.options.stroke?.feedback||(time<this.shortcuts.until?this.shortcuts.message:'')||feedbackMessage||`Tool: ${this.options.toolMode?.()??mode} · Support grip: workspace · Both: rotate/zoom`;this.panel.interaction=this.options.stroke?.active?'sculpting':this.shortcuts.menu?'menu':this.layerGrab?.active?'layer-grab':this.grab?.state??'idle';this.panel.demand=demand||!!this.options.sizing?.feedback||!!this.shortcuts.menu||time<this.shortcuts.until;this.panel.support=this.roles.support;}
  this.panel?.paint(time,this.input.states,this.inputMs);this.inputMs=performance.now()-start;
 }
 stop():void{this.options.references?.cancel();this.restoreMenuModels();this.shortcuts.reset();this.options.menus?.close();this.options.stroke?.cancel();this.options.alternate?.cancel();this.options.sizing?.reset();this.options.selection?.cancel();this.gesture='idle';this.lastHapticGesture='idle';this.haptics.reset();this.menuGripBlocked=false;this.resetNoticeUntil=0;this.unbind();this.grab?.cancel();this.layerGrab?.cancel();this.options.models?.stop();this.input.reset();this.root.visible=false;this.panel?.stop();for(const slot of this.slots){slot.feedback.reset();slot.halo.visible=false;slot.rayVisual.removeFromParent();slot.gripVisual.removeFromParent();slot.rayVisual.visible=slot.gripVisual.visible=false;}}
 describe():string{return this.input.states.filter(s=>s.connected).map(s=>`${s.handedness}/${s.role}: ${s.tracked?'tracked':'pose lost'} · ${s.mapping} · model ${this.options.models?.entries[s.slot].status??'simple'} ${this.options.models?.entries[s.slot].asset?.profile??''} · trigger ${s.buttons.trigger.value.toFixed(2)} · grip ${s.buttons.grip.value.toFixed(2)} · stick ${s.stick.x.toFixed(2)},${s.stick.y.toFixed(2)}`).join(' | ')||'No connected controllers. Editing remains disabled.';}
 dispose():void{this.stop();for(const slot of this.slots){slot.ray.removeEventListener('connected',slot.connected);slot.ray.removeEventListener('disconnected',slot.disconnected);this.root.remove(slot.ray,slot.grip);}for(const resource of this.resources)resource.dispose();this.panel?.dispose();this.options.models?.dispose();}
}
