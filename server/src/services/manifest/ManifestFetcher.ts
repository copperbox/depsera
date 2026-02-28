import { ManifestFetchResult } from './types';
import { validateUrlNotPrivate } from '../../utils/ssrf';
import { sanitizePollError } from '../../utils/errors';

// --- Constants ---

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_SIZE = 1_048_576; // 1MB

/**
 * Fetch a manifest JSON from the given URL with SSRF protection,
 * timeout, and streaming size limit.
 *
 * @param url - The manifest URL to fetch
 * @param options - Optional fetch configuration (e.g. extra headers for future auth support)
 * @returns ManifestFetchResult discriminated union
 */
export async function fetchManifest(
  url: string,
  options?: { headers?: Record<string, string> },
): Promise<ManifestFetchResult> {
  try {
    // Step 1: SSRF validation (async DNS resolution)
    await validateUrlNotPrivate(url);

    // Step 2: Fetch with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Depsera-Manifest-Sync/1.0',
          ...options?.headers,
        },
        signal: controller.signal,
        redirect: 'follow',
      });

      // Step 3: Status validation
      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          url,
        };
      }

      // Step 4: Content-Length pre-check (if header present)
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const size = parseInt(contentLength, 10);
        if (!isNaN(size) && size > MAX_BODY_SIZE) {
          return {
            success: false,
            error: `Manifest too large: ${size} bytes exceeds ${MAX_BODY_SIZE} byte limit`,
            url,
          };
        }
      }

      // Step 5: Streaming body read with size enforcement
      const bodyText = await readResponseWithLimit(response);

      // Step 6: JSON parse
      let data: unknown;
      try {
        data = JSON.parse(bodyText);
      } catch {
        return {
          success: false,
          error: 'Invalid JSON: manifest could not be parsed',
          url,
        };
      }

      return { success: true, data, url };
    } finally {
      clearTimeout(timeout);
    }
  } catch (err: unknown) {
    // DOMException (thrown by fetch on abort) may not extend Error in all Node versions
    if (
      err &&
      typeof err === 'object' &&
      'name' in err &&
      (err as { name: string }).name === 'AbortError'
    ) {
      return {
        success: false,
        error: 'Manifest fetch timed out (10s)',
        url,
      };
    }
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: sanitizePollError(message),
      url,
    };
  }
}

/**
 * Read a response body with a streaming size limit.
 * Protects against spoofed or absent Content-Length headers.
 *
 * @throws Error if the body exceeds MAX_BODY_SIZE
 */
async function readResponseWithLimit(response: Response): Promise<string> {
  const reader = response.body?.getReader();

  if (!reader) {
    // Fallback for environments without streaming body
    const text = await response.text();
    if (text.length > MAX_BODY_SIZE) {
      throw new Error(
        `Manifest too large: body exceeds ${MAX_BODY_SIZE} byte limit`,
      );
    }
    return text;
  }

  const chunks: Uint8Array[] = [];
  let totalSize = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalSize += value.byteLength;
      if (totalSize > MAX_BODY_SIZE) {
        throw new Error(
          `Manifest too large: body exceeds ${MAX_BODY_SIZE} byte limit`,
        );
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const decoder = new TextDecoder();
  return chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join('') +
    decoder.decode();
}
