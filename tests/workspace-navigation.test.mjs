import test from 'node:test';import assert from 'node:assert/strict';
import {Group,Matrix4,Quaternion,Vector3} from 'three';
import {WorkspaceNavigation} from '../work/test-build/workspace-navigation.mjs';
const pose=(x=0,y=0,z=0)=>new Matrix4().makeTranslation(x,y,z);
const state=(role,id)=>({role,connectionId:id,connected:true,gripTracked:true,buttons:{grip:{pressed:true,justPressed:true}}});
const near=(a,b)=>a.forEach((v,i)=>assert(Math.abs(v-b[i])<1e-8,`${i}: ${v} != ${b[i]}`));
function setup(){const w=new Group(),n=new WorkspaceNavigation(w),s=state('support',2),t=state('tool',1);return {w,n,s,t};}
test('dual identity join, midpoint translation, vector rotation and uniform ratio are anchored',()=>{
 const {w,n,s,t}=setup();w.position.set(0,1,0);n.step(s,pose(-1),t,pose(1));assert.equal(n.state,'two-hand-grab');near(w.position.toArray(),[0,1,0]);
 n.step(s,pose(1,-2),t,pose(1,2));near(w.position.toArray(),[-1,0,0]);near(w.scale.toArray(),[2,2,2]);const expected=w.matrix.clone();for(let i=0;i<200;i++)n.step(s,pose(1,-2),t,pose(1,2));near(w.matrix.elements,expected.elements);
 near(n.startPoses[0].elements,pose(-1).elements);
});
test('either normal release rebases remaining hand with no jump and preserves wrist motion',()=>{
 for(const release of ['support','tool']){const {w,n,s,t}=setup();n.step(s,pose(-1),t,pose(1));n.step(s,pose(-2),t,pose(2));const last=w.matrix.clone();(release==='support'?s:t).buttons.grip.pressed=false;n.step(s,pose(-2),t,pose(2));near(w.matrix.elements,last.elements);assert.equal(n.state,'workspace-grab');
 const p=pose(release==='support'?2:-2);p.multiply(new Matrix4().makeRotationZ(.3));n.step(s,release==='support'?pose(-2):p,t,release==='support'?p:pose(2));assert(w.quaternion.angleTo(new Quaternion())>.2);
 s.buttons.grip.pressed=t.buttons.grip.pressed=false;n.step(s,pose(),t,pose());assert.equal(n.state,'idle');}
});
test('parent conversion, scale limits, collapsed hands and antiparallel direction stay finite',()=>{
 const {w,n,s,t}=setup(),parent=new Group();parent.position.set(2,3,4);parent.rotation.y=.3;parent.scale.setScalar(1.2);parent.add(w);n.step(s,pose(-1),t,pose(1));const initial=w.matrixWorld.clone();n.step(s,pose(-2),t,pose(2));near(w.matrixWorld.elements,new Matrix4().makeScale(2,2,2).multiply(initial).elements);
 n.step(s,pose(-1e6),t,pose(1e6));near(w.scale.toArray(),[100,100,100]);const last=w.matrix.clone();n.step(s,pose(),t,pose());near(w.matrix.elements,last.elements);n.step(s,pose(1),t,pose(-1));near(w.matrix.elements,last.elements);n.step(s,pose(-1),t,pose(1));assert(w.matrix.elements.every(Number.isFinite));
});
test('lost pose, disconnect, replaced identity, invalid matrices and session loss freeze and interrupt',()=>{
 for(const reason of ['tracking','disconnect','identity','invalid','session']){const {w,n,s,t}=setup();n.step(s,pose(-1),t,pose(1));n.step(s,pose(-2),t,pose(2));const last=w.matrix.clone(),p=pose(4);if(reason==='tracking')t.gripTracked=false;if(reason==='disconnect')t.connected=false;if(reason==='identity')t.connectionId=9;if(reason==='invalid')p.elements[0]=NaN;assert.equal(n.step(s,pose(-4),t,p,reason!=='session'),true);assert.equal(n.state,'idle');near(w.matrix.elements,last.elements);}
});
test('tool-only cannot start; swapped physical slots/identities produce identical transforms',()=>{
 const results=[];for(const ids of [[1,2],[2,1]]){const {w,n,s,t}=setup();s.connectionId=ids[0];t.connectionId=ids[1];s.buttons.grip.pressed=false;n.step(s,pose(-1),t,pose(1));assert.equal(n.state,'idle');s.buttons.grip.pressed=true;n.step(s,pose(-1),t,pose(1));n.step(s,pose(0,-2),t,pose(0,2));results.push(w.matrix.elements.slice());}near(results[0],results[1]);
});
