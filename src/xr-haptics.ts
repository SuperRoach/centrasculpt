import type {XRControllerState} from './xr-input';
export type XRHapticEvent='tool'|'stamp'|'stroke-start'|'stroke-end'|'history'|'selection'|'grab';
const impulses:Record<XRHapticEvent,readonly [number,number]>={tool:[.18,22],stamp:[.25,28],'stroke-start':[.1,12],'stroke-end':[.12,16],history:[.2,24],selection:[.12,16],grab:[.14,18]};
/** Best effort only: no timers, queues, edits or per-voxel calls. One in-flight
 * pulse per physical source and a shared per-source cooldown across event kinds. */
export class XRHaptics {
 enabled=true;
 private sources=new WeakMap<object,{last:number;pending:boolean}>();
 pulse(state:XRControllerState|undefined,event:XRHapticEvent,time=performance.now()):boolean{
  if(!this.enabled||!state?.connected||!state.tracked||!state.source||!Number.isFinite(time))return false;
  const pad=state.source.gamepad as (Gamepad&{hapticActuators?:{pulse?:(value:number,duration:number)=>Promise<boolean>|boolean}[]})|undefined;
  const actuator=pad?.hapticActuators?.[0];if(typeof actuator?.pulse!=='function')return false;
  let gate=this.sources.get(state.source);if(!gate){gate={last:-Infinity,pending:false};this.sources.set(state.source,gate);}
  if(gate.pending||time-gate.last<80)return false;gate.last=time;gate.pending=true;
  try{const [strength,duration]=impulses[event];Promise.resolve(actuator.pulse(strength,duration)).catch(()=>{}).finally(()=>{gate!.pending=false;});}catch{gate.pending=false;}
  return true;
 }
 reset():void{this.sources=new WeakMap();}
}
