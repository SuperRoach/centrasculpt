import { Plane, Triangle, Vector3, Matrix4 } from 'three';
import type { Point3 } from './sdf';
import type { Vec3 } from './transform';
import { transformMatrix, uniformScale, validateTransform } from './transform';
import type { SdfLayer } from './layers';
import { SHAPE_METADATA, validateShapeDimensions, validateShapeDefinition } from './shapes';
import type { ShapeKind, ShapeDefinition, ShapeKernel } from './shapes';
export type ShapeBounds={min:Vec3;max:Vec3};
export type Polyhedron={vertices:Vec3[];faces:[number,number,number][]};
export type PreparedPrimitive={sampleLocal:(point:Point3)=>number;bounds:ShapeBounds};
function validatePoint(p:Point3):void {if(![p.x,p.y,p.z].every(v=>Number.isFinite(v)&&Math.abs(v)<=1e12))throw new Error('Shape sample coordinates must be finite and within ±1e12.');}
export function localShapeBounds(kind:ShapeKind,dimensions:Vec3):ShapeBounds {const d=validateShapeDimensions(kind,dimensions);return {min:d.map(v=>-v/2) as Vec3,max:d.map(v=>v/2) as Vec3};}
/** Exact planar boundary topology, shared by distance preparation and low-poly preview. */
export function shapePolyhedron(kind:Exclude<ShapeKind,'sphere'>,dimensions:Vec3):Polyhedron {
  const [w,h,d]=validateShapeDimensions(kind,dimensions).map(v=>v/2);
  let vertices:Vec3[],faces:[number,number,number][];
  if(kind==='box'){
    vertices=[[-w,-h,-d],[w,-h,-d],[w,h,-d],[-w,h,-d],[-w,-h,d],[w,-h,d],[w,h,d],[-w,h,d]];
    faces=[[0,1,2],[0,2,3],[4,6,5],[4,7,6],[0,4,5],[0,5,1],[3,2,6],[3,6,7],[0,3,7],[0,7,4],[1,5,6],[1,6,2]];
  }else if(kind==='triangular-prism'){
    vertices=[[-w,-h,-d],[w,-h,-d],[0,h,-d],[-w,-h,d],[w,-h,d],[0,h,d]];
    faces=[[0,1,2],[3,5,4],[0,3,4],[0,4,1],[1,4,5],[1,5,2],[2,5,3],[2,3,0]];
  }else if(kind==='pyramid'){
    vertices=[[-w,-h,-d],[w,-h,-d],[w,-h,d],[-w,-h,d],[0,h,0]];
    faces=[[0,2,1],[0,3,2],[0,1,4],[1,2,4],[2,3,4],[3,0,4]];
  }
  else throw new Error('This primitive needs a registered polyhedron boundary.');
  const points=vertices.map(v=>new Vector3(...v)),center=points.reduce((sum,p)=>sum.add(p),new Vector3()).divideScalar(points.length);
  // Consistent outward winding, independent of input face ordering or aspect ratios.
  faces=faces.map(([a,b,c])=>{const normal=new Triangle(points[a],points[b],points[c]).getNormal(new Vector3());return normal.dot(points[a].clone().sub(center))<0?[a,c,b]:[a,b,c];});
  return {vertices,faces};
}
function preparePolyhedron(kind:Exclude<ShapeKind,'sphere'>,dimensions:Vec3):PreparedPrimitive {
  const poly=shapePolyhedron(kind,dimensions),vertices=poly.vertices.map(v=>new Vector3(...v));
  const faces=poly.faces.map(([a,b,c])=>{const triangle=new Triangle(vertices[a],vertices[b],vertices[c]);return {triangle,plane:new Plane().setFromCoplanarPoints(vertices[a],vertices[b],vertices[c])};});
  const point=new Vector3(),closest=new Vector3();
  return {bounds:localShapeBounds(kind,dimensions),sampleLocal:p=>{
    validatePoint(p);point.set(p.x,p.y,p.z);let inside=true,distance=Infinity;
    for(const face of faces){if(face.plane.distanceToPoint(point)>0)inside=false;face.triangle.closestPointToPoint(point,closest);distance=Math.min(distance,Math.hypot(point.x-closest.x,point.y-closest.y,point.z-closest.z));}
    return distance===0?0:inside?-distance:distance;
  }};
}
export function preparePrimitive(kind:ShapeKind,dimensions:Vec3):PreparedPrimitive {
  const d=validateShapeDimensions(kind,dimensions),bounds=localShapeBounds(kind,d);
  if(kind==='sphere'){const radius=d[0]/2;return {bounds,sampleLocal:p=>{validatePoint(p);return Math.hypot(p.x,p.y,p.z)-radius;}};}
  if(kind==='box'){const [x,y,z]=d.map(v=>v/2);return {bounds,sampleLocal:p=>{validatePoint(p);const qx=Math.abs(p.x)-x,qy=Math.abs(p.y)-y,qz=Math.abs(p.z)-z;return Math.hypot(Math.max(qx,0),Math.max(qy,0),Math.max(qz,0))+Math.min(Math.max(qx,qy,qz),0);}};}
  return preparePolyhedron(kind,d);
}
export type ShapeDescriptor=ShapeKernel&typeof SHAPE_METADATA[ShapeKind]&{prepare:(dimensions:Vec3)=>PreparedPrimitive;localBounds:(dimensions:Vec3)=>ShapeBounds};
export const SHAPE_LIBRARY:Readonly<Record<ShapeKind,ShapeDescriptor>>=Object.freeze(Object.fromEntries(Object.values(SHAPE_METADATA).map(metadata=>[metadata.id,Object.freeze({...metadata,kind:metadata.id,prepare:(d:Vec3)=>preparePrimitive(metadata.id,d),sampleLocal:(p:Point3,d:Vec3)=>preparePrimitive(metadata.id,d).sampleLocal(p),localBounds:(d:Vec3)=>localShapeBounds(metadata.id,d)})])) as Record<ShapeKind,ShapeDescriptor>);
export function transformedShapeBounds(bounds:ShapeBounds,matrix:Matrix4):ShapeBounds {
  const min:Vec3=[Infinity,Infinity,Infinity],max:Vec3=[-Infinity,-Infinity,-Infinity],p=new Vector3();
  for(const x of [bounds.min[0],bounds.max[0]])for(const y of [bounds.min[1],bounds.max[1]])for(const z of [bounds.min[2],bounds.max[2]]){p.set(x,y,z).applyMatrix4(matrix);p.toArray().forEach((v,i)=>{min[i]=Math.min(min[i],v);max[i]=Math.max(max[i],v);});}
  return {min,max};
}
/** Prepare once per future stamp, then sample many voxels. No layer voxel API is called. */
export function prepareShape(value:unknown,layer?:SdfLayer){
  const definition=validateShapeDefinition(value);
  if(layer&&layer.id!==definition.targetLayerId)throw new Error('Shape target layer does not match.');
  if(layer)validateTransform(layer.transform);
  const primitive=preparePrimitive(definition.kind,definition.dimensions),matrix=layer?transformMatrix(layer.transform).multiply(transformMatrix(definition.transform)):transformMatrix(definition.transform),inverse=matrix.clone().invert();
  const distanceScale=uniformScale(definition.transform)*(layer?uniformScale(layer.transform):1),e=inverse.elements;
  return {definition,matrix,localBounds:primitive.bounds,worldBounds:transformedShapeBounds(primitive.bounds,matrix),sampleLocal:primitive.sampleLocal,sampleWorld:(p:Point3)=>{
    validatePoint(p);return primitive.sampleLocal({x:e[0]*p.x+e[4]*p.y+e[8]*p.z+e[12],y:e[1]*p.x+e[5]*p.y+e[9]*p.z+e[13],z:e[2]*p.x+e[6]*p.y+e[10]*p.z+e[14]})*distanceScale;
  }};
}
