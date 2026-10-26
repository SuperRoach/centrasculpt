import {Group,Matrix4} from 'three';
import {SDFVolume} from '../../work/test-build/sdf.mjs';
import {IndependentLayers} from '../../work/test-build/independent-layers.mjs';
import {createBaseProject} from '../../work/test-build/layers.mjs';
import {EditorToolState} from '../../work/test-build/editor-tool-state.mjs';
import {ShapePreviewModel} from '../../work/test-build/shape-preview.mjs';
import {XRMoveTool} from '../../work/test-build/xr-move-tool.mjs';
export const pose=(x=0,y=0,z=1.5)=>new Matrix4().makeTranslation(x,y,z);
export const press=s=>Object.assign(s.buttons.trigger,{pressed:true,rawValue:1,justPressed:true});
export const release=s=>Object.assign(s.buttons.trigger,{pressed:false,rawValue:0,justPressed:false});
export function fixture(n=33){
 let settings={mode:'add',radius:.22,strength:.35,hardness:.5,camera:{position:[2,2,3],target:[0,0,0]}},mode='sculpt';
 const volume=new SDFVolume(n);if(n===192)for(let i=0;i<volume.values.length;i++)volume.values[i]-=.1;
 let l=new IndependentLayers(createBaseProject(volume,settings));const root=new Group(),shape=new ShapePreviewModel(l.project.activeLayerId),tools=new EditorToolState({layers:()=>l,shape,settings:()=>settings,setSettings:v=>settings=v,mode:()=>mode,selectTool:t=>{shape.setEnabled(t==='stamp',l.project.layerStack);mode=t==='transform'?'translate':'sculpt';if(t==='smooth'||t==='clay')settings={...settings,mode:t==='smooth'?'smooth':'add'};},selectTransform:v=>mode=v,busy:()=>false,changed(){}});
 const move=new XRMoveTool(()=>l,tools,root),s={slot:0,role:'tool',connectionId:1,connected:true,tracked:true,gripTracked:true,stick:{available:true,x:0,y:0},buttons:{trigger:{pressed:false,rawValue:0,justPressed:false},grip:{pressed:false,rawValue:0}}};
 tools.select('move');tools.move.mode='preview';
 return {get l(){return l;},replace(next){l=next;},tools,root,move,s,dispose(){move.dispose();l.dispose();}};
}
export function start(f,aim=pose(),grip=aim){f.move.update(f.s,aim,0,true,grip);press(f.s);f.move.update(f.s,aim,16,true,grip);f.s.buttons.trigger.justPressed=false;if(!f.move.active)throw new Error(f.move.feedback);}
