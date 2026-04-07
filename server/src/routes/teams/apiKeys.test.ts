import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';

const testDb = new Database(':memory:');

jest.mock('../../db', () => ({
  db: testDb,
  default: testDb,
}));

interface TestUser {
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: number;
  created_at: string;
  updated_at: string;
  oidc_subject: string | null;
  password_hash: string | null;
}

const adminUser: TestUser = {
  id: 'admin-1',
  email: 'admin@test.com',
  name: 'Admin User',
  role: 'admin',
  is_active: 1,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  oidc_subject: null,
  password_hash: null,
};

const leadUser: TestUser = {
  id: 'lead-1',
  email: 'lead@test.com',
  name: 'Lead User',
  role: 'user',
  is_active: 1,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  oidc_subject: null,
  password_hash: null,
};

const memberUser: TestUser = {
  id: 'member-1',
  email: 'member@test.com',
  name: 'Member User',
  role: 'user',
  is_active: 1,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  oidc_subject: null,
  password_hash: null,
};

let currentUser: TestUser = adminUser;

jest.mock('../../auth', () => ({
  requireAuth: jest.fn((req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.user = currentUser;
    req.session = { userId: currentUser.id };
    next();
  }),
  requireAdmin: jest.fn((req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.user = currentUser;
    req.session = { userId: currentUser.id };
    next();
  }),
  requireTeamLead: jest.fn(
    (
      req: Record<string, unknown>,
      res: { status: (code: number) => { json: (body: unknown) => void } },
      next: () => void,
    ) => {
      req.user = currentUser;
      req.session = { userId: currentUser.id };

      if (currentUser.role === 'admin') {
        next();
        return;
      }

      const teamId = (req.params as Record<string, string>).id;
      const membership = testDb
        .prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?')
        .get(teamId, currentUser.id) as { role: string } | undefined;
      if (!membership || membership.role !== 'lead') {
        res.status(403).json({ error: 'Access denied' });
        return;
      }
      next();
    },
  ),
}));

import teamRouter from './index';

const app = express();
app.use(express.json());
app.use('/api/teams', teamRouter);

