import express from 'express';
import request from 'supertest';

function createApp(env: string = 'test') {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = env;

  // Re-import to pick up the current NODE_ENV
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createSecurityHeaders } = require('./securityHeaders');

  const app = express();
  app.use(createSecurityHeaders());
  app.get('/test', (_req, res) => res.json({ ok: true }));

  // Restore after middleware is created
  process.env.NODE_ENV = originalEnv;

  return app;
}

describe('Security Headers Middleware', () => {
  describe('common headers', () => {
    it('should set X-Frame-Options to DENY', async () => {
      const app = createApp();
      const res = await request(app).get('/test');

      expect(res.headers['x-frame-options']).toBe('DENY');
    });

    it('should set X-Content-Type-Options to nosniff', async () => {
      const app = createApp();
      const res = await request(app).get('/test');

      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should set Content-Security-Policy with frame-ancestors none', async () => {
      const app = createApp();
      const res = await request(app).get('/test');

      const csp = res.headers['content-security-policy'];
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it('should set CSP with unsafe-inline for style-src', async () => {
      const app = createApp();
      const res = await request(app).get('/test');

      const csp = res.headers['content-security-policy'];
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    });

    it('should set CSP with object-src none', async () => {
      const app = createApp();
      const res = await request(app).get('/test');

      const csp = res.headers['content-security-policy'];
      expect(csp).toContain("object-src 'none'");
    });
  });

  describe('production mode', () => {
    it('should set HSTS header', async () => {
      const app = createApp('production');
      const res = await request(app).get('/test');

      expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
      expect(res.headers['strict-transport-security']).toContain('includeSubDomains');
    });

    it('should not include unsafe-eval in script-src', async () => {
      const app = createApp('production');
      const res = await request(app).get('/test');

      const csp = res.headers['content-security-policy'];
      expect(csp).not.toContain('unsafe-eval');
    });

    it('should not include ws: in connect-src', async () => {
      const app = createApp('production');
      const res = await request(app).get('/test');

      const csp = res.headers['content-security-policy'];
      expect(csp).not.toContain('ws:');
    });
  });

  describe('development mode', () => {
    it('should not set HSTS header', async () => {
      const app = createApp('development');
      const res = await request(app).get('/test');

      expect(res.headers['strict-transport-security']).toBeUndefined();
    });

    it('should include unsafe-eval in script-src for Vite HMR', async () => {
      const app = createApp('development');
      const res = await request(app).get('/test');

      const csp = res.headers['content-security-policy'];
      expect(csp).toContain("'unsafe-eval'");
    });

    it('should include ws: in connect-src for Vite HMR', async () => {
      const app = createApp('development');
      const res = await request(app).get('/test');

      const csp = res.headers['content-security-policy'];
      expect(csp).toContain('ws:');
    });
  });
});
