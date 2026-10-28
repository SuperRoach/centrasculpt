import {defaultWorldSettings,validateWorldSettings,type WorldDisplayPreferences} from './world-settings';
import {validateVRUIScale,type VRUIScale} from './xr-ui-style';
import {validateRenderStyle,type RenderStyle} from './render-style';
export type ViewportMode='clay'|'layer-colours';
const palette=['#aabd8d','#d68d70','#86aeca','#c29ac9','#dfc574','#78b7a9','#d293ac','#929fc9'];
export type ProjectDisplayPreferences={mode:ViewportMode;colours:Record<string,string>;renderStyle?:RenderStyle;vrUiScale?:VRUIScale;world?:WorldDisplayPreferences};
/** Optional native-project display metadata, kept separate from SDF data and export materials. */
export function validateProjectDisplay(value: unknown,layerIds: readonly string[]):ProjectDisplayPreferences {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid project display preferences.');
  const data=value as Record<string,unknown>;
  if(data.mode!=='clay'&&data.mode!=='layer-colours')throw new Error('Invalid project display mode.');
  if(!data.colours||typeof data.colours!=='object'||Array.isArray(data.colours))throw new Error('Invalid project layer colours.');
  const entries=Object.entries(data.colours);
  if(entries.some(([id,colour])=>!layerIds.includes(id)||typeof colour!=='string'||!/^#[0-9a-f]{6}$/i.test(colour)))throw new Error('Invalid project layer colour or target layer.');
  const renderStyle=data.renderStyle===undefined?undefined:validateRenderStyle(data.renderStyle==='wireframe'?'normal':data.renderStyle);
  const vrUiScale=data.vrUiScale===undefined?undefined:validateVRUIScale(data.vrUiScale);
  const world=data.world===undefined?undefined:validateWorldSettings(data.world);
  return {...(world===undefined?{}:{world}),...(vrUiScale===undefined?{}:{vrUiScale}),...(renderStyle===undefined?{}:{renderStyle}),mode:data.mode,colours:Object.fromEntries(entries.map(([id,colour])=>[id,(colour as string).toLowerCase()]))};
}
/** Runtime display preferences with an explicit native-project snapshot boundary. */
export class LayerDisplayPreferences {
  world=defaultWorldSettings();
  vrUiScale:VRUIScale='normal';
  mode: ViewportMode='layer-colours';
  renderStyle:RenderStyle='normal';
  private readonly colours=new Map<string,string>();
  colour(projectId: string,layerId: string,index: number): string {
    const key=`${projectId}/${layerId}`;
    if(!this.colours.has(key)) {
      const used=new Set([...this.colours].filter(([stored])=>stored.startsWith(`${projectId}/`)).map(([,colour])=>colour));
      const preferred=palette[index%palette.length];
      this.colours.set(key,!used.has(preferred)?preferred:palette.find(colour=>!used.has(colour))??preferred);
    }
    return this.colours.get(key)!;
  }
  setColour(projectId: string,layerId: string,colour: string): void {
    if(!/^#[0-9a-f]{6}$/i.test(colour))throw new Error('Choose a valid RGB colour.');
    this.colours.set(`${projectId}/${layerId}`,colour.toLowerCase());
  }
  snapshot(projectId:string,layers:readonly {id:string;order:number}[]):ProjectDisplayPreferences {
    return {...(this.world.studioBackground==='neutral-grey'&&!this.world.groundGrid?{}:{world:{...this.world}}),...(this.vrUiScale==='normal'?{}:{vrUiScale:this.vrUiScale}),...(this.renderStyle==='normal'?{}:{renderStyle:this.renderStyle}),mode:this.mode,colours:Object.fromEntries(layers.map(layer=>[layer.id,this.colour(projectId,layer.id,layer.order)]))};
  }
  restore(projectId:string,layers:readonly {id:string;order:number}[],saved?:ProjectDisplayPreferences):void {
    const validated=saved===undefined?undefined:validateProjectDisplay(saved,layers.map(layer=>layer.id));
    this.world=validated?.world??defaultWorldSettings();
    this.vrUiScale=validated?.vrUiScale??'normal';this.mode=validated?.mode??'layer-colours';this.renderStyle=validated?.renderStyle??'normal';
    for(const layer of layers)this.remove(projectId,layer.id);
    for(const [id,colour] of Object.entries(validated?.colours??{}))this.setColour(projectId,id,colour);
    for(const layer of layers)this.colour(projectId,layer.id,layer.order);
  }
  remove(projectId: string,layerId: string): void {this.colours.delete(`${projectId}/${layerId}`);}
}
