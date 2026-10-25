import test from 'node:test';
import assert from 'node:assert/strict';
import {Group} from 'three';
import {FourDirectionStick} from '../work/test-build/xr-stick-directions.mjs';
import {XRSupportShortcuts,SUPPORT_STICK_BINDINGS} from '../work/test-build/xr-support-shortcuts.mjs';
import {projectHistoryShortcuts} from '../work/test-build/xr-history-shortcuts.mjs';
import {XRShortcutView} from '../work/test-build/xr-shortcut-view.mjs';
import {XRDiagnostics} from '../work/test-build/xr-diagnostics.mjs';
import {XRControllers} from '../work/test-build/xr-controllers.mjs';
import {XRControllerRoles} from '../work/test-build/xr-controller-roles.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {defineShape} from '../work/test-build/shapes.mjs';
import {saveSculptProject} from '../work/test-build/project.mjs';
const axes={left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]};
const settings={mode:'add',radius:.3,strength:.5,hardness:.6,camera:{position:[2,2,3],target:[0,0,0]}};
const create=()=>new IndependentLayers(createBaseProject(new SDFVolume(25),settings));
const state=()=>({connectionId:1,connected:true,role:'support',tracked:true,gripTracked:true,stick:{available:true,x:0,y:0},buttons:{grip:{pressed:false,rawValue:0},trigger:{pressed:false,rawValue:0}}});
function router(commands){const s=state(),requests=[],r=new XRSupportShortcuts({commands,requestMenu:menu=>requests.push(menu)});let time=0;const step=(x=0,y=0,interaction='idle',active=true,menuBusy=false)=>{s.stick.x=x;s.stick.y=y;r.step(s,[s],interaction,time+=16,active,menuBusy);};step();return {r,s,requests,step};}
for(const direction of Object.keys(axes))test(`recognises ${direction} with WebXR axis signs; holds never repeat`,()=>{
 const r=new FourDirectionStick();assert.equal(r.update(...axes[direction]),null,'initial held stick is unarmed');r.update(0,0);assert.equal(r.update(...axes[direction]),direction);
 for(let i=0;i<100;i++)assert.equal(r.update(...axes[direction]),null);
 r.update(0,0);assert.equal(r.update(...axes[direction]),direction);
});
test('configurable neutral/press/release hysteresis and invalid thresholds',()=>{
 const r=new FourDirectionStick({neutral:.1,press:.7,release:.4,dominance:2});r.update(0,0);assert.equal(r.update(.69,0),null);assert.equal(r.update(.71,0),'right');r.update(.41,0);assert.equal(r.held,'right');r.update(.39,0);assert.equal(r.held,null);assert.equal(r.update(1,0),null);r.update(.11,0);assert.equal(r.update(1,0),null);r.update(.09,0);assert.equal(r.update(1,0),'right');
 for(const options of [{neutral:.7},{press:.1},{release:1},{dominance:1},{neutral:NaN}])assert.throws(()=>new FourDirectionStick(options));
});
test('diagonal excursions cannot slide into commands; centre required',()=>{
 for(const [x,y]of [[.8,.8],[-1,1],[-.7,-.7],[.6,.6]]){const r=new FourDirectionStick();r.update(0,0);assert.equal(r.update(x,y),null);assert.equal(r.update(-1,0),null);assert.equal(r.update(0,-1),null);r.update(0,0);assert.equal(r.update(-1,.1),'left');}
});
test('analogue noise, nonfinite samples and disabled input never generate repeats',()=>{
 const r=new FourDirectionStick();for(let i=0;i<500;i++)assert.equal(r.update(.06*Math.sin(i),.07*Math.cos(i)),null);
 assert.equal(r.update(-.8,.1),'left');for(let i=0;i<500;i++)assert.equal(r.update(-.65+.1*Math.sin(i),.1*Math.cos(i)),null);
 r.update(NaN,0);assert.equal(r.held,null);assert.equal(r.update(-1,0),null);r.update(0,0);assert.equal(r.update(0,-1),'up');r.update(0,0,false);assert.equal(r.update(0,-1),null);
});
test('menu request is exclusive, held with hysteresis, closed on neutral, and never fires horizontal actions',()=>{
 let commands=0;const {r,step,requests}=router({undo:()=>{commands++;return {ok:true,message:'Undone'};}});
 step(0,-1);assert.equal(r.menu,'tool-wheel');for(let i=0;i<30;i++)step(0,-.5);assert.deepEqual(requests,['tool-wheel']);step(0,1);assert.equal(r.menu,null);assert.equal(commands,0);step(1,0);assert.equal(r.menu,null);step();step(0,1);assert.equal(r.menu,'layers');step();assert.equal(r.menu,null);assert.deepEqual(requests,['tool-wheel',null,'layers',null]);
});
test('all grab/sculpt/external menu states suppress shortcuts and require neutral afterwards',()=>{
 for(const interaction of ['workspace-grab','layer-grab','two-hand-grab','sculpting']){let calls=0;const {r,step}=router({undo:()=>{calls++;return {ok:true,message:'Undone'};}});step(-1,0,interaction);step(-1,0);assert.equal(calls,0);step();step(-1,0);assert.equal(calls,1);step();step(0,-1);assert(r.menu);step(0,-1,interaction);assert.equal(r.menu,null);step(0,-1);assert.equal(r.menu,null);}
 const {r,step}=router();step(0,-1,'idle',true,true);assert.equal(r.menu,null);step(0,-1);assert.equal(r.menu,null);step();step(0,-1);assert(r.menu);
});
test('pressed or physically held/rejected grips and triggers reserve input; tool stick has no role',()=>{
 for(const button of ['grip','trigger']){const {r,s,step}=router();s.buttons[button].rawValue=1;step(0,-1);assert.equal(r.menu,null);s.buttons[button].rawValue=0;step(0,-1);assert.equal(r.menu,null);step();step(0,-1);assert(r.menu);s.buttons[button].pressed=true;step(0,-1);assert.equal(r.menu,null);}
 const {r,s,step}=router();s.role='tool';step();step(0,-1);assert.equal(r.menu,null);
});
test('identity changes, loss, disconnected axes, handedness reset, exit and reconnect require fresh neutral',()=>{
 for(const reason of ['id','tracking','gripTracking','disconnect','axes','exit','reset']){const {r,s,step,requests}=router();step(0,-1);assert(r.menu);
  if(reason==='id')s.connectionId++;if(reason==='tracking')s.tracked=false;if(reason==='gripTracking')s.gripTracked=false;if(reason==='disconnect')s.connected=false;if(reason==='axes')s.stick.available=false;if(reason==='reset')r.reset();step(0,-1,'idle',reason!=='exit');assert.equal(r.menu,null);assert.equal(requests.at(-1),null);
  Object.assign(s,{connected:true,tracked:true,gripTracked:true});s.stick.available=true;step(0,-1);assert.equal(r.menu,null);step();step(0,1);assert.equal(r.menu,'layers');
 }
});
test('declarative bindings dispatch registered commands and future contextual menu requests',()=>{
 let alternate=0;const menus=[],s=state(),r=new XRSupportShortcuts({bindings:{...SUPPORT_STICK_BINDINGS,left:{kind:'command',action:'alternate-tool'},up:{kind:'menu',menu:'tool-options'}},commands:{'alternate-tool':()=>{alternate++;return {ok:true,message:'Alternate tool'};}},requestMenu:menu=>menus.push(menu)});
 r.step(s,[s],'idle',0);s.stick.x=-1;r.step(s,[s],'idle',16);assert.equal(alternate,1);assert.equal(r.message,'Alternate tool');s.stick.x=0;r.step(s,[s],'idle',32);s.stick.y=-1;r.step(s,[s],'idle',48);assert.equal(r.menu,'tool-options');r.reset();assert.deepEqual(menus,['tool-options',null]);
});
test('shared project history replays strokes, stamps, transforms and operations in order',()=>{
 const c=create();try{
  const snapshots=[c.active.volume.getDenseView().slice()];c.beginStroke();for(let i=0;i<10;i++)c.applyStroke({x:0,y:0,z:.75},.35,'subtract',.6,1/60,.5);c.finishStroke();assert.equal(c.undoCount,1);snapshots.push(c.active.volume.getDenseView().slice());
  c.stampShape(defineShape({kind:'box',operation:'subtract',targetLayerId:c.project.activeLayerId,dimensions:[.55,.55,.55],transform:{position:[.4,0,.65],rotation:[.1,.2,0],scale:[1,1,1]}}));assert.equal(c.undoCount,2);snapshots.push(c.active.volume.getDenseView().slice());
  c.setActiveTransform({position:[.4,.1,0],rotation:[0,.2,0],scale:[1,1,1]});c.setOperation(c.project.activeLayerId,'difference');assert.equal(c.undoCount,4);
  let changed=0;const {r,step}=router(projectHistoryShortcuts(()=>c,()=>changed++));
  for(let i=0;i<4;i++){step(-1,0);for(let n=0;n<20;n++)step(-1,0);assert.equal(c.undoCount,3-i);step();}
  assert.deepEqual(c.active.volume.getDenseView(),snapshots[0]);assert.deepEqual(c.active.layer.transform.position,[0,0,0]);assert.equal(c.redoCount,4);assert.equal(changed,4);
  step(-1,0);assert.equal(r.message,'Nothing to undo');assert.equal(r.successful,false);step();
  for(let i=0;i<4;i++){step(1,0);assert.equal(c.undoCount,i+1);step();}
  assert.deepEqual(c.active.volume.getDenseView(),snapshots[2]);assert.deepEqual(c.active.layer.transform.position,[.4,.1,0]);assert.equal(c.active.layer.operation,'difference');assert.equal(changed,8);step(1,0);assert.equal(r.message,'Nothing to redo');
 }finally{c.dispose();}
});
test('history errors, lock guards and in-progress edits leave timeline intact',()=>{
 const c=create();try{const commands=projectHistoryShortcuts(()=>c);c.setActiveTransform({position:[.2,0,0],rotation:[0,0,0],scale:[1,1,1]});c.setFlag(c.project.activeLayerId,'locked',true);assert.equal(commands.undo().ok,false);assert.equal(c.undoCount,1);c.setFlag(c.project.activeLayerId,'locked',false);
 c.beginTransform();assert.equal(commands.undo().ok,false);assert(c.transforming);c.cancelTransform();c.beginStroke();assert.equal(commands.undo().ok,false);assert(c.drawing);c.finishStroke();assert(commands.undo().ok);assert.equal(c.redoCount,1);
 const {r,step}=router({undo:()=>{throw Error('busy');}});step(-1,0);assert.equal(r.successful,false);assert.match(r.message,/unavailable/);
 }finally{c.dispose();}
});
function source(hand){return {handedness:hand,profiles:['meta-quest-touch-plus'],targetRayMode:'tracked-pointer',gripSpace:{},gamepad:{mapping:'xr-standard',axes:[0,0,0,0],buttons:Array.from({length:6},()=>({value:0,pressed:false,touched:false}))}};}
class Session extends EventTarget{visibilityState='visible';}
function bridgeHarness(hand='right'){
 const c=create(),roles=new XRControllerRoles();roles.setDominant(hand);const rays=[new Group(),new Group()],grips=[new Group(),new Group()],workspace=new Group();workspace.add(c.group);const requests=[];
 const bridge=new XRControllers({getController:i=>rays[i],getControllerGrip:i=>grips[i]},new Group(),roles,undefined,()=>{},{toolMode:()=> 'transform',workspace,layers:()=>c,shortcuts:{commands:projectHistoryShortcuts(()=>c),requestMenu:menu=>requests.push(menu)}});
 const tool=source(hand),support=source(hand==='left'?'right':'left'),session=new Session();bridge.start(session);rays[0].dispatchEvent({type:'connected',data:tool});rays[1].dispatchEvent({type:'connected',data:support});let t=0;const update=()=>bridge.update(t+=16);const stick=(x=0,y=0)=>{support.gamepad.axes=[0,0,x,y];update();};const grip=(s,down)=>{Object.assign(s.gamepad.buttons[1],{value:down?1:0,pressed:down});update();};update();return {c,bridge,rays,grips,workspace,tool,support,session,requests,update,stick,grip,dispose:()=>{bridge.dispose();c.dispose();}};
}
for(const hand of ['left','right'])test(`bridge maps ${hand} dominance by role and preserves grip precedence/history invariants`,()=>{
 const h=bridgeHarness(hand),{c,bridge,tool,support,grips,workspace,stick,grip,update}=h;try{
  c.setActiveTransform({position:[.2,0,0],rotation:[0,0,0],scale:[1,1,1]});tool.gamepad.axes[2]=-1;update();assert.equal(c.undoCount,1);stick(-1,0);assert.equal(c.undoCount,0);for(let i=0;i<30;i++)update();assert.equal(c.redoCount,1);stick();stick(1,0);assert.equal(c.undoCount,1);stick();
  const native=new Uint8Array(saveSculptProject(c.project));grip(support,true);stick(-1,0);grips[1].position.x=.3;update();assert.equal(bridge.grab.state,'workspace-grab');assert.equal(c.undoCount,1);assert.deepEqual(new Uint8Array(saveSculptProject(c.project)),native);
  grip(tool,true);assert.equal(bridge.grab.state,'two-hand-grab');grips[0].position.x=-.3;update();assert.equal(c.undoCount,1);grip(support,false);assert(bridge.layerGrab.active);assert.equal(bridge.shortcuts.menu,null);stick(0,-1);assert.equal(bridge.shortcuts.menu,null);grips[0].position.z=.1;update();grip(tool,false);assert.equal(c.undoCount,2);assert.equal(bridge.shortcuts.menu,null);assert.equal(bridge.shortcuts.message,'');stick(0,-1);assert.equal(bridge.shortcuts.menu,null);stick();stick(0,-1);assert.equal(bridge.shortcuts.menu,'tool-wheel');
  grip(support,true);assert.equal(bridge.shortcuts.menu,null);assert.equal(bridge.grab.state,'idle');grip(support,false);grip(support,true);assert.equal(bridge.grab.state,'workspace-grab');grip(support,false);assert.equal(c.undoCount,2);assert.notEqual(workspace.position.x,0);
 }finally{h.dispose();}
});
test('bridge reconnect, blur, handedness switch and repeated session cleanup close requests and disarm held sticks',()=>{
 const h=bridgeHarness(),{bridge,rays,support,session,stick,update}=h;try{
  stick(0,-1);assert.equal(bridge.shortcuts.menu,'tool-wheel');rays[1].dispatchEvent({type:'disconnected'});assert.equal(bridge.shortcuts.menu,null);rays[1].dispatchEvent({type:'connected',data:support});update();assert.equal(bridge.shortcuts.menu,null);stick();stick(0,1);assert.equal(bridge.shortcuts.menu,'layers');
  session.visibilityState='visible-blurred';session.dispatchEvent(new Event('visibilitychange'));assert.equal(bridge.shortcuts.menu,null);session.visibilityState='visible';update();assert.equal(bridge.shortcuts.menu,null);stick();stick(0,-1);assert(bridge.shortcuts.menu);bridge.setDominant('left');assert.equal(bridge.shortcuts.menu,null);update();assert.equal(bridge.input.states[0].role,'support');
  bridge.resetWorkspaceView();assert.equal(bridge.shortcuts.menu,null);for(let i=0;i<3;i++){bridge.stop();assert.equal(bridge.shortcuts.menu,null);assert.equal(bridge.shortcuts.message,'');bridge.start(session);rays[1].dispatchEvent({type:'connected',data:support});update();assert.equal(bridge.shortcuts.menu,null);}
 }finally{h.dispose();}
});
test('shortcut card is cached, independent of diagnostic hints, and removed on session cleanup',()=>{
 const original=globalThis.document,draws=[];globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},fillText(text){draws.push(text);}})})};let view;
 try{view=new XRShortcutView();const root=new Group();root.add(view.mesh);view.start();view.place({x:0,y:1.6,z:0},{x:0,y:0,z:0,w:1});const anchor=view.mesh.position.clone();const {r,step}=router();step(0,-1);view.paint(r,10);assert(view.mesh.visible);assert(draws.includes('Tool Wheel'));const count=view.paintCount;for(let i=0;i<20;i++)view.paint(r,20+i);assert.equal(view.paintCount,count);view.place({x:2,y:2,z:1},{x:0,y:0,z:0,w:1});assert.deepEqual(view.mesh.position,anchor);step();view.paint(r,100);assert.equal(view.mesh.visible,false);step(-1,0);view.paint(r,110);assert(view.mesh.visible);assert(draws.includes('Action unavailable'));view.paint(r,10000);assert.equal(view.mesh.visible,false);step();step(0,1);view.paint(r,12000,false);assert.equal(view.mesh.visible,false);view.stop();assert.equal(view.mesh.parent,null);assert.equal(view.mesh.visible,false);
 }finally{view?.dispose();globalThis.document=original;}
});
test('history replay invalidates Boolean preview and the existing scheduler refreshes export without workspace data',async()=>{
 const c=create();try{c.setActiveTransform({position:[.4,0,0],rotation:[0,.2,0],scale:[1,1,1]});c.viewMode='boolean';await c.composite.flush();const original=c.composite.exportGroup();const commands=projectHistoryShortcuts(()=>c);assert(commands.undo().ok);c.composite.syncMetadata();assert(c.composite.pending);await c.composite.flush();assert.equal(c.viewMode,'boolean');assert.equal(c.composite.pending,false);const after=c.composite.exportGroup();assert.notDeepEqual(after.children[0].geometry.attributes.position.array,original.children[0].geometry.attributes.position.array);assert.equal(c.undoCount,0);assert.equal(c.redoCount,1);for(const group of [original,after])group.traverse(o=>o.geometry?.dispose());}finally{c.dispose();}
});

