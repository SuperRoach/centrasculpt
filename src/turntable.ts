import {Group,Matrix4,Quaternion,Vector3,type Object3D} from 'three';
export type TurntablePreferences={rpm:number;direction:'clockwise'|'counterclockwise';pivot:[number,number,number]|null};
export const defaultTurntable=():TurntablePreferences=>({rpm:2,direction:'clockwise',pivot:null});
export function validateTurntable(value:unknown):TurntablePreferences{
 const v=value as TurntablePreferences;
 if(!v||!Number.isFinite(v.rpm)||v.rpm<0||v.rpm>12||!['clockwise','counterclockwise'].includes(v.direction)||v.pivot!==null&&(!Array.isArray(v.pivot)||v.pivot.length!==3||!v.pivot.every(n=>Number.isFinite(n)&&Math.abs(n)<=1000)))throw new Error('Invalid turntable preferences.');
 return {rpm:v.rpm,direction:v.direction,pivot:v.pivot===null?null:[...v.pivot]};
}
/** A child of workspace navigation, above sculpture sources. Never serialized or exported. */
export class Turntable {
 readonly group=new Group();readonly centre=new Vector3();angle=0;enabled=false;paused=false;private last:number|null=null;private readonly pivot=new Vector3();private readonly rotation=new Matrix4();private readonly offset=new Matrix4();
 constructor(){this.group.name='Turntable · presentation only';this.group.userData.turntable=true;this.group.userData.turntablePivot=new Vector3();this.group.matrixAutoUpdate=false;}
 reset():void{this.angle=0;this.apply(this.centre);}
 stop():void{this.enabled=false;this.paused=false;this.last=null;this.reset();}
 step(time:number,settings:TurntablePreferences,blocked=false,visible=true):void{
  const dt=this.last===null?0:(time-this.last)/1000;this.last=visible?time:null;
  // Drop suspended time rather than replaying a revolution when tracking resumes.
  if(visible&&this.enabled&&!this.paused&&!blocked&&dt>0&&dt<=.25)this.angle=(this.angle+dt*settings.rpm*Math.PI/30*(settings.direction==='clockwise'?-1:1))%(2*Math.PI);
  this.apply(settings.pivot?this.pivot.fromArray(settings.pivot):this.centre);
 }
 private apply(p:Vector3):void{
  this.group.userData.turntableEnabled=this.enabled;(this.group.userData.turntablePivot as Vector3).copy(p);
  if(!this.enabled){this.group.matrix.identity();}else this.group.matrix.makeTranslation(p.x,p.y,p.z).multiply(this.rotation.makeRotationY(this.angle)).multiply(this.offset.makeTranslation(-p.x,-p.y,-p.z));
  this.group.updateWorldMatrix(true,false);
 }
}
/** Remove only the presentation ancestor; layer/workspace edits still invalidate transactions. */
export function stableSculptMatrix(object:Object3D,out=new Matrix4()):Matrix4{
 object.updateWorldMatrix(true,false);out.copy(object.matrixWorld);
 for(let parent=object.parent;parent;parent=parent.parent)if(parent.userData.turntable){
  const relative=new Matrix4().copy(parent.matrixWorld).invert().multiply(out);
  return out.copy(parent.parent?.matrixWorld??new Matrix4()).multiply(relative);
 }
 return out;
}
export function hasTurntable(object:Object3D):boolean{for(let p: Object3D|null=object;p;p=p.parent)if(p.userData.turntable)return !!p.userData.turntableEnabled;return false;}
export function turntablePivotWorld(object:Object3D):Vector3|undefined{
 for(let p=object.parent;p;p=p.parent)if(p.userData.turntable)return (p.userData.turntablePivot as Vector3).clone().applyMatrix4(p.parent?.matrixWorld??new Matrix4());
 return undefined;
}
/** Interpolate the working point AND target orientation at sub-frame times, then invert.
 * Bounded admission: an impossible jump cancels instead of accumulating replay debt. */
export class RotatingStrokeSampler {
 private point:Vector3|null=null;private matrix=new Matrix4();private time=0;
 reset():void{this.point=null;}
 sample(point:Vector3,matrix:Matrix4,time:number,radius:number,emit:(p:Vector3,t:number)=>void,pivot?:Vector3):void{
  if(!this.point){this.point=point.clone();this.matrix.copy(matrix);this.time=time;emit(point.clone().applyMatrix4(matrix.clone().invert()),time);return;}
  const p0=new Vector3(),p1=new Vector3(),q0=new Quaternion(),q1=new Quaternion(),s0=new Vector3(),s1=new Vector3();this.matrix.decompose(p0,q0,s0);matrix.decompose(p1,q1,s1);
  const a=this.point.clone().applyMatrix4(this.matrix.clone().invert()),b=point.clone().applyMatrix4(matrix.clone().invert());
  const orbit=pivot?Math.max(this.point.distanceTo(pivot),point.distanceTo(pivot))/Math.min(s0.x,s1.x):Math.max(a.length(),b.length());
  const arc=q0.angleTo(q1)*orbit;
  const count=Math.max(1,Math.ceil(Math.max(a.distanceTo(b),this.point.distanceTo(point)/Math.min(s0.x,s1.x)+arc)/(radius*.2)));
  if(count>64)throw new Error('Turntable sample budget exceeded; reduce RPM or increase brush size.');
  for(let i=1;i<=count;i++){const t=i/count,q=q0.clone().slerp(q1,t),position=pivot?p0.clone().sub(pivot).applyQuaternion(q.clone().multiply(q0.clone().invert())).add(pivot):p0.clone().lerp(p1,t),m=new Matrix4().compose(position,q,s0.clone().lerp(s1,t)).invert();emit(this.point.clone().lerp(point,t).applyMatrix4(m),this.time+(time-this.time)*t);}
  this.point.copy(point);this.matrix.copy(matrix);this.time=time;
 }
}
