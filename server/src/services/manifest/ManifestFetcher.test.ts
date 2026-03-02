import { fetchManifest } from './ManifestFetcher';

// Mock the SSRF validator
jest.mock('../../utils/ssrf', () => ({
  validateUrlNotPrivate: jest.fn().mockResolvedValue(undefined),
}));

// Mock the error sanitizer
jest.mock('../../utils/errors', () => ({
  sanitizePollError: jest.fn((msg: string) => msg),
}));

import { validateUrlNotPrivate } from '../../utils/ssrf';
import { sanitizePollError } from '../../utils/errors';

const mockedValidateUrl = validateUrlNotPrivate as jest.MockedFunction<
  typeof validateUrlNotPrivate
>;
const mockedSanitize = sanitizePollError as jest.MockedFunction<
  typeof sanitizePollError
>;

// Helper to create a mock Response
function mockResponse(
  body: string,
  init?: { status?: number; statusText?: string; headers?: Record<string, string> },
): Response {
  const status = init?.status ?? 200;
  const statusText = init?.statusText ?? 'OK';
  const headers = new Headers(init?.headers);

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers,
    body: null, // triggers the text() fallback path
    text: jest.fn().mockResolvedValue(body),
    json: jest.fn().mockImplementation(() => JSON.parse(body)),
  } as unknown as Response;
}

// Helper to create a mock Response with a streaming body
function mockStreamingResponse(
  chunks: Uint8Array[],
  init?: { status?: number; statusText?: string; headers?: Record<string, string> },
): Response {
  const status = init?.status ?? 200;
  const statusText = init?.statusText ?? 'OK';
  const headers = new Headers(init?.headers);

  let chunkIndex = 0;
  const reader = {
    read: jest.fn().mockImplementation(async () => {
      if (chunkIndex < chunks.length) {
        return { done: false, value: chunks[chunkIndex++] };
      }
      return { done: true, value: undefined };
    }),
    releaseLock: jest.fn(),
  };

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers,
    body: { getReader: () => reader },
    text: jest.fn(),
  } as unknown as Response;
}

// Save original fetch
const originalFetch = globalThis.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  mockedValidateUrl.mockResolvedValue(undefined);
  mockedSanitize.mockImplementation((msg: string) => msg);
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

