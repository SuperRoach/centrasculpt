import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, LineSegments, LineBasicMaterial, EdgesGeometry, SphereGeometry, Euler, Quaternion, Vector3 } from 'three';
import type { LayerStack } from './layers';
import { defineShape, validateShapeDefinition, shapeStampIntent, SHAPE_METADATA } from './shapes';
import type { ShapeDefinition, ShapeKind, ShapePreviewPort } from './shapes';
import { transformMatrix, identityTransform, hasUniformScale, validateTransform } from './transform';
import type { VolumeTransform } from './transform';
import { shapePolyhedron } from './shape-library';

/** Session-only preview state. It cannot write volumes or execute stamp intents. */
export class ShapePreviewModel {
  private value:ShapeDefinition;
  enabled=false;
  followPointer=true;
  rotationMode=false;
  moveMode=false;
  dragging=false;
  get manipulating():boolean{return this.rotationMode||this.moveMode;}
  constructor(targetLayerId:string){this.value=this.initial(targetLayerId);}
  private initial(targetLayerId:string):ShapeDefinition {return defineShape({kind:'sphere',targetLayerId,operation:'add',dimensions:[.8,.8,.8],transform:{...identityTransform(),position:[1.05,0,0]}});}
  get definition():ShapeDefinition {return validateShapeDefinition(this.value);}
  reset(targetLayerId:string):void {this.value=this.initial(targetLayerId);this.enabled=false;this.followPointer=true;this.rotationMode=false;this.moveMode=false;this.dragging=false;}
  sync(stack:LayerStack):void {if(this.value.targetLayerId!==stack.activeLayerId)this.value={...this.value,targetLayerId:stack.activeLayerId};}
  availability(stack:LayerStack):string|null {
    const layer=stack.active;if(!layer.visible)return 'Show the active layer to preview shapes.';if(layer.locked)return 'Unlock the active layer to preview shapes.';
    try{validateTransform(layer.transform);}catch{return 'A valid positive layer transform is required for shape preview.';}
    if(!hasUniformScale(layer.transform))return 'A positive uniform layer scale is required for shape preview.';return null;
  }
  set(value:unknown,stack:LayerStack):void {
    this.sync(stack);const reason=this.availability(stack);if(reason)throw new Error(reason);
    const next=validateShapeDefinition(value);if(next.targetLayerId!==stack.activeLayerId)throw new Error('Preview must target the active layer.');this.value=next;
  }
  setWorldTransform(transform:unknown,stack:LayerStack):void {
    this.sync(stack);const reason=this.availability(stack);if(reason)throw new Error(reason);
    if(!transform||typeof transform!=='object')throw new Error('Invalid shape world pose.');
    const world=transform as VolumeTransform;
    for(const key of ['position','rotation','scale'] as const)if(!Array.isArray(world[key])||world[key].length!==3||!world[key].every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1e12&&(key!=='scale'||v>0)))throw new Error('Shape world pose must contain finite coordinates and positive scale.');
    if(Math.max(Math.abs(world.scale[0]-world.scale[1]),Math.abs(world.scale[0]-world.scale[2]))>1e-8*Math.max(...world.scale))throw new Error('Shape world scale must be uniform.');
    const local=transformMatrix(stack.active.transform).invert().multiply(transformMatrix(world)),position=new Vector3(),quaternion=new Quaternion(),scale=new Vector3();local.decompose(position,quaternion,scale);
    // World values can exceed a single local metadata range. Validate the converted pose,
    // snapping only floating-point noise at existing local position/scale limits.
    const clampNoise=(v:number,low:number,high:number)=>v<low&&low-v<1e-12*Math.max(1,Math.abs(low))?low:v>high&&v-high<1e-12*Math.max(1,Math.abs(high))?high:v;
    const s=clampNoise(scale.x,.001,1000),rotation=new Euler().setFromQuaternion(quaternion,'XYZ');
    this.set({...this.definition,transform:{position:position.toArray().map(v=>clampNoise(v,-1000,1000)) as [number,number,number],rotation:[rotation.x,rotation.y,rotation.z],scale:[s,s,s]}},stack);
  }
  setEnabled(enabled:boolean,stack:LayerStack):void {
    this.enabled=enabled;
    if(!enabled){this.rotationMode=false;this.moveMode=false;}
    else if(!this.followPointer&&!this.rotationMode&&!this.availability(stack))this.moveMode=true;
  }
  setSurfaceFollow(enabled:boolean,stack:LayerStack):void {
    const reason=this.availability(stack);if(reason)throw new Error(reason);
    this.followPointer=enabled;
    if(enabled){this.rotationMode=false;this.moveMode=false;}
    else if(this.enabled&&!this.rotationMode)this.moveMode=true;
  }
  canApply(stack:LayerStack,busy=false):boolean {return this.enabled&&!this.rotationMode&&!this.dragging&&!busy&&!this.availability(stack);}
  setRotationMode(enabled:boolean,stack:LayerStack):void {
    if(enabled){this.sync(stack);const reason=this.availability(stack);if(!this.enabled||reason)throw new Error(reason??'Enable a shape ghost before rotating it.');this.followPointer=false;}
    this.rotationMode=enabled;if(enabled)this.moveMode=false;else if(this.enabled&&!this.followPointer&&!this.availability(stack))this.moveMode=true;
  }
  setMoveMode(enabled:boolean,stack:LayerStack):void {
    if(enabled){this.sync(stack);const reason=this.availability(stack);if(!this.enabled||reason)throw new Error(reason??'Enable a shape ghost before moving it.');this.followPointer=false;}
    this.moveMode=enabled;if(enabled)this.rotationMode=false;
  }
  worldTransform(stack:LayerStack):VolumeTransform {
    this.sync(stack);const matrix=transformMatrix(stack.active.transform).multiply(transformMatrix(this.value.transform)),position=new Vector3(),quaternion=new Quaternion(),scale=new Vector3();matrix.decompose(position,quaternion,scale);const e=new Euler().setFromQuaternion(quaternion,'XYZ');return {position:position.toArray(),rotation:[e.x,e.y,e.z],scale:[scale.x,scale.x,scale.x]};
  }
  /** Freeze a validated intent for the explicit stamp command. */
  futureStampIntent(stack:LayerStack){this.sync(stack);const reason=this.availability(stack);if(reason)throw new Error(reason);return shapeStampIntent(this.definition,stack);}
}
type GeometryPair={solid:BufferGeometry;edges:BufferGeometry};
function createPreviewGeometry(kind:ShapeKind):GeometryPair {
  if(kind==='sphere'){
    const solid=new SphereGeometry(.5,32,20),positions:number[]=[];
    for(let plane=0;plane<3;plane++)for(let i=0;i<64;i++)for(const angle of [i*Math.PI*2/64,(i+1)*Math.PI*2/64]){const c=.5*Math.cos(angle),s=.5*Math.sin(angle);positions.push(...(plane===0?[c,s,0]:plane===1?[c,0,s]:[0,c,s]));}
    const edges=new BufferGeometry();edges.setAttribute('position',new Float32BufferAttribute(positions,3));return {solid,edges};
  }
  const poly=shapePolyhedron(kind,[1,1,1]),positions=poly.faces.flatMap(face=>face.flatMap(i=>poly.vertices[i])),solid=new BufferGeometry();solid.setAttribute('position',new Float32BufferAttribute(positions,3));solid.computeVertexNormals();solid.computeBoundingSphere();return {solid,edges:new EdgesGeometry(solid)};
}
export class ShapeGhost implements ShapePreviewPort {
  readonly group=new Group();
  readonly model:ShapePreviewModel;
  private readonly pose=new Group();
  private readonly cache=new Map<ShapeKind,GeometryPair>();
  private readonly solidMaterial=new MeshStandardMaterial({color:0x38a09a,transparent:true,opacity:.18,roughness:.55,depthWrite:false});
  private readonly edgeMaterial=new LineBasicMaterial({color:0x267c78,transparent:true,opacity:.65,depthWrite:false,depthTest:false});
  private solid:Mesh|null=null;
  private edges:LineSegments|null=null;
  private kind:ShapeKind|null=null;
  private key='';
  stats={updates:0,totalMs:0,lastMs:0,geometryBuilds:0};
  constructor(private readonly stack:()=>LayerStack,model?:ShapePreviewModel){this.model=model??new ShapePreviewModel(stack().activeLayerId);this.group.name='Shape Ghost · not project geometry';this.group.userData.previewOnly=true;this.group.matrixAutoUpdate=false;this.pose.matrixAutoUpdate=false;this.group.add(this.pose);this.group.visible=false;}
  preview(definition:Readonly<ShapeDefinition>):void {this.model.set(definition,this.stack());this.model.setEnabled(true,this.stack());this.sync();}
  clear():void {this.model.setEnabled(false,this.stack());this.sync();}
  sync(busy=false):boolean {
    const stack=this.stack();this.model.sync(stack);const layer=stack.active,d=this.model.definition;
    const key=JSON.stringify([d,this.model.enabled,busy,layer.id,layer.visible,layer.locked,layer.transform]);if(key===this.key)return false;this.key=key;
    const start=performance.now();this.group.visible=this.model.enabled&&!busy&&!this.model.availability(stack);
    if(this.group.visible){
      if(this.kind!==d.kind){let geometry=this.cache.get(d.kind);if(!geometry){geometry=createPreviewGeometry(d.kind);this.cache.set(d.kind,geometry);this.stats.geometryBuilds++;}
        if(!this.solid){this.solid=new Mesh(geometry.solid,this.solidMaterial);this.edges=new LineSegments(geometry.edges,this.edgeMaterial);this.solid.raycast=()=>{};this.edges.raycast=()=>{};this.pose.add(this.solid,this.edges);}
        else{this.solid.geometry=geometry.solid;this.edges!.geometry=geometry.edges;}this.kind=d.kind;
      }
      this.group.matrix.copy(transformMatrix(layer.transform));this.pose.matrix.copy(transformMatrix(d.transform));this.solid!.scale.fromArray(d.dimensions);this.edges!.scale.fromArray(d.dimensions);
      this.solidMaterial.color.set(d.operation==='add'?'#38a09a':'#cb624d');this.edgeMaterial.color.set(d.operation==='add'?'#267c78':'#a83f2c');this.edges!.renderOrder=20;this.group.updateWorldMatrix(true,true);
    }
    this.stats.lastMs=performance.now()-start;this.stats.totalMs+=this.stats.lastMs;this.stats.updates++;return true;
  }
  /** Bounds warning is presentation only; it never changes a stamp definition. */
  setWarning(warning:boolean):void {
    const subtract=this.model.definition.operation==='subtract';
    this.solidMaterial.color.set(warning?'#e8b174':subtract?'#cb624d':'#38a09a');
    this.edgeMaterial.color.set(warning?'#ffc66e':subtract?'#a83f2c':'#267c78');
  }
  get cachedShapes():number{return this.cache.size;}
  reset():void {this.model.reset(this.stack().activeLayerId);this.key='';this.sync();}
  dispose():void {for(const geometry of this.cache.values()){geometry.solid.dispose();geometry.edges.dispose();}this.cache.clear();this.solidMaterial.dispose();this.edgeMaterial.dispose();this.group.removeFromParent();this.group.clear();}
}
export function shapeDimensionsForKind(kind:ShapeKind,dimensions:readonly number[]):[number,number,number]{const rule=SHAPE_METADATA[kind].dimensionRule;return rule==='diameter'?[dimensions[0],dimensions[0],dimensions[0]]:rule==='square-base'?[dimensions[0],dimensions[1],dimensions[0]]:[dimensions[0],dimensions[1],dimensions[2]];}
