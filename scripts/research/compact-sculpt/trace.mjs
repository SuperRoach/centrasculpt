export function strokeTrace() {
  const radius = 10,
    trace = [];
  // Rounded head and shoulders laid down in overlapping, short Clay sweeps.
  const block = (centerY, axes) => {
    for (let y = -axes[1]; y <= axes[1]; y += 8)
      for (let z = -axes[2]; z <= axes[2]; z += 8) {
        const t = 1 - (y / axes[1]) ** 2 - (z / axes[2]) ** 2;
        if (t < 0) continue;
        const half = Math.round(axes[0] * Math.sqrt(t));
        const pieces = Math.max(1, Math.ceil((2 * half) / 8));
        for (let i = 0; i < pieces; i++) {
          const a = [-half + Math.round((2 * half * i) / pieces), centerY + y, z];
          const b = [-half + Math.round((2 * half * (i + 1)) / pieces), centerY + y, z];
          trace.push({ phase: "blockout", mode: "construct", a, b, radius });
        }
      }
  };
  block(-23, [29, 8, 11]);
  block(-11, [7, 6, 7]);
  block(10, [16, 24, 12]);
  // Nose, brow, cheeks and ears, followed by repeated overlapping finish work.
  const features = [
    [[0, 14, 17], [0, 8, 23], 5],
    [[-11, 15, 16], [-3, 16, 19], 5],
    [[3, 16, 19], [11, 15, 16], 5],
    [[-13, 5, 13], [-7, 6, 17], 6],
    [[7, 6, 17], [13, 5, 13], 6],
    [[-21, 7, 1], [-22, 15, 1], 5],
    [[21, 7, 1], [22, 15, 1], 5],
  ];
  for (const [a, b, radius] of features)
    trace.push({ phase: "detail", mode: "construct", a, b, radius });
  for (let pass = 0; pass < 5; pass++) {
    for (const [a, b, radius] of features) {
      trace.push({ phase: "finish", mode: "add", a, b, radius });
      trace.push({ phase: "finish", mode: "smooth", a, b, radius });
    }
  }
  return trace;
}