describe('ManifestFetcher', () => {
  const TEST_URL = 'https://example.com/manifest.json';

  // =========================================================================
  // Success cases
  // =========================================================================
  describe('successful fetch', () => {
    it('fetches and parses valid JSON', async () => {
      const manifest = { version: 1, services: [] };
      globalThis.fetch = jest.fn().mockResolvedValue(
        mockResponse(JSON.stringify(manifest)),
      );

      const result = await fetchManifest(TEST_URL);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(manifest);
        expect(result.url).toBe(TEST_URL);
      }
    });

    it('calls validateUrlNotPrivate before fetching', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue(
        mockResponse(JSON.stringify({ version: 1 })),
      );

      await fetchManifest(TEST_URL);

      expect(mockedValidateUrl).toHaveBeenCalledWith(TEST_URL);
      expect(globalThis.fetch).toHaveBeenCalled();
    });

    it('sends correct request headers', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue(
        mockResponse(JSON.stringify({})),
      );

      await fetchManifest(TEST_URL);

      const fetchCall = (globalThis.fetch as jest.Mock).mock.calls[0];
      expect(fetchCall[1].headers).toEqual(
        expect.objectContaining({
          Accept: 'application/json',
          'User-Agent': 'Depsera-Manifest-Sync/1.0',
        }),
      );
    });

    it('merges custom headers from options', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue(
        mockResponse(JSON.stringify({})),
      );

      await fetchManifest(TEST_URL, {
        headers: { Authorization: 'Bearer token123' },
      });

      const fetchCall = (globalThis.fetch as jest.Mock).mock.calls[0];
      expect(fetchCall[1].headers).toEqual(
        expect.objectContaining({
          Accept: 'application/json',
          'User-Agent': 'Depsera-Manifest-Sync/1.0',
          Authorization: 'Bearer token123',
        }),
      );
    });

    it('reads body via streaming reader when available', async () => {
      const manifest = { version: 1, services: [{ key: 'svc' }] };
      const encoded = new TextEncoder().encode(JSON.stringify(manifest));
      globalThis.fetch = jest.fn().mockResolvedValue(
        mockStreamingResponse([encoded]),
      );

      const result = await fetchManifest(TEST_URL);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(manifest);
      }
    });
  });

  // =========================================================================
  // SSRF rejection
  // =========================================================================
  describe('SSRF protection', () => {
    it('returns failure when SSRF validation rejects the URL', async () => {
      mockedValidateUrl.mockRejectedValue(
        new Error('URL resolves to a private IP address'),
      );
      globalThis.fetch = jest.fn();

      const result = await fetchManifest('https://internal.local/manifest.json');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('private IP');
      }
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // HTTP error responses
  // =========================================================================
  describe('HTTP error responses', () => {
    it('returns failure for 404 response', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue(
        mockResponse('', { status: 404, statusText: 'Not Found' }),
      );

      const result = await fetchManifest(TEST_URL);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('HTTP 404: Not Found');
      }
    });

    it('returns failure for 500 response', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue(
        mockResponse('', { status: 500, statusText: 'Internal Server Error' }),
      );

      const result = await fetchManifest(TEST_URL);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('HTTP 500: Internal Server Error');
      }
    });
  });

  // =========================================================================
  // Size limits
  // =========================================================================
  describe('size limits', () => {
    it('rejects response when Content-Length exceeds 1MB', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue(
        mockResponse('{}', {
          headers: { 'content-length': '2000000' },
        }),
      );

      const result = await fetchManifest(TEST_URL);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('too large');
        expect(result.error).toContain('1048576');
      }
    });

    it('allows response when Content-Length is within limit', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue(
        mockResponse(JSON.stringify({ version: 1 }), {
          headers: { 'content-length': '500000' },
        }),
      );

      const result = await fetchManifest(TEST_URL);
      expect(result.success).toBe(true);
    });

    it('rejects streaming body that exceeds 1MB', async () => {
      // Create a chunk larger than 1MB
      const largeChunk = new Uint8Array(1_100_000);
      globalThis.fetch = jest.fn().mockResolvedValue(
        mockStreamingResponse([largeChunk]),
      );

      const result = await fetchManifest(TEST_URL);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('too large');
      }
    });

    it('rejects streaming body that exceeds 1MB across multiple chunks', async () => {
      const chunk = new Uint8Array(600_000);
      globalThis.fetch = jest.fn().mockResolvedValue(
        mockStreamingResponse([chunk, chunk]),
      );

      const result = await fetchManifest(TEST_URL);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('too large');
      }
    });

    it('rejects via text() fallback when body exceeds limit', async () => {
      const largeBody = 'x'.repeat(1_100_000);
      globalThis.fetch = jest.fn().mockResolvedValue(
        mockResponse(largeBody),
      );

      const result = await fetchManifest(TEST_URL);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('too large');
      }
    });
  });

  // =========================================================================
  // Timeout
  // =========================================================================
  describe('timeout', () => {
    it('returns timeout error for AbortError', async () => {
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      globalThis.fetch = jest.fn().mockRejectedValue(abortError);

      const result = await fetchManifest(TEST_URL);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('Manifest fetch timed out (10s)');
      }
    });
  });

  // =========================================================================
  // Parse errors
  // =========================================================================
  describe('JSON parse errors', () => {
    it('returns failure for invalid JSON', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue(
        mockResponse('this is not json'),
      );

      const result = await fetchManifest(TEST_URL);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid JSON');
      }
    });

    it('returns failure for HTML response', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue(
        mockResponse('<html><body>Not found</body></html>'),
      );

      const result = await fetchManifest(TEST_URL);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid JSON');
      }
    });
  });

  // =========================================================================
  // Network errors
  // =========================================================================
  describe('network errors', () => {
    it('returns sanitized error for network failures', async () => {
      globalThis.fetch = jest.fn().mockRejectedValue(
        new Error('getaddrinfo ENOTFOUND example.invalid'),
      );

      const result = await fetchManifest(TEST_URL);

      expect(result.success).toBe(false);
      expect(mockedSanitize).toHaveBeenCalledWith(
        'getaddrinfo ENOTFOUND example.invalid',
      );
    });

    it('handles non-Error thrown values', async () => {
      globalThis.fetch = jest.fn().mockRejectedValue('string error');

      const result = await fetchManifest(TEST_URL);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('string error');
      }
    });
  });

  // =========================================================================
  // URL always returned
  // =========================================================================
  describe('result always includes url', () => {
    it('includes url on success', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue(
        mockResponse(JSON.stringify({})),
      );

      const result = await fetchManifest(TEST_URL);
      expect(result.url).toBe(TEST_URL);
    });

    it('includes url on failure', async () => {
      mockedValidateUrl.mockRejectedValue(new Error('blocked'));

      const result = await fetchManifest(TEST_URL);
      expect(result.url).toBe(TEST_URL);
    });
  });
});
