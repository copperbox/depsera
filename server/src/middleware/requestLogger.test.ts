import express from 'express';
import request from 'supertest';
import pino from 'pino';
import { createRequestLogger, redactHeaders } from './requestLogger';

function createTestLogger() {
  const logs: Record<string, unknown>[] = [];
  const stream = {
    write(msg: string) {
      logs.push(JSON.parse(msg));
    },
  };
  const logger = pino({ level: 'info' }, stream as pino.DestinationStream);
  return { logger, logs };
}

function createApp(opts: { quietHealthCheck?: boolean } = {}) {
  const { logger, logs } = createTestLogger();
  const app = express();

  // Simulate session middleware setting userId
  app.use((req, _res, next) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).session = { userId: 'test-user-id' };
    next();
  });

  app.use(createRequestLogger({ logger, quietHealthCheck: opts.quietHealthCheck ?? true }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/test', (_req, res) => res.json({ ok: true }));
  app.post('/api/test', (_req, res) => res.status(201).json({ created: true }));
  app.get('/api/error', (_req, res) => res.status(500).json({ error: 'fail' }));

  return { app, logs };
}

describe('Request Logger Middleware', () => {
  describe('request logging', () => {
    it('should log HTTP requests with method, url, and status', async () => {
      const { app, logs } = createApp();

      await request(app).get('/api/test');

      expect(logs.length).toBe(1);
      const log = logs[0];
      expect(log.req).toBeDefined();
      expect((log.req as Record<string, unknown>).method).toBe('GET');
      expect((log.req as Record<string, unknown>).url).toBe('/api/test');
      expect(log.res).toBeDefined();
      expect((log.res as Record<string, unknown>).statusCode).toBe(200);
    });

    it('should include userId from session in log entries', async () => {
      const { app, logs } = createApp();

      await request(app).get('/api/test');

      expect(logs[0].userId).toBe('test-user-id');
    });

    it('should log response time', async () => {
      const { app, logs } = createApp();

      await request(app).get('/api/test');

      expect(logs[0].responseTime).toBeDefined();
      expect(typeof logs[0].responseTime).toBe('number');
    });

    it('should log POST requests', async () => {
      const { app, logs } = createApp();

      await request(app).post('/api/test');

      expect(logs.length).toBe(1);
      expect((logs[0].req as Record<string, unknown>).method).toBe('POST');
    });

    it('should log error status codes', async () => {
      const { app, logs } = createApp();

      await request(app).get('/api/error');

      expect(logs.length).toBe(1);
      expect((logs[0].res as Record<string, unknown>).statusCode).toBe(500);
    });
  });

  describe('health check filtering', () => {
    it('should not log /api/health when quietHealthCheck is true', async () => {
      const { app, logs } = createApp({ quietHealthCheck: true });

      await request(app).get('/api/health');

      expect(logs.length).toBe(0);
    });

    it('should log /api/health when quietHealthCheck is false', async () => {
      const { app, logs } = createApp({ quietHealthCheck: false });

      await request(app).get('/api/health');

      expect(logs.length).toBe(1);
    });
  });

  describe('header logging without session', () => {
    it('should handle missing session gracefully', async () => {
      const { logger, logs } = createTestLogger();
      const app = express();
      // No session middleware
      app.use(createRequestLogger({ logger }));
      app.get('/api/test', (_req, res) => res.json({ ok: true }));

      await request(app).get('/api/test');

      expect(logs.length).toBe(1);
      expect(logs[0].userId).toBeUndefined();
    });
  });
});

describe('redactHeaders', () => {
  it('should redact Authorization header', () => {
    const result = redactHeaders({ authorization: 'Bearer token123' });
    expect(result.authorization).toBe('[REDACTED]');
  });

  it('should redact Cookie header', () => {
    const result = redactHeaders({ cookie: 'session=abc123' });
    expect(result.cookie).toBe('[REDACTED]');
  });

  it('should redact X-CSRF-Token header', () => {
    const result = redactHeaders({ 'x-csrf-token': 'csrf-value' });
    expect(result['x-csrf-token']).toBe('[REDACTED]');
  });

  it('should redact Set-Cookie header', () => {
    const result = redactHeaders({ 'set-cookie': 'session=abc' });
    expect(result['set-cookie']).toBe('[REDACTED]');
  });

  it('should be case-insensitive for header names', () => {
    const result = redactHeaders({ Authorization: 'Bearer xyz', COOKIE: 'sid=test' });
    // Header keys we check are lowercased internally
    expect(result.Authorization).toBe('[REDACTED]');
    expect(result.COOKIE).toBe('[REDACTED]');
  });

  it('should pass through non-sensitive headers', () => {
    const result = redactHeaders({
      'content-type': 'application/json',
      'user-agent': 'TestAgent/1.0',
      accept: '*/*',
    });
    expect(result['content-type']).toBe('application/json');
    expect(result['user-agent']).toBe('TestAgent/1.0');
    expect(result.accept).toBe('*/*');
  });

  it('should exclude undefined values', () => {
    const result = redactHeaders({
      'content-type': 'application/json',
      'x-custom': undefined,
    });
    expect(result['content-type']).toBe('application/json');
    expect('x-custom' in result).toBe(false);
  });

  it('should handle empty headers object', () => {
    const result = redactHeaders({});
    expect(Object.keys(result).length).toBe(0);
  });
});
