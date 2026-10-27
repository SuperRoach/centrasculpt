import type {EditorToolState} from './editor-tool-state';
import type {SculptSettings} from './project';
import type {XRControllerState} from './xr-input';
/** A temporary brush override. Transitions wait for the existing transaction and
 * Tool trigger release; neither edge ever cancels or splits a stroke. */
export class XRAlternateTool {
 private armed=false;private owner=0;
 private saved:{tool:'clay'|'smooth'|'move';settings:SculptSettings;path:{steady:number;straightLine:boolean;placement:'free'|'surface'}}|null=null;
 private wanted=false;
 constructor(readonly tools:EditorToolState){}
 get active():boolean{return !!this.saved;}
 get feedback():string{return this.saved?`Alternate ${this.tools.active==='clay'?`Clay ${this.tools.port.settings().mode==='subtract'?'SUBTRACT':'ADD'}`:this.tools.active} · release Support trigger to restore${this.wanted?'':' after Tool stroke'}`:this.wanted?'Alternate queued · release Tool trigger':'';}
 update(support:XRControllerState|undefined,tool:XRControllerState|undefined,enabled:boolean,strokeActive:boolean):void{
  const valid=enabled&&support?.connected&&support.tracked&&support.gripTracked&&support.role==='support';
  if(!valid||support!.connectionId!==this.owner){this.armed=false;this.wanted=false;this.owner=valid?support!.connectionId:0;}
  if(valid){const b=support!.buttons.trigger;if(!b.pressed){this.armed=true;this.wanted=false;}else if(this.armed&&b.justPressed){this.wanted=true;this.armed=false;}}
  if(!this.saved&&(this.tools.alternateTool==='off'||this.tools.active===this.tools.alternateTool||this.tools.active!=='clay'&&this.tools.active!=='smooth'&&this.tools.active!=='move'))this.wanted=false;
  if(strokeActive||this.tools.busy||tool?.buttons.trigger.pressed||(tool?.buttons.trigger.rawValue??0)>=.45)return;
  if(this.saved&&!this.wanted)this.restore();
  if(!this.saved&&this.wanted&&this.tools.alternateTool!=='off'&&(this.tools.active==='clay'||this.tools.active==='smooth'||this.tools.active==='move')&&this.tools.active!==this.tools.alternateTool){
   this.saved={tool:this.tools.active,settings:{...this.tools.port.settings()},path:{...this.tools.path}};
   if(this.tools.alternateTool==='opposite'&&this.saved.tool==='clay'){const mode=this.tools.port.settings().mode==='subtract'?'add':'subtract';this.tools.select('clay');this.tools.port.setSettings({...this.tools.port.settings(),mode});}else this.tools.select(this.tools.alternateTool==='opposite'?'smooth':this.tools.alternateTool);
  }
 }
 /** Caller cancels the transaction first on interruptions, then restores settings. */
 cancel():void{this.wanted=false;this.armed=false;this.owner=0;this.restore();}
 private restore():void{const saved=this.saved;if(!saved)return;this.saved=null;this.tools.select(saved.tool);this.tools.port.setSettings({...saved.settings});Object.assign(this.tools.path,saved.path);this.tools.port.changed();}
}
