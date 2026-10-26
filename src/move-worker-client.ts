import {Mesh} from 'three';
import type {Group} from 'three';
import type {SDFVolume} from './sdf';
import type {RadialMoveField} from './move-field';
import {reconstructMove} from './deformation-reconstruction';
import type {MoveWork,MoveProgress} from './deformation-reconstruction';
let generation=0;
/** Browser worker owns copies only. Node/unsupported environments use the cooperative path.
 * Worker startup/runtime failures reject without retrying expensive work on the render thread. */
export async function reconstructMoveAsync(surface:Group,next:SDFVolume,field:RadialMoveField,work:MoveWork,maxBytes:number,progress:(p:MoveProgress)=>void):ReturnType<typeof reconstructMove>{
 if(typeof Worker==='undefined')return reconstructMove(surface,next,field,work,maxBytes,progress);
 const id=++generation,positions:Float32Array[]=[];let snapshotBytes=next.values.byteLength*2;
 for(const o of surface.children)if(o instanceof Mesh)snapshotBytes+=o.geometry.getAttribute('position').count*12;
 // Preserve existing large-volume support when worker duplication exceeds the cap.
 let vertices=0;for(const o of surface.children)if(o instanceof Mesh)vertices+=o.geometry.getAttribute('position').count;
 if(snapshotBytes+vertices*48>=maxBytes)return reconstructMove(surface,next,field,work,maxBytes,progress);
 const values=new Float32Array(next.values.length);
 for(let i=0;i<values.length;i+=65536){values.set(next.values.subarray(i,i+65536),i);await work.pause();}
 for(const o of surface.children)if(o instanceof Mesh){const a=o.geometry.getAttribute('position'),copy=new Float32Array(a.count*3);for(let i=0;i<a.count;i++){copy[i*3]=a.getX(i);copy[i*3+1]=a.getY(i);copy[i*3+2]=a.getZ(i);if(i%2048===2047)await work.pause();}positions.push(copy);}
 work.check();work.backend='worker';work.workerSnapshotBytes=snapshotBytes;const worker=new Worker(new URL('./move-reconstruction-worker.ts',import.meta.url),{type:'module'});
 let cleanup=()=>{};
 try{return await work.wait(new Promise((resolve,reject)=>{
  const abort=()=>reject(new Error('Move cancelled · source or session changed.'));
  const poll=setInterval(()=>{try{work.check();}catch(error){reject(error);}},16);
  cleanup=()=>{clearInterval(poll);work.signal.removeEventListener('abort',abort);};
  work.signal.addEventListener('abort',abort,{once:true});
  worker.onerror=e=>{cleanup();reject(new Error(`Move worker failed: ${e.message}`));};
  worker.onmessage=({data:d})=>{if(d.id!==id)return;try{work.check();if(d.error)throw new Error(d.error);if(d.progress){progress(d.progress);return;}cleanup();resolve(d.result);}catch(error){cleanup();reject(error);}};
  worker.postMessage({id,positions,values,resolution:next.resolution,extent:next.extent,layout:{dimensions:next.dimensions,latticeMin:next.latticeMin},maxBytes:maxBytes-snapshotBytes,field:{center:field.center.toArray(),radius:field.radius,falloff:field.falloff,mode:field.mode,stiffness:field.stiffness,delta:field.delta.toArray(),interaction:field.interaction,axis:field.axis.toArray(),angle:field.angle}},[values.buffer,...positions.map(p=>p.buffer)]);
 }));}finally{cleanup();worker.terminate();}
}
