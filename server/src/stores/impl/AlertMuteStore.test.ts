import Database from 'better-sqlite3';
import { runMigrations } from '../../db/migrate';
import { AlertMuteStore } from './AlertMuteStore';

let db: Database.Database;
let store: AlertMuteStore;

beforeEach(() => {
  db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  store = new AlertMuteStore(db);

  // Seed team, user, service, dependency
  db.exec(`
    INSERT INTO teams (id, name, key) VALUES ('team-1', 'Team One', 'T1');
    INSERT INTO users (id, email, name, role, is_active) VALUES ('user-1', 'test@example.com', 'Test User', 'admin', 1);
    INSERT INTO services (id, name, team_id, health_endpoint, poll_interval_ms)
      VALUES ('svc-1', 'Service One', 'team-1', 'http://localhost/health', 30000);
    INSERT INTO dependencies (id, service_id, name, canonical_name)
      VALUES ('dep-1', 'svc-1', 'postgres-primary', 'postgresql');
    INSERT INTO dependencies (id, service_id, name, canonical_name)
      VALUES ('dep-2', 'svc-1', 'redis-cache', 'redis');
  `);
});

afterEach(() => {
  db.close();
});

describe('AlertMuteStore', () => {
  describe('create', () => {
    it('creates an instance mute', () => {
      const mute = store.create({
        team_id: 'team-1',
        dependency_id: 'dep-1',
        canonical_name: null,
        reason: 'Under maintenance',
        created_by: 'user-1',
        expires_at: null,
      });

      expect(mute.id).toBeDefined();
      expect(mute.team_id).toBe('team-1');
      expect(mute.dependency_id).toBe('dep-1');
      expect(mute.canonical_name).toBeNull();
      expect(mute.reason).toBe('Under maintenance');
    });

    it('creates a canonical mute', () => {
      const mute = store.create({
        team_id: 'team-1',
        dependency_id: null,
        canonical_name: 'redis',
        reason: null,
        created_by: 'user-1',
        expires_at: '2026-12-31T00:00:00Z',
      });

      expect(mute.canonical_name).toBe('redis');
      expect(mute.dependency_id).toBeNull();
      expect(mute.expires_at).toBe('2026-12-31T00:00:00Z');
    });

    it('enforces unique dependency_id constraint', () => {
      store.create({
        team_id: 'team-1',
        dependency_id: 'dep-1',
        canonical_name: null,
        reason: null,
        created_by: 'user-1',
        expires_at: null,
      });

      expect(() => store.create({
        team_id: 'team-1',
        dependency_id: 'dep-1',
        canonical_name: null,
        reason: null,
        created_by: 'user-1',
        expires_at: null,
      })).toThrow();
    });
  });

  describe('findById', () => {
    it('returns mute by id', () => {
      const created = store.create({
        team_id: 'team-1',
        dependency_id: 'dep-1',
        canonical_name: null,
        reason: null,
        created_by: 'user-1',
        expires_at: null,
      });

      const found = store.findById(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it('returns undefined for non-existent id', () => {
      expect(store.findById('nonexistent')).toBeUndefined();
    });
  });

  describe('findByTeamId', () => {
    it('returns mutes for team', () => {
      store.create({ team_id: 'team-1', dependency_id: 'dep-1', canonical_name: null, reason: null, created_by: 'user-1', expires_at: null });
      store.create({ team_id: 'team-1', dependency_id: null, canonical_name: 'redis', reason: null, created_by: 'user-1', expires_at: null });

      const mutes = store.findByTeamId('team-1');
      expect(mutes).toHaveLength(2);
    });

    it('respects limit and offset', () => {
      store.create({ team_id: 'team-1', dependency_id: 'dep-1', canonical_name: null, reason: null, created_by: 'user-1', expires_at: null });
      store.create({ team_id: 'team-1', dependency_id: null, canonical_name: 'redis', reason: null, created_by: 'user-1', expires_at: null });

      const mutes = store.findByTeamId('team-1', { limit: 1, offset: 0 });
      expect(mutes).toHaveLength(1);
    });
  });

  describe('isEffectivelyMuted', () => {
    it('returns true for active instance mute', () => {
      store.create({ team_id: 'team-1', dependency_id: 'dep-1', canonical_name: null, reason: null, created_by: 'user-1', expires_at: null });
      expect(store.isEffectivelyMuted('dep-1', 'team-1', 'postgresql')).toBe(true);
    });

    it('returns true for active canonical mute', () => {
      store.create({ team_id: 'team-1', dependency_id: null, canonical_name: 'redis', reason: null, created_by: 'user-1', expires_at: null });
      expect(store.isEffectivelyMuted('dep-2', 'team-1', 'redis')).toBe(true);
    });

    it('returns false for expired mute', () => {
      store.create({ team_id: 'team-1', dependency_id: 'dep-1', canonical_name: null, reason: null, created_by: 'user-1', expires_at: '2020-01-01T00:00:00Z' });
      expect(store.isEffectivelyMuted('dep-1', 'team-1')).toBe(false);
    });

    it('returns false when no mute exists', () => {
      expect(store.isEffectivelyMuted('dep-1', 'team-1')).toBe(false);
    });

    it('returns false for canonical mute without matching name', () => {
      store.create({ team_id: 'team-1', dependency_id: null, canonical_name: 'redis', reason: null, created_by: 'user-1', expires_at: null });
      expect(store.isEffectivelyMuted('dep-1', 'team-1', 'postgresql')).toBe(false);
    });
  });

  describe('delete', () => {
    it('deletes a mute', () => {
      const mute = store.create({ team_id: 'team-1', dependency_id: 'dep-1', canonical_name: null, reason: null, created_by: 'user-1', expires_at: null });
      expect(store.delete(mute.id)).toBe(true);
      expect(store.findById(mute.id)).toBeUndefined();
    });

    it('returns false for non-existent mute', () => {
      expect(store.delete('nonexistent')).toBe(false);
    });
  });

  describe('deleteExpired', () => {
    it('deletes expired mutes', () => {
      store.create({ team_id: 'team-1', dependency_id: 'dep-1', canonical_name: null, reason: null, created_by: 'user-1', expires_at: '2020-01-01T00:00:00Z' });
      store.create({ team_id: 'team-1', dependency_id: null, canonical_name: 'redis', reason: null, created_by: 'user-1', expires_at: null }); // No expiry

      const deleted = store.deleteExpired();
      expect(deleted).toBe(1);
      expect(store.findByTeamId('team-1')).toHaveLength(1);
    });
  });

  describe('countByTeamId', () => {
    it('returns count', () => {
      store.create({ team_id: 'team-1', dependency_id: 'dep-1', canonical_name: null, reason: null, created_by: 'user-1', expires_at: null });
      expect(store.countByTeamId('team-1')).toBe(1);
    });
  });

  describe('findAll', () => {
    it('returns all mutes', () => {
      store.create({ team_id: 'team-1', dependency_id: 'dep-1', canonical_name: null, reason: null, created_by: 'user-1', expires_at: null });
      const all = store.findAll();
      expect(all).toHaveLength(1);
    });

    it('filters by teamId', () => {
      store.create({ team_id: 'team-1', dependency_id: 'dep-1', canonical_name: null, reason: null, created_by: 'user-1', expires_at: null });
      expect(store.findAll({ teamId: 'team-1' })).toHaveLength(1);
      expect(store.findAll({ teamId: 'other-team' })).toHaveLength(0);
    });
  });
});
