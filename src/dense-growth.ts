import {SDFVolume} from './sdf';
import type {DenseAllocator} from './sdf';
import type {VolumeBounds} from './volume-store';
import type {Vec3} from './transform';
/** Storage stage: prepares an independent replacement, never installs it directly
 * into a live layer/history. IndependentLayers coordinates automatic publication. */
export type DenseGrowthLimits={blockCells:number;haloCells:number;paddingBlocks:number;maxSamples:number;maxAxisSamples:number;maxTransientBytes:number};
export const DENSE_GROWTH_LIMITS:Readonly<DenseGrowthLimits>=Object.freeze({blockCells:16,haloCells:2,paddingBlocks:1,maxSamples:2*192**3,maxAxisSamples:512,maxTransientBytes:256*1024**2});
export type DenseGrowthPlan={latticeMin:Vec3;dimensions:Vec3;offset:Vec3;samples:number;addedSamples:number;storageBytes:number;transientStorageBytes:number};
export type DenseGrowthResult={source:SDFVolume;volume:SDFVolume;plan:DenseGrowthPlan|null;stats:{allocationMs:number;copyMs:number;totalMs:number}};
const metadata=new WeakMap<SDFVolume,{expansions:number;lastExpansionMs:number}>();
const count=(dimensions:Vec3)=>dimensions.reduce((a,b)=>a*b,1);
function limitsFor(value:Partial<DenseGrowthLimits>):DenseGrowthLimits{
 const limits={...DENSE_GROWTH_LIMITS,...value};
 if(!Object.values(limits).every(v=>Number.isSafeInteger(v)&&v>=0)||limits.blockCells<1||limits.blockCells>64||limits.haloCells<2||limits.haloCells>64||limits.paddingBlocks>16||limits.maxSamples<27||limits.maxSamples>DENSE_GROWTH_LIMITS.maxSamples||limits.maxAxisSamples<3||limits.maxAxisSamples>512||limits.maxTransientBytes<216||limits.maxTransientBytes>DENSE_GROWTH_LIMITS.maxTransientBytes)throw new Error('Invalid dense growth safety limits.');
 return limits;
}
/** Footprint includes brush radius or rotated stamp AABB in immutable layer-local
 * coordinates; halo and spare blocks are added here, independently per axis. */
