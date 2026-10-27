import test from 'node:test';
import assert from 'node:assert/strict';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject,SdfLayer} from '../work/test-build/layers.mjs';
import {LayerDisplayPreferences} from '../work/test-build/display-preferences.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {saveSculptProject,openSculptProject,saveProject} from '../work/test-build/project.mjs';
const settings={mode:'add',radius:.22,strength:.35,hardness:.5,camera:{position:[2.4,1.7,3.3],target:[0,0,0]}};
const metadata=buffer=>JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,16,new DataView(buffer).getUint32(12,true))));
function rewrite(buffer,edit){const data=metadata(buffer);edit(data);const oldLength=new DataView(buffer).getUint32(12,true),json=new TextEncoder().encode(JSON.stringify(data)),result=new Uint8Array(16+json.length+buffer.byteLength-16-oldLength);result.set(new Uint8Array(buffer,0,16));new DataView(result.buffer).setUint32(12,json.length,true);result.set(json,16);result.set(new Uint8Array(buffer,16+oldLength),16+json.length);return result.buffer;}
test('native project restores layer colours by stable ID and display mode in a fresh session',()=>{
 const project=createBaseProject(new SDFVolume(17),settings),a=project.activeLayer,b=new SdfLayer(new SDFVolume(19),{name:'Second',order:1});project.layerStack.insert(b);project.layerStack.move(b.id,0);b.visible=false;b.locked=true;
 const display=new LayerDisplayPreferences();display.mode='layer-colours';display.setColour(project.id,a.id,'#AbCdEf');display.setColour(project.id,b.id,'#123456');display.setColour(project.id,'deleted-layer','#ff0000');
 const buffer=saveSculptProject(project,display.snapshot(project.id,project.layerStack.layers));
 const loaded=openSculptProject(buffer),runtime=new IndependentLayers(loaded);
 try {
  assert.equal(runtime.display.mode,'layer-colours');assert.equal(runtime.display.colour(loaded.id,a.id,1),'#abcdef');assert.equal(runtime.display.colour(loaded.id,b.id,0),'#123456');
  assert.equal(runtime.runtime(a.id).material.color.getHexString(),'abcdef');
  assert.equal(loaded.layerStack.get(b.id).locked,true);assert.equal(loaded.layerStack.get(b.id).visible,false);
  assert.deepEqual(loaded.activeLayer.volume.getDenseView(),b.volume.getDenseView());
  assert.deepEqual(metadata(saveSculptProject(loaded)).displayPreferences,metadata(buffer).displayPreferences);
  assert.equal(Object.keys(metadata(buffer).displayPreferences.colours).length,2);
  const exported=runtime.exportGroup();try{assert.equal(exported.children.length,1);assert(exported.children[0].material.color.equals(runtime.neutral.color));}finally{exported.traverse(node=>{if(node.isMesh)node.geometry.dispose();});}
 } finally {runtime.dispose();}
});
test('Clay mode still saves chosen colours for switching back after loading',()=>{
 const project=createBaseProject(new SDFVolume(9),settings),display=new LayerDisplayPreferences();display.mode='clay';display.setColour(project.id,project.activeLayerId,'#456789');
 const loaded=openSculptProject(saveSculptProject(project,display.snapshot(project.id,project.layerStack.layers))),runtime=new IndependentLayers(loaded);
 try{assert.equal(runtime.display.mode,'clay');assert(runtime.active.material.color.equals(runtime.neutral.color));runtime.display.mode='layer-colours';runtime.syncPresentation();assert.equal(runtime.active.material.color.getHexString(),'456789');}finally{runtime.dispose();}
});
test('old v3 and legacy single-volume projects load without display metadata',()=>{
 const project=createBaseProject(new SDFVolume(9),settings);
 for(const buffer of [saveSculptProject(project),saveProject(new SDFVolume(9),settings)]){
  const loaded=openSculptProject(buffer),runtime=new IndependentLayers(loaded);
  try{assert.equal(loaded.displayPreferences,undefined);assert.equal(runtime.display.mode,'layer-colours');assert.match(runtime.display.colour(loaded.id,loaded.activeLayerId,0),/^#[0-9a-f]{6}$/);}finally{runtime.dispose();}
 }
});
test('invalid display preferences fail validation on save and load',()=>{
 const project=createBaseProject(new SDFVolume(9),settings),id=project.activeLayerId,buffer=saveSculptProject(project);
 for(const bad of [null,{mode:'other',colours:{}},{mode:'clay',colours:[]},{mode:'clay',colours:{[id]:'red'}},{mode:'clay',colours:{missing:'#112233'}}]){
  assert.throws(()=>saveSculptProject(project,bad),/display|colour/);
  assert.throws(()=>openSculptProject(rewrite(buffer,data=>{data.displayPreferences=bad;})),/display|colour/);
 }
});
