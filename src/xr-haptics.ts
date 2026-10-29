import type {XRControllerState} from './xr-input';
export type XRHapticEvent='tool'|'stamp'|'stroke-start'|'stroke-end'|'history'|'selection'|'grab'|'cancel'|'error';
const impulses:Record<XRHapticEvent,readonly [number,number]>={tool:[.18,22],stamp:[.25,28],'stroke-start':[.1,12],'stroke-end':[.12,16],history:[.2,24],selection:[.12,16],grab:[.14,18],cancel:[.22,24],error:[.30,35]};
/** Best effort only: no timers, edits or per-voxel calls. One bounded, expiring issue slot. One in-flight
 * pulse per physical source and a shared per-source cooldown across event kinds. */
export class XRHaptics {
 enabled=true;
 private notified=new WeakSet<object>();
 beginGesture(state:XRControllerState|undefined):void{if(state?.source)this.notified.delete(state.source);}
 private issue:{source:XRInputSource;connectionId:number;event:'cancel'|'error';created:number}|null=null;
 report(state:XRControllerState|undefined,event:'cancel'|'error'):void{
  if(!this.enabled||!state?.connected||!state.tracked||!state.source||this.notified.has(state.source))return;
  if(this.issue?.source===state.source&&this.issue.event==='error')return;
  this.issue={source:state.source,connectionId:state.connectionId,event,created:performance.now()};
 }
 flush(state:XRControllerState|undefined,time:number):boolean{
  const issue=this.issue;if(!issue)return false;
  if(!this.enabled||!state?.tracked||!state.connected||state.source!==issue.source||state.connectionId!==issue.connectionId||performance.now()-issue.created>250){this.issue=null;return false;}
  if(!this.pulse(state,issue.event,time))return true;this.notified.add(issue.source);this.issue=null;return true;
 }
 clearIssues():void{this.issue=null;}
 private sources=new WeakMap<object,{last:number;lastIssue:number;pending:boolean}>();
 pulse(state:XRControllerState|undefined,event:XRHapticEvent,time=performance.now()):boolean{
  if(!this.enabled||!state?.connected||!state.tracked||!state.source||!Number.isFinite(time))return false;
  const pad=state.source.gamepad as (Gamepad&{hapticActuators?:{pulse?:(value:number,duration:number)=>Promise<boolean>|boolean}[]})|undefined;
  const actuator=pad?.hapticActuators?.[0];if(typeof actuator?.pulse!=='function')return false;
  let gate=this.sources.get(state.source);if(!gate){gate={last:-Infinity,lastIssue:-Infinity,pending:false};this.sources.set(state.source,gate);}
  const issue=event==='cancel'||event==='error';
  if(gate.pending||(issue?time-gate.lastIssue<120:time-gate.last<80))return false;gate.last=time;if(issue)gate.lastIssue=time;gate.pending=true;
  try{const [strength,duration]=impulses[event];Promise.resolve(actuator.pulse(strength,duration)).catch(()=>{}).finally(()=>{gate!.pending=false;});}catch{gate.pending=false;}
  return true;
 }
 reset():void{this.clearIssues();this.notified=new WeakSet();this.sources=new WeakMap();}
}
