import {sculptMask,type MaskSnapshot} from './sculpt-mask';
import type {HierarchyState} from './layer-hierarchy';
import type {IndependentLayers} from './independent-layers';
import type {ProjectSettings} from './project';
import type {ProjectDisplayPreferences} from './display-preferences';
import type {ToolPreferences} from './tool-preferences';
import type {LayerMetadata} from './layers';
import {volumeSampleCount} from './volume-store';
export type ProjectSnapshot={hierarchy?:HierarchyState;id:string;name:string;activeLayerId:string;settings:ProjectSettings;displayPreferences?:ProjectDisplayPreferences;toolPreferences?:ToolPreferences;layers:{metadata:LayerMetadata;resolution:number;extent:number;dimensions:[number,number,number];latticeMin:[number,number,number];values:Float32Array;mask?:MaskSnapshot}[]};
export type EncodedSnapshot={data:ArrayBuffer;checksum:number;milliseconds:number;copyMs:number;temporaryBytes:number};
/** Native codec adapter with independent immutable values; no GPU/undo/preview state. */
export async function captureProject(layers:IndependentLayers,settings:ProjectSettings,display:ProjectDisplayPreferences|undefined,tools:ToolPreferences|undefined,signal:AbortSignal,current:()=>boolean,maxBytes=256*1024**2):Promise<{snapshot:ProjectSnapshot;copyMs:number;temporaryBytes:number}>{
 if(!layers.recoveryReady)throw new Error('Recovery waits for completed edits.');
 const samples=layers.project.layerStack.layers.reduce((n,l)=>n+volumeSampleCount(l.volume),0),temporaryBytes=samples*16+layers.project.layerStack.layers.reduce((n,l)=>n+sculptMask(l.volume).memoryBytes*3,0)+65536+(display?.references?.reduce((n,r)=>n+r.bytes.byteLength,0)??0)*4;
 if(layers.trackedBytes+layers.composite.trackedBytes+temporaryBytes>maxBytes)throw new Error('Recovery memory safety estimate reached. Save manually or reduce retained history; last checkpoint kept.');
 const start=performance.now(),check=()=>{if(signal.aborted||!current()||!layers.recoveryReady)throw new Error('Recovery snapshot interrupted by an edit.');};check();
 const snapshot:ProjectSnapshot={hierarchy:layers.project.layerStack.hierarchy.enabled?layers.project.layerStack.hierarchy.snapshot():undefined,id:layers.project.id,name:layers.project.name,activeLayerId:layers.project.activeLayerId,settings:structuredClone(settings),displayPreferences:display===undefined?undefined:structuredClone(display),toolPreferences:tools===undefined?undefined:structuredClone(tools),layers:[]};
 // Reservation is released synchronously on user interruption, before new edit admission.
 const release=()=>{layers.backgroundBytes=0;};layers.backgroundBytes=temporaryBytes;signal.addEventListener('abort',release,{once:true});
 try{let deadline=performance.now()+2;
  for(const layer of layers.project.layerStack.layers){const v=layer.volume,values=new Float32Array(volumeSampleCount(v)),dense=v.getDenseView();snapshot.layers.push({metadata:layer.metadata(),resolution:v.resolution,extent:v.extent,dimensions:v.dimensions,latticeMin:v.latticeMin??[0,0,0],values,mask:sculptMask(v).snapshot()});
   for(let i=0;i<values.length;i+=16384){check();const end=Math.min(values.length,i+16384);if(dense)values.set(dense.subarray(i,end),i);else for(let j=i;j<end;j++)values[j]=v.readVoxel(j);if(performance.now()>=deadline){await new Promise<void>(r=>setTimeout(r,0));deadline=performance.now()+2;}}
  }check();return {snapshot,copyMs:performance.now()-start,temporaryBytes};
 }catch(error){release();throw error;}finally{signal.removeEventListener('abort',release);}
}
export function checksum(data:ArrayBuffer):number{let hash=0xffffffff;const bytes=new Uint8Array(data);for(let i=0;i<bytes.length;i++)hash=TABLE[(hash^bytes[i])&255]^(hash>>>8);return (hash^0xffffffff)>>>0;}
const TABLE=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let b=0;b<8;b++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
