import type {IndependentLayers} from './independent-layers';
import type {SculptSettings} from './project';
import type {Bounds,Point3} from './sdf';
import {uniformScale} from './transform';
import {filterClayPath,clayReplay,snapClayPoint} from './clay-path';
import type {PathPoint,ClayPathControls} from './clay-path';
export const CLAY_MESH_CHUNKS=2;
export const CLAY_MESH_BUDGET_MS=3;
/** One existing sparse history transaction. Buffered paths have no source edits until release.
 * Partial replay or live freehand edits can be rolled back without consuming redo. */
export class ClayStrokeSession {
 readonly raw:PathPoint[]=[];preview:readonly PathPoint[]=[];phase:'idle'|'drawing'|'committing'='idle';
 private previousSampleCPU=0;private axis:'free'|'x'|'y'|'z'='free';
 private freeSpace=false;private snap=0;private rollingSamples=false;
 private id='';private settings!:SculptSettings;private steady=0;private straight=false;private radius=1;private started=0;private last=0;private previewTime=-Infinity;
 private pending:Generator<void,Bounds|null>|null=null;private stagedDeformation=false;
 private queue:PathPoint[]=[];private cursor=0;private replayTime=0;
 constructor(private readonly layers:()=>IndependentLayers,private readonly changed:()=>void=()=>{},private readonly stagedMesh=false){}
 setRadius(worldRadius:number):void{if(this.phase==='drawing'&&this.settings.mode!=='smooth'&&Number.isFinite(worldRadius)&&worldRadius>0)this.radius=worldRadius/uniformScale(this.layers().active.layer.transform);}
 /** Include XR meshing/preview work outside sample() when judging the next pose gap. */
 accountFrameCPU(ms:number):void{if(this.phase==='drawing'&&Number.isFinite(ms)&&ms>=0)this.previousSampleCPU=Math.max(this.previousSampleCPU,ms);}
 get localRadius():number{return this.radius;}
 get active():boolean{return this.phase!=='idle';}
 get replayRemaining():number{return (this.phase==='committing'||this.stagedDeformation&&this.phase==='drawing')?Math.max(0,this.queue.length-this.cursor)+(this.pending?1:0):0;}
 get buffered():boolean{return this.steady>0||this.straight;}
 begin(settings:SculptSettings,controls:ClayPathControls,time:number,freeSpace=false,rollingSamples=false):void{
  if(this.active)throw new Error('Finish the current Clay stroke.');
  this.pending=null;this.stagedDeformation=settings.mode==='pinch'||settings.mode==='crease';this.rollingSamples=rollingSamples;
  this.axis=controls.axis;this.snap=controls.snap;this.freeSpace=freeSpace;this.previousSampleCPU=0;
  const layers=this.layers();this.radius=settings.radius/uniformScale(layers.active.layer.transform);
  const smooth=settings.mode==='smooth';filterClayPath([],smooth?0:controls.steady,this.radius,smooth?false:controls.straightLine);layers.beginStroke();this.settings={...settings};this.steady=smooth?0:controls.steady;this.straight=!smooth&&controls.straightLine;this.started=this.last=time;this.id=layers.active.layer.id;this.raw.length=0;this.preview=[];this.previewTime=-Infinity;this.phase='drawing';this.queue=[];this.cursor=0;this.replayTime=0;
 }
 valid():boolean{const layers=this.layers();return layers.project.activeLayerId===this.id&&layers.drawing&&layers.active.layer.editable;}
 projectPoint(point:Point3):Point3{if(this.straight&&this.axis!=='free'&&this.raw.length){const first=this.raw[0];point={x:this.axis==='x'?point.x:first.x,y:this.axis==='y'?point.y:first.y,z:this.axis==='z'?point.z:first.z};}if(this.straight&&this.axis==='free'&&this.raw.length&&this.snap)point=snapClayPoint(this.raw[0],point,this.snap);return point;}
 sample(point:Point3,time:number):void{
  if(this.phase!=='drawing')return;if(!this.valid())throw new Error('Clay target changed.');
  const processingStart=performance.now(),dt=(time-this.last)/1000;
  // Long slow lathe holds keep every source application, but compact only the
  // display trail. Buffered trajectories and staged deformation retain their limits.
  if(this.raw.length>=8192&&this.rollingSamples&&!this.buffered&&!this.stagedDeformation){let write=1;for(let i=2;i<this.raw.length;i+=2)this.raw[write++]=this.raw[i];this.raw.length=write;}
  if(![point.x,point.y,point.z,time].every(Number.isFinite)||dt<0||dt>.15+this.previousSampleCPU/1000||this.raw.length>=8192)throw new Error('Clay tracking/sample budget interrupted.');
  point=this.projectPoint(point);
  const p={...point,t:(time-this.started)/1000,radius:this.radius};this.raw.push(p);this.last=time;
  if(!this.buffered&&this.stagedDeformation){this.queue.push(p);this.pump();}
  else if(!this.buffered)this.layers().applyStrokeLocal(point,this.radius,this.settings.mode,this.settings.strength,dt,this.settings.hardness,this.freeSpace);
  if(this.buffered&&time-this.previewTime>=33){const start=this.layers().metrics.enabled?performance.now():0;this.preview=filterClayPath(this.raw,this.steady,this.radius,this.straight);if(this.layers().metrics.enabled)this.layers().metrics.record('path',performance.now()-start);this.previewTime=time;}
  this.previousSampleCPU=performance.now()-processingStart;
 }
 end():void{
  if(this.phase!=='drawing')return;if(!this.valid())throw new Error('Clay target changed.');
  if(!this.buffered){this.preview=this.raw;if(this.stagedMesh||this.stagedDeformation){this.phase='committing';return;}this.layers().finishStroke();this.phase='idle';this.changed();return;}
  const start=this.layers().metrics.enabled?performance.now():0;this.preview=filterClayPath(this.raw,this.steady,this.radius,this.straight);this.queue=clayReplay(this.preview);if(this.layers().metrics.enabled)this.layers().metrics.record('path',performance.now()-start);this.phase='committing';
 }
 pump(budgetMs=4):boolean{
  if(this.phase!=='committing'&&!(this.phase==='drawing'&&this.stagedDeformation&&!this.buffered))return false;if(!this.valid())throw new Error('Clay target changed during replay.');
  const started=performance.now();let dabs=0;
  while((this.pending||this.cursor<this.queue.length)&&dabs<(this.stagedDeformation?2048:64)&&(dabs===0||performance.now()-started<budgetMs)){
   if(this.stagedDeformation){
    if(!this.pending){const point=this.queue[this.cursor++],dt=point.t-this.replayTime;this.replayTime=point.t;this.pending=this.layers().applyResamplingSteps(this.settings.mode as 'pinch'|'crease',point,point.radius??this.radius,this.settings.strength,dt,this.settings.hardness);}
    const next=this.pending.next();dabs++;if(next.done)this.pending=null;
   }else{
    const point=this.queue[this.cursor++],dt=point.t-this.replayTime;this.layers().applyStrokeLocal(point,point.radius??this.radius,this.settings.mode,this.settings.strength,dt,this.settings.hardness,this.freeSpace);this.replayTime=point.t;dabs++;
   }
  }
  if(this.phase==='drawing')return false;
  if(this.stagedMesh||this.stagedDeformation){this.layers().active.rebuild(CLAY_MESH_CHUNKS,Math.min(CLAY_MESH_BUDGET_MS,Math.max(0,budgetMs-(performance.now()-started))));if(this.layers().active.mesher.pendingChunks)return false;}
  if(!this.pending&&this.cursor===this.queue.length){this.layers().finishStroke();this.phase='idle';this.queue=[];this.changed();return true;}return false;
 }
 cancel():void{this.pending=null;if(this.active)this.layers().cancelStroke();this.phase='idle';this.queue=[];this.raw.length=0;this.preview=[];this.id='';this.changed();}
}
