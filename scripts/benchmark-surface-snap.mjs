import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Ray,
  Raycaster,
  Vector3,
} from "three";
import { raycastSurface } from "../work/test-build/surface-snapping.mjs";

const side = 224,
  positions = new Float32Array((side + 1) * (side + 1) * 3),
  indices = new Uint32Array(side * side * 6);
let p = 0,
  t = 0;
for (let y = 0; y <= side; y++)
  for (let x = 0; x <= side; x++) {
    positions[p++] = (x / side) * 2 - 1;
    positions[p++] = (y / side) * 2 - 1;
    positions[p++] = 0;
  }
for (let y = 0; y < side; y++)
  for (let x = 0; x < side; x++) {
    const a = y * (side + 1) + x,
      b = a + 1,
      c = a + side + 1,
      d = c + 1;
    indices.set([a, b, d, a, d, c], t);
    t += 6;
  }
const geometry = new BufferGeometry();
geometry.setAttribute("position", new BufferAttribute(positions, 3));
geometry.setIndex(new BufferAttribute(indices, 1));
geometry.computeVertexNormals();
const mesh = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));
mesh.updateMatrixWorld(true);
const target = { id: "stl-100k", mesh, kind: "reference" },
  raycaster = new Raycaster(),
  samples = [];
for (let i = 0; i < 8; i++)
  raycastSurface(
    new Ray(new Vector3(0, 0, 1), new Vector3(0, 0, -1)),
    [target],
    new Set(),
    undefined,
    0,
    raycaster,
  );
for (let i = 0; i < 100; i++) {
  const x = (((i * 7919) % 997) / 997) * 1.8 - 0.9,
    y = (((i * 3571) % 991) / 991) * 1.8 - 0.9,
    ray = new Ray(new Vector3(x, y, 1), new Vector3(0, 0, -1)),
    started = performance.now();
  const found = raycastSurface(ray, [target], new Set(), undefined, 0, raycaster);
  if (!found) {
    raycaster.ray.copy(ray);
    throw new Error(
      `Expected STL hit at ${x}, ${y}; triangles=${geometry.index.count / 3}, direct=${JSON.stringify(raycaster.intersectObject(mesh, false).map((i) => ({ faceIndex: i.faceIndex, face: i.face, point: i.point.toArray() })))}.`,
    );
  }
  samples.push(performance.now() - started);
}
samples.sort((a, b) => a - b);
const report = {
  scope: "one 100,352-triangle static STL mesh; 8 warmups + 100 deterministic raycasts; CPU only",
  node: process.version,
  triangles: side * side * 2,
  rays: samples.length,
  p50Ms: samples[Math.floor((samples.length - 1) * 0.5)],
  p95Ms: samples[Math.floor((samples.length - 1) * 0.95)],
  maxMs: samples.at(-1),
};
mkdirSync("work/phase-6-4", { recursive: true });
writeFileSync("work/phase-6-4/surface-snap-benchmark.json", `${JSON.stringify(report, null, 2)}\n`);
console.log(report);
geometry.dispose();
mesh.material.dispose();
