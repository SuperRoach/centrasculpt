import './compile-core.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {Group,Matrix4} from 'three';
import {createReference} from '../work/test-build/reference-images.mjs';
import {ReferenceView} from '../work/test-build/reference-view.mjs';
import {Turntable,defaultTurntable} from '../work/test-build/turntable.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
const bytes=new Uint8Array(readFileSync('outputs/phase-4-5/orientation.png')),rows=[];
globalThis.createImageBitmap=async()=>({width:480,height:240,close(){}});
for(const resolution of [64,128,192]){
 const layers=new IndependentLayers(createBaseProject(new SDFVolume(resolution),{mode:'add',radius:.22,strength:.35,hardness:0,camera:{position:[2,2,3],target:[0,0,0]}})),workspace=new Group(),table=new Turntable();workspace.add(table.group);table.group.add(layers.group);
 const records=Array.from({length:6},(_,i)=>({...createReference(bytes,'sample',String(i)),space:i%2?'sculpture':'workspace'})),view=new ReferenceView(()=>records,workspace,table.group);view.sync();await new Promise(r=>setImmediate(r));view.sync();const geometry=layers.active.surface.group.children.map(m=>m.geometry),textures=[...view.panels.values()].map(p=>p.texture),times=[];table.enabled=true;
 for(let i=0;i<900;i++){const start=performance.now();table.step(i*11,defaultTurntable());view.sync();times.push(performance.now()-start);}times.sort((a,b)=>a-b);
 const unchanged=layers.active.surface.group.children.every((m,i)=>m.geometry===geometry[i])&&layers.active.mesher.rebuildChunks()===null;
 if(!unchanged||layers.undoCount)throw new Error('Reference presentation changed source.');
 rows.push({resolution,count:6,updates:900,totalCPU:times.reduce((a,b)=>a+b,0),p95:times[855],max:times.at(-1),sameTextures:[...view.panels.values()].every((p,i)=>p.texture===textures[i]),unchangedSource:unchanged,undo:layers.undoCount});view.dispose();layers.dispose();
}
const report={description:'Host CPU only. Six cached panels (three in each attachment space), turntable plus sync. Mock bitmap decoder; excludes decoding, rendering, GPU, DOM/menu, Quest and texture upload. Source mesh identity/remesh/history assertions at 64/128/192.',rows};writeFileSync('outputs/phase-4-5/reference-benchmark.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
