import Database from 'better-sqlite3';
import { AlertChannelStore } from './AlertChannelStore';

describe('AlertChannelStore', () => {
  let db: Database.Database;
  let store: AlertChannelStore;

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

      INSERT INTO teams (id, name) VALUES ('team-1', 'Alpha');
      INSERT INTO teams (id, name) VALUES ('team-2', 'Beta');
    `);
    store = new AlertChannelStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should create a slack channel', () => {
      const channel = store.create({
        team_id: 'team-1',
        channel_type: 'slack',
        config: JSON.stringify({ webhook_url: 'https://hooks.slack.com/test' }),
      });

      expect(channel.id).toBeDefined();
      expect(channel.team_id).toBe('team-1');
      expect(channel.channel_type).toBe('slack');
      expect(JSON.parse(channel.config)).toEqual({ webhook_url: 'https://hooks.slack.com/test' });
      expect(channel.is_active).toBe(1);
      expect(channel.created_at).toBeDefined();
      expect(channel.updated_at).toBeDefined();
    });

    it('should create a webhook channel', () => {
      const channel = store.create({
        team_id: 'team-1',
        channel_type: 'webhook',
        config: JSON.stringify({ url: 'https://example.com/webhook', headers: { Authorization: 'Bearer token' } }),
      });

      expect(channel.channel_type).toBe('webhook');
      const config = JSON.parse(channel.config);
      expect(config.url).toBe('https://example.com/webhook');
      expect(config.headers.Authorization).toBe('Bearer token');
    });
  });

  describe('findById', () => {
    it('should find a channel by id', () => {
      const created = store.create({
        team_id: 'team-1',
        channel_type: 'slack',
        config: '{}',
      });

      const found = store.findById(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it('should return undefined for nonexistent id', () => {
      expect(store.findById('nonexistent')).toBeUndefined();
    });
  });

  describe('findByTeamId', () => {
    it('should return channels for a team', () => {
      store.create({ team_id: 'team-1', channel_type: 'slack', config: '{}' });
      store.create({ team_id: 'team-1', channel_type: 'webhook', config: '{}' });
      store.create({ team_id: 'team-2', channel_type: 'slack', config: '{}' });

      const channels = store.findByTeamId('team-1');
      expect(channels).toHaveLength(2);
    });

    it('should return empty array for team with no channels', () => {
      const channels = store.findByTeamId('team-2');
      expect(channels).toHaveLength(0);
    });
  });

  describe('findActiveByTeamId', () => {
    it('should return only active channels', () => {
      const channel1 = store.create({ team_id: 'team-1', channel_type: 'slack', config: '{}' });
      store.create({ team_id: 'team-1', channel_type: 'webhook', config: '{}' });

      // Deactivate channel1
      store.update(channel1.id, { is_active: false });

      const active = store.findActiveByTeamId('team-1');
      expect(active).toHaveLength(1);
      expect(active[0].channel_type).toBe('webhook');
    });
  });

  describe('update', () => {
    it('should update channel type', () => {
      const created = store.create({ team_id: 'team-1', channel_type: 'slack', config: '{}' });
      const updated = store.update(created.id, { channel_type: 'webhook' });

      expect(updated).toBeDefined();
      expect(updated!.channel_type).toBe('webhook');
    });

    it('should update config', () => {
      const created = store.create({ team_id: 'team-1', channel_type: 'slack', config: '{}' });
      const newConfig = JSON.stringify({ webhook_url: 'https://new-url.com' });
      const updated = store.update(created.id, { config: newConfig });

      expect(updated).toBeDefined();
      expect(updated!.config).toBe(newConfig);
    });

    it('should update is_active', () => {
      const created = store.create({ team_id: 'team-1', channel_type: 'slack', config: '{}' });
      const updated = store.update(created.id, { is_active: false });

      expect(updated).toBeDefined();
      expect(updated!.is_active).toBe(0);
    });

    it('should update updated_at timestamp', () => {
      const created = store.create({ team_id: 'team-1', channel_type: 'slack', config: '{}' });
      const updated = store.update(created.id, { is_active: false });

      expect(updated!.updated_at).toBeDefined();
    });

    it('should return undefined for nonexistent id', () => {
      expect(store.update('nonexistent', { is_active: false })).toBeUndefined();
    });

    it('should return existing when no fields to update', () => {
      const created = store.create({ team_id: 'team-1', channel_type: 'slack', config: '{}' });
      const result = store.update(created.id, {});

      expect(result).toBeDefined();
      expect(result!.id).toBe(created.id);
    });
  });

  describe('delete', () => {
    it('should delete a channel', () => {
      const created = store.create({ team_id: 'team-1', channel_type: 'slack', config: '{}' });
      const deleted = store.delete(created.id);

      expect(deleted).toBe(true);
      expect(store.findById(created.id)).toBeUndefined();
    });

    it('should return false for nonexistent id', () => {
      expect(store.delete('nonexistent')).toBe(false);
    });
  });
});
