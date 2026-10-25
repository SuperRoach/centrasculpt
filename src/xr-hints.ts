import {CanvasTexture,Mesh,MeshBasicMaterial,PlaneGeometry,SRGBColorSpace} from 'three';
import {hintText,hintsVisible} from './xr-actions';
import type {HintMode} from './xr-actions';
import type {XRInteractionState} from './workspace-grab';
export class XRHints {
 readonly mesh:Mesh<PlaneGeometry,MeshBasicMaterial>;mode:HintMode='on-demand';
 private lastContent='';
 private readonly context:CanvasRenderingContext2D;private readonly texture:CanvasTexture;private readonly canvas:HTMLCanvasElement;
 constructor(){this.canvas=document.createElement('canvas');this.canvas.width=1024;this.canvas.height=512;this.context=this.canvas.getContext('2d')!;this.texture=new CanvasTexture(this.canvas);this.texture.colorSpace=SRGBColorSpace;this.mesh=new Mesh(new PlaneGeometry(.62,.31),new MeshBasicMaterial({map:this.texture,toneMapped:false}));this.mesh.name='Contextual VR help';this.mesh.visible=false;}
 paint(demand:boolean,state:XRInteractionState,support:string,expanded:boolean):void{
  this.mesh.visible=hintsVisible(this.mode,demand);this.mesh.position.y=expanded?-.37:-.14;if(!this.mesh.visible)return;
  const content=`${state}:${support}`;if(this.lastContent===content)return;this.lastContent=content;
  const ctx=this.context;ctx.fillStyle='#203037';ctx.fillRect(0,0,1024,512);ctx.fillStyle='#fff';ctx.font='bold 31px sans-serif';ctx.fillText(`CONTROLS / ${state.toUpperCase()}`,28,45);ctx.font='27px sans-serif';ctx.fillText(`Support: ${support} — Tool: ${support==='left'?'right':'left'}`,28,88);
  const lines=[...hintText('support',state),...hintText('tool',state)];lines.forEach((line,i)=>{ctx.fillStyle=line.includes('Reserved')?'#d4dbdf':'#b4f09c';ctx.font='25px sans-serif';ctx.fillText(line,28,145+i*60);});this.texture.needsUpdate=true;
 }
 dispose():void{this.mesh.removeFromParent();this.mesh.geometry.dispose();this.mesh.material.dispose();this.texture.dispose();}
}
