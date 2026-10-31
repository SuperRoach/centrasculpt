// Run existing deterministic workload fixtures, redirecting evidence away from historical results.
import './compile-core.mjs';
import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const names=['advanced-brush','continuous-stamps','async-move','expanded-editing','layer-workflows','masks','paint','tubes','references','turntable','project-library','export','recovery'];
mkdirSync('outputs/phase-5-2',{recursive:true});const results=[];
for(const name of names){const path=`scripts/.phase52-${name}.mjs`;let source=readFileSync(`scripts/benchmark-${name}.mjs`,'utf8');
 if(name==='async-move')source=source.replace('[64,114,192]','[64,128,192]');
 if(name==='continuous-stamps')source=source.replace('[64,128]','[64,128,192]');
 if(name==='advanced-brush')source=source.replace("['flatten','inflate','scrape']","['smooth','flatten','inflate','scrape','pinch','crease']");
 source=source.replace(/\bwriteFileSync\b/g,'phase52Write');
 source=source.replace(/import\s*\{([^}]+)\}\s*from\s*['"]node:fs['"]/g,(_,members)=>`import {${members.replace('phase52Write','writeFileSync as originalWrite')}} from 'node:fs'`);
 source+=`\nfunction phase52Write(path,...args){return originalWrite('outputs/phase-5-2/${name}-'+String(path).split('/').pop(),...args);}\n`;
 try{writeFileSync(path,source);const start=performance.now(),r=spawnSync(process.execPath,[path],{encoding:'utf8',maxBuffer:16*1024*1024});writeFileSync(`outputs/phase-5-2/${name}.log`,r.stdout+r.stderr);results.push({name,status:r.status,wallMs:performance.now()-start});console.log(results.at(-1));}finally{unlinkSync(path);}
}
writeFileSync('outputs/phase-5-2/workloads.json',JSON.stringify({scope:'Existing host fixtures; resolutions and sampling differ; no headset results',results},null,2));if(results.some(r=>r.status!==0))process.exitCode=1;
