import test from 'node:test';
import assert from 'node:assert/strict';
import {saveState} from '../work/test-build/save-status.mjs';
const base={key:'current',manualKey:'',saving:false,editing:false,error:false,recoveryPending:false};
test('save indicator distinguishes manual files, local checkpoints, changes and transient edits',()=>{
 assert.equal(saveState(base),'unsaved');assert.equal(saveState({...base,manualKey:'current'}),'saved');
 assert.equal(saveState({...base,autosaveKey:'current'}),'autosaved');
 assert.equal(saveState({...base,autosaveKey:'older'}),'unsaved');
 assert.equal(saveState({...base,manualKey:'current',editing:true}),'unsaved');
 assert.equal(saveState({...base,manualKey:'current',autosaveKey:'current'}),'saved');
});
test('saving, errors and unresolved startup recovery cannot falsely report saved',()=>{
 assert.equal(saveState({...base,manualKey:'current',saving:true}),'saving');
 assert.equal(saveState({...base,manualKey:'current',error:true}),'error');
 assert.equal(saveState({...base,manualKey:'current',recoveryPending:true}),'recovery');
 assert.equal(saveState({...base,key:'new-project',manualKey:'current',autosaveKey:'current'}),'unsaved');
});
