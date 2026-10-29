import {Box3,BufferAttribute,Mesh,type Group,type MeshStandardMaterial} from 'three';
import type {VolumeStore} from './volume-store';
import {sculptMask} from './sculpt-mask';
/** Existing surface shader tint: no duplicate mesh, raycast target or exported material. */
export class MaskOverlay {
 private readonly enabled={value:1};
 private readonly states=new WeakMap<object,{revision:number;volume:VolumeStore;cursor:number}>();
 bind(material:MeshStandardMaterial):void{
  Object.assign(material,{defaultAttributeValues:{sculptMaskWeight:[0]}});
  material.onBeforeCompile=shader=>{shader.uniforms.maskOverlayEnabled=this.enabled;shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float sculptMaskWeight; varying float maskProtection;').replace('#include <begin_vertex>','#include <begin_vertex>\nmaskProtection=sculptMaskWeight;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float maskOverlayEnabled; varying float maskProtection;').replace('#include <opaque_fragment>','outgoingLight=mix(outgoingLight,vec3(0.56,0.16,0.85),clamp(maskProtection,0.0,1.0)*0.68*maskOverlayEnabled);\n#include <opaque_fragment>');};
  material.customProgramCacheKey=()=> 'centra-mask-overlay-v1';
 }
 private readonly dirtyBox=new Box3();private next=0;
 update(group:Group,volume:VolumeStore,visible:boolean,deadline:number):void{
  this.enabled.value=visible?1:0;const mask=sculptMask(volume),dirty=mask.takeDirty(),point={x:0,y:0,z:0},pending:{geometry:Mesh['geometry'];attribute:BufferAttribute;state:{revision:number;volume:VolumeStore;cursor:number};position:ReturnType<Mesh['geometry']['getAttribute']>}[]=[];
  if(dirty&&dirty!=='all'){this.dirtyBox.min.set(volume.coordinate(dirty.min[0],0)-volume.step,volume.coordinate(dirty.min[1],1)-volume.step,volume.coordinate(dirty.min[2],2)-volume.step);this.dirtyBox.max.set(volume.coordinate(dirty.max[0],0)+volume.step,volume.coordinate(dirty.max[1],1)+volume.step,volume.coordinate(dirty.max[2],2)+volume.step);}
  for(const object of group.children){if(!(object instanceof Mesh))continue;const geometry=object.geometry,p=geometry.getAttribute('position');if(!p)continue;
   let attribute=geometry.getAttribute('sculptMaskWeight') as BufferAttribute|undefined,state=this.states.get(geometry);const fresh=!state||state.volume!==volume,affected=dirty==='all'||!!dirty&&(!geometry.boundingSphere||this.dirtyBox.intersectsSphere(geometry.boundingSphere));
   if(fresh){state={revision:mask.revision,volume,cursor:mask.empty?p.count:0};this.states.set(geometry,state!);}
   if(!affected&&!fresh&&state!.cursor===p.count)continue;
   if(affected){state!.revision=mask.revision;state!.cursor=0;}
   if(!attribute&&mask.empty){state!.cursor=p.count;continue;}
   if(!attribute&&!fresh&&!affected&&state!.cursor===p.count)continue;
   if(!attribute){attribute=new BufferAttribute(new Float32Array(p.count),1);geometry.setAttribute('sculptMaskWeight',attribute);}
   if(state!.cursor<p.count)pending.push({geometry,attribute,state:state!,position:p});
  }
  // Fair round-robin completion: continuous painting cannot starve later chunks.
  for(let j=0;j<pending.length;j++){const at=(this.next+j)%pending.length,{attribute,state,position:p}=pending[at];
   for(;state.cursor<p.count;state.cursor++){const i=state.cursor;point.x=p.getX(i);point.y=p.getY(i);point.z=p.getZ(i);attribute.setX(i,mask.sample(point));if(i%256===255&&performance.now()>=deadline){state.cursor++;attribute.needsUpdate=true;this.next=at+1;return;}}
   attribute.needsUpdate=true;if(performance.now()>=deadline){this.next=at+1;return;}
  }this.next=0;
 }
}
