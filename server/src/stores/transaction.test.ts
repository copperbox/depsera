import Database from 'better-sqlite3';

const testDb = new Database(':memory:');

jest.mock('../db', () => ({
  db: testDb,
  default: testDb,
}));

import { withTransaction, withTransactionAsync } from './transaction';
import { StoreRegistry } from './index';

describe('transaction', () => {
  beforeAll(() => {
    testDb.exec(`
      CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE team_members (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (team_id, user_id)
      );

      CREATE TABLE services (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        team_id TEXT NOT NULL,
        health_endpoint TEXT NOT NULL,
        metrics_endpoint TEXT,
        poll_interval_ms INTEGER NOT NULL DEFAULT 30000,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_poll_success INTEGER,
        last_poll_error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
        last_checked TEXT,
        last_status_change TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (service_id, name)
      );

      CREATE TABLE dependency_associations (
        id TEXT PRIMARY KEY,
        dependency_id TEXT NOT NULL,
        linked_service_id TEXT NOT NULL,
        association_type TEXT DEFAULT 'api_call',
        is_auto_suggested INTEGER NOT NULL DEFAULT 0,
        confidence_score REAL,
        is_dismissed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (dependency_id, linked_service_id)
      );

      CREATE TABLE dependency_aliases (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        canonical_name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE dependency_latency_history (
        id TEXT PRIMARY KEY,
        dependency_id TEXT NOT NULL,
        latency_ms INTEGER NOT NULL,
        recorded_at TEXT NOT NULL
      );

      CREATE TABLE dependency_error_history (
        id TEXT PRIMARY KEY,
        dependency_id TEXT NOT NULL,
        error TEXT,
        error_message TEXT,
        recorded_at TEXT NOT NULL
      );

      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        oidc_subject TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        name TEXT,
        picture TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  });

  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    testDb.exec('DELETE FROM services');
    testDb.exec('DELETE FROM teams');
  });

  describe('withTransaction', () => {
    it('should execute function within transaction', () => {
      const result = withTransaction((stores) => {
        const team = stores.teams.create({ name: 'Test Team' });
        return team;
      });

      expect(result.name).toBe('Test Team');

      // Verify it's persisted
      const teams = testDb.prepare('SELECT * FROM teams').all();
      expect(teams).toHaveLength(1);
    });

    it('should rollback on error', () => {
      expect(() => {
        withTransaction((stores) => {
          stores.teams.create({ name: 'Will Rollback' });
          throw new Error('Deliberate error');
        });
      }).toThrow('Deliberate error');

      // Verify rollback
      const teams = testDb.prepare('SELECT * FROM teams').all();
      expect(teams).toHaveLength(0);
    });

    it('should return value from function', () => {
      const result = withTransaction(() => {
        return { value: 42 };
      });

      expect(result).toEqual({ value: 42 });
    });
  });

  describe('withTransactionAsync', () => {
    it('should execute function within transaction', async () => {
      const result = await withTransactionAsync((stores) => {
        const team = stores.teams.create({ name: 'Async Team' });
        return team;
      });

      expect(result.name).toBe('Async Team');
    });

    it('should rollback on error', async () => {
      await expect(
        withTransactionAsync((stores) => {
          stores.teams.create({ name: 'Will Rollback' });
          throw new Error('Deliberate error');
        })
      ).rejects.toThrow('Deliberate error');

      // Verify rollback
      const teams = testDb.prepare('SELECT * FROM teams').all();
      expect(teams).toHaveLength(0);
    });

    it('should return value from function', async () => {
      const result = await withTransactionAsync(() => {
        return { value: 'async result' };
      });

      expect(result).toEqual({ value: 'async result' });
    });
  });
});
