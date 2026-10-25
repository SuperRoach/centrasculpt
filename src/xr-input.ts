import {XRControllerRoles} from './xr-controller-roles';
import type {ControllerRole} from './xr-controller-roles';
export const XR_BUTTONS=['trigger','grip','thumbstick','primary','secondary'] as const;
export type XRButton=typeof XR_BUTTONS[number];
export type XRMapping={id:string;buttons:Partial<Record<XRButton,number>>;axes?:readonly [number,number]};
/** Verified against the Immersive Web meta-quest-touch-plus registry profile. */
export const QUEST_TOUCH_MAPPING:XRMapping={id:'quest-touch',buttons:{trigger:0,grip:1,thumbstick:3,primary:4,secondary:5},axes:[2,3]};
const standard:XRMapping={id:'xr-standard',buttons:{trigger:0,grip:1,thumbstick:3},axes:[2,3]},unknown:XRMapping={id:'unsupported',buttons:{}};
const questProfiles=new Set(['meta-quest-touch-plus','oculus-touch-v3','oculus-touch']);
export function resolveXRMapping(source:XRInputSource,custom?:ReadonlyMap<string,XRMapping>):XRMapping{
 for(const profile of source.profiles){const mapping=custom?.get(profile);if(mapping)return mapping;if(questProfiles.has(profile))return QUEST_TOUCH_MAPPING;}
 return source.gamepad?.mapping==='xr-standard'?standard:unknown;
}
export type XRButtonState={available:boolean;value:number;rawValue:number;pressed:boolean;touched:boolean;justPressed:boolean;justReleased:boolean};
export type XRControllerState={slot:number;connectionId:number;connected:boolean;justConnected:boolean;justDisconnected:boolean;handedness:XRHandedness;role:ControllerRole;tracked:boolean;gripTracked:boolean;mapping:string;buttons:Record<XRButton,XRButtonState>;stick:{available:boolean;x:number;y:number};source:XRInputSource|null};
type Slot={state:XRControllerState;mapping:XRMapping;connect:boolean;disconnect:boolean;select:boolean;squeeze:boolean;blocked:number;presses:number;releases:number};
export type XRInputOptions={axisDeadZone?:number;analogDeadZone?:number;pressThreshold?:number;releaseThreshold?:number;profiles?:ReadonlyMap<string,XRMapping>};
const number=(value:number|undefined)=>typeof value==='number'&&Number.isFinite(value)?value:0;
/** Caller-owned output avoids allocating axis vectors every headset frame. */
export function applyStickDeadZone(out:{x:number;y:number},x:number,y:number,zone=.15):void{
 x=Math.max(-1,Math.min(1,number(x)));y=Math.max(-1,Math.min(1,number(y)));const length=Math.hypot(x,y);
 if(length<=zone){out.x=out.y=0;return;}const scale=(Math.min(1,length)-zone)/(1-zone)/length;out.x=x*scale;out.y=y*scale;
}
/** Poll once per XR frame. Mutable frame states are reused; tools must copy values they retain. No editing commands. */
export class XRControllerInput {
 private sequence=0;
 private readonly slots:Slot[];
 readonly states:readonly XRControllerState[];
 private readonly options:Required<Omit<XRInputOptions,'profiles'>>&Pick<XRInputOptions,'profiles'>;
 constructor(readonly roles=new XRControllerRoles(),options:XRInputOptions={}){
  this.options={axisDeadZone:.15,analogDeadZone:.03,pressThreshold:.55,releaseThreshold:.45,...options};
  const o=this.options;if(!Number.isFinite(o.axisDeadZone)||o.axisDeadZone<0||o.axisDeadZone>=1||!Number.isFinite(o.analogDeadZone)||o.analogDeadZone<0||o.analogDeadZone>=1||!(o.releaseThreshold>=0&&o.releaseThreshold<o.pressThreshold&&o.pressThreshold<=1))throw new Error('Invalid XR input thresholds.');
  this.slots=Array.from({length:2},(_,slot)=>({state:{slot,connectionId:0,connected:false,justConnected:false,justDisconnected:false,handedness:'none',role:'unassigned',tracked:false,gripTracked:false,mapping:'unsupported',buttons:Object.fromEntries(XR_BUTTONS.map(name=>[name,{available:false,value:0,rawValue:0,pressed:false,touched:false,justPressed:false,justReleased:false}])) as Record<XRButton,XRButtonState>,stick:{available:false,x:0,y:0},source:null},mapping:unknown,connect:false,disconnect:false,select:false,squeeze:false,blocked:0,presses:0,releases:0}));this.states=this.slots.map(s=>s.state);
 }
 connect(index:number,source:XRInputSource):void{
  const slot=this.slots[index];if(!slot||slot.state.source===source)return;if(slot.state.connected)this.disconnect(index);
  slot.mapping=resolveXRMapping(source,this.options.profiles);slot.blocked=slot.presses=0;slot.select=slot.squeeze=false;
  Object.assign(slot.state,{source,connected:true,connectionId:++this.sequence,handedness:source.handedness,role:this.roles.roleFor(source.handedness),mapping:slot.mapping.id,tracked:false,gripTracked:false});slot.connect=true;
 }
 disconnect(index:number):void{const slot=this.slots[index];if(!slot||!slot.state.connected)return;this.cancel(slot);slot.state.connected=false;slot.state.source=null;slot.state.tracked=slot.state.gripTracked=false;slot.disconnect=true;}
 setTracking(index:number,ray:boolean,grip:boolean):void{const slot=this.slots[index];if(!slot)return;if(slot.state.tracked&&!ray)this.cancel(slot);slot.state.tracked=ray;slot.state.gripTracked=grip;}
 semantic(source:XRInputSource,button:'trigger'|'grip',pressed:boolean):void{
  const slot=this.slots.find(s=>s.state.source===source);if(!slot)return;const bit=button==='trigger'?1:2;
  const previous=button==='trigger'?slot.select:slot.squeeze;if(previous===pressed)return;
  if(button==='trigger')slot.select=pressed;else slot.squeeze=pressed;
  if(!(slot.blocked&bit)){if(pressed)slot.presses|=bit;else slot.releases|=bit;}
 }
 byHand(hand:'left'|'right'):XRControllerState|undefined{return this.states.find(s=>s.connected&&s.handedness===hand);}
 private cancel(slot:Slot):void{
  slot.select=slot.squeeze=false;slot.presses=0;slot.blocked=31;
  for(let i=0;i<XR_BUTTONS.length;i++){const b=slot.state.buttons[XR_BUTTONS[i]];if(b.pressed)slot.releases|=1<<i;b.justReleased=b.pressed;b.justPressed=false;b.pressed=false;b.value=b.rawValue=0;b.touched=false;}slot.state.stick.x=slot.state.stick.y=0;
 }
 /** Visibility loss, role changes and session end cancel holds. A physical release rearms each button. */
 suspend():void{for(const slot of this.slots)this.cancel(slot);}
 reset():void{for(let i=0;i<2;i++)this.disconnect(i);this.update(false);}
 update(active=true):void{
  for(const slot of this.slots){
   const state=slot.state,source=state.source,pad=source?.gamepad,mapping=slot.mapping,enabled=active&&state.connected&&state.tracked;
   state.justConnected=slot.connect;state.justDisconnected=slot.disconnect;slot.connect=slot.disconnect=false;state.role=state.connected?this.roles.roleFor(state.handedness):'unassigned';
   for(let i=0;i<XR_BUTTONS.length;i++){
    const name=XR_BUTTONS[i],bit=1<<i,b=state.buttons[name],was=b.pressed,index=mapping.buttons[name];
    const raw=index!==undefined&&Number.isInteger(index)&&index>=0?pad?.buttons[index]:undefined,semantic=name==='trigger'?slot.select:name==='grip'?slot.squeeze:false;
    b.available=!!raw||!!source&&(name==='trigger'||name==='grip'&&!!source.gripSpace);
    const value=raw?Math.max(0,Math.min(1,number(raw.value))):semantic?1:0,down=!!raw?.pressed||value>=(was?this.options.releaseThreshold:this.options.pressThreshold);
    if(!enabled)slot.blocked|=bit;else if(!down)slot.blocked&=~bit;
    const allowed=enabled&&!(slot.blocked&bit);
    b.rawValue=enabled?value:0;b.value=allowed&&value>this.options.analogDeadZone?value:0;b.pressed=allowed&&down;b.touched=allowed&&(raw?.touched??semantic);
    b.justPressed=allowed&&(!was&&b.pressed||!!(slot.presses&bit));b.justReleased=was&&!b.pressed||!!(slot.releases&bit);
   }
   slot.presses=slot.releases=0;
   const axes=mapping.axes;state.stick.available=!!pad&&!!axes&&Number.isInteger(axes[0])&&Number.isInteger(axes[1])&&axes[0]>=0&&axes[1]>=0&&axes[0]<pad.axes.length&&axes[1]<pad.axes.length&&Number.isFinite(pad.axes[axes[0]])&&Number.isFinite(pad.axes[axes[1]]);
   if(enabled&&state.stick.available)applyStickDeadZone(state.stick,pad!.axes[axes![0]],pad!.axes[axes![1]],this.options.axisDeadZone);else state.stick.x=state.stick.y=0;
  }
 }
}
