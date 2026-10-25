import './compile-core.mjs';
import {writeFileSync} from 'node:fs';
import {XRAlternateTool} from '../work/test-build/xr-alternate-tool.mjs';
import {XRHaptics} from '../work/test-build/xr-haptics.mjs';
const tools={active:'clay',alternateTool:'smooth',busy:false,path:{steady:60,straightLine:false,placement:'free'},port:{settings:()=>({mode:'add',radius:.2,strength:.4,hardness:.5}),setSettings(){},changed(){}},select(tool){this.active=tool;}};
const alternate=new XRAlternateTool(tools),haptics=new XRHaptics();
let calls=0;const state={connected:true,tracked:true,gripTracked:true,role:'support',connectionId:1,source:{gamepad:{hapticActuators:[{pulse(){calls++;return true;}}]}},buttons:{trigger:{pressed:false,rawValue:0,justPressed:false}}},tool={buttons:{trigger:{pressed:false,rawValue:0}}};
const batches=[];for(let b=0;b<12;b++){const start=performance.now();for(let i=0;i<100000;i++){const phase=i%180;Object.assign(state.buttons.trigger,{pressed:phase>0&&phase<90,justPressed:phase===1,rawValue:phase>0&&phase<90?1:0});alternate.update(state,tool,true,false);haptics.pulse(state,'stroke-start',i*11.11);}const ms=(performance.now()-start)/100000;if(b>=2)batches.push(ms);await new Promise(r=>setImmediate(r));}
const sorted=[...batches].sort((a,b)=>a-b),report={scope:'Warm Node alternate router plus throttled haptic request; 100k frames per batch, stub settings port. Excludes UI selection side effects, SDF/meshing, GPU/XR and physical actuators. Pending promise suppresses batch bursts.',batchesMsPerFrame:batches,medianMsPerFrame:(sorted[4]+sorted[5])/2,maxBatchMsPerFrame:sorted.at(-1),actuatorCalls:calls};
writeFileSync('outputs/phase-1-13i-input-benchmark.json',JSON.stringify(report,null,2)+'\n');console.log(report);
