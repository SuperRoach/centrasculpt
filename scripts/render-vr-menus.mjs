import './compile-core.mjs';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {Group} from 'three';
import {EditorToolState} from '../work/test-build/editor-tool-state.mjs';
import {XRMenuModel} from '../work/test-build/xr-menu-model.mjs';
import {XRMenuView} from '../work/test-build/xr-menu-view.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {ShapePreviewModel} from '../work/test-build/shape-preview.mjs';
const {createCanvas}=createRequire(import.meta.url)(process.env.CANVAS_PACKAGE||'@napi-rs/canvas');
globalThis.document={createElement:()=>createCanvas(1152,1152)};
let settings={mode:'add',radius:.22,strength:.35,hardness:0,camera:{position:[2,2,3],target:[0,0,0]}},mode='sculpt';
const layers=new IndependentLayers(createBaseProject(new SDFVolume(17),settings)),shape=new ShapePreviewModel(layers.project.activeLayerId);
const tools=new EditorToolState({layers:()=>layers,shape,settings:()=>settings,setSettings:v=>settings=v,mode:()=>mode,selectTool:tool=>{shape.setEnabled(tool==='stamp',layers.project.layerStack);mode=tool==='transform'?'translate':'sculpt';settings.mode=tool==='smooth'?'smooth':'add';},selectTransform:v=>mode=v,busy:()=>false,changed:()=>{}}),model=new XRMenuModel(tools),view=new XRMenuView(model);
new Group().add(view.mesh);view.place({x:0,y:1.6,z:0},{x:0,y:0,z:0,w:1});
const prefix=process.env.MENU_PREFIX||'phase-1-13d';tools.path.steady=Number(process.env.MENU_STEADY||0);
function render(name){view.update(model.request,undefined,undefined,performance.now(),true);view.paint(model.content());writeFileSync(`outputs/${prefix}-${name}.png`,view.canvas.toBuffer('image/png'));}
try{
 model.setRequest('tool-wheel');model.hover='tool:stamp';render('wheel');model.activate('tool:clay');render('clay-options');tools.path.straightLine=true;render('clay-straight-line-options');tools.path.straightLine=false;model.activate('tools');model.activate('tool:stamp');render('stamp-options');model.activate('next');render('stamp-options-2');model.activate('tools');model.activate('tool:transform');render('transform-options');
 layers.rename(layers.project.activeLayerId,'Sculpture · base');const next=layers.create(64);layers.rename(next.id,'Facial details');layers.setFlag(next.id,'locked',true);const third=layers.create(64);layers.rename(third.id,'Hidden reference');layers.setFlag(third.id,'visible',false);layers.select(next.id);model.setRequest('layers');render('layers');
 console.log('Rendered wheel, options and layers using the production canvas drawing code.');
}finally{view.dispose();layers.dispose();}
