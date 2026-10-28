import {XRWorldMenu,type XRWorldMenuPort} from './xr-world-menu';
import {MAX_PROJECT_LAYERS} from './project';
import {volumeLabel} from './volume-store';
import {EDITOR_TOOLS} from './editor-tool-state';
import type {EditorToolState,EditorTool} from './editor-tool-state';
import type {XRMenuRequest} from './xr-support-shortcuts';
export type MenuRect={x:number;y:number;width:number;height:number};
export type MenuButton={id:string;label:string;detail?:string;colour?:string;swatch?:boolean;selected?:boolean;disabled?:boolean;rect?:MenuRect;sector?:number;slider?:{value:number;min:number;max:number}};
export type MenuContent={title:string;subtitle:string;buttons:MenuButton[];labels:{text:string;x:number;y:number;small?:boolean;width?:number;height?:number;value?:boolean}[];footer:string};
export const MENU_SIZE=1152;
export const OPTIONS_PER_PAGE=5;
export const WHEEL=Object.freeze({x:576,y:590,inner:185,outer:430,labelRadius:328});
/** Screen-independent menu state, hit targets and application command dispatch. */
export class XRMenuModel {
 request:XRMenuRequest|null=null;page:XRMenuRequest='tool-wheel';optionPage=0;hover:string|null=null;feedback='';
 private merge:{project:unknown;id:string;other?:string;resolution:number}|null=null;private mergeAbort:AbortController|null=null;
 private resetTarget:{project:unknown;id:string}|null=null;
 readonly world:XRWorldMenu;
 constructor(readonly tools:EditorToolState,worldPort?:XRWorldMenuPort){this.world=new XRWorldMenu(tools,worldPort);}
 setRequest(request:XRMenuRequest|null):void{if(request===this.request)return;this.mergeAbort?.abort();this.mergeAbort=null;this.merge=null;this.resetTarget=null;this.request=request;this.page=request??'tool-wheel';this.optionPage=0;this.world.section='home';this.hover=null;this.feedback='';}
 content():MenuContent{const content=this.buildContent();content.buttons.push({id:'ui-scale',label:`UI · ${this.tools.port.layers().display.vrUiScale==='large'?'Large':'Default'}`,rect:{x:848,y:42,width:264,height:76},disabled:this.tools.busy});return content;}
 private buildContent():MenuContent{
  if(this.page==='world')return this.world.content();
  if(this.resetTarget&&(this.tools.active!=='transform'||this.tools.busy||this.tools.port.layers().project!==this.resetTarget.project||this.tools.port.layers().project.activeLayerId!==this.resetTarget.id)){this.resetTarget=null;this.feedback='Reset cancelled: selection or interaction changed';}
  if(this.resetTarget){const l=this.tools.port.layers().active.layer;return {title:'RESET LAYER TRANSFORM?',subtitle:l.name,labels:[{text:'Position 0 · rotation 0 · uniform scale 1',x:60,y:320},{text:'Permanent layer edit · one Undo action',x:60,y:390},{text:'Workspace navigation stays unchanged',x:60,y:460}],buttons:[{id:'cancel-reset',label:'Cancel',rect:{x:60,y:600,width:480,height:110}},{id:'confirm-reset',label:'Reset layer',disabled:!l.editable,rect:{x:600,y:600,width:480,height:110}}],footer:'Release trigger, then confirm or cancel'};}
  if(this.merge){const state=this.merge,l=this.tools.port.layers();if(l.project!==state.project||l.project.activeLayerId!==state.id&&!this.mergeAbort){this.merge=null;this.feedback='Merge cancelled: selected layer changed';return this.content();}
   const running=!!this.mergeAbort,buttons:MenuButton[]=[{id:'cancel-merge',label:running?'Cancel merge':'‹ Back to Layers',rect:{x:40,y:150,width:1072,height:68}}];
   if(!state.other){l.project.layerStack.layers.filter(x=>x.id!==state.id).forEach((layer,i)=>buttons.push({id:`merge-target:${layer.id}`,label:layer.name,rect:{x:40,y:240+i*100,width:1072,height:82},disabled:this.tools.busy}));}
   else {buttons.push({id:'merge-resolution',label:`Output ${state.resolution}³ · tap to change`,rect:{x:40,y:440,width:1072,height:100},disabled:running},{id:'confirm-merge',label:'Merge these two layers',rect:{x:40,y:640,width:1072,height:100},disabled:this.tools.busy||running});}
   return {title:running?'MERGING…':state.other?'MERGE TWO LAYERS?':'CHOOSE LAYER TO MERGE',subtitle:l.project.layerStack.get(state.id).name,buttons,labels:state.other?[{text:l.project.layerStack.get(state.other).name,x:52,y:310},{text:'Union · originals kept hidden · one Undo',x:52,y:370},{text:'Lower resolution can lose fine detail',x:52,y:590}]:[],footer:this.feedback||'Hold Support stick · release cancels'};
  }
  const buttons:MenuButton[]=[],labels:MenuContent['labels']=[],title=this.page==='tool-wheel'?'TOOL WHEEL':this.page==='layers'?'LAYERS':`${EDITOR_TOOLS.find(t=>t.id===this.tools.active)?.label.toUpperCase()} OPTIONS`;
  const add=(id:string,label:string,x:number,y:number,width:number,height:number,selected=false,disabled=false,detail?:string)=>buttons.push({id,label,rect:{x,y,width,height},selected,disabled,detail});
  if(this.page==='tool-wheel'){
   add('world','World Settings',760,140,352,74,false,this.tools.busy);
   add('snap-toggle',this.tools.path.snap?'Snap 15° · On':'Snap 15° · Off',40,140,300,74,!!this.tools.path.snap,this.tools.busy);
   EDITOR_TOOLS.forEach((tool,i)=>buttons.push({id:`tool:${tool.id}`,label:tool.label,detail:tool.detail,sector:i,selected:this.tools.active===tool.id,disabled:!tool.enabled||this.tools.busy}));
   add('options','Options',436,518,280,144,false,false,EDITOR_TOOLS.find(t=>t.id===this.tools.active)?.label);
  }else if(this.page==='layers'){
   const layers=this.tools.port.layers();
   const full=layers.project.layerStack.layers.length>=MAX_PROJECT_LAYERS;
   add('new-layer','＋ Add New Layer',40,960,524,78,false,this.tools.busy||full,full?'Maximum of 8 layers reached':'Empty clay volume · 64³ · selects new layer');
   add('merge-layers','Merge with…',588,960,524,78,false,this.tools.busy||full||layers.project.layerStack.layers.length<2);
   labels.push({text:'Select layer',x:48,y:174,width:650,height:38},{text:'Visibility',x:728,y:174,width:176,height:38},{text:'Lock',x:944,y:174,width:168,height:38});
   layers.project.layerStack.layers.forEach((layer,i)=>{const y=216+i*94,active=layer.id===layers.project.activeLayerId;
    add(`select:${layer.id}`,layer.name,40,y,664,82,active,this.tools.busy,`${active?'✓ Active · ':''}${volumeLabel(layer.volume)} · ${layer.operation==='union'?'Union':layer.operation==='difference'?'Difference':'Intersect'}`);
    buttons[buttons.length-1].colour=layers.display.colour(layers.project.id,layer.id,layer.order);
    add(`visible:${layer.id}`,layer.visible?'Visible':'Hidden',720,y,176,82,layer.visible,this.tools.busy);
    add(`locked:${layer.id}`,layer.locked?'Locked':'Unlocked',912,y,200,82,layer.locked,this.tools.busy);
   });
  }else{
   add('tools','‹ Tools',40,140,240,74);add('snap-toggle',this.tools.path.snap?'Snap 15° · On':'Snap 15° · Off',300,140,440,74,!!this.tools.path.snap,this.tools.busy);const all=this.tools.options(),pages=Math.max(1,Math.ceil(all.length/OPTIONS_PER_PAGE));this.optionPage=Math.min(this.optionPage,pages-1);

   add('prev','‹',788,140,144,74,false,this.optionPage===0);add('next','›',948,140,164,74,false,this.optionPage===pages-1);
   all.slice(this.optionPage*OPTIONS_PER_PAGE,this.optionPage*OPTIONS_PER_PAGE+OPTIONS_PER_PAGE).forEach((option,i)=>{const y=244+i*150;
    if(option.action){add(option.action,option.label,40,y,1072,136,false,option.disabled,option.value);return;}
    labels.push({text:option.label,x:56,y:y+2,small:true,width:724,height:68},{text:option.value,x:56,y:y+72,width:option.slider?280:724,height:76,value:true});
    if(option.slider)buttons.push({id:`slider:${option.id}`,label:'',rect:{x:380,y:y+78,width:380,height:54},disabled:option.disabled,slider:option.slider});
    add(`dec:${option.id}`,'-',812,y+22,140,92,false,!option.decrease);add(`inc:${option.id}`,'+',972,y+22,140,92,false,!option.increase);
   });
  }
  return {title,subtitle:this.page==='tool-options'?`Page ${this.optionPage+1} / ${Math.max(1,Math.ceil(this.tools.options().length/OPTIONS_PER_PAGE))} · Tool trigger selects`:this.page==='layers'?'Point with Tool Hand · trigger to select / toggle':'Point with Tool Hand · trigger to select',buttons,labels,footer:this.feedback||'Hold Support stick · release to close'};
 }
 hit(x:number,y:number,content=this.content()):string|null{
  if(!this.request||!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>MENU_SIZE||y>MENU_SIZE)return null;
  for(const b of content.buttons)if(b.rect&&x>=b.rect.x&&x<=b.rect.x+b.rect.width&&y>=b.rect.y&&y<=b.rect.y+b.rect.height)return b.id;
  if(this.page==='tool-wheel'){
   const dx=x-WHEEL.x,dy=y-WHEEL.y,r=Math.hypot(dx,dy);if(r<WHEEL.inner||r>WHEEL.outer)return null;
   const angle=((Math.atan2(dy,dx)+Math.PI/2+Math.PI/EDITOR_TOOLS.length)%(2*Math.PI)+2*Math.PI)%(2*Math.PI),sector=Math.floor(angle/(2*Math.PI/EDITOR_TOOLS.length));
   return content.buttons.find(b=>b.sector===sector)?.id??null;
  }return null;
 }
 setSlider(id:string,ratio:number):void{if(!this.request)return;const option=this.tools.options().find(o=>`slider:${o.id}`===id);if(!option?.slider||option.disabled)return;this.tools.setValue(option.id,option.slider.min+Math.max(0,Math.min(1,ratio))*(option.slider.max-option.slider.min));}
 activate(id:string):void{
  if(!this.request)return;
  const button=this.content().buttons.find(b=>b.id===id);if(!button||button.disabled){this.feedback='Unavailable';return;}
  try{
   const separator=id.indexOf(':'),action=separator<0?id:id.slice(0,separator),value=id.slice(separator+1);
   if(id==='world'){this.page='world';this.world.section='home';}
   else if(this.page==='world'&&this.world.activate(id)){}
   else if(id==='ui-scale'||id==='world-ui-scale'){const l=this.tools.port.layers();l.display.vrUiScale=l.display.vrUiScale==='large'?'normal':'large';this.tools.port.changed();}
   else if(id.startsWith('tube-')){void this.tools.splineAction(id).catch(error=>{this.feedback=error instanceof Error?error.message:'Spline action failed';});}
   else if(id==='snap-toggle')this.tools.adjust('global-snap',1);
   else if(id==='merge-layers'){const l=this.tools.port.layers();this.merge={project:l.project,id:l.project.activeLayerId,resolution:128};}
   else if(action==='merge-target'&&this.merge)this.merge.other=value;
   else if(id==='merge-resolution'&&this.merge)this.merge.resolution=this.merge.resolution===64?128:this.merge.resolution===128?192:64;
   else if(id==='cancel-merge'){this.mergeAbort?.abort();this.mergeAbort=null;this.merge=null;}
   else if(id==='confirm-merge'&&this.merge?.other){const state=this.merge,l=this.tools.port.layers(),abort=new AbortController();this.mergeAbort=abort;
    void l.bake({name:'Merged sculpture',resolution:state.resolution,hideSources:true,sourceIds:[state.id,state.other!]},abort.signal,p=>{this.feedback=`${p.stage} ${p.completed}/${p.total}`;}).then(()=>{if(this.mergeAbort!==abort)return;this.mergeAbort=null;this.merge=null;this.feedback='Merged · originals hidden · Undo restores';this.tools.port.shape.sync(l.project.layerStack);this.tools.port.changed();}).catch(error=>{if(this.mergeAbort!==abort)return;this.mergeAbort=null;this.feedback=error instanceof Error?error.message:'Merge failed; sources kept';});
   }
   else if(id==='reset-stamp-offset')this.tools.resetStampOffset();
   else if(id==='reset-layer'){const l=this.tools.port.layers();this.resetTarget={project:l.project,id:l.project.activeLayerId};}
   else if(id==='cancel-reset')this.resetTarget=null;
   else if(id==='confirm-reset'){const target=this.resetTarget;this.resetTarget=null;if(target&&this.tools.port.layers().project===target.project)this.tools.resetLayerTransform(target.id);}
   else if(action==='tool'){this.tools.select(value as EditorTool);this.page='tool-options';this.optionPage=0;}
   else if(id==='options'){this.page='tool-options';this.optionPage=0;}
   else if(id==='tools'){this.page='tool-wheel';this.optionPage=0;}
   else if(id==='next')this.optionPage++;else if(id==='prev')this.optionPage--;
   else if(id==='new-layer')this.tools.createLayer();
   else if(action==='select')this.tools.selectLayer(value);
   else if(action==='visible'||action==='locked')this.tools.toggleLayer(value,action);
   else if(action==='inc'||action==='dec')this.tools.adjust(value,action==='inc'?1:-1);
   this.feedback='';this.hover=null;
  }catch(error){this.feedback=error instanceof Error?error.message:'Action unavailable';}
 }
}
