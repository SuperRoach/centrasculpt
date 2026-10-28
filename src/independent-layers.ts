import {evaluateTube,validateTube,type TubeSource} from './procedural-tube';
import type {ExportSource} from './export-mesh';
import {reconstructMoveAsync} from './move-worker-client';
import {copyMoveVolume,MoveWork} from './deformation-reconstruction';
import type {MoveProgress} from './deformation-reconstruction';
import {RadialMoveField} from './move-field';
import {volumeSampleCount} from './volume-store';
import {planDenseGrowth,prepareDenseGrowth,DENSE_GROWTH_LIMITS} from './dense-growth';
import type {DenseGrowthLimits} from './dense-growth';
import {prepareShape} from './shape-library';
import {validateShapeDefinition} from './shapes';
import {SculptMetrics} from './sculpt-metrics';
import {applyRenderStyle} from './render-style';
import {prepareStampSteps} from './shape-stamp';
import { Group, Mesh, MeshStandardMaterial } from 'three';
import type { Bounds, BrushMode, Point3 } from './sdf';
import {reflectPoint,validateMirrorPlane} from './sdf';
import type {MirrorPlane} from './sdf';
import { SDFVolume } from './sdf';
import { SdfLayer, validateName, assertIndependentLayerVolumes } from './layers';
import type { SculptProject } from './layers';
import type { VolumeStore } from './volume-store';
import { IncrementalMesher } from './mesh';
import { ChunkSurface, buildExportMesh } from './surface';
import { SculptHistory } from './history';
import { ClayStroke } from './stroke';
import { resampleVolume } from './resolution';
import { toLocal, copyTransform, sameTransform, uniformScale, validateTransformEdit } from './transform';
import type { VolumeTransform } from './transform';
import { LayerDisplayPreferences } from './display-preferences';
import { BooleanComposite } from './compositor';
import type { LayerOperation } from './layers';
import { planBake, sampleBake, validateBakeOptions, checkBakeCancelled, yieldBake } from './bake';
import type { BakeOptions, BakeProgress, BakeStats, SurfaceView } from './bake';
import { MAX_PROJECT_LAYERS, MAX_PROJECT_VOXELS, MAX_PROJECT_TRIANGLES } from './project';

export class LayerRuntime {
  mesher: IncrementalMesher;
  surface: ChunkSurface;
  readonly history: SculptHistory;
  readonly material: MeshStandardMaterial;
  metrics?:SculptMetrics;
  expansions=0;lastExpansionMs=0;
  triangles=0;
  lastMeshMs=0;
  lastChanged=0;
  totalChunks=0;
  brushMs=0;
  brushTotal=0;
  brushFrames=0;
  constructor(readonly layer: SdfLayer,neutral: MeshStandardMaterial,public volume=layer.volume,deferMesh=false) {
    this.material=neutral.clone();this.surface=new ChunkSurface(this.material);
    this.surface.group.userData.layerId=layer.id;
    this.mesher=new IncrementalMesher(volume);
    this.history=new SculptHistory(volume,32*1024*1024,100,layer.id,()=>layer.editable);
    try{if(!deferMesh)this.rebuild();}catch(error){this.mesher.dispose();this.material.dispose();throw error;}
  }
  rebuild(maxChunks=Infinity,maxMilliseconds=Infinity): boolean {
    const measured=!!this.metrics?.enabled,start=measured?performance.now():0;
    const update=this.mesher.rebuildChunks(maxChunks,maxMilliseconds);if(!update)return false;
    this.surface.update(update.updates);this.triangles=update.triangles;
    this.lastMeshMs=update.stats.milliseconds;this.lastChanged=update.stats.chunks;this.totalChunks=update.stats.totalChunks;if(measured)this.metrics!.record('remesh',performance.now()-start);return true;
  }
  dispose(): void {this.mesher.dispose();this.material.dispose();this.surface.clear();}
}
export type MoveCommitStats={backend:'worker'|'cooperative';waitMs:number;slicePercentiles:{p50:number;p95:number;p99:number};wallMs:number;cpuMs:number;meshingMs:number;changedVoxels:number;sampled:number;indexBytes:number;patchBytes:number;estimatedPeakBytes:number;maxSliceMs:number;dirtyChunks:number;grew:boolean;slices:number};
type BakeState={ids:string[];orders:Record<string,number>;visibility:Record<string,boolean>;activeId:string;view:SurfaceView};
type BakeEntry={kind:'bake';layerId:string;runtime:LayerRuntime;before:BakeState;after:BakeState;index:number};
type TubeEntry={kind:'tube';layerId:string;before:{source:TubeSource;volume:VolumeStore};after:{source:TubeSource;volume:VolumeStore}};
type TimelineEntry=TubeEntry|BakeEntry|{kind:'voxels';layerId:string}|{kind:'transform';layerId:string;before:VolumeTransform;after:VolumeTransform}|{kind:'operation';layerId:string;before:LayerOperation;after:LayerOperation}|{kind:'order';layerId:string;before:string[];after:string[]};

