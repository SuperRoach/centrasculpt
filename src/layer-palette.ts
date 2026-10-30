import type {IndependentLayers} from './independent-layers';
import type {EditorToolState} from './editor-tool-state';
import type {MenuContent,MenuButton} from './xr-menu-model';
import {MAX_LAYER_GROUPS,LayerGroup} from './layer-hierarchy';
const PAGE=4;
/** Explicit ray targets instead of drag/drop. Page size stays fixed at both UI scales. */
export class LayerPaletteModel {
 page=0;context:string|null=null;view:'list'|'node'|'parents'|'rename'|'delete'|'boolean'='list';name='';keyPage=0;private copy?:AbortController;feedback='';
 constructor(readonly tools:EditorToolState){}
 close(){this.copy?.abort();this.copy=undefined;this.context=null;this.view='list';this.page=0;}
 content():MenuContent{
  const l=this.tools.port.layers(),h=l.project.layerStack.hierarchy,busy=this.tools.busy,buttons:MenuButton[]=[],labels:MenuContent['labels']=[];
  const add=(id:string,label:string,x:number,y:number,width:number,height=110,disabled=busy,detail?:string,selected=false)=>buttons.push({id,label,detail,rect:{x,y,width,height},disabled,selected});
  const nav=()=>add('hier:list','‹ Layers',40,140,340,74,false);
  if(this.copy){add('hier:cancel-copy','Cancel duplication',40,440,1072,136,false);return {title:'DUPLICATING LAYER',subtitle:this.feedback,buttons,labels,footer:'Original source and redo remain intact until completion'};}
  if(this.context){try{h.get(this.context);}catch{this.context=null;this.view='list';}}
  if(this.view==='rename'&&this.context){nav();labels.push({text:this.name||'Enter a name',x:40,y:244,width:1072,height:90});const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_',keys=chars.slice(this.keyPage*18,this.keyPage*18+18);add('hier:keys-prev','‹',788,140,144,74,this.keyPage===0);add('hier:keys-next','›',948,140,164,74,(this.keyPage+1)*18>=chars.length);[...keys].forEach((char,i)=>add(`hier:key:${char}`,char,40+(i%6)*180,354+Math.floor(i/6)*142,164,120,false));add('hier:key-space','Space',40,798,344,100,false);add('hier:key-back','Backspace',404,798,344,100,false);add('hier:key-clear','Clear',768,798,344,100,false);add('hier:node-back','Cancel',40,948,524,88,false);add('hier:rename-done','Save name',588,948,524,88,busy||!this.name.trim());return {title:'RENAME',subtitle:'Tool trigger types · 128 characters maximum',buttons,labels,footer:this.feedback||'Cancel keeps the original name'};}
  if(this.view==='parents'&&this.context){nav();const excluded=new Set([this.context,...h.descendants(this.context)]),choices=[{id:'root',name:'No group · sculpture root'},...h.groups.filter(g=>!excluded.has(g.id)&&g.editable).map(g=>({id:g.id,name:g.name}))];this.page=Math.max(0,Math.min(this.page,Math.ceil(choices.length/PAGE)-1));add('hier:prev','‹',788,140,144,74,this.page===0);add('hier:next','›',948,140,164,74,(this.page+1)*PAGE>=choices.length);choices.slice(this.page*PAGE,this.page*PAGE+PAGE).forEach((g,i)=>add(`hier:parent:${g.id}`,g.name,40,244+i*174,1072,150,busy,'Preserve visible pose'));return {title:'MOVE TO GROUP',subtitle:h.get(this.context).name,buttons,labels,footer:this.feedback||'No voxel resampling · parent transform stays separate'};}
  if(this.view==='delete'&&this.context){nav();add('hier:ungroup','Ungroup · keep all children',40,284,1072,150,busy,'Preserve their visible positions');add('hier:delete-children','Delete group AND its children',40,484,1072,150,busy,'One Undo action · at least one sculpt layer must remain');add('hier:node-back','Cancel',40,784,1072,120,false);return {title:'DELETE GROUP?',subtitle:h.get(this.context).name,buttons,labels,footer:this.feedback||'Children are kept unless explicitly deleted above'};}
  if(this.view==='boolean'&&this.context){const n=h.get(this.context),index=h.compositionOrder.indexOf(n.id);nav();add('hier:boolean-up','Evaluate earlier',40,354,1072,150,busy||index<=0||n.locked);add('hier:boolean-down','Evaluate later',40,554,1072,150,busy||index===h.compositionOrder.length-1||n.locked);add('hier:node-back','Back to layer actions',40,844,1072,136,false);return {title:'BOOLEAN SEQUENCE',subtitle:`Step ${index+1} / ${h.compositionOrder.length} · ${n.name}`,buttons,labels,footer:'Explicitly changes the Boolean result · one Undo action'};}
  if(this.view==='node'&&this.context){const n=h.get(this.context),group=n instanceof LayerGroup,siblings=h.children(h.parent(n.id)),index=siblings.indexOf(n.id);nav();add('hier:transform','Move / Rotate / Scale',40,244,1072,136,busy||!n.editable,'Tool grip moves selected node');add('hier:duplicate','Duplicate layer',40,404,524,136,busy||group||!n.editable);add('hier:rename','Rename',588,404,524,136,busy||n.locked);add('hier:parents','Move to Group',40,564,524,136,busy||!n.editable);add('hier:wrap','Group this node',588,564,524,136,busy||!n.editable||h.groups.length>=MAX_LAYER_GROUPS);add('hier:up','Move up',40,724,524,136,busy||index===0||!n.editable);add('hier:down','Move down',588,724,524,136,busy||index===siblings.length-1||!n.editable);if(!group)add('hier:boolean','Boolean order…',40,884,1072,136,busy||n.locked);if(group){add('hier:ungroup','Ungroup',40,884,524,136,busy||!n.editable);add('hier:delete','Delete group…',588,884,524,136,busy||!n.editable);}return {title:group?'GROUP ACTIONS':'LAYER ACTIONS',subtitle:n.name,buttons,labels,footer:this.feedback||'Order is visual only · Boolean sequence stays unchanged'};}
  const rows=l.hierarchyRows(),pages=Math.max(1,Math.ceil(rows.length/PAGE));this.page=Math.min(this.page,pages-1);add('hier:create','＋ Group',300,140,360,74,busy||h.groups.length>=MAX_LAYER_GROUPS);add('hier:prev','‹',788,140,144,74,this.page===0);add('hier:next','›',948,140,164,74,this.page===pages-1);
  rows.slice(this.page*PAGE,this.page*PAGE+PAGE).forEach((row,i)=>{const n=h.get(row.id),y=244+i*164,indent=Math.min(row.depth,3)*24,selected=row.group?l.selectedGroupId===n.id:!l.selectedGroupId&&l.project.activeLayerId===n.id;
   if(row.group)add(`hier:fold:${n.id}`,l.collapsedGroups.has(n.id)?'+':'−',40,y,104,136,false);
   add(`${row.group?'hier:group:':'select:'}${n.id}`,`${row.group?'▣':'◇'} ${n.name}`,row.group?164+indent:40+indent,y,row.group?396-indent:520-indent,136,busy,`${selected?'✓ Active · ':''}${row.depth?'Nested · ':''}${row.group?'Group':`${l.project.layerStack.get(n.id).volume.resolution}³ · ${l.project.layerStack.get(n.id).operation==='difference'?'Difference':l.project.layerStack.get(n.id).operation==='intersect'?'Intersect':'Union'}${l.project.layerStack.get(n.id).procedural?' · Tube':''}`}${n.locked?' · Locked':!n.visible?' · Hidden':''}`,selected);
   if(!row.group)buttons[buttons.length-1].colour=l.display.colour(l.project.id,n.id,l.project.layerStack.get(n.id).order);
   add(`visible:${n.id}`,n.localVisible?'Visible':'Hidden',576,y,160,136,busy||h.parentsLocked(n.id),n.visible?'Visible':'Hidden');add(`locked:${n.id}`,n.localLocked?'Unlock':'Lock',752,y,176,136,busy||h.parentsLocked(n.id),n.locked?'Locked':'Unlocked');add(`hier:node:${n.id}`,'More',944,y,168,136,busy);
  });add('new-layer','＋ Add New Layer',40,960,524,78,busy||l.project.layerStack.layers.length>=8,l.project.layerStack.layers.length>=8?'Maximum of 8 layers reached':'Empty clay volume · 64³');add('merge-layers','Merge with…',588,960,524,78,busy||l.project.layerStack.layers.length>=8||l.project.layerStack.layers.length<2);
  return {title:'LAYERS',subtitle:`Page ${this.page+1} / ${pages} · folders contain independent sources`,buttons,labels,footer:this.feedback||'More: duplicate, rename, group and reorder'};
 }
 activate(id:string):boolean{
  if(!id.startsWith('hier:'))return false;const l=this.tools.port.layers(),h=l.project.layerStack.hierarchy,parts=id.split(':'),action=parts[1],value=parts.slice(2).join(':');
  if(action==='cancel-copy'){this.copy?.abort();return true;}if(action==='fold'){l.collapsedGroups.has(value)?l.collapsedGroups.delete(value):l.collapsedGroups.add(value);return true;}
  if(action==='list'){this.view='list';this.context=null;this.page=0;return true;}if(action==='prev'){this.page--;return true;}if(action==='next'){this.page++;return true;}
  if(this.tools.busy)throw new Error('Finish the current interaction first.');
  if(action==='group'){l.selectGroup(value);this.tools.select('transform');}
  else if(action==='node'){this.context=value;this.view='node';}
  else if(action==='node-back')this.view='node';
  else if(action==='create'){l.createGroup();this.tools.select('transform');}
  else if(action==='keys-prev')this.keyPage--;else if(action==='keys-next')this.keyPage++;
  else if(action==='key')this.name=(this.name+value).slice(0,128);else if(action==='key-space')this.name=(this.name+' ').slice(0,128);else if(action==='key-back')this.name=this.name.slice(0,-1);else if(action==='key-clear')this.name='';
  else if(this.context){const n=h.get(this.context);
   if(action==='boolean')this.view='boolean';else if(action==='boolean-up'||action==='boolean-down')l.moveBoolean(n.id,action==='boolean-up'?-1:1);else if(action==='transform'){n instanceof LayerGroup?l.selectGroup(n.id):l.select(n.id);this.tools.select('transform');}
   else if(action==='rename'){this.name=n.name;this.view='rename';this.keyPage=0;}
   else if(action==='rename-done'){l.renameNode(n.id,this.name);this.view='node';}
   else if(action==='parents'){this.view='parents';this.page=0;}
   else if(action==='parent'){l.reparent(n.id,value==='root'?null:value);this.view='node';}
   else if(action==='wrap'){l.groupNode(n.id);this.view='list';}
   else if(action==='up'||action==='down')l.moveNode(n.id,action==='up'?-1:1);
   else if(action==='ungroup'){l.deleteGroup(n.id,'keep');this.view='list';this.context=null;}
   else if(action==='delete')this.view='delete';
   else if(action==='delete-children'){l.deleteGroup(n.id,'delete');this.view='list';this.context=null;}
   else if(action==='duplicate'){const abort=new AbortController();this.copy=abort;void l.duplicateAsync(n.id,abort.signal,text=>{this.feedback=text;}).then(()=>{this.view='list';this.context=null;this.tools.port.changed();}).catch(e=>{this.feedback=e instanceof Error?e.message:String(e);}).finally(()=>{this.copy=undefined;});}
  }this.tools.port.changed();return true;
 }
}
/** Desktop companion: native inputs for names/parents, shared atomic layer commands. */
export class DesktopLayerPalette {
 private readonly host=document.createElement('div');private key='';private abort?:AbortController;
 constructor(private layers:()=>IndependentLayers,private legacy:HTMLElement,private transform:()=>void,private changed:()=>void,private error:(text:string)=>void,private busy:()=>boolean=()=>false,private beforeAction:()=>void=()=>{}){legacy.before(this.host);this.host.className='hierarchy-palette';legacy.hidden=true;}
 render():void{const l=this.layers(),h=l.project.layerStack.hierarchy,key=JSON.stringify([h.snapshot(),l.selectedGroupId,l.project.activeLayerId,[...l.collapsedGroups],l.duplicating,this.busy()]);if(key===this.key)return;this.key=key;this.host.replaceChildren();
  const run=(action:()=>void)=>{if(this.busy())return;try{this.beforeAction();action();this.changed();}catch(e){this.error(e instanceof Error?e.message:String(e));}};
  const button=(host:HTMLElement,label:string,action:()=>void,disabled=false)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=disabled||l.duplicating||this.busy();b.onclick=()=>run(action);host.append(b);return b;};
  button(this.host,'＋ Create Group',()=>{l.createGroup();this.transform();},h.groups.length>=MAX_LAYER_GROUPS);
  if(l.duplicating){const cancel=button(this.host,'Cancel duplication',()=>this.abort?.abort());cancel.disabled=false;}
  for(const row of l.hierarchyRows()){const n=h.get(row.id),card=document.createElement('div');card.className=`hierarchy-row${(row.group?l.selectedGroupId===n.id:!l.selectedGroupId&&l.project.activeLayerId===n.id)?' active':''}`;card.style.marginLeft=`${Math.min(row.depth,4)*10}px`;card.dataset.nodeId=n.id;this.host.append(card);
   if(row.group)button(card,l.collapsedGroups.has(n.id)?'Expand group':'Collapse group',()=>{l.collapsedGroups.has(n.id)?l.collapsedGroups.delete(n.id):l.collapsedGroups.add(n.id);});
   button(card,`${row.group?'▣':'◇'} ${n.name}`,()=>{row.group?(l.selectGroup(n.id),this.transform()):l.select(n.id);});const selected=row.group?l.selectedGroupId===n.id:!l.selectedGroupId&&l.project.activeLayerId===n.id;if(!selected)continue;
   const name=document.createElement('input');name.value=n.name;name.maxLength=128;name.setAttribute('aria-label','Rename '+n.name);name.disabled=n.locked||this.busy()||l.duplicating;name.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();run(()=>l.renameNode(n.id,name.value));}});card.append(name);button(card,'Save name',()=>l.renameNode(n.id,name.value),n.locked);
   button(card,n.localVisible?'Hide':'Show',()=>l.setNodeFlag(n.id,'visible',!n.localVisible),h.parentsLocked(n.id));button(card,n.localLocked?'Unlock':'Lock',()=>l.setNodeFlag(n.id,'locked',!n.localLocked),h.parentsLocked(n.id));
   const parent=document.createElement('select');parent.setAttribute('aria-label','Parent group for '+n.name);parent.add(new Option('No group · sculpture root',''));const excluded=new Set([n.id,...h.descendants(n.id)]);for(const group of h.groups)if(!excluded.has(group.id))parent.add(new Option(group.name,group.id));parent.value=h.parent(n.id)??'';parent.disabled=!n.editable||l.duplicating||this.busy();card.append(parent);button(card,'Move to selected group',()=>l.reparent(n.id,parent.value||null),!n.editable);
   button(card,'Transform',()=>{this.transform();},!n.editable);button(card,'Group this node',()=>{l.groupNode(n.id);this.transform();},!n.editable);const siblings=h.children(h.parent(n.id)),index=siblings.indexOf(n.id);button(card,'↑ Move up',()=>l.moveNode(n.id,-1),index===0||!n.editable);button(card,'↓ Move down',()=>l.moveNode(n.id,1),index===siblings.length-1||!n.editable);
   if(row.group){button(card,'Ungroup · keep children',()=>l.deleteGroup(n.id,'keep'),!n.editable);const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Delete group and children…';details.append(summary);button(details,'Confirm delete group AND children',()=>l.deleteGroup(n.id,'delete'),!n.editable);card.append(details);}
   else {button(card,'Duplicate Layer',()=>{this.abort=new AbortController();void l.duplicateAsync(n.id,this.abort.signal).then(()=>{this.key='';this.changed();}).catch(e=>this.error(String(e))).finally(()=>{this.abort=undefined;this.key='';this.changed();});this.key='';this.changed();},!n.editable);
    button(card,'Delete layer…',()=>{this.legacy.querySelector<HTMLButtonElement>(`[data-layer-id="${n.id}"] [data-action="delete"]`)?.click();},n.locked||l.project.layerStack.layers.length===1);
    const layer=l.project.layerStack.get(n.id),colour=document.createElement('input');colour.type='color';colour.value=l.display.colour(l.project.id,n.id,layer.order);colour.setAttribute('aria-label','Viewport colour for '+n.name);colour.disabled=this.busy()||l.duplicating;colour.addEventListener('change',()=>run(()=>{l.display.setColour(l.project.id,n.id,colour.value);l.syncPresentation();}));card.append(colour);
    const operation=document.createElement('select');operation.setAttribute('aria-label','Boolean operation for '+n.name);for(const op of ['union','difference','intersect'])operation.add(new Option(op,op));operation.value=layer.operation;operation.disabled=layer.locked;operation.addEventListener('change',()=>run(()=>l.setOperation(n.id,operation.value as 'union'|'difference'|'intersect')));card.append(operation);const order=document.createElement('p');order.textContent=`Boolean step ${h.compositionOrder.indexOf(n.id)+1} · unaffected by row order`;card.append(order);const booleanIndex=h.compositionOrder.indexOf(n.id);button(card,'Boolean earlier',()=>l.moveBoolean(n.id,-1),booleanIndex===0||n.locked);button(card,'Boolean later',()=>l.moveBoolean(n.id,1),booleanIndex===h.compositionOrder.length-1||n.locked);
   }
  }
 }
}
