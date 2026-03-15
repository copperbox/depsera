import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { TeamApiKeyStore } from './TeamApiKeyStore';

describe('TeamApiKeyStore', () => {
  let db: Database.Database;
  let store: TeamApiKeyStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE team_api_keys (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key_hash TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        last_used_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        created_by TEXT
      );
      CREATE UNIQUE INDEX idx_team_api_keys_key_hash ON team_api_keys(key_hash);
    `);
    store = new TeamApiKeyStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should return a record with rawKey', () => {
      const result = store.create({
        team_id: 'team-1',
        name: 'Test Key',
        created_by: 'user-1',
      });

      expect(result.id).toBeDefined();
      expect(result.rawKey).toBeDefined();
      expect(result.team_id).toBe('team-1');
      expect(result.name).toBe('Test Key');
      expect(result.created_by).toBe('user-1');
      expect(result.last_used_at).toBeNull();
    });

    it('should generate key with dps_ prefix and 32 hex chars', () => {
      const result = store.create({
        team_id: 'team-1',
        name: 'Test Key',
      });

      expect(result.rawKey).toMatch(/^dps_[0-9a-f]{32}$/);
    });

    it('should store SHA-256 hash of the raw key', () => {
      const result = store.create({
        team_id: 'team-1',
        name: 'Test Key',
      });

      const expectedHash = createHash('sha256')
        .update(result.rawKey)
        .digest('hex');
      expect(result.key_hash).toBe(expectedHash);
    });

    it('should store first 8 chars as key_prefix', () => {
      const result = store.create({
        team_id: 'team-1',
        name: 'Test Key',
      });

      expect(result.key_prefix).toBe(result.rawKey.slice(0, 8));
    });

    it('should set created_by to null when not provided', () => {
      const result = store.create({
        team_id: 'team-1',
        name: 'Test Key',
      });

      expect(result.created_by).toBeNull();
    });
  });

  describe('findByTeamId', () => {
    it('should return keys for the specified team', () => {
      store.create({ team_id: 'team-1', name: 'Key A' });
      store.create({ team_id: 'team-1', name: 'Key B' });
      store.create({ team_id: 'team-2', name: 'Key C' });

      const keys = store.findByTeamId('team-1');
      expect(keys).toHaveLength(2);
      expect(keys.every((k) => k.team_id === 'team-1')).toBe(true);
    });

    it('should return empty array when team has no keys', () => {
      const keys = store.findByTeamId('team-nonexistent');
      expect(keys).toEqual([]);
    });

    it('should order by created_at descending', () => {
      const first = store.create({ team_id: 'team-1', name: 'First' });
      // Manually set an older created_at so ordering is deterministic
      db.prepare(
        `UPDATE team_api_keys SET created_at = '2024-01-01T00:00:00' WHERE id = ?`,
      ).run(first.id);

      store.create({ team_id: 'team-1', name: 'Second' });

      const keys = store.findByTeamId('team-1');
      // Most recent first
      expect(keys[0].name).toBe('Second');
      expect(keys[1].name).toBe('First');
    });
  });

  describe('findByKeyHash', () => {
    it('should find key by its hash', () => {
      const created = store.create({
        team_id: 'team-1',
        name: 'Test Key',
      });

      const hash = createHash('sha256')
        .update(created.rawKey)
        .digest('hex');
      const found = store.findByKeyHash(hash);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it('should return undefined for non-existent hash', () => {
      const found = store.findByKeyHash('nonexistent-hash');
      expect(found).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should remove the key and return true', () => {
      const created = store.create({
        team_id: 'team-1',
        name: 'Test Key',
      });

      const result = store.delete(created.id);
      expect(result).toBe(true);

      const keys = store.findByTeamId('team-1');
      expect(keys).toHaveLength(0);
    });

    it('should return false when key does not exist', () => {
      const result = store.delete('nonexistent-id');
      expect(result).toBe(false);
    });
  });

  describe('updateLastUsed', () => {
    it('should update the last_used_at timestamp', () => {
      const created = store.create({
        team_id: 'team-1',
        name: 'Test Key',
      });

      expect(created.last_used_at).toBeNull();

      store.updateLastUsed(created.id);

      const hash = createHash('sha256')
        .update(created.rawKey)
        .digest('hex');
      const updated = store.findByKeyHash(hash);

      expect(updated!.last_used_at).not.toBeNull();
    });
  });
});
