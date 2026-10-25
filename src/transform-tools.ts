import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { Camera, Scene } from 'three';
import type { IndependentLayers } from './independent-layers';
import { uniformScale } from './transform';
import type { VolumeTransform } from './transform';
import { InputOwnership } from './interaction';
import type { EditorMode, TransformSpace } from './interaction';

/** Every built-in scale handle uses TransformControls' isotropic XYZ path. */
export class UniformTransformControls extends TransformControls {
  override pointerDown(pointer:PointerEvent|null):void {
    if(this.mode==='scale'&&this.axis!==null){this.axis='XYZ';this.getHelper().updateMatrixWorld(true);}
    super.pointerDown(pointer);
  }
}
export type TransformToolCallbacks={beforeDrag:()=>void;camera:(enabled:boolean)=>void;changed:()=>void;error:(message:string)=>void;busy:()=>boolean};
export class LayerTransformTools {
  readonly controls:UniformTransformControls;
  constructor(camera:Camera,private readonly canvas:HTMLElement,scene:Scene,private readonly layers:()=>IndependentLayers,readonly input:InputOwnership,private readonly callbacks:TransformToolCallbacks) {
    this.controls=new UniformTransformControls(camera,canvas);this.controls.setSize(0.85);scene.add(this.controls.getHelper());
    Object.assign(this.controls,{minX:-1000,minY:-1000,minZ:-1000,maxX:1000,maxY:1000,maxZ:1000});
    this.controls.addEventListener('mouseDown',()=>{
      this.callbacks.beforeDrag();
      try {
        if(!input.beginTransform(this.layers().active.layer.editable,callbacks.busy()))throw new Error('This layer cannot be transformed now.');
        this.layers().beginTransform();callbacks.camera(false);
      }catch(error){input.end('transform');this.controls.pointerUp(null);callbacks.error(error instanceof Error?error.message:'Unable to transform layer.');}
    });
    this.controls.addEventListener('objectChange',()=>{
      if(!this.layers().transforming)return;
      const object=this.controls.object!;
      const next:VolumeTransform={position:[object.position.x,object.position.y,object.position.z],rotation:[object.rotation.x,object.rotation.y,object.rotation.z],scale:[object.scale.x,object.scale.y,object.scale.z]};
      if(this.controls.mode==='scale'){
        const previous=this.layers().active.layer.transform.scale[0],value=Number.isNaN(next.scale[0])?previous:Math.min(1000,Math.max(0.001,next.scale[0]));next.scale=[value,value,value];
      }
      try{this.layers().updateTransform(next);callbacks.changed();}
      catch(error){this.layers().cancelTransform();this.controls.pointerUp(null);callbacks.error(error instanceof Error?error.message:'Invalid transform.');}
    });
    this.controls.addEventListener('dragging-changed',event=>{
      if(event.value)return;
      this.layers().finishTransform();input.end('transform');callbacks.camera(input.cameraEnabled);callbacks.changed();
    });
    this.sync();
  }
  setMode(mode:EditorMode):void {this.finish();this.input.mode=mode;this.sync();}
  setSpace(space:TransformSpace):void {this.finish();this.input.space=space;this.sync();}
  sync():void {
    const layer=this.layers().active.layer;
    let allowed=this.input.mode!=='sculpt'&&layer.editable&&!this.callbacks.busy();
    if(allowed&&this.input.mode==='scale'){try{uniformScale(layer.transform);}catch(error){allowed=false;this.callbacks.error((error as Error).message);}}
    this.controls.enabled=allowed;
    if(!allowed){this.controls.detach();return;}
    this.controls.setMode(this.input.mode==='sculpt'?'translate':this.input.mode);this.controls.setSpace(this.input.space);
    const object=this.layers().active.surface.group;if(this.controls.object!==object)this.controls.attach(object);
  }
  finish():void {
    if(this.controls.dragging){this.controls.pointerUp(null);this.controls.disconnect();this.controls.connect(this.canvas);}
    this.layers().finishTransform();this.input.end('transform');this.callbacks.camera(this.input.cameraEnabled);
  }
  dispose():void {this.finish();this.controls.dispose();this.controls.getHelper().removeFromParent();}
}
