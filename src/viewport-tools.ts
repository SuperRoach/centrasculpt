import type { EditorMode } from './interaction';
export type WorkspaceTool='brush'|'boolean'|'smooth';
type Option={id:string;label:string;shortcut?:string;icon:string};
const icons:Record<string,string>={
 brush:'<path d="m14 4 6 6-9 9-6 1 1-6Z M12 6l6 6 M5 21h5"/>',
 smooth:'<path d="M3 8c3-5 6 5 9 0s6 5 9 0 M3 15c3-5 6 5 9 0s6 5 9 0"/>',
 boolean:'<rect x="3" y="5" width="12" height="12" rx="2"/><rect x="9" y="9" width="12" height="12" rx="2"/>',
 translate:'<path d="M12 2v20 M2 12h20 M8 6l4-4 4 4 M8 18l4 4 4-4 M6 8l-4 4 4 4 M18 8l4 4-4 4"/>',
 rotate:'<path d="M20 7A9 9 0 1 0 21 15 M20 2v6h-6"/>',
 scale:'<path d="M9 3H3v6 M15 21h6v-6 M3 3l7 7 M21 21l-7-7"/>',
};
const svg=(name:string)=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
/** Scene-independent UI. Buttons live beside, never inside, the WebGL canvas. */
export function createViewportTools(host:HTMLElement,chooseWorkspace:(tool:WorkspaceTool)=>void,chooseLayer:(mode:EditorMode)=>void){
 const root=document.createElement('nav');root.className='viewport-tools';root.setAttribute('aria-label','Viewport tool wheels');host.append(root);
 const workspace:Option[]=[{id:'brush',label:'Brush',shortcut:'B',icon:'brush'},{id:'boolean',label:'Boolean',icon:'boolean'},{id:'smooth',label:'Smooth',icon:'smooth'}];
 const layer:Option[]=[{id:'translate',label:'Move',shortcut:'W',icon:'translate'},{id:'rotate',label:'Rotate',shortcut:'E',icon:'rotate'},{id:'scale',label:'Scale',shortcut:'R',icon:'scale'}];
 let opened:string|null=null,modeValue:EditorMode='sculpt',workspaceValue:WorkspaceTool='brush',layerValue='translate',busy=false,editable=true;
 for(const [id,title,options] of [['workspace','Sculpt tools',workspace],['layer','Layer transforms',layer]] as const){
  const wheel=document.createElement('div');wheel.className='tool-wheel';wheel.dataset.wheel=id;
  wheel.innerHTML=`<div class="wheel-menu" id="${id}-wheel-menu" role="group" aria-label="${title}" hidden><span class="wheel-centre">${id==='workspace'?'SCULPT':'LAYER'}<small>CHOOSE TOOL</small></span>${options.map((option,index)=>{
   const angle=(index/options.length)*Math.PI*2-Math.PI/2,x=86+Math.cos(angle)*64,y=86+Math.sin(angle)*64;
   return `<button type="button" class="wheel-option" data-wheel-option="${option.id}" aria-label="${option.label}${id==='layer'?' layer':''}" aria-pressed="false" style="left:${x}px;top:${y}px">${svg(option.icon)}<span>${option.label}${option.shortcut?` <kbd>${option.shortcut}</kbd>`:''}</span></button>`;
  }).join('')}</div><button type="button" class="wheel-toggle" aria-label="${title}" aria-expanded="false" aria-controls="${id}-wheel-menu">${svg(options[0].icon)}<span class="wheel-chevron">⌃</span></button><span class="wheel-caption">${id==='workspace'?'Brush':'Layer'}</span>`;
  root.append(wheel);
  const toggle=wheel.querySelector<HTMLButtonElement>('.wheel-toggle')!;
  toggle.addEventListener('click',()=>{opened=opened===id?null:id;paint();if(opened)wheel.querySelector<HTMLButtonElement>('.wheel-option:not(:disabled)')?.focus();});
  for(const button of wheel.querySelectorAll<HTMLButtonElement>('.wheel-option'))button.addEventListener('click',()=>{
   if(busy||(id==='layer'&&!editable))return;
   const option=button.dataset.wheelOption!;opened=null;paint();toggle.focus();
   if(id==='workspace')chooseWorkspace(option as WorkspaceTool);else chooseLayer(option as EditorMode);
  });
 }
 function paint(){
  for(const wheel of root.querySelectorAll<HTMLElement>('[data-wheel]')){
   const isLayer=wheel.dataset.wheel==='layer',selected=isLayer?layerValue:workspaceValue,toggle=wheel.querySelector<HTMLButtonElement>('.wheel-toggle')!,open=opened===wheel.dataset.wheel;
   wheel.dataset.active=String(isLayer?modeValue!=='sculpt':modeValue==='sculpt');
   toggle.disabled=busy||(isLayer&&!editable);toggle.setAttribute('aria-expanded',String(open));
   toggle.innerHTML=svg(selected)+'<span class="wheel-chevron">⌃</span>';
   wheel.querySelector<HTMLElement>('.wheel-menu')!.hidden=!open;
   wheel.querySelector<HTMLElement>('.wheel-caption')!.textContent=isLayer?`Layer · ${layer.find(o=>o.id===selected)?.label}`:workspace.find(o=>o.id===selected)!.label;
   for(const button of wheel.querySelectorAll<HTMLButtonElement>('.wheel-option')){button.disabled=busy||(isLayer&&!editable);button.setAttribute('aria-pressed',String(selected===button.dataset.wheelOption&&(isLayer?modeValue!=='sculpt':modeValue==='sculpt')));}
  }
 }
 for(const name of ['pointerdown','pointerup','click','dblclick'] as const)root.addEventListener(name,event=>event.stopPropagation());
 document.addEventListener('pointerdown',event=>{if(opened&&!root.contains(event.target as Node)){opened=null;paint();}},true);
 document.addEventListener('keydown',event=>{
  if(!opened)return;
  const wheel=root.querySelector<HTMLElement>(`[data-wheel="${opened}"]`)!;
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();opened=null;paint();wheel.querySelector<HTMLButtonElement>('.wheel-toggle')!.focus();return;}
  if(!wheel.contains(document.activeElement))return;
  const buttons=[...wheel.querySelectorAll<HTMLButtonElement>('.wheel-option:not(:disabled)')],index=buttons.indexOf(document.activeElement as HTMLButtonElement);
  if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'].includes(event.key)){
   event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowLeft'||event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length;buttons[next]?.focus();
  }
 },true);
 let stateKey='';
 return {sync(tool:WorkspaceTool,mode:EditorMode,canEdit:boolean,isBusy:boolean){
  const key=JSON.stringify([tool,mode,canEdit,isBusy]);if(key===stateKey)return;stateKey=key;
  workspaceValue=tool;modeValue=mode;if(mode!=='sculpt')layerValue=mode;editable=canEdit;busy=isBusy;if(busy||!editable&&opened==='layer')opened=null;paint();
 },close(){opened=null;paint();}};
}
