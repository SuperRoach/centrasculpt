import type { LayerStack } from './layers';
import { validateId, newId } from './layers';
import { validateTransform, validateVector, hasUniformScale } from './transform';
import type { VolumeTransform, Vec3 } from './transform';
import type { Point3 } from './sdf';
export const SHAPE_KINDS=['sphere','box','triangular-prism','pyramid'] as const;
export type ShapeKind=typeof SHAPE_KINDS[number];
export const SHAPE_METADATA:Record<ShapeKind,{id:ShapeKind;name:string;description:string;dimensionRule:'diameter'|'independent'|'square-base';inputScale:'uniform'}>={
  sphere:{id:'sphere',name:'Sphere',description:'A solid sphere; dimensions are equal diameters.',dimensionRule:'diameter',inputScale:'uniform'},
  box:{id:'box',name:'Cube / Box',description:'A solid rectangular box with independent width, height and depth.',dimensionRule:'independent',inputScale:'uniform'},
  'triangular-prism':{id:'triangular-prism',name:'Triangular Prism',description:'An isosceles triangle in XY, extruded through depth Z.',dimensionRule:'independent',inputScale:'uniform'},
  pyramid:{id:'pyramid',name:'Square Pyramid',description:'A square base in XZ at bottom Y and a centered apex at top Y.',dimensionRule:'square-base',inputScale:'uniform'}
};
Object.freeze(SHAPE_KINDS);Object.values(SHAPE_METADATA).forEach(Object.freeze);Object.freeze(SHAPE_METADATA);
export function validateShapeDimensions(kind:ShapeKind,value:unknown):Vec3 {
  if(!SHAPE_KINDS.includes(kind))throw new Error('Unsupported procedural shape.');
  const dimensions=validateVector(value,'shape dimensions',true),rule=SHAPE_METADATA[kind].dimensionRule;
  if(rule==='diameter'&&!dimensions.every(v=>v===dimensions[0]))throw new Error('Sphere dimensions must contain equal diameters.');
  if(rule==='square-base'&&dimensions[0]!==dimensions[2])throw new Error('Pyramid width and depth must match for a square base.');
  return dimensions;
}
export type ShapeDefinition={id:string;kind:ShapeKind;targetLayerId:string;operation:'add'|'subtract';transform:VolumeTransform;dimensions:Vec3};
/** Full local extents XYZ. Sphere uses equal diameters. Only positive uniform pose scaling is supported.
 * Prism: triangle in XY, extrusion along Z. Pyramid: square base XZ, height along Y.
 * Origin is the bounding-box center; Euler XYZ rotations are in radians.
 * The pose maps shape-local coordinates into the target layer-local space.
 */
export function validateShapeDefinition(value: unknown): ShapeDefinition {
  if(!value||typeof value!=='object')throw new Error('Invalid shape definition.');
  const data=value as Record<string,unknown>;
  if(!(SHAPE_KINDS as readonly string[]).includes(String(data.kind))||typeof data.kind!=='string')throw new Error('Unsupported procedural shape.');
  if(data.operation!=='add'&&data.operation!=='subtract')throw new Error('Shape operation must be Add or Subtract.');
  const dimensions=validateShapeDimensions(data.kind as ShapeKind,data.dimensions),transform=validateTransform(data.transform);
  if(!hasUniformScale(transform))throw new Error('Shape pose scale must be uniform. Use dimensions to change a box or prism aspect ratio.');
  return {id:validateId(data.id),kind:data.kind as ShapeKind,targetLayerId:validateId(data.targetLayerId),operation:data.operation,dimensions,transform};
}
export function defineShape(input: Omit<ShapeDefinition,'id'> & {id?: string}): ShapeDefinition {return validateShapeDefinition({...input,id:input.id??newId()});}
/** Data/interaction ports: preview and explicit stamp execution are implemented separately; no device input is registered. */
export interface ShapeKernel {readonly kind:ShapeKind;sampleLocal(point:Point3,dimensions:Vec3):number;}
export interface ShapePreviewPort {preview(definition:Readonly<ShapeDefinition>):void;clear():void;}
export type ShapeStampIntent={kind:'shape-stamp';targetLayerId:string;definition:ShapeDefinition;historyLabel:string};
export function shapeStampIntent(value: unknown,stack?: LayerStack): ShapeStampIntent {const definition=validateShapeDefinition(value);stack?.get(definition.targetLayerId).assertEditable();return {kind:'shape-stamp',targetLayerId:definition.targetLayerId,definition,historyLabel:`${definition.operation} ${definition.kind}`};}
export type ShapeToolInput =
  | {type:'set-transform';transform:VolumeTransform}
  | {type:'analogue-scale';axis:'uniform'|'x'|'y'|'z';value:number;deltaSeconds:number}
  | {type:'request-preview'|'request-commit'|'cancel'};
/** Validate future normalized controller/tool events without reading devices or changing geometry. */
export function validateShapeToolInput(value: unknown): ShapeToolInput {
  if(!value||typeof value!=='object')throw new Error('Invalid shape tool input.');
  const input=value as Record<string,unknown>;
  if(input.type==='set-transform')return {type:'set-transform',transform:validateTransform(input.transform)};
  if(input.type==='request-preview'||input.type==='request-commit'||input.type==='cancel')return {type:input.type};
  if(input.type==='analogue-scale'&&typeof input.axis==='string'&&['uniform','x','y','z'].includes(String(input.axis))&&typeof input.value==='number'&&Number.isFinite(input.value)&&Math.abs(input.value)<=1&&typeof input.deltaSeconds==='number'&&Number.isFinite(input.deltaSeconds)&&input.deltaSeconds>=0&&input.deltaSeconds<=0.1)return {type:'analogue-scale',axis:input.axis as 'uniform'|'x'|'y'|'z',value:input.value,deltaSeconds:input.deltaSeconds};
  throw new Error('Invalid analogue scale or shape tool input.');
}
