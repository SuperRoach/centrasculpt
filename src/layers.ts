import {validateTube,type TubeSource} from './procedural-tube';
import type {ToolPreferences} from './tool-preferences';
import type { ProjectDisplayPreferences } from './display-preferences';
import type { VolumeStore } from './volume-store';
import { identityTransform, validateTransform } from './transform';
import type { VolumeTransform } from './transform';
import type { ProjectSettings } from './project';
export type LayerOperation='union'|'difference'|'intersect';
export type LayerMetadata={id:string;name:string;transform:VolumeTransform;visible:boolean;locked:boolean;operation:LayerOperation;order:number;procedural?:TubeSource};
/** randomUUID requires a secure context; getRandomValues also works on HTTP LAN origins. */
export function newId(): string {
  if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function validateId(value: unknown): string {
  if(typeof value!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value))throw new Error('Invalid stable ID.');return value;
}
export function validateName(value: unknown): string {if(typeof value!=='string'||!value.trim()||value.length>128)throw new Error('Name must contain 1–128 characters.');return value;}
export function validateLayerMetadata(value: unknown): LayerMetadata {
  if(!value||typeof value!=='object')throw new Error('Invalid layer metadata.');
  const m=value as Record<string,unknown>;
  if(typeof m.visible!=='boolean'||typeof m.locked!=='boolean')throw new Error('Invalid layer visibility or locking flag.');
  if(!['union','difference','intersect'].includes(String(m.operation))||typeof m.operation!=='string')throw new Error('Invalid layer Boolean operation.');
  if(!Number.isInteger(m.order)||(m.order as number)<0)throw new Error('Invalid layer order.');
  return {procedural:m.procedural===undefined?undefined:validateTube(m.procedural),id:validateId(m.id),name:validateName(m.name),transform:validateTransform(m.transform),visible:m.visible,locked:m.locked,operation:m.operation as LayerOperation,order:m.order as number};
}
export class SdfLayer {
  procedural?:TubeSource;
  readonly id: string;
  name: string;
  transform: VolumeTransform;
  visible: boolean;
  locked: boolean;
  operation: LayerOperation;
  order: number;
  constructor(public volume: VolumeStore,metadata: Partial<LayerMetadata>={}) {
    const m=validateLayerMetadata({id:newId(),name:'Base',transform:identityTransform(),visible:true,locked:false,operation:'union',order:0,...metadata});
    this.procedural=m.procedural;this.id=m.id;this.name=m.name;this.transform=m.transform;this.visible=m.visible;this.locked=m.locked;this.operation=m.operation;this.order=m.order;
  }
  get dimensions() {return this.volume.dimensions;}
  get voxelSize() {return this.volume.voxelSize;}
  get editable(): boolean {return this.visible&&!this.locked;}
  assertEditable(): void {if(!this.visible)throw new Error(`Layer “${this.name}” is hidden.`);if(this.locked)throw new Error(`Layer “${this.name}” is locked.`);}
  metadata(): LayerMetadata {return validateLayerMetadata({procedural:this.procedural,id:this.id,name:this.name,transform:this.transform,visible:this.visible,locked:this.locked,operation:this.operation,order:this.order});}
}
/** Reject accidental aliasing rather than silently cloning, merging or resampling any layer. */
export function assertIndependentLayerVolumes(layers: readonly SdfLayer[]): void {
  const volumes=new Set<VolumeStore>(),buffers=new Set<ArrayBufferLike>();
  for(const layer of layers) {
    const buffer=layer.volume.getDenseView()?.buffer;
    if(volumes.has(layer.volume)||(buffer&&buffers.has(buffer)))throw new Error('Layers must own independent voxel storage; shared volumes or buffers are not allowed.');
    volumes.add(layer.volume);if(buffer)buffers.add(buffer);
  }
}
/** Stable ordered ownership. Layer volumes are never composed or merged by this model. */
export class LayerStack {
  private readonly entries: SdfLayer[];
  private selected: string;
  constructor(layers: SdfLayer[],activeLayerId=layers[0]?.id) {
    if(!layers.length||new Set(layers.map(l=>l.id)).size!==layers.length||new Set(layers.map(l=>l.order)).size!==layers.length)throw new Error('Layer IDs and ordering must be unique; a project needs at least one layer.');
    assertIndependentLayerVolumes(layers);layers.forEach(l=>l.metadata());this.entries=[...layers].sort((a,b)=>a.order-b.order);
    this.selected=validateId(activeLayerId);this.select(this.selected);
  }
  get layers(): readonly SdfLayer[] {return [...this.entries];}
  get activeLayerId(): string {return this.selected;}
  get active(): SdfLayer {return this.get(this.selected);}
  get(id: string): SdfLayer {const layer=this.entries.find(l=>l.id===id);if(!layer)throw new Error('Target layer does not exist.');return layer;}
  select(id: string): void {this.get(id);this.selected=id;}
  editableActive(): SdfLayer {const layer=this.active;layer.assertEditable();return layer;}
  insert(layer: SdfLayer,index=this.entries.length): void {
    if(this.entries.some(entry=>entry.id===layer.id))throw new Error('Layer ID already exists.');
    if(!Number.isInteger(index)||index<0||index>this.entries.length)throw new Error('Invalid layer position.');
    layer.metadata();assertIndependentLayerVolumes([...this.entries,layer]);this.entries.splice(index,0,layer);this.entries.forEach((entry,i)=>entry.order=i);this.selected=layer.id;
  }
  remove(id: string): SdfLayer {
    if(this.entries.length===1)throw new Error('Keep at least one layer in the project.');
    const layer=this.get(id),index=this.entries.indexOf(layer);this.entries.splice(index,1);
    if(this.selected===id)this.selected=this.entries[Math.min(index,this.entries.length-1)].id;
    this.entries.forEach((entry,i)=>entry.order=i);return layer;
  }
  move(id: string,index: number): void {
    if(!Number.isInteger(index)||index<0||index>=this.entries.length)throw new Error('Invalid layer position.');
    const layer=this.get(id);this.entries.splice(this.entries.indexOf(layer),1);this.entries.splice(index,0,layer);this.entries.forEach((entry,i)=>entry.order=i);
  }
}
export class SculptProject {
  toolPreferences?:ToolPreferences;
  displayPreferences?:ProjectDisplayPreferences;
  readonly id: string;
  constructor(readonly layerStack: LayerStack,public settings: ProjectSettings,public name='Untitled',id=newId()) {this.id=validateId(id);validateName(name);}
  get activeLayerId(): string {return this.layerStack.activeLayerId;}
  get activeLayer(): SdfLayer {return this.layerStack.active;}
  editActive<T>(command: (layer: SdfLayer)=>T): T {return command(this.layerStack.editableActive());}
}
export function createBaseProject(volume: VolumeStore,settings: ProjectSettings,legacy=false): SculptProject {
  const layer=new SdfLayer(volume,legacy?{id:'base'}:{});return new SculptProject(new LayerStack([layer]),settings);
}
