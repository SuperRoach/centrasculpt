import './compile-core.mjs';
import {writeFileSync} from 'node:fs';
import {Group} from 'three';
const {XRControllerInput}=await import('../work/test-build/xr-input.mjs');
const {XRControllerRoles}=await import('../work/test-build/xr-controller-roles.mjs');
const {XRControllers}=await import('../work/test-build/xr-controllers.mjs');
const sources=['left','right'].map(handedness=>({handedness,profiles:['meta-quest-touch-plus'],targetRayMode:'tracked-pointer',gripSpace:{},gamepad:{mapping:'xr-standard',buttons:Array.from({length:6},()=>({value:.2,pressed:false,touched:true})),axes:[0,0,.4,-.3]}}));
const input=new XRControllerInput();sources.forEach((s,i)=>{input.connect(i,s);input.setTracking(i,true,true);});
const rays=[new Group(),new Group()],grips=[new Group(),new Group()],bridge=new XRControllers({getController:i=>rays[i],getControllerGrip:i=>grips[i]},new Group(),new XRControllerRoles());
sources.forEach((data,i)=>rays[i].dispatchEvent({type:'connected',data}));const session=new EventTarget();session.visibilityState='visible';bridge.start(session);
function measure(update){for(let i=0;i<10000;i++)update(i);const batches=[];for(let b=0;b<9;b++){const start=performance.now();for(let i=0;i<10000;i++)update(i);batches.push((performance.now()-start)/10000);}batches.sort((a,b)=>a-b);return {medianMsPerFrame:batches[4],minMsPerFrame:batches[0],maxBatchMeanMsPerFrame:batches.at(-1),framesPerBatch:10000,batches:9};}
const result={runtime:process.version,platform:process.platform,description:'Warm Node CPU benchmark, two Quest-profile fake sources. Core polling and controller bridge with real Three geometry/visual state. No headset, GPU, browser canvas painting, debug hit test or rendering included; browser input/debug timing covers those CPU paths separately.',core:measure(()=>input.update()),bridge:measure(i=>bridge.update(i*11.11))};bridge.dispose();writeFileSync(process.argv[2]??'outputs/phase-1-12b-input-benchmark.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
