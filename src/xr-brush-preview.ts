import {Group,Matrix4,Mesh,MeshBasicMaterial,Quaternion,SphereGeometry,RingGeometry,Vector3,BufferGeometry,Float32BufferAttribute,LineSegments,LineBasicMaterial} from 'three';
import type {Object3D} from 'three';
import type {VolumeStore} from './volume-store';
import type {Point3} from './sdf';
/** A reusable sphere in the same layer-local metric as the brush kernel. Never exported. */
export class XRBrushPreview {
 readonly group=new Group();readonly mesh:Mesh<SphereGeometry,MeshBasicMaterial>;localRadius=0;private available=true;
 readonly plane=new Mesh(new RingGeometry(.96,1,48),new MeshBasicMaterial({color:'#e8c786',side:2,depthTest:false,depthWrite:false,transparent:true,opacity:.8}));
 readonly pinchArrows=new LineSegments(new BufferGeometry(),new LineBasicMaterial({color:'#e8c786',depthTest:false,transparent:true,opacity:.9,toneMapped:false}));
 readonly creaseArrow=new LineSegments(new BufferGeometry(),new LineBasicMaterial({color:'#d99872',depthTest:false,transparent:true,opacity:.95,toneMapped:false}));
 private readonly position=new Vector3();private readonly scale=new Vector3();private readonly rotation=new Quaternion();private readonly local=new Matrix4();private readonly inverse=new Matrix4();
 constructor(root:Group){this.mesh=new Mesh(new SphereGeometry(1,20,12),new MeshBasicMaterial({color:'#9de6cf',wireframe:true,transparent:true,opacity:.22,depthTest:false,depthWrite:false,toneMapped:false}));this.mesh.raycast=()=>{};this.mesh.frustumCulled=false;this.mesh.renderOrder=24;this.group.name='XR effective brush volume · presentation only';this.group.matrixAutoUpdate=false;this.group.visible=false;this.group.add(this.mesh,this.plane);this.plane.visible=false;this.plane.raycast=()=>{};
  const arrows:number[]=[];for(let i=0;i<4;i++){const angle=i*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle),p=(x:number,y:number)=>[x*c-y*s,x*s+y*c,0];arrows.push(...p(.8,0),...p(.25,0),...p(.25,0),...p(.4,.12),...p(.25,0),...p(.4,-.12));}
  this.pinchArrows.geometry.setAttribute('position',new Float32BufferAttribute(arrows,3));this.pinchArrows.raycast=()=>{};this.plane.add(this.pinchArrows);this.pinchArrows.visible=false;
  this.creaseArrow.geometry.setAttribute('position',new Float32BufferAttribute([0,0,.25,0,0,-.45,0,0,-.45,.12,0,-.25,0,0,-.45,-.12,0,-.25],3));this.creaseArrow.raycast=()=>{};this.plane.add(this.creaseArrow);this.creaseArrow.visible=false;root.add(this.group);}
 show(surface:Object3D,point:Point3,radius:number,smooth=false,available=true,subtract=false):void{
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||!Number.isFinite(point.z)||!Number.isFinite(radius)||radius<=0){this.hide();return;}
  this.plane.visible=false;this.pinchArrows.visible=false;this.creaseArrow.visible=false;this.available=available;this.localRadius=radius;this.position.set(point.x,point.y,point.z);this.scale.setScalar(radius);this.local.compose(this.position,this.rotation,this.scale);surface.updateWorldMatrix(true,false);this.group.matrix.copy(surface.matrixWorld).multiply(this.local);
  if(this.group.parent){this.group.parent.updateWorldMatrix(true,false);this.inverse.copy(this.group.parent.matrixWorld).invert();this.group.matrix.premultiply(this.inverse);}this.group.visible=true;this.mesh.material.color.set(!available?'#e8b174':smooth?'#a8c9ee':subtract?'#a04b36':'#9de6cf');this.group.updateWorldMatrix(false,true);
 }
 /** Tangent/clip plane inside the influence sphere; presentation only. */
 showField(volume:VolumeStore,point:Point3,mode:string):void{
  if(!this.group.visible||!['flatten','scrape','inflate','pinch','crease'].includes(mode))return;
  if(this.available)this.mesh.material.color.set(mode==='scrape'||mode==='crease'?'#d99872':mode==='inflate'?'#9de6cf':'#e8c786');
  if(mode==='inflate')return;
  const value=volume.sampleLocal(point);if(Math.abs(value)>this.localRadius)return;
  const n=volume.normalAt([point.x,point.y,point.z]);this.plane.visible=true;
  this.plane.quaternion.setFromUnitVectors(new Vector3(0,0,1),new Vector3(...n));
  this.plane.position.set(...n).multiplyScalar(mode==='flatten'||mode==='pinch'||mode==='crease'?-value/this.localRadius:0);this.pinchArrows.visible=mode==='pinch'||mode==='crease';this.creaseArrow.visible=mode==='crease';
 }
 hide():void{this.group.visible=false;}
 dispose():void{this.group.removeFromParent();this.creaseArrow.geometry.dispose();this.creaseArrow.material.dispose();this.pinchArrows.geometry.dispose();this.pinchArrows.material.dispose();this.plane.geometry.dispose();this.plane.material.dispose();this.mesh.geometry.dispose();this.mesh.material.dispose();}
}
