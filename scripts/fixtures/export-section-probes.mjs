// Three orthographic ray grids in the same physical coordinate frame.
// Retain every depth so an occluded recess or internal wall can change the result.
const size = 96;
export function sectionProbes(p, extent) {
  let tested = 0,
    stored = 0;
  return [0, 1, 2].flatMap((axis) => {
    const a = (axis + 1) % 3,
      b = (axis + 2) % 3;
    const cells = Array.from({ length: size * size }, () => []);
    for (let i = 0; i < p.length; i += 9) {
      const grid = (v) => (v / extent + 0.5) * size;
      const x = grid(p[i + a]),
        y = grid(p[i + b]);
      const ux = grid(p[i + 3 + a]) - x,
        uy = grid(p[i + 3 + b]) - y;
      const vx = grid(p[i + 6 + a]) - x,
        vy = grid(p[i + 6 + b]) - y;
      const det = ux * vy - uy * vx;
      if (Math.abs(det) < 1e-12) continue;
      for (
        let j = Math.max(0, Math.floor(Math.min(y, y + uy, y + vy)));
        j <= Math.min(size - 1, Math.ceil(Math.max(y, y + uy, y + vy)));
        j++
      ) {
        for (
          let k = Math.max(0, Math.floor(Math.min(x, x + ux, x + vx)));
          k <= Math.min(size - 1, Math.ceil(Math.max(x, x + ux, x + vx)));
          k++
        ) {
          if (++tested > 64000000) throw new Error("Section probe work limit");
          const dx = k + 0.371 - x,
            dy = j + 0.617 - y;
          const u = (dx * vy - dy * vx) / det,
            v = (ux * dy - uy * dx) / det;
          if (u >= 0 && v >= 0 && u + v <= 1) {
            if (++stored > 1000000) throw new Error("Section probe storage limit");
            cells[j * size + k].push(
              p[i + axis] +
                u * (p[i + 3 + axis] - p[i + axis]) +
                v * (p[i + 6 + axis] - p[i + axis]),
            );
          }
        }
      }
    }
    return cells.map((hits) => hits.sort((x, y) => x - y));
  });
}
export function compareSections(before, after) {
  let changedCounts = 0,
    maxDepthMM = 0,
    maxIntervalMM = 0;
  const errors = [];
  for (let i = 0; i < before.length; i++) {
    const a = before[i],
      b = after[i];
    if (a.length !== b.length) {
      changedCounts++;
      continue;
    }
    for (let j = 0; j < a.length; j++) {
      const err = Math.abs(a[j] - b[j]);
      errors.push(err);
      maxDepthMM = Math.max(maxDepthMM, err);
      if (j) maxIntervalMM = Math.max(maxIntervalMM, Math.abs(a[j] - a[j - 1] - (b[j] - b[j - 1])));
    }
  }
  errors.sort((a, b) => a - b);
  return {
    changedCounts,
    maxDepthMM,
    maxIntervalMM,
    p95DepthMM: errors[Math.floor(errors.length * 0.95)] ?? 0,
    samples: errors.length,
  };
}

// Known 1:1, centred, 443 mm synthetic fixture. Cross all three cutter
// openings at y=15 mm, then measure vertical material below the centre pocket.
export function holderFeatureSections(p) {
  return [
    [0, 15, 0.071],
    [1, 0.091, 0.073],
  ].map(([axis, x, y]) => {
    const hits = [],
      a = (axis + 1) % 3,
      b = (axis + 2) % 3;
    for (let i = 0; i < p.length; i += 9) {
      const ux = p[i + 3 + a] - p[i + a],
        uy = p[i + 3 + b] - p[i + b];
      const vx = p[i + 6 + a] - p[i + a],
        vy = p[i + 6 + b] - p[i + b];
      const det = ux * vy - uy * vx;
      if (Math.abs(det) < 1e-12) continue;
      const dx = x - p[i + a],
        dy = y - p[i + b];
      const u = (dx * vy - dy * vx) / det,
        v = (ux * dy - uy * dx) / det;
      if (u >= 0 && v >= 0 && u + v <= 1)
        hits.push(
          p[i + axis] + u * (p[i + 3 + axis] - p[i + axis]) + v * (p[i + 6 + axis] - p[i + axis]),
        );
    }
    return hits.sort((a, b) => a - b);
  });
}
