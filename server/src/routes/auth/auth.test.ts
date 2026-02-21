import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';
import session from 'express-session';
import { User } from '../../db/types';

const testDb = new Database(':memory:');

jest.mock('../../db', () => ({
  db: testDb,
  default: testDb,
}));

const mockBuildAuthorizationUrl = jest.fn().mockReturnValue({ href: 'https://auth.example.com/authorize' });
const mockBuildEndSessionUrl = jest.fn().mockReturnValue({ href: 'https://auth.example.com/logout' });
const mockAuthorizationCodeGrant = jest.fn();
const mockFetchUserInfo = jest.fn();

jest.mock('../../auth/config', () => ({
  getOIDCConfig: jest.fn().mockReturnValue({}),
  generateCodeVerifier: jest.fn().mockReturnValue('test-verifier'),
  generateCodeChallenge: jest.fn().mockResolvedValue('test-challenge'),
  generateState: jest.fn().mockReturnValue('test-state'),
  client: {
    buildAuthorizationUrl: mockBuildAuthorizationUrl,
    buildEndSessionUrl: mockBuildEndSessionUrl,
    authorizationCodeGrant: mockAuthorizationCodeGrant,
    fetchUserInfo: mockFetchUserInfo,
  },
}));

jest.mock('../../auth/middleware', () => ({
  requireAuth: jest.fn((req, _res, next) => {
    req.user = req.testUser;
    next();
  }),
}));

import authRouter from './index';

