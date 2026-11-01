import './compile-core.mjs';
import {writeFileSync,mkdirSync} from 'node:fs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {exportGlbAsync} from '../work/test-build/export-client.mjs';
import {ExportBrowserWorker} from './fixtures/node-export-worker.mjs';
import {parseSTL} from '../work/test-build/stl.mjs';
import {readGlb} from './fixtures/export-node.mjs';
globalThis.Worker=ExportBrowserWorker;
mkdirSync('outputs/phase-5-3/download-check',{recursive:true});
const l=new IndependentLayers(createBaseProject(new SDFVolume(64),{mode:'add',radius:.22,strength:.35,hardness:0,camera:{position:[2,2,3],target:[0,0,0]}}));
try{for(const format of ['stl','glb']){const r=await exportGlbAsync(l.exportSources(),'fast',format==='stl'?{stlMM:100}:{});writeFileSync(`outputs/phase-5-3/download-check/sphere.${format}`,new Uint8Array(r.data));if(format==='stl')console.log({format,bytes:r.data.byteLength,triangles:parseSTL(new Uint8Array(r.data)).length/9,dimensions:r.report.dimensions});else{const view=new DataView(r.data);if(view.getUint32(0,true)!==0x46546c67)throw Error('Not a binary GLB');const parsed=await readGlb(r.data);console.log({format,bytes:r.data.byteLength,magic:'glTF',version:view.getUint32(4,true),meshes:parsed.scene.children.length});}}}finally{l.dispose();}
