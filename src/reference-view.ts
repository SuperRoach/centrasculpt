import {Group,Mesh,PlaneGeometry,MeshBasicMaterial,Texture,SRGBColorSpace,DoubleSide,FrontSide,EdgesGeometry,LineSegments,LineBasicMaterial,Matrix4,Vector3,Euler,Quaternion,Raycaster} from 'three';
import type {ReferenceImage} from './reference-images';
import type {XRControllerState} from './xr-input';
type Panel={record:ReferenceImage;mesh:Mesh<PlaneGeometry,MeshBasicMaterial>;border:LineSegments;bitmap?:ImageBitmap;texture?:Texture;dead:boolean};
/** Separate presentation roots ensure bounds, GLB and Boolean traversal exclude references. */
export class ReferenceView{
 readonly workspace=new Group();readonly sculpture=new Group();readonly panels=new Map<string,Panel>();
 selected:string|null=null;editing=false;error='';private drag:{id:string;inverse:Matrix4;world:Matrix4}|null=null;private armed=false;
 private ray=new Raycaster();
 constructor(private readonly records:()=>ReferenceImage[],workspace:Group,sculpture:Group){workspace.add(this.workspace);sculpture.add(this.sculpture);this.workspace.name=this.sculpture.name='Reference images · display only';}
 sync():void{
  const records=this.records();for(const [id,p]of this.panels)if(!records.includes(p.record)){if(this.drag?.id===id)this.cancel();this.release(p);this.panels.delete(id);}
  for(const record of records){let p=this.panels.get(record.id);if(!p){
   const mesh=new Mesh(new PlaneGeometry(1,1),new MeshBasicMaterial({transparent:true,depthWrite:false,toneMapped:false}));
   const border=new LineSegments(new EdgesGeometry(mesh.geometry),new LineBasicMaterial({color:'#b1e6cd',depthWrite:false}));mesh.add(border);mesh.raycast=()=>{};
   p={record,mesh,border,dead:false};this.panels.set(record.id,p);void this.load(p);
  }
  const parent=record.space==='workspace'?this.workspace:this.sculpture;if(p.mesh.parent!==parent)parent.add(p.mesh);
  p.mesh.position.fromArray(record.position);p.mesh.rotation.set(...record.rotation);p.mesh.scale.set(record.size*record.width/Math.max(record.width,record.height),record.size*record.height/Math.max(record.width,record.height),1);p.mesh.visible=record.visible&&!!p.texture;
  if(p.texture){const flipped=!!record.flipX;p.texture.repeat.x=flipped?-1:1;p.texture.offset.x=flipped?1:0;}
  p.mesh.material.opacity=record.opacity;p.mesh.material.side=record.twoSided?DoubleSide:FrontSide;p.border.position.z=.002;p.border.visible=this.editing&&this.selected===record.id&&!record.locked;
  }
  if(this.selected&&!records.some(r=>r.id===this.selected)){this.selected=null;this.cancel();}
 }
 private async load(p:Panel):Promise<void>{try{const bitmap=await createImageBitmap(new Blob([p.record.bytes as Uint8Array<ArrayBuffer>],{type:p.record.mime}),{imageOrientation:'flipY',premultiplyAlpha:'none',colorSpaceConversion:'none'});if(p.dead){bitmap.close();return;}if(bitmap.width!==p.record.width||bitmap.height!==p.record.height){bitmap.close();throw new Error('Decoded dimensions differ from validated header.');}p.bitmap=bitmap;const texture=new Texture(bitmap);texture.colorSpace=SRGBColorSpace;texture.needsUpdate=true;p.texture=texture;p.mesh.material.map=texture;p.mesh.material.needsUpdate=true;}catch(e){if(!p.dead)this.error=`Reference ${p.record.name}: ${e instanceof Error?e.message:String(e)}`;}}
 private release(p:Panel):void{p.dead=true;p.mesh.removeFromParent();p.mesh.geometry.dispose();p.mesh.material.dispose();p.border.geometry.dispose();(p.border.material as LineBasicMaterial).dispose();p.texture?.dispose();p.bitmap?.close();}
 clear():void{this.error='';this.editing=false;this.cancel();for(const p of this.panels.values())this.release(p);this.panels.clear();}
 dispose():void{this.clear();this.workspace.removeFromParent();this.sculpture.removeFromParent();}
 cancel():void{this.drag=null;this.armed=false;}
 /** Trigger owns only explicit reference edit mode; grip stays with existing tools/navigation. */
 step(state:XRControllerState|undefined,pose:Matrix4|undefined,enabled:boolean):boolean{
  if(!this.editing){this.cancel();return false;}
  if(!enabled||!state?.tracked||!pose){this.cancel();return false;}
  const button=state.buttons.trigger;
  this.ray.ray.origin.setFromMatrixPosition(pose);this.ray.ray.direction.set(0,0,-1).transformDirection(pose);this.ray.near=.1;this.ray.far=3;
  const candidate=this.selected?this.panels.get(this.selected):undefined;
  let hit=false;
  if(candidate?.mesh.visible&&!candidate.record.locked){candidate.mesh.updateWorldMatrix(true,false);const hits:import('three').Intersection[]=[];Mesh.prototype.raycast.call(candidate.mesh,this.ray,hits);hit=!!hits.length;}
  if(!button.pressed){this.drag=null;this.armed=true;return hit;}
  if(button.justPressed&&this.armed&&hit&&candidate){this.drag={id:candidate.record.id,inverse:pose.clone().invert(),world:candidate.mesh.matrixWorld.clone()};this.armed=false;}
  if(this.drag){const p=this.panels.get(this.drag.id);if(!p||p.record.locked||!p.record.visible){this.cancel();return true;}p.mesh.parent!.updateWorldMatrix(true,false);const matrix=new Matrix4().copy(p.mesh.parent!.matrixWorld).invert().multiply(pose).multiply(this.drag.inverse).multiply(this.drag.world),position=new Vector3(),rotation=new Quaternion(),scale=new Vector3();matrix.decompose(position,rotation,scale);if(position.toArray().every(n=>Math.abs(n)<=1000)){p.record.position=position.toArray();const e=new Euler().setFromQuaternion(rotation);p.record.rotation=[e.x,e.y,e.z];}}
  return !!this.drag;
 }
 switchSpace(record:ReferenceImage):void{this.sync();const mesh=this.panels.get(record.id)!.mesh;mesh.updateWorldMatrix(true,false);const world=mesh.matrixWorld.clone();record.space=record.space==='workspace'?'sculpture':'workspace';const parent=record.space==='workspace'?this.workspace:this.sculpture;parent.updateWorldMatrix(true,false);world.premultiply(parent.matrixWorld.clone().invert());const pos=new Vector3(),q=new Quaternion(),scale=new Vector3();world.decompose(pos,q,scale);const e=new Euler().setFromQuaternion(q);record.position=pos.toArray();record.rotation=[e.x,e.y,e.z];this.cancel();this.sync();}
}
