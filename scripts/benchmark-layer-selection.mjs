import './compile-core.mjs';
import {writeFileSync} from 'node:fs';
import {Group,Matrix4} from 'three';
import {XRLayerSelection} from '../work/test-build/xr-layer-selection.mjs';
import {EditorToolState} from '../work/test-build/editor-tool-state.mjs';
import {ShapePreviewModel} from '../work/test-build/shape-preview.mjs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
const settings={mode:'add',radius:.22,strength:.35,hardness:.6,camera:{position:[2,2,3],target:[0,0,0]}},rows=[],p=(a,n)=>[...a].sort((x,y)=>x-y)[Math.floor((a.length-1)*n)];
for(const count of [1,4,8]){
 const layers=new IndependentLayers(createBaseProject(new SDFVolume(33),settings));for(let i=1;i<count;i++){const next=layers.duplicate(layers.project.layerStack.layers[0].id);next.transform.position[2]=-i*.18;}layers.syncPresentation();const shape=new ShapePreviewModel(layers.project.activeLayerId),tools=new EditorToolState({layers:()=>layers,shape,settings:()=>settings,setSettings(){},mode:()=> 'translate',selectTool(){},selectTransform(){},busy:()=>false,changed(){}}),selection=new XRLayerSelection(()=>layers,tools,new Group()),pose=new Matrix4().makeTranslation(0,0,3),tool={role:'tool',connectionId:1,connected:true,tracked:true,gripTracked:true,buttons:{grip:{pressed:false,rawValue:0},trigger:{pressed:false,justPressed:false,rawValue:0}}},raycast=[],visual=[],frame=[],noRay=[];
 for(let i=0;i<240;i++){pose.elements[12]=Math.sin(i*.1)*.3;const start=performance.now();selection.update(tool,pose,i*16,true);if(i>=40){raycast.push(selection.raycastMs);visual.push(selection.visualMs);frame.push(performance.now()-start);}}
 for(let i=0;i<200;i++){const start=performance.now();selection.update(tool,pose,4000+i*16,false);noRay.push(performance.now()-start);}
 rows.push({layers:count,triangles:layers.project.layerStack.layers.reduce((s,l)=>s+layers.runtime(l.id).triangles,0),raycastMedianMs:p(raycast,.5),raycastP95Ms:p(raycast,.95),highlightMedianMs:p(visual,.5),highlightP95Ms:p(visual,.95),totalMedianMs:p(frame,.5),totalP95Ms:p(frame,.95),outlinesOnlyP95Ms:p(noRay,.95),boundsBuilds:selection.boundsBuilds,outlineVertices:selection.selected.geometry.getAttribute('position').count,undoCount:layers.undoCount});selection.dispose();layers.dispose();
}
const report={description:'Node CPU, 33³ sphere layers with overlapping ray hits, 40 warmup + 200 measured updates; cached boxes. Excludes GPU/browser/XR/controller polling. Ray tests use existing meshes without BVH.',rows};writeFileSync('outputs/phase-1-13h-selection-benchmark.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
