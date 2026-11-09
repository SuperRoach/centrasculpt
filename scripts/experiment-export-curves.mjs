// Offline diagnostic only. Never writes a replacement STL.
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { MeshoptSimplifier as simplifier } from "meshoptimizer";
import { Vector3 } from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import {
  compareSections,
  holderFeatureSections,
  sectionProbes,
} from "./fixtures/export-section-probes.mjs";
import { silhouetteMasks } from "./fixtures/export-silhouette.mjs";
import { sampledDistance } from "./fixtures/export-surface-probes.mjs";

await import("./compile-core.mjs");
const { validatePrintMesh } = await import("../work/test-build/stl-export.mjs");
await simplifier.ready;
simplifier.useExperimentalFeatures = true;
function closedOutward(report) {
  return (
    !report.blocking.length &&
    report.components === 1 &&
    report.boundaryEdges === 0 &&
    report.nonManifoldEdges === 0 &&
    report.inconsistentEdges === 0 &&
    report.degenerateTriangles === 0 &&
    report.invertedComponents === 0
  );
}
const gentle = process.argv[2] === "--gentle";
const minimal = process.argv[2] === "--minimal";
const targetRatio = minimal ? 0.99 : gentle ? 0.9 : 0.5;
const exact = process.argv[2] === "--exact";
for (const file of process.argv.slice(gentle || exact || minimal ? 3 : 2)) {
  if ((await stat(file)).size > 84 + 50 * 300000)
    throw new Error("Diagnostic limit 300k binary STL faces");
  const bytes = await readFile(file);
  const faces = bytes.readUInt32LE(80);
  if (!faces || bytes.length !== 84 + 50 * faces) throw new Error("Expected bounded binary STL");
  const geometry = new STLLoader().parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const p = geometry.attributes.position.array;
  const before = await validatePrintMesh(p);
  const budgetMM = 0.1;
  if (!closedOutward(before)) {
    console.log(JSON.stringify({ file, faces, refused: "source topology", before }));
    continue;
  }
  if (exact) {
    console.log(JSON.stringify({ file, faces, selectedFaces: faces, exact, before }));
    continue;
  }
  const start = performance.now();
  const ids = new Map(),
    indices = new Uint32Array(p.length / 3),
    coords = [],
    firstNormals = [],
    locks = [];
  const a = new Vector3(),
    b = new Vector3(),
    c = new Vector3();
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  const extent = Math.max(...min.toArray().map(Math.abs), ...max.toArray().map(Math.abs)) * 2.01;
  for (let i = 0; i < p.length; i += 9) {
    a.fromArray(p, i);
    b.fromArray(p, i + 3);
    c.fromArray(p, i + 6);
    const normal = b.sub(a).cross(c.sub(a)).normalize();
    for (let k = i; k < i + 9; k += 3) {
      const x = p[k],
        y = p[k + 1],
        z = p[k + 2],
        key = `${x},${y},${z}`;
      let id = ids.get(key);
      if (id === undefined) {
        id = coords.length / 3;
        ids.set(key, id);
        coords.push(x, y, z);
        firstNormals.push(normal.clone());
        locks.push(
          Number(
            x === min.x || x === max.x || y === min.y || y === max.y || z === min.z || z === max.z,
          ),
        );
      } else if (firstNormals[id].dot(normal) < Math.cos(Math.PI / 12)) locks[id] = 1;
      indices[k / 3] = id;
    }
  }
  const [out, errorMM] = simplifier.simplifyWithAttributes(
    indices,
    new Float32Array(coords),
    3,
    new Float32Array(locks.length),
    1,
    [0],
    Uint8Array.from(locks),
    Math.floor(faces * targetRatio) * 3,
    minimal ? budgetMM / 100 : gentle ? budgetMM / 10 : budgetMM,
    ["LockBorder", "ErrorAbsolute"],
  );
  const candidate = new Float32Array(out.length * 3);
  for (let i = 0; i < out.length; i++)
    for (let k = 0; k < 3; k++) candidate[i * 3 + k] = coords[out[i] * 3 + k];
  const simplifyMs = performance.now() - start;
  const after = await validatePrintMesh(candidate);
  const sections = compareSections(sectionProbes(p, extent), sectionProbes(candidate, extent));
  const masks = silhouetteMasks(p, extent);
  const changedPixels = silhouetteMasks(candidate, extent).reduce(
    (sum, mask, axis) => sum + mask.reduce((n, v, i) => n + Number(v !== masks[axis][i]), 0),
    0,
  );
  const forward = sampledDistance(p, candidate),
    reverse = sampledDistance(candidate, p);
  // Closed edge-manifold triangles have E = 3F/2. Compare Euler characteristic too.
  const sourceEuler = ids.size - faces / 2,
    candidateEuler = new Set(out).size - out.length / 6;
  const knownHolder = /^(holder-443|boolean-array)-192-high\.stl$/.test(file.split("/").at(-1));
  let namedFeatures;
  if (knownHolder) {
    const reference = holderFeatureSections(p),
      proposed = holderFeatureSections(candidate);
    const delta = compareSections(reference, proposed);
    namedFeatures = {
      reference,
      proposed,
      delta,
      pass:
        reference[0].length === 8 &&
        reference[1].length === 2 &&
        !delta.changedCounts &&
        delta.maxIntervalMM <= budgetMM &&
        delta.maxDepthMM <= budgetMM,
    };
  }
  const accepted =
    (!namedFeatures || namedFeatures.pass) &&
    sourceEuler === candidateEuler &&
    forward.maxMM <= budgetMM &&
    reverse.maxMM <= budgetMM &&
    errorMM <= budgetMM &&
    closedOutward(after) &&
    before.dimensions.every((d, i) => d === after.dimensions[i]) &&
    !changedPixels &&
    !sections.changedCounts &&
    sections.maxDepthMM <= budgetMM &&
    sections.maxIntervalMM <= budgetMM;
  console.log(
    JSON.stringify({
      file,
      faces,
      gentle,
      targetRatio,
      sourceEuler,
      candidateEuler,
      candidateHash: createHash("sha256").update(candidate).digest("hex"),
      candidateFaces: out.length / 3,
      selectedFaces: accepted ? out.length / 3 : faces,
      accepted,
      budgetMM,
      errorMM,
      namedFeatures,
      forward,
      reverse,
      lockedVertices: locks.filter(Boolean).length,
      vertices: locks.length,
      after,
      sections,
      changedPixels,
      simplifyMs,
      peakRSSMiB: process.resourceUsage().maxRSS / 1024,
    }),
  );
}
