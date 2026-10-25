import './compile-core.mjs';
import {writeFileSync} from 'node:fs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {defineShape,SHAPE_KINDS} from '../work/test-build/shapes.mjs';
import {ShapePreviewModel} from '../work/test-build/shape-preview.mjs';
import {EditorToolState} from '../work/test-build/editor-tool-state.mjs';
import {XRShapeStamp} from '../work/test-build/xr-shape-stamp.mjs';
import {Group,Matrix4} from 'three';
const settings={mode:'add',radius:.14,strength:.35,hardness:.6,camera:{position:[2,2,3],target:[0,0,0]}},rows=[];
for(const resolution of [64,128])for(const kind of resolution===64?SHAPE_KINDS:['sphere']){
 const v=new SDFVolume(resolution,1.6,false);v.values.fill(6.4);const c=new IndependentLayers(createBaseProject(v,settings));
 try{const definition=defineShape({kind,operation:'add',targetLayerId:c.project.activeLayerId,dimensions:[.5,.5,.5],transform:{position:[0,0,0],rotation:[.2,.3,.1],scale:[1,1,1]}});
 for(const operation of ['add','subtract']){c.stampShape({...definition,operation});rows.push({resolution,kind,operation,...c.lastStampStats,historyMiB:c.active.history.memoryBytes/1024**2});}
 }finally{c.dispose();}
}
const c=new IndependentLayers(createBaseProject(new SDFVolume(33),settings)),shape=new ShapePreviewModel(c.project.activeLayerId);shape.enabled=true;
const tools=new EditorToolState({layers:()=>c,shape,settings:()=>settings,setSettings(){},mode:()=> 'sculpt',selectTool(){},selectTransform(){},busy:()=>false,changed(){}}),stamp=new XRShapeStamp(()=>c,tools,new Group()),tool={role:'tool',connected:true,tracked:true,gripTracked:true,connectionId:1,buttons:{grip:{pressed:false,rawValue:0},trigger:{pressed:false,justPressed:false}}},pose=new Matrix4().makeTranslation(0,0,.12),times=[];
for(let i=0;i<1100;i++){pose.elements[12]=.1*Math.sin(i*.03);const start=performance.now();stamp.update(tool,pose,i*16,true,pose);if(i>=100)times.push(performance.now()-start);}
times.sort((a,b)=>a-b);const preview={medianMs:times[500],p95Ms:times[950],geometryBuilds:stamp.ghost.stats.geometryBuilds,undoCount:c.undoCount};stamp.dispose();c.dispose();
const report={description:'Node CPU only; empty dense field Add then identical Subtract. Shared exact CSG may change far-field samples. Uncontrolled load, excludes XR/GPU/browser and async Boolean refresh. 128 tested sphere only. Preview 100 warmup + 1000 moving updates.',rows,preview};writeFileSync('outputs/phase-1-13g-stamp-benchmark.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
