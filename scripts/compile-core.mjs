import ts from 'typescript';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
mkdirSync('work/test-build', {recursive:true});
for (const name of ['dense-growth','sculpt-metrics','xr-alternate-tool','xr-haptics','xr-layer-selection','xr-shape-stamp','brush-settings','xr-brush-sizing','xr-brush-preview','clay-path','clay-stroke-session','xr-clay-stroke','sdf','stroke','mesh','history','project','resolution','surface','volume-store','transform','layers','shapes','display-preferences','independent-layers','interaction','transform-tools','compositor','bake','shape-library','shape-preview','shape-stamp','shape-placement','shape-rotation','render-style','xr-scene','xr-session','xr-controller-roles','xr-input','xr-controllers','xr-diagnostics','workspace-grab','workspace-navigation','xr-layer-grab','editor-tool-state','xr-menu-model','xr-menu-view','xr-stick-directions','xr-support-shortcuts','xr-history-shortcuts','xr-shortcut-view','xr-actions','xr-hints','xr-performance','xr-feedback','navigation-handoff','controller-models','controller-model-provider']) {
  const source=readFileSync(`src/${name}.ts`,'utf8').replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'");
  writeFileSync(`work/test-build/${name}.mjs`,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
}
