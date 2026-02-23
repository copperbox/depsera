import express from 'express';
import request from 'supertest';

function createApp(opts: { requireHttps?: string; trustProxy?: boolean } = {}) {
  const originalRequireHttps = process.env.REQUIRE_HTTPS;
  if (opts.requireHttps !== undefined) {
    process.env.REQUIRE_HTTPS = opts.requireHttps;
  } else {
    delete process.env.REQUIRE_HTTPS;
  }

  // Re-import to pick up the current env
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const { createHttpsRedirect } = require('./httpsRedirect');

  const app = express();

  if (opts.trustProxy) {
    app.set('trust proxy', true);
  }

  app.use(createHttpsRedirect());

  app.get('/test', (_req, res) => res.json({ ok: true }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/test/nested', (_req, res) => res.json({ ok: true }));

  // Restore
  if (originalRequireHttps !== undefined) {
    process.env.REQUIRE_HTTPS = originalRequireHttps;
  } else {
    delete process.env.REQUIRE_HTTPS;
  }

  return app;
}

describe('HTTPS Redirect Middleware', () => {
  it('should pass through when REQUIRE_HTTPS is not set', async () => {
    const app = createApp();
    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('should pass through when REQUIRE_HTTPS is not "true"', async () => {
    const app = createApp({ requireHttps: 'false' });
    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
  });

  it('should 301 redirect HTTP to HTTPS when REQUIRE_HTTPS=true', async () => {
    const app = createApp({ requireHttps: 'true' });
    const res = await request(app).get('/test');

    expect(res.status).toBe(301);
    expect(res.headers.location).toContain('https://');
    expect(res.headers.location).toContain('/test');
  });

  it('should pass through for HTTPS requests via X-Forwarded-Proto', async () => {
    const app = createApp({ requireHttps: 'true', trustProxy: true });
    const res = await request(app)
      .get('/test')
      .set('X-Forwarded-Proto', 'https');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('should exempt /api/health from redirect', async () => {
    const app = createApp({ requireHttps: 'true' });
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('should preserve URL path and query in redirect Location', async () => {
    const app = createApp({ requireHttps: 'true' });
    const res = await request(app).get('/test/nested?foo=bar');

    expect(res.status).toBe(301);
    expect(res.headers.location).toContain('/test/nested?foo=bar');
  });
});
