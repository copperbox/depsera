import Database from 'better-sqlite3';
import { AuditLogStore } from './AuditLogStore';

describe('AuditLogStore', () => {
  let db: Database.Database;
  let store: AuditLogStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE audit_log (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        details TEXT,
        ip_address TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      INSERT INTO users (id, email, name, role)
      VALUES ('user-1', 'admin@test.com', 'Admin User', 'admin');
    `);
    store = new AuditLogStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should create an audit log entry', () => {
      const entry = store.create({
        user_id: 'user-1',
        action: 'user.role_changed',
        resource_type: 'user',
        resource_id: 'user-2',
        details: JSON.stringify({ previousRole: 'user', newRole: 'admin' }),
        ip_address: '127.0.0.1',
      });

      expect(entry.id).toBeDefined();
      expect(entry.user_id).toBe('user-1');
      expect(entry.action).toBe('user.role_changed');
      expect(entry.resource_type).toBe('user');
      expect(entry.resource_id).toBe('user-2');
      expect(entry.ip_address).toBe('127.0.0.1');
      expect(entry.created_at).toBeDefined();
    });

    it('should create entry with null optional fields', () => {
      const entry = store.create({
        user_id: 'user-1',
        action: 'team.created',
        resource_type: 'team',
        resource_id: null,
        details: null,
        ip_address: null,
      });

      expect(entry.resource_id).toBeNull();
      expect(entry.details).toBeNull();
      expect(entry.ip_address).toBeNull();
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      // Insert entries with explicit timestamps for ordering
      db.exec(`
        INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, details, ip_address, created_at)
        VALUES
          ('log-1', 'user-1', 'user.role_changed', 'user', 'user-2', '{"old":"user","new":"admin"}', '127.0.0.1', '2026-01-01T00:00:00Z'),
          ('log-2', 'user-1', 'team.created', 'team', 'team-1', '{"name":"Alpha"}', '127.0.0.1', '2026-01-02T00:00:00Z'),
          ('log-3', 'user-1', 'service.created', 'service', 'svc-1', '{"name":"API"}', '127.0.0.1', '2026-01-03T00:00:00Z')
      `);
    });

    it('should return all entries ordered by created_at DESC', () => {
      const entries = store.findAll();

      expect(entries).toHaveLength(3);
      expect(entries[0].id).toBe('log-3');
      expect(entries[1].id).toBe('log-2');
      expect(entries[2].id).toBe('log-1');
    });

    it('should include user email and name', () => {
      const entries = store.findAll();

      expect(entries[0].user_email).toBe('admin@test.com');
      expect(entries[0].user_name).toBe('Admin User');
    });

    it('should respect limit and offset', () => {
      const entries = store.findAll({ limit: 1, offset: 1 });

      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('log-2');
    });

    it('should filter by startDate', () => {
      const entries = store.findAll({ startDate: '2026-01-02T00:00:00Z' });

      expect(entries).toHaveLength(2);
    });

    it('should filter by endDate', () => {
      const entries = store.findAll({ endDate: '2026-01-01T23:59:59Z' });

      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('log-1');
    });

    it('should filter by action', () => {
      const entries = store.findAll({ action: 'team.created' });

      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('log-2');
    });

    it('should filter by resourceType', () => {
      const entries = store.findAll({ resourceType: 'service' });

      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('log-3');
    });

    it('should filter by userId', () => {
      const entries = store.findAll({ userId: 'user-1' });

      expect(entries).toHaveLength(3);
    });

    it('should return empty array for non-matching filters', () => {
      const entries = store.findAll({ userId: 'nonexistent' });

      expect(entries).toHaveLength(0);
    });
  });

  describe('count', () => {
    beforeEach(() => {
      db.exec(`
        INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, created_at)
        VALUES
          ('log-1', 'user-1', 'user.role_changed', 'user', 'user-2', '2026-01-01T00:00:00Z'),
          ('log-2', 'user-1', 'team.created', 'team', 'team-1', '2026-01-02T00:00:00Z'),
          ('log-3', 'user-1', 'service.created', 'service', 'svc-1', '2026-01-03T00:00:00Z')
      `);
    });

    it('should return total count', () => {
      expect(store.count()).toBe(3);
    });

    it('should count with filters', () => {
      expect(store.count({ resourceType: 'user' })).toBe(1);
    });
  });

  describe('deleteOlderThan', () => {
    it('should delete old entries', () => {
      db.exec(`
        INSERT INTO audit_log (id, user_id, action, resource_type, created_at)
        VALUES
          ('log-1', 'user-1', 'team.created', 'team', '2020-01-01T00:00:00Z'),
          ('log-2', 'user-1', 'team.created', 'team', '2026-01-01T00:00:00Z')
      `);

      const deleted = store.deleteOlderThan('2025-01-01T00:00:00Z');

      expect(deleted).toBe(1);
      expect(store.count()).toBe(1);
    });

    it('should return 0 when nothing to delete', () => {
      const deleted = store.deleteOlderThan('2020-01-01T00:00:00Z');
      expect(deleted).toBe(0);
    });
  });
});
