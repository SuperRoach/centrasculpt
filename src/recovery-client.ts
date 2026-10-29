import {captureProject} from './project-snapshot';
import type {EncodedSnapshot} from './project-snapshot';
import type {IndependentLayers} from './independent-layers';
import type {ProjectSettings} from './project';
import type {ProjectDisplayPreferences} from './display-preferences';
import type {ToolPreferences} from './tool-preferences';
let generation=0;
export async function encodeRecovery(layers:IndependentLayers,settings:ProjectSettings,display:ProjectDisplayPreferences|undefined,tools:ToolPreferences|undefined,signal:AbortSignal,current:()=>boolean):Promise<EncodedSnapshot>{
 if(typeof Worker==='undefined')throw new Error('Autosave requires Web Workers in this browser. Manual save is still available.');
 let worker:Worker|undefined,cleanup=()=>{};const release=()=>{worker?.terminate();layers.backgroundBytes=0;};signal.addEventListener('abort',release,{once:true});
 try{const {snapshot,copyMs,temporaryBytes}=await captureProject(layers,settings,display,tools,signal,current);if(signal.aborted)throw new Error('Recovery cancelled.');worker=new Worker(new URL('./recovery-worker.ts',import.meta.url),{type:'module'});const id=++generation;
  const result=await new Promise<{data:ArrayBuffer;checksum:number;milliseconds:number}>((resolve,reject)=>{const abort=()=>reject(new Error('Recovery cancelled.'));cleanup=()=>signal.removeEventListener('abort',abort);signal.addEventListener('abort',abort,{once:true});worker!.onerror=e=>reject(new Error(`Recovery worker failed: ${e.message}. Last checkpoint kept.`));worker!.onmessage=({data:d})=>{if(d.id!==id)return;if(d.error)reject(new Error(d.error));else if(!(d.result?.data instanceof ArrayBuffer))reject(new Error('Invalid recovery worker response.'));else resolve(d.result);};worker!.postMessage({id,snapshot},[...new Set([...snapshot.layers.map(l=>l.values.buffer),...(snapshot.displayPreferences?.references?.map(r=>r.bytes.buffer as ArrayBuffer)??[])])]);});
  if(signal.aborted)throw new Error('Recovery cancelled.');return {...result,copyMs,temporaryBytes};
 }finally{cleanup();signal.removeEventListener('abort',release);release();}
}
