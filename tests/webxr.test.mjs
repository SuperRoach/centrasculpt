import test from 'node:test';
import assert from 'node:assert/strict';
import {Scene,PerspectiveCamera,Vector3,Quaternion,Box3,Color,Texture,AmbientLight} from 'three';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {saveSculptProject} from '../work/test-build/project.mjs';
import {XRSceneRig} from '../work/test-build/xr-scene.mjs';
import {detectXR,XRSessionController,XRFrameStats} from '../work/test-build/xr-session.mjs';
import {XRControllerRoles,FUTURE_XR_BINDINGS} from '../work/test-build/xr-controller-roles.mjs';
import {InputOwnership} from '../work/test-build/interaction.mjs';
const settings={mode:'add',radius:.22,strength:.35,hardness:.5,camera:{position:[2.4,1.7,3.3],target:[0,0,0]}};
const tick=()=>new Promise(resolve=>queueMicrotask(resolve));
class FakeSession extends EventTarget{ended=false;async end(){this.ended=true;this.dispatchEvent(new Event('end'));}}
function harness(options={}){let prepares=0,restores=0,requests=0,binds=0;const session=new FakeSession(),xr={isSessionSupported:async()=>true,requestSession:()=>{requests++;return options.request?.(session)??Promise.resolve(session);}},controller=new XRSessionController({setSession:async s=>{binds++;if(options.bind)await options.bind(s);}},{prepare:()=>{prepares++;options.prepare?.();},restore:()=>{restores++;options.restore?.();},changed:()=>{}});return {controller,session,xr,get counts(){return {prepares,restores,requests,binds};}};}
test('capability detection distinguishes insecure origins, missing WebXR, unsupported runtimes and denied permissions',async()=>{
 let called=false;assert.equal((await detectXR(false,{isSessionSupported:async()=>{called=true;return true;}})).supported,false);assert.equal(called,false);assert.match((await detectXR(false)).reason,/HTTPS|localhost/);assert.match((await detectXR(true)).reason,/does not expose/);assert.equal((await detectXR(true,{isSessionSupported:async mode=>{assert.equal(mode,'immersive-vr');return true;}})).supported,true);assert.equal((await detectXR(true,{isSessionSupported:async()=>false})).supported,false);assert.match((await detectXR(true,{isSessionSupported:async()=>{throw new Error('Policy denied');}})).reason,/Policy denied/);
});
test('session enter/exit binds once, blocks editing and restores exactly once including OS exit',async()=>{
 const h=harness();await h.controller.check(true,h.xr);assert.equal(h.controller.state,'ready');assert.equal(h.controller.blocking,false);await h.controller.enter();assert.equal(h.controller.state,'presenting');assert(h.controller.blocking);await h.controller.enter();assert.equal(h.counts.requests,1);await h.controller.exit();await tick();assert.deepEqual(h.counts,{prepares:1,restores:1,requests:1,binds:1});assert.equal(h.controller.state,'ready');await h.controller.enter();await h.session.end();await tick();assert.equal(h.controller.state,'ready');assert.equal(h.counts.restores,2);
});
test('session rejection and renderer setup failure restore desktop without a false presenting state',async()=>{
 const denied=harness({request:()=>Promise.reject(new Error('User declined'))});await denied.controller.check(true,denied.xr);await denied.controller.enter();assert.equal(denied.controller.state,'ready');assert.equal(denied.controller.blocking,false);assert.equal(denied.counts.prepares,0);assert.match(denied.controller.reason,/User declined/);
 const failed=harness({bind:()=>Promise.reject(new Error('Framebuffer setup failed'))});await failed.controller.check(true,failed.xr);await failed.controller.enter();await tick();assert.equal(failed.session.ended,true);assert.equal(failed.counts.restores,1);assert.equal(failed.controller.blocking,false);assert.match(failed.controller.reason,/Framebuffer/);
});
test('pending requests cannot double-enter and a session ending during binding never becomes presenting',async()=>{
 let resolveBind;const h=harness({bind:()=>new Promise(resolve=>{resolveBind=resolve;})});await h.controller.check(true,h.xr);const enter=h.controller.enter();await tick();await tick();assert.equal(h.controller.state,'requesting');await h.controller.enter();assert.equal(h.counts.requests,1);await h.session.end();await tick();resolveBind();await enter;assert.equal(h.controller.state,'ready');assert.equal(h.counts.restores,1);
});
test('failed exit keeps XR active until an actual session end, while preparation failures clean up',async()=>{
 const h=harness();await h.controller.check(true,h.xr);await h.controller.enter();h.session.end=async()=>{throw new Error('Exit denied');};await h.controller.exit();assert.equal(h.controller.state,'presenting');assert(h.controller.blocking);assert.equal(h.counts.restores,0);h.session.dispatchEvent(new Event('end'));await tick();assert.equal(h.counts.restores,1);
 const broken=harness({prepare:()=>{throw new Error('Scene setup failed');}});await broken.controller.check(true,broken.xr);await broken.controller.enter();assert.equal(broken.controller.state,'ready');assert.equal(broken.counts.restores,1);
});
function sceneHarness(){const scene=new Scene(),camera=new PerspectiveCamera(38,1.4,.01,100);camera.position.set(2.4,1.7,3.3);camera.lookAt(0,0,0);const c=new IndependentLayers(createBaseProject(new SDFVolume(25),settings)),rig=new XRSceneRig(scene,camera);rig.sculptureRoot.add(c.group,c.composite.group);c.composite.group.visible=false;return {scene,camera,c,rig};}
test('tracking origin and workspace hierarchy reuse original chunk meshes and isolate headset/workspace movement',()=>{
 const {scene,camera,c,rig}=sceneHarness();try{const originalCamera={p:camera.position.clone(),q:camera.quaternion.clone(),projection:camera.projectionMatrix.clone()},native=saveSculptProject(c.project),layer=c.active.layer,metadata=layer.metadata(),geometries=c.active.surface.group.children.map(m=>m.geometry),step=layer.volume.step;
 assert.equal(camera.parent,rig.trackingOrigin);assert.equal(rig.controllerTracking.parent,rig.trackingOrigin);assert.equal(rig.sculptureRoot.parent,rig.workspaceRoot);assert.equal(c.group.parent,rig.sculptureRoot);assert.equal(rig.workspaceRoot.parent,scene);
 const bounds=rig.visibleBounds(),size=bounds.getSize(new Vector3());rig.enter();assert.equal(rig.presentationScale,.65/Math.max(size.x,size.y,size.z));rig.placeFirstView({x:0,y:1.6,z:0},{x:0,y:0,z:0,w:1});const centre=bounds.getCenter(new Vector3()).applyMatrix4(rig.workspaceRoot.matrixWorld);assert(centre.distanceTo(new Vector3(0,1.48,-.9))<1e-9);const placed=rig.workspaceRoot.matrix.clone();camera.position.set(.3,1.7,.2);rig.placeFirstView(camera.position,new Quaternion().setFromAxisAngle(new Vector3(0,1,0),.5));assert.deepEqual(rig.workspaceRoot.matrix.elements,placed.elements);
 rig.workspaceRoot.position.x+=.25;rig.workspaceRoot.scale.multiplyScalar(1.1);rig.workspaceRoot.updateMatrixWorld(true);assert.deepEqual(layer.metadata(),metadata);assert.equal(layer.volume.step,step);assert.deepEqual(c.active.surface.group.children.map(m=>m.geometry),geometries);assert.equal(c.active.mesher.rebuildChunks(),null);assert.deepEqual(new Uint8Array(saveSculptProject(c.project)),new Uint8Array(native));assert.equal(c.undoCount,0);
 rig.exit();assert.deepEqual(camera.position,originalCamera.p);assert.deepEqual(camera.quaternion.toArray(),originalCamera.q.toArray());assert.deepEqual(camera.projectionMatrix.elements,originalCamera.projection.elements);assert.deepEqual(rig.workspaceRoot.position.toArray(),[0,0,0]);assert.deepEqual(rig.workspaceRoot.scale.toArray(),[1,1,1]);rig.exit();
 }finally{c.dispose();}
});
test('framing excludes hidden layers, restores helper visibility, and handles an empty project view',()=>{
 const {c,rig}=sceneHarness();try{const a=c.active.layer,b=c.create(64);b.transform.position=[20,0,0];c.setFlag(b.id,'visible',false);const bounds=rig.visibleBounds();assert(bounds.max.x<2);const helper=c.active.surface.group;const before=helper.visible;rig.enter([helper]);assert.equal(helper.visible,false);rig.exit();assert.equal(helper.visible,before);c.setFlag(a.id,'visible',false);assert(rig.visibleBounds().isEmpty());rig.enter();assert(Number.isFinite(rig.presentationScale));rig.exit();}finally{c.dispose();}
});
test('separate and Boolean exports exclude XR presentation transforms',async()=>{
 const {c,rig}=sceneHarness();const groups=[];try{c.setActiveTransform({position:[.2,0,0],rotation:[0,.2,0],scale:[1.1,1.1,1.1]});await c.composite.flush();const a=c.exportGroup(),b=c.composite.exportGroup();groups.push(a,b);rig.enter();rig.placeFirstView({x:0,y:1.6,z:0},{x:0,y:0,z:0,w:1});rig.workspaceRoot.rotation.y+=.5;rig.workspaceRoot.updateMatrixWorld(true);const x=c.exportGroup(),y=c.composite.exportGroup();groups.push(x,y);
 for(const [before,after]of [[a,x],[b,y]]){assert.equal(before.children.length,after.children.length);for(let m=0;m<before.children.length;m++){const p=before.children[m].geometry.getAttribute('position').array,q=after.children[m].geometry.getAttribute('position').array;assert.equal(p.length,q.length);assert(p.every((v,i)=>Math.abs(v-q[i])<1e-5));assert.deepEqual(before.children[m].position.toArray(),after.children[m].position.toArray());}}
 rig.exit();}finally{for(const group of groups)group.traverse(o=>{if(o.isMesh)o.geometry.dispose();});c.dispose();}
});
test('XR suspension prevents desktop sculpt, preview and layer ownership and resumes normally',()=>{
 const input=new InputOwnership();input.suspended=true;assert.equal(input.cameraEnabled,false);assert.equal(input.canSculpt(true),false);assert.equal(input.beginSculpt(true),false);assert.equal(input.beginPreview(true),false);input.mode='translate';assert.equal(input.beginTransform(true),false);input.suspended=false;input.mode='sculpt';assert(input.beginSculpt(true));input.end('sculpt');assert(input.cameraEnabled);
});
test('controller foundation maps tool/support handedness only and exposes no edit execution',()=>{
 const roles=new XRControllerRoles();assert.equal(roles.roleFor('right'),'tool');assert.equal(roles.roleFor('left'),'support');roles.setDominant('left');assert.equal(roles.support,'right');assert.equal(roles.roleFor('left'),'tool');assert.equal(roles.roleFor('none'),'unassigned');assert.throws(()=>roles.setDominant('both'));assert.equal(FUTURE_XR_BINDINGS.grip,'workspace-or-layer-grab');assert.match(roles.describe([]),/not editing-enabled/);
});
test('XR frame diagnostics measure intervals, ignore invalid samples and reset across sessions',()=>{
 const stats=new XRFrameStats();for(let i=0;i<200;i++)stats.frame(i*1000/90,2);assert(Math.abs(stats.fps-90)<1e-6);assert(Math.abs(stats.p95Ms-1000/90)<1e-6);assert.equal(stats.cpuMs,2);stats.frame(NaN);assert.equal(stats.frames,200);stats.reset();assert.equal(stats.fps,0);assert.equal(stats.frames,0);
});

