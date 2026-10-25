import test from 'node:test';
import assert from 'node:assert/strict';
import {newId,createBaseProject} from '../work/test-build/layers.mjs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
test('HTTP LAN contexts without crypto.randomUUID still create independent valid project/layer IDs',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis.crypto,'randomUUID');
 Object.defineProperty(globalThis.crypto,'randomUUID',{value:undefined,configurable:true});
 try {
  const ids=Array.from({length:100},()=>newId());assert.equal(new Set(ids).size,100);
  for(const id of ids)assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const p=createBaseProject(new SDFVolume(9),{mode:'add',radius:.22,strength:.35,hardness:.5,camera:{position:[2.4,1.7,3.3],target:[0,0,0]}});assert.notEqual(p.id,p.activeLayerId);
 }finally{if(original)Object.defineProperty(globalThis.crypto,'randomUUID',original);else delete globalThis.crypto.randomUUID;}
});
