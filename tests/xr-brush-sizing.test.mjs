import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Matrix4,Quaternion,Vector3} from 'three';
import {BRUSH_RADIUS_LIMITS} from '../work/test-build/brush-settings.mjs';
import {XRAlternateTool} from '../work/test-build/xr-alternate-tool.mjs';
import {XRBrushSizing} from '../work/test-build/xr-brush-sizing.mjs';
import {XRBrushPreview} from '../work/test-build/xr-brush-preview.mjs';
import {XRClayStroke} from '../work/test-build/xr-clay-stroke.mjs';
import {XRControllers} from '../work/test-build/xr-controllers.mjs';
import {XRControllerRoles} from '../work/test-build/xr-controller-roles.mjs';
import {EditorToolState,toolSizingBinding} from '../work/test-build/editor-tool-state.mjs';
import {XRMenuModel} from '../work/test-build/xr-menu-model.mjs';
import {XRShortcutView} from '../work/test-build/xr-shortcut-view.mjs';
import {XRSupportShortcuts} from '../work/test-build/xr-support-shortcuts.mjs';
import {ShapePreviewModel} from '../work/test-build/shape-preview.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {saveSculptProject,openSculptProject} from '../work/test-build/project.mjs';
const initial={mode:'add',radius:.22,strength:.35,hardness:.4,camera:{position:[2,2,3],target:[0,0,0]}};
const near=(a,b,e=1e-9)=>assert(Math.abs(a-b)<=e,`${a} != ${b}`);
function fixture(){const layers=new IndependentLayers(createBaseProject(new SDFVolume(25),initial)),shape=new ShapePreviewModel(layers.project.activeLayerId);let settings={...initial},mode='sculpt',changes=0,busy=false;
 const tools=new EditorToolState({layers:()=>layers,shape,settings:()=>settings,setSettings:v=>settings=v,mode:()=>mode,selectTool:t=>{shape.setEnabled(t==='stamp',layers.project.layerStack);mode=t==='transform'?'translate':'sculpt';settings={...settings,mode:t==='smooth'?'smooth':'add'};},selectTransform:v=>mode=v,busy:()=>busy,changed:()=>changes++});
 tools.alternateTool='smooth';tools.path.placement='surface';
 const s={connectionId:2,connected:true,role:'tool',tracked:true,gripTracked:true,stick:{available:true,x:0,y:0},buttons:{grip:{pressed:false,rawValue:0},trigger:{pressed:false,justPressed:false,rawValue:0}}},sizing=new XRBrushSizing(tools);let time=0;
 const update=(x=0,y=0,dt=16,enabled=true,inStroke=false)=>{s.stick.x=x;s.stick.y=y;time+=dt;return sizing.update(s,[s],time,enabled,inStroke);};update();
 return {layers,tools,s,sizing,update,get radius(){return settings.radius;},get settings(){return settings;},get changes(){return changes;},set busy(v){busy=v;},dispose:()=>layers.dispose()};
}
test('Tool up grows, down shrinks, neutral stops; analogue magnitude is proportional in log space',()=>{
 const f=fixture();try{const before=f.radius;f.update(0,-1);assert(f.radius>before);const grown=f.radius;f.update(0,1);near(f.radius,before);for(let i=0;i<100;i++)f.update();near(f.radius,before);assert(grown-before>0);
 f.tools.setBrushRadius(.2);f.update(0,-.54,50);const half=Math.log(f.radius/.2);f.tools.setBrushRadius(.2);f.update();f.update(0,-1,50);near(Math.log(f.radius/.2),half*2);assert.match(f.sizing.feedback,/Radius/);for(let i=0;i<60;i++)f.update();assert.equal(f.sizing.feedback,'');
 }finally{f.dispose();}
});
test('vertical dead zone, horizontal/diagonal motion, analogue noise and invalid axes do not resize',()=>{
 const f=fixture();try{for(let i=0;i<300;i++)f.update(.02*Math.sin(i),.06*Math.cos(i));near(f.radius,.22);for(const [x,y]of [[1,0],[1,-.5],[.8,-.8],[0,.08]])f.update(x,y);near(f.radius,.22);f.update(0,NaN);f.update(0,-1);near(f.radius,.22);f.update();f.update(0,-1);assert(f.radius>.22);
 }finally{f.dispose();}
});
test('elapsed-time integration agrees across 30/60/90/120 Hz and clamps long pauses',()=>{
 const run=hz=>{const f=fixture();try{for(let i=0;i<hz;i++)f.update(0,-.6,1000/hz);return f.radius;}finally{f.dispose();}};const values=[30,60,90,120].map(run);values.forEach(r=>near(r,values[0],1e-12));const f=fixture();try{f.update(0,-1,5000);near(f.radius,.22*Math.exp(.9*.05));}finally{f.dispose();}
});
test('existing radius limits are exact, small brushes have fine relative increments and no neutral drift',()=>{
 const f=fixture();try{f.tools.setBrushRadius(.1201);f.update(0,-.2,1000/120);assert(f.radius>.1201&&f.radius<.121);for(let i=0;i<200;i++)f.update(0,1,50);assert.equal(f.radius,BRUSH_RADIUS_LIMITS.min);for(let i=0;i<200;i++)f.update(0,-1,50);assert.equal(f.radius,BRUSH_RADIUS_LIMITS.max);const atLimit=f.radius;assert.equal(f.update(0,-1),false);for(let i=0;i<100;i++)f.update();assert.equal(f.radius,atLimit);
 }finally{f.dispose();}
});
test('palette and thumbstick use one settings object; resizing does not reset Clay modes, strength, hardness, Steady or Straight Line',()=>{
 const f=fixture();try{f.tools.adjust('operation',1);f.tools.path.steady=75;f.tools.path.straightLine=true;const before={...f.settings};f.update(0,-1);assert.equal(f.settings.mode,'subtract');assert.equal(f.settings.strength,before.strength);assert.equal(f.settings.hardness,before.hardness);assert.equal(f.tools.path.steady,75);assert(f.tools.path.straightLine);assert.equal(f.tools.options().find(o=>o.id==='radius').value,f.radius.toFixed(3));assert.equal(f.changes,1,'analogue writes do not rebuild all desktop panels');
 const radius=f.radius;f.tools.adjust('radius',1);near(f.radius,radius+.02,1e-6);const palette=f.radius;f.update(0,-1);near(f.radius,palette*Math.exp(.9*.016));f.layers.project.settings={...f.settings,camera:initial.camera};assert.equal(openSculptProject(saveSculptProject(f.layers.project)).settings.radius,f.radius);
 f.tools.select('smooth');f.update();f.update(0,-1);assert(f.radius>palette);assert.equal(f.settings.mode,'smooth');assert.equal(f.tools.path.steady,75);assert(f.tools.path.straightLine);assert.equal(toolSizingBinding('stamp'),'shape-scale');f.tools.select('stamp');const shape=f.tools.port.shape.definition;const saved=f.radius;f.update();f.update(0,-1);assert.equal(f.radius,saved);assert(f.tools.port.shape.definition.transform.scale[0]>shape.transform.scale[0]);assert.deepEqual(f.tools.port.shape.definition.dimensions,shape.dimensions);
 }finally{f.dispose();}
});
test('menus, busy edits, held triggers/grips and role/identity loss disarm sizing until neutral',()=>{
 for(const reason of ['menu','stroke','busy','grip','trigger','role','identity','tracking','axes','disabled']){const f=fixture();try{if(reason==='busy')f.busy=true;if(reason==='grip')f.s.buttons.grip.rawValue=1;if(reason==='trigger')f.s.buttons.trigger.pressed=true;if(reason==='role')f.s.role='support';if(reason==='identity')f.s.connectionId++;if(reason==='tracking')f.s.tracked=false;if(reason==='axes')f.s.stick.available=false;
 f.update(0,-1,16,!['menu','disabled'].includes(reason),reason==='stroke');near(f.radius,.22);f.busy=false;f.s.buttons.grip.rawValue=0;f.s.buttons.trigger.pressed=false;f.s.role='tool';f.s.tracked=true;f.s.stick.available=true;f.update(0,-1);near(f.radius,.22);f.update();f.update(0,-1);assert(f.radius>.22);
 }finally{f.dispose();}}
});
test('sizing alone preserves voxels, chunk geometry, source transforms and history',()=>{
 const f=fixture();try{const native=new Uint8Array(saveSculptProject(f.layers.project)),geometry=f.layers.active.surface.group.children.map(m=>m.geometry);for(let i=0;i<40;i++)f.update(0,-.5);assert.equal(f.layers.undoCount,0);assert.equal(f.layers.redoCount,0);assert.deepEqual(new Uint8Array(saveSculptProject(f.layers.project)),native);assert.deepEqual(f.layers.active.surface.group.children.map(m=>m.geometry),geometry);assert.equal(f.layers.active.mesher.rebuildChunks(),null);
 }finally{f.dispose();}
});
test('brush preview applies the kernel radius through nested workspace/layer and tracking transforms, reusing geometry',()=>{
 const f=fixture(),root=new Group(),workspace=new Group(),preview=new XRBrushPreview(root);try{workspace.add(f.layers.group);workspace.position.set(.2,.3,-.1);workspace.rotation.set(.2,-.3,.1);workspace.scale.setScalar(.4);root.position.set(-1,.5,.2);root.rotation.y=.3;f.layers.setActiveTransform({position:[.3,-.2,.1],rotation:[.1,.4,-.2],scale:[1.7,1.7,1.7]});const surface=f.layers.active.surface.group,local=new Vector3(.1,.2,.7),radius=.22/1.7,geo=preview.mesh.geometry;preview.show(surface,local,radius);surface.updateWorldMatrix(true,false);const center=local.clone().applyMatrix4(surface.matrixWorld),shown=new Vector3().setFromMatrixPosition(preview.group.matrixWorld);near(center.distanceTo(shown),0);const edge=new Vector3(1,0,0).applyMatrix4(preview.mesh.matrixWorld);near(edge.distanceTo(center),.22*.4);for(let i=0;i<40;i++)preview.show(surface,local,radius+i*.001);assert.equal(preview.mesh.geometry,geo);assert.equal(preview.group.parent,root);assert(!f.layers.group.children.includes(preview.group));preview.hide();assert.equal(preview.group.visible,false);
 }finally{preview.dispose();f.dispose();}
});
test('hover preview updates immediately; active Clay accepts live settings while replay retains recorded radii',()=>{
 const f=fixture(),root=new Group(),stroke=new XRClayStroke(()=>f.layers,f.tools,root),pose=new Matrix4().makeTranslation(0,0,1.5);try{stroke.update(f.s,pose,0,true);near(stroke.cursor.localRadius,.22);f.tools.setBrushRadius(.3);stroke.update(f.s,pose,16,true);near(stroke.cursor.localRadius,.3);f.tools.path.steady=75;f.s.buttons.trigger={pressed:true,justPressed:true,rawValue:1};stroke.update(f.s,pose,32,true);assert(stroke.active);const frozen=stroke.session.localRadius;assert.equal(f.tools.setBrushRadius(.4),false);f.update(0,-1,16,true,true);near(f.radius,.3);f.tools.port.setSettings({...f.settings,radius:.45});f.s.buttons.trigger.justPressed=false;stroke.update(f.s,pose,48,true);near(stroke.cursor.localRadius,.45);assert.equal(stroke.session.raw[0].radius,frozen);f.s.buttons.trigger.pressed=false;f.s.buttons.trigger.rawValue=0;stroke.update(f.s,pose,64,true);let time=80;while(stroke.active&&time<2000){stroke.update(f.s,pose,time,true);time+=16;}assert.equal(stroke.active,false);assert.equal(f.layers.undoCount,1);stroke.update(f.s,pose,time,true);near(stroke.cursor.localRadius,.45);const edited=f.layers.active.volume.getDenseView().slice();f.layers.undo();f.layers.undo(true);assert.deepEqual(f.layers.active.volume.getDenseView(),edited);
 }finally{stroke.dispose();f.dispose();}
});
test('Smooth uses the existing engine with a frozen radius and one undo action, ignoring retained Clay path controls',()=>{
 const f=fixture(),reference=new IndependentLayers(createBaseProject(new SDFVolume(25),initial)),root=new Group(),stroke=new XRClayStroke(()=>f.layers,f.tools,root),pose=new Matrix4().makeTranslation(0,0,1.5);try{f.tools.path.steady=100;f.tools.path.straightLine=true;f.tools.select('smooth');stroke.update(f.s,pose,0,true);f.s.buttons.trigger={pressed:true,justPressed:true,rawValue:1};stroke.update(f.s,pose,16,true);assert(stroke.active);assert.equal(stroke.session.buffered,false);assert.equal(stroke.feedback,'Smooth: freehand');assert.equal(f.tools.setBrushRadius(.4),false);f.s.buttons.trigger.justPressed=false;stroke.update(f.s,pose,32,true);const samples=stroke.session.raw.map(p=>({...p}));reference.beginStroke();let previous=0;for(const p of samples){reference.applyStrokeLocal(p,.22,'smooth',.35,p.t-previous,.4);previous=p.t;}reference.finishStroke();f.s.buttons.trigger={pressed:false,justPressed:false,rawValue:0};stroke.update(f.s,pose,48,true);for(let i=0;stroke.active&&i<4096;i++)stroke.update(f.s,pose,64+i*16,true);assert(!stroke.active);assert.equal(f.layers.undoCount,1);assert.deepEqual(f.layers.active.volume.getDenseView(),reference.active.volume.getDenseView());assert.equal(f.tools.path.steady,100);assert(f.tools.path.straightLine);const after=f.layers.active.volume.getDenseView().slice();f.layers.undo();f.layers.undo(true);assert.deepEqual(f.layers.active.volume.getDenseView(),after);
 }finally{stroke.dispose();reference.dispose();f.dispose();}
});
function source(hand){return {handedness:hand,profiles:['meta-quest-touch-plus'],targetRayMode:'tracked-pointer',gripSpace:{},gamepad:{mapping:'xr-standard',axes:[0,0,0,0],buttons:Array.from({length:6},()=>({value:0,pressed:false,touched:false}))}};}
for(const dominant of ['left','right'])test(`bridge routes only the ${dominant} Tool stick; support shortcuts/menu/grip arbitration stays intact`,()=>{
 const f=fixture(),roles=new XRControllerRoles();roles.setDominant(dominant);const rays=[new Group(),new Group()],grips=[new Group(),new Group()],workspace=new Group(),root=new Group();workspace.add(f.layers.group);const stroke=new XRClayStroke(()=>f.layers,f.tools,root),sizing=new XRBrushSizing(f.tools),menus={active:false,update(request){this.active=!!request;return null;},close(){this.active=false;}},bridge=new XRControllers({getController:i=>rays[i],getControllerGrip:i=>grips[i]},root,roles,undefined,()=>{},{workspace,layers:()=>f.layers,toolMode:()=>f.tools.active,stroke,sizing,menus,shortcuts:{interactiveMenus:true}}),tool=source(dominant),support=source(dominant==='left'?'right':'left'),session=new EventTarget();session.visibilityState='visible';bridge.start(session);rays[1].position.z=1.5;rays[1].dispatchEvent({type:'connected',data:tool});rays[0].dispatchEvent({type:'connected',data:support});let t=0;const update=()=>bridge.update(t+=16),axis=(s,x,y)=>{s.gamepad.axes=[0,0,x,y];update();};
 try{update();axis(tool,0,-1);assert(f.radius>.22);near(stroke.cursor.localRadius,f.radius);const sized=f.radius;axis(tool,0,0);axis(support,0,-1);assert(menus.active);axis(tool,0,-1);near(f.radius,sized);axis(support,0,0);update();near(f.radius,sized);axis(tool,0,0);axis(tool,0,-1);assert(f.radius>sized);axis(tool,0,0);Object.assign(support.gamepad.buttons[1],{value:1,pressed:true});update();axis(tool,0,-1);assert.equal(bridge.grab.state,'workspace-grab');const locked=f.radius;Object.assign(support.gamepad.buttons[1],{value:0,pressed:false});update();near(f.radius,locked);axis(tool,0,0);axis(tool,0,-1);assert(f.radius>locked);axis(support,0,-1);bridge.setDominant(dominant==='left'?'right':'left');update();const swapped=f.radius;axis(support,0,-1);near(f.radius,swapped);axis(support,0,0);axis(support,0,-1);assert(f.radius>swapped);session.dispatchEvent(new Event('end'));assert.equal(sizing.feedback,'');assert.equal(stroke.cursor.group.visible,false);assert.equal(f.layers.undoCount,0);
 }finally{bridge.dispose();stroke.dispose();f.dispose();}
});
test('Support left/right undo/redo semantic mapping is unchanged by Tool sizing',()=>{
 const f=fixture(),support={...f.s,connectionId:1,role:'support',stick:{available:true,x:0,y:0}},calls=[],shortcuts=new XRSupportShortcuts({commands:{undo:()=>{calls.push('undo');return {ok:true,message:'Undone'};},redo:()=>{calls.push('redo');return {ok:true,message:'Redone'};}}});try{const update=()=>shortcuts.step(support,[support,f.s],'idle',0,true);update();f.update(0,-1);support.stick.x=-1;update();update();support.stick.x=0;update();support.stick.x=1;update();assert.deepEqual(calls,['undo','redo']);}finally{f.dispose();}
});

