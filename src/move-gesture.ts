import {Quaternion,Vector3} from 'three';
/** Pose-relative output; previous rotation selects an equivalent angle branch only.
 * No velocity integration, frame-time smoothing or cumulative mesh deformation. */
export class MoveGesture {
 readonly axis=new Vector3(0,1,0);angle=0;
 private readonly previous=new Vector3();private readonly priorAxis=new Vector3(0,1,0);private hasAxis=false;private readonly candidate=new Vector3();private readonly q=new Quaternion();
 private gain=1;private threshold=.0003;private previousAngle=0;
 capture(precision:boolean,localUnitsPerMeter:number):void{this.gain=precision?.25:1;this.threshold=.0003*localUnitsPerMeter;this.previous.set(0,0,0);this.previousAngle=0;this.hasAxis=false;this.priorAxis.set(0,1,0);this.axis.set(0,1,0);this.angle=0;}
 /** Identity outside twice the noise floor, C1 transition, exact zero at rest. */
 private response(value:number,threshold:number):number{const magnitude=Math.abs(value);if(magnitude<=threshold)return 0;if(magnitude>=threshold*2)return value;const t=(magnitude-threshold)/threshold;return value*t*t*(3-2*t);}
 translation(delta:Vector3,out:Vector3,lock:'free'|'x'|'y'|'z'='free'):Vector3{out.copy(delta);if(lock!=='free')for(const a of ['x','y','z'] as const)if(a!==lock)out[a]=0;const length=out.length();return length?out.multiplyScalar(this.gain*this.response(length,this.threshold)/length):out.set(0,0,0);}
 rotation(delta:Quaternion,lock:'free'|'x'|'y'|'z',strength:number,limitDegrees:number,snapDegrees=0):void{
  const q=this.q.copy(delta).normalize();if(q.w<0)q.set(-q.x,-q.y,-q.z,-q.w);
  let angle:number;
  if(lock==='free'){
   this.axis.set(q.x,q.y,q.z);const length=this.axis.length();
   if(length>1e-9){this.axis.multiplyScalar(1/length);angle=2*Math.atan2(length,q.w);if(this.hasAxis&&this.axis.dot(this.priorAxis)<0){this.axis.negate();angle=-angle;}if(Math.abs(angle)>.2*Math.PI/180){this.priorAxis.copy(this.axis);this.hasAxis=true;}}else{this.axis.copy(this.priorAxis);angle=0;}
   let best=this.candidate.copy(this.axis).multiplyScalar(angle).distanceToSquared(this.previous),chosen=angle;
   for(let turn=-2;turn<=2;turn++){const option=angle+turn*2*Math.PI,distance=this.candidate.copy(this.axis).multiplyScalar(option).distanceToSquared(this.previous);if(distance<best-1e-12){best=distance;chosen=option;}}
   angle=chosen;this.previous.copy(this.axis).multiplyScalar(angle);
  }else{
   this.axis.set(lock==='x'?1:0,lock==='y'?1:0,lock==='z'?1:0);
   const projection=q.x*this.axis.x+q.y*this.axis.y+q.z*this.axis.z;
   // At the swing/twist singularity retain the previous branch instead of jumping.
   angle=Math.hypot(projection,q.w)<1e-8?this.previousAngle:2*Math.atan2(projection,q.w);
   angle+=2*Math.PI*Math.round((this.previousAngle-angle)/(2*Math.PI));this.previousAngle=angle;
  }
  const limit=limitDegrees*Math.PI/180;
  this.angle=Math.max(-limit,Math.min(limit,this.response(angle,.2*Math.PI/180)*strength*this.gain));
  if(snapDegrees>0){const step=snapDegrees*Math.PI/180;this.angle=Math.sign(this.angle)*Math.min(Math.floor(limit/step)*step,Math.round(Math.abs(this.angle)/step)*step);}
 }
}