/** Owns one independent rendering/editing runtime per layer. The derived compositor only reads these independent sources. */
export class IndependentLayers {
  readonly metrics=new SculptMetrics();
  readonly group=new Group();
  readonly composite:BooleanComposite;
  readonly neutral=new MeshStandardMaterial({color:'#afbd94',roughness:0.68,metalness:0.03});
  readonly compositeMaterial=this.neutral.clone();
  private readonly runtimes=new Map<string,LayerRuntime>();
  viewMode:SurfaceView='separate';
  lastBakeStats:BakeStats|null=null;
  lastStampStats:{evaluationMs:number;meshingMs:number;totalMs:number;changedVoxels:number;scanned:number;evaluated:number;chunks:number;totalChunks:number}|null=null;
  private previewOwner:object|null=null;
  get previewing():boolean{return this.previewOwner!==null;}
  beginPreview(owner:object):void{this.assertAvailable();if(this.drawing||this.transforming)throw new Error('Finish the current edit first.');this.previewOwner=owner;}
  endPreview(owner:object):void{if(this.previewOwner===owner)this.previewOwner=null;}
  private tubePending=false;private tubeStagingBytes=0;
  get generatingTube():boolean{return this.tubePending;}
  private baking=false;
  private movePending=false;private moveStagingBytes=0;
  get bakingLayer():boolean{return this.baking;}
  get deforming():boolean{return this.movePending;}
  lastMoveStats:MoveCommitStats|null=null;
  private disposed=false;
  private committedRevision=0;
  backgroundBytes=0;interruptBackground:()=>void=()=>{};
  private past: TimelineEntry[]=[];
  private future: TimelineEntry[]=[];
  private transformSession:{layerId:string;before:VolumeTransform}|null=null;
  growthLimits:Partial<DenseGrowthLimits>={};
  readonly symmetry:MirrorPlane={enabled:false,axis:'x',offset:0};
  private strokeMirror:MirrorPlane={enabled:false,axis:'x',offset:0};
  private strokePoint:Point3|null=null;
  private strokeLayer: string|null=null;
  private readonly stroke=new ClayStroke();
  constructor(readonly project: SculptProject,readonly display=new LayerDisplayPreferences()) {
    this.composite=new BooleanComposite(project,this.compositeMaterial,192,this.neutral);
    this.assertCapacity();assertIndependentLayerVolumes(project.layerStack.layers);
    if(project.displayPreferences)this.display.restore(project.id,project.layerStack.layers,project.displayPreferences);
    try {for(const layer of project.layerStack.layers)this.install(new LayerRuntime(layer,this.neutral));this.syncPresentation();}
    catch(error){this.dispose();throw error;}
  }
  /** Lower bound: current source grids+scratch, source geometry and retained payloads.
   * Includes retained Bake runtimes; excludes pending Maps, derived CSG and JS/GPU overhead. */
  get recoveryReady():boolean{return !this.tubePending&&!this.disposed&&!this.drawing&&!this.transforming&&!this.previewing&&!this.deforming&&!this.baking&&!this.pendingChunks;}
  recoveryKey():string{return JSON.stringify([this.project.id,this.committedRevision,this.project.activeLayerId,this.project.layerStack.layers.map(l=>[l.metadata(),l.volume.dimensions,l.volume.latticeMin])]);}
  resourceStats(){let voxelBytes=0,geometryBytes=0,historyBytes=0,pendingHistoryBytes=0,chunks=0,meshChunks=0,vertices=0,triangles=0;const held=new Set(this.runtimes.values());for(const entry of [...this.past,...this.future])if(entry.kind==='bake')held.add(entry.runtime);for(const r of held){voxelBytes+=volumeSampleCount(r.volume)*8;historyBytes+=r.history.memoryBytes;pendingHistoryBytes+=r.history.pendingMemoryEstimate;geometryBytes+=r.mesher.ownedGeometryBytes;chunks+=r.mesher.allocatedChunks;for(const mesh of r.surface.group.children){const count=(mesh as Mesh).geometry?.getAttribute('position').count??0;vertices+=count;triangles+=count/3;if(count)meshChunks++;}}return {voxelBytes,geometryBytes,historyBytes,pendingHistoryBytes,chunks,meshChunks,vertices,triangles,retainedRuntimes:held.size,pendingTubeJobs:Number(this.tubePending),tubeStagingBytes:this.tubeStagingBytes,pendingMoveJobs:Number(this.deforming),pendingBakeJobs:Number(this.baking),backgroundBytes:this.backgroundBytes,compositeBytes:this.composite.trackedBytes};}
  get trackedBytes():number{let bytes=0;const held=new Set(this.runtimes.values());for(const entry of [...this.past,...this.future])if(entry.kind==='bake')held.add(entry.runtime);for(const r of held){bytes+=volumeSampleCount(r.volume)*8+r.history.memoryBytes;for(const mesh of r.surface.group.children){const geometry=(mesh as import('three').Mesh).geometry;if(geometry){for(const attr of Object.values(geometry.attributes))bytes+=attr.array.byteLength;if(geometry.index)bytes+=geometry.index.array.byteLength;}}}const caches=new Set<VolumeStore>();for(const e of [...this.past,...this.future])if(e.kind==='tube'){caches.add(e.before.volume);caches.add(e.after.volume);}for(const v of caches)if(![...held].some(r=>r.volume===v))bytes+=volumeSampleCount(v)*8;return bytes+this.tubeStagingBytes+this.moveStagingBytes+this.backgroundBytes;}
  get pendingChunks():number{let count=0;for(const r of this.runtimes.values())count+=r.mesher.pendingChunks;return count;}
  get active(): LayerRuntime {return this.runtime(this.project.activeLayerId);}
  runtime(id: string): LayerRuntime {const runtime=this.runtimes.get(id);if(!runtime)throw new Error('Layer runtime does not exist.');return runtime;}
  get undoCount(): number {return this.past.length;}
  get redoCount(): number {return this.future.length;}
  get transforming():boolean {return this.transformSession!==null;}
  get drawing(): boolean {return this.strokeLayer!==null;}
  private assertAvailable():void {this.interruptBackground();if(this.tubePending)throw new Error('Wait for tube regeneration or cancel it.');if(this.disposed)throw new Error('Project is closed.');if(this.previewOwner)throw new Error('Finish the Move preview first.');if(this.movePending)throw new Error('Wait for Move reconstruction to finish or cancel it.');if(this.baking)throw new Error('Wait for Bake to finish or cancel it.');}
  private editableRuntime(id: string): LayerRuntime {
    this.assertAvailable();
    assertIndependentLayerVolumes(this.project.layerStack.layers);
    const runtime=this.runtime(id);
    if(runtime.volume!==runtime.layer.volume)throw new Error('Volume replaced outside the layer resolution command. Keep meshing and history bound to the original layer store.');
    runtime.layer.assertEditable();return runtime;
  }
  private install(runtime: LayerRuntime): void {runtime.metrics=this.metrics;this.runtimes.set(runtime.layer.id,runtime);this.group.add(runtime.surface.group);}
  private assertCapacity(additional=0,replacing?:string,extraLayers=0,reactivating?:string): void {
    const layers=this.project.layerStack.layers;
    const held=new Set<LayerRuntime>();for(const entry of this.future)if(entry.kind==='bake'&&!this.runtimes.has(entry.layerId)&&entry.layerId!==reactivating)held.add(entry.runtime);
    const samples=layers.reduce((sum,layer)=>sum+(layer.id===replacing?0:volumeSampleCount(layer.volume)),0)+additional+[...held].reduce((sum,r)=>sum+volumeSampleCount(r.volume),0);
    if(layers.length+extraLayers>MAX_PROJECT_LAYERS)throw new Error('Maximum of 8 independent layers reached.');
    if(samples>MAX_PROJECT_VOXELS)throw new Error('Project voxel budget exceeded. Explicitly reduce a layer resolution or delete a layer; existing layers were kept.');
  }
  syncPresentation(): void {
    applyRenderStyle(this.compositeMaterial,this.display.renderStyle);
    this.compositeMaterial.color.copy(this.neutral.color);
    for(const layer of this.project.layerStack.layers) {
      const runtime=this.runtime(layer.id),group=runtime.surface.group;
      group.name=layer.name;group.visible=layer.visible;group.position.fromArray(layer.transform.position);
      group.rotation.set(...layer.transform.rotation,'XYZ');group.scale.fromArray(layer.transform.scale);group.renderOrder=layer.order;
      runtime.material.color.set(this.display.mode==='clay'?this.neutral.color:this.display.colour(this.project.id,layer.id,layer.order));
      applyRenderStyle(runtime.material,this.display.renderStyle);
      // A viewport-only depth tie-break for exactly coincident surfaces. Never moves geometry or voxels.
      runtime.material.polygonOffset=true;runtime.material.polygonOffsetFactor=-(layer.order+1)*0.1;runtime.material.polygonOffsetUnits=-(layer.order+1)*0.1;
      this.display.colour(this.project.id,layer.id,layer.order);
      group.updateWorldMatrix(true,true);
    }
  }
  /** Preallocate every throwing stage, then publish store/history/mesh together.
   * Undo and cancellation retain harmless capacity but replay exact voxel values. */
  private growRuntime(runtime:LayerRuntime,footprint:import('./volume-store').VolumeBounds):boolean{
    if(!(runtime.volume instanceof SDFVolume))throw new Error('Automatic growth requires a dense source.');
    const expansionStart=performance.now(),source=runtime.volume,options={...this.growthLimits},plan=planDenseGrowth(source,footprint,options);if(!plan)return false;
    this.assertCapacity(plan.samples,runtime.layer.id);
    const otherTracked=this.trackedBytes-volumeSampleCount(source)*8,remapEstimate=runtime.history.memoryBytes/3+runtime.history.pendingMemoryEstimate*1.5;
    if(plan.transientStorageBytes+otherTracked+remapEstimate>(options.maxTransientBytes??DENSE_GROWTH_LIMITS.maxTransientBytes))throw new Error('Volume growth exceeds the storage and history safety estimate. Existing sculpture kept.');
    const result=prepareDenseGrowth(source,footprint,options),next=result.volume;
    const publishHistory=runtime.history.prepareVolumeRebind(next),publishMesh=runtime.mesher.prepareRebindVolume(next);
    publishMesh();publishHistory();runtime.volume=runtime.layer.volume=next;runtime.totalChunks=runtime.mesher.allocatedChunks;runtime.history.pendingBudgetBytes=Math.max(0,(options.maxTransientBytes??DENSE_GROWTH_LIMITS.maxTransientBytes)-this.trackedBytes);runtime.expansions++;runtime.lastExpansionMs=performance.now()-expansionStart;this.composite.invalidateLayer(runtime.layer);return true;
  }
  private assertSculptable(layer:SdfLayer):void{if(layer.procedural)throw new Error('Bake the procedural tube to a sculpt layer before brushing.');}
  select(id: string): void {this.assertAvailable();this.finishStroke();this.finishTransform();this.project.layerStack.select(id);}
  beginStroke(): void {
    validateMirrorPlane(this.symmetry);
    if(this.transformSession)throw new Error('Finish the transform before sculpting.');
    if(this.strokeLayer)throw new Error('Finish the current stroke first.');
    const runtime=this.editableRuntime(this.project.activeLayerId);this.assertSculptable(runtime.layer);uniformScale(runtime.layer.transform);runtime.history.pendingBudgetBytes=Math.max(0,(this.growthLimits.maxTransientBytes??DENSE_GROWTH_LIMITS.maxTransientBytes)-this.trackedBytes);runtime.history.begin();this.strokeLayer=runtime.layer.id;this.strokeMirror={...this.symmetry};this.stroke.reset();this.strokePoint=null;this.metrics.beginStroke();
  }
  applyStroke(worldPoint: Point3,radius: number,mode: BrushMode,strength: number,dt: number,hardness: number): Bounds|null {
    if(!this.strokeLayer)return null;const layer=this.runtime(this.strokeLayer).layer;return this.applyStrokeLocal(toLocal(worldPoint,layer.transform),radius/uniformScale(layer.transform),mode,strength,dt,hardness);
  }
  /** Trusted trajectory input is already layer-local; workspace presentation never enters source metadata. */
  applyStrokeLocal(point:Point3,radius:number,mode:BrushMode,strength:number,dt:number,hardness:number,freeSpace=false):Bounds|null {
    if(!this.strokeLayer)return null;
    const runtime=this.editableRuntime(this.strokeLayer);
    if(![point.x,point.y,point.z,radius,strength,dt,hardness].every(Number.isFinite)||radius<=0||strength<=0||dt<=0)return null;
    const start=performance.now();
    if(mode==='add'&&Number.isFinite(radius)&&radius>0&&[point.x,point.y,point.z].every(Number.isFinite)){
      const previous=this.strokePoint??point,now=[point.x,point.y,point.z],before=[previous.x,previous.y,previous.z];
      const points=[point,previous];if(this.strokeMirror.enabled)points.push(reflectPoint(point,this.strokeMirror),reflectPoint(previous,this.strokeMirror));
      for(let a=0;a<3;a++){now[a]=Math.max(...points.map(p=>[p.x,p.y,p.z][a]));before[a]=Math.min(...points.map(p=>[p.x,p.y,p.z][a]));}
      this.growRuntime(runtime,{min:now.map((v,a)=>Math.min(v,before[a])-radius) as [number,number,number],max:now.map((v,a)=>Math.max(v,before[a])+radius) as [number,number,number]});
    }
    const dirty=this.stroke.apply(runtime.layer.volume,point,radius,mode,strength,dt,runtime.history.record,hardness,bounds=>runtime.mesher.invalidate(bounds),freeSpace,this.strokeMirror);
    this.strokePoint={...point};this.composite.invalidateLayer(runtime.layer,dirty);
    runtime.brushMs=performance.now()-start;runtime.brushTotal+=runtime.brushMs;runtime.brushFrames++;this.metrics.record('brush',runtime.brushMs);return dirty;
  }
  /** Preserve the Pinch entry point for existing clients/tests. */
  *applyPinchSteps(point:Point3,radius:number,strength:number,dt:number,hardness:number):Generator<void,Bounds|null>{return yield* this.applyResamplingSteps('pinch',point,radius,strength,dt,hardness);}
  /** Cooperatively evaluate/publish Pinch/Crease against the same captured history owner. */
  *applyResamplingSteps(mode:'pinch'|'crease',point:Point3,radius:number,strength:number,dt:number,hardness:number):Generator<void,Bounds|null>{
    if(!this.strokeLayer)return null;
    const runtime=this.editableRuntime(this.strokeLayer);
    const work=this.stroke.applySteps(runtime.volume,point,radius,mode,strength,dt,runtime.history.record,hardness,b=>runtime.mesher.invalidate(b),false,this.strokeMirror);
    let step:IteratorResult<void,Bounds|null>,cpu=0;
    do{const start=performance.now();step=work.next();cpu+=performance.now()-start;if(!step.done)yield;}while(!step.done);
    const dirty=step.value;this.strokePoint={...point};this.composite.invalidateLayer(runtime.layer,dirty);
    // Completed input-sample CPU only: exclude time suspended between frames.
    runtime.brushMs=cpu;runtime.brushTotal+=cpu;runtime.brushFrames++;this.metrics.record('brush',cpu);return dirty;
  }
  breakStrokePath(): void {this.stroke.reset();this.strokePoint=null;}
  finishStroke(): void {
    if(!this.strokeLayer)return;
    const runtime=this.runtime(this.strokeLayer),started=this.metrics.enabled?performance.now():0;
    let committed=false;try{committed=runtime.history.commit();}catch(error){this.cancelStroke();throw error;}
    this.strokeLayer=null;this.stroke.reset();this.strokePoint=null;if(committed)this.recordCommit(runtime.layer.id);
    const overhead=this.metrics.enabled?performance.now()-started:0;runtime.rebuild();this.metrics.endStroke(overhead);
  }
  cancelStroke():void {
    if(!this.strokeLayer)return;const runtime=this.runtime(this.strokeLayer),started=this.metrics.enabled?performance.now():0;this.strokeLayer=null;this.stroke.reset();this.strokePoint=null;
    const dirty=runtime.history.cancel((index,before,after)=>runtime.mesher.invalidateSample(index,(before<0)!==(after<0)));this.composite.invalidateLayer(runtime.layer,dirty);const overhead=this.metrics.enabled?performance.now()-started:0;runtime.rebuild();this.metrics.endStroke(overhead);
  }
  private recordCommit(id: string): void {this.committedRevision++;
    this.discardFuture();
    this.past.push({kind:'voxels',layerId:id});
    // Sparse history can evict old payloads. Drop matching timeline entries from the oldest end.
    let excess=this.past.filter(entry=>entry.kind==='voxels'&&entry.layerId===id).length-this.runtime(id).history.undoCount;
    this.past=this.past.filter(entry=>{if(entry.kind==='voxels'&&entry.layerId===id&&excess>0){excess--;return false;}return true;});
  }
  beginTransform():void {
    this.finishStroke();if(this.transformSession)throw new Error('A transform is already active.');
    const runtime=this.editableRuntime(this.project.activeLayerId);
    this.transformSession={layerId:runtime.layer.id,before:copyTransform(runtime.layer.transform)};
  }
  updateTransform(value:unknown):void {
    if(!this.transformSession)throw new Error('No transform transaction is active.');
    const runtime=this.editableRuntime(this.transformSession.layerId);
    runtime.layer.transform=validateTransformEdit(value,this.transformSession.before);this.syncLayerPose(runtime.layer.id);
  }
  finishTransform():boolean {
    const session=this.transformSession;if(!session)return false;this.transformSession=null;
    const after=copyTransform(this.project.layerStack.get(session.layerId).transform);
    if(sameTransform(session.before,after))return false;
    this.discardFuture();
    this.past.push({kind:'transform',layerId:session.layerId,before:session.before,after});
    let excess=this.past.filter(entry=>entry.kind==='transform'&&entry.layerId===session.layerId).length-100;
    this.past=this.past.filter(entry=>{if(entry.kind==='transform'&&entry.layerId===session.layerId&&excess>0){excess--;return false;}return true;});return true;
  }
  cancelTransform():void {
    const session=this.transformSession;if(!session)return;this.transformSession=null;
    this.project.layerStack.get(session.layerId).transform=copyTransform(session.before);this.syncLayerPose(session.layerId);
  }
  setActiveTransform(value:unknown):boolean {this.beginTransform();try{this.updateTransform(value);return this.finishTransform();}catch(error){this.cancelTransform();throw error;}}
  private syncLayerPose(id:string):void {
    const runtime=this.runtime(id),t=runtime.layer.transform,group=runtime.surface.group;
    group.position.fromArray(t.position);group.rotation.set(...t.rotation,'XYZ');group.scale.fromArray(t.scale);group.updateWorldMatrix(true,true);
  }
  undo(redo=false): string|null {
    this.assertAvailable();this.finishStroke();this.finishTransform();const from=redo?this.future:this.past,to=redo?this.past:this.future,entry=from.at(-1);if(!entry)return null;
    if(entry.kind==='bake'){this.replayBake(entry,redo);this.committedRevision++;from.pop();to.push(entry);return this.project.activeLayerId;}
    const layer=this.project.layerStack.get(entry.layerId);
    if(entry.kind==='tube'){layer.assertEditable();const state=redo?entry.after:entry.before,old=this.runtime(layer.id),next=new LayerRuntime(layer,this.neutral,state.volume);layer.volume=state.volume;layer.procedural=validateTube(state.source);this.group.remove(old.surface.group);old.dispose();this.install(next);for(const e of [...this.past,...this.future])if(e.kind==='bake'&&e.layerId===layer.id)e.runtime=next;this.composite.invalidate();}
    else if(entry.kind==='order')this.restoreOrder(redo?entry.after:entry.before);
    else if(entry.kind==='operation') {if(layer.locked)throw new Error('Unlock the layer to change its operation.');layer.operation=redo?entry.after:entry.before;}
    else {
      const runtime=this.editableRuntime(entry.layerId);
      if(entry.kind==='transform') {runtime.layer.transform=copyTransform(redo?entry.after:entry.before);this.syncLayerPose(entry.layerId);}
      else {const record=(index:number,before:number,after:number)=>runtime.mesher.invalidateSample(index,(before<0)!==(after<0));const dirty=redo?runtime.history.redo(record):runtime.history.undo(record);if(!dirty)throw new Error('History payload unavailable.');runtime.rebuild();this.composite.invalidateLayer(layer,dirty);}
    }
    this.syncPresentation();
    from.pop();to.push(entry);this.committedRevision++;this.project.layerStack.select(entry.layerId);return entry.layerId;
  }
  /** One explicit command, one sparse layer-bound action. Preparation is read-only. */
  stampShape(value:unknown,inStroke=false):boolean {const work=this.stampShapeSteps(value,inStroke);let step=work.next();while(!step.done)step=work.next();return step.value;}
  *stampShapeSteps(value:unknown,inStroke=false,deferMesh=false):Generator<void,boolean> {
    validateMirrorPlane(this.symmetry);
    this.assertAvailable();if(!inStroke)this.finishStroke();this.finishTransform();
    if(inStroke&&this.strokeLayer!==this.project.activeLayerId)throw new Error('Stamp stroke target changed.');
    const runtime=this.editableRuntime(this.project.activeLayerId);this.assertSculptable(runtime.layer);const start=performance.now(),definition=validateShapeDefinition(value);
    if(definition.targetLayerId!==runtime.layer.id)throw new Error('Stamp must target the active layer.');
    if(definition.operation==='add'){const box=prepareShape(definition).worldBounds;if(this.symmetry.enabled){const a='xyz'.indexOf(this.symmetry.axis),lo=box.min[a],hi=box.max[a];box.min[a]=Math.min(lo,2*this.symmetry.offset-hi);box.max[a]=Math.max(hi,2*this.symmetry.offset-lo);}this.growRuntime(runtime,box);}
    const remaining=(this.growthLimits.maxTransientBytes??DENSE_GROWTH_LIMITS.maxTransientBytes)-this.trackedBytes-runtime.history.pendingMemoryEstimate;
    const patch=yield* prepareStampSteps(runtime.layer,definition,Math.max(0,Math.floor(remaining)),inStroke?this.strokeMirror:this.symmetry);
    if(!patch.indices.length){this.lastStampStats={evaluationMs:patch.evaluationMs,scanned:patch.scanned,evaluated:patch.evaluated,meshingMs:0,totalMs:performance.now()-start,changedVoxels:0,chunks:0,totalChunks:runtime.totalChunks};return false;}
    // Allocate the exact history snapshots before source mutation; preparation owns
    // the patch, so no Map-based stroke recorder is needed for these unique indices.
    const committed=inStroke?false:runtime.history.commitPatch('shape-stamp',patch),hadSurface=runtime.triangles>0;
    if(inStroke)yield* runtime.history.recordStampPatchSteps(patch);
    const invalidate=runtime.mesher.stampInvalidator();
    for(let i=0;i<patch.indices.length;i++){
      if(inStroke&&i&&i%4096===0)yield;
      runtime.volume.writeVoxel(patch.indices[i],patch.after[i]);
      const signChanged=(patch.before[i]<0)!==(patch.after[i]<0);
      if(hadSurface||signChanged)invalidate(patch.indices[i],signChanged);
    }
    if(committed)this.recordCommit(runtime.layer.id);
    this.composite.invalidateLayer(runtime.layer,patch.bounds);
    const meshStart=performance.now();let rebuilt=false,chunks=0;
    if(inStroke&&!deferMesh){while(runtime.rebuild(1,3)){rebuilt=true;chunks+=runtime.lastChanged;yield;}runtime.lastChanged=chunks;}
    else if(!deferMesh)rebuilt=runtime.rebuild();
    this.lastStampStats={evaluationMs:patch.evaluationMs,meshingMs:performance.now()-meshStart,totalMs:performance.now()-start,changedVoxels:patch.indices.length,scanned:patch.scanned,evaluated:patch.evaluated,chunks:rebuilt?runtime.lastChanged:0,totalChunks:runtime.totalChunks};
    return true;
  }
  resetActive(): void {this.assertAvailable();
    this.finishStroke();this.finishTransform();const runtime=this.editableRuntime(this.project.activeLayerId);this.assertSculptable(runtime.layer);runtime.history.pendingBudgetBytes=Math.max(0,(this.growthLimits.maxTransientBytes??DENSE_GROWTH_LIMITS.maxTransientBytes)-this.trackedBytes);runtime.history.begin('reset');
    try{runtime.layer.volume.reset(runtime.history.record);if(runtime.history.commit())this.recordCommit(runtime.layer.id);}catch(error){runtime.history.cancel();runtime.mesher.invalidate();runtime.rebuild();this.composite.invalidateLayer(runtime.layer);throw error;}
    runtime.mesher.invalidate();runtime.rebuild();this.composite.invalidateLayer(runtime.layer);
  }
  private uniqueName(base: string): string {
    const names=new Set(this.project.layerStack.layers.map(l=>l.name));let result=base.slice(0,128),suffix=2;
    while(names.has(result)){const ending=` ${suffix++}`;result=base.slice(0,128-ending.length)+ending;}return result;
  }
  create(resolution=64,empty=false): SdfLayer {this.assertAvailable();
    this.finishStroke();this.finishTransform();if(![64,128,192].includes(resolution))throw new Error('Choose 64³, 128³ or 192³.');
    this.assertCapacity(resolution**3,undefined,1);
    const volume=new SDFVolume(resolution,1.6,!empty);if(empty)volume.values.fill(volume.extent*4);
    const layer=new SdfLayer(volume,{name:this.uniqueName(`Layer ${this.project.layerStack.layers.length+1}`),order:this.project.layerStack.layers.length});
    const runtime=new LayerRuntime(layer,this.neutral);this.project.layerStack.insert(layer);this.install(runtime);this.syncPresentation();return layer;
  }
  duplicate(id: string): SdfLayer {this.assertAvailable();
    this.finishStroke();this.finishTransform();const source=this.project.layerStack.get(id),n=source.volume.resolution;this.assertCapacity(volumeSampleCount(source.volume),undefined,1);
    const volume=new SDFVolume(n,source.volume.extent,false,{dimensions:source.volume.dimensions,latticeMin:source.volume.latticeMin??[0,0,0]}),dense=source.volume.getDenseView();
    volume.values.set(dense??source.volume.readRegion({min:[0,0,0],max:source.volume.dimensions.map(n=>n-1) as [number,number,number]}).values);
    const {id:unused,...metadata}=source.metadata();void unused;
    const layer=new SdfLayer(volume,{...metadata,name:this.uniqueName(`${source.name.slice(0,123)} copy`)}),runtime=new LayerRuntime(layer,this.neutral);
    const index=this.project.layerStack.layers.findIndex(l=>l.id===id);this.project.layerStack.insert(layer,index+1);this.install(runtime);this.syncPresentation();return layer;
  }
  remove(id: string): void {this.assertAvailable();
    this.finishStroke();this.finishTransform();const runtime=this.runtime(id);this.project.layerStack.remove(id);this.group.remove(runtime.surface.group);runtime.dispose();this.runtimes.delete(id);
    this.past=this.past.filter(entry=>entry.layerId!==id);this.future=this.future.filter(entry=>entry.layerId!==id);this.display.remove(this.project.id,id);this.syncPresentation();
  }
  rename(id: string,name: string): void {this.assertAvailable();this.finishStroke();this.finishTransform();this.project.layerStack.get(id).name=validateName(name.trim());this.syncPresentation();}
  move(id: string,delta: number): void {this.assertAvailable();
    this.finishStroke();this.finishTransform();const stack=this.project.layerStack,index=stack.layers.findIndex(l=>l.id===id),before=stack.layers.map(l=>l.id);stack.move(id,index+delta);
    const after=stack.layers.map(l=>l.id);if(before.join()!==after.join())this.recordMetadata({kind:'order',layerId:id,before,after});this.syncPresentation();
  }
  private restoreOrder(ids:string[]):void {
    const stack=this.project.layerStack,existing=new Set(stack.layers.map(l=>l.id));
    const ordered=[...ids.filter(id=>existing.has(id)),...stack.layers.map(l=>l.id).filter(id=>!ids.includes(id))];
    ordered.forEach((id,index)=>stack.move(id,index));
  }
  private recordMetadata(entry:Extract<TimelineEntry,{kind:'operation'|'order'}>):void {
    this.discardFuture();this.past.push(entry);
    let excess=this.past.filter(e=>(e.kind==='operation'||e.kind==='order')&&e.layerId===entry.layerId).length-100;
    this.past=this.past.filter(e=>{if((e.kind==='operation'||e.kind==='order')&&e.layerId===entry.layerId&&excess>0){excess--;return false;}return true;});
  }
  setOperation(id:string,operation:LayerOperation):void {this.assertAvailable();
    this.finishStroke();this.finishTransform();const layer=this.project.layerStack.get(id);
    if(layer.locked)throw new Error('Unlock the layer to change its operation.');
    if(!['union','difference','intersect'].includes(operation))throw new Error('Invalid Boolean operation.');
    if(layer.operation===operation)return;const before=layer.operation;layer.operation=operation;
    this.recordMetadata({kind:'operation',layerId:id,before,after:operation});
  }
  setFlag(id: string,flag:'visible'|'locked',value: boolean): void {this.assertAvailable();this.finishStroke();this.finishTransform();this.project.layerStack.get(id)[flag]=value;this.syncPresentation();}
  resampleActive(resolution: number): void {this.assertAvailable();
    this.finishStroke();this.finishTransform();const runtime=this.editableRuntime(this.project.activeLayerId);this.assertSculptable(runtime.layer);
    if(![64,128,192].includes(resolution))throw new Error('Choose 64³, 128³ or 192³.');
    if(resolution===runtime.layer.volume.resolution)return;
    this.assertCapacity(resolution**3,runtime.layer.id);
    const volume=resampleVolume(runtime.layer.volume,resolution);this.replaceVolume(runtime,volume);
  }
  private replaceVolume(previous: LayerRuntime,volume: VolumeStore): void {
    // Prepare separately, then retain the original SdfLayer identity/metadata on commit.
    const next=new LayerRuntime(previous.layer,this.neutral,volume);
    this.committedRevision++;previous.layer.volume=volume;
    this.group.remove(previous.surface.group);previous.dispose();this.install(next);
    for(const entry of [...this.past,...this.future])if(entry.kind==='bake'&&entry.layerId===previous.layer.id)entry.runtime=next;
    this.past=this.past.filter(entry=>entry.layerId!==previous.layer.id||entry.kind!=='voxels');this.future=this.future.filter(entry=>entry.layerId!==previous.layer.id||entry.kind!=='voxels');this.syncPresentation();
  }
  private discardFuture():void {
    for(const entry of this.future)if(entry.kind==='bake'&&!this.runtimes.has(entry.layerId)){entry.runtime.dispose();this.display.remove(this.project.id,entry.layerId);}
    this.future=[];for(const runtime of this.runtimes.values())runtime.history.discardRedo();
  }
  private bakeState():BakeState {return {ids:this.project.layerStack.layers.map(l=>l.id),orders:Object.fromEntries(this.project.layerStack.layers.map(l=>[l.id,l.order])),visibility:Object.fromEntries(this.project.layerStack.layers.map(l=>[l.id,l.visible])),activeId:this.project.activeLayerId,view:this.viewMode};}
  private restoreBakeState(state:BakeState):void {
    const stack=this.project.layerStack;
    for(const layer of stack.layers)if(layer.id in state.visibility)layer.visible=state.visibility[layer.id];
    this.restoreOrder(state.ids);if(stack.layers.length===state.ids.length&&stack.layers.every(l=>l.id in state.orders))for(const layer of stack.layers)layer.order=state.orders[layer.id];
    stack.select(stack.layers.some(l=>l.id===state.activeId)?state.activeId:stack.layers[0].id);this.viewMode=state.view;
    this.syncPresentation();this.composite.invalidate();
  }
  private replayBake(entry:BakeEntry,redo:boolean):void {
    const stack=this.project.layerStack;
    if(redo){
      this.assertCapacity(volumeSampleCount(entry.runtime.volume),undefined,1,entry.layerId);
      stack.insert(entry.runtime.layer,Math.min(entry.index,stack.layers.length));this.install(entry.runtime);this.restoreBakeState(entry.after);
    }else{
      if(stack.layers.length===1)throw new Error('Cannot undo Bake after all original layers were deleted. Keep at least one other layer.');
      entry.runtime=this.runtime(entry.layerId);entry.after.visibility[entry.layerId]=entry.runtime.layer.visible;stack.remove(entry.layerId);this.group.remove(entry.runtime.surface.group);this.runtimes.delete(entry.layerId);this.restoreBakeState(entry.before);
    }
  }
  bakePlan(resolution:number,sourceIds?:string[]){this.assertAvailable();this.assertCapacity(resolution**3,undefined,1);return planBake(this.project,resolution,sourceIds);}
  async bake(options:BakeOptions,signal?:AbortSignal,progress?:(p:BakeProgress)=>void):Promise<SdfLayer> {
    if(options.sourceIds?.length===1&&this.project.layerStack.get(options.sourceIds[0]).procedural)return this.bakeTube(options,signal);
    this.assertAvailable();const validated=validateBakeOptions(options),plan=this.bakePlan(validated.resolution,validated.sourceIds);
    this.finishStroke();this.finishTransform();
    const triangleBudget=MAX_PROJECT_TRIANGLES-[...this.runtimes.values()].reduce((sum,r)=>sum+r.triangles,0);
    if(triangleBudget<=0)throw new Error('Bake would exceed the native project triangle budget, including hidden sources.');
    const before=this.bakeState(),start=performance.now();this.baking=true;
    let candidate:LayerRuntime|undefined;
    try{
      const {volume,samplingMs}=await sampleBake(this.project,plan,signal,p=>{if(this.disposed)throw new Error('Bake cancelled: project closed.');progress?.(p);});
      if(this.disposed)throw new Error('Bake cancelled: project closed.');
      const layer=new SdfLayer(volume,{name:this.uniqueName(validated.name),operation:'union',order:this.project.layerStack.layers.length,transform:{position:[...plan.center],rotation:[0,0,0],scale:[plan.scale,plan.scale,plan.scale]}});
      candidate=new LayerRuntime(layer,this.neutral,volume,true);let meshingMs=0,chunks=0;
      while(candidate.rebuild(8,3)){
        meshingMs+=candidate.lastMeshMs;chunks+=candidate.lastChanged;
        if(candidate.triangles>triangleBudget)throw new Error('Bake would exceed the project triangle budget, including preserved sources. Choose a lower resolution.');
        progress?.({stage:'meshing',completed:chunks,total:candidate.totalChunks});await yieldBake();checkBakeCancelled(signal);
        if(this.disposed)throw new Error('Bake cancelled: project closed.');
      }
      candidate.lastMeshMs=meshingMs;candidate.lastChanged=chunks;
      if(!candidate.triangles)throw new Error('Boolean result has no extractable surface. No layer was created.');
      checkBakeCancelled(signal);
      // Commit only after all sampling/mesh validation succeeds. No source voxels are written.
      this.project.layerStack.insert(layer);for(const source of this.project.layerStack.layers)if(source.id in before.orders)source.order=before.orders[source.id];layer.order=Math.max(...Object.values(before.orders))+1;this.install(candidate);
      if(validated.hideSources)for(const id of plan.sourceIds)this.project.layerStack.get(id).visible=false;
      else this.viewMode='separate';
      if(plan.merge)this.viewMode='separate';
      this.discardFuture();this.syncPresentation();this.composite.invalidate();
      this.committedRevision++;this.past.push({kind:'bake',layerId:layer.id,runtime:candidate,before,after:this.bakeState(),index:this.project.layerStack.layers.findIndex(l=>l.id===layer.id)});
      this.lastBakeStats={samplingMs,meshingMs,totalMs:performance.now()-start,resolution:plan.resolution,triangles:candidate.triangles,worldStep:plan.worldStep,gridBytes:plan.gridBytes};
      candidate=undefined;return layer;
    }finally{candidate?.dispose();this.baking=false;}
  }
  /** Explicit tube bake copies its evaluated lattice exactly: no normalization,
   * density reduction, source deletion or merging with unrelated layers. */
  private async bakeTube(options:BakeOptions,signal?:AbortSignal):Promise<SdfLayer>{
    this.assertAvailable();const validated=validateBakeOptions(options),source=this.project.layerStack.get(validated.sourceIds![0]);
    if(validated.resolution!==source.volume.resolution)throw new Error('Tube Bake preserves source resolution.');
    this.assertCapacity(volumeSampleCount(source.volume),undefined,1);
    if(this.drawing||this.transforming)throw new Error('Finish the current edit first.');
    const before=this.bakeState(),metadata=JSON.stringify(source.metadata()),start=performance.now();this.baking=true;let candidate:LayerRuntime|undefined;
    const check=()=>{checkBakeCancelled(signal);if(this.disposed||JSON.stringify(source.metadata())!==metadata)throw new Error('Tube Bake cancelled: source changed.');};
    try{
      const original=source.volume,volume=new SDFVolume(original.resolution,original.extent,false,{dimensions:original.dimensions,latticeMin:original.latticeMin??[0,0,0]});
      if(this.trackedBytes+volumeSampleCount(volume)*8>256*1024**2)throw new Error('Tube Bake exceeds the staging memory budget.');
      for(let i=0;i<volume.values.length;i+=16384){check();for(let j=i;j<Math.min(volume.values.length,i+16384);j++)volume.values[j]=original.readVoxel(j);await yieldBake();}
      const samplingMs=performance.now()-start,{id:unused,procedural:unusedSource,...metadataCopy}=source.metadata();void unused;void unusedSource;
      const layer=new SdfLayer(volume,{...metadataCopy,name:validated.name,locked:false,visible:true,operation:'union',order:this.project.layerStack.layers.length});
      candidate=new LayerRuntime(layer,this.neutral,volume,true);const meshStart=performance.now(),budget=MAX_PROJECT_TRIANGLES-[...this.runtimes.values()].reduce((n,r)=>n+r.triangles,0);
      while(candidate.mesher.pendingChunks){check();candidate.rebuild(2,3);if(candidate.triangles>budget)throw new Error('Tube Bake exceeds the project triangle budget.');await yieldBake();}
      check();this.project.layerStack.insert(layer);this.install(candidate);this.discardFuture();this.viewMode='separate';
      if(validated.hideSources)source.visible=false;
      this.past.push({kind:'bake',layerId:layer.id,runtime:candidate,before,after:this.bakeState(),index:this.project.layerStack.layers.length-1});
      this.committedRevision++;this.syncPresentation();this.composite.invalidate();
      this.lastBakeStats={samplingMs,meshingMs:performance.now()-meshStart,totalMs:performance.now()-start,resolution:volume.resolution,triangles:candidate.triangles,worldStep:volume.step*uniformScale(layer.transform),gridBytes:volume.values.byteLength*2};
      candidate=undefined;return layer;
    }finally{candidate?.dispose();this.baking=false;}
  }
  /** Source-first atomic regeneration. No source/cache publication before all slices
   * and chunks succeed. One in-flight candidate, cancelled on ownership changes. */
  async regenerateTube(value:TubeSource,id?:string,signal?:AbortSignal):Promise<SdfLayer>{
    this.assertAvailable();if(this.drawing||this.transforming)throw new Error('Finish the current edit first.');
    const source=validateTube(value),old=id?this.runtime(id):undefined;
    if(old){old.layer.assertEditable();if(!old.layer.procedural)throw new Error('Select a procedural tube.');}
    const activeId=this.project.activeLayerId,metadata=old?JSON.stringify(old.layer.metadata()):'',before=this.bakeState();
    const n=old?.volume.resolution??this.active.volume.resolution,extent=old?.volume.extent??this.active.volume.extent,baseTracked=this.trackedBytes;
    this.tubePending=true;let candidate:LayerRuntime|undefined;
    const check=()=>{if(signal?.aborted||this.disposed||this.project.activeLayerId!==activeId||old&&(!old.layer.editable||JSON.stringify(old.layer.metadata())!==metadata))throw new Error('Tube regeneration cancelled; source kept.');};
    try{
      const otherSamples=this.project.layerStack.layers.reduce((sum,l)=>sum+(l.id===id?0:volumeSampleCount(l.volume)),0);if(!old&&this.project.layerStack.layers.length>=MAX_PROJECT_LAYERS)throw new Error('Maximum of 8 independent layers reached.');
      const maxSamples=Math.min(MAX_PROJECT_VOXELS-otherSamples,Math.floor((256*1024**2-baseTracked)/8));
      const work=evaluateTube(source,n,extent,maxSamples,samples=>{this.tubeStagingBytes=samples*8;});let result=work.next(),deadline=performance.now()+3;
      while(!result.done){check();if(performance.now()>=deadline){await yieldBake();deadline=performance.now()+3;}result=work.next();}
      check();const volume=result.value;this.assertCapacity(volumeSampleCount(volume),id,old?0:1);
      if(this.trackedBytes>256*1024**2)throw new Error('Tube exceeds the staging memory budget.');
      const layer=new SdfLayer(volume,old?{...old.layer.metadata(),procedural:source}:{name:this.uniqueName('Procedural Tube'),order:this.project.layerStack.layers.length,procedural:source});
      candidate=new LayerRuntime(old?.layer??layer,this.neutral,volume,true);
      const triangleBudget=MAX_PROJECT_TRIANGLES-[...this.runtimes.values()].reduce((n,r)=>n+(r===old?0:r.triangles),0);
      while(candidate.mesher.pendingChunks){check();candidate.rebuild(2,3);this.tubeStagingBytes=volumeSampleCount(volume)*8+candidate.mesher.ownedGeometryBytes;if(this.trackedBytes>256*1024**2)throw new Error('Tube staged mesh exceeds the memory budget.');if(candidate.triangles>triangleBudget)throw new Error('Tube exceeds the project triangle budget.');await yieldBake();}
      check();this.discardFuture();
      if(old){
        const previous={source:validateTube(old.layer.procedural),volume:old.volume};
        this.group.remove(old.surface.group);this.runtimes.delete(id!);
        // Retain stable layer identity used by selection and transform tools.
        old.layer.volume=volume;old.layer.procedural=source;
        this.install(candidate);old.dispose();for(const e of this.past)if(e.kind==='bake'&&e.layerId===old.layer.id)e.runtime=candidate;
        this.past.push({kind:'tube',layerId:old.layer.id,before:previous,after:{source,volume}});
        // Bound source-cache history to eight edits. Source coordinates never resample.
        let excess=this.past.filter(e=>e.kind==='tube').length-8;this.past=this.past.filter(e=>e.kind!=='tube'||excess--<=0);
      }else{
        this.project.layerStack.insert(layer);this.install(candidate);
        this.past.push({kind:'bake',layerId:layer.id,runtime:candidate,before,after:this.bakeState(),index:this.project.layerStack.layers.length-1});
      }
      this.committedRevision++;this.syncPresentation();this.composite.invalidate();candidate=undefined;return old?.layer??layer;
    }finally{candidate?.dispose();this.tubeStagingBytes=0;this.tubePending=false;}
  }
  /** Atomic branch command owned by XRMoveTool's existing preview lock. */
  async commitMove(owner:object,input:RadialMoveField,signal:AbortSignal,progress:(p:MoveProgress)=>void=()=>{},beforePublish:()=>void=()=>{},externalGuard:()=>boolean=()=>true):Promise<boolean>{
    if(this.disposed||this.movePending||this.baking||this.previewOwner!==owner||this.drawing||this.transforming)throw new Error('Move does not own the editable source.');
    const runtime=this.active,source=runtime.volume,sourceSurface=runtime.surface,sourceMesher=runtime.mesher,transform=copyTransform(runtime.layer.transform),revision=sourceSurface.revision,project=this.project.id,start=performance.now();
    this.assertSculptable(runtime.layer);
    if(runtime.layer.volume!==source||!(source instanceof SDFVolume)||!runtime.layer.editable||this.viewMode!=='separate'||sourceMesher.pendingChunks)throw new Error('Move needs a ready, visible, unlocked dense source in Separate Layers.');
    if(input.interaction==='translate'?input.delta.length()<source.step*1e-4:Math.abs(input.angle)*input.radius<source.step*1e-4)return false;
    const field=new RadialMoveField();field.capture(input.center,input.radius,input.falloff,1);field.setDisplacement(input.delta);field.configure(input.mode,input.stiffness);field.interaction=input.interaction;field.setRotation(input.axis,input.angle);
    const limits={...this.growthLimits},footprint=field.affectedBounds();for(let a=0;a<3;a++){footprint.min[a]-=source.step*3;footprint.max[a]+=source.step*3;}
    const plan=planDenseGrowth(source,footprint,limits),layout=plan??{dimensions:source.dimensions,latticeMin:source.latticeMin},samples=layout.dimensions.reduce((n,v)=>n*v,1);this.assertCapacity(samples,runtime.layer.id);
    const limit=limits.maxTransientBytes??DENSE_GROWTH_LIMITS.maxTransientBytes,base=this.trackedBytes,candidateStorage=samples*8;
    let geometryBytes=0;for(const o of sourceSurface.group.children)if('geometry' in o){const g=(o as import('three').Mesh).geometry;for(const a of Object.values(g.attributes))geometryBytes+=a.array.byteLength;}
    const available=limit-base-candidateStorage-geometryBytes-runtime.history.memoryBytes/3;
    if(available<=0)throw new Error('Move exceeds the source/candidate/history memory safety estimate.');
    this.movePending=true;this.moveStagingBytes=candidateStorage;
    const guard=()=>!this.disposed&&this.previewOwner===owner&&this.project.id===project&&this.active===runtime&&runtime.volume===source&&runtime.layer.volume===source&&runtime.surface===sourceSurface&&sourceSurface.revision===revision&&runtime.layer.editable&&sameTransform(runtime.layer.transform,transform)&&this.viewMode==='separate'&&externalGuard();
    const work=new MoveWork(signal,guard);let mesher:IncrementalMesher|undefined,stagedSurface:ChunkSurface|undefined;
    try{
      const next=await copyMoveVolume(source,layout,work,progress),result=await reconstructMoveAsync(sourceSurface.group,next,field,work,available,progress),patch=result.patch;
      if(!patch.indices.length)return false;
      const patchBytes=patch.indices.buffer.byteLength+patch.before.buffer.byteLength+patch.after.buffer.byteLength;
      const retainedStaging=candidateStorage+result.indexBytes+patchBytes+patch.indices.length*12+runtime.history.memoryBytes/3;
      this.moveStagingBytes=retainedStaging+geometryBytes;
      if(base+this.moveStagingBytes>limit)throw new Error('Move staging/history exceeds the memory safety estimate.');
      const history=runtime.history.prepareMoveReplacement(next,patch);
      for(let i=0;i<patch.indices.length;i++){next.values[patch.indices[i]]=patch.after[i];if(i%4096===4095)await work.pause();}
      mesher=sourceMesher.forkEdit(next,patch.bounds!);let meshMs=0,dirtyChunks=0;
      const triangleBudget=MAX_PROJECT_TRIANGLES-[...this.runtimes.values()].reduce((n,r)=>n+(r===runtime?0:r.triangles),0);
      for(;;){work.check();const batch=mesher.rebuildChunks(1);if(!batch)break;dirtyChunks+=batch.stats.chunks;meshMs+=batch.stats.milliseconds;this.moveStagingBytes=retainedStaging+mesher.ownedGeometryBytes;if(base+this.moveStagingBytes>limit)throw new Error('Move staged geometry exceeds the memory safety estimate. Source kept.');if(batch.triangles>triangleBudget)throw new Error('Move exceeds the native project triangle safety budget. Source kept.');progress({stage:'meshing',completed:dirtyChunks,total:dirtyChunks+mesher.pendingChunks});await work.pause();}
      stagedSurface=new ChunkSurface(runtime.material);stagedSurface.group.name=sourceSurface.group.name;stagedSurface.group.userData={...sourceSurface.group.userData};stagedSurface.group.visible=sourceSurface.group.visible;stagedSurface.group.position.copy(sourceSurface.group.position);stagedSurface.group.quaternion.copy(sourceSurface.group.quaternion);stagedSurface.group.scale.copy(sourceSurface.group.scale);stagedSurface.group.renderOrder=sourceSurface.group.renderOrder;stagedSurface.update(mesher.snapshotUpdates());stagedSurface.revision=revision+1;
      const invalidateComposite=this.composite.prepareInvalidation(),adopt=mesher.prepareAdoptionFrom(sourceMesher),entry:TimelineEntry={kind:'voxels',layerId:runtime.layer.id};let past=[...this.past,entry],excess=past.filter(e=>e.kind==='voxels'&&e.layerId===runtime.layer.id).length-history.undoCount;past=past.filter(e=>{if(e.kind==='voxels'&&e.layerId===runtime.layer.id&&excess>0){excess--;return false;}return true;});
      const discarded=this.future.filter(e=>e.kind==='bake'&&!this.runtimes.has(e.layerId)),future:TimelineEntry[]=[],slot=this.group.children.indexOf(sourceSurface.group);if(slot<0)throw new Error('Move source is no longer displayed.');
      const stats:MoveCommitStats={backend:work.backend,waitMs:work.waitMs,slicePercentiles:work.slicePercentiles,wallMs:performance.now()-start,cpuMs:work.measuredCPU,maxSliceMs:work.maxSliceMs,meshingMs:meshMs,changedVoxels:patch.indices.length,sampled:result.sampled,indexBytes:result.indexBytes,patchBytes,estimatedPeakBytes:base+Math.max(this.moveStagingBytes,candidateStorage+work.workerSnapshotBytes+result.indexBytes+patchBytes),dirtyChunks,grew:!!plan,slices:work.slices};
      work.check();beforePublish();work.check();
      // All arrays, history remaps, mesh extraction, display index and timeline
      // allocations precede this synchronous publication. No await below.
      history.publish();adopt();runtime.volume=runtime.layer.volume=next;runtime.mesher=mesher;runtime.surface=stagedSurface;
      this.group.children[slot]=stagedSurface.group;stagedSurface.group.parent=this.group;sourceSurface.group.parent=null;
      runtime.triangles=mesher.triangles;runtime.totalChunks=mesher.allocatedChunks;runtime.lastChanged=dirtyChunks;runtime.lastMeshMs=meshMs;if(plan){runtime.expansions++;runtime.lastExpansionMs=performance.now()-start;}
      this.committedRevision++;this.past=past;this.future=future;this.lastMoveStats=stats;invalidateComposite();mesher=undefined;stagedSurface=undefined;
      // Source geometries still shared with the candidate changed ownership;
      // only superseded buffers are disposed. Cleanup cannot undo a publication.
      try{sourceMesher.dispose();sourceSurface.clear();for(const e of discarded)if(e.kind==='bake'){e.runtime.dispose();this.display.remove(this.project.id,e.layerId);}}catch(error){console.warn('Move committed; deferred resource cleanup failed',error);}
      return true;
    }finally{mesher?.dispose();stagedSurface?.clear();this.moveStagingBytes=0;this.movePending=false;}
  }
  /** Borrow committed SDF-derived chunk buffers, never display/GPU deformation helpers.
   * Snapshotting owns copies; guards reject edits/replacement while those copies are made. */
  exportSources(scope:'visible'|'selected'='visible'):ExportSource[]{
    if(this.tubePending||this.drawing||this.transforming||this.previewing||this.deforming||this.baking)throw new Error('Finish or cancel the current sculpt / Move reconstruction before exporting.');
    const selection=()=>JSON.stringify(this.project.layerStack.layers.filter(l=>scope==='selected'?l.id===this.project.activeLayerId:l.visible).map(l=>l.id)),selectionKey=selection();
    const selected=this.project.activeLayerId,layers=this.project.layerStack.layers.filter(l=>scope==='selected'?l.id===selected:l.visible);
    return layers.map(layer=>{const runtime=this.runtime(layer.id),volume=runtime.volume,revision=runtime.surface.revision,metadata=JSON.stringify(layer.metadata());
      if(runtime.mesher.pendingChunks)throw new Error('Wait for committed surface meshing before exporting.');
      return {name:layer.name,layerId:layer.id,step:volume.step,transform:copyTransform(layer.transform),chunks:runtime.mesher.snapshotUpdates().filter(u=>u.geometry.getAttribute('position').count).map(u=>({positions:u.geometry.getAttribute('position').array as Float32Array,normals:u.geometry.getAttribute('normal').array as Float32Array})),current:()=>selection()===selectionKey&&!this.disposed&&!this.drawing&&!this.previewing&&!this.deforming&&!this.transforming&&this.runtimes.get(layer.id)===runtime&&runtime.volume===volume&&runtime.surface.revision===revision&&!runtime.mesher.pendingChunks&&JSON.stringify(layer.metadata())===metadata};
    });
  }
  exportGroup(): Group {
    this.finishStroke();this.finishTransform();const group=new Group();group.name=this.project.name;
    for(const layer of this.project.layerStack.layers) {
      if(!layer.visible)continue;
      const mesh=buildExportMesh(this.runtime(layer.id).surface.group,this.neutral,'local');
      if(!mesh.geometry.getAttribute('position').count){mesh.geometry.dispose();continue;}
      mesh.name=layer.name;mesh.userData.layerId=layer.id;
      mesh.position.fromArray(layer.transform.position);mesh.rotation.set(...layer.transform.rotation,'XYZ');mesh.scale.fromArray(layer.transform.scale);group.add(mesh);
    }
    if(!group.children.length)throw new Error('No visible surface to export.');return group;
  }
  dispose(): void {this.disposed=true;this.composite.dispose();const all=new Set(this.runtimes.values());for(const entry of [...this.past,...this.future])if(entry.kind==='bake')all.add(entry.runtime);for(const runtime of all)runtime.dispose();this.past=[];this.future=[];this.runtimes.clear();this.group.clear();this.compositeMaterial.dispose();this.neutral.dispose();}
}
