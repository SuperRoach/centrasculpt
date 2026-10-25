import type { RenderStyle } from './render-style';
import './style.css';
import type { BakeOptions, BakePlan, BakeProgress, SurfaceView } from './bake';
import type { BrushMode } from './sdf';
import type { VolumeTransform } from './transform';
import { hasUniformScale } from './transform';
import type { EditorMode, TransformSpace } from './interaction';
import type { SdfLayer } from './layers';
import type { ViewportMode } from './display-preferences';
import type { SculptSettings } from './project';
export type TransformField='px'|'py'|'pz'|'rx'|'ry'|'rz'|'scale';
export type TransformUIAction={type:'mode';mode:EditorMode}|{type:'space';space:TransformSpace}|{type:'field';field:TransformField;value:number}|{type:'reset'};
export type LayerAction='new'|'select'|'rename'|'duplicate'|'delete'|'up'|'down'|'visible'|'lock'|'colour'|'mode'|'operation';
export function createUI() {
  document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
    <header><a class="brand" href="./" aria-label="Centra Sculpt home"><span class="brand-mark" aria-hidden="true">◎</span><span>Centra <em>Sculpt</em></span></a><span class="subtitle">A SPACE TO SHAPE</span><div id="xr-entry-slot"></div><span class="phase"><i></i> LOCAL STUDIO</span></header>
    <main><aside><div class="eyebrow">YOUR TOOLKIT</div><h1>Make room<br>for an idea.</h1><p class="intro">Build up. Carve away.<br>See where the form takes you.</p>
    <div id="xr-diagnostics-slot"></div><div id="shape-library-slot"></div>
    <section><label>SCULPT BRUSH</label><div class="modes"><button id="add" class="active" aria-pressed="true"><b>＋</b> Add</button><button id="subtract" aria-pressed="false"><b>−</b> Subtract</button><button id="smooth" aria-pressed="false"><b>≈</b> Smooth</button></div>
    <div class="range-label"><label for="radius">BRUSH RADIUS · WORLD</label><output id="radius-value">0.22</output></div><input id="radius" type="range" min="0.12" max="0.5" step="0.01" value="0.22"/><div class="range-ends"><span>Fine detail</span><span>Broad strokes</span></div>
    <div class="range-label strength-label"><label for="strength">BRUSH STRENGTH</label><output id="strength-value">35%</output></div><input id="strength" type="range" min="0.01" max="1" step="0.01" value="0.35"/><div class="range-ends"><span>Gentle</span><span>Strong</span></div>
    <div class="range-label strength-label"><label for="hardness">BRUSH HARDNESS</label><output id="hardness-value">0%</output></div><input id="hardness" type="range" min="0" max="1" step="0.01" value="0"/><div class="range-ends"><span>Soft clay</span><span>Sharp edge · Smooth unchanged</span></div>
    <label for="resolution" class="strength-label">VOXEL RESOLUTION</label><div class="resolution-controls"><select id="resolution"><option value="64">64³ · Default</option><option value="128">128³ · Fine</option><option value="192">192³ · High memory</option></select><button id="apply-resolution">Resample</button></div><p class="resolution-note">Active layer only. Resampling clears its voxel history; transform history remains. Lower resolutions lose detail; 192³ may pause briefly.</p></section>
    <details class="instructions"><summary>CONTROLS & SHORTCUTS</summary><p><kbd>I</kbd> Cycle Normal / Matte / Glossy</p><p><kbd>G</kbd> Move stamp preview / finish moving</p><p><kbd>T</kbd> Rotate stamp ghost / finish rotation</p><p><kbd>B</kbd> Return to brush (hides shape ghost)</p><p><kbd>Drag</kbd> Sculpt the surface</p><p><kbd>Right drag</kbd> Orbit the camera</p><p><kbd>Scroll</kbd> Zoom in / out</p><p><kbd>Middle drag</kbd> Pan the view</p><p><kbd>Cmd/Ctrl + Z</kbd> Undo stroke</p><p><kbd>+ Shift</kbd> Redo stroke</p></details>
    <div class="actions"><div class="history-buttons"><button id="undo" disabled title="Undo (Cmd/Ctrl+Z)">↶ Undo</button><button id="redo" disabled title="Redo (Cmd/Ctrl+Shift+Z)">↷ Redo</button></div><p id="history-info">0 undo · 0 redo</p>
    <div class="project-buttons"><button id="save-project">Save Project</button><button id="open-project">Open Project</button></div><input id="project-file" type="file" accept=".form" hidden/><p id="project-message" role="status"></p>
    <button id="export">Export Separate Layers <span>↗</span></button><button id="export-boolean">Export Boolean Result ↗</button><button id="reset">↺ &nbsp; Reset sphere</button><p>Export your current mesh for your next step.</p></div></aside>
    <div id="viewport"><button type="button" id="cycle-render-style" class="render-style-toggle" aria-label="Cycle rendering style" title="Cycle Normal, Matte and Glossy (I)">◐ Normal</button><div class="viewport-label"><span class="dot"></span> PERSPECTIVE <span class="volume-label"> / SDF VOLUME</span></div><div id="status" role="status">Ready to sculpt</div><div class="bottom-label"><span id="mesh-info"></span><span id="rebuild-info">Measuring mesh…</span></div></div><aside class="layers-panel"><div class="eyebrow">INDEPENDENT VOLUMES</div><h2>Layers</h2><p class="layers-hint">Sources stay independent. Boolean Preview evaluates visible layers from top to bottom; the first visible layer initializes the result.</p>
    <label for="composition-mode">SURFACE VIEW</label><select id="composition-mode"><option value="separate">Separate Layers</option><option value="boolean">Boolean Preview</option></select><label for="composite-quality">COMPOSITE QUALITY CAP</label><select id="composite-quality"><option value="64">64³ · Fast</option><option value="128">128³ · Balanced</option><option value="192" selected>192³ · Detail</option></select><p id="composite-info" class="layers-hint" role="status">Preview is derived data; source grids are never merged or resampled.</p><label for="render-style">RENDERING STYLE</label><select id="render-style"><option value="normal">Normal · Clay</option><option value="matte">Matte · Soft reflections</option><option value="glossy">Glossy · Surface inspection</option></select><p class="layers-hint">Viewport only. Matte has soft reflections; Glossy reveals finer surface changes. Press I to cycle; GLB exports keep neutral clay materials.</p><label for="viewport-mode">LAYER DISPLAY COLOURS</label><select id="viewport-mode"><option value="clay">Clay</option><option value="layer-colours">Layer Colours</option></select>
    <div class="new-layer-controls"><select id="new-layer-resolution" aria-label="New layer resolution"><option value="64">64³</option><option value="128">128³</option><option value="192">192³</option></select><button id="new-layer">＋ New layer</button></div>
    <button id="bake-layers">Bake / Merge visible layers…</button><div id="bake-running" hidden><p id="bake-progress" role="status"></p><button id="cancel-bake">Cancel Bake</button></div>
    <section class="transform-panel"><label>ACTIVE LAYER TOOLS</label><div class="transform-modes"><button data-tool="sculpt" aria-pressed="true">Sculpt (B)</button><button data-tool="translate" aria-pressed="false">Move (W)</button><button data-tool="rotate" aria-pressed="false">Rotate (E)</button><button data-tool="scale" aria-pressed="false">Scale (R)</button></div>
    <label for="transform-space">GIZMO SPACE</label><select id="transform-space"><option value="world">World</option><option value="local">Local</option></select>
    </section>
    <div id="layer-list" aria-label="Layers"></div><section class="transform-panel transform-values"><label>ACTIVE LAYER NUMERIC TRANSFORM</label><fieldset class="numeric-transform"><legend>Position · project/world units</legend><label>X<input data-transform-field="px" type="number" step="0.1" aria-label="Position X"/></label><label>Y<input data-transform-field="py" type="number" step="0.1" aria-label="Position Y"/></label><label>Z<input data-transform-field="pz" type="number" step="0.1" aria-label="Position Z"/></label></fieldset>
    <fieldset class="numeric-transform"><legend>Rotation · XYZ degrees</legend><label>X<input data-transform-field="rx" type="number" step="1" aria-label="Rotation X degrees"/></label><label>Y<input data-transform-field="ry" type="number" step="1" aria-label="Rotation Y degrees"/></label><label>Z<input data-transform-field="rz" type="number" step="1" aria-label="Rotation Z degrees"/></label></fieldset>
    <label for="uniform-scale">UNIFORM SCALE</label><input id="uniform-scale" data-transform-field="scale" type="number" min="0.001" max="1000" step="0.01" aria-label="Uniform scale"/>
    <button id="reset-transform">Reset Transform</button><p id="transform-note" class="layers-hint">All scale handles are uniform. Numeric fields are absolute project coordinates. Use Sculpt to resume brushing.</p></section><p class="layers-hint">Select a layer to edit its resolution in the brush panel. Layer colours and display mode are saved with the project. Both GLB exports use neutral materials. Boolean Preview is neutral; layer colours apply in Separate Layers.</p></aside></main>
    <dialog id="bake-dialog" aria-labelledby="bake-title"><form method="dialog"><h2 id="bake-title">Bake visible Boolean result</h2><p>Creates a new editable SDF layer. Original layers are never deleted or resampled.</p><label for="bake-name">RESULT NAME</label><input id="bake-name" type="text" required maxlength="128" value="Baked sculpture"/><label for="bake-resolution">OUTPUT RESOLUTION</label><select id="bake-resolution"><option value="64">64³</option><option value="128" selected>128³</option><option value="192">192³</option></select><pre id="bake-bounds"></pre><p id="bake-estimate" role="status"></p><p>Lower output resolution can permanently lose fine detail in the baked result. Sources keep all their detail.</p><label class="bake-hide"><input id="bake-hide" type="checkbox" checked/> Hide contributing source layers after baking</label><p id="bake-overlap-note"></p><p id="bake-error" role="alert"></p><div class="dialog-actions"><button value="cancel" formnovalidate>Cancel</button><button id="confirm-bake" value="bake">Bake new layer</button></div></form></dialog>
    <dialog id="delete-layer-dialog"><form method="dialog"><h2>Delete layer?</h2><p id="delete-layer-message"></p><div class="dialog-actions"><button value="cancel">Cancel</button><button value="delete" class="danger">Delete layer</button></div></form></dialog>
    <footer><span>A little curiosity. Infinite possibilities.</span><span>CENTRA SCULPT · YOUR CREATIVE SPACE</span></footer>`;
  let mode: BrushMode = 'add';
  let clayMode:'add'|'subtract'='add';
  function setMode(value: BrushMode): void {
    mode = value;if(value!=='smooth')clayMode=value;
    for (const other of ['add','subtract','smooth']) {
      document.getElementById(other)!.classList.toggle('active', other === value);
      document.getElementById(other)!.setAttribute('aria-pressed', String(other === value));
    }
  }
  for (const value of ['add','subtract','smooth'] as const) document.getElementById(value)!.addEventListener('click',()=>setMode(value));
  const radius = document.querySelector<HTMLInputElement>('#radius')!;
  radius.addEventListener('input', () => document.getElementById('radius-value')!.textContent = Number(radius.value).toFixed(2));
  const strength = document.querySelector<HTMLInputElement>('#strength')!;
  strength.addEventListener('input', () => document.getElementById('strength-value')!.textContent = `${Math.round(Number(strength.value)*100)}%`);
  const hardness=document.querySelector<HTMLInputElement>('#hardness')!;
  hardness.addEventListener('input',()=>document.getElementById('hardness-value')!.textContent=`${Math.round(Number(hardness.value)*100)}%`);
  let transformAction:(action:TransformUIAction)=>void=()=>{};
  for(const button of document.querySelectorAll<HTMLButtonElement>('[data-tool]'))button.addEventListener('click',()=>transformAction({type:'mode',mode:button.dataset.tool as EditorMode}));
  document.getElementById('transform-space')!.addEventListener('change',event=>transformAction({type:'space',space:(event.target as HTMLSelectElement).value as TransformSpace}));
  for(const input of document.querySelectorAll<HTMLInputElement>('[data-transform-field]'))input.addEventListener('change',()=>transformAction({type:'field',field:input.dataset.transformField as TransformField,value:input.valueAsNumber}));
  document.getElementById('reset-transform')!.addEventListener('click',()=>transformAction({type:'reset'}));
  let layerAction: (action: LayerAction,id: string,value?: string)=>void=()=>{};
  const list=document.getElementById('layer-list')!;
  list.addEventListener('click',event=>{
    const button=(event.target as Element).closest<HTMLButtonElement>('button[data-action]'),row=button?.closest<HTMLElement>('[data-layer-id]');
    if(button&&row)layerAction(button.dataset.action as LayerAction,row.dataset.layerId!);
  });
  list.addEventListener('change',event=>{
    const input=event.target as HTMLInputElement,row=input.closest<HTMLElement>('[data-layer-id]');
    if(row&&(input.dataset.action==='rename'||input.dataset.action==='operation'))layerAction(input.dataset.action,row.dataset.layerId!,input.value);
  });
  list.addEventListener('input',event=>{
    const input=event.target as HTMLInputElement,row=input.closest<HTMLElement>('[data-layer-id]');
    if(row&&input.dataset.action==='colour')layerAction('colour',row.dataset.layerId!,input.value);
  });
  document.getElementById('new-layer')!.addEventListener('click',()=>layerAction('new','',document.querySelector<HTMLSelectElement>('#new-layer-resolution')!.value));
  document.getElementById('viewport-mode')!.addEventListener('change',event=>layerAction('mode','',(event.target as HTMLSelectElement).value));
  const deleteDialog=document.querySelector<HTMLDialogElement>('#delete-layer-dialog')!;
  const bakeDialog=document.querySelector<HTMLDialogElement>('#bake-dialog')!;
  return {
    selectBrushTool(tool:'brush'|'smooth'){setMode(tool==='smooth'?'smooth':clayMode);},
    onTransformAction(callback:typeof transformAction){transformAction=callback;},
    transformState(transform:VolumeTransform,editable:boolean,mode:EditorMode,space:TransformSpace,busy=false){
      for(const button of document.querySelectorAll<HTMLButtonElement>('[data-tool]')){button.setAttribute('aria-pressed',String(button.dataset.tool===mode));button.classList.toggle('active',button.dataset.tool===mode);button.disabled=busy;}
      document.querySelector<HTMLSelectElement>('#transform-space')!.value=space;
      for(const input of document.querySelectorAll<HTMLInputElement>('[data-transform-field]')) {
        const field=input.dataset.transformField as TransformField;
        const value=field==='scale'?(hasUniformScale(transform)?transform.scale[0]:NaN):field[0]==='p'?transform.position['xyz'.indexOf(field[1])]:transform.rotation['xyz'.indexOf(field[1])]*180/Math.PI;
        input.value=Number.isFinite(value)?String(Number(value.toFixed(6))):'';input.disabled=!editable||busy;input.dataset.editable=String(editable);
      }
      document.querySelector<HTMLButtonElement>('#reset-transform')!.disabled=!editable||busy;document.getElementById('reset-transform')!.dataset.editable=String(editable);
      document.getElementById('transform-note')!.textContent=!editable?'Show and unlock the active layer to edit it.':!hasUniformScale(transform)?'Legacy non-uniform scale preserved. Enter a uniform scale before sculpting or using Scale.':'All scale handles are uniform. Fields are absolute project coordinates; space changes gizmo axes. Brush radius stays in world units.';
    },
    onLayerAction(callback: typeof layerAction) {layerAction=callback;},
    surfaceView(view:SurfaceView){document.querySelector<HTMLSelectElement>('#composition-mode')!.value=view;},
    requestBake(getPlan:(resolution:number)=>BakePlan,onBounds:(plan:BakePlan|null)=>void):Promise<BakeOptions|null> {
      const name=document.querySelector<HTMLInputElement>('#bake-name')!,resolution=document.querySelector<HTMLSelectElement>('#bake-resolution')!,hide=document.querySelector<HTMLInputElement>('#bake-hide')!,confirm=document.querySelector<HTMLButtonElement>('#confirm-bake')!;
      name.value='Baked sculpture';resolution.value='128';hide.checked=true;
      const update=()=>{
        document.getElementById('bake-overlap-note')!.textContent=hide.checked?'Sources remain in the project, hidden and independently recoverable.':'Sources will stay visible. The viewport switches to Separate Layers to avoid recombining them with the baked result; surfaces may overlap.';
        try {
          const plan=getPlan(Number(resolution.value));onBounds(plan);
          document.getElementById('bake-bounds')!.textContent=`World bounds (cube)\nMin: ${plan.min.map(v=>v.toFixed(3)).join(', ')}\nMax: ${plan.max.map(v=>v.toFixed(3)).join(', ')}\nVoxel spacing: ${plan.worldStep.toFixed(5)} world units`;
          document.getElementById('bake-estimate')!.textContent=`${plan.sourceIds.length} visible sources · New grid + scratch: ${(plan.gridBytes/1048576).toFixed(1)} MiB · All project grids + scratch: ${(plan.projectGridBytes/1048576).toFixed(1)} MiB. Preview caches, meshes, GPU buffers and history are additional.${plan.detailLimited?' Output sampling is coarser than the finest source.':''}`;
          if(!name.value.trim())throw new Error('Enter a name for the baked layer.');
          confirm.disabled=false;document.getElementById('bake-error')!.textContent='';
        }catch(error){onBounds(null);confirm.disabled=true;document.getElementById('bake-error')!.textContent=(error as Error).message;document.getElementById('bake-bounds')!.textContent='';document.getElementById('bake-estimate')!.textContent='';}
      };
      for(const element of [name,resolution,hide])element.addEventListener('input',update);
      update();bakeDialog.returnValue='cancel';bakeDialog.showModal();
      return new Promise(resolve=>bakeDialog.addEventListener('close',()=>{
        for(const element of [name,resolution,hide])element.removeEventListener('input',update);onBounds(null);
        resolve(bakeDialog.returnValue==='bake'?{name:name.value.trim(),resolution:Number(resolution.value),hideSources:hide.checked}:null);
      },{once:true}));
    },
    bakeBusy(busy:boolean){document.getElementById('bake-running')!.hidden=!busy;document.querySelector<HTMLButtonElement>('#cancel-bake')!.disabled=false;},
    bakeProgress(progress:BakeProgress){document.getElementById('bake-progress')!.textContent=`${progress.stage==='sampling'?'Sampling SDF':'Generating chunks'}: ${progress.completed}/${progress.total}`;},
    get modalOpen() {return deleteDialog.open||bakeDialog.open;},
    confirmDelete(name: string): Promise<boolean> {
      document.getElementById('delete-layer-message')!.textContent=`Delete “${name}” and its voxel data and undo history? Other layers will be kept.`;
      deleteDialog.returnValue='cancel';
      return new Promise(resolve=>{deleteDialog.addEventListener('close',()=>resolve(deleteDialog.returnValue==='delete'),{once:true});deleteDialog.showModal();});
    },
    compositeInfo(text:string){document.getElementById('composite-info')!.textContent=text;},
    renderStyle(style:RenderStyle){document.querySelector<HTMLSelectElement>('#render-style')!.value=style;document.getElementById('cycle-render-style')!.textContent='◐ '+({normal:'Normal',matte:'Matte',glossy:'Glossy'}[style])+' · I';},
    viewportMode(mode: ViewportMode) {document.querySelector<HTMLSelectElement>('#viewport-mode')!.value=mode;},
    layerName(layer: SdfLayer) {
      const row=Array.from(list.children).find(node=>(node as HTMLElement).dataset.layerId===layer.id) as HTMLElement|undefined;
      if(!row)return;
      const select=row.querySelector<HTMLButtonElement>('[data-action="select"]')!;select.textContent=`${layer.name} · ${layer.volume.resolution}³`;select.setAttribute('aria-label',`Select ${layer.name}`);
      row.querySelector<HTMLInputElement>('[data-action="rename"]')!.setAttribute('aria-label',`Rename ${layer.name}`);
      row.querySelector<HTMLInputElement>('[data-action="colour"]')!.setAttribute('aria-label',`Viewport colour for ${layer.name}`);
      row.querySelector<HTMLSelectElement>('[data-action="operation"]')!.setAttribute('aria-label',`Boolean operation for ${layer.name}`);
      for(const [action,label] of [['visible',`${layer.visible?'Hide':'Show'} ${layer.name}`],['lock',`${layer.locked?'Unlock':'Lock'} ${layer.name}`],['up',`Move ${layer.name} up`],['down',`Move ${layer.name} down`],['duplicate',`Duplicate ${layer.name}`],['delete',`Delete ${layer.name}`]])row.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!.setAttribute('aria-label',label);
    },
    layerRows(layers: readonly SdfLayer[],activeId: string,colour: (layer:SdfLayer)=>string) {
      list.replaceChildren();
      for(const [index,layer] of layers.entries()) {
        const row=document.createElement('div');row.className=`layer-row${layer.id===activeId?' active':''}`;row.dataset.layerId=layer.id;
        const heading=document.createElement('div');heading.className='layer-heading';
        const select=document.createElement('button');select.dataset.action='select';select.className='layer-select';select.textContent=`${layer.name} · ${layer.volume.resolution}³`;select.setAttribute('aria-label',`Select ${layer.name}`);select.setAttribute('aria-pressed',String(layer.id===activeId));heading.append(select);
        const picker=document.createElement('input');picker.type='color';picker.dataset.action='colour';picker.value=colour(layer);picker.setAttribute('aria-label',`Viewport colour for ${layer.name}`);heading.append(picker);row.append(heading);
        const name=document.createElement('input');name.type='text';name.value=layer.name;name.maxLength=128;name.dataset.action='rename';name.setAttribute('aria-label',`Rename ${layer.name}`);row.append(name);
        const operation=document.createElement('select');operation.dataset.action='operation';operation.setAttribute('aria-label',`Boolean operation for ${layer.name}`);
        for(const [value,label] of [['union','Add / Union'],['difference','Subtract / Difference'],['intersect','Intersect']])operation.add(new Option(label,value));
        operation.value=layer.operation;operation.disabled=layer.locked;operation.dataset.unavailable=String(layer.locked);row.append(operation);
        const direction=document.createElement('p');direction.className='layers-hint';direction.textContent=`${index+1} · ${layer.visible?(layers.find(l=>l.visible)?.id===layer.id?'Initializes result (operation ignored)':'Applied to result above'):'Hidden · excluded from preview'}`;row.append(direction);
        const tools=document.createElement('div');tools.className='layer-tools';
        for(const [action,text,label,disabled] of [
          ['visible',layer.visible?'Visible':'Hidden',`${layer.visible?'Hide':'Show'} ${layer.name}`,false],
          ['lock',layer.locked?'Locked':'Unlocked',`${layer.locked?'Unlock':'Lock'} ${layer.name}`,false],
          ['up','↑',`Move ${layer.name} up`,index===0],['down','↓',`Move ${layer.name} down`,index===layers.length-1],
          ['duplicate','Copy',`Duplicate ${layer.name}`,false],['delete','Delete',`Delete ${layer.name}`,layers.length===1]
        ] as const) {
          const button=document.createElement('button');button.dataset.action=action;button.textContent=text;button.setAttribute('aria-label',label);button.disabled=disabled;button.dataset.unavailable=String(disabled);
          if(action==='delete'&&disabled)button.title='Keep at least one layer';tools.append(button);
        }
        row.append(tools);list.append(row);
      }
      const create=document.querySelector<HTMLButtonElement>('#new-layer')!;create.disabled=layers.length>=8;create.dataset.unavailable=String(create.disabled);
    },
    get hardness() {return Number(hardness.value);},
    resolution(value: number) {
      const select=document.querySelector<HTMLSelectElement>('#resolution')!;
      for(const option of Array.from(select.options))if(option.dataset.custom)option.remove();
      if(!Array.from(select.options).some(o=>o.value===String(value))) {const option=new Option(`${value}³ · Loaded`,String(value));option.dataset.custom='true';select.add(option);}
      select.value=String(value);
    },
    get settings(): SculptSettings { return {mode,radius:Number(radius.value),strength:Number(strength.value),hardness:Number(hardness.value)}; },
    setSettings(settings: SculptSettings) {
      // Preserve validated imported precision rather than snapping to the slider's default step.
      radius.step='any'; strength.step='any'; hardness.step='any'; hardness.value=String(settings.hardness);
      document.getElementById('hardness-value')!.textContent=`${Math.round(settings.hardness*100)}%`;
      setMode(settings.mode); radius.value=String(settings.radius); strength.value=String(settings.strength);
      document.getElementById('radius-value')!.textContent=Number(radius.value).toFixed(2);
      document.getElementById('strength-value')!.textContent=`${Math.round(Number(strength.value)*100)}%`;
    },
    history(undo: number, redo: number, busy=false) {
      document.querySelector<HTMLButtonElement>('#undo')!.disabled=busy || undo===0;
      document.querySelector<HTMLButtonElement>('#redo')!.disabled=busy || redo===0;
      document.getElementById('history-info')!.textContent=`${undo} undo · ${redo} redo`;
    },
    projectBusy(busy: boolean) {
      for (const id of ['open-project','save-project','reset','apply-resolution','export','export-boolean','cycle-render-style']) document.querySelector<HTMLButtonElement>(`#${id}`)!.disabled=busy;
      for(const control of document.querySelectorAll<HTMLInputElement|HTMLButtonElement|HTMLSelectElement>('.layers-panel button,.layers-panel input,.layers-panel select'))control.disabled=busy||control.dataset.unavailable==='true'||(control.matches('[data-transform-field],#reset-transform')&&control.dataset.editable==='false');
    },
    projectMessage(text: string, error=false) {
      const element=document.getElementById('project-message')!;
      element.textContent=text; element.classList.toggle('error',error); element.setAttribute('role',error?'alert':'status');
    },
    get strength() { return Number(strength.value); }, performance(text: string) { document.getElementById('rebuild-info')!.textContent = text; }, viewport: document.getElementById('viewport')!, get mode() { return mode; }, get radius() { return Number(radius.value); }, status(text: string) { document.getElementById('status')!.textContent = text; }, meshInfo(triangles: number, resolution: number,composite=false) { document.getElementById('mesh-info')!.textContent = `${triangles.toLocaleString()} TRIANGLES · ACTIVE ${resolution}³ SAMPLES`;if(composite)document.getElementById('mesh-info')!.textContent=`${triangles.toLocaleString()} TRIANGLES · COMPOSITE ${resolution||'…'}³ SAMPLES`; } };
}
