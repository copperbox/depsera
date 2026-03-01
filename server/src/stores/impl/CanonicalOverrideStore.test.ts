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

      CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        key TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE dependency_canonical_overrides (
        id TEXT PRIMARY KEY,
        canonical_name TEXT NOT NULL,
        team_id TEXT,
        contact_override TEXT,
        impact_override TEXT,
        manifest_managed INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_by TEXT,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        FOREIGN KEY (updated_by) REFERENCES users(id)
      );

      CREATE UNIQUE INDEX idx_canonical_overrides_team_scoped
        ON dependency_canonical_overrides(team_id, canonical_name)
        WHERE team_id IS NOT NULL;

      CREATE UNIQUE INDEX idx_canonical_overrides_global
        ON dependency_canonical_overrides(canonical_name)
        WHERE team_id IS NULL;

      INSERT INTO users (id, email, name, role)
      VALUES ('user-1', 'admin@test.com', 'Admin User', 'admin');

      INSERT INTO users (id, email, name, role)
      VALUES ('user-2', 'lead@test.com', 'Lead User', 'user');

      INSERT INTO teams (id, name) VALUES ('team-1', 'Alpha Team');
      INSERT INTO teams (id, name) VALUES ('team-2', 'Beta Team');
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

    it('should filter by team_id when provided', () => {
      store.upsert({
        canonical_name: 'shared-db',
        impact_override: 'Global impact',
        updated_by: 'user-1',
      });
      store.upsert({
        canonical_name: 'shared-db',
        team_id: 'team-1',
        impact_override: 'Team 1 impact',
        updated_by: 'user-1',
      });
      store.upsert({
        canonical_name: 'shared-db',
        team_id: 'team-2',
        impact_override: 'Team 2 impact',
        updated_by: 'user-1',
      });

      const team1Overrides = store.findAll('team-1');
      expect(team1Overrides).toHaveLength(1);
      expect(team1Overrides[0].team_id).toBe('team-1');

      const allOverrides = store.findAll();
      expect(allOverrides).toHaveLength(3);
    });
  });

  describe('findByCanonicalName', () => {
    it('should return a global override by canonical name', () => {
      store.upsert({
        canonical_name: 'my-db',
        contact_override: '{"email":"dba@example.com"}',
        impact_override: 'Critical database dependency',
        updated_by: 'user-1',
      });

      const override = store.findByCanonicalName('my-db');
      expect(override).toBeDefined();
      expect(override!.canonical_name).toBe('my-db');
      expect(override!.team_id).toBeNull();
      expect(override!.contact_override).toBe('{"email":"dba@example.com"}');
      expect(override!.impact_override).toBe('Critical database dependency');
      expect(override!.updated_by).toBe('user-1');
    });

    it('should return undefined for nonexistent canonical name', () => {
      const override = store.findByCanonicalName('nonexistent');
      expect(override).toBeUndefined();
    });

    it('should NOT return team-scoped overrides', () => {
      store.upsert({
        canonical_name: 'my-db',
        team_id: 'team-1',
        impact_override: 'Team-scoped only',
        updated_by: 'user-1',
      });

      const override = store.findByCanonicalName('my-db');
      expect(override).toBeUndefined();
    });
  });

  describe('findByTeamAndCanonicalName', () => {
    it('should return a team-scoped override', () => {
      store.upsert({
        canonical_name: 'redis',
        team_id: 'team-1',
        impact_override: 'Team 1 redis impact',
        updated_by: 'user-1',
      });

      const override = store.findByTeamAndCanonicalName('team-1', 'redis');
      expect(override).toBeDefined();
      expect(override!.team_id).toBe('team-1');
      expect(override!.impact_override).toBe('Team 1 redis impact');
    });

    it('should return undefined when no team-scoped override exists', () => {
      store.upsert({
        canonical_name: 'redis',
        impact_override: 'Global redis impact',
        updated_by: 'user-1',
      });

      const override = store.findByTeamAndCanonicalName('team-1', 'redis');
      expect(override).toBeUndefined();
    });

    it('should not return overrides from other teams', () => {
      store.upsert({
        canonical_name: 'redis',
        team_id: 'team-2',
        impact_override: 'Team 2 only',
        updated_by: 'user-1',
      });

      const override = store.findByTeamAndCanonicalName('team-1', 'redis');
      expect(override).toBeUndefined();
    });
  });

  describe('findForHierarchy', () => {
    it('should return team-scoped override when both exist', () => {
      store.upsert({
        canonical_name: 'postgres',
        impact_override: 'Global impact',
        updated_by: 'user-1',
      });
      store.upsert({
        canonical_name: 'postgres',
        team_id: 'team-1',
        impact_override: 'Team 1 impact',
        updated_by: 'user-1',
      });

      const override = store.findForHierarchy('postgres', 'team-1');
      expect(override).toBeDefined();
      expect(override!.team_id).toBe('team-1');
      expect(override!.impact_override).toBe('Team 1 impact');
    });

    it('should fall back to global when no team-scoped override exists', () => {
      store.upsert({
        canonical_name: 'postgres',
        impact_override: 'Global impact',
        updated_by: 'user-1',
      });

      const override = store.findForHierarchy('postgres', 'team-1');
      expect(override).toBeDefined();
      expect(override!.team_id).toBeNull();
      expect(override!.impact_override).toBe('Global impact');
    });

    it('should return global override when no teamId provided', () => {
      store.upsert({
        canonical_name: 'postgres',
        impact_override: 'Global impact',
        updated_by: 'user-1',
      });
      store.upsert({
        canonical_name: 'postgres',
        team_id: 'team-1',
        impact_override: 'Team 1 impact',
        updated_by: 'user-1',
      });

      const override = store.findForHierarchy('postgres');
      expect(override).toBeDefined();
      expect(override!.team_id).toBeNull();
    });

    it('should return undefined when nothing matches', () => {
      const override = store.findForHierarchy('nonexistent', 'team-1');
      expect(override).toBeUndefined();
    });
  });

  describe('upsert', () => {
    it('should insert a new global override', () => {
      const override = store.upsert({
        canonical_name: 'redis-cache',
        contact_override: '{"slack":"#cache-team"}',
        impact_override: 'Caching layer',
        updated_by: 'user-1',
      });

      expect(override.canonical_name).toBe('redis-cache');
      expect(override.team_id).toBeNull();
      expect(override.contact_override).toBe('{"slack":"#cache-team"}');
      expect(override.impact_override).toBe('Caching layer');
      expect(override.manifest_managed).toBe(0);
      expect(override.updated_by).toBe('user-1');
      expect(override.id).toBeDefined();
    });

    it('should insert a new team-scoped override', () => {
      const override = store.upsert({
        canonical_name: 'redis-cache',
        team_id: 'team-1',
        impact_override: 'Team 1 caching',
        updated_by: 'user-1',
      });

      expect(override.canonical_name).toBe('redis-cache');
      expect(override.team_id).toBe('team-1');
      expect(override.impact_override).toBe('Team 1 caching');
    });

    it('should update an existing global override on conflict', () => {
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

      // Should still only be one global row
      const all = store.findAll();
      expect(all).toHaveLength(1);
    });

    it('should update an existing team-scoped override on conflict', () => {
      store.upsert({
        canonical_name: 'redis-cache',
        team_id: 'team-1',
        impact_override: 'Old team impact',
        updated_by: 'user-1',
      });

      const updated = store.upsert({
        canonical_name: 'redis-cache',
        team_id: 'team-1',
        impact_override: 'New team impact',
        updated_by: 'user-2',
      });

      expect(updated.impact_override).toBe('New team impact');
      expect(updated.updated_by).toBe('user-2');

      const team1Overrides = store.findAll('team-1');
      expect(team1Overrides).toHaveLength(1);
    });

    it('should allow same canonical_name for different teams and global', () => {
      store.upsert({
        canonical_name: 'postgres',
        impact_override: 'Global',
        updated_by: 'user-1',
      });
      store.upsert({
        canonical_name: 'postgres',
        team_id: 'team-1',
        impact_override: 'Team 1',
        updated_by: 'user-1',
      });
      store.upsert({
        canonical_name: 'postgres',
        team_id: 'team-2',
        impact_override: 'Team 2',
        updated_by: 'user-1',
      });

      const all = store.findAll();
      expect(all).toHaveLength(3);
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

    it('should set manifest_managed when provided', () => {
      const override = store.upsert({
        canonical_name: 'manifest-dep',
        team_id: 'team-1',
        impact_override: 'Managed',
        manifest_managed: 1,
        updated_by: 'user-1',
      });

      expect(override.manifest_managed).toBe(1);
    });
  });

  describe('delete', () => {
    it('should delete a global override', () => {
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

    it('should not delete team-scoped overrides', () => {
      store.upsert({
        canonical_name: 'shared',
        impact_override: 'Global',
        updated_by: 'user-1',
      });
      store.upsert({
        canonical_name: 'shared',
        team_id: 'team-1',
        impact_override: 'Team 1',
        updated_by: 'user-1',
      });

      store.delete('shared');

      // Team-scoped override should still exist
      const teamOverride = store.findByTeamAndCanonicalName('team-1', 'shared');
      expect(teamOverride).toBeDefined();
      expect(teamOverride!.impact_override).toBe('Team 1');
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

  describe('deleteByTeam', () => {
    it('should delete a team-scoped override', () => {
      store.upsert({
        canonical_name: 'redis',
        team_id: 'team-1',
        impact_override: 'Team 1 redis',
        updated_by: 'user-1',
      });

      const deleted = store.deleteByTeam('redis', 'team-1');
      expect(deleted).toBe(true);

      const override = store.findByTeamAndCanonicalName('team-1', 'redis');
      expect(override).toBeUndefined();
    });

    it('should not delete global override', () => {
      store.upsert({
        canonical_name: 'redis',
        impact_override: 'Global redis',
        updated_by: 'user-1',
      });
      store.upsert({
        canonical_name: 'redis',
        team_id: 'team-1',
        impact_override: 'Team 1 redis',
        updated_by: 'user-1',
      });

      store.deleteByTeam('redis', 'team-1');

      const globalOverride = store.findByCanonicalName('redis');
      expect(globalOverride).toBeDefined();
      expect(globalOverride!.impact_override).toBe('Global redis');
    });

    it('should not delete other teams overrides', () => {
      store.upsert({
        canonical_name: 'redis',
        team_id: 'team-1',
        impact_override: 'Team 1 redis',
        updated_by: 'user-1',
      });
      store.upsert({
        canonical_name: 'redis',
        team_id: 'team-2',
        impact_override: 'Team 2 redis',
        updated_by: 'user-1',
      });

      store.deleteByTeam('redis', 'team-1');

      const team2Override = store.findByTeamAndCanonicalName('team-2', 'redis');
      expect(team2Override).toBeDefined();
    });

    it('should return false for nonexistent team override', () => {
      const deleted = store.deleteByTeam('nonexistent', 'team-1');
      expect(deleted).toBe(false);
    });
  });
});
