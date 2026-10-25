import test from 'node:test';
import assert from 'node:assert/strict';
import {runVRStress} from '../scripts/vr-stress-scenarios.mjs';
for(const resolution of [64,128,192])test(`VR stress ${resolution}³: continuous/fast/large brushes, Steady/Line, stamps, cancellation, history and persistence`,async()=>{const result=await runVRStress(resolution,{frames:180,cycles:4});assert.equal(result.frameProcessingCPU.samples,180);assert.equal(result.pendingChunks,0);assert.equal(result.sourceAndScratchMiB,resolution**3*8/1048576);assert.equal(result.stamps.length,4);});
