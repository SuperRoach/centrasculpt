import './compile-core.mjs';
import {writeFileSync} from 'node:fs';
import {runVRStress} from './vr-stress-scenarios.mjs';
const results=[];for(const resolution of [64,128,192])results.push(await runVRStress(resolution));
const report={scope:'Unexpanded workflow regression workload with the same 900-sample/20-cycle parameters as Phase 1.14. Node CPU, cold calls, uncontrolled host load. Compares unchanged cubic editing after the rectangular storage/mesher refactor, NOT automatic expansion latency or physical XR frame times. Baseline outputs/phase-1-14-stress-benchmark.json remains untouched.',host:{platform:process.platform,arch:process.arch,node:process.version},results};
writeFileSync('outputs/phase-1-15-regression-benchmark.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
