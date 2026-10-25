import type { MeshStandardMaterial } from 'three';
export const RENDER_STYLES=['normal','matte','glossy'] as const;
export type RenderStyle=typeof RENDER_STYLES[number];
export function validateRenderStyle(value:unknown):RenderStyle {
 if(typeof value!=='string'||!(RENDER_STYLES as readonly string[]).includes(value))throw new Error('Unknown rendering style.');return value as RenderStyle;
}
/** Display only: source voxel data, normals and geometry remain untouched. */
export function applyRenderStyle(material:MeshStandardMaterial,style:RenderStyle):void {
 const wireframe=false;
 if(material.wireframe!==wireframe){material.wireframe=wireframe;material.needsUpdate=true;}
 material.roughness=style==='glossy'?.14:style==='matte'?.4:.68;
 material.metalness=style==='glossy'?.12:style==='matte'?.06:.03;
 material.envMapIntensity=style==='glossy'?1:style==='matte'?.45:0;
}
