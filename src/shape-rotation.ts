import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { Group, type Camera, type Scene } from 'three';
import type { LayerStack } from './layers';
import type { ShapePreviewModel } from './shape-preview';
import type { InputOwnership } from './interaction';
import type { VolumeTransform } from './transform';
export type ShapeRotationCallbacks={beforeDrag:()=>void;camera:(enabled:boolean)=>void;changed:()=>void;error:(message:string)=>void;busy:()=>boolean};
/** World-space proxy belongs to the preview alone: never attach controls to a layer mesh. */
export class ShapeRotationTool {
 readonly controls:TransformControls;
 readonly proxy=new Group();
 space:'local'|'world'='local';
 private active=false;
 private targetId:string|null=null;
 private key='';
 constructor(camera:Camera,private readonly canvas:HTMLElement,scene:Scene,private readonly model:ShapePreviewModel,private readonly stack:()=>LayerStack,private readonly input:InputOwnership,private readonly callbacks:ShapeRotationCallbacks){
  this.proxy.name='Stamp transform proxy · preview only';this.proxy.userData.previewOnly=true;scene.add(this.proxy);
  this.controls=new TransformControls(camera,canvas);this.controls.setMode('rotate');this.controls.setSpace(this.space);this.controls.setSize(.8);scene.add(this.controls.getHelper());
  this.controls.addEventListener('mouseDown',()=>{
   callbacks.beforeDrag();
   if(!this.allowed()||!input.beginPreview(true,callbacks.busy())){this.finish();return;}
   this.active=true;this.model.dragging=true;this.targetId=stack().activeLayerId;callbacks.camera(false);callbacks.changed();
  });
  this.controls.addEventListener('objectChange',()=>{
   if(!this.active)return;
   if(this.targetId!==stack().activeLayerId||!this.allowed()){this.finish();return;}
   try{
    const world:VolumeTransform={position:this.proxy.position.toArray(),rotation:[this.proxy.rotation.x,this.proxy.rotation.y,this.proxy.rotation.z],scale:this.proxy.scale.toArray()};
    model.setWorldTransform(world,stack());callbacks.changed();
   }catch(error){this.finish();this.key='';callbacks.error(error instanceof Error?error.message:'Unable to transform stamp preview.');}
  });
  this.controls.addEventListener('mouseUp',()=>this.release());
  this.controls.addEventListener('dragging-changed',event=>{if(!event.value)this.release();});
  this.sync();
 }
 private allowed():boolean{return this.model.enabled&&this.model.manipulating&&!this.callbacks.busy()&&!this.model.availability(this.stack());}
 private release():void{if(!this.active)return;this.active=false;this.model.dragging=false;this.targetId=null;this.input.end('preview');this.callbacks.camera(this.input.cameraEnabled);this.key='';this.callbacks.changed();}
 toggle(mode:'rotate'|'translate'='rotate'):void{this.finish();if(mode==='translate')this.model.setMoveMode(!this.model.moveMode,this.stack());else this.model.setRotationMode(!this.model.rotationMode,this.stack());this.key='';this.sync();this.callbacks.changed();}
 sync():void{
  const stack=this.stack();this.model.sync(stack);
  if(!this.allowed()){
   this.finish();this.controls.enabled=false;this.controls.detach();
   if(!this.model.enabled||this.model.availability(stack)){this.model.rotationMode=false;this.model.moveMode=false;}
   this.key='';return;
  }
  if(this.active&&this.targetId!==stack.activeLayerId)this.finish();
  const mode=this.model.moveMode?'translate':'rotate';
  if(this.active&&this.controls.mode!==mode)this.finish();
  this.controls.enabled=true;this.controls.setMode(mode);this.controls.setSpace(this.space);
  if(this.active)return;
  const world=this.model.worldTransform(stack),key=JSON.stringify([world,stack.activeLayerId,this.space]);
  if(key!==this.key){this.key=key;this.proxy.position.fromArray(world.position);this.proxy.rotation.set(...world.rotation,'XYZ');this.proxy.scale.fromArray(world.scale);this.proxy.updateWorldMatrix(true,false);}
  if(this.controls.object!==this.proxy)this.controls.attach(this.proxy);
 }
 finish():void{if(this.controls.dragging){this.controls.pointerUp(null);this.controls.disconnect();this.controls.connect(this.canvas);}this.release();}
 dispose():void{this.finish();this.controls.dispose();this.controls.getHelper().removeFromParent();this.proxy.removeFromParent();}
}