test('disposing during a pending permission request ends the late session and unlocks desktop input',async()=>{
 let grant;const h=harness({request:()=>new Promise(resolve=>{grant=resolve;})});await h.controller.check(true,h.xr);const enter=h.controller.enter();await h.controller.dispose();grant(h.session);await enter;assert.equal(h.session.ended,true);assert.equal(h.controller.blocking,false);assert.equal(h.counts.prepares,0);assert.equal(h.counts.binds,0);
});
test('frame interval collection retains the previous render CPU measurement',()=>{const stats=new XRFrameStats();stats.frame(1,2.5);stats.frame(12);assert.equal(stats.cpuMs,2.5);});


test('VR background is configurable neutral grey and preserves the exact desktop rendering state on exit',()=>{
 const scene=new Scene(),camera=new PerspectiveCamera(),desktop=new Color('#e9e9e3'),environment=new Texture(),light=new AmbientLight('#fff',.6);scene.background=desktop;scene.environment=environment;scene.add(light);const rig=new XRSceneRig(scene,camera);
 rig.enter();assert.equal(scene.background.getHexString(),'808080');assert.equal(scene.environment,environment);assert.equal(light.intensity,.6);rig.enter();rig.exit();assert.equal(scene.background,desktop);assert.equal(scene.environment,environment);assert.equal(light.intensity,.6);
 rig.preferences.background='#777777';rig.enter();assert.equal(scene.background.getHexString(),'777777');rig.exit();assert.equal(scene.background,desktop);
 scene.background=environment;rig.enter();rig.exit();assert.equal(scene.background,environment);scene.background=null;rig.enter();rig.exit();assert.equal(scene.background,null);environment.dispose();
});
test('failed renderer binding restores the background, camera and workspace before retry',async()=>{
 const {scene,camera,c,rig}=sceneHarness();scene.background=new Color('#123456');const background=scene.background,before=camera.position.clone(),native=saveSculptProject(c.project);
 try{let fail=true;const session=new FakeSession(),xr={isSessionSupported:async()=>true,requestSession:async()=>session};const controller=new XRSessionController({setSession:async()=>{if(fail)throw new Error('PC runtime rejected framebuffer');}},{prepare:()=>rig.enter(),restore:()=>rig.exit(),changed:()=>{}});
 await controller.check(true,xr);await controller.enter();await tick();assert.equal(scene.background,background);assert.deepEqual(camera.position,before);assert.equal(controller.blocking,false);assert.equal(rig.active,false);fail=false;await controller.enter();assert.equal(controller.state,'presenting');assert.equal(scene.background.getHexString(),'808080');await controller.exit();assert.equal(scene.background,background);assert.deepEqual(new Uint8Array(saveSculptProject(c.project)),new Uint8Array(native));assert.equal(c.undoCount,0);
 }finally{c.dispose();}
});
