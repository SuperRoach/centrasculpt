import './compile-core.mjs';
import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import {Group,Matrix4} from 'three';
import {EditorToolState} from '../work/test-build/editor-tool-state.mjs';
import {XRMenuModel} from '../work/test-build/xr-menu-model.mjs';
import {XRMenuView} from '../work/test-build/xr-menu-view.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {ShapePreviewModel} from '../work/test-build/shape-preview.mjs';
let settings={mode:'add',radius:.22,strength:.35,hardness:0,camera:{position:[2,2,3],target:[0,0,0]}},mode='sculpt';
const layers=new IndependentLayers(createBaseProject(new SDFVolume(17),settings)),shape=new ShapePreviewModel(layers.project.activeLayerId);
const tools=new EditorToolState({layers:()=>layers,shape,settings:()=>settings,setSettings:v=>settings=v,mode:()=>mode,selectTool:()=>{},selectTransform:v=>mode=v,busy:()=>false,changed:()=>{}}),model=new XRMenuModel(tools);
// Stub drawing only: this measures layout/raycast/caching, not canvas rasterization or rendering.
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>new Proxy({}, {get:()=>()=>{}})})};
const view=new XRMenuView(model);new Group().add(view.mesh);view.place({x:0,y:1.6,z:0},{x:0,y:0,z:0,w:1});
const tool={connectionId:1,role:'tool',connected:true,tracked:true,gripTracked:true,buttons:{trigger:{pressed:false,rawValue:0,justPressed:false}}},pose=new Matrix4().makeTranslation(0,1.48,0);
let frame=0;
function measure(fn){for(let i=0;i<2000;i++)fn(i);const times=[];for(let b=0;b<10;b++){const start=performance.now();for(let i=0;i<20000;i++)fn(i);times.push((performance.now()-start)/20000);}const sorted=[...times].sort((a,b)=>a-b);return {batchesMsPerUpdate:times,medianMsPerUpdate:(sorted[4]+sorted[5])/2};}
try{const closed=measure(i=>view.update(null,tool,pose,frame++*11.11,true)),openWheel=measure(i=>view.update('tool-wheel',tool,pose,frame++*11.11,true));view.close();const openLayers=measure(i=>view.update('layers',tool,pose,frame++*11.11,true));const report={scope:'Warm Node menu layout, Three raycast and content-cache bookkeeping with one layer, stubbed canvas. Excludes real drawing, renderer/GPU, physical input, source edits and headset.',framesPerBatch:20000,closed,openWheel,openLayers};writeFileSync('outputs/phase-1-13d-menu-benchmark.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({closed:closed.medianMsPerUpdate,openWheel:openWheel.medianMsPerUpdate,openLayers:openLayers.medianMsPerUpdate}));}finally{view.dispose();layers.dispose();}
