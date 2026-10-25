import type { VolumeStore, VolumeRegion, VolumeBounds } from './volume-store';
import { identityTransform, toLocal, transformMatrix } from './transform';
import type { Vec3, VolumeTransform } from './transform';
import { Vector3 } from 'three';
export type VoxelChangeListener = (index: number, before: number, after: number) => void;
export type BrushMode = 'add' | 'subtract' | 'smooth';
export type Point3 = { x: number; y: number; z: number };
/** Inclusive sample bounds. */
export type Bounds = { min: [number, number, number]; max: [number, number, number] };
export function mergeBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b;
  if (!b) return a;
  return { min: a.min.map((v, i) => Math.min(v, b.min[i])) as Bounds['min'], max: a.max.map((v, i) => Math.max(v, b.max[i])) as Bounds['max'] };
}

/** Negative values are inside. Samples on the fixed volume boundary stay positive. */
export class SDFVolume implements VolumeStore {
  readonly values: Float32Array;
  private readonly scratch: Float32Array;
  readonly step: number;
  /** Derived sampled grids skip the initial sphere and may have smaller physical bounds. */
  constructor(readonly resolution = 64, readonly extent = 1.6, initializeSphere = true) {
    if (!Number.isInteger(resolution) || resolution < 3 || !Number.isFinite(extent) || extent <= (initializeSphere ? 0.85 : 0)) throw new Error('Invalid SDF volume dimensions');
    this.step = extent * 2 / (resolution - 1);
    this.values = new Float32Array(resolution ** 3);
    this.scratch = new Float32Array(this.values.length);
    if(initializeSphere)this.reset();
  }
  index(x: number, y: number, z: number): number {
    return x + this.resolution * (y + this.resolution * z);
  }
  coordinate(i: number): number { return -this.extent + i * this.step; }
  get dimensions(): Vec3 {return [this.resolution,this.resolution,this.resolution];}
  get voxelSize(): Vec3 {return [this.step,this.step,this.step];}
  get bounds(): VolumeBounds {return {min:[-this.extent,-this.extent,-this.extent],max:[this.extent,this.extent,this.extent]};}
  readVoxel(index: number): number {return this.values[index];}
  writeVoxel(index: number,value: number): void {this.values[index]=value;}
  getDenseView(): Float32Array {return this.values;}
  private regionDimensions(bounds: Bounds): Vec3 {
    if(!bounds || !Array.isArray(bounds.min)||!Array.isArray(bounds.max)||bounds.min.length!==3||bounds.max.length!==3||!bounds.min.every((v,i)=>Number.isInteger(v)&&Number.isInteger(bounds.max[i])&&v>=0&&bounds.max[i]>=v&&bounds.max[i]<this.resolution))throw new Error('Invalid voxel region bounds.');
    return bounds.min.map((v,i)=>bounds.max[i]-v+1) as Vec3;
  }
  readRegion(bounds: Bounds): VolumeRegion {
    const dimensions=this.regionDimensions(bounds),values=new Float32Array(dimensions[0]*dimensions[1]*dimensions[2]);let offset=0;
    for(let z=bounds.min[2];z<=bounds.max[2];z++)for(let y=bounds.min[1];y<=bounds.max[1];y++)for(let x=bounds.min[0];x<=bounds.max[0];x++)values[offset++]=this.values[this.index(x,y,z)];
    return {bounds:{min:[...bounds.min],max:[...bounds.max]},dimensions,values};
  }
  writeRegion(region: VolumeRegion,record?: VoxelChangeListener): Bounds | null {
    const dimensions=this.regionDimensions(region.bounds),n=this.resolution;
    if(!Array.isArray(region.dimensions)||region.dimensions.length!==3||!dimensions.every((v,i)=>v===region.dimensions[i])||!(region.values instanceof Float32Array)||region.values.length!==dimensions[0]*dimensions[1]*dimensions[2])throw new Error('Voxel region dimensions do not match payload.');
    const {min,max}=region.bounds;let offset=0;
    // Validate the complete region before mutating anything.
    for(let z=min[2];z<=max[2];z++)for(let y=min[1];y<=max[1];y++)for(let x=min[0];x<=max[0];x++) {
      const v=region.values[offset++];
      if(!Number.isFinite(v)||Math.abs(v)>Math.fround(this.extent*4)||((x===0||y===0||z===0||x===n-1||y===n-1||z===n-1)&&v<=0))throw new Error('Invalid voxel region values.');
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
    const n=this.resolution,grid=[point.x,point.y,point.z].map(v=>Math.max(0,Math.min(n-1,(v+this.extent)/this.step)));
    const base=grid.map(v=>Math.min(n-2,Math.floor(v))),t=grid.map((v,i)=>v-base[i]);let value=0;
    for(let z=0;z<2;z++)for(let y=0;y<2;y++)for(let x=0;x<2;x++)value+=this.values[this.index(base[0]+x,base[1]+y,base[2]+z)]*(x?t[0]:1-t[0])*(y?t[1]:1-t[1])*(z?t[2]:1-t[2]);
    return value+Math.hypot(Math.max(0,Math.abs(point.x)-this.extent),Math.max(0,Math.abs(point.y)-this.extent),Math.max(0,Math.abs(point.z)-this.extent));
  }
  sampleWorld(point: Point3,transform=identityTransform()): number {return this.sampleLocal(toLocal(point,transform))*Math.min(...transform.scale);}
  worldBounds(transform: VolumeTransform=identityTransform()): VolumeBounds {
    const matrix=transformMatrix(transform),min: Vec3=[Infinity,Infinity,Infinity],max: Vec3=[-Infinity,-Infinity,-Infinity];
    for(const x of [-this.extent,this.extent])for(const y of [-this.extent,this.extent])for(const z of [-this.extent,this.extent]) {
      const p=new Vector3(x,y,z).applyMatrix4(matrix).toArray();p.forEach((v,i)=>{min[i]=Math.min(min[i],v);max[i]=Math.max(max[i],v);});
    }
    return {min,max};
  }
  reset(record?: VoxelChangeListener): void {
    const n = this.resolution;
    for (let z = 0; z < n; z++) for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = this.index(x,y,z);
      const next = Math.fround(Math.hypot(this.coordinate(x), this.coordinate(y), this.coordinate(z)) - 0.85);
      if (next !== this.values[i]) record?.(i,this.values[i],next);
      this.values[i] = next;
    }
  }
  /** Trilinear interpolation of central-difference grid gradients; shared positions have shared normals. */
  normalAt(point: readonly number[]): [number, number, number] {
    const n = this.resolution, gradient = [0, 0, 0];
    const grid = point.map(v => Math.max(0, Math.min(n - 1.000001, (v + this.extent) / this.step)));
    const base = grid.map(Math.floor), fraction = grid.map((v, i) => v - base[i]);
    for (let dz = 0; dz <= 1; dz++) for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
      const x = base[0] + dx, y = base[1] + dy, z = base[2] + dz;
      const weight = (dx ? fraction[0] : 1 - fraction[0]) * (dy ? fraction[1] : 1 - fraction[1]) * (dz ? fraction[2] : 1 - fraction[2]);
      const xm = Math.max(0, x - 1), xp = Math.min(n - 1, x + 1);
      const ym = Math.max(0, y - 1), yp = Math.min(n - 1, y + 1);
      const zm = Math.max(0, z - 1), zp = Math.min(n - 1, z + 1);
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
  brush(center: Point3, radius: number, mode: BrushMode, amount: number, record?: VoxelChangeListener, hardness = 0, freeSpace = false, strength = 1): Bounds | null {
    if (![center.x, center.y, center.z, radius, amount, hardness, strength].every(Number.isFinite) || radius <= 0 || amount <= 0 || (freeSpace && strength <= 0)) return null;
    amount = Math.min(amount, mode === 'smooth' ? 1 : this.step * 0.5);
    const n = this.resolution;
    const lo = (v: number) => Math.max(1, Math.floor((v - radius + this.extent) / this.step));
    const hi = (v: number) => Math.min(n - 2, Math.ceil((v + radius + this.extent) / this.step));
    const bounds: Bounds = { min: [lo(center.x),lo(center.y),lo(center.z)], max: [hi(center.x),hi(center.y),hi(center.z)] };
    // Empty-space erase/smooth must not churn positive fields, history or meshes.
    // Include a neighbor halo for Smooth's diffusion kernel.
    if(freeSpace && mode !== 'add') {
      let material=false;
      const halo=mode==='smooth'?1:0;
      for(let z=Math.max(0,bounds.min[2]-halo);z<=Math.min(n-1,bounds.max[2]+halo)&&!material;z++)
       for(let y=Math.max(0,bounds.min[1]-halo);y<=Math.min(n-1,bounds.max[1]+halo)&&!material;y++)
        for(let x=Math.max(0,bounds.min[0]-halo);x<=Math.min(n-1,bounds.max[0]+halo);x++)
         if(this.values[this.index(x,y,z)]<=0){material=true;break;}
      if(!material)return null;
    }
    let changed = false;
    for (let z = bounds.min[2]; z <= bounds.max[2]; z++) for (let y = bounds.min[1]; y <= bounds.max[1]; y++) for (let x = bounds.min[0]; x <= bounds.max[0]; x++) {
      const i = this.index(x,y,z);
      const d = Math.hypot(this.coordinate(x) - center.x, this.coordinate(y) - center.y, this.coordinate(z) - center.z) / radius;
      let next = this.values[i];
      if (d < 1) {
        // Smooth always retains its original gentle diffusion kernel.
        const inner = mode === 'smooth' ? 0 : Math.max(0,Math.min(1,hardness))*0.9;
        const t = Math.max(0,(d-inner)/(1-inner));
        const falloff = (1 - t * t) ** 2;
        if (mode === 'smooth') {
          const average = (this.values[i-1]+this.values[i+1]+this.values[i-n]+this.values[i+n]+this.values[i-n*n]+this.values[i+n*n]) / 6;
          next += (average - next) * amount * falloff;
        } else if(freeSpace) {
          // Constructive clay: union/difference with an applicator sphere. Its
          // zero set is radius-sized even in a large positive (empty) field.
          // Strength/hardness control interior field depth, not dwell time to seed.
          const field=(d-1)*radius*Math.max(.001,Math.min(1,strength))*(.25+.75*Math.max(0,Math.min(1,hardness)));
          next=mode==='add'?Math.min(next,field):Math.max(next,-field);
        } else next += (mode === 'add' ? -1 : 1) * amount * falloff;
      }
      // Bounded fields remain finite even through prolonged repeated strokes.
      this.scratch[i] = Math.max(-this.extent * 4, Math.min(this.extent * 4, next));
      changed ||= this.scratch[i] !== this.values[i];
    }
    if (!changed) return null;
    for (let z = bounds.min[2]; z <= bounds.max[2]; z++) for (let y = bounds.min[1]; y <= bounds.max[1]; y++) for (let x = bounds.min[0]; x <= bounds.max[0]; x++) {
      const i = this.index(x,y,z);
      if (this.values[i] !== this.scratch[i]) record?.(i,this.values[i],this.scratch[i]);
      this.values[i] = this.scratch[i];
    }
    return bounds;
  }
}
