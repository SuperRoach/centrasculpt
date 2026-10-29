/** Display-only, workspace-local lighting. Optional existing native display metadata. */
export const LIGHT_IDS=['key','fill','rim'] as const;
export type LightId=typeof LIGHT_IDS[number];
export type LightSettings={type:'directional';enabled:boolean;colour:string;intensity:number;position:[number,number,number];target:[number,number,number]};
export type LightingSettings={version:1;enabled:boolean;lights:Record<LightId,LightSettings>};
export const LIGHT_COLOURS=['#fff4df','#d6eaff','#ffffff','#ffd1b3','#b3dfff','#d9bdff'];
export function defaultLighting():LightingSettings{return {version:1,enabled:false,lights:{
 key:{type:'directional',enabled:true,colour:'#fff4df',intensity:3.4,position:[-2,2,2],target:[0,0,0]},
 fill:{type:'directional',enabled:true,colour:'#d6eaff',intensity:1.4,position:[2,1,1],target:[0,0,0]},
 rim:{type:'directional',enabled:true,colour:'#ffffff',intensity:2,position:[0,2,-2],target:[0,0,0]}}};}
export function validateLighting(value:unknown):LightingSettings{
 const fail=():never=>{throw new Error('Invalid project lighting settings.');};
 if(!value||typeof value!=='object'||Array.isArray(value))return fail();
 const s=value as LightingSettings;
 if(s.version!==1||typeof s.enabled!=='boolean'||!s.lights||typeof s.lights!=='object')return fail();
 const result=defaultLighting();result.enabled=s.enabled;
 for(const id of LIGHT_IDS){const l=s.lights[id];if(!l||l.type!=='directional'||typeof l.enabled!=='boolean'||typeof l.colour!=='string'||!/^#[0-9a-f]{6}$/i.test(l.colour)||!Number.isFinite(l.intensity)||l.intensity<0||l.intensity>6)return fail();
 for(const v of [l.position,l.target])if(!Array.isArray(v)||v.length!==3||!v.every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1000))return fail();
 if(Math.hypot(...l.position.map((n,i)=>n-l.target[i]))<.001)return fail();
 result.lights[id]={type:'directional',enabled:l.enabled,colour:l.colour.toLowerCase(),intensity:l.intensity,position:[...l.position],target:[...l.target]};}
 return result;
}
