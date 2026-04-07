import { Request, Response, NextFunction, RequestHandler } from 'express';
import { TeamApiKey } from '../db/types';
import { getStores } from '../stores';
import logger from '../utils/logger';

interface TokenBucket {
  tokens: number;
  capacity: number;
  refillRatePerMs: number;
  lastRefillAt: number;
  effectiveRpm: number;
}

const buckets = new Map<string, TokenBucket>();
const lastAlertAt = new Map<string, number>();

export function evictBucket(apiKeyId: string): void {
  buckets.delete(apiKeyId);
}

function getEffectiveRpm(key: TeamApiKey): number {
  if (key.rate_limit_rpm !== null) return key.rate_limit_rpm;
  return parseInt(process.env.OTLP_PER_KEY_RATE_LIMIT_RPM ?? '150000', 10);
}

function getOrCreateBucket(apiKeyId: string, getNow: () => number): TokenBucket | null {
  let bucket = buckets.get(apiKeyId);
  if (bucket) return bucket;

  const stores = getStores();
  const key = stores.teamApiKeys.findById(apiKeyId);
  if (!key) return null;

  const effectiveRpm = getEffectiveRpm(key);

  // rpm = 0 means unlimited (admin-only) — no bucket needed
  if (effectiveRpm === 0) return null;

  const refillRatePerSec = effectiveRpm / 60;
  const burstSeconds = parseInt(process.env.OTLP_RATE_LIMIT_BURST_SECONDS ?? '6', 10);
  const capacity = Math.ceil(refillRatePerSec * burstSeconds);

  bucket = {
    tokens: capacity,
    capacity,
    refillRatePerMs: refillRatePerSec / 1000,
    lastRefillAt: getNow(),
    effectiveRpm,
  };

  buckets.set(apiKeyId, bucket);
  return bucket;
}

function refillBucket(bucket: TokenBucket, now: number): void {
  const elapsed = now - bucket.lastRefillAt;
  bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsed * bucket.refillRatePerMs);
  bucket.lastRefillAt = now;
}

function setRateLimitHeaders(res: Response, bucket: TokenBucket, keyPrefix: string, now: number): void {
  res.setHeader('RateLimit-Limit', bucket.effectiveRpm);
  res.setHeader('RateLimit-Remaining', Math.max(0, Math.floor(bucket.tokens)));
  res.setHeader(
    'RateLimit-Reset',
    Math.ceil(now / 1000 + (bucket.capacity - bucket.tokens) / bucket.refillRatePerMs / 1000),
  );
  res.setHeader('X-RateLimit-Key', keyPrefix);
}

export function createPerKeyRateLimit(options?: { getNow?: () => number }): RequestHandler {
  const getNow = options?.getNow ?? Date.now;

  return (req: Request, res: Response, next: NextFunction): void => {
    if (process.env.NODE_ENV === 'development') {
      next();
      return;
    }

    const apiKeyId = req.apiKeyId;
    if (!apiKeyId) {
      next();
      return;
    }

    const stores = getStores();
    const key = stores.teamApiKeys.findById(apiKeyId);
    if (!key) {
      next();
      return;
    }

    // rpm = 0 means unlimited — skip rate limiting entirely
    if (key.rate_limit_rpm === 0) {
      next();
      return;
    }

    const bucket = getOrCreateBucket(apiKeyId, getNow);
    if (!bucket) {
      next();
      return;
    }

    const now = getNow();
    refillBucket(bucket, now);

    const WARNING_THRESHOLD = parseFloat(process.env.OTLP_RATE_LIMIT_WARNING_THRESHOLD ?? '0.80');

    if (bucket.tokens < 1) {
      // Rejection path — 429
      const retryAfterSec = Math.ceil((1 - bucket.tokens) / bucket.refillRatePerMs / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      setRateLimitHeaders(res, bucket, key.key_prefix, now);

      // Track rejected request in usage accumulator
      try {
        // Dynamic import to avoid circular dependency at module load time
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { incrementRejected } = require('./trackApiKeyUsage');
        incrementRejected(apiKeyId);
      } catch {
        // trackApiKeyUsage not yet loaded — skip
      }

      res.status(429).json({
        partialSuccess: {
          rejectedDataPoints: 0,
          errorMessage: `Rate limit exceeded for API key ${key.key_prefix}. Limit: ${bucket.effectiveRpm} req/min. Retry-After: ${retryAfterSec}s.`,
        },
      });
      return;
    }

    // Allow path — consume one token
    bucket.tokens -= 1;
    setRateLimitHeaders(res, bucket, key.key_prefix, now);

    // Check soft limit warning
    const consumedRatio = (bucket.capacity - bucket.tokens) / bucket.capacity;
    if (consumedRatio >= WARNING_THRESHOLD) {
      res.setHeader('X-RateLimit-Warning', 'true');

      // Alert debounce — fire at most once per 15 minutes per key
      const ALERT_DEBOUNCE_MS = 15 * 60 * 1000;
      const last = lastAlertAt.get(apiKeyId) ?? 0;
      if (now - last > ALERT_DEBOUNCE_MS) {
        lastAlertAt.set(apiKeyId, now);
        const used = bucket.capacity - Math.floor(bucket.tokens);
        const pct = Math.round(consumedRatio * 100);
        setImmediate(() => {
          logger.warn(
            { apiKeyId, keyPrefix: key.key_prefix, consumedPct: pct, effectiveRpm: bucket.effectiveRpm },
            `API key \`${key.key_prefix}\` is at ${pct}% of its rate limit (${used}/${bucket.effectiveRpm} req/min).`,
          );
        });
      }
    }

    next();
  };
}
