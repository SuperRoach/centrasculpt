import {FourDirectionStick} from './xr-stick-directions';
import type {StickDirection,StickDirectionOptions} from './xr-stick-directions';
import type {XRControllerState} from './xr-input';
import type {XRInteractionState} from './workspace-grab';
export type XRMenuRequest='tool-wheel'|'layers'|'tool-options'|'world';
export type XRShortcutBinding={kind:'command';action:string}|{kind:'menu';menu:XRMenuRequest};
export type XRShortcutResult={ok:boolean;message:string};
export type XRShortcutOptions={interactiveMenus?:boolean;bindings?:Readonly<Record<StickDirection,XRShortcutBinding>>;commands?:Readonly<Record<string,()=>XRShortcutResult>>;requestMenu?:(menu:XRMenuRequest|null)=>void;recognizer?:StickDirectionOptions};
export const SUPPORT_STICK_BINDINGS:Readonly<Record<StickDirection,XRShortcutBinding>>=Object.freeze({
 left:Object.freeze({kind:'command',action:'undo'}),right:Object.freeze({kind:'command',action:'redo'}),
 up:Object.freeze({kind:'menu',menu:'tool-wheel'}),down:Object.freeze({kind:'menu',menu:'layers'}),
});
/** Semantic action router, independent of WebXR polling and scene rendering.
 * Command registry and menu requests are replaceable by future tools/palettes. */
export class XRSupportShortcuts {
 readonly stick:FourDirectionStick;
 menu:XRMenuRequest|null=null;message='';until=0;successful=false;
 private owner=0;
 constructor(private readonly options:XRShortcutOptions={}){this.stick=new FourDirectionStick(options.recognizer);}
 private setMenu(menu:XRMenuRequest|null):void{if(this.menu===menu)return;this.menu=menu;this.options.requestMenu?.(menu);}
 reset():void{this.stick.reset();this.owner=0;this.setMenu(null);this.message='';this.until=0;this.successful=false;}
 step(support:XRControllerState|undefined,states:readonly XRControllerState[],interaction:XRInteractionState,time:number,active=true,menuBusy=false):void{
  const valid=active&&support?.connected&&support.role==='support'&&support.tracked&&support.gripTracked&&support.stick.available;
  if(!valid){this.reset();return;}
  if(this.owner!==support.connectionId){this.reset();this.owner=support.connectionId;}
  // A held/rejected grip or trigger also reserves input, even without a valid target.
  const blocked=menuBusy||interaction!=='idle'&&interaction!=='menu'||states.some(s=>s.connected&&(s.buttons.grip.pressed||s.buttons.grip.rawValue>=.45||(!this.menu||!this.options.interactiveMenus||s.role!=='tool')&&(s.buttons.trigger.pressed||s.buttons.trigger.rawValue>=.45)));
  if(blocked){this.stick.reset();this.setMenu(null);this.message='';this.until=0;return;}
  const direction=this.stick.update(support.stick.x,support.stick.y);
  if(this.menu&&!this.stick.held)this.setMenu(null);
  if(!direction)return;
  const binding=(this.options.bindings??SUPPORT_STICK_BINDINGS)[direction];
  if(binding.kind==='menu'){this.setMenu(binding.menu);this.message='';this.until=0;return;}
  let result:XRShortcutResult;
  try{result=this.options.commands?.[binding.action]?.()??{ok:false,message:'Action unavailable'};}
  catch{result={ok:false,message:'Action unavailable — check layer locks'};}
  this.message=result.message;this.successful=result.ok;this.until=time+1100;
 }
}
