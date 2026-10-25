import {EDITOR_TOOLS} from './editor-tool-state';
import type {EditorToolState,EditorTool} from './editor-tool-state';
import type {XRMenuRequest} from './xr-support-shortcuts';
export type MenuRect={x:number;y:number;width:number;height:number};
export type MenuButton={id:string;label:string;detail?:string;colour?:string;selected?:boolean;disabled?:boolean;rect?:MenuRect;sector?:number;slider?:{value:number;min:number;max:number}};
export type MenuContent={title:string;subtitle:string;buttons:MenuButton[];labels:{text:string;x:number;y:number;small?:boolean}[];footer:string};
export const MENU_SIZE=1152;
export const WHEEL=Object.freeze({x:576,y:590,inner:185,outer:430,labelRadius:305});
/** Screen-independent menu state, hit targets and application command dispatch. */
export class XRMenuModel {
 request:XRMenuRequest|null=null;page:XRMenuRequest='tool-wheel';optionPage=0;hover:string|null=null;feedback='';
 private resetTarget:{project:unknown;id:string}|null=null;
 constructor(readonly tools:EditorToolState){}
 setRequest(request:XRMenuRequest|null):void{if(request===this.request)return;this.resetTarget=null;this.request=request;this.page=request??'tool-wheel';this.optionPage=0;this.hover=null;this.feedback='';}
 content():MenuContent{
  if(this.resetTarget&&(this.tools.active!=='transform'||this.tools.busy||this.tools.port.layers().project!==this.resetTarget.project||this.tools.port.layers().project.activeLayerId!==this.resetTarget.id)){this.resetTarget=null;this.feedback='Reset cancelled: selection or interaction changed';}
  if(this.resetTarget){const l=this.tools.port.layers().active.layer;return {title:'RESET LAYER TRANSFORM?',subtitle:l.name,labels:[{text:'Position 0 · rotation 0 · uniform scale 1',x:60,y:320},{text:'Permanent layer edit · one Undo action',x:60,y:390},{text:'Workspace navigation stays unchanged',x:60,y:460}],buttons:[{id:'cancel-reset',label:'Cancel',rect:{x:60,y:600,width:480,height:110}},{id:'confirm-reset',label:'Reset layer',disabled:!l.editable,rect:{x:600,y:600,width:480,height:110}}],footer:'Release trigger, then confirm or cancel'};}
  const buttons:MenuButton[]=[],labels:MenuContent['labels']=[],title=this.page==='tool-wheel'?'TOOL WHEEL':this.page==='layers'?'LAYERS':`${EDITOR_TOOLS.find(t=>t.id===this.tools.active)?.label.toUpperCase()} OPTIONS`;
  const add=(id:string,label:string,x:number,y:number,width:number,height:number,selected=false,disabled=false,detail?:string)=>buttons.push({id,label,rect:{x,y,width,height},selected,disabled,detail});
  if(this.page==='tool-wheel'){
   EDITOR_TOOLS.forEach((tool,i)=>buttons.push({id:`tool:${tool.id}`,label:tool.label,detail:tool.detail,sector:i,selected:this.tools.active===tool.id,disabled:!tool.enabled||this.tools.busy}));
   add('options','Options',436,518,280,144,false,false,EDITOR_TOOLS.find(t=>t.id===this.tools.active)?.label);
  }else if(this.page==='layers'){
   const layers=this.tools.port.layers();labels.push({text:'Select layer',x:48,y:192},{text:'Visibility',x:728,y:192},{text:'Lock',x:944,y:192});
   layers.project.layerStack.layers.forEach((layer,i)=>{const y=216+i*94,active=layer.id===layers.project.activeLayerId;
    add(`select:${layer.id}`,layer.name,40,y,664,82,active,this.tools.busy,`${active?'✓ Active · ':''}${layer.volume.resolution}³ · ${layer.operation==='union'?'Union':layer.operation==='difference'?'Difference':'Intersect'}`);
    buttons[buttons.length-1].colour=layers.display.colour(layers.project.id,layer.id,layer.order);
    add(`visible:${layer.id}`,layer.visible?'Visible':'Hidden',720,y,176,82,layer.visible,this.tools.busy);
    add(`locked:${layer.id}`,layer.locked?'Locked':'Unlocked',912,y,200,82,layer.locked,this.tools.busy);
   });
  }else{
   add('tools','‹ Tools',40,140,240,74);const all=this.tools.options(),pages=Math.max(1,Math.ceil(all.length/7));this.optionPage=Math.min(this.optionPage,pages-1);
   labels.push({text:`${this.optionPage+1} / ${pages}`,x:550,y:185});
   add('prev','‹',788,140,144,74,false,this.optionPage===0);add('next','›',948,140,164,74,false,this.optionPage===pages-1);
   all.slice(this.optionPage*7,this.optionPage*7+7).forEach((option,i)=>{const y=242+i*102;
    if(option.action){add(option.action,option.label,40,y,1072,86,false,option.disabled,option.value);return;}
    labels.push({text:option.label,x:52,y:y+26,small:true},{text:option.value,x:52,y:y+70});
    if(option.slider)buttons.push({id:`slider:${option.id}`,label:'',rect:{x:340,y,width:430,height:86},disabled:option.disabled,slider:option.slider});
    add(`dec:${option.id}`,'-',804,y,140,86,false,!option.decrease);add(`inc:${option.id}`,'+',968,y,140,86,false,!option.increase);
   });
  }
  return {title,subtitle:this.page==='layers'?'Point with Tool Hand · trigger to select / toggle':'Point with Tool Hand · trigger to select',buttons,labels,footer:this.feedback||'Hold Support stick · release to close'};
 }
 hit(x:number,y:number,content=this.content()):string|null{
  if(!this.request||!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>MENU_SIZE||y>MENU_SIZE)return null;
  for(const b of content.buttons)if(b.rect&&x>=b.rect.x&&x<=b.rect.x+b.rect.width&&y>=b.rect.y&&y<=b.rect.y+b.rect.height)return b.id;
  if(this.page==='tool-wheel'){
   const dx=x-WHEEL.x,dy=y-WHEEL.y,r=Math.hypot(dx,dy);if(r<WHEEL.inner||r>WHEEL.outer)return null;
   const angle=((Math.atan2(dy,dx)+Math.PI/2+Math.PI/5)%(2*Math.PI)+2*Math.PI)%(2*Math.PI),sector=Math.floor(angle/(2*Math.PI/5));
   return content.buttons.find(b=>b.sector===sector)?.id??null;
  }return null;
 }
 setSlider(id:string,ratio:number):void{if(!this.request)return;const option=this.tools.options().find(o=>`slider:${o.id}`===id);if(!option?.slider||option.disabled)return;this.tools.setValue(option.id,option.slider.min+Math.max(0,Math.min(1,ratio))*(option.slider.max-option.slider.min));}
 activate(id:string):void{
  if(!this.request)return;
  const button=this.content().buttons.find(b=>b.id===id);if(!button||button.disabled){this.feedback='Unavailable';return;}
  try{
   const separator=id.indexOf(':'),action=separator<0?id:id.slice(0,separator),value=id.slice(separator+1);
   if(id==='reset-layer'){const l=this.tools.port.layers();this.resetTarget={project:l.project,id:l.project.activeLayerId};}
   else if(id==='cancel-reset')this.resetTarget=null;
   else if(id==='confirm-reset'){const target=this.resetTarget;this.resetTarget=null;if(target&&this.tools.port.layers().project===target.project)this.tools.resetLayerTransform(target.id);}
   else if(action==='tool'){this.tools.select(value as EditorTool);this.page='tool-options';this.optionPage=0;}
   else if(id==='options'){this.page='tool-options';this.optionPage=0;}
   else if(id==='tools'){this.page='tool-wheel';this.optionPage=0;}
   else if(id==='next')this.optionPage++;else if(id==='prev')this.optionPage--;
   else if(action==='select')this.tools.selectLayer(value);
   else if(action==='visible'||action==='locked')this.tools.toggleLayer(value,action);
   else if(action==='inc'||action==='dec')this.tools.adjust(value,action==='inc'?1:-1);
   this.feedback='';this.hover=null;
  }catch(error){this.feedback=error instanceof Error?error.message:'Action unavailable';}
 }
}
