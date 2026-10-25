import type {XRControllerState} from './xr-input';
export type XRFeedbackPhase='idle'|'grab-start'|'grabbing'|'grab-end'|'tracking-lost'|'tracking-recovered';
/** Reused transition state; stale poses are hidden, loss is reported at the fixed debug card. */
export class ControllerFeedback {
 phase:XRFeedbackPhase='idle';halo=false;message='';until=0;
 private tracked=false;private connected=false;private grabbing=false;private connection=0;
 update(state:XRControllerState,grabActive:boolean,time:number):void{
  const tracked=state.connected&&state.tracked&&state.gripTracked,active=grabActive&&tracked;
  const hand=state.handedness==='none'?'Controller':state.handedness==='left'?'Left':'Right';
  if(this.connection!==state.connectionId){this.tracked=false;this.grabbing=false;this.connection=state.connectionId;this.phase='idle';this.message='';this.until=0;}
  if(this.tracked&&!tracked){this.phase='tracking-lost';this.message=`${hand} ${state.connected?'tracking lost':'disconnected'}${this.grabbing?' — grab ended':''}`;this.until=time+2000;}
  else if(!this.tracked&&tracked&&this.connected){this.phase='tracking-recovered';this.message=`${hand} tracking restored — release, then grip`;this.until=time+1200;}
  else if(active&&!this.grabbing){this.phase='grab-start';this.message=`${hand}: workspace grabbed`;this.until=time+500;}
  else if(!active&&this.grabbing){this.phase='grab-end';this.message='Workspace released';this.until=time+400;}
  else if(time>=this.until){this.phase=active?'grabbing':'idle';this.message='';}
  this.halo=tracked&&(active||this.phase==='grab-end');this.tracked=tracked;this.connected=state.connected;this.grabbing=active;
 }
 reset():void{this.phase='idle';this.halo=false;this.message='';this.until=0;this.tracked=this.connected=this.grabbing=false;this.connection=0;}
}
