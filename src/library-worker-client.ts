import type {ProjectSnapshot} from './project-snapshot';
import type {ProjectSettings} from './project';
import type {ProjectRecord} from './project-library';
export function prepareLibrary(request:{kind:'decode';data:ArrayBuffer}|{kind:'import';data:ArrayBuffer;name:string}|{kind:'new';resolution:number;contents:string;settings:ProjectSettings},signal:AbortSignal):Promise<{data:ArrayBuffer;record?:ProjectRecord;snapshot?:ProjectSnapshot}>{
 return new Promise((resolve,reject)=>{if(signal.aborted){reject(new Error('Project operation cancelled.'));return;}const worker=new Worker(new URL('./library-worker.ts',import.meta.url),{type:'module'});const stop=()=>{worker.terminate();signal.removeEventListener('abort',abort);};const abort=()=>{stop();reject(new Error('Project operation cancelled; current work kept.'));};signal.addEventListener('abort',abort,{once:true});worker.onerror=e=>{stop();reject(new Error(e.message));};worker.onmessage=({data})=>{stop();if(data.error)reject(Object.assign(new Error(data.error.message),{code:data.error.code}));else resolve(data.result);};try{worker.postMessage(request,request.kind!=='new'?[request.data]:[]);}catch(error){stop();reject(error);}});
}
