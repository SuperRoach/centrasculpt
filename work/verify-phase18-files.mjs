import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Matrix4,Vector3,Quaternion} from 'three';
import {openSculptProject} from './test-build/project.mjs';
import {SDFVolume} from './test-build/sdf.mjs';
import {transformMatrix} from './test-build/transform.mjs';
const bytes=await fs.readFile('/Users/brettjames/Downloads/sculpture (5).form');
const project=openSculptProject(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const layers=project.layerStack.layers;assert.equal(layers.length,2);assert.deepEqual(layers.map(l=>l.volume.resolution),[64,128]);assert.equal(layers[1].operation,'difference');
const sourceDetails=layers.map(layer=>{const original=new SDFVolume(layer.volume.resolution).values,values=layer.volume.getDenseView();let changed=0;for(let i=0;i<values.length;i++)if(values[i]!==original[i])changed++;assert.equal(changed,0);return {id:layer.id,name:layer.name,resolution:layer.volume.resolution,operation:layer.operation,order:layer.order,transform:layer.transform,changedVoxels:changed};});
const meta=JSON.parse(bytes.subarray(16,16+bytes.readUInt32LE(12)).toString());assert(!/colour|color|viewport/i.test(JSON.stringify(meta)));
async function glbInfo(path,expected){const data=await fs.readFile(path),json=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString()),nodes=json.nodes.filter(n=>n.mesh!==undefined);assert.equal(nodes.length,expected);assert.equal(json.meshes.length,expected);assert(json.meshes.every(m=>m.primitives.every(p=>!p.attributes.COLOR_0)));
 const triangles=json.meshes.reduce((s,m)=>s+m.primitives.reduce((s,p)=>s+json.accessors[p.indices??p.attributes.POSITION].count/3,0),0);
 return {nodeCount:nodes.length,triangles,nodes,materials:json.materials};}
const separate=await glbInfo('/Users/brettjames/Downloads/form-sculpture (3).glb',2),composite=await glbInfo('/Users/brettjames/Downloads/form-boolean-result.glb',1);
for(const node of separate.nodes){const layer=project.layerStack.get(node.extras.layerId),matrix=node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(new Vector3(...(node.translation??[0,0,0])),new Quaternion(...(node.rotation??[0,0,0,1])),new Vector3(...(node.scale??[1,1,1])));assert(matrix.elements.every((v,i)=>Math.abs(v-transformMatrix(layer.transform).elements[i])<1e-6));}
assert.equal(separate.triangles,159840);assert(composite.triangles>0);assert.notEqual(composite.triangles,separate.triangles);
const afterBytes=await fs.readFile('/Users/brettjames/Downloads/sculpture (6).form');
const after=openSculptProject(afterBytes.buffer.slice(afterBytes.byteOffset,afterBytes.byteOffset+afterBytes.byteLength));
for(const layer of layers){assert.deepEqual(after.layerStack.get(layer.id).metadata(),layer.metadata());assert.deepEqual(after.layerStack.get(layer.id).volume.values,layer.volume.values);}
const brushBytes=await fs.readFile('/Users/brettjames/Downloads/sculpture (7).form'),undoBytes=await fs.readFile('/Users/brettjames/Downloads/sculpture (8).form');
const brush=openSculptProject(brushBytes.buffer.slice(brushBytes.byteOffset,brushBytes.byteOffset+brushBytes.byteLength)),undo=openSculptProject(undoBytes.buffer.slice(undoBytes.byteOffset,undoBytes.byteOffset+undoBytes.byteLength));
const browserBrushChangedVoxels=layers.map(layer=>{let count=0;const changed=brush.layerStack.get(layer.id).volume.values;layer.volume.values.forEach((value,index)=>{if(value!==changed[index])count++;});assert.deepEqual(undo.layerStack.get(layer.id).volume.values,layer.volume.values);return {id:layer.id,name:layer.name,changedVoxels:count};});
assert(browserBrushChangedVoxels[0].changedVoxels>0);assert.equal(browserBrushChangedVoxels[1].changedVoxels,0);
const result={browserBrushChangedVoxels,browserBrushUndoRestoresAllSourcesExactly:true,sourceDataAndMetadataUnchangedAfterBrowserModeSwitchesAndUndo:true,nativeBytesIdentical:bytes.equals(afterBytes),nativeVersion:bytes.readUInt32LE(8),sourceDetails,viewportPreferencesExcluded:true,separateTransformMatricesMatch:true,separate,composite};await fs.writeFile('outputs/phase-1-8-file-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
