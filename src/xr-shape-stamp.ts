import {Euler,Group,Matrix4,Quaternion,Vector3} from 'three';
import type {EditorToolState} from './editor-tool-state';
import type {IndependentLayers} from './independent-layers';
import type {XRControllerState} from './xr-input';
import type {XRStrokeInteraction} from './xr-clay-stroke';
import {ShapeGhost} from './shape-preview';
import {localShapeBounds,transformedShapeBounds} from './shape-library';
import {transformMatrix} from './transform';
import {CLAY_TIP_REACH_METRES} from './clay-path';
/** Discrete input adapter only. All voxel, history, meshing and export work remains
 * in IndependentLayers.stampShape, shared with desktop. Ghost lives outside sources. */
export class XRShapeStamp implements XRStrokeInteraction {
 readonly ghost:ShapeGhost;
 private armed=false;private held=false;private owner=0;private target='';private project:unknown;
 private message='';private until=0;
 private readonly inverse=new Matrix4();private readonly pose=new Matrix4();private readonly parentInverse=new Matrix4();
 private readonly position=new Vector3();private readonly direction=new Vector3();private readonly rotation=new Quaternion();private readonly scale=new Vector3();private readonly offset=new Quaternion();private readonly euler=new Euler();
 constructor(private readonly layers:()=>IndependentLayers,private readonly tools:EditorToolState,root:Group,private readonly changed:()=>void=()=>{}) {
  this.ghost=new ShapeGhost(()=>layers().project.layerStack,tools.port.shape);this.ghost.group.name='VR Shape Ghost · not project data';root.add(this.ghost.group);
 }
 get active():boolean{return this.held;}
 get feedback():string{return this.message;}
 cancel():void{this.armed=this.held=false;this.owner=0;this.target='';this.project=undefined;this.message='';this.ghost.group.visible=false;}
 update(tool:XRControllerState|undefined,aim:Matrix4|undefined,time:number,enabled:boolean,gripPose?:Matrix4):void {
  const layers=this.layers(),stack=layers.project.layerStack,pose=gripPose??aim;
  if(!enabled||this.tools.active!=='stamp'||this.tools.busy||layers.viewMode!=='separate'||!tool?.connected||tool.role!=='tool'||!tool.tracked||!tool.gripTracked||tool.buttons.grip.pressed||tool.buttons.grip.rawValue>=.45||!pose||!pose.elements.every(Number.isFinite)||Math.abs(pose.determinant())<1e-10||this.tools.port.shape.availability(stack)){this.cancel();return;}
  if(this.owner!==tool.connectionId||this.target!==stack.activeLayerId||this.project!==layers.project){this.cancel();this.owner=tool.connectionId;this.target=stack.activeLayerId;this.project=layers.project;}
  try {
   const surface=layers.active.surface.group;surface.updateWorldMatrix(true,false);this.inverse.copy(surface.matrixWorld).invert();
   // Offset is physical XR metres; orientation is controller wrist composed with
   // explicit Options offset, then converted through the complete parent chain.
   this.pose.copy(pose);this.position.setFromMatrixPosition(pose);this.direction.set(0,0,-1).transformDirection(pose);this.position.addScaledVector(this.direction,CLAY_TIP_REACH_METRES);this.pose.setPosition(this.position);
   this.pose.premultiply(this.inverse).decompose(this.position,this.rotation,this.scale);
   this.offset.setFromEuler(this.euler.set(...this.tools.stampRotation,'XYZ'));this.rotation.multiply(this.offset);this.euler.setFromQuaternion(this.rotation,'XYZ');
   const model=this.tools.port.shape,d=model.definition;
   model.set({...d,targetLayerId:stack.activeLayerId,transform:{position:this.position.toArray(),rotation:[this.euler.x,this.euler.y,this.euler.z],scale:d.transform.scale}},stack);
   const definition=model.definition,box=transformedShapeBounds(localShapeBounds(definition.kind,definition.dimensions),transformMatrix(definition.transform)),volume=layers.active.volume,b=volume.bounds;
   const outside=box.min.some((v,i)=>v<=b.min[i]+volume.step||box.max[i]>=b.max[i]-volume.step);
   this.ghost.sync();this.ghost.setWarning(outside&&definition.operation==='subtract');
   this.ghost.group.matrix.copy(surface.matrixWorld);if(this.ghost.group.parent){this.ghost.group.parent.updateWorldMatrix(true,false);this.parentInverse.copy(this.ghost.group.parent.matrixWorld).invert();this.ghost.group.matrix.premultiply(this.parentInverse);}this.ghost.group.updateWorldMatrix(false,true);
   if(outside)this.message=definition.operation==='add'?'Stamp · volume grows on commit':'Subtract overlaps layer bounds · only existing material inside is affected';
   else if(time>=this.until)this.message='Stamp · trigger once; release to rearm';
   if(!tool.buttons.trigger.pressed){this.held=false;this.armed=true;return;}
   const apply=this.armed&&!this.held&&tool.buttons.trigger.justPressed;this.armed=false;this.held=true;
   if(!apply)return;
   const edited=layers.stampShape(definition);this.message=edited?outside&&definition.operation==='subtract'?'Stamp applied · limited to existing material inside layer bounds':'Stamp applied · release trigger for next stamp':'No material changed · release trigger';this.until=time+900;if(edited)this.changed();
  }catch(error){this.armed=false;this.held=tool.buttons.trigger.pressed;this.message=error instanceof Error?error.message:'Stamp could not be applied';this.until=time+1500;}
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
