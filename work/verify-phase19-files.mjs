import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Matrix4,Vector3,Quaternion} from 'three';
import {openSculptProject} from './test-build/project.mjs';
import {prepareComposite} from './test-build/compositor.mjs';
import {planBake} from './test-build/bake.mjs';
import {transformMatrix} from './test-build/transform.mjs';
const read=async path=>{const bytes=await fs.readFile(path);return {bytes,project:openSculptProject(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))};};
const original=await read('/Users/brettjames/Downloads/sculpture (8).form'),baked=await read('/Users/brettjames/Downloads/sculpture (9).form'),brushed=await read('/Users/brettjames/Downloads/sculpture (10).form'),reloaded=await read('/Users/brettjames/Downloads/sculpture (11).form');
assert.equal(baked.project.layerStack.layers.length,3);const output=baked.project.activeLayer;assert.equal(output.name,'Baked subtraction');assert.equal(output.volume.resolution,128);assert(output.visible&&!output.locked);assert.equal(output.operation,'union');
const sources=original.project.layerStack.layers.map(layer=>{const next=baked.project.layerStack.get(layer.id);assert.deepEqual(next.volume.values,layer.volume.values);assert.deepEqual({...next.metadata(),visible:true},layer.metadata());assert.equal(next.visible,false);return {id:layer.id,name:layer.name,resolution:layer.volume.resolution,sourceDataUnchanged:true,sourceMetadataUnchangedExceptVisibility:true,hiddenAfterBake:true};});
const plan=planBake(original.project,128),sample=prepareComposite(original.project.layerStack.layers),volume=output.volume,n=volume.resolution,s=output.transform.scale[0];assert.deepEqual(output.transform.position,plan.center);assert.equal(s,plan.scale);
let maxError=0;for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
 const expected=Math.fround(Math.max(-6.4,Math.min(6.4,sample(volume.coordinate(x)*s+plan.center[0],volume.coordinate(y)*s+plan.center[1],volume.coordinate(z)*s+plan.center[2])/s)));
 maxError=Math.max(maxError,Math.abs(volume.values[volume.index(x,y,z)]-expected));}
assert(maxError<1e-6);
const brushChanges=baked.project.layerStack.layers.map(layer=>{const next=brushed.project.layerStack.get(layer.id);let count=0;layer.volume.values.forEach((v,i)=>{if(v!==next.volume.values[i])count++;});if(layer.id===output.id)assert(count>0);else assert.equal(count,0);return {id:layer.id,name:layer.name,changedVoxels:count};});
for(const layer of baked.project.layerStack.layers){const next=reloaded.project.layerStack.get(layer.id);assert.deepEqual(next.metadata(),layer.metadata());assert.deepEqual(next.volume.values,layer.volume.values);}assert.equal(reloaded.project.activeLayerId,output.id);
const length=baked.bytes.readUInt32LE(12),metadata=JSON.parse(baked.bytes.subarray(16,16+length).toString());assert(!/colour|color|viewport|bakeHistory/i.test(JSON.stringify(metadata)));
async function glb(path){const bytes=await fs.readFile(path),json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString()),nodes=json.nodes.filter(n=>n.mesh!==undefined);assert.equal(nodes.length,1);assert.equal(json.meshes.length,1);const triangles=json.meshes.reduce((sum,m)=>sum+m.primitives.reduce((s,p)=>s+json.accessors[p.indices??p.attributes.POSITION].count/3,0),0);return {nodes,triangles,materials:json.materials};}
const separate=await glb('/Users/brettjames/Downloads/form-sculpture (4).glb'),composite=await glb('/Users/brettjames/Downloads/form-boolean-result (1).glb');assert.equal(separate.nodes[0].extras.layerId,output.id);assert.equal(separate.triangles,121172);assert.equal(composite.triangles,121172);
const node=separate.nodes[0],matrix=node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(new Vector3(...(node.translation??[0,0,0])),new Quaternion(...(node.rotation??[0,0,0,1])),new Vector3(...(node.scale??[1,1,1])));assert(matrix.elements.every((v,i)=>Math.abs(v-transformMatrix(output.transform).elements[i])<1e-6));
const result={nativeVersion:baked.bytes.readUInt32LE(8),sources,bakedLayer:{...output.metadata(),resolution:128,bounds:volume.worldBounds(output.transform)},maximumDestinationSampleError:maxError,brushChanges,nativeRoundTripDataAndMetadataExact:true,nativeRoundTripBytesIdentical:baked.bytes.equals(reloaded.bytes),viewportPreferencesExcluded:true,separate,composite};await fs.writeFile('outputs/phase-1-9-file-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
