import test from 'node:test';
import assert from 'node:assert/strict';
import {SDFVolume} from '../work/test-build/sdf.mjs';
import {createBaseProject} from '../work/test-build/layers.mjs';
import {IndependentLayers} from '../work/test-build/independent-layers.mjs';
import {TransformPreview} from '../work/test-build/transform-preview.mjs';
const make=()=>new IndependentLayers(createBaseProject(new SDFVolume(17),{mode:'add',radius:.2,strength:.3,hardness:0,camera:{position:[2,2,3],target:[0,0,0]}}));
test('Boolean transform shows live layers, waits for refreshed result, and retains view choice',async()=>{const l=make(),preview=new TransformPreview();try{l.viewMode='boolean';await l.composite.flush();preview.sync(l);assert(l.composite.group.visible);l.beginTransform();preview.sync(l);assert(l.group.visible);assert(!l.composite.group.visible);l.updateTransform({position:[.4,0,0],rotation:[0,.5,0],scale:[1,1,1]});l.finishTransform();preview.sync(l);assert(l.group.visible);assert.equal(l.viewMode,'boolean');await l.composite.flush();preview.sync(l);assert(!l.group.visible);assert(l.composite.group.visible);}finally{l.dispose();}});
test('cancel, explicit Layers choice and project replacement clear temporary presentation',async()=>{const l=make(),other=make(),preview=new TransformPreview();try{l.viewMode='boolean';await l.composite.flush();l.beginTransform();preview.sync(l);l.cancelTransform();preview.sync(l);assert(l.composite.group.visible);l.beginTransform();preview.sync(l);l.viewMode='separate';preview.sync(l);assert(l.group.visible);l.cancelTransform();other.viewMode='boolean';await other.composite.flush();preview.sync(other);assert(other.composite.group.visible);}finally{l.dispose();other.dispose();}});
