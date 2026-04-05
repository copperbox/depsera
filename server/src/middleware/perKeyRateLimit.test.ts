import express from 'express';
import request from 'supertest';
import { createPerKeyRateLimit, evictBucket } from './perKeyRateLimit';

// Mock the stores module
const mockFindById = jest.fn();
jest.mock('../stores', () => ({
  getStores: () => ({
    teamApiKeys: {
      findById: mockFindById,
    },
  }),
}));

// Mock trackApiKeyUsage to capture incrementRejected calls
const mockIncrementRejected = jest.fn();
jest.mock('./trackApiKeyUsage', () => ({
  incrementRejected: mockIncrementRejected,
}));

const BASE_KEY = {
  id: 'key-1',
  team_id: 'team-1',
  name: 'Test Key',
  key_hash: 'abc123',
  key_prefix: 'dps_test',
  rate_limit_rpm: null as number | null,
  rate_limit_admin_locked: 0,
  last_used_at: null,
  created_at: '2025-01-01T00:00:00',
  created_by: 'user-1',
};

function createApp(opts: {
  getNow?: () => number;
  nodeEnv?: string;
  envRpm?: string;
  burstSeconds?: string;
  warningThreshold?: string;
} = {}) {
  const originalEnv = { ...process.env };
  if (opts.nodeEnv !== undefined) process.env.NODE_ENV = opts.nodeEnv;
  if (opts.envRpm !== undefined) process.env.OTLP_PER_KEY_RATE_LIMIT_RPM = opts.envRpm;
  if (opts.burstSeconds !== undefined) process.env.OTLP_RATE_LIMIT_BURST_SECONDS = opts.burstSeconds;
  if (opts.warningThreshold !== undefined) process.env.OTLP_RATE_LIMIT_WARNING_THRESHOLD = opts.warningThreshold;

  const app = express();
  app.use(express.json());

  // Inject apiKeyId on every request
  app.use((req, _res, next) => {
    req.apiKeyId = 'key-1';
    next();
  });

  app.use(createPerKeyRateLimit({ getNow: opts.getNow }));

  app.post('/v1/metrics', (_req, res) => {
    res.json({ ok: true });
  });

  // Cleanup function to restore env
  const cleanup = () => {
    process.env = originalEnv;
  };

  return { app, cleanup };
}

