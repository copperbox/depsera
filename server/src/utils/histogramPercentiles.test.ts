import { computePercentiles, HistogramBuckets } from './histogramPercentiles';

describe('computePercentiles', () => {
  it('returns zeros for an empty histogram (count=0)', () => {
    const buckets: HistogramBuckets = {
      explicitBounds: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
      bucketCounts: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      count: 0,
    };

    const result = computePercentiles(buckets);

    expect(result.p50).toBe(0);
    expect(result.p95).toBe(0);
    expect(result.p99).toBe(0);
    expect(result.min).toBe(0);
    expect(result.max).toBe(0);
    expect(result.count).toBe(0);
    expect(result.avgMs).toBe(0);
  });

  it('computes percentiles for a uniform distribution', () => {
    // 100 requests uniformly spread across 10 buckets (10 per bucket)
    // Bounds: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100] ms
    const buckets: HistogramBuckets = {
      explicitBounds: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
      bucketCounts: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10],
      count: 100,
      sum: 50, // sum in same unit as bounds (ms here since multiplier=1)
    };

    const result = computePercentiles(buckets, 1);

    // p50 should be around 50ms (median of uniform 0-100)
    expect(result.p50).toBeGreaterThanOrEqual(45);
    expect(result.p50).toBeLessThanOrEqual(55);

    // p95 should be around 95ms
    expect(result.p95).toBeGreaterThanOrEqual(90);
    expect(result.p95).toBeLessThanOrEqual(100);

    // p99 should be around 99ms
    expect(result.p99).toBeGreaterThanOrEqual(95);
    expect(result.p99).toBeLessThanOrEqual(100);

    expect(result.count).toBe(100);
  });

  it('computes percentiles for a single-bucket histogram', () => {
    // All 50 requests in the [0, 0.1) bucket → 0 to 100ms range
    const buckets: HistogramBuckets = {
      explicitBounds: [0.1],
      bucketCounts: [50, 0], // 50 in first bucket, 0 in overflow
      count: 50,
    };

    const result = computePercentiles(buckets);

    // All values within [0, 100ms], interpolation within that range
    expect(result.p50).toBe(50); // 0.5 * 100ms
    expect(result.p95).toBe(95); // 0.95 * 100ms
    expect(result.p99).toBe(99); // 0.99 * 100ms
    expect(result.count).toBe(50);
  });

  it('handles overflow bucket by capping at last explicit bound', () => {
    // Most values in the overflow bucket (beyond last bound)
    const buckets: HistogramBuckets = {
      explicitBounds: [0.1, 0.5, 1],
      bucketCounts: [0, 0, 0, 100], // all in overflow
      count: 100,
    };

    const result = computePercentiles(buckets);

    // Overflow bucket interpolation is capped at last bound (1s = 1000ms)
    // Since lower bound is also 1 (bounds[2]) and upper bound capped at 1 (bounds[2]),
    // all values should equal 1000ms
    expect(result.p50).toBe(1000);
    expect(result.p95).toBe(1000);
    expect(result.p99).toBe(1000);
  });

  it('applies seconds-to-ms conversion with default unitMultiplier', () => {
    // OTel convention: bounds in seconds
    const buckets: HistogramBuckets = {
      explicitBounds: [0.005, 0.01, 0.025, 0.05, 0.1],
      bucketCounts: [0, 0, 100, 0, 0, 0], // all in [0.01, 0.025) bucket
      count: 100,
      sum: 1.75, // average of 17.5ms in seconds
    };

    // Default multiplier = 1000
    const result = computePercentiles(buckets);

    // p50 should be in the [10ms, 25ms] range
    expect(result.p50).toBeGreaterThanOrEqual(10);
    expect(result.p50).toBeLessThanOrEqual(25);

    // avgMs should be sum/count * 1000 = 17.5
    expect(result.avgMs).toBe(17.5);
  });

  it('uses min/max from histogram data when provided', () => {
    const buckets: HistogramBuckets = {
      explicitBounds: [0.1, 0.5, 1],
      bucketCounts: [10, 80, 10, 0],
      count: 100,
      min: 0.002, // 2ms
      max: 0.95,  // 950ms
    };

    const result = computePercentiles(buckets);

    expect(result.min).toBe(2);    // 0.002 * 1000
    expect(result.max).toBe(950);  // 0.95 * 1000
  });

  it('computes count from bucketCounts when count field is absent', () => {
    const buckets: HistogramBuckets = {
      explicitBounds: [10, 20],
      bucketCounts: [5, 10, 3],
      // no count field
    };

    const result = computePercentiles(buckets, 1);

    expect(result.count).toBe(18); // 5 + 10 + 3
  });

  it('handles skewed distribution correctly', () => {
    // Most values in the first bucket (fast requests)
    const buckets: HistogramBuckets = {
      explicitBounds: [0.01, 0.05, 0.1, 0.5, 1],
      bucketCounts: [950, 30, 10, 8, 2, 0],
      count: 1000,
    };

    const result = computePercentiles(buckets);

    // p50 should be within first bucket [0, 10ms]
    expect(result.p50).toBeLessThanOrEqual(10);

    // p99 should be in the higher buckets
    expect(result.p99).toBeGreaterThan(10);
  });
});
