import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3,Quaternion,Group,Raycaster} from 'three';
import {SDFVolume,reflectPoint} from '../work/test-build/sdf.mjs';
import {ClayStroke} from '../work/test-build/stroke.mjs';
import {ClayStrokeSession} from '../work/test-build/clay-stroke-session.mjs';
import {ClayPathControls} from '../work/test-build/clay-path.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {IncrementalMesher} from '../work/test-build/mesh.mjs';
import {MoveGesture} from '../work/test-build/move-gesture.mjs';
import {defineShape} from '../work/test-build/shapes.mjs';
import {ShapeGhost} from '../work/test-build/shape-preview.mjs';
import {saveSculptProject,openSculptProject} from '../work/test-build/project.mjs';
import {qualityMetrics} from '../scripts/fixtures/mesh-quality.mjs';
const settings={mode:'add',radius:.14,strength:.35,hardness:.6,camera:{position:[2,2,3],target:[0,0,0]}};
const p=(x,y=0,z=0)=>({x,y,z});
const setup=(n=65)=>{const v=new SDFVolume(n,1.6,false);v.values.fill(6.4);return new IndependentLayers(createBaseProject(v,settings));};
function draw(c,points,mode='add',controls=new ClayPathControls(),free=true){const s=new ClayStrokeSession(()=>c);s.begin({...settings,mode},controls,0,free);points.forEach((p,i)=>s.sample(p,(i+1)*16));s.end();while(s.active)s.pump();return s;}
for(const n of [64,128,192])test(`${n}: swept Clay has complete zero-crossing band, bounded geometry error and consistent shared normals`,()=>{
 const v=new SDFVolume(n,1.6,false);v.values.fill(6.4);const s=new ClayStroke();s.apply(v,p(-.55,.013,.019),.14,'add',.35,1/90,undefined,.6,undefined,true);s.apply(v,p(.55,.013,.019),.14,'add',.35,1/90,undefined,.6,undefined,true);
 const field=p=>Math.hypot(Math.max(Math.abs(p.x)-.55,0),p.y-.013,p.z-.019)-.14,m=new IncrementalMesher(v,16);try{const r=m.rebuildChunks(),metrics=qualityMetrics(r.updates.map(u=>u.geometry),field,v.step);assert(metrics.maxSurfaceProbeErrorVoxels<.16);assert(metrics.maxSeamNormalDelta<1e-4);assert.equal(metrics.degenerate,0);
 let maxAngle=0;for(const {geometry:g} of r.updates){const pos=g.getAttribute('position'),normal=g.getAttribute('normal');for(let i=0;i<pos.count;i++){const x=pos.getX(i),a=new Vector3(x-Math.max(-.55,Math.min(.55,x)),pos.getY(i)-.013,pos.getZ(i)-.019).normalize(),b=new Vector3().fromBufferAttribute(normal,i);maxAngle=Math.max(maxAngle,a.angleTo(b)*180/Math.PI);}}assert(maxAngle<12,`normal angle ${maxAngle}`);
 }finally{m.dispose();}
});
test('continuous free-space sweep is independent of controller sampling and has no 256-dab gap cap',()=>{
 const result=[];for(const steps of [1,7,90]){const v=new SDFVolume(65,1.6,false);v.values.fill(6.4);const s=new ClayStroke();for(let i=0;i<=steps;i++)s.apply(v,p(-1+2*i/steps),.065,'add',.5,.01,undefined,.5,undefined,true);result.push(v.values);}for(const values of result.slice(1))for(let i=0;i<values.length;i++)assert(Math.abs(values[i]-result[0][i])<1e-6);
});
for(const mode of ['add','subtract','smooth'])for(const free of [false,true])test(`${mode}, free=${free}: mirror centerline applies once with exact undo/redo`,()=>{
 const a=setup(),b=setup();try{draw(a,[p(0)]);draw(b,[p(0)]);b.symmetry.enabled=true;const before=b.active.volume.values.slice(),count=b.undoCount;draw(a,[p(0)],mode,new ClayPathControls(),free);draw(b,[p(0)],mode,new ClayPathControls(),free);assert.deepEqual(a.active.volume.values,b.active.volume.values);const after=b.active.volume.values.slice();if(b.undoCount>count){assert.equal(b.undoCount,count+1);b.undo();assert.deepEqual(b.active.volume.values,before);b.undo(true);assert.deepEqual(b.active.volume.values,after);}}finally{a.dispose();b.dispose();}
});
for(const mode of ['add','subtract','smooth'])test(`${mode}: mirrored Steady / Straight Line preserve local plane under transformed layer and one action`,()=>{
 for(const straight of [false,true]){const c=setup();try{c.setActiveTransform({position:[2,1,-1],rotation:[.3,.6,.2],scale:[1.7,1.7,1.7]});c.symmetry.enabled=true;draw(c,[p(.5),p(.5,.2)]);if(mode==='smooth'){draw(c,[p(.55,.05)]);}
 const before=c.active.volume.values.slice(),count=c.undoCount,controls=new ClayPathControls();controls.steady=70;controls.straightLine=straight;draw(c,[p(.5),p(.6,.1),p(.5,.2)],mode,controls);assert(c.undoCount<=count+1);const v=c.active.volume,[nx,ny,nz]=v.dimensions;for(let z=0;z<nz;z++)for(let y=0;y<ny;y++)for(let x=0;x<nx;x++)assert(Math.abs(v.values[v.index(x,y,z)]-v.values[v.index(nx-1-x,y,z)])<2e-6);if(c.undoCount>count){c.undo();assert.deepEqual(v.values,before);}
 }finally{c.dispose();}}
});
test('mirror expanded bounds grow on both sides without changing spacing; cancellation retains redo',()=>{
 const c=setup();try{c.symmetry.enabled=true;draw(c,[p(.5)]);c.undo();const redo=c.redoCount,step=c.active.volume.step,s=new ClayStrokeSession(()=>c);s.begin(settings,new ClayPathControls(),0,true);s.sample(p(1.9),16);assert(c.active.volume.bounds.min[0]<-1.9);assert(c.active.volume.bounds.max[0]>1.9);assert.equal(c.active.volume.step,step);s.cancel();assert.equal(c.redoCount,redo);assert(c.active.volume.values.every(v=>v>0));}finally{c.dispose();}
});
test('configurable offset plane Stamp unions reflected rotated shape in one patch with native/history preservation',()=>{
 const c=setup();try{c.symmetry.enabled=true;c.symmetry.axis='y';c.symmetry.offset=.2;const d=defineShape({kind:'pyramid',operation:'add',targetLayerId:c.project.activeLayerId,dimensions:[.4,.5,.4],transform:{position:[.3,.8,.1],rotation:[.2,.3,.1],scale:[1,1,1]}}),before=c.active.volume.values.slice();c.stampShape(d);assert.equal(c.undoCount,1);const v=c.active.volume;assert(v.sampleLocal(p(.3,.8,.1))<0);assert(v.sampleLocal(p(.3,-.4,.1))<0);const after=v.values.slice();c.undo();assert.deepEqual(v.values,before);c.undo(true);assert.deepEqual(v.values,after);const loaded=openSculptProject(saveSculptProject(c.project));assert.deepEqual(loaded.activeLayer.volume.getDenseView(),after);
 const ghost=new ShapeGhost(()=>c.project.layerStack);try{ghost.mirror=c.symmetry;ghost.preview(d);assert.equal(ghost.group.children.length,2);assert(ghost.group.children[1].visible);const matrix=ghost.group.children[1].matrix;assert(matrix.determinant()<0);ghost.group.updateMatrixWorld(true);assert.equal(new Raycaster(new Vector3(.3,.8,3),new Vector3(0,0,-1)).intersectObject(ghost.group,true).length,0);}finally{ghost.dispose();}
 }finally{c.dispose();}
});
test('axis constrained Straight Line pins transverse coordinates and preview matches committed path',()=>{
 const c=setup(),controls=new ClayPathControls();controls.straightLine=true;controls.axis='x';try{const s=draw(c,[p(-.5,.2,.1),p(0,.5,.4),p(.5,.7,.6)],'add',controls);assert(s.preview.every(p=>p.y===.2&&p.z===.1));assert(c.active.volume.sampleLocal(p(0,.2,.1))<0);assert(c.active.volume.sampleLocal(p(0,.5,.4))>0);assert.equal(c.undoCount,1);}finally{c.dispose();}
});
test('Move translation locks local axis; rotation snapping respects gain, signs and clamp',()=>{
 const g=new MoveGesture(),out=new Vector3();g.capture(false,1);assert.deepEqual(g.translation(new Vector3(.1,.2,.3),out,'y').toArray(),[0,.2,0]);for(const snap of [15,45,90])for(const sign of [-1,1]){g.rotation(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),sign*52*Math.PI/180),'y',1,120,snap);assert(Math.abs(g.angle/(snap*Math.PI/180)-Math.round(g.angle/(snap*Math.PI/180)))<1e-10);assert(Math.abs(g.angle)<=120*Math.PI/180);}g.capture(true,1);g.rotation(new Quaternion().setFromAxisAngle(new Vector3(1,0,0),60*Math.PI/180),'x',1,120,15);assert(Math.abs(g.angle-Math.PI/12)<1e-9);
});
test('invalid plane rejects before history/growth and overlapping off-center smooth is not doubled',()=>{
 const c=setup();try{c.symmetry.offset=NaN;assert.throws(()=>c.beginStroke(),/mirror plane/);assert(!c.drawing);assert.equal(c.undoCount,0);}finally{c.dispose();}
 const a=setup(),b=setup();try{draw(a,[p(0)]);draw(b,[p(0)]);b.symmetry.enabled=true;a.active.volume.brush(p(.02),.14,'smooth',.1,undefined,.6,true,1);b.active.volume.brush(p(.02),.14,'smooth',.1,undefined,.6,true,1,undefined,b.symmetry);const v=a.active.volume,i=v.index(32,32,32);assert.equal(v.values[i],b.active.volume.values[i]);}finally{a.dispose();b.dispose();}
});
