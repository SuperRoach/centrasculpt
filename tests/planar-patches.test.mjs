import assert from "node:assert/strict";
import test from "node:test";
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Euler,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  Vector3,
} from "three";
import { installFileReader, readGlb } from "../scripts/fixtures/export-node.mjs";
import { ExportWork, optimiseExportMesh } from "../work/test-build/export-mesh.mjs";
import { encodeExport } from "../work/test-build/glb-export.mjs";
import { simplifyPlanarPatches } from "../work/test-build/planar-patches.mjs";
import { encodeSTL, validatePrintMesh } from "../work/test-build/stl-export.mjs";
import { identityTransform } from "../work/test-build/transform.mjs";

// Concave footprint, two through-slots, dense flat faces across independent chunks.
function fixture() {
  const n = 32,
    chunks = [],
    material = (x, z) =>
      x >= 0 &&
      z >= 0 &&
      x < n &&
      z < n &&
      !(x >= 28 && z >= 28) &&
      !(x >= 8 && x < 12 && z >= 8 && z < 24) &&
      !(x >= 20 && x < 24 && z >= 8 && z < 24);
  for (let x = 0; x < n; x++) {
    const positions = [],
      normals = [];
    const quad = (points, normal) => {
      for (const ids of [
        [0, 1, 2],
        [0, 2, 3],
      ]) {
        const a = new Vector3(...points[ids[0]]),
          b = new Vector3(...points[ids[1]]),
          c = new Vector3(...points[ids[2]]);
        if (
          b
            .sub(a)
            .cross(c.sub(a))
            .dot(new Vector3(...normal)) < 0
        )
          [ids[1], ids[2]] = [ids[2], ids[1]];
        for (const id of ids) {
          positions.push(...points[id]);
          normals.push(...normal);
        }
      }
    };
    for (let z = 0; z < n; z++)
      if (material(x, z)) {
        const a = x / 8,
          b = (x + 1) / 8,
          c = z / 8,
          d = (z + 1) / 8;
        quad(
          [
            [a, 1, c],
            [b, 1, c],
            [b, 1, d],
            [a, 1, d],
          ],
          [0, 1, 0],
        );
        quad(
          [
            [a, 0, c],
            [b, 0, c],
            [b, 0, d],
            [a, 0, d],
          ],
          [0, -1, 0],
        );
        if (!material(x - 1, z))
          quad(
            [
              [a, 0, c],
              [a, 1, c],
              [a, 1, d],
              [a, 0, d],
            ],
            [-1, 0, 0],
          );
        if (!material(x + 1, z))
          quad(
            [
              [b, 0, c],
              [b, 1, c],
              [b, 1, d],
              [b, 0, d],
            ],
            [1, 0, 0],
          );
        if (!material(x, z - 1))
          quad(
            [
              [a, 0, c],
              [b, 0, c],
              [b, 1, c],
              [a, 1, c],
            ],
            [0, 0, -1],
          );
        if (!material(x, z + 1))
          quad(
            [
              [a, 0, d],
              [b, 0, d],
              [b, 1, d],
              [a, 1, d],
            ],
            [0, 0, 1],
          );
      }
    chunks.push({ positions: new Float32Array(positions), normals: new Float32Array(normals) });
  }
  return { name: "concave slotted fixture", step: 0.125, transform: identityTransform(), chunks };
}
function unpack(mesh) {
  const ids = mesh.indices ?? Uint32Array.from({ length: mesh.positions.length / 3 }, (_, i) => i),
    p = new Float32Array(ids.length * 3);
  ids.forEach((id, i) => {
    p.set(mesh.positions.subarray(id * 3, id * 3 + 3), i * 3);
  });
  return p;
}
function metrics(p) {
  let area = 0,
    volume = 0;
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  for (let i = 0; i < p.length; i += 9) {
    a.fromArray(p, i);
    b.fromArray(p, i + 3);
    c.fromArray(p, i + 6);
    area += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
    volume += a.dot(b.clone().cross(c)) / 6;
  }
  return { area, volume };
}
test("whole planar patches simplify concave surfaces with holes across chunks without moving vertices or seams", async () => {
  const source = fixture(),
    before = structuredClone(source),
    baseline = await optimiseExportMesh(source, "standard"),
    result = await optimiseExportMesh(source, "high");
  assert(
    result.stats.triangles < baseline.stats.triangles * 0.5,
    `${baseline.stats.triangles} → ${result.stats.triangles}`,
  );
  const p = unpack(result),
    original = unpack(baseline),
    report = await validatePrintMesh(p);
  assert.equal(report.boundaryEdges, 0);
  assert.equal(report.nonManifoldEdges, 0);
  assert.equal(report.inconsistentEdges, 0);
  assert.equal(report.degenerateTriangles, 0);
  assert.equal(report.invertedComponents, 0);
  const actual = metrics(p),
    expected = metrics(original);
  assert.equal(actual.area, expected.area);
  assert(Math.abs(actual.volume - expected.volume) < 1e-12);
  const keys = new Set();
  for (let i = 0; i < original.length; i += 3)
    keys.add(`${original[i]},${original[i + 1]},${original[i + 2]}`);
  for (let i = 0; i < p.length; i += 3) assert(keys.has(`${p[i]},${p[i + 1]},${p[i + 2]}`));
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(p, 3));
  const material = new MeshBasicMaterial({ side: DoubleSide }),
    mesh = new Mesh(geometry, material);
  for (const [x, z, hole] of [
    [1.25, 2, true],
    [2.75, 2, true],
    [2, 2, false],
    [3.75, 3.75, true],
  ]) {
    const hits = new Raycaster(new Vector3(x, 2, z), new Vector3(0, -1, 0)).intersectObject(mesh);
    assert.equal(hits.length === 0, hole);
  }
  geometry.dispose();
  material.dispose();
  assert.deepEqual(source, before);
});
test("actual High STL and GLB retain bounds, winding and holes of the planar-patch fixture", async () => {
  const source = fixture();
  const stl = await encodeSTL([source], "high", 256 * 1024 ** 2, 400);
  assert.deepEqual(stl.report.blocking, []);
  assert.deepEqual(stl.report.dimensions, [400, 100, 400]);
  assert.equal(stl.report.boundaryEdges, 0);
  assert.equal(stl.report.inconsistentEdges, 0);
  installFileReader();
  const glb = await encodeExport([source], "high", 256 * 1024 ** 2),
    parsed = await readGlb(glb.data),
    size = new Box3().setFromObject(parsed.scene).getSize(new Vector3());
  assert.deepEqual(size.toArray(), [4, 1, 4]);
  assert.equal(
    new Raycaster(new Vector3(1.25, 2, 2), new Vector3(0, -1, 0)).intersectObject(
      parsed.scene,
      true,
    ).length,
    0,
  );
});
test("paint and incompatible-normal regions are kept; cancelled and stale patch work refuses", async () => {
  const source = fixture(),
    painted = {
      ...source,
      chunks: source.chunks.map((c) => ({
        ...c,
        colours: new Float32Array(c.positions.length).fill(0.5),
      })),
    };
  const standard = await optimiseExportMesh(painted, "standard"),
    high = await optimiseExportMesh(painted, "high");
  assert.deepEqual(high.positions, standard.positions);
  assert.deepEqual(Array.from(high.indices), Array.from(standard.indices));
  const grid = [],
    normals = [],
    tri = [];
  for (let z = 0; z < 4; z++)
    for (let x = 0; x < 4; x++) {
      grid.push(x, x + z, z);
      normals.push(0, 1, 0);
    }
  for (let z = 0; z < 3; z++)
    for (let x = 0; x < 3; x++) {
      const a = x + z * 4;
      tri.push(a, a + 4, a + 1, a + 1, a + 4, a + 5);
    }
  assert.deepEqual(
    (await simplifyPlanarPatches(grid, normals, tri, new ExportWork())).triangles,
    tri,
  );
  await assert.rejects(
    simplifyPlanarPatches(grid, normals, tri, new ExportWork(undefined, () => false)),
    /source changed/,
  );
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    simplifyPlanarPatches(grid, normals, tri, new ExportWork(abort.signal)),
    /cancelled/,
  );
  const active = new AbortController(),
    work = new ExportWork(
      active.signal,
      () => true,
      () => active.abort(),
    );
  await new Promise((r) => setTimeout(r, 5));
  await assert.rejects(simplifyPlanarPatches(grid, normals, tri, work), /cancelled/);
});

