import request from 'supertest';
import express from 'express';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

// Create in-memory database for testing
const testDb = new Database(':memory:');

jest.mock('../../db', () => ({
  db: testDb,
  default: testDb,
}));

jest.mock('../../auth', () => ({
  requireAuth: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
  requireAdmin: jest.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

jest.mock('../../services/manifest/ManifestSyncService', () => ({
  ManifestSyncService: {
    getInstance: jest.fn(() => mockSyncService),
  },
}));

const mockSyncService = {
  isSyncing: jest.fn().mockReturnValue(false),
  syncTeam: jest.fn().mockResolvedValue({ status: 'success' }),
};

import adminRouter from './index';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

describe('Admin Manifests API', () => {
  let teamId: string;
  let team2Id: string;

  beforeAll(() => {
    testDb.pragma('foreign_keys = ON');

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        key TEXT,
        description TEXT,
        contact TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS team_manifest_config (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL UNIQUE,
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
      )
    `);

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS services (
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
        manifest_key TEXT,
        manifest_managed INTEGER NOT NULL DEFAULT 0,
        manifest_last_synced_values TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id)
      )
    `);

    testDb.exec(`
      CREATE TABLE IF NOT EXISTS drift_flags (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        service_id TEXT NOT NULL,
        drift_type TEXT NOT NULL,
        field_name TEXT,
        manifest_value TEXT,
        current_value TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        first_detected_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_detected_at TEXT NOT NULL DEFAULT (datetime('now')),
        resolved_at TEXT,
        resolved_by TEXT,
        sync_history_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id),
        FOREIGN KEY (service_id) REFERENCES services(id)
      )
    `);
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM drift_flags');
    testDb.exec('DELETE FROM team_manifest_config');
    testDb.exec('DELETE FROM services');
    testDb.exec('DELETE FROM teams');

    teamId = randomUUID();
    team2Id = randomUUID();

    testDb.prepare(`INSERT INTO teams (id, name, key, contact) VALUES (?, ?, ?, ?)`)
      .run(teamId, 'Alpha Team', 'alpha-team', JSON.stringify({ email: 'alpha@example.com' }));

    testDb.prepare(`INSERT INTO teams (id, name, key) VALUES (?, ?, ?)`)
      .run(team2Id, 'Beta Team', 'beta-team');

    mockSyncService.isSyncing.mockReturnValue(false);
    mockSyncService.syncTeam.mockResolvedValue({ status: 'success' });
  });

  afterAll(() => {
    testDb.close();
  });

  describe('GET /api/admin/manifests', () => {
    it('should return all teams with manifest info', async () => {
      const response = await request(app).get('/api/admin/manifests');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);

      const alpha = response.body.find((e: { team_name: string }) => e.team_name === 'Alpha Team');
      expect(alpha).toBeDefined();
      expect(alpha.team_key).toBe('alpha-team');
      expect(alpha.has_config).toBe(false);
      expect(alpha.manifest_url).toBeNull();
      expect(alpha.is_enabled).toBe(false);
      expect(alpha.pending_drift_count).toBe(0);
      expect(alpha.contact).toBe(JSON.stringify({ email: 'alpha@example.com' }));
    });

    it('should include manifest config data when present', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, manifest_url, is_enabled, last_sync_status, last_sync_at)
        VALUES (?, ?, ?, 1, 'success', datetime('now'))
      `).run(randomUUID(), teamId, 'https://example.com/manifest.json');

      const response = await request(app).get('/api/admin/manifests');
      const alpha = response.body.find((e: { team_name: string }) => e.team_name === 'Alpha Team');

      expect(alpha.has_config).toBe(true);
      expect(alpha.manifest_url).toBe('https://example.com/manifest.json');
      expect(alpha.is_enabled).toBe(true);
      expect(alpha.last_sync_status).toBe('success');
    });

    it('should include pending drift count', async () => {
      const serviceId = randomUUID();
      testDb.prepare(`INSERT INTO services (id, name, team_id, health_endpoint) VALUES (?, ?, ?, ?)`)
        .run(serviceId, 'Test Service', teamId, 'https://example.com/health');

      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, manifest_url, is_enabled)
        VALUES (?, ?, ?, 1)
      `).run(randomUUID(), teamId, 'https://example.com/manifest.json');

      testDb.prepare(`
        INSERT INTO drift_flags (id, team_id, service_id, drift_type, status)
        VALUES (?, ?, ?, 'field_change', 'pending')
      `).run(randomUUID(), teamId, serviceId);

      testDb.prepare(`
        INSERT INTO drift_flags (id, team_id, service_id, drift_type, status)
        VALUES (?, ?, ?, 'field_change', 'pending')
      `).run(randomUUID(), teamId, serviceId);

      const response = await request(app).get('/api/admin/manifests');
      const alpha = response.body.find((e: { team_name: string }) => e.team_name === 'Alpha Team');

      expect(alpha.pending_drift_count).toBe(2);
    });
  });

  describe('POST /api/admin/manifests/sync-all', () => {
    it('should sync all enabled configs', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, manifest_url, is_enabled)
        VALUES (?, ?, ?, 1)
      `).run(randomUUID(), teamId, 'https://example.com/manifest.json');

      const response = await request(app)
        .post('/api/admin/manifests/sync-all')
        .send();

      expect(response.status).toBe(200);
      expect(response.body.results).toHaveLength(1);
      expect(response.body.results[0].status).toBe('success');
      expect(response.body.results[0].team_name).toBe('Alpha Team');
    });

    it('should skip teams already syncing', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, manifest_url, is_enabled)
        VALUES (?, ?, ?, 1)
      `).run(randomUUID(), teamId, 'https://example.com/manifest.json');

      mockSyncService.isSyncing.mockReturnValue(true);

      const response = await request(app)
        .post('/api/admin/manifests/sync-all')
        .send();

      expect(response.status).toBe(200);
      expect(response.body.results[0].status).toBe('skipped');
    });

    it('should handle sync failures gracefully', async () => {
      testDb.prepare(`
        INSERT INTO team_manifest_config (id, team_id, manifest_url, is_enabled)
        VALUES (?, ?, ?, 1)
      `).run(randomUUID(), teamId, 'https://example.com/manifest.json');

      mockSyncService.syncTeam.mockRejectedValue(new Error('Network error'));

      const response = await request(app)
        .post('/api/admin/manifests/sync-all')
        .send();

      expect(response.status).toBe(200);
      expect(response.body.results[0].status).toBe('failed');
      expect(response.body.results[0].error).toBe('Network error');
    });

    it('should return empty results when no enabled configs', async () => {
      const response = await request(app)
        .post('/api/admin/manifests/sync-all')
        .send();

      expect(response.status).toBe(200);
      expect(response.body.results).toHaveLength(0);
    });
  });
});
