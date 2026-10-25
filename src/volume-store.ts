import type { Bounds, BrushMode, Point3, VoxelChangeListener } from './sdf';
import type { Vec3, VolumeTransform } from './transform';
export type VolumeRegion = {bounds: Bounds; dimensions: Vec3; values: Float32Array};
export type VolumeBounds = {min: Vec3; max: Vec3};
/** Storage contract for the current uniform cubic dense grid. Coordinates are layer-local.
 * Bounds for regions are inclusive sample indices. getDenseView is an optional borrowed
 * fast path; consumers must not retain it across a volume replacement or mutate it.
 */
export interface VolumeStore {
  readonly resolution: number;
  readonly dimensions: Vec3;
  readonly voxelSize: Vec3;
  readonly extent: number;
  readonly step: number;
  readonly bounds: VolumeBounds;
  index(x: number,y: number,z: number): number;
  coordinate(index: number): number;
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
  brush(center: Point3,radius: number,mode: BrushMode,amount: number,record?: VoxelChangeListener,hardness?: number, freeSpace?: boolean, strength?: number): Bounds | null;
}
