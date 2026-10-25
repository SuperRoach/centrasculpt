import test from 'node:test';
import assert from 'node:assert/strict';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {ClayStrokeSession} from '../work/test-build/clay-stroke-session.mjs';
import {ClayPathControls} from '../work/test-build/clay-path.mjs';
import {openSculptProject,saveSculptProject} from '../work/test-build/project.mjs';
const settings={mode:'add',radius:.14,strength:.35,hardness:.6,camera:{position:[2,2,3],target:[0,0,0]}};
const point=(x,y=0,z=0)=>({x,y,z});
function setup(n=65){const volume=new SDFVolume(n,1.6,false);volume.values.fill(6.4);return new IndependentLayers(createBaseProject(volume,settings));}
function draw(c,path,mode='add',steady=0,straight=false,dt=1000/90){const s=new ClayStrokeSession(()=>c),controls=new ClayPathControls();controls.steady=steady;controls.straightLine=straight;s.begin({...settings,mode},controls,0,true);path.forEach((p,i)=>s.sample(p,(i+1)*dt));s.end();while(s.active)s.pump();return s;}
const smile=Array.from({length:29},(_,i)=>point(.6*Math.cos(Math.PI+i*Math.PI/28),.15+.6*Math.sin(Math.PI+i*Math.PI/28)));
const dispose=g=>g.traverse(o=>{if(o.isMesh)o.geometry.dispose();});
test('empty volume immediately draws three floating smiley components; save, history, Boolean and both GLBs retain them',async()=>{
 const c=setup(),old=globalThis.FileReader;let loaded,groups=[];
 try{const before=c.active.volume.values.slice();draw(c,[point(-.35,.5)]);draw(c,[point(.35,.5)]);draw(c,smile);const volume=c.active.volume,after=volume.values.slice();assert.equal(c.undoCount,3);
 for(const p of [point(-.35,.5),point(.35,.5),...smile])assert(volume.sampleLocal(p)<0);
 for(const p of [point(0,.5),point(0,0)])assert(volume.sampleLocal(p)>0,'gaps separate the three components');
 for(let i=0;i<3;i++)c.undo();assert.deepEqual(volume.values,before);for(let i=0;i<3;i++)c.undo(true);assert.deepEqual(volume.values,after);
 loaded=new IndependentLayers(openSculptProject(saveSculptProject(c.project)));assert.deepEqual(loaded.active.volume.values,after);assert(loaded.active.triangles>0);
 c.composite.setQuality(64);await c.composite.flush();assert(c.composite.stats.triangles>0);
 groups=[c.exportGroup(),c.composite.exportGroup()];globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(b=>{this.result=b;this.onloadend?.();});}};
 for(const group of groups){assert(group.children.length>0);const glb=await new GLTFExporter().parseAsync(group,{binary:true}),view=new DataView(glb);assert.equal(view.getUint32(0,true),0x46546c67);const json=JSON.parse(new TextDecoder().decode(new Uint8Array(glb,20,view.getUint32(12,true))));assert(json.meshes.length>0);const a=group.children[0].geometry.getAttribute('position');let left=false,right=false,mouth=false;for(let i=0;i<a.count;i++){left ||= a.getX(i)<-.2&&a.getY(i)>.3;right ||= a.getX(i)>.2&&a.getY(i)>.3;mouth ||= a.getY(i)<-.3;}assert(left&&right&&mouth,'all disconnected pieces exported');}
 }finally{globalThis.FileReader=old;groups.forEach(dispose);loaded?.dispose();c.dispose();}
});
test('fast strokes have no gaps at 30, 72 and 120 Hz; Steady and Straight Line also deposit without dwelling',()=>{
 for(const hz of [30,72,120])for(const steady of [0,85]){const c=setup();try{const count=Math.ceil(hz*.25)+1,path=Array.from({length:count},(_,i)=>point(-1+2*i/(count-1)));draw(c,path,'add',steady,false,1000/hz);for(let x=-1;x<=1;x+=.025)assert(c.active.volume.sampleLocal(point(x))<0,`${hz}Hz, Steady ${steady}, x=${x}`);assert.equal(c.undoCount,1);}finally{c.dispose();}}
 const c=setup();try{draw(c,[point(-.7),point(0,.5),point(.7)],'add',90,true);assert(c.active.volume.sampleLocal(point(0))<0);assert(c.active.volume.sampleLocal(point(0,.5))>0);}finally{c.dispose();}
});
test('free Subtract and Smooth skip empty positive fields and create no undo/remesh work',()=>{
 const c=setup();try{const before=c.active.volume.values.slice();for(const mode of ['subtract','smooth'])draw(c,[point(-.4),point(.4)],mode);assert.deepEqual(c.active.volume.values,before);assert.equal(c.undoCount,0);assert.equal(c.active.mesher.rebuildChunks(),null);}finally{c.dispose();}
});
test('free erase and Smooth affect material with exact undo/redo; cancellation keeps redo',()=>{
 const c=setup();try{draw(c,[point(0)]);const added=c.active.volume.values.slice();draw(c,[point(0)],'subtract');assert(c.active.volume.sampleLocal(point(0))>0);const erased=c.active.volume.values.slice();c.undo();assert.deepEqual(c.active.volume.values,added);c.undo(true);assert.deepEqual(c.active.volume.values,erased);c.undo();draw(c,[point(.07)],'smooth');assert.notDeepEqual(c.active.volume.values,added);c.undo();assert.deepEqual(c.active.volume.values,added);const redo=c.redoCount,s=new ClayStrokeSession(()=>c);s.begin(settings,new ClayPathControls(),0,true);s.sample(point(.5),16);s.cancel();assert.deepEqual(c.active.volume.values,added);assert.equal(c.redoCount,redo);}finally{c.dispose();}
});
test('constructive Add grows before the brush reaches the positive boundary; only affected chunks rebuilt',()=>{
 const c=setup();try{draw(c,[point(.3,.3,.3)]);assert(c.active.lastChanged<c.active.totalChunks);draw(c,[point(1.58)]);const v=c.active.volume,[nx,ny,nz]=v.dimensions;assert(nx>v.resolution);for(let y=0;y<ny;y++)for(let z=0;z<nz;z++)assert(v.values[v.index(nx-1,y,z)]>0);assert(v.sampleLocal(point(1.55))<0);}finally{c.dispose();}
});
test('explicit blank layer creation preserves existing data, voxel spacing, independent storage and native round trip',()=>{
 const c=setup(33);try{const base=c.active.volume,before=base.values.slice(),empty=c.create(128,true);assert.equal(empty.volume.step,3.2/127);assert(empty.volume.values.every(v=>v>0));assert.equal(c.active.triangles,0);draw(c,[point(0)]);assert.deepEqual(base.values,before);const loaded=openSculptProject(saveSculptProject(c.project));assert.equal(loaded.layerStack.layers.length,2);assert.deepEqual(loaded.activeLayer.volume.values,empty.volume.values);}finally{c.dispose();}
});
