import test from 'node:test';
import assert from 'node:assert/strict';
import {IncrementalMesher,extractMesh} from '../work/test-build/mesh.mjs';
import {prepareDenseGrowth} from '../work/test-build/dense-growth.mjs';
import {qualityVolume,qualityMetrics} from '../scripts/fixtures/mesh-quality.mjs';
const geometries=m=>m.snapshotUpdates().map(u=>u.geometry);
for(const kind of ['sphere','box','triangular-prism','pyramid','aligned-box','thin-stroke','narrow-groove'])test(`quality: ${kind} has no collapsed triangles and bounded analytic surface error`,()=>{
 const {volume,field}=qualityVolume(33,kind),before=volume.values.slice(),m=new IncrementalMesher(volume,8);
 try{m.rebuildChunks();const q=qualityMetrics(geometries(m),field,volume.step,kind==='sphere');assert(q.triangles>0);assert.equal(q.degenerate,0);assert(q.maxSurfaceProbeErrorVoxels<.6);assert(q.maxSeamNormalDelta<1e-6);assert.deepEqual(volume.values,before);
  // A closed fixture must have two incident faces per welded, nonzero edge.
  const edges=new Map();for(const g of geometries(m)){const p=g.attributes.position;for(let i=0;i<p.count;i+=3){const keys=[0,1,2].map(j=>[p.getX(i+j),p.getY(i+j),p.getZ(i+j)].map(v=>(Math.abs(v)<.5e-6?0:v).toFixed(6)).join(','));for(let j=0;j<3;j++){const k=[keys[j],keys[(j+1)%3]].sort().join('|');edges.set(k,(edges.get(k)??0)+1);}}}for(const count of edges.values())assert.equal(count,2);
 }finally{m.dispose();}
});
test('quality: finer sphere grids improve geometry and normals independently of material',()=>{
 const rows=[];for(const n of [33,64,96]){const {volume,field}=qualityVolume(n,'sphere'),g=extractMesh(volume);rows.push(qualityMetrics([g],field,volume.step,true));g.dispose();}
 for(let i=1;i<rows.length;i++){assert(rows[i].maxSurfaceProbeError<rows[i-1].maxSurfaceProbeError*.6);assert(rows[i].maxNormalDegrees<rows[i-1].maxNormalDegrees*.6);}
});
test('quality: cell edge reuse cuts gradient evaluations without changing their values',()=>{
 const {volume}=qualityVolume(33,'sphere'),normal=volume.normalAt.bind(volume);let calls=0;volume.normalAt=p=>{calls++;return normal(p);};const g=extractMesh(volume),p=g.attributes.position,n=g.attributes.normal;
 assert(calls<p.count*.45,`${calls}/${p.count}`);for(let i=0;i<p.count;i++){const expected=normal([p.getX(i),p.getY(i),p.getZ(i)]);assert(Math.hypot(n.getX(i)-expected[0],n.getY(i)-expected[1],n.getZ(i)-expected[2])<2e-6);}g.dispose();
});
test('quality: growth and local seam edit agree with full extraction and preserve untouched buffers',()=>{
 const {volume}=qualityVolume(64,'sphere'),m=new IncrementalMesher(volume,8);m.rebuildChunks();const grown=prepareDenseGrowth(volume,{min:[-2.1,-1,-1],max:[2.1,1,1]}).volume;m.rebindVolume(grown);m.rebuildChunks();const prior=geometries(m);
 m.invalidate(grown.brush({x:grown.coordinate(32,0),y:0,z:.85},.2,'subtract',.02));const update=m.rebuildChunks();assert(update.updates.length<m.allocatedChunks);assert(geometries(m).some(g=>prior.includes(g)));
 const full=extractMesh(grown),sort=gs=>gs.flatMap(g=>{const p=g.attributes.position,n=g.attributes.normal;return Array.from({length:p.count},(_,i)=>[p.getX(i),p.getY(i),p.getZ(i),n.getX(i),n.getY(i),n.getZ(i)].join(','));}).sort();assert.deepEqual(sort(geometries(m)),sort([full]));full.dispose();m.dispose();
});
test('quality: three groove Move reconstructions retain bounded preview error and exact undo/redo',async()=>{
 const {IndependentLayers}=await import('../work/test-build/independent-layers.mjs'),{createBaseProject}=await import('../work/test-build/layers.mjs'),{RadialMoveField}=await import('../work/test-build/move-field.mjs'),{Vector3}=await import('three');
 const settings={mode:'add',radius:.22,strength:.35,hardness:.5,camera:{position:[2,2,3],target:[0,0,0]}};
 for(const n of [33,64]){const {volume}=qualityVolume(n,'narrow-groove'),l=new IndependentLayers(createBaseProject(volume,settings)),states=[{values:volume.values.slice(),dimensions:volume.dimensions,min:volume.latticeMin}];try{
  for(let pass=0;pass<3;pass++){
   const f=new RadialMoveField();f.capture(new Vector3(0,0,.7+.08*pass),.3,2,1);f.setDisplacement(new Vector3(.02,0,.08));const probes=[],p=new Vector3();
   for(const m of l.active.surface.group.children){const a=m.geometry.attributes.position;for(let i=0;i<a.count;i+=17){p.fromBufferAttribute(a,i);if(f.weight(p)>.05)probes.push(f.position(p,new Vector3()));}}
   assert(probes.length);const owner={};l.beginPreview(owner);try{assert(await l.commitMove(owner,f,new AbortController().signal,()=>{}));}finally{l.endPreview(owner);}
   for(const p of probes)assert(Math.abs(l.active.volume.sampleLocal(p))/volume.step<.8);assert.equal(l.undoCount,pass+1);states.push({values:l.active.volume.values.slice(),dimensions:l.active.volume.dimensions,min:l.active.volume.latticeMin});
  }
  const exact=state=>{const v=l.active.volume,d=v.dimensions;let mismatches=0;
   for(let z=0;z<d[2];z++)for(let y=0;y<d[1];y++)for(let x=0;x<d[0];x++){
    const p=[x,y,z].map((a,k)=>a+v.latticeMin[k]-state.min[k]),inside=p.every((a,k)=>a>=0&&a<state.dimensions[k]);
    const expected=inside?state.values[p[0]+state.dimensions[0]*(p[1]+state.dimensions[1]*p[2])]:Math.fround(v.extent*4);if(v.values[v.index(x,y,z)]!==expected)mismatches++;
   }assert.equal(mismatches,0,'exact samples, including retained empty growth capacity');
  };
  for(let i=2;i>=0;i--){l.undo();exact(states[i]);}for(let i=1;i<4;i++){l.undo(true);exact(states[i]);}
 }finally{l.dispose();}}
});
