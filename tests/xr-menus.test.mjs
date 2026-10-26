import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Matrix4,Quaternion,Vector3} from 'three';
import {EditorToolState,EDITOR_TOOLS} from '../work/test-build/editor-tool-state.mjs';
import {XRMenuModel,MENU_SIZE,WHEEL} from '../work/test-build/xr-menu-model.mjs';
import {XRMenuView} from '../work/test-build/xr-menu-view.mjs';
import {XRControllers} from '../work/test-build/xr-controllers.mjs';
import {XRControllerRoles} from '../work/test-build/xr-controller-roles.mjs';
import {XRSupportShortcuts} from '../work/test-build/xr-support-shortcuts.mjs';
import {projectHistoryShortcuts} from '../work/test-build/xr-history-shortcuts.mjs';
import {InputOwnership} from '../work/test-build/interaction.mjs';
import {ShapePreviewModel} from '../work/test-build/shape-preview.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {saveSculptProject,openSculptProject} from '../work/test-build/project.mjs';
const initial={mode:'add',radius:.22,strength:.35,hardness:0,camera:{position:[2,2,3],target:[0,0,0]}};
function fixture(){
 const layers=new IndependentLayers(createBaseProject(new SDFVolume(17),initial)),input=new InputOwnership(),shape=new ShapePreviewModel(layers.project.activeLayerId);let settings={...initial},busy=false,changed=0,clay='add';
 const tools=new EditorToolState({layers:()=>layers,shape,settings:()=>settings,setSettings:v=>{settings=v;if(v.mode!=='smooth')clay=v.mode;},mode:()=>input.mode,
  selectTool:id=>{shape.setEnabled(id==='stamp',layers.project.layerStack);input.mode=id==='transform'?'translate':'sculpt';if(id==='clay'||id==='smooth')settings={...settings,mode:id==='smooth'?'smooth':clay};},
  selectTransform:mode=>{shape.setEnabled(false,layers.project.layerStack);input.mode=mode;},busy:()=>busy,changed:()=>changed++});
 return {layers,input,shape,tools,model:new XRMenuModel(tools),get settings(){return settings;},set busy(v){busy=v;},get changed(){return changed;},dispose:()=>layers.dispose()};
}
function fakeDocument(){const original=globalThis.document;globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>new Proxy({}, {get:()=>()=>{}})})};return ()=>globalThis.document=original;}
const toolState=()=>({connectionId:7,role:'tool',connected:true,tracked:true,gripTracked:true,buttons:{trigger:{pressed:false,rawValue:0,justPressed:false},grip:{pressed:false,rawValue:0}}});
function buttonPoint(model,id){const button=model.content().buttons.find(b=>b.id===id);assert(button,`missing ${id}`);if(button.rect)return [button.rect.x+button.rect.width/2,button.rect.y+button.rect.height/2];const a=-Math.PI/2+button.sector*Math.PI*2/5;return [WHEEL.x+Math.cos(a)*WHEEL.labelRadius,WHEEL.y+Math.sin(a)*WHEEL.labelRadius];}
function rayPose(view,x,y){view.mesh.updateWorldMatrix(true,false);const target=new Vector3((x/MENU_SIZE-.5)*.72,(.5-y/MENU_SIZE)*.72,0).applyMatrix4(view.mesh.matrixWorld),normal=new Vector3(0,0,1).transformDirection(view.mesh.matrixWorld);return new Matrix4().compose(target.addScaledVector(normal,.6),view.mesh.getWorldQuaternion(new Quaternion()),new Vector3(1,1,1));}
function trigger(state,pressed){state.buttons.trigger={pressed,rawValue:pressed?1:0,justPressed:pressed};}
test('Tool Wheel opens, selects all enabled tools, shows active state, and dismisses cleanly',()=>{
 const f=fixture();try{const {model,tools}=f;assert.equal(model.request,null);model.setRequest('tool-wheel');assert.equal(model.content().title,'TOOL WHEEL');assert(model.content().buttons.find(b=>b.id==='tool:clay').selected);
 for(const id of ['smooth','stamp','transform','move','clay']){model.activate(`tool:${id}`);assert.equal(tools.active,id);assert.equal(model.page,'tool-options');assert(model.content().title.includes('OPTIONS'));model.activate('tools');assert(model.content().buttons.find(b=>b.id===`tool:${id}`).selected);}
 model.activate('tool:move');assert.equal(tools.active,'move');assert.equal(model.feedback,'');model.activate('tools');model.activate('tool:clay');model.setRequest(null);model.activate('tool:smooth');assert.equal(tools.active,'clay');assert.equal(model.hover,null);assert.equal(model.hit(576,280),null);assert.equal(f.layers.undoCount,0);
 }finally{f.dispose();}
});
test('radial and rectangular hit tests align with every visible target, including experimental Move',()=>{
 const f=fixture();try{const m=f.model;m.setRequest('tool-wheel');for(const definition of EDITOR_TOOLS){const id=`tool:${definition.id}`;assert.equal(m.hit(...buttonPoint(m,id)),id);}
 assert.equal(m.hit(576,590),'options');for(const point of [[0,0],[-1,300],[NaN,0],[1153,200],[1100,1050]])assert.equal(m.hit(...point),null);
 m.activate('options');for(const b of m.content().buttons)assert.equal(m.hit(...buttonPoint(m,b.id)),b.id);
 }finally{f.dispose();}
});
test('Clay/Smooth options update the same desktop settings without voxel/history changes',()=>{
 const f=fixture();try{const bytes=new Uint8Array(saveSculptProject(f.layers.project)),volume=f.layers.active.volume.getDenseView().slice(),geometry=f.layers.active.surface.group.children.map(o=>o.geometry);
 f.tools.adjust('operation',1);assert.equal(f.settings.mode,'subtract');f.tools.adjust('radius',1);assert.equal(f.settings.radius,.24);f.tools.adjust('strength',1);assert.equal(f.settings.strength,.4);f.tools.adjust('hardness',1);assert.equal(f.settings.hardness,.05);assert.throws(()=>f.tools.adjust('spacing',1));
 f.tools.select('smooth');assert.equal(f.settings.mode,'smooth');assert.deepEqual(f.tools.options().map(o=>o.id),['placement','radius','strength','quality','application','symmetry','symmetry-axis','symmetry-offset','alternate-tool']);f.tools.adjust('strength',-1);assert.equal(f.settings.strength,.35);f.tools.select('clay');assert.equal(f.settings.mode,'subtract');
 f.tools.port.setSettings({...f.settings,radius:.3});assert.equal(f.tools.options().find(o=>o.id==='radius').value,'0.300');f.input.mode='rotate';assert.equal(f.tools.active,'transform');f.shape.setEnabled(true,f.layers.project.layerStack);assert.equal(f.tools.active,'stamp');
 assert.deepEqual(f.layers.active.volume.getDenseView(),volume);assert.deepEqual(f.layers.active.surface.group.children.map(o=>o.geometry),geometry);assert.deepEqual(new Uint8Array(saveSculptProject(f.layers.project)),bytes);assert.equal(f.layers.undoCount,0);
 }finally{f.dispose();}
});
test('data-driven Stamp options use the existing preview model and linked dimensions, without applying a stamp',()=>{
 const f=fixture();try{const bytes=f.layers.active.volume.getDenseView().slice();f.tools.select('stamp');f.tools.adjust('dimension-0',1);assert.deepEqual(f.shape.definition.dimensions,[.85,.85,.85]);assert(f.tools.options().find(o=>o.id==='dimension-1').disabled);assert.throws(()=>f.tools.adjust('dimension-2',1));
 f.tools.adjust('shape',1);assert.equal(f.shape.definition.kind,'box');f.tools.adjust('dimension-1',1);assert.equal(f.shape.definition.dimensions[1],.9);f.tools.adjust('rotation-0',1);assert(Math.abs(f.shape.definition.transform.rotation[0]-Math.PI/12)<1e-10);f.tools.adjust('shape-scale',1);assert.deepEqual(f.shape.definition.transform.scale,[1.1,1.1,1.1]);f.tools.adjust('operation',1);assert.equal(f.shape.definition.operation,'subtract');
 f.tools.adjust('shape',1);f.tools.adjust('shape',1);assert.equal(f.shape.definition.kind,'pyramid');f.tools.adjust('dimension-0',1);assert.equal(f.shape.definition.dimensions[0],f.shape.definition.dimensions[2]);assert(f.tools.options().find(o=>o.id==='dimension-2').disabled);
 f.model.setRequest('tool-wheel');f.model.activate('options');f.model.activate('next');assert.equal(f.model.optionPage,1);assert(f.model.content().labels.some(l=>l.text==='Uniform scale'));f.model.activate('prev');assert.equal(f.model.optionPage,0);
 assert.deepEqual(f.layers.active.volume.getDenseView(),bytes);assert.equal(f.layers.undoCount,0);f.layers.setFlag(f.layers.project.activeLayerId,'locked',true);assert(f.tools.options().filter(o=>o.id!=='application'&&o.id!=='alternate-tool').every(o=>o.disabled));assert.throws(()=>f.tools.adjust('shape',1));
 }finally{f.dispose();}
});
test('Transform options edit metadata with existing undo and native persistence, never SDF resampling',()=>{
 const f=fixture();try{const {tools,layers}=f,volume=layers.active.volume,bytes=volume.getDenseView().slice();tools.select('transform');tools.adjust('layer-0',1);assert.equal(layers.active.layer.transform.position[0],.1);assert.equal(layers.undoCount,1);
 tools.adjust('transform-mode',1);assert.equal(f.input.mode,'rotate');tools.adjust('layer-2',1);assert(Math.abs(layers.active.layer.transform.rotation[2]-5*Math.PI/180)<1e-10);tools.adjust('transform-mode',1);assert.equal(f.input.mode,'scale');tools.adjust('layer-scale',1);assert.deepEqual(layers.active.layer.transform.scale,[1.1,1.1,1.1]);assert.equal(layers.undoCount,3);
 const opened=openSculptProject(saveSculptProject(layers.project));assert.deepEqual(opened.layerStack.active.transform,layers.active.layer.transform);layers.undo();assert.deepEqual(layers.active.layer.transform.scale,[1,1,1]);layers.undo(true);assert.deepEqual(layers.active.layer.transform.scale,[1.1,1.1,1.1]);assert.equal(layers.active.volume,volume);assert.deepEqual(volume.getDenseView(),bytes);
 tools.adjust('surface-view',1);assert.equal(layers.viewMode,'boolean');assert.match(tools.options().find(o=>o.id==='grip').value,/Separate Layers/);
 layers.active.layer.locked=true;assert(tools.options().find(o=>o.id==='layer-scale').disabled);layers.active.layer.locked=false;layers.active.layer.transform.scale=[1,2,1];assert(tools.options().find(o=>o.id==='layer-scale').disabled);layers.viewMode='separate';assert.match(tools.options().find(o=>o.id==='grip').value,/Uniform/);
 }finally{f.dispose();}
});
test('Layers panel selects visible, hidden or locked rows and toggles flags using existing commands',()=>{
 const f=fixture();try{const first=f.layers.active.layer,second=f.layers.create(64),a=first.volume.getDenseView().slice(),b=second.volume.getDenseView().slice(),m=f.model;m.setRequest('layers');assert.equal(m.content().buttons.length,6);
 m.activate(`select:${first.id}`);assert.equal(f.layers.project.activeLayerId,first.id);assert(m.content().buttons.find(b=>b.id===`select:${first.id}`).selected);m.activate(`visible:${first.id}`);m.activate(`locked:${first.id}`);assert.equal(first.visible,false);assert.equal(first.locked,true);m.activate(`select:${second.id}`);assert.equal(f.layers.project.activeLayerId,second.id);m.activate(`select:${first.id}`);assert.equal(f.layers.active.layer.id,first.id);
 const opened=openSculptProject(saveSculptProject(f.layers.project));assert.equal(opened.layerStack.activeLayerId,first.id);assert.equal(opened.layerStack.active.visible,false);assert.equal(opened.layerStack.active.locked,true);assert.deepEqual(first.volume.getDenseView(),a);assert.deepEqual(second.volume.getDenseView(),b);assert.equal(f.layers.undoCount,0);assert.equal(f.layers.project.layerStack.layers.length,2);
 m.activate(`visible:${first.id}`);m.activate(`locked:${first.id}`);assert(first.visible&&!first.locked);assert(f.changed>=6);
 }finally{f.dispose();}
});
test('busy/current edit guards reject menu business commands instead of committing an edit',()=>{
 const f=fixture();try{f.model.setRequest('tool-wheel');f.busy=true;assert.throws(()=>f.tools.select('smooth'));f.model.activate('tool:smooth');assert.equal(f.tools.active,'clay');f.busy=false;
 f.layers.beginTransform();assert.throws(()=>f.tools.selectLayer(f.layers.project.activeLayerId));assert.throws(()=>f.tools.toggleLayer(f.layers.project.activeLayerId,'visible'));assert.throws(()=>f.tools.adjust('radius',1));assert(f.layers.transforming);f.layers.cancelTransform();f.layers.beginStroke();assert.throws(()=>f.tools.select('stamp'));assert(f.layers.drawing);f.layers.finishStroke();assert.equal(f.layers.undoCount,0);
 }finally{f.dispose();}
});
test('tool trigger selects only a current hovered menu target, once per press, with a fresh release on opening/reconnect',()=>{
 const restore=fakeDocument(),f=fixture();let view;try{view=new XRMenuView(f.model);new Group().add(view.mesh);view.place({x:0,y:1.6,z:0},{x:0,y:0,z:0,w:1});const s=toolState();trigger(s,true);view.update('tool-wheel',s,new Matrix4(),0,true);const pose=rayPose(view,...buttonPoint(f.model,'tool:smooth'));
 view.update('tool-wheel',s,pose,16,true);assert.equal(f.tools.active,'clay');trigger(s,false);view.update('tool-wheel',s,pose,32,true);assert.equal(f.model.hover,'tool:smooth');trigger(s,true);view.update('tool-wheel',s,pose,48,true);assert.equal(f.tools.active,'smooth');assert.equal(f.model.page,'tool-options');const changed=f.changed;for(let t=64;t<300;t+=16){s.buttons.trigger.justPressed=false;view.update('tool-wheel',s,pose,t,true);}assert.equal(f.changed,changed);
 view.update(null,s,pose,310,true);assert.equal(view.mesh.visible,false);assert.equal(view.active,false);view.update('tool-wheel',s,pose,320,true);assert.equal(f.tools.active,'smooth');trigger(s,false);view.update('tool-wheel',s,pose,336,true);s.connectionId++;trigger(s,true);view.update('tool-wheel',s,pose,352,true);assert.equal(f.model.page,'tool-wheel');assert.equal(f.tools.active,'smooth');
 }finally{view?.dispose();f.dispose();restore();}
});
test('view hit conversion respects a transformed tracking parent, misses, roles and tracked pose validity',()=>{
 const restore=fakeDocument(),f=fixture();let view;try{view=new XRMenuView(f.model);const root=new Group();root.position.set(2,1,-1);root.rotation.y=.5;root.add(view.mesh);view.place({x:0,y:1.6,z:0},{x:0,y:0,z:0,w:1});const s=toolState();view.update('tool-wheel',s,new Matrix4(),0,true);const pose=rayPose(view,...buttonPoint(f.model,'tool:stamp'));assert(view.update('tool-wheel',s,pose,16,true)>0);assert.equal(f.model.hover,'tool:stamp');
 s.role='support';trigger(s,true);view.update('tool-wheel',s,pose,32,true);assert.equal(f.tools.active,'clay');assert.equal(f.model.hover,null);s.role='tool';s.tracked=false;view.update('tool-wheel',s,pose,48,true);s.tracked=true;view.update('tool-wheel',s,new Matrix4().makeScale(0,0,0),64,true);assert.equal(f.model.hover,null);view.update('tool-wheel',s,new Matrix4().makeTranslation(100,100,100),80,true);assert.equal(f.model.hover,null);assert.equal(f.tools.active,'clay');
 }finally{view?.dispose();f.dispose();restore();}
});
test('view caches canvas content, stays fixed during a hold, reanchors per opening and cleans up across sessions',()=>{
 const restore=fakeDocument(),f=fixture();let view;try{view=new XRMenuView(f.model);const root=new Group();root.add(view.mesh);view.start();view.place({x:0,y:1.6,z:0},{x:0,y:0,z:0,w:1});view.update('tool-wheel',undefined,undefined,0,true);const anchor=view.mesh.position.clone(),count=view.paintCount;
 for(let i=1;i<20;i++)view.update('tool-wheel',undefined,undefined,i*16,true);assert.equal(view.paintCount,count);view.place({x:2,y:1.6,z:0},{x:0,y:0,z:0,w:1});view.update('tool-wheel',undefined,undefined,330,true);assert.deepEqual(view.mesh.position,anchor);view.update(null,undefined,undefined,340,true);view.update('layers',undefined,undefined,350,true);assert.equal(view.mesh.position.x,2);assert.equal(root.children.length,1);
 view.update('layers',undefined,undefined,360,false);assert.equal(view.mesh.visible,false);assert.equal(f.model.request,null);for(let i=0;i<3;i++){view.stop();assert.equal(view.mesh.parent,null);root.add(view.mesh);view.start();assert.equal(view.mesh.visible,false);assert.equal(root.children.length,1);}view.dispose();assert.equal(view.mesh.parent,null);
 }finally{view?.dispose();f.dispose();restore();}
});
function source(hand){return {handedness:hand,profiles:['meta-quest-touch-plus'],targetRayMode:'tracked-pointer',gripSpace:{},gamepad:{mapping:'xr-standard',axes:[0,0,0,0],buttons:Array.from({length:6},()=>({value:0,pressed:false,touched:false}))}};}
class Session extends EventTarget{visibilityState='visible';}
function bridgeFixture(hand){const f=fixture(),restore=fakeDocument(),view=new XRMenuView(f.model),rays=[new Group(),new Group()],grips=[new Group(),new Group()],root=new Group(),workspace=new Group(),roles=new XRControllerRoles();roles.setDominant(hand);workspace.add(f.layers.group);root.add(view.mesh);view.place({x:0,y:1.6,z:0},{x:0,y:0,z:0,w:1});
 const bridge=new XRControllers({getController:i=>rays[i],getControllerGrip:i=>grips[i]},root,roles,undefined,()=>{},{workspace,layers:()=>f.layers,toolMode:()=>f.tools.active,menus:view,shortcuts:{interactiveMenus:true,commands:projectHistoryShortcuts(()=>f.layers)}}),support=source(hand==='left'?'right':'left'),tool=source(hand),session=new Session();bridge.start(session);rays[0].dispatchEvent({type:'connected',data:tool});rays[1].dispatchEvent({type:'connected',data:support});let time=0;
 const update=()=>bridge.update(time+=16),press=(s,index,down)=>{Object.assign(s.gamepad.buttons[index],{value:down?1:0,pressed:down});update();},stick=(x=0,y=0)=>{support.gamepad.axes=[0,0,x,y];update();},point=id=>{const p=rayPose(view,...buttonPoint(f.model,id));p.decompose(rays[0].position,rays[0].quaternion,rays[0].scale);update();};update();
 return {...f,view,bridge,rays,grips,tool,support,session,update,press,stick,point,dispose(){bridge.dispose();view.dispose();f.dispose();restore();}};
}
for(const hand of ['left','right'])test(`interactive menus select shared tools/layers with ${hand} dominance; old shortcuts and grips remain exclusive`,()=>{
 const h=bridgeFixture(hand);try{h.stick(0,-1);assert.equal(h.model.request,'tool-wheel');assert(h.bridge.slots[0].rayVisual.visible);h.point('tool:transform');h.press(h.tool,0,true);assert.equal(h.tools.active,'transform');assert.equal(h.model.page,'tool-options');assert.equal(h.layers.transforming,false);assert.equal(h.layers.undoCount,0);h.update();assert.equal(h.layers.undoCount,0);h.press(h.tool,0,false);h.point('inc:layer-0');h.press(h.tool,0,true);assert.equal(h.layers.active.layer.transform.position[0],.1);assert.equal(h.layers.undoCount,1);h.press(h.tool,0,false);h.stick();assert.equal(h.view.active,false);
 h.stick(-1,0);assert.equal(h.layers.undoCount,0);h.stick();h.stick(1,0);assert.equal(h.layers.undoCount,1);h.stick();
 h.press(h.tool,1,true);assert(h.bridge.layerGrab.active);h.grips[0].position.z=.2;h.update();h.press(h.support,1,true);assert.equal(h.bridge.grab.state,'two-hand-grab');assert.equal(h.bridge.layerGrab.active,false);h.stick(0,1);assert.equal(h.view.active,false);h.press(h.tool,1,false);assert.equal(h.bridge.grab.state,'workspace-grab');h.press(h.support,1,false);h.stick();
 h.stick(0,1);h.point(`locked:${h.layers.project.activeLayerId}`);h.press(h.tool,0,true);assert(h.layers.active.layer.locked);h.press(h.tool,0,false);h.point(`visible:${h.layers.project.activeLayerId}`);h.press(h.tool,0,true);assert.equal(h.layers.active.layer.visible,false);h.press(h.tool,0,false);h.stick();assert.equal(h.view.active,false);
 }finally{h.dispose();}
});
test('Tool grip is inert in Clay, Smooth and Stamp; both grips still navigate; external mode changes cancel/rearm',()=>{
 const h=bridgeFixture('right');try{h.grips[0].position.x=-.2;h.grips[1].position.x=.2;
 for(const mode of ['clay','smooth','stamp']){h.tools.select(mode);h.update();h.press(h.tool,1,true);assert.equal(h.bridge.layerGrab.active,false);assert.equal(h.layers.transforming,false);h.press(h.support,1,true);assert.equal(h.bridge.grab.state,'two-hand-grab');h.press(h.support,1,false);assert.equal(h.bridge.grab.active,false);assert.equal(h.bridge.layerGrab.active,false);h.press(h.tool,1,false);}
 h.tools.select('transform');h.update();h.press(h.tool,1,true);h.grips[0].position.x=.4;h.update();assert(h.layers.transforming);assert.equal(h.layers.undoCount,0);h.input.mode='sculpt';h.update();assert.equal(h.bridge.layerGrab.active,false);assert.equal(h.layers.transforming,false);assert.deepEqual(h.layers.active.layer.transform.position,[0,0,0]);assert.equal(h.layers.undoCount,0);h.input.mode='translate';h.update();assert.equal(h.bridge.layerGrab.active,false);h.press(h.tool,1,false);h.press(h.tool,1,true);assert(h.bridge.layerGrab.active);
 }finally{h.dispose();}
});
test('menus dismiss on grabs, role swap, blur, lost input, reset and session end; preheld triggers never leak',()=>{
 const h=bridgeFixture('right');try{h.press(h.tool,0,true);h.stick(0,-1);assert.equal(h.view.active,false);h.press(h.tool,0,false);h.stick(0,-1);assert.equal(h.view.active,false);h.stick();h.stick(0,-1);assert(h.view.active);
 h.press(h.support,1,true);assert.equal(h.view.active,false);assert.equal(h.bridge.grab.state,'idle');h.press(h.support,1,false);h.press(h.support,1,true);assert.equal(h.bridge.grab.state,'workspace-grab');h.press(h.support,1,false);h.stick();h.stick(0,-1);h.bridge.setDominant('left');assert.equal(h.view.active,false);assert.equal(h.model.hover,null);h.bridge.setDominant('right');h.stick();h.stick(0,1);assert(h.view.active);h.session.visibilityState='visible-blurred';h.session.dispatchEvent(new Event('visibilitychange'));assert.equal(h.view.active,false);h.session.visibilityState='visible';h.update();assert.equal(h.view.active,false);h.stick();h.stick(0,-1);h.rays[0].visible=false;h.update();assert.equal(h.model.hover,null);h.rays[0].dispatchEvent({type:'disconnected'});assert.equal(h.view.active,false);h.stick();h.stick(0,1);h.bridge.resetWorkspaceView();assert.equal(h.view.active,false);h.stick();h.stick(0,-1);h.session.dispatchEvent(new Event('end'));assert.equal(h.view.active,false);assert.equal(h.bridge.input.states[0].connected,false);
 }finally{h.dispose();}
});
test('interactive menu support keeps the four-direction neutral latch and only permits Tool trigger while held',()=>{
 const roles=new XRControllerRoles(),support={...toolState(),connectionId:1,role:'support',stick:{available:true,x:0,y:0}},tool=toolState(),r=new XRSupportShortcuts({interactiveMenus:true});const step=()=>r.step(support,[support,tool],'idle',0,true);step();support.stick.y=-1;step();assert.equal(r.menu,'tool-wheel');trigger(tool,true);step();assert.equal(r.menu,'tool-wheel');support.stick.x=-1;support.stick.y=0;step();assert.equal(r.menu,null);assert.equal(r.message,'');trigger(tool,false);step();assert.equal(r.menu,null);support.stick.x=0;step();support.stick.y=1;step();assert.equal(r.menu,'layers');trigger(support,true);step();assert.equal(r.menu,null);assert.equal(roles.roleFor('left'),'support');
});
test('numeric bounds clamp, brush settings retain the existing native save/load contract, and menu state stays session-only',()=>{
 const f=fixture();try{for(let i=0;i<40;i++)f.tools.adjust('radius',-1);assert.equal(f.settings.radius,.12);assert.equal(f.tools.options().find(o=>o.id==='radius').decrease,false);for(let i=0;i<40;i++)f.tools.adjust('strength',1);assert.equal(f.settings.strength,1);
 f.layers.project.settings={...f.settings,camera:initial.camera};const native=saveSculptProject(f.layers.project);const opened=openSculptProject(native);assert.equal(opened.settings.radius,.12);assert.equal(opened.settings.strength,1);f.model.setRequest('tool-wheel');f.model.activate('tool:stamp');f.tools.adjust('shape',1);assert.deepEqual(new Uint8Array(saveSculptProject(f.layers.project)),new Uint8Array(native));assert.equal(f.layers.undoCount,0);
 }finally{f.dispose();}
});
test('eight layer rows, paginated options and radial targets stay within the usable menu surface',()=>{
 const f=fixture();try{for(let i=1;i<8;i++)f.layers.create(64);f.model.setRequest('layers');assert.equal(f.model.content().buttons.length,24);for(const button of f.model.content().buttons){const r=button.rect;assert(r.x>=0&&r.x+r.width<=MENU_SIZE);assert(r.y>=0&&r.y+r.height<1040);assert.equal(f.model.hit(...buttonPoint(f.model,button.id)),button.id);}
 f.model.setRequest('tool-wheel');f.model.activate('tool:stamp');for(let page=0;page<2;page++){for(const b of f.model.content().buttons){const r=b.rect;assert(r.x+r.width<=MENU_SIZE&&r.y+r.height<1040);}if(page===0)f.model.activate('next');}assert(f.model.content().buttons.find(b=>b.id==='next').disabled);
 }finally{f.dispose();}
});
