import ts from 'typescript';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
mkdirSync('work/test-build', {recursive:true});
for (const name of ['sdf','stroke','mesh','history','project','resolution','surface','volume-store','transform','layers','shapes','display-preferences','independent-layers','interaction','transform-tools','compositor','bake','shape-library','shape-preview','shape-stamp','shape-placement','shape-rotation','render-style','xr-scene','xr-session','xr-controller-roles','xr-input','xr-controllers','xr-diagnostics','workspace-grab','workspace-navigation','xr-actions','xr-hints','xr-performance','xr-feedback','navigation-handoff','controller-models','controller-model-provider']) {
  const source=readFileSync(`src/${name}.ts`,'utf8').replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'");
  writeFileSync(`work/test-build/${name}.mjs`,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
}