test('nonfinite hardware axes disarm shortcuts instead of masquerading as neutral',()=>{
 const h=bridgeHarness();try{h.c.setActiveTransform({position:[.2,0,0],rotation:[0,0,0],scale:[1,1,1]});h.stick(-1,0);assert.equal(h.c.undoCount,0);h.stick(NaN,0);assert.equal(h.bridge.input.states[1].stick.available,false);h.stick(1,0);assert.equal(h.c.undoCount,0);assert.equal(h.c.redoCount,1);h.stick();h.stick(1,0);assert.equal(h.c.undoCount,1);}finally{h.dispose();}
});
test('a trigger press during a menu request cannot also activate a diagnostic button',()=>{
 const original=globalThis.document;globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({clearRect(){},fillRect(){},fillText(){}})})};let c,panel;
 try{panel=new XRDiagnostics();const rays=[new Group(),new Group()],grips=[new Group(),new Group()],roles=new XRControllerRoles(),support=source('left'),tool=source('right');c=new XRControllers({getController:i=>rays[i],getControllerGrip:i=>grips[i]},new Group(),roles,panel);c.start(new Session());rays[0].dispatchEvent({type:'connected',data:tool});rays[1].dispatchEvent({type:'connected',data:support});panel.group.position.z=-1;panel.group.visible=true;panel.group.updateMatrixWorld(true);rays[0].position.set(-.155,.127875,0);c.update(0);support.gamepad.axes[3]=-1;c.update(16);assert.equal(c.shortcuts.menu,'tool-wheel');Object.assign(tool.gamepad.buttons[0],{value:1,pressed:true});c.update(32);assert.equal(roles.dominant,'right');assert.equal(c.shortcuts.menu,null);c.update(48);assert.equal(roles.dominant,'right');Object.assign(tool.gamepad.buttons[0],{value:0,pressed:false});support.gamepad.axes[3]=0;c.update(64);Object.assign(tool.gamepad.buttons[0],{value:1,pressed:true});c.update(80);assert.equal(roles.dominant,'left');
 }finally{c?.dispose();globalThis.document=original;}
});
