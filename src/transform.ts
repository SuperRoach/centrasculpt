import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { Point3 } from './sdf';
export type Vec3 = [number,number,number];
/** Euler XYZ rotation in radians; positive scales only. */
export type VolumeTransform = {position: Vec3; rotation: Vec3; scale: Vec3};
export function identityTransform(): VolumeTransform {return {position:[0,0,0],rotation:[0,0,0],scale:[1,1,1]};}
export function validateVector(value: unknown, label: string, positive=false): Vec3 {
  if(!Array.isArray(value)||value.length!==3||!value.every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)<=1000&&(!positive||v>=0.001)))throw new Error(`Invalid ${label}.`);
  return [...value] as Vec3;
}
export function validateTransform(value: unknown): VolumeTransform {
  if(!value||typeof value!=='object')throw new Error('Invalid transform.');
  const t=value as Record<string,unknown>;
  return {position:validateVector(t.position,'position'),rotation:validateVector(t.rotation,'rotation'),scale:validateVector(t.scale,'scale',true)};
}
export function transformMatrix(transform: VolumeTransform): Matrix4 {
  return new Matrix4().compose(new Vector3(...transform.position),new Quaternion().setFromEuler(new Euler(...transform.rotation,'XYZ')),new Vector3(...transform.scale));
}
export function toLocal(point: Point3, transform: VolumeTransform): Point3 {return new Vector3(point.x,point.y,point.z).applyMatrix4(transformMatrix(transform).invert());}
export function copyTransform(transform: VolumeTransform): VolumeTransform {return {position:[...transform.position],rotation:[...transform.rotation],scale:[...transform.scale]};}
export function sameTransform(a: VolumeTransform,b: VolumeTransform): boolean {return (['position','rotation','scale'] as const).every(key=>a[key].every((v,i)=>Math.abs(v-b[key][i])<1e-10));}
export function hasUniformScale(transform:VolumeTransform):boolean {const [x,y,z]=transform.scale;return Math.abs(x-y)<=1e-8*Math.max(1,x)&&Math.abs(x-z)<=1e-8*Math.max(1,x);}
export function uniformScale(transform: VolumeTransform): number {
  const [x]=transform.scale;
  if(!hasUniformScale(transform))throw new Error('Non-uniform legacy scale is preserved. Set a uniform scale before sculpting or using Scale.');
  return x;
}
export function validateTransformEdit(value: unknown,previous: VolumeTransform): VolumeTransform {
  const next=validateTransform(value);
  if(next.scale.some((v,i)=>v!==previous.scale[i]))uniformScale(next);
  return next;
}
