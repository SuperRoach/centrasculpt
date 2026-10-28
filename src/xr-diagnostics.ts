import {VR_UI,paintVRPanel,roundedVRRect,drawVRText,vrControlStyle} from './xr-ui-style';
import {CanvasTexture,DoubleSide,Group,Mesh,MeshBasicMaterial,PlaneGeometry,Quaternion,SRGBColorSpace,Vector3} from 'three';
import {XRHints} from './xr-hints';
import type {ControllerDisplayMode} from './controller-models';
import type {XRInteractionState} from './workspace-grab';
import type {XRControllerState} from './xr-input';
const up=new Vector3(0,1,0);
/** Only these two debug controls consume triggers. No sculpting/tool actions. */
export function diagnosticAction(uv:{x:number;y:number},expanded=true):'swap'|'toggle'|'display'|'hints'|'reset'|'performance'|null{
 const y=1-uv.y;if(uv.x<0||uv.x>1)return null;const footer=expanded?552/640:155/640;if(y>=footer&&y<=footer+75/640)return (['display','hints','reset','performance'] as const)[Math.min(3,Math.floor(uv.x*4))];if(y<.11||y>.23)return null;return uv.x<.5?'swap':'toggle';
}
export class XRDiagnostics {
 readonly group=new Group();
 readonly mesh:Mesh<PlaneGeometry,MeshBasicMaterial>;
 expanded=true;hover:string|null=null;
 readonly hints=new XRHints();
 displayMode:ControllerDisplayMode='realistic';
 interaction:XRInteractionState='idle';
 demand=false;support='left';feedback='';performanceEnabled=false;paintCount=0;
 private lastContent='';
 private readonly canvas:HTMLCanvasElement;
 private readonly context:CanvasRenderingContext2D;
 private readonly texture:CanvasTexture;
 private uiFactor=1;
 private placed=false;
 private lastPaint=-Infinity;
 private readonly eye=new Vector3();private readonly forward=new Vector3();private readonly right=new Vector3();private readonly orientation=new Quaternion();
 constructor(){
  this.canvas=document.createElement('canvas');this.canvas.width=1024;this.canvas.height=640;const context=this.canvas.getContext('2d');if(!context)throw new Error('XR diagnostics needs a canvas 2D context.');this.context=context;
  this.texture=new CanvasTexture(this.canvas);this.texture.colorSpace=SRGBColorSpace;
  this.mesh=new Mesh(new PlaneGeometry(.62,.3875),new MeshBasicMaterial({map:this.texture,transparent:true,alphaTest:.05,side:DoubleSide,toneMapped:false}));this.mesh.name='XR controller diagnostics only';this.group.name='XR debug panel';this.group.add(this.mesh,this.hints.mesh);this.group.visible=false;
 }
 setUIScale(factor:number):void{if(this.uiFactor===factor)return;if(this.placed){this.group.position.addScaledVector(this.right,.74*(factor-this.uiFactor));this.group.lookAt(this.eye);}this.uiFactor=factor;this.group.scale.setScalar(factor);}
 start():void{this.hover=null;this.placed=false;this.lastPaint=-Infinity;this.group.visible=false;}
 stop():void{this.hover=null;this.group.visible=false;this.group.removeFromParent();this.placed=false;}
 place(position:{x:number;y:number;z:number},rotation:{x:number;y:number;z:number;w:number}):void{
  if(this.placed)return;this.placed=true;this.group.visible=true;this.eye.set(position.x,position.y,position.z);this.orientation.set(rotation.x,rotation.y,rotation.z,rotation.w);this.forward.set(0,0,-1).applyQuaternion(this.orientation);this.forward.y=0;if(this.forward.lengthSq()<.001)this.forward.set(0,0,-1);this.forward.normalize();this.right.crossVectors(this.forward,up).normalize();
  this.group.position.copy(this.eye).addScaledVector(this.forward,1.1).addScaledVector(this.right,.74*this.uiFactor);this.group.position.y-=.12;this.group.lookAt(this.eye);this.group.updateMatrixWorld(true);
 }
 invalidate():void{this.lastPaint=-Infinity;}
 paint(time:number,states:readonly XRControllerState[],inputMs:number):void{
  if(time-this.lastPaint<100)return;this.lastPaint=time;this.hints.paint(this.demand,this.interaction,this.support,this.expanded);const content=[this.hover,this.expanded,this.displayMode,this.hints.mode,this.interaction,this.support,this.feedback,this.performanceEnabled,...states.map(s=>`${s.connectionId}:${s.handedness}:${s.connected}:${s.role}:${s.tracked}:${s.gripTracked}:${Object.values(s.buttons).map(b=>`${b.available}:${b.value.toFixed(2)}:${b.pressed}`).join(',')}:${s.stick.x.toFixed(2)}:${s.stick.y.toFixed(2)}`)].join('|');if(content===this.lastContent)return;this.lastContent=content;this.paintCount++;const ctx=this.context;ctx.clearRect(0,0,1024,640);paintVRPanel(ctx,1024,this.expanded?640:235);
  drawVRText(ctx,this.feedback||'CENTRA / CONTROLLERS',{x:28,y:14,width:968,height:48},34,VR_UI.text,true);
  const control=(action:string,label:string,x:number,y:number,w:number,h:number)=>{const style=vrControlStyle(false,this.hover===action);roundedVRRect(ctx,x,y,w,h,18);ctx.fillStyle=style.fill;ctx.fill();ctx.strokeStyle=style.stroke;ctx.lineWidth=style.lineWidth;ctx.stroke();drawVRText(ctx,label,{x:x+12,y:y+18,width:w-24,height:h-22},32,style.text,true,'center');};
  control('swap','Swap Tool / Support',24,72,478,75);control('toggle',this.expanded?'Hide diagnostics':'Show diagnostics',522,72,478,75);
  if(this.expanded){for(let row=0;row<2;row++){const hand=row===0?'left':'right',state=states.find(s=>s.connected&&s.handedness===hand),y=172+row*170;
   drawVRText(ctx,`${hand.toUpperCase()} / ${state?.role.toUpperCase()??'DISCONNECTED'} / ${state?.tracked?'TRACKED':state?'POSE LOST':'OFFLINE'}`,{x:30,y,width:964,height:42},32,hand==='left'?'#8bd8ed':'#f0c58d',true);
   const lines=state?[`Trigger ${state.buttons.trigger.value.toFixed(2)} ${state.buttons.trigger.pressed?'DOWN':'up'}   Grip ${state.buttons.grip.value.toFixed(2)} ${state.buttons.grip.pressed?'DOWN':'up'}`,`Stick ${state.stick.x.toFixed(2)}, ${state.stick.y.toFixed(2)} ${state.buttons.thumbstick.pressed?'CLICK':''}`,`Primary ${state.buttons.primary.available?(state.buttons.primary.pressed?'DOWN':'up'):'n/a'}  Secondary ${state.buttons.secondary.available?(state.buttons.secondary.pressed?'DOWN':'up'):'n/a'}`]:['Wake / reconnect this controller'];
   lines.forEach((line,i)=>drawVRText(ctx,line,{x:30,y:y+44+i*35,width:964,height:35},28));
  }drawVRText(ctx,`${this.interaction} · reset restores entry view`,{x:30,y:516,width:964,height:32},28,VR_UI.muted);}
  const footer=this.expanded?552:155,labels=[['Models',this.displayMode,'display'],['Hints',this.hints.mode,'hints'],['Reset','Workspace View','reset'],['Performance',this.performanceEnabled?'On':'Off','performance']];
  labels.forEach((label,i)=>{const x=i*256+8,style=vrControlStyle(false,this.hover===label[2]);roundedVRRect(ctx,x,footer,240,75,16);ctx.fillStyle=style.fill;ctx.fill();ctx.strokeStyle=style.stroke;ctx.lineWidth=style.lineWidth;ctx.stroke();drawVRText(ctx,label[0],{x:x+10,y:footer+5,width:220,height:34},28,style.text,true);drawVRText(ctx,label[1],{x:x+10,y:footer+39,width:220,height:34},28,VR_UI.muted);});this.texture.needsUpdate=true;
 }
 dispose():void{this.stop();this.mesh.geometry.dispose();this.mesh.material.dispose();this.texture.dispose();this.hints.dispose();}
}
