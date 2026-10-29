import {REFERENCE_LIMITS} from './reference-images';
import {validateToolPreferences} from './tool-preferences';
import {requireLegacyCubicGrid,isLegacyCubicGrid,volumeSampleCount} from './volume-store';
import {BRUSH_RADIUS_LIMITS} from './brush-settings';
import {validateProjectDisplay,type ProjectDisplayPreferences} from './display-preferences';
import { SculptProject, LayerStack, SdfLayer, createBaseProject, validateId, validateName, validateLayerMetadata } from './layers';
import type { VolumeStore } from './volume-store';
import { SDFVolume } from './sdf';
import { MAX_RESOLUTION } from './resolution';
import {sculptMask} from './sculpt-mask';
import type { BrushMode } from './sdf';
export type SculptSettings = { mode: BrushMode; radius: number; strength: number; hardness: number };
export type ProjectSettings = SculptSettings & { camera: { position: [number,number,number]; target: [number,number,number] } };
const MAGIC = [70,79,82,77,83,68,70,0]; // FORMSDF\0
export const PROJECT_VERSION = 6;
export const MAX_PROJECT_RESOLUTION = MAX_RESOLUTION;
export const MAX_PROJECT_TRIANGLES = 1_000_000;
export const MAX_PROJECT_LAYERS=8;
export const MAX_PROJECT_VOXELS=2*MAX_PROJECT_RESOLUTION**3;
export const MAX_PROJECT_BYTES = 16 + 65536 + MAX_PROJECT_VOXELS * 12 + REFERENCE_LIMITS.totalBytes;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Project metadata must be an object.');
  return value as Record<string,unknown>;
}
function triple(value: unknown): [number,number,number] {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(v=>typeof v==='number' && Number.isFinite(v) && Math.abs(v)<=1000)) throw new Error('Invalid camera coordinates.');
  return [...value] as [number,number,number];
}
function validateSettings(value: unknown, version = PROJECT_VERSION): ProjectSettings {
  const data=object(value), camera=object(data.camera);
  if (!['add','subtract','smooth','flatten','inflate','scrape','pinch','crease','mask','mask-erase'].includes(String(data.mode)) || typeof data.mode !== 'string') throw new Error('Unknown brush mode.');
  if (typeof data.radius !== 'number' || !Number.isFinite(data.radius) || data.radius < BRUSH_RADIUS_LIMITS.min || data.radius > BRUSH_RADIUS_LIMITS.max) throw new Error('Brush radius must be between 0.12 and 0.50.');
  if (typeof data.strength !== 'number' || !Number.isFinite(data.strength) || data.strength < 0.01 || data.strength > 1) throw new Error('Brush strength must be between 0.01 and 1.');
  const hardness=version===1?0:data.hardness;
  if(typeof hardness!=='number'||!Number.isFinite(hardness)||hardness<0||hardness>1)throw new Error('Brush hardness must be between 0 and 1.');
  const position=triple(camera.position), target=triple(camera.target);
  const distance=Math.hypot(...position.map((v,i)=>v-target[i]));
  if (distance<1.2-1e-6 || distance>9+1e-6) throw new Error('Camera distance is outside the supported range.');
  return {mode:data.mode as BrushMode,radius:data.radius,strength:data.strength,hardness,camera:{position,target}};
}
const TET_MASKS = [0b01100011,0b01000111,0b01001101,0b11001001,0b11010001,0b01110001];
const POPCOUNT = Array.from({length:256},(_,value)=>value.toString(2).replaceAll('0','').length);
function validateVoxels(values: Float32Array, resolution: number|[number,number,number], extent: number): number {
  const [nx,ny,nz]=typeof resolution==='number'?[resolution,resolution,resolution]:resolution;
  for(let z=0;z<nz;z++) for(let y=0;y<ny;y++) for(let x=0;x<nx;x++) {
    const value=values[x+nx*(y+ny*z)];
    if (!Number.isFinite(value) || Math.abs(value)>Math.fround(extent*4)) throw new Error('Voxel data contains non-finite or out-of-range values.');
    if ((x===0||y===0||z===0||x===nx-1||y===ny-1||z===nz-1) && value<=0) throw new Error('The SDF volume boundary must remain positive.');
  }
  // Reject pathological checkerboard fields before they can allocate enormous meshes.
  let triangles=0;
  const offsets=[0,1,1+nx,nx,nx*ny,1+nx*ny,1+nx+nx*ny,nx+nx*ny];
  for(let z=0;z<nz-1;z++)for(let y=0;y<ny-1;y++)for(let x=0;x<nx-1;x++) {
    const index=x+nx*(y+ny*z);
    let mask=0;
    for(let i=0;i<8;i++) if(values[index+offsets[i]]<0) mask|=1<<i;
    if(mask===0 || mask===255)continue;
    for(const tet of TET_MASKS) {
      const inside=POPCOUNT[mask&tet];triangles+=inside===2?2:inside===1||inside===3?1:0;
    }
    if(triangles>MAX_PROJECT_TRIANGLES) throw new Error(`Project surface exceeds the ${MAX_PROJECT_TRIANGLES.toLocaleString()} triangle import limit.`);
  }
  return triangles;
}
/** Native .form v2 (v1 remains readable): 8-byte magic, uint32 LE version + metadata byte count,
 * UTF-8 JSON metadata, then exactly resolution³ Float32 LE samples (x fastest).
 */
