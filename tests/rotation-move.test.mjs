import test from 'node:test';import assert from 'node:assert/strict';import {Vector3} from 'three';
import {RadialMoveField} from '../work/test-build/move-field.mjs';
const make=(interaction='rotate')=>{const f=new RadialMoveField();f.capture(new Vector3(.1,.2,.3),.5,2,1);f.interaction=interaction;f.setRotation(new Vector3(0,1,0),Math.PI/2);return f;};
for(const interaction of ['rotate','twist'])test(`${interaction}: known Rodrigues rotation, pivot, smooth boundary, no drift, bounds and cofactor normals`,()=>{
 const f=make(interaction),out=new Vector3();assert(f.position(f.center,out).equals(f.center));
 for(const offset of [[.1,.1,.04],[.2,-.2,0],[.499999,0,0],[.5,0,0],[.7,0,0],[0,0,0]]){
 const p=f.center.clone().add(new Vector3(...offset)),r=p.clone().sub(f.center),profile=interaction==='twist'?(1+r.y/f.radius)*.5:1,expected=r.clone().applyAxisAngle(f.axis,f.angle*f.weight(p)*profile).add(f.center);
 assert(f.position(p,out).distanceTo(expected)<1e-12);const first=out.clone();for(let i=0;i<100;i++)f.position(p,out);assert(out.equals(first));const alias=p.clone();f.position(alias,alias);assert(alias.distanceTo(first)<1e-12);
 const n=new Vector3(.2,.4,.7).normalize(),u=new Vector3().crossVectors(n,new Vector3(0,1,0)).normalize(),v=new Vector3().crossVectors(n,u),h=1e-6;
 const tangent=t=>f.position(p.clone().addScaledVector(t,h),new Vector3()).sub(f.position(p.clone().addScaledVector(t,-h),new Vector3()));
 const numeric=tangent(u).cross(tangent(v)).normalize(),actual=f.normal(p,n,new Vector3());assert(actual.distanceTo(numeric)<1e-5);
 if(r.length()>=f.radius)assert(out.distanceTo(p)<1e-12);
 }
 const bounds=f.affectedBounds();for(let i=0;i<200;i++){const p=f.center.clone().add(new Vector3(Math.sin(i),Math.cos(i*3),Math.sin(i*7)).multiplyScalar(.25));f.position(p,out);for(let a=0;a<3;a++)assert(out.getComponent(a)>=bounds.min[a]&&out.getComponent(a)<=bounds.max[a]);}
});
test('twist progresses along selected axis and remains finite at clamped large angles',()=>{const f=make('twist');for(const axis of [new Vector3(1,0,0),new Vector3(0,1,0),new Vector3(0,0,1)]){f.setRotation(axis,Math.PI);const tangent=new Vector3(axis.y,axis.z,axis.x).multiplyScalar(.1),angles=[];for(const s of [-.2,0,.2]){const p=f.center.clone().add(tangent).addScaledVector(axis,s),r=f.position(p,new Vector3()).sub(f.center).addScaledVector(axis,-s);angles.push(Math.acos(Math.max(-1,Math.min(1,r.dot(tangent)/r.length()/tangent.length())))/f.weight(p));}assert(angles[0]<angles[1]&&angles[1]<angles[2]);}assert.throws(()=>f.setRotation(new Vector3(),1));assert.throws(()=>f.setRotation(new Vector3(1,0,0),NaN));});
