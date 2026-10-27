import {Box3,Color,Group,Matrix4,Mesh,PerspectiveCamera,Quaternion,Scene,Vector3} from 'three';
import type {ColorRepresentation,Object3D} from 'three';
type TransformSnapshot={object:Object3D;position:Vector3;quaternion:Quaternion;scale:Vector3};
const capture=(object:Object3D):TransformSnapshot=>({object,position:object.position.clone(),quaternion:object.quaternion.clone(),scale:object.scale.clone()});
const restore=(s:TransformSnapshot)=>{s.object.position.copy(s.position);s.object.quaternion.copy(s.quaternion);s.object.scale.copy(s.scale);s.object.updateMatrixWorld(true);};
/** Tracking and presentation are scene transforms, never SDF/layer metadata. */
export class XRSceneRig {
 readonly trackingOrigin=new Group();
 readonly controllerTracking=new Group();
 readonly workspaceRoot=new Group();
 readonly sculptureRoot=new Group();
 private snapshot:{background:Scene['background'];transforms:TransformSnapshot[];projection:Matrix4;inverseProjection:Matrix4;fov:number;aspect:number;near:number;far:number;zoom:number;visibility:{object:Object3D;visible:boolean}[]}|null=null;
 private pendingPlacement=false;private hasHome=false;private readonly home=new Matrix4();
 private readonly center=new Vector3();
 presentationScale=1;
 constructor(private readonly scene:Scene,readonly camera:PerspectiveCamera,readonly preferences:{background:ColorRepresentation}={background:'#808080'}){
  this.trackingOrigin.name='XR Tracking Origin';this.controllerTracking.name='Controller Tracking · foundation';this.workspaceRoot.name='Workspace Root';this.sculptureRoot.name='Sculpture Root';
  this.trackingOrigin.add(camera,this.controllerTracking);this.workspaceRoot.add(this.sculptureRoot);scene.add(this.trackingOrigin,this.workspaceRoot);
 }
 get active():boolean{return this.snapshot!==null;}
 /** Only visible source/result meshes contribute; ghost/gizmos never live under Sculpture Root. */
 visibleBounds():Box3 {
  const bounds=new Box3(),inverse=new Matrix4(),matrix=new Matrix4();this.sculptureRoot.updateWorldMatrix(true,true);inverse.copy(this.sculptureRoot.matrixWorld).invert();
  this.sculptureRoot.traverseVisible(object=>{if(object instanceof Mesh){const geometry=object.geometry;if(!geometry.boundingBox)geometry.computeBoundingBox();if(geometry.boundingBox&&!geometry.boundingBox.isEmpty()){matrix.multiplyMatrices(inverse,object.matrixWorld);bounds.union(geometry.boundingBox.clone().applyMatrix4(matrix));}}});
  return bounds;
 }
 enter(hidden:readonly Object3D[]=[],environment:'studio'|'passthrough'='studio'):void {
  if(this.active)return;
  const camera=this.camera;
  this.snapshot={background:this.scene.background,transforms:[capture(camera),capture(this.trackingOrigin),capture(this.workspaceRoot)],projection:camera.projectionMatrix.clone(),inverseProjection:camera.projectionMatrixInverse.clone(),fov:camera.fov,aspect:camera.aspect,near:camera.near,far:camera.far,zoom:camera.zoom,visibility:hidden.map(object=>({object,visible:object.visible}))};
  this.scene.background=environment==='passthrough'?null:new Color(this.preferences.background);
  const bounds=this.visibleBounds();if(bounds.isEmpty())bounds.set(new Vector3(-.5,-.5,-.5),new Vector3(.5,.5,.5));
  bounds.getCenter(this.center);const size=bounds.getSize(new Vector3()),diameter=Math.max(size.x,size.y,size.z);
  this.presentationScale=.65/Math.max(diameter,.000001);
  this.trackingOrigin.position.set(0,0,0);this.trackingOrigin.quaternion.identity();this.trackingOrigin.scale.setScalar(1);
  camera.position.set(0,0,0);camera.quaternion.identity();camera.scale.setScalar(1);
  for(const object of hidden)object.visible=false;
  this.hasHome=false;this.pendingPlacement=true;this.place(new Vector3(),new Quaternion());
 }
 /** Place once relative to the first tracked head pose. Subsequent head motion never moves the workspace. */
 placeFirstView(position:{x:number;y:number;z:number},orientation:{x:number;y:number;z:number;w:number}):void {
  if(!this.active||!this.pendingPlacement)return;this.place(new Vector3(position.x,position.y,position.z),new Quaternion(orientation.x,orientation.y,orientation.z,orientation.w));this.pendingPlacement=false;this.home.copy(this.workspaceRoot.matrix);this.hasHome=true;
 }
 /** Restore the first tracked entry fit, never follow the current head or modify sculpture metadata. */
 resetWorkspaceView():boolean{if(!this.active||!this.hasHome)return false;this.home.decompose(this.workspaceRoot.position,this.workspaceRoot.quaternion,this.workspaceRoot.scale);this.workspaceRoot.updateWorldMatrix(false,false);return true;}
 private place(eye:Vector3,head:Quaternion):void {
  const forward=new Vector3(0,0,-1).applyQuaternion(head);forward.y=0;if(forward.lengthSq()<.001)forward.set(0,0,-1);else forward.normalize();
  this.workspaceRoot.rotation.set(0,Math.atan2(-forward.x,-forward.z),0);this.workspaceRoot.scale.setScalar(this.presentationScale);
  const offset=this.center.clone().multiplyScalar(this.presentationScale).applyQuaternion(this.workspaceRoot.quaternion),target=eye.addScaledVector(forward,.9);target.y-=.12;
  this.workspaceRoot.position.copy(target.sub(offset));this.workspaceRoot.updateWorldMatrix(true,true);
 }
 exit():void {
  const s=this.snapshot;if(!s)return;this.snapshot=null;this.pendingPlacement=false;this.hasHome=false;
  this.scene.background=s.background;
  for(const value of s.transforms)restore(value);
  Object.assign(this.camera,{fov:s.fov,aspect:s.aspect,near:s.near,far:s.far,zoom:s.zoom});this.camera.projectionMatrix.copy(s.projection);this.camera.projectionMatrixInverse.copy(s.inverseProjection);
  for(const value of s.visibility)value.object.visible=value.visible;
 }
}
