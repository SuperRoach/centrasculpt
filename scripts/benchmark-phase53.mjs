import './compile-core.mjs';
import {writeFileSync} from 'node:fs';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {encodeSTL} from '../work/test-build/stl-export.mjs';
import {parseSTL} from '../work/test-build/stl.mjs';
const settings={mode:'add',radius:.22,strength:.35,hardness:0,camera:{position:[2,2,3],target:[0,0,0]}},rows=[];
for(const resolution of [17,32,64,128,192]){const l=new IndependentLayers(createBaseProject(new SDFVolume(resolution),settings));try{const start=performance.now(),r=await encodeSTL(l.exportSources('visible',false),'standard',256*1024**2,100),parseStart=performance.now();let parsed=null,error=null;try{parsed=parseSTL(new Uint8Array(r.data)).length/9;}catch(e){error=e.message;}rows.push({resolution,milliseconds:r.milliseconds,wallMs:performance.now()-start,parseMs:performance.now()-parseStart,parsed,error,bytes:r.data.byteLength,estimatedBytes:r.estimatedBytes,report:r.report,rss:process.memoryUsage().rss});}catch(error){rows.push({resolution,error:error.message,sourceTriangles:l.exportSources('visible',false).reduce((n,s)=>n+s.chunks.reduce((n,c)=>n+c.positions.length/9,0),0)});}finally{l.dispose();}}
writeFileSync('outputs/phase-5-3/benchmark.json',JSON.stringify({scope:'Node/macOS component observations, no Quest/GPU claims',rows},null,2));console.log(JSON.stringify(rows.map(({resolution,milliseconds,report})=>({resolution,milliseconds,triangles:report?.triangles,boundary:report?.boundaryEdges,blocking:report?.blocking}))));
