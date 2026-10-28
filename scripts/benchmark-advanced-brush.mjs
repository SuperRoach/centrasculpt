import {SDFVolume} from '../work/test-build/sdf.mjs';
import {writeFileSync} from 'node:fs';
const cases=[];
for(const resolution of [64,128,192])for(const mode of ['flatten','inflate','scrape']){
 const v=new SDFVolume(resolution),times=[];let writes=0;
 for(let i=0;i<40;i++){const t=performance.now();v.brush({x:-.15+i*.006,y:0,z:.82},.26,mode,.004,()=>writes++,.3);times.push(performance.now()-t);}
 times.sort((a,b)=>a-b);cases.push({resolution,mode,dabs:40,writes,totalMs:times.reduce((a,b)=>a+b,0),p95Ms:times[37],maxMs:times.at(-1)});
}
const result={scope:'Host synchronous SDF dabs only; no meshing/renderer/Quest timing',node:process.version,cases};
writeFileSync('outputs/phase-4-0/benchmark.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
