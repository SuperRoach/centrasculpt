import {MoveGesture} from './move-gesture';
import {BufferGeometry,Float32BufferAttribute,LineBasicMaterial,LineSegments,Group,Matrix4,Quaternion,Ray,Mesh,MeshBasicMaterial,Raycaster,SphereGeometry,Vector3} from 'three';
import type {Intersection,Object3D} from 'three';
import type {XRControllerState} from './xr-input';
import type {XRStrokeInteraction} from './xr-clay-stroke';
import type {IndependentLayers,LayerRuntime} from './independent-layers';
import type {EditorToolState} from './editor-tool-state';
import type {VolumeStore} from './volume-store';
import {uniformScale} from './transform';
import {XRBrushPreview} from './xr-brush-preview';
import {MoveMeshPreview} from './move-mesh-preview';
export type MovePreviewCapture=Readonly<{projectId:string;layerId:string;volume:VolumeStore;surfaceRevision:number;nativeTransform:readonly number[];target:readonly number[];worldMatrix:readonly number[];controllerPose:readonly number[];radius:number;falloff:number;strength:number;stiffness:number;mode:'preview'|'non-elastic'|'elastic';interaction:'translate'|'rotate'|'twist';axis:'free'|'x'|'y'|'z';angularStrength:number;angleClamp:number;precision:boolean;snap:number}>;
/** Surface targeting and noncumulative preview in a frozen layer frame.
 * Release delegates one atomic persistent command to IndependentLayers. */
