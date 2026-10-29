import {stableSculptMatrix} from './turntable';
import {XRMirrorPlane} from './xr-mirror-plane';
import {Euler,Group,Matrix4,Quaternion,Vector3} from 'three';
import type {ShapeDefinition} from './shapes';
import type {EditorToolState} from './editor-tool-state';
import type {IndependentLayers} from './independent-layers';
import type {XRControllerState} from './xr-input';
import type {XRStrokeInteraction} from './xr-clay-stroke';
import {ShapeGhost} from './shape-preview';
import {localShapeBounds,transformedShapeBounds} from './shape-library';
import {transformMatrix} from './transform';
import {SDFVolume} from './sdf';
import {planDenseGrowth} from './dense-growth';
import {CLAY_TIP_REACH_METRES} from './clay-path';
/** Controller input adapter. All voxel, history, meshing and export work remains
 * in IndependentLayers.stampShape, shared with desktop. Ghost lives outside sources. */
export class XRShapeStamp implements XRStrokeInteraction {
 readonly ghost:ShapeGhost;readonly pendingPreview=new Group();private readonly trail:Group[]=[];private pendingPose:Matrix4|null=null;
 private paintPending(surface:Matrix4):void{
  const poses=[...(this.pendingPose?[this.pendingPose]:[]),...this.queue].slice(0,16);this.pendingPreview.visible=this.continuous&&poses.length>0;
  if(!this.pendingPreview.visible)return;
  this.pendingPreview.matrix.copy(surface);if(this.pendingPreview.parent){this.pendingPreview.parent.updateWorldMatrix(true,false);this.pendingPreview.matrix.premultiply(new Matrix4().copy(this.pendingPreview.parent.matrixWorld).invert());}
  const mirror=this.layers().symmetry;
  for(let i=0;i<32;i++){
   const source=this.ghost.group.children[i%2];if(!source)continue;
   if(i>=poses.length*2||i%2&&!mirror.enabled){if(this.trail[i])this.trail[i].visible=false;continue;}
   if(!this.trail[i]){const clone=source.clone(true) as Group;clone.traverse(o=>{o.raycast=()=>{};});this.trail[i]=clone;this.pendingPreview.add(clone);}
   const clone=this.trail[i];clone.visible=true;clone.matrixAutoUpdate=false;const currentInverse=this.inverse.clone();this.inverse.copy(this.strokeAnchor).invert();clone.matrix.copy(transformMatrix(this.definitionAt(poses[Math.floor(i/2)]).transform));this.inverse.copy(currentInverse);
   if(i%2){const scale=new Vector3(1,1,1);scale[mirror.axis]=-1;const reflection=new Matrix4().makeScale(scale.x,scale.y,scale.z);reflection.elements[12+'xyz'.indexOf(mirror.axis)]=2*mirror.offset;clone.matrix.premultiply(reflection);}
  }
  this.pendingPreview.updateWorldMatrix(false,true);
 }
 private armed=false;private held=false;private owner=0;private target='';private project:unknown;
 private strokeSettings:{definition:ShapeDefinition;attachment:EditorToolState['stampAttachment'];rotation:[number,number,number]}|null=null;
 private adjusting=false;private readonly anchor=new Matrix4();private released=false;private continuous=false;private strokeLayers:IndependentLayers|undefined;
 private pending:Generator<void,boolean>|null=null;private readonly strokeAnchor=new Matrix4();private readonly stableAnchor=new Matrix4();
 private previous:Matrix4|undefined;private remainder=0;private queue:Matrix4[]=[];private emitted=0;
 private attachmentPose(controller:Matrix4):Matrix4 {
  const a=this.strokeSettings?.attachment??this.tools.stampAttachment,q=new Quaternion().setFromEuler(new Euler(...(this.strokeSettings?.rotation??this.tools.stampRotation),'XYZ'));
  return controller.clone().multiply(new Matrix4().makeTranslation(0,0,-CLAY_TIP_REACH_METRES)).multiply(new Matrix4().compose(new Vector3(...a.position),new Quaternion(...a.rotation).multiply(q),new Vector3(1,1,1)));
 }
 private definitionAt(controller:Matrix4):ShapeDefinition {
  const d=this.strokeSettings?.definition??this.tools.port.shape.definition,p=new Vector3(),q=new Quaternion(),s=new Vector3();
  this.attachmentPose(controller).premultiply(this.inverse).decompose(p,q,s);const e=new Euler().setFromQuaternion(q,'XYZ');
  return {...d,transform:{position:p.toArray(),rotation:[e.x,e.y,e.z],scale:d.transform.scale}};
 }
 private sample(controller:Matrix4,spacing:number):void {
  if(!this.previous){this.previous=controller.clone();return;}
  const p=new Vector3(),q=new Quaternion(),s=new Vector3(),p1=new Vector3(),q1=new Quaternion();this.previous.decompose(p,q,s);controller.decompose(p1,q1,s);
  // Captured poses include inverse turntable motion. Wrist/object rotation contributes arc length.
  const length=p.distanceTo(p1)+q.angleTo(q1)*(spacing/(this.strokeSettings?.attachment.spacing??this.tools.stampAttachment.spacing)*.5+new Vector3(...(this.strokeSettings?.attachment.position??this.tools.stampAttachment.position)).length()+CLAY_TIP_REACH_METRES);
  if(length>1e-8){const needed=Math.floor((length+this.remainder)/spacing+1e-10);if(needed>64||this.queue.length+needed>256)throw new Error('Continuous stroke limit: sample budget exceeded; reduce RPM or increase spacing.');for(let at=spacing-this.remainder;at<=length+1e-10;at+=spacing){if(this.queue.length+this.emitted>=4096)throw new Error('Continuous stroke limit reached; release and start a shorter stroke.');const t=Math.min(1,at/length);this.queue.push(new Matrix4().compose(p.clone().lerp(p1,t),q.clone().slerp(q1,t),new Vector3(1,1,1)));}this.remainder=(this.remainder+length)%spacing;if(this.remainder<1e-8||spacing-this.remainder<1e-8)this.remainder=0;}
  this.previous.copy(controller);
 }
 private message='';private until=0;private failureUntil=0;
 private readonly inverse=new Matrix4();private readonly parentInverse=new Matrix4();
 private readonly position=new Vector3();private readonly rotation=new Quaternion();private readonly scale=new Vector3();private readonly euler=new Euler();
 constructor(private readonly layers:()=>IndependentLayers,private readonly tools:EditorToolState,root:Group,private readonly changed:()=>void=()=>{},private readonly issue:(event:'cancel'|'error')=>void=()=>{}) {
  this.ghost=new ShapeGhost(()=>layers().project.layerStack,tools.port.shape);this.ghost.group.name='VR Shape Ghost · not project data';root.add(this.ghost.group);this.pendingPreview.matrixAutoUpdate=false;this.pendingPreview.visible=false;this.pendingPreview.name='Pending Stamp preview · at most 16 samples · not source geometry';root.add(this.pendingPreview);
 }
 get active():boolean{return this.held||this.adjusting||this.continuous;}
 get draining():boolean{return this.continuous&&this.released;}
 get feedback():string{return this.message;}
 cancel():void{if(this.active)this.issue('cancel');this.pendingPreview.visible=false;this.pendingPose=null;this.pending?.return(false);this.pending=null;if(this.continuous)this.strokeLayers?.cancelStroke();this.continuous=false;this.strokeSettings=null;this.strokeLayers=undefined;this.adjusting=false;this.previous=undefined;this.queue=[];this.emitted=0;this.remainder=0;this.armed=this.held=false;this.owner=0;this.target='';this.project=undefined;this.message='';this.failureUntil=0;this.ghost.group.visible=false;}
 update(tool:XRControllerState|undefined,aim:Matrix4|undefined,time:number,enabled:boolean,gripPose?:Matrix4):void {
  const layers=this.layers(),stack=layers.project.layerStack,pose=gripPose??aim;
  if(this.draining){
   try{if(!enabled||this.tools.active!=='stamp'||this.tools.port.busy()||layers!==this.strokeLayers||layers.project!==this.project||stack.activeLayerId!==this.target||!layers.drawing||layers.viewMode!=='separate'||this.tools.port.shape.availability(stack))throw new Error('Stamp queue target is unavailable.');
    const surface=layers.active.surface.group;surface.updateWorldMatrix(true,false);this.ghost.group.visible=false;this.pumpContinuous(layers,surface.matrixWorld,performance.now(),!!tool?.connected&&tool.tracked&&tool.gripTracked&&tool.role==='tool'&&tool.connectionId===this.owner&&!tool.buttons.trigger.pressed);
   }catch(error){this.cancel();this.issue('error');this.message=error instanceof Error?error.message:'Stamp queue cancelled';this.until=this.failureUntil=time+5000;}
   return;
  }
  if(!enabled||this.tools.active!=='stamp'||this.tools.port.busy()||this.tools.busy&&!this.continuous||layers.viewMode!=='separate'||!tool?.connected||tool.role!=='tool'||!tool.tracked||!tool.gripTracked||!pose||!pose.elements.every(Number.isFinite)||Math.abs(pose.determinant())<1e-10||this.tools.port.shape.availability(stack)){this.cancel();return;}
  if(this.owner!==tool.connectionId||this.target!==stack.activeLayerId||this.project!==layers.project){this.cancel();this.owner=tool.connectionId;this.target=stack.activeLayerId;this.project=layers.project;}
  const workStart=performance.now();
  try {
   const surface=layers.active.surface.group;surface.updateWorldMatrix(true,false);this.inverse.copy(surface.matrixWorld).invert();
   const grip=tool.buttons.grip.pressed||tool.buttons.grip.rawValue>=.45;
   if(grip){
    if(this.continuous){this.issue('cancel');this.pending?.return(false);this.pending=null;this.pendingPose=null;this.strokeLayers?.cancelStroke();this.continuous=false;this.strokeSettings=null;this.queue=[];this.previous=undefined;}
    if(!this.adjusting){this.anchor.copy(this.attachmentPose(pose));this.adjusting=true;}
    const working=pose.clone().multiply(new Matrix4().makeTranslation(0,0,-CLAY_TIP_REACH_METRES));
    working.invert().multiply(this.anchor).decompose(this.position,this.rotation,this.scale);
    this.rotation.multiply(new Quaternion().setFromEuler(new Euler(...this.tools.stampRotation,'XYZ')).invert());
    this.tools.stampAttachment.position.splice(0,3,...this.position.toArray());this.tools.stampAttachment.rotation.splice(0,4,...this.rotation.toArray());
    this.armed=false;this.held=tool.buttons.trigger.pressed;
   }else if(this.adjusting){this.adjusting=false;this.armed=false;this.tools.port.changed();}
   const current=this.definitionAt(pose);this.position.fromArray(current.transform.position);this.euler.set(...current.transform.rotation,'XYZ');
   const model=this.tools.port.shape,d=model.definition;
   model.set({...d,targetLayerId:stack.activeLayerId,transform:{position:this.position.toArray(),rotation:[this.euler.x,this.euler.y,this.euler.z],scale:d.transform.scale}},stack);
   const definition=model.definition,box=transformedShapeBounds(localShapeBounds(definition.kind,definition.dimensions),transformMatrix(definition.transform)),volume=layers.active.volume,b=volume.bounds;
   if(layers.symmetry.enabled){const a='xyz'.indexOf(layers.symmetry.axis),lo=box.min[a],hi=box.max[a];box.min[a]=Math.min(lo,2*layers.symmetry.offset-hi);box.max[a]=Math.max(hi,2*layers.symmetry.offset-lo);}
   const outside=box.min.some((v,i)=>v<=b.min[i]+volume.step||box.max[i]>=b.max[i]-volume.step);
   // Cheap storage admission check before the trigger. A preview may
   // otherwise advertise growth that the fixed-detail dense limits cannot fit.
   let growthError='';
   if(outside&&definition.operation==='add'&&volume instanceof SDFVolume)try{planDenseGrowth(volume,box,layers.growthLimits);}catch(error){growthError=error instanceof Error?error.message:'Stamp growth exceeds available storage.';}
   this.ghost.mirror=layers.symmetry;this.ghost.sync();this.ghost.setWarning(!!growthError||outside&&definition.operation==='subtract');
   this.ghost.group.matrix.copy(surface.matrixWorld);if(this.ghost.group.parent){this.ghost.group.parent.updateWorldMatrix(true,false);this.parentInverse.copy(this.ghost.group.parent.matrixWorld).invert();this.ghost.group.matrix.premultiply(this.parentInverse);}this.ghost.group.updateWorldMatrix(false,true);this.paintPending(surface.matrixWorld);
   if(growthError)this.message=growthError;
   else if(time<this.failureUntil){/* Keep a failed commit readable while the ghost moves. */}
   else if(outside)this.message=definition.operation==='add'?'Stamp · volume grows on commit':'Subtract overlaps layer bounds · only existing material inside is affected';
   else if(time>=this.until)this.message='Stamp · trigger once; release to rearm';
   if(grip){this.message='Adjust Stamp · move wrist relative to held shape; release grip to attach';return;}
   if(this.continuous){
    if(stableSculptMatrix(surface).elements.some((v,i)=>Math.abs(v-this.stableAnchor.elements[i])>1e-9))throw new Error('Stamp cancelled: target/workspace moved');
    if(!this.released){const size=Math.min(...definition.dimensions)*definition.transform.scale[0]*surface.getWorldScale(new Vector3()).x;this.sample(this.strokeAnchor.clone().multiply(this.inverse).multiply(pose),Math.max(.001,size*(this.strokeSettings?.attachment.spacing??this.tools.stampAttachment.spacing)));if(!tool.buttons.trigger.pressed)this.released=true;}
    this.pumpContinuous(layers,surface.matrixWorld,workStart,!tool.buttons.trigger.pressed);return;
   }
   if(!tool.buttons.trigger.pressed){this.held=false;this.armed=true;return;}
   const apply=this.armed&&!this.held&&tool.buttons.trigger.justPressed;this.armed=false;this.held=true;
   if(!apply)return;
   if(growthError)throw new Error(growthError);
   if(this.tools.stampAttachment.mode==='continuous'){this.pendingPreview.clear();this.trail.length=0;layers.beginStroke();this.released=false;this.strokeSettings=structuredClone({definition,attachment:this.tools.stampAttachment,rotation:this.tools.stampRotation});this.continuous=true;this.strokeLayers=layers;this.previous=pose.clone();this.remainder=0;this.emitted=0;this.strokeAnchor.copy(surface.matrixWorld);this.stableAnchor.copy(stableSculptMatrix(surface));this.queue=[pose.clone()];this.message='Continuous Stamp · preview now, final surface staged';this.paintPending(surface.matrixWorld);return;}
   const edited=layers.stampShape(definition);this.failureUntil=0;this.message=edited?outside&&definition.operation==='subtract'?'Stamp applied · limited to existing material inside layer bounds':'Stamp applied · release trigger for next stamp':'No material changed · release trigger';this.until=time+900;if(edited)this.changed();
  }catch(error){this.issue('error');this.pendingPreview.visible=false;this.pendingPose=null;this.pending?.return(false);this.pending=null;if(this.continuous){this.strokeLayers?.cancelStroke();this.continuous=false;this.strokeSettings=null;this.strokeLayers=undefined;this.queue=[];this.previous=undefined;}this.armed=false;this.held=tool.buttons.trigger.pressed;this.message=error instanceof Error?error.message:'Stamp could not be applied';this.until=time+(performance.now()-workStart)+5000;this.failureUntil=this.until;}
 }
 private pumpContinuous(layers:IndependentLayers,surface:Matrix4,workStart:number,rearm=false):void{
  if(stableSculptMatrix(layers.active.surface.group).elements.some((v,i)=>Math.abs(v-this.stableAnchor.elements[i])>1e-9))throw new Error('Stamp cancelled: target/workspace moved');
    this.inverse.copy(this.strokeAnchor).invert();
    const deadline=performance.now()+4;let count=0;
    while((this.pending||this.queue.length)&&count<2&&performance.now()<deadline){
     if(!this.pending){this.pendingPose=this.queue.shift()!;this.pending=layers.stampShapeSteps(this.definitionAt(this.pendingPose),true,true);this.emitted++;}
     const result=this.pending.next();if(result.done){this.pending=null;this.pendingPose=null;if(result.value)this.changed();count++;}
    }
    // Coalesce dirty chunks across stamps instead of draining a whole stamp
    // before the next pose. Finish only after the existing two-chunk drain.
    layers.active.rebuild(2,Math.min(3,Math.max(0,4-(performance.now()-workStart))));
    if(this.released&&!this.queue.length&&!this.pending&&!layers.active.mesher.pendingChunks){layers.finishStroke();this.continuous=false;this.strokeLayers=undefined;this.previous=undefined;this.emitted=0;this.remainder=0;this.held=false;this.armed=rearm;this.strokeSettings=null;this.changed();}
    this.paintPending(surface);if(!this.continuous){this.message='Continuous Stamp finished';return;}this.message=this.queue.length||this.pending?`Continuous Stamp · ${this.queue.length+Number(!!this.pending)} samples pending · ${this.released?'finishing captured poses':'preview tracks hand'}`:layers.active.mesher.pendingChunks?`Continuous Stamp · ${layers.active.mesher.pendingChunks} chunks finishing`:'Continuous Stamp · release for one Undo action';return;
 }
 dispose():void{this.cancel();this.pendingPreview.removeFromParent();this.pendingPreview.clear();this.trail.length=0;this.ghost.dispose();}
}
/** Shared controller arbitration sees one interaction, including Stamp's held-trigger latch. */
export class XRToolInteraction implements XRStrokeInteraction {
 constructor(private readonly tools:EditorToolState,private readonly clay:XRStrokeInteraction,private readonly stamp:XRStrokeInteraction,private readonly move?:XRStrokeInteraction,readonly mirror?:XRMirrorPlane,private readonly tube?:XRStrokeInteraction){}
 private get current():XRStrokeInteraction|undefined{return this.tools.active==='tube'||this.tools.active==='edit-spline'?this.tube:this.tools.active==='move'?this.move:this.tools.active==='stamp'?this.stamp:this.clay;}
 get active():boolean{return !!this.tube?.active||!!this.mirror?.active||this.clay.active||this.stamp.active||!!this.move?.active;}
 get liveSizing(){return this.current?.liveSizing??null;}
 get feedback():string{return this.mirror?.hover||this.mirror?.active?this.mirror.feedback:this.current?.feedback??'';}
 cancel():void{this.tube?.cancel();this.mirror?.cancel();this.clay.cancel();this.stamp.cancel();this.move?.cancel();}
 update(tool:XRControllerState|undefined,pose:Matrix4|undefined,time:number,enabled:boolean,gripPose?:Matrix4):void{
  const current=this.current;if(this.tube&&this.tube!==current)this.tube.cancel();if(this.mirror?.update(tool,pose,enabled,!this.tube?.active&&!this.clay.active&&!this.stamp.active&&!this.move?.active,gripPose)){current?.cancel();return;}if(this.clay!==current)this.clay.cancel();if(this.stamp!==current)this.stamp.cancel();if(this.move&&this.move!==current)this.move.cancel();current?.update(tool,pose,time,enabled,gripPose);
 }
}
