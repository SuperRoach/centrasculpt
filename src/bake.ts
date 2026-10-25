import type { SculptProject } from './layers';
import { validateName } from './layers';
import { compositeLayout, prepareComposite } from './compositor';
import { SDFVolume } from './sdf';
import { MAX_PROJECT_LAYERS, MAX_PROJECT_VOXELS } from './project';
import type { Vec3 } from './transform';
export type SurfaceView='separate'|'boolean';
export type BakeOptions={name:string;resolution:number;hideSources:boolean};
export type BakePlan={resolution:number;center:Vec3;extent:number;scale:number;min:Vec3;max:Vec3;worldStep:number;sourceIds:string[];gridBytes:number;projectGridBytes:number;detailLimited:boolean};
export type BakeProgress={stage:'sampling'|'meshing';completed:number;total:number};
export type BakeStats={samplingMs:number;meshingMs:number;totalMs:number;resolution:number;triangles:number;worldStep:number;gridBytes:number};
export function planBake(project:SculptProject,resolution:number):BakePlan {
  if(![64,128,192].includes(resolution))throw new Error('Bake resolution must be 64³, 128³ or 192³.');
  const layers=project.layerStack.layers,visible=layers.filter(l=>l.visible);
  if(!visible.length)throw new Error('Show at least one source layer before baking.');
  if(layers.length>=MAX_PROJECT_LAYERS)throw new Error('Bake needs room for a new layer (maximum 8). Original layers are never deleted.');
  if(!Number.isSafeInteger(Math.max(...layers.map(l=>l.order))+1))throw new Error('Layer ordering is outside the supported Bake range. Reorder sources before baking.');
  const count=layers.reduce((sum,l)=>sum+l.volume.resolution**3,0)+resolution**3;
  if(count>MAX_PROJECT_VOXELS)throw new Error('Bake exceeds the project voxel budget, including hidden sources. Choose a lower output resolution; sources were kept.');
  const layout=compositeLayout(layers,resolution),scale=layout.extent/1.6;
  if(!Number.isFinite(scale)||scale<.001||scale>1000||layout.center.some(v=>!Number.isFinite(v)||Math.abs(v)>1000))throw new Error('Bake bounds exceed supported transform limits. Move/scale sources closer together before baking.');
  return {resolution,center:layout.center,extent:layout.extent,scale,min:layout.center.map(v=>v-layout.extent) as Vec3,max:layout.center.map(v=>v+layout.extent) as Vec3,worldStep:2*layout.extent/(resolution-1),sourceIds:visible.map(l=>l.id),gridBytes:resolution**3*8,projectGridBytes:count*8,detailLimited:2*layout.extent/(resolution-1)>layout.desiredStep*1.001};
}
export function validateBakeOptions(options:BakeOptions):BakeOptions {
  if(typeof options.hideSources!=='boolean')throw new Error('Choose whether to hide the sources.');
  return {name:validateName(options.name).trim(),resolution:options.resolution,hideSources:options.hideSources};
}
export const yieldBake=()=>new Promise<void>(resolve=>setTimeout(resolve,0));
export function checkBakeCancelled(signal?:AbortSignal):void {if(signal?.aborted)throw new Error('Bake cancelled. Source layers were kept.');}
/** Samples the ordered WORLD field, storing local distances in a normalized editable grid.
 * Normalized local bounds preserve native v3 compatibility; uniform TRS restores world size.
 */
export async function sampleBake(project:SculptProject,plan:BakePlan,signal?:AbortSignal,progress?:(p:BakeProgress)=>void):Promise<{volume:SDFVolume;samplingMs:number}> {
  checkBakeCancelled(signal);
  const volume=new SDFVolume(plan.resolution,1.6,false),sample=prepareComposite(project.layerStack.layers),n=plan.resolution;
  let samplingMs=0,negative=false;
  for(let z=0;z<n;z++){
    const start=performance.now(),wz=volume.coordinate(z)*plan.scale+plan.center[2];
    for(let y=0;y<n;y++){const wy=volume.coordinate(y)*plan.scale+plan.center[1];for(let x=0;x<n;x++){
      const value=sample(volume.coordinate(x)*plan.scale+plan.center[0],wy,wz)/plan.scale;
      if(!Number.isFinite(value))throw new Error('Bake produced invalid SDF samples. Source layers were kept.');
      // Saturate far-field magnitudes to existing native/sculpt stability bounds, preserving zeros.
      const next=Math.fround(Math.max(-6.4,Math.min(6.4,value)));
      if((x===0||y===0||z===0||x===n-1||y===n-1||z===n-1)&&next<=0)throw new Error('Bake boundary would clip the result. Source layers were kept.');
      volume.values[volume.index(x,y,z)]=next;if(next<0)negative=true;
    }}
    samplingMs+=performance.now()-start;
    if(z%4===3||z===n-1){progress?.({stage:'sampling',completed:z+1,total:n});await yieldBake();checkBakeCancelled(signal);}
  }
  if(!negative)throw new Error('Boolean result is empty at this resolution. No layer was created. Try a higher resolution if the result has tiny features.');
  return {volume,samplingMs};
}
