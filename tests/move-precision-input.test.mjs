import test from 'node:test';import assert from 'node:assert/strict';
import {Group} from 'three';
import {fixture} from '../scripts/fixtures/move-precision-fixture.mjs';
import {XRAlternateTool} from '../work/test-build/xr-alternate-tool.mjs';
import {XRClayStroke} from '../work/test-build/xr-clay-stroke.mjs';
import {XRShapeStamp,XRToolInteraction} from '../work/test-build/xr-shape-stamp.mjs';
import {XRControllers} from '../work/test-build/xr-controllers.mjs';
import {XRControllerRoles} from '../work/test-build/xr-controller-roles.mjs';
import {XRBrushSizing} from '../work/test-build/xr-brush-sizing.mjs';
for(const dominant of ['left','right'])test(`${dominant} precision controller bridge: alternate Smooth, sizing, menu, Support and both-grip priorities`,()=>{
 const f=fixture(),roles=new XRControllerRoles();roles.setDominant(dominant);const rays=[new Group(),new Group()],grips=[new Group(),new Group()],workspace=new Group();workspace.add(f.l.group);f.tools.move.precision=true;
 const clay=new XRClayStroke(()=>f.l,f.tools,f.root),stamp=new XRShapeStamp(()=>f.l,f.tools,f.root),interaction=new XRToolInteraction(f.tools,clay,stamp,f.move),alternate=new XRAlternateTool(f.tools),menus={active:false,update(r){this.active=!!r;return null;},close(){this.active=false;}};
 const bridge=new XRControllers({getController:i=>rays[i],getControllerGrip:i=>grips[i]},f.root,roles,undefined,()=>{},{workspace,layers:()=>f.l,toolMode:()=>f.tools.active,stroke:interaction,alternate,sizing:new XRBrushSizing(f.tools),menus,shortcuts:{interactiveMenus:true}}),session=new EventTarget();session.visibilityState='visible';
 const source=hand=>({handedness:hand,profiles:['meta-quest-touch-plus'],targetRayMode:'tracked-pointer',gripSpace:{},gamepad:{mapping:'xr-standard',axes:[0,0,0,0],buttons:Array.from({length:6},()=>({value:0,pressed:false,touched:false}))}}),support=source(roles.support),tool=source(dominant),button=(s,i,v)=>Object.assign(s.gamepad.buttons[i],{value:v,pressed:!!v});let time=0;const update=()=>bridge.update(time+=16);
 try{
  bridge.start(session);rays[1].position.z=grips[1].position.z=1.5;rays[0].dispatchEvent({type:'connected',data:support});rays[1].dispatchEvent({type:'connected',data:tool});update();
  const radius=f.tools.move.radius;tool.gamepad.axes[3]=-1;update();assert(f.tools.move.radius>radius);tool.gamepad.axes[3]=0;update();
  button(tool,0,1);update();assert(f.move.active);grips[1].position.x=.004;update();assert(Math.abs(f.move.preview.field.delta.x-.001)<1e-9);
  button(support,0,1);update();assert.equal(f.tools.active,'move');button(tool,0,0);update();update();assert.equal(f.tools.active,'smooth');assert(alternate.active);button(support,0,0);update();assert.equal(f.tools.active,'move');assert(f.tools.move.precision);
  button(tool,0,1);update();assert(f.move.active);button(support,1,1);update();assert(!f.move.active);button(tool,1,1);update();assert(!f.move.active);grips[0].position.x=-.2;grips[1].position.x=.2;update();assert(!f.move.active);button(support,1,0);button(tool,1,0);button(tool,0,0);update();update();assert.equal(f.l.undoCount,0);
  support.gamepad.axes[3]=-1;update();assert(menus.active);button(tool,0,1);update();assert(!f.move.active);support.gamepad.axes[3]=0;update();assert(!menus.active);assert(!f.move.active);button(tool,0,0);update();assert(f.tools.move.precision);assert.equal(f.l.undoCount,0);
 }finally{bridge.dispose();clay.dispose();stamp.dispose();f.dispose();}
});
