import {Group,Matrix4,Vector3,Quaternion,Euler,type Camera,type Scene,type Object3D} from 'three';
import {UniformTransformControls} from './transform-tools';
import type {InputOwnership} from './interaction';
import type {ReferenceView} from './reference-view';
import type {ReferenceImage} from './reference-images';
export type ReferenceEditMode='translate'|'rotate'|'scale';
export interface ReferenceEditorPort{readonly mode:ReferenceEditMode|null;setMode(mode:ReferenceEditMode|null):void;}
export function referenceWorldTransform(record:ReferenceImage,parent:Object3D):Matrix4{
 parent.updateWorldMatrix(true,false);return parent.matrixWorld.clone().multiply(new Matrix4().compose(new Vector3(...record.position),new Quaternion().setFromEuler(new Euler(...record.rotation)),new Vector3().setScalar(record.size)));
}
export function setReferenceWorldTransform(record:ReferenceImage,parent:Object3D,world:Matrix4):void{
 parent.updateWorldMatrix(true,false);const local=parent.matrixWorld.clone().invert().multiply(world),p=new Vector3(),q=new Quaternion(),s=new Vector3();local.decompose(p,q,s);
 if(!p.toArray().every(n=>Number.isFinite(n)&&Math.abs(n)<=1000)||!s.toArray().every(Number.isFinite)||!q.toArray().every(Number.isFinite))throw new Error('Reference transform is outside supported bounds.');
 const e=new Euler().setFromQuaternion(q);record.position=p.toArray();record.rotation=[e.x,e.y,e.z];record.size=Math.max(.05,Math.min(10,Math.abs(s.x)));
}
/** Desktop display proxy: edits only reference metadata, never attaches to source geometry. */
export class ReferenceTransformTool implements ReferenceEditorPort{
 readonly controls:UniformTransformControls;readonly proxy=new Group();mode:ReferenceEditMode|null=null;
 private active=false;private record:ReferenceImage|null=null;private selected:string|null=null;private anchor=new Matrix4();
 constructor(camera:Camera,private readonly canvas:HTMLElement,scene:Scene,private readonly view:ReferenceView,private readonly input:InputOwnership,private readonly callbacks:{beforeDrag:()=>void;camera:(enabled:boolean)=>void;changed:()=>void;busy:()=>boolean;error:(text:string)=>void}){
  this.proxy.name='Reference transform proxy · display only';scene.add(this.proxy);this.controls=new UniformTransformControls(camera,canvas);this.controls.setSpace('local');this.controls.setSize(.85);scene.add(this.controls.getHelper());
  this.controls.addEventListener('mouseDown',()=>{callbacks.beforeDrag();if(!this.allowed()||!input.beginPreview(true,callbacks.busy())){this.finish();return;}this.active=true;this.record=this.view.panels.get(this.view.selected!)!.record;this.selected=this.view.selected;this.proxy.parent!.updateWorldMatrix(true,false);const parent=this.view.panels.get(this.selected!)!.mesh.parent!;parent.updateWorldMatrix(true,false);this.anchor.copy(parent.matrixWorld);callbacks.camera(false);});
  this.controls.addEventListener('objectChange',()=>{if(!this.active)return;const panel=this.selected?view.panels.get(this.selected):undefined;if(!this.allowed()||panel?.record!==this.record){this.setMode(null);return;}try{this.proxy.updateMatrixWorld(true);setReferenceWorldTransform(this.record!,panel!.mesh.parent!,this.proxy.matrixWorld);view.sync();callbacks.changed();}catch(e){this.setMode(null);callbacks.error(e instanceof Error?e.message:String(e));}});
  this.controls.addEventListener('mouseUp',()=>this.release());this.controls.addEventListener('dragging-changed',event=>{if(!event.value)this.release();});this.controls.enabled=false;
 }
 private allowed():boolean{const p=this.view.selected?this.view.panels.get(this.view.selected):undefined;return !!this.mode&&!this.callbacks.busy()&&!!p?.mesh.visible&&!p.record.locked;}
 private release():void{if(!this.active)return;this.active=false;this.record=null;this.selected=null;this.input.end('preview');this.callbacks.camera(this.input.cameraEnabled);this.callbacks.changed();}
 finish():void{if(this.controls.dragging){this.controls.pointerUp(null);this.controls.disconnect();this.controls.connect(this.canvas);}this.release();}
 setMode(mode:ReferenceEditMode|null):void{this.finish();if(mode)this.callbacks.beforeDrag();this.mode=mode;this.input.referenceEditing=!!mode;this.view.editing=!!mode;this.sync();this.callbacks.changed();}
 sync():void{
  if(!this.mode){this.controls.enabled=false;this.controls.detach();return;}
  this.view.sync();if(this.mode&&!this.allowed()){this.mode=null;this.input.referenceEditing=false;this.view.editing=false;this.finish();}
  if(!this.mode){this.controls.enabled=false;this.controls.detach();return;}
  const panel=this.view.panels.get(this.view.selected!)!;
  if(this.active){panel.mesh.parent!.updateWorldMatrix(true,false);if(panel.record!==this.record||this.view.selected!==this.selected||panel.mesh.parent!.matrixWorld.elements.some((n,i)=>Math.abs(n-this.anchor.elements[i])>1e-9)){this.setMode(null);}return;}
  referenceWorldTransform(panel.record,panel.mesh.parent!).decompose(this.proxy.position,this.proxy.quaternion,this.proxy.scale);this.proxy.updateMatrixWorld(true);this.controls.setMode(this.mode);this.controls.enabled=true;if(this.controls.object!==this.proxy)this.controls.attach(this.proxy);
 }
 dispose():void{this.setMode(null);this.controls.dispose();this.controls.getHelper().removeFromParent();this.proxy.removeFromParent();}
}
