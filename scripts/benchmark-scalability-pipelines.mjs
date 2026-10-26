import './compile-core.mjs';
import {cpSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
const baseline=process.argv.includes('--baseline'),baselineRef='4a5bbf3386ba701826d695d5b77e065b3e550c36';
if(baseline){cpSync('work/test-build','work/phase31-baseline',{recursive:true});for(const name of ['mesh','surface','independent-layers','compositor']){const s=execFileSync('git',['show',`${baselineRef}:src/${name}.ts`],{encoding:'utf8'}).replace(/from '(\.\/[^']+)'/g,"from '$1.mjs'");writeFileSync(`work/phase31-baseline/${name}.mjs`,ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);}}
const root=baseline?'../work/phase31-baseline/':'../work/test-build/';
const {SDFVolume}=await import(root+'sdf.mjs'),{IndependentLayers}=await import(root+'independent-layers.mjs'),{createBaseProject}=await import(root+'layers.mjs'),{saveSculptProject,openSculptProject}=await import(root+'project.mjs'),{RadialMoveField}=await import(root+'move-field.mjs');
const {Vector3}=await import('three');
const settings={mode:'add',radius:.22,strength:.35,hardness:.5,camera:{position:[2,2,3],target:[0,0,0]}},rows=[];
for(const mode of ['non-elastic','elastic','rotate','twist']){
 const c=new IndependentLayers(createBaseProject(new SDFVolume(128),settings));const vertices=c.active.triangles*3,f=new RadialMoveField();f.configure(mode==='elastic'?'elastic':'non-elastic');f.capture(new Vector3(0,0,.85),.2,2,1);if(mode==='rotate'||mode==='twist'){f.interaction=mode;f.setRotation(new Vector3(0,1,0),.15);}else f.setDisplacement(new Vector3(.02,0,.04));
 const owner={};c.beginPreview(owner);const t=performance.now();try{if(!await c.commitMove(owner,f,new AbortController().signal,()=>{}))throw Error('Move failed');}finally{c.endPreview(owner);}rows.push({kind:'move',mode,vertices,wallMs:performance.now()-t,stats:c.lastMoveStats,trackedBytes:c.trackedBytes});c.dispose();
}
{
 const c=new IndependentLayers(createBaseProject(new SDFVolume(64),settings));for(let i=1;i<8;i++)c.create(64);const t=performance.now(),file=saveSculptProject(c.project),saveMs=performance.now()-t,t2=performance.now(),loaded=openSculptProject(file);rows.push({kind:'eight-layer-save-load',saveMs,loadMs:performance.now()-t2,fileBytes:file.byteLength,layers:loaded.layerStack.layers.length,trackedBytes:c.trackedBytes});c.dispose();
}
{
 const c=new IndependentLayers(createBaseProject(new SDFVolume(128),settings)),base=c.active.layer,cutter=c.create(64);c.setActiveTransform({position:[.55,0,.3],rotation:[.2,.35,.1],scale:[.65,.65,.65]});c.setOperation(cutter.id,'difference');c.select(base.id);await c.composite.flush();rows.push({kind:'boolean',...c.composite.stats});const t=performance.now();await c.bake({name:'Scalability Bake',resolution:128,hideSources:true});rows.push({kind:'bake',wallMs:performance.now()-t,...c.lastBakeStats,trackedBytes:c.trackedBytes});c.dispose();
}
writeFileSync(`outputs/phase-3-1-pipelines-${baseline?'before':'after'}.json`,JSON.stringify({baselineRef:baseline?baselineRef:null,scope:'Actual Mac Node cooperative Move, Boolean, Bake and codec calls; one observation per case, no percentile/speed guarantee. Tracked bytes exclude JS/GPU and derived Boolean. No Quest tests.',rows},null,2)+'\n');
