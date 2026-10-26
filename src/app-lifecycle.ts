/** Page/XR interruptions cancel transient edits synchronously; no last-second
 * synchronous file encoding in unload handlers. Durable checkpoints are periodic. */
export class AppLifecycle {
 lastError='';
 private readonly subscriptions:{target:EventTarget;type:string;fn:EventListener}[]=[];
 constructor(page:EventTarget&{visibilityState:string},window:EventTarget,interrupt:(reason:string)=>void,resume:()=>void){
  const on=(target:EventTarget,type:string,callback:EventListener)=>{const fn:EventListener=e=>{try{callback(e);}catch(error){this.lastError=String(error);}};target.addEventListener(type,fn);this.subscriptions.push({target,type,fn});};
  on(page,'visibilitychange',()=>{if(page.visibilityState==='hidden')interrupt('page hidden');else resume();});
  for(const type of ['freeze'])on(page,type,()=>interrupt(type));
  for(const type of ['blur','pagehide','error','unhandledrejection'])on(window,type,()=>interrupt(type));
  on(window,'pageshow',()=>resume());
 }
 dispose():void{for(const {target,type,fn}of this.subscriptions)target.removeEventListener(type,fn);this.subscriptions.length=0;}
}
