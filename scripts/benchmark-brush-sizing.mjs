import './compile-core.mjs';
import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import {Group} from 'three';
import {EditorToolState} from '../work/test-build/editor-tool-state.mjs';
import {XRBrushSizing} from '../work/test-build/xr-brush-sizing.mjs';
import {XRBrushPreview} from '../work/test-build/xr-brush-preview.mjs';
import {ShapePreviewModel} from '../work/test-build/shape-preview.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
let settings={mode:'add',radius:.22,strength:.35,hardness:.4,camera:{position:[2,2,3],target:[0,0,0]}};
const layers=new IndependentLayers(createBaseProject(new SDFVolume(17),settings)),shape=new ShapePreviewModel(layers.project.activeLayerId),tools=new EditorToolState({layers:()=>layers,shape,settings:()=>settings,setSettings:v=>settings=v,mode:()=> 'sculpt',selectTool(){},selectTransform(){},busy:()=>false,changed(){}}),sizing=new XRBrushSizing(tools),preview=new XRBrushPreview(new Group()),s={role:'tool',connectionId:1,connected:true,tracked:true,gripTracked:true,stick:{available:true,x:0,y:0},buttons:{grip:{pressed:false,rawValue:0},trigger:{pressed:false,rawValue:0}}},states=[s];let frame=0;
const measure=fn=>{for(let i=0;i<2000;i++)fn(i);const samples=[];for(let b=0;b<10;b++){const start=performance.now();for(let i=0;i<20000;i++)fn(i);samples.push((performance.now()-start)/20000);}samples.sort((a,b)=>a-b);return {medianMsPerUpdate:(samples[4]+samples[5])/2,maxBatchMsPerUpdate:samples.at(-1)};};
try{const idle=measure(()=>{s.stick.y=0;sizing.update(s,states,frame++*1000/90,true,false);}),adjusting=measure(i=>{const phase=i%100;s.stick.y=phase===0?0:phase<50?-1:1;sizing.update(s,states,frame++*1000/90,true,false);}),position={x:0,y:0,z:.75},geometry=preview.mesh.geometry,previewMatrices=measure(i=>preview.show(layers.active.surface.group,position,.12+(i%100)/1000));const report={scope:'Warm Node sizing + shared in-memory setter, and brush-preview matrix/material updates. Excludes DOM setters, surface raycast, canvas/GPU/rendering and physical headset input.',framesPerBatch:20000,batches:10,idle,adjusting,previewMatrices,geometryReused:geometry===preview.mesh.geometry,historyEntries:layers.undoCount,sourceRemeshPending:layers.active.mesher.rebuildChunks()!==null};writeFileSync('outputs/phase-1-13f-sizing-benchmark.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}finally{preview.dispose();layers.dispose();}
