import {BufferGeometry,Float32BufferAttribute,Group,Line,LineBasicMaterial,Matrix4,Raycaster,Vector3} from 'three';
import type {Intersection,Object3D} from 'three';
import type {XRControllerState} from './xr-input';
import type {EditorToolState} from './editor-tool-state';
import type {IndependentLayers} from './independent-layers';
import {XRBrushPreview} from './xr-brush-preview';
import {CLAY_TIP_REACH_METRES} from './clay-path';
import type {VolumeBounds,VolumeStore} from './volume-store';
import {uniformScale} from './transform';
import {ClayStrokeSession} from './clay-stroke-session';
export interface XRStrokeInteraction {readonly active:boolean;readonly feedback?:string;update(tool:XRControllerState|undefined,pose:Matrix4|undefined,time:number,enabled:boolean,gripPose?:Matrix4):void;cancel():void;}
/** Grip-relative free-space Clay/Smooth by default; optional surface follow. All path filtering/transaction work is device-independent. */
export class XRClayStroke implements XRStrokeInteraction {
 readonly controllerRaw:{position:number[];direction:number[];time:number}[]=[];
 readonly cursor:XRBrushPreview;
 readonly session:ClayStrokeSession;readonly preview=new Group();message='';
 private readonly geometry=new BufferGeometry();private readonly positions=new Float32BufferAttribute(new Float32Array(16384*3),3);private readonly material=new LineBasicMaterial({color:'#9de6cf',depthTest:false,transparent:true,opacity:.9,toneMapped:false});
 private readonly hits:Intersection<Object3D>[]=[];
 private readonly line:Line;private readonly raycaster=new Raycaster();private readonly direction=new Vector3();private readonly local=new Vector3();private readonly inverse=new Matrix4();private readonly parentInverse=new Matrix4();private readonly anchor=new Matrix4();
 private boundsVolume:VolumeStore|null=null;private bounds:VolumeBounds|null=null;private placementNote='';private capturedPlacement:'free'|'surface'='free';
 private capturedTool='clay';private owner=0;private armed=false;private lastFrame:number|null=null;private lastMesh=0;private lastPreview:unknown=null;private previewLength=0;
 constructor(private readonly layers:()=>IndependentLayers,private readonly tools:EditorToolState,root:Group,changed:()=>void=()=>{}){this.cursor=new XRBrushPreview(root);this.session=new ClayStrokeSession(layers,changed);this.geometry.setAttribute('position',this.positions);this.line=new Line(this.geometry,this.material);this.line.frustumCulled=false;this.preview.add(this.line);this.preview.name='Clay trajectory preview · not project data';this.preview.matrixAutoUpdate=false;this.preview.visible=false;this.line.renderOrder=25;root.add(this.preview);}
 get active():boolean{return this.session.active;}
 get feedback():string{if(this.placementNote)return this.placementNote;const label=this.tools.active==='smooth'?'Smooth':'Clay';return this.session.phase==='committing'?`${label}: applying the preview · one undo action`:this.session.phase==='drawing'?this.session.buffered?`${label} preview · release trigger to apply`:`${label}: freehand`:this.placementNote;}
 cancel():void{this.placementNote='';this.cursor.hide();if(this.active)this.session.cancel();this.controllerRaw.length=0;this.preview.visible=false;this.lastPreview=null;this.owner=0;this.armed=false;}
 update(tool:XRControllerState|undefined,pose:Matrix4|undefined,time:number,enabled:boolean,gripPose?:Matrix4):void{
  const dt=this.lastFrame!==null?Math.min(.05,Math.max(0,(time-this.lastFrame)/1000)):1/90;this.lastFrame=time;
  const mode=this.tools.active,layers=this.layers(),placement=this.tools.path.placement;
  if(placement==='free'&&gripPose)pose=gripPose;
  const valid=enabled&&(mode==='clay'||mode==='smooth')&&tool?.role==='tool'&&tool.connected&&tool.tracked&&tool.gripTracked&&pose&&pose.elements.every(Number.isFinite)&&Math.abs(pose.determinant())>1e-10&&layers.viewMode==='separate'&&layers.project.layerStack.layers.some(l=>l.id===layers.project.activeLayerId)&&layers.active.layer.editable;
  if(!valid||this.active&&(tool!.connectionId!==this.owner||mode!==this.capturedTool||placement!==this.capturedPlacement)){this.cancel();return;}
  const runtime=layers.active;runtime.surface.group.updateWorldMatrix(true,true);
  if(this.active&&runtime.surface.group.matrixWorld.elements.some((v,i)=>Math.abs(v-this.anchor.elements[i])>1e-9)){this.cancel();this.message='Stroke cancelled: target/workspace moved';return;}
  try{
   const radius=this.active?this.session.localRadius:this.tools.port.settings().radius/uniformScale(runtime.layer.transform);
   if(this.session.phase==='committing'){this.cursor.show(runtime.surface.group,this.local,radius,mode==='smooth');this.session.pump();this.paint();return;}
   this.raycaster.ray.origin.setFromMatrixPosition(pose!);this.direction.set(0,0,-1).transformDirection(pose!);this.raycaster.ray.direction.copy(this.direction);this.raycaster.far=3;
   this.inverse.copy(runtime.surface.group.matrixWorld).invert();let hasTarget=false;this.placementNote='';
   if(placement==='free'){
    this.local.copy(this.raycaster.ray.origin).addScaledVector(this.direction,CLAY_TIP_REACH_METRES).applyMatrix4(this.inverse);hasTarget=true;
    if(this.boundsVolume!==runtime.volume){this.boundsVolume=runtime.volume;this.bounds=runtime.volume.bounds;}
    const b=this.bounds!;
    if(this.local.x<b.min[0]||this.local.x>b.max[0]||this.local.y<b.min[1]||this.local.y>b.max[1]||this.local.z<b.min[2]||this.local.z>b.max[2]){this.cancel();this.cursor.show(runtime.surface.group,this.local,radius,false,false);this.placementNote='Outside layer volume · move the brush inside';return;}
   }else{
    this.hits.length=0;this.raycaster.intersectObject(runtime.surface.group,true,this.hits);const hit=this.hits[0];
    if(hit){this.local.copy(hit.point).applyMatrix4(this.inverse);hasTarget=true;}
   }
   const nearBounds=placement==='free'&&this.bounds&&[this.local.x,this.local.y,this.local.z].some((v,i)=>v-radius<this.bounds!.min[i]+runtime.volume.step||v+radius>this.bounds!.max[i]-runtime.volume.step);
   if(nearBounds)this.placementNote='Near layer bounds · brush will be clipped';
   if(hasTarget)this.cursor.show(runtime.surface.group,this.local,radius,mode==='smooth',!nearBounds);else this.cursor.hide();
   if(!this.active&&!tool!.buttons.trigger.pressed){this.armed=true;return;}
   if(!this.active&&(!this.armed||!tool!.buttons.trigger.justPressed||!tool!.buttons.trigger.pressed))return;
   if(this.active&&!tool!.buttons.trigger.pressed){if(this.session.buffered&&hasTarget){this.recordController(time);this.session.sample(this.local,time);}this.session.end();this.armed=true;this.paint();return;}
   if(!hasTarget){this.cancel();return;}
   if(!this.active){this.controllerRaw.length=0;this.capturedTool=mode;this.capturedPlacement=placement;this.anchor.copy(runtime.surface.group.matrixWorld);this.session.begin(this.tools.port.settings(),this.tools.path,time-dt*1000,placement==='free');this.owner=tool!.connectionId;this.armed=false;this.message='';}
   this.recordController(time);this.session.sample(this.local,time);if(!this.session.buffered&&time-this.lastMesh>=1000/30){runtime.rebuild();this.lastMesh=time;}this.paint();
  }catch(error){this.cancel();this.message=error instanceof Error?error.message:'Stroke cancelled';}
 }
 private recordController(time:number):void{this.controllerRaw.push({position:this.raycaster.ray.origin.toArray(),direction:this.raycaster.ray.direction.toArray(),time});}
 private paint():void{
  this.preview.visible=this.active&&this.session.preview.length>0;if(!this.preview.visible)return;
  if(this.lastPreview!==this.session.preview||this.previewLength!==this.session.preview.length){this.lastPreview=this.session.preview;this.previewLength=this.session.preview.length;this.session.preview.forEach((p,i)=>this.positions.setXYZ(i,p.x,p.y,p.z));this.positions.needsUpdate=true;this.geometry.setDrawRange(0,this.session.preview.length);}
  this.preview.matrix.copy(this.anchor);if(this.preview.parent){this.preview.parent.updateWorldMatrix(true,false);this.parentInverse.copy(this.preview.parent.matrixWorld).invert();this.preview.matrix.premultiply(this.parentInverse);}this.preview.updateWorldMatrix(false,false);
 }
 dispose():void{this.cancel();this.cursor.dispose();this.preview.removeFromParent();this.geometry.dispose();this.material.dispose();}
}
