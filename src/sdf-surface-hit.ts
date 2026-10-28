import type {Point3} from './sdf';
import type {VolumeStore} from './volume-store';
/** Read-only fallback for a live surface-follow stroke when the derived chunk mesh
 * temporarily has no ray hit during staged edits. Half-voxel marching brackets
 * the current field, never reuses a stale contact or edits empty air. */
export function sdfSurfaceHit(volume:VolumeStore,origin:Point3,direction:Point3,far:number):Point3|null{
 if(![origin.x,origin.y,origin.z,direction.x,direction.y,direction.z,far].every(Number.isFinite)||far<=0)return null;
 const length=Math.hypot(direction.x,direction.y,direction.z);if(length<1e-12)return null;
 const o=[origin.x,origin.y,origin.z],d=[direction.x/length,direction.y/length,direction.z/length],box=volume.bounds;let near=0,end=far;
 for(let a=0;a<3;a++){if(Math.abs(d[a])<1e-12){if(o[a]<box.min[a]||o[a]>box.max[a])return null;continue;}let lo=(box.min[a]-o[a])/d[a],hi=(box.max[a]-o[a])/d[a];if(lo>hi)[lo,hi]=[hi,lo];near=Math.max(near,lo);end=Math.min(end,hi);if(end<near)return null;}
 const steps=Math.max(1,Math.ceil((end-near)/(volume.step*.5)));if(steps>4096)return null;
 const at=(t:number):Point3=>({x:o[0]+d[0]*t,y:o[1]+d[1]*t,z:o[2]+d[2]*t});
 let previous=near,before=volume.sampleLocal(at(near));if(!Number.isFinite(before))return null;if(Math.abs(before)<volume.step*1e-7)return at(near);
 for(let i=1;i<=steps;i++){const current=near+(end-near)*i/steps,value=volume.sampleLocal(at(current));if(!Number.isFinite(value))return null;if(Math.abs(value)<volume.step*1e-7)return at(current);
  if((before<0)!==(value<0)){let lo=previous,hi=current,low=before;for(let n=0;n<18;n++){const middle=(lo+hi)/2,sample=volume.sampleLocal(at(middle));if(!Number.isFinite(sample))return null;if((low<0)===(sample<0)){lo=middle;low=sample;}else hi=middle;}return at((lo+hi)/2);}
  previous=current;before=value;
 }
 return null;
}
