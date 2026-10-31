import test from 'node:test';
import assert from 'node:assert/strict';
import {newProjectData,leaveForProject} from '../work/test-build/project-workflow.mjs';
import {openSculptProject} from '../work/test-build/project.mjs';
const settings={mode:'paint',radius:.22,strength:.35,hardness:0,camera:{position:[2,2,3],target:[0,0,0]}};
for(const resolution of [64,128,192])for(const contents of ['empty','sphere'])test(`New Project ${resolution} ${contents} is a valid independent native project`,()=>{
 const project=openSculptProject(newProjectData(resolution,contents,settings));
 assert.equal(project.layerStack.layers.length,1);const layer=project.layerStack.layers[0];
 assert.equal(layer.volume.resolution,resolution);assert(layer.editable);assert.equal(project.settings.mode,'add');assert.equal(settings.mode,'paint');
 assert.equal(layer.volume.values.some(v=>v<0),contents==='sphere');assert.equal(layer.procedural,undefined);
});
test('New Project rejects malformed choices before allocating',()=>{for(const [r,c] of [[512,'empty'],[64,'invalid'],[NaN,'sphere']])assert.throws(()=>newProjectData(r,c,settings));});
for(const environment of ['studio','passthrough'])test(`${environment} project handoff waits for exit and rechecks busy state`,async()=>{
 let shown=0,finish;const session={state:'presenting',exit:()=>new Promise(resolve=>{finish=()=>{session.state='ready';resolve();};})};
 const pending=leaveForProject(session,()=>true,()=>shown++);assert.equal(shown,0);finish();await pending;assert.equal(shown,1);
 await assert.rejects(leaveForProject({state:'presenting',exit:async()=>{}},()=>true,()=>shown++));
 await assert.rejects(leaveForProject({state:'ready',exit:async()=>{}},()=>false,()=>shown++));assert.equal(shown,1);
});
