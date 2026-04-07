/**
 * Input: explicit-boundary histogram bucket data from OTLP.
 */
export interface HistogramBuckets {
  explicitBounds: number[];
  bucketCounts: number[];
  sum?: number;
  count?: number;
  min?: number;
  max?: number;
}

/**
 * Output: computed percentiles and summary statistics.
 */
export interface PercentileResult {
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  count: number;
  avgMs: number;
}

/**
 * Compute percentile approximations from explicit-boundary histogram buckets
 * using linear interpolation within each bucket.
 *
 * @param buckets - Histogram bucket data
 * @param unitMultiplier - Multiplier to convert bucket bounds to milliseconds.
 *   Defaults to 1000 (OTel convention: latency in seconds → ms).
 *   Pass 1 if bounds are already in ms.
 */
export function computePercentiles(
  buckets: HistogramBuckets,
  unitMultiplier: number = 1000,
): PercentileResult {
  const { explicitBounds, bucketCounts, sum, count, min, max } = buckets;

  // Empty histogram — return zeros
  const totalCount = count ?? bucketCounts.reduce((a, b) => a + b, 0);
  if (totalCount === 0) {
    return { p50: 0, p95: 0, p99: 0, min: 0, max: 0, count: 0, avgMs: 0 };
  }

  // Build cumulative counts
  const cumulative: number[] = [];
  let running = 0;
  for (const c of bucketCounts) {
    running += c;
    cumulative.push(running);
  }

  const p50 = interpolatePercentile(0.50, explicitBounds, cumulative, totalCount, unitMultiplier);
  const p95 = interpolatePercentile(0.95, explicitBounds, cumulative, totalCount, unitMultiplier);
  const p99 = interpolatePercentile(0.99, explicitBounds, cumulative, totalCount, unitMultiplier);

  const resolvedMin = min !== undefined ? min * unitMultiplier : p50;
  const resolvedMax = max !== undefined ? max * unitMultiplier : p99;
  const avgMs = sum !== undefined && totalCount > 0
    ? (sum / totalCount) * unitMultiplier
    : p50;

  return {
    p50: Math.round(p50 * 100) / 100,
    p95: Math.round(p95 * 100) / 100,
    p99: Math.round(p99 * 100) / 100,
    min: Math.round(resolvedMin * 100) / 100,
    max: Math.round(resolvedMax * 100) / 100,
    count: totalCount,
    avgMs: Math.round(avgMs * 100) / 100,
  };
}

/**
 * Linear interpolation within the bucket where the cumulative count
 * crosses the target rank (count * percentile).
 */
function interpolatePercentile(
  percentile: number,
  bounds: number[],
  cumulative: number[],
  totalCount: number,
  unitMultiplier: number,
): number {
  const rank = totalCount * percentile;

  // Find the bucket where cumulative count crosses the rank
  for (let i = 0; i < cumulative.length; i++) {
    if (cumulative[i] >= rank) { // eslint-disable-line security/detect-object-injection
      // Lower bound of the bucket
      const lowerBound = i === 0 ? 0 : bounds[i - 1];
      // Upper bound — for the overflow bucket (last), cap at last explicit bound
      const upperBound = i < bounds.length ? bounds[i] : bounds[bounds.length - 1]; // eslint-disable-line security/detect-object-injection

      const bucketCount = i === 0 ? cumulative[0] : cumulative[i] - cumulative[i - 1]; // eslint-disable-line security/detect-object-injection
      if (bucketCount === 0) {
        return lowerBound * unitMultiplier;
      }

      // How far into this bucket the rank falls
      const prevCumulative = i === 0 ? 0 : cumulative[i - 1];
      const fraction = (rank - prevCumulative) / bucketCount;

      const value = lowerBound + fraction * (upperBound - lowerBound);
      return value * unitMultiplier;
    }
  }

  // Fallback: last bucket bound (shouldn't happen with valid data)
  return (bounds[bounds.length - 1] ?? 0) * unitMultiplier;
}
