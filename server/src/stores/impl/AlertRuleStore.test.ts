import Database from 'better-sqlite3';
import { AlertRuleStore } from './AlertRuleStore';

describe('AlertRuleStore', () => {
  let db: Database.Database;
  let store: AlertRuleStore;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE teams (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        key TEXT,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE alert_rules (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        severity_filter TEXT NOT NULL CHECK (severity_filter IN ('critical', 'warning', 'all')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
      );

      INSERT INTO teams (id, name) VALUES ('team-1', 'Alpha');
      INSERT INTO teams (id, name) VALUES ('team-2', 'Beta');
    `);
    store = new AlertRuleStore(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should create a rule with critical severity', () => {
      const rule = store.create({
        team_id: 'team-1',
        severity_filter: 'critical',
      });

      expect(rule.id).toBeDefined();
      expect(rule.team_id).toBe('team-1');
      expect(rule.severity_filter).toBe('critical');
      expect(rule.is_active).toBe(1);
      expect(rule.created_at).toBeDefined();
      expect(rule.updated_at).toBeDefined();
    });

    it('should create a rule with warning severity', () => {
      const rule = store.create({
        team_id: 'team-1',
        severity_filter: 'warning',
      });

      expect(rule.severity_filter).toBe('warning');
    });

    it('should create a rule with all severity', () => {
      const rule = store.create({
        team_id: 'team-2',
        severity_filter: 'all',
      });

      expect(rule.severity_filter).toBe('all');
      expect(rule.team_id).toBe('team-2');
    });
  });

  describe('findById', () => {
    it('should find a rule by id', () => {
      const created = store.create({ team_id: 'team-1', severity_filter: 'critical' });
      const found = store.findById(created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it('should return undefined for nonexistent id', () => {
      expect(store.findById('nonexistent')).toBeUndefined();
    });
  });

  describe('findByTeamId', () => {
    it('should return rules for a team', () => {
      store.create({ team_id: 'team-1', severity_filter: 'critical' });
      store.create({ team_id: 'team-1', severity_filter: 'warning' });
      store.create({ team_id: 'team-2', severity_filter: 'all' });

      const rules = store.findByTeamId('team-1');
      expect(rules).toHaveLength(2);
    });

    it('should return empty array for team with no rules', () => {
      expect(store.findByTeamId('team-2')).toHaveLength(0);
    });
  });

  describe('findActiveByTeamId', () => {
    it('should return only active rules', () => {
      const rule1 = store.create({ team_id: 'team-1', severity_filter: 'critical' });
      store.create({ team_id: 'team-1', severity_filter: 'warning' });

      store.update(rule1.id, { is_active: false });

      const active = store.findActiveByTeamId('team-1');
      expect(active).toHaveLength(1);
      expect(active[0].severity_filter).toBe('warning');
    });
  });

  describe('update', () => {
    it('should update severity filter', () => {
      const created = store.create({ team_id: 'team-1', severity_filter: 'critical' });
      const updated = store.update(created.id, { severity_filter: 'all' });

      expect(updated).toBeDefined();
      expect(updated!.severity_filter).toBe('all');
    });

    it('should update is_active', () => {
      const created = store.create({ team_id: 'team-1', severity_filter: 'critical' });
      const updated = store.update(created.id, { is_active: false });

      expect(updated).toBeDefined();
      expect(updated!.is_active).toBe(0);
    });

    it('should return undefined for nonexistent id', () => {
      expect(store.update('nonexistent', { is_active: false })).toBeUndefined();
    });

    it('should return existing when no fields to update', () => {
      const created = store.create({ team_id: 'team-1', severity_filter: 'critical' });
      const result = store.update(created.id, {});

      expect(result).toBeDefined();
      expect(result!.id).toBe(created.id);
    });
  });

  describe('delete', () => {
    it('should delete a rule', () => {
      const created = store.create({ team_id: 'team-1', severity_filter: 'critical' });
      const deleted = store.delete(created.id);

      expect(deleted).toBe(true);
      expect(store.findById(created.id)).toBeUndefined();
    });

    it('should return false for nonexistent id', () => {
      expect(store.delete('nonexistent')).toBe(false);
    });
  });
});
