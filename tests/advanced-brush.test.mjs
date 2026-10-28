import test from 'node:test';
import assert from 'node:assert/strict';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {ClayStrokeSession} from '../work/test-build/clay-stroke-session.mjs';
import {ClayPathControls} from '../work/test-build/clay-path.mjs';
const modes=['flatten','inflate','scrape'];
for(const resolution of [64,128,192])for(const mode of modes)test(`${mode} ${resolution}: finite, compact support, deterministic and correct sign`,()=>{
 const a=new SDFVolume(resolution),b=new SDFVolume(resolution),before=a.values.slice(),c={x:-.15,y:0,z:.82},r=.26;
 a.brush(c,r,mode,.008,undefined,.3,true);b.brush(c,r,mode,.008,undefined,.3,true);assert.deepEqual(a.values,b.values);
 let count=0;for(let z=0;z<resolution;z++)for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++){
 const i=a.index(x,y,z),v=a.values[i];assert(Number.isFinite(v));if(v===before[i])continue;count++;
 assert(Math.hypot(a.coordinate(x)-c.x,a.coordinate(y)-c.y,a.coordinate(z)-c.z)<r);
 if(mode==='inflate')assert(v<before[i]);if(mode==='scrape')assert(v>before[i]);
 }assert(count>0);
 const empty=new SDFVolume(resolution,1.6,false);empty.values.fill(1);assert.equal(empty.brush(c,r,mode,.01),null);
});
for(const resolution of [64,128,192])for(const mode of modes)for(const buffered of [false,true])test(`${mode} ${resolution} transformed layer, mirror, ${buffered?'Line':'freehand'} staged cancel and exact undo/redo`,()=>{
 const settings={mode,radius:.3,strength:.6,hardness:.2,camera:{position:[2,2,3],target:[0,0,0]}};
 const l=new IndependentLayers(createBaseProject(new SDFVolume(resolution),settings));
 try{
 l.setActiveTransform({position:[-.4,.2,.1],rotation:[.2,.4,.1],scale:[1.2,1.2,1.2]});l.symmetry.enabled=true;
 const before=l.active.volume.values.slice(),history=l.undoCount,session=new ClayStrokeSession(()=>l,()=>{},true),controls=new ClayPathControls();controls.straightLine=buffered;
 const draw=()=>{session.begin(settings,controls,0,true);for(let i=0;i<8;i++)session.sample({x:-.15+i*.015,y:0,z:.82},i*16);session.end();};
 draw();session.cancel();assert.deepEqual(l.active.volume.values,before);assert.equal(l.undoCount,history);
 draw();let n=0;while(session.phase==='committing'&&n++<2000)session.pump();assert.equal(session.phase,'idle');assert.equal(l.undoCount,history+1);
 const after=l.active.volume.values.slice();assert.notDeepEqual(after,before);l.undo();assert.deepEqual(l.active.volume.values,before);l.undo(true);assert.deepEqual(l.active.volume.values,after);
 }finally{l.dispose();}
});
test('Flatten relaxes a curved sphere toward its tangent plane; Scrape never adds',()=>{
 const a=new SDFVolume(128),c={x:0,y:0,z:.85},p={x:.1,y:0,z:.85};const before=a.sampleLocal(p);a.brush(c,.3,'flatten',.01);assert(a.sampleLocal(p)<before);
 const b=new SDFVolume(64),beforeB=b.values.slice();b.brush(c,.3,'scrape',.01);for(let i=0;i<b.values.length;i++)assert(b.values[i]>=beforeB[i]);
});
test('expanded negative lattice uses the same local field coordinates and compact writes',()=>{
 const v=new SDFVolume(64,1.6,false,{dimensions:[80,64,64],latticeMin:[-16,0,0]});
 for(let z=0;z<64;z++)for(let y=0;y<64;y++)for(let x=0;x<80;x++)v.values[v.index(x,y,z)]=Math.hypot(v.coordinate(x)+1.7,v.coordinate(y,1),v.coordinate(z,2))-.35;
 for(const mode of modes){const before=v.values.slice();let count=0;v.brush({x:-1.7,y:0,z:.32},.2,mode,.008,(i,a,b)=>{assert.equal(a,before[i]);count++;});assert(count>0);assert(v.values.every(Number.isFinite));}
});
