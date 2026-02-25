import Database from 'better-sqlite3';
import { CanonicalOverrideStore } from './CanonicalOverrideStore';

describe('CanonicalOverrideStore', () => {
  let db: Database.Database;
  let store: CanonicalOverrideStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE dependency_canonical_overrides (
        id TEXT PRIMARY KEY,
        canonical_name TEXT NOT NULL UNIQUE,
        contact_override TEXT,
        impact_override TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_by TEXT,
        FOREIGN KEY (updated_by) REFERENCES users(id)
      );

      INSERT INTO users (id, email, name, role)
      VALUES ('user-1', 'admin@test.com', 'Admin User', 'admin');

      INSERT INTO users (id, email, name, role)
      VALUES ('user-2', 'lead@test.com', 'Lead User', 'user');
    `);
    store = new CanonicalOverrideStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('findAll', () => {
    it('should return empty array when no overrides exist', () => {
      const overrides = store.findAll();
      expect(overrides).toHaveLength(0);
    });

    it('should return all overrides ordered by canonical_name', () => {
      store.upsert({
        canonical_name: 'z-service',
        contact_override: '{"team":"z"}',
        updated_by: 'user-1',
      });
      store.upsert({
        canonical_name: 'a-service',
        impact_override: 'High impact',
        updated_by: 'user-1',
      });

      const overrides = store.findAll();
      expect(overrides).toHaveLength(2);
      expect(overrides[0].canonical_name).toBe('a-service');
      expect(overrides[1].canonical_name).toBe('z-service');
    });
  });

  describe('findByCanonicalName', () => {
    it('should return an override by canonical name', () => {
      store.upsert({
        canonical_name: 'my-db',
        contact_override: '{"email":"dba@example.com"}',
        impact_override: 'Critical database dependency',
        updated_by: 'user-1',
      });

      const override = store.findByCanonicalName('my-db');
      expect(override).toBeDefined();
      expect(override!.canonical_name).toBe('my-db');
      expect(override!.contact_override).toBe('{"email":"dba@example.com"}');
      expect(override!.impact_override).toBe('Critical database dependency');
      expect(override!.updated_by).toBe('user-1');
      expect(override!.id).toBeDefined();
      expect(override!.created_at).toBeDefined();
      expect(override!.updated_at).toBeDefined();
    });

    it('should return undefined for nonexistent canonical name', () => {
      const override = store.findByCanonicalName('nonexistent');
      expect(override).toBeUndefined();
    });
  });

  describe('upsert', () => {
    it('should insert a new override', () => {
      const override = store.upsert({
        canonical_name: 'redis-cache',
        contact_override: '{"slack":"#cache-team"}',
        impact_override: 'Caching layer',
        updated_by: 'user-1',
      });

      expect(override.canonical_name).toBe('redis-cache');
      expect(override.contact_override).toBe('{"slack":"#cache-team"}');
      expect(override.impact_override).toBe('Caching layer');
      expect(override.updated_by).toBe('user-1');
      expect(override.id).toBeDefined();
    });

    it('should update an existing override on conflict', () => {
      store.upsert({
        canonical_name: 'redis-cache',
        contact_override: '{"slack":"#old-team"}',
        impact_override: 'Old impact',
        updated_by: 'user-1',
      });

      const updated = store.upsert({
        canonical_name: 'redis-cache',
        contact_override: '{"slack":"#new-team"}',
        impact_override: 'New impact',
        updated_by: 'user-2',
      });

      expect(updated.contact_override).toBe('{"slack":"#new-team"}');
      expect(updated.impact_override).toBe('New impact');
      expect(updated.updated_by).toBe('user-2');

      // Should still only be one row
      const all = store.findAll();
      expect(all).toHaveLength(1);
    });

    it('should preserve created_at on update', () => {
      const original = store.upsert({
        canonical_name: 'test-dep',
        contact_override: '{"v":1}',
        updated_by: 'user-1',
      });

      const updated = store.upsert({
        canonical_name: 'test-dep',
        contact_override: '{"v":2}',
        updated_by: 'user-2',
      });

      expect(updated.created_at).toBe(original.created_at);
    });

    it('should handle null contact_override', () => {
      const override = store.upsert({
        canonical_name: 'null-contact',
        contact_override: null,
        impact_override: 'Has impact only',
        updated_by: 'user-1',
      });

      expect(override.contact_override).toBeNull();
      expect(override.impact_override).toBe('Has impact only');
    });

    it('should handle null impact_override', () => {
      const override = store.upsert({
        canonical_name: 'null-impact',
        contact_override: '{"team":"ops"}',
        impact_override: null,
        updated_by: 'user-1',
      });

      expect(override.contact_override).toBe('{"team":"ops"}');
      expect(override.impact_override).toBeNull();
    });

    it('should handle both overrides omitted (default to null)', () => {
      const override = store.upsert({
        canonical_name: 'empty-overrides',
        updated_by: 'user-1',
      });

      expect(override.contact_override).toBeNull();
      expect(override.impact_override).toBeNull();
    });

    it('should allow clearing overrides by setting to null on update', () => {
      store.upsert({
        canonical_name: 'clearable',
        contact_override: '{"team":"ops"}',
        impact_override: 'Critical',
        updated_by: 'user-1',
      });

      const cleared = store.upsert({
        canonical_name: 'clearable',
        contact_override: null,
        impact_override: null,
        updated_by: 'user-1',
      });

      expect(cleared.contact_override).toBeNull();
      expect(cleared.impact_override).toBeNull();
    });
  });

  describe('delete', () => {
    it('should delete an existing override', () => {
      store.upsert({
        canonical_name: 'to-delete',
        impact_override: 'Will be deleted',
        updated_by: 'user-1',
      });

      const deleted = store.delete('to-delete');
      expect(deleted).toBe(true);

      const override = store.findByCanonicalName('to-delete');
      expect(override).toBeUndefined();
    });

    it('should return false for nonexistent canonical name', () => {
      const deleted = store.delete('nonexistent');
      expect(deleted).toBe(false);
    });

    it('should not affect other overrides', () => {
      store.upsert({
        canonical_name: 'keep-this',
        impact_override: 'Keep',
        updated_by: 'user-1',
      });
      store.upsert({
        canonical_name: 'delete-this',
        impact_override: 'Delete',
        updated_by: 'user-1',
      });

      store.delete('delete-this');

      const remaining = store.findAll();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].canonical_name).toBe('keep-this');
    });
  });
});
