export type XREnvironment='studio'|'passthrough';
export const environmentMode=(environment:XREnvironment):XRSessionMode=>environment==='passthrough'?'immersive-ar':'immersive-vr';
export type XRAvailability={supported:boolean;reason:string};
export async function detectXR(secure:boolean,xr?:Pick<XRSystem,'isSessionSupported'>,environment:XREnvironment='studio'):Promise<XRAvailability>{
 if(!secure)return {supported:false,reason:'WebXR needs a secure origin: trusted HTTPS, or localhost on the PC running this browser (Quest: use ADB reverse). HTTP .local/LAN addresses are desktop-only.'};
 if(!xr)return {supported:false,reason:'This browser does not expose WebXR. Use a compatible WebXR browser and headset runtime, or the development emulator; desktop editing remains available.'};
 try{const supported=await xr.isSessionSupported(environmentMode(environment));if(environment==='passthrough')return {supported,reason:supported?'Passthrough available. Enter Passthrough from a user click.':'Passthrough unavailable: this browser/runtime does not support immersive-ar. Studio and desktop remain available.'};return {supported,reason:supported?'Immersive VR available. Enter from a user click.':'No immersive-vr device/runtime available. Check the connected headset, active OpenXR runtime and browser support, or configure an emulator.'};}
 catch(error){return {supported:false,reason:`VR capability check failed: ${error instanceof Error?error.message:String(error)}. Check browser permissions and runtime support.`};}
}
export type XRSessionState='checking'|'unavailable'|'ready'|'requesting'|'presenting'|'ending';
export type XRSessionHooks={prepare:()=>void;restore:()=>void;changed:()=>void};
/** User gesture requests a session immediately; scene hooks never own sculpture data. */
export class XRSessionController {
 environment:XREnvironment='studio';
 activeEnvironment:XREnvironment|null=null;
 availability:Record<XREnvironment,XRAvailability>={studio:{supported:false,reason:'Checking Studio…'},passthrough:{supported:false,reason:'Checking Passthrough…'}};
 state:XRSessionState='checking';
 reason='Checking immersive VR support…';
 session:XRSession|null=null;
 private xr:XRSystem|undefined;
 private prepared=false;
 private disposed=false;
 constructor(private readonly manager:{setSession:(session:XRSession)=>Promise<void>},private readonly hooks:XRSessionHooks){}
 get blocking():boolean{return this.state==='requesting'||this.state==='presenting'||this.state==='ending';}
 async check(secure:boolean,xr?:XRSystem):Promise<void>{
  if(this.blocking||this.disposed)return;this.xr=xr;const [studio,passthrough]=await Promise.all([detectXR(secure,xr),detectXR(secure,xr,'passthrough')]);if(this.disposed||this.blocking)return;this.availability={studio,passthrough};const result=this.availability[this.environment];
  this.state=result.supported?'ready':'unavailable';this.reason=result.reason;this.hooks.changed();
 }
 /** Selection never requests a session after awaiting exit: the next Enter click is a fresh gesture. */
 async select(environment:XREnvironment):Promise<void>{
  if(this.disposed||this.state==='checking'||this.state==='requesting'||this.state==='ending'||!this.availability[environment]?.supported)return;
  this.environment=environment;
  if(this.session){await this.exit();return;}
  this.state='ready';this.reason=this.availability[environment].reason;this.hooks.changed();
 }
 async enter():Promise<void>{
  if(this.state!=='ready'||!this.xr||this.disposed)return;
  this.state='requesting';this.reason=`Requesting ${this.environment}…`;this.hooks.changed();
  let session:XRSession|undefined;
  try{
   // requestSession must stay directly in the trusted click path, before any await/preparation.
   const request=this.xr.requestSession(environmentMode(this.environment),{optionalFeatures:['local-floor']});
   session=await request;
   if(this.disposed){try{await session.end();}finally{this.state='ready';this.reason='VR request cancelled. Desktop retained.';this.hooks.changed();}return;}
   this.session=session;this.activeEnvironment=this.environment;const active=session;
   session.addEventListener('end',()=>queueMicrotask(()=>this.finish(active)),{once:true});
   if(this.activeEnvironment==='passthrough'&&session.environmentBlendMode==='opaque')throw new Error('Runtime returned opaque AR; real-world passthrough is unavailable');
   this.prepared=true;this.hooks.prepare();await this.manager.setSession(session);
   if(this.session!==session)return;
   this.state='presenting';this.reason=`${this.activeEnvironment==='passthrough'?'Passthrough':'Studio'} active · use headset controls to exit, then select an environment and click Enter.`;this.hooks.changed();
  }catch(error){
   if(session){try{await session.end();}catch{/* Restore the app even if setup never completed. */}this.finish(session);}
   else{this.state='ready';this.hooks.changed();}
   this.reason=`Could not enter ${this.environment}: ${error instanceof Error?error.message:String(error)}. Desktop sculpture kept; retry with a fresh Enter click.`;this.hooks.changed();
  }
 }
 async exit():Promise<void>{
  const session=this.session;if(!session||this.state==='ending')return;
  this.state='ending';this.reason='Exiting VR…';this.hooks.changed();
  try{await session.end();this.finish(session);}
  catch(error){if(this.session===session){this.state='presenting';this.reason=`Exit request failed: ${error instanceof Error?error.message:String(error)}. Use headset system controls to exit.`;this.hooks.changed();}}
 }
 private finish(session:XRSession):void{
  if(this.session!==session)return;this.session=null;this.activeEnvironment=null;
  if(this.prepared){this.prepared=false;this.hooks.restore();}
  this.state='ready';this.reason=`Desktop restored. Project retained. Select an environment, then click Enter ${this.environment==='passthrough'?'Passthrough':'Studio'}. Workspace will refit to your new tracked view.`;this.hooks.changed();
 }
 async dispose():Promise<void>{this.disposed=true;await this.exit();}
}
export class XRFrameStats {
 private last:number|null=null;
 private readonly spikeFlags=new Uint8Array(120);recentSpikes=0;
 private readonly intervals=new Float64Array(120);private count=0;private head=0;private sum=0;
 frames=0;cpuMs=0;latestMs=0;spikes=0;
 reset():void{this.last=null;this.count=this.head=this.sum=0;this.frames=0;this.cpuMs=this.latestMs=this.spikes=this.recentSpikes=0;this.spikeFlags.fill(0);}
 frame(time:number,cpuMs=this.cpuMs):void{if(!Number.isFinite(time)||this.last!==null&&time<=this.last)return;if(this.last!==null){const interval=time-this.last;if(interval>0){const baseline=this.averageMs;const spike=this.count>=6&&interval>Math.max(baseline*2,baseline+8);if(spike)this.spikes++;this.recentSpikes-=this.spikeFlags[this.head];this.spikeFlags[this.head]=spike?1:0;this.recentSpikes+=this.spikeFlags[this.head];this.latestMs=interval;if(this.count===120)this.sum-=this.intervals[this.head];else this.count++;this.intervals[this.head]=interval;this.sum+=interval;this.head=(this.head+1)%120;}}this.last=time;this.frames++;this.cpuMs=cpuMs;}
 pause():void{this.last=null;}
 get sampleCount():number{return this.count;}
 get medianMs():number{const a=this.intervals.slice(0,this.count).sort();return this.count?a[Math.ceil(this.count*.5)-1]:0;}
 get p99Ms():number|null{const a=this.intervals.slice(0,this.count).sort();return this.count>=100?a[Math.ceil(this.count*.99)-1]:null;}
 get averageMs():number{return this.count?this.sum/this.count:0;}
 get fps():number{return this.averageMs?1000/this.averageMs:0;}
 get maxMs():number{let max=0;for(let i=0;i<this.count;i++)max=Math.max(max,this.intervals[i]);return max;}
 get p95Ms():number{const sorted=this.intervals.slice(0,this.count).sort();return this.count?sorted[Math.ceil(this.count*.95)-1]:0;}
}
