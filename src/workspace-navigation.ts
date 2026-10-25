import {Matrix4,Quaternion,Vector3} from 'three';
import type {Object3D} from 'three';
import type {XRControllerState} from './xr-input';
import {WorkspaceGrab} from './workspace-grab';
/** Exclusive navigation ownership. Pose/identity loss cancels; ordinary release rebases. */
export class WorkspaceNavigation {
 private readonly single:WorkspaceGrab;
 private dual=false;private ids:number[]=[];
 readonly startPoses=[new Matrix4(),new Matrix4()];
 private readonly initial=new Matrix4();private readonly result=new Matrix4();private readonly local=new Matrix4();
 private readonly startMid=new Vector3();private readonly startVector=new Vector3();private startDistance=1;private startScale=1;
 private readonly a=new Vector3();private readonly b=new Vector3();private readonly mid=new Vector3();private readonly vector=new Vector3();
 private readonly rotation=new Quaternion();private readonly scale=new Vector3();private readonly offset=new Matrix4();
 // Absolute local workspace scale limits; centimetre separation avoids unstable ratios.
 readonly minScale=.001;readonly maxScale=100;readonly minDistance=.03;
 constructor(readonly workspace:Object3D){this.single=new WorkspaceGrab(workspace);}
 get active():boolean{return this.dual||this.single.active;}
 get state(){return this.dual?'two-hand-grab' as const:this.single.state;}
 owns(id:number):boolean{return this.active&&this.ids.includes(id);}
 cancel():void{this.dual=false;this.ids=[];this.single.cancel();}
 private valid(s:XRControllerState|undefined,p:Matrix4|undefined):s is XRControllerState{return !!s&&s.connected&&s.gripTracked&&!!p&&p.elements.every(Number.isFinite)&&Math.abs(p.determinant())>1e-10;}
 private anchor(states:readonly XRControllerState[],poses:readonly Matrix4[]):void{
  poses.forEach((pose,i)=>this.startPoses[i].copy(pose));
  this.single.cancel();this.dual=states.length===2;this.ids=states.map(s=>s.connectionId);
  if(!this.dual){this.single.reanchor(states[0],poses[0]);return;}
  this.workspace.updateWorldMatrix(true,false);this.initial.copy(this.workspace.matrixWorld);this.startScale=this.workspace.scale.x;
  this.a.setFromMatrixPosition(poses[0]);this.b.setFromMatrixPosition(poses[1]);this.startMid.copy(this.a).add(this.b).multiplyScalar(.5);this.startVector.copy(this.b).sub(this.a);this.startDistance=this.startVector.length();this.startVector.normalize();
 }
 /** Input comes from physical handedness, never controller slot order. Returns interruption/rearm. */
 step(support:XRControllerState|undefined,supportPose:Matrix4|undefined,tool:XRControllerState|undefined,toolPose:Matrix4|undefined,sessionActive=true):boolean{
  const states=[support,tool],poses=[supportPose,toolPose];
  if(!sessionActive||this.ids.some(id=>!states.some((s,i)=>s?.connectionId===id&&this.valid(s,poses[i])))){const was=this.active;this.cancel();return was;}
  const held=states.filter((s,i):s is XRControllerState=>this.valid(s,poses[i])&&s.buttons.grip.pressed);
  if(!this.active){if(!support||!held.includes(support)||!support.buttons.grip.justPressed)return false;this.anchor([support],[supportPose!]);}
  const remaining=held.filter(s=>this.ids.includes(s.connectionId));
  if(!remaining.length){this.cancel();return false;}
  if(this.dual&&remaining.length===1){const s=remaining[0];this.anchor([s],[poses[states.indexOf(s)]!]);return false;}
  if(!this.dual&&held.length===2&&held[0].connectionId!==held[1].connectionId){
   this.a.setFromMatrixPosition(supportPose!);this.b.setFromMatrixPosition(toolPose!);
   if(this.a.distanceTo(this.b)>=this.minDistance){this.anchor([support!,tool!],[supportPose!,toolPose!]);return false;}
  }
  if(!this.dual){const s=remaining[0];return this.single.step(s,poses[states.indexOf(s)],true,true);}
  this.a.setFromMatrixPosition(supportPose!);this.b.setFromMatrixPosition(toolPose!);this.mid.copy(this.a).add(this.b).multiplyScalar(.5);this.vector.copy(this.b).sub(this.a);const distance=this.vector.length();
  // Freeze through collapsed hands, then rebase on recovery to avoid an undefined direction jump.
  if(distance<this.minDistance){this.startDistance=0;return false;}
  if(!this.startDistance){this.anchor([support!,tool!],[supportPose!,toolPose!]);return false;}
  this.rotation.setFromUnitVectors(this.startVector,this.vector.normalize());
  const ratio=Math.max(Math.min(this.minScale,this.startScale)/this.startScale,Math.min(Math.max(this.maxScale,this.startScale)/this.startScale,distance/this.startDistance));
  this.result.compose(this.mid,this.rotation,this.scale.setScalar(ratio));this.offset.makeTranslation(-this.startMid.x,-this.startMid.y,-this.startMid.z);this.result.multiply(this.offset).multiply(this.initial);
  if(this.workspace.parent){this.workspace.parent.updateWorldMatrix(true,false);this.local.copy(this.workspace.parent.matrixWorld).invert().multiply(this.result);}else this.local.copy(this.result);
  this.local.decompose(this.workspace.position,this.workspace.quaternion,this.workspace.scale);this.workspace.updateWorldMatrix(false,false);return false;
 }
}
