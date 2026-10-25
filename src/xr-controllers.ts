import {BoxGeometry,BufferGeometry,Float32BufferAttribute,Group,Line,LineBasicMaterial,Mesh,MeshBasicMaterial,Raycaster,RingGeometry,DoubleSide,SphereGeometry,Vector3} from 'three';
import type {WebXRManager,Intersection,Object3D} from 'three';
import {XRControllerInput} from './xr-input';
import {XRControllerRoles} from './xr-controller-roles';
import {ControllerFeedback} from './xr-feedback';
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
 readonly input:XRControllerInput;
 readonly grab?:WorkspaceNavigation;
 displayMode:ControllerDisplayMode='realistic';
 readonly slots:readonly Slot[];
 private session:XRSession|null=null;
 private readonly resources:{dispose:()=>void}[]=[];
 private readonly raycaster=new Raycaster();private readonly direction=new Vector3();private readonly hits:Intersection<Object3D>[]=[];
 private readonly event=(event:XRInputSourceEvent)=>{if(this.session?.visibilityState==='visible')this.input.semantic(event.inputSource,event.type.startsWith('select')?'trigger':'grip',event.type.endsWith('start'));};
 private readonly visibility=()=>{if(this.session?.visibilityState!=='visible'){this.input.suspend();this.grab?.cancel();this.root.visible=false;}};
 private readonly ended=()=>this.stop();
 inputMs=0;private resetNoticeUntil=0;
 constructor(manager:Pick<WebXRManager,'getController'|'getControllerGrip'>,private readonly root:Group,readonly roles:XRControllerRoles,private readonly panel?:XRDiagnostics,private readonly changed:()=>void=()=>{},private readonly options:{workspace?:Object3D;models?:ControllerModels;resetView?:()=>boolean;setPerformance?:(enabled:boolean)=>void}={}){
  this.input=new XRControllerInput(roles);if(options.workspace)this.grab=new WorkspaceNavigation(options.workspace);root.visible=false;
  const bodyGeometry=new BoxGeometry(.035,.075,.045),indicatorGeometry=new SphereGeometry(.008,8,6),ringGeometry=new RingGeometry(.03,.032,24),lineGeometry=new BufferGeometry();lineGeometry.setAttribute('position',new Float32BufferAttribute([0,0,0,0,0,-1.5],3));this.resources.push(bodyGeometry,indicatorGeometry,ringGeometry,lineGeometry);
  const slots:Slot[]=[];
  for(let index=0;index<2;index++){
   const ray=manager.getController(index),grip=manager.getControllerGrip(index),rayVisual=new Group(),gripVisual=new Group();ray.name=`XR target ray ${index}`;grip.name=`XR grip ${index}`;
   const material=new MeshBasicMaterial({color:'#79cde5',toneMapped:false}),indicatorMaterial=new MeshBasicMaterial({color:'#ffffff',toneMapped:false}),lineMaterial=new LineBasicMaterial({color:'#79cde5',toneMapped:false,transparent:true,opacity:.8});const haloMaterial=new MeshBasicMaterial({color:'#9bc6ba',transparent:true,opacity:.5,side:DoubleSide,toneMapped:false});this.resources.push(material,indicatorMaterial,lineMaterial,haloMaterial);
   const body=new Mesh(bodyGeometry,material),indicator=new Mesh(indicatorGeometry,indicatorMaterial),line=new Line(lineGeometry,lineMaterial);body.position.y=-.025;indicator.position.set(0,.02,-.02);const halo=new Mesh(ringGeometry,haloMaterial);halo.rotation.x=-Math.PI/2;halo.position.y=-.02;halo.visible=false;gripVisual.add(body,indicator,halo);rayVisual.add(line);root.add(ray,grip);rayVisual.visible=gripVisual.visible=false;
   const connected=(event:{data:XRInputSource})=>{this.input.connect(index,event.data);if(this.session)this.options.models?.connect(index,event.data,grip);},disconnected=()=>{if(this.grab?.active&&this.grab.owns(this.input.states[index].connectionId))this.grab.cancel();this.options.models?.disconnect(index);this.input.disconnect(index);rayVisual.visible=gripVisual.visible=false;this.panel?.invalidate();};
   ray.addEventListener('connected',connected);ray.addEventListener('disconnected',disconnected);slots.push({feedback:new ControllerFeedback(),halo,ray,grip,rayVisual,gripVisual,line,body,indicator,hand:null,connected,disconnected});
  }this.slots=slots;
 }
 start(session:XRSession):void{
  if(this.session===session)return;this.unbind();this.session=session;
  for(const type of ['selectstart','selectend','squeezestart','squeezeend'] as const)session.addEventListener(type,this.event);session.addEventListener('visibilitychange',this.visibility);session.addEventListener('end',this.ended);
  for(const slot of this.slots){slot.ray.add(slot.rayVisual);slot.grip.add(slot.gripVisual);const source=this.input.states[this.slots.indexOf(slot)].source;if(source)this.options.models?.connect(this.slots.indexOf(slot),source,slot.grip);}if(this.panel){this.root.add(this.panel.group);this.panel.start();}this.root.visible=session.visibilityState==='visible';
 }
 private unbind():void{const session=this.session;if(!session)return;for(const type of ['selectstart','selectend','squeezestart','squeezeend'] as const)session.removeEventListener(type,this.event);session.removeEventListener('visibilitychange',this.visibility);session.removeEventListener('end',this.ended);this.session=null;}
 setDominant(hand:unknown):void{this.roles.setDominant(hand);this.grab?.cancel();this.input.suspend();this.panel?.invalidate();this.changed();}
 setDiagnostics(visible:boolean):void{if(this.panel){this.panel.expanded=visible;this.panel.invalidate();}this.changed();}
 setDisplay(value:unknown):void{this.displayMode=validateControllerDisplay(value);this.options.models?.setMode(this.displayMode);if(this.panel){this.panel.displayMode=this.displayMode;this.panel.invalidate();}this.changed();}
 setHints(value:unknown):void{const mode=validateHintMode(value);if(this.panel){this.panel.hints.mode=mode;this.panel.invalidate();}this.changed();}
 resetWorkspaceView(time=performance.now()):boolean{this.grab?.cancel();this.input.suspend();const reset=this.options.resetView?.()??false;if(reset){this.resetNoticeUntil=time+1500;this.panel?.invalidate();}return reset;}
 setPerformance(enabled:boolean):void{if(this.panel){this.panel.performanceEnabled=enabled;this.panel.invalidate();}this.options.setPerformance?.(enabled);this.changed();}
 placePanel(position:{x:number;y:number;z:number},rotation:{x:number;y:number;z:number;w:number}):void{this.panel?.place(position,rotation);}
 update(time:number):void{
  const start=performance.now(),active=this.session?.visibilityState==='visible';
  for(const state of this.input.states){const slot=this.slots[state.slot];this.input.setTracking(state.slot,!!active&&state.connected&&state.source?.targetRayMode==='tracked-pointer'&&!state.source.hand&&slot.ray.visible,!!active&&state.connected&&state.source?.targetRayMode==='tracked-pointer'&&!state.source.hand&&slot.grip.visible);}
  this.input.update(!!active);this.root.visible=!!active;
  if(this.grab){const support=this.input.byHand(this.roles.support),tool=this.input.byHand(this.roles.dominant);
   for(const state of [support,tool])if(state&&(this.grab.active||state.buttons.grip.pressed))this.slots[state.slot].grip.updateWorldMatrix(true,false);
   if(this.grab.step(support,support?this.slots[support.slot].grip.matrixWorld:undefined,tool,tool?this.slots[tool.slot].grip.matrixWorld:undefined,!!active))this.input.suspend();}
  let demand=!!this.grab?.active,feedbackMessage='',feedbackUntil=0;
  for(const state of this.input.states){const slot=this.slots[state.slot],tracked=active&&state.connected&&state.source?.targetRayMode==='tracked-pointer'&&!state.source.hand;
   slot.feedback.update(state,!!this.grab?.owns(state.connectionId),time);if(slot.feedback.message&&slot.feedback.until>time&&slot.feedback.until>feedbackUntil){feedbackMessage=slot.feedback.message;feedbackUntil=slot.feedback.until;}slot.halo.visible=slot.feedback.halo;slot.halo.material.opacity=this.grab?.active ? .55 : .3;
   slot.rayVisual.visible=!!tracked&&state.tracked&&this.displayMode==='simple'&&!this.grab?.active;slot.gripVisual.visible=!!tracked&&state.gripTracked&&(this.displayMode!=='minimal'||slot.feedback.halo);slot.body.visible=this.displayMode==='simple'||this.displayMode==='realistic'&&!this.options.models?.ready(state.slot);slot.indicator.visible=this.displayMode!=='realistic'||!this.options.models?.ready(state.slot)||slot.feedback.halo;demand ||= state.buttons.thumbstick.touched;
   const model=this.options.models?.entries[state.slot].asset?.object;if(model)model.visible=!!tracked&&state.gripTracked&&this.displayMode==='realistic';
   if(slot.hand!==state.handedness){slot.hand=state.handedness;slot.body.material.color.set(state.handedness==='left'?'#63c8ee':state.handedness==='right'?'#efb665':'#bbbbbb');}
   slot.line.material.color.copy(state.buttons.trigger.pressed?slot.indicator.material.color.set('#ffffff'):slot.body.material.color);slot.line.material.opacity=state.role==='tool'?1:.55;slot.indicator.scale.setScalar(1+state.buttons.trigger.value);slot.indicator.material.color.set(slot.feedback.halo?'#9bc6ba':state.buttons.grip.pressed?'#c2d5c9':'#ffffff');if(state.buttons.trigger.pressed&&!this.grab?.active)slot.rayVisual.visible=!!tracked&&state.tracked;slot.line.scale.z=1;
   if(tracked&&state.tracked&&this.panel?.group.visible&&!this.grab?.active){
    slot.ray.updateWorldMatrix(true,false);this.raycaster.ray.origin.setFromMatrixPosition(slot.ray.matrixWorld);this.direction.set(0,0,-1).transformDirection(slot.ray.matrixWorld);this.raycaster.ray.direction.copy(this.direction);this.raycaster.far=2;this.hits.length=0;this.raycaster.intersectObject(this.panel.mesh,false,this.hits);
    const hit=this.hits[0],action=hit?.uv?diagnosticAction(hit.uv,this.panel.expanded):null;
    demand ||= !!hit;
    if(action){slot.rayVisual.visible=!!tracked&&state.tracked;slot.line.scale.z=hit.distance/1.5;slot.line.material.color.set('#9bc6ba');if(state.buttons.trigger.justPressed&&!this.grab?.active){if(action==='swap')this.setDominant(this.roles.support);else if(action==='toggle')this.setDiagnostics(!this.panel.expanded);else if(action==='display')this.setDisplay(CONTROLLER_DISPLAY_MODES[(CONTROLLER_DISPLAY_MODES.indexOf(this.displayMode)+1)%3]);else if(action==='reset')this.resetWorkspaceView(time);else if(action==='performance')this.setPerformance(!this.panel.performanceEnabled);else{const modes=['hidden','on-demand','always'] as const;this.setHints(modes[(modes.indexOf(this.panel.hints.mode)+1)%3]);}}}
   }
  }
  if(this.panel){this.panel.feedback=this.resetNoticeUntil>time?'Workspace view reset':feedbackMessage;this.panel.interaction=this.grab?.state??'idle';this.panel.demand=demand;this.panel.support=this.roles.support;}
  this.panel?.paint(time,this.input.states,this.inputMs);this.inputMs=performance.now()-start;
 }
 stop():void{this.resetNoticeUntil=0;this.unbind();this.grab?.cancel();this.options.models?.stop();this.input.reset();this.root.visible=false;this.panel?.stop();for(const slot of this.slots){slot.feedback.reset();slot.halo.visible=false;slot.rayVisual.removeFromParent();slot.gripVisual.removeFromParent();slot.rayVisual.visible=slot.gripVisual.visible=false;}}
 describe():string{return this.input.states.filter(s=>s.connected).map(s=>`${s.handedness}/${s.role}: ${s.tracked?'tracked':'pose lost'} · ${s.mapping} · model ${this.options.models?.entries[s.slot].status??'simple'} ${this.options.models?.entries[s.slot].asset?.profile??''} · trigger ${s.buttons.trigger.value.toFixed(2)} · grip ${s.buttons.grip.value.toFixed(2)} · stick ${s.stick.x.toFixed(2)},${s.stick.y.toFixed(2)}`).join(' | ')||'No connected controllers. Editing remains disabled.';}
 dispose():void{this.stop();for(const slot of this.slots){slot.ray.removeEventListener('connected',slot.connected);slot.ray.removeEventListener('disconnected',slot.disconnected);this.root.remove(slot.ray,slot.grip);}for(const resource of this.resources)resource.dispose();this.panel?.dispose();this.options.models?.dispose();}
}
