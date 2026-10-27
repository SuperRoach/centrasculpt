import {Group,Matrix4,Mesh,MeshBasicMaterial,Quaternion,SphereGeometry,Vector3} from 'three';
import type {Object3D} from 'three';
import type {Point3} from './sdf';
/** A reusable sphere in the same layer-local metric as the brush kernel. Never exported. */
export class XRBrushPreview {
 readonly group=new Group();readonly mesh:Mesh<SphereGeometry,MeshBasicMaterial>;localRadius=0;
 private readonly position=new Vector3();private readonly scale=new Vector3();private readonly rotation=new Quaternion();private readonly local=new Matrix4();private readonly inverse=new Matrix4();
 constructor(root:Group){this.mesh=new Mesh(new SphereGeometry(1,20,12),new MeshBasicMaterial({color:'#9de6cf',wireframe:true,transparent:true,opacity:.22,depthTest:false,depthWrite:false,toneMapped:false}));this.mesh.raycast=()=>{};this.mesh.frustumCulled=false;this.mesh.renderOrder=24;this.group.name='XR effective brush volume · presentation only';this.group.matrixAutoUpdate=false;this.group.visible=false;this.group.add(this.mesh);root.add(this.group);}
 show(surface:Object3D,point:Point3,radius:number,smooth=false,available=true,subtract=false):void{
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||!Number.isFinite(point.z)||!Number.isFinite(radius)||radius<=0){this.hide();return;}
  this.localRadius=radius;this.position.set(point.x,point.y,point.z);this.scale.setScalar(radius);this.local.compose(this.position,this.rotation,this.scale);surface.updateWorldMatrix(true,false);this.group.matrix.copy(surface.matrixWorld).multiply(this.local);
  if(this.group.parent){this.group.parent.updateWorldMatrix(true,false);this.inverse.copy(this.group.parent.matrixWorld).invert();this.group.matrix.premultiply(this.inverse);}this.group.visible=true;this.mesh.material.color.set(!available?'#e8b174':smooth?'#a8c9ee':subtract?'#a04b36':'#9de6cf');this.group.updateWorldMatrix(false,true);
 }
 hide():void{this.group.visible=false;}
 dispose():void{this.group.removeFromParent();this.mesh.geometry.dispose();this.mesh.material.dispose();}
}
