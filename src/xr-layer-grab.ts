import {Euler,Matrix4,Quaternion,Vector3} from 'three';
import type {IndependentLayers} from './independent-layers';
import type {XRControllerState} from './xr-input';
import {uniformScale} from './transform';
/** Layer metadata transaction. Controller anchors live in sculpture coordinates,
 * so workspace presentation never writes into the layer. */
export class XRLayerGrab {
 private owner=0;private id='';private startScale=1;
 private readonly anchor=new Matrix4();private readonly initial=new Matrix4();private readonly local=new Matrix4();private readonly result=new Matrix4();
 private readonly position=new Vector3();private readonly rotation=new Quaternion();private readonly size=new Vector3();private readonly euler=new Euler();
 constructor(private readonly layers:()=>IndependentLayers,private readonly issue:(event:'cancel'|'error')=>void=()=>{}){}
 finish():void{if(this.active)this.layers().finishTransform();this.owner=0;this.id='';}
 get active():boolean{return this.owner!==0;}
 owns(id:number):boolean{return this.active&&this.owner===id;}
 cancel():void{if(this.active)this.issue('cancel');if(this.active)this.layers().cancelTransform();this.owner=0;this.id='';}
 step(tool:XRControllerState|undefined,pose:Matrix4|undefined,_time:number,enabled=true):boolean{
  const layers=this.layers(),valid=enabled&&tool?.role==='tool'&&tool.connected&&tool.gripTracked&&pose&&pose.elements.every(Number.isFinite)&&Math.abs(pose.determinant())>1e-10&&layers.viewMode==='separate'&&layers.project.layerStack.layers.some(l=>l.id===layers.project.activeLayerId)&&layers.active.layer.editable;
  if(!valid||this.active&&(tool!.connectionId!==this.owner||layers.active.layer.id!==this.id||!layers.transforming)){const interrupted=this.active;this.cancel();return interrupted;}
  if(this.active&&!tool!.buttons.grip.pressed){layers.finishTransform();this.owner=0;this.id='';return false;}
  if(!this.active&&(!tool!.buttons.grip.justPressed||!tool!.buttons.grip.pressed))return false;
  // Inverse current sculpture parent removes all navigation TRS, including scale.
  layers.group.updateWorldMatrix(true,false);this.local.copy(layers.group.matrixWorld).invert().multiply(pose!);
  this.local.decompose(this.position,this.rotation,this.size);this.local.compose(this.position,this.rotation.normalize(),this.size.setScalar(1));
  if(!this.active){
   try{this.startScale=uniformScale(layers.active.layer.transform);layers.beginTransform();}catch{this.issue('error');return false;}
   this.owner=tool!.connectionId;this.id=layers.active.layer.id;
   this.anchor.copy(this.local).invert();layers.active.surface.group.updateMatrix();this.initial.copy(layers.active.surface.group.matrix);return false;
  }
  this.result.copy(this.local).multiply(this.anchor).multiply(this.initial);this.result.decompose(this.position,this.rotation,this.size);this.euler.setFromQuaternion(this.rotation,'XYZ');
  try{layers.updateTransform({position:this.position.toArray(),rotation:[this.euler.x,this.euler.y,this.euler.z],scale:[this.startScale,this.startScale,this.startScale]});}
  catch{this.cancel();this.issue('error');return true;}return false;
 }
}
