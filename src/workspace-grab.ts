import {Matrix4,Quaternion,Vector3} from 'three';
import type {Object3D} from 'three';
import type {XRControllerState} from './xr-input';
export type XRInteractionState='idle'|'workspace-grab'|'layer-grab'|'two-hand-grab'|'sculpting'|'menu';
/** Navigation only. World-space rigid delta applied to the frozen initial workspace matrix. */
export class WorkspaceGrab {
 state:XRInteractionState='idle';
 private owner=0;
 private readonly inverseAnchor=new Matrix4();private readonly initialWorkspace=new Matrix4();private readonly result=new Matrix4();private readonly local=new Matrix4();
 private readonly position=new Vector3();private readonly rotation=new Quaternion();private readonly scale=new Vector3();private readonly unit=new Vector3(1,1,1);private readonly rigid=new Matrix4();
 constructor(readonly workspace:Object3D){}
 get active():boolean{return this.state==='workspace-grab';}
 private validPose(pose:Matrix4):boolean{
  if(!pose.elements.every(Number.isFinite)||Math.abs(pose.determinant())<1e-10)return false;
  pose.decompose(this.position,this.rotation,this.scale);this.rotation.normalize();this.rigid.compose(this.position,this.rotation,this.unit);return true;
 }
 cancel():void{this.state='idle';this.owner=0;}
 /** Returns true if interrupted (caller must rearm input), retaining the last valid workspace pose. */
 reanchor(support:XRControllerState,pose:Matrix4):void{
  this.validPose(pose);this.workspace.updateWorldMatrix(true,false);this.inverseAnchor.copy(this.rigid).invert();this.initialWorkspace.copy(this.workspace.matrixWorld);this.owner=support.connectionId;this.state='workspace-grab';
 }
 step(support:XRControllerState|undefined,pose:Matrix4|undefined,sessionActive=true,continuation=false):boolean{
  if(!sessionActive||!support?.connected||(support.role!=='support'&&!continuation)||!support.gripTracked||!pose){const interrupted=this.active;this.cancel();return interrupted;}
  if(this.active&&support.connectionId!==this.owner){this.cancel();return true;}
  if(!this.validPose(pose)){const interrupted=this.active;this.cancel();return interrupted;}
  if(this.active&&!support.buttons.grip.pressed){this.cancel();return false;}
  if(!this.active){
   if(!support.buttons.grip.justPressed||!support.buttons.grip.pressed)return false;
   this.workspace.updateWorldMatrix(true,false);this.inverseAnchor.copy(this.rigid).invert();this.initialWorkspace.copy(this.workspace.matrixWorld);this.owner=support.connectionId;this.state='workspace-grab';
  }
  this.result.multiplyMatrices(this.rigid,this.inverseAnchor).multiply(this.initialWorkspace);
  if(this.workspace.parent){this.workspace.parent.updateWorldMatrix(true,false);this.local.copy(this.workspace.parent.matrixWorld).invert().multiply(this.result);}else this.local.copy(this.result);
  this.local.decompose(this.workspace.position,this.workspace.quaternion,this.workspace.scale);this.workspace.updateWorldMatrix(false,false);return false;
 }
}
