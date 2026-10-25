import type {ControllerRole} from './xr-controller-roles';
import type {XRInteractionState} from './workspace-grab';
export type HintMode='hidden'|'on-demand'|'always';
export const CONTROL_HINTS=Object.freeze([
 {role:'support',input:'Grip',label:'Grab Workspace',working:true},
 {role:'tool',input:'Grip',label:'Join Workspace Grab',working:true},
 {role:'tool',input:'Trigger',label:'Sculpt / Stamp',working:false},
 {role:'tool',input:'Thumbstick',label:'Brush / Shape Size',working:false},
 {role:'support',input:'Thumbstick',label:'Undo / Redo / Tools',working:false},
] as const);
export function hintText(role:ControllerRole,state:XRInteractionState):string[]{return CONTROL_HINTS.filter(h=>h.role===role).map(h=>`${h.input}: ${!h.working?`Reserved: ${h.label}`:state==='two-hand-grab'?'Move / rotate / scale; release either grip':state==='workspace-grab'?(role==='support'?'Release to leave workspace':'Hold to join workspace grab'):(role==='support'?'Grab Workspace':'Hold with Support grip to scale / rotate workspace')}`);}
export function hintsVisible(mode:HintMode,demand:boolean):boolean{return mode==='always'||mode==='on-demand'&&demand;}
export function validateHintMode(value:unknown):HintMode{if(value!=='hidden'&&value!=='on-demand'&&value!=='always')throw new Error('Invalid VR hint mode.');return value;}
