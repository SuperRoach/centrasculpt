import {VR_UI,paintVRPanel,drawVRText} from './xr-ui-style';
import {CanvasTexture,Mesh,MeshBasicMaterial,PlaneGeometry,SRGBColorSpace} from 'three';
import {hintText,hintsVisible} from './xr-actions';
import type {HintMode} from './xr-actions';
import type {XRInteractionState} from './workspace-grab';
export class XRHints {
 readonly mesh:Mesh<PlaneGeometry,MeshBasicMaterial>;mode:HintMode='on-demand';
 private lastContent='';
 private readonly context:CanvasRenderingContext2D;private readonly texture:CanvasTexture;private readonly canvas:HTMLCanvasElement;
 constructor(){this.canvas=document.createElement('canvas');this.canvas.width=1024;this.canvas.height=768;this.context=this.canvas.getContext('2d')!;this.texture=new CanvasTexture(this.canvas);this.texture.colorSpace=SRGBColorSpace;this.mesh=new Mesh(new PlaneGeometry(.62,.465),new MeshBasicMaterial({map:this.texture,transparent:true,toneMapped:false}));this.mesh.name='Contextual VR help';this.mesh.visible=false;}
 paint(demand:boolean,state:XRInteractionState,support:string,expanded:boolean):void{
  this.mesh.visible=hintsVisible(this.mode,demand);this.mesh.position.y=expanded?-.46:-.22;if(!this.mesh.visible)return;
  const content=`${state}:${support}`;if(this.lastContent===content)return;this.lastContent=content;
  const ctx=this.context;paintVRPanel(ctx,1024,768);drawVRText(ctx,`CONTROLS / ${state.toUpperCase()}`,{x:28,y:20,width:968,height:52},36,VR_UI.text,true);drawVRText(ctx,`Support: ${support} · Tool: ${support==='left'?'right':'left'}`,{x:28,y:80,width:968,height:44},30,VR_UI.muted);
  const lines=[...hintText('support',state),...hintText('tool',state)];lines.forEach((line,i)=>drawVRText(ctx,line,{x:28,y:140+i*102,width:968,height:96},30,VR_UI.text));this.texture.needsUpdate=true;
 }
 dispose():void{this.mesh.removeFromParent();this.mesh.geometry.dispose();this.mesh.material.dispose();this.texture.dispose();}
}
