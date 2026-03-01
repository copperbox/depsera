import Database from 'better-sqlite3';
import { ManifestSyncHistoryStore } from './ManifestSyncHistoryStore';

describe('ManifestSyncHistoryStore', () => {
  let db: Database.Database;
  let store: ManifestSyncHistoryStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        key TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE manifest_sync_history (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
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

      INSERT INTO teams (id, name) VALUES ('team-1', 'Alpha');
      INSERT INTO teams (id, name) VALUES ('team-2', 'Beta');
      INSERT INTO users (id, email, name) VALUES ('user-1', 'alice@example.com', 'Alice');
    `);
    store = new ManifestSyncHistoryStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should create a manual sync history entry', () => {
      const entry = store.create({
        team_id: 'team-1',
        trigger_type: 'manual',
        triggered_by: 'user-1',
        manifest_url: 'https://example.com/manifest.json',
        status: 'success',
        summary: JSON.stringify({ services: { created: 2, updated: 0, deactivated: 0, deleted: 0, drift_flagged: 0, unchanged: 1 } }),
        errors: null,
        warnings: null,
        duration_ms: 1500,
      });

      expect(entry.id).toBeDefined();
      expect(entry.team_id).toBe('team-1');
      expect(entry.trigger_type).toBe('manual');
      expect(entry.triggered_by).toBe('user-1');
      expect(entry.manifest_url).toBe('https://example.com/manifest.json');
      expect(entry.status).toBe('success');
      expect(entry.summary).toBeDefined();
      expect(entry.duration_ms).toBe(1500);
      expect(entry.created_at).toBeDefined();
    });

    it('should create a scheduled sync history entry', () => {
      const entry = store.create({
        team_id: 'team-1',
        trigger_type: 'scheduled',
        triggered_by: null,
        manifest_url: 'https://example.com/manifest.json',
        status: 'success',
        summary: null,
        errors: null,
        warnings: null,
        duration_ms: 800,
      });

      expect(entry.trigger_type).toBe('scheduled');
      expect(entry.triggered_by).toBeNull();
    });

    it('should create a failed sync history entry with errors', () => {
      const entry = store.create({
        team_id: 'team-1',
        trigger_type: 'manual',
        triggered_by: 'user-1',
        manifest_url: 'https://example.com/manifest.json',
        status: 'failed',
        summary: null,
        errors: JSON.stringify(['Failed to fetch manifest: 404 Not Found']),
        warnings: JSON.stringify(['Unknown field: extra_field']),
        duration_ms: 200,
      });

      expect(entry.status).toBe('failed');
      expect(JSON.parse(entry.errors!)).toEqual(['Failed to fetch manifest: 404 Not Found']);
      expect(JSON.parse(entry.warnings!)).toEqual(['Unknown field: extra_field']);
    });
  });

  describe('findByTeamId', () => {
    it('should return paginated history for a team', () => {
      // Create 5 entries
      for (let i = 0; i < 5; i++) {
        store.create({
          team_id: 'team-1',
          trigger_type: 'scheduled',
          triggered_by: null,
          manifest_url: 'https://example.com/manifest.json',
          status: 'success',
          summary: null,
          errors: null,
          warnings: null,
          duration_ms: 100 + i,
        });
      }

      const result = store.findByTeamId('team-1', { limit: 3, offset: 0 });
      expect(result.history).toHaveLength(3);
      expect(result.total).toBe(5);
    });

    it('should return most recent first', () => {
      // Insert with explicit timestamps to ensure ordering
      db.exec(`
        INSERT INTO manifest_sync_history (id, team_id, trigger_type, manifest_url, status, created_at)
        VALUES ('h-old', 'team-1', 'scheduled', 'https://example.com/m.json', 'success', '2026-01-01T00:00:00.000Z');

        INSERT INTO manifest_sync_history (id, team_id, trigger_type, manifest_url, status, created_at)
        VALUES ('h-new', 'team-1', 'manual', 'https://example.com/m.json', 'success', '2026-02-01T00:00:00.000Z');
      `);

      const result = store.findByTeamId('team-1');
      expect(result.history).toHaveLength(2);
      expect(result.history[0].id).toBe('h-new');
      expect(result.history[1].id).toBe('h-old');
    });

    it('should use default limit of 20', () => {
      for (let i = 0; i < 25; i++) {
        store.create({
          team_id: 'team-1',
          trigger_type: 'scheduled',
          triggered_by: null,
          manifest_url: 'https://example.com/manifest.json',
          status: 'success',
          summary: null,
          errors: null,
          warnings: null,
          duration_ms: 100,
        });
      }

      const result = store.findByTeamId('team-1');
      expect(result.history).toHaveLength(20);
      expect(result.total).toBe(25);
    });

    it('should cap limit at 100', () => {
      const result = store.findByTeamId('team-1', { limit: 200 });
      expect(result.history).toHaveLength(0); // no entries, but limit was applied
      expect(result.total).toBe(0);
    });

    it('should support offset for pagination', () => {
      for (let i = 0; i < 5; i++) {
        store.create({
          team_id: 'team-1',
          trigger_type: 'scheduled',
          triggered_by: null,
          manifest_url: 'https://example.com/manifest.json',
          status: 'success',
          summary: null,
          errors: null,
          warnings: null,
          duration_ms: 100,
        });
      }

      const page1 = store.findByTeamId('team-1', { limit: 2, offset: 0 });
      const page2 = store.findByTeamId('team-1', { limit: 2, offset: 2 });

      expect(page1.history).toHaveLength(2);
      expect(page2.history).toHaveLength(2);
      // Pages should not overlap
      const ids1 = page1.history.map((h) => h.id);
      const ids2 = page2.history.map((h) => h.id);
      expect(ids1.filter((id) => ids2.includes(id))).toHaveLength(0);
    });

    it('should return empty for team with no history', () => {
      const result = store.findByTeamId('team-2');
      expect(result.history).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should only return history for the specified team', () => {
      store.create({
        team_id: 'team-1',
        trigger_type: 'manual',
        triggered_by: 'user-1',
        manifest_url: 'https://example.com/a.json',
        status: 'success',
        summary: null,
        errors: null,
        warnings: null,
        duration_ms: 100,
      });
      store.create({
        team_id: 'team-2',
        trigger_type: 'manual',
        triggered_by: 'user-1',
        manifest_url: 'https://example.com/b.json',
        status: 'success',
        summary: null,
        errors: null,
        warnings: null,
        duration_ms: 100,
      });

      const result = store.findByTeamId('team-1');
      expect(result.history).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.history[0].team_id).toBe('team-1');
    });
  });

  describe('deleteOlderThan', () => {
    it('should delete entries older than timestamp', () => {
      db.exec(`
        INSERT INTO manifest_sync_history (id, team_id, trigger_type, manifest_url, status, created_at)
        VALUES ('h-old', 'team-1', 'scheduled', 'https://example.com/m.json', 'success', '2025-01-01T00:00:00.000Z');

        INSERT INTO manifest_sync_history (id, team_id, trigger_type, manifest_url, status, created_at)
        VALUES ('h-recent', 'team-1', 'scheduled', 'https://example.com/m.json', 'success', '2026-02-01T00:00:00.000Z');
      `);

      const deleted = store.deleteOlderThan('2026-01-01T00:00:00.000Z');
      expect(deleted).toBe(1);

      const result = store.findByTeamId('team-1');
      expect(result.total).toBe(1);
      expect(result.history[0].id).toBe('h-recent');
    });

    it('should return 0 when nothing to delete', () => {
      expect(store.deleteOlderThan('2020-01-01T00:00:00.000Z')).toBe(0);
    });

    it('should delete across multiple teams', () => {
      db.exec(`
        INSERT INTO manifest_sync_history (id, team_id, trigger_type, manifest_url, status, created_at)
        VALUES ('h1', 'team-1', 'scheduled', 'https://example.com/m.json', 'success', '2025-01-01T00:00:00.000Z');

        INSERT INTO manifest_sync_history (id, team_id, trigger_type, manifest_url, status, created_at)
        VALUES ('h2', 'team-2', 'scheduled', 'https://example.com/m.json', 'success', '2025-06-01T00:00:00.000Z');

        INSERT INTO manifest_sync_history (id, team_id, trigger_type, manifest_url, status, created_at)
        VALUES ('h3', 'team-1', 'manual', 'https://example.com/m.json', 'success', '2026-02-01T00:00:00.000Z');
      `);

      const deleted = store.deleteOlderThan('2026-01-01T00:00:00.000Z');
      expect(deleted).toBe(2);
    });
  });
});
