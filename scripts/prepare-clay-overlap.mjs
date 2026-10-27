// Reproduce the reported overlap with the pre-fix field and current field.
import './compile-core.mjs';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import ts from 'typescript';
const source=execFileSync('git',['show','9aa9936:src/sdf.ts'],{encoding:'utf8'}).replace(/from '(\.\/[^']+)'/g,"from '$1.mjs'");
writeFileSync('work/test-build/sdf-overlap-before.mjs',ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
const {SDFVolume:Before}=await import('../work/test-build/sdf-overlap-before.mjs'),{SDFVolume:After}=await import('../work/test-build/sdf.mjs'),{ClayStroke}=await import('../work/test-build/stroke.mjs'),{IncrementalMesher}=await import('../work/test-build/mesh.mjs'),{qualityMetrics}=await import('./fixtures/mesh-quality.mjs');
const rows=[];
for(const n of [64,128])for(const [version,Volume] of [['before',Before],['corrected',After]]){
 const v=new Volume(n),initial=v.values.slice(),stroke=new ClayStroke();for(let i=0;i<=48;i++){const a=i/48*2*Math.PI;stroke.apply(v,{x:.35*Math.cos(a),y:.35*Math.sin(a),z:.8},.16,'add',.35,1/90,undefined,.6,undefined,true);}
 let outsideBandChanged=0,probes=0;for(let z=1;z<n-1;z++)for(let y=1;y<n-1;y++)for(let x=1;x<n-1;x++){const i=v.index(x,y,z);if(Math.abs(initial[i])>v.step*1.5)continue;const ring=Math.hypot(Math.hypot(v.coordinate(x),v.coordinate(y))-.35,v.coordinate(z)-.8)-.16;if(ring>v.step*2){probes++;if(v.values[i]!==initial[i])outsideBandChanged++;}}
 const m=new IncrementalMesher(v,16);try{const result=m.rebuildChunks();rows.push({n,version,probes,outsideBandChanged,...qualityMetrics(result.updates.map(u=>u.geometry),p=>Math.min(Math.hypot(p.x,p.y,p.z)-.85,Math.hypot(Math.hypot(p.x,p.y)-.35,p.z-.8)-.16),v.step)});}finally{m.dispose();}
}
writeFileSync(process.argv[2]??'outputs/phase-3-7/feedback-overlap.json',JSON.stringify({scope:'Actual SDF samples and extracted mesh, fixed ring partly embedded in starter sphere. Analytic torus approximates the 48-segment applicator sweep; surface probes are not Hausdorff. Before source pinned to 9aa9936. No Quest timing claim.',rows},null,2));
