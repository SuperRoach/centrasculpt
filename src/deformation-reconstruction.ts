import {Mesh,Vector3} from 'three';
import type {Group} from 'three';
import type {Bounds} from './sdf';import {SDFVolume} from './sdf';
import type {RadialMoveField} from './move-field';
import {TriangleDistanceIndex} from './triangle-distance-index';
export type MoveProgress={stage:'copying'|'indexing'|'reconstruction'|'meshing';completed:number;total:number};
export type MovePatch={indices:Uint32Array;before:Float32Array;after:Float32Array;bounds:Bounds|null};
/** Cooperates on elapsed work, not every sample. Each individual triangle/chunk
 * query is synchronous; cancellation/source checks run before every yielded slice. */
export class MoveWork {
 private deadline=performance.now()+3;cpuMs=0;private maxSlice=0;private since=performance.now();slices=0;
 constructor(readonly signal:AbortSignal,private readonly guard:()=>boolean){}
 get maxSliceMs():number{return Math.max(this.maxSlice,performance.now()-this.since);}
 get measuredCPU():number{return this.cpuMs+performance.now()-this.since;}
 check():void{if(this.signal.aborted||!this.guard())throw new Error('Move cancelled · source or session changed.');}
 async pause(force=false):Promise<void>{const now=performance.now();if(!force&&now<this.deadline){if(this.signal.aborted)throw new Error('Move cancelled · source or session changed.');return;}this.check();const elapsed=performance.now()-this.since;this.cpuMs+=elapsed;this.maxSlice=Math.max(this.maxSlice,elapsed);this.slices++;await new Promise<void>(resolve=>setTimeout(resolve,0));this.check();this.since=performance.now();this.deadline=this.since+3;}
}
export async function copyMoveVolume(source:SDFVolume,layout:{dimensions:[number,number,number];latticeMin:[number,number,number]},work:MoveWork,progress:(p:MoveProgress)=>void):Promise<SDFVolume>{
 const next=new SDFVolume(source.resolution,source.extent,false,layout),offset=source.latticeMin.map((v,a)=>v-layout.latticeMin[a]),[nx,ny,nz]=source.dimensions;
 // Same exterior policy as dense growth: positive saturated capacity.
 for(let i=0;i<next.values.length;i+=65536){next.values.fill(Math.fround(source.extent*4),i,Math.min(next.values.length,i+65536));await work.pause();}for(let z=0;z<nz;z++){for(let y=0;y<ny;y++){const from=source.index(0,y,z),to=next.index(offset[0],y+offset[1],z+offset[2]);next.values.set(source.values.subarray(from,from+nx),to);}progress({stage:'copying',completed:z+1,total:nz});await work.pause();}return next;
}
export async function reconstructMove(surface:Group,next:SDFVolume,field:RadialMoveField,work:MoveWork,maxBytes:number,progress:(p:MoveProgress)=>void):Promise<{patch:MovePatch;indexBytes:number;sampled:number}>{
 let vertices=0;for(const object of surface.children)if(object instanceof Mesh)vertices+=object.geometry.getAttribute('position').count;
 if(vertices%3||!vertices)throw new Error('Move source has no complete triangles.');
 // Arrays, radix scratch, hierarchy, plus worst-case patch staging. Count-based
 // byte estimate is a resource check, not a global vertex limit.
 const estimated=vertices*48;if(estimated>maxBytes)throw new Error('Move exceeds available reconstruction memory. Reduce scene detail or influence.');
 const positions=new Float32Array(vertices*3),changed=new Uint8Array(vertices/3),p=new Vector3(),q=new Vector3();let at=0;
 for(const object of surface.children)if(object instanceof Mesh){const source=object.geometry.getAttribute('position');for(let i=0;i<source.count;i++){p.fromBufferAttribute(source,i);field.position(p,q);q.toArray(positions,at*3);if(q.distanceToSquared(p)>1e-24)changed[Math.floor(at/3)]=1;at++;if(at%2048===0){progress({stage:'indexing',completed:at,total:vertices});await work.pause();}}}
 const index=await TriangleDistanceIndex.build(positions,changed,()=>work.pause());progress({stage:'indexing',completed:vertices,total:vertices});
 const box=field.affectedBounds(),dims=next.dimensions,origin=next.bounds.min,halo=3*next.step;
 const lo=box.min.map((v,a)=>Math.max(0,Math.floor((v-halo-origin[a])/next.step))),hi=box.max.map((v,a)=>Math.min(dims[a]-1,Math.ceil((v+halo-origin[a])/next.step))),total=lo.reduce((n,v,a)=>n*Math.max(0,hi[a]-v+1),1);
 // Preallocate bounded patch storage once; subarray views retain owned buffers.
 if(index.bytes+total*24>maxBytes)throw new Error('Move patch exceeds available reconstruction/history memory. Reduce influence or pull distance.');
 const indices=new Uint32Array(total),before=new Float32Array(total),after=new Float32Array(total),bounds:Bounds={min:[...dims],max:[0,0,0]};let count=0,sampled=0;
 for(let z=lo[2];z<=hi[2];z++)for(let y=lo[1];y<=hi[1];y++)for(let x=lo[0];x<=hi[0];x++){
  p.set(next.coordinate(x,0),next.coordinate(y,1),next.coordinate(z,2));const id=next.index(x,y,z),old=next.values[id],weight=field.weight(p);sampled++;
  // Material outside the original compact influence is never removed, including
  // another component overlapped by the dragged surface.
  if(!(weight===0&&old<=0)){index.beginQuery(p,next.step*1e-6);while(!index.stepQuery())await work.pause();const distance=index.distance;
  // Preserve exact values around unchanged components when sign and nearest
  // triangle agree. Moved/removed material still reconstructs consistently.
  if(!(weight===0&&!index.nearestChanged&&(old<0)===(distance<0))){const value=Math.fround(Math.max(-next.extent*4,Math.min(next.extent*4,distance)));if(!Number.isFinite(value)||((x===0||y===0||z===0||x===dims[0]-1||y===dims[1]-1||z===dims[2]-1)&&value<=0))throw new Error('Move reconstruction would clip the positive volume boundary.');if(value!==old){indices[count]=id;before[count]=old;after[count]=value;count++;for(let a=0;a<3;a++){const v=a===0?x:a===1?y:z;bounds.min[a]=Math.min(bounds.min[a],v);bounds.max[a]=Math.max(bounds.max[a],v);}}}
  }
  if(sampled%128===0){progress({stage:'reconstruction',completed:sampled,total});await work.pause();}
 }
 progress({stage:'reconstruction',completed:total,total});return {patch:{indices:indices.subarray(0,count),before:before.subarray(0,count),after:after.subarray(0,count),bounds:count?bounds:null},indexBytes:index.bytes,sampled};
}
