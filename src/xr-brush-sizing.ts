import type {XRControllerState} from './xr-input';
import type {EditorToolState} from './editor-tool-state';
import {toolSizingBinding} from './editor-tool-state';
import {BRUSH_RADIUS_LIMITS} from './brush-settings';
export interface XRAnalogToolControl {readonly feedback:string;update(tool:XRControllerState|undefined,states:readonly XRControllerState[],time:number,enabled:boolean,busy:boolean):boolean;reset():void;}
/** Consumes logical Tool stick values after hardware dead-zone parsing. No source edits.
 * Positive Y is down in WebXR, hence the negative exponent for up-to-grow. */
export class XRBrushSizing implements XRAnalogToolControl {
 feedback='';private until=0;private owner=0;private mode='';private lastTime:number|null=null;private armed=false;private shownRadius='';
 readonly rate=.9;readonly axisDeadZone=.08;
 constructor(private readonly tools:EditorToolState){}
 reset():void{this.feedback='';this.until=0;this.owner=0;this.mode='';this.lastTime=null;this.armed=false;this.shownRadius='';}
 update(tool:XRControllerState|undefined,states:readonly XRControllerState[],time:number,enabled:boolean,busy:boolean):boolean{
  if(!Number.isFinite(time)){this.reset();return false;}
  if(time>=this.until)this.feedback='';
  const mode=this.tools.active,binding=toolSizingBinding(mode);
  if(!tool?.connected||tool.role!=='tool'||!tool.tracked||!tool.gripTracked||!tool.stick.available||!Number.isFinite(tool.stick.x)||!Number.isFinite(tool.stick.y)||binding!=='brush-radius'&&binding!=='shape-scale'){this.reset();return false;}
  if(this.owner!==tool.connectionId||this.mode!==mode){this.reset();this.owner=tool.connectionId;this.mode=mode;}
  const dt=this.lastTime===null?0:Math.max(0,Math.min(.05,(time-this.lastTime)/1000));this.lastTime=time;
  const blocked=!enabled||busy||this.tools.busy||states.some(s=>s.connected&&(s.buttons.grip.pressed||s.buttons.grip.rawValue>=.45||s.buttons.trigger.pressed||s.buttons.trigger.rawValue>=.45));
  if(blocked){this.armed=false;this.feedback='';return false;}
  const x=Math.max(-1,Math.min(1,tool.stick.x)),y=Math.max(-1,Math.min(1,tool.stick.y)),magnitude=Math.hypot(x,y);
  if(magnitude<=.12){this.armed=true;return false;}
  if(!this.armed||Math.abs(y)<=this.axisDeadZone||Math.abs(x)>Math.abs(y)*.75||dt===0)return false;
  const axis=Math.sign(y)*(Math.abs(y)-this.axisDeadZone)/(1-this.axisDeadZone),settings=this.tools.port.settings(),current=settings.radius;
  if(binding==='shape-scale') {
   const current=this.tools.port.shape.definition.transform.scale[0],scale=Math.max(.02,Math.min(10,current*Math.exp(-axis*this.rate*dt)));
   if(!this.tools.setStampScale(scale))return false;
   this.feedback=`Stamp scale ${scale.toFixed(3)}×`;this.until=time+900;return true;
  }
  const radius=Math.max(BRUSH_RADIUS_LIMITS.min,Math.min(BRUSH_RADIUS_LIMITS.max,current*Math.exp(-axis*this.rate*dt)));
  if(!this.tools.setBrushRadius(radius,settings))return false;
  const shown=radius.toFixed(3);if(shown!==this.shownRadius||!this.feedback){this.feedback=`Radius ${shown}`;this.shownRadius=shown;}this.until=time+900;return true;
 }
}
