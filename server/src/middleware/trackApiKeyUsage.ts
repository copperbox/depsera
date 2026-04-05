import { Request, Response, NextFunction, RequestHandler } from 'express';
import { getStores } from '../stores';
import { BulkUpsertEntry } from '../stores/interfaces/IApiKeyUsageStore';

interface AccumulatorEntry {
  count: number;
  rejected: number;
}

// Key format: `${apiKeyId}|${granularity}|${bucketStart}` (pipe delimiter avoids ISO colon ambiguity)
let accumulator = new Map<string, AccumulatorEntry>();

function getMinuteBucketStart(now: Date): string {
  return now.toISOString().slice(0, 16) + ':00'; // "2025-01-15T14:32:00"
}

function getHourBucketStart(now: Date): string {
  return now.toISOString().slice(0, 13) + ':00:00'; // "2025-01-15T14:00:00"
}

export function incrementRejected(apiKeyId: string): void {
  const now = new Date();
  for (const [granularity, bucketStart] of [
    ['minute', getMinuteBucketStart(now)],
    ['hour', getHourBucketStart(now)],
  ] as const) {
    const key = `${apiKeyId}|${granularity}|${bucketStart}`;
    const entry = accumulator.get(key) ?? { count: 0, rejected: 0 };
    entry.rejected += 1;
    accumulator.set(key, entry);
  }
}

function flush(): void {
  if (accumulator.size === 0) return;
  const snapshot = accumulator;
  accumulator = new Map(); // atomic swap — safe in Node's single-threaded event loop

  const entries: BulkUpsertEntry[] = [];
  for (const [key, val] of snapshot) {
    const pipeIdx1 = key.indexOf('|');
    const pipeIdx2 = key.indexOf('|', pipeIdx1 + 1);
    const apiKeyId = key.slice(0, pipeIdx1);
    const granularity = key.slice(pipeIdx1 + 1, pipeIdx2) as 'minute' | 'hour';
    const bucketStart = key.slice(pipeIdx2 + 1);
    entries.push({
      api_key_id: apiKeyId,
      granularity,
      bucket_start: bucketStart,
      push_count: val.count,
      rejected_count: val.rejected,
    });
  }

  getStores().apiKeyUsage.bulkUpsert(entries);
}

const FLUSH_INTERVAL_MS = parseInt(process.env.OTLP_USAGE_FLUSH_INTERVAL_MS ?? '5000', 10);
const flushInterval = setInterval(flush, FLUSH_INTERVAL_MS);
flushInterval.unref();
process.on('beforeExit', () => {
  clearInterval(flushInterval);
  flush();
});

export function createTrackApiKeyUsage(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const apiKeyId = req.apiKeyId;
    if (!apiKeyId) {
      next();
      return;
    }

    const now = new Date();
    for (const [granularity, bucketStart] of [
      ['minute', getMinuteBucketStart(now)],
      ['hour', getHourBucketStart(now)],
    ] as const) {
      const key = `${apiKeyId}|${granularity}|${bucketStart}`;
      const entry = accumulator.get(key) ?? { count: 0, rejected: 0 };
      entry.count += 1;
      accumulator.set(key, entry);
    }

    next();
  };
}

// Export for testing
export { flush as _flush, accumulator as _accumulator };