/** @deprecated Compatibility v2 writer. New application saves use saveSculptProject. */
export function saveProject(volume: SDFVolume, settings: ProjectSettings): ArrayBuffer {
  requireLegacyCubicGrid(volume,'Legacy project save');
  if (volume.resolution>MAX_PROJECT_RESOLUTION || volume.extent>10) throw new Error('Project grid exceeds the supported limits.');
  const validated=validateSettings(settings);
  validateVoxels(volume.values,volume.resolution,volume.extent);
  const metadata=new TextEncoder().encode(JSON.stringify({grid:{dimensions:[volume.resolution,volume.resolution,volume.resolution],extent:volume.extent},voxelEncoding:'float32-le',settings:validated}));
  const buffer=new ArrayBuffer(16+metadata.length+volume.values.length*4), bytes=new Uint8Array(buffer), view=new DataView(buffer);
  bytes.set(MAGIC);view.setUint32(8,2,true);view.setUint32(12,metadata.length,true);bytes.set(metadata,16);
  for(let i=0;i<volume.values.length;i++)view.setFloat32(16+metadata.length+i*4,volume.values[i],true);
  return buffer;
}
/** Fully validate before returning a new volume; never mutates the active project. */
function openLegacyProject(buffer: ArrayBuffer): {volume: SDFVolume; settings: ProjectSettings} {
  if (buffer.byteLength<16 || buffer.byteLength>MAX_PROJECT_BYTES) throw new Error('Project file size is invalid or exceeds the supported limit.');
  const bytes=new Uint8Array(buffer),view=new DataView(buffer);
  if (!MAGIC.every((value,i)=>bytes[i]===value)) throw new Error('This is not a Centra Sculpt project (.form). GLB files cannot be opened as projects.');
  const version=view.getUint32(8,true);
  if (version!==1 && version!==2) throw new Error('Unsupported project version. This app supports versions 1 and 2.');
  const length=view.getUint32(12,true);
  if (length<2 || length>65536 || 16+length>buffer.byteLength) throw new Error('Invalid project metadata length.');
  let metadata: Record<string,unknown>;
  try {metadata=object(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(16,16+length))));}
  catch {throw new Error('Project metadata is damaged or is not valid JSON.');}
  const grid=object(metadata.grid), dimensions=grid.dimensions;
  if (!Array.isArray(dimensions) || dimensions.length!==3 || !dimensions.every(v=>Number.isInteger(v)&&v>=3&&v<=MAX_PROJECT_RESOLUTION) || dimensions.some(v=>v!==dimensions[0])) throw new Error(`Only cubic grids from 3³ to ${MAX_PROJECT_RESOLUTION}³ samples are supported.`);
  const n=dimensions[0] as number,extent=grid.extent;
  if (typeof extent!=='number' || !Number.isFinite(extent) || extent<=0.85 || extent>10) throw new Error('Project extent must be greater than 0.85 and at most 10.');
  if (metadata.voxelEncoding!=='float32-le') throw new Error('Unsupported voxel encoding.');
  if (buffer.byteLength!==16+length+n**3*4) throw new Error('Voxel payload length does not match the grid dimensions.');
  const settings=validateSettings(metadata.settings,version);
  const values=new Float32Array(n**3);
  for(let i=0;i<values.length;i++)values[i]=view.getFloat32(16+length+i*4,true);
  validateVoxels(values,n,extent);
  const volume=new SDFVolume(n,extent);volume.values.set(values);
  return {volume,settings};
}


