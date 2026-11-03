export function applyTestConcurrency(flags, configured = process.env.TEST_CONCURRENCY) {
  const isSet = (flag) => flag === "--test-concurrency" || flag.startsWith("--test-concurrency=");
  if (flags.some(isSet)) return flags;

  const concurrency = configured === undefined ? 4 : Number(configured);
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error("TEST_CONCURRENCY must be a positive integer.");
  }
  return [...flags, `--test-concurrency=${concurrency}`];
}
