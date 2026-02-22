// URL validation helper
export function isValidUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// Polling interval constants
export const MIN_POLLING_INTERVAL = 10;
export const DEFAULT_POLLING_INTERVAL = 30;
