import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';
import session from 'express-session';
import { hashSync } from 'bcryptjs';

const testDb = new Database(':memory:');
const originalEnv = { ...process.env };

jest.mock('../../db', () => ({
  db: testDb,
  default: testDb,
}));

jest.mock('../../auth/config', () => ({
  getOIDCConfig: jest.fn().mockReturnValue({}),
  generateCodeVerifier: jest.fn().mockReturnValue('test-verifier'),
  generateCodeChallenge: jest.fn().mockResolvedValue('test-challenge'),
  generateState: jest.fn().mockReturnValue('test-state'),
  client: {
    buildAuthorizationUrl: jest.fn().mockReturnValue({ href: 'https://auth.example.com/authorize' }),
    buildEndSessionUrl: jest.fn().mockReturnValue({ href: 'https://auth.example.com/logout' }),
    authorizationCodeGrant: jest.fn(),
    fetchUserInfo: jest.fn(),
  },
}));

jest.mock('../../auth/middleware', () => ({
  requireAuth: jest.fn((_req, _res, next) => next()),
}));

jest.mock('../../utils/errors', () => ({
  sendErrorResponse: jest.fn((res, _error, _context) => {
    res.status(500).json({ error: 'Internal server error' });
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
  }),
);
app.use('/api/auth', authRouter);

describe('Local Auth Routes', () => {
  const passwordHash = hashSync('correctpassword', 10);

  beforeAll(() => {
    testDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        oidc_subject TEXT UNIQUE,
        password_hash TEXT,
        role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        key TEXT,
        description TEXT,
        contact TEXT,
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
    `);
  });

  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    process.env = { ...originalEnv };
    testDb.exec('DELETE FROM team_members');
    testDb.exec('DELETE FROM teams');
    testDb.exec('DELETE FROM users');
    testDb.exec(`
      INSERT INTO users (id, email, name, password_hash, role, is_active) VALUES
        ('user-local-1', 'admin@local.com', 'Local Admin', '${passwordHash}', 'admin', 1),
        ('user-local-2', 'inactive@local.com', 'Inactive User', '${passwordHash}', 'user', 0),
        ('user-oidc-1', 'oidc@example.com', 'OIDC User', NULL, 'user', 1);
    `);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('GET /api/auth/mode', () => {
    it('should return "oidc" by default', async () => {
      delete process.env.LOCAL_AUTH;

      const res = await request(app).get('/api/auth/mode');
      expect(res.status).toBe(200);
      expect(res.body.mode).toBe('oidc');
    });

    it('should return "local" when LOCAL_AUTH=true', async () => {
      process.env.LOCAL_AUTH = 'true';

      const res = await request(app).get('/api/auth/mode');
      expect(res.status).toBe(200);
      expect(res.body.mode).toBe('local');
    });

  });

  describe('POST /api/auth/login (local)', () => {
    it('should return 404 when LOCAL_AUTH is not enabled', async () => {
      delete process.env.LOCAL_AUTH;

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@local.com', password: 'correctpassword' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Local auth is not enabled');
    });

    it('should authenticate with valid credentials', async () => {
      process.env.LOCAL_AUTH = 'true';

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@local.com', password: 'correctpassword' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('user-local-1');
      expect(res.body.email).toBe('admin@local.com');
      expect(res.body.name).toBe('Local Admin');
      expect(res.body.role).toBe('admin');
      // Should not return password_hash
      expect(res.body.password_hash).toBeUndefined();
    });

    it('should reject invalid password', async () => {
      process.env.LOCAL_AUTH = 'true';

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@local.com', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    it('should reject non-existent user', async () => {
      process.env.LOCAL_AUTH = 'true';

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@local.com', password: 'anypassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    it('should reject inactive user', async () => {
      process.env.LOCAL_AUTH = 'true';

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'inactive@local.com', password: 'correctpassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Account is deactivated');
    });

    it('should reject user without password_hash (OIDC-only user)', async () => {
      process.env.LOCAL_AUTH = 'true';

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'oidc@example.com', password: 'anypassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    it('should return 400 when email is missing', async () => {
      process.env.LOCAL_AUTH = 'true';

      const res = await request(app)
        .post('/api/auth/login')
        .send({ password: 'somepassword' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Email and password are required');
    });

    it('should return 400 when password is missing', async () => {
      process.env.LOCAL_AUTH = 'true';

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@local.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Email and password are required');
    });

    it('should return 400 when email is not a string', async () => {
      process.env.LOCAL_AUTH = 'true';

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 123, password: 'somepassword' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Email and password must be strings');
    });

    it('should set session userId on successful login', async () => {
      process.env.LOCAL_AUTH = 'true';

      const agent = request.agent(app);

      const res = await agent
        .post('/api/auth/login')
        .send({ email: 'admin@local.com', password: 'correctpassword' });

      expect(res.status).toBe(200);
      // Session cookie should be set
      expect(res.headers['set-cookie']).toBeDefined();
    });
  });

  describe('GET /api/auth/login (redirect behavior)', () => {
    it('should redirect to frontend login page in local auth mode', async () => {
      process.env.LOCAL_AUTH = 'true';
      process.env.CORS_ORIGIN = 'http://localhost:3000';

      const res = await request(app).get('/api/auth/login');

      expect(res.status).toBe(302);
      expect(res.headers.location).toBe('http://localhost:3000/login');
    });
  });
});
