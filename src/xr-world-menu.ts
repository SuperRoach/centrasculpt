import {STUDIO_BACKGROUNDS} from './world-settings';
import type {EditorToolState} from './editor-tool-state';
import type {MenuContent,MenuButton} from './xr-menu-model';
import type {XRSessionController} from './xr-session';
export type WorldSection='home'|'environment'|'background'|'guides'|'preferences';
export interface XRWorldMenuPort {
 session:()=>XRSessionController;
 diagnostics:()=>boolean;
 toggleDiagnostics:()=>void;
 performance:()=>boolean;
 togglePerformance:()=>void;
}
/** Dedicated world navigation reuses the existing menu canvas, scale, ray and trigger owner. */
export class XRWorldMenu {
 section:WorldSection='home';
 constructor(private readonly tools:EditorToolState,private readonly port?:XRWorldMenuPort){}
 content():MenuContent{
  const layers=this.tools.port.layers(),world=layers.display.world,busy=this.tools.busy;
  const buttons:MenuButton[]=[{id:'tools',label:'‹ Tools',rect:{x:40,y:140,width:240,height:74}}];
  const labels:MenuContent['labels']=[];
  const add=(id:string,label:string,y:number,detail?:string,selected=false,disabled=busy)=>buttons.push({id,label,detail,selected,disabled,rect:{x:40,y,width:1072,height:136}});
  if(this.section!=='home')buttons.push({id:'world:home',label:'‹ World Settings',rect:{x:300,y:140,width:440,height:74}});
  let subtitle='Environment · background · guides · preferences';
  if(this.section==='home'){
   add('world:environment','Environment',244,'Studio or Passthrough');
   add('world:background','Studio Background',394,'Colour swatches · ground grid');
   add('world:guides','Guides and Constraints',544,'Mirror symmetry · angle snap');
   add('world:preferences','Preferences',694,'VR UI size · diagnostics · performance');
  }else if(this.section==='environment'){
   subtitle='Environment · changing mode exits XR';
   const session=this.port?.session(),available=session?.availability;
   for(const [i,env] of (['studio','passthrough'] as const).entries()){
    const supported=!!available?.[env].supported,selected=session?.environment===env;
    add(`environment:${env}`,env==='studio'?'Studio':'Passthrough',244+i*150,!supported?(available?.[env].reason??'Session controls unavailable in this preview'):selected?'Selected environment':'Exit XR · then click Enter for a fresh session',selected,busy||!supported||selected||session?.state==='checking'||session?.state==='requesting'||session?.state==='ending');
   }
   labels.push({text:'After switching, use Enter on the desktop panel. Your project stays open.',x:56,y:600,width:1024,height:120},{text:'Passthrough keeps the real room visible. Studio colours are remembered.',x:56,y:744,width:1024,height:120});
  }else if(this.section==='background'){
   subtitle='Studio Background · remembered in Passthrough';
   STUDIO_BACKGROUNDS.forEach((preset,i)=>buttons.push({id:`background:${preset.id}`,label:preset.label,colour:preset.colour,swatch:true,selected:world.studioBackground===preset.id,disabled:busy,rect:{x:40+(i%2)*548,y:244+Math.floor(i/2)*150,width:524,height:136}}));
   add('ground-grid',`Ground grid · ${world.groundGrid?'On':'Off'}`,714,'Studio only · workspace guide · 0.2 unit spacing',world.groundGrid);
  }else if(this.section==='guides'){
   subtitle='Guides and Constraints · existing layer-local mirror';
   const symmetry=layers.symmetry,locked=busy||!layers.active.layer.editable;
   add('world-mirror',`Mirror symmetry · ${symmetry.enabled?'On':'Off'}`,244,'Layer-local plane · shared with tool options',symmetry.enabled,locked);
   add('world-axis',`Mirror plane normal · ${symmetry.axis.toUpperCase()}`,394,'Tap to cycle X / Y / Z',false,locked);
   labels.push({text:`Mirror offset · ${symmetry.offset.toFixed(2)}`,x:56,y:564,width:700,height:90});
   buttons.push({id:'world-offset-minus',label:'-',disabled:locked||symmetry.offset<=-100,rect:{x:812,y:566,width:140,height:92}},{id:'world-offset-plus',label:'+',disabled:locked||symmetry.offset>=100,rect:{x:972,y:566,width:140,height:92}});
   add('snap-toggle',`Angle snap · ${this.tools.path.snap?'15°':'Off'}`,694,'Line + Move rotation · shared with tool options',!!this.tools.path.snap);
  }else{
   subtitle='Preferences · display and diagnostics';
   add('world-ui-scale',`Large UI · ${layers.display.vrUiScale==='large'?'On':'Off'}`,244,'Off: Default size · On: Large',layers.display.vrUiScale==='large');
   add('world-diagnostics',`In-headset diagnostics · ${this.port?.diagnostics()?'On':'Off'}`,394,this.port?'Controller status and control hints':'Unavailable in this preview',!!this.port?.diagnostics(),busy||!this.port);
   add('world-performance',`VR performance · ${this.port?.performance()?'On':'Off'}`,544,this.port?'Existing performance panel and sampling':'Unavailable in this preview',!!this.port?.performance(),busy||!this.port);
  }
  return {title:'WORLD SETTINGS',subtitle,buttons,labels,footer:'Hold Support stick · Tool trigger selects · release to close'};
 }
 activate(id:string):boolean{
  if(id.startsWith('world:')){this.section=id.slice(6) as WorldSection;return true;}
  const layers=this.tools.port.layers();
  if(id.startsWith('background:')){const preset=STUDIO_BACKGROUNDS.find(p=>`background:${p.id}`===id);if(preset)layers.display.world.studioBackground=preset.id;}
  else if(id==='ground-grid')layers.display.world.groundGrid=!layers.display.world.groundGrid;
  else if(id.startsWith('environment:')){void this.port?.session().select(id.slice(12) as 'studio'|'passthrough');return true;}
  else if(id==='world-mirror')layers.symmetry.enabled=!layers.symmetry.enabled;
  else if(id==='world-axis'){const axes=['x','y','z'] as const;layers.symmetry.axis=axes[(axes.indexOf(layers.symmetry.axis)+1)%3];}
  else if(id==='world-offset-minus'||id==='world-offset-plus')layers.symmetry.offset=Math.max(-100,Math.min(100,Math.round((layers.symmetry.offset+(id.endsWith('plus')?.05:-.05))*100)/100));
  else if(id==='world-diagnostics')this.port?.toggleDiagnostics();
  else if(id==='world-performance')this.port?.togglePerformance();
  else return false;
  this.tools.port.changed();return true;
 }
}
