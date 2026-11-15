const negative = (value) => value < -Number.EPSILON * 32;

/** Conservative independent chunk replacement on an even global lattice. */
export function previewEligibility(read, [x, y, z]) {
  // Require an entirely exterior boundary. The coarse grid is a subset
  // of these samples, so its contour cannot touch the chunk interface.
  for (let a = 0; a <= 8; a++)
    for (let b = 0; b <= 8; b++)
      if (
        negative(read(x, y + a, z + b)) ||
        negative(read(x + 8, y + a, z + b)) ||
        negative(read(x + a, y, z + b)) ||
        negative(read(x + a, y + 8, z + b)) ||
        negative(read(x + a, y + b, z)) ||
        negative(read(x + a, y + b, z + 8))
      )
        return "boundary";
  let inside = false;
  for (let k = 1; k < 8; k++)
    for (let j = 1; j < 8; j++)
      for (let i = 1; i < 8; i++) {
        const fine = negative(read(x + i, y + j, z + k));
        const dx = i & 1,
          dy = j & 1,
          dz = k & 1;
        const bx = x + i - dx,
          by = y + j - dy,
          bz = z + k - dz;
        // At a fine-grid point, every odd coordinate is halfway along
        // a coarse edge. Their tied fractions put the point on a diagonal
        // of the production tetrahedral decomposition from the low corner.
        const v0 = read(bx, by, bz);
        const v1 = read(bx + 2 * dx, by + 2 * dy, bz + 2 * dz);
        const zero = (v) => (Math.abs(v) <= Number.EPSILON * 32 ? 0 : v);
        if (fine !== negative((zero(v0) + zero(v1)) / 2)) return "detail";
        inside ||= fine;
      }
  return inside ? "eligible" : "empty";
}
