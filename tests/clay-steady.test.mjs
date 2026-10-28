import test from 'node:test';
import assert from 'node:assert/strict';
import {Group,Matrix4,Vector3,Quaternion} from 'three';
import {filterClayPath,clayReplay,ClayPathControls} from '../work/test-build/clay-path.mjs';
import {ClayStrokeSession} from '../work/test-build/clay-stroke-session.mjs';
import {XRClayStroke} from '../work/test-build/xr-clay-stroke.mjs';
import {EditorToolState} from '../work/test-build/editor-tool-state.mjs';
import {XRControllers} from '../work/test-build/xr-controllers.mjs';
import {XRControllerRoles} from '../work/test-build/xr-controller-roles.mjs';
import {XRMenuView} from '../work/test-build/xr-menu-view.mjs';
import {XRMenuModel} from '../work/test-build/xr-menu-model.mjs';
import {ShapePreviewModel} from '../work/test-build/shape-preview.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {saveSculptProject} from '../work/test-build/project.mjs';
const settings={mode:'subtract',radius:.3,strength:.5,hardness:.4,camera:{position:[2,2,3],target:[0,0,0]}};
const curve=(hz,jitter=.018)=>Array.from({length:hz*2+1},(_,i)=>{const t=i/hz,x=-.7+.7*t;return {x,y:.24*Math.sin(Math.PI*(x+.7)/1.4)+jitter*Math.sin(2*Math.PI*9*t),z:.75,t};});
const error=path=>Math.sqrt(path.reduce((sum,p)=>sum+(p.y-.24*Math.sin(Math.PI*(p.x+.7)/1.4))**2,0)/path.length);
const create=()=>new IndependentLayers(createBaseProject(new SDFVolume(25),settings));
const near=(a,b,e=1e-8)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
function finish(s){let frames=0;while(s.phase==='committing'&&frames++<10000)s.pump(1);assert.equal(s.phase,'idle');return frames;}
test('Steady zero returns the original path by identity with no resampling, filtering or extra points',()=>{
 const raw=curve(72);assert.equal(filterClayPath(raw,0,.3),raw);assert.deepEqual(filterClayPath(raw,0,.3),raw);assert.deepEqual(filterClayPath([],0,.3),[]);
});
test('increasing Steady reduces tremor while retaining major curvature and exact endpoints',()=>{
 const raw=curve(120),low=filterClayPath(raw,35,.3),high=filterClayPath(raw,100,.3);assert(error(low)<error(raw));assert(error(high)<error(low)*.8);assert(Math.max(...high.map(p=>p.y))>.21);assert.deepEqual(high[0],raw[0]);assert.deepEqual(high.at(-1),raw.at(-1));
 for(let i=1;i<high.length;i++){assert(high[i].x>=high[i-1].x);assert(high[i].y>=Math.min(...raw.map(p=>p.y))-1e-10);assert(high[i].y<=Math.max(...raw.map(p=>p.y))+1e-10);near(high[i].z,.75);}
});
test('distance-aware smoothing is consistent across rates and time-warped motion speeds',()=>{
 const paths=[30,60,90,120].map(hz=>filterClayPath(curve(hz),100,.3));const atX=(path,x)=>{const b=path.findIndex(p=>p.x>=x);if(b<=0)return path[0].y;const a=path[b-1],p=path[b];return a.y+(p.y-a.y)*(x-a.x)/(p.x-a.x);};
 for(let x=-.5;x<=.5;x+=.05){const values=paths.map(p=>atX(p,x));assert(Math.max(...values)-Math.min(...values)<.012);}
 const raw=curve(90),warped=raw.map(p=>({...p,t:p.t*p.t})),a=filterClayPath(raw,100,.3),b=filterClayPath(warped,100,.3);assert.equal(a.length,b.length);for(let i=0;i<a.length;i++){near(a[i].x,b[i].x);near(a[i].y,b[i].y);}
});
test('straight-line priority ignores Steady while preserving endpoints and timestamps; repeated/stationary points stay finite',()=>{
 const raw=curve(60),line=filterClayPath(raw,100,.3,true);for(const p of line)near(p.y,0);assert.deepEqual(line,filterClayPath(raw,0,.3,true));assert.deepEqual(line[0],raw[0]);assert.deepEqual(line.at(-1),raw.at(-1));assert.deepEqual(line.map(p=>p.t),raw.map(p=>p.t));
 const stationary=[{x:1,y:2,z:3,t:0},{x:1,y:2,z:3,t:2}];assert.equal(filterClayPath(stationary,100,.3),stationary);const replay=clayReplay(stationary);assert.equal(replay.length,241);assert(replay.every(p=>p.x===1&&p.y===2&&p.z===3));
 assert.throws(()=>filterClayPath(raw,101,.3));assert.throws(()=>filterClayPath([{x:NaN,y:0,z:0,t:0}],0,.3));
});
test('zero Steady uses the original engine exactly; one action and exact undo/redo for all brush operations/settings',()=>{
 for(const mode of ['add','subtract']){const a=create(),b=create(),s=new ClayStrokeSession(()=>a),controls=new ClayPathControls(),raw=curve(60,0).slice(0,61),before=a.active.volume.getDenseView().slice();try{
 s.begin({...settings,mode},controls,0);b.beginStroke();let previous=0;
 for(const p of raw){s.sample(p,p.t*1000);b.applyStroke({x:p.x,y:p.y,z:p.z},settings.radius,mode,settings.strength,(p.t*1000-previous)/1000,settings.hardness);previous=p.t*1000;}
 s.end();b.finishStroke();assert.deepEqual(a.active.volume.getDenseView(),b.active.volume.getDenseView());assert.equal(a.undoCount,1);const edited=a.active.volume.getDenseView().slice();a.undo();assert.deepEqual(a.active.volume.getDenseView(),before);a.undo(true);assert.deepEqual(a.active.volume.getDenseView(),edited);
 }finally{a.dispose();b.dispose();}}
});
test('buffered preview is precisely the committed path; original SDF stays untouched during drawing and commits once',()=>{
 const a=create(),b=create(),s=new ClayStrokeSession(()=>a),controls=new ClayPathControls();controls.steady=100;try{const before=a.active.volume.getDenseView().slice(),raw=curve(90);s.begin(settings,controls,0);for(const p of raw)s.sample(p,p.t*1000);assert.deepEqual(a.active.volume.getDenseView(),before);assert.equal(a.undoCount,0);s.end();const preview=s.preview.map(p=>({...p}));b.beginStroke();let previous=0;for(const p of clayReplay(preview)){b.applyStrokeLocal(p,settings.radius,settings.mode,settings.strength,(p.t*1000-previous)/1000,settings.hardness);previous=p.t*1000;}b.finishStroke();const frames=finish(s);assert(frames>1);assert.deepEqual(s.preview,preview);assert.deepEqual(a.active.volume.getDenseView(),b.active.volume.getDenseView());assert.equal(a.undoCount,1);const after=a.active.volume.getDenseView().slice();a.undo();assert.deepEqual(a.active.volume.getDenseView(),before);a.undo(true);assert.deepEqual(a.active.volume.getDenseView(),after);
 }finally{a.dispose();b.dispose();}
});
test('cancellation rolls back live and partially replayed strokes exactly and retains redo',()=>{
 for(const steady of [0,100]){const a=create(),s=new ClayStrokeSession(()=>a),controls=new ClayPathControls();controls.steady=steady;try{a.setActiveTransform({position:[.1,0,0],rotation:[0,0,0],scale:[1,1,1]});a.undo();const before=new Uint8Array(saveSculptProject(a.project));s.begin(settings,controls,0);for(const p of curve(60).slice(0,40))s.sample(p,p.t*1000);if(steady){s.end();s.pump(0);}s.cancel();assert.equal(a.drawing,false);assert.equal(a.undoCount,0);assert.equal(a.redoCount,1);assert.deepEqual(new Uint8Array(saveSculptProject(a.project)),before);assert.equal(s.raw.length,0);
 }finally{a.dispose();}}
});
function toolsFor(layers){let mode='sculpt',value={...settings};const shape=new ShapePreviewModel(layers.project.activeLayerId);const tools=new EditorToolState({layers:()=>layers,shape,settings:()=>value,setSettings:v=>value=v,mode:()=>mode,selectTool:t=>{mode=t==='transform'?'translate':'sculpt';value.mode=t==='smooth'?'smooth':'subtract';},selectTransform:m=>mode=m,busy:()=>false,changed:()=>{}});tools.path.placement='surface';return tools;}
const controller=()=>({role:'tool',connectionId:2,connected:true,tracked:true,gripTracked:true,buttons:{trigger:{pressed:false,justPressed:false,rawValue:0}}});
test('Steady slider is declarative, clamps 0–100, is disabled by Straight Line, and restores previous value',()=>{
 const a=create(),tools=toolsFor(a),m=new XRMenuModel(tools);try{assert.equal(tools.path.steady,0);tools.setValue('steady',75);assert.equal(tools.path.steady,75);tools.adjust('straight-line',1);assert(tools.path.straightLine);assert(tools.options().find(o=>o.id==='steady').disabled);tools.setValue('steady',20);assert.equal(tools.path.steady,75);tools.adjust('straight-line',-1);assert.equal(tools.path.steady,75);m.setRequest('tool-options');m.activate('next');assert(m.content().buttons.find(b=>b.id==='slider:steady'));m.setSlider('slider:steady',.42);assert.equal(tools.path.steady,42);m.setSlider('slider:steady',2);assert.equal(tools.path.steady,100);assert.equal(a.undoCount,0);
 }finally{a.dispose();}
});
test('XR surface sampling inverse-converts nested world/workspace/layer transforms without modifying metadata',()=>{
 const a=create(),tools=toolsFor(a),root=new Group(),workspace=new Group();workspace.add(a.group);workspace.position.set(.2,.3,-.2);workspace.rotation.set(.1,.2,0);workspace.scale.setScalar(.4);a.setActiveTransform({position:[.2,0,0],rotation:[0,.3,.1],scale:[1.4,1.4,1.4]});a.group.updateWorldMatrix(true,true);tools.path.steady=100;const stroke=new XRClayStroke(()=>a,tools,root),c=controller(),native=JSON.stringify(a.active.layer.transform);try{
 const localRay=new Matrix4().makeTranslation(0,0,1.5),pose=a.active.surface.group.matrixWorld.clone().multiply(localRay);stroke.update(c,pose,0,true);c.buttons.trigger={pressed:true,justPressed:true,rawValue:1};stroke.update(c,pose,116,true);assert(stroke.active);assert(stroke.session.raw[0].z>.6&&stroke.session.raw[0].z<.9);near(stroke.session.raw[0].x,0,1e-6);assert.equal(JSON.stringify(a.active.layer.transform),native);assert.equal(a.undoCount,1);assert(stroke.preview.parent===root);stroke.cancel();assert.equal(a.undoCount,1);assert.equal(a.drawing,false);
 }finally{stroke.dispose();a.dispose();}
});
test('XR tracking loss, mode/menu/grip exclusion, hidden/locked targets and session cancellation cannot commit a pending path',()=>{
 for(const reason of ['tracking','identity','disabled','locked','hidden','mode','world','cancel']){const a=create(),tools=toolsFor(a),root=new Group(),stroke=new XRClayStroke(()=>a,tools,root),c=controller(),pose=new Matrix4().makeTranslation(0,0,1.5);tools.path.steady=100;try{const before=a.active.volume.getDenseView().slice();stroke.update(c,pose,0,true);c.buttons.trigger={pressed:true,justPressed:true,rawValue:1};stroke.update(c,pose,116,true);assert(stroke.active);c.buttons.trigger.justPressed=false;stroke.update(c,pose,132,true);
 if(reason==='tracking')c.tracked=false;if(reason==='identity')c.connectionId++;if(reason==='locked')a.active.layer.locked=true;if(reason==='hidden')a.active.layer.visible=false;if(reason==='mode')tools.port.setSettings({...settings,mode:'smooth'});if(reason==='world')a.group.position.x=.2;if(reason==='cancel')stroke.cancel();stroke.update(c,pose,48,reason!=='disabled');assert.equal(stroke.active,false);assert.equal(a.drawing,false);assert.equal(a.undoCount,0);assert.deepEqual(a.active.volume.getDenseView(),before);
 }finally{stroke.dispose();a.dispose();}}
});

