import type {IndependentLayers} from './independent-layers';
import type {SculptSettings} from './project';
import type {Point3} from './sdf';
import {uniformScale} from './transform';
import {filterClayPath,clayReplay} from './clay-path';
import type {PathPoint,ClayPathControls} from './clay-path';
/** One existing sparse history transaction. Buffered paths have no source edits until release.
 * Partial replay or live freehand edits can be rolled back without consuming redo. */
export class ClayStrokeSession {
 readonly raw:PathPoint[]=[];preview:readonly PathPoint[]=[];phase:'idle'|'drawing'|'committing'='idle';
 private previousSampleCPU=0;private axis:'free'|'x'|'y'|'z'='free';
 private freeSpace=false;
 private id='';private settings!:SculptSettings;private steady=0;private straight=false;private radius=1;private started=0;private last=0;private previewTime=-Infinity;
 private queue:PathPoint[]=[];private cursor=0;private replayTime=0;
 constructor(private readonly layers:()=>IndependentLayers,private readonly changed:()=>void=()=>{}){}
 get localRadius():number{return this.radius;}
 get active():boolean{return this.phase!=='idle';}
 get replayRemaining():number{return this.phase==='committing'?Math.max(0,this.queue.length-this.cursor):0;}
 get buffered():boolean{return this.steady>0||this.straight;}
 begin(settings:SculptSettings,controls:ClayPathControls,time:number,freeSpace=false):void{
  if(this.active)throw new Error('Finish the current Clay stroke.');
  this.axis=controls.axis;this.freeSpace=freeSpace;this.previousSampleCPU=0;
  const layers=this.layers();this.radius=settings.radius/uniformScale(layers.active.layer.transform);
  const smooth=settings.mode==='smooth';filterClayPath([],smooth?0:controls.steady,this.radius,smooth?false:controls.straightLine);layers.beginStroke();this.settings={...settings};this.steady=smooth?0:controls.steady;this.straight=!smooth&&controls.straightLine;this.started=this.last=time;this.id=layers.active.layer.id;this.raw.length=0;this.preview=[];this.previewTime=-Infinity;this.phase='drawing';this.queue=[];this.cursor=0;this.replayTime=0;
 }
 valid():boolean{const layers=this.layers();return layers.project.activeLayerId===this.id&&layers.drawing&&layers.active.layer.editable;}
 projectPoint(point:Point3):Point3{if(this.straight&&this.axis!=='free'&&this.raw.length){const first=this.raw[0];point={x:this.axis==='x'?point.x:first.x,y:this.axis==='y'?point.y:first.y,z:this.axis==='z'?point.z:first.z};}return point;}
 sample(point:Point3,time:number):void{
  if(this.phase!=='drawing')return;if(!this.valid())throw new Error('Clay target changed.');
  const processingStart=performance.now(),dt=(time-this.last)/1000;if(![point.x,point.y,point.z,time].every(Number.isFinite)||dt<0||dt>.15+this.previousSampleCPU/1000||this.raw.length>=8192)throw new Error('Clay tracking/sample budget interrupted.');
  point=this.projectPoint(point);
  const p={...point,t:(time-this.started)/1000};this.raw.push(p);this.last=time;
  if(!this.buffered)this.layers().applyStrokeLocal(point,this.radius,this.settings.mode,this.settings.strength,dt,this.settings.hardness,this.freeSpace);
  if(this.buffered&&time-this.previewTime>=33){const start=this.layers().metrics.enabled?performance.now():0;this.preview=filterClayPath(this.raw,this.steady,this.radius,this.straight);if(this.layers().metrics.enabled)this.layers().metrics.record('path',performance.now()-start);this.previewTime=time;}
  this.previousSampleCPU=performance.now()-processingStart;
 }
 end():void{
  if(this.phase!=='drawing')return;if(!this.valid())throw new Error('Clay target changed.');
  if(!this.buffered){this.preview=this.raw;this.layers().finishStroke();this.phase='idle';this.changed();return;}
  const start=this.layers().metrics.enabled?performance.now():0;this.preview=filterClayPath(this.raw,this.steady,this.radius,this.straight);this.queue=clayReplay(this.preview);if(this.layers().metrics.enabled)this.layers().metrics.record('path',performance.now()-start);this.phase='committing';
 }
 pump(budgetMs=4):boolean{
  if(this.phase!=='committing')return false;if(!this.valid())throw new Error('Clay target changed during replay.');
  const started=performance.now();let dabs=0;
  while(this.cursor<this.queue.length&&dabs<64&&(dabs===0||performance.now()-started<budgetMs)){
   const point=this.queue[this.cursor++],dt=point.t-this.replayTime;this.layers().applyStrokeLocal(point,this.radius,this.settings.mode,this.settings.strength,dt,this.settings.hardness,this.freeSpace);this.replayTime=point.t;dabs++;
  }
  if(this.cursor===this.queue.length){this.layers().finishStroke();this.phase='idle';this.queue=[];this.changed();return true;}return false;
 }
 cancel():void{if(this.active)this.layers().cancelStroke();this.phase='idle';this.queue=[];this.raw.length=0;this.preview=[];this.id='';this.changed();}
}
