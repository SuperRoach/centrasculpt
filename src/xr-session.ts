export type XRAvailability={supported:boolean;reason:string};
export async function detectXR(secure:boolean,xr?:Pick<XRSystem,'isSessionSupported'>):Promise<XRAvailability>{
 if(!secure)return {supported:false,reason:'WebXR needs a secure origin: trusted HTTPS, or localhost on the PC running this browser (Quest: use ADB reverse). HTTP .local/LAN addresses are desktop-only.'};
 if(!xr)return {supported:false,reason:'This browser does not expose WebXR. Use a compatible WebXR browser and headset runtime, or the development emulator; desktop editing remains available.'};
 try{const supported=await xr.isSessionSupported('immersive-vr');return {supported,reason:supported?'Immersive VR available. Enter from a user click.':'No immersive-vr device/runtime available. Check the connected headset, active OpenXR runtime and browser support, or configure an emulator.'};}
 catch(error){return {supported:false,reason:`VR capability check failed: ${error instanceof Error?error.message:String(error)}. Check browser permissions and runtime support.`};}
}
export type XRSessionState='checking'|'unavailable'|'ready'|'requesting'|'presenting'|'ending';
export type XRSessionHooks={prepare:()=>void;restore:()=>void;changed:()=>void};
/** User gesture requests a session immediately; scene hooks never own sculpture data. */
export class XRSessionController {
 state:XRSessionState='checking';
 reason='Checking immersive VR support…';
 session:XRSession|null=null;
 private xr:XRSystem|undefined;
 private prepared=false;
 private disposed=false;
 constructor(private readonly manager:{setSession:(session:XRSession)=>Promise<void>},private readonly hooks:XRSessionHooks){}
 get blocking():boolean{return this.state==='requesting'||this.state==='presenting'||this.state==='ending';}
 async check(secure:boolean,xr?:XRSystem):Promise<void>{
  if(this.blocking||this.disposed)return;this.xr=xr;const result=await detectXR(secure,xr);if(this.disposed||this.blocking)return;
  this.state=result.supported?'ready':'unavailable';this.reason=result.reason;this.hooks.changed();
 }
 async enter():Promise<void>{
  if(this.state!=='ready'||!this.xr||this.disposed)return;
  this.state='requesting';this.reason='Requesting immersive VR…';this.hooks.changed();
  let session:XRSession|undefined;
  try{
   // requestSession must stay directly in the trusted click path, before any await/preparation.
   const request=this.xr.requestSession('immersive-vr',{optionalFeatures:['local-floor']});
   session=await request;
   if(this.disposed){try{await session.end();}finally{this.state='ready';this.reason='VR request cancelled. Desktop retained.';this.hooks.changed();}return;}
   this.session=session;const active=session;
   session.addEventListener('end',()=>queueMicrotask(()=>this.finish(active)),{once:true});
   this.prepared=true;this.hooks.prepare();await this.manager.setSession(session);
   if(this.session!==session)return;
   this.state='presenting';this.reason='VR active · Tool Hand edits the selected layer · use headset system controls to exit.';this.hooks.changed();
  }catch(error){
   if(session){try{await session.end();}catch{/* Restore the app even if setup never completed. */}this.finish(session);}
   else{this.state='ready';this.hooks.changed();}
   this.reason=`Could not enter VR: ${error instanceof Error?error.message:String(error)}. Desktop sculpture kept; retry from Enter VR.`;this.hooks.changed();
  }
 }
 async exit():Promise<void>{
  const session=this.session;if(!session||this.state==='ending')return;
  this.state='ending';this.reason='Exiting VR…';this.hooks.changed();
  try{await session.end();this.finish(session);}
  catch(error){if(this.session===session){this.state='presenting';this.reason=`Exit request failed: ${error instanceof Error?error.message:String(error)}. Use headset system controls to exit.`;this.hooks.changed();}}
 }
 private finish(session:XRSession):void{
  if(this.session!==session)return;this.session=null;
  if(this.prepared){this.prepared=false;this.hooks.restore();}
  this.state='ready';this.reason='Desktop restored. Sculpture and independent layer data retained.';this.hooks.changed();
 }
 async dispose():Promise<void>{this.disposed=true;await this.exit();}
}
export class XRFrameStats {
 private last:number|null=null;
 private readonly intervals=new Float64Array(120);private count=0;private head=0;private sum=0;
 frames=0;cpuMs=0;latestMs=0;spikes=0;
 reset():void{this.last=null;this.count=this.head=this.sum=0;this.frames=0;this.cpuMs=this.latestMs=this.spikes=0;}
 frame(time:number,cpuMs=this.cpuMs):void{if(!Number.isFinite(time)||this.last!==null&&time<=this.last)return;if(this.last!==null){const interval=time-this.last;if(interval>0){const baseline=this.averageMs;if(this.count>=6&&interval>Math.max(baseline*2,baseline+8))this.spikes++;this.latestMs=interval;if(this.count===120)this.sum-=this.intervals[this.head];else this.count++;this.intervals[this.head]=interval;this.sum+=interval;this.head=(this.head+1)%120;}}this.last=time;this.frames++;this.cpuMs=cpuMs;}
 pause():void{this.last=null;}
 get sampleCount():number{return this.count;}
 get medianMs():number{const a=this.intervals.slice(0,this.count).sort();return this.count?a[Math.ceil(this.count*.5)-1]:0;}
 get p99Ms():number|null{const a=this.intervals.slice(0,this.count).sort();return this.count>=100?a[Math.ceil(this.count*.99)-1]:null;}
 get averageMs():number{return this.count?this.sum/this.count:0;}
 get fps():number{return this.averageMs?1000/this.averageMs:0;}
 get maxMs():number{let max=0;for(let i=0;i<this.count;i++)max=Math.max(max,this.intervals[i]);return max;}
 get p95Ms():number{const sorted=this.intervals.slice(0,this.count).sort();return this.count?sorted[Math.ceil(this.count*.95)-1]:0;}
}