test('the visible VR slider supports Tool-trigger dragging and clears capture on reconnect',()=>{
 const original=globalThis.document;globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>new Proxy({}, {get:()=>()=>{}})})};const a=create(),tools=toolsFor(a),model=new XRMenuModel(tools),view=new XRMenuView(model),c=controller();new Group().add(view.mesh);view.place({x:0,y:1.6,z:0},{x:0,y:0,z:0,w:1});
 const poseAt=u=>{const r=model.content().buttons.find(b=>b.id==='slider:steady').rect;view.mesh.updateWorldMatrix(true,false);const p=new Vector3(((r.x+20+(r.width-40)*u)/1152-.5)*.72,(.5-(r.y+r.height/2)/1152)*.72,0).applyMatrix4(view.mesh.matrixWorld),n=new Vector3(0,0,1).transformDirection(view.mesh.matrixWorld);return new Matrix4().compose(p.addScaledVector(n,.6),view.mesh.getWorldQuaternion(new Quaternion()),new Vector3(1,1,1));};
 try{view.update('tool-options',c,new Matrix4(),0,true);model.activate('next');let pose=poseAt(.5);view.update('tool-options',c,pose,116,true);c.buttons.trigger={pressed:true,justPressed:true,rawValue:1};view.update('tool-options',c,pose,132,true);assert.equal(tools.path.steady,50);c.buttons.trigger.justPressed=false;view.update('tool-options',c,poseAt(.8),148,true);assert.equal(tools.path.steady,80);c.connectionId++;view.update('tool-options',c,poseAt(.2),164,true);assert.equal(tools.path.steady,80);view.close();assert.equal(a.undoCount,0);
 }finally{view.dispose();a.dispose();globalThis.document=original;}
});
test('real controller routing suppresses Clay during menus, cancels before workspace grip, and rolls back on session end',()=>{
 const a=create(),tools=toolsFor(a),root=new Group(),workspace=new Group();workspace.add(a.group);const stroke=new XRClayStroke(()=>a,tools,root),rays=[new Group(),new Group()],grips=[new Group(),new Group()],menus={active:false,update(request){this.active=!!request;return null;},close(){this.active=false;}};
 const bridge=new XRControllers({getController:i=>rays[i],getControllerGrip:i=>grips[i]},root,new XRControllerRoles(),undefined,()=>{},{workspace,layers:()=>a,toolMode:()=>tools.active,menus,stroke,shortcuts:{interactiveMenus:true}});
 const source=hand=>({handedness:hand,profiles:['meta-quest-touch-plus'],targetRayMode:'tracked-pointer',gripSpace:{},gamepad:{mapping:'xr-standard',axes:[0,0,0,0],buttons:Array.from({length:6},()=>({value:0,pressed:false,touched:false}))}}),tool=source('right'),support=source('left'),session=new EventTarget();session.visibilityState='visible';bridge.start(session);rays[0].position.z=1.5;rays[0].dispatchEvent({type:'connected',data:tool});rays[1].dispatchEvent({type:'connected',data:support});let t=0;const update=()=>bridge.update(t+=16),press=(s,index,down)=>{Object.assign(s.gamepad.buttons[index],{value:down?1:0,pressed:down});update();};
 try{const before=a.active.volume.getDenseView().slice();update();support.gamepad.axes[3]=-1;update();assert(menus.active);press(tool,0,true);assert.equal(stroke.active,false);support.gamepad.axes[3]=0;update();update();assert.equal(stroke.active,false);press(tool,0,false);press(tool,0,true);assert(stroke.active);assert.notDeepEqual(a.active.volume.getDenseView(),before);press(support,1,true);assert.equal(stroke.active,false);assert.equal(bridge.grab.state,'workspace-grab');assert.deepEqual(a.active.volume.getDenseView(),before);press(support,1,false);press(tool,0,false);tools.path.steady=100;press(tool,0,true);assert(stroke.active);session.dispatchEvent(new Event('end'));assert.equal(stroke.active,false);assert.equal(a.drawing,false);assert.equal(a.undoCount,0);assert.deepEqual(a.active.volume.getDenseView(),before);
 }finally{bridge.dispose();stroke.dispose();a.dispose();}
});
test('30 Hz and 120 Hz recordings produce closely matching final Steady SDF strokes',()=>{
 const volumes=[];for(const hz of [30,120]){const a=create(),s=new ClayStrokeSession(()=>a),controls=new ClayPathControls();controls.steady=100;try{s.begin(settings,controls,0);for(const p of curve(hz))s.sample(p,p.t*1000);s.end();finish(s);assert.equal(a.undoCount,1);volumes.push(a.active.volume.getDenseView().slice());}finally{a.dispose();}}
 let max=0;for(let i=0;i<volumes[0].length;i++)max=Math.max(max,Math.abs(volumes[0][i]-volumes[1][i]));assert(max<.0005,`rate-dependent field difference ${max}`);
});
test('completed XR Steady strokes agree under translated/rotated/scaled workspace and layer parents',()=>{
 const results=[];for(const transformed of [false,true]){const a=create(),tools=toolsFor(a),root=new Group(),parent=new Group();parent.add(a.group);if(transformed){parent.position.set(.2,.3,-.2);parent.rotation.set(.2,.3,.1);parent.scale.setScalar(.35);a.setActiveTransform({position:[.1,.2,0],rotation:[.1,-.2,.3],scale:[1.4,1.4,1.4]});tools.port.setSettings({...settings,radius:settings.radius*1.4});}tools.path.steady=100;const stroke=new XRClayStroke(()=>a,tools,root),c=controller();const pose=x=>{a.active.surface.group.updateWorldMatrix(true,true);return a.active.surface.group.matrixWorld.clone().multiply(new Matrix4().makeTranslation(x,.05,1.5));};try{stroke.update(c,pose(-.2),0,true);c.buttons.trigger={pressed:true,justPressed:true,rawValue:1};for(let i=1;i<=12;i++){stroke.update(c,pose(-.2+i*.03),i*16,true);c.buttons.trigger.justPressed=false;}c.buttons.trigger.pressed=false;stroke.update(c,pose(.18),208,true);let frame=14;while(stroke.active&&frame<500)stroke.update(c,pose(.18),frame++*16,true);assert.equal(stroke.active,false);assert.equal(a.undoCount,transformed?2:1);results.push(a.active.volume.getDenseView().slice());}finally{stroke.dispose();a.dispose();}}
 let max=0;for(let i=0;i<results[0].length;i++)max=Math.max(max,Math.abs(results[0][i]-results[1][i]));assert(max<1e-6);
});
