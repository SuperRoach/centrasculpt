/** Same inclusive sign predicate as the marching tetrahedra occupancy pass. */
export function hasCrossing(source, start, row, tolerance = Number.EPSILON * 32) {
  const [x, y, z] = start;
  let inside = false;
  let outside = false;
  for (let dz = 0; dz <= 8; dz++) {
    for (let dy = 0; dy <= 8; dy++) {
      source.gatherRow(x, x + 8, y + dy, z + dz, row, 0);
      for (const value of row) {
        if (value < -tolerance) inside = true;
        else outside = true;
        if (inside && outside) return true;
      }
    }
  }
  return false;
}
