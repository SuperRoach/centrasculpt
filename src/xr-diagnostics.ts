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
 expanded=true;
 readonly hints=new XRHints();
 displayMode:ControllerDisplayMode='realistic';
 interaction:XRInteractionState='idle';
 demand=false;support='left';feedback='';performanceEnabled=false;paintCount=0;
 private lastContent='';
 private readonly canvas:HTMLCanvasElement;
 private readonly context:CanvasRenderingContext2D;
 private readonly texture:CanvasTexture;
 private placed=false;
 private lastPaint=-Infinity;
 private readonly eye=new Vector3();private readonly forward=new Vector3();private readonly right=new Vector3();private readonly orientation=new Quaternion();
 constructor(){
  this.canvas=document.createElement('canvas');this.canvas.width=1024;this.canvas.height=640;const context=this.canvas.getContext('2d');if(!context)throw new Error('XR diagnostics needs a canvas 2D context.');this.context=context;
  this.texture=new CanvasTexture(this.canvas);this.texture.colorSpace=SRGBColorSpace;
  this.mesh=new Mesh(new PlaneGeometry(.62,.3875),new MeshBasicMaterial({map:this.texture,transparent:true,alphaTest:.05,side:DoubleSide,toneMapped:false}));this.mesh.name='XR controller diagnostics only';this.group.name='XR debug panel';this.group.add(this.mesh,this.hints.mesh);this.group.visible=false;
 }
 start():void{this.placed=false;this.lastPaint=-Infinity;this.group.visible=false;}
 stop():void{this.group.visible=false;this.group.removeFromParent();this.placed=false;}
 place(position:{x:number;y:number;z:number},rotation:{x:number;y:number;z:number;w:number}):void{
  if(this.placed)return;this.placed=true;this.group.visible=true;this.eye.set(position.x,position.y,position.z);this.orientation.set(rotation.x,rotation.y,rotation.z,rotation.w);this.forward.set(0,0,-1).applyQuaternion(this.orientation);this.forward.y=0;if(this.forward.lengthSq()<.001)this.forward.set(0,0,-1);this.forward.normalize();this.right.crossVectors(this.forward,up).normalize();
  this.group.position.copy(this.eye).addScaledVector(this.forward,1.1).addScaledVector(this.right,.74);this.group.position.y-=.12;this.group.lookAt(this.eye);this.group.updateMatrixWorld(true);
 }
 invalidate():void{this.lastPaint=-Infinity;}
 paint(time:number,states:readonly XRControllerState[],inputMs:number):void{
  if(time-this.lastPaint<100)return;this.lastPaint=time;this.hints.paint(this.demand,this.interaction,this.support,this.expanded);const content=[this.expanded,this.displayMode,this.hints.mode,this.interaction,this.support,this.feedback,this.performanceEnabled,...states.map(s=>`${s.connectionId}:${s.handedness}:${s.connected}:${s.role}:${s.tracked}:${s.gripTracked}:${Object.values(s.buttons).map(b=>`${b.available}:${b.value.toFixed(2)}:${b.pressed}`).join(',')}:${s.stick.x.toFixed(2)}:${s.stick.y.toFixed(2)}`)].join('|');if(content===this.lastContent)return;this.lastContent=content;this.paintCount++;const ctx=this.context;ctx.clearRect(0,0,1024,640);ctx.fillStyle='#15232a';ctx.fillRect(0,0,1024,this.expanded?640:235);ctx.fillStyle='#ffffff';ctx.font='bold 34px sans-serif';ctx.fillText(this.feedback||'CENTRA / CONTROLLER DEBUG',30,48);
  ctx.fillStyle='#355361';ctx.fillRect(24,72,478,75);ctx.fillRect(522,72,478,75);ctx.fillStyle='#fff';ctx.font='30px sans-serif';ctx.fillText('Swap Tool / Support',42,120);ctx.fillText(this.expanded?'Hide diagnostics':'Show diagnostics',540,120);
  if(this.expanded){
   for(let row=0;row<2;row++){
    const hand=row===0?'left':'right',state=states.find(s=>s.connected&&s.handedness===hand),y=190+row*175;
    ctx.font='bold 30px sans-serif';ctx.fillStyle=hand==='left'?'#63c8ee':'#efb665';ctx.fillText(`${hand.toUpperCase()} / ${state?.role.toUpperCase()??'DISCONNECTED'} / ${state?.tracked?'TRACKED':state?'POSE LOST':'OFFLINE'}`,30,y);
    ctx.fillStyle='#f0f5f5';ctx.font='28px monospace';
    if(state){const b=state.buttons;ctx.fillText(`Trigger ${b.trigger.value.toFixed(2)} ${b.trigger.pressed?'DOWN':'up'}   Grip ${b.grip.value.toFixed(2)} ${b.grip.pressed?'DOWN':'up'}`,30,y+38);ctx.fillText(`Stick ${state.stick.x.toFixed(2)}, ${state.stick.y.toFixed(2)}  ${b.thumbstick.pressed?'CLICK':' '}`,30,y+76);ctx.fillText(`Primary ${b.primary.available?(b.primary.pressed?'DOWN':'up'):'n/a'}  Secondary ${b.secondary.available?(b.secondary.pressed?'DOWN':'up'):'n/a'}`,30,y+114);}
    else ctx.fillText('Wake / reconnect this controller',30,y+50);
   }
   ctx.font='25px sans-serif';ctx.fillStyle='#b5cccf';ctx.fillText(`${this.interaction} · reset restores entry view`,30,530);
  }
  const footer=this.expanded?552:155,labels=[['Models',this.displayMode],['Hints',this.hints.mode],['Reset','Workspace View'],['Performance',this.performanceEnabled?'On':'Off']];ctx.font='23px sans-serif';labels.forEach((label,i)=>{const x=i*256+8;ctx.fillStyle='#355361';ctx.fillRect(x,footer,240,75);ctx.fillStyle='#fff';ctx.fillText(label[0],x+10,footer+27);ctx.fillText(label[1],x+10,footer+57);});this.texture.needsUpdate=true;
 }
 dispose():void{this.stop();this.mesh.geometry.dispose();this.mesh.material.dispose();this.texture.dispose();this.hints.dispose();}
}
