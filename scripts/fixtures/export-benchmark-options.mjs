export function parseBenchmarkOptions(args) {
  const options = {
    output: "work/phase-7-5-4a",
    repeats: 3,
    warmup: 1,
    resolutions: [192],
    fixtures: ["clay", "curved-192", "holder-443", "boolean-array"],
    formats: ["stl", "glb"],
  };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i],
      value = args[++i];
    if (!value) throw new Error(`Missing value: ${flag}`);
    if (flag === "--output") options.output = value;
    else if (flag === "--native-copy") options.native = value;
    else if (flag === "--label") {
      if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error("Use a filename-safe label");
      options.label = value;
    } else if (flag === "--probe") {
      if (!["cancel", "stale", "memory"].includes(value)) throw new Error("Unknown probe");
      options.probe = value;
    } else if (flag === "--repeats" || flag === "--warmup") {
      const n = Number(value);
      if (!Number.isInteger(n) || n < (flag === "--repeats" ? 1 : 0) || n > 20)
        throw new Error("Invalid repeat/warmup count");
      options[flag.slice(2)] = n;
    } else if (flag === "--resolutions") {
      options.resolutions = value.split(",").map(Number);
      if (options.resolutions.some((n) => ![192, 256].includes(n)))
        throw new Error("Choose 192,256");
    } else if (flag === "--fixtures") {
      options.fixtures = value.split(",");
      if (
        options.fixtures.some(
          (n) => !["clay", "curved-192", "holder-443", "boolean-array"].includes(n),
        )
      )
        throw new Error("Unknown fixture");
    } else if (flag === "--formats") {
      options.formats = value.split(",");
      if (options.formats.some((n) => !["stl", "glb"].includes(n)))
        throw new Error("Unknown format");
    } else throw new Error(`Unknown option: ${flag}`);
  }
  return options;
}
export function summarise(rows) {
  const groups = new Map();
  for (const row of rows.filter((r) => r.repeat >= 0)) {
    const key = [row.name, row.requestedResolution ?? row.resolution, row.quality, row.format].join(
      "/",
    );
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups].map(([key, runs]) => {
    const times = runs
      .map((r) => r.pipelineWallMs)
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    return {
      key,
      runs: runs.length,
      encodedTimings: times.length,
      minMs: times[0],
      medianMs: times.length
        ? (times[Math.floor((times.length - 1) / 2)] + times[Math.ceil((times.length - 1) / 2)]) / 2
        : null,
      maxMs: times.at(-1),
      refusals: runs
        .map((r) => r.refused ?? r.qualities[0]?.refused ?? r.qualities[0]?.report?.blocking)
        .filter((reason) => (Array.isArray(reason) ? reason.length > 0 : Boolean(reason))),
    };
  });
}
