import type {XRControllerState} from './xr-input';
import type {EditorToolState} from './editor-tool-state';
import {toolSizingBinding} from './editor-tool-state';
import {BRUSH_RADIUS_LIMITS} from './brush-settings';
export interface XRAnalogToolControl {readonly feedback:string;update(tool:XRControllerState|undefined,states:readonly XRControllerState[],time:number,enabled:boolean,busy:boolean,alternateActive?:boolean,liveSizing?:'clay-radius'|'tube-radius'|'move-falloff'|null):boolean;reset():void;}
/** Consumes logical Tool stick values after hardware dead-zone parsing. No source edits.
 * Positive Y is down in WebXR, hence the negative exponent for up-to-grow. */
export class XRBrushSizing implements XRAnalogToolControl {
 feedback='';private until=0;private owner=0;private mode='';private lastTime:number|null=null;private armed=false;private shownRadius='';
 readonly rate=.9;readonly axisDeadZone=.08;
 constructor(private readonly tools:EditorToolState){}
 reset():void{this.feedback='';this.until=0;this.owner=0;this.mode='';this.lastTime=null;this.armed=false;this.shownRadius='';}
 update(tool:XRControllerState|undefined,states:readonly XRControllerState[],time:number,enabled:boolean,busy:boolean,alternateActive=false,liveSizing:'clay-radius'|'tube-radius'|'move-falloff'|null=null):boolean{
  if(!Number.isFinite(time)){this.reset();return false;}
  if(time>=this.until)this.feedback='';
  const mode=this.tools.active,binding=toolSizingBinding(mode);
  if(!tool?.connected||tool.role!=='tool'||!tool.tracked||!tool.gripTracked||!tool.stick.available||!Number.isFinite(tool.stick.x)||!Number.isFinite(tool.stick.y)||binding!=='brush-radius'&&binding!=='shape-scale'){this.reset();return false;}
  if(this.owner!==tool.connectionId||this.mode!==mode){this.reset();this.owner=tool.connectionId;this.mode=mode;}
  const dt=this.lastTime===null?0:Math.max(0,Math.min(.05,(time-this.lastTime)/1000));this.lastTime=time;
  // Only the active alternate brush reserves Support trigger for its hold.
  // Tool trigger, every grip and all higher-priority owners still block sizing.
  const live=liveSizing==='tube-radius'&&mode==='tube'||liveSizing==='clay-radius'&&mode==='clay'||liveSizing==='move-falloff'&&mode==='move';
  const blocked=!enabled||!live&&(busy||this.tools.busy)||states.some(s=>s.connected&&(s.buttons.grip.pressed||s.buttons.grip.rawValue>=.45||(!(live&&s.role==='tool'||alternateActive&&binding==='brush-radius'&&s.role==='support'&&s.tracked&&s.gripTracked)&&(s.buttons.trigger.pressed||s.buttons.trigger.rawValue>=.45))));
  if(blocked){this.armed=false;this.feedback='';return false;}
  const x=Math.max(-1,Math.min(1,tool.stick.x)),y=Math.max(-1,Math.min(1,tool.stick.y)),magnitude=Math.hypot(x,y);
  if(magnitude<=.12){this.armed=true;return false;}
  if(!this.armed||Math.abs(y)<=this.axisDeadZone||Math.abs(x)>Math.abs(y)*.75||dt===0)return false;
  const axis=Math.sign(y)*(Math.abs(y)-this.axisDeadZone)/(1-this.axisDeadZone),settings=this.tools.port.settings(),current=this.tools.brushRadius;
  if(binding==='shape-scale') {
   const current=this.tools.port.shape.definition.transform.scale[0],scale=Math.max(.02,Math.min(10,current*Math.exp(-axis*this.rate*dt)));
   if(!this.tools.setStampScale(scale))return false;
   this.feedback=`Stamp scale ${scale.toFixed(3)}×`;this.until=time+900;return true;
  }
  if(liveSizing==='move-falloff'){if(!this.tools.setLiveMoveFalloff(this.tools.move.falloff+axis*2*dt))return false;this.feedback=`Elastic edge softness ${this.tools.move.falloff.toFixed(2)} · up softer / down firmer`;this.until=time+900;return true;}
  const radius=Math.max(BRUSH_RADIUS_LIMITS.min,Math.min(BRUSH_RADIUS_LIMITS.max,current*Math.exp(-axis*this.rate*dt)));
  if(!(liveSizing==='tube-radius'?this.tools.setLiveTubeRadius(radius):liveSizing==='clay-radius'?this.tools.setLiveClayRadius(radius):this.tools.setBrushRadius(radius,settings)))return false;
  const shown=radius.toFixed(3);if(shown!==this.shownRadius||!this.feedback){this.feedback=`${mode==='move'?'Move influence':'Radius'} ${shown}`;this.shownRadius=shown;}this.until=time+900;return true;
 }
}
