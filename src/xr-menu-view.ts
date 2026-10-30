import {VR_UI,VR_UI_SCALES,drawVRText,paintVRPanel,roundedVRRect,vrControlStyle} from './xr-ui-style';
import {VR_WHEEL_TOOLS} from './editor-tool-state';
import {CanvasTexture,Mesh,MeshBasicMaterial,PlaneGeometry,SphereGeometry,Quaternion,Raycaster,SRGBColorSpace,Vector3} from 'three';
import type {Matrix4} from 'three';
import type {XRControllerState} from './xr-input';
import type {XRMenuRequest} from './xr-support-shortcuts';
import {XRMenuModel,MENU_SIZE,WHEEL} from './xr-menu-model';
import type {MenuContent,MenuButton} from './xr-menu-model';
/** The polling bridge supplies poses/actions; the menu owns ray hits, trigger capture and drawing. */
export interface XRMenuInteraction {readonly active:boolean;readonly layerSelectionActive?:boolean;update(request:XRMenuRequest|null,tool:XRControllerState|undefined,pose:Matrix4|undefined,time:number,active:boolean):number|null;close():void;}
export class XRMenuView implements XRMenuInteraction {
 readonly cursor=new Mesh(new SphereGeometry(.004,12,8),new MeshBasicMaterial({color:'#ffffff',transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));
 readonly mesh:Mesh<PlaneGeometry,MeshBasicMaterial>;readonly canvas:HTMLCanvasElement;paintCount=0;
 private readonly texture:CanvasTexture;private readonly ctx:CanvasRenderingContext2D;
 private readonly raycaster=new Raycaster();private readonly direction=new Vector3();
 private readonly eye=new Vector3();private readonly head=new Quaternion();private readonly forward=new Vector3();
 private slider:string|null=null;
 private ready=false;private owner=0;private hasPose=false;private lastContent='';private lastRefresh=-Infinity;private content:MenuContent|null=null;
 get layerSelectionActive():boolean{return this.model.layerSelectionActive;}
 constructor(readonly model:XRMenuModel){
  this.canvas=document.createElement('canvas');this.canvas.width=this.canvas.height=MENU_SIZE;this.ctx=this.canvas.getContext('2d')!;
  this.texture=new CanvasTexture(this.canvas);this.texture.colorSpace=SRGBColorSpace;
  this.mesh=new Mesh(new PlaneGeometry(.72,.72),new MeshBasicMaterial({map:this.texture,transparent:true,toneMapped:false,depthTest:false,depthWrite:false}));this.mesh.name='VR tools / layers / contextual options';this.mesh.renderOrder=1000;this.mesh.visible=false;
  // Start the foreground depth layer after the menu, once per rendered XR eye.
  // Controllers retain depth testing so their buttons/body correctly occlude each other.
  this.mesh.onAfterRender=renderer=>{renderer.state.buffers.depth.setMask(true);renderer.clearDepth();};
  this.cursor.name='Menu ray hit cursor';this.cursor.renderOrder=1002;this.cursor.visible=false;this.cursor.raycast=()=>{};this.mesh.add(this.cursor);
 }
 get active():boolean{return !!this.model.request;}
 place(position:{x:number;y:number;z:number},orientation:{x:number;y:number;z:number;w:number}):void{this.eye.set(position.x,position.y,position.z);this.head.set(orientation.x,orientation.y,orientation.z,orientation.w);this.hasPose=true;}
 private anchor():void{this.forward.set(0,0,-1).applyQuaternion(this.head);this.forward.y=0;if(this.forward.lengthSq()<.001)this.forward.set(0,0,-1);this.forward.normalize();this.mesh.position.copy(this.eye).addScaledVector(this.forward,1.05);this.mesh.position.y-=.12;this.mesh.lookAt(this.eye);this.mesh.updateWorldMatrix(true,false);}
 close():void{this.cursor.visible=false;this.slider=null;this.model.setRequest(null);this.mesh.visible=false;this.ready=false;this.owner=0;this.content=null;this.lastContent='';this.lastRefresh=-Infinity;}
 start():void{this.close();this.hasPose=false;}
 stop():void{this.start();this.mesh.removeFromParent();}
 update(request:XRMenuRequest|null,tool:XRControllerState|undefined,pose:Matrix4|undefined,time:number,active:boolean):number|null{
  if(!active||!request){this.close();return null;}
  const factor=VR_UI_SCALES[this.model.tools.port.layers().display.vrUiScale];this.mesh.scale.setScalar(factor);this.cursor.scale.setScalar(1);
  const opened=request!==this.model.request;
  if(opened){this.slider=null;this.model.setRequest(request);this.ready=false;this.owner=0;this.anchor();this.lastRefresh=-Infinity;}
  if(!this.mesh.visible&&this.hasPose)this.anchor();
  this.mesh.visible=this.hasPose;if(!this.mesh.visible)return null;
  if(time-this.lastRefresh>=100||!this.content){this.content=this.model.content();this.lastRefresh=time;}
  let distance:number|null=null;this.model.hover=null;this.cursor.visible=false;
  if(tool?.connected&&tool.role==='tool'&&tool.tracked&&tool.gripTracked&&pose&&pose.elements.every(Number.isFinite)&&Math.abs(pose.determinant())>1e-10){
   if(tool.connectionId!==this.owner){this.slider=null;this.owner=tool.connectionId;this.ready=false;}
   this.mesh.updateWorldMatrix(true,false);this.raycaster.ray.origin.setFromMatrixPosition(pose);this.direction.set(0,0,-1).transformDirection(pose);this.raycaster.ray.direction.copy(this.direction);this.raycaster.far=3;
   const hit=this.raycaster.intersectObject(this.mesh,false)[0];
   if(hit?.uv){distance=hit.distance;this.model.hover=this.model.hit(hit.uv.x*MENU_SIZE,(1-hit.uv.y)*MENU_SIZE,this.content);const target=this.content.buttons.find(b=>b.id===this.model.hover);this.cursor.visible=!!target;this.cursor.material.color.set(target?.disabled?VR_UI.disabled:this.slider===target?.id?VR_UI.text:VR_UI.accent);this.cursor.position.set((hit.uv.x-.5)*.72,(hit.uv.y-.5)*.72,.002);}
   if(!tool.buttons.trigger.pressed&&tool.buttons.trigger.rawValue<.45){this.ready=true;this.slider=null;}
   if(!opened&&this.ready&&tool.buttons.trigger.justPressed){this.ready=false;if(this.model.hover){if(this.model.hover.startsWith('slider:'))this.slider=this.model.hover;else this.model.activate(this.model.hover);this.content=this.model.content();this.lastRefresh=time;}}
   if(this.slider&&tool.buttons.trigger.pressed&&hit?.uv){const b=this.content.buttons.find(b=>b.id===this.slider);if(b?.rect){this.model.setSlider(this.slider,(hit.uv.x*MENU_SIZE-b.rect.x-20)/(b.rect.width-40));this.content=this.model.content();}}
  }else{this.slider=null;this.ready=false;this.owner=0;}
  this.paint(this.content);return distance;
 }
 private paint(content:MenuContent):void{
  const key=JSON.stringify([content,this.model.hover,this.slider]);if(key===this.lastContent)return;this.lastContent=key;this.paintCount++;
  const ctx=this.ctx,wheel=this.model.page==='tool-wheel'&&content.buttons.some(b=>b.sector!==undefined);
  if(wheel)ctx.clearRect(0,0,MENU_SIZE,MENU_SIZE);else paintVRPanel(ctx,MENU_SIZE,MENU_SIZE);
  // Independent small title/footer plaques keep the floating wheel readable in AR.
  if(wheel){for(const r of [{x:24,y:24,width:798,height:106},{x:24,y:1032,width:1104,height:96}]){roundedVRRect(ctx,r.x,r.y,r.width,r.height);ctx.fillStyle='rgba(16,26,32,0.88)';ctx.fill();}}
  drawVRText(ctx,content.title,{x:40,y:32,width:776,height:56},VR_UI.heading,VR_UI.text,true);
  drawVRText(ctx,content.subtitle,{x:40,y:92,width:776,height:38},VR_UI.detail,VR_UI.muted);
  for(const b of content.buttons)this.button(b);
  for(const label of content.labels)drawVRText(ctx,label.text,{x:label.x,y:label.y,width:label.width??MENU_SIZE-label.x-44,height:label.height??46},label.small?VR_UI.label:label.value?VR_UI.value:VR_UI.label,label.small?VR_UI.muted:VR_UI.text);
  drawVRText(ctx,content.footer,{x:wheel?744:40,y:1048,width:wheel?368:1072,height:72},VR_UI.footer,VR_UI.muted);this.texture.needsUpdate=true;
 }
 private button(b:MenuButton):void{
  const ctx=this.ctx,hover=b.id===this.model.hover&&!b.disabled,style=vrControlStyle(b.disabled,hover,b.selected,this.slider===b.id);
  if(b.slider){const r=b.rect!,u=Math.max(0,Math.min(1,(b.slider.value-b.slider.min)/(b.slider.max-b.slider.min)));roundedVRRect(ctx,r.x,r.y,r.width,r.height,18);ctx.fillStyle=style.fill;ctx.fill();ctx.strokeStyle=style.stroke;ctx.lineWidth=style.lineWidth;ctx.stroke();ctx.strokeStyle=b.disabled?VR_UI.disabled:VR_UI.accent;ctx.lineWidth=8;ctx.beginPath();ctx.moveTo(r.x+20,r.y+r.height/2);ctx.lineTo(r.x+r.width-20,r.y+r.height/2);ctx.stroke();ctx.fillStyle=style.text;ctx.beginPath();ctx.arc(r.x+20+u*(r.width-40),r.y+r.height/2,17,0,Math.PI*2);ctx.fill();return;}
  if(b.sector!==undefined){
   const angle=-Math.PI/2+b.sector*Math.PI*2/VR_WHEEL_TOOLS.length,x=WHEEL.x+Math.cos(angle)*WHEEL.labelRadius,y=WHEEL.y+Math.sin(angle)*WHEEL.labelRadius;
   roundedVRRect(ctx,x-78,y-59,156,118,20);ctx.fillStyle=b.disabled?'rgba(25,34,40,.76)':hover?style.fill:b.selected?style.fill:'rgba(17,28,35,.86)';ctx.fill();
   if(hover||b.selected){ctx.strokeStyle=style.stroke;ctx.lineWidth=style.lineWidth;ctx.stroke();}
   this.icon(b.id.slice(5),x,y-34,style.text);const label=b.id==='tool:stamp'?'Shape Stamp':b.id==='tool:transform'?'Transform':b.id==='tool:edit-spline'?'Edit Spline':b.id==='tool:move'?'Move':b.label;
   drawVRText(ctx,label,{x:x-74,y:y-10,width:148,height:70},VR_UI.radial,style.text,true,'center');return;
  }
  const r=b.rect!;roundedVRRect(ctx,r.x,r.y,r.width,r.height);ctx.fillStyle=style.fill;ctx.fill();ctx.strokeStyle=style.stroke;ctx.lineWidth=style.lineWidth;ctx.stroke();
  if(b.id.startsWith('paint-swatch:')){roundedVRRect(ctx,r.x+6,r.y+6,r.width-12,r.height-12,16);ctx.fillStyle=b.colour!;ctx.fill();if(b.selected){ctx.strokeStyle='#ffffff';ctx.lineWidth=5;ctx.stroke();}return;}
  if(b.id==='tool:mask'||b.id==='tool:paint'){this.icon(b.id.slice(5),r.x+48,r.y+r.height/2,style.text);drawVRText(ctx,b.label,{x:r.x+88,y:r.y+(r.height-VR_UI.value*1.15)/2,width:r.width-108,height:VR_UI.value*1.15},VR_UI.value,style.text,true,'center');return;}
  if(b.swatch&&b.colour){
   const cy=r.y+r.height/2,labelHeight=VR_UI.label*1.05,checkHeight=VR_UI.control*1.05;
   roundedVRRect(ctx,r.x+20,cy-44,88,88,18);ctx.fillStyle=b.colour;ctx.fill();ctx.strokeStyle=VR_UI.muted;ctx.lineWidth=2;ctx.stroke();
   drawVRText(ctx,b.label,{x:r.x+124,y:cy-labelHeight/2,width:r.width-144,height:labelHeight},VR_UI.label,style.text,true,'center');
   if(b.selected){drawVRText(ctx,'✓',{x:r.x+22,y:cy-checkHeight/2,width:84,height:checkHeight},VR_UI.control,parseInt(b.colour.slice(1,3),16)>130?'#101a20':'#ffffff',true,'center');}return;
  }
  if(b.colour){roundedVRRect(ctx,r.x+12,r.y+12,12,r.height-24,6);ctx.fillStyle=b.colour;ctx.fill();}
  // Navigation chevrons get their own aligned column instead of font-glyph spacing.
  if(b.label.startsWith('‹ ')){
   const cy=r.y+r.height/2;
   ctx.save();ctx.strokeStyle=style.text;ctx.lineWidth=3.5;ctx.lineCap='round';ctx.lineJoin='round';
   ctx.beginPath();ctx.moveTo(r.x+36,cy-9);ctx.lineTo(r.x+27,cy);ctx.lineTo(r.x+36,cy+9);ctx.stroke();ctx.restore();
   drawVRText(ctx,b.label.slice(2),{x:r.x+58,y:cy-VR_UI.label*1.05/2,width:r.width-78,height:VR_UI.label*1.05},VR_UI.label,style.text,true);
   return;
  }
  const pad=b.colour?36:16,size=['+','-','‹','›'].includes(b.label)?VR_UI.control:r.width<210?VR_UI.label:r.width<300?VR_UI.label:VR_UI.value;
  const labelHeight=b.detail?r.height*.52:r.height-16;
  drawVRText(ctx,b.label,{x:r.x+pad,y:r.y+(b.detail?8:Math.max(8,(r.height-size*1.15)/2)),width:r.width-pad-16,height:labelHeight},size,style.text,true,'center');
  if(b.detail)drawVRText(ctx,b.detail,{x:r.x+pad,y:r.y+r.height*.55,width:r.width-pad-16,height:r.height*.43},VR_UI.detail,b.disabled?VR_UI.disabled:VR_UI.muted,false,'center');
 }
 private icon(id:string,x:number,y:number,colour:string):void{
  const c=this.ctx;c.save();c.translate(x,y);c.scale(.85,.85);c.strokeStyle=colour;c.fillStyle=colour;c.lineWidth=4;c.lineCap='round';c.lineJoin='round';c.beginPath();
  if(id==='clay'||id==='inflate'){c.arc(0,0,14,0,Math.PI*2);c.moveTo(-7,0);c.lineTo(7,0);if(id==='clay'){c.moveTo(0,-7);c.lineTo(0,7);}else{c.moveTo(-20,0);c.lineTo(-26,0);c.moveTo(20,0);c.lineTo(26,0);}}
  else if(id==='paint'){
   c.moveTo(-6,6);c.lineTo(12,-22);c.quadraticCurveTo(18,-28,23,-22);c.quadraticCurveTo(27,-18,21,-12);c.lineTo(0,12);c.closePath();
   c.moveTo(-7,8);c.bezierCurveTo(-23,7,-12,23,-27,25);c.bezierCurveTo(-10,31,5,23,0,13);c.closePath();
  }
  else if(id==='mask'){
   // A half-shaded shield communicates painted protection at headset scale.
   c.moveTo(0,-23);c.lineTo(-21,-17);c.lineTo(-21,1);c.bezierCurveTo(-21,15,-9,24,0,29);c.closePath();c.save();c.globalAlpha=.32;c.fill();c.restore();c.beginPath();
   c.moveTo(0,-23);c.lineTo(21,-17);c.lineTo(21,1);c.bezierCurveTo(21,15,9,24,0,29);c.bezierCurveTo(-9,24,-21,15,-21,1);c.lineTo(-21,-17);c.closePath();c.moveTo(0,-20);c.lineTo(0,24);
  }
  else if(id==='smooth'){c.moveTo(-24,5);c.bezierCurveTo(-12,-22,5,22,24,-5);}
  else if(id==='tube'||id==='edit-spline'){c.moveTo(-24,12);c.bezierCurveTo(-15,-24,8,24,24,-12);if(id==='tube'){c.moveTo(-24,3);c.bezierCurveTo(-15,-33,8,15,24,-21);}else{for(const p of [[-24,12],[0,0],[24,-12]]){c.moveTo(p[0]+5,p[1]);c.arc(p[0],p[1],5,0,Math.PI*2);}}}
  else if(id==='stamp'){c.rect(-15,-12,30,26);c.moveTo(-22,21);c.lineTo(22,21);c.moveTo(0,-12);c.lineTo(0,-22);}
  else if(id==='move'){
   // A local patch pulled upward: deformation, distinct from whole-layer arrows.
   c.moveTo(-26,17);c.bezierCurveTo(-12,17,-12,-3,0,-3);c.bezierCurveTo(12,-3,12,17,26,17);
   c.moveTo(-25,23);c.bezierCurveTo(-8,23,-7,7,0,7);c.bezierCurveTo(7,7,8,23,25,23);
   c.moveTo(0,-8);c.lineTo(0,-25);c.moveTo(-7,-18);c.lineTo(0,-25);c.lineTo(7,-18);
  }
  else if(id==='transform'){c.rect(-6,-6,12,12);for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5]){const dx=Math.cos(a),dy=Math.sin(a);c.moveTo(dx*9,dy*9);c.lineTo(dx*24,dy*24);c.moveTo(dx*17-dy*6,dy*17+dx*6);c.lineTo(dx*24,dy*24);c.lineTo(dx*17+dy*6,dy*17-dx*6);}}
  else if(id==='pinch'||id==='crease'){c.moveTo(-25,-14);c.lineTo(-8,0);c.lineTo(-25,14);c.moveTo(25,-14);c.lineTo(8,0);c.lineTo(25,14);if(id==='crease'){c.moveTo(0,-20);c.lineTo(0,17);c.lineTo(-6,10);c.moveTo(0,17);c.lineTo(6,10);}}
  else{c.moveTo(-24,14);c.lineTo(24,14);c.moveTo(-16,-12);c.lineTo(16,id==='scrape'?-2:-12);c.moveTo(0,-8);c.lineTo(0,7);}
  c.stroke();c.restore();
 }
 dispose():void{this.stop();this.cursor.geometry.dispose();this.cursor.material.dispose();this.texture.dispose();this.mesh.geometry.dispose();this.mesh.material.dispose();}
}
