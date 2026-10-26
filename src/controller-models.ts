import {Group} from 'three';
import type {Object3D} from 'three';
export const CONTROLLER_DISPLAY_MODES=['realistic','simple','minimal'] as const;
export type ControllerDisplayMode=typeof CONTROLLER_DISPLAY_MODES[number];
export type ControllerAsset={object:Object3D;profile:string;assetUrl:string;bind:(source:XRInputSource)=>void;dispose?:()=>void};
export type ControllerModelProvider={load:(source:XRInputSource)=>Promise<ControllerAsset>;dispose?:()=>void};
export function validateControllerDisplay(value:unknown):ControllerDisplayMode{if(!CONTROLLER_DISPLAY_MODES.includes(value as ControllerDisplayMode))throw new Error('Invalid controller display mode.');return value as ControllerDisplayMode;}
export function controllerModelKey(source:XRInputSource):string{return `${source.handedness}:${source.profiles.join('|')}`;}
type Entry={source:XRInputSource|null;grip:Group|null;asset:ControllerAsset|null;status:'idle'|'loading'|'ready'|'fallback';error:string;generation:number};
/** A profile/hand cache decouples async visuals from frame input. Late results cannot attach to stale sources. */
export class ControllerModels {
 mode:ControllerDisplayMode='realistic';
 readonly entries:Entry[]=Array.from({length:2},()=>({source:null,grip:null,asset:null,status:'idle',error:'',generation:0}));
 private readonly cache=new Map<string,Promise<ControllerAsset>>();private disposed=false;
 get cacheSize():number{return this.cache.size;}
 constructor(private readonly provider:ControllerModelProvider){}
 connect(index:number,source:XRInputSource,grip:Group):void{
  const entry=this.entries[index];if(entry.source===source&&entry.grip===grip){if(this.mode==='realistic'&&entry.status==='idle')this.load(index);return;}
  this.disconnect(index);entry.source=source;entry.grip=grip;if(this.mode==='realistic')this.load(index);
 }
 private load(index:number):void{
  const entry=this.entries[index],source=entry.source;if(!source||source.handedness==='none'||source.hand||!source.gamepad||!source.gripSpace||source.targetRayMode!=='tracked-pointer'){entry.status='fallback';return;}
  const token=++entry.generation;entry.status='loading';entry.error='';const key=controllerModelKey(source);let request=this.cache.get(key);
  if(!request){request=Promise.resolve().then(()=>this.provider.load(source));this.cache.set(key,request);this.prune();}
  request.then(asset=>{if(this.disposed||token!==entry.generation||entry.source!==source)return;entry.asset=asset;asset.bind(source);entry.status='ready';if(this.mode==='realistic')entry.grip?.add(asset.object);}).catch(error=>{if(this.disposed||token!==entry.generation)return;if(this.cache.get(key)===request)this.cache.delete(key);entry.status='fallback';entry.error=error instanceof Error?error.message:String(error);});
 }
 private prune():void{const active=new Set(this.entries.flatMap(e=>e.source?[controllerModelKey(e.source)]:[]));for(const [key,promise]of this.cache){if(this.cache.size<=4)break;if(active.has(key))continue;this.cache.delete(key);void promise.then(async asset=>{const cached=await Promise.all([...this.cache.values()].map(p=>p.catch(()=>null)));if(!this.disposed&&!cached.some(a=>a?.object===asset.object)&&!this.entries.some(e=>e.asset?.object===asset.object))asset.dispose?.();},()=>{});}}
 setMode(value:unknown):void{this.mode=validateControllerDisplay(value);for(let i=0;i<2;i++){const entry=this.entries[i];if(this.mode==='realistic'){if(entry.asset)entry.grip?.add(entry.asset.object);else if((entry.status==='idle'||entry.status==='fallback'))this.load(i);}else entry.asset?.object.removeFromParent();}}
 ready(index:number):boolean{return this.mode==='realistic'&&this.entries[index].status==='ready';}
 disconnect(index:number):void{const entry=this.entries[index];entry.generation++;entry.asset?.object.removeFromParent();entry.source=null;entry.grip=null;entry.asset=null;entry.status='idle';entry.error='';}
 stop():void{this.disconnect(0);this.disconnect(1);}
 dispose():void{this.disposed=true;this.stop();this.cache.clear();this.provider.dispose?.();}
}
