/**
 * Validates a redirect URL to prevent open redirect attacks.
 *
 * Allowed:
 * - Relative paths starting with "/" (not "//")
 * - Same-origin absolute URLs
 * - HTTPS external URLs (needed for OIDC provider logout)
 *
 * Blocked:
 * - javascript:, data:, vbscript: and other dangerous schemes
 * - Protocol-relative URLs (//)
 * - Non-HTTPS external URLs
 */
export function validateRedirectUrl(redirectUrl: string): string {
  if (!redirectUrl || typeof redirectUrl !== 'string') {
    return '/login';
  }

  const trimmed = redirectUrl.trim();

  // Block protocol-relative URLs (//evil.com)
  if (trimmed.startsWith('//')) {
    return '/login';
  }

  // Allow relative paths starting with /
  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  // For absolute URLs, parse and validate
  try {
    const url = new URL(trimmed);

    // Block dangerous schemes
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return '/login';
    }

    // Allow same-origin
    if (url.origin === window.location.origin) {
      return trimmed;
    }

    // Allow external HTTPS (needed for OIDC provider logout)
    if (url.protocol === 'https:') {
      return trimmed;
    }

    // Block external HTTP
    return '/login';
  } catch {
    return '/login';
  }
}
