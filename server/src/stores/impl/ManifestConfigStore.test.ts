import Database from 'better-sqlite3';
import { ManifestConfigStore } from './ManifestConfigStore';
import { DEFAULT_SYNC_POLICY } from '../../services/manifest/types';

describe('ManifestConfigStore', () => {
  let db: Database.Database;
  let store: ManifestConfigStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE team_manifest_config (
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
      );

      INSERT INTO teams (id, name) VALUES ('team-1', 'Alpha');
      INSERT INTO teams (id, name) VALUES ('team-2', 'Beta');
      INSERT INTO teams (id, name) VALUES ('team-3', 'Gamma');
    `);
    store = new ManifestConfigStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should create a manifest config with required fields', () => {
      const config = store.create({
        team_id: 'team-1',
        manifest_url: 'https://example.com/manifest.json',
      });

      expect(config.id).toBeDefined();
      expect(config.team_id).toBe('team-1');
      expect(config.manifest_url).toBe('https://example.com/manifest.json');
      expect(config.is_enabled).toBe(1);
      expect(config.sync_policy).toBeNull();
      expect(config.last_sync_at).toBeNull();
      expect(config.last_sync_status).toBeNull();
      expect(config.created_at).toBeDefined();
      expect(config.updated_at).toBeDefined();
    });

    it('should create a config with is_enabled = false', () => {
      const config = store.create({
        team_id: 'team-1',
        manifest_url: 'https://example.com/manifest.json',
        is_enabled: false,
      });

      expect(config.is_enabled).toBe(0);
    });

    it('should create a config with sync_policy', () => {
      const policy = { ...DEFAULT_SYNC_POLICY, on_field_drift: 'manifest_wins' as const };
      const config = store.create({
        team_id: 'team-1',
        manifest_url: 'https://example.com/manifest.json',
        sync_policy: policy,
      });

      expect(config.sync_policy).toBeDefined();
      expect(JSON.parse(config.sync_policy!)).toEqual(policy);
    });

    it('should upsert on duplicate team_id', () => {
      store.create({
        team_id: 'team-1',
        manifest_url: 'https://example.com/old.json',
      });

      const updated = store.create({
        team_id: 'team-1',
        manifest_url: 'https://example.com/new.json',
      });

      expect(updated.manifest_url).toBe('https://example.com/new.json');
      // Should only be one row for team-1
      const all = db
        .prepare('SELECT COUNT(*) as count FROM team_manifest_config WHERE team_id = ?')
        .get('team-1') as { count: number };
      expect(all.count).toBe(1);
    });
  });

  describe('findByTeamId', () => {
    it('should find config by team id', () => {
      store.create({
        team_id: 'team-1',
        manifest_url: 'https://example.com/manifest.json',
      });

      const found = store.findByTeamId('team-1');
      expect(found).toBeDefined();
      expect(found!.team_id).toBe('team-1');
    });

    it('should return undefined for nonexistent team', () => {
      expect(store.findByTeamId('nonexistent')).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should update manifest_url', () => {
      store.create({
        team_id: 'team-1',
        manifest_url: 'https://example.com/old.json',
      });

      const updated = store.update('team-1', {
        manifest_url: 'https://example.com/new.json',
      });

      expect(updated).toBeDefined();
      expect(updated!.manifest_url).toBe('https://example.com/new.json');
    });

    it('should update is_enabled', () => {
      store.create({
        team_id: 'team-1',
        manifest_url: 'https://example.com/manifest.json',
      });

      const updated = store.update('team-1', { is_enabled: false });
      expect(updated).toBeDefined();
      expect(updated!.is_enabled).toBe(0);
    });

    it('should merge sync_policy with existing', () => {
      store.create({
        team_id: 'team-1',
        manifest_url: 'https://example.com/manifest.json',
        sync_policy: DEFAULT_SYNC_POLICY,
      });

      const updated = store.update('team-1', {
        sync_policy: { on_field_drift: 'manifest_wins' },
      });

      expect(updated).toBeDefined();
      const policy = JSON.parse(updated!.sync_policy!);
      expect(policy.on_field_drift).toBe('manifest_wins');
      // Other fields should be preserved
      expect(policy.on_removal).toBe('flag');
      expect(policy.on_alias_removal).toBe('keep');
    });

    it('should merge sync_policy with default when no existing policy', () => {
      store.create({
        team_id: 'team-1',
        manifest_url: 'https://example.com/manifest.json',
      });

      const updated = store.update('team-1', {
        sync_policy: { on_removal: 'deactivate' },
      });

      expect(updated).toBeDefined();
      const policy = JSON.parse(updated!.sync_policy!);
      expect(policy.on_removal).toBe('deactivate');
      expect(policy.on_field_drift).toBe('flag');
    });

    it('should return undefined for nonexistent team', () => {
      expect(
        store.update('nonexistent', { manifest_url: 'https://example.com' })
      ).toBeUndefined();
    });

    it('should return existing when no fields to update', () => {
      store.create({
        team_id: 'team-1',
        manifest_url: 'https://example.com/manifest.json',
      });

      const result = store.update('team-1', {});
      expect(result).toBeDefined();
      expect(result!.team_id).toBe('team-1');
    });

    it('should update updated_at timestamp', () => {
      const created = store.create({
        team_id: 'team-1',
        manifest_url: 'https://example.com/manifest.json',
      });

      const updated = store.update('team-1', {
        manifest_url: 'https://example.com/new.json',
      });

      expect(updated!.updated_at).toBeDefined();
    });
  });

  describe('delete', () => {
    it('should delete a manifest config', () => {
      store.create({
        team_id: 'team-1',
        manifest_url: 'https://example.com/manifest.json',
      });

      const deleted = store.delete('team-1');
      expect(deleted).toBe(true);
      expect(store.findByTeamId('team-1')).toBeUndefined();
    });

    it('should return false for nonexistent team', () => {
      expect(store.delete('nonexistent')).toBe(false);
    });
  });

  describe('findAllEnabled', () => {
    it('should return only enabled configs', () => {
      store.create({
        team_id: 'team-1',
        manifest_url: 'https://example.com/a.json',
      });
      store.create({
        team_id: 'team-2',
        manifest_url: 'https://example.com/b.json',
        is_enabled: false,
      });
      store.create({
        team_id: 'team-3',
        manifest_url: 'https://example.com/c.json',
      });

      const enabled = store.findAllEnabled();
      expect(enabled).toHaveLength(2);
      expect(enabled.map((c) => c.team_id).sort()).toEqual(['team-1', 'team-3']);
    });

    it('should return empty array when none enabled', () => {
      store.create({
        team_id: 'team-1',
        manifest_url: 'https://example.com/a.json',
        is_enabled: false,
      });

      expect(store.findAllEnabled()).toHaveLength(0);
    });
  });

  describe('updateSyncResult', () => {
    it('should update sync result fields', () => {
      store.create({
        team_id: 'team-1',
        manifest_url: 'https://example.com/manifest.json',
      });

      const success = store.updateSyncResult('team-1', {
        last_sync_at: '2026-02-28T12:00:00.000Z',
        last_sync_status: 'success',
        last_sync_error: null,
        last_sync_summary: JSON.stringify({ services: { created: 2, updated: 0, deactivated: 0, deleted: 0, drift_flagged: 0, unchanged: 1 } }),
      });

      expect(success).toBe(true);

      const config = store.findByTeamId('team-1');
      expect(config!.last_sync_at).toBe('2026-02-28T12:00:00.000Z');
      expect(config!.last_sync_status).toBe('success');
      expect(config!.last_sync_error).toBeNull();
      expect(config!.last_sync_summary).toBeDefined();
    });

    it('should update sync result with error', () => {
      store.create({
        team_id: 'team-1',
        manifest_url: 'https://example.com/manifest.json',
      });

      store.updateSyncResult('team-1', {
        last_sync_at: '2026-02-28T12:00:00.000Z',
        last_sync_status: 'failed',
        last_sync_error: 'Failed to fetch manifest',
        last_sync_summary: null,
      });

      const config = store.findByTeamId('team-1');
      expect(config!.last_sync_status).toBe('failed');
      expect(config!.last_sync_error).toBe('Failed to fetch manifest');
    });

    it('should return false for nonexistent team', () => {
      expect(
        store.updateSyncResult('nonexistent', {
          last_sync_at: '2026-02-28T12:00:00.000Z',
          last_sync_status: 'success',
          last_sync_error: null,
          last_sync_summary: null,
        })
      ).toBe(false);
    });
  });
});
