import {RotatingStrokeSampler,stableSculptMatrix,hasTurntable,turntablePivotWorld} from './turntable';
import {sdfSurfaceHit} from './sdf-surface-hit';
import {reflectPoint} from './sdf';
import {BufferGeometry,Float32BufferAttribute,Group,Line,LineBasicMaterial,Matrix4,Raycaster,Vector3} from 'three';
import type {Intersection,Object3D} from 'three';
import type {XRControllerState} from './xr-input';
import type {EditorToolState} from './editor-tool-state';
import type {IndependentLayers} from './independent-layers';
import {XRBrushPreview} from './xr-brush-preview';
import {CLAY_TIP_REACH_METRES} from './clay-path';
import type {VolumeBounds,VolumeStore} from './volume-store';
import {uniformScale} from './transform';
import {ClayStrokeSession,CLAY_MESH_CHUNKS,CLAY_MESH_BUDGET_MS} from './clay-stroke-session';
export interface XRStrokeInteraction {readonly active:boolean;readonly feedback?:string;readonly liveSizing?:'clay-radius'|'tube-radius'|'move-falloff'|null;update(tool:XRControllerState|undefined,pose:Matrix4|undefined,time:number,enabled:boolean,gripPose?:Matrix4):void;cancel():void;}
/** Grip-relative free-space Clay/Smooth by default; optional surface follow. All path filtering/transaction work is device-independent. */
export class XRClayStroke implements XRStrokeInteraction {
 readonly controllerRaw:{position:number[];direction:number[];time:number}[]=[];
 readonly cursor:XRBrushPreview;readonly mirrorCursor:XRBrushPreview;
 readonly session:ClayStrokeSession;readonly preview=new Group();message='';
 private readonly geometry=new BufferGeometry();private readonly positions=new Float32BufferAttribute(new Float32Array(16384*3),3);private readonly material=new LineBasicMaterial({color:'#9de6cf',depthTest:false,transparent:true,opacity:.9,toneMapped:false});
 private readonly hits:Intersection<Object3D>[]=[];
 private readonly line:Line;private readonly mirrorLine:Line;private readonly raycaster=new Raycaster();private readonly direction=new Vector3();private readonly local=new Vector3();private readonly inverse=new Matrix4();private readonly parentInverse=new Matrix4();private readonly anchor=new Matrix4();
 private boundsVolume:VolumeStore|null=null;private bounds:VolumeBounds|null=null;private placementNote='';private capturedPlacement:'free'|'surface'='free';
 private rollingPath=false;private readonly rotatingSampler=new RotatingStrokeSampler();private readonly stableAnchor=new Matrix4();
 private processingMs=0;private processingMeasured=false;
 private capturedTool='clay';private owner=0;private armed=false;private lastFrame:number|null=null;private lastPreview:unknown=null;private previewLength=0;
 constructor(private readonly layers:()=>IndependentLayers,private readonly tools:EditorToolState,root:Group,changed:()=>void=()=>{},private readonly issue:(event:'cancel'|'error')=>void=()=>{},private readonly paintSizing:()=>boolean=()=>false){this.cursor=new XRBrushPreview(root);this.mirrorCursor=new XRBrushPreview(root);this.session=new ClayStrokeSession(layers,changed,true);this.geometry.setAttribute('position',this.positions);this.line=new Line(this.geometry,this.material);this.mirrorLine=new Line(this.geometry,this.material);this.mirrorLine.frustumCulled=false;this.preview.add(this.mirrorLine);this.line.frustumCulled=false;this.preview.add(this.line);this.preview.name='Clay trajectory preview · not project data';this.preview.matrixAutoUpdate=false;this.preview.visible=false;this.line.renderOrder=25;root.add(this.preview);}
 get liveSizing(){return this.session.phase==='drawing'&&(this.capturedTool==='clay'||this.capturedTool==='mask'||this.capturedTool==='paint')?'clay-radius' as const:null;}
 get active():boolean{return this.session.active;}
 get feedback():string{if(this.placementNote)return this.placementNote;const label=this.tools.active==='smooth'?'Smooth':this.tools.active==='clay'?'Clay':this.tools.active[0].toUpperCase()+this.tools.active.slice(1);return this.session.phase==='committing'?`${label}: applying the preview · one undo action`:this.session.phase==='drawing'?this.session.buffered?`${label} preview · release trigger to apply`:`${label}: freehand`:this.message;}
 cancel():void{if(this.active)this.issue('cancel');this.rotatingSampler.reset();this.message='';this.placementNote='';this.cursor.hide();this.mirrorCursor.hide();if(this.active)this.session.cancel();this.controllerRaw.length=0;this.preview.visible=false;this.lastPreview=null;this.owner=0;this.armed=false;}
 update(tool:XRControllerState|undefined,pose:Matrix4|undefined,time:number,enabled:boolean,gripPose?:Matrix4):void{
  const metrics=this.layers().metrics,wasActive=this.active,start=performance.now();
  if(!wasActive){this.processingMs=0;this.processingMeasured=metrics.enabled;}
  if(!metrics.enabled)this.processingMeasured=false;
  try{this.step(tool,pose,time,enabled,gripPose);}finally{this.session.accountFrameCPU(performance.now()-start);if(metrics.enabled&&this.processingMeasured&&(wasActive||this.active)){this.processingMs+=performance.now()-start;if(!this.active)metrics.xrStroke.add(this.processingMs);}}
 }
 private step(tool:XRControllerState|undefined,pose:Matrix4|undefined,time:number,enabled:boolean,gripPose?:Matrix4):void{
  const dt=this.lastFrame!==null?Math.min(.05,Math.max(0,(time-this.lastFrame)/1000)):1/90;this.lastFrame=time;
  const mode=this.tools.active,layers=this.layers(),placement=mode==='paint'?'surface':this.tools.path.placement,canGrow=this.tools.port.settings().mode==='add';
  if(placement==='free'&&gripPose)pose=gripPose;
  const valid=enabled&&(mode==='paint'||mode==='mask'||mode==='clay'||mode==='smooth'||mode==='flatten'||mode==='inflate'||mode==='scrape'||mode==='pinch'||mode==='crease')&&tool?.role==='tool'&&tool.connected&&tool.tracked&&tool.gripTracked&&pose&&pose.elements.every(Number.isFinite)&&Math.abs(pose.determinant())>1e-10&&layers.viewMode==='separate'&&layers.project.layerStack.layers.some(l=>l.id===layers.project.activeLayerId)&&layers.active.layer.editable;
  if(!valid||this.active&&(tool!.connectionId!==this.owner||mode!==this.capturedTool||placement!==this.capturedPlacement)){this.cancel();return;}
  const runtime=layers.active;runtime.surface.group.updateWorldMatrix(true,true);
  if(this.active&&stableSculptMatrix(runtime.surface.group).elements.some((v,i)=>Math.abs(v-this.stableAnchor.elements[i])>1e-9)){this.cancel();this.message='Stroke cancelled: target/workspace moved';return;}
  this.anchor.copy(runtime.surface.group.matrixWorld);
  try{
   if(this.liveSizing)this.session.setRadius(this.tools.port.settings().radius);
   const radius=this.active?this.session.localRadius:this.tools.port.settings().radius/uniformScale(runtime.layer.transform);
   if(this.session.phase==='committing'){this.cursor.show(runtime.surface.group,this.local,radius,mode==='smooth',true,this.tools.port.settings().mode==='subtract');this.session.pump();if(mode==='paint'){this.cursor.hide();this.mirrorCursor.hide();}this.paint();return;}
   this.raycaster.ray.origin.setFromMatrixPosition(pose!);this.direction.set(0,0,-1).transformDirection(pose!);this.raycaster.ray.direction.copy(this.direction);this.raycaster.far=3;
   this.inverse.copy(runtime.surface.group.matrixWorld).invert();let hasTarget=false;this.placementNote='';
   if(placement==='free'){
    this.local.copy(this.raycaster.ray.origin).addScaledVector(this.direction,CLAY_TIP_REACH_METRES).applyMatrix4(this.inverse);hasTarget=true;
    if(this.boundsVolume!==runtime.volume){this.boundsVolume=runtime.volume;this.bounds=runtime.volume.bounds;}
    const b=this.bounds!;
    if(!canGrow&&(this.local.x<b.min[0]||this.local.x>b.max[0]||this.local.y<b.min[1]||this.local.y>b.max[1]||this.local.z<b.min[2]||this.local.z>b.max[2])){this.cancel();this.cursor.show(runtime.surface.group,this.local,radius,false,false);this.placementNote='Outside layer volume · move the brush inside';return;}
   }else{
    this.hits.length=0;this.raycaster.intersectObject(runtime.surface.group,true,this.hits);const hit=this.hits[0];
    if(hit){this.local.copy(hit.point).applyMatrix4(this.inverse);hasTarget=true;}
    else if(this.active&&(mode==='pinch'||mode==='crease')){const origin=this.raycaster.ray.origin.clone().applyMatrix4(this.inverse),direction=this.direction.clone().transformDirection(this.inverse),end=this.raycaster.ray.at(3,new Vector3()).applyMatrix4(this.inverse),fieldHit=sdfSurfaceHit(runtime.volume,origin,direction,origin.distanceTo(end));if(fieldHit){this.local.set(fieldHit.x,fieldHit.y,fieldHit.z);hasTarget=true;}}
   }
   if(hasTarget&&this.active){const projected=this.session.projectPoint(this.local);this.local.set(projected.x,projected.y,projected.z);}
   const nearBounds=!canGrow&&placement==='free'&&this.bounds&&[this.local.x,this.local.y,this.local.z].some((v,i)=>v-radius<this.bounds!.min[i]+runtime.volume.step||v+radius>this.bounds!.max[i]-runtime.volume.step);
   if(nearBounds)this.placementNote='Near layer bounds · brush will be clipped';
   if(hasTarget)this.cursor.show(runtime.surface.group,this.local,radius,mode==='smooth',!nearBounds,this.tools.port.settings().mode==='subtract');else this.cursor.hide();
   if(hasTarget&&layers.symmetry.enabled)this.mirrorCursor.show(runtime.surface.group,reflectPoint(this.local,layers.symmetry),radius,mode==='smooth',!nearBounds,this.tools.port.settings().mode==='subtract');else this.mirrorCursor.hide();
   if(mode==='paint'){this.cursor.mesh.material.color.set(layers.paintColour);this.mirrorCursor.mesh.material.color.set(layers.paintColour);}
   this.cursor.showField(runtime.volume,this.local,mode);this.mirrorCursor.showField(runtime.volume,reflectPoint(this.local,layers.symmetry),mode);
   if(mode==='paint'&&!this.paintSizing()){this.cursor.hide();this.mirrorCursor.hide();}
   if(!this.active&&!tool!.buttons.trigger.pressed){this.armed=true;return;}
   if(!this.active&&(!this.armed||!tool!.buttons.trigger.justPressed||!tool!.buttons.trigger.pressed))return;
   if(this.active&&!tool!.buttons.trigger.pressed){if(this.session.buffered&&hasTarget){this.recordController(time);this.session.sample(this.local,time);}this.session.end();this.armed=true;this.paint();return;}
   if(!hasTarget&&mode==='paint'){if(this.active){this.session.pauseSurface(time);this.rotatingSampler.reset();this.preview.visible=false;}this.message='Move pointer onto the surface to paint';return;}
   if(mode==='paint')this.message='';
   if(!hasTarget){this.cancel();this.message='Stroke cancelled: surface no longer under pointer';return;}
   if(!this.active){this.controllerRaw.length=0;this.capturedTool=mode;this.capturedPlacement=placement;this.anchor.copy(runtime.surface.group.matrixWorld);this.stableAnchor.copy(stableSculptMatrix(runtime.surface.group));this.rotatingSampler.reset();this.rollingPath=hasTurntable(runtime.surface.group);this.session.begin(this.tools.port.settings(),this.tools.path,time-dt*1000,placement==='free',this.rollingPath);this.owner=tool!.connectionId;this.armed=false;this.message='';}
   this.recordController(time);
   if(hasTurntable(runtime.surface.group)){
    const working=this.local.clone().applyMatrix4(runtime.surface.group.matrixWorld);
    this.rotatingSampler.sample(working,runtime.surface.group.matrixWorld,time,this.session.localRadius,(p,t)=>this.session.sample(p,t),turntablePivotWorld(runtime.surface.group));
    this.anchor.copy(runtime.surface.group.matrixWorld);
   }else this.session.sample(this.local,time);
   if(!this.session.buffered)runtime.rebuild(CLAY_MESH_CHUNKS,CLAY_MESH_BUDGET_MS);this.paint();
  }catch(error){this.cancel();this.issue('error');this.message=error instanceof Error?error.message:'Stroke cancelled';}
 }
 private recordController(time:number):void{if(this.rollingPath&&this.controllerRaw.length>=8192){let write=1;for(let i=2;i<this.controllerRaw.length;i+=2)this.controllerRaw[write++]=this.controllerRaw[i];this.controllerRaw.length=write;}this.controllerRaw.push({position:this.raycaster.ray.origin.toArray(),direction:this.raycaster.ray.direction.toArray(),time});}
 private paint():void{
  this.material.color.set(this.tools.active==='paint'?this.layers().paintColour:this.tools.port.settings().mode==='subtract'?'#a04b36':this.tools.active==='smooth'?'#a8c9ee':'#9de6cf');
  this.preview.visible=this.active&&this.session.preview.length>0;if(!this.preview.visible)return;
  if(this.lastPreview!==this.session.preview||this.previewLength!==this.session.preview.length){this.lastPreview=this.session.preview;this.previewLength=this.session.preview.length;this.session.preview.forEach((p,i)=>this.positions.setXYZ(i,p.x,p.y,p.z));this.positions.needsUpdate=true;this.geometry.setDrawRange(0,this.session.preview.length);}
  const mirror=this.layers().symmetry;this.mirrorLine.visible=mirror.enabled;this.mirrorLine.scale.set(1,1,1);this.mirrorLine.position.set(0,0,0);if(mirror.enabled){this.mirrorLine.scale[mirror.axis]=-1;this.mirrorLine.position[mirror.axis]=2*mirror.offset;}
  this.preview.matrix.copy(this.anchor);if(this.preview.parent){this.preview.parent.updateWorldMatrix(true,false);this.parentInverse.copy(this.preview.parent.matrixWorld).invert();this.preview.matrix.premultiply(this.parentInverse);}this.preview.updateWorldMatrix(false,false);
 }
 dispose():void{this.cancel();this.cursor.dispose();this.mirrorCursor.dispose();this.preview.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
