import {Box3,BoxGeometry,EdgesGeometry,Group,LineBasicMaterial,LineSegments,Matrix4,Mesh,Raycaster,Vector3} from 'three';
import type {Intersection,Object3D} from 'three';
import type {IndependentLayers,LayerRuntime} from './independent-layers';
import type {EditorToolState} from './editor-tool-state';
import type {XRControllerState} from './xr-input';
import type {ChunkSurface} from './surface';
/** Existing mesh ray tests and two reusable 12-edge bounds outlines. No source
 * material mutation, SDF sampling, duplicate meshes or project/history edits. */
export class XRLayerSelection {
 readonly group=new Group();readonly selected:LineSegments;readonly hover:LineSegments;
 hoveredId:string|null=null;feedback='';raycastMs=0;visualMs=0;boundsBuilds=0;
 private readonly raycaster=new Raycaster();private readonly direction=new Vector3();private readonly hits:Intersection<Object3D>[]=[];
 private readonly cache=new WeakMap<ChunkSurface,{revision:number;box:Box3}>();private readonly center=new Vector3();private readonly size=new Vector3();private readonly inverse=new Matrix4();private readonly local=new Matrix4();
 private armed=false;private owner=0;private project:unknown;
 constructor(private readonly layers:()=>IndependentLayers,private readonly tools:EditorToolState,root:Group){
  const box=new BoxGeometry(1,1,1),geometry=new EdgesGeometry(box);box.dispose();
  this.selected=new LineSegments(geometry,new LineBasicMaterial({color:'#b1e6cd',transparent:true,opacity:.8,depthTest:false,depthWrite:false,toneMapped:false}));
  this.hover=new LineSegments(geometry,new LineBasicMaterial({color:'#b4d1ef',transparent:true,opacity:.4,depthTest:false,depthWrite:false,toneMapped:false}));
  for(const line of [this.selected,this.hover]){line.matrixAutoUpdate=false;line.frustumCulled=false;line.renderOrder=21;line.raycast=()=>{};line.visible=false;this.group.add(line);}
  this.group.name='VR layer selection outlines · presentation only';this.group.userData.previewOnly=true;this.group.visible=false;root.add(this.group);
 }
 cancel():void{this.armed=false;this.owner=0;this.project=undefined;this.hoveredId=null;this.feedback='';this.group.visible=this.selected.visible=this.hover.visible=false;}
 update(tool:XRControllerState|undefined,pose:Matrix4|undefined,_time:number,pointerEnabled:boolean,active=true,layersMenu=false,showBounds=layersMenu):number|null {
  const layers=this.layers();this.raycastMs=this.visualMs=0;
  if(!active){this.cancel();return null;}
  const transform=this.tools.active==='transform',canSelect=transform||layersMenu;
  this.group.visible=true;this.hoveredId=null;let distance:number|null=null;
  if(this.project!==layers.project||this.owner!==tool?.connectionId){this.armed=false;this.project=layers.project;this.owner=tool?.connectionId??0;}
  const valid=canSelect&&pointerEnabled&&!this.tools.busy&&layers.viewMode==='separate'&&tool?.role==='tool'&&tool.connected&&tool.tracked&&tool.gripTracked&&pose&&pose.elements.every(Number.isFinite)&&Math.abs(pose.determinant())>1e-10&&!tool.buttons.grip.pressed&&tool.buttons.grip.rawValue<.45;
  if(valid){
   const start=performance.now();this.raycaster.ray.origin.setFromMatrixPosition(pose!);this.direction.set(0,0,-1).transformDirection(pose!);this.raycaster.ray.direction.copy(this.direction);this.raycaster.far=5;
   // Stack order is the stable tie-break for coincident surfaces; closest hit wins.
   for(const layer of layers.project.layerStack.layers){if(!layer.visible)continue;const surface=layers.runtime(layer.id).surface.group;if(!surface.visible)continue;surface.updateWorldMatrix(true,true);this.hits.length=0;this.raycaster.intersectObject(surface,true,this.hits);const hit=this.hits.find(h=>h.object.visible);if(hit&&(distance===null||hit.distance<distance-1e-6)){distance=hit.distance;this.hoveredId=layer.id;}}
   this.raycastMs=performance.now()-start;
   if(!tool!.buttons.trigger.pressed&&tool!.buttons.trigger.rawValue<.45)this.armed=true;
   else if(tool!.buttons.trigger.pressed){const select=this.armed&&tool!.buttons.trigger.justPressed;this.armed=false;if(select&&this.hoveredId&&(this.hoveredId!==layers.project.activeLayerId||!!layers.selectedGroupId))this.tools.selectLayer(this.hoveredId);}
  }else this.armed=false;
  const start=performance.now(),current=layers.active.layer;
  if(showBounds&&layers.selectedGroupId&&layers.viewMode==='separate')this.drawGroup(layers.selectedGroupId);else this.draw(this.selected,layers.active,showBounds&&layers.viewMode==='separate'&&current.visible);
  this.draw(this.hover,this.hoveredId?layers.runtime(this.hoveredId):layers.active,showBounds&&!!this.hoveredId&&this.hoveredId!==current.id);
  this.feedback=!canSelect?'':layers.viewMode!=='separate'?'Selection · use Separate Layers':`Selected: ${layers.transformNode.name}${current.locked?' · Locked':!current.visible?' · Hidden':''}`;
  if(transform&&layers.transforming)this.feedback+=' · Moving / rotating';
  if(this.hoveredId&&this.hoveredId!==current.id)this.feedback+=` · Pointing: ${layers.project.layerStack.get(this.hoveredId).name}`;
  this.visualMs=performance.now()-start;return distance;
 }
 private bounds(runtime:LayerRuntime):{revision:number;box:Box3}{const surface=runtime.surface;let cached=this.cache.get(surface);
  if(!cached||cached.revision!==surface.revision){const box=cached?.box??new Box3();box.makeEmpty();for(const object of surface.group.children)if(object instanceof Mesh){if(!object.geometry.boundingBox)object.geometry.computeBoundingBox();if(object.geometry.boundingBox)box.union(object.geometry.boundingBox);}cached={revision:surface.revision,box};this.cache.set(surface,cached);this.boundsBuilds++;}
return cached;}
 private readonly assemblyBox=new Box3();private readonly childBox=new Box3();
 private drawGroup(id:string):void{const l=this.layers(),line=this.selected;line.visible=false;this.assemblyBox.makeEmpty();for(const leaf of l.project.layerStack.hierarchy.descendants(id)){const source=l.project.layerStack.layers.find(n=>n.id===leaf);if(!source?.visible)continue;const runtime=l.runtime(leaf),box=this.bounds(runtime).box;runtime.surface.group.updateWorldMatrix(true,false);this.childBox.copy(box).applyMatrix4(runtime.surface.group.matrixWorld);this.assemblyBox.union(this.childBox);}if(this.assemblyBox.isEmpty())return;this.assemblyBox.getCenter(this.center);this.assemblyBox.getSize(this.size).multiplyScalar(1.006);line.matrix.makeScale(this.size.x,this.size.y,this.size.z).setPosition(this.center);this.group.updateWorldMatrix(true,false);line.matrix.premultiply(this.inverse.copy(this.group.matrixWorld).invert());line.visible=true;line.updateWorldMatrix(false,false);}
 private draw(line:LineSegments,runtime:LayerRuntime,visible:boolean):void {
  line.visible=false;if(!visible)return;const surface=runtime.surface,cached=this.bounds(runtime);
  if(cached.box.isEmpty())return;cached.box.getCenter(this.center);cached.box.getSize(this.size);this.size.multiplyScalar(1.006);this.local.makeScale(this.size.x,this.size.y,this.size.z);this.local.setPosition(this.center);surface.group.updateWorldMatrix(true,false);line.matrix.copy(surface.group.matrixWorld).multiply(this.local);this.group.updateWorldMatrix(true,false);this.inverse.copy(this.group.matrixWorld).invert();line.matrix.premultiply(this.inverse);line.visible=true;line.updateWorldMatrix(false,false);
 }
 dispose():void{this.cancel();this.selected.geometry.dispose();(this.selected.material as LineBasicMaterial).dispose();(this.hover.material as LineBasicMaterial).dispose();this.group.removeFromParent();}
}