export class XRMoveTool implements XRStrokeInteraction {
 readonly preview=new MoveMeshPreview();readonly gesture=new MoveGesture();
 readonly boundary:LineSegments<BufferGeometry,LineBasicMaterial>;targetState:'none'|'valid'|'locked'|'unavailable'='none';
 private hoverChunk:Object3D|null=null;readonly influence:XRBrushPreview;
 readonly marker:Mesh<SphereGeometry,MeshBasicMaterial>;
 capture:MovePreviewCapture|null=null;
 feedback='';lastMs=0;
 private commitAbort:AbortController|null=null;private commitGeneration=0;private commitMessage='';private currentTime=0;
 private armed=false;private owner=0;private grabbing=false;private until=0;
 private capturedLayers:IndependentLayers|null=null;private runtime:LayerRuntime|null=null;
 private readonly localRay=new Ray();private readonly rayChunks:Mesh[]=[];
 private readonly raycaster=new Raycaster();private readonly hits:Intersection<Object3D>[]=[];
 private readonly direction=new Vector3();private readonly center=new Vector3();private readonly controllerStart=new Vector3();private readonly displacement=new Vector3();private readonly markerPoint=new Vector3();
 private readonly filteredDisplacement=new Vector3();private readonly worldScale=new Vector3();
 private readonly inverseStartRotation=new Quaternion();private readonly startRotation=new Quaternion();private readonly wristRotation=new Quaternion();private readonly poseRotation=new Matrix4();
 private readonly inverse=new Matrix4();private readonly anchor=new Matrix4();private readonly markerMatrix=new Matrix4();private readonly parentInverse=new Matrix4();
 constructor(private readonly layers:()=>IndependentLayers,private readonly tools:EditorToolState,root:Group,private readonly pulse:(event:'grab'|'release')=>void=()=>{},private readonly committed:()=>void=()=>{}){
  this.influence=new XRBrushPreview(root);this.influence.group.name='Move influence · not project data';this.influence.mesh.visible=false;
  const points:number[]=[];for(let plane=0;plane<3;plane++)for(let i=0;i<64;i++)for(const t of [i/64*2*Math.PI,(i+1)/64*2*Math.PI]){const p=[0,0,0];p[(plane+1)%3]=Math.cos(t);p[(plane+2)%3]=Math.sin(t);points.push(...p);}
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(points,3));
  this.boundary=new LineSegments(geometry,new LineBasicMaterial({color:'#aec4de',transparent:true,opacity:.65,depthTest:true,depthWrite:false,toneMapped:false}));this.boundary.raycast=()=>{};this.boundary.frustumCulled=false;this.influence.group.add(this.boundary);
  this.marker=new Mesh(new SphereGeometry(1,10,8),new MeshBasicMaterial({color:'#99cfff',depthTest:true,depthWrite:false,toneMapped:false}));this.marker.matrixAutoUpdate=false;this.marker.raycast=()=>{};this.marker.frustumCulled=false;this.marker.renderOrder=26;this.marker.visible=false;this.marker.name='Move surface target · not project data';root.add(this.marker);
 }
 get active():boolean{return this.grabbing;}
 get notifying():boolean{return this.until>this.currentTime;}
 private release():void{this.preview.restore();this.tools.endPreview(this);this.capturedLayers?.endPreview(this);this.grabbing=false;this.capturedLayers=null;this.runtime=null;this.capture=null;this.owner=0;this.influence.hide();this.marker.visible=false;}
 cancel():void{const pending=!!this.commitAbort,notice=this.notifying&&this.feedback.startsWith('Move cancelled');this.commitGeneration++;this.commitAbort?.abort();this.commitAbort=null;this.release();this.preview.cancel();this.rayChunks.length=0;this.hits.length=0;this.armed=false;if(pending){this.feedback='Move cancelled · source kept · release trigger to rearm';this.until=this.currentTime+1600;}else if(!notice){this.feedback='';this.until=0;}this.hoverChunk=null;this.targetState='none';}
 update(tool:XRControllerState|undefined,aim:Matrix4|undefined,time:number,enabled:boolean,gripPose?:Matrix4):void{
  const l=this.layers(),start=performance.now();if(Number.isFinite(time))this.currentTime=time;try{this.step(l,tool,aim,time,enabled,gripPose);}catch(error){this.cancel();this.feedback=error instanceof Error?error.message:'Move preview cancelled';this.until=time+1200;}finally{this.lastMs=performance.now()-start;if(l.metrics.enabled)l.metrics.movePreview.add(this.lastMs);}
 }
 private step(l:IndependentLayers,tool:XRControllerState|undefined,aim:Matrix4|undefined,time:number,enabled:boolean,gripPose?:Matrix4):void{
  const pose=gripPose??aim;
  if(this.tools.active!=='move'){this.cancel();return;}
  const valid=enabled&&Number.isFinite(time)&&tool?.role==='tool'&&tool.connected&&tool.tracked&&tool.gripTracked&&aim&&pose&&aim.elements.every(Number.isFinite)&&pose.elements.every(Number.isFinite)&&Math.abs(aim.determinant())>1e-10&&Math.abs(pose.determinant())>1e-10&&!tool.buttons.grip.pressed&&tool.buttons.grip.rawValue<.45&&l.viewMode==='separate'&&!this.tools.port.busy()&&!l.drawing&&!l.transforming&&(!l.previewing||this.active);
  if(!valid){this.cancel();this.targetState='unavailable';if(this.notifying)return;this.feedback=l.viewMode!=='separate'?'Move preview · use Separate Layers':!l.active.layer.editable?'Move preview · show/unlock the active layer':'Move preview inactive · release trigger after menu/grab/tracking loss';return;}
  const runtime=l.active,surface=runtime.surface.group;surface.updateWorldMatrix(true,false);
  if(this.active){
   if(!runtime.layer.editable){this.cancel();this.feedback='Move cancelled · layer hidden or locked';this.until=time+1200;return;}
   const t=runtime.layer.transform,native=this.capture!.nativeTransform;let nativeChanged=false;for(let a=0;a<3;a++)if(t.position[a]!==native[a]||t.rotation[a]!==native[a+3]||t.scale[a]!==native[a+6])nativeChanged=true;
   if(nativeChanged||l!==this.capturedLayers||runtime!==this.runtime||tool!.connectionId!==this.owner||runtime.volume!==this.capture!.volume||runtime.surface.revision!==this.capture!.surfaceRevision||surface.matrixWorld.elements.some((v,i)=>Math.abs(v-this.anchor.elements[i])>1e-9)||!this.preview.valid()){
    this.cancel();this.feedback='Move preview cancelled · target or workspace changed';this.until=time+1200;return;
   }
   if(this.commitAbort){this.feedback=this.commitMessage;return;}
   if(!tool!.buttons.trigger.pressed&&this.capture!.mode!=='preview'){this.displacement.setFromMatrixPosition(pose!).applyMatrix4(this.inverse).sub(this.controllerStart);this.updatePose(pose!);this.paint(surface,this.preview.field.center,this.preview.field.radius,true);this.startCommit(l,time);return;}
   if(!tool!.buttons.trigger.pressed){this.release();this.armed=true;this.feedback='Move preview finished · original SDF surface restored · no undo action';this.until=time+1200;this.pulse('release');return;}
   this.displacement.setFromMatrixPosition(pose!).applyMatrix4(this.inverse).sub(this.controllerStart);this.updatePose(pose!);
   this.paint(surface,this.preview.field.center,this.preview.field.radius,true);
   this.feedback=this.capture!.precision?`Move · Precision ¼ sensitivity · ${this.capture!.mode==='preview'?'release restores':'release commits'}`:this.capture!.mode==='preview'?`Move · preview only · ${this.capture!.interaction==='translate'?'full hand travel':'wrist '+this.capture!.interaction} · release restores`:`Move · ${this.capture!.mode} · ${this.capture!.interaction} · release commits`;
   return;
  }
  if(!tool!.buttons.trigger.pressed&&tool!.buttons.trigger.rawValue<.45)this.armed=true;
  this.raycaster.ray.origin.setFromMatrixPosition(aim!);this.direction.set(0,0,-1).transformDirection(aim!);this.raycaster.ray.direction.copy(this.direction);this.raycaster.far=5;this.hits.length=0;
  this.inverse.copy(surface.matrixWorld).invert();this.localRay.copy(this.raycaster.ray).applyMatrix4(this.inverse);
  runtime.surface.spatial.ray(this.localRay,this.rayChunks);
  for(const chunk of this.rayChunks){chunk.updateWorldMatrix(false,false);this.raycaster.intersectObject(chunk,false,this.hits);}
  this.rayChunks.length=0;let hit:Intersection<Object3D>|undefined;for(const candidate of this.hits)if(!hit||candidate.distance<hit.distance)hit=candidate;
  // Stable tie-break only for effectively coincident chunk hits; never smooth off-surface.
  if(hit&&this.hoverChunk)for(const candidate of this.hits)if(candidate.object===this.hoverChunk&&candidate.distance<=hit.distance+1e-5){hit=candidate;break;}
  this.hoverChunk=hit?.object??null;
  if(!hit||!runtime.layer.visible){this.targetState='none';this.influence.hide();this.marker.visible=false;if(time>=this.until)this.feedback=!runtime.layer.visible?'Move · hidden target · show layer to edit':this.tools.move.mode==='preview'?'Move · preview only · point at the active layer surface':`Move · ${this.tools.move.mode} · point at the active layer surface`;if(tool!.buttons.trigger.pressed)this.armed=false;return;}
  this.inverse.copy(surface.matrixWorld).invert();this.center.copy(hit.point).applyMatrix4(this.inverse);
  const radius=this.tools.move.radius/uniformScale(runtime.layer.transform);
  this.targetState=runtime.layer.locked?'locked':'valid';this.paint(surface,this.center,radius,false);
  if(runtime.layer.locked){this.feedback='Move · locked target · unlock layer to edit';if(tool!.buttons.trigger.pressed)this.armed=false;return;}
  if(time>=this.until)this.feedback=`Move ${this.tools.move.mode==='preview'?'preview only':this.tools.move.mode} · target ${this.center.x.toFixed(2)}, ${this.center.y.toFixed(2)}, ${this.center.z.toFixed(2)} · hold Tool trigger`;
  const start=this.armed&&tool!.buttons.trigger.justPressed&&tool!.buttons.trigger.pressed;
  if(tool!.buttons.trigger.pressed)this.armed=false;if(!start)return;
  this.capturedLayers=l;this.runtime=runtime;this.owner=tool!.connectionId;
  this.anchor.copy(surface.matrixWorld);this.poseRotation.multiplyMatrices(this.inverse,pose!).extractRotation(this.poseRotation);this.startRotation.setFromRotationMatrix(this.poseRotation);this.controllerStart.setFromMatrixPosition(pose!).applyMatrix4(this.inverse);
  this.capture=Object.freeze({projectId:l.project.id,layerId:runtime.layer.id,volume:runtime.volume,surfaceRevision:runtime.surface.revision,nativeTransform:Object.freeze([...runtime.layer.transform.position,...runtime.layer.transform.rotation,...runtime.layer.transform.scale]),target:Object.freeze(this.center.toArray()),worldMatrix:Object.freeze(this.anchor.toArray()),controllerPose:Object.freeze(pose!.toArray()),radius,falloff:this.tools.move.falloff,strength:this.tools.move.strength,stiffness:this.tools.move.stiffness,mode:this.tools.move.mode==='preview'?'preview':this.tools.move.interaction==='translate'?this.tools.move.mode:'non-elastic',interaction:this.tools.move.interaction,axis:this.tools.move.axis,angularStrength:this.tools.move.angularStrength,angleClamp:this.tools.move.angleClamp,precision:this.tools.move.precision,snap:this.tools.move.snap});
  this.tools.beginPreview(this);l.beginPreview(this);
  this.preview.begin(surface,this.center,radius,this.capture.falloff,this.capture.strength,undefined,runtime.surface.spatial,this.capture.mode==='elastic'?'elastic':'non-elastic',this.capture.stiffness);
  surface.getWorldScale(this.worldScale);this.gesture.capture(this.capture.precision,1/this.worldScale.x);
  this.grabbing=true;this.displacement.set(0,0,0);this.updatePose(pose!);this.paint(surface,this.center,radius,true);this.feedback=this.capture.mode==='preview'?`Move · preview only · ${this.capture.interaction==='translate'?'pull controller':'turn wrist'}; release restores`:`Move · ${this.capture.mode} · ${this.capture.interaction==='translate'?'pull controller':'turn wrist'}; release commits`;this.pulse('grab');
 }
 private updatePose(pose:Matrix4):void{
  const capture=this.capture!;
  if(capture.interaction==='translate'){this.preview.update(this.gesture.translation(this.displacement,this.filteredDisplacement,capture.axis));return;}
  this.poseRotation.multiplyMatrices(this.inverse,pose).extractRotation(this.poseRotation);
  this.wristRotation.setFromRotationMatrix(this.poseRotation).multiply(this.inverseStartRotation.copy(this.startRotation).invert()).normalize();
  this.gesture.rotation(this.wristRotation,capture.axis,capture.angularStrength,capture.angleClamp,capture.snap);
  this.preview.setRotation(this.gesture.axis,this.gesture.angle,capture.interaction);
 }
 private startCommit(l:IndependentLayers,time:number):void{
  const capture=this.capture!,generation=++this.commitGeneration,abort=new AbortController();this.commitAbort=abort;this.commitMessage='Move · reconstructing · preview held · Support grip cancels';this.armed=false;
  const owned=()=>this.capture===capture&&generation===this.commitGeneration&&!abort.signal.aborted;
  const guard=()=>{if(!owned()||!this.runtime)return false;const surface=this.runtime.surface.group;surface.updateWorldMatrix(true,false);return surface.matrixWorld.elements.every((v,i)=>Math.abs(v-capture.worldMatrix[i])<=1e-9);};
  void l.commitMove(this,this.preview.field,abort.signal,p=>{if(guard())this.commitMessage=`Move · ${p.stage} ${Math.round(p.completed/Math.max(1,p.total)*100)}% · preview held`;},()=>{if(!guard())throw new Error('Move cancelled.');this.preview.restore();},guard).then(committed=>{
   if(!owned())return;this.commitAbort=null;this.release();this.armed=false;this.feedback=committed?'Move committed · ready to edit · one Undo action':'Move unchanged · no undo action';this.until=this.currentTime+1800;if(committed){this.pulse('release');this.committed();}
  }).catch(error=>{if(!owned())return;this.commitAbort=null;this.release();this.preview.cancel();this.armed=false;this.feedback=`Move failed · source kept · ${error instanceof Error?error.message:'retry with a smaller influence'}`;this.until=this.currentTime+2500;});
 }
 private paint(surface:Object3D,center:Vector3,radius:number,held:boolean):void{
  this.influence.show(surface,center,radius);this.influence.mesh.material.color.set(held?'#99cfff':'#aec4de');const color=this.targetState==='locked'?'#e8b174':held?'#99cfff':'#aec4de';this.boundary.material.color.set(color);this.marker.material.color.set(color);
  this.markerPoint.copy(center);if(held)this.preview.field.position(center,this.markerPoint);
  this.markerMatrix.makeScale(radius*.018,radius*.018,radius*.018);this.markerMatrix.setPosition(this.markerPoint);this.marker.matrix.copy(surface.matrixWorld).multiply(this.markerMatrix);
  if(this.marker.parent){this.marker.parent.updateWorldMatrix(true,false);this.parentInverse.copy(this.marker.parent.matrixWorld).invert();this.marker.matrix.premultiply(this.parentInverse);}this.marker.visible=true;this.marker.updateWorldMatrix(false,false);
 }
 dispose():void{this.cancel();this.boundary.geometry.dispose();this.boundary.material.dispose();this.influence.dispose();this.marker.removeFromParent();this.marker.geometry.dispose();this.marker.material.dispose();}
}
