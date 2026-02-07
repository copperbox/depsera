const WEAK_DEFAULTS = [
  'dev-secret-change-in-production',
  'dev-session-secret-change-in-production',
  'change-me-to-random-32-char-string',
];

const MIN_SECRET_LENGTH = 32;

/**
 * Validates and returns the session secret.
 * In production, enforces strong secret requirements.
 * In development, allows weak defaults with console warnings.
 */
export function validateSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    if (!secret) {
      throw new Error(
        'SESSION_SECRET environment variable is required in production'
      );
    }
    if (WEAK_DEFAULTS.includes(secret)) {
      throw new Error(
        'SESSION_SECRET must not be a known default value in production'
      );
    }
    if (secret.length < MIN_SECRET_LENGTH) {
      throw new Error(
        `SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters in production`
      );
    }
    return secret;
  }

  // Development mode
  if (!secret) {
    console.warn(
      '[Security] Using default session secret. Set SESSION_SECRET for production.'
    );
    return 'dev-secret-change-in-production';
  }

  if (WEAK_DEFAULTS.includes(secret)) {
    console.warn(
      '[Security] SESSION_SECRET is a known weak default. Change for production.'
    );
  }

  return secret;
}