describe('API Key Routes', () => {
  const teamId = 'team-1';

  beforeAll(() => {
    testDb.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT,
        oidc_subject TEXT,
        role TEXT NOT NULL DEFAULT 'user',
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
        team_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (team_id, user_id),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE team_api_keys (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        last_used_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_by TEXT,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX idx_team_api_keys_key_hash ON team_api_keys(key_hash);

      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        details TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Insert test users
    const insertUser = testDb.prepare(
      'INSERT INTO users (id, email, name, role) VALUES (?, ?, ?, ?)',
    );
    insertUser.run(adminUser.id, adminUser.email, adminUser.name, adminUser.role);
    insertUser.run(leadUser.id, leadUser.email, leadUser.name, leadUser.role);
    insertUser.run(memberUser.id, memberUser.email, memberUser.name, memberUser.role);

    // Insert team
    testDb
      .prepare('INSERT INTO teams (id, name, key) VALUES (?, ?, ?)')
      .run(teamId, 'Test Team', 'TEST');

    // Lead is a lead, member is a member
    testDb
      .prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)')
      .run(teamId, leadUser.id, 'lead');
    testDb
      .prepare('INSERT INTO team_members (team_id, user_id, role) VALUES (?, ?, ?)')
      .run(teamId, memberUser.id, 'member');
  });

  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    currentUser = adminUser;
    // Clean up api keys between tests
    testDb.exec('DELETE FROM team_api_keys');
    testDb.exec('DELETE FROM audit_log');
  });

  describe('POST /api/teams/:id/api-keys', () => {
    it('should create an API key and return raw key once', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/api-keys`)
        .send({ name: 'My Key' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('My Key');
      expect(res.body.rawKey).toMatch(/^dps_[0-9a-f]{32}$/);
      expect(res.body.key_prefix).toMatch(/^dps_/);
      expect(res.body.team_id).toBe(teamId);
      expect(res.body.created_by).toBe(adminUser.id);
      // key_hash should not be returned
      expect(res.body.key_hash).toBeUndefined();
    });

    it('should log an audit event on creation', async () => {
      await request(app)
        .post(`/api/teams/${teamId}/api-keys`)
        .send({ name: 'Audit Key' });

      const audit = testDb
        .prepare("SELECT * FROM audit_log WHERE action = 'api_key.created'")
        .get() as { action: string; resource_type: string; details: string } | undefined;

      expect(audit).toBeDefined();
      expect(audit!.resource_type).toBe('team_api_key');
      expect(JSON.parse(audit!.details).key_name).toBe('Audit Key');
    });

    it('should return 400 when name is missing', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/api-keys`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 400 when name is empty', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/api-keys`)
        .send({ name: '   ' });

      expect(res.status).toBe(400);
    });

    it('should allow team lead to create keys', async () => {
      currentUser = leadUser;

      const res = await request(app)
        .post(`/api/teams/${teamId}/api-keys`)
        .send({ name: 'Lead Key' });

      expect(res.status).toBe(201);
    });

    it('should deny regular member from creating keys', async () => {
      currentUser = memberUser;

      const res = await request(app)
        .post(`/api/teams/${teamId}/api-keys`)
        .send({ name: 'Member Key' });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/teams/:id/api-keys', () => {
    it('should list keys without raw key or key_hash', async () => {
      // Create a key first
      await request(app)
        .post(`/api/teams/${teamId}/api-keys`)
        .send({ name: 'List Key' });

      const res = await request(app).get(`/api/teams/${teamId}/api-keys`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('List Key');
      expect(res.body[0].key_prefix).toBeDefined();
      expect(res.body[0].rawKey).toBeUndefined();
      expect(res.body[0].key_hash).toBeUndefined();
    });

    it('should return empty array when no keys exist', async () => {
      const res = await request(app).get(`/api/teams/${teamId}/api-keys`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should deny regular member from listing keys', async () => {
      currentUser = memberUser;

      const res = await request(app).get(`/api/teams/${teamId}/api-keys`);

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/teams/:id/api-keys/:keyId', () => {
    it('should revoke an API key', async () => {
      const createRes = await request(app)
        .post(`/api/teams/${teamId}/api-keys`)
        .send({ name: 'Delete Key' });

      const keyId = createRes.body.id;

      const res = await request(app).delete(
        `/api/teams/${teamId}/api-keys/${keyId}`,
      );

      expect(res.status).toBe(204);

      // Verify key is gone
      const listRes = await request(app).get(`/api/teams/${teamId}/api-keys`);
      expect(listRes.body).toHaveLength(0);
    });

    it('should log an audit event on revocation', async () => {
      const createRes = await request(app)
        .post(`/api/teams/${teamId}/api-keys`)
        .send({ name: 'Revoke Key' });

      const keyId = createRes.body.id;
      testDb.exec('DELETE FROM audit_log'); // Clear create event

      await request(app).delete(`/api/teams/${teamId}/api-keys/${keyId}`);

      const audit = testDb
        .prepare("SELECT * FROM audit_log WHERE action = 'api_key.revoked'")
        .get() as { action: string; resource_type: string; details: string } | undefined;

      expect(audit).toBeDefined();
      expect(audit!.resource_type).toBe('team_api_key');
      expect(JSON.parse(audit!.details).key_name).toBe('Revoke Key');
    });

    it('should return 404 when key does not exist', async () => {
      const res = await request(app).delete(
        `/api/teams/${teamId}/api-keys/nonexistent`,
      );

      expect(res.status).toBe(404);
    });

    it('should deny regular member from revoking keys', async () => {
      // Create as admin
      const createRes = await request(app)
        .post(`/api/teams/${teamId}/api-keys`)
        .send({ name: 'Protected Key' });

      currentUser = memberUser;

      const res = await request(app).delete(
        `/api/teams/${teamId}/api-keys/${createRes.body.id}`,
      );

      expect(res.status).toBe(403);
    });
  });
});
