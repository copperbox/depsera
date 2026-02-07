const CSRF_COOKIE_NAME = 'csrf-token';

/**
 * Reads the CSRF token from the csrf-token cookie.
 */
export function getCsrfToken(): string {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : '';
}

/**
 * Returns headers object with the CSRF token included.
 * Merges with any existing headers.
 */
export function withCsrfToken(
  headers: Record<string, string> = {}
): Record<string, string> {
  const token = getCsrfToken();
  if (token) {
    return { ...headers, 'X-CSRF-Token': token };
  }
  return headers;
}
