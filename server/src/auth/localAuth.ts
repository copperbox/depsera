import { hashSync, compareSync } from 'bcryptjs';
import { getStores } from '../stores';
import logger from '../utils/logger';

const BCRYPT_ROUNDS = 12;

export type AuthMode = 'oidc' | 'local' | 'bypass';

/**
 * Determine the current authentication mode based on environment variables.
 *
 * Priority:
 * 1. AUTH_BYPASS=true → 'bypass'
 * 2. LOCAL_AUTH=true → 'local'
 * 3. Otherwise → 'oidc'
 */
export function getAuthMode(): AuthMode {
  if (process.env.AUTH_BYPASS === 'true') return 'bypass';
  if (process.env.LOCAL_AUTH === 'true') return 'local';
  return 'oidc';
}

/**
 * Hash a plaintext password using bcrypt with the configured rounds.
 */
export function hashPassword(password: string): string {
  return hashSync(password, BCRYPT_ROUNDS);
}

/**
 * Compare a plaintext password against a bcrypt hash.
 */
export function verifyPassword(password: string, hash: string): boolean {
  return compareSync(password, hash);
}

/**
 * Validate local auth configuration on startup.
 * Throws if LOCAL_AUTH conflicts with AUTH_BYPASS or OIDC vars.
 */
export function validateLocalAuthConfig(): void {
  if (process.env.LOCAL_AUTH !== 'true') return;

  if (process.env.AUTH_BYPASS === 'true') {
    throw new Error('LOCAL_AUTH and AUTH_BYPASS are mutually exclusive — disable one of them');
  }

  // If OIDC is fully configured, warn that it will be ignored
  if (process.env.OIDC_ISSUER_URL && process.env.OIDC_CLIENT_ID) {
    logger.warn('LOCAL_AUTH=true — OIDC configuration will be ignored');
  }
}

/**
 * Bootstrap the initial admin user on first startup in local auth mode.
 * Reads ADMIN_EMAIL and ADMIN_PASSWORD from env vars.
 * Only creates the admin if no users exist in the database.
 */
export function bootstrapLocalAdmin(): void {
  if (process.env.LOCAL_AUTH !== 'true') return;

  const stores = getStores();
  const userCount = stores.users.count();

  if (userCount > 0) {
    logger.debug('local auth: users already exist, skipping admin bootstrap');
    return;
  }

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'LOCAL_AUTH=true requires ADMIN_EMAIL and ADMIN_PASSWORD env vars for initial admin creation',
    );
  }

  if (password.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters');
  }

  const passwordHash = hashPassword(password);

  const user = stores.users.create({
    email,
    name: email.split('@')[0],
    password_hash: passwordHash,
    role: 'admin',
  });

  logger.info({ email: user.email }, 'local auth: initial admin user created');
}
