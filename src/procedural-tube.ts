import {CatmullRomCurve3,Vector3} from 'three';
import {newId,validateId} from './layers';
import {SDFVolume} from './sdf';
import type {Vec3} from './transform';
import type {VolumeBounds} from './volume-store';
export type TubePoint={id:string;position:Vec3;radius:number};
export type TubeSource={kind:'tube';points:TubePoint[];closed:boolean;interpolation:'centripetal'|'linear'};
export const TUBE_LIMITS={points:256,segments:8192,minRadius:.005,maxRadius:2};
export function validateTube(value:unknown):TubeSource{
 const s=value as TubeSource;if(!s||s.kind!=='tube'||typeof s.closed!=='boolean'||!['centripetal','linear'].includes(s.interpolation)||!Array.isArray(s.points)||s.points.length<2||s.points.length>TUBE_LIMITS.points||s.closed&&s.points.length<3)throw new Error('Tube needs 2–256 points (3 when closed).');
 const ids=new Set<string>();const points=s.points.map(p=>{const id=validateId(p.id);if(ids.has(id))throw new Error('Duplicate tube point ID.');ids.add(id);if(!Array.isArray(p.position)||p.position.length!==3||!p.position.every(v=>Number.isFinite(v)&&Math.abs(v)<=1000)||!Number.isFinite(p.radius)||p.radius<TUBE_LIMITS.minRadius||p.radius>TUBE_LIMITS.maxRadius)throw new Error('Invalid tube point or radius.');return {id,position:[...p.position] as Vec3,radius:p.radius};});
 return {kind:'tube',points,closed:s.closed,interpolation:s.interpolation};
}
export function tubePoint(position:Vec3,radius:number):TubePoint{return {id:newId(),position:[...position],radius};}
export function insertTubePoint(source:TubeSource,index:number):TubeSource{
 const s=validateTube(source);if(!s.closed&&index===s.points.length-1)index--;const a=s.points[index],b=s.points[(index+1)%s.points.length];if(!a||!s.closed&&index===s.points.length-1)throw new Error('Select a segment start to insert after.');s.points.splice(index+1,0,tubePoint(a.position.map((v,i)=>(v+b.position[i])/2) as Vec3,(a.radius+b.radius)/2));return validateTube(s);
}
export function deleteTubePoint(source:TubeSource,id:string):TubeSource{const s=validateTube(source);if(!s.points.some(p=>p.id===id))throw new Error('Point not found.');s.points=s.points.filter(p=>p.id!==id);return validateTube(s);}
type Sample={p:Vector3;r:number};
type Segment={a:Vector3;d:Vector3;length2:number;ra:number;dr:number;min:Vec3;max:Vec3;radius:number};
type Node={min:Vec3;max:Vec3;radius:number;segments?:Segment[];left?:Node;right?:Node};
function node(segments:Segment[]):Node{const min=[0,1,2].map(a=>Math.min(...segments.map(s=>s.min[a]))) as Vec3,max=[0,1,2].map(a=>Math.max(...segments.map(s=>s.max[a]))) as Vec3,radius=Math.max(...segments.map(s=>s.radius));if(segments.length<=8)return {min,max,radius,segments};const axis=max.map((v,i)=>v-min[i]).indexOf(Math.max(...max.map((v,i)=>v-min[i])));segments.sort((a,b)=>a.min[axis]+a.max[axis]-b.min[axis]-b.max[axis]);const mid=segments.length>>1;return {min,max,radius,left:node(segments.slice(0,mid)),right:node(segments.slice(mid))};}
function nodeLower(n:Node,x:number,y:number,z:number):number{const dx=Math.max(n.min[0]-x,0,x-n.max[0]),dy=Math.max(n.min[1]-y,0,y-n.max[1]),dz=Math.max(n.min[2]-z,0,z-n.max[2]);return Math.sqrt(dx*dx+dy*dy+dz*dz)-n.radius;}
function queryNode(n:Node,x:number,y:number,z:number,best:number):number{
 if(nodeLower(n,x,y,z)>=best)return best;
 if(n.segments){for(const s of n.segments){const qx=x-s.a.x,qy=y-s.a.y,qz=z-s.a.z,dot=qx*s.d.x+qy*s.d.y+qz*s.d.z;let t=0;if(s.length2>1e-20){const u=dot/s.length2,perp=Math.max(0,qx*qx+qy*qy+qz*qz-dot*dot/s.length2),den=s.length2-s.dr*s.dr;t=den>1e-20?Math.max(0,Math.min(1,u+s.dr*Math.sqrt(perp/(s.length2*den)))):s.dr>0?1:0;}const dx=qx-t*s.d.x,dy=qy-t*s.d.y,dz=qz-t*s.d.z;best=Math.min(best,Math.sqrt(dx*dx+dy*dy+dz*dz)-s.ra-t*s.dr);}return best;}
 const left=n.left!,right=n.right!;return nodeLower(left,x,y,z)<nodeLower(right,x,y,z)?queryNode(right,x,y,z,queryNode(left,x,y,z,best)):queryNode(left,x,y,z,queryNode(right,x,y,z,best));
}
/** Piecewise swept balls with exact linear-radius segment minimization. The sampled
 * centreline is authoritative for evaluation; resolution never changes source points. */
