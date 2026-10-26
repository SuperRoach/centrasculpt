import './compile-core.mjs';
import {writeFileSync} from 'node:fs';
import {Group,Matrix4} from 'three';
import {XRShapeStamp} from '../work/test-build/xr-shape-stamp.mjs';
import {EditorToolState} from '../work/test-build/editor-tool-state.mjs';
import {ShapePreviewModel,shapeDimensionsForKind} from '../work/test-build/shape-preview.mjs';
import {SHAPE_KINDS} from '../work/test-build/shapes.mjs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
const settings={mode:'add',radius:.14,strength:.35,hardness:.6,camera:{position:[2,2,3],target:[0,0,0]}};
const poseAt=(x=0,y=0,z=0)=>new Matrix4().makeTranslation(x,y,z+.12);
function fixture(resolution=33){const volume=new SDFVolume(resolution,1.6,false);volume.values.fill(6.4);const layers=new IndependentLayers(createBaseProject(volume,settings)),shape=new ShapePreviewModel(layers.project.activeLayerId),root=new Group();let state={...settings},mode='sculpt',busy=false,changes=0;
 const tools=new EditorToolState({layers:()=>layers,shape,settings:()=>state,setSettings:v=>state=v,mode:()=>mode,selectTool:t=>{shape.setEnabled(t==='stamp',layers.project.layerStack);mode='sculpt';state={...state,mode:t==='smooth'?'smooth':'add'};},selectTransform:m=>mode=m,busy:()=>busy,changed(){}});tools.select('stamp');
 const stamp=new XRShapeStamp(()=>layers,tools,root,()=>changes++),tool={role:'tool',handedness:'right',connectionId:1,connected:true,tracked:true,gripTracked:true,stick:{available:true,x:0,y:0},buttons:{grip:{pressed:false,rawValue:0},trigger:{pressed:false,justPressed:false,rawValue:0}}};let time=0;
 const update=(pose=poseAt(),enabled=true)=>stamp.update(tool,pose,time+=16,enabled,pose);
 const release=(pose=poseAt())=>{Object.assign(tool.buttons.trigger,{pressed:false,justPressed:false,rawValue:0});update(pose);};
 const press=(pose=poseAt())=>{Object.assign(tool.buttons.trigger,{pressed:true,justPressed:true,rawValue:1});update(pose);};
 return {layers,volume,shape,tools,root,stamp,tool,update,release,press,set busy(v){busy=v;},get changes(){return changes;},dispose(){stamp.dispose();layers.dispose();}};
}

const rows=[];
for(const resolution of [64,128])for(const kind of SHAPE_KINDS)for(const operation of ['add','subtract']){
 const f=fixture(resolution),measurements=[];try{
 if(operation==='subtract')f.volume.reset();
 const d=f.shape.definition;f.shape.set({...d,kind,operation,dimensions:shapeDimensionsForKind(kind,[.25,.3,.25])},f.layers.project.layerStack);f.tools.stampAttachment.mode='continuous';
 const original=f.layers.stampShape.bind(f.layers);f.layers.stampShape=(d,stroke)=>{const result=original(d,stroke);measurements.push({...f.layers.lastStampStats});return result;};
 f.release(poseAt(-.45));const start=performance.now();f.press(poseAt(-.45));f.update(poseAt(.45));f.release(poseAt(.45));let frames=0;while(f.stamp.active&&frames++<1000)f.update(poseAt(.45));
 rows.push({resolution,kind,operation,samples:measurements.length,drainFrames:frames,undoActions:f.layers.undoCount,wallMs:performance.now()-start,evaluationMs:measurements.reduce((n,s)=>n+s.evaluationMs,0),meshingMs:measurements.reduce((n,s)=>n+s.meshingMs,0),maxStampMs:Math.max(...measurements.map(s=>s.totalMs))});
 }finally{f.dispose();}
}
const report={description:'Mac Node CPU, one fast .9-unit segment, .25/.3 dimensions, .35 spacing. One observation per case, includes initial stamp and queue drain; no Quest/XR/GPU frame claim. Individual SDF and remesh calls synchronous.',rows};
writeFileSync('outputs/phase-3-5-continuous-stamp.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
