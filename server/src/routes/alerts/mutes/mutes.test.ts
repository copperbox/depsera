import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';

const testDb = new Database(':memory:');

jest.mock('../../../db', () => ({
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

const nonMemberUser: TestUser = {
  id: 'nonmember-1',
  email: 'nonmember@test.com',
  name: 'Non-Member',
  role: 'user',
  is_active: 1,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  oidc_subject: null,
  password_hash: null,
};

let currentUser: TestUser = adminUser;

jest.mock('../../../auth', () => ({
  requireAuth: jest.fn((req: Record<string, unknown>, _res: unknown, next: () => void) => {
    req.user = currentUser;
    req.session = { userId: currentUser.id };
    next();
  }),
  requireTeamAccess: jest.fn((req: Record<string, unknown>, res: { status: (code: number) => { json: (body: unknown) => void } }, next: () => void) => {
    req.user = currentUser;
    req.session = { userId: currentUser.id };

    if (currentUser.role === 'admin') {
      next();
      return;
    }

    const teamId = (req.params as Record<string, string>).id;
    const membership = testDb.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, currentUser.id);
    if (!membership) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    next();
  }),
  requireTeamLead: jest.fn((req: Record<string, unknown>, res: { status: (code: number) => { json: (body: unknown) => void } }, next: () => void) => {
    req.user = currentUser;
    req.session = { userId: currentUser.id };

    if (currentUser.role === 'admin') {
      next();
      return;
    }

    const teamId = (req.params as Record<string, string>).id;
    const membership = testDb.prepare('SELECT * FROM team_members WHERE team_id = ? AND user_id = ?').get(teamId, currentUser.id) as { role: string } | undefined;
    if (!membership || membership.role !== 'lead') {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    next();
  }),
}));

import alertsRouter from '../index';

const app = express();
app.use(express.json());
app.use('/api/teams', alertsRouter);

describe('Alert Mutes API Routes', () => {
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

      CREATE TABLE services (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        team_id TEXT NOT NULL,
        health_endpoint TEXT NOT NULL,
        metrics_endpoint TEXT,
        schema_config TEXT,
        poll_interval_ms INTEGER NOT NULL DEFAULT 30000,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_external INTEGER NOT NULL DEFAULT 0,
        description TEXT,
        last_poll_success INTEGER,
        last_poll_error TEXT,
        poll_warnings TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT
      );

      CREATE TABLE dependencies (
        id TEXT PRIMARY KEY,
        service_id TEXT NOT NULL,
        name TEXT NOT NULL,
        canonical_name TEXT,
        description TEXT,
        impact TEXT,
        type TEXT DEFAULT 'other',
        healthy INTEGER,
        health_state INTEGER,
        health_code INTEGER,
        latency_ms INTEGER,
        check_details TEXT,
        error TEXT,
        error_message TEXT,
        skipped INTEGER NOT NULL DEFAULT 0,
        last_checked TEXT,
        last_status_change TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(service_id, name),
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
      );

      CREATE TABLE alert_mutes (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        dependency_id TEXT,
        canonical_name TEXT,
        reason TEXT,
        created_by TEXT NOT NULL,
        expires_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (dependency_id) REFERENCES dependencies(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id),
        CHECK (
          (dependency_id IS NOT NULL AND canonical_name IS NULL) OR
          (dependency_id IS NULL AND canonical_name IS NOT NULL)
        )
      );
      CREATE UNIQUE INDEX idx_alert_mutes_dependency ON alert_mutes(dependency_id) WHERE dependency_id IS NOT NULL;
      CREATE UNIQUE INDEX idx_alert_mutes_canonical ON alert_mutes(team_id, canonical_name) WHERE canonical_name IS NOT NULL;
      CREATE INDEX idx_alert_mutes_team_id ON alert_mutes(team_id);
      CREATE INDEX idx_alert_mutes_expires_at ON alert_mutes(expires_at);

      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        details TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      INSERT INTO users (id, email, name, role) VALUES
        ('admin-1', 'admin@test.com', 'Admin User', 'admin'),
        ('lead-1', 'lead@test.com', 'Lead User', 'user'),
        ('member-1', 'member@test.com', 'Member User', 'user'),
        ('nonmember-1', 'nonmember@test.com', 'Non-Member', 'user');

      INSERT INTO teams (id, name) VALUES
        ('team-1', 'Alpha Team'),
        ('team-2', 'Beta Team');

      INSERT INTO team_members (team_id, user_id, role) VALUES
        ('team-1', 'lead-1', 'lead'),
        ('team-1', 'member-1', 'member');

      INSERT INTO services (id, name, team_id, health_endpoint) VALUES
        ('service-1', 'Service One', 'team-1', 'https://svc1.example.com/health'),
        ('service-2', 'Service Two', 'team-2', 'https://svc2.example.com/health');

      INSERT INTO dependencies (id, service_id, name, canonical_name) VALUES
        ('dep-1', 'service-1', 'postgres-primary', 'postgresql'),
        ('dep-2', 'service-1', 'redis-cache', 'redis'),
        ('dep-3', 'service-2', 'mysql-main', 'mysql');
    `);
  });

  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM alert_mutes');
    testDb.exec('DELETE FROM audit_log');
    currentUser = adminUser;
  });

  // ─── GET /api/teams/:id/alert-mutes ────────────────────────

  describe('GET /api/teams/:id/alert-mutes', () => {
    it('should return empty list when no mutes exist', async () => {
      const res = await request(app).get(`/api/teams/${teamId}/alert-mutes`);
      expect(res.status).toBe(200);
      expect(res.body.mutes).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('should return mutes with enriched data', async () => {
      testDb.exec(`
        INSERT INTO alert_mutes (id, team_id, dependency_id, canonical_name, reason, created_by)
        VALUES ('mute-1', 'team-1', 'dep-1', NULL, 'Maintenance', 'admin-1')
      `);

      const res = await request(app).get(`/api/teams/${teamId}/alert-mutes`);
      expect(res.status).toBe(200);
      expect(res.body.mutes).toHaveLength(1);
      expect(res.body.mutes[0].id).toBe('mute-1');
      expect(res.body.mutes[0].dependency_name).toBe('postgres-primary');
      expect(res.body.mutes[0].service_name).toBe('Service One');
      expect(res.body.mutes[0].created_by_name).toBe('Admin User');
    });

    it('should return canonical mutes', async () => {
      testDb.exec(`
        INSERT INTO alert_mutes (id, team_id, dependency_id, canonical_name, reason, created_by)
        VALUES ('mute-2', 'team-1', NULL, 'redis', 'Known flaky', 'admin-1')
      `);

      const res = await request(app).get(`/api/teams/${teamId}/alert-mutes`);
      expect(res.status).toBe(200);
      expect(res.body.mutes).toHaveLength(1);
      expect(res.body.mutes[0].canonical_name).toBe('redis');
      expect(res.body.mutes[0].dependency_id).toBeNull();
    });

    it('should respect limit and offset', async () => {
      testDb.exec(`
        INSERT INTO alert_mutes (id, team_id, dependency_id, canonical_name, reason, created_by)
        VALUES ('mute-1', 'team-1', 'dep-1', NULL, 'A', 'admin-1');
        INSERT INTO alert_mutes (id, team_id, dependency_id, canonical_name, reason, created_by)
        VALUES ('mute-2', 'team-1', NULL, 'redis', 'B', 'admin-1');
      `);

      const res = await request(app).get(`/api/teams/${teamId}/alert-mutes?limit=1&offset=0`);
      expect(res.status).toBe(200);
      expect(res.body.mutes).toHaveLength(1);
      expect(res.body.total).toBe(2);
    });

    it('should allow team members to list mutes', async () => {
      currentUser = memberUser;
      const res = await request(app).get(`/api/teams/${teamId}/alert-mutes`);
      expect(res.status).toBe(200);
    });

    it('should deny non-members access', async () => {
      currentUser = nonMemberUser;
      const res = await request(app).get(`/api/teams/${teamId}/alert-mutes`);
      expect(res.status).toBe(403);
    });
  });

  // ─── POST /api/teams/:id/alert-mutes ───────────────────────

  describe('POST /api/teams/:id/alert-mutes', () => {
    it('should create an instance mute', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-mutes`)
        .send({ dependency_id: 'dep-1' });

      expect(res.status).toBe(201);
      expect(res.body.dependency_id).toBe('dep-1');
      expect(res.body.canonical_name).toBeNull();
      expect(res.body.team_id).toBe(teamId);
    });

    it('should create a canonical mute', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-mutes`)
        .send({ canonical_name: 'redis' });

      expect(res.status).toBe(201);
      expect(res.body.canonical_name).toBe('redis');
      expect(res.body.dependency_id).toBeNull();
    });

    it('should create a mute with duration', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-mutes`)
        .send({ canonical_name: 'postgresql', duration: '2h' });

      expect(res.status).toBe(201);
      expect(res.body.expires_at).toBeDefined();
      expect(res.body.expires_at).not.toBeNull();
    });

    it('should create a mute with reason', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-mutes`)
        .send({ dependency_id: 'dep-1', reason: 'Maintenance window' });

      expect(res.status).toBe(201);
      expect(res.body.reason).toBe('Maintenance window');
    });

    it('should reject when both dependency_id and canonical_name are provided', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-mutes`)
        .send({ dependency_id: 'dep-1', canonical_name: 'redis' });

      expect(res.status).toBe(400);
    });

    it('should reject when neither dependency_id nor canonical_name is provided', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-mutes`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should reject invalid duration format', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-mutes`)
        .send({ canonical_name: 'redis', duration: 'invalid' });

      expect(res.status).toBe(400);
    });

    it('should reject dependency that does not belong to team', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-mutes`)
        .send({ dependency_id: 'dep-3' }); // dep-3 belongs to team-2

      expect(res.status).toBe(400);
    });

    it('should reject non-existent dependency', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-mutes`)
        .send({ dependency_id: 'nonexistent' });

      expect(res.status).toBe(400);
    });

    it('should reject reason longer than 500 characters', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-mutes`)
        .send({ canonical_name: 'redis', reason: 'x'.repeat(501) });

      expect(res.status).toBe(400);
    });

    it('should create audit log entry', async () => {
      await request(app)
        .post(`/api/teams/${teamId}/alert-mutes`)
        .send({ dependency_id: 'dep-1' });

      const logs = testDb.prepare('SELECT * FROM audit_log WHERE action = ?').all('alert_mute.created');
      expect(logs).toHaveLength(1);
    });

    it('should allow team lead to create mutes', async () => {
      currentUser = leadUser;
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-mutes`)
        .send({ canonical_name: 'redis' });

      expect(res.status).toBe(201);
    });

    it('should deny regular members from creating mutes', async () => {
      currentUser = memberUser;
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-mutes`)
        .send({ canonical_name: 'redis' });

      expect(res.status).toBe(403);
    });

    it('should deny non-members from creating mutes', async () => {
      currentUser = nonMemberUser;
      const res = await request(app)
        .post(`/api/teams/${teamId}/alert-mutes`)
        .send({ canonical_name: 'redis' });

      expect(res.status).toBe(403);
    });
  });

  // ─── DELETE /api/teams/:id/alert-mutes/:muteId ─────────────

  describe('DELETE /api/teams/:id/alert-mutes/:muteId', () => {
    it('should delete a mute', async () => {
      testDb.exec(`
        INSERT INTO alert_mutes (id, team_id, dependency_id, canonical_name, reason, created_by)
        VALUES ('mute-del', 'team-1', 'dep-1', NULL, NULL, 'admin-1')
      `);

      const res = await request(app)
        .delete(`/api/teams/${teamId}/alert-mutes/mute-del`);

      expect(res.status).toBe(204);

      // Verify deleted
      const mute = testDb.prepare('SELECT * FROM alert_mutes WHERE id = ?').get('mute-del');
      expect(mute).toBeUndefined();
    });

    it('should return 404 for non-existent mute', async () => {
      const res = await request(app)
        .delete(`/api/teams/${teamId}/alert-mutes/nonexistent`);

      expect(res.status).toBe(404);
    });

    it('should return 403 when mute belongs to another team', async () => {
      // Create a mute for team-2
      testDb.exec(`
        INSERT INTO alert_mutes (id, team_id, dependency_id, canonical_name, reason, created_by)
        VALUES ('mute-other', 'team-2', 'dep-3', NULL, NULL, 'admin-1')
      `);

      const res = await request(app)
        .delete(`/api/teams/${teamId}/alert-mutes/mute-other`);

      expect(res.status).toBe(403);

      // Clean up
      testDb.exec("DELETE FROM alert_mutes WHERE id = 'mute-other'");
    });

    it('should create audit log entry on delete', async () => {
      testDb.exec(`
        INSERT INTO alert_mutes (id, team_id, dependency_id, canonical_name, reason, created_by)
        VALUES ('mute-audit', 'team-1', 'dep-2', NULL, NULL, 'admin-1')
      `);

      testDb.exec("DELETE FROM audit_log WHERE action = 'alert_mute.deleted'");

      await request(app)
        .delete(`/api/teams/${teamId}/alert-mutes/mute-audit`);

      const logs = testDb.prepare('SELECT * FROM audit_log WHERE action = ?').all('alert_mute.deleted');
      expect(logs).toHaveLength(1);
    });

    it('should allow team lead to delete mutes', async () => {
      testDb.exec(`
        INSERT INTO alert_mutes (id, team_id, dependency_id, canonical_name, reason, created_by)
        VALUES ('mute-lead', 'team-1', NULL, 'redis', NULL, 'admin-1')
      `);

      currentUser = leadUser;
      const res = await request(app)
        .delete(`/api/teams/${teamId}/alert-mutes/mute-lead`);

      expect(res.status).toBe(204);
    });

    it('should deny regular members from deleting mutes', async () => {
      testDb.exec(`
        INSERT INTO alert_mutes (id, team_id, dependency_id, canonical_name, reason, created_by)
        VALUES ('mute-mem', 'team-1', NULL, 'redis', NULL, 'admin-1')
      `);

      currentUser = memberUser;
      const res = await request(app)
        .delete(`/api/teams/${teamId}/alert-mutes/mute-mem`);

      expect(res.status).toBe(403);

      // Clean up
      testDb.exec("DELETE FROM alert_mutes WHERE id = 'mute-mem'");
    });
  });
});