export class PreparedTube{
 readonly source:TubeSource;readonly samples:Sample[]=[];readonly bounds:VolumeBounds;readonly root:Node;
 constructor(value:TubeSource,readonly tolerance:number){
  this.source=validateTube(value);if(!Number.isFinite(tolerance)||tolerance<=0)throw new Error('Invalid tube tolerance.');
  const s=this.source,points=s.points,curve=new CatmullRomCurve3(points.map(p=>new Vector3(...p.position)),s.closed,'centripetal'),count=s.closed?points.length:points.length-1;
  // Each span uses a conservative control-polygon length density (minimum 8).
  for(let span=0;span<count;span++){
   const a=points[span],b=points[(span+1)%points.length];let length=0;for(let j=-1;j<=1;j++){const wrap=(i:number)=>s.closed?(i+points.length)%points.length:Math.max(0,Math.min(points.length-1,i)),i=wrap(span+j),k=wrap(span+j+1);length+=new Vector3(...points[i].position).distanceTo(new Vector3(...points[k].position));}
   const steps=s.interpolation==='linear'?1:Math.max(8,Math.ceil(length/tolerance));if(this.samples.length+steps+1>TUBE_LIMITS.segments)throw new Error('Tube exceeds the 8192 segment accuracy budget; shorten or simplify it.');
   for(let j=0;j<steps;j++){const u=j/steps,p=s.interpolation==='linear'?new Vector3(...a.position).lerp(new Vector3(...b.position),u):curve.getPoint((span+u)/count),smooth=u*u*(3-2*u);this.samples.push({p,r:a.radius+(b.radius-a.radius)*smooth});}
  }
  this.samples.push({p:s.closed?this.samples[0].p.clone():new Vector3(...points.at(-1)!.position),r:s.closed?points[0].radius:points.at(-1)!.radius});
  const segments=this.samples.slice(1).map((b,i)=>{const a=this.samples[i],d=b.p.clone().sub(a.p);return {a:a.p,d,length2:d.lengthSq(),ra:a.r,dr:b.r-a.r,min:a.p.toArray().map((v,k)=>Math.min(v,b.p.getComponent(k))) as Vec3,max:a.p.toArray().map((v,k)=>Math.max(v,b.p.getComponent(k))) as Vec3,radius:Math.max(a.r,b.r)};});this.root=node(segments);
  this.bounds={min:this.root.min.map(v=>v-this.root.radius-tolerance) as Vec3,max:this.root.max.map(v=>v+this.root.radius+tolerance) as Vec3};
 }
 distance(x:number,y:number,z:number):number{if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z))throw new Error('Tube query must be finite.');return queryNode(this.root,x,y,z,Infinity);}

}
/** Preserve the project lattice spacing, expand in either direction with padding.
 * Cooperative callers check cancellation between <=128 samples and mesh chunks. */
export function* evaluateTube(source:TubeSource,resolution:number,extent=1.6,maxSamples=2*192**3,onAllocate?:(samples:number)=>void):Generator<void,SDFVolume>{
 const step=2*extent/(resolution-1),prepared=new PreparedTube(source,step*.5),min=prepared.bounds.min.map(v=>Math.min(0,Math.floor((v+extent)/step)-3)) as Vec3,max=prepared.bounds.max.map(v=>Math.max(resolution-1,Math.ceil((v+extent)/step)+3)) as Vec3,dimensions=max.map((v,i)=>v-min[i]+1) as Vec3;
 if(dimensions.some(n=>n>512)||dimensions.reduce((n,v)=>n*v,1)>Math.min(2*192**3,maxSamples))throw new Error('Tube exceeds the dense lattice safety budget.');
 onAllocate?.(dimensions.reduce((n,v)=>n*v,1));
 const volume=new SDFVolume(resolution,extent,false,{dimensions,latticeMin:min});let i=0;
 for(let z=0;z<dimensions[2];z++)for(let y=0;y<dimensions[1];y++)for(let x=0;x<dimensions[0];x++){volume.values[i++]=Math.max(-extent*4,Math.min(extent*4,prepared.distance(volume.coordinate(x,0),volume.coordinate(y,1),volume.coordinate(z,2))));if(i%128===0)yield;}
 return volume;
}

/** RDP on position and radius removes oversampling introduced by Steady. */
export function simplifyTubePath<T extends {x:number;y:number;z:number;radius?:number}>(path:readonly T[],tolerance:number):T[]{
 if(path.length<=2)return [...path];const keep=new Set([0,path.length-1]),stack:[[number,number]]|[number,number][]=[[0,path.length-1]];
 while(stack.length){const [first,last]=stack.pop()!,a=path[first],b=path[last],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,length2=dx*dx+dy*dy+dz*dz;let worst=tolerance,index=-1;
  for(let i=first+1;i<last;i++){const p=path[i],u=length2?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy+(p.z-a.z)*dz)/length2)):0,error=Math.max(Math.hypot(p.x-a.x-u*dx,p.y-a.y-u*dy,p.z-a.z-u*dz),a.radius!==undefined&&b.radius!==undefined&&p.radius!==undefined?Math.abs(p.radius-a.radius-u*(b.radius-a.radius)):0);if(error>worst){worst=error;index=i;}}
  if(index>=0){keep.add(index);stack.push([first,index],[index,last]);}
 }
 return [...keep].sort((a,b)=>a-b).map(i=>path[i]);
}