test('temporary radius readout works without diagnostic panels, then disappears at idle',()=>{
 const original=globalThis.document,draws=[];globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},fillText(t){draws.push(t);}})})};const f=fixture(),shortcuts=new XRSupportShortcuts();let view;
 try{view=new XRShortcutView();view.place({x:0,y:1.6,z:0},{x:0,y:0,z:0,w:1});f.update(0,-1);view.paint(shortcuts,32,true,false,f.sizing.feedback);assert(view.mesh.visible);assert(draws.some(t=>t.startsWith('Radius ')));for(let i=0;i<60;i++)f.update();view.paint(shortcuts,1200,true,false,f.sizing.feedback);assert.equal(view.mesh.visible,false);}finally{view?.dispose();f.dispose();globalThis.document=original;}
});

test('alternate sizing exemption only bypasses tracked Support trigger; other reservations rearm at neutral',()=>{
 const f=fixture(),support={...f.s,role:'support',connectionId:3,buttons:{grip:{pressed:false,rawValue:0},trigger:{pressed:true,rawValue:1}}};let time=0;
 const step=(alternate=true,enabled=true,busy=false)=>f.sizing.update(f.s,[f.s,support],time+=16,enabled,busy,alternate);
 try{step(false);f.s.stick.y=-1;step(false);near(f.radius,.22);step();near(f.radius,.22);f.s.stick.y=0;step();f.s.stick.y=-1;step();assert(f.radius>.22);
 for(const guard of ['tool-trigger','support-grip','tool-grip','menu','stroke','tracking']){const before=f.radius;
 if(guard==='tool-trigger')f.s.buttons.trigger.rawValue=.5;
 if(guard==='support-grip')support.buttons.grip.rawValue=.5;
 if(guard==='tool-grip')f.s.buttons.grip.rawValue=.5;
 if(guard==='tracking')support.tracked=false;
 step(true,guard!=='menu',guard==='stroke');near(f.radius,before);
 f.s.buttons.trigger.rawValue=f.s.buttons.grip.rawValue=support.buttons.grip.rawValue=0;support.tracked=true;
 step();near(f.radius,before);f.s.stick.y=0;step();f.s.stick.y=-1;step();assert(f.radius>before);
 }
 }finally{f.dispose();}
});
for(const dominant of ['left','right'])test(`alternate ${dominant} Tool stick sizes temporary brush and restores primary size without edits`,()=>{
 const f=fixture(),roles=new XRControllerRoles();roles.setDominant(dominant);f.tools.adjust('operation',1);f.tools.path.steady=75;f.tools.path.straightLine=true;const before={...f.settings},native=new Uint8Array(saveSculptProject(f.layers.project)),alternate=new XRAlternateTool(f.tools),rays=[new Group(),new Group()],grips=[new Group(),new Group()],root=new Group();const bridge=new XRControllers({getController:i=>rays[i],getControllerGrip:i=>grips[i]},root,roles,undefined,()=>{},{alternate,sizing:f.sizing,toolMode:()=>f.tools.active,layers:()=>f.layers,workspace:new Group()}),tool=source(dominant),support=source(roles.support),session=new EventTarget();session.visibilityState='visible';let time=0;const update=()=>bridge.update(time+=16),axis=y=>{tool.gamepad.axes[3]=y;update();};
 try{bridge.start(session);rays[1].dispatchEvent({type:'connected',data:tool});rays[0].dispatchEvent({type:'connected',data:support});update();
 // A stick already deflected on tool change cannot leak into the alternate.
 axis(-1);Object.assign(support.gamepad.buttons[0],{pressed:true,value:1});const primaryRadius=f.radius;update();assert(alternate.active);near(f.radius,primaryRadius);update();near(f.radius,primaryRadius);
 axis(0);axis(-1);assert(f.radius>primaryRadius);assert.match(f.sizing.feedback,/Radius/);axis(1);near(f.radius,primaryRadius);axis(-1);const temporary=f.radius;
 Object.assign(tool.gamepad.buttons[0],{pressed:true,value:1});update();axis(-1);near(f.radius,temporary);Object.assign(tool.gamepad.buttons[0],{pressed:false,value:0});update();near(f.radius,temporary);axis(0);axis(-1);assert(f.radius>temporary);
 Object.assign(support.gamepad.buttons[0],{pressed:false,value:0});update();assert(!alternate.active);near(f.radius,primaryRadius);assert.equal(f.settings.mode,'subtract');assert.equal(f.settings.strength,before.strength);assert.equal(f.settings.hardness,before.hardness);assert.equal(f.tools.path.steady,75);assert(f.tools.path.straightLine);update();near(f.radius,primaryRadius);axis(0);axis(-1);assert(f.radius>primaryRadius);
 assert.equal(f.layers.undoCount,0);assert.deepEqual(new Uint8Array(saveSculptProject(f.layers.project)),native);
 }finally{bridge.dispose();f.dispose();}
});
