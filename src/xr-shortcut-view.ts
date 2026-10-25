import {CanvasTexture,Mesh,MeshBasicMaterial,PlaneGeometry,Quaternion,SRGBColorSpace,Vector3} from 'three';
import type {XRSupportShortcuts} from './xr-support-shortcuts';
/** Temporary noninteractive menu card and short action toast, independent of diagnostics visibility. */
export class XRShortcutView {
 readonly mesh:Mesh<PlaneGeometry,MeshBasicMaterial>;paintCount=0;
 private readonly canvas:HTMLCanvasElement;private readonly ctx:CanvasRenderingContext2D;private readonly texture:CanvasTexture;
 private placed=false;private content='';
 private readonly eye=new Vector3();private readonly forward=new Vector3();private readonly rotation=new Quaternion();
 constructor(){
  this.canvas=document.createElement('canvas');this.canvas.width=1024;this.canvas.height=256;this.ctx=this.canvas.getContext('2d')!;
  this.texture=new CanvasTexture(this.canvas);this.texture.colorSpace=SRGBColorSpace;
  this.mesh=new Mesh(new PlaneGeometry(.52,.13),new MeshBasicMaterial({map:this.texture,toneMapped:false,depthTest:false,depthWrite:false}));this.mesh.name='VR shortcut feedback / temporary menu request';this.mesh.renderOrder=20;this.mesh.visible=false;
 }
 start():void{this.placed=false;this.content='';this.mesh.visible=false;}
 stop():void{this.start();this.mesh.removeFromParent();}
 place(position:{x:number;y:number;z:number},orientation:{x:number;y:number;z:number;w:number}):void{
  if(this.placed)return;this.placed=true;this.eye.set(position.x,position.y,position.z);this.rotation.set(orientation.x,orientation.y,orientation.z,orientation.w);
  this.forward.set(0,0,-1).applyQuaternion(this.rotation);this.forward.y=0;if(this.forward.lengthSq()<.001)this.forward.set(0,0,-1);this.forward.normalize();
  this.mesh.position.copy(this.eye).addScaledVector(this.forward,.9);this.mesh.position.y-=.38;this.mesh.lookAt(this.eye);
 }
 paint(shortcuts:XRSupportShortcuts,time:number,active=true,showMenuPreview=true,notice='',noticeHelp='Tool stick · Up grows / Down shrinks'):void{
  const menu=showMenuPreview?shortcuts.menu:null;
  const title=(menu==='tool-wheel'?'Tool Wheel':menu==='layers'?'Layers Palette':menu==='tool-options'?'Tool Options':!shortcuts.menu&&time<shortcuts.until?shortcuts.message:'')||(!shortcuts.menu?notice:'');
  this.mesh.visible=active&&this.placed&&!!title;if(!this.mesh.visible)return;
  const subtitle=notice&&title===notice?noticeHelp:shortcuts.menu?'Menu preview · return stick to centre to close':'Support stick · ← Undo  /  Redo →';
  const content=`${title}:${subtitle}:${shortcuts.successful}`;if(content===this.content)return;this.content=content;this.paintCount++;
  const ctx=this.ctx;ctx.fillStyle='#203037';ctx.fillRect(0,0,1024,256);ctx.fillStyle='#b9d8ce';ctx.font='bold 42px sans-serif';ctx.fillText(title,32,90,960);ctx.fillStyle='#eef2f2';ctx.font='28px sans-serif';ctx.fillText(subtitle,32,164);this.texture.needsUpdate=true;
 }
 dispose():void{this.stop();this.texture.dispose();this.mesh.geometry.dispose();this.mesh.material.dispose();}
}
