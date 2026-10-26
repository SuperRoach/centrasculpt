import './compile-core.mjs';
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
if(process.argv.includes('--baseline'))for(const name of ['sdf','stroke']){const source=execFileSync('git',['show',`b651299e3c6d67c00a0423811e377112b1752e9a:src/${name}.ts`],{encoding:'utf8'}).replace(/from '(\.\/[^']+)'/g,"from '$1.mjs'");writeFileSync(`work/test-build/${name}-precision-baseline.mjs`,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);}
const {SDFVolume}=await import(process.argv.includes('--baseline')?'../work/test-build/sdf-precision-baseline.mjs':'../work/test-build/sdf.mjs');
const {ClayStroke}=await import(process.argv.includes('--baseline')?'../work/test-build/stroke-precision-baseline.mjs':'../work/test-build/stroke.mjs');
import {IncrementalMesher} from '../work/test-build/mesh.mjs';
import {qualityMetrics} from './fixtures/mesh-quality.mjs';
const rows=[];
for(const n of [64,128,192])for(const radius of [.065,.14]){
 const samples=[];let row;
 for(let run=0;run<4;run++){
 const v=new SDFVolume(n,1.6,false);v.values.fill(6.4);const stroke=new ClayStroke(),t=performance.now();
 for(let i=0;i<=15;i++)stroke.apply(v,{x:-.55+1.1*i/15,y:.013,z:.019},radius,'add',.35,1/90,undefined,.6,undefined,true);
 const brushMs=performance.now()-t,m=new IncrementalMesher(v,16),mt=performance.now(),r=m.rebuildChunks(),meshMs=performance.now()-mt,gs=r.updates.map(u=>u.geometry);
 const field=p=>Math.hypot(Math.max(Math.abs(p.x)-.55,0),p.y-.013,p.z-.019)-radius;
 let maxNormalDegrees=0;for(const g of gs){const p=g.getAttribute('position'),normal=g.getAttribute('normal');for(let i=0;i<p.count;i++){const x=p.getX(i),dx=x-Math.max(-.55,Math.min(.55,x)),dy=p.getY(i)-.013,dz=p.getZ(i)-.019,length=Math.hypot(dx,dy,dz),dot=(dx*normal.getX(i)+dy*normal.getY(i)+dz*normal.getZ(i))/length;maxNormalDegrees=Math.max(maxNormalDegrees,Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI);}}
 row={maxNormalDegrees,n,radius,step:v.step,radiusVoxels:radius/v.step,brushMs,meshMs,meshCount:gs.filter(g=>g.getAttribute('position').count>0).length,denseBytes:v.values.byteLength*2,geometryBytes:gs.reduce((s,g)=>s+Object.values(g.attributes).reduce((a,b)=>a+b.array.byteLength,0),0),...qualityMetrics(gs,field,v.step),maxNormalDegrees};
 if(run)samples.push({brushMs,meshMs});m.dispose();
 }rows.push({...row,samples});
}
writeFileSync(process.argv[2],JSON.stringify({scope:'Mac Node CPU; one warmup plus three runs; surface probes include vertices/centroids, not Hausdorff or GPU frames; memory counts dense arrays and geometry, not process peak; no physical Quest testing',rows},null,2));
