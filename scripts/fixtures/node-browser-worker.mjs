import {Worker as Thread} from 'node:worker_threads';
export class BrowserWorker {
 static terminated=0;
 constructor(){this.thread=new Thread(`const {parentPort}=require('node:worker_threads');global.self=global;self.postMessage=(d,o)=>parentPort.postMessage(d,o?.transfer);import(${JSON.stringify(new URL('../../work/test-build/move-reconstruction-worker.mjs',import.meta.url).href)}).then(()=>parentPort.on('message',data=>self.onmessage({data})));`,{eval:true});this.thread.on('message',data=>this.onmessage?.({data}));this.thread.on('error',error=>this.onerror?.({message:error.message}));}
 postMessage(d,t){this.thread.postMessage(d,t);}
 terminate(){BrowserWorker.terminated++;void this.thread.terminate();}
}
