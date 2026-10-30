import ts from 'typescript';
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import {createHash} from 'node:crypto';
const digest=s=>createHash('sha256').update(s).digest('hex');
const cacheFile='work/test-build/.compile-cache.json';
mkdirSync('work/test-build', {recursive:true});
let cache={};try{cache=JSON.parse(readFileSync(cacheFile,'utf8'));}catch{}
if(!cache||typeof cache!=='object')cache={};
export const compileStats={compiled:0,cached:0};
const nextCache={};
const options={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext};

for (const name of ['layer-hierarchy','layer-palette','sculpt-mask','mask-overlay','lighting','light-rig','lighting-ui','reference-transform','reference-ui','reference-images','reference-view','turntable','xr-world-menu','world-settings','sdf-surface-hit','xr-ui-style','procedural-tube','xr-tube-tool','xr-mirror-plane','save-status','tool-preferences','project-snapshot','recovery-client','recovery-worker','recovery-store','recovery','app-lifecycle','stability-metrics','export-mesh','glb-export','export-worker','export-client','move-gesture','move-reconstruction-worker','move-worker-client','triangle-distance-index','deformation-reconstruction','chunk-spatial-index','deformation-contract','move-field','move-mesh-preview','xr-move-tool','dense-growth','sculpt-metrics','xr-alternate-tool','xr-haptics','xr-layer-selection','xr-shape-stamp','brush-settings','xr-brush-sizing','xr-brush-preview','clay-path','clay-stroke-session','xr-clay-stroke','sdf','stroke','mesh','history','project','resolution','surface','volume-store','transform','layers','shapes','display-preferences','independent-layers','interaction','transform-tools','compositor','bake','shape-library','shape-preview','shape-stamp','shape-placement','shape-rotation','render-style','xr-scene','xr-session','xr-controller-roles','xr-input','xr-controllers','xr-diagnostics','workspace-grab','workspace-navigation','xr-layer-grab','editor-tool-state','xr-menu-model','xr-menu-view','xr-stick-directions','xr-support-shortcuts','xr-history-shortcuts','xr-shortcut-view','xr-actions','xr-hints','xr-performance','xr-feedback','navigation-handoff','controller-models','controller-model-provider']) {
  const source=readFileSync(`src/${name}.ts`,'utf8').replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'");
  const output=`work/test-build/${name}.mjs`,key=digest(JSON.stringify([ts.version,options,source]));
  const prior=cache[name];
  if(prior?.key===key&&existsSync(output)&&digest(readFileSync(output))===prior.outputHash){nextCache[name]=prior;compileStats.cached++;continue;}
  const text=ts.transpileModule(source,{compilerOptions:options}).outputText;
  const temporary=`${output}.${process.pid}.tmp`;writeFileSync(temporary,text);renameSync(temporary,output);
  nextCache[name]={key,outputHash:digest(text)};compileStats.compiled++;

}
const temporaryCache=`${cacheFile}.${process.pid}.tmp`;writeFileSync(temporaryCache,JSON.stringify(nextCache));renameSync(temporaryCache,cacheFile);
