import {sculptMask} from './sculpt-mask';
import type { VolumeStore, VolumeRegion, VolumeBounds } from './volume-store';
import { identityTransform, toLocal, transformMatrix } from './transform';
import type { Vec3, VolumeTransform } from './transform';
import { Vector3 } from 'three';
export type VoxelChangeListener = (index: number, before: number, after: number) => void;
export type BrushMode = 'paint' | 'paint-erase' | 'add' | 'subtract' | 'smooth' | 'flatten' | 'inflate' | 'scrape' | 'pinch' | 'crease' | 'mask' | 'mask-erase';
export type MirrorPlane = {enabled:boolean;axis: 'x'|'y'|'z';offset:number};
export function validateMirrorPlane(plane:MirrorPlane):void{if(typeof plane.enabled!=='boolean'||!['x','y','z'].includes(plane.axis)||!Number.isFinite(plane.offset))throw new Error('Invalid mirror plane.');}
export function reflectPoint(p:Point3,plane:MirrorPlane):Point3{return {...p,[plane.axis]:2*plane.offset-p[plane.axis]};}
export type Point3 = { x: number; y: number; z: number };
/** Inclusive sample bounds. */
export type Bounds = { min: [number, number, number]; max: [number, number, number] };
export function mergeBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return { min: a.min.map((v, i) => Math.min(v, b.min[i])) as Bounds['min'], max: a.max.map((v, i) => Math.max(v, b.max[i])) as Bounds['max'] };
}

