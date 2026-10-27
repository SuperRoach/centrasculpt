import {BufferGeometry,Float32BufferAttribute,Group,LineBasicMaterial,LineLoop,Matrix4,Mesh,MeshBasicMaterial,PlaneGeometry,SphereGeometry,Quaternion,Raycaster,Vector3,DoubleSide} from 'three';
import type {EditorToolState} from './editor-tool-state';
import type {XRControllerState} from './xr-input';
/** A display-only layer-local plane. Grab its red border or centre handle;
 * interior rays pass through to sculpting. Offset is a tool preference, never SDF. */
export class XRMirrorPlane {
 readonly group=new Group();
 readonly face=new Mesh(new PlaneGeometry(2,2),new MeshBasicMaterial({color:'#ff3434',transparent:true,opacity:.07,side:DoubleSide,depthWrite:false,toneMapped:false}));
 readonly handle=new Mesh(new SphereGeometry(.09,16,12),new MeshBasicMaterial({color:'#ff3434',side:DoubleSide,depthTest:false,depthWrite:false,toneMapped:false}));
 readonly border:LineLoop;active=false;hover=false;feedback='';
 private armed=false;private owner=0;private target='';private project:unknown;private offset=0;private start=0;
 private readonly anchor=new Matrix4();private readonly inverse=new Matrix4();private readonly ray=new Raycaster();private readonly point=new Vector3();
 constructor(private readonly tools:EditorToolState,root:Group){
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute([-1,-1,0,1,-1,0,1,1,0,-1,1,0],3));
  this.border=new LineLoop(g,new LineBasicMaterial({color:'#ff3434',depthTest:false,depthWrite:false,toneMapped:false}));this.group.add(this.face,this.border,this.handle);this.group.name='Mirror plane · tool preference only';this.group.matrixAutoUpdate=false;this.group.visible=false;root.add(this.group);
 }
 sync():void{
  const l=this.tools.port.layers(),m=l.symmetry;this.group.visible=m.enabled&&['clay','smooth','stamp'].includes(this.tools.active)&&l.viewMode==='separate';if(!this.group.visible)return;
  const surface=l.active.surface.group;surface.updateWorldMatrix(true,false);const q=new Quaternion().setFromUnitVectors(new Vector3(0,0,1),new Vector3(m.axis==='x'?1:0,m.axis==='y'?1:0,m.axis==='z'?1:0)),p=new Vector3();p[m.axis]=m.offset;
  const size=Math.max(.3,Math.min(2,l.active.volume.extent*.7));this.group.matrix.compose(p,q,new Vector3(size,size,size)).premultiply(surface.matrixWorld);
  if(this.group.parent){this.group.parent.updateWorldMatrix(true,false);this.group.matrix.premultiply(new Matrix4().copy(this.group.parent.matrixWorld).invert());}this.group.updateWorldMatrix(false,true);
 }
 cancel():void{if(this.active&&this.tools.port.layers().project===this.project&&this.tools.port.layers().project.activeLayerId===this.target)this.tools.port.layers().symmetry.offset=this.offset;this.active=false;this.hover=false;this.armed=false;this.owner=0;this.feedback='';this.group.visible=false;}
 update(tool:XRControllerState|undefined,aim:Matrix4|undefined,enabled:boolean,canStart:boolean,grip?:Matrix4):boolean{
  this.sync();const l=this.tools.port.layers(),pose=grip??aim;
  if(!enabled||!this.group.visible||!tool?.connected||tool.role!=='tool'||!tool.tracked||!tool.gripTracked||!aim||!aim.elements.every(Number.isFinite)||Math.abs(aim.determinant())<1e-10||!pose||!pose.elements.every(Number.isFinite)||Math.abs(pose.determinant())<1e-10){this.cancel();return false;}
  if(this.active){l.active.surface.group.updateWorldMatrix(true,false);if(this.project!==l.project||this.target!==l.project.activeLayerId||tool.connectionId!==this.owner||l.active.surface.group.matrixWorld.elements.some((v,i)=>Math.abs(v-this.anchor.elements[i])>1e-9)){this.cancel();return false;}
   const position=this.point.setFromMatrixPosition(pose).applyMatrix4(this.inverse)[l.symmetry.axis];l.symmetry.offset=Math.max(-100,Math.min(100,this.offset+position-this.start));this.sync();this.feedback=`Mirror ${l.symmetry.axis.toUpperCase()} offset ${l.symmetry.offset.toFixed(3)} · release to set`;
   if(!tool.buttons.trigger.pressed){this.active=false;this.armed=true;this.tools.port.changed();}return true;
  }
  this.hover=false;if(!tool.buttons.trigger.pressed)this.armed=true;if(!canStart||this.tools.busy)return false;
  this.ray.ray.origin.setFromMatrixPosition(aim);this.ray.ray.direction.set(0,0,-1).transformDirection(aim);this.ray.far=3;this.ray.params.Line.threshold=.025;
  const hit=this.ray.intersectObject(this.face,false)[0],uv=hit?.uv;
  // A volumetric handle and line hit work even when the plane is edge-on.
  this.hover=!!this.ray.intersectObject(this.handle,false)[0]||!!this.ray.intersectObject(this.border,false)[0]||!!uv&&Math.min(uv.x,uv.y,1-uv.x,1-uv.y)<.035;
  this.handle.material.color.set(this.hover?'#ffb0a0':'#ff3434');
  if(!this.hover){this.feedback='';return false;}this.feedback='Mirror plane · drag red border / centre to move offset';
  if(this.armed&&tool.buttons.trigger.justPressed&&tool.buttons.trigger.pressed){this.active=true;this.armed=false;this.owner=tool.connectionId;this.target=l.project.activeLayerId;this.project=l.project;this.offset=l.symmetry.offset;this.anchor.copy(l.active.surface.group.matrixWorld);this.inverse.copy(this.anchor).invert();this.start=this.point.setFromMatrixPosition(pose).applyMatrix4(this.inverse)[l.symmetry.axis];}
  return this.hover;
 }
 dispose():void{this.cancel();this.group.removeFromParent();for(const o of [this.face,this.handle,this.border]){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}}
}