export function planDenseGrowth(source:SDFVolume,footprint:VolumeBounds,options:Partial<DenseGrowthLimits>={}):DenseGrowthPlan|null{
 const limits=limitsFor(options);
 if(!footprint||!Array.isArray(footprint.min)||!Array.isArray(footprint.max)||footprint.min.length!==3||footprint.max.length!==3||!footprint.min.every((v,a)=>Number.isFinite(v)&&Number.isFinite(footprint.max[a])&&v<=footprint.max[a]))throw new Error('Invalid layer-local growth footprint.');
 const oldMin=source.latticeMin,oldDimensions=source.dimensions,oldMax=oldMin.map((v,a)=>v+oldDimensions[a]-1),nextMin=[...oldMin] as Vec3,nextMax=[...oldMax] as Vec3;
 for(let a=0;a<3;a++){
  const lo=Math.floor((footprint.min[a]+source.extent)/source.step)-limits.haloCells,hi=Math.ceil((footprint.max[a]+source.extent)/source.step)+limits.haloCells;
  if(lo<oldMin[a])nextMin[a]=Math.floor(lo/limits.blockCells)*limits.blockCells-limits.paddingBlocks*limits.blockCells;
  if(hi>oldMax[a])nextMax[a]=Math.ceil(hi/limits.blockCells)*limits.blockCells+limits.paddingBlocks*limits.blockCells;
 }
 if(nextMin.every((v,a)=>v===oldMin[a]&&nextMax[a]===oldMax[a]))return null;
 const dimensions=nextMin.map((v,a)=>nextMax[a]-v+1) as Vec3,samples=count(dimensions),oldCount=count(oldDimensions),transientStorageBytes=(oldCount+samples)*8;
 if(!dimensions.every(n=>Number.isSafeInteger(n)&&n>=3&&n<=limits.maxAxisSamples)||!nextMin.every(v=>Number.isSafeInteger(v)&&Math.abs(v)<=1000000)||!Number.isSafeInteger(samples)||samples>limits.maxSamples||transientStorageBytes>limits.maxTransientBytes)throw new Error('Volume growth exceeds the dense storage safety limit. Existing sculpture kept; no resolution was reduced.');
 return {latticeMin:nextMin,dimensions,offset:oldMin.map((v,a)=>v-nextMin[a]) as Vec3,samples,addedSamples:samples-oldCount,storageBytes:samples*8,transientStorageBytes};
}
export function prepareDenseGrowth(source:SDFVolume,footprint:VolumeBounds,options:Partial<DenseGrowthLimits>={},allocate?:DenseAllocator):DenseGrowthResult{
 const start=performance.now(),plan=planDenseGrowth(source,footprint,options);
 if(!plan)return {source,volume:source,plan:null,stats:{allocationMs:0,copyMs:0,totalMs:performance.now()-start}};
 let next:SDFVolume;
 const allocationStart=performance.now();
 try{next=new SDFVolume(source.resolution,source.extent,false,{dimensions:plan.dimensions,latticeMin:plan.latticeMin},allocate);}catch{throw new Error('Could not allocate expanded volume storage. Existing sculpture kept; reduce the requested growth.');}
 if(next.sharesStorageWith(source))throw new Error('Expanded storage must not alias the source buffers. Original volume kept.');
 const allocationMs=performance.now()-allocationStart,copyStart=performance.now(),old=source.dimensions,[nx,ny,nz]=plan.dimensions,[ox,oy,oz]=plan.offset,limit=Math.fround(source.extent*4);
 // At aligned lattice nodes exterior extension needs no interpolation. Only new
 // samples are initialized. Saturation is far-field-only; old Float32s copy exactly.
 for(let z=0;z<nz;z++)for(let y=0;y<ny;y++){
  const insideYZ=z>=oz&&z<oz+old[2]&&y>=oy&&y<oy+old[1];
  for(let x=0;x<nx;x++){
   if(insideYZ&&x===ox){x+=old[0]-1;continue;}
   const sx=Math.max(0,Math.min(old[0]-1,x-ox)),sy=Math.max(0,Math.min(old[1]-1,y-oy)),sz=Math.max(0,Math.min(old[2]-1,z-oz)),boundary=source.values[source.index(sx,sy,sz)];
   if(!Number.isFinite(boundary)||boundary<=0||boundary>limit)throw new Error('Cannot expand an invalid source boundary. Original volume kept.');
   const distance=boundary===limit?0:Math.hypot(x-ox-sx,y-oy-sy,z-oz-sz)*source.step;
   next.values[next.index(x,y,z)]=Math.min(limit,boundary+distance);
  }
 }
 for(let z=0;z<old[2];z++)for(let y=0;y<old[1];y++){
  const begin=source.index(0,y,z);next.values.set(source.values.subarray(begin,begin+old[0]),next.index(ox,y+oy,z+oz));
 }
 const stats={allocationMs,copyMs:performance.now()-copyStart,totalMs:performance.now()-start};
 metadata.set(next,{expansions:(metadata.get(source)?.expansions??0)+1,lastExpansionMs:stats.totalMs});
 return {source,volume:next,plan,stats};
}
/** Validate before rebinding geometry. This also rejects a stale prepared copy if
 * its source was edited after preparation. No retained history is migrated here. */
export function assertExactDenseGrowth(source:SDFVolume,next:SDFVolume):Vec3{
 if(source===next)return [0,0,0];
 if(source.resolution!==next.resolution||source.extent!==next.extent||source.step!==next.step)throw new Error('Growth must preserve the original lattice and voxel spacing.');
 const oldMin=source.latticeMin,newMin=next.latticeMin,old=source.dimensions,d=next.dimensions,offset=oldMin.map((v,a)=>v-newMin[a]) as Vec3;
 if(!offset.every((v,a)=>Number.isSafeInteger(v)&&v>=0&&v+old[a]<=d[a]))throw new Error('Growth cannot crop or shift the existing lattice.');
 const a=new Uint32Array(source.values.buffer,source.values.byteOffset,source.values.length),b=new Uint32Array(next.values.buffer,next.values.byteOffset,next.values.length);
 for(let z=0;z<old[2];z++)for(let y=0;y<old[1];y++)for(let x=0;x<old[0];x++)if(a[source.index(x,y,z)]!==b[next.index(x+offset[0],y+offset[1],z+offset[2])])throw new Error('Growth copy is stale or existing voxels changed. No mesher binding was changed.');
 return offset;
}
export function denseGrowthDiagnostics(volume:SDFVolume){return {dimensions:volume.dimensions,bounds:volume.bounds,samples:volume.values.length,storageBytes:volume.values.length*8,voxelSpacing:volume.step,...(metadata.get(volume)??{expansions:0,lastExpansionMs:0})};}