export type DenseLatticeLayout={dimensions:Vec3;latticeMin:Vec3};
export type DenseAllocator=(samples:number)=>Float32Array;
/** Negative values are inside. Samples on the fixed volume boundary stay positive. */
export class SDFVolume implements VolumeStore {
  readonly values: Float32Array;
  private readonly scratch: Float32Array;
  readonly step: number;
  private readonly shape:Vec3;
  private readonly minimum:Vec3;
  /** Derived sampled grids skip the initial sphere and may have smaller physical bounds. */
  constructor(readonly resolution = 64, readonly extent = 1.6, initializeSphere = true,layout?:DenseLatticeLayout,allocate:DenseAllocator=n=>new Float32Array(n)) {
    if (!Number.isInteger(resolution) || resolution < 3 || !Number.isFinite(extent) || extent <= (initializeSphere ? 0.85 : 0)) throw new Error('Invalid SDF volume dimensions');
    this.step = extent * 2 / (resolution - 1);
    if(!Number.isFinite(this.step)||this.step<=0)throw new Error('Invalid voxel spacing.');
    this.shape=layout?[...layout.dimensions]:[resolution,resolution,resolution];this.minimum=layout?[...layout.latticeMin]:[0,0,0];
    if(this.shape.length!==3||this.minimum.length!==3||!this.shape.every(n=>Number.isSafeInteger(n)&&n>=3&&n<=512)||!this.minimum.every(n=>Number.isSafeInteger(n)&&Math.abs(n)<=1000000)||this.shape.reduce((a,b)=>a*b,1)>2*192**3)throw new Error('Dense lattice allocation exceeds supported limits.');
    if(layout&&!this.minimum.every((v,a)=>v<=0&&v+this.shape[a]>=resolution))throw new Error('Growth layout must contain the initial lattice.');
    this.values = allocate(this.shape.reduce((a,b)=>a*b,1));
    this.scratch = allocate(this.values.length);
    if(!(this.values instanceof Float32Array)||!(this.scratch instanceof Float32Array)||this.values.length!==this.shape.reduce((a,b)=>a*b,1)||this.scratch.length!==this.values.length||this.values.buffer===this.scratch.buffer)throw new Error('Invalid independent dense storage allocation.');
    if(initializeSphere)this.reset();
  }
  index(x: number, y: number, z: number): number {
    return x + this.shape[0] * (y + this.shape[1] * z);
  }
  coordinate(i: number,axis=0): number { return -this.extent + (i+this.minimum[axis]) * this.step; }
  get latticeMin():Vec3{return [...this.minimum];}
  get dimensions(): Vec3 {return [...this.shape];}
  get voxelSize(): Vec3 {return [this.step,this.step,this.step];}
  get bounds(): VolumeBounds {return {min:this.shape.map((_,a)=>this.coordinate(0,a)) as Vec3,max:this.shape.map((n,a)=>this.coordinate(n-1,a)) as Vec3};}
  readVoxel(index: number): number {return this.values[index];}
  writeVoxel(index: number,value: number): void {this.values[index]=value;}
  getDenseView(): Float32Array {return this.values;}
  sharesStorageWith(other:SDFVolume):boolean{return this.values.buffer===other.values.buffer||this.values.buffer===other.scratch.buffer||this.scratch.buffer===other.values.buffer||this.scratch.buffer===other.scratch.buffer;}
  private regionDimensions(bounds: Bounds): Vec3 {
    if(!bounds || !Array.isArray(bounds.min)||!Array.isArray(bounds.max)||bounds.min.length!==3||bounds.max.length!==3||!bounds.min.every((v,i)=>Number.isInteger(v)&&Number.isInteger(bounds.max[i])&&v>=0&&bounds.max[i]>=v&&bounds.max[i]<this.shape[i]))throw new Error('Invalid voxel region bounds.');
    return bounds.min.map((v,i)=>bounds.max[i]-v+1) as Vec3;
  }
  readRegion(bounds: Bounds): VolumeRegion {
    const dimensions=this.regionDimensions(bounds),values=new Float32Array(dimensions[0]*dimensions[1]*dimensions[2]);let offset=0;
    for(let z=bounds.min[2];z<=bounds.max[2];z++)for(let y=bounds.min[1];y<=bounds.max[1];y++)for(let x=bounds.min[0];x<=bounds.max[0];x++)values[offset++]=this.values[this.index(x,y,z)];
    return {bounds:{min:[...bounds.min],max:[...bounds.max]},dimensions,values};
  }
  writeRegion(region: VolumeRegion,record?: VoxelChangeListener): Bounds | null {
    const dimensions=this.regionDimensions(region.bounds),[nx,ny,nz]=this.shape;
    if(!Array.isArray(region.dimensions)||region.dimensions.length!==3||!dimensions.every((v,i)=>v===region.dimensions[i])||!(region.values instanceof Float32Array)||region.values.length!==dimensions[0]*dimensions[1]*dimensions[2])throw new Error('Voxel region dimensions do not match payload.');
    const {min,max}=region.bounds;let offset=0;
    // Validate the complete region before mutating anything.
    for(let z=min[2];z<=max[2];z++)for(let y=min[1];y<=max[1];y++)for(let x=min[0];x<=max[0];x++) {
      const v=region.values[offset++];
      if(!Number.isFinite(v)||Math.abs(v)>Math.fround(this.extent*4)||((x===0||y===0||z===0||x===nx-1||y===ny-1||z===nz-1)&&v<=0))throw new Error('Invalid voxel region values.');
    }
    offset=0;let changed=false;
    for(let z=min[2];z<=max[2];z++)for(let y=min[1];y<=max[1];y++)for(let x=min[0];x<=max[0];x++) {
      const index=this.index(x,y,z),next=region.values[offset++],before=this.values[index];
      if(before!==next){record?.(index,before,next);this.values[index]=next;changed=true;}
    }
    return changed?{min:[...min],max:[...max]}:null;
  }
  sampleLocal(point: Point3): number {
    if(![point.x,point.y,point.z].every(Number.isFinite))throw new Error('Sample coordinates must be finite.');
    const b=this.bounds,grid=[point.x,point.y,point.z].map((v,a)=>Math.max(0,Math.min(this.shape[a]-1,(v+this.extent)/this.step-this.minimum[a])));
    const base=grid.map((v,a)=>Math.min(this.shape[a]-2,Math.floor(v))),t=grid.map((v,i)=>v-base[i]);let value=0;
    for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++)value+=this.values[this.index(base[0]+x,base[1]+y,base[2]+z)]*(x?t[0]:1-t[0])*(y?t[1]:1-t[1])*(z?t[2]:1-t[2]);
    return value+Math.hypot(...[point.x,point.y,point.z].map((v,a)=>Math.max(0,b.min[a]-v,v-b.max[a])));
  }
  /** No allocation/clamping for validated interior resampling. The Pinch/Crease maps
   * moves at most half a voxel from samples with a one-voxel boundary margin. */
  private sampleInterior(px:number,py:number,pz:number):number{
    const gx=(px+this.extent)/this.step-this.minimum[0],gy=(py+this.extent)/this.step-this.minimum[1],gz=(pz+this.extent)/this.step-this.minimum[2];
    const x=Math.floor(gx),y=Math.floor(gy),z=Math.floor(gz),tx=gx-x,ty=gy-y,tz=gz-z;let value=0;
    for(let k=0;k<2;k++)for(let j=0;j<2;j++)for(let i=0;i<2;i++)value+=this.values[this.index(x+i,y+j,z+k)]*(i?tx:1-tx)*(j?ty:1-ty)*(k?tz:1-tz);
    return value;
  }
  sampleWorld(point: Point3,transform=identityTransform()): number {return this.sampleLocal(toLocal(point,transform))*Math.min(...transform.scale);}
  worldBounds(transform: VolumeTransform=identityTransform()): VolumeBounds {
    const matrix=transformMatrix(transform),min: Vec3=[Infinity,Infinity,Infinity],max: Vec3=[-Infinity,-Infinity,-Infinity];
    const bounds=this.bounds;
    for(const x of [bounds.min[0],bounds.max[0]])for(const y of [bounds.min[1],bounds.max[1]])for(const z of [bounds.min[2],bounds.max[2]]) {
      const p=new Vector3(x,y,z).applyMatrix4(matrix).toArray();p.forEach((v,i)=>{min[i]=Math.min(min[i],v);max[i]=Math.max(max[i],v);});
    }
    return {min,max};
  }
  reset(record?: VoxelChangeListener): void {
    const [nx,ny,nz] = this.shape;
    for (let z = 0; z < nz; z++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) {
      const i = this.index(x,y,z);
      const next = Math.fround(Math.min(this.extent*4,Math.hypot(this.coordinate(x,0), this.coordinate(y,1), this.coordinate(z,2)) - 0.85));
      if (next !== this.values[i]) record?.(i,this.values[i],next);
      this.values[i] = next;
    }
  }
  /** Trilinear interpolation of central-difference grid gradients; shared positions have shared normals. */
  normalAt(point: readonly number[]): [number, number, number] {
    const [nx,ny,nz] = this.shape, gradient = [0, 0, 0];
    const grid = point.map((v,a) => Math.max(0, Math.min(this.shape[a] - 1.000001, (v + this.extent) / this.step-this.minimum[a])));
    const base = grid.map(Math.floor), fraction = grid.map((v, i) => v - base[i]);
    for (let dz = 0; dz <= 1; dz++) for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
      const x = base[0] + dx, y = base[1] + dy, z = base[2] + dz;
      const weight = (dx ? fraction[0] : 1 - fraction[0]) * (dy ? fraction[1] : 1 - fraction[1]) * (dz ? fraction[2] : 1 - fraction[2]);
      const xm = Math.max(0, x - 1), xp = Math.min(nx - 1, x + 1);
      const ym = Math.max(0, y - 1), yp = Math.min(ny - 1, y + 1);
      const zm = Math.max(0, z - 1), zp = Math.min(nz - 1, z + 1);
      gradient[0] += weight * (this.values[this.index(xp,y,z)] - this.values[this.index(xm,y,z)]) / (xp-xm);
      gradient[1] += weight * (this.values[this.index(x,yp,z)] - this.values[this.index(x,ym,z)]) / (yp-ym);
      gradient[2] += weight * (this.values[this.index(x,y,zp)] - this.values[this.index(x,y,zm)]) / (zp-zm);
    }
    const length = Math.hypot(...gradient);
    return length > 1e-12 ? gradient.map(v => v / length) as [number,number,number] : [0,1,0];
  }
  /** Compact C1 falloff. Smooth uses a Jacobi pass, never partially updated neighbors.
   * For Smooth, amount is an interpolation coefficient clamped to [0,1].
   * Legacy Add/Subtract use bounded displacement. Free-space Add/Subtract construct
   * a radius-sized sphere with strength/hardness controlling interior field depth.
   */
  brush(center: Point3, radius: number, mode: BrushMode, amount: number, record?: VoxelChangeListener, hardness = 0, freeSpace = false, strength = 1, start:Point3=center, mirror?:MirrorPlane): Bounds | null {
    const work=this.brushSteps(center,radius,mode,amount,record,hardness,freeSpace,strength,start,mirror);
    let step=work.next();while(!step.done)step=work.next();return step.value;
  }
  /** Pinch/Crease resampling yields bounded batches before and during history publication.
   * Existing synchronous callers drain the identical generator. */
  *brushSteps(center: Point3, radius: number, mode: BrushMode, amount: number, record?: VoxelChangeListener, hardness = 0, freeSpace = false, strength = 1, start:Point3=center, mirror?:MirrorPlane):Generator<void,Bounds|null> {
    if (![center.x, center.y, center.z, radius, amount, hardness, strength].every(Number.isFinite) || radius <= 0 || amount <= 0 || (freeSpace && strength <= 0)) return null;
    if(mode==='paint'||mode==='paint-erase')throw new Error('Paint must use the colour stroke path.');
    if(mode==='mask'||mode==='mask-erase'){
      const mask=sculptMask(this),points=[center,...(mirror?.enabled?[reflectPoint(center,mirror)]:[])],bounds:Bounds={min:[...this.shape],max:[0,0,0]};let changed=false,processed=0;
      // Union of symmetric applicators: overlap never doubles protection strength.
      const lo=[0,1,2].map(a=>Math.max(0,Math.floor((Math.min(...points.map(c=>[c.x,c.y,c.z][a]))-radius+this.extent)/this.step-this.minimum[a]))),hi=[0,1,2].map(a=>Math.min(this.shape[a]-1,Math.ceil((Math.max(...points.map(c=>[c.x,c.y,c.z][a]))+radius+this.extent)/this.step-this.minimum[a])));
      for(let z=lo[2];z<=hi[2];z++)for(let y=lo[1];y<=hi[1];y++)for(let x=lo[0];x<=hi[0];x++){
       if(processed++%128===127)yield;const px=this.coordinate(x,0),py=this.coordinate(y,1),pz=this.coordinate(z,2);let d=Infinity;for(const c of points)d=Math.min(d,Math.hypot(px-c.x,py-c.y,pz-c.z)/radius);if(d>=1)continue;
       const inner=Math.max(0,Math.min(.9,hardness*.9)),t=Math.max(0,(d-inner)/(1-inner)),w=(1-t*t)**2,id=this.index(x,y,z),old=mask.read(id),next=Math.fround(mode==='mask'?Math.min(1,old+Math.min(1,amount)*w):Math.max(0,old-Math.min(1,amount)*w));
       if(next!==old){mask.write(id,next);changed=true;[x,y,z].forEach((v,a)=>{bounds.min[a]=Math.min(bounds.min[a],v);bounds.max[a]=Math.max(bounds.max[a],v);});}
      }return changed?bounds:null;
    }
    const protection=sculptMask(this);
    const resampling=mode==='pinch'||mode==='crease';
    const advanced=mode==='flatten'||mode==='inflate'||mode==='scrape'||resampling;
    if(advanced)freeSpace=false;
    amount = Math.min(amount, mode === 'smooth' ? 1 : this.step * 0.5);
    const [nx,ny,nz] = this.shape;
    if(![start.x,start.y,start.z].every(Number.isFinite)||mirror&&(!['x','y','z'].includes(mirror.axis)||!Number.isFinite(mirror.offset)))throw new Error('Invalid brush trajectory/plane.');
    const reflected=mirror?.enabled?reflectPoint(center,mirror):center, reflectedStart=mirror?.enabled?reflectPoint(start,mirror):start;
    // A complete exterior band is essential for correct zero crossings and gradients.
    const padding=radius+(freeSpace&&mode!=='smooth'?this.step*2:0);
    const low=[0,1,2].map((a)=>Math.min(...[center,start,reflected,reflectedStart].map(p=>[p.x,p.y,p.z][a])));
    const high=[0,1,2].map((a)=>Math.max(...[center,start,reflected,reflectedStart].map(p=>[p.x,p.y,p.z][a])));
    const bounds:Bounds={min:low.map((v,a)=>Math.max(1,Math.floor((v-padding+this.extent)/this.step-this.minimum[a]))) as Bounds['min'],max:high.map((v,a)=>Math.min(this.shape[a]-2,Math.ceil((v+padding+this.extent)/this.step-this.minimum[a]))) as Bounds['max']};
    const distance=(px:number,py:number,pz:number,a:Point3,b:Point3)=>{const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,length=dx*dx+dy*dy+dz*dz,t=length?Math.max(0,Math.min(1,((px-a.x)*dx+(py-a.y)*dy+(pz-a.z)*dz)/length)):0;return Math.hypot(px-a.x-t*dx,py-a.y-t*dy,pz-a.z-t*dz);};
    // Empty-space erase/smooth must not churn positive fields, history or meshes.
    // Include a neighbor halo for Smooth's diffusion kernel.
    if(freeSpace && mode !== 'add') {
      let material=false;
      const halo=mode==='smooth'?1:0;
      for(let z=Math.max(0,bounds.min[2]-halo);z<=Math.min(nz-1,bounds.max[2]+halo)&&!material;z++)
       for(let y=Math.max(0,bounds.min[1]-halo);y<=Math.min(ny-1,bounds.max[1]+halo)&&!material;y++)
        for(let x=Math.max(0,bounds.min[0]-halo);x<=Math.min(nx-1,bounds.max[0]+halo);x++)
         if(this.values[this.index(x,y,z)]<=0){material=true;break;}
      if(!material)return null;
    }
    // Freeze tangent planes before Jacobi writes. Project the applicator centre
    // onto the sampled zero set; distant empty space does not seed clay.
    const plane=(c:Point3)=>{const value=this.sampleLocal(c),n=this.normalAt([c.x,c.y,c.z]);return {c,n,value};};
    const primary=advanced?plane(center):null,secondary=advanced&&mirror?.enabled?plane(reflected):null;
    if(advanced&&Math.abs(primary!.value)>radius&&(!secondary||Math.abs(secondary.value)>radius))return null;
    const pinchPlanes=advanced?[primary!,...(secondary?[secondary]:[])]:[];
    let changed = false, processed=0;
    for (let z = bounds.min[2]; z <= bounds.max[2]; z++) for (let y = bounds.min[1]; y <= bounds.max[1]; y++) for (let x = bounds.min[0]; x <= bounds.max[0]; x++) {
      if(resampling&&processed++%128===127)yield;
      const i = this.index(x,y,z);
      const px=this.coordinate(x,0),py=this.coordinate(y,1),pz=this.coordinate(z,2);
      const d=Math.min(distance(px,py,pz,start,center),mirror?.enabled?distance(px,py,pz,reflectedStart,reflected):Infinity)/radius;
      let next = this.values[i];
      if (d < 1 || freeSpace&&mode!=='smooth') {
        // Smooth always retains its original gentle diffusion kernel.
        const inner = mode === 'smooth' ? 0 : Math.max(0,Math.min(1,hardness))*0.9;
        const t = Math.max(0,(d-inner)/(1-inner));
        const falloff = (1 - t * t) ** 2;
        if (advanced) {
          const useMirror=secondary&&distance(px,py,pz,reflected,reflected)<distance(px,py,pz,center,center);
          const p=useMirror?secondary!:primary!;
          if(resampling||Math.abs(p.value)<=radius){
            // Negative inside: Inflate offsets the zero set outward. Flatten
            // relaxes toward the local tangent plane; Scrape only removes its high side.
            const target=p.n[0]*(px-p.c.x)+p.n[1]*(py-p.c.y)+p.n[2]*(pz-p.c.z)+(mode==='scrape'?0:p.value);
            const delta=mode==='inflate'?-amount:Math.max(-amount,Math.min(amount,target-next));
            if(resampling){
              // Pull back through a tangential expansion: its inverse contracts
              // the zero set. Convex C1 overlap blending avoids a mirror bisector seam.
              let dx=0,dy=0,dz=0,weight=0;
              // Crease adds a backward outward-normal component so the surface
              // moves inward. Its tighter bound includes that normal displacement.
              const crease=mode==='crease',normalDepth=crease?radius*.5:0;
              const a=crease?Math.min(amount/(radius*1.5),(secondary?.01:.04)*(1-inner)):Math.min(amount/radius,(secondary?.02:.08)*(1-inner));
              for(const plane of pinchPlanes){
                if(Math.abs(plane.value)>radius)continue;
                const rx=px-plane.c.x,ry=py-plane.c.y,rz=pz-plane.c.z,radial=Math.hypot(rx,ry,rz)/radius;
                if(radial>=1)continue;
                const t=Math.max(0,(radial-inner)/(1-inner)),w=(1-t*t)**2,dot=rx*plane.n[0]+ry*plane.n[1]+rz*plane.n[2];
                dx+=w*w*(rx-dot*plane.n[0]+normalDepth*plane.n[0]);dy+=w*w*(ry-dot*plane.n[1]+normalDepth*plane.n[1]);dz+=w*w*(rz-dot*plane.n[2]+normalDepth*plane.n[2]);weight+=w;
              }
              if(weight>0)next=this.sampleInterior(px+a*dx/weight,py+a*dy/weight,pz+a*dz/weight);
            }else next+=(mode==='scrape'?Math.max(0,delta):delta)*falloff;
          }
        } else if (mode === 'smooth') {
          const average = (this.values[i-1]+this.values[i+1]+this.values[i-nx]+this.values[i+nx]+this.values[i-nx*ny]+this.values[i+nx*ny]) / 6;
          next += (average - next) * amount * falloff;
        } else if(freeSpace) {
          // Constructive clay: union/difference with an applicator sphere. Its
          // zero set is radius-sized even in a large positive (empty) field.
          // Strength/hardness control interior field depth, not dwell time to seed.
          const signed=(d-1)*radius,band=this.step*2;
          // Keep metric distances around zero AND in the positive exterior.
          // Scaling the exterior lowered neighboring sphere samples within the
          // finite brush AABB, corrupting gradients/zero crossings at its edge.
          const depth=Math.max(.001,Math.min(1,strength))*(.25+.75*Math.max(0,Math.min(1,hardness)));
          const field=signed>=-band?signed:-band+(signed+band)*depth;
          next=mode==='add'?Math.min(next,field):Math.max(next,-field);
        } else next += (mode === 'add' ? -1 : 1) * amount * falloff;
      }
      // Bounded fields remain finite even through prolonged repeated strokes.
      next=protection.blend(i,this.values[i],next);
      this.scratch[i] = Math.max(-this.extent * 4, Math.min(this.extent * 4, next));
      changed ||= this.scratch[i] !== this.values[i];
    }
    if (!changed) return null;
    for (let z = bounds.min[2]; z <= bounds.max[2]; z++) for (let y = bounds.min[1]; y <= bounds.max[1]; y++) for (let x = bounds.min[0]; x <= bounds.max[0]; x++) {
      if(resampling&&processed++%128===127)yield;
      const i = this.index(x,y,z);
      if (this.values[i] !== this.scratch[i]) record?.(i,this.values[i],this.scratch[i]);
      this.values[i] = this.scratch[i];
    }
    return bounds;
  }
}
