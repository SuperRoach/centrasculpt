import test from 'node:test';
import assert from 'node:assert/strict';
import {Euler,Group,Matrix4,Quaternion,Vector3} from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {XRShapeStamp,XRToolInteraction} from '../work/test-build/xr-shape-stamp.mjs';
import {XRClayStroke} from '../work/test-build/xr-clay-stroke.mjs';
import {XRControllers} from '../work/test-build/xr-controllers.mjs';
import {XRControllerRoles} from '../work/test-build/xr-controller-roles.mjs';
import {projectHistoryShortcuts} from '../work/test-build/xr-history-shortcuts.mjs';
import {XRBrushSizing} from '../work/test-build/xr-brush-sizing.mjs';
import {EditorToolState} from '../work/test-build/editor-tool-state.mjs';
import {ShapePreviewModel} from '../work/test-build/shape-preview.mjs';
import {shapeDimensionsForKind} from '../work/test-build/shape-preview.mjs';
import {SHAPE_KINDS} from '../work/test-build/shapes.mjs';
import {prepareShape} from '../work/test-build/shape-library.mjs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {openSculptProject,saveSculptProject} from '../work/test-build/project.mjs';
const settings={mode:'add',radius:.14,strength:.35,hardness:.6,camera:{position:[2,2,3],target:[0,0,0]}};
const near=(a,b,e=1e-7)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
const poseAt=(x=0,y=0,z=0)=>new Matrix4().makeTranslation(x,y,z+.12);
function fixture(){const volume=new SDFVolume(33,1.6,false);volume.values.fill(6.4);const layers=new IndependentLayers(createBaseProject(volume,settings)),shape=new ShapePreviewModel(layers.project.activeLayerId),root=new Group();let state={...settings},mode='sculpt',busy=false,changes=0;
 const tools=new EditorToolState({layers:()=>layers,shape,settings:()=>state,setSettings:v=>state=v,mode:()=>mode,selectTool:t=>{shape.setEnabled(t==='stamp',layers.project.layerStack);mode='sculpt';state={...state,mode:t==='smooth'?'smooth':'add'};},selectTransform:m=>mode=m,busy:()=>busy,changed(){}});tools.select('stamp');
 const stamp=new XRShapeStamp(()=>layers,tools,root,()=>changes++),tool={role:'tool',handedness:'right',connectionId:1,connected:true,tracked:true,gripTracked:true,stick:{available:true,x:0,y:0},buttons:{grip:{pressed:false,rawValue:0},trigger:{pressed:false,justPressed:false,rawValue:0}}};let time=0;
 const update=(pose=poseAt(),enabled=true)=>stamp.update(tool,pose,time+=16,enabled,pose);
 const release=(pose=poseAt())=>{Object.assign(tool.buttons.trigger,{pressed:false,justPressed:false,rawValue:0});update(pose);};
 const press=(pose=poseAt())=>{Object.assign(tool.buttons.trigger,{pressed:true,justPressed:true,rawValue:1});update(pose);};
 return {layers,volume,shape,tools,root,stamp,tool,update,release,press,set busy(v){busy=v;},get changes(){return changes;},dispose(){stamp.dispose();layers.dispose();}};
}
for(const kind of SHAPE_KINDS)test(`VR ${kind} deposits in empty space, holds exactly once, subtracts and restores exact voxel history`,()=>{
 const f=fixture();try{const d=f.shape.definition;f.shape.set({...d,kind,dimensions:shapeDimensionsForKind(kind,[.6,.7,.5])},f.layers.project.layerStack);const before=f.volume.values.slice();f.release();assert.deepEqual(f.volume.values,before,'ghost is nondestructive');assert(f.stamp.ghost.group.visible);f.press();assert.equal(f.layers.undoCount,1);assert(f.volume.sampleLocal({x:0,y:0,z:0})<0);const after=f.volume.values.slice();
 for(let i=0;i<12;i++)f.update(poseAt(i*.025));assert.equal(f.layers.undoCount,1);assert.deepEqual(f.volume.values,after);assert.equal(f.changes,1);f.layers.undo();assert.deepEqual(f.volume.values,before);f.layers.undo(true);assert.deepEqual(f.volume.values,after);
 f.release();f.tools.adjust('operation',1);f.press();assert.equal(f.layers.undoCount,2);assert(f.volume.sampleLocal({x:0,y:0,z:0})>0);f.layers.undo();assert.deepEqual(f.volume.values,after);
 f.tools.adjust('operation',-1);f.release(poseAt(.9));f.press(poseAt(.9));assert(f.volume.sampleLocal({x:.9,y:0,z:0})<0);assert(f.volume.sampleLocal({x:.45,y:0,z:0})>0,'separate floating component');
 }finally{f.dispose();}
});
test('preview rotation and pose equal the committed kernel after tracking/workspace/sculpture/layer transforms',()=>{
 const f=fixture(),workspace=new Group(),sculpture=new Group();try{workspace.add(sculpture);sculpture.add(f.layers.group);workspace.position.set(.3,1.1,-.8);workspace.rotation.set(.2,.4,-.1);workspace.scale.setScalar(.45);sculpture.position.set(.1,-.1,.1);sculpture.rotation.y=.3;f.layers.setActiveTransform({position:[.2,.1,-.1],rotation:[.2,-.3,.1],scale:[1.2,1.2,1.2]});const transform=JSON.stringify(f.layers.active.layer.transform);f.root.position.set(.2,-.1,.3);f.root.rotation.set(.1,.2,0);
 const d=f.shape.definition;f.shape.set({...d,kind:'box',dimensions:[.6,.3,.4],transform:{...d.transform,scale:[.8,.8,.8]}},f.layers.project.layerStack);f.tools.adjust('rotation-0',1);
 const surface=f.layers.active.surface.group;surface.updateWorldMatrix(true,false);const local=new Vector3(.1,.2,-.1),world=local.clone().applyMatrix4(surface.matrixWorld),q=new Quaternion().setFromEuler(new Euler(.4,.6,-.2)),origin=world.clone().addScaledVector(new Vector3(0,0,-1).applyQuaternion(q),-.12),pose=new Matrix4().compose(origin,q,new Vector3(1,1,1));
 f.release(pose);const definition=f.shape.definition;definition.transform.position.forEach((v,i)=>near(v,local.toArray()[i]));const inner=f.stamp.ghost.group.children[0];inner.updateWorldMatrix(true,true);const center=new Vector3().setFromMatrixPosition(inner.matrixWorld);near(center.distanceTo(world),0);
 const expectedLocal=surface.getWorldQuaternion(new Quaternion()).invert().multiply(q).multiply(new Quaternion().setFromEuler(new Euler(Math.PI/12,0,0))),actual=new Quaternion().setFromEuler(new Euler(...definition.transform.rotation));near(Math.abs(actual.dot(expectedLocal)),1);
 let captured;const original=f.layers.stampShape.bind(f.layers);f.layers.stampShape=value=>{captured=value;return original(value);};f.press(pose);assert.deepEqual(captured,definition);assert(f.volume.sampleLocal(local)<0);assert.equal(JSON.stringify(f.layers.active.layer.transform),transform);near(f.shape.definition.transform.scale[0],.8);
 }finally{f.dispose();}
});
test('outside Add grows on one press; held input never repeats and far Subtract never expands',()=>{
 const f=fixture();try{f.release(poseAt(1.4));assert.match(f.stamp.feedback,/grows on commit/);f.press(poseAt(1.4));assert.equal(f.layers.undoCount,1);assert(f.layers.active.volume.bounds.max[0]>1.6);const after=saveSculptProject(f.layers.project);f.update(poseAt());assert.equal(f.layers.undoCount,1);assert.deepEqual(saveSculptProject(f.layers.project),after);f.release(poseAt(100));f.tools.adjust('operation',1);f.update(poseAt(100));assert.match(f.stamp.feedback,/only existing material inside/);const dimensions=f.layers.active.volume.dimensions;f.press(poseAt(100));assert.equal(f.layers.undoCount,1);assert.deepEqual(f.layers.active.volume.dimensions,dimensions);
 }finally{f.dispose();}
});
test('all four ghost geometries are cached, Add/Subtract colors differ and no preview is native data',()=>{
 const f=fixture();try{const bytes=saveSculptProject(f.layers.project);for(const kind of [...SHAPE_KINDS,...SHAPE_KINDS]){const d=f.shape.definition;f.shape.set({...d,kind,dimensions:shapeDimensionsForKind(kind,d.dimensions)},f.layers.project.layerStack);f.release();}assert.equal(f.stamp.ghost.cachedShapes,4);assert.equal(f.stamp.ghost.stats.geometryBuilds,4);const solid=f.stamp.ghost.group.children[0].children.find(o=>o.isMesh),add=solid.material.color.getHexString();f.tools.adjust('operation',1);f.update();assert.notEqual(solid.material.color.getHexString(),add);assert.deepEqual(saveSculptProject(f.layers.project),bytes);assert.equal(f.layers.undoCount,0);}finally{f.dispose();}
});
for(const interruption of ['menu/grab','tracking','grip tracking','disconnect','role','busy','Tool grip','session end','tool switch','layer switch'])test(`stamp safely rearms after ${interruption}`,()=>{
 const f=fixture();try{f.release();f.press();const count=f.layers.undoCount;let enabled=true,restore=()=>{};
 switch(interruption){case 'menu/grab':enabled=false;break;case 'tracking':f.tool.tracked=false;restore=()=>f.tool.tracked=true;break;case 'grip tracking':f.tool.gripTracked=false;restore=()=>f.tool.gripTracked=true;break;case 'disconnect':f.tool.connected=false;restore=()=>{f.tool.connected=true;f.tool.connectionId++;};break;case 'role':f.tool.role='support';restore=()=>f.tool.role='tool';break;case 'busy':f.busy=true;restore=()=>f.busy=false;break;case 'Tool grip':f.tool.buttons.grip.pressed=true;restore=()=>f.tool.buttons.grip.pressed=false;break;case 'session end':f.stamp.cancel();break;case 'tool switch':f.tools.select('clay');restore=()=>f.tools.select('stamp');break;case 'layer switch':f.layers.create(64,true);break;}
 f.update(poseAt(.9),enabled);restore();f.update(poseAt(.9));assert.equal(f.layers.undoCount,count,'held trigger does not leak after interruption');f.release(poseAt(.9));f.press(poseAt(.9));assert.equal(f.layers.undoCount,count+1);
 }finally{f.dispose();}
});
for(const flag of ['visible','locked'])test(`VR stamp refuses ${flag} restriction and never edits unrelated volumes`,()=>{
 const f=fixture();try{const other=f.layers.create(64,true),base=f.volume.values.slice(),otherBefore=other.volume.getDenseView().slice();f.layers.setFlag(other.id,flag,flag==='locked');f.release();f.press();assert.equal(f.layers.undoCount,0);assert.deepEqual(f.volume.values,base);assert.deepEqual(other.volume.getDenseView(),otherBefore);f.layers.setFlag(other.id,flag,flag!=='locked');f.release();f.press();assert.equal(f.layers.undoCount,1);assert.deepEqual(f.volume.values,base);assert.notDeepEqual(other.volume.getDenseView(),otherBefore);}finally{f.dispose();}
});
test('stamp thumbstick scale is proportional, time-based, bounded and independent of workspace scale/hand',()=>{
 const run=(hz,hand)=>{const f=fixture(),sizing=new XRBrushSizing(f.tools);try{f.tool.handedness=hand;sizing.update(f.tool,[f.tool],0,true,false);f.tool.stick.y=-.6;for(let i=1;i<=hz;i++)sizing.update(f.tool,[f.tool],i*1000/hz,true,false);return f.shape.definition.transform.scale[0];}finally{f.dispose();}};const values=[30,72,120].map(hz=>run(hz,'left'));values.forEach(v=>near(v,values[0]));near(values[0],run(72,'right'));
 const f=fixture(),sizing=new XRBrushSizing(f.tools);try{const before=saveSculptProject(f.layers.project),dims=f.shape.definition.dimensions;sizing.update(f.tool,[f.tool],0,true,false);f.tool.stick.y=-1;sizing.update(f.tool,[f.tool],50,true,false);assert(f.shape.definition.transform.scale[0]>1);assert.deepEqual(f.shape.definition.dimensions,dims);const workspace=new Group();workspace.add(f.layers.group);workspace.scale.setScalar(.3);f.release();const localScale=f.shape.definition.transform.scale[0];workspace.scale.setScalar(.8);f.update();near(f.shape.definition.transform.scale[0],localScale);assert.match(sizing.feedback,/Stamp scale/);const scale=f.shape.definition.transform.scale[0];sizing.update(f.tool,[f.tool],100,false,false);sizing.update(f.tool,[f.tool],150,true,false);near(f.shape.definition.transform.scale[0],scale);f.tool.stick.y=0;sizing.update(f.tool,[f.tool],166,true,false);f.tool.stick.y=1;sizing.update(f.tool,[f.tool],216,true,false);assert(f.shape.definition.transform.scale[0]<scale);f.tools.setStampScale(100);near(f.shape.definition.transform.scale[0],10);f.tools.setStampScale(.0001);near(f.shape.definition.transform.scale[0],.02);assert.deepEqual(saveSculptProject(f.layers.project),before);assert.equal(f.layers.undoCount,0);}finally{f.dispose();}
});
test('shared interaction router retains Clay/Steady while preventing cross-tool trigger leakage',()=>{
 const f=fixture(),clay=new XRClayStroke(()=>f.layers,f.tools,f.root),router=new XRToolInteraction(f.tools,clay,f.stamp);try{f.tools.path.steady=80;f.tools.path.straightLine=true;router.update(f.tool,poseAt(),0,true,poseAt());Object.assign(f.tool.buttons.trigger,{pressed:true,justPressed:true});router.update(f.tool,poseAt(),16,true,poseAt());assert.equal(f.layers.undoCount,1);assert(router.active);f.tools.select('clay');router.update(f.tool,poseAt(.9),32,true,poseAt(.9));assert(!clay.active);assert(!f.stamp.ghost.group.visible);f.tool.buttons.trigger.pressed=false;router.update(f.tool,poseAt(.9),48,true,poseAt(.9));f.tool.buttons.trigger.pressed=true;router.update(f.tool,poseAt(.9),64,true,poseAt(.9));assert(clay.active);assert.equal(f.tools.path.steady,80);assert(f.tools.path.straightLine);router.cancel();assert(!router.active);assert.equal(f.layers.undoCount,1);}finally{clay.dispose();f.dispose();}
});
test('VR floating stamps survive native round trip and both neutral binary GLB paths',async()=>{
 const f=fixture();let loaded;const groups=[],old=globalThis.FileReader;try{f.release(poseAt(-.6));f.press(poseAt(-.6));f.release(poseAt(.6));f.tools.adjust('shape',1);f.press(poseAt(.6));loaded=new IndependentLayers(openSculptProject(saveSculptProject(f.layers.project)));assert.deepEqual(loaded.active.volume.getDenseView(),f.volume.values);assert(loaded.active.triangles>0);f.layers.composite.setQuality(64);await f.layers.composite.flush();groups.push(f.layers.exportGroup(),f.layers.composite.exportGroup());globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(buffer=>{this.result=buffer;this.onloadend?.();});}};
 for(const group of groups){assert(group.children.length);assert(!group.children.some(o=>o.userData.previewOnly));const glb=await new GLTFExporter().parseAsync(group,{binary:true}),view=new DataView(glb);assert.equal(view.getUint32(0,true),0x46546c67);const json=JSON.parse(new TextDecoder().decode(new Uint8Array(glb,20,view.getUint32(12,true))));assert(json.meshes.length);for(const mesh of json.meshes)for(const primitive of mesh.primitives)assert.equal(primitive.attributes.COLOR_0,undefined);const positions=group.children[0].geometry.getAttribute('position');let left=false,right=false;for(let i=0;i<positions.count;i++){left ||= positions.getX(i)<-.4;right ||= positions.getX(i)>.4;}assert(left&&right);}
 }finally{globalThis.FileReader=old;groups.forEach(g=>g.traverse(o=>{if(o.isMesh)o.geometry.dispose();}));loaded?.dispose();f.dispose();}
});
for(const blocked of ['menu/grab','tracking','grip tracking','disconnect','support role','busy','Tool grip','invalid pose','Boolean view'])test(`a fresh trigger press is rejected during ${blocked} and cannot leak on recovery`,()=>{
 const f=fixture();try{f.release();let enabled=true,pose=poseAt(),restore=()=>{};
 if(blocked==='menu/grab')enabled=false;
 if(blocked==='tracking'){f.tool.tracked=false;restore=()=>f.tool.tracked=true;}
 if(blocked==='grip tracking'){f.tool.gripTracked=false;restore=()=>f.tool.gripTracked=true;}
 if(blocked==='disconnect'){f.tool.connected=false;restore=()=>f.tool.connected=true;}
 if(blocked==='support role'){f.tool.role='support';restore=()=>f.tool.role='tool';}
 if(blocked==='busy'){f.busy=true;restore=()=>f.busy=false;}
 if(blocked==='Tool grip'){f.tool.buttons.grip.rawValue=.6;restore=()=>f.tool.buttons.grip.rawValue=0;}
 if(blocked==='invalid pose')pose.elements[0]=NaN;
 if(blocked==='Boolean view'){f.layers.viewMode='boolean';restore=()=>f.layers.viewMode='separate';}
 Object.assign(f.tool.buttons.trigger,{pressed:true,justPressed:true,rawValue:1});f.update(pose,enabled);assert(!f.stamp.ghost.group.visible);assert.equal(f.layers.undoCount,0);restore();f.update();assert.equal(f.layers.undoCount,0);f.release();f.press();assert.equal(f.layers.undoCount,1);
 }finally{f.dispose();}
});
test('staged stamp history owns exact snapshots and is immune to caller buffer mutation',()=>{
 const f=fixture();try{const h=f.layers.active.history,i=f.volume.index(16,16,16),before=f.volume.values[i],patch={indices:new Uint32Array([i]),before:new Float32Array([before]),after:new Float32Array([-.1]),bounds:{min:[16,16,16],max:[16,16,16]}};h.commitPatch('shape-stamp',patch);f.volume.writeVoxel(i,patch.after[0]);patch.indices[0]=0;patch.before[0]=2;patch.after[0]=3;patch.bounds.min[0]=0;h.undo();assert.equal(f.volume.values[i],before);h.redo();near(f.volume.values[i],-.1);assert.equal(h.memoryBytes,12);}finally{f.dispose();}
});
for(const hand of ['left','right'])test(`real input bridge routes ${hand} Stamp grip pose/size and preserves Support menus, grips and undo/redo`,()=>{
 const f=fixture(),roles=new XRControllerRoles();roles.setDominant(hand);const rays=[new Group(),new Group()],grips=[new Group(),new Group()],workspace=new Group();workspace.add(f.layers.group);
 const clay=new XRClayStroke(()=>f.layers,f.tools,f.root),router=new XRToolInteraction(f.tools,clay,f.stamp),sizing=new XRBrushSizing(f.tools),menus={active:false,update(request){this.active=!!request;return null;},close(){this.active=false;}},bridge=new XRControllers({getController:i=>rays[i],getControllerGrip:i=>grips[i]},f.root,roles,undefined,()=>{},{workspace,layers:()=>f.layers,toolMode:()=>f.tools.active,stroke:router,sizing,menus,shortcuts:{interactiveMenus:true,commands:projectHistoryShortcuts(()=>f.layers)}}),source=h=>({handedness:h,profiles:['meta-quest-touch-plus'],targetRayMode:'tracked-pointer',gripSpace:{},gamepad:{mapping:'xr-standard',axes:[0,0,0,0],buttons:Array.from({length:6},()=>({value:0,pressed:false,touched:false}))}}),tool=source(hand),support=source(hand==='left'?'right':'left'),session=new EventTarget();session.visibilityState='visible';bridge.start(session);rays[0].dispatchEvent({type:'connected',data:support});rays[1].dispatchEvent({type:'connected',data:tool});grips[1].position.z=.12;grips[0].position.set(-.4,0,.12);rays[1].position.set(0,0,8);let t=0;const update=()=>bridge.update(t+=16),press=(s,index,value)=>{Object.assign(s.gamepad.buttons[index],{pressed:!!value,value});update();},axis=(s,x,y)=>{s.gamepad.axes=[0,0,x,y];update();};
 try{update();near(f.shape.definition.transform.position[2],0);axis(tool,0,-1);assert(f.shape.definition.transform.scale[0]>1);axis(tool,0,0);press(tool,0,1);assert.equal(f.layers.undoCount,1);for(let i=0;i<5;i++)update();assert.equal(f.layers.undoCount,1);press(tool,0,0);update();
 axis(support,-1,0);assert.equal(f.layers.undoCount,0);axis(support,0,0);axis(support,1,0);assert.equal(f.layers.undoCount,1);axis(support,0,0);
 axis(support,0,-1);assert(menus.active);grips[1].position.x=.8;press(tool,0,1);assert.equal(f.layers.undoCount,1);const scale=f.shape.definition.transform.scale[0];axis(tool,0,-1);near(f.shape.definition.transform.scale[0],scale);axis(support,0,0);update();assert.equal(f.layers.undoCount,1);press(tool,0,0);axis(tool,0,0);
 press(support,1,1);assert.equal(bridge.grab.state,'workspace-grab');press(tool,1,1);assert.equal(bridge.grab.state,'two-hand-grab');press(tool,0,1);assert.equal(f.layers.undoCount,1);press(support,1,0);press(tool,1,0);update();assert.equal(f.layers.undoCount,1);press(tool,0,0);update();press(tool,0,1);assert.equal(f.layers.undoCount,2);session.dispatchEvent(new Event('end'));assert(!f.stamp.ghost.group.visible);assert.equal(f.layers.undoCount,2,'completed stamps survive session termination');
 }finally{bridge.dispose();clay.dispose();f.dispose();}
});
