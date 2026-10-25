import {Group,LoadingManager} from 'three';
import type {Object3D,Material,Texture,BufferGeometry} from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {XRControllerModelFactory} from 'three/addons/webxr/XRControllerModelFactory.js';
import type {ControllerAsset,ControllerModelProvider} from './controller-models';
/** Isolated factory lifecycle avoids accumulating factory listeners on native grip groups. */
export class FactoryControllerModelProvider implements ControllerModelProvider {
 private disposed=false;
 private readonly pending=new Set<()=>void>();
 private readonly resources=new Set<{dispose:()=>void}>();
 constructor(readonly path='https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles',readonly timeoutMs=10000){}
 load(source:XRInputSource):Promise<ControllerAsset>{
  if(this.disposed)return Promise.reject(new Error('Controller model provider disposed.'));
  return new Promise((resolve,reject)=>{
   let settled=false;const cancel=()=>fail(new Error('Controller model provider disposed.'));const proxy=new Group(),manager=new LoadingManager();
   const fail=(error:unknown)=>{if(settled)return;settled=true;clearTimeout(timer);this.pending.delete(cancel);model.motionController=null;reject(new Error(error instanceof Error?error.message:'Controller model unavailable; using indicators.'));};
   const timer=setTimeout(()=>fail(new Error('Controller profile/model load timed out; using indicators.')),this.timeoutMs);
   this.pending.add(cancel);
   // The factory's supplied asset error callback throws asynchronously. Intercept failures instead.
   const loader=new GLTFLoader(manager),baseLoad=loader.load.bind(loader);
   loader.load=(url,onLoad,onProgress)=>{if(settled)return;return baseLoad(url,asset=>{this.collect(asset.scene);if(!settled)onLoad(asset);},onProgress,error=>fail(error));};
   const factory=new XRControllerModelFactory(loader,()=>{
    if(settled)return;settled=true;clearTimeout(timer);this.pending.delete(cancel);this.collect(model);
    const motion=model.motionController as {id:string;assetUrl:string;xrInputSource:XRInputSource};
    resolve({object:model,profile:motion.id,assetUrl:motion.assetUrl,bind:s=>{motion.xrInputSource=s;}});
   });factory.setPath(this.path);const model=factory.createControllerModel(proxy);model.name=`Profile controller ${source.handedness}`;
   proxy.dispatchEvent({type:'connected',data:source} as never);
  });
 }
 private collect(object:Object3D):void{object.traverse(child=>{const mesh=child as Object3D&{geometry?:BufferGeometry;material?:Material|Material[]};if(mesh.geometry){if(this.disposed)mesh.geometry.dispose();else this.resources.add(mesh.geometry);}const materials=mesh.material?(Array.isArray(mesh.material)?mesh.material:[mesh.material]):[];for(const material of materials){if(this.disposed)material.dispose();else this.resources.add(material);for(const value of Object.values(material))if(value&&(value as Texture).isTexture){if(this.disposed)(value as Texture).dispose();else this.resources.add(value as Texture);}}});}
 dispose():void{this.disposed=true;for(const cancel of this.pending)cancel();this.pending.clear();for(const resource of this.resources)resource.dispose();this.resources.clear();}
}
