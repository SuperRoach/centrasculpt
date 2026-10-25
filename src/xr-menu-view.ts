import {CanvasTexture,Mesh,MeshBasicMaterial,PlaneGeometry,Quaternion,Raycaster,SRGBColorSpace,Vector3} from 'three';
import type {Matrix4} from 'three';
import type {XRControllerState} from './xr-input';
import type {XRMenuRequest} from './xr-support-shortcuts';
import {XRMenuModel,MENU_SIZE,WHEEL} from './xr-menu-model';
import type {MenuContent,MenuButton} from './xr-menu-model';
/** The polling bridge supplies poses/actions; the menu owns ray hits, trigger capture and drawing. */
export interface XRMenuInteraction {readonly active:boolean;update(request:XRMenuRequest|null,tool:XRControllerState|undefined,pose:Matrix4|undefined,time:number,active:boolean):number|null;close():void;}
export class XRMenuView implements XRMenuInteraction {
 readonly mesh:Mesh<PlaneGeometry,MeshBasicMaterial>;readonly canvas:HTMLCanvasElement;paintCount=0;
 private readonly texture:CanvasTexture;private readonly ctx:CanvasRenderingContext2D;
 private readonly raycaster=new Raycaster();private readonly direction=new Vector3();
 private readonly eye=new Vector3();private readonly head=new Quaternion();private readonly forward=new Vector3();
 private slider:string|null=null;
 private ready=false;private owner=0;private hasPose=false;private lastContent='';private lastRefresh=-Infinity;private content:MenuContent|null=null;
 constructor(readonly model:XRMenuModel){
  this.canvas=document.createElement('canvas');this.canvas.width=this.canvas.height=MENU_SIZE;this.ctx=this.canvas.getContext('2d')!;
  this.texture=new CanvasTexture(this.canvas);this.texture.colorSpace=SRGBColorSpace;
  this.mesh=new Mesh(new PlaneGeometry(.72,.72),new MeshBasicMaterial({map:this.texture,toneMapped:false,depthTest:false,depthWrite:false}));this.mesh.name='VR tools / layers / contextual options';this.mesh.renderOrder=30;this.mesh.visible=false;
 }
 get active():boolean{return !!this.model.request;}
 place(position:{x:number;y:number;z:number},orientation:{x:number;y:number;z:number;w:number}):void{this.eye.set(position.x,position.y,position.z);this.head.set(orientation.x,orientation.y,orientation.z,orientation.w);this.hasPose=true;}
 private anchor():void{this.forward.set(0,0,-1).applyQuaternion(this.head);this.forward.y=0;if(this.forward.lengthSq()<.001)this.forward.set(0,0,-1);this.forward.normalize();this.mesh.position.copy(this.eye).addScaledVector(this.forward,1.05);this.mesh.position.y-=.12;this.mesh.lookAt(this.eye);this.mesh.updateWorldMatrix(true,false);}
 close():void{this.slider=null;this.model.setRequest(null);this.mesh.visible=false;this.ready=false;this.owner=0;this.content=null;this.lastContent='';this.lastRefresh=-Infinity;}
 start():void{this.close();this.hasPose=false;}
 stop():void{this.start();this.mesh.removeFromParent();}
 update(request:XRMenuRequest|null,tool:XRControllerState|undefined,pose:Matrix4|undefined,time:number,active:boolean):number|null{
  if(!active||!request){this.close();return null;}
  const opened=request!==this.model.request;
  if(opened){this.slider=null;this.model.setRequest(request);this.ready=false;this.owner=0;this.anchor();this.lastRefresh=-Infinity;}
  if(!this.mesh.visible&&this.hasPose)this.anchor();
  this.mesh.visible=this.hasPose;if(!this.mesh.visible)return null;
  if(time-this.lastRefresh>=100||!this.content){this.content=this.model.content();this.lastRefresh=time;}
  let distance:number|null=null;this.model.hover=null;
  if(tool?.connected&&tool.role==='tool'&&tool.tracked&&tool.gripTracked&&pose&&pose.elements.every(Number.isFinite)&&Math.abs(pose.determinant())>1e-10){
   if(tool.connectionId!==this.owner){this.slider=null;this.owner=tool.connectionId;this.ready=false;}
   this.mesh.updateWorldMatrix(true,false);this.raycaster.ray.origin.setFromMatrixPosition(pose);this.direction.set(0,0,-1).transformDirection(pose);this.raycaster.ray.direction.copy(this.direction);this.raycaster.far=3;
   const hit=this.raycaster.intersectObject(this.mesh,false)[0];
   if(hit?.uv){distance=hit.distance;this.model.hover=this.model.hit(hit.uv.x*MENU_SIZE,(1-hit.uv.y)*MENU_SIZE,this.content);}
   if(!tool.buttons.trigger.pressed&&tool.buttons.trigger.rawValue<.45){this.ready=true;this.slider=null;}
   if(!opened&&this.ready&&tool.buttons.trigger.justPressed){this.ready=false;if(this.model.hover){if(this.model.hover.startsWith('slider:'))this.slider=this.model.hover;else this.model.activate(this.model.hover);this.content=this.model.content();this.lastRefresh=time;}}
   if(this.slider&&tool.buttons.trigger.pressed&&hit?.uv){const b=this.content.buttons.find(b=>b.id===this.slider);if(b?.rect){this.model.setSlider(this.slider,(hit.uv.x*MENU_SIZE-b.rect.x)/b.rect.width);this.content=this.model.content();}}
  }else{this.slider=null;this.ready=false;this.owner=0;}
  this.paint(this.content);return distance;
 }
 private paint(content:MenuContent):void{
  const key=JSON.stringify([content,this.model.hover]);if(key===this.lastContent)return;this.lastContent=key;this.paintCount++;
  const ctx=this.ctx;ctx.fillStyle='#17262d';ctx.fillRect(0,0,MENU_SIZE,MENU_SIZE);ctx.textAlign='left';ctx.fillStyle='#f2f7f5';ctx.font='bold 46px sans-serif';ctx.fillText(content.title,40,76);ctx.font='27px sans-serif';ctx.fillStyle='#b9ccc9';ctx.fillText(content.subtitle,40,119);
  for(const b of content.buttons)this.button(b);
  ctx.textAlign='left';for(const label of content.labels){ctx.fillStyle=label.small?'#b4c9c5':'#eef5f1';ctx.font=`${label.small?26:32}px sans-serif`;ctx.fillText(label.text.slice(0,46),label.x,label.y);}
  ctx.fillStyle='#a9cec0';ctx.font='29px sans-serif';ctx.fillText(content.footer.slice(0,67),40,1092);this.texture.needsUpdate=true;
 }
 private button(b:MenuButton):void{
  const ctx=this.ctx,hover=b.id===this.model.hover;
  if(b.slider){const r=b.rect!,u=(b.slider.value-b.slider.min)/(b.slider.max-b.slider.min);ctx.fillStyle=b.disabled?'#455158':'#5d8278';ctx.fillRect(r.x,r.y+r.height/2-7,r.width,14);ctx.fillStyle=b.disabled?'#7a888e':'#b1e6cd';ctx.beginPath();ctx.arc(r.x+u*r.width,r.y+r.height/2,15,0,Math.PI*2);ctx.fill();return;}

  ctx.fillStyle=b.disabled?'#29363b':hover?'#386c62':b.selected?'#31574e':'#263e46';ctx.strokeStyle=b.selected?'#b1e6cd':hover?'#d5f1e4':'#557178';ctx.lineWidth=b.selected||hover?5:2;
  let x:number,y:number,width:number;
  if(b.sector!==undefined){const angle=-Math.PI/2+b.sector*Math.PI*2/5,start=angle-Math.PI/5+.025,end=angle+Math.PI/5-.025;ctx.beginPath();ctx.arc(WHEEL.x,WHEEL.y,WHEEL.outer,start,end);ctx.arc(WHEEL.x,WHEEL.y,WHEEL.inner,end,start,true);ctx.closePath();ctx.fill();ctx.stroke();x=WHEEL.x+Math.cos(angle)*WHEEL.labelRadius;y=WHEEL.y+Math.sin(angle)*WHEEL.labelRadius;width=260;}
  else{const r=b.rect!;ctx.fillRect(r.x,r.y,r.width,r.height);ctx.strokeRect(r.x,r.y,r.width,r.height);x=r.x+r.width/2+(b.colour?14:0);y=r.y+r.height/2;width=r.width-(b.colour?58:18);}
  ctx.textAlign='center';ctx.fillStyle=b.disabled?'#96a2a6':'#f4f8f6';ctx.font='bold 32px sans-serif';const lines=b.label==='Transform Layer'?['Transform','Layer']:b.label==='Shape Stamp'?['Shape','Stamp']:[b.label];
  lines.forEach((line,i)=>ctx.fillText(line.slice(0,b.rect&&b.rect.width>600?34:24),x,y+(i-(lines.length-1)/2)*36-(b.detail?12:0)+10,width));
  if(b.colour&&b.rect){ctx.fillStyle=b.colour;ctx.fillRect(b.rect.x+12,b.rect.y+14,16,b.rect.height-28);}
  if(b.detail){ctx.font='24px sans-serif';ctx.fillStyle=b.disabled?'#89999e':'#bed8ce';ctx.fillText(b.detail,x,y+(lines.length-1)*18+38,width);}
 }
 dispose():void{this.stop();this.texture.dispose();this.mesh.geometry.dispose();this.mesh.material.dispose();}
}
