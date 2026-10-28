import {defaultTurntable,validateTurntable,type TurntablePreferences} from './turntable';
/** Project-scoped presentation metadata. Environment/session selection is deliberately transient. */
export const STUDIO_BACKGROUNDS=[
 {id:'neutral-grey',label:'Neutral Grey',colour:'#808080'},
 {id:'dark-studio',label:'Dark Studio',colour:'#292D35'},
 {id:'soft-blue',label:'Soft Blue',colour:'#536D8C'},
 {id:'warm-studio',label:'Warm Studio',colour:'#B7A08A'},
 {id:'black',label:'Black',colour:'#101114'},
 {id:'soft-sage',label:'Soft Sage',colour:'#87998A'},
] as const;
export type StudioBackground=typeof STUDIO_BACKGROUNDS[number]['id'];
export type WorldDisplayPreferences={version:1;studioBackground:StudioBackground;groundGrid:boolean;mirrorGuide?:{mode:'grid'|'outline'|'hidden';spacing:number;opacity:number};turntable?:TurntablePreferences};
export const defaultWorldSettings=():WorldDisplayPreferences=>({version:1,studioBackground:'neutral-grey',groundGrid:false});
export const studioBackgroundColour=(id:StudioBackground):string=>STUDIO_BACKGROUNDS.find(p=>p.id===id)!.colour;
export function validateWorldSettings(value:unknown):WorldDisplayPreferences{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid world display preferences.');
 const data=value as Record<string,unknown>;
 if(data.version!==1||!STUDIO_BACKGROUNDS.some(p=>p.id===data.studioBackground)||typeof data.groundGrid!=='boolean')throw new Error('Invalid world display preferences version, background or grid.');
 const result:WorldDisplayPreferences={version:1,studioBackground:data.studioBackground as StudioBackground,groundGrid:data.groundGrid};
 if(data.mirrorGuide!==undefined){const m=data.mirrorGuide as NonNullable<WorldDisplayPreferences['mirrorGuide']>;if(!m||!['grid','outline','hidden'].includes(m.mode)||!Number.isFinite(m.spacing)||m.spacing<.05||m.spacing>1||!Number.isFinite(m.opacity)||m.opacity<.05||m.opacity>.8)throw new Error('Invalid mirror guide preferences.');result.mirrorGuide={mode:m.mode,spacing:m.spacing,opacity:m.opacity};}
 if(data.turntable!==undefined)result.turntable=validateTurntable(data.turntable);
 return result;
}

export const mirrorGuideSettings=(world:WorldDisplayPreferences)=>world.mirrorGuide??{mode:'grid' as const,spacing:.2,opacity:.22};
export const turntableSettings=(world:WorldDisplayPreferences)=>world.turntable??defaultTurntable();
