import {newId} from './layers';
import type {EncodedSnapshot} from './project-snapshot';
import {RECOVERY_FORMAT,type RecoveryRecord,type RecoveryStore} from './recovery-store';
export type RecoveryHooks={key:()=>string;ready:()=>boolean;encode:(signal:AbortSignal)=>Promise<EncodedSnapshot>;project:()=>{id:string;name:string};changed:()=>void;reserve?:(bytes:number)=>void};
/** One job, one native snapshot, one atomic storage commit. The controller has no
 * voxel state and never applies recovered data to the live project automatically. */
export class RecoveryController {
 enabled=true;initialized=false;blocked=false;records:RecoveryRecord[]=[];warning='';lastSuccess=0;lastBytes=0;lastMs=0;lastCopyMs=0;temporaryBytes=0;active=false;
 private observed='';private dirty=false;private dirtySince=0;private lastEdit=0;private lastAttempt=-Infinity;private retryAt=0;private epoch=0;private abort?:AbortController;private job?:Promise<void>;private disposed=false;
 constructor(readonly store:RecoveryStore,private readonly hooks:RecoveryHooks){}
 async init():Promise<void>{let timer:ReturnType<typeof setTimeout>|undefined;try{const [enabled,records]=await Promise.race([Promise.all([this.store.enabled(),this.store.list()]),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Recovery storage timed out. Autosave is off; manual save remains available.')),8000);})]);if(this.disposed)return;this.enabled=enabled;this.records=records;this.blocked=records.length>0;this.lastSuccess=records[0]?.createdAt??0;this.lastBytes=records[0]?.bytes??0;this.observed=this.hooks.key();}catch(error){this.warning=error instanceof Error?error.message:String(error);this.enabled=false;}finally{clearTimeout(timer);this.initialized=true;if(!this.disposed)this.hooks.changed();}}

 observe(now:number,key=this.hooks.key()):void{if(!this.observed){this.observed=key;return;}if(key!==this.observed){this.observed=key;if(!this.dirty)this.dirtySince=now;this.dirty=true;this.lastEdit=now;}}
 async tick(now=Date.now(),urgent=false):Promise<void>{
  if(this.disposed||!this.initialized||!this.hooks.ready())return;try{this.observe(now);}catch(error){this.warning=`Recovery waits for valid metadata: ${String(error)}`;this.hooks.changed();return;}
  if(!this.enabled||this.blocked||this.active||!this.dirty||!this.hooks.ready()||now<this.retryAt||now-this.lastAttempt<5000||(!urgent&&now-this.lastSuccess<30000)||(!urgent&&now-this.lastEdit<5000&&now-this.dirtySince<120000))return;
  this.lastAttempt=now;this.active=true;const revision=this.observed,epoch=this.epoch,abort=new AbortController(),project=this.hooks.project();this.abort=abort;this.hooks.changed();
  this.job=(async()=>{const start=performance.now();try{const encoded=await this.hooks.encode(abort.signal);if(abort.signal.aborted||epoch!==this.epoch||this.disposed)throw new Error('Recovery cancelled.');this.temporaryBytes=encoded.data.byteLength*2;this.hooks.reserve?.(this.temporaryBytes);
   const record:RecoveryRecord={id:`${project.id}:${now}:${newId()}`,format:RECOVERY_FORMAT,projectId:project.id,projectName:project.name,createdAt:now,revision,bytes:encoded.data.byteLength,checksum:encoded.checksum};
   await this.store.write(record,encoded.data,abort.signal);if(epoch!==this.epoch||this.disposed)return;this.lastSuccess=now;this.lastBytes=record.bytes;this.lastMs=performance.now()-start;this.lastCopyMs=encoded.copyMs;this.warning='';this.dirty=this.observed!==revision;if(this.dirty)this.dirtySince=now;this.records=await this.store.list();
  }catch(error){if(!abort.signal.aborted&&epoch===this.epoch){this.warning=error instanceof Error?error.message:String(error);this.retryAt=now+60000;}}
  finally{this.active=false;this.abort=undefined;this.temporaryBytes=0;this.hooks.reserve?.(0);this.job=undefined;if(!this.disposed)this.hooks.changed();}})();await this.job;
 }
 cancelJob():void{this.abort?.abort();this.hooks.reserve?.(0);}
 async settle():Promise<void>{await this.job;}
 replaceProject():void{this.epoch++;this.cancelJob();this.observed=this.hooks.key();this.dirty=false;this.retryAt=0;this.hooks.changed();}
 async setEnabled(value:boolean):Promise<void>{this.cancelJob();await this.settle();this.enabled=value;try{await this.store.setEnabled(value);this.warning='';this.retryAt=0;}catch(error){this.warning=String(error);}this.hooks.changed();}
 async discard():Promise<void>{this.epoch++;this.cancelJob();await this.settle();try{await this.store.clear();this.records=[];this.blocked=false;this.lastSuccess=this.lastBytes=0;this.warning='';}catch(error){this.warning=String(error);}this.hooks.changed();}
 restored(record:RecoveryRecord):void{this.replaceProject();this.warning='';this.blocked=false;this.lastSuccess=record.createdAt;this.lastBytes=record.bytes;this.hooks.changed();}
 status():string{return !this.initialized?'Checking local recovery…':this.warning?`Autosave ${this.enabled?'on':'off'} · recovery warning: ${this.warning}`:this.blocked?(this.enabled?'Recovery available · choose Restore or Discard; autosave paused.':'Autosave off · recovery available; checkpoints kept until Restore or Discard.'):!this.enabled?'Autosave off · manual saves are separate.':this.active?'Creating local recovery checkpoint…':this.lastSuccess?`Autosave on · last checkpoint ${new Date(this.lastSuccess).toLocaleTimeString()} · ${(this.lastBytes/1048576).toFixed(1)} MiB`:'Autosave on · waiting for completed edits and an idle pause.';}
 dispose():void{this.disposed=true;this.epoch++;this.cancelJob();void this.settle().finally(()=>this.store.close());}
}
