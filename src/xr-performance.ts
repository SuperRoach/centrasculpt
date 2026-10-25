import {CanvasTexture,Mesh,MeshBasicMaterial,PlaneGeometry,Quaternion,SRGBColorSpace,Vector3} from 'three';
import type {Object3D} from 'three';
export type XRSculptureInfo={activeResolution:string;resolutions:string;layerMeshes:number;compositeMeshes:number};
export function countVisibleMeshes(root:Object3D):number{let count=0;root.traverseVisible(object=>{if((object as Object3D&{isMesh?:boolean}).isMesh)count++;});return count;}
export type XRPerformanceSnapshot={fps:number;averageMs:number;latestMs:number;maxMs:number;p95Ms:number;spikes:number;cpuMs:number;inputMs:number;calls:number;triangles:number;sculpture:XRSculptureInfo};
/** One cached texture, opt-in, refreshed at most twice/second. JS/callback counters are not GPU timings. */
export class XRPerformancePanel {
 readonly mesh:Mesh<PlaneGeometry,MeshBasicMaterial>;
 enabled=false;paintCount=0;
 private readonly canvas:HTMLCanvasElement;private readonly context:CanvasRenderingContext2D;private readonly texture:CanvasTexture;
 private lastPaint=-Infinity;private placed=false;
 private readonly eye=new Vector3();private readonly forward=new Vector3();private readonly right=new Vector3();private readonly up=new Vector3(0,1,0);private readonly rotation=new Quaternion();
 constructor(){this.canvas=document.createElement('canvas');this.canvas.width=1024;this.canvas.height=512;this.context=this.canvas.getContext('2d')!;this.texture=new CanvasTexture(this.canvas);this.texture.colorSpace=SRGBColorSpace;this.mesh=new Mesh(new PlaneGeometry(.62,.31),new MeshBasicMaterial({map:this.texture,toneMapped:false}));this.mesh.name='Optional VR performance metrics';this.mesh.visible=false;}
 start():void{this.placed=false;this.lastPaint=-Infinity;this.mesh.visible=false;}
 stop():void{this.mesh.visible=false;this.mesh.removeFromParent();this.placed=false;}
 setEnabled(value:boolean):void{this.enabled=value;this.lastPaint=-Infinity;this.mesh.visible=value&&this.placed;}
 place(position:{x:number;y:number;z:number},orientation:{x:number;y:number;z:number;w:number}):void{if(this.placed)return;this.placed=true;this.eye.set(position.x,position.y,position.z);this.rotation.set(orientation.x,orientation.y,orientation.z,orientation.w);this.forward.set(0,0,-1).applyQuaternion(this.rotation);this.forward.y=0;if(this.forward.lengthSq()<.001)this.forward.set(0,0,-1);this.forward.normalize();this.right.crossVectors(this.forward,this.up).normalize();this.mesh.position.copy(this.eye).addScaledVector(this.forward,1.1).addScaledVector(this.right,-.74);this.mesh.position.y-=.12;this.mesh.lookAt(this.eye);this.mesh.visible=this.enabled;}
 paint(time:number,data:XRPerformanceSnapshot):void{if(!this.enabled||!this.placed||time-this.lastPaint<500)return;this.lastPaint=time;this.paintCount++;const ctx=this.context;ctx.fillStyle='#202a2f';ctx.fillRect(0,0,1024,512);ctx.fillStyle='#fff';ctx.font='bold 34px sans-serif';ctx.fillText('VR PERFORMANCE / ESTIMATES',28,48);ctx.font='28px monospace';
  const lines=[`${data.fps.toFixed(1)} FPS · avg ${data.averageMs.toFixed(2)} ms`, `Latest ${data.latestMs.toFixed(2)} · p95 ${data.p95Ms.toFixed(2)} · max ${data.maxMs.toFixed(2)} ms`, `Spikes ${data.spikes} · CPU ${data.cpuMs.toFixed(2)} ms`, `Input/debug ${data.inputMs.toFixed(3)} ms · calls ${data.calls}`, `Rendered triangles ${data.triangles.toLocaleString()}`, `Active ${data.sculpture.activeResolution} · ${data.sculpture.resolutions}`, `Meshes: layers ${data.sculpture.layerMeshes} / CSG ${data.sculpture.compositeMeshes}`];lines.forEach((line,i)=>ctx.fillText(line,28,104+i*48));ctx.font='23px sans-serif';ctx.fillStyle='#bccbd0';ctx.fillText('Callback/JS timing ≠ GPU time. No assumed refresh rate.',28,484);this.texture.needsUpdate=true;}
 dispose():void{this.stop();this.mesh.geometry.dispose();this.mesh.material.dispose();this.texture.dispose();}
}
