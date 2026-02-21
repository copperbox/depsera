import { SlackSender } from './SlackSender';
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

const VALID_CONFIG = JSON.stringify({ webhook_url: 'https://hooks.slack.com/services/T00/B00/xxx' });

describe('SlackSender', () => {
  let sender: SlackSender;

  beforeEach(() => {
    jest.clearAllMocks();
    sender = new SlackSender('https://depsera.example.com');
  });

  // ---- Successful sends ----

  describe('successful sends', () => {
    it('should send status change alert to Slack webhook', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const result = await sender.send(createStatusChangeEvent(), VALID_CONFIG);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/services/T00/B00/xxx',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    });

    it('should send poll error alert to Slack webhook', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      const result = await sender.send(createPollErrorEvent(), VALID_CONFIG);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ---- Block Kit payload ----

  describe('status change payload', () => {
    it('should include header with service name and degraded status', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createStatusChangeEvent(), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const header = body.blocks[0];
      expect(header.type).toBe('header');
      expect(header.text.text).toContain('Payment Service');
      expect(header.text.text).toContain('Degraded');
      expect(header.text.text).toContain(':red_circle:');
    });

    it('should include header with recovered status for recovery events', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createStatusChangeEvent({ currentHealthy: true, previousHealthy: false, severity: 'warning' }), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const header = body.blocks[0];
      expect(header.text.text).toContain('Recovered');
      expect(header.text.text).toContain(':large_green_circle:');
    });

    it('should include dependency name and status transition in section', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createStatusChangeEvent(), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const section = body.blocks[1];
      expect(section.type).toBe('section');
      expect(section.fields[0].text).toContain('postgres-main');
      expect(section.fields[1].text).toContain('Healthy');
      expect(section.fields[1].text).toContain('Unhealthy');
    });

    it('should include severity and timestamp in context', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createStatusChangeEvent(), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const context = body.blocks[2];
      expect(context.type).toBe('context');
      expect(context.elements[0].text).toContain('Critical');
      expect(context.elements[0].text).toContain('2026-01-15');
    });

    it('should include deep link button when APP_BASE_URL is set', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createStatusChangeEvent(), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const actions = body.blocks[3];
      expect(actions.type).toBe('actions');
      expect(actions.elements[0].url).toBe('https://depsera.example.com/services/svc-123');
      expect(actions.elements[0].text.text).toBe('View in Depsera');
    });

    it('should omit deep link button when APP_BASE_URL is empty', async () => {
      const senderNoUrl = new SlackSender('');
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await senderNoUrl.send(createStatusChangeEvent(), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.blocks).toHaveLength(3); // no actions block
    });

    it('should handle unknown previous health status', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createStatusChangeEvent({ previousHealthy: null }), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const section = body.blocks[1];
      expect(section.fields[1].text).toContain('Unknown');
    });

    it('should show N/A when dependency name is missing', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createStatusChangeEvent({ dependencyName: undefined }), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const section = body.blocks[1];
      expect(section.fields[0].text).toContain('N/A');
    });
  });

  describe('poll error payload', () => {
    it('should include warning header with service name', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createPollErrorEvent(), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const header = body.blocks[0];
      expect(header.text.text).toContain(':warning:');
      expect(header.text.text).toContain('Payment Service');
      expect(header.text.text).toContain('Poll Failed');
    });

    it('should include error message in section', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createPollErrorEvent(), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const section = body.blocks[1];
      expect(section.text.text).toContain('Connection refused');
    });

    it('should include deep link button for poll errors', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createPollErrorEvent(), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const actions = body.blocks[3];
      expect(actions.type).toBe('actions');
      expect(actions.elements[0].url).toBe('https://depsera.example.com/services/svc-123');
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

    it('should return error for missing webhook_url', async () => {
      const result = await sender.send(createStatusChangeEvent(), JSON.stringify({}));

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing webhook_url');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ---- Error handling ----

  describe('error handling', () => {
    it('should handle Slack rate limiting (429)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Map([['Retry-After', '30']]) as unknown as Headers,
      });

      // Need to mock headers.get properly
      mockFetch.mockReset();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: (name: string) => name === 'Retry-After' ? '30' : null },
      });

      const result = await sender.send(createStatusChangeEvent(), VALID_CONFIG);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limited by Slack');
      expect(result.error).toContain('30');
    });

    it('should handle non-OK responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: { get: () => null },
        text: () => Promise.resolve('internal_error'),
      });

      const result = await sender.send(createStatusChangeEvent(), VALID_CONFIG);

      expect(result.success).toBe(false);
      expect(result.error).toContain('500');
      expect(result.error).toContain('internal_error');
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
  });

  // ---- APP_BASE_URL handling ----

  describe('APP_BASE_URL', () => {
    it('should strip trailing slashes from APP_BASE_URL', async () => {
      const senderTrailingSlash = new SlackSender('https://depsera.example.com///');
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await senderTrailingSlash.send(createStatusChangeEvent(), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const actions = body.blocks[3];
      expect(actions.elements[0].url).toBe('https://depsera.example.com/services/svc-123');
    });

    it('should read APP_BASE_URL from env when not passed to constructor', async () => {
      const originalEnv = process.env.APP_BASE_URL;
      process.env.APP_BASE_URL = 'https://env-based.example.com';

      const senderFromEnv = new SlackSender();
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await senderFromEnv.send(createStatusChangeEvent(), VALID_CONFIG);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const actions = body.blocks[3];
      expect(actions.elements[0].url).toBe('https://env-based.example.com/services/svc-123');

      // Restore
      if (originalEnv !== undefined) {
        process.env.APP_BASE_URL = originalEnv;
      } else {
        delete process.env.APP_BASE_URL;
      }
    });
  });

  // ---- Content-Type header ----

  describe('request format', () => {
    it('should send Content-Type application/json', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createStatusChangeEvent(), VALID_CONFIG);

      expect(mockFetch.mock.calls[0][1].headers).toEqual({ 'Content-Type': 'application/json' });
    });

    it('should use AbortSignal for timeout', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await sender.send(createStatusChangeEvent(), VALID_CONFIG);

      expect(mockFetch.mock.calls[0][1].signal).toBeDefined();
    });
  });
});
