import {requireLegacyCubicGrid} from './volume-store';
import type { VolumeStore } from './volume-store';
import { SDFVolume } from './sdf';
export const DEFAULT_RESOLUTION=64;
export const MAX_RESOLUTION=192;
/** Trilinear resampling in unchanged world bounds. This changes topology/detail and starts new history. */
export function resampleVolume(source: VolumeStore, resolution: number): SDFVolume {
  requireLegacyCubicGrid(source,'Resolution resampling');
  if(!Number.isInteger(resolution)||resolution<3||resolution>MAX_RESOLUTION)throw new Error('Resolution must be an integer from 3 to 192.');
  const target=new SDFVolume(resolution,source.extent),n=source.resolution;
  // Resampling is a whole-volume operation: borrow once, or request one packed region.
  const samples=source.getDenseView()??source.readRegion({min:[0,0,0],max:[n-1,n-1,n-1]}).values;
  for(let z=0;z<resolution;z++)for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++) {
    const gx=x*(n-1)/(resolution-1),gy=y*(n-1)/(resolution-1),gz=z*(n-1)/(resolution-1);
    const ix=Math.min(n-2,Math.floor(gx)),iy=Math.min(n-2,Math.floor(gy)),iz=Math.min(n-2,Math.floor(gz));
    const tx=gx-ix,ty=gy-iy,tz=gz-iz;let value=0;
    for(let dz=0;dz<2;dz++)for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)value+=samples[source.index(ix+dx,iy+dy,iz+dz)]*(dx?tx:1-tx)*(dy?ty:1-ty)*(dz?tz:1-tz);
    target.values[target.index(x,y,z)]=value;
  }
  return target;
}
