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
        contact TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE alert_rules (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        severity_filter TEXT NOT NULL CHECK (severity_filter IN ('critical', 'warning', 'all')),
        is_active INTEGER NOT NULL DEFAULT 1,
        use_custom_thresholds INTEGER NOT NULL DEFAULT 0,
        cooldown_minutes INTEGER,
        rate_limit_per_hour INTEGER,
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

    it('should create a rule with default custom threshold fields', () => {
      const rule = store.create({ team_id: 'team-1', severity_filter: 'all' });

      expect(rule.use_custom_thresholds).toBe(0);
      expect(rule.cooldown_minutes).toBeNull();
      expect(rule.rate_limit_per_hour).toBeNull();
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

    it('should update use_custom_thresholds', () => {
      const created = store.create({ team_id: 'team-1', severity_filter: 'critical' });
      const updated = store.update(created.id, { use_custom_thresholds: true });

      expect(updated!.use_custom_thresholds).toBe(1);
    });

    it('should update cooldown_minutes', () => {
      const created = store.create({ team_id: 'team-1', severity_filter: 'critical' });
      const updated = store.update(created.id, { cooldown_minutes: 10 });

      expect(updated!.cooldown_minutes).toBe(10);
    });

    it('should update rate_limit_per_hour', () => {
      const created = store.create({ team_id: 'team-1', severity_filter: 'critical' });
      const updated = store.update(created.id, { rate_limit_per_hour: 50 });

      expect(updated!.rate_limit_per_hour).toBe(50);
    });

    it('should set cooldown_minutes to null', () => {
      const created = store.create({ team_id: 'team-1', severity_filter: 'critical' });
      store.update(created.id, { cooldown_minutes: 10 });
      const updated = store.update(created.id, { cooldown_minutes: null });

      expect(updated!.cooldown_minutes).toBeNull();
    });

    it('should update all custom threshold fields at once', () => {
      const created = store.create({ team_id: 'team-1', severity_filter: 'critical' });
      const updated = store.update(created.id, {
        use_custom_thresholds: true,
        cooldown_minutes: 15,
        rate_limit_per_hour: 100,
      });

      expect(updated!.use_custom_thresholds).toBe(1);
      expect(updated!.cooldown_minutes).toBe(15);
      expect(updated!.rate_limit_per_hour).toBe(100);
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
