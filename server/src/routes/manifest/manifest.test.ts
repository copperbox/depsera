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

jest.mock('../../auth', () => ({
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

// Mock SSRF validation
jest.mock('../../utils/ssrf', () => ({
  validateUrlHostname: jest.fn((url: string) => {
    if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('10.0.0.')) {
      throw new Error(`Blocked hostname`);
    }
  }),
  validateUrlNotPrivate: jest.fn(),
}));

// Mock ManifestSyncService
const mockSyncTeam = jest.fn();
const mockSyncManifest = jest.fn();
const mockCanManualSync = jest.fn();
const mockIsSyncing = jest.fn();
const mockIsSyncingConfig = jest.fn();

jest.mock('../../services/manifest/ManifestSyncService', () => ({
  ManifestSyncService: {
    getInstance: () => ({
      syncTeam: mockSyncTeam,
      syncManifest: mockSyncManifest,
      canManualSync: mockCanManualSync,
      isSyncing: mockIsSyncing,
      isSyncingConfig: mockIsSyncingConfig,
    }),
  },
}));

// Mock ManifestValidator
const mockValidateManifest = jest.fn();
jest.mock('../../services/manifest/ManifestValidator', () => ({
  validateManifest: mockValidateManifest,
}));

// Mock ManifestFetcher
const mockFetchManifest = jest.fn();
jest.mock('../../services/manifest/ManifestFetcher', () => ({
  fetchManifest: mockFetchManifest,
}));

// Mock audit
jest.mock('../../services/audit/AuditLogService', () => ({
  auditFromRequest: jest.fn(),
  logAuditEvent: jest.fn(),
}));

import { manifestTeamRouter, manifestRouter } from './index';

const app = express();
app.use(express.json());
app.use('/api/teams', manifestTeamRouter);
app.use('/api/manifest', manifestRouter);

describe('Manifest API Routes', () => {
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

      CREATE TABLE team_manifest_config (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        name TEXT NOT NULL,
        manifest_url TEXT NOT NULL,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        sync_policy TEXT,
        last_sync_at TEXT,
        last_sync_status TEXT,
        last_sync_error TEXT,
        last_sync_summary TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      );

      CREATE TABLE manifest_sync_history (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        manifest_config_id TEXT,
        trigger_type TEXT NOT NULL,
        triggered_by TEXT,
        manifest_url TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT,
        errors TEXT,
        warnings TEXT,
        duration_ms INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id),
        FOREIGN KEY (triggered_by) REFERENCES users(id)
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
    `);
  });

  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM manifest_sync_history');
    testDb.exec('DELETE FROM team_manifest_config');
    currentUser = adminUser;
    mockSyncTeam.mockReset();
    mockSyncManifest.mockReset();
    mockCanManualSync.mockReset();
    mockIsSyncing.mockReset();
    mockIsSyncingConfig.mockReset();
    mockValidateManifest.mockReset();
    mockFetchManifest.mockReset();
  });

  // ─── Multi-Config Routes ──────────────────────────────────────

  describe('GET /api/teams/:id/manifests', () => {
    it('should return empty array when no configs exist', async () => {
      const res = await request(app).get(`/api/teams/${teamId}/manifests`);
      expect(res.status).toBe(200);
      expect(res.body.configs).toEqual([]);
    });

    it('should return configs when they exist', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, name, manifest_url, is_enabled, created_at, updated_at)
        VALUES ('cfg-1', 'team-1', 'Default', 'https://example.com/manifest.json', 1, datetime('now'), datetime('now'))
      `).run();

      const res = await request(app).get(`/api/teams/${teamId}/manifests`);
      expect(res.status).toBe(200);
      expect(res.body.configs).toHaveLength(1);
      expect(res.body.configs[0].manifest_url).toBe('https://example.com/manifest.json');
      expect(res.body.configs[0].name).toBe('Default');
    });

    it('should allow team members to list configs', async () => {
      currentUser = memberUser;
      const res = await request(app).get(`/api/teams/${teamId}/manifests`);
      expect(res.status).toBe(200);
    });

    it('should deny non-members access', async () => {
      currentUser = nonMemberUser;
      const res = await request(app).get(`/api/teams/${teamId}/manifests`);
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/teams/:id/manifests', () => {
    it('should create a new config', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/manifests`)
        .send({ name: 'Default', manifest_url: 'https://example.com/manifest.json' });

      expect(res.status).toBe(201);
      expect(res.body.config.manifest_url).toBe('https://example.com/manifest.json');
      expect(res.body.config.name).toBe('Default');
      expect(res.body.config.team_id).toBe(teamId);
      expect(res.body.config.is_enabled).toBe(1);
    });

    it('should accept sync_policy fields', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/manifests`)
        .send({
          name: 'With Policy',
          manifest_url: 'https://example.com/manifest.json',
          sync_policy: {
            on_field_drift: 'manifest_wins',
            on_removal: 'deactivate',
          },
        });

      expect(res.status).toBe(201);
      const policy = JSON.parse(res.body.config.sync_policy);
      expect(policy.on_field_drift).toBe('manifest_wins');
      expect(policy.on_removal).toBe('deactivate');
    });

    it('should reject missing name', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/manifests`)
        .send({ manifest_url: 'https://example.com/manifest.json' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('name');
    });

    it('should reject missing manifest_url', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/manifests`)
        .send({ name: 'Default' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('manifest_url');
    });

    it('should reject invalid manifest_url', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/manifests`)
        .send({ name: 'Default', manifest_url: 'not-a-url' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('valid URL');
    });

    it('should reject SSRF-blocked URLs', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/manifests`)
        .send({ name: 'Default', manifest_url: 'https://localhost/manifest.json' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('not allowed');
    });

    it('should reject invalid sync_policy values', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/manifests`)
        .send({
          name: 'Default',
          manifest_url: 'https://example.com/manifest.json',
          sync_policy: { on_field_drift: 'invalid' },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('on_field_drift');
    });

    it('should reject invalid on_removal policy', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/manifests`)
        .send({
          name: 'Default',
          manifest_url: 'https://example.com/manifest.json',
          sync_policy: { on_removal: 'destroy' },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('on_removal');
    });

    it('should reject invalid metadata removal policy', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/manifests`)
        .send({
          name: 'Default',
          manifest_url: 'https://example.com/manifest.json',
          sync_policy: { on_alias_removal: 'delete' },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('on_alias_removal');
    });

    it('should reject non-object sync_policy', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/manifests`)
        .send({
          name: 'Default',
          manifest_url: 'https://example.com/manifest.json',
          sync_policy: 'flag',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('sync_policy must be an object');
    });

    it('should reject duplicate name within team', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, name, manifest_url, created_at, updated_at)
        VALUES ('cfg-dup', 'team-1', 'Default', 'https://example.com/manifest.json', datetime('now'), datetime('now'))
      `).run();

      const res = await request(app)
        .post(`/api/teams/${teamId}/manifests`)
        .send({ name: 'Default', manifest_url: 'https://other.com/manifest.json' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('already exists');
    });

    it('should allow team leads to create config', async () => {
      currentUser = leadUser;
      const res = await request(app)
        .post(`/api/teams/${teamId}/manifests`)
        .send({ name: 'Default', manifest_url: 'https://example.com/manifest.json' });

      expect(res.status).toBe(201);
    });

    it('should deny members from creating config', async () => {
      currentUser = memberUser;
      const res = await request(app)
        .post(`/api/teams/${teamId}/manifests`)
        .send({ name: 'Default', manifest_url: 'https://example.com/manifest.json' });

      expect(res.status).toBe(403);
    });

    it('should allow setting is_enabled to false', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/manifests`)
        .send({
          name: 'Disabled Config',
          manifest_url: 'https://example.com/manifest.json',
          is_enabled: false,
        });

      expect(res.status).toBe(201);
      expect(res.body.config.is_enabled).toBe(0);
    });
  });

  describe('GET /api/teams/:id/manifests/:configId', () => {
    it('should return config when it exists', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, name, manifest_url, is_enabled, last_sync_at, last_sync_status, created_at, updated_at)
        VALUES ('cfg-get', 'team-1', 'Default', 'https://example.com/manifest.json', 1, '2024-01-15T10:00:00.000Z', 'success', datetime('now'), datetime('now'))
      `).run();

      const res = await request(app).get(`/api/teams/${teamId}/manifests/cfg-get`);
      expect(res.status).toBe(200);
      expect(res.body.config.manifest_url).toBe('https://example.com/manifest.json');
      expect(res.body.config.last_sync_at).toBe('2024-01-15T10:00:00.000Z');
      expect(res.body.config.last_sync_status).toBe('success');
    });

    it('should return 404 when config does not exist', async () => {
      const res = await request(app).get(`/api/teams/${teamId}/manifests/nonexistent`);
      expect(res.status).toBe(404);
    });

    it('should return 404 when config belongs to different team', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, name, manifest_url, created_at, updated_at)
        VALUES ('cfg-other', 'team-2', 'Default', 'https://example.com/manifest.json', datetime('now'), datetime('now'))
      `).run();

      const res = await request(app).get(`/api/teams/${teamId}/manifests/cfg-other`);
      expect(res.status).toBe(404);
    });

    it('should allow team members to read config', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, name, manifest_url, created_at, updated_at)
        VALUES ('cfg-mem-read', 'team-1', 'Default', 'https://example.com/manifest.json', datetime('now'), datetime('now'))
      `).run();

      currentUser = memberUser;
      const res = await request(app).get(`/api/teams/${teamId}/manifests/cfg-mem-read`);
      expect(res.status).toBe(200);
    });

    it('should deny non-members access', async () => {
      currentUser = nonMemberUser;
      const res = await request(app).get(`/api/teams/${teamId}/manifests/cfg-get`);
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/teams/:id/manifests/:configId', () => {
    it('should update existing config', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, name, manifest_url, is_enabled, created_at, updated_at)
        VALUES ('cfg-up', 'team-1', 'Default', 'https://old.example.com/manifest.json', 1, datetime('now'), datetime('now'))
      `).run();

      const res = await request(app)
        .put(`/api/teams/${teamId}/manifests/cfg-up`)
        .send({ manifest_url: 'https://new.example.com/manifest.json' });

      expect(res.status).toBe(200);
      expect(res.body.config.manifest_url).toBe('https://new.example.com/manifest.json');
    });

    it('should update name', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, name, manifest_url, created_at, updated_at)
        VALUES ('cfg-rename', 'team-1', 'Old Name', 'https://example.com/manifest.json', datetime('now'), datetime('now'))
      `).run();

      const res = await request(app)
        .put(`/api/teams/${teamId}/manifests/cfg-rename`)
        .send({ name: 'New Name' });

      expect(res.status).toBe(200);
      expect(res.body.config.name).toBe('New Name');
    });

    it('should return 404 for nonexistent config', async () => {
      const res = await request(app)
        .put(`/api/teams/${teamId}/manifests/nonexistent`)
        .send({ manifest_url: 'https://example.com/manifest.json' });

      expect(res.status).toBe(404);
    });

    it('should allow team leads to update config', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, name, manifest_url, created_at, updated_at)
        VALUES ('cfg-lead-up', 'team-1', 'Default', 'https://example.com/manifest.json', datetime('now'), datetime('now'))
      `).run();

      currentUser = leadUser;
      const res = await request(app)
        .put(`/api/teams/${teamId}/manifests/cfg-lead-up`)
        .send({ manifest_url: 'https://new.example.com/manifest.json' });

      expect(res.status).toBe(200);
    });

    it('should deny members from updating config', async () => {
      currentUser = memberUser;
      const res = await request(app)
        .put(`/api/teams/${teamId}/manifests/cfg-up`)
        .send({ manifest_url: 'https://example.com/manifest.json' });

      expect(res.status).toBe(403);
    });

    it('should allow setting is_enabled to false', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, name, manifest_url, is_enabled, created_at, updated_at)
        VALUES ('cfg-dis', 'team-1', 'Default', 'https://example.com/manifest.json', 1, datetime('now'), datetime('now'))
      `).run();

      const res = await request(app)
        .put(`/api/teams/${teamId}/manifests/cfg-dis`)
        .send({ is_enabled: false });

      expect(res.status).toBe(200);
      expect(res.body.config.is_enabled).toBe(0);
    });
  });

  describe('DELETE /api/teams/:id/manifests/:configId', () => {
    it('should delete manifest config', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, name, manifest_url, created_at, updated_at)
        VALUES ('cfg-del', 'team-1', 'Default', 'https://example.com/manifest.json', datetime('now'), datetime('now'))
      `).run();

      const res = await request(app).delete(`/api/teams/${teamId}/manifests/cfg-del`);
      expect(res.status).toBe(204);

      // Verify deleted
      const row = testDb.prepare('SELECT * FROM team_manifest_config WHERE id = ?').get('cfg-del');
      expect(row).toBeUndefined();
    });

    it('should return 404 when config does not exist', async () => {
      const res = await request(app).delete(`/api/teams/${teamId}/manifests/nonexistent`);
      expect(res.status).toBe(404);
    });

    it('should allow team leads to delete config', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, name, manifest_url, created_at, updated_at)
        VALUES ('cfg-del2', 'team-1', 'Default', 'https://example.com/manifest.json', datetime('now'), datetime('now'))
      `).run();

      currentUser = leadUser;
      const res = await request(app).delete(`/api/teams/${teamId}/manifests/cfg-del2`);
      expect(res.status).toBe(204);
    });

    it('should deny members from deleting config', async () => {
      currentUser = memberUser;
      const res = await request(app).delete(`/api/teams/${teamId}/manifests/cfg-del`);
      expect(res.status).toBe(403);
    });
  });

  // ─── Team Sync Route ──────────────────────────────────────────

  describe('POST /api/teams/:id/manifests/sync', () => {
    it('should return 404 when no enabled configs exist', async () => {
      const res = await request(app).post(`/api/teams/${teamId}/manifests/sync`);
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('No enabled manifest configs');
    });

    it('should return 404 when all configs are disabled', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, name, manifest_url, is_enabled, created_at, updated_at)
        VALUES ('cfg-dis-sync', 'team-1', 'Default', 'https://example.com/manifest.json', 0, datetime('now'), datetime('now'))
      `).run();

      const res = await request(app).post(`/api/teams/${teamId}/manifests/sync`);
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('No enabled manifest configs');
    });

    it('should return 409 when sync is already in progress', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, name, manifest_url, is_enabled, created_at, updated_at)
        VALUES ('cfg-ip', 'team-1', 'Default', 'https://example.com/manifest.json', 1, datetime('now'), datetime('now'))
      `).run();
      mockIsSyncing.mockReturnValue(true);

      const res = await request(app).post(`/api/teams/${teamId}/manifests/sync`);
      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already in progress');
    });

    it('should trigger sync successfully', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, name, manifest_url, is_enabled, created_at, updated_at)
        VALUES ('cfg-sync', 'team-1', 'Default', 'https://example.com/manifest.json', 1, datetime('now'), datetime('now'))
      `).run();
      mockIsSyncing.mockReturnValue(false);
      mockSyncTeam.mockResolvedValue({
        status: 'success',
        summary: { services: { created: 2, updated: 0, deactivated: 0, deleted: 0, drift_flagged: 0, unchanged: 0 } },
        errors: [],
        warnings: [],
        changes: [],
        duration_ms: 150,
      });

      const res = await request(app).post(`/api/teams/${teamId}/manifests/sync`);
      expect(res.status).toBe(200);
      expect(res.body.result.status).toBe('success');
      expect(res.body.result.summary.services.created).toBe(2);
      expect(mockSyncTeam).toHaveBeenCalledWith(teamId, 'manual', adminUser.id);
    });

    it('should allow team members to trigger sync', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, name, manifest_url, is_enabled, created_at, updated_at)
        VALUES ('cfg-mem', 'team-1', 'Default', 'https://example.com/manifest.json', 1, datetime('now'), datetime('now'))
      `).run();
      mockIsSyncing.mockReturnValue(false);
      mockSyncTeam.mockResolvedValue({
        status: 'success',
        summary: { services: { created: 0, updated: 0, deactivated: 0, deleted: 0, drift_flagged: 0, unchanged: 0 } },
        errors: [],
        warnings: [],
        changes: [],
        duration_ms: 50,
      });

      currentUser = memberUser;
      const res = await request(app).post(`/api/teams/${teamId}/manifests/sync`);
      expect(res.status).toBe(200);
    });

    it('should deny non-members from triggering sync', async () => {
      currentUser = nonMemberUser;
      const res = await request(app).post(`/api/teams/${teamId}/manifests/sync`);
      expect(res.status).toBe(403);
    });
  });

  // ─── Config Sync Route ────────────────────────────────────────

  describe('POST /api/teams/:id/manifests/:configId/sync', () => {
    it('should return 404 when config does not exist', async () => {
      const res = await request(app).post(`/api/teams/${teamId}/manifests/nonexistent/sync`);
      expect(res.status).toBe(404);
    });

    it('should return 400 when config is disabled', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, name, manifest_url, is_enabled, created_at, updated_at)
        VALUES ('cfg-dis-cs', 'team-1', 'Default', 'https://example.com/manifest.json', 0, datetime('now'), datetime('now'))
      `).run();

      const res = await request(app).post(`/api/teams/${teamId}/manifests/cfg-dis-cs/sync`);
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('disabled');
    });

    it('should return 409 when config sync is already in progress', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, name, manifest_url, is_enabled, created_at, updated_at)
        VALUES ('cfg-ip-cs', 'team-1', 'Default', 'https://example.com/manifest.json', 1, datetime('now'), datetime('now'))
      `).run();
      mockIsSyncingConfig.mockReturnValue(true);
      mockCanManualSync.mockReturnValue({ allowed: true });

      const res = await request(app).post(`/api/teams/${teamId}/manifests/cfg-ip-cs/sync`);
      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already in progress');
    });

    it('should return 429 when cooldown has not elapsed', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, name, manifest_url, is_enabled, created_at, updated_at)
        VALUES ('cfg-cd-cs', 'team-1', 'Default', 'https://example.com/manifest.json', 1, datetime('now'), datetime('now'))
      `).run();
      mockIsSyncingConfig.mockReturnValue(false);
      mockCanManualSync.mockReturnValue({ allowed: false, retryAfterMs: 45000 });

      const res = await request(app).post(`/api/teams/${teamId}/manifests/cfg-cd-cs/sync`);
      expect(res.status).toBe(429);
      expect(res.body.error).toContain('wait');
      expect(res.body.retry_after_ms).toBe(45000);
      expect(res.headers['retry-after']).toBe('45');
    });

    it('should trigger config sync successfully', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, name, manifest_url, is_enabled, created_at, updated_at)
        VALUES ('cfg-sync-cs', 'team-1', 'Default', 'https://example.com/manifest.json', 1, datetime('now'), datetime('now'))
      `).run();
      mockIsSyncingConfig.mockReturnValue(false);
      mockCanManualSync.mockReturnValue({ allowed: true });
      mockSyncManifest.mockResolvedValue({
        status: 'success',
        summary: { services: { created: 2, updated: 0, deactivated: 0, deleted: 0, drift_flagged: 0, unchanged: 0 } },
        errors: [],
        warnings: [],
        changes: [],
        duration_ms: 150,
      });

      const res = await request(app).post(`/api/teams/${teamId}/manifests/cfg-sync-cs/sync`);
      expect(res.status).toBe(200);
      expect(res.body.result.status).toBe('success');
      expect(res.body.result.summary.services.created).toBe(2);
      expect(mockSyncManifest).toHaveBeenCalledWith('cfg-sync-cs', 'manual', adminUser.id);
    });
  });

  // ─── Config Sync History ──────────────────────────────────────

  describe('GET /api/teams/:id/manifests/:configId/sync-history', () => {
    it('should return 404 when config does not exist', async () => {
      const res = await request(app).get(`/api/teams/${teamId}/manifests/nonexistent/sync-history`);
      expect(res.status).toBe(404);
    });

    it('should return empty when no history exists', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, name, manifest_url, created_at, updated_at)
        VALUES ('cfg-hist', 'team-1', 'Default', 'https://example.com/manifest.json', datetime('now'), datetime('now'))
      `).run();

      const res = await request(app).get(`/api/teams/${teamId}/manifests/cfg-hist/sync-history`);
      expect(res.status).toBe(200);
      expect(res.body.history).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('should return sync history entries for config', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, name, manifest_url, created_at, updated_at)
        VALUES ('cfg-hist2', 'team-1', 'Default', 'https://example.com/manifest.json', datetime('now'), datetime('now'))
      `).run();
      testDb.prepare(`
        INSERT INTO manifest_sync_history (id, team_id, manifest_config_id, trigger_type, triggered_by, manifest_url, status, duration_ms, created_at)
        VALUES ('sh-1', 'team-1', 'cfg-hist2', 'manual', 'admin-1', 'https://example.com/manifest.json', 'success', 150, '2024-01-15T10:00:00.000Z')
      `).run();
      testDb.prepare(`
        INSERT INTO manifest_sync_history (id, team_id, manifest_config_id, trigger_type, manifest_url, status, duration_ms, created_at)
        VALUES ('sh-2', 'team-1', 'cfg-hist2', 'scheduled', 'https://example.com/manifest.json', 'failed', 200, '2024-01-15T11:00:00.000Z')
      `).run();

      const res = await request(app).get(`/api/teams/${teamId}/manifests/cfg-hist2/sync-history`);
      expect(res.status).toBe(200);
      expect(res.body.history).toHaveLength(2);
      expect(res.body.total).toBe(2);
    });

    it('should respect limit and offset', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, name, manifest_url, created_at, updated_at)
        VALUES ('cfg-hist3', 'team-1', 'Default', 'https://example.com/manifest.json', datetime('now'), datetime('now'))
      `).run();

      for (let i = 0; i < 5; i++) {
        testDb.prepare(`
          INSERT INTO manifest_sync_history (id, team_id, manifest_config_id, trigger_type, manifest_url, status, created_at)
          VALUES ('sh-p${i}', 'team-1', 'cfg-hist3', 'scheduled', 'https://example.com/manifest.json', 'success', '2024-01-15T${10 + i}:00:00.000Z')
        `).run();
      }

      const res = await request(app).get(`/api/teams/${teamId}/manifests/cfg-hist3/sync-history?limit=2&offset=1`);
      expect(res.status).toBe(200);
      expect(res.body.history).toHaveLength(2);
      expect(res.body.total).toBe(5);
    });

    it('should allow team members to view history', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, name, manifest_url, created_at, updated_at)
        VALUES ('cfg-hist-mem', 'team-1', 'Default', 'https://example.com/manifest.json', datetime('now'), datetime('now'))
      `).run();

      currentUser = memberUser;
      const res = await request(app).get(`/api/teams/${teamId}/manifests/cfg-hist-mem/sync-history`);
      expect(res.status).toBe(200);
    });

    it('should deny non-members access', async () => {
      currentUser = nonMemberUser;
      const res = await request(app).get(`/api/teams/${teamId}/manifests/cfg-hist/sync-history`);
      expect(res.status).toBe(403);
    });
  });

  // ─── Validation Route ─────────────────────────────────────────

  describe('POST /api/manifest/validate', () => {
    it('should validate manifest JSON and return result', async () => {
      mockValidateManifest.mockReturnValue({
        valid: true,
        version: 1,
        service_count: 2,
        valid_count: 2,
        errors: [],
        warnings: [],
      });

      const res = await request(app)
        .post('/api/manifest/validate')
        .send({ version: 1, services: [{ key: 'svc-a', name: 'A', health_endpoint: 'https://a.com/health' }] });

      expect(res.status).toBe(200);
      expect(res.body.result.valid).toBe(true);
      expect(res.body.result.version).toBe(1);
      expect(mockValidateManifest).toHaveBeenCalled();
    });

    it('should return validation errors for invalid manifest', async () => {
      mockValidateManifest.mockReturnValue({
        valid: false,
        version: null,
        service_count: 0,
        valid_count: 0,
        errors: [{ severity: 'error', path: 'version', message: 'Missing required field: version' }],
        warnings: [],
      });

      const res = await request(app)
        .post('/api/manifest/validate')
        .send({ services: [] });

      expect(res.status).toBe(200);
      expect(res.body.result.valid).toBe(false);
      expect(res.body.result.errors).toHaveLength(1);
    });

    it('should return warnings', async () => {
      mockValidateManifest.mockReturnValue({
        valid: true,
        version: 1,
        service_count: 1,
        valid_count: 1,
        errors: [],
        warnings: [{ severity: 'warning', path: 'services[0].extra', message: 'Unknown field: extra' }],
      });

      const res = await request(app)
        .post('/api/manifest/validate')
        .send({ version: 1, services: [{ key: 'svc', name: 'S', health_endpoint: 'https://s.com/h', extra: true }] });

      expect(res.status).toBe(200);
      expect(res.body.result.valid).toBe(true);
      expect(res.body.result.warnings).toHaveLength(1);
    });
  });

  // ─── Test URL Route ───────────────────────────────────────────

  describe('POST /api/manifest/test-url', () => {
    it('should reject missing url', async () => {
      const res = await request(app)
        .post('/api/manifest/test-url')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should reject empty url', async () => {
      const res = await request(app)
        .post('/api/manifest/test-url')
        .send({ url: '   ' });

      expect(res.status).toBe(400);
    });

    it('should reject invalid url format', async () => {
      const res = await request(app)
        .post('/api/manifest/test-url')
        .send({ url: 'not-a-url' });

      expect(res.status).toBe(400);
    });

    it('should reject SSRF-blocked urls', async () => {
      const res = await request(app)
        .post('/api/manifest/test-url')
        .send({ url: 'https://localhost/manifest.json' });

      expect(res.status).toBe(400);
    });

    it('should return fetch error when fetch fails', async () => {
      mockFetchManifest.mockResolvedValue({
        success: false,
        error: 'HTTP 404: Not Found',
        url: 'https://example.com/manifest.json',
      });

      const res = await request(app)
        .post('/api/manifest/test-url')
        .send({ url: 'https://example.com/manifest.json' });

      expect(res.status).toBe(200);
      expect(res.body.result.fetch_success).toBe(false);
      expect(res.body.result.fetch_error).toBe('HTTP 404: Not Found');
      expect(res.body.result.validation).toBeNull();
      expect(mockFetchManifest).toHaveBeenCalledWith('https://example.com/manifest.json');
    });

    it('should return validation result when fetch succeeds', async () => {
      const manifestData = { version: 1, services: [{ key: 'svc', name: 'Svc', health_endpoint: 'https://svc.com/h' }] };
      mockFetchManifest.mockResolvedValue({
        success: true,
        data: manifestData,
        url: 'https://example.com/manifest.json',
      });
      mockValidateManifest.mockReturnValue({
        valid: true,
        version: 1,
        service_count: 1,
        valid_count: 1,
        errors: [],
        warnings: [],
      });

      const res = await request(app)
        .post('/api/manifest/test-url')
        .send({ url: 'https://example.com/manifest.json' });

      expect(res.status).toBe(200);
      expect(res.body.result.fetch_success).toBe(true);
      expect(res.body.result.fetch_error).toBeNull();
      expect(res.body.result.validation.valid).toBe(true);
      expect(res.body.result.validation.service_count).toBe(1);
      expect(mockFetchManifest).toHaveBeenCalledWith('https://example.com/manifest.json');
      expect(mockValidateManifest).toHaveBeenCalledWith(manifestData);
    });

    it('should return validation errors for invalid manifest content', async () => {
      mockFetchManifest.mockResolvedValue({
        success: true,
        data: { not_a_manifest: true },
        url: 'https://example.com/bad.json',
      });
      mockValidateManifest.mockReturnValue({
        valid: false,
        version: null,
        service_count: 0,
        valid_count: 0,
        errors: [{ severity: 'error', path: 'version', message: 'Missing required field: version' }],
        warnings: [],
      });

      const res = await request(app)
        .post('/api/manifest/test-url')
        .send({ url: 'https://example.com/bad.json' });

      expect(res.status).toBe(200);
      expect(res.body.result.fetch_success).toBe(true);
      expect(res.body.result.validation.valid).toBe(false);
      expect(res.body.result.validation.errors).toHaveLength(1);
      expect(res.body.result.validation.errors[0].path).toBe('version');
    });

    it('should trim whitespace from url', async () => {
      mockFetchManifest.mockResolvedValue({
        success: true,
        data: { version: 1, services: [] },
        url: 'https://example.com/manifest.json',
      });
      mockValidateManifest.mockReturnValue({
        valid: true,
        version: 1,
        service_count: 0,
        valid_count: 0,
        errors: [],
        warnings: [],
      });

      const res = await request(app)
        .post('/api/manifest/test-url')
        .send({ url: '  https://example.com/manifest.json  ' });

      expect(res.status).toBe(200);
      expect(mockFetchManifest).toHaveBeenCalledWith('https://example.com/manifest.json');
    });
  });
});
