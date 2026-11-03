import "./compile-core.mjs";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { DirectionalLight, Group, HemisphereLight } from "three";
import { LightRig } from "../work/test-build/light-rig.mjs";
import { defaultLighting } from "../work/test-build/lighting.mjs";

const workspace = new Group(),
  key = new DirectionalLight(),
  fill = new DirectionalLight(),
  ambient = new HemisphereLight(),
  settings = defaultLighting();
settings.enabled = true;
workspace.add(key, fill, ambient);
const rig = new LightRig(() => settings, workspace, key, fill, ambient),
  resources = new Set();
rig.root.traverse((o) => {
  if (o.geometry) resources.add(o.geometry);
  if (o.material) resources.add(o.material);
});
let disposed = 0;
for (const r of resources) r.addEventListener("dispose", () => disposed++);
const samples = [];
for (let i = 0; i < 1200; i++) {
  const start = performance.now();
  rig.sync((i * 1000) / 72);
  if (i >= 200) samples.push(performance.now() - start);
}
samples.sort((a, b) => a - b);
const count = resources.size;
rig.dispose();
rig.dispose();
assert.equal(disposed, count);
writeFileSync(
  "outputs/phase-5-2/lighting.json",
  JSON.stringify(
    {
      scope:
        "Node CPU, three enabled lights, 200 warmup + 1000 sync calls; resolution independent; no shader/GPU timing",
      p50: samples[499],
      p95: samples[949],
      p99: samples[989],
      max: samples.at(-1),
      uniqueResources: count,
      disposeEvents: disposed,
    },
    null,
    2,
  ),
);
