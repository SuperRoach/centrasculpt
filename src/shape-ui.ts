import type { LayerStack } from './layers';
import { SHAPE_METADATA } from './shapes';
import type { ShapeKind } from './shapes';
import type { ShapeGhost } from './shape-preview';
import { shapeDimensionsForKind } from './shape-preview';
import { copyTransform, identityTransform } from './transform';
import { localShapeBounds } from './shape-library';
const iconPaths:Record<ShapeKind,string>={
 sphere:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
 box:'<path d="m3 7 9-4 9 4v11l-9 4-9-4Z M3 7l9 4 9-4 M12 11v11"/>',
 'triangular-prism':'<path d="m3 19 6-13 6 13Z M9 6l7-3 6 13-7 3 M22 16H9"/>',
 pyramid:'<path d="m12 2-10 16 10 4 10-4Z M12 2v20 M2 18l10-4 10 4"/>'
};
export function createShapeLibraryUI(host:HTMLElement,ghost:ShapeGhost,stack:()=>LayerStack,busy:()=>boolean,beforeChange:()=>void,afterChange:()=>void,stamp:()=>void,toggleRotation:()=>void,toggleMove:()=>void){
 const field=(name:string,label:string,value:string,step:string,min='')=>`<label>${label}<input data-shape-field="${name}" type="number" aria-label="${value}" step="${step}" ${min?`min="${min}"`:''}/></label>`;
 host.innerHTML=`<details id="shape-library"><summary>◇ SHAPE LIBRARY <span>Stamp once</span></summary><div class="shape-library-body"><div class="shape-grid">${Object.values(SHAPE_METADATA).map(s=>`<button type="button" data-shape-kind="${s.id}" aria-label="${s.name}" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${iconPaths[s.id]}</svg><span>${s.name}</span></button>`).join('')}</div><p id="shape-description"></p><label class="shape-enable"><input id="show-shape" type="checkbox"/> Show ghost preview</label><label class="shape-enable"><input id="shape-follow" type="checkbox" checked/> Follow pointer on visible surfaces</label><button type="button" id="move-shape" aria-pressed="false">✥ Move preview (G)</button><button type="button" id="rotate-shape" aria-pressed="false">↻ Rotate stamp (T)</button><button type="button" id="stamp-shape">Stamp once at preview</button><div class="shape-operations"><button type="button" data-shape-op="add" aria-label="Shape Add" aria-pressed="true">＋ Add</button><button type="button" data-shape-op="subtract" aria-label="Shape Subtract" aria-pressed="false">− Subtract</button></div><fieldset class="numeric-transform"><legend>Dimensions · shape-local units</legend>${field('dx','X / Diameter','Shape width or diameter','.05','.001')}${field('dy','Height Y','Shape height','.05','.001')}${field('dz','Depth Z','Shape depth','.05','.001')}</fieldset><label for="shape-space">GHOST POSE SPACE</label><select id="shape-space"><option value="local">Layer local</option><option value="world">World</option></select><fieldset class="numeric-transform"><legend>Ghost position XYZ</legend>${field('px','X','Shape position X','.1')}${field('py','Y','Shape position Y','.1')}${field('pz','Z','Shape position Z','.1')}</fieldset><fieldset class="numeric-transform"><legend>Ghost rotation · XYZ degrees</legend>${field('rx','X','Shape rotation X degrees','1')}${field('ry','Y','Shape rotation Y degrees','1')}${field('rz','Z','Shape rotation Z degrees','1')}</fieldset><label for="shape-scale">GHOST UNIFORM SCALE</label><input id="shape-scale" data-shape-field="scale" type="number" min=".001" max="1000" step=".05" aria-label="Shape uniform scale"/><button type="button" id="reset-shape-pose">Reset ghost pose</button><p id="shape-target"></p><p id="shape-bounds"></p><p id="shape-feedback" role="status"></p><p id="shape-error" role="alert"></p><output id="shape-performance"></output><p class="shape-note">Teal = Add · Rust = Subtract. Move the pointer over a visible surface, then left-click once to stamp. Dragging never repeats stamps. Press T or Rotate stamp to freeze placement and rotate the ghost with rings. Press T again to finish, then click or Apply stamp. Use pose space for local/world axes. With Follow pointer off, Move preview (G) lets you drag arrows/planes anywhere inside the layer volume; XYZ fields also work. Move activates automatically with Follow pointer off. Use Apply stamp while the handles are idle; dragging never stamps. G optionally hides the handles. Add shapes must fit inside the active layer volume. Detail is limited by its voxel spacing. Ghosts are excluded from Boolean Preview, Bake and exports. Brushing and layer gizmos pause while the ghost is enabled. Hide it or press Escape to resume. Right drag / middle drag / wheel still control the camera.</p></div></details>`;
 const quick=document.createElement('div');quick.className='shape-quick-tools';quick.hidden=true;
 quick.innerHTML='<span id="shape-quick-state">STAMP PLACEMENT</span><button type="button" id="move-shape-overlay" aria-label="Move preview in viewport" aria-pressed="false">✥ Move <kbd>G</kbd></button><button type="button" id="rotate-shape-overlay" aria-label="Rotate stamp in viewport" aria-pressed="false">↻ Rotate <kbd>T</kbd></button><button type="button" id="stamp-shape-overlay">Apply stamp</button>';
 document.getElementById('viewport')!.append(quick);
 for(const button of [host.querySelector<HTMLButtonElement>('#move-shape')!,quick.querySelector<HTMLButtonElement>('#move-shape-overlay')!])button.addEventListener('click',()=>{if(!busy())toggleMove();});
 for(const button of [host.querySelector<HTMLButtonElement>('#rotate-shape')!,quick.querySelector<HTMLButtonElement>('#rotate-shape-overlay')!])button.addEventListener('click',()=>{if(!busy())toggleRotation();});
 quick.querySelector('#stamp-shape-overlay')!.addEventListener('click',()=>{if(!busy())stamp();});
 for(const event of ['pointerdown','pointerup','click'] as const)quick.addEventListener(event,e=>e.stopPropagation());
 const details=host.querySelector<HTMLDetailsElement>('details')!,enabled=host.querySelector<HTMLInputElement>('#show-shape')!,space=host.querySelector<HTMLSelectElement>('#shape-space')!;
 let error='',key='';
 function apply(action:()=>void,allowXR=false){if(busy()&&!allowXR)return;beforeChange();try{ghost.model.sync(stack());action();error='';}catch(e){error=(e as Error).message;}ghost.sync(busy());key='';refresh();afterChange();}
 details.addEventListener('toggle',()=>{
  apply(()=>{ghost.model.setEnabled(details.open,stack());});document.body.classList.toggle('shape-library-open',details.open);
  if(window.matchMedia('(max-width:760px)').matches)(details.open?host:document.getElementById('viewport')!).scrollIntoView({block:'start'});
 });
 host.querySelector('#stamp-shape')!.addEventListener('click',()=>{if(!busy())stamp();});
 host.querySelector<HTMLInputElement>('#shape-follow')!.addEventListener('change',event=>apply(()=>{ghost.model.setSurfaceFollow((event.target as HTMLInputElement).checked,stack());}));
 enabled.addEventListener('change',()=>apply(()=>{ghost.model.setEnabled(enabled.checked,stack());}));
 for(const button of host.querySelectorAll<HTMLButtonElement>('[data-shape-kind]'))button.addEventListener('click',()=>apply(()=>{
  const definition=ghost.model.definition,kind=button.dataset.shapeKind as ShapeKind;
  ghost.model.set({...definition,kind,dimensions:shapeDimensionsForKind(kind,definition.dimensions)},stack());ghost.model.setEnabled(true,stack());
 }));
 for(const button of host.querySelectorAll<HTMLButtonElement>('[data-shape-op]'))button.addEventListener('click',()=>apply(()=>ghost.model.set({...ghost.model.definition,operation:button.dataset.shapeOp},stack())));
 space.addEventListener('change',()=>{key='';refresh();});
 for(const input of host.querySelectorAll<HTMLInputElement>('[data-shape-field]')){
  input.addEventListener('input',()=>apply(()=>{
   const value=input.valueAsNumber;if(!Number.isFinite(value))throw new Error('Enter a finite shape value.');
   const definition=ghost.model.definition,name=input.dataset.shapeField!,axis='xyz'.indexOf(name[1]);
   if(name[0]==='d'){
    definition.dimensions[axis]=value;
    const rule=SHAPE_METADATA[definition.kind].dimensionRule;
    if(rule==='diameter')definition.dimensions=[value,value,value];else if(rule==='square-base'&&(axis===0||axis===2)){definition.dimensions[0]=value;definition.dimensions[2]=value;}
    ghost.model.set(definition,stack());
   }else{
    const transform=space.value==='world'?ghost.model.worldTransform(stack()):copyTransform(definition.transform);
    if(name==='scale')transform.scale=[value,value,value];else if(name[0]==='p'){transform.position[axis]=value;ghost.model.setSurfaceFollow(false,stack());}else transform.rotation[axis]=value*Math.PI/180;
    if(space.value==='world')ghost.model.setWorldTransform(transform,stack());else ghost.model.set({...definition,transform},stack());
   }
  }));
  input.addEventListener('blur',()=>{key='';refresh();});
 }
 host.querySelector('#reset-shape-pose')!.addEventListener('click',()=>apply(()=>ghost.model.set({...ghost.model.definition,transform:identityTransform()},stack())));
 function refresh(){
  const layers=stack();ghost.model.sync(layers);const d=ghost.model.definition,reason=ghost.model.availability(layers),blocked=busy()||!!reason;
  const stateKey=JSON.stringify([d,ghost.model.enabled,blocked,layers.active.name,layers.active.volume.resolution,layers.active.transform,ghost.model.followPointer,ghost.model.rotationMode,ghost.model.moveMode,ghost.model.dragging,space.value,error,ghost.stats.updates]);if(stateKey===key)return;key=stateKey;
  host.querySelector<HTMLInputElement>('#shape-follow')!.checked=ghost.model.followPointer;host.querySelector<HTMLInputElement>('#shape-follow')!.disabled=blocked;host.querySelector<HTMLButtonElement>('#stamp-shape')!.disabled=!ghost.model.canApply(layers,busy());
  quick.hidden=!ghost.model.enabled;
  for(const button of [host.querySelector<HTMLButtonElement>('#rotate-shape')!,quick.querySelector<HTMLButtonElement>('#rotate-shape-overlay')!]){button.disabled=blocked||!ghost.model.enabled;button.setAttribute('aria-pressed',String(ghost.model.rotationMode));}
  quick.querySelector<HTMLButtonElement>('#stamp-shape-overlay')!.disabled=!ghost.model.canApply(layers,busy());
  for(const button of [host.querySelector<HTMLButtonElement>('#move-shape')!,quick.querySelector<HTMLButtonElement>('#move-shape-overlay')!]){button.disabled=blocked||!ghost.model.enabled;button.setAttribute('aria-pressed',String(ghost.model.moveMode));}
  host.querySelector<HTMLButtonElement>('#move-shape')!.textContent=ghost.model.moveMode?'✓ Move preview (G)':'✥ Move preview (G)';
  quick.querySelector('#shape-quick-state')!.textContent=ghost.model.moveMode?(ghost.model.dragging?'MOVING PREVIEW':'MOVE · APPLY WHEN READY'):ghost.model.rotationMode?'ROTATING · STAMPING PAUSED':ghost.model.followPointer?'SURFACE FOLLOW':'PREVIEW HELD · G TO MOVE';
  host.querySelector<HTMLButtonElement>('#rotate-shape')!.textContent=ghost.model.rotationMode?'✓ Finish rotation (T)':'↻ Rotate stamp (T)';
  host.querySelector<HTMLInputElement>('#shape-follow')!.disabled=blocked||ghost.model.rotationMode||ghost.model.dragging;
  enabled.checked=ghost.model.enabled;enabled.disabled=busy();
  for(const button of host.querySelectorAll<HTMLButtonElement>('[data-shape-kind]')){const selected=button.dataset.shapeKind===d.kind;button.setAttribute('aria-pressed',String(selected));button.classList.toggle('active',selected);button.disabled=blocked;}
  for(const button of host.querySelectorAll<HTMLButtonElement>('[data-shape-op]')){const selected=button.dataset.shapeOp===d.operation;button.setAttribute('aria-pressed',String(selected));button.classList.toggle('active',selected);button.disabled=blocked;}
  let pose=d.transform;try{if(space.value==='world'&&!reason)pose=ghost.model.worldTransform(layers);}catch{}
  for(const input of host.querySelectorAll<HTMLInputElement>('[data-shape-field]')){
   const field=input.dataset.shapeField!,axis='xyz'.indexOf(field[1]),value=field[0]==='d'?d.dimensions[axis]:field==='scale'?pose.scale[0]:field[0]==='p'?pose.position[axis]:pose.rotation[axis]*180/Math.PI;
   if(document.activeElement!==input)input.value=String(Number(value.toFixed(6)));
   if(field==='scale'){const parent=space.value==='world'?layers.active.transform.scale[0]:1;input.min=String(.001*parent);input.max=String(1000*parent);}
   const rule=SHAPE_METADATA[d.kind].dimensionRule;input.disabled=blocked||(field[0]==='d'&&((rule==='diameter'&&axis!==0)||(rule==='square-base'&&axis===2)));
  }
  space.disabled=busy();host.querySelector<HTMLButtonElement>('#reset-shape-pose')!.disabled=blocked;
  host.querySelector('#shape-description')!.textContent=SHAPE_METADATA[d.kind].description;
  host.querySelector('#shape-target')!.textContent=`Target: ${layers.active.name} · ${layers.active.volume.resolution}³. Pose is ${space.value==='world'?'world-space; converted into the layer':'relative to this layer'}.`;
  const bounds=localShapeBounds(d.kind,d.dimensions);host.querySelector('#shape-bounds')!.textContent=`Local bounds: [${bounds.min.map(v=>v.toFixed(2)).join(', ')}] to [${bounds.max.map(v=>v.toFixed(2)).join(', ')}]. ${d.kind==='sphere'?'One diameter controls all axes.':d.kind==='pyramid'?'Width also controls depth for a square base.':''}`;
  host.querySelector('#shape-feedback')!.textContent=busy()?'Preview paused while the project is busy.':reason??(ghost.model.moveMode?'Move is active. Drag an arrow or plane handle, then Apply stamp. G hides the handles.':ghost.model.rotationMode?'Drag a rotation ring. T finishes rotation; the stamp stays in place.':ghost.model.enabled?(ghost.model.followPointer?'Surface follow · move the pointer over a visible surface.':'Preview held · Move (G) to drag it, Rotate (T), or edit XYZ. Apply when ready.'):'Ghost hidden · sculpting available.');
  host.querySelector('#shape-error')!.textContent=error;
  host.querySelector('#shape-performance')!.textContent=`Preview update ${ghost.stats.lastMs.toFixed(3)} ms · ${ghost.cachedShapes}/4 cached shapes`;
 }
 refresh();return {refresh,setOpen(open:boolean,allowXR=false){apply(()=>{details.open=open;ghost.model.setEnabled(open,stack());},allowXR);}};
}
