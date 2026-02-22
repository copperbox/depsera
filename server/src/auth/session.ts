import session from 'express-session';
import SqliteStore from 'better-sqlite3-session-store';
import { db } from '../db';
import { validateSessionSecret } from './validateSessionSecret';

const BetterSqlite3Store = SqliteStore(session);

// Extend session type for TypeScript
declare module 'express-session' {
  interface SessionData {
    userId: string;
    codeVerifier?: string;
    state?: string;
    returnTo?: string;
  }
}

export const sessionMiddleware = session({
  store: new BetterSqlite3Store({
    client: db,
    expired: {
      clear: true,
      intervalMs: 15 * 60 * 1000, // Clean up expired sessions every 15 minutes
    },
  }),
  secret: validateSessionSecret(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: 'auto',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/',
    // sameSite must be 'lax' (not 'strict') to support OIDC authentication.
    // The OIDC callback flow involves a cross-origin redirect from the identity
    // provider back to /api/auth/callback. With 'strict', the browser would not
    // send the session cookie on this redirect, causing the PKCE code verifier
    // and state parameter (stored in the session during login) to be unavailable,
    // breaking the token exchange. CSRF protection via double-submit cookie
    // (PRO-61) mitigates the reduced protection of 'lax' vs 'strict'.
    sameSite: 'lax',
  },
  name: 'deps-dashboard.sid',
});

/**
 * Checks session cookie security configuration at startup and logs warnings
 * for potentially insecure settings outside of development.
 */
export function warnInsecureCookies(): void {
  const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
  if (isDev) return;

  const hasHttps = process.env.REQUIRE_HTTPS === 'true';
  const hasTrustProxy = !!process.env.TRUST_PROXY;

  // If neither HTTPS redirect nor trust proxy is configured outside dev,
  // the 'auto' secure flag will resolve to false (HTTP), sending session
  // cookies over unencrypted connections.
  if (!hasHttps && !hasTrustProxy) {
    console.warn(
      '[Security] Session cookie "secure" flag will be false — cookies will be sent over HTTP. ' +
      'Set REQUIRE_HTTPS=true and/or TRUST_PROXY for production deployments.'
    );
  }
}
