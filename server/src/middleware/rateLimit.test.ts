import express from 'express';
import request from 'supertest';
import { createGlobalRateLimit, createAuthRateLimit, parseRateLimitConfig } from './rateLimit';

function createApp(opts: { globalMax?: number; authMax?: number } = {}) {
  const app = express();

  app.use(express.json());

  // Apply global rate limit to all routes
  app.use(createGlobalRateLimit({ windowMs: 60000, max: opts.globalMax ?? 3 }));

  // Apply stricter auth rate limit to auth routes
  app.use('/api/auth', createAuthRateLimit({ windowMs: 60000, max: opts.authMax ?? 2 }));

  app.get('/api/test', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/auth/login', (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

describe('Rate Limit Middleware', () => {
  describe('global rate limit', () => {
    it('should allow requests under the limit', async () => {
      const app = createApp({ globalMax: 3 });

      const res = await request(app).get('/api/test');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('should return 429 after exceeding the limit', async () => {
      const app = createApp({ globalMax: 2 });

      await request(app).get('/api/test');
      await request(app).get('/api/test');
      const res = await request(app).get('/api/test');

      expect(res.status).toBe(429);
      expect(res.body.error).toContain('Too many requests');
    });

    it('should include RateLimit headers', async () => {
      const app = createApp({ globalMax: 5 });

      const res = await request(app).get('/api/test');

      expect(res.status).toBe(200);
      expect(res.headers['ratelimit-limit']).toBeDefined();
      expect(res.headers['ratelimit-remaining']).toBeDefined();
    });

    it('should include Retry-After header on 429', async () => {
      const app = createApp({ globalMax: 1 });

      await request(app).get('/api/test');
      const res = await request(app).get('/api/test');

      expect(res.status).toBe(429);
      expect(res.headers['retry-after']).toBeDefined();
    });
  });

  describe('auth rate limit', () => {
    it('should allow auth requests under the limit', async () => {
      const app = createApp({ globalMax: 10, authMax: 3 });

      const res = await request(app).get('/api/auth/login');
      expect(res.status).toBe(200);
    });

    it('should return 429 on auth routes after exceeding auth limit', async () => {
      const app = createApp({ globalMax: 10, authMax: 2 });

      await request(app).get('/api/auth/login');
      await request(app).get('/api/auth/login');
      const res = await request(app).get('/api/auth/login');

      expect(res.status).toBe(429);
      expect(res.body.error).toContain('authentication attempts');
    });

    it('should have separate counters from global limit', async () => {
      // Auth limit is 2, global limit is 10
      const app = createApp({ globalMax: 10, authMax: 2 });

      // Hit auth endpoint twice (exhausts auth limit)
      await request(app).get('/api/auth/login');
      await request(app).get('/api/auth/login');

      // Auth should be rate limited
      const authRes = await request(app).get('/api/auth/login');
      expect(authRes.status).toBe(429);

      // Non-auth should still work (global limit not exhausted)
      const testRes = await request(app).get('/api/test');
      expect(testRes.status).toBe(200);
    });
  });

  describe('parseRateLimitConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should return defaults when no env vars set', () => {
      delete process.env.RATE_LIMIT_WINDOW_MS;
      delete process.env.RATE_LIMIT_MAX;
      delete process.env.AUTH_RATE_LIMIT_WINDOW_MS;
      delete process.env.AUTH_RATE_LIMIT_MAX;

      const config = parseRateLimitConfig();

      expect(config.global.windowMs).toBe(900000);
      expect(config.global.max).toBe(300);
      expect(config.auth.windowMs).toBe(60000);
      expect(config.auth.max).toBe(10);
    });

    it('should read from env vars when set', () => {
      process.env.RATE_LIMIT_WINDOW_MS = '300000';
      process.env.RATE_LIMIT_MAX = '50';
      process.env.AUTH_RATE_LIMIT_WINDOW_MS = '30000';
      process.env.AUTH_RATE_LIMIT_MAX = '5';

      const config = parseRateLimitConfig();

      expect(config.global.windowMs).toBe(300000);
      expect(config.global.max).toBe(50);
      expect(config.auth.windowMs).toBe(30000);
      expect(config.auth.max).toBe(5);
    });
  });
});