/** v3 legacy cubes / v4 rectangular lattice schema. Float32 LE; offsets are sample offsets.
 * Codec supports up to eight data-only layers within one aggregate voxel/triangle budget.
 * Each layer stays independent in memory, in the file and in the application renderer.
 */
export function saveSculptProject(project: SculptProject,display:ProjectDisplayPreferences|undefined=project.displayPreferences): ArrayBuffer {
  const settings=validateSettings(project.settings),layers=project.layerStack.layers;
  if(layers.length<1||layers.length>MAX_PROJECT_LAYERS)throw new Error('Projects support 1–8 stored layer records.');
  let offset=0,totalTriangles=0;
  const maskPayloads=layers.map(l=>({base:sculptMask(l.volume).defaultValue,count:sculptMask(l.volume).entryCount,mask:sculptMask(l.volume)}));
  const hasMasks=maskPayloads.some(m=>m.base!==0||m.count>0);let maskBytes=0;
  const descriptors=layers.map(layer=>{
    const metadata=layer.metadata(),volume=layer.volume,n=volume.resolution;
    if(n<3||n>MAX_PROJECT_RESOLUTION||volume.extent<=0.85||volume.extent>10)throw new Error('Project grid exceeds supported limits.');
    const count=volumeSampleCount(volume);
    if(offset+count>MAX_PROJECT_VOXELS)throw new Error('Aggregate project voxel budget exceeded.');
    const data=volume.getDenseView()??volume.readRegion({min:[0,0,0],max:volume.dimensions.map(v=>v-1) as [number,number,number]}).values;
    totalTriangles+=validateVoxels(data,volume.dimensions,volume.extent);
    if(totalTriangles>MAX_PROJECT_TRIANGLES)throw new Error('Aggregate project triangle budget exceeded.');
    const mask=maskPayloads[layers.indexOf(layer)],maskDescriptor=hasMasks?{encoding:'sparse-f32-le',base:mask.base,count:mask.count,byteOffset:maskBytes}:undefined;maskBytes+=hasMasks?mask.count*8:0;
    const result={...metadata,mask:maskDescriptor,grid:{dimensions:volume.dimensions,extent:volume.extent,voxelSize:volume.voxelSize,initialResolution:volume.resolution,latticeMin:volume.latticeMin??[0,0,0]},voxelOffset:offset,voxelCount:count};offset+=count;return result;
  });
  // Revalidate identity/order/selection after metadata may have been edited by clients.
  new LayerStack([...layers],project.activeLayerId);
  const displayPreferences=display===undefined?undefined:validateProjectDisplay(display,layers.map(layer=>layer.id));
  const assets=displayPreferences?.references??[];
  let assetOffset=0;
  const references=assets.map(({bytes,...record})=>{const descriptor={...record,byteOffset:assetOffset,byteLength:bytes.length};assetOffset+=bytes.length;return descriptor;});
  const storedDisplay=displayPreferences?{...displayPreferences,references:assets.length?references:undefined}:undefined;
  const metadata=new TextEncoder().encode(JSON.stringify({toolPreferences:project.toolPreferences===undefined?undefined:validateToolPreferences(project.toolPreferences),displayPreferences:storedDisplay,id:validateId(project.id),name:validateName(project.name),activeLayerId:project.activeLayerId,settings,voxelEncoding:'float32-le',layers:descriptors}));
  if(metadata.length>65536)throw new Error('Project metadata exceeds the supported limit.');
  const buffer=new ArrayBuffer(16+metadata.length+offset*4+maskBytes+assetOffset),bytes=new Uint8Array(buffer),view=new DataView(buffer);
  bytes.set(MAGIC);view.setUint32(8,hasMasks?6:assets.length?5:layers.every(l=>isLegacyCubicGrid(l.volume))?3:4,true);view.setUint32(12,metadata.length,true);bytes.set(metadata,16);
  let index=0;
  for(const layer of layers)for(let i=0;i<volumeSampleCount(layer.volume);i++)view.setFloat32(16+metadata.length+index++*4,layer.volume.readVoxel(i),true);
  let maskStart=16+metadata.length+offset*4;if(hasMasks)for(const mask of maskPayloads)for(const [id,value]of mask.mask.entries()){view.setUint32(maskStart,id,true);view.setFloat32(maskStart+4,value,true);maskStart+=8;}
  let assetStart=maskStart;for(const asset of assets){bytes.set(asset.bytes,assetStart);assetStart+=asset.bytes.length;}
  return buffer;
}
export function openSculptProject(buffer: ArrayBuffer): SculptProject {
  if(buffer.byteLength<16||buffer.byteLength>MAX_PROJECT_BYTES)throw new Error('Project file size is invalid or exceeds the supported limit.');
  const view=new DataView(buffer),bytes=new Uint8Array(buffer);
  if(!MAGIC.every((v,i)=>bytes[i]===v))throw new Error('This is not a Centra Sculpt project (.form).');
  const version=view.getUint32(8,true);
  if(version===1||version===2) {const legacy=openLegacyProject(buffer);return createBaseProject(legacy.volume,legacy.settings,true);}
  if(version!==3&&version!==4&&version!==5&&version!==6)throw new Error('Unsupported project version. This app supports versions 1–6.');
  const length=view.getUint32(12,true);
  if(length<2||length>65536||16+length>buffer.byteLength)throw new Error('Invalid project metadata length.');
  let metadata: Record<string,unknown>;
  try {metadata=object(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(16,16+length))));}
  catch {throw new Error('Project metadata is damaged or is not valid JSON.');}
  const id=validateId(metadata.id),name=validateName(metadata.name),active=validateId(metadata.activeLayerId),settings=validateSettings(metadata.settings);
  if(metadata.voxelEncoding!=='float32-le')throw new Error('Unsupported voxel encoding.');
  if(!Array.isArray(metadata.layers)||metadata.layers.length<1||metadata.layers.length>MAX_PROJECT_LAYERS)throw new Error('Invalid stored layer count.');
  let expectedOffset=0,totalTriangles=0;
  const layers=metadata.layers.map(value=>{
    const record=object(value),layer=validateLayerMetadata(record),grid=object(record.grid),dimensions=grid.dimensions;
    if(!Array.isArray(dimensions)||dimensions.length!==3||!dimensions.every(n=>Number.isInteger(n)&&n>=3&&n<=(version>=4?512:MAX_PROJECT_RESOLUTION)&&(version>=4||n===dimensions[0])))throw new Error('Invalid layer grid dimensions.');
    const dims=dimensions as [number,number,number],n=version>=4?grid.initialResolution:dimensions[0],extent=grid.extent;
    if(typeof n!=='number'||!Number.isInteger(n)||n<3||n>MAX_PROJECT_RESOLUTION)throw new Error('Invalid initial layer resolution.');
    const latticeMin=version>=4?grid.latticeMin:[0,0,0];
    if(!Array.isArray(latticeMin)||latticeMin.length!==3||!latticeMin.every(v=>Number.isSafeInteger(v)&&Math.abs(v)<=1000000)||!latticeMin.every((v,a)=>v<=0&&v+dims[a]>=n))throw new Error('Invalid layer lattice origin.');
    if(typeof extent!=='number'||!Number.isFinite(extent)||extent<=0.85||extent>10)throw new Error('Invalid layer volume extent.');
    const spacing=2*extent/(n-1);
    if(!Array.isArray(grid.voxelSize)||grid.voxelSize.length!==3||!grid.voxelSize.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v-spacing)<1e-10))throw new Error('Layer voxel size does not match its grid and bounds.');
    const count=dims.reduce((a,b)=>a*b,1);
    if(record.voxelOffset!==expectedOffset||record.voxelCount!==count||expectedOffset+count>MAX_PROJECT_VOXELS||16+length+(expectedOffset+count)*4>buffer.byteLength)throw new Error('Invalid layer voxel offset or payload length.');
    const values=new Float32Array(count);
    for(let i=0;i<count;i++)values[i]=view.getFloat32(16+length+(expectedOffset+i)*4,true);
    totalTriangles+=validateVoxels(values,dims,extent);
    if(totalTriangles>MAX_PROJECT_TRIANGLES)throw new Error('Aggregate project triangle budget exceeded.');
    expectedOffset+=count;const volume=new SDFVolume(n,extent,false,{dimensions:dims,latticeMin:latticeMin as [number,number,number]});volume.values.set(values);
    return new SdfLayer(volume,layer);
  });
  let assetStart=16+length+expectedOffset*4;
  if(version===6){let offset=0;for(let a=0;a<layers.length;a++){const descriptor=object(object(metadata.layers[a]).mask),count=descriptor.count,base=descriptor.base;if(descriptor.encoding!=='sparse-f32-le'||(base!==0&&base!==1)||!Number.isSafeInteger(count)||typeof count!=='number'||count<0||count>volumeSampleCount(layers[a].volume)||descriptor.byteOffset!==offset||assetStart+offset+count*8>buffer.byteLength)throw new Error('Invalid mask payload.');const mask=sculptMask(layers[a].volume);mask.uniform(base);let previous=-1;for(let i=0;i<count;i++){const id=view.getUint32(assetStart+offset,true),value=view.getFloat32(assetStart+offset+4,true);if(id<=previous||id>=volumeSampleCount(layers[a].volume)||!Number.isFinite(value)||value<0||value>1||value===base)throw new Error('Invalid mask samples.');mask.write(id,value);previous=id;offset+=8;}}assetStart+=offset;}else if(metadata.layers.some(v=>object(v).mask!==undefined))throw new Error('Masks require project version 6.');
  const savedDisplay=metadata.displayPreferences as {references?:Record<string,unknown>[]} | undefined;
  if(savedDisplay?.references!==undefined){
   if(version<5||!Array.isArray(savedDisplay.references)||savedDisplay.references.length>REFERENCE_LIMITS.count)throw new Error('Invalid reference records.');
   let offset=0;
   savedDisplay.references=savedDisplay.references.map(r=>{const n=r.byteLength;if(r.byteOffset!==offset||typeof n!=='number'||!Number.isSafeInteger(n)||n<24||n>REFERENCE_LIMITS.fileBytes||offset+n>REFERENCE_LIMITS.totalBytes||assetStart+offset+n>buffer.byteLength)throw new Error('Invalid reference payload.');const bytes=new Uint8Array(buffer.slice(assetStart+offset,assetStart+offset+n));offset+=n;const {byteOffset,byteLength,...record}=r;return {...record,bytes};});assetStart+=offset;
  }
  if(buffer.byteLength!==assetStart)throw new Error('Unexpected trailing voxel data.');
  const project=new SculptProject(new LayerStack(layers,active),settings,name,id);
  if(metadata.toolPreferences!==undefined)project.toolPreferences=validateToolPreferences(metadata.toolPreferences);
  if(metadata.displayPreferences!==undefined)project.displayPreferences=validateProjectDisplay(metadata.displayPreferences,layers.map(layer=>layer.id));
  return project;
}
/** Compatibility reader for existing consumers; new application code uses the project model. */
export function openProject(buffer: ArrayBuffer): {volume: VolumeStore;settings:ProjectSettings;project:SculptProject} {
  const project=openSculptProject(buffer);
  return {volume:project.activeLayer.volume,settings:project.settings,project};
}
