import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {openSculptProject} from './test-build/project.mjs';
const read=async path=>{const bytes=await fs.readFile(path);return {bytes,project:openSculptProject(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))};};
const original=await read('/Users/brettjames/Downloads/sculpture (9).form'),before=await read('/Users/brettjames/Downloads/sculpture (12).form'),after=await read('/Users/brettjames/Downloads/sculpture (13).form');
assert.equal(before.project.layerStack.layers.length,3);assert.equal(after.project.layerStack.layers.length,3);assert.equal(before.project.activeLayerId,after.project.activeLayerId);assert.equal(before.project.id,original.project.id);
const layers=before.project.layerStack.layers.map(layer=>{
 const next=after.project.layerStack.get(layer.id),saved=original.project.layerStack.get(layer.id);assert.deepEqual(next.metadata(),layer.metadata());assert.deepEqual(saved.metadata(),layer.metadata());
 let changed=0,fromOriginal=0;for(let i=0;i<layer.volume.values.length;i++){if(next.volume.values[i]!==layer.volume.values[i])changed++;if(saved.volume.values[i]!==layer.volume.values[i])fromOriginal++;}
 assert.equal(changed,0);assert.equal(fromOriginal,0);
 return {id:layer.id,name:layer.name,resolution:layer.volume.resolution,changedVoxels:changed,changedFromSavedPhase19:fromOriginal,metadataUnchanged:true,voxelSHA256:createHash('sha256').update(new Uint8Array(layer.volume.values.buffer)).digest('hex')};
});
assert(before.bytes.equals(after.bytes),'native files before/after preview controls must be byte-identical');
const len=after.bytes.readUInt32LE(12),metadata=JSON.parse(after.bytes.subarray(16,16+len).toString());assert.equal(metadata.shapePreview,undefined);assert.equal(metadata.history,undefined);assert(metadata.layers.every(l=>l.shapePreview===undefined&&l.previewOnly===undefined));
async function inspectGlb(path){const bytes=await fs.readFile(path),json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString()),nodes=json.nodes.filter(n=>n.mesh!==undefined);assert.equal(nodes.length,1);assert.equal(json.meshes.length,1);assert(!JSON.stringify(json).includes('Shape Ghost'));assert(!JSON.stringify(json).includes('previewOnly'));assert(json.materials.every(m=>m.alphaMode!=='BLEND'));
 const triangles=json.meshes.reduce((sum,m)=>sum+m.primitives.reduce((sum,p)=>sum+json.accessors[p.indices??p.attributes.POSITION].count/3,0),0);assert.equal(triangles,121172);return {nodes:nodes.map(n=>({name:n.name,layerId:n.extras?.layerId})),triangles,materialCount:json.materials.length,ghostExcluded:true};}
const separate=await inspectGlb('/Users/brettjames/Downloads/form-sculpture (5).glb'),composite=await inspectGlb('/Users/brettjames/Downloads/form-boolean-result (2).glb');
const result={nativeVersion:after.bytes.readUInt32LE(8),nativeBytesBeforeAfterIdentical:true,savedPhase19DataPreserved:true,layers,previewMetadataExcluded:true,browserHistoryObserved:'0 undo · 0 redo',browserGeometryCacheObserved:'4/4 cached shapes',browserSculptTrianglesUnchanged:121172,separate,composite};
await fs.writeFile('outputs/phase-1-10-file-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
