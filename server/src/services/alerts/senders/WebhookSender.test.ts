import { WebhookSender } from './WebhookSender';
import { AlertEvent } from '../types';

// Mock logger to suppress output during tests
jest.mock('../../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

function createStatusChangeEvent(overrides?: Partial<AlertEvent>): AlertEvent {
  return {
    eventType: 'status_change',
    serviceId: 'svc-123',
    serviceName: 'Payment Service',
    dependencyId: 'dep-456',
    dependencyName: 'postgres-main',
    severity: 'critical',
    previousHealthy: true,
    currentHealthy: false,
    timestamp: '2026-01-15T10:30:00.000Z',
    ...overrides,
  };
}

function createPollErrorEvent(overrides?: Partial<AlertEvent>): AlertEvent {
  return {
    eventType: 'poll_error',
    serviceId: 'svc-123',
    serviceName: 'Payment Service',
    severity: 'critical',
    error: 'Connection refused',
    timestamp: '2026-01-15T10:30:00.000Z',
    ...overrides,
  };
}

const VALID_CONFIG = JSON.stringify({ url: 'https://example.com/webhook' });
const CONFIG_WITH_HEADERS = JSON.stringify({
  url: 'https://example.com/webhook',
  headers: { 'Authorization': 'Bearer token123', 'X-Custom': 'value' },
});
const CONFIG_WITH_METHOD = JSON.stringify({
  url: 'https://example.com/webhook',
  method: 'PUT',
});

describe('WebhookSender', () => {
  let sender: WebhookSender;

  beforeEach(() => {
    jest.clearAllMocks();
    sender = new WebhookSender('https://depsera.example.com');
  });

  // ---- Successful sends ----

  describe('successful sends', () => {
    it('should send status change alert to webhook URL', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const result = await sender.send(createStatusChangeEvent(), VALID_CONFIG);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        }),
      );
    });

    it('should send poll error alert to webhook URL', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const result = await sender.send(createPollErrorEvent(), VALID_CONFIG);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ---- Status change payload ----

  describe('status change payload', () => {
    it('should include service and dependency details', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createStatusChangeEvent(), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.event).toBe('dependency_status_change');
      expect(body.service).toEqual({ id: 'svc-123', name: 'Payment Service' });
      expect(body.dependency).toEqual({ id: 'dep-456', name: 'postgres-main' });
    });

    it('should include old and new status labels', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createStatusChangeEvent(), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.oldStatus).toBe('healthy');
      expect(body.newStatus).toBe('critical');
    });

    it('should include severity and timestamp', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createStatusChangeEvent(), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.severity).toBe('critical');
      expect(body.timestamp).toBe('2026-01-15T10:30:00.000Z');
    });

    it('should include deep link URL when APP_BASE_URL is set', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createStatusChangeEvent(), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.url).toBe('https://depsera.example.com/services/svc-123');
    });

    it('should omit URL when APP_BASE_URL is empty', async () => {
      const senderNoUrl = new WebhookSender('');
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await senderNoUrl.send(createStatusChangeEvent(), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.url).toBeUndefined();
    });

    it('should map recovery events correctly', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createStatusChangeEvent({ previousHealthy: false, currentHealthy: true }), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.oldStatus).toBe('critical');
      expect(body.newStatus).toBe('healthy');
    });

    it('should handle unknown previous health status', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createStatusChangeEvent({ previousHealthy: null }), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.oldStatus).toBe('unknown');
    });

    it('should handle missing dependency fields', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createStatusChangeEvent({ dependencyId: undefined, dependencyName: undefined }), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.dependency).toEqual({ id: '', name: '' });
    });
  });

  // ---- Poll error payload ----

  describe('poll error payload', () => {
    it('should include event type and service details', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createPollErrorEvent(), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.event).toBe('poll_error');
      expect(body.service).toEqual({ id: 'svc-123', name: 'Payment Service' });
    });

    it('should include error message', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createPollErrorEvent(), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.error).toBe('Connection refused');
    });

    it('should use fallback for missing error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createPollErrorEvent({ error: undefined }), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.error).toBe('Unknown error');
    });

    it('should include deep link URL for poll errors', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createPollErrorEvent(), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.url).toBe('https://depsera.example.com/services/svc-123');
    });
  });

  // ---- Custom headers ----

  describe('custom headers', () => {
    it('should include custom headers from config', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createStatusChangeEvent(), CONFIG_WITH_HEADERS);

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Authorization']).toBe('Bearer token123');
      expect(headers['X-Custom']).toBe('value');
    });

    it('should not overwrite Content-Type with custom headers', async () => {
      const configOverride = JSON.stringify({
        url: 'https://example.com/webhook',
        headers: { 'Content-Type': 'text/plain' },
      });
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createStatusChangeEvent(), configOverride);

      const headers = mockFetch.mock.calls[0][1].headers;
      // Custom headers spread after Content-Type, so they can override
      expect(headers['Content-Type']).toBe('text/plain');
    });
  });

  // ---- Configurable HTTP method ----

  describe('configurable HTTP method', () => {
    it('should default to POST when method not specified', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createStatusChangeEvent(), VALID_CONFIG);

      expect(mockFetch.mock.calls[0][1].method).toBe('POST');
    });

    it('should use configured HTTP method', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createStatusChangeEvent(), CONFIG_WITH_METHOD);

      expect(mockFetch.mock.calls[0][1].method).toBe('PUT');
    });

    it('should normalize method to uppercase', async () => {
      const config = JSON.stringify({ url: 'https://example.com/webhook', method: 'patch' });
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createStatusChangeEvent(), config);

      expect(mockFetch.mock.calls[0][1].method).toBe('PATCH');
    });

    it('should reject invalid HTTP methods', async () => {
      const config = JSON.stringify({ url: 'https://example.com/webhook', method: 'DELETE' });

      const result = await sender.send(createStatusChangeEvent(), config);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid HTTP method');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ---- Config validation ----

  describe('config validation', () => {
    it('should return error for invalid JSON config', async () => {
      const result = await sender.send(createStatusChangeEvent(), 'not json');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid channel config JSON');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return error for missing url', async () => {
      const result = await sender.send(createStatusChangeEvent(), JSON.stringify({}));

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing url');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ---- Error handling ----

  describe('error handling', () => {
    it('should handle non-OK responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('internal server error'),
      });

      const result = await sender.send(createStatusChangeEvent(), VALID_CONFIG);

      expect(result.success).toBe(false);
      expect(result.error).toContain('500');
      expect(result.error).toContain('internal server error');
    });

    it('should handle 4xx responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
      });

      const result = await sender.send(createStatusChangeEvent(), VALID_CONFIG);

      expect(result.success).toBe(false);
      expect(result.error).toContain('401');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await sender.send(createStatusChangeEvent(), VALID_CONFIG);

      expect(result.success).toBe(false);
      expect(result.error).toContain('ECONNREFUSED');
    });

    it('should handle timeout (AbortError)', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      const result = await sender.send(createStatusChangeEvent(), VALID_CONFIG);

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });

    it('should handle non-Error throw from fetch', async () => {
      mockFetch.mockRejectedValueOnce('string error');

      const result = await sender.send(createStatusChangeEvent(), VALID_CONFIG);

      expect(result.success).toBe(false);
      expect(result.error).toContain('string error');
    });

    it('should handle text() failure on error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: () => Promise.reject(new Error('body read failed')),
      });

      const result = await sender.send(createStatusChangeEvent(), VALID_CONFIG);

      expect(result.success).toBe(false);
      expect(result.error).toContain('502');
    });
  });

  // ---- APP_BASE_URL handling ----

  describe('APP_BASE_URL', () => {
    it('should strip trailing slashes from APP_BASE_URL', async () => {
      const senderTrailingSlash = new WebhookSender('https://depsera.example.com///');
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await senderTrailingSlash.send(createStatusChangeEvent(), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.url).toBe('https://depsera.example.com/services/svc-123');
    });

    it('should read APP_BASE_URL from env when not passed to constructor', async () => {
      const originalEnv = process.env.APP_BASE_URL;
      process.env.APP_BASE_URL = 'https://env-based.example.com';

      const senderFromEnv = new WebhookSender();
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await senderFromEnv.send(createStatusChangeEvent(), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.url).toBe('https://env-based.example.com/services/svc-123');

      // Restore
      if (originalEnv !== undefined) {
        process.env.APP_BASE_URL = originalEnv;
      } else {
        delete process.env.APP_BASE_URL;
      }
    });
  });

  // ---- Request format ----

  describe('request format', () => {
    it('should send Content-Type application/json by default', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createStatusChangeEvent(), VALID_CONFIG);

      expect(mockFetch.mock.calls[0][1].headers['Content-Type']).toBe('application/json');
    });

    it('should use AbortSignal for timeout', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createStatusChangeEvent(), VALID_CONFIG);

      expect(mockFetch.mock.calls[0][1].signal).toBeDefined();
    });
  });
});