test("normal transitions and malformed non-manifold patches do not get retriangulated", async () => {
  const positions = [],
    normals = [],
    triangles = [];
  for (let z = 0; z < 5; z++)
    for (let x = 0; x < 5; x++) {
      positions.push(x, 0, z);
      normals.push(1, 1, 0);
    }
  for (let z = 0; z < 4; z++)
    for (let x = 0; x < 4; x++) {
      const a = x + z * 5;
      triangles.push(a, a + 5, a + 1, a + 1, a + 5, a + 6);
    }
  assert.equal(
    (await simplifyPlanarPatches(positions, normals, triangles, new ExportWork())).removed,
    0,
  );
  for (let i = 0; i < normals.length; i += 3) normals[i] = 0;
  const invalid = [...triangles, ...triangles.slice(0, 3)];
  const result = await simplifyPlanarPatches(positions, normals, invalid, new ExportWork());
  assert.equal(result.removed, 0);
  assert.deepEqual(result.triangles, invalid);
});

function tiltedFixture(angles = [0.31, 0.47, -0.23]) {
  const source = fixture(),
    matrix = new Matrix4().makeRotationFromEuler(new Euler(...angles));
  return {
    ...source,
    chunks: source.chunks.map((c) => {
      const positions = c.positions.slice(),
        normals = c.normals.slice();
      for (let i = 0; i < positions.length; i += 3) {
        new Vector3().fromArray(positions, i).applyMatrix4(matrix).toArray(positions, i);
        new Vector3().fromArray(normals, i).transformDirection(matrix).toArray(normals, i);
      }
      return { positions, normals };
    }),
  };
}
test("arbitrary Float32 rotations simplify holes and concavity with fixed-plane bounds and retained world extrema", async () => {
  for (const angles of [
    [0.31, 0.47, -0.23],
    [-0.67, 0.21, 0.83],
    [0.72, -0.51, 0.19],
  ]) {
    const source = tiltedFixture(angles),
      before = structuredClone(source);
    source.transform = {
      position: [0.3, -0.2, 0.4],
      rotation: [0.12, -0.37, 0.26],
      scale: [1.1, 0.9, 1.2],
    };
    const baseline = await optimiseExportMesh(source, "standard"),
      high = await optimiseExportMesh(source, "high");
    assert(
      high.stats.triangles < baseline.stats.triangles * 0.7,
      `${angles}: ${baseline.stats.triangles} → ${high.stats.triangles}`,
    );
    assert(high.stats.planarPatchDeviationBound > 0);
    assert(high.stats.planarPatchDeviationBound < source.step * 4e-4);
    const p = unpack(high),
      original = unpack(baseline),
      keys = new Set();
    for (let i = 0; i < original.length; i += 3)
      keys.add(`${original[i]},${original[i + 1]},${original[i + 2]}`);
    for (let i = 0; i < p.length; i += 3) assert(keys.has(`${p[i]},${p[i + 1]},${p[i + 2]}`));
    const report = await validatePrintMesh(p);
    assert.equal(report.boundaryEdges, 0);
    assert.equal(report.inconsistentEdges, 0);
    assert.equal(report.nonManifoldEdges, 0);
    assert.equal(report.degenerateTriangles, 0);
    assert.equal(report.invertedComponents, 0);
    const a = metrics(p),
      b = metrics(original);
    assert(Math.abs(a.area - b.area) < b.area * 1e-6);
    assert(Math.abs(a.volume - b.volume) < b.volume * 1e-6);
    const rotation = new Matrix4().makeRotationFromEuler(new Euler(...angles));
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(p, 3));
    const material = new MeshBasicMaterial({ side: DoubleSide }),
      mesh = new Mesh(geometry, material);
    for (const [x, z, hole] of [
      [1.25, 2, true],
      [2.75, 2, true],
      [2, 2, false],
    ]) {
      const start = new Vector3(x, 2, z).applyMatrix4(rotation),
        direction = new Vector3(0, -1, 0).transformDirection(rotation);
      assert.equal(new Raycaster(start, direction).intersectObject(mesh).length === 0, hole);
    }
    const originalGeometry = new BufferGeometry();
    originalGeometry.setAttribute("position", new BufferAttribute(original, 3));
    const originalMesh = new Mesh(originalGeometry, material),
      direction = new Vector3(0, -1, 0).transformDirection(rotation);
    const allowance =
      high.stats.planarPatchDeviationBound + 6 * high.stats.maxPlanarDeviation + 1e-9;
    for (let x = 0; x < 32; x += 4)
      for (let z = 0; z < 32; z += 4) {
        const ray = new Raycaster(
          new Vector3((x + 0.5) / 8, 2, (z + 0.5) / 8).applyMatrix4(rotation),
          direction,
        );
        const oldHits = ray.intersectObject(originalMesh),
          newHits = ray.intersectObject(mesh);
        assert.equal(oldHits.length, newHits.length);
        oldHits.forEach((hit, i) => {
          assert(Math.abs(hit.distance - newHits[i].distance) <= allowance);
        });
      }
    originalGeometry.dispose();
    const stl = await encodeSTL([source], "high", 256 * 1024 ** 2, 400),
      standardStl = await encodeSTL([source], "standard", 256 * 1024 ** 2, 400);
    assert.deepEqual(stl.report.dimensions, standardStl.report.dimensions);
    assert(stl.report.planarPatchDeviationMM > 0 && stl.report.planarPatchDeviationMM < 0.001);
    installFileReader();
    const glb = await encodeExport([source], "high", 256 * 1024 ** 2),
      standardGlb = await encodeExport([source], "standard", 256 * 1024 ** 2);
    const hi = new Box3().setFromObject((await readGlb(glb.data)).scene),
      lo = new Box3().setFromObject((await readGlb(standardGlb.data)).scene);
    assert.deepEqual(hi.min.toArray(), lo.min.toArray());
    assert.deepEqual(hi.max.toArray(), lo.max.toArray());
    geometry.dispose();
    material.dispose();
    assert.deepEqual(source.chunks, before.chunks);
  }
});

