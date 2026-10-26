import type {ControllerRole} from './xr-controller-roles';
import type {XRInteractionState} from './workspace-grab';
export type HintMode='hidden'|'on-demand'|'always';
export const CONTROL_HINTS=Object.freeze([
 {role:'support',input:'Grip',label:'Grab Workspace',working:true},
 {role:'support',input:'Trigger',label:'Hold alternate brush · release restores',working:true},
 {role:'tool',input:'Grip',label:'Stamp offset / Transform layer / both workspace',working:true},
 {role:'tool',input:'Trigger',label:'Clay / stamp / menu selection',working:true},
 {role:'tool',input:'Thumbstick',label:'Up / Down: brush/Move radius / stamp size',working:true},
 {role:'support',input:'Thumbstick',label:'← Undo / Redo → · ↑ Tools / Layers ↓',working:true},
] as const);
export function hintText(role:ControllerRole,state:XRInteractionState):string[]{return CONTROL_HINTS.filter(h=>h.role===role).map(h=>{
 if(!h.working)return `${h.input}: Reserved: ${h.label}`;
 if(h.input==='Trigger'&&role==='support')return 'Trigger: hold alternate brush · Options configures · release restores after stroke';
 if(h.input==='Trigger')return 'Trigger: Move hold/release commits · Transform selects · Clay/Smooth hold · Stamp tap';
 if(h.input==='Thumbstick'&&role==='tool')return 'Thumbstick: Up/Down: brush/Move radius / stamp size · idle';
 if(h.input==='Thumbstick')return `Thumbstick: ${h.label} · idle only; centre to rearm`;
 return `Grip: ${state==='two-hand-grab'?'Move / rotate / scale; release either grip':state==='workspace-grab'?'Release to leave workspace':role==='support'?'Grab Workspace':'Stamp: adjust offset · Transform: layer · hold with Support grip for workspace'}`;
});}
export function hintsVisible(mode:HintMode,demand:boolean):boolean{return mode==='always'||mode==='on-demand'&&demand;}
export function validateHintMode(value:unknown):HintMode{if(value!=='hidden'&&value!=='on-demand'&&value!=='always')throw new Error('Invalid VR hint mode.');return value;}
