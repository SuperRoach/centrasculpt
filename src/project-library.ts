import {MAX_PROJECT_BYTES} from './project';
export const LIBRARY_BYTES=512*1024**2,LIBRARY_COUNT=100;
export class LibraryError extends Error{constructor(readonly code:'storage'|'quota'|'conflict'|'missing'|'invalid'|'cancelled',message:string){super(message);this.name='LibraryError';}}
export type ProjectRecord={id:string;name:string;modified:number;opened:number;revision:number;bytes:number;version:number;sourceVersion:number;resolutions:number[];layers:number;thumbnail?:string};
export function libraryName(name:string):string{const clean=name.trim();if(!clean||clean.length>80||/[\x00-\x1f]/.test(name))throw new LibraryError('invalid','Use a project name of 1–80 characters.');return clean;}
/** Explicit saves only. Recovery has a separate database and cannot call this store. */
export class ProjectLibrary{
 private database?:Promise<IDBDatabase>;
 constructor(private factory:IDBFactory=globalThis.indexedDB,private name='centra-sculpt-library',private budget=LIBRARY_BYTES){}
 private open():Promise<IDBDatabase>{
  if(!this.factory)return Promise.reject(new LibraryError('storage','Browser-local storage unavailable. Download your project.'));
  return this.database??=new Promise<IDBDatabase>((resolve,reject)=>{const r=this.factory.open(this.name,1);let failed=false;r.onupgradeneeded=()=>{r.result.createObjectStore('records');r.result.createObjectStore('payloads');};r.onerror=r.onblocked=()=>{failed=true;this.database=undefined;reject(new LibraryError('storage','Library unavailable. Close other tabs or download your work.'));};r.onsuccess=()=>{if(failed){r.result.close();return;}r.result.onversionchange=()=>{r.result.close();this.database=undefined;};resolve(r.result);};});
 }
 private async transaction<T>(write:boolean,run:(tx:IDBTransaction,done:(value:T)=>void)=>void,signal?:AbortSignal):Promise<T>{
  const db=await this.open();if(signal?.aborted)throw new LibraryError('cancelled','Project operation cancelled; saved projects kept.');
  return new Promise<T>((resolve,reject)=>{const tx=db.transaction(['records','payloads'],write?'readwrite':'readonly',{durability:'strict'});let value:T,error:unknown;const abort=()=>{try{tx.abort();}catch{}};signal?.addEventListener('abort',abort,{once:true});const clean=()=>signal?.removeEventListener('abort',abort);
   tx.oncomplete=()=>{clean();resolve(value);};tx.onerror=e=>{error=(e.target as IDBRequest).error;};tx.onabort=()=>{clean();reject(error instanceof LibraryError?error:new LibraryError(signal?.aborted?'cancelled':(error as Error)?.name==='QuotaExceededError'?'quota':'storage',`Library transaction failed (${(error as Error)?.message??'interrupted'}). Previous saves kept. Download work or free browser storage.`));};
   try{run(tx,v=>{value=v;});}catch(e){error=e;abort();}
   // IDB callbacks use this guard to abort atomically on validation failures.
   (tx as IDBTransaction&{fail:(e:unknown)=>void}).fail=e=>{error=e;abort();};
  });
 }
 async list():Promise<ProjectRecord[]>{return this.transaction(false,(tx,done)=>{const r=tx.objectStore('records').getAll();r.onsuccess=()=>done((r.result as ProjectRecord[]).sort((a,b)=>b.modified-a.modified||a.id.localeCompare(b.id)));});}
 async read(id:string):Promise<{record:ProjectRecord;data:ArrayBuffer}>{return this.transaction(false,(tx,done)=>{const r=tx.objectStore('records').get(id),p=tx.objectStore('payloads').get(id);p.onsuccess=()=>{if(!r.result||!(p.result instanceof ArrayBuffer)||r.result.bytes!==p.result.byteLength){fail(tx,new LibraryError('missing','Saved project is missing or damaged. Current work kept.'));return;}done({record:r.result,data:p.result});};});}
 async put(record:ProjectRecord,data:ArrayBuffer,expected:number|null,signal?:AbortSignal):Promise<ProjectRecord>{
  record={...record,name:libraryName(record.name)};
  if(!record.id||data.byteLength<16||data.byteLength>MAX_PROJECT_BYTES||record.bytes!==data.byteLength||!Number.isFinite(record.modified)||record.thumbnail&&(!/^data:image\/(png|jpeg|webp);base64,/.test(record.thumbnail)||record.thumbnail.length>32768))throw new LibraryError('invalid','Invalid project metadata, thumbnail or size.');
  return this.transaction(true,(tx,done)=>{const records=tx.objectStore('records'),r=records.getAll();r.onsuccess=()=>{try{const all=r.result as ProjectRecord[],old=all.find(x=>x.id===record.id);if((old?.revision??null)!==expected)throw new LibraryError('conflict','This save changed in another tab. Reload the library or use Save As; nothing overwritten.');const others=all.filter(x=>x.id!==record.id);if(others.length>=LIBRARY_COUNT||others.reduce((n,x)=>n+x.bytes,0)+data.byteLength>this.budget)throw new LibraryError('quota','Library limit reached. Download work and explicitly delete unneeded projects.');const stored={...record,revision:(old?.revision??0)+1};records.put(stored,stored.id);tx.objectStore('payloads').put(data,stored.id);done(stored);}catch(e){fail(tx,e);}};},signal);
 }
 async metadata(id:string,revision:number,changes:{name?:string;opened?:number}):Promise<ProjectRecord>{return this.transaction(true,(tx,done)=>{const store=tx.objectStore('records'),r=store.get(id);r.onsuccess=()=>{try{const old=r.result as ProjectRecord|undefined;if(!old||old.revision!==revision)throw new LibraryError('conflict','Project changed in another tab. Refresh the library.');const next={...old,...changes,modified:changes.name===undefined?old.modified:Date.now(),name:changes.name===undefined?old.name:libraryName(changes.name),revision:old.revision+1};store.put(next,id);done(next);}catch(e){fail(tx,e);}};});}
 async delete(id:string,revision:number):Promise<void>{await this.transaction<void>(true,(tx,done)=>{const r=tx.objectStore('records').get(id);r.onsuccess=()=>{if(!r.result||r.result.revision!==revision){fail(tx,new LibraryError('conflict','Project changed; refresh before deleting.'));return;}tx.objectStore('records').delete(id);tx.objectStore('payloads').delete(id);done();};});}
 close():void{void this.database?.then(db=>db.close()).catch(()=>{});this.database=undefined;}
}
function fail(tx:IDBTransaction,error:unknown){(tx as IDBTransaction&{fail:(e:unknown)=>void}).fail(error);}
