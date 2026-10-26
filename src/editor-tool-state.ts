import {BRUSH_RADIUS_LIMITS} from './brush-settings';
import {ClayPathControls} from './clay-path';
import type {IndependentLayers} from './independent-layers';
import type {ShapePreviewModel} from './shape-preview';
import {shapeDimensionsForKind} from './shape-preview';
import {SHAPE_KINDS,SHAPE_METADATA} from './shapes';
import type {ShapeKind} from './shapes';
import type {SculptSettings} from './project';
import type {EditorMode} from './interaction';
import {copyTransform,hasUniformScale,identityTransform} from './transform';
export type EditorTool='clay'|'smooth'|'stamp'|'transform'|'move';
export const EDITOR_TOOLS=Object.freeze([
 {id:'clay',label:'Clay',detail:'Add / subtract',enabled:true,layerGrab:false,sizing:'brush-radius'},
 {id:'smooth',label:'Smooth',detail:'Soften surfaces',enabled:true,layerGrab:false,sizing:'brush-radius'},
 {id:'stamp',label:'Shape Stamp',detail:'Shape settings',enabled:true,layerGrab:false,sizing:'shape-scale'},
 {id:'transform',label:'Transform Layer',detail:'Move / wrist rotate',enabled:true,layerGrab:true,sizing:null},
 {id:'move',label:'Move Tool',detail:'Surface deformation · release commits',enabled:true,layerGrab:false,sizing:'brush-radius'},
] as const);
export function toolAllowsLayerGrab(tool:EditorTool):boolean{return EDITOR_TOOLS.some(t=>t.id===tool&&t.layerGrab);}
export function toolSizingBinding(tool:EditorTool){return EDITOR_TOOLS.find(t=>t.id===tool)?.sizing??null;}
export type ToolOption={id:string;label:string;value:string;decrease:boolean;increase:boolean;disabled:boolean;action?:string;slider?:{min:number;max:number;value:number}};
type Declaration={id:string;label:string;read:()=>number|string;write?:(v:number|string)=>void;min?:number;max?:number;step?:number;choices?:readonly string[];names?:readonly string[];format?:(v:number|string)=>string;disabled?:boolean;action?:string;slider?:boolean};
/** The port reads/writes the existing application state. There is no VR copy of tool values. */
export type EditorToolPort={layers:()=>IndependentLayers;shape:ShapePreviewModel;settings:()=>SculptSettings;setSettings:(v:SculptSettings)=>void;mode:()=>EditorMode;selectTool:(tool:EditorTool)=>void;selectTransform:(mode:Exclude<EditorMode,'sculpt'>)=>void;busy:()=>boolean;changed:()=>void};
export class EditorToolState {
 alternateTool:'off'|'clay'|'smooth'='smooth';
 private moveSelected=false;private previewOwner:{cancel:()=>void}|null=null;
 readonly move={precision:false,interaction:'translate' as 'translate'|'rotate'|'twist',axis:'free' as 'free'|'x'|'y'|'z',angularStrength:1,angleClamp:120,radius:.3,falloff:2,strength:1,stiffness:1,mode:'non-elastic' as 'preview'|'non-elastic'|'elastic'};
 get brushRadius():number{return this.active==='move'?this.move.radius:this.port.settings().radius;}
 beginPreview(owner:{cancel:()=>void}):void{if(this.busy)throw new Error('Finish the current interaction first.');this.previewOwner=owner;}
 endPreview(owner:object):void{if(this.previewOwner===owner)this.previewOwner=null;}
 clearMoveSelection():void{this.previewOwner?.cancel();this.moveSelected=false;}
 readonly path=new ClayPathControls();
 readonly stampRotation:[number,number,number]=[0,0,0];
 constructor(readonly port:EditorToolPort){}
 setStampScale(value:number):boolean {
  if(this.busy||this.active!=='stamp'||!Number.isFinite(value))return false;
  const shape=this.port.shape,stack=this.port.layers().project.layerStack;if(shape.availability(stack))return false;
  const d=shape.definition,next=Math.max(.02,Math.min(10,value));if(Math.abs(next-d.transform.scale[0])<1e-12)return false;
  shape.set({...d,transform:{...d.transform,scale:[next,next,next]}},stack);return true;
 }
 get active():EditorTool{return this.moveSelected&&!this.port.shape.enabled&&this.port.mode()==='sculpt'?'move':this.port.shape.enabled?'stamp':this.port.mode()!=='sculpt'?'transform':this.port.settings().mode==='smooth'?'smooth':'clay';}
 get busy():boolean{const l=this.port.layers();return !!this.previewOwner||this.port.busy()||l.drawing||l.transforming||l.previewing||l.deforming;}
 setBrushRadius(value:number,current?:SculptSettings):boolean{if(this.busy||toolSizingBinding(this.active)!=='brush-radius'||!Number.isFinite(value))return false;const settings=current??this.port.settings(),radius=Math.max(BRUSH_RADIUS_LIMITS.min,Math.min(BRUSH_RADIUS_LIMITS.max,value));if(Math.abs(this.brushRadius-radius)<1e-12)return false;if(this.active==='move')this.move.radius=radius;else this.port.setSettings({...settings,radius});return true;}
 select(tool:EditorTool):void{const cancelled=!!this.previewOwner;this.previewOwner?.cancel();const l=this.port.layers(),onlyCancelledMove=cancelled&&l.deforming&&!this.previewOwner&&!l.previewing&&!l.drawing&&!l.transforming&&!this.port.busy();if(this.busy&&!onlyCancelledMove)throw new Error('Finish the current interaction first.');if(!EDITOR_TOOLS.some(t=>t.id===tool&&t.enabled))throw new Error('This tool is unavailable.');this.port.selectTool(tool);this.moveSelected=tool==='move';this.port.changed();}
 selectLayer(id:string):void{this.assertIdle();this.port.layers().select(id);this.port.shape.sync(this.port.layers().project.layerStack);this.port.changed();}
 toggleLayer(id:string,flag:'visible'|'locked'):void{this.assertIdle();const l=this.port.layers();l.setFlag(id,flag,!l.project.layerStack.get(id)[flag]);this.port.changed();}
 resetLayerTransform(id:string):void{this.assertIdle();const l=this.port.layers();if(this.active!=='transform'||id!==l.project.activeLayerId)throw new Error('Reset cancelled: selected layer changed.');l.setActiveTransform(identityTransform());this.port.changed();}
 private assertIdle():void{if(this.busy)throw new Error('Finish the current interaction first.');}
 private declarations():Declaration[]{
  const p=this.port,l=p.layers(),settings=p.settings(),active=this.active,options:Declaration[]=[];
  const brush=(id:'radius'|'strength'|'hardness',label:string,min:number,max:number,step:number)=>options.push({id,label,read:()=>settings[id],write:v=>p.setSettings({...p.settings(),[id]:v}),min,max,step,format:v=>id==='radius'?Number(v).toFixed(3):`${Math.round(Number(v)*100)}%`});
  if(active==='clay'||active==='smooth'){
   if(active==='clay')options.push({id:'operation',label:'Clay operation',read:()=>settings.mode,write:v=>p.setSettings({...p.settings(),mode:v as 'add'|'subtract'}),choices:['add','subtract'],names:['Add','Subtract']});
   options.push({id:'placement',label:'Placement',read:()=>this.path.placement,write:v=>this.path.placement=v as 'free'|'surface',choices:['free','surface'],names:['Free space','Surface follow']});
   brush('radius','Brush radius',BRUSH_RADIUS_LIMITS.min,BRUSH_RADIUS_LIMITS.max,.02);brush('strength',active==='smooth'?'Smoothing strength':'Strength',.01,1,.05);
   if(active==='clay'){brush('hardness','Hardness',0,1,.05);options.push({id:'steady',label:'Steady',read:()=>this.path.steady,write:v=>this.path.steady=Number(v),min:0,max:100,step:5,format:v=>`${v}%`,disabled:this.path.straightLine,slider:true},{id:'straight-line',label:'Straight Line',read:()=>this.path.straightLine?'on':'off',write:v=>this.path.straightLine=v==='on',choices:['off','on'],names:['Off','On']});options.push({id:'spacing',label:'Stroke spacing',read:()=> 'Automatic',disabled:true});}
   options.push({id:'application',label:'VR strokes',read:()=>this.path.placement==='free'?'Tool trigger · free space':'Tool trigger · surface',disabled:true});
  }
  if(active==='move'){
   options.push({id:'move-interaction',label:'Move gesture',read:()=>this.move.interaction,write:v=>this.move.interaction=v as typeof this.move.interaction,choices:['translate','rotate','twist'],names:['Translate','Rotate region','Twist region']});
   if(this.move.interaction!=='translate')options.push({id:'move-axis',label:'Rotation axis · layer local',read:()=>this.move.axis,write:v=>this.move.axis=v as typeof this.move.axis,choices:['free','x','y','z'],names:['Wrist axis','X','Y','Z']},
    {id:'move-angular-strength',label:'Wrist sensitivity',read:()=>this.move.angularStrength,write:v=>this.move.angularStrength=Number(v),min:.1,max:2,step:.1},
    {id:'move-angle-clamp',label:'Angle limit · degrees',read:()=>this.move.angleClamp,write:v=>this.move.angleClamp=Number(v),min:15,max:180,step:15},
    {id:'move-compatibility',label:'Wrist behaviour',read:()=>this.move.interaction==='translate'?'Selected mode below':'Fixed pivot · Non-Elastic; lock axis for twist',disabled:true});
   options.push({id:'move-precision',label:'Precision',read:()=>this.move.precision?'on':'off',write:v=>this.move.precision=v==='on',choices:['off','on'],names:['Off · full sensitivity','On · quarter sensitivity']},
    {id:'move-mode',label:this.move.interaction==='translate'?'Translation feel / preview':'Saved translation setting',read:()=>this.move.mode,write:v=>this.move.mode=v as 'preview'|'non-elastic'|'elastic',choices:['non-elastic','elastic','preview'],names:['Non-Elastic · direct pull','Elastic · soft pull','Preview only · release restores'],disabled:this.move.interaction!=='translate'},
    {id:'move-radius',label:'Influence Radius',read:()=>this.move.radius,write:v=>this.move.radius=Number(v),min:BRUSH_RADIUS_LIMITS.min,max:BRUSH_RADIUS_LIMITS.max,step:.02,format:v=>Number(v).toFixed(3)},
    {id:'move-falloff',label:'Edge softness',read:()=>this.move.falloff,write:v=>this.move.falloff=Number(v),min:1,max:4,step:.5},
    {id:'move-strength',label:'Translation strength',read:()=>this.move.strength,write:v=>this.move.strength=Number(v),min:.01,max:1,step:.05,disabled:this.move.interaction!=='translate'},
    {id:'move-stiffness',label:'Elastic firmness',read:()=>this.move.stiffness,write:v=>this.move.stiffness=Number(v),min:.25,max:4,step:.25,disabled:this.move.mode!=='elastic'||this.move.interaction!=='translate'},
    {id:'application',label:'Release / cancel',read:()=>this.move.mode==='preview'?'Restores SDF surface · no undo action':'Commit one action · cancel restores',disabled:true});
  }
  if(active==='stamp'){
   p.shape.sync(l.project.layerStack);const d=p.shape.definition,blocked=!!p.shape.availability(l.project.layerStack),set=(v:typeof d)=>p.shape.set(v,l.project.layerStack);
   options.push({id:'shape',label:'Shape',read:()=>d.kind,write:v=>{const kind=v as ShapeKind;set({...d,kind,dimensions:shapeDimensionsForKind(kind,d.dimensions)});},choices:SHAPE_KINDS,names:SHAPE_KINDS.map(k=>SHAPE_METADATA[k].name),disabled:blocked},
    {id:'operation',label:'Stamp operation',read:()=>d.operation,write:v=>set({...d,operation:v as 'add'|'subtract'}),choices:['add','subtract'],names:['Add','Subtract'],disabled:blocked});
   const rule=SHAPE_METADATA[d.kind].dimensionRule;
   for(let i=0;i<3;i++)options.push({id:`dimension-${i}`,label:rule==='diameter'&&i===0?'Diameter':`Dimension ${'XYZ'[i]}`,read:()=>d.dimensions[i],write:v=>{const dimensions=[...d.dimensions] as [number,number,number];dimensions[i]=Number(v);if(rule==='diameter')dimensions.fill(Number(v));if(rule==='square-base'&&(i===0||i===2))dimensions[0]=dimensions[2]=Number(v);set({...d,dimensions});},min:.001,max:1000,step:.05,disabled:blocked||rule==='diameter'&&i!==0||rule==='square-base'&&i===2});
   for(let i=0;i<3;i++)options.push({id:`rotation-${i}`,label:`Wrist offset ${'XYZ'[i]} (°)`,read:()=>this.stampRotation[i]*180/Math.PI,write:v=>{this.stampRotation[i]=Number(v)*Math.PI/180;const transform=copyTransform(d.transform);transform.rotation[i]=this.stampRotation[i];set({...d,transform});},min:-360,max:360,step:15,format:v=>`${Number(v).toFixed(0)}°`,disabled:blocked});
   options.push({id:'shape-scale',label:'Uniform scale',read:()=>d.transform.scale[0],write:v=>set({...d,transform:{...d.transform,scale:[Number(v),Number(v),Number(v)]}}),min:.02,max:10,step:.1,disabled:blocked},
    {id:'application',label:'VR stamp application',read:()=> 'Trigger once · free space',disabled:true});
  }
  if(active==='transform'){
   const editable=l.active.layer.editable,t=l.active.layer.transform,mode=p.mode();
   options.push({id:'transform-mode',label:'Transform options',read:()=>mode,write:v=>p.selectTransform(v as 'translate'|'rotate'|'scale'),choices:['translate','rotate','scale'],names:['Move','Rotate','Scale']},
    {id:'surface-view',label:'Surface view',read:()=>l.viewMode,write:v=>{l.viewMode=v as 'separate'|'boolean';},choices:['separate','boolean'],names:['Separate Layers','Boolean Preview']});
   if(mode==='translate'||mode==='rotate')for(let i=0;i<3;i++)options.push({id:`layer-${i}`,label:`${mode==='translate'?'Move':'Rotate'} ${'XYZ'[i]}`,read:()=>mode==='translate'?t.position[i]:t.rotation[i]*180/Math.PI,write:v=>{const next=copyTransform(t);if(mode==='translate')next.position[i]=Number(v);else next.rotation[i]=Number(v)*Math.PI/180;l.setActiveTransform(next);},min:-1000,max:1000,step:mode==='translate'?.1:5,format:v=>mode==='rotate'?`${Number(v).toFixed(0)}°`:Number(v).toFixed(2),disabled:!editable});
   if(mode==='scale')options.push({id:'layer-scale',label:'Layer uniform scale',read:()=>t.scale[0],write:v=>l.setActiveTransform({...copyTransform(t),scale:[Number(v),Number(v),Number(v)]}),min:.001,max:1000,step:.1,disabled:!editable||!hasUniformScale(t)});
   options.push({id:'selected-layer',label:'Selected layer',read:()=>l.active.layer.name,disabled:true},{id:'workspace-note',label:'Workspace / layer',read:()=> 'Support/both = view; Tool = saved layer',disabled:true},{id:'reset-layer',label:'Reset Layer Transform…',read:()=> 'Position 0 · rotation 0 · scale 1',action:'reset-layer',disabled:!editable});
   options.push({id:'grip',label:'Tool grip',read:()=>l.transforming?'Moving / rotating · release grip':l.viewMode!=='separate'?'Use Separate Layers':!editable?'Show / unlock layer':!hasUniformScale(t)?'Uniform layer scale required':'Move + wrist rotate',disabled:true});
  }
  options.push({id:'alternate-tool',label:'Support trigger alternate',read:()=>this.alternateTool,write:v=>this.alternateTool=v as 'off'|'clay'|'smooth',choices:['off','smooth','clay'],names:['Off','Smooth','Clay']});
  return options;
 }
 options():ToolOption[]{return this.declarations().map(d=>{const value=d.read(),disabled=this.busy||!!d.disabled||!d.write&&!d.action,index=d.choices?.indexOf(String(value))??0;return {action:d.action,slider:d.slider?{min:d.min!,max:d.max!,value:Number(value)}:undefined,id:d.id,label:d.label,value:d.format?.(value)??(d.choices?(d.names??d.choices)[index]:typeof value==='number'?Number(value.toFixed(3)).toString():value),disabled,decrease:!disabled&&(!!d.choices||Number(value)>d.min!),increase:!disabled&&(!!d.choices||Number(value)<d.max!)};});}
 setValue(id:string,value:number):void{this.assertIdle();const d=this.declarations().find(o=>o.id===id);if(!d?.slider||d.disabled||!d.write||!Number.isFinite(value))return;value=Math.max(d.min!,Math.min(d.max!,Math.round(value)));if(d.read()===value)return;d.write(value);this.port.changed();}
 adjust(id:string,direction:-1|1):void{
  this.assertIdle();const d=this.declarations().find(o=>o.id===id);if(!d||d.disabled||!d.write)throw new Error('This option is unavailable.');
  let value:number|string;
  if(d.choices){const index=d.choices.indexOf(String(d.read()));value=d.choices[(index+direction+d.choices.length)%d.choices.length];}
  else value=Math.max(d.min!,Math.min(d.max!,Number((Number(d.read())+direction*d.step!).toFixed(6))));
  d.write(value);this.port.changed();
 }
}
