import type { Bounds, BrushMode, Point3, VoxelChangeListener, MirrorPlane } from './sdf';
import type { Vec3, VolumeTransform } from './transform';
export type VolumeRegion = {bounds: Bounds; dimensions: Vec3; values: Float32Array};
export type VolumeBounds = {min: Vec3; max: Vec3};
/** Storage contract for the uniform dense lattice (legacy grids are cubic). Coordinates are layer-local.
 * Bounds for regions are inclusive sample indices. getDenseView is an optional borrowed
 * fast path; consumers must not retain it across a volume replacement or mutate it.
 */
export interface VolumeStore {
  /** Initial cubic resolution: spacing metadata, NOT current allocation dimensions. */
  readonly resolution: number;
  readonly latticeMin?:Vec3;
  readonly dimensions: Vec3;
  readonly voxelSize: Vec3;
  readonly extent: number;
  readonly step: number;
  readonly bounds: VolumeBounds;
  index(x: number,y: number,z: number): number;
  coordinate(index: number,axis?:number): number;
  readVoxel(index: number): number;
  /** Low-level trusted replay write. External edits should use validated writeRegion or brush. */
  writeVoxel(index: number,value: number): void;
  getDenseView(): Float32Array | undefined;
  readRegion(bounds: Bounds): VolumeRegion;
  writeRegion(region: VolumeRegion,record?: VoxelChangeListener): Bounds | null;
  sampleLocal(point: Point3): number;
  /** Uniform scale yields world distance; nonuniform scale uses minimum-axis scaling (conservative field). */
  sampleWorld(point: Point3,transform?: VolumeTransform): number;
  worldBounds(transform?: VolumeTransform): VolumeBounds;
  normalAt(point: readonly number[]): Vec3;
  reset(record?: VoxelChangeListener): void;
  brushSteps(center:Point3,radius:number,mode:BrushMode,amount:number,record?:VoxelChangeListener,hardness?:number,freeSpace?:boolean,strength?:number,start?:Point3,mirror?:MirrorPlane):Generator<void,Bounds|null>;
  brush(center: Point3,radius: number,mode: BrushMode,amount: number,record?: VoxelChangeListener,hardness?: number, freeSpace?: boolean, strength?: number, start?:Point3, mirror?:MirrorPlane): Bounds | null;
}

export function volumeSampleCount(volume:VolumeStore):number{return volume.dimensions.reduce((a,b)=>a*b,1);}
export function isLegacyCubicGrid(volume:VolumeStore):boolean{const b=volume.bounds;return volume.dimensions.every(n=>n===volume.resolution)&&b.min.every(v=>v===-volume.extent)&&b.max.every(v=>Math.abs(v-volume.extent)<1e-10);}
/** Transitional guard: callers that retain cubic strides must fail explicitly. */
export function requireLegacyCubicGrid(volume:VolumeStore,operation:string):void{if(!isLegacyCubicGrid(volume))throw new Error(`${operation} for expanded lattice volumes is not integrated yet. The original volume was kept.`);}

export function volumeLabel(volume:VolumeStore):string{return isLegacyCubicGrid(volume)?`${volume.resolution}³`:volume.dimensions.join('×');}
