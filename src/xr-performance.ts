import type {TimingSummary} from './sculpt-metrics';
import {CanvasTexture,Mesh,MeshBasicMaterial,PlaneGeometry,Quaternion,SRGBColorSpace,Vector3} from 'three';
import type {Object3D} from 'three';
export type XRSculptureInfo={activeResolution:string;resolutions:string;layerMeshes:number;compositeMeshes:number};
export function countVisibleMeshes(root:Object3D):number{let count=0;root.traverseVisible(object=>{if((object as Object3D&{isMesh?:boolean}).isMesh)count++;});return count;}
export type XREditMetrics={move?:{milliseconds:number;p95:number|null;vertices:number;chunks:number;active:boolean;committing?:boolean;commitMs?:number|null;commitVoxels?:number};allocation?:{dimensions:string;bounds:string;samples:number;chunks:number;storageBytes:number;expansions:number;lastMs:number};tool:string;radius:number;brush:TimingSummary;remesh:TimingSummary;path:TimingSummary;stroke:TimingSummary;xrStroke?:TimingSummary;pendingChunks:number;replayRemaining:number;memory:{trackedBytes:number;trackedHighWaterBytes:number;heapBytes:number|null;heapHighWaterBytes:number|null}};
export type XRPerformanceSnapshot={medianMs?:number;p99Ms?:number|null;sampleCount?:number;recentSpikes?:number;edit?:XREditMetrics;fps:number;averageMs:number;latestMs:number;maxMs:number;p95Ms:number;spikes:number;cpuMs:number;inputMs:number;calls:number;triangles:number;sculpture:XRSculptureInfo};
/** One cached texture, opt-in, refreshed at most twice/second. JS/callback counters are not GPU timings. */
export class XRPerformancePanel {
 readonly mesh:Mesh<PlaneGeometry,MeshBasicMaterial>;
 enabled=false;paintCount=0;
 private readonly canvas:HTMLCanvasElement;private readonly context:CanvasRenderingContext2D;private readonly texture:CanvasTexture;
 private lastPaint=-Infinity;private placed=false;
 private readonly eye=new Vector3();private readonly forward=new Vector3();private readonly right=new Vector3();private readonly up=new Vector3(0,1,0);private readonly rotation=new Quaternion();
 constructor(){this.canvas=document.createElement('canvas');this.canvas.width=1024;this.canvas.height=864;this.context=this.canvas.getContext('2d')!;this.texture=new CanvasTexture(this.canvas);this.texture.colorSpace=SRGBColorSpace;this.mesh=new Mesh(new PlaneGeometry(.62,.523),new MeshBasicMaterial({map:this.texture,toneMapped:false}));this.mesh.name='Optional VR performance metrics';this.mesh.visible=false;}
 start():void{this.placed=false;this.lastPaint=-Infinity;this.mesh.visible=false;}
 stop():void{this.mesh.visible=false;this.mesh.removeFromParent();this.placed=false;}
 setEnabled(value:boolean):void{this.enabled=value;this.lastPaint=-Infinity;this.mesh.visible=value&&this.placed;}
 place(position:{x:number;y:number;z:number},orientation:{x:number;y:number;z:number;w:number}):void{if(this.placed)return;this.placed=true;this.eye.set(position.x,position.y,position.z);this.rotation.set(orientation.x,orientation.y,orientation.z,orientation.w);this.forward.set(0,0,-1).applyQuaternion(this.rotation);this.forward.y=0;if(this.forward.lengthSq()<.001)this.forward.set(0,0,-1);this.forward.normalize();this.right.crossVectors(this.forward,this.up).normalize();this.mesh.position.copy(this.eye).addScaledVector(this.forward,1.1).addScaledVector(this.right,-.74);this.mesh.position.y-=.12;this.mesh.lookAt(this.eye);this.mesh.visible=this.enabled;}
 paint(time:number,data:XRPerformanceSnapshot):void{if(!this.enabled||!this.placed||time-this.lastPaint<500)return;this.lastPaint=time;this.paintCount++;const ctx=this.context;ctx.fillStyle='#202a2f';ctx.fillRect(0,0,1024,864);ctx.fillStyle='#fff';ctx.font='bold 34px sans-serif';ctx.fillText('VR PERFORMANCE / ESTIMATES',28,48);ctx.font='28px monospace';
  const ms=(v:number|null|undefined)=>v==null?'n/a':v.toFixed(2),mib=(v:number|null)=>v===null?'n/a':(v/1048576).toFixed(1);
  const lines=[`${data.fps.toFixed(1)} FPS · avg ${data.averageMs.toFixed(2)} ms`,
   `Frame med ${ms(data.medianMs)} · p95 ${(data.sampleCount??120)>=20?ms(data.p95Ms):'n/a'} · p99 ${ms(data.p99Ms)}`,
   `Latest ${ms(data.latestMs)} · max ${ms(data.maxMs)} ms · n=${data.sampleCount??'?'}`,
   `Spikes recent ${data.recentSpikes??data.spikes} / session ${data.spikes} · CPU ${ms(data.cpuMs)}`,
   `Input/debug ${data.inputMs.toFixed(3)} ms · calls ${data.calls}`,
   `Active ${data.sculpture.activeResolution} · ${data.triangles.toLocaleString()} triangles`];
  if(data.edit){const e=data.edit;lines.push(e.tool==='move'&&e.move?`Move preview ${ms(e.move.milliseconds)} / p95 ${ms(e.move.p95)} ms · ${e.move.vertices} verts`:`Tool ${e.tool} · radius ${e.radius.toFixed(3)} model units`,
   e.tool==='move'&&e.move?`Move commit ${e.move.committing?'working':ms(e.move.commitMs)} ms wall · ${e.move.commitVoxels??0} vox`:`Brush last ${ms(e.brush.latest)} / p95 ${ms(e.brush.p95)} ms`,
   `Remesh last ${ms(e.remesh.latest)} / p95 ${ms(e.remesh.p95)} ms`,
   `XR stroke CPU ${ms(e.xrStroke?.latest)} · components ${ms(e.stroke.latest)} ms`,
   `Dirty chunks ${e.pendingChunks} · replay dabs ${e.replayRemaining}`,
   `Tracked lower bound ${mib(e.memory.trackedBytes)} / peak ${mib(e.memory.trackedHighWaterBytes)} MiB`,
   `JS heap ${mib(e.memory.heapBytes)} / peak ${mib(e.memory.heapHighWaterBytes)} MiB`);if(e.allocation){const a=e.allocation;lines.push(`Volume ${a.dimensions} · ${a.samples} vox / ${a.chunks} chunks`,`Bounds ${a.bounds}`,`Growth ${a.expansions} · last ${ms(a.lastMs)} ms · ${mib(a.storageBytes)} MiB grid`);}}
  ctx.font='25px monospace';lines.forEach((line,i)=>ctx.fillText(line,28,98+i*44,970));ctx.font='22px sans-serif';ctx.fillStyle='#bccbd0';ctx.fillText('CPU samples only; tracked memory excludes transient/GPU/CSG.',28,814);ctx.fillText('Rolling 120 frames / 240 operations; tails need 20 / 100 samples.',28,846);this.texture.needsUpdate=true;}
 dispose():void{this.stop();this.mesh.geometry.dispose();this.mesh.material.dispose();this.texture.dispose();}
}