const app = express();
app.use(express.json());
app.use(
  session({
    secret: 'test-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

// Middleware to inject test user
app.use((req, _res, next) => {
  (req as { testUser?: User }).testUser = (req.headers['x-test-user'] as string)
    ? JSON.parse(req.headers['x-test-user'] as string)
    : undefined;
  next();
});

app.use('/api/auth', authRouter);

describe('Auth API', () => {
  beforeAll(() => {
    testDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        oidc_subject TEXT UNIQUE NOT NULL,
        password_hash TEXT,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        picture TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE team_members (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (team_id, user_id)
      );

      INSERT INTO users (id, oidc_subject, email, name, role, is_active) VALUES
        ('user-1', 'oidc-1', 'admin@example.com', 'Admin User', 'admin', 1),
        ('user-2', 'oidc-2', 'user@example.com', 'Regular User', 'user', 1);

      INSERT INTO teams (id, name) VALUES ('team-1', 'Test Team');
      INSERT INTO team_members (id, team_id, user_id, role) VALUES
        ('tm-1', 'team-1', 'user-1', 'lead');
    `);
  });

  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/auth/login', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should redirect to OIDC provider', async () => {
      const response = await request(app).get('/api/auth/login');

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('https://auth.example.com/authorize');
    });

    it('should redirect to frontend in bypass mode', async () => {
      process.env.AUTH_BYPASS = 'true';
      process.env.CORS_ORIGIN = 'http://localhost:3000';

      const response = await request(app).get('/api/auth/login');

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('http://localhost:3000/');
    });

    it('should handle returnTo parameter in bypass mode', async () => {
      process.env.AUTH_BYPASS = 'true';
      process.env.CORS_ORIGIN = 'http://localhost:3000';

      const response = await request(app).get('/api/auth/login?returnTo=/dashboard');

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('http://localhost:3000/dashboard');
    });

    it('should return 403 when bypass is enabled in production', async () => {
      process.env.AUTH_BYPASS = 'true';
      process.env.NODE_ENV = 'production';

      const response = await request(app).get('/api/auth/login');

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Auth bypass is not allowed in production');
    });

    it('should handle errors', async () => {
      mockBuildAuthorizationUrl.mockImplementationOnce(() => {
        throw new Error('OIDC error');
      });

      const response = await request(app).get('/api/auth/login');

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to initiate login');
    });
  });

  describe('GET /api/auth/callback', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
      process.env.CORS_ORIGIN = 'http://localhost:3000';
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should redirect on state mismatch', async () => {
      const agent = request.agent(app);

      const response = await agent.get('/api/auth/callback?code=test-code&state=wrong-state');

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('error=state_mismatch');
    });

    it('should handle existing user callback', async () => {
      mockAuthorizationCodeGrant.mockResolvedValueOnce({
        claims: () => ({ sub: 'oidc-1' }),
        access_token: 'test-token',
      });
      mockFetchUserInfo.mockResolvedValueOnce({
        email: 'admin@example.com',
        name: 'Admin User',
      });

      // First set up the session
      const agent = request.agent(app);
      await agent.get('/api/auth/login');

      // Mock state match for callback
      const response = await agent.get('/api/auth/callback?code=test-code&state=test-state');

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('http://localhost:3000/');
    });

    it('should create new user on first login', async () => {
      // Clear users table
      testDb.exec('DELETE FROM users');

      mockAuthorizationCodeGrant.mockResolvedValueOnce({
        claims: () => ({ sub: 'new-oidc-subject' }),
        access_token: 'test-token',
      });
      mockFetchUserInfo.mockResolvedValueOnce({
        email: 'newuser@example.com',
        name: 'New User',
      });

      const agent = request.agent(app);
      await agent.get('/api/auth/login');

      const response = await agent.get('/api/auth/callback?code=test-code&state=test-state');

      expect(response.status).toBe(302);

      // Verify user was created as admin (first user)
      const user = testDb.prepare('SELECT * FROM users WHERE oidc_subject = ?').get('new-oidc-subject') as { role: string };
      expect(user).toBeDefined();
      expect(user.role).toBe('admin');

      // Restore test data
      testDb.exec(`
        DELETE FROM users;
        INSERT INTO users (id, oidc_subject, email, name, role, is_active) VALUES
          ('user-1', 'oidc-1', 'admin@example.com', 'Admin User', 'admin', 1),
          ('user-2', 'oidc-2', 'user@example.com', 'Regular User', 'user', 1);
      `);
    });

    it('should update user info if changed', async () => {
      mockAuthorizationCodeGrant.mockResolvedValueOnce({
        claims: () => ({ sub: 'oidc-1' }),
        access_token: 'test-token',
      });
      mockFetchUserInfo.mockResolvedValueOnce({
        email: 'updated@example.com',
        name: 'Updated Name',
      });

      const agent = request.agent(app);
      await agent.get('/api/auth/login');
      await agent.get('/api/auth/callback?code=test-code&state=test-state');

      const user = testDb.prepare('SELECT * FROM users WHERE id = ?').get('user-1') as { email: string; name: string };
      expect(user.email).toBe('updated@example.com');
      expect(user.name).toBe('Updated Name');

      // Restore original values
      testDb.exec("UPDATE users SET email = 'admin@example.com', name = 'Admin User' WHERE id = 'user-1'");
    });

    it('should handle callback errors', async () => {
      mockAuthorizationCodeGrant.mockRejectedValueOnce(new Error('Token exchange failed'));

      const agent = request.agent(app);
      await agent.get('/api/auth/login');

      const response = await agent.get('/api/auth/callback?code=test-code&state=test-state');

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('error=auth_failed');
    });

    it('should handle missing sub in claims', async () => {
      mockAuthorizationCodeGrant.mockResolvedValueOnce({
        claims: () => ({}),
        access_token: 'test-token',
      });

      const agent = request.agent(app);
      await agent.get('/api/auth/login');

      const response = await agent.get('/api/auth/callback?code=test-code&state=test-state');

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('error=auth_failed');
    });
  });

  describe('POST /api/auth/logout', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return logout URL', async () => {
      const testUser = {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'admin' as const,
        is_active: 1,
        oidc_subject: 'oidc-1',
        picture: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const response = await request(app)
        .post('/api/auth/logout')
        .set('x-test-user', JSON.stringify(testUser));

      expect(response.status).toBe(200);
      expect(response.body.redirectUrl).toBe('https://auth.example.com/logout');
    });

    it('should return login URL in bypass mode', async () => {
      process.env.AUTH_BYPASS = 'true';

      const testUser = {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'admin' as const,
        is_active: 1,
        oidc_subject: 'oidc-1',
        picture: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const response = await request(app)
        .post('/api/auth/logout')
        .set('x-test-user', JSON.stringify(testUser));

      expect(response.status).toBe(200);
      expect(response.body.redirectUrl).toBe('/login');
    });

    it('should fallback to /login when end session fails', async () => {
      mockBuildEndSessionUrl.mockImplementationOnce(() => {
        throw new Error('No end session endpoint');
      });

      const testUser = {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'admin' as const,
        is_active: 1,
        oidc_subject: 'oidc-1',
        picture: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const response = await request(app)
        .post('/api/auth/logout')
        .set('x-test-user', JSON.stringify(testUser));

      expect(response.status).toBe(200);
      expect(response.body.redirectUrl).toBe('/login');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return authenticated user profile', async () => {
      const testUser = {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'admin' as const,
        is_active: 1,
        oidc_subject: 'oidc-1',
        picture: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const response = await request(app)
        .get('/api/auth/me')
        .set('x-test-user', JSON.stringify(testUser));

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('user-1');
      expect(response.body.email).toBe('admin@example.com');
      expect(response.body.permissions).toBeDefined();
      expect(response.body.permissions.canManageUsers).toBe(true);
    });

    it('should return 401 when not authenticated', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Not authenticated');
    });

    it('should include team memberships', async () => {
      const testUser = {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'admin' as const,
        is_active: 1,
        oidc_subject: 'oidc-1',
        picture: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const response = await request(app)
        .get('/api/auth/me')
        .set('x-test-user', JSON.stringify(testUser));

      expect(response.body.teams).toBeDefined();
      expect(Array.isArray(response.body.teams)).toBe(true);
    });

    it('should have correct permissions for team lead', async () => {
      const testUser = {
        id: 'user-1',
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'user' as const, // Not admin but is team lead
        is_active: 1,
        oidc_subject: 'oidc-1',
        picture: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const response = await request(app)
        .get('/api/auth/me')
        .set('x-test-user', JSON.stringify(testUser));

      expect(response.body.permissions.canManageServices).toBe(true);
      expect(response.body.permissions.canManageUsers).toBe(false);
    });
  });
});
