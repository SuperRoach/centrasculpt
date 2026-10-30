import {Color,Vector3} from 'three';
import {SculptMask,sculptMask,type MaskSnapshot,maskSnapshotBytes} from './sculpt-mask';
import type {VolumeStore} from './volume-store';
import {reflectPoint,type Point3,type Bounds,type MirrorPlane} from './sdf';
import type {RadialMoveField} from './move-field';
export type PaintSnapshot=[MaskSnapshot,MaskSnapshot,MaskSnapshot,MaskSnapshot];
export const PAINT_SWATCHES=['#e34b45','#f5a623','#f4df75','#54ae71','#3a9dd9','#7655bf','#df75ac','#ffffff','#242832','#afbd94'];
/** Premultiplied linear RGB + coverage. Unpainted samples inherit the layer colour.
 * Lazy COW pages share immutable history; never share writable sample arrays. */
export class SculptPaint {
 readonly channels:SculptMask[]; colour='#e34b45';
 constructor(readonly volume:VolumeStore){this.channels=Array.from({length:4},()=>new SculptMask(volume));}
 get revision(){return this.channels.reduce((n,c)=>n+c.revision,0);}
 get empty(){return this.channels.every(c=>c.empty);}
 get memoryBytes(){return this.channels.reduce((n,c)=>n+c.memoryBytes,0);}
 snapshot():PaintSnapshot{return this.channels.map(c=>c.snapshot()) as PaintSnapshot;}
 restore(s:PaintSnapshot){this.channels.forEach((c,i)=>c.restore(s[i]));}
 clear(){this.channels.forEach(c=>c.uniform(0));}
 sample(p:Point3,base:Color,out:Color):Color{const a=this.channels[3].sample(p);return out.setRGB(this.channels[0].sample(p)+base.r*(1-a),this.channels[1].sample(p)+base.g*(1-a),this.channels[2].sample(p)+base.b*(1-a));}
 *brush(center:Point3,radius:number,amount:number,hardness:number,erase:boolean,mirror?:MirrorPlane):Generator<void,Bounds|null>{
  const v=this.volume,dims=v.dimensions,points=[center,...(mirror?.enabled?[reflectPoint(center,mirror)]:[])],bounds:Bounds={min:[...dims],max:[0,0,0]},rgb=new Color(this.colour),colour=[rgb.r,rgb.g,rgb.b,1],mask=sculptMask(v);let changed=false,processed=0;
  const lo=[0,1,2].map(a=>Math.max(0,Math.floor((Math.min(...points.map(c=>[c.x,c.y,c.z][a]))-radius-v.bounds.min[a])/v.step))),hi=[0,1,2].map(a=>Math.min(dims[a]-1,Math.ceil((Math.max(...points.map(c=>[c.x,c.y,c.z][a]))+radius-v.bounds.min[a])/v.step)));
  for(let z=lo[2];z<=hi[2];z++)for(let y=lo[1];y<=hi[1];y++)for(let x=lo[0];x<=hi[0];x++){
   if(processed++%128===127)yield;const id=v.index(x,y,z);if(Math.abs(v.readVoxel(id))>v.step*2)continue;
   const px=v.coordinate(x,0),py=v.coordinate(y,1),pz=v.coordinate(z,2);let d=Infinity;for(const c of points)d=Math.min(d,Math.hypot(px-c.x,py-c.y,pz-c.z)/radius);if(d>=1)continue;
   const inner=Math.max(0,Math.min(.9,hardness*.9)),t=Math.max(0,(d-inner)/(1-inner)),w=Math.min(1,amount)*(1-t*t)**2*(1-mask.read(id));if(!w)continue;
   for(let k=0;k<4;k++){const c=this.channels[k],old=c.read(id),value=Math.fround(old+((erase?0:colour[k])-old)*w);if(value!==old){c.write(id,value);changed=true;}}
   [x,y,z].forEach((n,a)=>{bounds.min[a]=Math.min(bounds.min[a],n);bounds.max[a]=Math.max(bounds.max[a],n);});
  }return changed?bounds:null;
 }
}
const paints=new WeakMap<VolumeStore,SculptPaint>();
export function sculptPaint(v:VolumeStore):SculptPaint{let p=paints.get(v);if(!p){p=new SculptPaint(v);paints.set(v,p);}return p;}
export function copySculptPaint(a:VolumeStore,b:VolumeStore){sculptPaint(b).restore(sculptPaint(a).snapshot());}
export function paintSnapshotBytes(s:PaintSnapshot){return s.reduce((n,c)=>n+maskSnapshotBytes(c),0);}
/** Forward splatting transports material even for large/folded Move fields where an
 * inverse is ambiguous. Trilinear normalized deposits are approximate, not lossless. */
export async function transportPaint(source:VolumeStore,next:VolumeStore,field:RadialMoveField,pause:()=>Promise<void>,maxBytes=64*1024**2){
 const paint=sculptPaint(source);if(paint.empty)return;const target=sculptPaint(next),acc=new Map<number,number[]>(),p=new Vector3(),q=new Vector3(),dims=source.dimensions,nd=next.dimensions;let count=0;
 for(const [id,a]of paint.channels[3].entries()){
  p.set(source.coordinate(id%dims[0],0),source.coordinate(Math.floor(id/dims[0])%dims[1],1),source.coordinate(Math.floor(id/(dims[0]*dims[1])),2));field.position(p,q);q.lerp(p,sculptMask(source).sample(p));
  const g=[q.x,q.y,q.z].map((n,k)=>(n-next.bounds.min[k])/next.step),lo=g.map(Math.floor),f=g.map((n,k)=>n-lo[k]);
  for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++){const xyz=[lo[0]+x,lo[1]+y,lo[2]+z];if(xyz.some((n,k)=>n<0||n>=nd[k]))continue;const w=(x?f[0]:1-f[0])*(y?f[1]:1-f[1])*(z?f[2]:1-f[2]);if(!w)continue;const dest=next.index(...xyz as [number,number,number]),v=acc.get(dest)??[0,0,0,0,0];for(let k=0;k<3;k++)v[k]+=paint.channels[k].read(id)*w;v[3]+=a*w;v[4]+=w;acc.set(dest,v);if(acc.size*192+target.memoryBytes>maxBytes)throw new Error('Paint transport exceeds the Move memory budget. Reduce the painted area or pull.');}
  if(++count%128===0)await pause();
 }
 target.clear();count=0;for(const [id,v]of acc){for(let k=0;k<4;k++)target.channels[k].write(id,Math.min(1,v[k]/Math.max(1,v[4])));if(++count%128===0)await pause();}
}
