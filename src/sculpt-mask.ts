import type {VolumeStore} from './volume-store';
import type {Bounds,Point3} from './sdf';
const PAGE=256;
export type MaskSnapshot={base:number;inverted?:boolean;pages:Map<number,Float32Array>;dimensions:[number,number,number];minimum:[number,number,number]};
/** Lazy pages and copy-on-write history. Untouched/uniform masks allocate no voxel arrays. */
export class SculptMask {
 private dirty:Bounds|'all'|null='all';
 takeDirty():Bounds|'all'|null{const dirty=this.dirty;this.dirty=null;return dirty;}
 private base=0;private inverted=false;private readonly count:number;private pages=new Map<number,Float32Array>();private writable=new Set<number>();revision=0;
 private readonly dims:[number,number,number];private readonly origin:[number,number,number];
 constructor(readonly volume:VolumeStore){this.dims=volume.dimensions;this.count=this.dims.reduce((a,b)=>a*b,1);this.origin=volume.bounds.min;}
 get memoryBytes():number{return this.pages.size*(PAGE*4+64);}
 get empty():boolean{return this.defaultValue===0&&!this.pages.size;}
 get defaultValue():number{return this.inverted?1-this.base:this.base;}
 read(index:number):number{const value=this.pages.get(Math.floor(index/PAGE))?.[index%PAGE]??this.base;return this.inverted?Math.fround(1-value):value;}
 write(index:number,value:number):void{
  if(!Number.isSafeInteger(index)||index<0||index>=this.count||!Number.isFinite(value)||value<0||value>1)throw new Error('Invalid mask sample.');
  value=Math.fround(value);if(this.read(index)===value)return;
  const page=Math.floor(index/PAGE);let data=this.pages.get(page);
  if(!this.writable.has(page)){data=data?data.slice():new Float32Array(PAGE).fill(this.base);this.pages.set(page,data);this.writable.add(page);}
  data![index%PAGE]=this.inverted?Math.fround(1-value):value;this.revision++;
  if(this.dirty!=='all'){const [nx,ny]=this.dims,x=index%nx,y=Math.floor(index/nx)%ny,z=Math.floor(index/(nx*ny));if(!this.dirty)this.dirty={min:[x,y,z],max:[x,y,z]};else {this.dirty.min[0]=Math.min(this.dirty.min[0],x);this.dirty.min[1]=Math.min(this.dirty.min[1],y);this.dirty.min[2]=Math.min(this.dirty.min[2],z);this.dirty.max[0]=Math.max(this.dirty.max[0],x);this.dirty.max[1]=Math.max(this.dirty.max[1],y);this.dirty.max[2]=Math.max(this.dirty.max[2],z);}}
 }
 snapshot():MaskSnapshot{for(const id of this.writable){const data=this.pages.get(id);if(data?.every(v=>v===this.base))this.pages.delete(id);}this.writable.clear();return {base:this.base,inverted:this.inverted,pages:new Map(this.pages),dimensions:this.volume.dimensions,minimum:this.volume.latticeMin??[0,0,0]};}
 restore(s:MaskSnapshot):void{
  const d=this.volume.dimensions,m=this.volume.latticeMin??[0,0,0];this.base=s.base;this.inverted=!!s.inverted;this.pages=new Map();this.writable.clear();
  if(d.every((v,a)=>v===s.dimensions[a])&&m.every((v,a)=>v===s.minimum[a]))this.pages=new Map(s.pages);
  else {const [nx,ny]=s.dimensions;for(const [page,data]of s.pages)for(let j=0;j<PAGE;j++){const id=page*PAGE+j;if(id>=s.dimensions.reduce((a,b)=>a*b,1)||data[j]===s.base)continue;const x=id%nx+s.minimum[0]-m[0],y=Math.floor(id/nx)%ny+s.minimum[1]-m[1],z=Math.floor(id/(nx*ny))+s.minimum[2]-m[2];if(x>=0&&y>=0&&z>=0&&x<d[0]&&y<d[1]&&z<d[2])this.write(this.volume.index(x,y,z),this.inverted?1-data[j]:data[j]);}}
  this.revision++;this.dirty='all';
 }
 uniform(value:0|1):void{this.base=value;this.inverted=false;this.pages.clear();this.writable.clear();this.revision++;this.dirty='all';}
 invert():void{this.inverted=!this.inverted;this.revision++;this.dirty='all';}
 sample(p:Point3):number{
  if(!this.pages.size)return this.defaultValue;const v=this.volume,[nx,ny,nz]=this.dims,step=v.step,gx=Math.max(0,Math.min(nx-1,(p.x-this.origin[0])/step)),gy=Math.max(0,Math.min(ny-1,(p.y-this.origin[1])/step)),gz=Math.max(0,Math.min(nz-1,(p.z-this.origin[2])/step)),ix=Math.min(nx-2,Math.floor(gx)),iy=Math.min(ny-2,Math.floor(gy)),iz=Math.min(nz-2,Math.floor(gz)),tx=gx-ix,ty=gy-iy,tz=gz-iz;let value=0;
  for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++)value+=this.read(v.index(ix+x,iy+y,iz+z))*(x?tx:1-tx)*(y?ty:1-ty)*(z?tz:1-tz);return value;
 }
 blend(index:number,before:number,after:number):number{if(this.empty)return Math.fround(after);after=Math.fround(after);const mask=this.read(index);return mask===1?before:mask===0?Math.fround(after):Math.fround(before+(after-before)*(1-mask));}
 get entryCount():number{let count=0;for(const _ of this.entries()){void _;count++;}return count;}
 *entries():Generator<[number,number]>{const n=this.volume.dimensions.reduce((a,b)=>a*b,1);for(const [page,data]of [...this.pages].sort((a,b)=>a[0]-b[0]))for(let j=0;j<PAGE;j++){const id=page*PAGE+j;const value=this.inverted?Math.fround(1-data[j]):data[j];if(id<n&&value!==this.defaultValue)yield [id,value];}}
}
const surfaces=new WeakMap<object,()=>VolumeStore>();
export function registerMaskSurface(surface:object,volume:()=>VolumeStore):void{surfaces.set(surface,volume);}
export function surfaceMask(surface:object):SculptMask|undefined{const volume=surfaces.get(surface)?.();return volume?sculptMask(volume):undefined;}
const masks=new WeakMap<VolumeStore,SculptMask>();
export function sculptMask(volume:VolumeStore):SculptMask{let mask=masks.get(volume);if(!mask){mask=new SculptMask(volume);masks.set(volume,mask);}return mask;}
export function copySculptMask(source:VolumeStore,next:VolumeStore):void{sculptMask(next).restore(sculptMask(source).snapshot());}
export function maskSnapshotBytes(s:MaskSnapshot):number{return s.pages.size*(PAGE*4+64);}
