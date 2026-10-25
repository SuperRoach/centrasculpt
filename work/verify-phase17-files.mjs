import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Matrix4,Vector3,Quaternion} from 'three';
import {openSculptProject} from './test-build/project.mjs';
import {SDFVolume} from './test-build/sdf.mjs';
import {transformMatrix} from './test-build/transform.mjs';
const bytes=await fs.readFile('/Users/brettjames/Downloads/sculpture (4).form');
const project=openSculptProject(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const layers=project.layerStack.layers;
assert.equal(layers.length,2);
const details=layers.map(layer=>{
 const values=layer.volume.getDenseView(),original=new SDFVolume(layer.volume.resolution).values;
 let changed=0;for(let i=0;i<values.length;i++)if(values[i]!==original[i])changed++;
 return {id:layer.id,name:layer.name,resolution:layer.volume.resolution,transform:layer.transform,changedVoxels:changed};
});
assert.equal(details[0].resolution,64);assert.equal(details[1].resolution,128);
assert.equal(details[0].changedVoxels,0);assert(details[1].changedVoxels>0);
assert.deepEqual(details[0].transform.position,[-.85,0,0]);assert.deepEqual(details[1].transform.position,[.75,0,0]);
for(const d of details)assert.deepEqual(d.transform.scale,[.8,.8,.8]);
assert(Math.abs(details[0].transform.rotation[2]+Math.PI/6)<1e-10);
assert(Math.abs(details[1].transform.rotation[1]-35*Math.PI/180)<1e-10);
const glb=await fs.readFile('/Users/brettjames/Downloads/form-sculpture (2).glb');
const json=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString());
const nodes=json.nodes.filter(n=>n.mesh!==undefined);assert.equal(nodes.length,2);assert.equal(json.meshes.length,2);
for(const node of nodes){
 const layer=project.layerStack.get(node.extras.layerId);
 const matrix=node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(new Vector3(...(node.translation??[0,0,0])),new Quaternion(...(node.rotation??[0,0,0,1])),new Vector3(...(node.scale??[1,1,1])));
 assert(matrix.elements.every((v,i)=>Math.abs(v-transformMatrix(layer.transform).elements[i])<1e-6));
}
const metadata=JSON.parse(bytes.subarray(16,16+bytes.readUInt32LE(12)).toString());
assert(!/colour|color|viewportMode/i.test(JSON.stringify(metadata)));
const result={nativeVersion:bytes.readUInt32LE(8),layers:details,viewportPreferencesExcluded:true,glbSeparateNodes:nodes.map(n=>({name:n.name,layerId:n.extras.layerId,matrix:n.matrix,translation:n.translation,rotation:n.rotation,scale:n.scale})),glbMatricesMatchNative:true,glbMaterials:json.materials,camera:project.settings.camera};
await fs.writeFile('outputs/phase-1-7-file-verification.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
