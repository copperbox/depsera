import express from 'express';
import request from 'supertest';
import { csrfProtection } from './csrf';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(csrfProtection);

  app.get('/api/test', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/test', (_req, res) => {
    res.json({ ok: true });
  });

  app.put('/api/test', (_req, res) => {
    res.json({ ok: true });
  });

  app.delete('/api/test', (_req, res) => {
    res.json({ ok: true });
  });

  return app;
}

describe('CSRF Protection Middleware', () => {
  describe('cookie management', () => {
    it('should set csrf-token cookie on GET requests', async () => {
      const app = createApp();
      const res = await request(app).get('/api/test');

      expect(res.status).toBe(200);
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const csrfCookie = Array.isArray(cookies)
        ? cookies.find((c: string) => c.startsWith('csrf-token='))
        : cookies;
      expect(csrfCookie).toBeDefined();
      expect(csrfCookie).toContain('csrf-token=');
      expect(csrfCookie).not.toContain('HttpOnly');
    });

    it('should not overwrite existing csrf-token cookie', async () => {
      const app = createApp();
      const res = await request(app)
        .get('/api/test')
        .set('Cookie', 'csrf-token=existing-token');

      expect(res.status).toBe(200);
      const cookies = res.headers['set-cookie'];
      // Should not set a new cookie when one already exists
      if (cookies) {
        const csrfCookie = Array.isArray(cookies)
          ? cookies.find((c: string) => c.startsWith('csrf-token='))
          : cookies.startsWith('csrf-token=') ? cookies : undefined;
        expect(csrfCookie).toBeUndefined();
      }
    });
  });

  describe('safe methods', () => {
    it('should allow GET without CSRF token', async () => {
      const app = createApp();
      const res = await request(app).get('/api/test');
      expect(res.status).toBe(200);
    });
  });

  describe('mutating methods', () => {
    const token = 'valid-csrf-token-value';

    it('should reject POST without CSRF token', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/test')
        .set('Cookie', `csrf-token=${token}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('CSRF token');
    });

    it('should reject PUT without CSRF token', async () => {
      const app = createApp();
      const res = await request(app)
        .put('/api/test')
        .set('Cookie', `csrf-token=${token}`)
        .send({});

      expect(res.status).toBe(403);
    });

    it('should reject DELETE without CSRF token', async () => {
      const app = createApp();
      const res = await request(app)
        .delete('/api/test')
        .set('Cookie', `csrf-token=${token}`);

      expect(res.status).toBe(403);
    });

    it('should reject POST with mismatched CSRF token', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/test')
        .set('Cookie', `csrf-token=${token}`)
        .set('X-CSRF-Token', 'wrong-token')
        .send({});

      expect(res.status).toBe(403);
    });

    it('should reject POST without CSRF cookie', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/test')
        .set('X-CSRF-Token', token)
        .send({});

      expect(res.status).toBe(403);
    });

    it('should allow POST with matching CSRF token', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/api/test')
        .set('Cookie', `csrf-token=${token}`)
        .set('X-CSRF-Token', token)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('should allow PUT with matching CSRF token', async () => {
      const app = createApp();
      const res = await request(app)
        .put('/api/test')
        .set('Cookie', `csrf-token=${token}`)
        .set('X-CSRF-Token', token)
        .send({});

      expect(res.status).toBe(200);
    });

    it('should allow DELETE with matching CSRF token', async () => {
      const app = createApp();
      const res = await request(app)
        .delete('/api/test')
        .set('Cookie', `csrf-token=${token}`)
        .set('X-CSRF-Token', token);

      expect(res.status).toBe(200);
    });
  });
});
