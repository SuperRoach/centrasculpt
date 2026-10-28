import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Matrix4,Vector3,Quaternion} from 'three';
import {canvasContext} from '../scripts/fixtures/canvas-context.mjs';
import {VR_UI,VR_UI_SCALES,layoutVRText,roundedVRRect,vrControlStyle} from '../work/test-build/xr-ui-style.mjs';
import {XRMenuModel,MENU_SIZE,WHEEL,OPTIONS_PER_PAGE} from '../work/test-build/xr-menu-model.mjs';
import {XRMenuView} from '../work/test-build/xr-menu-view.mjs';
import {XRDiagnostics} from '../work/test-build/xr-diagnostics.mjs';
import {XRPerformancePanel} from '../work/test-build/xr-performance.mjs';
import {EditorToolState,EDITOR_TOOLS} from '../work/test-build/editor-tool-state.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {ShapePreviewModel} from '../work/test-build/shape-preview.mjs';
import {LayerDisplayPreferences,validateProjectDisplay} from '../work/test-build/display-preferences.mjs';
import {saveSculptProject,openSculptProject} from '../work/test-build/project.mjs';
import {encodeRecovery} from '../work/test-build/recovery-client.mjs';
import {RecoveryBrowserWorker} from '../scripts/fixtures/node-recovery-worker.mjs';
const settings={mode:'add',radius:.22,strength:.35,hardness:0,camera:{position:[2,2,3],target:[0,0,0]}};
function fixture(){const layers=new IndependentLayers(createBaseProject(new SDFVolume(17),settings)),shape=new ShapePreviewModel(layers.project.activeLayerId);let mode='sculpt',state={...settings};const tools=new EditorToolState({layers:()=>layers,shape,settings:()=>state,setSettings:v=>state=v,mode:()=>mode,selectTool:t=>{shape.setEnabled(t==='stamp',layers.project.layerStack);mode=t==='transform'?'translate':'sculpt';if(t==='clay'||t==='smooth')state={...state,mode:t==='clay'?'add':'smooth'};},selectTransform:m=>mode=m,busy:()=>false,changed(){}});return {layers,tools,model:new XRMenuModel(tools),dispose:()=>layers.dispose()};}
function canvas(){const previous=globalThis.document,calls=[],ctx=canvasContext({fillText(text,x,y){calls.push({kind:'text',text,x,y,font:this.font,colour:this.fillStyle});},clearRect(...args){calls.push({kind:'clear',args});},moveTo(...args){calls.push({kind:'move',args});},fillRect(...args){calls.push({kind:'rect',args});}});globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>ctx})};return {ctx,calls,restore(){globalThis.document=previous;}};}
const state=()=>({connectionId:8,role:'tool',connected:true,tracked:true,gripTracked:true,buttons:{trigger:{pressed:false,rawValue:0,justPressed:false}}});
function pose(view,x,y){view.mesh.updateWorldMatrix(true,false);const p=new Vector3((x/MENU_SIZE-.5)*.72,(.5-y/MENU_SIZE)*.72,0).applyMatrix4(view.mesh.matrixWorld),q=view.mesh.getWorldQuaternion(new Quaternion());p.addScaledVector(new Vector3(0,0,1).applyQuaternion(q),.7);return new Matrix4().compose(p,q,new Vector3(1,1,1));}
const center=b=>[b.rect.x+b.rect.width/2,b.rect.y+b.rect.height/2];
test('fixed large typography wraps words and unbroken labels within explicit bounds without squeezed fonts',()=>{
 const c=canvasContext();c.font='32px sans-serif';for(const text of ['Local influence radius · layer coordinates','A'.repeat(200),'A long layer name with 日本語 and punctuation / transforms']){const box={x:56,y:244,width:300,height:78},lines=layoutVRText(c,text,box,32);assert(lines.length>0);for(const line of lines){assert(line.x>=box.x);assert(line.y+line.height<=box.y+box.height);assert(line.width<=box.width);}}
 assert(VR_UI.label>=32);assert(VR_UI.value>=36);assert(VR_UI.detail>=28);assert(VR_UI.radial>=30);assert.equal(OPTIONS_PER_PAGE,5);
});
test('floating wheel preserves all twelve invisible radial sectors, boundaries, transparent gaps and tool accessibility',()=>{
 const f=fixture();try{f.model.setRequest('tool-wheel');assert.equal(EDITOR_TOOLS.length,12);for(let i=0;i<12;i++){const angle=-Math.PI/2+i*Math.PI/6;for(const r of [WHEEL.inner+.01,250,WHEEL.outer-.01])assert.equal(f.model.hit(WHEEL.x+Math.cos(angle)*r,WHEEL.y+Math.sin(angle)*r),`tool:${EDITOR_TOOLS[i].id}`);assert.equal(f.model.hit(WHEEL.x+Math.cos(angle)*(WHEEL.outer+1),WHEEL.y+Math.sin(angle)*(WHEEL.outer+1)),null);}
 for(let i=0;i<12;i++)for(let j=i+1;j<12;j++){const ai=-Math.PI/2+i*Math.PI/6,aj=-Math.PI/2+j*Math.PI/6;assert(Math.abs(Math.cos(ai)-Math.cos(aj))*WHEEL.labelRadius>=156-1e-8||Math.abs(Math.sin(ai)-Math.sin(aj))*WHEEL.labelRadius>=118-1e-8,'floating cards overlap');}
 for(const t of EDITOR_TOOLS){f.model.activate(`tool:${t.id}`);assert.equal(f.tools.active,t.id);assert.equal(f.model.page,'tool-options');f.model.activate('tools');}assert.equal(f.layers.undoCount,0);
 }finally{f.dispose();}
});
test('wheel drawing clears alpha and omits the full panel backing; rectangular palettes keep rounded backing',()=>{
 const c=canvas(),f=fixture(),view=new XRMenuView(f.model);try{view.place({x:0,y:1.6,z:0},{x:0,y:0,z:0,w:1});view.update('tool-wheel',undefined,undefined,0,true);assert(c.calls.some(x=>x.kind==='clear'));assert(!c.calls.some(x=>x.kind==='rect'&&x.args[2]===MENU_SIZE));assert(!c.calls.some(x=>x.kind==='move'&&x.args[0]===36&&x.args[1]===4));assert(c.calls.filter(x=>x.kind==='text').some(x=>x.text==='Tube'));c.calls.length=0;view.update('layers',undefined,undefined,200,true);assert(c.calls.some(x=>x.kind==='move'&&x.args[0]===36&&x.args[1]===4));assert.equal(view.mesh.material.depthTest,false);assert.equal(view.mesh.material.transparent,true);}finally{view.dispose();f.dispose();c.restore();}
});
test('every option row, slider, layer row, page navigation and scale control remains bounded and disjoint',()=>{
 const f=fixture();try{for(let i=1;i<8;i++)f.layers.create(64);f.model.setRequest('layers');const validate=content=>{const rects=content.buttons.filter(b=>b.rect);for(const b of rects){const r=b.rect;assert(r.x>=0&&r.y>=0&&r.x+r.width<=MENU_SIZE&&r.y+r.height<1040);assert.equal(f.model.hit(...center(b)),b.id);for(const other of rects){if(b===other)continue;const s=other.rect;assert(r.x+r.width<=s.x||s.x+s.width<=r.x||r.y+r.height<=s.y||s.y+s.height<=r.y,`${b.id} overlaps ${other.id}`);}}for(const l of content.labels)if(l.width){assert(l.x+l.width<=MENU_SIZE);assert(l.y+l.height<1040);}};
 validate(f.model.content());for(const tool of EDITOR_TOOLS){f.model.setRequest(null);f.model.setRequest('tool-wheel');f.model.activate(`tool:${tool.id}`);let pages=0;for(;;){validate(f.model.content());assert(++pages<12);if(f.model.content().buttons.find(b=>b.id==='next').disabled)break;f.model.activate('next');}assert.equal(pages,Math.ceil(f.tools.options().length/OPTIONS_PER_PAGE));}
 }finally{f.dispose();}
});
test('UI scale is display-only and round-trips through native files and the actual recovery worker',async()=>{
 const f=fixture(),oldWorker=globalThis.Worker;globalThis.Worker=RecoveryBrowserWorker;try{const values=f.layers.active.volume.values.slice(),transform=structuredClone(f.layers.active.layer.transform),mesher=f.layers.active.mesher,geometry=f.layers.active.surface.group.children.map(m=>m.geometry);f.model.setRequest('tool-wheel');for(const size of ['large','normal']){f.model.activate('ui-scale');assert.equal(f.layers.display.vrUiScale,size);const display=f.layers.display.snapshot(f.layers.project.id,f.layers.project.layerStack.layers),saved=saveSculptProject(f.layers.project,display),opened=openSculptProject(saved),restored=new LayerDisplayPreferences();restored.restore(opened.id,opened.layerStack.layers,opened.displayPreferences);assert.equal(restored.vrUiScale,size);const encoded=await encodeRecovery(f.layers,settings,display,undefined,new AbortController().signal,()=>true);assert.deepEqual(encoded.data,saved);}
 assert.deepEqual(f.layers.active.volume.values,values);assert.deepEqual(f.layers.active.layer.transform,transform);assert.equal(f.layers.active.mesher,mesher);assert.deepEqual(f.layers.active.surface.group.children.map(m=>m.geometry),geometry);assert.equal(f.layers.undoCount,0);assert.equal(f.layers.redoCount,0);assert(!('vrUiScale' in f.layers.display.snapshot(f.layers.project.id,f.layers.project.layerStack.layers)));assert.throws(()=>validateProjectDisplay({mode:'clay',colours:{},vrUiScale:5},[]));
 }finally{globalThis.Worker=oldWorker;f.dispose();}
});
test('all UI sizes keep ray UV hits and cursor aligned while sculpture/workspace scale remains untouched',()=>{
 const c=canvas(),f=fixture(),view=new XRMenuView(f.model);try{const root=new Group(),workspace=new Group();root.add(view.mesh);workspace.add(f.layers.group);workspace.scale.setScalar(.4);workspace.position.set(2,1,-1);view.place({x:0,y:1.6,z:0},{x:0,y:0,z:0,w:1});const tool=state();for(const [size,factor] of Object.entries(VR_UI_SCALES)){f.layers.display.vrUiScale=size;view.update('tool-wheel',tool,undefined,0,true);const a=-Math.PI/2+7*Math.PI*2/12,x=WHEEL.x+Math.cos(a)*WHEEL.labelRadius,y=WHEEL.y+Math.sin(a)*WHEEL.labelRadius;view.update('tool-wheel',tool,pose(view,x,y),200,true);assert.equal(view.mesh.scale.x,factor);assert.equal(f.model.hover,`tool:${EDITOR_TOOLS[7].id}`);assert(view.cursor.visible);const world=view.cursor.getWorldPosition(new Vector3());assert(world.distanceTo(new Vector3((x/MENU_SIZE-.5)*.72,(.5-y/MENU_SIZE)*.72,.002).applyMatrix4(view.mesh.matrixWorld))<1e-6);assert.equal(workspace.scale.x,.4);assert.equal(f.layers.active.layer.transform.scale[0],1);}
 view.close();assert(!view.cursor.visible);assert(!view.mesh.visible);
 }finally{view.dispose();f.dispose();c.restore();}
});
test('disabled, hover, selected and active slider states have distinct non-colour-only affordances',()=>{
 const idle=vrControlStyle(),hover=vrControlStyle(false,true),selected=vrControlStyle(false,false,true),active=vrControlStyle(false,false,false,true),disabled=vrControlStyle(true);assert.notEqual(idle.fill,hover.fill);assert.notEqual(idle.stroke,selected.stroke);assert(hover.lineWidth>idle.lineWidth);assert(selected.lineWidth>idle.lineWidth);assert.notEqual(active.fill,hover.fill);assert.notEqual(disabled.text,idle.text);
 const c=canvas(),f=fixture(),view=new XRMenuView(f.model);try{view.place({x:0,y:1.6,z:0},{x:0,y:0,z:0,w:1});const s=state();view.update('tool-wheel',s,undefined,0,true);f.model.activate('options');const next=f.model.content().buttons.find(b=>b.id==='prev');view.update('tool-wheel',s,pose(view,...center(next)),200,true);assert.equal(f.model.hover,'prev');assert.equal(view.cursor.material.color.getHexString(),VR_UI.disabled.slice(1));const before=f.model.optionPage;s.buttons.trigger={pressed:true,rawValue:1,justPressed:true};view.update('tool-wheel',s,pose(view,...center(next)),216,true);assert.equal(f.model.optionPage,before);}finally{view.dispose();f.dispose();c.restore();}
});
test('side diagnostics/performance panels retain separation at every scale, lifecycle and depth semantics',()=>{
 const c=canvas(),d=new XRDiagnostics(),p=new XRPerformancePanel();try{for(const factor of Object.values(VR_UI_SCALES)){d.start();p.start();d.setUIScale(factor);p.setUIScale(factor);d.place({x:0,y:1.6,z:0},{x:0,y:0,z:0,w:1});p.place({x:0,y:1.6,z:0},{x:0,y:0,z:0,w:1});assert.equal(d.group.scale.x,factor);assert.equal(p.mesh.scale.x,factor);assert(d.group.position.x-.31*factor>.36*factor);assert(p.mesh.position.x+.31*factor<-.36*factor);d.stop();p.stop();assert(!d.group.visible);assert(!p.mesh.visible);}}finally{d.dispose();p.dispose();c.restore();}
});
