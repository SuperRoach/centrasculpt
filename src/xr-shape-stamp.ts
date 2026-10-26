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
 readonly ghost:ShapeGhost;
 private armed=false;private held=false;private owner=0;private target='';private project:unknown;
 private adjusting=false;private readonly anchor=new Matrix4();private released=false;private continuous=false;private strokeLayers:IndependentLayers|undefined;
 private previous:Matrix4|undefined;private remainder=0;private queue:Matrix4[]=[];private emitted=0;
 private attachmentPose(controller:Matrix4):Matrix4 {
  const a=this.tools.stampAttachment,q=new Quaternion().setFromEuler(new Euler(...this.tools.stampRotation,'XYZ'));
  return controller.clone().multiply(new Matrix4().makeTranslation(0,0,-CLAY_TIP_REACH_METRES)).multiply(new Matrix4().compose(new Vector3(...a.position),new Quaternion(...a.rotation).multiply(q),new Vector3(1,1,1)));
 }
 private definitionAt(controller:Matrix4):ShapeDefinition {
  const d=this.tools.port.shape.definition,p=new Vector3(),q=new Quaternion(),s=new Vector3();
  this.attachmentPose(controller).premultiply(this.inverse).decompose(p,q,s);const e=new Euler().setFromQuaternion(q,'XYZ');
  return {...d,transform:{position:p.toArray(),rotation:[e.x,e.y,e.z],scale:d.transform.scale}};
 }
 private sample(controller:Matrix4,spacing:number):void {
  if(!this.previous){this.previous=controller.clone();return;}
  const p=new Vector3(),q=new Quaternion(),s=new Vector3(),p1=new Vector3(),q1=new Quaternion();this.previous.decompose(p,q,s);controller.decompose(p1,q1,s);
  // Rotation contributes arc length, so wrist turns sample too; a stationary pose emits nothing.
  const length=p.distanceTo(p1)+q.angleTo(q1)*(spacing/this.tools.stampAttachment.spacing*.5+new Vector3(...this.tools.stampAttachment.position).length()+CLAY_TIP_REACH_METRES);
  if(length>1e-8){for(let at=spacing-this.remainder;at<=length+1e-10;at+=spacing){if(this.queue.length+this.emitted>=4096)throw new Error('Continuous stroke limit reached; release and start a shorter stroke.');const t=Math.min(1,at/length);this.queue.push(new Matrix4().compose(p.clone().lerp(p1,t),q.clone().slerp(q1,t),new Vector3(1,1,1)));}this.remainder=(this.remainder+length)%spacing;if(this.remainder<1e-8||spacing-this.remainder<1e-8)this.remainder=0;}
  this.previous.copy(controller);
 }
 private message='';private until=0;private failureUntil=0;
 private readonly inverse=new Matrix4();private readonly parentInverse=new Matrix4();
 private readonly position=new Vector3();private readonly rotation=new Quaternion();private readonly scale=new Vector3();private readonly euler=new Euler();
 constructor(private readonly layers:()=>IndependentLayers,private readonly tools:EditorToolState,root:Group,private readonly changed:()=>void=()=>{}) {
  this.ghost=new ShapeGhost(()=>layers().project.layerStack,tools.port.shape);this.ghost.group.name='VR Shape Ghost · not project data';root.add(this.ghost.group);
 }
 get active():boolean{return this.held||this.adjusting||this.continuous;}
 get feedback():string{return this.message;}
 cancel():void{if(this.continuous)this.strokeLayers?.cancelStroke();this.continuous=false;this.strokeLayers=undefined;this.adjusting=false;this.previous=undefined;this.queue=[];this.emitted=0;this.remainder=0;this.armed=this.held=false;this.owner=0;this.target='';this.project=undefined;this.message='';this.failureUntil=0;this.ghost.group.visible=false;}
 update(tool:XRControllerState|undefined,aim:Matrix4|undefined,time:number,enabled:boolean,gripPose?:Matrix4):void {
  const layers=this.layers(),stack=layers.project.layerStack,pose=gripPose??aim;
  if(!enabled||this.tools.active!=='stamp'||this.tools.port.busy()||this.tools.busy&&!this.continuous||layers.viewMode!=='separate'||!tool?.connected||tool.role!=='tool'||!tool.tracked||!tool.gripTracked||!pose||!pose.elements.every(Number.isFinite)||Math.abs(pose.determinant())<1e-10||this.tools.port.shape.availability(stack)){this.cancel();return;}
  if(this.owner!==tool.connectionId||this.target!==stack.activeLayerId||this.project!==layers.project){this.cancel();this.owner=tool.connectionId;this.target=stack.activeLayerId;this.project=layers.project;}
  const workStart=performance.now();
  try {
   const surface=layers.active.surface.group;surface.updateWorldMatrix(true,false);this.inverse.copy(surface.matrixWorld).invert();
   const grip=tool.buttons.grip.pressed||tool.buttons.grip.rawValue>=.45;
   if(grip){
    if(this.continuous){this.strokeLayers?.cancelStroke();this.continuous=false;this.queue=[];this.previous=undefined;}
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
   this.ghost.group.matrix.copy(surface.matrixWorld);if(this.ghost.group.parent){this.ghost.group.parent.updateWorldMatrix(true,false);this.parentInverse.copy(this.ghost.group.parent.matrixWorld).invert();this.ghost.group.matrix.premultiply(this.parentInverse);}this.ghost.group.updateWorldMatrix(false,true);
   if(growthError)this.message=growthError;
   else if(time<this.failureUntil){/* Keep a failed commit readable while the ghost moves. */}
   else if(outside)this.message=definition.operation==='add'?'Stamp · volume grows on commit':'Subtract overlaps layer bounds · only existing material inside is affected';
   else if(time>=this.until)this.message='Stamp · trigger once; release to rearm';
   if(grip){this.message='Adjust Stamp · move wrist relative to held shape; release grip to attach';return;}
   if(this.continuous){
    if(!this.released){const size=Math.min(...definition.dimensions)*definition.transform.scale[0]*surface.getWorldScale(new Vector3()).x;this.sample(pose,Math.max(.001,size*this.tools.stampAttachment.spacing));if(!tool.buttons.trigger.pressed)this.released=true;}
    const deadline=performance.now()+4;let count=0;
    while(this.queue.length&&count<2&&performance.now()<deadline){const next=this.queue.shift()!;if(layers.stampShape(this.definitionAt(next),true))this.changed();this.emitted++;count++;}
    if(this.released&&!this.queue.length){layers.finishStroke();this.continuous=false;this.strokeLayers=undefined;this.previous=undefined;this.emitted=0;this.remainder=0;this.held=tool.buttons.trigger.pressed;this.armed=!this.held;this.changed();}
    this.message=this.queue.length?`Continuous Stamp · ${this.queue.length} samples pending`:'Continuous Stamp · release for one Undo action';return;
   }
   if(!tool.buttons.trigger.pressed){this.held=false;this.armed=true;return;}
   const apply=this.armed&&!this.held&&tool.buttons.trigger.justPressed;this.armed=false;this.held=true;
   if(!apply)return;
   if(growthError)throw new Error(growthError);
   if(this.tools.stampAttachment.mode==='continuous'){layers.beginStroke();this.released=false;this.continuous=true;this.strokeLayers=layers;this.previous=pose.clone();this.remainder=0;this.emitted=1;const edited=layers.stampShape(definition,true);if(edited)this.changed();return;}
   const edited=layers.stampShape(definition);this.failureUntil=0;this.message=edited?outside&&definition.operation==='subtract'?'Stamp applied · limited to existing material inside layer bounds':'Stamp applied · release trigger for next stamp':'No material changed · release trigger';this.until=time+900;if(edited)this.changed();
  }catch(error){if(this.continuous){this.strokeLayers?.cancelStroke();this.continuous=false;this.strokeLayers=undefined;this.queue=[];this.previous=undefined;}this.armed=false;this.held=tool.buttons.trigger.pressed;this.message=error instanceof Error?error.message:'Stamp could not be applied';this.until=time+(performance.now()-workStart)+5000;this.failureUntil=this.until;}
 }
 dispose():void{this.cancel();this.ghost.dispose();}
}
/** Shared controller arbitration sees one interaction, including Stamp's held-trigger latch. */
export class XRToolInteraction implements XRStrokeInteraction {
 constructor(private readonly tools:EditorToolState,private readonly clay:XRStrokeInteraction,private readonly stamp:XRStrokeInteraction,private readonly move?:XRStrokeInteraction){}
 private get current():XRStrokeInteraction|undefined{return this.tools.active==='move'?this.move:this.tools.active==='stamp'?this.stamp:this.clay;}
 get active():boolean{return this.clay.active||this.stamp.active||!!this.move?.active;}
 get feedback():string{return this.current?.feedback??'';}
 cancel():void{this.clay.cancel();this.stamp.cancel();this.move?.cancel();}
 update(tool:XRControllerState|undefined,pose:Matrix4|undefined,time:number,enabled:boolean,gripPose?:Matrix4):void{
  const current=this.current;if(this.clay!==current)this.clay.cancel();if(this.stamp!==current)this.stamp.cancel();if(this.move&&this.move!==current)this.move.cancel();current?.update(tool,pose,time,enabled,gripPose);
 }
}
