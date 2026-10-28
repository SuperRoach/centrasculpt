import test from 'node:test';
import assert from 'node:assert/strict';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {ClayStroke} from '../work/test-build/stroke.mjs';
import {ClayStrokeSession} from '../work/test-build/clay-stroke-session.mjs';
import {ClayPathControls} from '../work/test-build/clay-path.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {saveSculptProject,openSculptProject} from '../work/test-build/project.mjs';
const settings={mode:'crease',radius:.32,strength:.7,hardness:.2,camera:{position:[2,2,3],target:[0,0,0]}};
function drain(s){let count=0;while(s.phase==='committing'&&count++<20000)s.pump(0);assert.equal(s.phase,'idle');return count;}
for(const resolution of [64,128,192])test(`Crease ${resolution}: exact staged/synchronous Jacobi samples and compact numeric locality`,()=>{
 const a=new SDFVolume(resolution),b=new SDFVolume(resolution),before=a.values.slice(),c={x:-.04,y:0,z:.85},r=.32;
 a.brush(c,r,'crease',.012,undefined,.3,true);
 const work=b.brushSteps(c,r,'crease',.012,undefined,.3,true);let count=0,result;do{result=work.next();count++;}while(!result.done);assert(count>2);assert.deepEqual(a.values,b.values);
 let edits=0;for(let z=0;z<resolution;z++)for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
 const i=a.index(x,y,z);assert(Number.isFinite(a.values[i]));if(a.values[i]===before[i])continue;edits++;
 assert(Math.hypot(a.coordinate(x)-c.x,a.coordinate(y,1)-c.y,a.coordinate(z,2)-c.z)<r);
 }assert(edits>0);assert(edits<resolution**3*.03);
});
test('Crease indents a plane and also contracts a curved footprint instead of only subtracting',()=>{
 const v=new SDFVolume(128),c={x:0,y:0,z:.85},p={x:.15,y:0,z:.82},before=v.sampleLocal(p);
 for(let i=0;i<12;i++)v.brush(c,.4,'crease',.012);
 assert(v.sampleLocal(p)>before+.001);
 const plane=new SDFVolume(128,1.6,false);for(let z=0;z<128;z++)for(let y=0;y<128;y++)for(let x=0;x<128;x++)plane.values[plane.index(x,y,z)]=plane.coordinate(z,2)-.2;
 const original=plane.values.slice();plane.brush({x:0,y:0,z:.2},.4,'crease',.012);
 assert(plane.sampleLocal({x:0,y:0,z:.2})>.002,'centre moves into the solid');
 assert(plane.sampleLocal({x:.25,y:0,z:.2})>0);
 assert(plane.sampleLocal({x:0,y:0,z:.19})<0,'single dab is bounded');
 for(let i=0;i<original.length;i++)assert(plane.values[i]>=original[i]-1e-7,'planar indentation does not add material');
});
test('Crease inverse map is orientation preserving with bounded derivative across hardness extremes',()=>{
 // Independently differentiate the documented backward map in an axis-aligned plane.
 for(const hardness of [0,.5,1])for(const amount of [.0001,.025,100]){
 const r=.3,inner=.9*hardness,a=Math.min(amount/(r*1.5),.04*(1-inner));
 const B=(x,y,z)=>{const d=Math.hypot(x,y,z)/r,t=Math.max(0,(d-inner)/(1-inner)),w=d>=1?0:(1-t*t)**2;return [x+a*w*x,y+a*w*y,z+a*w*r*.5];};
 for(let i=0;i<60;i++){const x=r*(i/60)*.99,y=.01,z=.01,h=1e-6,cols=[0,1,2].map(k=>{const p=[x,y,z],q=[x,y,z];p[k]+=h;q[k]-=h;const u=B(...p),v=B(...q);return u.map((n,j)=>(n-v[j])/(2*h));});
 const [u,v,w]=cols,det=u[0]*(v[1]*w[2]-v[2]*w[1])-v[0]*(u[1]*w[2]-u[2]*w[1])+w[0]*(u[1]*v[2]-u[2]*v[1]);assert(det>.6&&det<1.4);
 }
 }
});
for(const resolution of [64,128,192])for(const buffered of [false,true])test(`Crease ${resolution} ${buffered?'Steady/Line':'continuous'}: transformed mirror, staged cancellation, one undo and redo`,()=>{
 const l=new IndependentLayers(createBaseProject(new SDFVolume(resolution),settings));try{
 l.setActiveTransform({position:[-.3,.2,.4],rotation:[.2,.3,.1],scale:[1.3,1.3,1.3]});l.symmetry.enabled=true;
 const before=l.active.volume.values.slice(),history=l.undoCount,session=new ClayStrokeSession(()=>l,()=>{},true),controls=new ClayPathControls();controls.straightLine=buffered;controls.steady=buffered?60:0;
 const draw=()=>{session.begin(settings,controls,0,true);for(let i=0;i<6;i++)session.sample({x:-.12+i*.02,y:0,z:.83},i*16);session.end();};
 draw();session.cancel();assert.deepEqual(l.active.volume.values,before);assert.equal(l.undoCount,history);
 draw();assert(drain(session)>1);const after=l.active.volume.values.slice();assert.notDeepEqual(after,before);assert.equal(l.undoCount,history+1);l.undo();assert.deepEqual(l.active.volume.values,before);l.undo(true);assert.deepEqual(l.active.volume.values,after);
 const saved=saveSculptProject(l.project),opened=openSculptProject(saved);assert.equal(opened.settings.mode,'crease');assert.deepEqual(opened.layerStack.get(opened.activeLayerId).volume.values,after);
 }finally{l.dispose();}
});
test('cancel during partial Crease publication restores exact source and prior redo',()=>{
 const l=new IndependentLayers(createBaseProject(new SDFVolume(64),settings));try{
 l.setActiveTransform({position:[.1,0,0],rotation:[0,0,0],scale:[1,1,1]});l.undo();const before=l.active.volume.values.slice();l.beginStroke();
 const steps=l.applyResamplingSteps('crease',{x:0,y:0,z:.85},.4,.8,.1,.2);let written=false;for(let i=0;i<5000;i++){const step=steps.next();if(l.active.volume.values.some((v,i)=>v!==before[i])){written=true;break;}if(step.done)break;}assert(written);l.cancelStroke();assert.deepEqual(l.active.volume.values,before);assert.equal(l.redoCount,1);assert.equal(l.undoCount,0);
 }finally{l.dispose();}
});
test('Crease empty space, expanded negative lattice, and zero strength are safe',()=>{
 const empty=new SDFVolume(64,1.6,false);empty.values.fill(6.4);assert.equal(empty.brush({x:0,y:0,z:0},.3,'crease',.02),null);
 const v=new SDFVolume(64,1.6,false,{dimensions:[80,64,64],latticeMin:[-16,0,0]});
 for(let z=0;z<64;z++)for(let y=0;y<64;y++)for(let x=0;x<80;x++)v.values[v.index(x,y,z)]=Math.hypot(v.coordinate(x)+1.7,v.coordinate(y,1),v.coordinate(z,2))-.35;
 assert(v.brush({x:-1.7,y:0,z:.32},.25,'crease',.01));assert(v.values.every(Number.isFinite));const original=v.values.slice();new ClayStroke().apply(v,{x:-1.7,y:0,z:.32},.25,'crease',0,.1);assert.deepEqual(v.values,original);
});
test('mirrored overlapping Crease has reflection symmetry and no nearest-applicator jump',()=>{
 const v=new SDFVolume(128),c={x:-.08,y:0,z:.83};v.brush(c,.3,'crease',.012,undefined,.5,false,1,c,{enabled:true,axis:'x',offset:0});
 for(let z=90;z<105;z++)for(let y=60;y<68;y++)for(let x=53;x<64;x++)assert(Math.abs(v.values[v.index(x,y,z)]-v.values[v.index(127-x,y,z)])<1e-6);
 // No field step at the mirror bisector: symmetric central differences vanish.
 for(let y=61;y<67;y++)for(let z=93;z<102;z++)assert(Math.abs(v.values[v.index(63,y,z)]-v.values[v.index(64,y,z)])<1e-6);
});
test('world/local Crease agree under rotation, translation and uniform scale',async()=>{
 const {Vector3}=await import('three'),{transformMatrix}=await import('../work/test-build/transform.mjs');
 const a=new IndependentLayers(createBaseProject(new SDFVolume(64),settings)),b=new IndependentLayers(createBaseProject(new SDFVolume(64),settings));
 try{const transform={position:[-1,.3,.2],rotation:[.3,.2,.1],scale:[1.5,1.5,1.5]};a.setActiveTransform(transform);b.setActiveTransform(transform);a.beginStroke();b.beginStroke();
 const p=new Vector3(-.1,0,.82),world=p.clone().applyMatrix4(transformMatrix(transform));a.applyStroke(world,.3,'crease',.7,.016,.3);b.applyStrokeLocal(p,.2,'crease',.7,.016,.3);a.finishStroke();b.finishStroke();
 for(let i=0;i<a.active.volume.values.length;i++)assert(Math.abs(a.active.volume.values[i]-b.active.volume.values[i])<1e-6);
 assert.deepEqual(a.active.layer.transform,transform);
 }finally{a.dispose();b.dispose();}
});
test('XR Crease uses shared registry, stages release, preserves chunk admission and cancels tracking loss',async()=>{
 const {Group,Matrix4}=await import('three'),{EditorToolState}=await import('../work/test-build/editor-tool-state.mjs'),{ShapePreviewModel}=await import('../work/test-build/shape-preview.mjs'),{XRClayStroke}=await import('../work/test-build/xr-clay-stroke.mjs');
 const l=new IndependentLayers(createBaseProject(new SDFVolume(64),settings)),root=new Group();let value={...settings};
 const tools=new EditorToolState({layers:()=>l,shape:new ShapePreviewModel(l.project.activeLayerId),settings:()=>value,setSettings:v=>value=v,mode:()=> 'sculpt',selectTool:()=>{},selectTransform:()=>{},busy:()=>false,changed:()=>{}});tools.select('crease');tools.path.placement='surface';
 const stroke=new XRClayStroke(()=>l,tools,root),controller={role:'tool',connectionId:2,connected:true,tracked:true,gripTracked:true,buttons:{trigger:{pressed:false,justPressed:false,rawValue:0}}},pose=new Matrix4().makeTranslation(0,0,1.5);
 const runtime=l.active,original=runtime.rebuild.bind(runtime);let calls=0,allowCancellationRemesh=false;runtime.rebuild=(chunks,budget)=>{if(runtime.mesher.pendingChunks&&!allowCancellationRemesh){assert.equal(chunks,2);assert(budget<=3);calls++;}return original(chunks,budget);};
 try{
 assert(tools.options().find(o=>o.id==='strength'));stroke.update(controller,pose,0,true);controller.buttons.trigger={pressed:true,justPressed:true,rawValue:1};stroke.update(controller,pose,16,true);controller.buttons.trigger.justPressed=false;stroke.update(controller,pose,32,true);assert(stroke.active);assert(stroke.cursor.pinchArrows.visible&&stroke.cursor.creaseArrow.visible);
 controller.buttons.trigger.pressed=false;controller.buttons.trigger.rawValue=0;stroke.update(controller,pose,48,true);assert.equal(stroke.session.phase,'committing');let frames=0;while(stroke.active&&frames++<2000)stroke.update(controller,pose,64+frames*16,true);assert(!stroke.active);assert.equal(l.undoCount,1);assert(calls>0);
 const committed=l.active.volume.values.slice();stroke.update(controller,pose,40000,true);controller.buttons.trigger={pressed:true,justPressed:true,rawValue:1};stroke.update(controller,pose,40016,true);assert(stroke.active);controller.tracked=false;allowCancellationRemesh=true;stroke.update(controller,pose,40032,true);assert(!stroke.active);assert.deepEqual(l.active.volume.values,committed);assert.equal(l.undoCount,1);
 }finally{runtime.rebuild=original;stroke.dispose();l.dispose();}
});
test('Crease matches an independent tangential-plus-normal pullback, not a normal-only cutter',()=>{
 const v=new SDFVolume(128,1.6,false),r=.3,amount=.008,hardness=.2;
 for(let z=0;z<128;z++)for(let y=0;y<128;y++)for(let x=0;x<128;x++){const px=v.coordinate(x),py=v.coordinate(y,1);v.values[v.index(x,y,z)]=v.coordinate(z,2)+.7*px*px+.3*py*py;}
 const points=[[67,64,64],[68,65,63],[66,66,65]].map(([x,y,z])=>({x,y,z,p:{x:v.coordinate(x),y:v.coordinate(y,1),z:v.coordinate(z,2)}}));
 const expected=points.map(({p})=>{const d=Math.hypot(p.x,p.y,p.z)/r,t=Math.max(0,(d-.9*hardness)/(1-.9*hardness)),w=(1-t*t)**2,a=Math.min(amount/(r*1.5),.04*(1-.9*hardness));return {value:v.sampleLocal({x:p.x+a*w*p.x,y:p.y+a*w*p.y,z:p.z+a*w*r*.5}),normalOnly:v.sampleLocal({...p,z:p.z+a*w*r*.5})};});
 v.brush({x:0,y:0,z:0},r,'crease',amount,undefined,hardness);
 points.forEach(({x,y,z},i)=>{const value=v.values[v.index(x,y,z)];assert(Math.abs(value-expected[i].value)<1e-7);assert(value>expected[i].normalOnly+1e-5);});
});
for(const resolution of [64,128,192])test(`Crease ${resolution} at allocated boundary stays finite and preserves boundary samples`,()=>{
 const v=new SDFVolume(resolution,1.6,false);
 for(let z=0;z<resolution;z++)for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++)v.values[v.index(x,y,z)]=v.coordinate(x)+1.4;
 const before=v.values.slice();v.brush({x:-1.5,y:0,z:0},.5,'crease',100,undefined,1);
 assert(v.values.every(Number.isFinite));for(let z=0;z<resolution;z++)for(let y=0;y<resolution;y++){assert.equal(v.values[v.index(0,y,z)],before[v.index(0,y,z)]);assert.equal(v.values[v.index(resolution-1,y,z)],before[v.index(resolution-1,y,z)]);}
});
