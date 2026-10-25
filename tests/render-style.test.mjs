import test from 'node:test';
import assert from 'node:assert/strict';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {LayerDisplayPreferences,validateProjectDisplay} from '../work/test-build/display-preferences.mjs';
import {saveSculptProject,openSculptProject} from '../work/test-build/project.mjs';
const settings={mode:'add',radius:.22,strength:.35,hardness:.5,camera:{position:[2.4,1.7,3.3],target:[0,0,0]}};
const create=()=>new IndependentLayers(createBaseProject(new SDFVolume(25),settings));
const disposeExport=group=>group.traverse(o=>{if(o.isMesh)o.geometry.dispose();});
test('render styles change only existing viewport materials and preserve layer colours, voxel data and geometry',()=>{
 const c=create();try{const id=c.project.activeLayerId,before=c.active.volume.values.slice(),geometry=c.active.surface.group.children.map(m=>m.geometry);c.display.mode='layer-colours';c.display.setColour(c.project.id,id,'#4488cc');
 for(const style of ['normal','matte','glossy','normal']){c.display.renderStyle=style;c.syncPresentation();assert.equal(c.active.material.wireframe,false);assert.equal(c.active.material.roughness,style==='glossy'?.14:style==='matte'?.4:.68);assert.equal(c.active.material.metalness,style==='glossy'?.12:style==='matte'?.06:.03);assert.equal(c.active.material.color.getHexString(),'4488cc');assert.deepEqual(c.active.volume.values,before);assert.deepEqual(c.active.surface.group.children.map(m=>m.geometry),geometry);assert.equal(c.active.mesher.rebuildChunks(),null);assert.equal(c.undoCount,0);const group=c.exportGroup();try{assert(group.children.every(m=>m.material===c.neutral));assert.equal(c.neutral.wireframe,false);assert.equal(c.neutral.roughness,.68);}finally{disposeExport(group);}}
 }finally{c.dispose();}
});
test('Boolean preview uses the selected style without recomposition and exports keep neutral solid material',async()=>{
 const c=create();try{await c.composite.flush();const stats=c.composite.stats,geometries=[];c.composite.group.traverse(o=>{if(o.isMesh)geometries.push(o.geometry);});
 for(const style of ['matte','glossy','normal']){c.display.renderStyle=style;c.syncPresentation();assert.equal(c.composite.pending,false);assert.equal(c.composite.stats,stats);const now=[];c.composite.group.traverse(o=>{if(o.isMesh){now.push(o.geometry);assert.equal(o.material,c.compositeMaterial);assert.equal(o.material.wireframe,false);}});assert.deepEqual(now,geometries);assert.notEqual(c.compositeMaterial,c.neutral);const group=c.composite.exportGroup();try{assert.equal(group.children[0].material,c.neutral);assert.equal(group.children[0].material.wireframe,false);assert.equal(group.children[0].material.roughness,.68);}finally{disposeExport(group);}}
 }finally{c.dispose();}
});
test('render style round trips as optional display metadata; old files default to normal and invalid styles fail',()=>{
 const c=create();try{const display=c.display,stack=c.project.layerStack;assert.equal(display.renderStyle,'normal');const old=saveSculptProject(c.project,display.snapshot(c.project.id,stack.layers));assert.equal(openSculptProject(old).displayPreferences.renderStyle,undefined);
 for(const style of ['matte','glossy']){display.renderStyle=style;const file=saveSculptProject(c.project,display.snapshot(c.project.id,stack.layers)),loaded=openSculptProject(file),runtime=new IndependentLayers(loaded);try{assert.equal(runtime.display.renderStyle,style);assert.deepEqual(loaded.activeLayer.volume.values,c.active.volume.values);}finally{runtime.dispose();}}
 const fresh=new LayerDisplayPreferences();fresh.renderStyle='glossy';fresh.restore(c.project.id,stack.layers,openSculptProject(old).displayPreferences);assert.equal(fresh.renderStyle,'normal');assert.throws(()=>validateProjectDisplay({mode:'clay',colours:{},renderStyle:'broken'},stack.layers.map(l=>l.id)),/rendering style/);assert.throws(()=>saveSculptProject(c.project,{mode:'clay',colours:{},renderStyle:42}),/rendering style/);
 }finally{c.dispose();}
});

test('retired Wireframe preferences migrate to Normal without losing colours or voxel payloads',()=>{
 const c=create();try{const pref=c.display.snapshot(c.project.id,c.project.layerStack.layers);pref.renderStyle='wireframe';pref.colours[c.project.activeLayerId]='#123456';const current=saveSculptProject(c.project,pref),view=new DataView(current),length=view.getUint32(12,true),meta=JSON.parse(new TextDecoder().decode(new Uint8Array(current,16,length)));meta.displayPreferences.renderStyle='wireframe';const json=new TextEncoder().encode(JSON.stringify(meta)),legacy=new Uint8Array(16+json.length+current.byteLength-16-length);legacy.set(new Uint8Array(current,0,16));new DataView(legacy.buffer).setUint32(12,json.length,true);legacy.set(json,16);legacy.set(new Uint8Array(current,16+length),16+json.length);const loaded=openSculptProject(legacy.buffer);assert.equal(loaded.displayPreferences.renderStyle,'normal');assert.equal(loaded.displayPreferences.colours[c.project.activeLayerId],'#123456');assert.deepEqual(loaded.activeLayer.volume.values,c.active.volume.values);}finally{c.dispose();}
});