test("a shallow curved region cannot drift through chained near-coplanar faces", async () => {
  const p = [],
    normals = [],
    tri = [];
  for (let z = 0; z < 33; z++)
    for (let x = 0; x < 33; x++) {
      const a = x / 8,
        b = z / 8;
      p.push(Math.fround(a), Math.fround(0.0001 * (a * a + b * b)), Math.fround(b));
      const normal = new Vector3(-0.0002 * a, 1, -0.0002 * b).normalize();
      normals.push(...normal.toArray());
    }
  for (let z = 0; z < 32; z++)
    for (let x = 0; x < 32; x++) {
      const a = x + z * 33;
      tri.push(a, a + 33, a + 1, a + 1, a + 33, a + 34);
    }
  const result = await simplifyPlanarPatches(p, normals, tri, new ExportWork(), { step: 0.125 });
  assert.equal(result.removed, 0);
  assert.equal(result.maxDeviation, 0);
  assert.deepEqual(result.triangles, tri);
});
test("cancellation during fixed-plane validation keeps all input arrays", async () => {
  const p = [],
    n = [],
    tri = [];
  for (let z = 0; z < 40; z++)
    for (let x = 0; x < 40; x++) {
      p.push(x / 8, (x + z) / 16, z / 8);
      n.push(...new Vector3(-0.5, 1, -0.5).normalize().toArray());
    }
  for (let z = 0; z < 39; z++)
    for (let x = 0; x < 39; x++) {
      const a = x + z * 40;
      tri.push(a, a + 40, a + 1, a + 1, a + 40, a + 41);
    }
  const before = structuredClone({ p, n, tri }),
    abort = new AbortController(),
    work = new ExportWork(abort.signal);
  work.pause = async (stage) => {
    if (stage === "Validating a fixed plane") abort.abort();
    work.check();
  };
  await assert.rejects(simplifyPlanarPatches(p, n, tri, work, { step: 0.125 }), /cancelled/);
  assert.deepEqual({ p, n, tri }, before);
});
