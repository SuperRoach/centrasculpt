import {defaultLighting,LIGHT_IDS,LIGHT_COLOURS,type LightId} from './lighting';
import type {LightRig} from './light-rig';
import type {ReferenceView} from './reference-view';
import type {Turntable} from './turntable';
import {STUDIO_BACKGROUNDS,mirrorGuideSettings,turntableSettings} from './world-settings';
import type {EditorToolState} from './editor-tool-state';
import type {MenuContent,MenuButton} from './xr-menu-model';
import type {XRSessionController} from './xr-session';
export type WorldSection='lighting'|'light'|'light-colour'|'light-position'|'inspection'|'home'|'environment'|'background'|'guides'|'preferences'|'mirror-guide'|'turntable'|'pivot'|'references'|'reference'|'reference-pose'|'reference-delete'|'reference-more';
export interface XRWorldMenuPort {
 lighting?:LightRig;
 references?:ReferenceView;
 importReferences?:()=>void;
 turntable?:()=>Turntable;
 centreTurntable?:()=>void;
 session:()=>XRSessionController;
 diagnostics:()=>boolean;
 toggleDiagnostics:()=>void;
 performance:()=>boolean;
 togglePerformance:()=>void;
}
/** Dedicated world navigation reuses the existing menu canvas, scale, ray and trigger owner. */
export class XRWorldMenu {
 section:WorldSection='home';
 private light:LightId='key';
 constructor(private readonly tools:EditorToolState,private readonly port?:XRWorldMenuPort){}
 content():MenuContent{
  const layers=this.tools.port.layers(),world=layers.display.world,busy=this.tools.busy;
  const buttons:MenuButton[]=[{id:'tools',label:'‹ Tools',rect:{x:40,y:140,width:240,height:74}}];
  const labels:MenuContent['labels']=[];
  const add=(id:string,label:string,y:number,detail?:string,selected=false,disabled=busy)=>buttons.push({id,label,detail,selected,disabled,rect:{x:40,y,width:1072,height:136}});
  if(this.section!=='home')buttons.push({id:this.section.startsWith('reference')&&this.section!=='references'?'world:references':'world:home',label:this.section.startsWith('reference')&&this.section!=='references'?'‹ Reference images':'‹ World Settings',rect:{x:300,y:140,width:440,height:74}});
  let subtitle='Environment · background · guides · turntable · preferences';
  if(this.section==='home'){
   add('world:environment','Environment',244,'Studio or Passthrough');
   add('world:background','Studio Background',394,'Colour swatches · ground grid');
   add('world:guides','Guides and Constraints',544,'Mirror symmetry · angle snap');
   buttons.push({id:'world:preferences',label:'Preferences',disabled:busy,rect:{x:40,y:694,width:524,height:136}},{id:'world:lighting',label:'Lighting',detail:'Three-point rig · inspection',disabled:busy,rect:{x:588,y:694,width:524,height:136}});
   buttons.push({id:'world:references',label:'References',detail:'Import on desktop · place and inspect in VR',disabled:busy,rect:{x:588,y:844,width:524,height:136}});
   buttons.push({id:'world:turntable',label:'Turntable',detail:'Presentation rotation · live sculpting',disabled:busy,rect:{x:40,y:844,width:524,height:136}});
  }else if(['lighting','light','light-colour','light-position','inspection'].includes(this.section)){
   const rig=this.port?.lighting,s=layers.display.lighting??defaultLighting(),p=s.lights[this.light];
   subtitle='Lighting · workspace equipment · no shadows';
   if(this.section==='lighting'){
    add('lighting-enable',`Three-Point Lighting · ${s.enabled?'On':'Off'}`,244,'Off restores original illumination',s.enabled);
    LIGHT_IDS.forEach((id,i)=>buttons.push({id:`lighting-select:${id}`,label:`${id[0].toUpperCase()+id.slice(1)} Light`,detail:`${s.lights[id].enabled?'On':'Off'} · ${s.lights[id].intensity.toFixed(1)}`,disabled:busy,rect:{x:40+i*364,y:404,width:344,height:136}}));
    add('lighting-edit',`Edit Lights · ${rig?.editing?'On':'Off'}`,564,'Key 1 / Fill 2 / Rim 3 · Tool trigger · move hand + turn wrist',!!rig?.editing,busy||!rig||!s.enabled||!!rig?.inspection.enabled);
    add('world:inspection','Inspection Light',724,'Temporary rotating illumination · separate from Turntable');
    add('lighting-reset','Reset All Lights',884,'Restore positions, colours and intensities');
   }else if(this.section==='inspection'){
    const i=rig?.inspection;subtitle='Inspection · temporary override · settings not saved';
    add('inspection-enable',`Inspection Light · ${i?.enabled?'On':'Off'}`,244,'Overrides rig until switched off',!!i?.enabled,busy||!rig);
    add('inspection-pause',i?.paused?'Resume':'Pause',394,'Keeps current angle',!!i?.paused,busy||!rig);
    add('inspection-reverse','Reverse direction',544,`Speed · ${i?.speed??6} degrees / second`,false,busy||!rig);
    buttons.push({id:'inspection-slower',label:'Slower',disabled:busy||!rig,rect:{x:40,y:694,width:524,height:136}},{id:'inspection-faster',label:'Faster',disabled:busy||!rig,rect:{x:588,y:694,width:524,height:136}});
    add('inspection-reset','Reset angle',844,undefined,false,busy||!rig);
   }else if(this.section==='light-colour'){
    subtitle=`${this.light.toUpperCase()} · Colour`;
    LIGHT_COLOURS.forEach((c,i)=>buttons.push({id:`lighting-colour:${c}`,label:['Warm white','Cool white','White','Peach','Sky','Lavender'][i],colour:c,swatch:true,selected:p.colour===c,disabled:busy,rect:{x:40+(i%2)*548,y:244+Math.floor(i/2)*150,width:524,height:136}}));
    add('world:light','‹ Light settings',844);
   }else if(this.section==='light-position'){
    subtitle=`${this.light.toUpperCase()} · workspace position · aims at saved target`;
    for(let i=0;i<3;i++){const y=244+i*150;labels.push({text:`${'XYZ'[i]} · ${p.position[i].toFixed(2)}`,x:56,y,width:650,height:90});for(const [j,sign]of [-1,1].entries())buttons.push({id:`lighting-position:${i}:${sign}`,label:sign<0?'−':'+',disabled:busy,rect:{x:760+j*180,y,width:160,height:110}});}
    add('world:light','‹ Light settings',844);
   }else{
    subtitle=`${this.light.toUpperCase()} LIGHT · directional · distance does not change brightness`;
    add('lighting-individual',`Enabled · ${p.enabled?'On':'Off'}`,244,undefined,p.enabled);
    add('world:light-colour','Colour',394,p.colour);
    labels.push({text:`Intensity · ${p.intensity.toFixed(1)}`,x:300,y:560,width:550,height:90});
    buttons.push({id:'lighting-dimmer',label:'−',disabled:busy||p.intensity<=0,rect:{x:40,y:544,width:240,height:110}},{id:'lighting-brighter',label:'+',disabled:busy||p.intensity>=6,rect:{x:872,y:544,width:240,height:110}});
    add('world:light-position','Position / direction',694,'Edit Lights: hold Tool trigger to move and aim');add('lighting-reset-one','Reset this light',844);
   }
  }else if(this.section==='references'){
   subtitle='References · self-contained PNG/JPEG · import on desktop';
   add('reference-import','Import images…',244,'Exit XR to use the browser file picker');
   layers.display.references.forEach((r,i)=>buttons.push({id:`reference-select:${r.id}`,label:r.name,detail:`${r.visible?'Visible':'Hidden'} · ${r.locked?'Locked':'Unlocked'} · ${r.space}`,selected:this.port?.references?.selected===r.id,disabled:busy,rect:{x:40+(i%2)*548,y:404+Math.floor(i/2)*160,width:524,height:144}}));
   add('reference-edit',`Edit references · ${this.port?.references?.editing?'On':'Off'}`,904,'Selected unlocked panel: point + hold trigger, move/rotate wrist',!!this.port?.references?.editing);
  }else if(this.section==='reference'||this.section==='reference-pose'||this.section==='reference-delete'||this.section==='reference-more'){
   const r=layers.display.references.find(r=>r.id===this.port?.references?.selected);subtitle=r?.name??'Choose a reference';
   if(r&&this.section==='reference-delete'){add('reference-delete-confirm','Delete this reference',394,r.name);add('world:reference','Cancel',544);}
   else if(r&&this.section==='reference-pose'){
    for(let i=0;i<3;i++){const y=244+i*150;labels.push({text:`${'XYZ'[i]} · ${r.position[i].toFixed(2)}`,x:56,y,width:500,height:90});for(const [j,sign]of [-1,1].entries())buttons.push({id:`ref-pos:${i}:${sign}`,label:sign<0?'−':'+',disabled:busy||r.locked,rect:{x:760+j*180,y,width:160,height:110}});}
    add('reference-face','Face opposite direction',694,'Rotate 180° around local Y',false,busy||r.locked);add('reference-reset','Reset transform',844,undefined,false,busy||r.locked);
   }else if(r&&this.section==='reference-more'){
    add('world:reference','‹ Image controls',244);
    add('world:reference-pose','Precise placement',394,'Position · face direction · reset');
    add('reference-side',r.twoSided?'Two-sided · On':'Two-sided · Off',544,'Show the image from either side',r.twoSided);
    add('world:reference-delete','Delete image…',844,'Asks for confirmation');
   }else if(r){
    const cell=(id:string,label:string,x:number,y:number,detail?:string,selected=false,disabled=busy)=>buttons.push({id,label,detail,selected,disabled,rect:{x,y,width:524,height:112}});
    cell('reference-visible',r.visible?'Visible · On':'Visible · Off',40,244,undefined,r.visible);
    cell('reference-lock',r.locked?'Locked':'Unlocked',588,244,undefined,r.locked);
    add('reference-edit',this.port?.references?.editing?'Finish placing':'Place image',384,r.locked?'Unlock this image to move it':'Point at image · hold trigger · move or rotate hand',!!this.port?.references?.editing,busy||r.locked);
    labels.push({text:`Size · ${r.size.toFixed(2)}`,x:340,y:576,width:460,height:90});
    buttons.push({id:'reference-smaller',label:'−',disabled:busy||r.locked||r.size<=.05,rect:{x:40,y:554,width:250,height:112}},{id:'reference-larger',label:'+',disabled:busy||r.locked||r.size>=10,rect:{x:862,y:554,width:250,height:112}});
    cell('reference-flip-x','Flip X',40,704,'Mirror image horizontally',!!r.flipX);
    cell('reference-opacity',`Opacity · ${Math.round(r.opacity*100)}%`,588,704,'Tap to adjust',false,busy||r.locked);
    cell('reference-space',r.space==='workspace'?'Workspace anchor':'Sculpture anchor',40,864,r.space==='workspace'?'Stays outside turntable rotation':'Follows turntable rotation');
    cell('world:reference-more','More settings…',588,864,'Placement · two-sided · delete');

   }
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
   add('world:mirror-guide','Mirror guide appearance',844,'Grid · Outline · Hidden · spacing · opacity');
   add('snap-toggle',`Angle snap · ${this.tools.path.snap?'15°':'Off'}`,694,'Line + Move rotation · shared with tool options',!!this.tools.path.snap);
  }else if(this.section==='mirror-guide'){
   const guide=mirrorGuideSettings(world);subtitle='Mirror guide · hiding keeps symmetry active';
   for(const [i,mode] of (['grid','outline','hidden'] as const).entries())add(`mirror-guide:${mode}`,mode[0].toUpperCase()+mode.slice(1),244+i*150,undefined,guide.mode===mode);
   add('mirror-spacing',`Grid spacing · ${guide.spacing.toFixed(2)}`,694,'Tap: 0.05 / 0.1 / 0.2 / 0.5 / 1 source units');
   add('mirror-opacity',`Grid opacity · ${Math.round(guide.opacity*100)}%`,844,'Tap: 10 / 22 / 35 / 50 / 80 percent');
  }else if(this.section==='turntable'){
   const table=this.port?.turntable?.(),pref=turntableSettings(world);subtitle='Y axis · clockwise viewed from above · pauses during grabs';
   add('turntable-enable',`Turntable · ${table?.enabled?'On':'Off'}`,244,'Disabled on session entry',!!table?.enabled,busy||!table);
   add('turntable-direction',`Direction · ${pref.direction}`,394,'Tap to reverse',false);
   buttons.push({id:'turntable-slower',label:'− RPM',disabled:busy||pref.rpm<=0,rect:{x:40,y:544,width:250,height:110}},{id:'turntable-faster',label:'+ RPM',disabled:busy||pref.rpm>=12,rect:{x:862,y:544,width:250,height:110}});
   labels.push({text:`${pref.rpm.toFixed(1)} RPM`,x:330,y:555,width:480,height:90});
   add('turntable-pause',table?.paused?'Resume rotation':'Pause rotation',694,'Preserves current angle',!!table?.paused,busy||!table);
   buttons.push({id:'turntable-reset',label:'Reset angle',disabled:busy||!table,rect:{x:40,y:844,width:510,height:136}},{id:'world:pivot',label:'Pivot',disabled:busy,rect:{x:574,y:844,width:538,height:136}});
  }else if(this.section==='pivot'){
   const pref=turntableSettings(world);subtitle='Pivot · workspace source coordinates';
   add('pivot-centre','Sculpture centre',244,'Current sculpture bounds centre',pref.pivot===null);
   for(const [i,axis] of ['X','Y','Z'].entries()){
    const y=394+i*150;labels.push({text:`${axis} · ${(pref.pivot?.[i]??this.port?.turntable?.().centre.getComponent(i)??0).toFixed(2)}`,x:56,y,width:650,height:90});
    for(const [j,sign] of ['minus','plus'].entries())buttons.push({id:`pivot-${i}-${sign}`,label:sign==='minus'?'−':'+',disabled:busy,rect:{x:812+j*160,y,width:140,height:100}});
   }
  }else{
   subtitle='Preferences · display and diagnostics';
   add('world-ui-scale',`Large UI · ${layers.display.vrUiScale==='large'?'On':'Off'}`,244,'Off: Default size · On: Large',layers.display.vrUiScale==='large');
   add('world-diagnostics',`In-headset diagnostics · ${this.port?.diagnostics()?'On':'Off'}`,394,this.port?'Controller status and control hints':'Unavailable in this preview',!!this.port?.diagnostics(),busy||!this.port);
   add('world-performance',`VR performance · ${this.port?.performance()?'On':'Off'}`,544,this.port?'Existing performance panel and sampling':'Unavailable in this preview',!!this.port?.performance(),busy||!this.port);
  }
  if(this.port?.references?.error&&this.section.startsWith('reference'))subtitle=this.port.references.error;
  return {title:this.section==='reference'?'REFERENCE IMAGE':this.section==='reference-more'?'IMAGE SETTINGS':'WORLD SETTINGS',subtitle,buttons,labels,footer:'Hold Support stick · Tool trigger selects · release to close'};
 }
 activate(id:string):boolean{
  if(id.startsWith('lighting-')||id.startsWith('inspection-')){
   if(this.tools.busy)return true;
   const display=this.tools.port.layers().display,rig=this.port?.lighting;
   const s=display.lighting??=rig?.preset()??defaultLighting(),p=s.lights[this.light];
   if(id.startsWith('lighting-select:')){this.light=id.slice(16) as LightId;this.section='light';}
   else if(id==='lighting-enable'){s.enabled=!s.enabled;if(!s.enabled&&rig)rig.editing=false;}
   else if(id==='lighting-edit'&&rig){rig.sync();rig.editing=!rig.editing;rig.cancel();if(rig.editing&&this.port?.references){this.port.references.editing=false;this.port.references.cancel();}}
   else if(id==='lighting-individual')p.enabled=!p.enabled;
   else if(id.startsWith('lighting-colour:'))p.colour=id.slice(16);
   else if(id==='lighting-dimmer'||id==='lighting-brighter')p.intensity=Math.max(0,Math.min(6,Math.round((p.intensity+(id==='lighting-brighter'?.2:-.2))*10)/10));
   else if(id.startsWith('lighting-position:')){const [,axis,sign]=id.split(':');const a=Number(axis),v=Math.max(-1000,Math.min(1000,p.position[a]+Number(sign)*.1));if(p.position.some((n,i)=>Math.abs((i===a?v:n)-p.target[i])>=.001))p.position[a]=v;}
   else if(id==='lighting-reset')s.lights=(rig?.preset()??defaultLighting()).lights;
   else if(id==='lighting-reset-one')s.lights[this.light]=(rig?.preset()??defaultLighting()).lights[this.light];
   else if(rig){const i=rig.inspection;if(id==='inspection-enable'){rig.sync();i.enabled=!i.enabled;rig.editing=false;}else if(id==='inspection-pause')i.paused=!i.paused;else if(id==='inspection-reverse')i.direction*=-1;else if(id==='inspection-reset')rig.resetInspection();else if(id==='inspection-slower'||id==='inspection-faster')i.speed=Math.max(1,Math.min(30,i.speed+(id==='inspection-faster'?1:-1)));}
   rig?.cancel();this.tools.port.changed();return true;
  }

  const refs=this.port?.references,records=this.tools.port.layers().display.references,r=records.find(r=>r.id===refs?.selected);
  if(id.startsWith('reference-select:')){if(refs)refs.selected=id.slice(17);this.section='reference';return true;}
  if(id==='reference-import'){this.port?.importReferences?.();return true;}
  if(id==='reference-edit'){if(this.port?.lighting){this.port.lighting.editing=false;this.port.lighting.cancel();}if(refs){refs.editing=!refs.editing;refs.cancel();}return true;}
  if(id.startsWith('reference-')||id.startsWith('ref-pos:')){
   if(!r)return false;
   if(id==='reference-visible')r.visible=!r.visible;
   else if(id==='reference-lock')r.locked=!r.locked;
   else if(id==='reference-space')refs?.switchSpace(r);
   else if(id==='reference-delete-confirm'){this.tools.port.layers().display.references=records.filter(v=>v!==r);this.section='references';}
   else if(id==='reference-flip-x')r.flipX=!r.flipX;
   else if(id==='reference-side')r.twoSided=!r.twoSided;
   else if(!r.locked){
    if(id==='reference-smaller')r.size=Math.max(.05,r.size/1.1);else if(id==='reference-larger')r.size=Math.min(10,r.size*1.1);
    else if(id==='reference-opacity')r.opacity=r.opacity<=.25?1:Math.max(.05,r.opacity-.25);
    else if(id==='reference-face')r.rotation[1]=(r.rotation[1]+Math.PI)%(Math.PI*2);
    else if(id==='reference-reset'){r.position=[1,0,0];r.rotation=[0,0,0];r.size=1;}
    else if(id.startsWith('ref-pos:')){const [,axis,sign]=id.split(':');r.position[Number(axis)]=Math.max(-1000,Math.min(1000,r.position[Number(axis)]+Number(sign)*.05));}
   }
   refs?.cancel();this.tools.port.changed();return true;
  }
  if(id.startsWith('world:')){this.section=id.slice(6) as WorldSection;return true;}
  const layers=this.tools.port.layers();
  const worldGuide=()=>layers.display.world.mirrorGuide??=(mirrorGuideSettings(layers.display.world));
  const tablePrefs=()=>layers.display.world.turntable??=turntableSettings(layers.display.world);
  if(id.startsWith('background:')){const preset=STUDIO_BACKGROUNDS.find(p=>`background:${p.id}`===id);if(preset)layers.display.world.studioBackground=preset.id;}
  else if(id.startsWith('mirror-guide:'))worldGuide().mode=id.slice(13) as 'grid'|'outline'|'hidden';
  else if(id==='mirror-spacing'){const g=worldGuide(),steps=[.05,.1,.2,.5,1];g.spacing=steps[(steps.indexOf(g.spacing)+1)%steps.length];}
  else if(id==='mirror-opacity'){const g=worldGuide(),steps=[.1,.22,.35,.5,.8];g.opacity=steps[(steps.indexOf(g.opacity)+1)%steps.length];}
  else if(id==='turntable-enable'){const t=this.port?.turntable?.();if(t){t.enabled=!t.enabled;t.paused=false;}}
  else if(id==='turntable-pause'){const t=this.port?.turntable?.();if(t)t.paused=!t.paused;}
  else if(id==='turntable-reset')this.port?.turntable?.().reset();
  else if(id==='turntable-direction'){const p=tablePrefs();p.direction=p.direction==='clockwise'?'counterclockwise':'clockwise';}
  else if(id==='turntable-slower'||id==='turntable-faster'){const p=tablePrefs();p.rpm=Math.max(0,Math.min(12,p.rpm+(id.endsWith('faster')?.5:-.5)));}
  else if(id==='pivot-centre'){tablePrefs().pivot=null;this.port?.centreTurntable?.();}
  else if(/^pivot-[012]-(plus|minus)$/.test(id)){const p=tablePrefs();p.pivot??=this.port?.turntable?.().centre.toArray()??[0,0,0];const i=Number(id[6]);p.pivot[i]=Math.max(-1000,Math.min(1000,Math.round((p.pivot[i]+(id.endsWith('plus')?.05:-.05))*100)/100));}
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
