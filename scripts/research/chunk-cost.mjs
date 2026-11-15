/** Fixed-size online estimates. The current geometry is available before extraction. */
export function chunkCost(classify = () => 0, margin = 1) {
  const buckets = new Float64Array(4);
  let mean = 0;
  return {
    classify,
    estimate(bucket) {
      return (buckets[bucket] || mean || 0.3) * margin + 0.03;
    },
    observe(bucket, ms) {
      const previous = buckets[bucket];
      buckets[bucket] = previous ? 0.75 * previous + 0.25 * ms : ms;
      mean = mean ? 0.75 * mean + 0.25 * ms : ms;
    },
  };
}