describe('perKeyRateLimit', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFindById.mockReturnValue({ ...BASE_KEY });
    // Reset module-level state by evicting the key
    evictBucket('key-1');
    // Ensure we're not in dev mode
    process.env.NODE_ENV = 'test';
    // Clean rate limit env vars
    delete process.env.OTLP_PER_KEY_RATE_LIMIT_RPM;
    delete process.env.OTLP_RATE_LIMIT_BURST_SECONDS;
    delete process.env.OTLP_RATE_LIMIT_WARNING_THRESHOLD;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('allow path and response headers (DPS-100a)', () => {
    it('should allow requests within limit and call next()', async () => {
      // Small burst so tests are fast: 60 rpm, 6s burst = capacity 6
      mockFindById.mockReturnValue({ ...BASE_KEY, rate_limit_rpm: 60 });
      const now = 1000000;
      const { app } = createApp({ getNow: () => now });

      const res = await request(app).post('/v1/metrics').send({});

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('should set RateLimit-Limit header', async () => {
      mockFindById.mockReturnValue({ ...BASE_KEY, rate_limit_rpm: 60 });
      const now = 1000000;
      const { app } = createApp({ getNow: () => now });

      const res = await request(app).post('/v1/metrics').send({});

      expect(res.headers['ratelimit-limit']).toBe('60');
    });

    it('should set RateLimit-Remaining header', async () => {
      mockFindById.mockReturnValue({ ...BASE_KEY, rate_limit_rpm: 60 });
      const now = 1000000;
      const { app } = createApp({ getNow: () => now });

      const res = await request(app).post('/v1/metrics').send({});

      // capacity = ceil(60/60 * 6) = 6, after consuming 1 token => remaining = 5
      expect(res.headers['ratelimit-remaining']).toBe('5');
    });

    it('should set RateLimit-Reset header', async () => {
      mockFindById.mockReturnValue({ ...BASE_KEY, rate_limit_rpm: 60 });
      const now = 1000000;
      const { app } = createApp({ getNow: () => now });

      const res = await request(app).post('/v1/metrics').send({});

      expect(res.headers['ratelimit-reset']).toBeDefined();
      const resetValue = parseInt(res.headers['ratelimit-reset'] as string, 10);
      expect(resetValue).toBeGreaterThan(0);
    });

    it('should set X-RateLimit-Key header with key prefix', async () => {
      mockFindById.mockReturnValue({ ...BASE_KEY, rate_limit_rpm: 60 });
      const now = 1000000;
      const { app } = createApp({ getNow: () => now });

      const res = await request(app).post('/v1/metrics').send({});

      expect(res.headers['x-ratelimit-key']).toBe('dps_test');
    });

    it('should not set Retry-After header on allowed requests', async () => {
      mockFindById.mockReturnValue({ ...BASE_KEY, rate_limit_rpm: 60 });
      const now = 1000000;
      const { app } = createApp({ getNow: () => now });

      const res = await request(app).post('/v1/metrics').send({});

      expect(res.headers['retry-after']).toBeUndefined();
    });
  });

  describe('429 rejection with OTLP body (DPS-100b)', () => {
    it('should return 429 when bucket is exhausted', async () => {
      // capacity = ceil(60/60 * 6) = 6
      mockFindById.mockReturnValue({ ...BASE_KEY, rate_limit_rpm: 60 });
      const now = 1000000;
      const { app } = createApp({ getNow: () => now });

      // Exhaust all 6 tokens
      for (let i = 0; i < 6; i++) {
        await request(app).post('/v1/metrics').send({});
      }

      // 7th request should be rejected
      const res = await request(app).post('/v1/metrics').send({});

      expect(res.status).toBe(429);
    });

    it('should return OTLP partialSuccess body on 429', async () => {
      mockFindById.mockReturnValue({ ...BASE_KEY, rate_limit_rpm: 60 });
      const now = 1000000;
      const { app } = createApp({ getNow: () => now });

      // Exhaust all 6 tokens
      for (let i = 0; i < 6; i++) {
        await request(app).post('/v1/metrics').send({});
      }

      const res = await request(app).post('/v1/metrics').send({});

      expect(res.body.partialSuccess).toBeDefined();
      expect(res.body.partialSuccess.rejectedDataPoints).toBe(0);
      expect(res.body.partialSuccess.errorMessage).toMatch(/Rate limit exceeded/);
      expect(res.body.partialSuccess.errorMessage).toContain('dps_test');
    });

    it('should set Retry-After header on 429', async () => {
      mockFindById.mockReturnValue({ ...BASE_KEY, rate_limit_rpm: 60 });
      const now = 1000000;
      const { app } = createApp({ getNow: () => now });

      for (let i = 0; i < 6; i++) {
        await request(app).post('/v1/metrics').send({});
      }

      const res = await request(app).post('/v1/metrics').send({});

      expect(res.status).toBe(429);
      expect(res.headers['retry-after']).toBeDefined();
      const retryAfter = parseInt(res.headers['retry-after'] as string, 10);
      expect(retryAfter).toBeGreaterThan(0);
    });

    it('should set RateLimit-Remaining to 0 on 429', async () => {
      mockFindById.mockReturnValue({ ...BASE_KEY, rate_limit_rpm: 60 });
      const now = 1000000;
      const { app } = createApp({ getNow: () => now });

      for (let i = 0; i < 6; i++) {
        await request(app).post('/v1/metrics').send({});
      }

      const res = await request(app).post('/v1/metrics').send({});

      expect(res.status).toBe(429);
      expect(res.headers['ratelimit-remaining']).toBe('0');
    });

    it('should call incrementRejected on 429', async () => {
      mockFindById.mockReturnValue({ ...BASE_KEY, rate_limit_rpm: 60 });
      const now = 1000000;
      const { app } = createApp({ getNow: () => now });

      for (let i = 0; i < 6; i++) {
        await request(app).post('/v1/metrics').send({});
      }

      await request(app).post('/v1/metrics').send({});

      expect(mockIncrementRejected).toHaveBeenCalledWith('key-1');
    });
  });

  describe('rpm variants (DPS-100c)', () => {
    it('should use custom rate_limit_rpm from key over system default', async () => {
      // Custom 120 rpm => capacity = ceil(120/60 * 6) = 12
      mockFindById.mockReturnValue({ ...BASE_KEY, rate_limit_rpm: 120 });
      const now = 1000000;
      const { app } = createApp({ getNow: () => now });

      const res = await request(app).post('/v1/metrics').send({});

      expect(res.headers['ratelimit-limit']).toBe('120');
    });

    it('should fall back to OTLP_PER_KEY_RATE_LIMIT_RPM env var when rate_limit_rpm is null', async () => {
      mockFindById.mockReturnValue({ ...BASE_KEY, rate_limit_rpm: null });
      process.env.OTLP_PER_KEY_RATE_LIMIT_RPM = '300';
      const now = 1000000;
      const { app } = createApp({ getNow: () => now });

      const res = await request(app).post('/v1/metrics').send({});

      expect(res.headers['ratelimit-limit']).toBe('300');
    });

    it('should bypass limiter entirely when rate_limit_rpm is 0', async () => {
      mockFindById.mockReturnValue({ ...BASE_KEY, rate_limit_rpm: 0 });
      const now = 1000000;
      const { app } = createApp({ getNow: () => now });

      // Send many requests — all should pass with no rate limit headers
      for (let i = 0; i < 100; i++) {
        const res = await request(app).post('/v1/metrics').send({});
        expect(res.status).toBe(200);
      }
    });
  });

  describe('soft limit warning header (DPS-100d)', () => {
    it('should set X-RateLimit-Warning when consumption exceeds 80%', async () => {
      // capacity = ceil(60/60 * 6) = 6, 80% consumed = 4.8 tokens used
      mockFindById.mockReturnValue({ ...BASE_KEY, rate_limit_rpm: 60 });
      const now = 1000000;
      const { app } = createApp({ getNow: () => now });

      // Consume 5 tokens (5/6 = 83% consumed)
      for (let i = 0; i < 4; i++) {
        await request(app).post('/v1/metrics').send({});
      }

      // 5th request should trigger warning (consumed = 5/6 = 83%)
      const res = await request(app).post('/v1/metrics').send({});

      expect(res.headers['x-ratelimit-warning']).toBe('true');
    });

    it('should not set X-RateLimit-Warning on fresh bucket with single request', async () => {
      // capacity = 6, 1 consumed = 16.7%
      mockFindById.mockReturnValue({ ...BASE_KEY, rate_limit_rpm: 60 });
      const now = 1000000;
      const { app } = createApp({ getNow: () => now });

      const res = await request(app).post('/v1/metrics').send({});

      expect(res.headers['x-ratelimit-warning']).toBeUndefined();
    });
  });

  describe('burst capacity (DPS-100e)', () => {
    it('should allow exactly capacity number of requests in a burst', async () => {
      // 60 rpm, 6s burst => capacity = 6
      mockFindById.mockReturnValue({ ...BASE_KEY, rate_limit_rpm: 60 });
      const now = 1000000;
      const { app } = createApp({ getNow: () => now });

      // All 6 should pass
      for (let i = 0; i < 6; i++) {
        const res = await request(app).post('/v1/metrics').send({});
        expect(res.status).toBe(200);
      }

      // 7th fails
      const res = await request(app).post('/v1/metrics').send({});
      expect(res.status).toBe(429);
    });

    it('should refill tokens over time and allow new requests', async () => {
      // 60 rpm => 1 req/sec, capacity = 6
      mockFindById.mockReturnValue({ ...BASE_KEY, rate_limit_rpm: 60 });
      let now = 1000000;
      const { app } = createApp({ getNow: () => now });

      // Exhaust all 6 tokens
      for (let i = 0; i < 6; i++) {
        await request(app).post('/v1/metrics').send({});
      }

      // Advance 2 seconds => 2 tokens refilled
      now += 2000;
      const res = await request(app).post('/v1/metrics').send({});
      expect(res.status).toBe(200);
    });
  });

  describe('evictBucket re-reads from DB (DPS-100f)', () => {
    it('should re-read rate limit from store after eviction', async () => {
      // Start with 60 rpm
      mockFindById.mockReturnValue({ ...BASE_KEY, rate_limit_rpm: 60 });
      let now = 1000000;
      const { app } = createApp({ getNow: () => now });

      const res1 = await request(app).post('/v1/metrics').send({});
      expect(res1.headers['ratelimit-limit']).toBe('60');

      // Simulate DB update: change to 120 rpm
      mockFindById.mockReturnValue({ ...BASE_KEY, rate_limit_rpm: 120 });
      evictBucket('key-1');

      // Next request should pick up new limit
      now += 100;
      const res2 = await request(app).post('/v1/metrics').send({});
      expect(res2.headers['ratelimit-limit']).toBe('120');
    });

    it('should call findById again after eviction', async () => {
      mockFindById.mockReturnValue({ ...BASE_KEY, rate_limit_rpm: 60 });
      let now = 1000000;
      const { app } = createApp({ getNow: () => now });

      await request(app).post('/v1/metrics').send({});
      const callCountBefore = mockFindById.mock.calls.length;

      evictBucket('key-1');
      now += 100;
      await request(app).post('/v1/metrics').send({});

      // Should have called findById at least once more after eviction
      expect(mockFindById.mock.calls.length).toBeGreaterThan(callCountBefore);
    });
  });

  describe('dev mode bypass (DPS-100g)', () => {
    it('should skip rate limiting in development mode', async () => {
      mockFindById.mockReturnValue({ ...BASE_KEY, rate_limit_rpm: 60 });
      const now = 1000000;
      process.env.NODE_ENV = 'development';
      const { app } = createApp({ getNow: () => now, nodeEnv: 'development' });

      // Send more requests than capacity — all should pass
      for (let i = 0; i < 20; i++) {
        const res = await request(app).post('/v1/metrics').send({});
        expect(res.status).toBe(200);
      }
    });

    it('should not set rate limit headers in development mode', async () => {
      mockFindById.mockReturnValue({ ...BASE_KEY, rate_limit_rpm: 60 });
      const now = 1000000;
      process.env.NODE_ENV = 'development';
      const { app } = createApp({ getNow: () => now, nodeEnv: 'development' });

      const res = await request(app).post('/v1/metrics').send({});

      expect(res.headers['ratelimit-limit']).toBeUndefined();
      expect(res.headers['ratelimit-remaining']).toBeUndefined();
      expect(res.headers['x-ratelimit-key']).toBeUndefined();
    });
  });
});
