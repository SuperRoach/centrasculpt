import {Worker as Thread} from 'node:worker_threads';
export class RecoveryBrowserWorker {
 static active=0;static terminated=0;
 constructor(){RecoveryBrowserWorker.active++;this.ended=false;this.thread=new Thread(`const {parentPort}=require('node:worker_threads');global.self=global;self.postMessage=(d,o)=>parentPort.postMessage(d,o?.transfer);import(${JSON.stringify(new URL('../../work/test-build/recovery-worker.mjs',import.meta.url).href)}).then(()=>parentPort.on('message',data=>self.onmessage({data})));`,{eval:true});this.thread.on('message',data=>this.onmessage?.({data}));this.thread.on('error',e=>this.onerror?.({message:e.message}));}
 postMessage(d,t){this.thread.postMessage(d,t);}
 terminate(){if(this.ended)return;this.ended=true;RecoveryBrowserWorker.active--;RecoveryBrowserWorker.terminated++;void this.thread.terminate();}
}
