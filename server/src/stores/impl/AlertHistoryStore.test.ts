import Database from 'better-sqlite3';
import { AlertHistoryStore } from './AlertHistoryStore';

describe('AlertHistoryStore', () => {
  let db: Database.Database;
  let store: AlertHistoryStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE services (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        team_id TEXT NOT NULL,
        health_endpoint TEXT NOT NULL,
        poll_interval_ms INTEGER NOT NULL DEFAULT 30000,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id)
      );

      CREATE TABLE dependencies (
        id TEXT PRIMARY KEY,
        service_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT DEFAULT 'other',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
      );

      CREATE TABLE alert_channels (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        channel_type TEXT NOT NULL CHECK (channel_type IN ('slack', 'webhook')),
        config TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      );

      CREATE TABLE alert_history (
        id TEXT PRIMARY KEY,
        alert_channel_id TEXT NOT NULL,
        service_id TEXT NOT NULL,
        dependency_id TEXT,
        event_type TEXT NOT NULL,
        payload TEXT,
        sent_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'suppressed')),
        FOREIGN KEY (alert_channel_id) REFERENCES alert_channels(id) ON DELETE CASCADE,
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
        FOREIGN KEY (dependency_id) REFERENCES dependencies(id) ON DELETE SET NULL
      );

      INSERT INTO teams (id, name) VALUES ('team-1', 'Alpha');
      INSERT INTO teams (id, name) VALUES ('team-2', 'Beta');
      INSERT INTO services (id, name, team_id, health_endpoint) VALUES ('svc-1', 'Service A', 'team-1', 'https://a.com/health');
      INSERT INTO services (id, name, team_id, health_endpoint) VALUES ('svc-2', 'Service B', 'team-2', 'https://b.com/health');
      INSERT INTO dependencies (id, service_id, name) VALUES ('dep-1', 'svc-1', 'postgres');
      INSERT INTO alert_channels (id, team_id, channel_type, config) VALUES ('ch-1', 'team-1', 'slack', '{}');
      INSERT INTO alert_channels (id, team_id, channel_type, config) VALUES ('ch-2', 'team-2', 'webhook', '{}');
    `);
    store = new AlertHistoryStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should create an alert history entry', () => {
      const entry = store.create({
        alert_channel_id: 'ch-1',
        service_id: 'svc-1',
        dependency_id: 'dep-1',
        event_type: 'status_change',
        payload: JSON.stringify({ oldStatus: 'healthy', newStatus: 'critical' }),
        sent_at: '2026-02-21T10:00:00Z',
        status: 'sent',
      });

      expect(entry.id).toBeDefined();
      expect(entry.alert_channel_id).toBe('ch-1');
      expect(entry.service_id).toBe('svc-1');
      expect(entry.dependency_id).toBe('dep-1');
      expect(entry.event_type).toBe('status_change');
      expect(entry.status).toBe('sent');
      expect(entry.sent_at).toBe('2026-02-21T10:00:00Z');
    });

    it('should create entry with null dependency_id', () => {
      const entry = store.create({
        alert_channel_id: 'ch-1',
        service_id: 'svc-1',
        dependency_id: null,
        event_type: 'poll_error',
        payload: null,
        sent_at: '2026-02-21T10:00:00Z',
        status: 'failed',
      });

      expect(entry.dependency_id).toBeNull();
      expect(entry.payload).toBeNull();
      expect(entry.status).toBe('failed');
    });

    it('should create entry with suppressed status', () => {
      const entry = store.create({
        alert_channel_id: 'ch-1',
        service_id: 'svc-1',
        dependency_id: null,
        event_type: 'status_change',
        payload: null,
        sent_at: '2026-02-21T10:00:00Z',
        status: 'suppressed',
      });

      expect(entry.status).toBe('suppressed');
    });
  });

  describe('findByChannelId', () => {
    beforeEach(() => {
      db.exec(`
        INSERT INTO alert_history (id, alert_channel_id, service_id, event_type, sent_at, status)
        VALUES
          ('ah-1', 'ch-1', 'svc-1', 'status_change', '2026-02-20T10:00:00Z', 'sent'),
          ('ah-2', 'ch-1', 'svc-1', 'poll_error', '2026-02-21T10:00:00Z', 'failed'),
          ('ah-3', 'ch-2', 'svc-2', 'status_change', '2026-02-21T11:00:00Z', 'sent')
      `);
    });

    it('should return entries for a specific channel', () => {
      const entries = store.findByChannelId('ch-1');
      expect(entries).toHaveLength(2);
    });

    it('should order by sent_at DESC', () => {
      const entries = store.findByChannelId('ch-1');
      expect(entries[0].id).toBe('ah-2');
      expect(entries[1].id).toBe('ah-1');
    });

    it('should respect limit and offset', () => {
      const entries = store.findByChannelId('ch-1', { limit: 1, offset: 0 });
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('ah-2');
    });

    it('should filter by status', () => {
      const entries = store.findByChannelId('ch-1', { status: 'sent' });
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('ah-1');
    });

    it('should return empty array for channel with no history', () => {
      const entries = store.findByChannelId('nonexistent');
      expect(entries).toHaveLength(0);
    });
  });

  describe('findByTeamId', () => {
    beforeEach(() => {
      db.exec(`
        INSERT INTO alert_history (id, alert_channel_id, service_id, event_type, sent_at, status)
        VALUES
          ('ah-1', 'ch-1', 'svc-1', 'status_change', '2026-02-20T10:00:00Z', 'sent'),
          ('ah-2', 'ch-1', 'svc-1', 'poll_error', '2026-02-21T10:00:00Z', 'failed'),
          ('ah-3', 'ch-2', 'svc-2', 'status_change', '2026-02-21T11:00:00Z', 'sent')
      `);
    });

    it('should return entries for a team via channel join', () => {
      const entries = store.findByTeamId('team-1');
      expect(entries).toHaveLength(2);
    });

    it('should order by sent_at DESC', () => {
      const entries = store.findByTeamId('team-1');
      expect(entries[0].id).toBe('ah-2');
      expect(entries[1].id).toBe('ah-1');
    });

    it('should filter by status', () => {
      const entries = store.findByTeamId('team-1', { status: 'sent' });
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('ah-1');
    });

    it('should filter by date range', () => {
      const entries = store.findByTeamId('team-1', {
        startDate: '2026-02-21T00:00:00Z',
        endDate: '2026-02-21T23:59:59Z',
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('ah-2');
    });

    it('should respect limit and offset', () => {
      const entries = store.findByTeamId('team-1', { limit: 1, offset: 1 });
      expect(entries).toHaveLength(1);
      expect(entries[0].id).toBe('ah-1');
    });

    it('should return empty for team with no history', () => {
      const entries = store.findByTeamId('nonexistent');
      expect(entries).toHaveLength(0);
    });
  });

  describe('count', () => {
    it('should return total count', () => {
      db.exec(`
        INSERT INTO alert_history (id, alert_channel_id, service_id, event_type, sent_at, status)
        VALUES
          ('ah-1', 'ch-1', 'svc-1', 'status_change', '2026-02-20T10:00:00Z', 'sent'),
          ('ah-2', 'ch-1', 'svc-1', 'poll_error', '2026-02-21T10:00:00Z', 'failed'),
          ('ah-3', 'ch-2', 'svc-2', 'status_change', '2026-02-21T11:00:00Z', 'sent')
      `);

      expect(store.count()).toBe(3);
    });

    it('should count with status filter', () => {
      db.exec(`
        INSERT INTO alert_history (id, alert_channel_id, service_id, event_type, sent_at, status)
        VALUES
          ('ah-1', 'ch-1', 'svc-1', 'status_change', '2026-02-20T10:00:00Z', 'sent'),
          ('ah-2', 'ch-1', 'svc-1', 'poll_error', '2026-02-21T10:00:00Z', 'failed')
      `);

      expect(store.count({ status: 'sent' })).toBe(1);
    });

    it('should return 0 for empty table', () => {
      expect(store.count()).toBe(0);
    });
  });

  describe('deleteOlderThan', () => {
    it('should delete old entries', () => {
      db.exec(`
        INSERT INTO alert_history (id, alert_channel_id, service_id, event_type, sent_at, status)
        VALUES
          ('ah-1', 'ch-1', 'svc-1', 'status_change', '2020-01-01T00:00:00Z', 'sent'),
          ('ah-2', 'ch-1', 'svc-1', 'status_change', '2026-02-21T10:00:00Z', 'sent')
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
