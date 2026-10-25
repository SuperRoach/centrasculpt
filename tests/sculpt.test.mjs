import test from 'node:test';
import assert from 'node:assert/strict';
import { SDFVolume } from '../work/test-build/sdf.mjs';
import { ClayStroke } from '../work/test-build/stroke.mjs';
import { IncrementalMesher, extractMesh } from '../work/test-build/mesh.mjs';
const center={x:0,y:0,z:0.8};
const maxDifference=(a,b)=>a.reduce((max,v,i)=>Math.max(max,Math.abs(v-b[i])),0);
function checkBoundary(volume,baseline) {
 const n=volume.resolution;
 for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++) {
  if(x===0||y===0||z===0||x===n-1||y===n-1||z===n-1) {
   const i=volume.index(x,y,z); assert.equal(volume.values[i],baseline[i]); assert(volume.values[i]>0);
  }
 }
}
test('Add and Subtract have opposite signs, compact support, smooth radial falloff and exact reset',()=>{
 const v=new SDFVolume(33), original=v.values.slice();
 const c={x:0,y:0,z:0.8}, radius=0.4;
 v.brush(c,radius,'add',0.02);
 let count=0;
 for(let z=0;z<33;z++)for(let y=0;y<33;y++)for(let x=0;x<33;x++) {
  const i=v.index(x,y,z), distance=Math.hypot(v.coordinate(x),v.coordinate(y),v.coordinate(z)-c.z);
  assert(v.values[i]<=original[i]);
  if(distance>=radius)assert.equal(v.values[i],original[i]);
  else { assert(Math.abs(v.values[i]-(original[i]-0.02*(1-(distance/radius)**2)**2))<1e-6); count++; }
 }
 assert(count>20);
 v.reset(); assert.deepEqual(v.values,original);
 v.brush(c,radius,'subtract',0.02);
 assert(v.values.some((value,i)=>value>original[i]));
 assert(v.values.every((value,i)=>value>=original[i]));
 checkBoundary(v,original);
});
test('zero strength and invalid input are no-ops',()=>{
 const v=new SDFVolume(17), original=v.values.slice();
 for(const amount of [0,-1,NaN,Infinity])assert.equal(v.brush(center,0.3,'add',amount),null);
 for(const radius of [0,-1,NaN,Infinity])assert.equal(v.brush(center,radius,'smooth',1),null);
 assert.equal(v.brush({x:NaN,y:0,z:0},0.3,'add',1),null);
 assert.deepEqual(v.values,original);
});
test('clay strength is proportional and stationary strokes are frame-rate independent',()=>{
 function run(fps,strength) {
  const v=new SDFVolume(25), stroke=new ClayStroke();
  for(let i=0;i<fps;i++)stroke.apply(v,center,0.3,'add',strength,1/fps);
  return v;
 }
 const v30=run(30,0.5), v60=run(60,0.5), v120=run(120,0.5), weak=run(60,0.25);
 assert(maxDifference(v30.values,v60.values)<2e-6);
 assert(maxDifference(v60.values,v120.values)<2e-6);
 const base=new SDFVolume(25);
 for(let i=0;i<base.values.length;i++)assert(Math.abs((base.values[i]-weak.values[i])*2-(base.values[i]-v60.values[i]))<4e-6);
});
test('moving strokes insert dabs between endpoints and reset breaks the connection',()=>{
 const v=new SDFVolume(33), original=v.values.slice(), stroke=new ClayStroke();
 stroke.apply(v,{x:-0.6,y:0,z:0.8},0.2,'subtract',1,1/60);
 stroke.apply(v,{x:0.6,y:0,z:0.8},0.2,'subtract',1,1/60);
 assert(v.values[v.index(16,16,24)]>original[v.index(16,16,24)]);
 const other=new SDFVolume(33), second=new ClayStroke();
 second.apply(other,{x:-0.6,y:0,z:0.8},0.2,'subtract',1,1/60); second.reset();
 second.apply(other,{x:0.6,y:0,z:0.8},0.2,'subtract',1,1/60);
 assert.equal(other.values[other.index(16,16,24)],original[other.index(16,16,24)]);
});
test('Smooth is a snapshot-based convex neighborhood filter without directional bias',()=>{
 const v=new SDFVolume(17), n=17;
 // An isolated spike in a constant field makes the exact Jacobi result predictable.
 v.values.fill(0); const middle=v.index(8,8,8); v.values[middle]=1;
 const before=v.values.slice(), radius=0.8;
 v.brush({x:0,y:0,z:0},radius,'smooth',0.6);
 for(let z=1;z<n-1;z++)for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++) {
  const i=v.index(x,y,z), d=Math.hypot(v.coordinate(x),v.coordinate(y),v.coordinate(z))/radius;
  const average=(before[i-1]+before[i+1]+before[i-n]+before[i+n]+before[i-n*n]+before[i+n*n])/6;
  const expected=d<1?before[i]+(average-before[i])*0.6*(1-d*d)**2:before[i];
  assert(Math.abs(v.values[i]-expected)<1e-7);
 }
 assert(v.values[middle]<1);
 assert.equal(v.values[middle-1],v.values[middle+1]);
});
test('repeated smoothing reduces noise without overshoot and preserves boundary samples',()=>{
 const v=new SDFVolume(25), boundary=v.values.slice(), n=v.resolution;
 for(let z=8;z<17;z++)for(let y=8;y<17;y++)for(let x=8;x<17;x++)v.values[v.index(x,y,z)]+=((x+y+z)%2?1:-1)*0.06;
 const min=Math.min(...v.values),max=Math.max(...v.values);
 const roughness=()=>{let sum=0;for(let z=9;z<16;z++)for(let y=9;y<16;y++)for(let x=9;x<16;x++){const i=v.index(x,y,z);sum+=(v.values[i]-(v.values[i-1]+v.values[i+1]+v.values[i-n]+v.values[i+n]+v.values[i-n*n]+v.values[i+n*n])/6)**2;}return sum;};
 const before=roughness();
 for(let i=0;i<100;i++)v.brush({x:0,y:0,z:0},1.4,'smooth',10);
 assert(roughness()<before*0.1);
 assert(v.values.every(value=>Number.isFinite(value)&&value>=min&&value<=max));
 checkBoundary(v,boundary);
});
test('Smooth strength and elapsed time control relaxation consistently',()=>{
 function run(fps,strength) {
  const v=new SDFVolume(17), stroke=new ClayStroke();v.values.fill(0);v.values[v.index(8,8,12)]=0.1;
  for(let i=0;i<fps;i++)stroke.apply(v,center,0.5,'smooth',strength,1/fps);
  return v;
 }
 const a=run(30,0.5),b=run(60,0.5),c=run(120,0.5);
 assert(maxDifference(a.values,b.values)<1e-6);assert(maxDifference(b.values,c.values)<1e-6);
 assert(run(60,0.1).values[a.index(8,8,12)]>b.values[a.index(8,8,12)]);
});
test('mixed prolonged strokes remain finite and do not modify the volume boundary',()=>{
 const v=new SDFVolume(17), baseline=v.values.slice();
 for(let i=0;i<500;i++) {
  v.brush({x:Math.sin(i)*1.3,y:Math.cos(i)*1.3,z:0},0.7,['add','subtract','smooth'][i%3],100);
 }
 assert(v.values.every(value=>Number.isFinite(value)&&Math.abs(value)<=v.extent*4));
 checkBoundary(v,baseline);
});
test('sphere mesh has outward, unit SDF-gradient normals with matching shared vertices',()=>{
 const volume=new SDFVolume(25), geometry=extractMesh(volume), positions=geometry.getAttribute('position'), normals=geometry.getAttribute('normal'), shared=new Map();
 assert(positions.count>1000);
 for(let i=0;i<positions.count;i++) {
  const p=[positions.getX(i),positions.getY(i),positions.getZ(i)],normal=[normals.getX(i),normals.getY(i),normals.getZ(i)];
  assert(Math.abs(Math.hypot(...normal)-1)<1e-6);
  assert(p.reduce((sum,v,j)=>sum+v*normal[j],0)/Math.hypot(...p)>0.995);
  const key=p.map(v=>v.toFixed(6)).join(',');
  if(shared.has(key))assert(maxDifference(normal,shared.get(key))<1e-5);else shared.set(key,normal);
 }
 geometry.dispose();
});
function records(geometry) {
 const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal'),result=[];
 for(let i=0;i<positions.count;i++)result.push([positions.getX(i),positions.getY(i),positions.getZ(i),normals.getX(i),normals.getY(i),normals.getZ(i)].map(v=>v.toFixed(5)).join(','));
 return result.sort();
}
test('incremental extraction matches full extraction across chunk boundaries, including normals',()=>{
 const v=new SDFVolume(25), mesher=new IncrementalMesher(v,6);
 mesher.rebuild().geometry.dispose(); assert.equal(mesher.rebuild(),null);
 for(const center of [{x:0,y:0,z:0.8},{x:0.8,y:0,z:0},{x:-0.8,y:0.1,z:0}]) {
  for(const mode of ['add','subtract','smooth']) {
   mesher.invalidate(v.brush(center,0.24,mode,mode==='smooth'?0.5:0.025));
   const update=mesher.rebuild(), full=extractMesh(v);
   assert(update.stats.chunks<update.stats.totalChunks);
   assert.deepEqual(records(update.geometry),records(full));
   update.geometry.dispose();full.dispose();
  }
 }
 v.reset();mesher.invalidate();const reset=mesher.rebuild(), full=extractMesh(v);
 assert.deepEqual(records(reset.geometry),records(full));reset.geometry.dispose();full.dispose();
});
test('default-resolution rebuild benchmark reports local chunk reuse and idle skip',()=>{
 const v=new SDFVolume(),mesher=new IncrementalMesher(v);
 const initial=mesher.rebuild();initial.geometry.dispose();
 const times=[];let changed=0;
 for(let i=0;i<5;i++) {
  mesher.invalidate(v.brush(center,0.22,'add',0.004));
  const result=mesher.rebuild();times.push(result.stats.milliseconds);changed=result.stats.chunks;
  assert(changed<result.stats.totalChunks);assert(Number.isFinite(result.stats.averageMilliseconds));result.geometry.dispose();
 }
 assert.equal(mesher.rebuild(),null);
 console.log(`Reference rebuild benchmark (chunk extraction only; combined reference buffer not timed): full ${initial.stats.milliseconds.toFixed(1)} ms, local median ${times.sort((a,b)=>a-b)[2].toFixed(1)} ms; ${changed}/${initial.stats.totalChunks} chunks re-extracted.`);
});
