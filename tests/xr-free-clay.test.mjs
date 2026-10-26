import test from 'node:test';
import assert from 'node:assert/strict';
import {Euler,Group,Matrix4,Quaternion,Vector3} from 'three';
import {CLAY_TIP_REACH_METRES} from '../work/test-build/clay-path.mjs';
import {EditorToolState} from '../work/test-build/editor-tool-state.mjs';
import {XRClayStroke} from '../work/test-build/xr-clay-stroke.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {ShapePreviewModel} from '../work/test-build/shape-preview.mjs';
import {saveSculptProject} from '../work/test-build/project.mjs';
const settings={mode:'add',radius:.12,strength:1,hardness:.5,camera:{position:[2,2,3],target:[0,0,0]}};
function setup(empty=false){const volume=new SDFVolume(33,1.6,!empty);if(empty)volume.values.fill(.1);const layers=new IndependentLayers(createBaseProject(volume,settings)),shape=new ShapePreviewModel(layers.project.activeLayerId);let state={...settings};const tools=new EditorToolState({layers:()=>layers,shape,settings:()=>state,setSettings:v=>state=v,mode:()=> 'sculpt',selectTool:t=>state={...state,mode:t==='smooth'?'smooth':'add'},selectTransform(){},busy:()=>false,changed(){}}),root=new Group(),stroke=new XRClayStroke(()=>layers,tools,root),tool={role:'tool',connectionId:1,connected:true,tracked:true,gripTracked:true,buttons:{trigger:{pressed:false,justPressed:false,rawValue:0}}};
 return {layers,volume,tools,root,stroke,tool,dispose(){stroke.dispose();layers.dispose();}};
}
const near=(a,b,e=1e-8)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
const poseAt=(x,y=0,z=0)=>new Matrix4().makeTranslation(x,y,z+CLAY_TIP_REACH_METRES);
const press=t=>Object.assign(t.buttons.trigger,{pressed:true,justPressed:true,rawValue:1});
const release=t=>Object.assign(t.buttons.trigger,{pressed:false,justPressed:false,rawValue:0});
function pump(f,time){while(f.stroke.active&&time<20000){f.stroke.update(f.tool,poseAt(1.2),time,true);time+=16;}assert.equal(f.stroke.active,false);}
test('Clay defaults to a fixed physical Tool-tip point with no surface hit or raycast required',()=>{
 const f=setup();try{assert.equal(f.tools.path.placement,'free');f.stroke.update(f.tool,poseAt(1.2),0,true);assert(f.stroke.cursor.group.visible);const center=new Vector3().setFromMatrixPosition(f.stroke.cursor.group.matrixWorld);near(center.x,1.2);near(center.z,0);press(f.tool);f.stroke.update(f.tool,poseAt(1.2),16,true);assert(f.stroke.active);near(f.stroke.session.raw[0].x,1.2);near(f.stroke.session.raw[0].z,0);assert(f.volume.sampleLocal({x:1.2,y:0,z:0})<0,'first frame deposits immediately');
 }finally{f.dispose();}
});
for(const steady of [0,75])test(`free-space Add creates disconnected clay and one undo action with Steady ${steady}`,()=>{
 const f=setup();try{f.tools.path.steady=steady;const before=f.volume.values.slice(),transform=JSON.stringify(f.layers.active.layer.transform);f.stroke.update(f.tool,poseAt(1.2),0,true);press(f.tool);f.stroke.update(f.tool,poseAt(1.2),16,true);f.tool.buttons.trigger.justPressed=false;
 for(let i=1;i<=40;i++)f.stroke.update(f.tool,poseAt(1.2),16+i*100,true);
 if(steady)assert.deepEqual(f.volume.values,before);release(f.tool);f.stroke.update(f.tool,poseAt(1.2),4032,true);pump(f,4048);assert.equal(f.layers.undoCount,1);assert(f.volume.sampleLocal({x:1.2,y:0,z:0})<0,'a new island was created away from the original sphere');assert(f.volume.sampleLocal({x:.95,y:0,z:0})>0,'empty gap remains between islands');assert.equal(JSON.stringify(f.layers.active.layer.transform),transform);
 const after=f.volume.values.slice();f.layers.undo();assert.deepEqual(f.volume.values,before);f.layers.undo(true);assert.deepEqual(f.volume.values,after);
 }finally{f.dispose();}
});
test('free Clay works on an empty layer with no mesh triangles',()=>{
 const f=setup(true);try{assert.equal(f.layers.active.surface.group.children.length,0);f.stroke.update(f.tool,poseAt(0),0,true);press(f.tool);f.stroke.update(f.tool,poseAt(0),16,true);f.tool.buttons.trigger.justPressed=false;for(let i=1;i<=20;i++)f.stroke.update(f.tool,poseAt(0),16+i*100,true);release(f.tool);f.stroke.update(f.tool,poseAt(0),2032,true);assert(f.volume.sampleLocal({x:0,y:0,z:0})<0);assert(f.layers.active.surface.group.children.length>0);assert.equal(f.layers.undoCount,1);
 }finally{f.dispose();}
});
test('Surface follow is explicit opt-in, keeps ray placement, and Smooth shares the placement option',()=>{
 const f=setup();try{f.tools.adjust('placement',1);assert.equal(f.tools.path.placement,'surface');assert.equal(f.tools.options().find(o=>o.id==='placement').value,'Surface follow');f.stroke.update(f.tool,poseAt(1.2),0,true);press(f.tool);f.stroke.update(f.tool,poseAt(1.2),16,true);assert.equal(f.stroke.active,false);assert.equal(f.layers.undoCount,0);release(f.tool);const surfaceRay=new Matrix4().makeTranslation(0,0,1.5);f.stroke.update(f.tool,surfaceRay,32,true);press(f.tool);f.stroke.update(f.tool,surfaceRay,48,true);assert(f.stroke.active);assert(f.stroke.session.raw[0].z>.7&&f.stroke.session.raw[0].z<.9);f.stroke.cancel();
 f.tools.adjust('placement',-1);f.tools.select('smooth');release(f.tool);f.stroke.update(f.tool,poseAt(1.2),64,true);press(f.tool);f.stroke.update(f.tool,poseAt(1.2),80,true);assert.equal(f.stroke.active,true);assert.equal(f.tools.path.placement,'free');f.stroke.cancel();assert.equal(f.layers.undoCount,0);
 }finally{f.dispose();}
});
test('controller reach stays in XR metres while the tip is inverse-converted through workspace/layer/tracking transforms',()=>{
 const f=setup(true),workspace=new Group();try{workspace.add(f.layers.group);workspace.position.set(.2,1.3,-.9);workspace.rotation.set(.2,-.3,.1);workspace.scale.setScalar(.4);f.root.position.set(-.2,.4,.1);f.root.rotation.y=.2;f.layers.setActiveTransform({position:[.1,.2,.1],rotation:[.3,.1,-.2],scale:[1.4,1.4,1.4]});const surface=f.layers.active.surface.group;surface.updateWorldMatrix(true,true);const local=new Vector3(.1,.2,.3),world=local.clone().applyMatrix4(surface.matrixWorld),q=new Quaternion().setFromEuler(new Euler(.2,.4,-.1)),direction=new Vector3(0,0,-1).applyQuaternion(q),origin=world.clone().addScaledVector(direction,-CLAY_TIP_REACH_METRES),pose=new Matrix4().compose(origin,q,new Vector3(1,1,1));
 f.stroke.update(f.tool,pose,0,true);const shown=new Vector3().setFromMatrixPosition(f.stroke.cursor.group.matrixWorld);near(shown.distanceTo(world),0);near(shown.distanceTo(origin),.12);press(f.tool);f.stroke.update(f.tool,pose,16,true);const recorded=f.stroke.session.raw[0];near(recorded.x,local.x);near(recorded.y,local.y);near(recorded.z,local.z);near(f.stroke.cursor.localRadius,settings.radius/1.4);assert(f.volume.sampleLocal(local)<0,'transformed tip deposits at the converted local point');
 }finally{f.dispose();}
});
test('outside former bounds Add grows; over-budget placement cancels without consuming redo or leaking held trigger',()=>{
 const f=setup();try{f.layers.setActiveTransform({position:[.1,0,0],rotation:[0,0,0],scale:[1,1,1]});f.layers.undo();const before=new Uint8Array(saveSculptProject(f.layers.project));f.stroke.update(f.tool,poseAt(100),0,true);press(f.tool);f.stroke.update(f.tool,poseAt(100),16,true);assert.equal(f.stroke.active,false);assert.match(f.stroke.feedback,/limit/);assert.equal(f.layers.redoCount,1);assert.deepEqual(new Uint8Array(saveSculptProject(f.layers.project)),before);f.tool.buttons.trigger.justPressed=false;f.stroke.update(f.tool,poseAt(.85),32,true);assert(!f.stroke.active);release(f.tool);f.stroke.update(f.tool,poseAt(3),48,true);press(f.tool);f.stroke.update(f.tool,poseAt(3),64,true);assert(f.stroke.active);assert(f.layers.active.volume.bounds.max[0]>3);assert(f.layers.active.volume.sampleLocal({x:3,y:0,z:0})<0);release(f.tool);f.stroke.update(f.tool,poseAt(3),80,true);assert.equal(f.layers.undoCount,1);f.layers.undo();assert(f.layers.active.volume.sampleLocal({x:3,y:0,z:0})>0);assert(f.layers.active.volume.bounds.max[0]>3,'undo retains harmless capacity');
 }finally{f.dispose();}
});
test('Steady and Straight Line retain their values and 3D endpoints; changing placement mid-stroke cancels',()=>{
 const f=setup(true);try{f.tools.path.steady=85;f.tools.path.straightLine=true;f.stroke.update(f.tool,poseAt(-.2,.1,.2),0,true);press(f.tool);f.stroke.update(f.tool,poseAt(-.2,.1,.2),16,true);f.tool.buttons.trigger.justPressed=false;f.stroke.update(f.tool,poseAt(0,.3,.4),32,true);release(f.tool);f.stroke.update(f.tool,poseAt(.2,.1,.6),48,true);const preview=f.stroke.session.preview;near(preview[0].x,-.2);near(preview[0].z,.2);near(preview.at(-1).x,.2);near(preview.at(-1).z,.6);for(const p of preview)near(p.y,.1);assert.equal(f.tools.path.steady,85);assert(f.tools.path.straightLine);f.stroke.cancel();assert.equal(f.layers.undoCount,0);
 f.tools.path.straightLine=false;release(f.tool);f.stroke.update(f.tool,poseAt(.2),64,true);press(f.tool);f.stroke.update(f.tool,poseAt(.2),80,true);assert(f.stroke.active);f.tools.path.placement='surface';f.tool.buttons.trigger.justPressed=false;f.stroke.update(f.tool,poseAt(.2),96,true);assert.equal(f.stroke.active,false);assert.equal(f.layers.undoCount,0);
 }finally{f.dispose();}
});
test('free applicator uses tracked grip pose rather than independently pointing aim ray; Add near old bounds stays ready to grow',()=>{
 const f=setup(true);try{const aim=new Matrix4().makeTranslation(0,0,8),grip=poseAt(.2,.3);f.stroke.update(f.tool,aim,0,true,grip);press(f.tool);f.stroke.update(f.tool,aim,16,true,grip);near(f.stroke.session.raw[0].x,.2);near(f.stroke.session.raw[0].y,.3);near(f.stroke.session.raw[0].z,0);assert(f.volume.sampleLocal({x:.2,y:.3,z:0})<0);f.stroke.cancel();release(f.tool);f.stroke.update(f.tool,aim,32,true,poseAt(1.5));assert.doesNotMatch(f.stroke.feedback,/clipped/);assert.notEqual(f.stroke.cursor.mesh.material.color.getHexString(),'e8b174');}finally{f.dispose();}
});
test('mirrored XR brush and trajectory previews match a layer-local constrained stroke and cancel on lost tracking',()=>{
 const f=setup(true);try{f.layers.symmetry.enabled=true;f.layers.symmetry.axis='x';f.layers.symmetry.offset=.1;f.tools.path.straightLine=true;f.tools.path.axis='y';
 f.stroke.update(f.tool,poseAt(.6,.1),0,true);assert(f.stroke.mirrorCursor.group.visible);near(new Vector3().setFromMatrixPosition(f.stroke.mirrorCursor.group.matrixWorld).x,-.4);
 press(f.tool);f.stroke.update(f.tool,poseAt(.6,.1),16,true);f.tool.buttons.trigger.justPressed=false;f.stroke.update(f.tool,poseAt(.9,.3,.2),64,true);assert(f.stroke.session.preview.every(p=>Math.abs(p.x-.6)<1e-8&&Math.abs(p.z)<1e-8));assert(f.stroke.preview.children.some(o=>o.visible&&o.scale.x===-1));assert.equal(f.layers.undoCount,0);
 f.tool.tracked=false;f.stroke.update(f.tool,poseAt(.9,.3,.2),80,true);assert(!f.stroke.active);assert(!f.stroke.mirrorCursor.group.visible);assert.equal(f.layers.undoCount,0);assert(f.layers.active.volume.values.every(v=>v>0));
 }finally{f.dispose();}
});
