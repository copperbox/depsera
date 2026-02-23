/**
 * OIDC Integration Tests (PRO-102)
 *
 * Uses `oidc-provider` running in-process to validate the full OIDC authentication flow.
 * The openid-client module is replaced with real HTTP implementations that communicate
 * directly with the test OIDC provider — this tests the actual OIDC protocol exchange
 * (discovery, authorization, token exchange, userinfo) while avoiding ESM import issues.
 */

import request from 'supertest';
import http from 'http';
import express from 'express';
import session from 'express-session';
import Database from 'better-sqlite3';
import {
  createTestProvider,
  completeOIDCLogin,
  TestProviderResult,
} from '../helpers/oidcProvider';

// ─── Database Setup ──────────────────────────────────────────────────────────
const testDb = new Database(':memory:');

jest.mock('../../db', () => ({
  db: testDb,
  default: testDb,
}));

// ─── openid-client Mock with Real HTTP Implementations ───────────────────────

interface MockOIDCConfig {
  metadata: Record<string, string>;
  clientId: string;
  clientSecret: string;
  serverMetadata: () => Record<string, string>;
}

let testCallbackUri = '';

jest.mock('openid-client', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cryptoMod = require('crypto');

  return {
    allowInsecureRequests: Symbol('allowInsecureRequests'),

    async discovery(
      issuerUrl: URL,
      clientId: string,
      clientSecret: string,
    ): Promise<MockOIDCConfig> {
      const metaUrl = new URL(
        '/.well-known/openid-configuration',
        issuerUrl,
      );
      const res = await fetch(metaUrl.href);
      if (!res.ok) throw new Error(`Discovery failed: ${res.status}`);
      const meta = (await res.json()) as Record<string, string>;
      return {
        metadata: meta,
        clientId,
        clientSecret,
        serverMetadata: () => meta,
      };
    },

    buildAuthorizationUrl(
      config: MockOIDCConfig,
      params: Record<string, string>,
    ): URL {
      const url = new URL(config.metadata.authorization_endpoint);
      url.searchParams.set('client_id', config.clientId);
      url.searchParams.set('response_type', 'code');
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
      return url;
    },

    async authorizationCodeGrant(
      config: MockOIDCConfig,
      currentUrl: URL,
      opts: { pkceCodeVerifier: string; expectedState: string },
    ) {
      const code = currentUrl.searchParams.get('code');
      if (!code) throw new Error('No authorization code in callback URL');

      const state = currentUrl.searchParams.get('state');
      if (state !== opts.expectedState) {
        throw new Error('State mismatch');
      }

      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: testCallbackUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code_verifier: opts.pkceCodeVerifier,
      });

      const res = await fetch(config.metadata.token_endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Token exchange failed: ${res.status} ${errBody}`);
      }

      const tokenData = (await res.json()) as {
        id_token: string;
        access_token: string;
      };

      const [, payloadB64] = tokenData.id_token.split('.');
      const claims = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString(),
      );

      return {
        access_token: tokenData.access_token,
        claims: () => claims,
      };
    },

    async fetchUserInfo(
      config: MockOIDCConfig,
      accessToken: string,
      _sub: string,
    ) {
      const res = await fetch(config.metadata.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`Userinfo failed: ${res.status}`);
      return res.json();
    },

    buildEndSessionUrl(
      config: MockOIDCConfig,
      params: Record<string, string>,
    ): URL {
      const endpoint = config.metadata.end_session_endpoint;
      if (!endpoint) throw new Error('No end_session_endpoint');
      const url = new URL(endpoint);
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
      return url;
    },

    randomPKCECodeVerifier(): string {
      return cryptoMod.randomBytes(32).toString('base64url');
    },

    async calculatePKCECodeChallenge(verifier: string): Promise<string> {
      return cryptoMod
        .createHash('sha256')
        .update(verifier)
        .digest('base64url');
    },

    randomState(): string {
      return cryptoMod.randomBytes(32).toString('base64url');
    },
  };
});

// Reset StoreRegistry AFTER mocking db
import { StoreRegistry } from '../../stores';
StoreRegistry.resetInstance();

// Import auth modules (will use our mocked openid-client)
import { initializeOIDC } from '../../auth/config';
import authRouter from '../../routes/auth/index';

jest.setTimeout(30000);

// ─── Cookie Helper ──────────────────────────────────────────────────────────

/**
 * Extracts cookies from a supertest response and returns a cookie string
 * suitable for the Cookie header.
 */
function extractCookies(
  res: request.Response,
  existing?: string,
): string {
  const cookies = new Map<string, string>();

  // Parse existing cookies
  if (existing) {
    for (const part of existing.split('; ')) {
      const eqIdx = part.indexOf('=');
      if (eqIdx > 0) {
        cookies.set(part.substring(0, eqIdx), part.substring(eqIdx + 1));
      }
    }
  }

  // Parse Set-Cookie headers from response
  const setCookieHeaders = res.headers['set-cookie'] as unknown as
    | string[]
    | undefined;
  if (setCookieHeaders) {
    for (const header of setCookieHeaders) {
      const nameValue = header.split(';')[0];
      const eqIdx = nameValue.indexOf('=');
      if (eqIdx > 0) {
        cookies.set(
          nameValue.substring(0, eqIdx).trim(),
          nameValue.substring(eqIdx + 1).trim(),
        );
      }
    }
  }

  return Array.from(cookies.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('OIDC Integration Tests', () => {
  let provider: TestProviderResult;
  let appServer: http.Server;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    testDb.pragma('foreign_keys = ON');
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        oidc_subject TEXT UNIQUE,
        password_hash TEXT,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS team_members (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (team_id, user_id)
      );
    `);

    const app = express();
    app.use(express.json());
    app.use(
      session({
        secret: 'test-session-secret-minimum-32-chars!!',
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false },
      }),
    );
    app.use('/api/auth', authRouter);

    appServer = await new Promise<http.Server>((resolve) => {
      const srv = app.listen(0, () => resolve(srv));
    });
    const appPort = (appServer.address() as { port: number }).port;
    testCallbackUri = `http://localhost:${appPort}/api/auth/callback`;

    provider = await createTestProvider({
      callbackUri: testCallbackUri,
    });
    process.env.OIDC_ISSUER_URL = provider.url;
    process.env.OIDC_CLIENT_ID = 'test-client';
    process.env.OIDC_CLIENT_SECRET = 'test-secret';
    process.env.OIDC_REDIRECT_URI = testCallbackUri;
    process.env.CORS_ORIGIN = `http://localhost:${appPort}`;
    delete process.env.LOCAL_AUTH;

    await initializeOIDC();
  });

  afterAll(async () => {
    process.env = originalEnv;
    await new Promise<void>((resolve) => appServer?.close(() => resolve()));
    await new Promise<void>((resolve) =>
      provider?.server?.close(() => resolve()),
    );
    testDb.close();
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM team_members');
    testDb.exec('DELETE FROM teams');
    testDb.exec('DELETE FROM users');
  });

  // ── Helper ───────────────────────────────────────────────────────────────

  /**
   * Performs a full OIDC login flow and returns a cookie string
   * for making authenticated requests.
   */
  async function performFullLogin(accountId: string): Promise<string> {
    // Step 1: Hit login endpoint
    const loginRes = await request(appServer)
      .get('/api/auth/login')
      .redirects(0)
      .expect(302);

    let cookies = extractCookies(loginRes);
    const authorizationUrl = loginRes.headers.location;
    expect(authorizationUrl).toBeTruthy();

    // Step 2: Complete OIDC login on provider (raw fetch, separate cookie jar)
    const callbackUrl = await completeOIDCLogin(
      provider.url,
      authorizationUrl,
      accountId,
    );
    expect(callbackUrl).toContain('/api/auth/callback');
    expect(callbackUrl).toContain('code=');

    // Step 3: Hit callback with session cookie (triggers token exchange)
    const url = new URL(callbackUrl);
    const callbackPath = url.pathname + url.search;
    const callbackRes = await request(appServer)
      .get(callbackPath)
      .set('Cookie', cookies)
      .redirects(0)
      .expect(302);

    cookies = extractCookies(callbackRes, cookies);
    return cookies;
  }

  // ── Test Cases ───────────────────────────────────────────────────────────

  describe('Login redirect', () => {
    it('should redirect to OIDC provider with correct PKCE parameters', async () => {
      const response = await request(appServer)
        .get('/api/auth/login')
        .redirects(0)
        .expect(302);

      const location = response.headers.location;
      const authUrl = new URL(location);

      expect(authUrl.origin).toBe(provider.url);
      expect(authUrl.pathname).toBe('/auth');
      expect(authUrl.searchParams.get('client_id')).toBe('test-client');
      expect(authUrl.searchParams.get('redirect_uri')).toBe(testCallbackUri);
      expect(authUrl.searchParams.get('scope')).toBe('openid email profile');
      expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256');
      expect(authUrl.searchParams.get('code_challenge')).toBeTruthy();
      expect(authUrl.searchParams.get('state')).toBeTruthy();
    });
  });

  describe('Callback token exchange', () => {
    it('should exchange code for tokens and redirect to frontend', async () => {
      const cookies = await performFullLogin('alice');

      const meRes = await request(appServer)
        .get('/api/auth/me')
        .set('Cookie', cookies)
        .expect(200);

      expect(meRes.body.email).toBe('alice@test.com');
    });
  });

  describe('User creation on first login', () => {
    it('should create user with correct email, name, and oidc_subject', async () => {
      await performFullLogin('alice');

      const user = testDb
        .prepare('SELECT * FROM users WHERE oidc_subject = ?')
        .get('alice') as {
        email: string;
        name: string;
        oidc_subject: string;
      };

      expect(user).toBeDefined();
      expect(user.email).toBe('alice@test.com');
      expect(user.name).toBe('Alice Test');
      expect(user.oidc_subject).toBe('alice');
    });
  });

  describe('User info sync on subsequent login', () => {
    it('should update user record when OIDC claims differ from local', async () => {
      await performFullLogin('alice');

      const userBefore = testDb
        .prepare('SELECT * FROM users WHERE oidc_subject = ?')
        .get('alice') as { id: string; email: string; name: string };
      expect(userBefore.email).toBe('alice@test.com');

      // Simulate stale local record
      testDb
        .prepare('UPDATE users SET email = ?, name = ? WHERE id = ?')
        .run('old-email@test.com', 'Old Name', userBefore.id);

      // Second login should sync claims from provider
      await performFullLogin('alice');

      const userAfter = testDb
        .prepare('SELECT * FROM users WHERE oidc_subject = ?')
        .get('alice') as { email: string; name: string };

      expect(userAfter.email).toBe('alice@test.com');
      expect(userAfter.name).toBe('Alice Test');
    });
  });

  describe('Session establishment', () => {
    it('should establish a valid session after callback', async () => {
      const cookies = await performFullLogin('alice');

      const meRes = await request(appServer)
        .get('/api/auth/me')
        .set('Cookie', cookies)
        .expect(200);

      expect(meRes.body.email).toBe('alice@test.com');
      expect(meRes.body.name).toBe('Alice Test');
      expect(meRes.body.permissions).toBeDefined();
    });

    it('should return 401 for unauthenticated requests', async () => {
      await request(appServer).get('/api/auth/me').expect(401);
    });
  });

  describe('Logout', () => {
    it('should destroy session and return redirect URL', async () => {
      const cookies = await performFullLogin('alice');

      // Verify session works before logout
      await request(appServer)
        .get('/api/auth/me')
        .set('Cookie', cookies)
        .expect(200);

      // Perform logout
      const logoutRes = await request(appServer)
        .post('/api/auth/logout')
        .set('Cookie', cookies)
        .expect(200);

      expect(logoutRes.body.redirectUrl).toBeDefined();

      // Session should be destroyed
      await request(appServer)
        .get('/api/auth/me')
        .set('Cookie', cookies)
        .expect(401);
    });
  });

  describe('First-user admin bootstrap', () => {
    it('should assign admin role to the first user', async () => {
      await performFullLogin('alice');

      const user = testDb
        .prepare('SELECT role FROM users WHERE oidc_subject = ?')
        .get('alice') as { role: string };

      expect(user.role).toBe('admin');
    });

    it('should assign user role to subsequent users', async () => {
      await performFullLogin('alice');
      await performFullLogin('bob');

      const secondUser = testDb
        .prepare('SELECT role FROM users WHERE oidc_subject = ?')
        .get('bob') as { role: string };

      expect(secondUser.role).toBe('user');
    });
  });

  describe('Invalid state parameter', () => {
    it('should reject callback with mismatched state', async () => {
      // Hit login to establish session with valid state
      const loginRes = await request(appServer)
        .get('/api/auth/login')
        .redirects(0)
        .expect(302);

      const cookies = extractCookies(loginRes);

      // Hit callback with wrong state
      const callbackRes = await request(appServer)
        .get('/api/auth/callback?code=fake-code&state=wrong-state')
        .set('Cookie', cookies)
        .redirects(0)
        .expect(302);

      expect(callbackRes.headers.location).toContain(
        'error=state_mismatch',
      );
    });
  });

  describe('Invalid authorization code', () => {
    it('should redirect with error when code exchange fails', async () => {
      const loginRes = await request(appServer)
        .get('/api/auth/login')
        .redirects(0)
        .expect(302);

      const cookies = extractCookies(loginRes);
      const authUrl = new URL(loginRes.headers.location);
      const state = authUrl.searchParams.get('state')!;

      const callbackRes = await request(appServer)
        .get(
          `/api/auth/callback?code=invalid-expired-code&state=${state}`,
        )
        .set('Cookie', cookies)
        .redirects(0)
        .expect(302);

      expect(callbackRes.headers.location).toContain(
        'error=auth_failed',
      );
    });
  });

  describe('OIDC provider unreachable', () => {
    it('should handle provider errors gracefully during token exchange', async () => {
      const loginRes = await request(appServer)
        .get('/api/auth/login')
        .redirects(0)
        .expect(302);

      const cookies = extractCookies(loginRes);
      const authUrl = new URL(loginRes.headers.location);
      const state = authUrl.searchParams.get('state')!;

      // Stop the provider
      const providerPort = Number(new URL(provider.url).port);
      await new Promise<void>((resolve) =>
        provider.server.close(() => resolve()),
      );

      const callbackRes = await request(appServer)
        .get(`/api/auth/callback?code=any-code&state=${state}`)
        .set('Cookie', cookies)
        .redirects(0)
        .expect(302);

      expect(callbackRes.headers.location).toContain(
        'error=auth_failed',
      );

      // Restart provider for remaining tests
      // eslint-disable-next-line @typescript-eslint/no-var-requires, security/detect-non-literal-require
      const Provider = require('oidc-provider');
      const newProvider = new Provider(provider.url, {
        clients: [
          {
            client_id: 'test-client',
            client_secret: 'test-secret',
            redirect_uris: [testCallbackUri],
            grant_types: ['authorization_code'],
            response_types: ['code'],
            token_endpoint_auth_method: 'client_secret_post',
          },
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findAccount: async (_ctx: any, id: string) => ({
          accountId: id,
          claims: async () => ({
            sub: id,
            email: `${id}@test.com`,
            name: `Test ${id}`,
          }),
        }),
        features: { devInteractions: { enabled: true } },
        pkce: { methods: ['S256'], required: () => true },
        scopes: ['openid', 'email', 'profile'],
        claims: {
          openid: ['sub'],
          email: ['email'],
          profile: ['name'],
        },
      });
      provider.server = newProvider.listen(providerPort);
    });
  });

  describe('Auth mode endpoint', () => {
    it('should return oidc mode when LOCAL_AUTH is not set', async () => {
      const res = await request(appServer)
        .get('/api/auth/mode')
        .expect(200);

      expect(res.body.mode).toBe('oidc');
    });
  });
});
